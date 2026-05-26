/**
 * Manhattan RIP X — Separation Engine (multi-channel)
 *
 * One-click art separation for DTF, DTG, and Screen Print workflows.
 * Produces per-channel separations:
 *   - CMYK channels (process color)
 *   - White Underbase (coverage for dark/colored garments)
 *   - Highlight White (specular highlights, garment blend)
 *   - Black Detail (shadow/outline boost)
 *   - Spot Colors (custom named colors)
 *   - Halftone blending for edge transparency
 *
 * Proof Window composite: overlay all channels at configurable opacity
 * to preview exactly what will print before sending to queue.
 *
 * Pure JS — no sharp, no native binaries required.
 */

import { Jimp } from "jimp";
import path from "path";
import fs from "fs";
import os from "os";
import { execAsync } from "./imageTools";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SeparationMode = "dtf" | "dtg" | "screen_print";
export type GarmentColor = "white" | "black" | "light" | "dark" | "custom";
export type BlackMode = "saturate" | "detail" | "both";

export interface SeparationOptions {
  mode: SeparationMode;
  garmentColor: GarmentColor;
  garmentRGB?: { r: number; g: number; b: number };
  whiteUnderbases: boolean;
  highlightWhite: boolean;
  blackMode: BlackMode;
  chokePx: number;            // choke underbase by N pixels (default 1)
  halftoneEdges: boolean;     // blend transparent edges into halftone dots
  halftoneFrequency: number;  // lpi for edge halftones (default 45)
  removeWhiteHaze: boolean;   // eliminate semi-transparent white noise
  spotColors: SpotColorTarget[];
}

export interface SpotColorTarget {
  name: string;
  r: number; g: number; b: number;
  tolerance: number;   // color range tolerance (0–50)
  printColor: string;  // display color for proof window (hex)
}

export interface SeparationResult {
  channels: SeparationChannel[];
  compositePreview: string;       // base64 PNG — all channels composited
  channelCount: number;
  processingTimeMs: number;
  message: string;
}

export interface SeparationChannel {
  name: string;
  type: "C"|"M"|"Y"|"K"|"white_underbase"|"highlight_white"|"black_detail"|"spot";
  filePath: string;
  previewBase64: string;          // grayscale channel preview (base64 PNG)
  displayColor: string;           // hex color for proof overlay
  opacity: number;                // default print opacity 0–100
  printOrder: number;             // sequence (underbase first, highlight last)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tmpPath(suffix: string): string {
  return path.join(os.tmpdir(), `mrx_sep_${Date.now()}_${Math.random().toString(36).slice(2)}.${suffix}`);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) || 128,
    g: parseInt(h.substring(2, 4), 16) || 128,
    b: parseInt(h.substring(4, 6), 16) || 128,
  };
}

async function makeThumbnail(filePath: string, color?: string): Promise<string> {
  try {
    const img = await Jimp.read(filePath);
    img.scaleToFit({ w: 300, h: 300 });
    if (color) {
      const { r, g, b } = hexToRgb(color);
      // Tint by blending each pixel toward the display color
      const data = img.bitmap.data;
      for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] / 255;
        data[i]     = Math.round(r * lum);
        data[i + 1] = Math.round(g * lum);
        data[i + 2] = Math.round(b * lum);
        // keep alpha
      }
    }
    const buf = await img.getBuffer("image/png");
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  }
}

