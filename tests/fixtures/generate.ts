/**
 * Manhattan RIP X — Test Fixture Generator
 * Creates synthetic PNG/JPEG images for use in test suites without any external assets.
 * All images are generated programmatically via sharp at test startup.
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";
import os from "os";

export const FIXTURES_DIR = path.join(os.tmpdir(), "mrx_test_fixtures");

export interface Fixture {
  path: string;
  width: number;
  height: number;
  format: "png" | "jpeg" | "tiff";
  description: string;
}

/** Ensure fixtures directory exists */
function ensureDir() {
  if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

/**
 * Generate a solid-color PNG image. Used for deterministic ink cost verification:
 * - Pure cyan  → C=100%, M=0%, Y=0%, K=0%
 * - Pure white → C=0%, M=0%, Y=0%, K=0%, W=100%
 * - Pure black → C=0%, M=0%, Y=0%, K=100%
 */
export async function generateSolidPNG(
  filename: string,
  r: number, g: number, b: number,
  width = 200, height = 200
): Promise<Fixture> {
  ensureDir();
  const outPath = path.join(FIXTURES_DIR, filename);
  await sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
    .png()
    .toFile(outPath);
  return { path: outPath, width, height, format: "png", description: `Solid RGB(${r},${g},${b}) ${width}×${height}` };
}

/** Generate a solid PNG with alpha transparency */
export async function generateTransparentPNG(
  filename: string,
  r: number, g: number, b: number, alpha: number,
  width = 200, height = 200
): Promise<Fixture> {
  ensureDir();
  const outPath = path.join(FIXTURES_DIR, filename);

  // Create solid color, then composite with alpha mask
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4]     = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = alpha; // 0=transparent, 255=opaque
  }

  await sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(outPath);

  return { path: outPath, width, height, format: "png", description: `Transparent RGBA(${r},${g},${b},${alpha}) ${width}×${height}` };
}

/** Generate a gradient PNG (more realistic image) */
export async function generateGradientPNG(
  filename: string,
  width = 300, height = 200
): Promise<Fixture> {
  ensureDir();
  const outPath = path.join(FIXTURES_DIR, filename);

  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      pixels[idx]     = Math.round((x / width) * 255);       // R: 0→255 left→right
      pixels[idx + 1] = Math.round((y / height) * 255);      // G: 0→255 top→bottom
      pixels[idx + 2] = Math.round(128 - (x / width) * 128); // B: diminishing
    }
  }

  await sharp(pixels, {
    raw: { width, height, channels },
  })
    .png()
    .toFile(outPath);

  return { path: outPath, width, height, format: "png", description: `Gradient ${width}×${height}` };
}

/** Generate a JPEG fixture */
export async function generateJPEG(filename: string, r: number, g: number, b: number): Promise<Fixture> {
  ensureDir();
  const outPath = path.join(FIXTURES_DIR, filename);
  const width = 150, height = 100;
  await sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
    .jpeg({ quality: 90 })
    .toFile(outPath);
  return { path: outPath, width, height, format: "jpeg", description: `JPEG ${r},${g},${b}` };
}

/** Generate a TIFF fixture */
export async function generateTIFF(filename: string): Promise<Fixture> {
  ensureDir();
  const outPath = path.join(FIXTURES_DIR, filename);
  const width = 200, height = 150;
  await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .tiff()
    .toFile(outPath);
  return { path: outPath, width, height, format: "tiff", description: `TIFF ${width}×${height}` };
}

/** Cleanup all fixture files */
export function cleanupFixtures() {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true });
  }
}

/** Pre-generate all standard fixtures for the test suite */
export async function generateAllFixtures() {
  return {
    // Pure primaries — deterministic CMYK separation
    pureRed:   await generateSolidPNG("pure_red.png",   255, 0,   0),   // M+Y ink
    pureGreen: await generateSolidPNG("pure_green.png", 0,   255, 0),   // C+Y ink
    pureBlue:  await generateSolidPNG("pure_blue.png",  0,   0,   255), // C+M ink
    pureCyan:  await generateSolidPNG("pure_cyan.png",  0,   255, 255), // C ink dominant
    pureBlack: await generateSolidPNG("pure_black.png", 0,   0,   0),   // K ink only
    pureWhite: await generateSolidPNG("pure_white.png", 255, 255, 255), // no CMYK, W channel
    // Alpha
    halfAlpha: await generateTransparentPNG("half_alpha.png", 255, 0, 0, 128), // 50% alpha coverage
    fullyTransparent: await generateTransparentPNG("transparent.png", 0, 0, 0, 0), // 0% coverage
    // Realistic
    gradient:  await generateGradientPNG("gradient.png"),
    jpeg:      await generateJPEG("test.jpg", 150, 80, 200),
    tiff:      await generateTIFF("test.tif"),
    // Small / edge cases
    tiny:      await generateSolidPNG("tiny.png", 128, 64, 200, 1, 1),   // 1×1 pixel
    large:     await generateSolidPNG("large.png", 200, 150, 100, 600, 400), // 600×400
  };
}
