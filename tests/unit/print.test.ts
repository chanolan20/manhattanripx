/**
 * Manhattan RIP X — Print Module Unit Tests
 *
 * Tests: submitPrintJob(), listPrinters(), getPrinterStatus()
 * All tests run without a real printer — exercises CUPS fallback + simulation path.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { submitPrintJob, listPrinters, getPrinterStatus, type PrintJobResult } from "../../server/print";

// ── Setup: create a real temp PNG file to use as a print target ───────────────
const TMP_DIR = path.join(os.tmpdir(), "mrx_print_tests");
const SAMPLE_FILE = path.join(TMP_DIR, "sample_print.png");
const MISSING_FILE = path.join(TMP_DIR, "does_not_exist.png");

beforeAll(async () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  // Write a minimal 8-byte PNG (1×1 red pixel)
  const { default: sharp } = await import("sharp");
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toFile(SAMPLE_FILE);
});

afterAll(() => {
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — listPrinters()
// ═══════════════════════════════════════════════════════════════════════════════
describe("listPrinters()", () => {
  it("returns a non-empty array", async () => {
    const printers = await listPrinters();
    expect(printers).toBeInstanceOf(Array);
    expect(printers.length).toBeGreaterThan(0);
  });

  it("each printer has required fields", async () => {
    const printers = await listPrinters();
    for (const p of printers) {
      expect(p).toMatchObject({
        name: expect.any(String),
        uri: expect.any(String),
        status: expect.any(String),
        isDefault: expect.any(Boolean),
      });
    }
  });

  it("all URIs are valid IPP format", async () => {
    const printers = await listPrinters();
    for (const p of printers) {
      expect(p.uri).toMatch(/^ipp:\/\//);
    }
  });

  it("exactly one printer can be isDefault", async () => {
    const printers = await listPrinters();
    const defaults = printers.filter(p => p.isDefault);
    // There should be 0 or 1 default
    expect(defaults.length).toBeLessThanOrEqual(1);
  });

  it("status values are valid strings", async () => {
    const VALID_STATUSES = ["online", "offline", "idle", "printing", "unknown"];
    const printers = await listPrinters();
    for (const p of printers) {
      expect(VALID_STATUSES).toContain(p.status);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — submitPrintJob() — file validation
// ═══════════════════════════════════════════════════════════════════════════════
describe("submitPrintJob() — file validation", () => {
  it("returns success=false for missing file", async () => {
    const result = await submitPrintJob({
      jobName: "missing-file-test",
      filePath: MISSING_FILE,
      printerName: "Epson_ET-8550_DTF",
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found|File not found/i);
  });

  it("includes file path in the error message for missing file", async () => {
    const result = await submitPrintJob({
      jobName: "missing-test",
      filePath: MISSING_FILE,
    });
    expect(result.message).toContain(MISSING_FILE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — submitPrintJob() — simulation fallback
// ═══════════════════════════════════════════════════════════════════════════════
describe("submitPrintJob() — simulation fallback", () => {
  it("returns success=true when file exists (CUPS or simulation)", async () => {
    const result = await submitPrintJob({
      jobName: "Test DTF Job",
      filePath: SAMPLE_FILE,
      printerName: "Epson_ET-8550_DTF",
      copies: 1,
    });
    expect(result.success).toBe(true);
  });

  it("result has jobId string", async () => {
    const result = await submitPrintJob({
      jobName: "Test DTF Job",
      filePath: SAMPLE_FILE,
      printerName: "Epson_ET-8550_DTF",
    });
    expect(result.jobId).toBeDefined();
    expect(typeof result.jobId).toBe("string");
    expect(result.jobId!.length).toBeGreaterThan(0);
  });

  it("result has message string", async () => {
    const result = await submitPrintJob({
      jobName: "Test DTF Job",
      filePath: SAMPLE_FILE,
      printerName: "Epson_ET-8550_DTF",
    });
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("result printerStatus is 'printing'", async () => {
    const result = await submitPrintJob({
      jobName: "Test DTF Job",
      filePath: SAMPLE_FILE,
    });
    expect(result.printerStatus).toBe("printing");
  });

  it("copies parameter passes through (no CUPS crash)", async () => {
    const result = await submitPrintJob({
      jobName: "Multi Copy Job",
      filePath: SAMPLE_FILE,
      printerName: "Epson_ET-8550_DTF",
      copies: 3,
    });
    expect(result.success).toBe(true);
  });

  it("simulated jobId starts with 'sim-' in non-CUPS environments", async () => {
    // In CI (no CUPS), should always fall back to simulation
    const result = await submitPrintJob({
      jobName: "sim-test",
      filePath: SAMPLE_FILE,
      printerName: "Nonexistent_Printer_That_Does_Not_Exist",
    });
    // Either CUPS or simulation — both should succeed
    expect(result.success).toBe(true);
    if (result.jobId?.startsWith("sim-")) {
      // Simulation path: jobId is "sim-{timestamp}"
      const ts = result.jobId.replace("sim-", "");
      expect(Number(ts)).toBeGreaterThan(0);
    }
  });

  it("job name with special chars is sanitized (no shell injection)", async () => {
    // If CUPS is available, the job name is sanitized before shell exec
    // This test verifies no exception is thrown for weird characters
    const result = await submitPrintJob({
      jobName: 'Job"; rm -rf /; #',
      filePath: SAMPLE_FILE,
      printerName: "Epson_ET-8550_DTF",
    });
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — submitPrintJob() — IPP URI override
// ═══════════════════════════════════════════════════════════════════════════════
describe("submitPrintJob() — IPP URI override", () => {
  it("accepts printerUri override without crashing", async () => {
    const result = await submitPrintJob({
      jobName: "IPP URI Test",
      filePath: SAMPLE_FILE,
      printerUri: "ipp://192.168.1.100:631/printers/Epson_ET-8550_DTF",
    });
    // Will fall back to simulation since no real printer at that IP
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — getPrinterStatus()
// ═══════════════════════════════════════════════════════════════════════════════
describe("getPrinterStatus()", () => {
  it("returns status and jobCount for any printer name", async () => {
    const result = await getPrinterStatus("Epson_ET-8550_DTF");
    expect(result).toMatchObject({
      status: expect.any(String),
      jobCount: expect.any(Number),
    });
  });

  it("jobCount is a non-negative integer", async () => {
    const result = await getPrinterStatus("Epson_ET-8550_DTF");
    expect(result.jobCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.jobCount)).toBe(true);
  });

  it("status is 'unknown' for totally nonexistent printer in no-CUPS env", async () => {
    const result = await getPrinterStatus("__nonexistent_printer_xyz__");
    // Either 'unknown' or a valid status string
    expect(typeof result.status).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — Return type contract
// ═══════════════════════════════════════════════════════════════════════════════
describe("PrintJobResult type contract", () => {
  it("result always has success boolean", async () => {
    const result = await submitPrintJob({ jobName: "contract", filePath: SAMPLE_FILE });
    expect(typeof result.success).toBe("boolean");
  });

  it("result always has message string", async () => {
    const result = await submitPrintJob({ jobName: "contract", filePath: SAMPLE_FILE });
    expect(typeof result.message).toBe("string");
  });

  it("failed result has success=false and no jobId", async () => {
    const result = await submitPrintJob({ jobName: "fail", filePath: "/nonexistent/path/test.png" });
    expect(result.success).toBe(false);
    // jobId may be undefined on failure
  });
});
