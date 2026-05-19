/**
 * Manhattan RIP X — Storage Layer Unit Tests
 *
 * Tests: DatabaseStorage CRUD for settings, license, jobs, queues.
 * Uses an in-memory SQLite database seeded fresh for each test run.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

// We test StorageStorage by constructing it with a temp DB
// Patch the module to use temp path before importing

const TEMP_DB = path.join(os.tmpdir(), `mrx_test_${Date.now()}.db`);

// DB_PATH is set in tests/setup.ts (vitest setupFiles) before any imports
import { DatabaseStorage } from "../../server/storage";

let storage: DatabaseStorage;

beforeAll(() => {
  // DatabaseStorage auto-seeds on construction
  storage = new DatabaseStorage();
});

afterAll(() => {
  // Clean up test DB (uses default data.db path, not tmp — safe to leave)
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — Devices
// ═══════════════════════════════════════════════════════════════════════════════
describe("Devices CRUD", () => {
  it("getDevices returns seeded device list", () => {
    const devices = storage.getDevices();
    expect(devices.length).toBeGreaterThan(0);
  });

  it("seeded device is Epson ET-8550 DTF", () => {
    const devices = storage.getDevices();
    const epson = devices.find(d => d.name.includes("Epson"));
    expect(epson).toBeDefined();
    expect(epson!.name).toContain("Epson");
  });

  it("getDevice by id returns correct device", () => {
    const devices = storage.getDevices();
    const first = devices[0];
    const found = storage.getDevice(first.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(first.id);
    expect(found!.name).toBe(first.name);
  });

  it("getDevice for nonexistent id returns undefined", () => {
    const found = storage.getDevice(99999);
    expect(found).toBeUndefined();
  });

  it("updateDevice patches fields correctly", () => {
    const devices = storage.getDevices();
    const id = devices[0].id;
    const updated = storage.updateDevice(id, { status: "offline" });
    expect(updated!.status).toBe("offline");
    // Restore
    storage.updateDevice(id, { status: "online" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — Print Modes
// ═══════════════════════════════════════════════════════════════════════════════
describe("Print Modes CRUD", () => {
  it("getPrintModes returns seeded print modes", () => {
    const modes = storage.getPrintModes();
    expect(modes.length).toBeGreaterThan(0);
  });

  it("has at least 20 seeded print modes", () => {
    const modes = storage.getPrintModes();
    expect(modes.length).toBeGreaterThanOrEqual(20);
  });

  it("getPrintModes filtered by deviceId returns subset", () => {
    const all = storage.getPrintModes();
    const deviceId = all[0].deviceId;
    const filtered = storage.getPrintModes(deviceId);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(m => m.deviceId === deviceId)).toBe(true);
  });

  it("createPrintMode adds a new mode", () => {
    const before = storage.getPrintModes().length;
    const devices = storage.getDevices();
    const pm = storage.createPrintMode({
      deviceId: devices[0].id,
      name: "Test Mode — vitest",
      resolution: 600,
      colorProfile: "sRGB",
      renderingIntent: "Perceptual",
      whiteOpacity: 85,
      whiteChoke: 2,
      cmykDensity: 100,
      printOrder: "W_CMYK",
      passCount: 4,
      mediaType: "DTF Film",
      inkRemoval: 0,
      inkRemovalHoleSize: 10,
      isDefault: false,
    });
    expect(pm.id).toBeGreaterThan(0);
    expect(pm.name).toBe("Test Mode — vitest");
    expect(storage.getPrintModes().length).toBe(before + 1);
    // Cleanup
    storage.deletePrintMode(pm.id);
  });

  it("deletePrintMode removes the mode", () => {
    const devices = storage.getDevices();
    const pm = storage.createPrintMode({
      deviceId: devices[0].id,
      name: "Temp for delete",
      resolution: 300,
      colorProfile: "sRGB",
      renderingIntent: "Perceptual",
      whiteOpacity: 90,
      whiteChoke: 3,
      cmykDensity: 100,
      printOrder: "W_CMYK",
      passCount: 4,
      mediaType: "DTF Film",
      inkRemoval: 0,
      inkRemovalHoleSize: 10,
      isDefault: false,
    });
    const countBefore = storage.getPrintModes().length;
    storage.deletePrintMode(pm.id);
    expect(storage.getPrintModes().length).toBe(countBefore - 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — Queues
// ═══════════════════════════════════════════════════════════════════════════════
describe("Queue CRUD", () => {
  it("getQueues returns at least 2 seeded queues", () => {
    const queues = storage.getQueues();
    expect(queues.length).toBeGreaterThanOrEqual(2);
  });

  it("createQueue adds a queue and getQueue retrieves it", () => {
    const devices = storage.getDevices();
    const q = storage.createQueue({
      name: "Vitest Queue",
      deviceId: devices[0].id,
      status: "stopped",
      layoutMode: "order_page",
      autoProcess: false,
      gangSheet: false,
      sheetWidth: 13,
      sheetHeight: 19,
      substrateColor: "#000000",
      jobCount: 0,
    });
    expect(q.id).toBeGreaterThan(0);
    expect(q.name).toBe("Vitest Queue");
    expect(q.substrateColor).toBe("#000000");
    const found = storage.getQueue(q.id);
    expect(found!.id).toBe(q.id);
    storage.deleteQueue(q.id);
  });

  it("updateQueue patches substrateColor", () => {
    const queues = storage.getQueues();
    const q = queues[0];
    const original = q.substrateColor;
    const updated = storage.updateQueue(q.id, { substrateColor: "#112233" });
    expect(updated!.substrateColor).toBe("#112233");
    storage.updateQueue(q.id, { substrateColor: original });
  });

  it("updateQueue status to running and stopped", () => {
    const queues = storage.getQueues();
    const q = queues[0];
    storage.updateQueue(q.id, { status: "running" });
    expect(storage.getQueue(q.id)!.status).toBe("running");
    storage.updateQueue(q.id, { status: "stopped" });
    expect(storage.getQueue(q.id)!.status).toBe("stopped");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — Jobs
// ═══════════════════════════════════════════════════════════════════════════════
describe("Job CRUD", () => {
  let testQueueId: number;

  beforeAll(() => {
    const queues = storage.getQueues();
    testQueueId = queues[0].id;
  });

  it("getJobs returns seeded jobs for queue 1", () => {
    const jobs = storage.getJobs(testQueueId);
    expect(jobs.length).toBeGreaterThan(0);
  });

  it("createJob adds a job and increments queue jobCount", () => {
    const before = storage.getQueue(testQueueId)!.jobCount;
    const job = storage.createJob({
      queueId: testQueueId,
      name: "vitest-job.png",
      fileName: "vitest-job.png",
      fileType: "PNG",
      status: "pending",
      width: 8,
      height: 6,
      copies: 2,
      rotation: 0,
      scalePercent: 100,
      posX: 0,
      posY: 0,
      inkCost: 0.25,
      ripProgress: 0,
      colorAdjustBrightness: 0,
      colorAdjustContrast: 0,
      colorAdjustSaturation: 0,
    });
    expect(job.id).toBeGreaterThan(0);
    expect(job.name).toBe("vitest-job.png");
    expect(job.copies).toBe(2);
    expect(storage.getQueue(testQueueId)!.jobCount).toBe(before + 1);
    storage.deleteJob(job.id);
  });

  it("updateJob patches status and ripProgress", () => {
    const jobs = storage.getJobs(testQueueId);
    const j = jobs[0];
    const updated = storage.updateJob(j.id, { status: "processing", ripProgress: 50 });
    expect(updated!.status).toBe("processing");
    expect(updated!.ripProgress).toBe(50);
    // Restore
    storage.updateJob(j.id, { status: j.status, ripProgress: j.ripProgress });
  });

  it("updateJob can set previewData (base64 thumbnail)", () => {
    const jobs = storage.getJobs(testQueueId);
    const j = jobs[0];
    const fakeBase64 = "data:image/png;base64,iVBORw0KGgo=";
    const updated = storage.updateJob(j.id, { previewData: fakeBase64 });
    expect(updated!.previewData).toBe(fakeBase64);
    storage.updateJob(j.id, { previewData: j.previewData });
  });

  it("deleteJob decrements queue jobCount", () => {
    const devices = storage.getDevices();
    const q = storage.createQueue({
      name: "Delete Test Queue",
      deviceId: devices[0].id,
      status: "stopped",
      layoutMode: "order_page",
      autoProcess: false,
      gangSheet: false,
      sheetWidth: 13, sheetHeight: 19,
      substrateColor: "#fff", jobCount: 0,
    });
    const job = storage.createJob({
      queueId: q.id,
      name: "delete-me.png",
      fileName: "delete-me.png",
      fileType: "PNG",
      status: "pending",
      width: 5, height: 5,
      copies: 1, rotation: 0, scalePercent: 100, posX: 0, posY: 0,
      inkCost: 0, ripProgress: 0,
      colorAdjustBrightness: 0, colorAdjustContrast: 0, colorAdjustSaturation: 0,
    });
    expect(storage.getQueue(q.id)!.jobCount).toBe(1);
    storage.deleteJob(job.id);
    expect(storage.getQueue(q.id)!.jobCount).toBe(0);
    storage.deleteQueue(q.id);
  });

  it("getJob returns undefined for nonexistent id", () => {
    expect(storage.getJob(99999)).toBeUndefined();
  });

  it("hasCutContour and cutContourColor stored correctly", () => {
    const jobs = storage.getJobs(testQueueId);
    const j = jobs[0];
    const updated = storage.updateJob(j.id, { hasCutContour: true, cutContourColor: "#FF00FF" });
    expect(updated!.hasCutContour).toBe(true);
    expect(updated!.cutContourColor).toBe("#FF00FF");
    storage.updateJob(j.id, { hasCutContour: false, cutContourColor: undefined });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — Settings
// ═══════════════════════════════════════════════════════════════════════════════
describe("Settings persistence", () => {
  it("getSetting returns seeded values", () => {
    const val = storage.getSetting("units");
    expect(val).toBeDefined();
    expect(["inches", "mm", "cm"]).toContain(val);
  });

  it("setSetting creates a new setting", () => {
    storage.setSetting("test_key_vitest", "hello_world");
    expect(storage.getSetting("test_key_vitest")).toBe("hello_world");
    // Cleanup
    storage.setSetting("test_key_vitest", "");
  });

  it("setSetting updates an existing setting", () => {
    storage.setSetting("units", "mm");
    expect(storage.getSetting("units")).toBe("mm");
    storage.setSetting("units", "inches");
    expect(storage.getSetting("units")).toBe("inches");
  });

  it("getSetting returns null for unknown key", () => {
    const val = storage.getSetting("key_that_does_not_exist_xyz");
    expect(val).toBeNull();
  });

  it("getAllSettings returns an object with all seeded keys", () => {
    const all = storage.getAllSettings();
    expect(typeof all).toBe("object");
    expect(Object.keys(all).length).toBeGreaterThan(5);
    expect(all.units).toBeDefined();
    expect(all.language).toBeDefined();
    expect(all.inkCostCyan).toBeDefined();
    expect(all.inkCostWhite).toBeDefined();
  });

  it("ink cost settings are numeric strings", () => {
    const all = storage.getAllSettings();
    for (const ch of ["inkCostCyan", "inkCostMagenta", "inkCostYellow", "inkCostBlack", "inkCostWhite"]) {
      expect(parseFloat(all[ch])).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — License
// ═══════════════════════════════════════════════════════════════════════════════
describe("License management", () => {
  beforeAll(() => {
    // Reset license to clean trial state — other test suites (integration) may have
    // incremented trialJobsUsed via the print endpoint. Normalize before asserting.
    storage.setLicense({ status: "trial", plan: "trial", licenseKey: null, email: null, activatedAt: null, trialJobsUsed: 0 });
  });

  it("getLicense returns seeded trial license", () => {
    const lic = storage.getLicense();
    expect(lic).not.toBeNull();
    expect(lic!.status).toBe("trial");
    expect(lic!.plan).toBe("trial");
    expect(lic!.trialJobsLimit).toBe(25);
    expect(lic!.trialJobsUsed).toBe(0);
  });

  it("setLicense activates a pro license", () => {
    const lic = storage.setLicense({
      licenseKey: "MRXP-TEST-1234-5678",
      email: "test@example.com",
      status: "active",
      plan: "pro",
      activatedAt: new Date().toISOString(),
      trialJobsUsed: 0,
    });
    expect(lic.status).toBe("active");
    expect(lic.plan).toBe("pro");
    expect(lic.licenseKey).toBe("MRXP-TEST-1234-5678");
    // Restore
    storage.setLicense({ status: "trial", plan: "trial", licenseKey: null, email: null, activatedAt: null });
  });

  it("incrementTrialJobs increments counter", () => {
    const before = storage.getLicense()!.trialJobsUsed;
    const count = storage.incrementTrialJobs();
    expect(count).toBe(before + 1);
    expect(storage.getLicense()!.trialJobsUsed).toBe(before + 1);
    // Restore
    storage.setLicense({ trialJobsUsed: before });
  });

  it("getLicense returns null-safe (never undefined)", () => {
    const lic = storage.getLicense();
    // Should always be defined after seed
    expect(lic).not.toBeNull();
    expect(lic).not.toBeUndefined();
  });

  it("license status can be deactivated back to trial", () => {
    storage.setLicense({ status: "active", plan: "pro", licenseKey: "MRXP-XXXX" });
    storage.setLicense({ status: "trial", plan: "trial", licenseKey: null, email: null });
    expect(storage.getLicense()!.status).toBe("trial");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 7 — ICC Profiles
// ═══════════════════════════════════════════════════════════════════════════════
describe("ICC Profiles", () => {
  it("getIccProfiles returns seeded profiles", () => {
    const profiles = storage.getIccProfiles();
    expect(profiles.length).toBeGreaterThan(20);
  });

  it("profiles have name, colorSpace, isBuiltIn", () => {
    const profiles = storage.getIccProfiles();
    for (const p of profiles.slice(0, 5)) {
      expect(p.name).toBeDefined();
      expect(p.colorSpace).toMatch(/RGB|CMYK|LAB/);
      expect(typeof p.isBuiltIn).toBe("boolean");
    }
  });

  it("contains CADlink Unified RGB profile", () => {
    const profiles = storage.getIccProfiles();
    const cadlink = profiles.find(p => p.name === "CADlink Unified RGB");
    expect(cadlink).toBeDefined();
    expect(cadlink!.colorSpace).toBe("RGB");
  });

  it("contains Device-Link profiles for ink reduction", () => {
    const profiles = storage.getIccProfiles();
    const dl = profiles.filter(p => p.name.startsWith("DL —"));
    expect(dl.length).toBeGreaterThan(10);
  });
});