// Save a raw grayscale buffer as PNG
async function saveGrayscale(data: Buffer, width: number, height: number, outPath: string): Promise<void> {
  // Create an RGBA image from grayscale buffer
  const img = new Jimp({ width, height, color: 0x000000ff });
  const rgba = img.bitmap.data;
  for (let i = 0; i < width * height; i++) {
    const v = data[i];
    rgba[i * 4]     = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  await img.write(outPath as `${string}.png`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main separation function
// ─────────────────────────────────────────────────────────────────────────────

export async function separateArt(
  inputPath: string,
  opts: SeparationOptions
): Promise<SeparationResult> {
  const start = Date.now();
  const channels: SeparationChannel[] = [];

  // ── Step 1: Load + normalize input ───────────────────────────────────────
  const img = await Jimp.read(inputPath);
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const rawRGBA = img.bitmap.data; // RGBA buffer, stride 4

  // ── Step 2: CMYK Separation (computed from RGB) ───────────────────────────
  const channelDefs: Array<{ name: string; type: "C"|"M"|"Y"|"K"; color: string; order: number; idx: 0|1|2|3 }> = [
    { name: "Cyan",    type: "C", color: "#00aeef", order: 4, idx: 0 },
    { name: "Magenta", type: "M", color: "#ec008c", order: 3, idx: 1 },
    { name: "Yellow",  type: "Y", color: "#fff200", order: 2, idx: 2 },
    { name: "Black",   type: "K", color: "#231f20", order: 5, idx: 3 },
  ];

  // Build all 4 CMYK channels in one pass
  const cmykBuffers = [
    Buffer.alloc(W * H), // C
    Buffer.alloc(W * H), // M
    Buffer.alloc(W * H), // Y
    Buffer.alloc(W * H), // K
  ];

  for (let i = 0; i < W * H; i++) {
    const r = rawRGBA[i * 4];
    const g = rawRGBA[i * 4 + 1];
    const b = rawRGBA[i * 4 + 2];
    const a = rawRGBA[i * 4 + 3];

    if (a < 10) continue;

    const rf = r / 255, gf = g / 255, bf = b / 255;
    const k = 1 - Math.max(rf, gf, bf);
    if (k < 1) {
      const d = 1 - k;
      cmykBuffers[0][i] = Math.round(((1 - rf - k) / d) * 255);
      cmykBuffers[1][i] = Math.round(((1 - gf - k) / d) * 255);
      cmykBuffers[2][i] = Math.round(((1 - bf - k) / d) * 255);
      cmykBuffers[3][i] = Math.round(k * 255);
    } else {
      cmykBuffers[3][i] = 255;
    }
  }

  for (const def of channelDefs) {
    const chanPath = tmpPath("png");
    await saveGrayscale(cmykBuffers[def.idx], W, H, chanPath);
    channels.push({
      name: def.name,
      type: def.type,
      filePath: chanPath,
      previewBase64: await makeThumbnail(chanPath, def.color),
      displayColor: def.color,
      opacity: def.type === "K" ? 90 : 85,
      printOrder: def.order,
    });
  }

  // ── Step 3: White Underbase ───────────────────────────────────────────────
  if (opts.whiteUnderbases) {
    const underbasePath = await buildWhiteUnderbase(rawRGBA, W, H, opts);
    channels.push({
      name: "White Underbase",
      type: "white_underbase",
      filePath: underbasePath,
      previewBase64: await makeThumbnail(underbasePath, "#ffffff"),
      displayColor: "#ffffff",
      opacity: 80,
      printOrder: 1,
    });
  }

  // ── Step 4: Highlight White ───────────────────────────────────────────────
  if (opts.highlightWhite) {
    const hlPath = await buildHighlightWhite(rawRGBA, W, H, opts);
    channels.push({
      name: "Highlight White",
      type: "highlight_white",
      filePath: hlPath,
      previewBase64: await makeThumbnail(hlPath, "#e8e8e8"),
      displayColor: "#e8e8e8",
      opacity: 90,
      printOrder: 99,
    });
  }

  // ── Step 5: Black Detail ─────────────────────────────────────────────────
  const blackPath = await buildBlackDetail(rawRGBA, W, H, opts.blackMode);
  channels.push({
    name: "Black Detail",
    type: "black_detail",
    filePath: blackPath,
    previewBase64: await makeThumbnail(blackPath, "#111111"),
    displayColor: "#111111",
    opacity: 95,
    printOrder: 6,
  });

  // ── Step 6: Spot Colors ───────────────────────────────────────────────────
  for (const spot of opts.spotColors) {
    const spotPath = await buildSpotChannel(rawRGBA, W, H, spot);
    channels.push({
      name: spot.name,
      type: "spot",
      filePath: spotPath,
      previewBase64: await makeThumbnail(spotPath, spot.printColor),
      displayColor: spot.printColor,
      opacity: 90,
      printOrder: 7,
    });
  }

  // ── Step 7: Halftone edge blending ───────────────────────────────────────
  if (opts.halftoneEdges) {
    await applyHalftoneEdges(channels, opts.halftoneFrequency);
  }

  // ── Step 8: Proof window composite ───────────────────────────────────────
  const compositePreview = await buildComposite(img, channels, opts);

  // Sort channels by print order for display
  channels.sort((a, b) => a.printOrder - b.printOrder);

  return {
    channels,
    compositePreview,
    channelCount: channels.length,
    processingTimeMs: Date.now() - start,
    message: `Separated into ${channels.length} channels (${opts.mode.toUpperCase()} mode, ${opts.garmentColor} garment)`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// White Underbase
// ─────────────────────────────────────────────────────────────────────────────

async function buildWhiteUnderbase(
  rgba: Buffer, W: number, H: number,
  opts: SeparationOptions
): Promise<string> {
  const out = Buffer.alloc(W * H);

  const garmentLum = opts.garmentColor === "black" ? 0
    : opts.garmentColor === "dark" ? 40
    : opts.garmentColor === "light" ? 200
    : opts.garmentColor === "custom" && opts.garmentRGB
      ? Math.round(opts.garmentRGB.r * 0.299 + opts.garmentRGB.g * 0.587 + opts.garmentRGB.b * 0.114)
    : 255;

  for (let i = 0; i < W * H; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];

    if (a < 10) { out[i] = 0; continue; }

    const lum = Math.round(r * 0.299 + g * 0.587 + b * 0.114);

    let underbaseVal: number;
    if (garmentLum < 128) {
      underbaseVal = Math.round((lum / 255) * (a / 255) * 255);
    } else {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
      underbaseVal = Math.round(saturation * (a / 255) * 255);
    }

    out[i] = underbaseVal;
  }

  const rawPath = tmpPath("png");
  await saveGrayscale(out, W, H, rawPath);

  // Apply choke via ImageMagick if available
  if (opts.chokePx > 0) {
    const chokedPath = tmpPath("png");
    try {
      await execAsync(
        `convert "${rawPath}" -morphology Erode Disk:${opts.chokePx} "${chokedPath}"`,
        { timeout: 30000 }
      );
      try { fs.unlinkSync(rawPath); } catch {}
      return chokedPath;
    } catch {
      return rawPath;
    }
  }

  return rawPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Highlight White
// ─────────────────────────────────────────────────────────────────────────────

async function buildHighlightWhite(
  rgba: Buffer, W: number, H: number,
  opts: SeparationOptions
): Promise<string> {
  const out = Buffer.alloc(W * H);

  for (let i = 0; i < W * H; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];

    if (a < 10) { out[i] = 0; continue; }

    const lum = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    const threshold = 200;
    out[i] = lum > threshold ? Math.round(((lum - threshold) / 55) * (a / 255) * 255) : 0;
  }

  const hlPath = tmpPath("png");
  await saveGrayscale(out, W, H, hlPath);

  if (opts.removeWhiteHaze) {
    try {
      const img = await Jimp.read(hlPath);
      // Apply levels: cut off anything below 20% luminance
      const data = img.bitmap.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = data[i];
        data[i] = data[i + 1] = data[i + 2] = v < 51 ? 0 : Math.round((v - 51) / 204 * 255);
      }
      const cleanPath = tmpPath("png");
      await img.write(cleanPath as `${string}.png`);
      try { fs.unlinkSync(hlPath); } catch {}
      return cleanPath;
    } catch { return hlPath; }
  }

  return hlPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Black Detail
// ─────────────────────────────────────────────────────────────────────────────

async function buildBlackDetail(
  rgba: Buffer, W: number, H: number,
  mode: BlackMode
): Promise<string> {
  const out = Buffer.alloc(W * H);

  for (let i = 0; i < W * H; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];

    if (a < 10) { out[i] = 0; continue; }

    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

    if (mode === "saturate") {
      out[i] = Math.round((1 - lum / 255) * (1 - saturation * 0.5) * (a / 255) * 255);
    } else if (mode === "detail") {
      out[i] = Math.round(Math.max(0, 1 - lum / 128) * (a / 255) * 255);
    } else {
      const sat = (1 - lum / 255) * (1 - saturation * 0.5);
      const det = Math.max(0, 1 - lum / 128);
      out[i] = Math.round(((sat + det) / 2) * (a / 255) * 255);
    }
  }

  const bkPath = tmpPath("png");
  await saveGrayscale(out, W, H, bkPath);
  return bkPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spot Color channel
// ─────────────────────────────────────────────────────────────────────────────

async function buildSpotChannel(
  rgba: Buffer, W: number, H: number,
  spot: SpotColorTarget
): Promise<string> {
  const out = Buffer.alloc(W * H);

  for (let i = 0; i < W * H; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];

    if (a < 10) { out[i] = 0; continue; }

    const dR = r - spot.r;
    const dG = g - spot.g;
    const dB = b - spot.b;
    const dist = Math.sqrt(dR * dR + dG * dG + dB * dB);
    const maxDist = spot.tolerance * 4.41;

    out[i] = dist <= maxDist ? Math.round((1 - dist / maxDist) * (a / 255) * 255) : 0;
  }

  const spotPath = tmpPath("png");
  await saveGrayscale(out, W, H, spotPath);
  return spotPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply halftone dithering to edges
// ─────────────────────────────────────────────────────────────────────────────

async function applyHalftoneEdges(channels: SeparationChannel[], frequency: number) {
  const scale = Math.max(2, Math.min(30, Math.round(100 / frequency)));

  for (const ch of channels) {
    if (ch.type === "white_underbase" || ch.type === "highlight_white") continue;
    try {
      const htPath = tmpPath("png");
      await execAsync(
        `convert "${ch.filePath}" -ordered-dither o8x8,${scale} "${htPath}"`,
        { timeout: 30000 }
      );
      try { fs.unlinkSync(ch.filePath); } catch {}
      ch.filePath = htPath;
      ch.previewBase64 = await makeThumbnail(htPath, ch.displayColor);
    } catch {
      // ImageMagick not available — skip halftone
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build proof window composite
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildComposite(
  sourceImg: any,
  channels: SeparationChannel[],
  opts: SeparationOptions
): Promise<string> {
  const W = sourceImg.bitmap.width;
  const H = sourceImg.bitmap.height;

  // Garment background
  const bgColor = opts.garmentColor === "black" ? 0x141414ff
    : opts.garmentColor === "dark" ? 0x3c3c3cff
    : opts.garmentColor === "custom" && opts.garmentRGB
      ? (opts.garmentRGB.r << 24 | opts.garmentRGB.g << 16 | opts.garmentRGB.b << 8 | 0xff) >>> 0
    : 0xf5f5f5ff;

  const composite = new Jimp({ width: W, height: H, color: bgColor });

  // Composite channels in print order
  const sorted = [...channels].sort((a, b) => a.printOrder - b.printOrder);

  for (const ch of sorted) {
    if (!fs.existsSync(ch.filePath)) continue;
    try {
      const { r, g, b } = hexToRgb(ch.displayColor);
      const chanImg = await Jimp.read(ch.filePath);
      chanImg.resize({ w: W, h: H });

      // Tint channel pixels toward display color
      const data = chanImg.bitmap.data;
      for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] / 255;
        data[i]     = Math.round(r * lum);
        data[i + 1] = Math.round(g * lum);
        data[i + 2] = Math.round(b * lum);
        data[i + 3] = data[i + 3]; // keep alpha
      }

      composite.composite(chanImg, 0, 0);
    } catch {}
  }

  // Scale down for preview
  composite.scaleToFit({ w: 600, h: 600 });
  const buf = await composite.getBuffer("image/png");
  return `data:image/png;base64,${buf.toString("base64")}`;
}
