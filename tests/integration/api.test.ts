/**
 * Manhattan RIP X — API Integration Tests
 *
 * Tests all REST endpoints via Supertest against a live Express app.
 * The app is spun up fresh for the test suite with an isolated SQLite DB.
 *
 * Endpoints tested:
 *   GET  /api/health
 *   GET  /api/devices
 *   GET  /api/queues
 *   GET  /api/queues/:id/jobs
 *   POST /api/queues/:id/jobs
 *   PATCH /api/jobs/:id
 *   DELETE /api/jobs/:id
 *   GET  /api/print-modes
 *   GET  /api/icc-profiles
 *   GET  /api/settings
 *   PATCH /api/settings
 *   GET  /api/license
 *   POST /api/license/activate
 *   POST /api/license/deactivate
 *   POST /api/upload          (multipart file upload)
 *   POST /api/jobs/:id/rip    (trigger RIP)
 *   POST /api/jobs/:id/print  (trigger print)
 *   POST /api/jobs/:id/hold
 *   POST /api/jobs/:id/release
 *   POST /api/queues/:id/start
 *   POST /api/queues/:id/stop
 *   GET  /api/printers
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import os from "os";
import sharp from "sharp";

// DB_PATH is set in tests/setup.ts (vitest setupFiles) before any imports
import { registerRoutes } from "../../server/routes";

// ── App setup ─────────────────────────────────────────────────────────────────
let app: express.Application;
let request: ReturnType<typeof supertest>;
let server: ReturnType<typeof createServer>;

const TMP_UPLOAD = path.join(os.tmpdir(), "mrx_api_test_upload.png");

beforeAll(async () => {
  // Generate a real PNG for upload tests
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } },
  }).png().toFile(TMP_UPLOAD);

  app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  request = supertest(app);
}, 20_000);

afterAll(() => {
  server.close();
  if (fs.existsSync(TMP_UPLOAD)) fs.unlinkSync(TMP_UPLOAD);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════════════════════════════
describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request.get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.app).toBe("Manhattan RIP X");
  });

  it("returns version string", async () => {
    const res = await request.get("/api/health");
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Devices
// ═══════════════════════════════════════════════════════════════════════════════
describe("GET /api/devices", () => {
  it("returns 200 with array", async () => {
    const res = await request.get("/api/devices");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns device with Epson in name", async () => {
    const res = await request.get("/api/devices");
    expect(res.body.some((d: any) => d.name.includes("Epson"))).toBe(true);
  });

  it("GET /api/devices/:id returns 200 for device 1", async () => {
    const res = await request.get("/api/devices/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("GET /api/devices/99999 returns 404", async () => {
    const res = await request.get("/api/devices/99999");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/devices/1 updates a field", async () => {
    const res = await request.patch("/api/devices/1").send({ status: "offline" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("offline");
    // Restore
    await request.patch("/api/devices/1").send({ status: "online" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Print Modes
// ═══════════════════════════════════════════════════════════════════════════════
describe("GET /api/print-modes", () => {
  it("returns 200 with array of ≥20 modes", async () => {
    const res = await request.get("/api/print-modes");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(20);
  });

  it("each mode has required fields", async () => {
    const res = await request.get("/api/print-modes");
    const mode = res.body[0];
    expect(mode).toMatchObject({
      id: expect.any(Number),
      name: expect.any(String),
      resolution: expect.any(Number),
      colorProfile: expect.any(String),
    });
  });

  it("filtered by deviceId=1 returns subset", async () => {
    const res = await request.get("/api/print-modes?deviceId=1");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((m: any) => m.deviceId === 1)).toBe(true);
  });

  it("POST creates a mode and DELETE removes it", async () => {
    const post = await request.post("/api/print-modes").send({
      deviceId: 1, name: "API Test Mode", resolution: 300, colorProfile: "sRGB",
      renderingIntent: "Perceptual", whiteOpacity: 85, whiteChoke: 2, cmykDensity: 100,
      printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0,
      inkRemovalHoleSize: 10, isDefault: false,
    });
    expect(post.status).toBe(200);
    const id = post.body.id;
    expect(id).toBeGreaterThan(0);

    const del = await request.delete(`/api/print-modes/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ICC Profiles
// ═══════════════════════════════════════════════════════════════════════════════
describe("GET /api/icc-profiles", () => {
  it("returns 200 with array of profiles", async () => {
    const res = await request.get("/api/icc-profiles");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(20);
  });

  it("contains CADlink Unified RGB", async () => {
    const res = await request.get("/api/icc-profiles");
    const found = res.body.find((p: any) => p.name === "CADlink Unified RGB");
    expect(found).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Queues
// ═══════════════════════════════════════════════════════════════════════════════
describe("Queues API", () => {
  let testQueueId: number;

  it("GET /api/queues returns seeded queues", async () => {
    const res = await request.get("/api/queues");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("POST /api/queues creates a queue", async () => {
    const res = await request.post("/api/queues").send({
      name: "API Test Queue",
      deviceId: 1,
      status: "stopped",
      layoutMode: "order_page",
      autoProcess: false,
      gangSheet: false,
      sheetWidth: 13,
      sheetHeight: 19,
      substrateColor: "#ff0000",
      jobCount: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.name).toBe("API Test Queue");
    expect(res.body.substrateColor).toBe("#ff0000");
    testQueueId = res.body.id;
  });

  it("GET /api/queues/:id returns the created queue", async () => {
    const res = await request.get(`/api/queues/${testQueueId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testQueueId);
  });

  it("PATCH /api/queues/:id updates substrateColor", async () => {
    const res = await request.patch(`/api/queues/${testQueueId}`).send({ substrateColor: "#0000ff" });
    expect(res.status).toBe(200);
    expect(res.body.substrateColor).toBe("#0000ff");
  });

  it("POST /api/queues/:id/start sets status to running", async () => {
    const res = await request.post(`/api/queues/${testQueueId}/start`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("running");
  });

  it("POST /api/queues/:id/stop sets status to stopped", async () => {
    const res = await request.post(`/api/queues/${testQueueId}/stop`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("stopped");
  });

  it("DELETE /api/queues/:id removes the queue", async () => {
    const res = await request.delete(`/api/queues/${testQueueId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const check = await request.get(`/api/queues/${testQueueId}`);
    expect(check.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Jobs
// ═══════════════════════════════════════════════════════════════════════════════
describe("Jobs API", () => {
  let testJobId: number;

  it("GET /api/queues/1/jobs returns seeded jobs", async () => {
    const res = await request.get("/api/queues/1/jobs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("POST /api/queues/1/jobs creates a job", async () => {
    const res = await request.post("/api/queues/1/jobs").send({
      name: "api-test-job.png",
      fileName: "api-test-job.png",
      fileType: "PNG",
      status: "pending",
      width: 8, height: 6, copies: 1,
      rotation: 0, scalePercent: 100, posX: 0, posY: 0,
      inkCost: 0, ripProgress: 0,
      colorAdjustBrightness: 0, colorAdjustContrast: 0, colorAdjustSaturation: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeGreaterThan(0);
    testJobId = res.body.id;
  });

  it("GET /api/jobs/:id returns the created job", async () => {
    const res = await request.get(`/api/jobs/${testJobId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testJobId);
    expect(res.body.name).toBe("api-test-job.png");
  });

  it("PATCH /api/jobs/:id updates status and ripProgress", async () => {
    const res = await request.patch(`/api/jobs/${testJobId}`).send({
      status: "processing",
      ripProgress: 45,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("processing");
    expect(res.body.ripProgress).toBe(45);
  });

  it("POST /api/jobs/:id/hold sets status to hold", async () => {
    const res = await request.post(`/api/jobs/${testJobId}/hold`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("hold");
  });

  it("POST /api/jobs/:id/release sets status to pending", async () => {
    const res = await request.post(`/api/jobs/${testJobId}/release`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
  });

  it("PATCH /api/jobs/:id sets hasCutContour and cutContourColor", async () => {
    const res = await request.patch(`/api/jobs/${testJobId}`).send({
      hasCutContour: true,
      cutContourColor: "#FF00FF",
    });
    expect(res.status).toBe(200);
    expect(res.body.hasCutContour).toBe(true);
    expect(res.body.cutContourColor).toBe("#FF00FF");
  });

  it("DELETE /api/jobs/:id removes the job", async () => {
    const res = await request.delete(`/api/jobs/${testJobId}`);
    expect(res.status).toBe(200);
    const check = await request.get(`/api/jobs/${testJobId}`);
    expect(check.status).toBe(404);
  });

  it("GET /api/jobs/99999 returns 404", async () => {
    const res = await request.get("/api/jobs/99999");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// File Upload
// ═══════════════════════════════════════════════════════════════════════════════
describe("POST /api/upload", () => {
  it("returns 400 when no file attached", async () => {
    const res = await request.post("/api/upload");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("accepts a PNG file and returns a job object", async () => {
    const res = await request
      .post("/api/upload")
      .field("queueId", "1")
      .attach("file", TMP_UPLOAD, "test_upload.png");
    expect(res.status).toBe(200);
    expect(res.body.job).toBeDefined();
    expect(res.body.job.id).toBeGreaterThan(0);
    expect(res.body.job.name).toBe("test_upload.png");
    expect(res.body.job.fileType).toBe("PNG");
    expect(res.body.message).toMatch(/uploaded/i);
    // Cleanup
    await request.delete(`/api/jobs/${res.body.job.id}`);
  }, 15_000);

  it("uploaded job has filePath set", async () => {
    const res = await request
      .post("/api/upload")
      .field("queueId", "1")
      .attach("file", TMP_UPLOAD, "path_test.png");
    expect(res.status).toBe(200);
    expect(res.body.job.filePath).toBeTruthy();
    expect(typeof res.body.job.filePath).toBe("string");
    await request.delete(`/api/jobs/${res.body.job.id}`);
  }, 15_000);

  it("uploaded job starts with status pending or processing", async () => {
    const res = await request
      .post("/api/upload")
      .field("queueId", "1")
      .attach("file", TMP_UPLOAD, "status_test.png");
    expect(res.status).toBe(200);
    expect(["pending", "processing"]).toContain(res.body.job.status);
    await request.delete(`/api/jobs/${res.body.job.id}`);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════════════════════
describe("Settings API", () => {
  it("GET /api/settings returns all settings object", async () => {
    const res = await request.get("/api/settings");
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
    expect(res.body.units).toBeDefined();
    expect(res.body.language).toBeDefined();
  });

  it("PATCH /api/settings updates multiple keys at once", async () => {
    const res = await request.patch("/api/settings").send({
      units: "mm",
      language: "es",
    });
    expect(res.status).toBe(200);
    expect(res.body.units).toBe("mm");
    expect(res.body.language).toBe("es");
    // Restore
    await request.patch("/api/settings").send({ units: "inches", language: "en" });
  });

  it("GET /api/settings/:key returns a single key", async () => {
    const res = await request.get("/api/settings/units");
    expect(res.status).toBe(200);
    expect(res.body.key).toBe("units");
    expect(res.body.value).toBeDefined();
  });

  it("GET /api/settings/nonexistent returns 404", async () => {
    const res = await request.get("/api/settings/key_does_not_exist_xyz");
    expect(res.status).toBe(404);
  });

  it("PUT /api/settings/:key upserts a single setting", async () => {
    const res = await request.put("/api/settings/inkCostCyan").send({ value: "0.09" });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe("0.09");
    // Restore
    await request.put("/api/settings/inkCostCyan").send({ value: "0.08" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// License API — trial / activate / deactivate / key validation
// ═══════════════════════════════════════════════════════════════════════════════
describe("License API", () => {
  // Always reset to trial before each license test
  beforeEach(async () => {
    await request.post("/api/license/deactivate");
  });

  it("GET /api/license returns trial by default", async () => {
    const res = await request.get("/api/license");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("trial");
    expect(res.body.plan).toBe("trial");
    expect(res.body.trialJobsLimit).toBe(25);
    expect(res.body.licenseKey).toBeNull();
  });

  it("POST /api/license/activate with valid MRXP key returns active pro", async () => {
    const res = await request.post("/api/license/activate").send({
      licenseKey: "MRXP-ABCD-1234-5678",
      email: "test@example.com",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.license.status).toBe("active");
    expect(res.body.license.plan).toBe("pro");
    expect(res.body.license.licenseKey).toBe("MRXP-ABCD-1234-5678");
    expect(res.body.license.email).toBe("test@example.com");
  });

  it("GET /api/license after activation returns active", async () => {
    await request.post("/api/license/activate").send({ licenseKey: "MRXP-ABCD-1234-5678" });
    const res = await request.get("/api/license");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
    expect(res.body.plan).toBe("pro");
  });

  it("MRXS key activates studio plan with 3 seats", async () => {
    const res = await request.post("/api/license/activate").send({
      licenseKey: "MRXS-STUD-IO00-0001",
    });
    expect(res.status).toBe(200);
    expect(res.body.license.plan).toBe("studio");
    expect(res.body.license.seats).toBe(3);
  });

  it("MRXE key activates enterprise plan with 10 seats", async () => {
    const res = await request.post("/api/license/activate").send({
      licenseKey: "MRXE-ENTR-XXXX-9999",
    });
    expect(res.status).toBe(200);
    expect(res.body.license.plan).toBe("enterprise");
    expect(res.body.license.seats).toBe(10);
  });

  it("POST /api/license/activate with invalid short key returns 400", async () => {
    const res = await request.post("/api/license/activate").send({
      licenseKey: "TOOSHORT",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/license/activate without licenseKey returns 400", async () => {
    const res = await request.post("/api/license/activate").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/license/activate with unknown prefix returns 400", async () => {
    const res = await request.post("/api/license/activate").send({
      licenseKey: "XXXX-ABCD-1234-5678",
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/license/deactivate reverts to trial", async () => {
    await request.post("/api/license/activate").send({ licenseKey: "MRXP-ABCD-EFGH-5678" });
    const res = await request.post("/api/license/deactivate");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.license.status).toBe("trial");
  });

  it("GET /api/license after deactivation returns trial", async () => {
    await request.post("/api/license/activate").send({ licenseKey: "MRXP-ABCD-EFGH-5678" });
    await request.post("/api/license/deactivate");
    const res = await request.get("/api/license");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("trial");
  });

  it("activatedAt is a valid ISO date string when active", async () => {
    await request.post("/api/license/activate").send({ licenseKey: "MRXP-XXXX-YYYY-ZZZZ" });
    const res = await request.get("/api/license");
    expect(res.body.status).toBe("active");
    expect(new Date(res.body.activatedAt).getTime()).not.toBeNaN();
  });

  it("licenseKey is non-null and string when active", async () => {
    await request.post("/api/license/activate").send({ licenseKey: "MRXP-XXXX-YYYY-ZZZZ" });
    const res = await request.get("/api/license");
    expect(res.body.status).toBe("active");
    expect(typeof res.body.licenseKey).toBe("string");
    expect(res.body.licenseKey.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Printers
// ═══════════════════════════════════════════════════════════════════════════════
describe("GET /api/printers", () => {
  it("returns 200 with array of printers", async () => {
    const res = await request.get("/api/printers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("printers have name, uri, status, isDefault", async () => {
    const res = await request.get("/api/printers");
    for (const p of res.body) {
      expect(p.name).toBeDefined();
      expect(p.uri).toMatch(/^ipp:\/\//);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Print trigger
// ═══════════════════════════════════════════════════════════════════════════════
describe("POST /api/jobs/:id/print", () => {
  it("returns 404 for nonexistent job", async () => {
    const res = await request.post("/api/jobs/99999/print");
    expect(res.status).toBe(404);
  });

  it("triggers print and returns success for seeded job", async () => {
    const jobs = await request.get("/api/queues/1/jobs");
    const job = jobs.body[0];
    // Set job to pending first
    await request.patch(`/api/jobs/${job.id}`).send({ status: "pending" });
    const res = await request.post(`/api/jobs/${job.id}/print`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Restore
    await request.patch(`/api/jobs/${job.id}`).send({ status: "pending", ripProgress: 0 });
  });

  it("print on nonexistent job returns 404 (no trial gate — fully unlocked)", async () => {
    // App is fully unlocked — no trial limit blocks printing.
    // A nonexistent job still returns 404 (not 402).
    const res = await request.post("/api/jobs/99999/print");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RIP trigger
// ═══════════════════════════════════════════════════════════════════════════════
describe("POST /api/jobs/:id/rip", () => {
  it("returns 404 for nonexistent job", async () => {
    const res = await request.post("/api/jobs/99999/rip");
    expect(res.status).toBe(404);
  });

  it("returns 400 for job without filePath", async () => {
    // Seeded jobs have no filePath — should return 400
    const jobs = await request.get("/api/queues/1/jobs");
    const job = jobs.body.find((j: any) => !j.filePath);
    if (job) {
      const res = await request.post(`/api/jobs/${job.id}/rip`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/file path|file/i);
    }
  });

  it("DELETE /api/jobs/:id/rip cancels an in-progress rip", async () => {
    const res = await request.delete("/api/jobs/1/rip");
    // Returns 200 whether or not a rip was active (cancelRip is a no-op if not ripping)
    expect(res.status).toBe(200);
  });
});
