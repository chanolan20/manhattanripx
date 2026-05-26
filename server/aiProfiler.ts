/**
 * Manhattan RIP X — AI Auto-Profiler
 *
 * Upload a phone photo of a printed test chart → analyze color patches →
 * generate per-channel CMYK correction curves without a spectrophotometer.
 *
 * Pure JS — no sharp, no native binaries required.
 */

import { Jimp } from "jimp";
import path from "path";
import fs from "fs";
import os from "os";

// ─────────────────────────────────────────────────────────────────────────────
// Reference patch data
// ─────────────────────────────────────────────────────────────────────────────

export const REFERENCE_PATCHES: Array<{ name: string; r: number; g: number; b: number; channel: "C"|"M"|"Y"|"K"|"neutral" }> = [
  { name: "Cyan 100%",       r: 0,   g: 174, b: 239, channel: "C" },
  { name: "Magenta 100%",    r: 236, g: 0,   b: 140, channel: "M" },
  { name: "Yellow 100%",     r: 255, g: 242, b: 0,   channel: "Y" },
  { name: "Black 100%",      r: 20,  g: 20,  b: 20,  channel: "K" },
  { name: "White",           r: 250, g: 250, b: 250, channel: "neutral" },
  { name: "Neutral Gray 50%",r: 128, g: 128, b: 128, channel: "neutral" },
  { name: "Red (M+Y)",       r: 239, g: 51,  b: 36,  channel: "M" },
  { name: "Green (C+Y)",     r: 0,   g: 166, b: 81,  channel: "C" },
  { name: "Blue (C+M)",      r: 0,   g: 83,  b: 159, channel: "C" },
  { name: "Orange",          r: 244, g: 120, b: 32,  channel: "M" },
  { name: "Purple",          r: 102, g: 45,  b: 145, channel: "M" },
  { name: "Teal",            r: 0,   g: 133, b: 127, channel: "C" },
  { name: "Skin Light",      r: 249, g: 228, b: 196, channel: "neutral" },
  { name: "Skin Medium",     r: 198, g: 157, b: 122, channel: "neutral" },
  { name: "Skin Tan",        r: 148, g: 101, b: 72,  channel: "neutral" },
  { name: "Skin Dark",       r: 94,  g: 60,  b: 44,  channel: "neutral" },
  { name: "Highlight",       r: 240, g: 240, b: 240, channel: "neutral" },
  { name: "Shadow",          r: 52,  g: 52,  b: 52,  channel: "K" },
  { name: "Cyan 50%",        r: 128, g: 215, b: 247, channel: "C" },
  { name: "Magenta 50%",     r: 245, g: 128, b: 198, channel: "M" },
  { name: "Yellow 50%",      r: 255, g: 248, b: 128, channel: "Y" },
  { name: "Black 25%",       r: 192, g: 192, b: 192, channel: "K" },
  { name: "Black 75%",       r: 64,  g: 64,  b: 64,  channel: "K" },
  { name: "Full CMYK",       r: 40,  g: 40,  b: 40,  channel: "K" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfilerResult {
  success: boolean;
  message: string;
  patchCount: number;
  corrections: ChannelCorrection;
  previewBase64: string;
  deltaE_avg: number;
  deltaE_max: number;
}

export interface ChannelCorrection {
  C: ToneCurve;
  M: ToneCurve;
  Y: ToneCurve;
  K: ToneCurve;
  brightness: number;
  saturation: number;
}

export interface ToneCurve {
  inputValues: number[];
  outputValues: number[];
  shift: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: Analyze photo and generate correction curves
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeTestChart(imagePath: string): Promise<ProfilerResult> {
  const src = await Jimp.read(imagePath);
  const W = src.bitmap.width;
  const H = src.bitmap.height;

  // Normalize to max 1200px
  const scale = Math.min(1, 1200 / Math.max(W, H));
  const ww = Math.round(W * scale);
  const wh = Math.round(H * scale);
  src.resize({ w: ww, h: wh });

  const rawData = src.bitmap.data; // RGBA, stride 4

  // Detect patch grid — use central 80% to skip borders
  const margin = 0.10;
  const patchCols = 6;
  const patchRows = 4;
  const gridX = Math.round(ww * margin);
  const gridY = Math.round(wh * margin);
  const gridW = Math.round(ww * (1 - 2 * margin));
  const gridH = Math.round(wh * (1 - 2 * margin));
  const patchW = gridW / patchCols;
  const patchH = gridH / patchRows;

  // Sample center of each patch (5×5 average)
  const sampledPatches: Array<{ r: number; g: number; b: number }> = [];

  for (let row = 0; row < patchRows; row++) {
    for (let col = 0; col < patchCols; col++) {
      const cx = Math.round(gridX + col * patchW + patchW / 2);
      const cy = Math.round(gridY + row * patchH + patchH / 2);

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const px = Math.min(ww - 1, Math.max(0, cx + dx));
          const py = Math.min(wh - 1, Math.max(0, cy + dy));
          const idx = (py * ww + px) * 4;
          rSum += rawData[idx];
          gSum += rawData[idx + 1];
          bSum += rawData[idx + 2];
          count++;
        }
      }
      sampledPatches.push({
        r: Math.round(rSum / count),
        g: Math.round(gSum / count),
        b: Math.round(bSum / count),
      });
    }
  }

  // Compute ΔE per patch
  const patchCount = Math.min(sampledPatches.length, REFERENCE_PATCHES.length);
  let totalDeltaE = 0;
  let maxDeltaE = 0;
  const patchErrors: Array<{ channel: string; inputVal: number; outputVal: number; deltaE: number }> = [];

  for (let i = 0; i < patchCount; i++) {
    const ref = REFERENCE_PATCHES[i];
    const sam = sampledPatches[i];
    const dR = ref.r - sam.r, dG = ref.g - sam.g, dB = ref.b - sam.b;
    const dE = Math.sqrt(dR * dR + dG * dG + dB * dB) / Math.sqrt(3) / 255 * 100;
    totalDeltaE += dE;
    if (dE > maxDeltaE) maxDeltaE = dE;
    patchErrors.push({ channel: ref.channel, inputVal: rgbToGray(sam), outputVal: rgbToGray(ref), deltaE: dE });
  }

  const deltaE_avg = totalDeltaE / patchCount;
  const corrections = buildCorrectionCurves(patchErrors, sampledPatches, patchCount);

  // Build annotated preview — draw reference/sampled color squares on the image
  const previewBase64 = await buildPreviewImage(src, ww, wh, gridX, gridY, patchW, patchH, patchCols, sampledPatches, patchCount);

  return {
    success: true,
    message: `Analyzed ${patchCount} patches. Average ΔE: ${deltaE_avg.toFixed(1)}, Max: ${maxDeltaE.toFixed(1)}. ${deltaE_avg < 5 ? "Excellent match." : deltaE_avg < 10 ? "Good — minor corrections applied." : "Significant corrections needed — check lighting."}`,
    patchCount,
    corrections,
    previewBase64,
    deltaE_avg,
    deltaE_max: maxDeltaE,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build correction curves
// ─────────────────────────────────────────────────────────────────────────────

function buildCorrectionCurves(
  patchErrors: Array<{ channel: string; inputVal: number; outputVal: number; deltaE: number }>,
  sampled: Array<{ r: number; g: number; b: number }>,
  patchCount: number
): ChannelCorrection {
  const POINTS = [0, 32, 64, 96, 128, 160, 192, 224, 255];
  const byChannel: Record<string, typeof patchErrors> = { C: [], M: [], Y: [], K: [], neutral: [] };
  for (const p of patchErrors) byChannel[p.channel]?.push(p);

  function buildCurve(patches: typeof patchErrors): ToneCurve {
    if (patches.length === 0) return { inputValues: POINTS, outputValues: POINTS, shift: 0 };
    const corr: Record<number, number> = {};
    for (const p of patches) {
      const bucket = Math.min(255, Math.max(0, Math.round(p.inputVal / 32) * 32));
      corr[bucket] = (corr[bucket] ?? 0) + (p.outputVal - p.inputVal);
    }
    const outputValues = POINTS.map(inp => {
      const shift = corr[inp] ?? 0;
      const weight = inp <= 32 || inp >= 224 ? 0.3 : 1.0;
      return Math.min(255, Math.max(0, Math.round(inp + shift * weight)));
    });
    const avgShift = Object.values(corr).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(corr).length);
    return { inputValues: POINTS, outputValues, shift: avgShift };
  }

  let sampledLum = 0, refLum = 0;
  for (let i = 0; i < patchCount; i++) {
    sampledLum += sampled[i].r * 0.299 + sampled[i].g * 0.587 + sampled[i].b * 0.114;
    const ref = REFERENCE_PATCHES[i];
    refLum += ref.r * 0.299 + ref.g * 0.587 + ref.b * 0.114;
  }
  const brightnessAdj = Math.max(-50, Math.min(50, Math.round((refLum - sampledLum) / patchCount / 255 * 100)));

  const sampledSat = avgSaturation(sampled);
  const refSat = avgSaturation(REFERENCE_PATCHES.slice(0, patchCount).map(p => ({ r: p.r, g: p.g, b: p.b })));
  const satAdj = Math.max(-50, Math.min(50, Math.round((refSat - sampledSat) * 50)));

  return {
    C: buildCurve(byChannel.C),
    M: buildCurve(byChannel.M),
    Y: buildCurve(byChannel.Y),
    K: buildCurve(byChannel.K),
    brightness: brightnessAdj,
    saturation: satAdj,
  };
}

function rgbToGray(p: { r: number; g: number; b: number }): number {
  return Math.round(p.r * 0.299 + p.g * 0.587 + p.b * 0.114);
}

function avgSaturation(pixels: Array<{ r: number; g: number; b: number }>): number {
  let total = 0;
  for (const p of pixels) {
    const maxC = Math.max(p.r, p.g, p.b) / 255;
    const minC = Math.min(p.r, p.g, p.b) / 255;
    total += maxC === 0 ? 0 : (maxC - minC) / maxC;
  }
  return total / Math.max(pixels.length, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build annotated preview PNG (Jimp — no SVG composite)
// ─────────────────────────────────────────────────────────────────────────────

async function buildPreviewImage(
  src: any,
  ww: number, wh: number,
  gridX: number, gridY: number,
  patchW: number, patchH: number,
  cols: number,
  sampled: Array<{ r: number; g: number; b: number }>,
  patchCount: number
): Promise<string> {
  try {
    const preview = src.clone();
    const boxW = Math.max(4, Math.round(patchW * 0.35));
    const boxH = Math.max(4, Math.round(patchH * 0.35));

    for (let i = 0; i < patchCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const cx = Math.round(gridX + col * patchW);
      const cy = Math.round(gridY + row * patchH);
      const ref = REFERENCE_PATCHES[i];
      const sam = sampled[i];

      // Draw reference color box (top-left of patch)
      const refColor = (ref.r << 24 | ref.g << 16 | ref.b << 8 | 0xff) >>> 0;
      for (let py = cy + 2; py < cy + 2 + boxH && py < wh; py++) {
        for (let px = cx + 2; px < cx + 2 + boxW && px < ww; px++) {
          preview.setPixelColor(refColor, px, py);
        }
      }

      // Draw sampled color box (top-right of patch)
      const samColor = (sam.r << 24 | sam.g << 16 | sam.b << 8 | 0xff) >>> 0;
      for (let py = cy + 2; py < cy + 2 + boxH && py < wh; py++) {
        for (let px = cx + Math.round(patchW) - boxW - 2; px < cx + Math.round(patchW) - 2 && px < ww; px++) {
          preview.setPixelColor(samColor, px, py);
        }
      }
    }

    preview.scaleToFit({ w: 800, h: 800 });
    const buf = await preview.getBuffer("image/png");
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    // Fallback: return plain resized image
    src.scaleToFit({ w: 800, h: 800 });
    const buf = await src.getBuffer("image/png");
    return `data:image/png;base64,${buf.toString("base64")}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate test chart PNG (pure Jimp — no SVG needed)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateTestChart(outputPath: string): Promise<void> {
  const W = 2100; // ~7" @ 300 dpi
  const H = 1400;
  const cols = 6;
  const rows = 4;
  const patchW = Math.round(W / cols);
  const patchH = Math.round(H / rows);

  const chart = new Jimp({ width: W, height: H, color: 0xffffffff });

  for (let i = 0; i < REFERENCE_PATCHES.length && i < cols * rows; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = col * patchW;
    const y = row * patchH;
    const ref = REFERENCE_PATCHES[i];
    const color = (ref.r << 24 | ref.g << 16 | ref.b << 8 | 0xff) >>> 0;

    // Fill patch rectangle
    for (let py = y; py < y + patchH && py < H; py++) {
      for (let px = x; px < x + patchW && px < W; px++) {
        chart.setPixelColor(color, px, py);
      }
    }
  }

  await chart.write(outputPath as `${string}.png`);
}
