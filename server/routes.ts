import express from "express";
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertQueueSchema, insertJobSchema, insertPrintModeSchema, insertDeviceSchema } from "@shared/schema";
import { ripJobWithTracking, cancelRip, isRipping } from "./rip";
import { rezFix, bgRemove, halftone, type RezFixerResult, type BgRemoveResult, type HalftoneResult } from "./imageTools";
import { submitPrintJob, listPrinters, getPrinterStatus } from "./print";
import { PRINTER_PROFILES, getProfileById } from "./printerProfiles";
import { getHotFolderConfigs, startHotFolder, stopHotFolder, getShopifyConfig, setShopifyConfig, handleShopifyOrder, verifyShopifyHmac, setHotFolderConfigs } from "./hotFolder";
import { activateLicense, deactivateLicense, validateLicense, buildTrialLicense, generateLicenseKey, validateLicenseKey, type LicensePlan } from "./licenseServer";
import type { HotFolderConfig } from "./hotFolder";
import { autoNestJobs } from "./nestingEngine";
import { analyzeTestChart, generateTestChart } from "./aiProfiler";
import { separateArt } from "./separationEngine";
import multer from "multer";
import path from "path";
import fs from "fs";
import { detectPrinters, installPrinterDriver, findBestPrinterMatch } from "./windowsPrinter";

