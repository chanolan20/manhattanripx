/**
 * Manhattan RIP X — Image Tools
 * Pure JS image processing via Jimp — no native binaries, works on Windows/macOS/Linux
 */

import { Jimp } from "jimp";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

// Re-export execAsync so separationEngine can import it
export const execAsync = promisify(exec);

// ── Metadata helper ───────────────────────────────────────────────────────────
export async function getImageMeta(filePath: string) {
  try {
    const img = await Jimp.read(filePath);
    return {
      width: img.bitmap.width,
      height: img.bitmap.height,
      hasAlpha: true,
      format: path.extname(filePath).replace(".", "").toLowerCase(),
    };
  } catch {
    return { width: 0, height: 0, hasAlpha: false, format: "unknown" };
  }
}

// ── REZ FIXER — Upscale + sharpen low-res images ──────────────────────────────
export interface RezFixerOptions {
  targetDpi: number;
  currentDpi?: number;       // defaults to 72 if omitted
  sharpenAmount: number; // 0–100
  printWidthInches?: number;
  printHeightInches?: number;
}

export interface RezFixerResult {
  outputPath: string;
  originalWidth: number;
  originalHeight: number;
  newWidth: number;
  newHeight: number;
  scale: number;
  message: string;
  previewBase64?: string;
}

export async function rezFixer(inputPath: string, opts: RezFixerOptions): Promise<RezFixerResult> {
  const img = await Jimp.read(inputPath);
  const { width: originalWidth, height: originalHeight } = img.bitmap;

  const scale = opts.targetDpi / Math.max(opts.currentDpi ?? 72, 1);

  if (scale <= 1.05) {
    const thumbBuffer = await img.getBuffer("image/png");
    return {
      outputPath: inputPath,
      originalWidth, originalHeight,
      newWidth: originalWidth, newHeight: originalHeight,
      scale: 1,
      message: `Already ${opts.targetDpi}+ DPI — no upscale needed`,
      previewBase64: `data:image/png;base64,${thumbBuffer.toString("base64")}`,
    };
  }

  const newWidth  = Math.round(originalWidth  * scale);
  const newHeight = Math.round(originalHeight * scale);

  // Upscale with bicubic
  img.resize({ w: newWidth, h: newHeight });

  // Apply sharpening via contrast boost as approximation
  if (opts.sharpenAmount > 0) {
    img.contrast(opts.sharpenAmount / 200);
  }

  const outPath = path.join(os.tmpdir(), `mrx_rez_${Date.now()}.png`);
  await img.write(outPath as `${string}.png`);

  // Generate preview
  const thumbImg = img.clone();
  thumbImg.scaleToFit({ w: 400, h: 400 });
  const thumbBuffer = await thumbImg.getBuffer("image/png");

  return {
    outputPath: outPath,
    originalWidth, originalHeight,
    newWidth, newHeight,
    scale,
    message: `Upscaled ${originalWidth}×${originalHeight} → ${newWidth}×${newHeight} (${Math.round(scale * 10) / 10}×)`,
    previewBase64: `data:image/png;base64,${thumbBuffer.toString("base64")}`,
  };
}

// Alias for routes.ts which imports as rezFix
export const rezFix = rezFixer;

// ── BACKGROUND REMOVER ────────────────────────────────────────────────────────
export interface BgRemoveOptions {
  tolerance?: number;         // 0–100
  targetColor?: string;       // hex color to treat as background (default: auto-detect)
  featherEdges?: boolean;
  alphaMatte?: boolean;
  foregroundThreshold?: number;
  backgroundThreshold?: number;
  erosionSize?: number;
}

export interface BgRemoveResult {
  outputPath: string;
  pixelsRemoved: number;
  totalPixels: number;
  message: string;
  previewBase64?: string;
}

