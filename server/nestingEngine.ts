/**
 * Manhattan RIP X — Smart Auto-Nesting Engine
 *
 * MaxRects bin-packing algorithm for optimal gang sheet layout.
 * Maximizes film utilization, minimizes waste.
 *
 * Based on: "A Thousand Ways to Pack the Bin" (Jukka Jylänki, 2010)
 * Heuristic: Best Short Side Fit (BSSF) with optional 90° rotation.
 */

import sharp from "sharp";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NestInput {
  id: number;
  filePath: string;
  copies: number;
  scalePercent: number;
}

export interface NestOptions {
  sheetWidth: number;    // inches
  sheetHeight: number;   // inches
  spacing: number;       // inches between items (default 0.1")
  rotate90: boolean;     // allow 90° rotation
  dpi?: number;          // for pixel→inch conversion (default 300)
}

export interface NestPlacement {
  jobId: number;
  x: number;            // inches from left
  y: number;            // inches from top
  width: number;        // inches
  height: number;       // inches
  rotated: boolean;
  scalePercent: number;
  sheet: number;        // 1-indexed sheet number
}

export interface NestResult {
  placements: NestPlacement[];
  sheetsUsed: number;
  utilization: number;  // 0–1 fraction of last sheet used
  totalArea: number;    // total item area placed (sq inches)
  sheetArea: number;    // sheet area per sheet (sq inches)
}

interface Rect { x: number; y: number; w: number; h: number; }

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function autoNestJobs(
  jobs: NestInput[],
  opts: NestOptions
): Promise<NestResult> {
  const dpi = opts.dpi ?? 300;
  const gap = opts.spacing;

  // 1. Resolve physical dimensions for each job (with copies expanded)
  const items: Array<{ jobId: number; w: number; h: number; scalePercent: number }> = [];

  for (const job of jobs) {
    let w: number, h: number;

    try {
      const meta = await sharp(job.filePath).metadata();
      const scale = (job.scalePercent ?? 100) / 100;
      w = ((meta.width ?? 300) / dpi) * scale;
      h = ((meta.height ?? 300) / dpi) * scale;
    } catch {
      // Fallback dimensions if file can't be read
      w = 4.0;
      h = 4.0;
    }

    // Expand copies
    for (let c = 0; c < (job.copies ?? 1); c++) {
      items.push({ jobId: job.id, w, h, scalePercent: job.scalePercent ?? 100 });
    }
  }

  // Sort: tallest first (improves packing)
  items.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  // 2. Pack sheets
  const placements: NestPlacement[] = [];
  let sheet = 1;
  let freeRects: Rect[] = [{ x: 0, y: 0, w: opts.sheetWidth, h: opts.sheetHeight }];
  let placedAreaOnSheet = 0;

  for (const item of items) {
    const result = findBestFit(item.w + gap, item.h + gap, freeRects, opts.rotate90);

    if (!result) {
      // Start new sheet
      sheet++;
      freeRects = [{ x: 0, y: 0, w: opts.sheetWidth, h: opts.sheetHeight }];
      placedAreaOnSheet = 0;

      const retry = findBestFit(item.w + gap, item.h + gap, freeRects, opts.rotate90);
      if (!retry) continue; // item larger than sheet — skip

      place(retry, item, freeRects, placements, sheet, gap);
      placedAreaOnSheet += item.w * item.h;
    } else {
      place(result, item, freeRects, placements, sheet, gap);
      placedAreaOnSheet += item.w * item.h;
    }
  }

  const sheetArea = opts.sheetWidth * opts.sheetHeight;
  const totalArea = placements.reduce((sum, p) => sum + p.width * p.height, 0);
  const utilization = totalArea / (sheet * sheetArea);

  return { placements, sheetsUsed: sheet, utilization, totalArea, sheetArea };
}

// ─────────────────────────────────────────────────────────────────────────────
// MaxRects: Best Short Side Fit heuristic
// ─────────────────────────────────────────────────────────────────────────────

function findBestFit(
  w: number,
  h: number,
  freeRects: Rect[],
  allowRotate: boolean
): { rect: Rect; rotated: boolean } | null {
  let bestScore = Infinity;
  let bestRect: Rect | null = null;
  let bestRotated = false;

  for (const r of freeRects) {
    // Normal orientation
    if (r.w >= w && r.h >= h) {
      const score = Math.min(r.w - w, r.h - h); // short side fit
      if (score < bestScore) {
        bestScore = score;
        bestRect = r;
        bestRotated = false;
      }
    }
    // Rotated 90°
    if (allowRotate && r.w >= h && r.h >= w) {
      const score = Math.min(r.w - h, r.h - w);
      if (score < bestScore) {
        bestScore = score;
        bestRect = r;
        bestRotated = true;
      }
    }
  }

  return bestRect ? { rect: bestRect, rotated: bestRotated } : null;
}

function place(
  fit: { rect: Rect; rotated: boolean },
  item: { jobId: number; w: number; h: number; scalePercent: number },
  freeRects: Rect[],
  placements: NestPlacement[],
  sheet: number,
  gap: number
) {
  const itemW = fit.rotated ? item.h : item.w;
  const itemH = fit.rotated ? item.w : item.h;

  placements.push({
    jobId: item.jobId,
    x: fit.rect.x,
    y: fit.rect.y,
    width: item.w,
    height: item.h,
    rotated: fit.rotated,
    scalePercent: item.scalePercent,
    sheet,
  });

  // Split free rects (Guillotine split — longer axis first)
  const usedX = fit.rect.x;
  const usedY = fit.rect.y;
  const usedW = itemW + gap;
  const usedH = itemH + gap;

  const newRects: Rect[] = [];

  // Right remainder
  if (fit.rect.w - usedW > 0.01) {
    newRects.push({
      x: usedX + usedW,
      y: usedY,
      w: fit.rect.w - usedW,
      h: fit.rect.h,
    });
  }
  // Bottom remainder
  if (fit.rect.h - usedH > 0.01) {
    newRects.push({
      x: usedX,
      y: usedY + usedH,
      w: usedW,
      h: fit.rect.h - usedH,
    });
  }

  // Remove the used rect and add new ones
  const idx = freeRects.indexOf(fit.rect);
  if (idx !== -1) freeRects.splice(idx, 1);
  freeRects.push(...newRects);

  // Prune rects fully contained in others
  pruneContained(freeRects);
}

function pruneContained(rects: Rect[]) {
  for (let i = rects.length - 1; i >= 0; i--) {
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue;
      if (contains(rects[j], rects[i])) {
        rects.splice(i, 1);
        break;
      }
    }
  }
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.w >= inner.x + inner.w &&
    outer.y + outer.h >= inner.y + inner.h
  );
}
