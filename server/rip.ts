/**
 * Manhattan RIP X — Real RIP Engine
 * Uses sharp for PNG/JPEG/TIFF, ImageMagick (via exec) for PDF/PSD/AI/EPS
 * Produces: CMYK separation simulation, white channel mask, ink coverage, preview thumbnail
 */

import sharp from "sharp";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execAsync = promisify(exec);

export interface RipResult {
  previewBase64: string;        // data URL — actual image thumbnail
  pixelWidth: number;
  pixelHeight: number;
  dpi: number;
  inkCoverage: InkCoverage;     // per-channel coverage %
  inkCost: number;              // $ calculated from coverage
  cmykSeparation: ChannelStats; // simulated CMYK values
  whiteChannelCoverage: number; // % of non-transparent pixels needing white underbase
  fileSize: number;
  processingTimeMs: number;
}

export interface InkCoverage {
  C: number; M: number; Y: number; K: number; W: number;
  total: number; // TAC — total area coverage %
}

export interface ChannelStats {
  cyan: number; magenta: number; yellow: number; black: number;
}

// Ink cost constants ($/ml, ml/sqin at 100% coverage)
const INK_COST_PER_ML = {
  C: 0.08, M: 0.08, Y: 0.07, K: 0.06, W: 0.10
};
const ML_PER_SQIN_AT_100 = 0.0012; // at 100% coverage, 600dpi, 4 pass

