/**
 * Manhattan RIP X — Hot Folder & Shopify Webhook Auto-Import
 *
 * Hot Folder: Watch configured directories for new image files.
 * Shopify:    Receive order webhooks, extract line-item images, auto-queue.
 * Both:       Auto-nest queued jobs using MaxRects bin-packing.
 */

import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { storage } from "./storage";
import { autoNestJobs } from "./nestingEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HotFolderConfig {
  id: string;
  label: string;
  watchPath: string;
  queueId: number;
  printModeId?: number;
  autoNest: boolean;
  nestWidth: number;    // inches
  nestHeight: number;   // inches
  autoRip: boolean;
  enabled: boolean;
}

export interface ShopifyWebhookConfig {
  secret: string;         // HMAC secret from Shopify webhook settings
  queueId: number;
  autoNest: boolean;
  nestWidth: number;
  nestHeight: number;
  imageUrlField: string;  // metafield key or line-item property name for image URL
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────────────────────────────────────

const watchers = new Map<string, FSWatcher>();
let hotFolderConfigs: HotFolderConfig[] = [];
let shopifyConfig: ShopifyWebhookConfig | null = null;

const SUPPORTED_EXTS = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".pdf", ".svg"]);

// ─────────────────────────────────────────────────────────────────────────────
// Hot Folder Watcher
// ─────────────────────────────────────────────────────────────────────────────

export function startHotFolder(config: HotFolderConfig) {
  if (watchers.has(config.id)) stopHotFolder(config.id);
  if (!config.enabled) return;
  if (!fs.existsSync(config.watchPath)) {
    try { fs.mkdirSync(config.watchPath, { recursive: true }); } catch {}
  }

  console.log(`[HOT FOLDER] Watching: ${config.watchPath} → queue #${config.queueId}`);

  const watcher = chokidar.watch(config.watchPath, {
    persistent: true,
    ignoreInitial: false,      // pick up files already in the folder on start
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    depth: 0,                  // don't recurse into subdirs
  });

  watcher.on("add", async (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) return;

    console.log(`[HOT FOLDER] Detected: ${filePath}`);
    try {
      await importFileToQueue(filePath, config);
    } catch (err: any) {
      console.error(`[HOT FOLDER] Failed to import ${filePath}: ${err.message}`);
    }
  });

  watchers.set(config.id, watcher);
}

export function stopHotFolder(id: string) {
  const w = watchers.get(id);
  if (w) { w.close(); watchers.delete(id); }
}

export function stopAllHotFolders() {
  Array.from(watchers.keys()).forEach(id => stopHotFolder(id));
}

// ─────────────────────────────────────────────────────────────────────────────
// File → Job import
// ─────────────────────────────────────────────────────────────────────────────

