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
 */

import sharp, { Sharp } from "sharp";
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

async function makeThumbnail(filePath: string, color?: string): Promise<string> {
  let pipeline = sharp(filePath).resize(300, null, { fit: "inside" });
  if (color) {
    // Tint the grayscale channel with its print color for the proof window
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    pipeline = pipeline.tint({ r, g, b });
  }
  const buf = await pipeline.png({ compressionLevel: 6 }).toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
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
  const meta = await sharp(inputPath).metadata();
  const W = meta.width || 1000;
  const H = meta.height || 1000;

  // Ensure RGBA
  const rgbaPath = tmpPath("png");
  await sharp(inputPath).ensureAlpha().toFile(rgbaPath);

  // Get raw RGBA buffer for pixel-level operations
  const { data: rawRGBA, info } = await sharp(rgbaPath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stride = info.channels; // 4

  // ── Step 2: CMYK Separation via sharp channel extraction ─────────────────
  // Convert to CMYK color space for true separation
  const cmykPath = tmpPath("tif");
  await sharp(rgbaPath).toColorspace("cmyk").toFile(cmykPath);

  // Extract each CMYK channel as grayscale
  const channelDefs: Array<{ name: string; type: "C"|"M"|"Y"|"K"; color: string; order: number }> = [
    { name: "Cyan",    type: "C", color: "#00aeef", order: 4 },
    { name: "Magenta", type: "M", color: "#ec008c", order: 3 },
    { name: "Yellow",  type: "Y", color: "#fff200", order: 2 },
    { name: "Black",   type: "K", color: "#231f20", order: 5 },
  ];

  for (let i = 0; i < channelDefs.length; i++) {
    const def = channelDefs[i];
    const chanPath = tmpPath("png");
    try {
      await sharp(cmykPath)
        .extractChannel(i as 0|1|2|3)
        .png()
        .toFile(chanPath);

      channels.push({
        name: def.name,
        type: def.type,
        filePath: chanPath,
        previewBase64: await makeThumbnail(chanPath, def.color),
        displayColor: def.color,
        opacity: def.type === "K" ? 90 : 85,
        printOrder: def.order,
      });
    } catch {
      // CMYK extract failed (e.g., source is already grayscale) — skip
    }
  }

  // ── Step 3: White Underbase ───────────────────────────────────────────────
  if (opts.whiteUnderbases) {
    const underbasePath = await buildWhiteUnderbase(rawRGBA, W, H, stride, opts);
    const ubPrev = await makeThumbnail(underbasePath, "#ffffff");
    channels.push({
      name: "White Underbase",
      type: "white_underbase",
      filePath: underbasePath,
      previewBase64: ubPrev,
      displayColor: "#ffffff",
      opacity: 80,
      printOrder: 1, // always first
    });
  }

  // ── Step 4: Highlight White ───────────────────────────────────────────────
  if (opts.highlightWhite) {
    const hlPath = await buildHighlightWhite(rawRGBA, W, H, stride, opts);
    const hlPrev = await makeThumbnail(hlPath, "#e8e8e8");
    channels.push({
      name: "Highlight White",
      type: "highlight_white",
      filePath: hlPath,
      previewBase64: hlPrev,
      displayColor: "#e8e8e8",
      opacity: 90,
      printOrder: 99, // always last
    });
  }

  // ── Step 5: Black Detail ─────────────────────────────────────────────────
  const blackPath = await buildBlackDetail(rawRGBA, W, H, stride, opts.blackMode);
  const bkPrev = await makeThumbnail(blackPath, "#111111");
  channels.push({
    name: "Black Detail",
    type: "black_detail",
    filePath: blackPath,
    previewBase64: bkPrev,
    displayColor: "#111111",
    opacity: 95,
    printOrder: 6,
  });

  // ── Step 6: Spot Colors ───────────────────────────────────────────────────
  for (const spot of opts.spotColors) {
    const spotPath = await buildSpotChannel(rawRGBA, W, H, stride, spot);
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
  const compositePath = await buildComposite(rgbaPath, channels, opts);
  const compositePreview = `data:image/png;base64,${
    (await sharp(compositePath).resize(600, null, { fit: "inside" }).png({ compressionLevel: 6 }).toBuffer()).toString("base64")
  }`;

  // Sort channels by print order for display
  channels.sort((a, b) => a.printOrder - b.printOrder);

  // Cleanup intermediate files
  try { fs.unlinkSync(rgbaPath); fs.unlinkSync(cmykPath); } catch {}

  return {
    channels,
    compositePreview,
    channelCount: channels.length,
    processingTimeMs: Date.now() - start,
    message: `Separated into ${channels.length} channels (${opts.mode.toUpperCase()} mode, ${opts.garmentColor} garment)`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// White Underbase: areas that need white ink laid down first
// Strategy: use alpha channel + luminance to determine where underbase is needed
// ─────────────────────────────────────────────────────────────────────────────

async function buildWhiteUnderbase(
  rgba: Buffer, W: number, H: number, stride: number,
  opts: SeparationOptions
): Promise<string> {
  const out = Buffer.alloc(W * H);

  const garmentLum = opts.garmentColor === "black" ? 0
    : opts.garmentColor === "dark" ? 40
    : opts.garmentColor === "light" ? 200
    : opts.garmentColor === "custom" && opts.garmentRGB
      ? Math.round(opts.garmentRGB.r * 0.299 + opts.garmentRGB.g * 0.587 + opts.garmentRGB.b * 0.114)
    : 255; // white garment

  for (let i = 0; i < W * H; i++) {
    const r = rgba[i * stride];
    const g = rgba[i * stride + 1];
    const b = rgba[i * stride + 2];
    const a = rgba[i * stride + 3];

    if (a < 10) { out[i] = 0; continue; } // fully transparent — no underbase

    // On white garments, underbase is needed where colors appear
    // On dark garments, underbase is needed everywhere with alpha
    const lum = Math.round(r * 0.299 + g * 0.587 + b * 0.114);

    let underbaseVal: number;
    if (garmentLum < 128) {
      // Dark garment: underbase needed for all non-transparent pixels
      // More underbase for lighter colors (they need white to pop)
      underbaseVal = Math.round((lum / 255) * (a / 255) * 255);
    } else {
      // Light/white garment: underbase for saturated/dark areas
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
      underbaseVal = Math.round(saturation * (a / 255) * 255);
    }

    out[i] = underbaseVal;
  }

  // Apply choke: erode the underbase slightly so it doesn't peek out
  const rawPath = tmpPath("png");
  await sharp(out, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toFile(rawPath);

  if (opts.chokePx > 0) {
    const chokedPath = tmpPath("png");
    try {
      await execAsync(
        `convert "${rawPath}" -morphology Erode Disk:${opts.chokePx} "${chokedPath}"`,
        { timeout: 30000 }
      );
      fs.unlinkSync(rawPath);
      return chokedPath;
    } catch {
      return rawPath; // ImageMagick not available — return unchoked
    }
  }

  return rawPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Highlight White: specular highlights and light areas on top of print
// ─────────────────────────────────────────────────────────────────────────────

async function buildHighlightWhite(
  rgba: Buffer, W: number, H: number, stride: number,
  opts: SeparationOptions
): Promise<string> {
  const out = Buffer.alloc(W * H);

  for (let i = 0; i < W * H; i++) {
    const r = rgba[i * stride];
    const g = rgba[i * stride + 1];
    const b = rgba[i * stride + 2];
    const a = rgba[i * stride + 3];

    if (a < 10) { out[i] = 0; continue; }

    const lum = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    // Highlight white appears in very bright areas (lum > 200)
    const threshold = 200;
    out[i] = lum > threshold ? Math.round(((lum - threshold) / 55) * (a / 255) * 255) : 0;
  }

  const hlPath = tmpPath("png");
  await sharp(out, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toFile(hlPath);

  if (opts.removeWhiteHaze) {
    // Apply a levels adjustment to eliminate near-white haze
    try {
      const cleanPath = tmpPath("png");
      await execAsync(
        `convert "${hlPath}" -level 20%,100% "${cleanPath}"`,
        { timeout: 15000 }
      );
      fs.unlinkSync(hlPath);
      return cleanPath;
    } catch { return hlPath; }
  }

  return hlPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Black Detail: shadow/outline separation
// Mode "saturate": pulls black from dark saturated areas
// Mode "detail": pulls black from edges/outlines
// ─────────────────────────────────────────────────────────────────────────────

async function buildBlackDetail(
  rgba: Buffer, W: number, H: number, stride: number,
  mode: BlackMode
): Promise<string> {
  const out = Buffer.alloc(W * H);

  for (let i = 0; i < W * H; i++) {
    const r = rgba[i * stride];
    const g = rgba[i * stride + 1];
    const b = rgba[i * stride + 2];
    const a = rgba[i * stride + 3];

    if (a < 10) { out[i] = 0; continue; }

    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

    if (mode === "saturate") {
      // Shadow areas: dark + saturated pulls more black
      out[i] = Math.round((1 - lum / 255) * (1 - saturation * 0.5) * (a / 255) * 255);
    } else if (mode === "detail") {
      // Dark areas only
      out[i] = Math.round(Math.max(0, 1 - lum / 128) * (a / 255) * 255);
    } else {
      // Both: blend of saturate and detail
      const sat = (1 - lum / 255) * (1 - saturation * 0.5);
      const det = Math.max(0, 1 - lum / 128);
      out[i] = Math.round(((sat + det) / 2) * (a / 255) * 255);
    }
  }

  const bkPath = tmpPath("png");
  await sharp(out, { raw: { width: W, height: H, channels: 1 } }).png().toFile(bkPath);
  return bkPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spot Color channel: select pixels within color tolerance range
// ─────────────────────────────────────────────────────────────────────────────

async function buildSpotChannel(
  rgba: Buffer, W: number, H: number, stride: number,
  spot: SpotColorTarget
): Promise<string> {
  const out = Buffer.alloc(W * H);

  for (let i = 0; i < W * H; i++) {
    const r = rgba[i * stride];
    const g = rgba[i * stride + 1];
    const b = rgba[i * stride + 2];
    const a = rgba[i * stride + 3];

    if (a < 10) { out[i] = 0; continue; }

    const dR = r - spot.r;
    const dG = g - spot.g;
    const dB = b - spot.b;
    const dist = Math.sqrt(dR * dR + dG * dG + dB * dB);
    const maxDist = spot.tolerance * 4.41; // 255 * sqrt(3) / 100 * tolerance

    out[i] = dist <= maxDist ? Math.round((1 - dist / maxDist) * (a / 255) * 255) : 0;
  }

  const spotPath = tmpPath("png");
  await sharp(out, { raw: { width: W, height: H, channels: 1 } }).png().toFile(spotPath);
  return spotPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply halftone dithering to semi-transparent edges for garment blending
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
      fs.unlinkSync(ch.filePath);
      ch.filePath = htPath;
      ch.previewBase64 = await makeThumbnail(htPath, ch.displayColor);
    } catch {
      // ImageMagick not available — skip halftone
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build proof window composite: overlay all channels on garment color
// ─────────────────────────────────────────────────────────────────────────────

async function buildComposite(
  originalPath: string,
  channels: SeparationChannel[],
  opts: SeparationOptions
): Promise<string> {
  const meta = await sharp(originalPath).metadata();
  const W = meta.width || 800;
  const H = meta.height || 800;

  // Start with garment background
  const bgColor = opts.garmentColor === "black" ? { r: 20, g: 20, b: 20 }
    : opts.garmentColor === "dark" ? { r: 60, g: 60, b: 60 }
    : opts.garmentColor === "custom" && opts.garmentRGB ? opts.garmentRGB
    : { r: 245, g: 245, b: 245 };

  const bgBuf = await sharp({
    create: { width: W, height: H, channels: 3, background: bgColor }
  }).png().toBuffer();

  // Composite channels in print order
  const sorted = [...channels].sort((a, b) => a.printOrder - b.printOrder);

  let composite = sharp(bgBuf);
  const overlays: sharp.OverlayOptions[] = [];

  for (const ch of sorted) {
    if (!fs.existsSync(ch.filePath)) continue;
    try {
      // Tint the grayscale channel with its display color
      const hex = ch.displayColor.replace("#", "");
      const cr = parseInt(hex.substring(0, 2), 16) || 128;
      const cg = parseInt(hex.substring(2, 4), 16) || 128;
      const cb = parseInt(hex.substring(4, 6), 16) || 128;

      const tintedBuf = await sharp(ch.filePath)
        .resize(W, H, { fit: "fill" })
        .tint({ r: cr, g: cg, b: cb })
        .png()
        .toBuffer();

      overlays.push({ input: tintedBuf, blend: "over", top: 0, left: 0 });
    } catch {}
  }

  const outPath = tmpPath("png");
  if (overlays.length > 0) {
    await sharp(bgBuf).composite(overlays).png().toFile(outPath);
  } else {
    await sharp(bgBuf).png().toFile(outPath);
  }

  return outPath;
}