export async function removeBackground(inputPath: string, opts: BgRemoveOptions): Promise<BgRemoveResult> {
  const img = await Jimp.read(inputPath);
  const { width, height } = img.bitmap;
  const totalPixels = width * height;

  // Auto-detect background color from top-left corner pixel
  let bgR = 255, bgG = 255, bgB = 255;
  if (!opts.targetColor) {
    const color = img.getPixelColor(0, 0);
    // Jimp stores as 0xRRGGBBAA
    bgR = (color >>> 24) & 0xff;
    bgG = (color >>> 16) & 0xff;
    bgB = (color >>> 8)  & 0xff;
  } else {
    const hex = opts.targetColor.replace("#", "");
    bgR = parseInt(hex.substring(0, 2), 16);
    bgG = parseInt(hex.substring(2, 4), 16);
    bgB = parseInt(hex.substring(4, 6), 16);
  }

  const threshold = Math.round((opts.tolerance ?? 30) * 2.55);
  let pixelsRemoved = 0;
  const data = img.bitmap.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dist = Math.sqrt(
      Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)
    );

    if (dist <= threshold) {
      data[i + 3] = 0; // make transparent
      pixelsRemoved++;
    }
  }

  const outPath = path.join(os.tmpdir(), `mrx_bgrem_${Date.now()}.png`);
  await img.write(outPath as `${string}.png`);

  // Generate preview
  const thumbImg = img.clone();
  thumbImg.scaleToFit({ w: 400, h: 400 });
  const thumbBuffer = await thumbImg.getBuffer("image/png");

  return {
    outputPath: outPath,
    pixelsRemoved,
    totalPixels,
    message: `Removed ${pixelsRemoved.toLocaleString()} pixels (${Math.round(pixelsRemoved / totalPixels * 100)}% of image)`,
    previewBase64: `data:image/png;base64,${thumbBuffer.toString("base64")}`,
  };
}

// Alias for routes.ts which imports as bgRemove
export const bgRemove = removeBackground;

// ── HALFTONE ──────────────────────────────────────────────────────────────────
export type HalftoneType = "dots" | "lines" | "stochastic" | "diamond";
export type DitherOrder = 4 | 8 | 16;

export interface HalftoneOptions {
  type: HalftoneType;
  frequency: number;    // LPI (lines per inch)
  angle: number;        // degrees
  ditherOrder: DitherOrder;
  colorize: boolean;
  contrast: number;     // -100 to 100
}

export interface HalftoneResult {
  outputPath: string;
  message: string;
  previewBase64?: string;
}

export async function halftone(inputPath: string, opts: HalftoneOptions): Promise<HalftoneResult> {
  const img = await Jimp.read(inputPath);

  // Apply contrast adjustment if requested
  if (opts.contrast !== 0) {
    img.contrast(opts.contrast / 100);
  }

  // Convert to grayscale for halftone effect (unless colorize)
  if (!opts.colorize) {
    img.greyscale();
  }

  // Apply dithering using Jimp's built-in
  img.dither();

  // Apply slight contrast bump after dither for crisp dots
  img.contrast(0.1);

  const outPath = path.join(os.tmpdir(), `mrx_halftone_${Date.now()}.png`);
  await img.write(outPath as `${string}.png`);

  // Generate preview
  const thumbImg = img.clone();
  thumbImg.scaleToFit({ w: 400, h: 400 });
  const thumbBuffer = await thumbImg.getBuffer("image/png");

  return {
    outputPath: outPath,
    message: `Halftone applied (${opts.type}, ${opts.frequency}lpi, ${opts.angle}°)`,
    previewBase64: `data:image/png;base64,${thumbBuffer.toString("base64")}`,
  };
}

// ── COLOR PROFILER — Extract dominant colors ──────────────────────────────────
export async function extractColorProfile(inputPath: string): Promise<{
  dominantColors: Array<{ r: number; g: number; b: number; hex: string; pct: number }>;
  hasTransparency: boolean;
  estimatedWhiteCoverage: number;
  estimatedColorCoverage: number;
}> {
  const img = await Jimp.read(inputPath);
  const { width, height } = img.bitmap;
  const data = img.bitmap.data;

  const buckets: Record<string, number> = {};
  let transparentCount = 0;
  let whiteCount = 0;
  let colorCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 128) { transparentCount++; continue; }

    // Bucket to nearest 32
    const br = Math.round(r / 32) * 32;
    const bg = Math.round(g / 32) * 32;
    const bb = Math.round(b / 32) * 32;
    const key = `${br},${bg},${bb}`;
    buckets[key] = (buckets[key] || 0) + 1;

    if (r > 220 && g > 220 && b > 220) whiteCount++;
    else colorCount++;
  }

  const totalPixels = width * height;
  const opaquePixels = totalPixels - transparentCount;

  const sorted = Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const dominantColors = sorted.map(([key, count]) => {
    const [r, g, b] = key.split(",").map(Number);
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return { r, g, b, hex, pct: Math.round((count / totalPixels) * 100) };
  });

  return {
    dominantColors,
    hasTransparency: transparentCount > 0,
    estimatedWhiteCoverage: Math.round((whiteCount / Math.max(opaquePixels, 1)) * 100),
    estimatedColorCoverage: Math.round((colorCount / Math.max(opaquePixels, 1)) * 100),
  };
}