async function importFileToQueue(filePath: string, config: HotFolderConfig) {
  const name = path.basename(filePath);

  // Get or create queue
  let queue = await storage.getQueue(config.queueId);
  if (!queue) throw new Error(`Queue #${config.queueId} not found`);

  // Create job record
  const job = await storage.createJob({
    queueId: config.queueId,
    name: name.replace(/\.[^.]+$/, ""),
    fileName: path.basename(filePath),
    filePath,
    status: config.autoRip ? "processing" : "pending",
    copies: 1,
    scalePercent: 100,
    xOffset: 0,
    yOffset: 0,
  });

  console.log(`[HOT FOLDER] Created job #${job.id} "${job.name}" in queue #${config.queueId}`);

  // Trigger auto-nest if configured
  if (config.autoNest) {
    await triggerAutoNest(config.queueId, config.nestWidth, config.nestHeight);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shopify Webhook Handler
// ─────────────────────────────────────────────────────────────────────────────

export function verifyShopifyHmac(rawBody: Buffer, signature: string, secret: string): boolean {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function handleShopifyOrder(orderPayload: any, config: ShopifyWebhookConfig) {
  const orderId = orderPayload.id || orderPayload.order_number || "unknown";
  const lineItems: any[] = orderPayload.line_items || [];

  console.log(`[SHOPIFY] Order #${orderId} — ${lineItems.length} line item(s)`);

  let importedCount = 0;

  for (const item of lineItems) {
    // Extract image URL from line item properties or metafields
    const imageUrl = extractImageUrl(item, config.imageUrlField);
    if (!imageUrl) {
      console.warn(`[SHOPIFY] Line item "${item.name}" has no image URL — skipping`);
      continue;
    }

    try {
      // Download image to temp location
      const localPath = await downloadImageToTemp(imageUrl, orderId, item.variant_id || item.id);

      // Determine quantity (respect line item quantity, cap at 50 per job)
      const copies = Math.min(Math.max(1, item.quantity || 1), 50);

      const queue = await storage.getQueue(config.queueId);
      if (!queue) throw new Error(`Queue #${config.queueId} not found`);

      const job = await storage.createJob({
        queueId: config.queueId,
        name: `${orderId}_${item.name || "item"}_${copies}x`.replace(/\s+/g, "_"),
        fileName: path.basename(localPath),
        filePath: localPath,
        status: "pending",
        copies,
        scalePercent: 100,
        xOffset: 0,
        yOffset: 0,
      });

      console.log(`[SHOPIFY] Queued job #${job.id} "${job.name}" × ${copies}`);
      importedCount++;
    } catch (err: any) {
      console.error(`[SHOPIFY] Failed to import line item "${item.name}": ${err.message}`);
    }
  }

  // Auto-nest after all items imported
  if (importedCount > 0 && config.autoNest) {
    await triggerAutoNest(config.queueId, config.nestWidth, config.nestHeight);
  }

  return { importedCount, orderId };
}

function extractImageUrl(lineItem: any, fieldName: string): string | null {
  // 1. Check line item properties (custom fields at checkout)
  const props: any[] = lineItem.properties || [];
  const prop = props.find((p: any) => p.name === fieldName);
  if (prop?.value) return prop.value;

  // 2. Check note_attributes on order (sometimes set there)
  if (lineItem[fieldName]) return lineItem[fieldName];

  // 3. Fallback: check if there's a direct image on the variant
  if (lineItem.variant?.image_url) return lineItem.variant.image_url;
  if (lineItem.image) return lineItem.image;

  return null;
}

async function downloadImageToTemp(imageUrl: string, orderId: any, itemId: any): Promise<string> {
  const { default: https } = await import("https");
  const { default: http } = await import("http");
  const os = await import("os");

  const ext = path.extname(new URL(imageUrl).pathname) || ".png";
  const filename = `shopify_${orderId}_${itemId}${ext}`;
  const destPath = path.join(
    process.env.UPLOADS_DIR || path.join(os.tmpdir(), "mrx_uploads"),
    filename
  );

  // Ensure upload dir exists
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const client = imageUrl.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);

    client.get(imageUrl, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} downloading image`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(destPath); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-nest trigger
// ─────────────────────────────────────────────────────────────────────────────

async function triggerAutoNest(queueId: number, sheetWidth: number, sheetHeight: number) {
  try {
    const jobs = await storage.getJobs(queueId);
    const pendingJobs = jobs.filter(j => j.status === "pending");
    if (pendingJobs.length < 2) return; // nothing to nest yet

    const nestInputs = pendingJobs
      .filter(j => j.filePath != null)
      .map(j => ({ id: j.id, filePath: j.filePath!, copies: j.copies, scalePercent: j.scalePercent }));
    const result = await autoNestJobs(nestInputs, {
      sheetWidth,
      sheetHeight,
      spacing: 0.1,
      rotate90: true,
    });

    // Update job positions from nest result
    for (const placement of result.placements) {
      await storage.updateJob(placement.jobId, {
        xOffset: placement.x ?? 0,
        yOffset: placement.y,
        scalePercent: placement.scalePercent,
      });
    }

    console.log(
      `[AUTO-NEST] Nested ${result.placements.length} jobs on ${result.sheetsUsed} sheet(s), ` +
      `${(result.utilization * 100).toFixed(1)}% utilization`
    );
  } catch (err: any) {
    console.error(`[AUTO-NEST] Error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config management (persisted to DB via storage)
// ─────────────────────────────────────────────────────────────────────────────

export function setHotFolderConfigs(configs: HotFolderConfig[]) {
  // Stop old watchers
  stopAllHotFolders();
  hotFolderConfigs = configs;
  // Start new watchers
  for (const cfg of configs) {
    if (cfg.enabled) startHotFolder(cfg);
  }
}

export function setShopifyConfig(cfg: ShopifyWebhookConfig | null) {
  shopifyConfig = cfg;
}

export function getShopifyConfig(): ShopifyWebhookConfig | null {
  return shopifyConfig;
}

export function getHotFolderConfigs(): HotFolderConfig[] {
  return hotFolderConfigs;
}