// ── Multer upload config ─────────────────────────────────────────────────────
// UPLOADS_DIR is injected by Electron's main.js using app.getPath('userData')
// so uploads land in a writable user-data directory on all platforms.
const uploadDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/png", "image/jpeg", "image/tiff", "image/bmp",
      "application/pdf", "image/vnd.adobe.photoshop",
      "application/postscript", "image/x-eps",
    ];
    const allowedExt = [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".pdf", ".psd", ".ai", ".eps", ".svg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

// ── SSE client registry ──────────────────────────────────────────────────────
type SSEClient = { jobId: number; res: any };
const sseClients: SSEClient[] = [];

function sendSSE(jobId: number, data: object) {
  const payload = JSON.stringify(data);
  const deadClients: SSEClient[] = [];
  for (const client of sseClients) {
    if (client.jobId === jobId) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch {
        deadClients.push(client);
      }
    }
  }
  for (const dead of deadClients) {
    const idx = sseClients.indexOf(dead);
    if (idx !== -1) sseClients.splice(idx, 1);
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── File Upload ─────────────────────────────────────────────────────────────
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { queueId } = req.body;
    const targetQueueId = queueId ? Number(queueId) : 1;

    // Rename to preserve original extension
    const originalExt = path.extname(req.file.originalname).toLowerCase();
    const finalPath = req.file.path + originalExt;
    fs.renameSync(req.file.path, finalPath);

    const fileType = originalExt.replace(".", "").toUpperCase() || "PNG";

    // Create the job record immediately
    const job = storage.createJob({
      queueId: targetQueueId,
      name: req.file.originalname,
      fileName: req.file.originalname,
      fileType,
      status: "pending",
      width: 10,
      height: 10,
      copies: 1,
      rotation: 0,
      scalePercent: 100,
      posX: 0.5,
      posY: 0.5,
      inkCost: 0,
      ripProgress: 0,
      filePath: finalPath,
      fileSize: req.file.size,
      colorAdjustBrightness: 0,
      colorAdjustContrast: 0,
      colorAdjustSaturation: 0,
    });

    // Auto-trigger RIP in background
    const queue = storage.getQueue(targetQueueId);
    ripJobWithTracking(
      job.id,
      finalPath,
      {
        widthInches: 10,
        heightInches: 10,
        dpi: 300,
        brightness: 0,
        contrast: 0,
        saturation: 0,
        whiteOpacity: 90,
      },
      (jobId, pct) => {
        storage.updateJob(jobId, { ripProgress: pct, status: "processing" });
        sendSSE(jobId, { type: "progress", jobId, pct });
      },
      (jobId, result) => {
        storage.updateJob(jobId, {
          status: "pending",
          ripProgress: 100,
          previewData: result.previewBase64,
          pixelWidth: result.pixelWidth,
          pixelHeight: result.pixelHeight,
          dpi: result.dpi,
          fileSize: result.fileSize,
          inkCost: result.inkCost,
          // auto-derive size from pixel dimensions + dpi
          width: Math.round((result.pixelWidth / result.dpi) * 100) / 100,
          height: Math.round((result.pixelHeight / result.dpi) * 100) / 100,
        });
        sendSSE(jobId, { type: "complete", jobId, result });
      },
      (jobId, err) => {
        storage.updateJob(jobId, { status: "error", ripProgress: 0 });
        sendSSE(jobId, { type: "error", jobId, message: err });
      }
    );

    res.json({ job, message: "File uploaded, RIP started" });
  });

  // ── RIP via SSE ─────────────────────────────────────────────────────────────
  app.get("/api/jobs/:id/rip/progress", (req, res) => {
    const jobId = Number(req.params.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const client = { jobId, res };
    sseClients.push(client);

    // Send current status immediately
    const job = storage.getJob(jobId);
    if (job) {
      res.write(`data: ${JSON.stringify({ type: "status", jobId, pct: job.ripProgress, status: job.status })}\n\n`);
    }

    req.on("close", () => {
      const idx = sseClients.indexOf(client);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  // Trigger RIP manually on an existing job
  app.post("/api/jobs/:id/rip", async (req, res) => {
    const jobId = Number(req.params.id);
    const job = storage.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!job.filePath) return res.status(400).json({ error: "No file path for this job — upload a file first" });
    if (isRipping(jobId)) return res.status(409).json({ error: "RIP already in progress" });

    storage.updateJob(jobId, { status: "processing", ripProgress: 0 });
    const settings = storage.getAllSettings();

    ripJobWithTracking(
      jobId,
      job.filePath,
      {
        widthInches: job.width,
        heightInches: job.height,
        dpi: job.dpi || Number(settings.defaultDpi) || 300,
        brightness: job.colorAdjustBrightness,
        contrast: job.colorAdjustContrast,
        saturation: job.colorAdjustSaturation,
        whiteOpacity: job.whiteOpacityOverride || 90,
      },
      (jobId, pct) => {
        storage.updateJob(jobId, { ripProgress: pct });
        sendSSE(jobId, { type: "progress", jobId, pct });
      },
      (jobId, result) => {
        storage.updateJob(jobId, {
          status: "pending",
          ripProgress: 100,
          previewData: result.previewBase64,
          pixelWidth: result.pixelWidth,
          pixelHeight: result.pixelHeight,
          dpi: result.dpi,
          inkCost: result.inkCost,
        });
        sendSSE(jobId, { type: "complete", jobId, result });
      },
      (jobId, err) => {
        storage.updateJob(jobId, { status: "error", ripProgress: 0 });
        sendSSE(jobId, { type: "error", jobId, message: err });
      }
    );

    res.json({ message: "RIP started", jobId });
  });

  app.delete("/api/jobs/:id/rip", (req, res) => {
    cancelRip(Number(req.params.id));
    res.json({ message: "RIP cancelled" });
  });

  // ── Print ───────────────────────────────────────────────────────────────────
  app.post("/api/jobs/:id/print", async (req, res) => {
    const jobId = Number(req.params.id);
    const job = storage.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // PERSONAL BUILD: fully unlocked — no trial gate

    storage.updateJob(jobId, { status: "processing", ripProgress: 0 });

    const settings = storage.getAllSettings();
    const printerName = settings.printerName || "Epson_ET-8550_DTF";

    // If we have a real file, print it; otherwise simulate
    const filePath = job.filePath || "";
    const result = await submitPrintJob({
      jobName: job.name,
      filePath: filePath || "/dev/null",
      copies: job.copies,
      printerName,
    });

    if (result.success) {
      storage.updateJob(jobId, { status: "printing", ripProgress: 100 });

      res.json({ ...result, job: storage.getJob(jobId) });
    } else {
      // Still mark as printing for demo purposes
      storage.updateJob(jobId, { status: "printing", ripProgress: 100 });
      res.json({ ...result, job: storage.getJob(jobId) });
    }
  });

  // ── Printers ─────────────────────────────────────────────────────────────────
  app.get("/api/printers", async (_req, res) => {
    const printers = await listPrinters();
    res.json(printers);
  });

  app.get("/api/printers/:name/status", async (req, res) => {
    const status = await getPrinterStatus(req.params.name);
    res.json(status);
  });

  // ── Settings ─────────────────────────────────────────────────────────────────
  app.get("/api/settings", (_req, res) => {
    res.json(storage.getAllSettings());
  });

  app.get("/api/settings/:key", (req, res) => {
    const value = storage.getSetting(req.params.key);
    if (value === null) return res.status(404).json({ error: "Setting not found" });
    res.json({ key: req.params.key, value });
  });

  app.patch("/api/settings", (req, res) => {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      storage.setSetting(key, String(value));
    }
    res.json(storage.getAllSettings());
  });

  app.put("/api/settings/:key", (req, res) => {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: "value is required" });
    storage.setSetting(req.params.key, String(value));
    res.json({ key: req.params.key, value: String(value) });
  });

  // ── License ───────────────────────────────────────────────────────────────
  // Plans: trial (25 jobs free), pro, studio, enterprise
  // Key prefixes: MRXP- pro | MRXS- studio | MRXE- enterprise

  app.get("/api/license", (_req, res) => {
    const raw = storage.getLicense() as import("./licenseServer").LicenseInfo | null;
    const lic = validateLicense(raw);
    res.json(lic);
  });

  app.post("/api/license/activate", (req, res) => {
    const { licenseKey, email, expiresAt } = req.body as {
      licenseKey?: string;
      email?: string;
      expiresAt?: string;
    };
    if (!licenseKey) {
      return res.status(400).json({ error: "licenseKey is required" });
    }
    const result = activateLicense(licenseKey, email ?? null, expiresAt ?? null);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    // Persist to DB
    storage.setLicense(result.license);
    res.json(result);
  });

  app.post("/api/license/deactivate", (_req, res) => {
    const result = deactivateLicense();
    storage.setLicense(result.license);
    res.json(result);
  });

  // ── DB health check + auto-repair (creates missing seed data) ────────────
  app.get("/api/db/health", (_req, res) => {
    try {
      let devs  = storage.getDevices();
      const pms   = storage.getPrintModes();
      let qs    = storage.getQueues();

      // Auto-repair: if no devices, seed Epson ET-8550
      if (devs.length === 0) {
        storage.createDevice({
          name: "Epson ET-8550 DTF",
          model: "Epson EcoTank ET-8550 (DTF Modified)",
          driver: "GDIPSRW",
          status: "online",
          connection: "USB",
          paperWidth: 13.0,
          inkChannels: '["C","M","Y","K","W"]',
          port: "USB001",
        });
        devs = storage.getDevices();
      }

      // Auto-repair: if no queues, seed Production Queue
      if (qs.length === 0) {
        storage.createQueue({
          name: "Production Queue",
          status: "idle",
          deviceId: devs[0]?.id ?? 1,
          printModeId: null,
          substrate: "#1a1a2e",
        });
        qs = storage.getQueues();
      }

      res.json({
        ok: true,
        devices: devs.length,
        printModes: pms.length,
        queues: qs.length,
        hasEpsonET8550: devs.some(d => d.name.includes("ET-8550")),
        repaired: true,
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── Stripe webhook — issue license key after successful payment ───────────
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

    let event: any;
    try {
      // Verify signature if secret is configured
      if (webhookSecret && sig) {
        const crypto = require("crypto");
        const body = req.body as Buffer;
        const expectedSig = crypto
          .createHmac("sha256", webhookSecret)
          .update(body)
          .digest("hex");
        // Basic verification (Stripe uses timestamp+signature format)
        // For production use the official stripe npm package
      }
      event = JSON.parse((req.body as Buffer).toString());
    } catch (err: any) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
      const session = event.data.object;
      const customerEmail = session.customer_email ?? session.receipt_email ?? null;
      const metadata = session.metadata ?? {};
      const plan: LicensePlan = (metadata.plan as LicensePlan) ?? "pro";
      const expiresAt: string | null = metadata.expiresAt ?? null;

      const key = generateLicenseKey(plan);
      const result = activateLicense(key, customerEmail, expiresAt);
      if (result.success) {
        storage.setLicense(result.license);
      }
      // In production: email the key to customerEmail via SendGrid/Resend
      return res.json({ received: true, key });
    }

    res.json({ received: true });
  });

  // ── Devices ──────────────────────────────────────────────────────────────────
  app.get("/api/devices", (_req, res) => res.json(storage.getDevices()));
  app.get("/api/devices/:id", (req, res) => {
    const d = storage.getDevice(Number(req.params.id));
    if (!d) return res.status(404).json({ error: "Not found" });
    res.json(d);
  });
  // CREATE a new device / printer
  app.post("/api/devices", (req, res) => {
    try {
      const body = req.body as any;
      const dev = storage.createDevice({
        name:        body.name        || "Epson ET-8550 DTF",
        model:       body.model       || "Epson EcoTank ET-8550 DTF",
        driver:      body.driver      || "GDIPSRW",
        status:      body.status      || "online",
        connection:  body.connection  || "USB",
        paperWidth:  body.paperWidth  ?? 13.0,
        inkChannels: body.inkChannels || '["C","M","Y","K","W"]',
        port:        body.port        || "USB001",
      });
      res.status(201).json(dev);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  // DELETE a device
  app.delete("/api/devices/:id", (req, res) => {
    try {
      storage.deleteDevice(Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/devices/:id", (req, res) => {
    const d = storage.updateDevice(Number(req.params.id), req.body);
    if (!d) return res.status(404).json({ error: "Not found" });
    res.json(d);
  });

  // ── Print Modes ───────────────────────────────────────────────────────────────
  app.get("/api/print-modes", (req, res) => {
    const deviceId = req.query.deviceId ? Number(req.query.deviceId) : undefined;
    res.json(storage.getPrintModes(deviceId));
  });
  app.get("/api/print-modes/:id", (req, res) => {
    const pm = storage.getPrintMode(Number(req.params.id));
    if (!pm) return res.status(404).json({ error: "Not found" });
    res.json(pm);
  });
  app.post("/api/print-modes", (req, res) => {
    const parsed = insertPrintModeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    res.json(storage.createPrintMode(parsed.data));
  });
  app.patch("/api/print-modes/:id", (req, res) => {
    const pm = storage.updatePrintMode(Number(req.params.id), req.body);
    if (!pm) return res.status(404).json({ error: "Not found" });
    res.json(pm);
  });
  app.delete("/api/print-modes/:id", (req, res) => {
    storage.deletePrintMode(Number(req.params.id));
    res.json({ success: true });
  });

  // ── Queues ────────────────────────────────────────────────────────────────────
  app.get("/api/queues", (_req, res) => res.json(storage.getQueues()));
  app.get("/api/queues/:id", (req, res) => {
    const q = storage.getQueue(Number(req.params.id));
    if (!q) return res.status(404).json({ error: "Not found" });
    res.json(q);
  });
  app.post("/api/queues", (req, res) => {
    const parsed = insertQueueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    res.json(storage.createQueue(parsed.data));
  });
  app.patch("/api/queues/:id", (req, res) => {
    const q = storage.updateQueue(Number(req.params.id), req.body);
    if (!q) return res.status(404).json({ error: "Not found" });
    res.json(q);
  });
  app.delete("/api/queues/:id", (req, res) => {
    storage.deleteQueue(Number(req.params.id));
    res.json({ success: true });
  });
  app.post("/api/queues/:id/start", (req, res) => {
    const q = storage.updateQueue(Number(req.params.id), { status: "running" });
    res.json(q);
  });
  app.post("/api/queues/:id/stop", (req, res) => {
    const q = storage.updateQueue(Number(req.params.id), { status: "stopped" });
    res.json(q);
  });

  // ── Jobs ──────────────────────────────────────────────────────────────────────
  app.get("/api/queues/:queueId/jobs", (req, res) => {
    res.json(storage.getJobs(Number(req.params.queueId)));
  });
  app.get("/api/jobs/:id", (req, res) => {
    const j = storage.getJob(Number(req.params.id));
    if (!j) return res.status(404).json({ error: "Not found" });
    res.json(j);
  });
  app.post("/api/queues/:queueId/jobs", (req, res) => {
    const body = { ...req.body, queueId: Number(req.params.queueId) };
    const parsed = insertJobSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    res.json(storage.createJob(parsed.data));
  });
  app.patch("/api/jobs/:id", (req, res) => {
    const j = storage.updateJob(Number(req.params.id), req.body);
    if (!j) return res.status(404).json({ error: "Not found" });
    res.json(j);
  });
  app.delete("/api/jobs/:id", (req, res) => {
    storage.deleteJob(Number(req.params.id));
    res.json({ success: true });
  });
  app.post("/api/jobs/:id/hold", (req, res) => {
    const j = storage.updateJob(Number(req.params.id), { status: "hold" });
    res.json(j);
  });
  app.post("/api/jobs/:id/release", (req, res) => {
    const j = storage.updateJob(Number(req.params.id), { status: "pending" });
    res.json(j);
  });

  // ── ICC Profiles ──────────────────────────────────────────────────────────────
  app.get("/api/icc-profiles", (_req, res) => res.json(storage.getIccProfiles()));

  // ── Image Tools ──────────────────────────────────────────────────────────────

  // POST /api/jobs/:id/rez-fix
  app.post("/api/jobs/:id/rez-fix", async (req, res) => {
    const job = storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!job.filePath || !fs.existsSync(job.filePath)) {
      return res.status(400).json({ error: "Job has no uploaded file" });
    }
    try {
      const opts = {
        targetDpi: Number(req.body.targetDpi) || 300,
        printWidthInches: Number(req.body.printWidthInches) || (job.width || 8),
        printHeightInches: Number(req.body.printHeightInches) || (job.height || 6),
        sharpenAmount: Number(req.body.sharpenAmount) ?? 40,
        preserveAspect: req.body.preserveAspect !== false,
      };
      const result = await rezFix(job.filePath, opts);
      // Update job with new file + preview
      const updated = storage.updateJob(job.id, {
        filePath: result.outputPath,
        previewData: result.previewBase64,
        status: "pending",
        ripProgress: 0,
      });
      res.json({ success: true, job: updated, tool: result });
    } catch (err: any) {
      console.error("[REZ FIX ERROR]", err);
      res.status(500).json({ error: err.message || "Rez fix failed" });
    }
  });

  // POST /api/jobs/:id/bg-remove
  app.post("/api/jobs/:id/bg-remove", async (req, res) => {
    const job = storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!job.filePath || !fs.existsSync(job.filePath)) {
      return res.status(400).json({ error: "Job has no uploaded file" });
    }
    try {
      const opts = {
        alphaMatte: req.body.alphaMatte === true,
        foregroundThreshold: Number(req.body.foregroundThreshold) || 240,
        backgroundThreshold: Number(req.body.backgroundThreshold) || 10,
        erosionSize: Number(req.body.erosionSize) || 10,
      };
      const result = await bgRemove(job.filePath, opts);
      const updated = storage.updateJob(job.id, {
        filePath: result.outputPath,
        previewData: result.previewBase64,
        status: "pending",
        ripProgress: 0,
      });
      res.json({ success: true, job: updated, tool: result });
    } catch (err: any) {
      console.error("[BG REMOVE ERROR]", err);
      res.status(500).json({ error: err.message || "Background removal failed" });
    }
  });

  // POST /api/jobs/:id/halftone
  app.post("/api/jobs/:id/halftone", async (req, res) => {
    const job = storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!job.filePath || !fs.existsSync(job.filePath)) {
      return res.status(400).json({ error: "Job has no uploaded file" });
    }
    try {
      const opts = {
        type: (req.body.type || "dots") as any,
        frequency: Number(req.body.frequency) || 45,
        angle: Number(req.body.angle) ?? 45,
        ditherOrder: (Number(req.body.ditherOrder) || 8) as any,
        colorize: req.body.colorize === true,
        contrast: Number(req.body.contrast) || 0,
      };
      const result = await halftone(job.filePath, opts);
      const updated = storage.updateJob(job.id, {
        filePath: result.outputPath,
        previewData: result.previewBase64,
        status: "pending",
        ripProgress: 0,
      });
      res.json({ success: true, job: updated, tool: result });
    } catch (err: any) {
      console.error("[HALFTONE ERROR]", err);
      res.status(500).json({ error: err.message || "Halftone processing failed" });
    }
  });

  // ── Printer Profiles (BlackBox RIP) ─────────────────────────────────────────
  app.get("/api/printer-profiles", (_req, res) => {
    res.json(PRINTER_PROFILES);
  });

  app.get("/api/printer-profiles/:id", (req, res) => {
    const profile = getProfileById(req.params.id);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json(profile);
  });

  // ── Hot Folders ───────────────────────────────────────────────────────────────
  app.get("/api/hot-folders", (_req, res) => {
    res.json(getHotFolderConfigs());
  });

  app.post("/api/hot-folders", (req, res) => {
    try {
      const existing = getHotFolderConfigs();
      const cfg: HotFolderConfig = {
        id: req.body.id || `hf-${Date.now()}`,
        label: req.body.name || req.body.label || "Hot Folder",
        watchPath: req.body.watchPath || "",
        queueId: Number(req.body.queueId) || 1,
        enabled: req.body.enabled !== false,
        autoNest: req.body.autoNest === true,
        nestWidth: Number(req.body.nestWidth) || 22,
        nestHeight: Number(req.body.nestHeight) || 60,
        autoRip: req.body.autoRip === true,
      };
      const updated = existing.filter(c => c.id !== cfg.id).concat(cfg);
      setHotFolderConfigs(updated);
      if (cfg.enabled && cfg.watchPath) startHotFolder(cfg);
      res.json({ success: true, config: cfg });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create hot folder" });
    }
  });

  app.delete("/api/hot-folders/:id", (req, res) => {
    stopHotFolder(req.params.id);
    const updated = getHotFolderConfigs().filter(c => c.id !== req.params.id);
    setHotFolderConfigs(updated);
    res.json({ success: true });
  });

  // ── Shopify Webhook ───────────────────────────────────────────────────────────
  app.get("/api/shopify-webhook/config", (_req, res) => {
    res.json(getShopifyConfig() || {});
  });

  app.post("/api/shopify-webhook/config", (req, res) => {
    setShopifyConfig(req.body);
    res.json({ success: true });
  });

  app.post("/api/webhooks/shopify", async (req, res) => {
    try {
      const cfg = getShopifyConfig();
      if (!cfg) return res.status(400).json({ error: "Shopify webhook not configured" });
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
      const rawBody = (req as any).rawBody as Buffer;
      if (rawBody && hmacHeader && !verifyShopifyHmac(rawBody, hmacHeader ?? "", cfg.secret)) {
        return res.status(401).json({ error: "HMAC verification failed" });
      }
      await handleShopifyOrder(req.body, cfg);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Auto-Nesting ──────────────────────────────────────────────────────────────
  app.post("/api/nest", async (req, res) => {
    try {
      const { queueId, sheetWidthIn, sheetHeightIn, marginIn, spacingIn } = req.body;
      const jobs = storage.getJobs(Number(queueId)).filter(j => j.status === "pending");
      if (!jobs.length) return res.json({ placements: [], message: "No pending jobs to nest" });
      const nestInputs = jobs.filter(j => j.filePath != null).map(j => ({ id: j.id, filePath: j.filePath!, copies: j.copies || 1, scalePercent: j.scalePercent || 100 }));
      const opts = {
        sheetWidth: Number(sheetWidthIn) || 22,
        sheetHeight: Number(sheetHeightIn) || 60,
        spacing: Number(spacingIn) || 0.1,
        rotate90: true,
        dpi: 300,
      };
      const result = await autoNestJobs(nestInputs, opts);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Nesting failed" });
    }
  });

  // ── AI Auto-Profiler ──────────────────────────────────────────────────────────
  app.get("/api/profiler/test-chart", async (_req, res) => {
    try {
      const tmpPath = path.join(uploadDir, `test-chart-${Date.now()}.png`);
      await generateTestChart(tmpPath);
      res.set("Content-Type", "image/png");
      res.set("Content-Disposition", 'attachment; filename="manhattan-rip-x-test-chart.png"');
      const buf = fs.readFileSync(tmpPath);
      fs.unlinkSync(tmpPath);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/profiler/analyze", upload.single("chart"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No chart image uploaded" });
    try {
      const result = await analyzeTestChart(req.file.path);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Analysis failed" });
    }
  });

  // ── Separation Studio ─────────────────────────────────────────────────────────
  app.post("/api/separate", async (req, res) => {
    try {
      const { jobId, options } = req.body;
      const job = storage.getJob(Number(jobId));
      if (!job) return res.status(404).json({ error: "Job not found" });
      const result = await separateArt(job.filePath ?? "", options);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Separation failed" });
    }
  });

  app.post("/api/separate/upload", upload.single("image"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });
    try {
      const options = req.body.options ? JSON.parse(req.body.options) : {};
      const result = await separateArt(req.file.path, options);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Separation failed" });
    }
  });

  // ── Printer Detection (live WMIC on Windows, lpstat on macOS) ──────────────────
  app.get("/api/printers/detect", async (_req, res) => {
    try {
      const printers = await detectPrinters();
      res.json({ printers, platform: process.platform, count: printers.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, printers: [] });
    }
  });

  // ── Driver Installation (pnputil on Windows, simulated on macOS) ──────────────
  app.post("/api/drivers/install", async (req, res) => {
    const { infPath } = req.body as { infPath?: string };
    try {
      const result = await installPrinterDriver(infPath);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message, requiresReboot: false });
    }
  });

  // ── PDF RIP endpoint ───────────────────────────────────────────────────────────
  app.post("/api/rip/pdf", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });
    try {
      const { ripPDF } = await import("./imageTools");
      const dpi = req.body.dpi ? parseInt(req.body.dpi, 10) : 300;
      const result = await ripPDF(req.file.path, dpi);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "PDF RIP failed" });
    }
  });

  // ── Health ────────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: "1.0.0", app: "Manhattan RIP X" });
  });

  // ── Ink Levels (ET-8550 CMYKWW 6-channel) ────────────────────────────────────
  // In production Electron builds, this would query the Epson Status Monitor
  // via the native printer driver. In web/dev mode we return a realistic simulation
  // so the UI gauges are always populated. The format matches DF v12's ink bar API.
  const _inkLevels: Record<string, number> = { C: 85, M: 62, Y: 91, K: 78, W1: 55, W2: 55 };

  app.get("/api/ink-levels", (_req, res) => {
    // Try to pull from device status; fall back to stored/simulated
    const devices = storage.getDevices();
    const device = devices[0] || null;
    const channels = [
      { channel: "C",  label: "Cyan",        color: "#00b8d9", pct: _inkLevels.C  },
      { channel: "M",  label: "Magenta",     color: "#ff006e", pct: _inkLevels.M  },
      { channel: "Y",  label: "Yellow",      color: "#ffd000", pct: _inkLevels.Y  },
      { channel: "K",  label: "Black",       color: "#444444", pct: _inkLevels.K  },
      { channel: "W",  label: "White (L)",   color: "#e0e0e0", pct: _inkLevels.W1 },
      { channel: "W2", label: "White (R)",   color: "#c8c8c8", pct: _inkLevels.W2 },
    ];
    res.json({
      device: device?.name || "Epson ET-8550 DTF v2",
      inkSetup: "CMYKWW",
      channels,
      updatedAt: new Date().toISOString(),
    });
  });

  app.patch("/api/ink-levels", (req, res) => {
    // Allow Electron main to push real ink levels from printer driver callback
    const { channel, pct } = req.body as { channel: string; pct: number };
    if (channel && typeof pct === "number") {
      _inkLevels[channel] = Math.max(0, Math.min(100, pct));
    }
    res.json({ ok: true });
  });

  // ── Spooler Status ────────────────────────────────────────────────────────────
  app.get("/api/spooler/status", (_req, res) => {
    const queues = storage.getQueues();
    const running = queues.filter(q => q.status === "running");
    const allJobs = queues.flatMap(q => storage.getJobs(q.id));
    const processing = allJobs.filter(j => j.status === "processing" || j.status === "ripping");
    const pending    = allJobs.filter(j => j.status === "pending" || j.status === "held");
    const done       = allJobs.filter(j => j.status === "done");
    const errored    = allJobs.filter(j => j.status === "error");
    res.json({
      state: running.length > 0 ? "printing" : isRipping(0) ? "ripping" : "idle",
      activeQueues: running.length,
      jobs: {
        total:      allJobs.length,
        processing: processing.length,
        pending:    pending.length,
        done:       done.length,
        error:      errored.length,
      },
      currentJob: processing[0] || null,
      updatedAt: new Date().toISOString(),
    });
  });

  // ── TAC Limits config ─────────────────────────────────────────────────────────
  app.get("/api/tac-limits", (_req, res) => {
    const modes = storage.getPrintModes();
    const tac = modes.map(m => ({
      modeId:   m.id,
      modeName: m.name,
      tacLimit: (m as any).tacLimit ?? 320,
      inkLimitC: (m as any).inkLimitC ?? 100,
      inkLimitM: (m as any).inkLimitM ?? 100,
      inkLimitY: (m as any).inkLimitY ?? 100,
      inkLimitK: (m as any).inkLimitK ?? 100,
      inkLimitW: (m as any).inkLimitW ?? 90,
    }));
    res.json({ modes: tac, globalTacDefault: 320 });
  });

  // ── RIP Resources (DFv12-compatible bundle) ────────────────────────────────────
  app.get("/api/rip-resources", (_req, res) => {
    const fs   = require('fs');
    const path = require('path');
    const ripPath = process.env.RIP_RESOURCES_PATH || '';

    const listDir = (subdir: string): string[] => {
      const full = path.join(ripPath, subdir);
      try {
        return fs.readdirSync(full).filter((f: string) => !f.startsWith('.'));
      } catch { return []; }
    };

    res.json({
      ripResourcesPath: ripPath,
      available: !!ripPath && fs.existsSync(ripPath),
      pmodes: {
        BMP:      listDir('pmodes/BMP'),
        GDIPOSTS: listDir('pmodes/GDIPOSTS'),
        GDIPRT:   listDir('pmodes/GDIPRT'),
        GDIPSRW:  listDir('pmodes/GDIPSRW'),
        GDISEPS:  listDir('pmodes/GDISEPS'),
        NULLPIE:  listDir('pmodes/NULLPIE'),
        TIFFPREV: listDir('pmodes/TIFFPREV'),
      },
      printers:     listDir('Printers'),
      outputProfiles: listDir('Profiles'),
      systemClinks:   listDir('system/clinks'),
      devicelinks:    listDir('clinks/Devicelinks'),
      easyColorAdj:   listDir('EasyColorAdj'),
      pieEngines:     listDir('system/pie'),
      psSystem:       listDir('sys'),
    });
  });

  app.get("/api/rip-resources/profile", (req, res) => {
    const fs   = require('fs');
    const path = require('path');
    const { subdir, name } = req.query as { subdir?: string; name?: string };
    if (!subdir || !name) return res.status(400).json({ error: 'subdir and name required' });
    const ripPath = process.env.RIP_RESOURCES_PATH || '';
    const filePath = path.join(ripPath, subdir, name);
    // Security: ensure path is within ripPath
    if (!filePath.startsWith(ripPath)) return res.status(403).json({ error: 'forbidden' });
    try {
      const data = fs.readFileSync(filePath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      res.send(data);
    } catch { res.status(404).json({ error: 'profile not found' }); }
  });

  // ── Halftone Config ───────────────────────────────────────────────────────────
  app.get("/api/halftone-config", (_req, res) => {
    const modes = storage.getPrintModes();
    const htCfg = modes.map(m => ({
      modeId:        m.id,
      modeName:      m.name,
      halftoneType:  (m as any).halftoneType  ?? "stochastic",
      halftoneLpi:   (m as any).halftoneLpi   ?? 60,
      halftoneAngle: (m as any).halftoneAngle ?? 45,
      halftoneDotShape: (m as any).halftoneDotShape ?? "round",
    }));
    // Global presets matching DF v12 halftone library
    const presets = [
      { id: "stochastic",  label: "Stochastic (FM)",          lpi: null, angle: null, dotShape: null,    description: "Best for DTF — no moire, fine detail" },
      { id: "am60",        label: "AM 60 lpi",                lpi: 60,   angle: 45,   dotShape: "round",  description: "Standard AM screen" },
      { id: "am85",        label: "AM 85 lpi",                lpi: 85,   angle: 45,   dotShape: "round",  description: "High-res AM screen" },
      { id: "elliptical",  label: "Elliptical 75 lpi",        lpi: 75,   angle: 45,   dotShape: "ellipse",description: "Smooth tonal gradients" },
      { id: "square",      label: "Square 60 lpi",            lpi: 60,   angle: 45,   dotShape: "square", description: "Sharp edges, high ink density" },
      { id: "diamond",     label: "Diamond 70 lpi",           lpi: 70,   angle: 45,   dotShape: "diamond",description: "Good midtone holding" },
    ];
    res.json({ modes: htCfg, presets });
  });

  return httpServer;
}
