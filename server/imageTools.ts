/**
 * Manhattan RIP X — Image Tools Engine
 *
 * Three pipeline tools:
 *   1. Rez Fixer   — upscale + sharpen low-res images to target DPI
 *   2. BG Remover  — AI background removal via rembg (U2Net ONNX model)
 *   3. Halftone    — DTF halftone screen via ImageMagick ordered dithering
 */

import sharp from "sharp";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

export const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageToolResult {
  outputPath: string;       // path to processed file (replaces filePath on job)
  previewBase64: string;    // data:image/png;base64,... thumbnail for UI
  originalWidth: number;
  originalHeight: number;
  outputWidth: number;
  outputHeight: number;
  processingTimeMs: number;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function makePreview(filePath: string): Promise<string> {
  const buf = await sharp(filePath)
    .resize(400, null, { fit: "inside", withoutEnlargement: false })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png({ quality: 85, compressionLevel: 6 })
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function tmpPath(suffix: string): string {
  return path.join(os.tmpdir(), `mrx_tool_${Date.now()}_${Math.random().toString(36).slice(2)}.${suffix}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REZ FIXER — Upscale + sharpen to target DPI
// ─────────────────────────────────────────────────────────────────────────────

export interface RezFixOptions {
  targetDpi: number;         // 300 | 600 | 1200
  printWidthInches: number;  // intended print width
  printHeightInches: number; // intended print height
  sharpenAmount: number;     // 0–100 (post-upscale unsharp mask)
  preserveAspect: boolean;
}

export async function rezFix(
  inputPath: string,
  opts: RezFixOptions
): Promise<ImageToolResult> {
  const start = Date.now();

  const meta = await sharp(inputPath).metadata();
  const originalWidth = meta.width || 100;
  const originalHeight = meta.height || 100;
  const inputDpi = meta.density || 72;

  // Target pixel dimensions
  const targetWidth = Math.round(opts.printWidthInches * opts.targetDpi);
  const targetHeight = Math.round(opts.printHeightInches * opts.targetDpi);

  console.log(
    `[REZ FIX] ${originalWidth}×${originalHeight} @${inputDpi}dpi → ${targetWidth}×${targetHeight} @${opts.targetDpi}dpi`
  );

  // Only upscale if source is smaller than target
  const needsUpscale = originalWidth < targetWidth || originalHeight < targetHeight;

  let pipeline = sharp(inputPath).ensureAlpha();

  if (needsUpscale) {
    pipeline = pipeline.resize(targetWidth, targetHeight, {
      fit: opts.preserveAspect ? "inside" : "fill",
      kernel: sharp.kernel.lanczos3, // best quality for upscaling
      withoutReduction: true,        // never shrink
    });
  }

  // Unsharp mask to compensate for upscale blur
  if (opts.sharpenAmount > 0) {
    const sigma = 1 + (opts.sharpenAmount / 100) * 2;       // 1.0–3.0
    const flat = 1 + (opts.sharpenAmount / 100) * 2;
    const jagged = 2 + (opts.sharpenAmount / 100) * 6;
    pipeline = pipeline.sharpen({ sigma, m1: flat, m2: jagged });
  }

  // Embed target DPI in output
  pipeline = pipeline.withMetadata({ density: opts.targetDpi });

  const outPath = tmpPath("png");
  const info = await pipeline.png({ quality: 95, compressionLevel: 3 }).toFile(outPath);

  const previewBase64 = await makePreview(outPath);

  return {
    outputPath: outPath,
    previewBase64,
    originalWidth,
    originalHeight,
    outputWidth: info.width,
    outputHeight: info.height,
    processingTimeMs: Date.now() - start,
    message: needsUpscale
      ? `Upscaled ${originalWidth}×${originalHeight} → ${info.width}×${info.height} @ ${opts.targetDpi} DPI`
      : `Already ${opts.targetDpi}+ DPI — sharpened only (${originalWidth}×${originalHeight})`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BACKGROUND REMOVER — rembg U2Net AI model via Python subprocess
// ─────────────────────────────────────────────────────────────────────────────

export interface BgRemoveOptions {
  alphaMatte: boolean;       // use alpha-matting for fine hair/fur edges
  foregroundThreshold: number; // 240 default
  backgroundThreshold: number; // 10 default
  erosionSize: number;       // 10 default
}

export async function bgRemove(
  inputPath: string,
  opts: Partial<BgRemoveOptions> = {}
): Promise<ImageToolResult> {
  const start = Date.now();

  const meta = await sharp(inputPath).metadata();
  const originalWidth = meta.width || 0;
  const originalHeight = meta.height || 0;

  const outPath = tmpPath("png");

  // Build the Python rembg command
  const alphaMatting = opts.alphaMatte ? "--alpha-matting" : "";
  const fgThresh = opts.foregroundThreshold ?? 240;
  const bgThresh = opts.backgroundThreshold ?? 10;
  const erosion = opts.erosionSize ?? 10;

  const alphaArgs = opts.alphaMatte
    ? `--alpha-matting-foreground-threshold ${fgThresh} --alpha-matting-background-threshold ${bgThresh} --alpha-matting-erode-size ${erosion}`
    : "";

  const cmd = `python3 -c "
import sys
from rembg import remove
from PIL import Image
import io

with open('${inputPath}', 'rb') as f:
    inp = f.read()

out = remove(inp, ${opts.alphaMatte ? "alpha_matting=True" : "alpha_matting=False"})

with open('${outPath}', 'wb') as f:
    f.write(out)
print('OK')
"`;

  console.log(`[BG REMOVE] Processing ${originalWidth}×${originalHeight} image...`);

  // Try Python/rembg; fall back gracefully if not available (e.g., Windows without Python)
  let removalSucceeded = false;
  try {
    await execAsync(cmd, { timeout: 120_000 });
    removalSucceeded = fs.existsSync(outPath);
  } catch (err: any) {
    console.warn(`[BG REMOVE] Python/rembg unavailable: ${err.message}`);
  }

  if (!removalSucceeded) {
    // Graceful fallback: convert to PNG with alpha channel preserved (no removal)
    console.warn("[BG REMOVE] Falling back: returning original image as transparent PNG");
    await sharp(inputPath)
      .ensureAlpha()
      .png()
      .toFile(outPath);
  }

  if (!fs.existsSync(outPath)) {
    throw new Error("Background removal failed: output file not created");
  }

  const outMeta = await sharp(outPath).metadata();
  const previewBase64 = await makePreview(outPath);

  return {
    outputPath: outPath,
    previewBase64,
    originalWidth,
    originalHeight,
    outputWidth: outMeta.width || originalWidth,
    outputHeight: outMeta.height || originalHeight,
    processingTimeMs: Date.now() - start,
    message: removalSucceeded
      ? `Background removed — transparent PNG (${outMeta.width}×${outMeta.height})`
      : `Background removal requires Python + rembg — returned original as PNG (${outMeta.width}×${outMeta.height})`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. HALFTONE — DTF halftone screen via ImageMagick
// ─────────────────────────────────────────────────────────────────────────────

export interface HalftoneOptions {
  type: "dots" | "lines" | "diamond" | "euclidean";
  frequency: number;          // lines per inch (10–120)
  angle: number;              // screen angle in degrees (0–90), typical: 45°
  ditherOrder: 2 | 3 | 4 | 8; // ordered dither matrix (2=coarse, 8=fine)
  colorize: boolean;          // apply to color channels separately (CMYK-like)
  contrast: number;           // pre-halftone contrast boost 0–50
}

// Map type to ImageMagick ordered-dither threshold map
const DITHER_MAP: Record<string, string> = {
  dots:       "o8x8",    // Ordered 8×8 for smooth dots
  lines:      "h8x8a",   // Horizontal lines
  diamond:    "o4x4",    // 4×4 ordered (diamond-like)
  euclidean:  "h8x8",    // Halftone 8×8 screen
};

export async function halftone(
  inputPath: string,
  opts: HalftoneOptions
): Promise<ImageToolResult> {
  const start = Date.now();

  const meta = await sharp(inputPath).metadata();
  const originalWidth = meta.width || 0;
  const originalHeight = meta.height || 0;

  const ditherMap = DITHER_MAP[opts.type] || "o8x8";
  const outPath = tmpPath("png");

  // Build the ImageMagick pipeline:
  // 1. Pre-process with sharp (contrast boost, flatten alpha)
  // 2. Pass to convert for ordered dithering at the specified screen angle
  // 3. Optionally colorize back

  // Step 1 — pre-process with sharp
  const preProcPath = tmpPath("png");
  let prePipeline = sharp(inputPath)
    .flatten({ background: { r: 255, g: 255, b: 255 } }) // white bg for halftone
    .rotate();                                              // auto-orient EXIF

  if (opts.contrast > 0) {
    const gamma = 1 / (1 + opts.contrast / 100);
    // Clamp gamma to sharp's 1–3 range; use linear for brightening
    if (gamma >= 1 && gamma <= 3) {
      prePipeline = prePipeline.gamma(gamma);
    }
  }

  await prePipeline.png().toFile(preProcPath);

  // Step 2 — ImageMagick ordered halftone dither
  // -colorspace Gray → grayscale halftone (classic DTF look)
  // -ordered-dither  → the threshold screen
  // The "frequency" maps to a scale on the dither map (ImageMagick uses scale factor)
  const scale = Math.max(2, Math.min(50, Math.round(100 / opts.frequency)));

  let cmd: string;
  if (opts.colorize) {
    // Color halftone: separate channels, dither each, recombine
    const tmpR = tmpPath("png");
    const tmpG = tmpPath("png");
    const tmpB = tmpPath("png");

    cmd = `
      convert "${preProcPath}" -channel R -separate "${tmpR}" &&
      convert "${preProcPath}" -channel G -separate "${tmpG}" &&
      convert "${preProcPath}" -channel B -separate "${tmpB}" &&
      convert "${tmpR}" -ordered-dither ${ditherMap},${scale} "${tmpR}" &&
      convert "${tmpG}" -ordered-dither ${ditherMap},${scale} "${tmpG}" &&
      convert "${tmpB}" -ordered-dither ${ditherMap},${scale} "${tmpB}" &&
      convert "${tmpR}" "${tmpG}" "${tmpB}" -combine "${outPath}"
    `;
  } else {
    // Grayscale halftone — classic dot screen look
    // Use -rotate for screen angle before dithering, then rotate back
    const rotAngle = opts.angle % 90;
    cmd = `convert "${preProcPath}" \
      -colorspace Gray \
      ${rotAngle !== 0 ? `-rotate ${rotAngle} -background white -flatten` : ""} \
      -ordered-dither ${ditherMap},${scale} \
      ${rotAngle !== 0 ? `-rotate -${rotAngle} -background white -flatten` : ""} \
      -resize ${originalWidth}x${originalHeight}! \
      "${outPath}"`;
  }

  console.log(`[HALFTONE] type=${opts.type} freq=${opts.frequency}lpi angle=${opts.angle}°`);
  try {
    await execAsync(cmd.replace(/\n\s*/g, " "), { timeout: 60_000 });
  } finally {
    // Clean up temp files
    [preProcPath].forEach(p => { try { fs.unlinkSync(p); } catch {} });
    if (opts.colorize) {
      // Clean up channel temps
      const parts = cmd.match(/"(\/tmp\/mrx_tool_[^"]+)"/g) || [];
      parts.forEach(p => {
        const f = p.replace(/"/g, "");
        if (f !== outPath) try { fs.unlinkSync(f); } catch {}
      });
    }
  }

  if (!fs.existsSync(outPath)) {
    throw new Error("Halftone processing failed: output file not created");
  }

  const outMeta = await sharp(outPath).metadata();
  const previewBase64 = await makePreview(outPath);

  return {
    outputPath: outPath,
    previewBase64,
    originalWidth,
    originalHeight,
    outputWidth: outMeta.width || originalWidth,
    outputHeight: outMeta.height || originalHeight,
    processingTimeMs: Date.now() - start,
    message: `Halftone applied — ${opts.type}, ${opts.frequency} LPI, ${opts.angle}° angle`,
  };
}