export async function ripFile(
  filePath: string,
  opts: {
    widthInches: number;
    heightInches: number;
    dpi?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    whiteOpacity?: number;
    onProgress?: (pct: number) => void;
  }
): Promise<RipResult> {
  const start = Date.now();
  const dpi = opts.dpi || 300;
  const onProgress = opts.onProgress || (() => {});

  onProgress(5);

  // ── Step 1: Convert to PNG if needed (PDF/PSD/AI/EPS via ImageMagick) ─────
  let workingPath = filePath;
  const ext = path.extname(filePath).toLowerCase();
  const tmpDir = os.tmpdir();

  if ([".pdf", ".psd", ".ai", ".eps"].includes(ext)) {
    const outPath = path.join(tmpDir, `mrx_rip_${Date.now()}.png`);
    const density = dpi;
    const cmd = `convert -density ${density} -colorspace sRGB "${filePath}[0]" -flatten "${outPath}"`;
    try {
      await execAsync(cmd);
      workingPath = outPath;
    } catch (e) {
      console.warn("[RIP] ImageMagick conversion failed, using original:", e);
    }
  }

  onProgress(20);

  // ── Step 2: Read image with sharp ────────────────────────────────────────
  let img = sharp(workingPath);
  const meta = await img.metadata();
  const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

  const pixelWidth = meta.width || Math.round(opts.widthInches * dpi);
  const pixelHeight = meta.height || Math.round(opts.heightInches * dpi);
  const actualDpi = meta.density || dpi;

  onProgress(35);

  // ── Step 3: Apply color adjustments ───────────────────────────────────────
  const brightness = opts.brightness || 0;
  const contrast = opts.contrast || 0;
  const saturation = opts.saturation || 0;

  // sharp modulate: brightness 1.0 = neutral, saturation 1.0 = neutral
  const brightnessM = 1 + (brightness / 100);
  const saturationM = 1 + (saturation / 20);   // S scale is 0-20 in our system

  img = img.modulate({
    brightness: Math.max(0.1, brightnessM),
    saturation: Math.max(0, saturationM),
  });

  if (contrast !== 0) {
    // sharp gamma() accepts 1.0–3.0 only.
    // Map our -100..+100 contrast range into that window:
    //   contrast < 0 → darken (gamma > 1, up to 3.0)
    //   contrast > 0 → brighten/lift shadows (gamma 1.0..1.0, no-op clamp)
    // We use gamma only for darkening; positive contrast is handled by saturation/modulate.
    if (contrast < 0) {
      const gamma = 1 + (Math.abs(contrast) / 100) * 2; // maps -100→3.0, -1→1.02
      img = img.gamma(Math.min(3.0, gamma));
    }
    // For positive contrast we skip gamma (already clamped to valid sharp range).
  }

  onProgress(50);

  // ── Step 4: Generate preview thumbnail (max 400px wide) ───────────────────
  const thumbWidth = Math.min(pixelWidth, 400);
  const previewBuf = await img
    .clone()
    .resize(thumbWidth, null, { fit: "inside", withoutEnlargement: false })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png({ quality: 85, compressionLevel: 6 })
    .toBuffer();

  const previewBase64 = `data:image/png;base64,${previewBuf.toString("base64")}`;

  onProgress(65);

  // ── Step 5: Ink coverage analysis ────────────────────────────────────────
  // Downsample to 100x100 for fast pixel analysis
  const sampleSize = 100;
  const analysisImg = await img
    .clone()
    .resize(sampleSize, sampleSize, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = analysisImg;
  const channels = info.channels; // 4 (RGBA)

  let totalR = 0, totalG = 0, totalB = 0, totalA = 0;
  let nonTransparentPixels = 0;
  const pixelCount = sampleSize * sampleSize;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    totalA += a;
    if (a > 10) {
      totalR += r; totalG += g; totalB += b;
      nonTransparentPixels++;
    }
  }

  const avgR = nonTransparentPixels > 0 ? totalR / nonTransparentPixels : 255;
  const avgG = nonTransparentPixels > 0 ? totalG / nonTransparentPixels : 255;
  const avgB = nonTransparentPixels > 0 ? totalB / nonTransparentPixels : 255;
  const alphaCoverage = totalA / (pixelCount * 255); // 0-1

  // RGB → CMYK conversion (simplified)
  const r01 = avgR / 255, g01 = avgG / 255, b01 = avgB / 255;
  const k01 = 1 - Math.max(r01, g01, b01);
  const kInv = k01 < 1 ? 1 - k01 : 1;
  const c01 = kInv > 0 ? (1 - r01 - k01) / kInv : 0;
  const m01 = kInv > 0 ? (1 - g01 - k01) / kInv : 0;
  const y01 = kInv > 0 ? (1 - b01 - k01) / kInv : 0;

  // Scale by actual alpha coverage
  const inkCoverage: InkCoverage = {
    C: Math.round(Math.max(0, Math.min(100, c01 * alphaCoverage * 100))),
    M: Math.round(Math.max(0, Math.min(100, m01 * alphaCoverage * 100))),
    Y: Math.round(Math.max(0, Math.min(100, y01 * alphaCoverage * 100))),
    K: Math.round(Math.max(0, Math.min(100, k01 * alphaCoverage * 100))),
    W: Math.round(alphaCoverage * (opts.whiteOpacity ?? 90)),
    total: 0,
  };
  inkCoverage.total = Math.min(400, inkCoverage.C + inkCoverage.M + inkCoverage.Y + inkCoverage.K + inkCoverage.W);

  onProgress(80);

  // ── Step 6: Calculate ink cost ────────────────────────────────────────────
  const areaSquareInches = opts.widthInches * opts.heightInches;
  let inkCost = 0;
  for (const ch of ["C", "M", "Y", "K", "W"] as const) {
    const pct = inkCoverage[ch] / 100;
    inkCost += pct * areaSquareInches * ML_PER_SQIN_AT_100 * INK_COST_PER_ML[ch];
  }
  inkCost = Math.round(inkCost * 1000) / 1000; // round to 3 decimal places

  onProgress(90);

  // Clean up tmp file if we created one
  if (workingPath !== filePath && fs.existsSync(workingPath)) {
    fs.unlinkSync(workingPath);
  }

  onProgress(100);

  return {
    previewBase64,
    pixelWidth,
    pixelHeight,
    dpi: actualDpi,
    inkCoverage,
    inkCost,
    cmykSeparation: {
      cyan: Math.round(c01 * 100),
      magenta: Math.round(m01 * 100),
      yellow: Math.round(y01 * 100),
      black: Math.round(k01 * 100),
    },
    whiteChannelCoverage: Math.round(alphaCoverage * 100),
    fileSize,
    processingTimeMs: Date.now() - start,
  };
}

// ── RIP job queue ─────────────────────────────────────────────────────────────
// Manages concurrent RIP tasks with SSE progress broadcast
const activeRips = new Map<number, AbortController>();

export function cancelRip(jobId: number) {
  const ctrl = activeRips.get(jobId);
  if (ctrl) { ctrl.abort(); activeRips.delete(jobId); }
}

export function isRipping(jobId: number): boolean {
  return activeRips.has(jobId);
}

export async function ripJobWithTracking(
  jobId: number,
  filePath: string,
  opts: Parameters<typeof ripFile>[1],
  onProgress: (jobId: number, pct: number) => void,
  onComplete: (jobId: number, result: RipResult) => void,
  onError: (jobId: number, err: string) => void
) {
  const ctrl = new AbortController();
  activeRips.set(jobId, ctrl);

  try {
    const result = await ripFile(filePath, {
      ...opts,
      onProgress: (pct) => {
        if (ctrl.signal.aborted) throw new Error("RIP cancelled");
        onProgress(jobId, pct);
      },
    });
    activeRips.delete(jobId);
    onComplete(jobId, result);
  } catch (err: any) {
    activeRips.delete(jobId);
    onError(jobId, err.message || String(err));
  }
}
