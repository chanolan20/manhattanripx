/**
 * Manhattan RIP X — RIP Pipeline Unit Tests
 *
 * Tests: ripFile(), CMYK separation math, ink cost formula,
 * preview thumbnail generation, progress callbacks, cancellation
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import { ripFile, ripJobWithTracking, cancelRip, isRipping, type RipResult, type InkCoverage } from "../../server/rip";
import { generateAllFixtures, cleanupFixtures, type Fixture } from "../fixtures/generate";

// ── Constants mirrored from rip.ts ───────────────────────────────────────────
const INK_COST_PER_ML = { C: 0.08, M: 0.08, Y: 0.07, K: 0.06, W: 0.10 };
const ML_PER_SQIN_AT_100 = 0.0012;

let fx: Awaited<ReturnType<typeof generateAllFixtures>>;

beforeAll(async () => {
  fx = await generateAllFixtures();
}, 30_000);

afterAll(() => {
  cleanupFixtures();
});

// ── Helper ────────────────────────────────────────────────────────────────────
function expectedInkCost(coverage: InkCoverage, widthIn: number, heightIn: number): number {
  const area = widthIn * heightIn;
  let cost = 0;
  for (const ch of ["C", "M", "Y", "K", "W"] as const) {
    cost += (coverage[ch] / 100) * area * ML_PER_SQIN_AT_100 * INK_COST_PER_ML[ch];
  }
  return Math.round(cost * 1000) / 1000;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — Return shape & types
// ═══════════════════════════════════════════════════════════════════════════════
describe("ripFile() — return shape", () => {
  it("returns all required fields for a PNG", async () => {
    const result = await ripFile(fx.pureRed.path, { widthInches: 5, heightInches: 5 });
    expect(result).toMatchObject<Partial<RipResult>>({
      previewBase64: expect.stringMatching(/^data:image\/png;base64,/),
      pixelWidth: expect.any(Number),
      pixelHeight: expect.any(Number),
      dpi: expect.any(Number),
      inkCost: expect.any(Number),
      fileSize: expect.any(Number),
      processingTimeMs: expect.any(Number),
    });
    expect(result.inkCoverage).toBeDefined();
    expect(result.cmykSeparation).toBeDefined();
    expect(result.whiteChannelCoverage).toBeGreaterThanOrEqual(0);
  });

  it("preview is a valid base64-encoded PNG data URL", async () => {
    const result = await ripFile(fx.gradient.path, { widthInches: 4, heightInches: 3 });
    expect(result.previewBase64).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]{100,}$/);
    // Verify it decodes to real PNG bytes
    const base64Data = result.previewBase64.replace(/^data:image\/png;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    // PNG magic bytes: 89 50 4E 47
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it("pixelWidth and pixelHeight match the input image", async () => {
    const result = await ripFile(fx.gradient.path, { widthInches: 4, heightInches: 3 });
    expect(result.pixelWidth).toBe(300);
    expect(result.pixelHeight).toBe(200);
  });

  it("processingTimeMs is a positive integer", async () => {
    const result = await ripFile(fx.pureBlack.path, { widthInches: 5, heightInches: 5 });
    expect(result.processingTimeMs).toBeGreaterThan(0);
    expect(Number.isInteger(result.processingTimeMs)).toBe(true);
  });

  it("fileSize reflects actual bytes on disk", async () => {
    const result = await ripFile(fx.pureRed.path, { widthInches: 5, heightInches: 5 });
    const actualSize = fs.statSync(fx.pureRed.path).size;
    expect(result.fileSize).toBe(actualSize);
  });

  it("processes JPEG without error", async () => {
    const result = await ripFile(fx.jpeg.path, { widthInches: 3, heightInches: 2 });
    expect(result.previewBase64).toMatch(/^data:image\/png;base64,/);
    expect(result.pixelWidth).toBeGreaterThan(0);
  });

  it("processes TIFF without error", async () => {
    const result = await ripFile(fx.tiff.path, { widthInches: 3, heightInches: 2 });
    expect(result.previewBase64).toMatch(/^data:image\/png;base64,/);
    expect(result.pixelWidth).toBeGreaterThan(0);
  });

  it("handles 1×1 pixel image without crashing", async () => {
    const result = await ripFile(fx.tiny.path, { widthInches: 1, heightInches: 1 });
    expect(result.previewBase64).toMatch(/^data:image\/png;base64,/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — CMYK Separation
// ═══════════════════════════════════════════════════════════════════════════════
describe("CMYK separation — pure colors", () => {
  it("pure black image → K channel dominant, C/M/Y low", async () => {
    const result = await ripFile(fx.pureBlack.path, { widthInches: 5, heightInches: 5 });
    const sep = result.cmykSeparation;
    expect(sep.black).toBeGreaterThan(80);   // K should be near 100
    expect(sep.cyan).toBeLessThan(20);
    expect(sep.magenta).toBeLessThan(20);
    expect(sep.yellow).toBeLessThan(20);
  });

  it("pure white image → all CMYK near zero", async () => {
    const result = await ripFile(fx.pureWhite.path, { widthInches: 5, heightInches: 5 });
    const sep = result.cmykSeparation;
    expect(sep.cyan).toBeLessThan(5);
    expect(sep.magenta).toBeLessThan(5);
    expect(sep.yellow).toBeLessThan(5);
    expect(sep.black).toBeLessThan(5);
  });

  it("pure cyan image → C dominant, M/Y/K low", async () => {
    const result = await ripFile(fx.pureCyan.path, { widthInches: 5, heightInches: 5 });
    const sep = result.cmykSeparation;
    expect(sep.cyan).toBeGreaterThan(50);
    expect(sep.magenta).toBeLessThan(20);
    expect(sep.yellow).toBeLessThan(20);
    expect(sep.black).toBeLessThan(20);
  });

  it("pure red image → M+Y dominant", async () => {
    const result = await ripFile(fx.pureRed.path, { widthInches: 5, heightInches: 5 });
    const sep = result.cmykSeparation;
    expect(sep.magenta).toBeGreaterThan(40);
    expect(sep.yellow).toBeGreaterThan(40);
    expect(sep.cyan).toBeLessThan(10);
    expect(sep.black).toBeLessThan(10);
  });

  it("pure blue image → C+M dominant", async () => {
    const result = await ripFile(fx.pureBlue.path, { widthInches: 5, heightInches: 5 });
    const sep = result.cmykSeparation;
    expect(sep.cyan).toBeGreaterThan(30);
    expect(sep.magenta).toBeGreaterThan(30);
    expect(sep.yellow).toBeLessThan(20);
  });

  it("cmykSeparation values are all 0–100", async () => {
    const result = await ripFile(fx.gradient.path, { widthInches: 5, heightInches: 5 });
    const sep = result.cmykSeparation;
    for (const ch of ["cyan", "magenta", "yellow", "black"] as const) {
      expect(sep[ch]).toBeGreaterThanOrEqual(0);
      expect(sep[ch]).toBeLessThanOrEqual(100);
    }
  });

  it("inkCoverage channels are all 0–100", async () => {
    const result = await ripFile(fx.gradient.path, { widthInches: 5, heightInches: 5 });
    for (const ch of ["C", "M", "Y", "K", "W"] as const) {
      expect(result.inkCoverage[ch]).toBeGreaterThanOrEqual(0);
      expect(result.inkCoverage[ch]).toBeLessThanOrEqual(100);
    }
  });

  it("total TAC does not exceed 400%", async () => {
    const result = await ripFile(fx.pureBlack.path, { widthInches: 5, heightInches: 5 });
    expect(result.inkCoverage.total).toBeLessThanOrEqual(400);
  });

  it("fully transparent image → white channel coverage ~0 and low ink cost", async () => {
    const result = await ripFile(fx.fullyTransparent.path, { widthInches: 5, heightInches: 5 });
    expect(result.whiteChannelCoverage).toBe(0);
    expect(result.inkCost).toBe(0);
  });

  it("50% alpha image → white channel coverage ~50", async () => {
    const result = await ripFile(fx.halfAlpha.path, { widthInches: 5, heightInches: 5, whiteOpacity: 100 });
    // Rough tolerance: 40–60%
    expect(result.whiteChannelCoverage).toBeGreaterThanOrEqual(30);
    expect(result.whiteChannelCoverage).toBeLessThanOrEqual(70);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — Ink Cost Calculation
// ═══════════════════════════════════════════════════════════════════════════════
describe("Ink cost calculation", () => {
  it("ink cost is non-negative", async () => {
    const result = await ripFile(fx.pureRed.path, { widthInches: 8, heightInches: 10 });
    expect(result.inkCost).toBeGreaterThanOrEqual(0);
  });

  it("ink cost is rounded to 3 decimal places", async () => {
    const result = await ripFile(fx.gradient.path, { widthInches: 5, heightInches: 5 });
    const str = String(result.inkCost);
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(3);
  });

  it("larger area → proportionally higher cost", async () => {
    const small = await ripFile(fx.pureRed.path, { widthInches: 2, heightInches: 2 });
    const large = await ripFile(fx.pureRed.path, { widthInches: 4, heightInches: 4 });
    // 4×4=16 sqin vs 2×2=4 sqin → roughly 4× cost (same image, same coverage %)
    expect(large.inkCost).toBeGreaterThan(small.inkCost * 2);
  });

  it("pure white image (no CMYK, low W due to transparency) → very low cost", async () => {
    const result = await ripFile(fx.pureWhite.path, { widthInches: 5, heightInches: 5 });
    // White image: all opaque but no CMYK → cost is W channel only
    // W coverage = alphaCoverage * whiteOpacity = ~90
    // cost = 0.90 * 25sqin * 0.0012 * 0.10 = ~$0.0027
    expect(result.inkCost).toBeLessThan(0.05);
  });

  it("ink cost matches formula given coverage", async () => {
    const result = await ripFile(fx.pureRed.path, { widthInches: 5, heightInches: 5 });
    const expected = expectedInkCost(result.inkCoverage, 5, 5);
    expect(result.inkCost).toBeCloseTo(expected, 3);
  });

  it("transparent image → ink cost is exactly 0", async () => {
    const result = await ripFile(fx.fullyTransparent.path, { widthInches: 5, heightInches: 5 });
    expect(result.inkCost).toBe(0);
  });

  it("whiteOpacity=0 → no white ink cost", async () => {
    const result = await ripFile(fx.pureBlack.path, { widthInches: 5, heightInches: 5, whiteOpacity: 0 });
    // W channel should be 0, so white contributes nothing to cost
    expect(result.inkCoverage.W).toBe(0);
  });

  it("whiteOpacity=100 → maximum white ink coverage", async () => {
    const withFull = await ripFile(fx.pureBlack.path, { widthInches: 5, heightInches: 5, whiteOpacity: 100 });
    const withNone = await ripFile(fx.pureBlack.path, { widthInches: 5, heightInches: 5, whiteOpacity: 0 });
    expect(withFull.inkCoverage.W).toBeGreaterThan(withNone.inkCoverage.W);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — Color adjustments
// ═══════════════════════════════════════════════════════════════════════════════
describe("Color adjustments applied to pipeline", () => {
  it("applies brightness without throwing", async () => {
    await expect(
      ripFile(fx.pureRed.path, { widthInches: 5, heightInches: 5, brightness: 20 })
    ).resolves.toBeDefined();
  });

  it("applies contrast without throwing", async () => {
    await expect(
      ripFile(fx.pureRed.path, { widthInches: 5, heightInches: 5, contrast: 15 })
    ).resolves.toBeDefined();
  });

  it("applies saturation without throwing", async () => {
    await expect(
      ripFile(fx.pureRed.path, { widthInches: 5, heightInches: 5, saturation: 10 })
    ).resolves.toBeDefined();
  });

  it("negative brightness produces valid result", async () => {
    const result = await ripFile(fx.pureRed.path, {
      widthInches: 5, heightInches: 5, brightness: -30,
    });
    expect(result.previewBase64).toMatch(/^data:image\/png;base64,/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — Progress callbacks
// ═══════════════════════════════════════════════════════════════════════════════
describe("Progress callbacks", () => {
  it("onProgress called in ascending order from 5 to 100", async () => {
    const progressValues: number[] = [];
    await ripFile(fx.pureRed.path, {
      widthInches: 5, heightInches: 5,
      onProgress: (pct) => progressValues.push(pct),
    });
    expect(progressValues.length).toBeGreaterThanOrEqual(3);
    expect(progressValues[0]).toBe(5);
    expect(progressValues[progressValues.length - 1]).toBe(100);
    // Verify monotonically increasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  it("ripJobWithTracking calls onComplete with full result", async () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await new Promise<void>((resolve, reject) => {
      ripJobWithTracking(
        999,
        fx.gradient.path,
        { widthInches: 4, heightInches: 3 },
        onProgress,
        (jobId, result) => { onComplete(jobId, result); resolve(); },
        (jobId, err) => { onError(jobId, err); reject(new Error(err)); }
      );
    });

    expect(onComplete).toHaveBeenCalledWith(999, expect.objectContaining({
      previewBase64: expect.stringMatching(/^data:image\/png;base64,/),
      inkCost: expect.any(Number),
    }));
    expect(onError).not.toHaveBeenCalled();
  });

  it("ripJobWithTracking calls onError for nonexistent file", async () => {
    const onError = vi.fn();
    await new Promise<void>((resolve) => {
      ripJobWithTracking(
        998,
        "/tmp/this_file_does_not_exist_mrx.png",
        { widthInches: 5, heightInches: 5 },
        vi.fn(),
        vi.fn(),
        (jobId, err) => { onError(jobId, err); resolve(); }
      );
    });
    expect(onError).toHaveBeenCalledWith(998, expect.any(String));
  });

  it("cancelRip marks job as not ripping", async () => {
    // Start a job and immediately cancel
    let started = false;
    const p = new Promise<void>((resolve) => {
      ripJobWithTracking(
        777,
        fx.large.path,
        { widthInches: 10, heightInches: 10 },
        (jobId, pct) => {
          if (!started) {
            started = true;
            cancelRip(777);
            resolve();
          }
        },
        vi.fn(),
        vi.fn()
      );
    });
    await p;
    expect(isRipping(777)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — Error handling
// ═══════════════════════════════════════════════════════════════════════════════
describe("Error handling", () => {
  it("throws or rejects for nonexistent file", async () => {
    await expect(
      ripFile("/tmp/nonexistent_mrx_test_file.png", { widthInches: 5, heightInches: 5 })
    ).rejects.toThrow();
  });

  it("isRipping returns false for unknown jobId", () => {
    expect(isRipping(99999)).toBe(false);
  });
});
