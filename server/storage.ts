/**
 * storage.ts — Manhattan RIP X database layer
 * Uses sql.js (pure JavaScript/WASM SQLite) — zero native .node files.
 * Works on any Electron ABI, any platform, forever.
 */

import * as fs from "fs";
import * as path from "path";
import { drizzle } from "drizzle-orm/sql-js";
import type { Database as SqlJsDatabase } from "sql.js";
import {
  devices, queues, jobs, printModes, iccProfiles, settings, license,
} from "@shared/schema";
import type {
  Device, InsertDevice,
  Queue, InsertQueue,
  Job, InsertJob,
  PrintMode, InsertPrintMode,
  IccProfile, InsertIccProfile,
  Setting, InsertSetting,
  License, InsertLicense,
} from "@shared/schema";
import { eq } from "drizzle-orm";

// ── Runtime paths ────────────────────────────────────────────────────────────
const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data.db");

function findWasm(): Buffer | undefined {
  const candidates = [
    // Explicit path set by Electron main.js via WASM_PATH env
    ...(process.env.WASM_PATH ? [process.env.WASM_PATH] : []),
    // Next to the bundled index.cjs (dist/sql-wasm.wasm) — production build
    path.join(__dirname, "sql-wasm.wasm"),
    // node_modules relative to script location — dev mode
    path.join(__dirname, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(__dirname, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    // Electron resources paths (asar.unpacked)
    ...(process.resourcesPath ? [
      path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      path.join(process.resourcesPath, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      path.join(process.resourcesPath, "sql-wasm.wasm"),
    ] : []),
    // Relative to cwd
    path.join(process.cwd(), "sql-wasm.wasm"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        console.log("[MRX storage] sql-wasm.wasm found at:", c);
        return fs.readFileSync(c);
      }
    } catch {}
  }
  // Last resort: resolve from require
  try {
    const sqlJsMain = require.resolve("sql.js");
    const wasmAuto = path.join(path.dirname(sqlJsMain), "sql-wasm.wasm");
    if (fs.existsSync(wasmAuto)) {
      console.log("[MRX storage] sql-wasm.wasm resolved via require:", wasmAuto);
      return fs.readFileSync(wasmAuto);
    }
  } catch {}
  console.warn("[MRX storage] sql-wasm.wasm not found in any candidate path — sql.js will try to fetch it");
  return undefined;
}

// ── Module-level state ───────────────────────────────────────────────────────
let _sqlJsDb: SqlJsDatabase;
let _db: ReturnType<typeof drizzle>;

function persistDb(): void {
  try {
    const data = _sqlJsDb.export();
    const buf = Buffer.from(data);
    const dir = path.dirname(dbPath);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dbPath, buf);
  } catch (e) {
    console.error("[MRX storage] persist failed:", e);
  }
}

// ── Async init (called once from server/index.ts before routes are registered) ─
export async function initStorage(): Promise<void> {
  const initSqlJs = require("sql.js") as (cfg?: object) => Promise<any>;
  const wasmBinary = findWasm();
  const SQL = await initSqlJs(wasmBinary ? { wasmBinary } : {});

  // Load existing DB file or start fresh
  let sqliteBuffer: Buffer | undefined;
  if (fs.existsSync(dbPath)) {
    sqliteBuffer = fs.readFileSync(dbPath);
  }
  _sqlJsDb = sqliteBuffer ? new SQL.Database(sqliteBuffer) : new SQL.Database();
  _db = drizzle(_sqlJsDb);

  // ── DDL ─────────────────────────────────────────────────────────────────
  _sqlJsDb.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'Epson ET-8550 DTF',
      driver TEXT NOT NULL DEFAULT 'ET8550-DTF-v2.1',
      status TEXT NOT NULL DEFAULT 'online',
      connection TEXT NOT NULL DEFAULT 'USB',
      ip_address TEXT,
      paper_width REAL NOT NULL DEFAULT 13.0,
      ink_channels TEXT NOT NULL DEFAULT '["C","M","Y","K","W"]',
      port TEXT NOT NULL DEFAULT 'USB001'
    )
  `);
  _sqlJsDb.run(`
    CREATE TABLE IF NOT EXISTS print_modes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      resolution INTEGER NOT NULL DEFAULT 600,
      color_profile TEXT NOT NULL DEFAULT 'sRGB IEC61966-2.1',
      rendering_intent TEXT NOT NULL DEFAULT 'Perceptual',
      white_opacity INTEGER NOT NULL DEFAULT 90,
      white_choke INTEGER NOT NULL DEFAULT 3,
      cmyk_density INTEGER NOT NULL DEFAULT 100,
      print_order TEXT NOT NULL DEFAULT 'W_CMYK',
      pass_count INTEGER NOT NULL DEFAULT 4,
      media_type TEXT NOT NULL DEFAULT 'DTF Film',
      ink_removal INTEGER NOT NULL DEFAULT 0,
      ink_removal_hole_size INTEGER NOT NULL DEFAULT 10,
      is_default INTEGER NOT NULL DEFAULT 0
    )
  `);
  _sqlJsDb.run(`
    CREATE TABLE IF NOT EXISTS queues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      device_id INTEGER NOT NULL,
      print_mode_id INTEGER,
      status TEXT NOT NULL DEFAULT 'stopped',
      layout_mode TEXT NOT NULL DEFAULT 'order_page',
      auto_process INTEGER NOT NULL DEFAULT 0,
      gang_sheet INTEGER NOT NULL DEFAULT 0,
      sheet_width REAL NOT NULL DEFAULT 13.0,
      sheet_height REAL NOT NULL DEFAULT 19.0,
      substrate_color TEXT NOT NULL DEFAULT '#ffffff',
      job_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  _sqlJsDb.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'PNG',
      status TEXT NOT NULL DEFAULT 'pending',
      width REAL NOT NULL DEFAULT 10,
      height REAL NOT NULL DEFAULT 10,
      copies INTEGER NOT NULL DEFAULT 1,
      rotation INTEGER NOT NULL DEFAULT 0,
      scale_percent REAL NOT NULL DEFAULT 100,
      pos_x REAL NOT NULL DEFAULT 0,
      pos_y REAL NOT NULL DEFAULT 0,
      color_adjust_brightness INTEGER NOT NULL DEFAULT 0,
      color_adjust_contrast INTEGER NOT NULL DEFAULT 0,
      color_adjust_saturation INTEGER NOT NULL DEFAULT 0,
      white_opacity_override INTEGER,
      white_choke_override INTEGER,
      ink_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      rip_progress INTEGER NOT NULL DEFAULT 0,
      preview_data TEXT,
      file_path TEXT,
      file_size INTEGER,
      pixel_width INTEGER,
      pixel_height INTEGER,
      dpi INTEGER DEFAULT 300,
      has_cut_contour INTEGER NOT NULL DEFAULT 0,
      cut_contour_color TEXT
    )
  `);
  _sqlJsDb.run(`
    CREATE TABLE IF NOT EXISTS icc_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      device_id INTEGER,
      color_space TEXT NOT NULL DEFAULT 'RGB',
      description TEXT,
      is_built_in INTEGER NOT NULL DEFAULT 1
    )
  `);
  _sqlJsDb.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    )
  `);
  _sqlJsDb.run(`
    CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'trial',
      activated_at TEXT,
      expires_at TEXT,
      machine_id TEXT,
      plan TEXT NOT NULL DEFAULT 'trial',
      trial_jobs_used INTEGER NOT NULL DEFAULT 0,
      trial_jobs_limit INTEGER NOT NULL DEFAULT 25
    )
  `);

  // ── Schema migrations (idempotent) ─────────────────────────────────────
  const migrations = [
    `ALTER TABLE devices ADD COLUMN port TEXT NOT NULL DEFAULT 'USB001'`,
    `ALTER TABLE queues ADD COLUMN sheet_width REAL NOT NULL DEFAULT 22.0`,
    `ALTER TABLE queues ADD COLUMN sheet_height REAL NOT NULL DEFAULT 60.0`,
    `ALTER TABLE queues ADD COLUMN substrate_color TEXT NOT NULL DEFAULT '#ffffff'`,
    `ALTER TABLE jobs ADD COLUMN x_offset REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE jobs ADD COLUMN y_offset REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE jobs ADD COLUMN print_mode TEXT`,
    `ALTER TABLE jobs ADD COLUMN print_mode_id INTEGER`,
    `ALTER TABLE jobs ADD COLUMN mirror_h INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE jobs ADD COLUMN mirror_v INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE jobs ADD COLUMN crop_marks INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE jobs ADD COLUMN bleed REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE jobs ADD COLUMN tile_rows INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE jobs ADD COLUMN tile_cols INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE jobs ADD COLUMN tile_overlap REAL NOT NULL DEFAULT 0.125`,
    `ALTER TABLE jobs ADD COLUMN white_opacity_override INTEGER`,
    `ALTER TABLE jobs ADD COLUMN white_choke_override INTEGER`,
    `ALTER TABLE jobs ADD COLUMN ink_coverage TEXT`,
    `ALTER TABLE jobs ADD COLUMN notes TEXT`,
    `ALTER TABLE print_modes ADD COLUMN halftone_type TEXT NOT NULL DEFAULT 'stochastic'`,
    `ALTER TABLE print_modes ADD COLUMN halftone_lpi INTEGER NOT NULL DEFAULT 60`,
    `ALTER TABLE print_modes ADD COLUMN halftone_angle INTEGER NOT NULL DEFAULT 45`,
    `ALTER TABLE print_modes ADD COLUMN halftone_dot_shape TEXT NOT NULL DEFAULT 'round'`,
    `ALTER TABLE print_modes ADD COLUMN tac_limit INTEGER NOT NULL DEFAULT 320`,
    `ALTER TABLE print_modes ADD COLUMN ink_limit_c INTEGER NOT NULL DEFAULT 100`,
    `ALTER TABLE print_modes ADD COLUMN ink_limit_m INTEGER NOT NULL DEFAULT 100`,
    `ALTER TABLE print_modes ADD COLUMN ink_limit_y INTEGER NOT NULL DEFAULT 100`,
    `ALTER TABLE print_modes ADD COLUMN ink_limit_k INTEGER NOT NULL DEFAULT 100`,
    `ALTER TABLE print_modes ADD COLUMN ink_limit_w INTEGER NOT NULL DEFAULT 90`,
    `ALTER TABLE print_modes ADD COLUMN white_flood INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE print_modes ADD COLUMN white_detail INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE print_modes ADD COLUMN black_enhancement INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE print_modes ADD COLUMN color_boost INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE print_modes ADD COLUMN description TEXT`,
  ];
  for (const m of migrations) {
    try { _sqlJsDb.run(m); } catch {}
  }

  persistDb();

  // ── Seed default data (only if fresh DB) ───────────────────────────────
  const existing = _db.select().from(devices).all();
  if (existing.length === 0) {
    _seedData();
  }

  console.log("[MRX storage] sql.js DB ready at", dbPath);
}

function _seedData(): void {
  const dev = _db.insert(devices).values({
    name: "Epson ET-8550 DTF",
    model: "Epson EcoTank ET-8550 DTF",
    driver: "GDIPSRW",
    status: "online",
    connection: "USB",
    paperWidth: 13.0,
    inkChannels: '["C","M","Y","K","W"]',
  }).returning().get();

  const pm1 = _db.insert(printModes).values({
    deviceId: dev.id,
    name: "GDIPSRW — CMYW Forever Dark Transfer",
    resolution: 1440,
    colorProfile: "Photo 8Color 720 1pass",
    renderingIntent: "Perceptual",
    whiteOpacity: 92,
    whiteChoke: 3,
    cmykDensity: 100,
    printOrder: "W_CMYK",
    passCount: 8,
    mediaType: "DTF Film",
    inkRemoval: 0,
    inkRemovalHoleSize: 10,
    isDefault: true,
  }).returning().get();

  const pmBatch = [
    { name: "GDIPSRW — CMYW Forever Dark Transfer with Holes", resolution: 1440, colorProfile: "Photo 8Color 720 1pass", renderingIntent: "Perceptual", whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 8, mediaType: "DTF Film", inkRemoval: 1, inkRemovalHoleSize: 15, isDefault: false },
    { name: "GDIPSRW — CMYW Forever Dark Transfer with Stripes", resolution: 1440, colorProfile: "Photo 8Color 720 1pass", renderingIntent: "Perceptual", whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 8, mediaType: "DTF Film", inkRemoval: 1, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPSRW — Default", resolution: 720, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 88, whiteChoke: 2, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPSRW — CMYK", resolution: 720, colorProfile: "EuroscaleCoated", renderingIntent: "Relative Colorimetric", whiteOpacity: 85, whiteChoke: 2, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPSRW — RGB", resolution: 720, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPRT — Default", resolution: 720, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 85, whiteChoke: 2, cmykDensity: 95, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPRT — Cadlink RGB", resolution: 720, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPRT — 600x600 Halftone", resolution: 600, colorProfile: "sRGB", renderingIntent: "Saturation", whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 6, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPRT — sRGB", resolution: 720, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 88, whiteChoke: 2, cmykDensity: 98, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPOSTS — Default", resolution: 600, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 85, whiteChoke: 2, cmykDensity: 95, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPOSTS — CMYK", resolution: 600, colorProfile: "EuroscaleCoated", renderingIntent: "Relative Colorimetric", whiteOpacity: 85, whiteChoke: 2, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPOSTS — RGB", resolution: 600, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 88, whiteChoke: 2, cmykDensity: 98, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDISEPS — Default", resolution: 600, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 88, whiteChoke: 2, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDISEPS — CMYK", resolution: 600, colorProfile: "EuroscaleCoated", renderingIntent: "Relative Colorimetric", whiteOpacity: 85, whiteChoke: 2, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDISEPS — Color", resolution: 600, colorProfile: "sRGB", renderingIntent: "Saturation", whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "BMP — ColorWhite", resolution: 600, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 95, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "BMP — Color", resolution: 600, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "BMP — Alpha", resolution: 600, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 88, whiteChoke: 2, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "BMP — Gray", resolution: 600, colorProfile: "sRGB", renderingIntent: "Relative Colorimetric", whiteOpacity: 80, whiteChoke: 2, cmykDensity: 90, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "BMP — GrayInvert", resolution: 600, colorProfile: "sRGB", renderingIntent: "Relative Colorimetric", whiteOpacity: 80, whiteChoke: 2, cmykDensity: 90, printOrder: "CMYK_W", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "TIFFPREV — Default", resolution: 600, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 85, whiteChoke: 2, cmykDensity: 95, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "TIFFPREV — CMYK", resolution: 600, colorProfile: "EuroscaleCoated", renderingIntent: "Relative Colorimetric", whiteOpacity: 85, whiteChoke: 2, cmykDensity: 100, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "TIFFPREV — RGB", resolution: 600, colorProfile: "sRGB", renderingIntent: "Perceptual", whiteOpacity: 88, whiteChoke: 2, cmykDensity: 98, printOrder: "W_CMYK", passCount: 4, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
    { name: "GDIPSRW — Single Weight Matte Paper 1440×720 Best", resolution: 1440, colorProfile: "Photo 8Color 720 1pass", renderingIntent: "Perceptual", whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK", passCount: 8, mediaType: "Single Weight Matte Paper", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false },
  ];
  for (const pm of pmBatch) {
    _db.insert(printModes).values({ ...pm, deviceId: dev.id }).run();
  }

  const q1 = _db.insert(queues).values({
    name: "Production Queue",
    deviceId: dev.id,
    printModeId: pm1.id,
    status: "running",
    layoutMode: "order_nest",
    autoProcess: true,
    gangSheet: true,
    sheetWidth: 13.0,
    sheetHeight: 19.0,
    substrateColor: "#ffffff",
    jobCount: 0,
  }).returning().get();

  _db.insert(queues).values({
    name: "Proofing Queue",
    deviceId: dev.id,
    printModeId: pm1.id,
    status: "stopped",
    layoutMode: "order_page",
    autoProcess: false,
    gangSheet: false,
    sheetWidth: 13.0,
    sheetHeight: 19.0,
    substrateColor: "#000000",
    jobCount: 0,
  }).run();

  const profileData = [
    { name: "Photo 8Color 720 1pass",    colorSpace: "RGB",  description: "Epson 8-color photo 720dpi 1-pass output — DFv12 default DTF profile", isBuiltIn: true, deviceId: null },
    { name: "HexSSExFine600",            colorSpace: "RGB",  description: "Hex 6-color SuperSuperFine 600dpi output profile", isBuiltIn: true, deviceId: null },
    { name: "CADlink Unified RGB",        colorSpace: "RGB",  description: "CADlink Unified RGB — universal RGB working space for DTF output", isBuiltIn: true, deviceId: null },
    { name: "EuroscaleCoated",           colorSpace: "CMYK", description: "Euroscale Coated v2 — ISO 12647-2 coated press standard", isBuiltIn: true, deviceId: null },
    { name: "ISOcoated",                 colorSpace: "CMYK", description: "ISO Coated — European offset coated press standard", isBuiltIn: true, deviceId: null },
    { name: "PressOriginalCMYK",         colorSpace: "CMYK", description: "Press Original CMYK — standard press simulation source profile", isBuiltIn: true, deviceId: null },
    { name: "sRGB",                      colorSpace: "RGB",  description: "Standard sRGB IEC61966-2.1", isBuiltIn: true, deviceId: null },
    { name: "LinearGray",                colorSpace: "GRAY", description: "Linear Gray — linearized grayscale profile", isBuiltIn: true, deviceId: null },
    { name: "LAB-CMYK",                  colorSpace: "CMYK", description: "L*a*b* to CMYK ink mapping", isBuiltIn: true, deviceId: null },
    { name: "RGB-CMYK",                  colorSpace: "CMYK", description: "RGB to CMYK ink conversion", isBuiltIn: true, deviceId: null },
    { name: "SWOP-CMYK",                 colorSpace: "CMYK", description: "SWOP to CMYK ink separation", isBuiltIn: true, deviceId: null },
    { name: "CleanWhite",                colorSpace: "CMYK", description: "Device-Link: Clean White — reduces ink bleeding at white boundaries", isBuiltIn: true, deviceId: null },
    { name: "DL — sRGB → Epson ET8550 DTF",       colorSpace: "CMYK", description: "Device-Link: sRGB to Epson ET-8550 DTF ink mapping", isBuiltIn: true, deviceId: null },
    { name: "DL — AdobeRGB → Epson ET8550 DTF",   colorSpace: "CMYK", description: "Device-Link: AdobeRGB to Epson ET-8550 DTF ink mapping", isBuiltIn: true, deviceId: null },
    { name: "DL — CMYK → Epson ET8550 White",      colorSpace: "CMYK", description: "Device-Link: CMYK to white underbase for Epson ET-8550", isBuiltIn: true, deviceId: null },
    { name: "DL — Vivid Color Boost",               colorSpace: "CMYK", description: "Device-Link: vivid color saturation boost for DTF", isBuiltIn: true, deviceId: null },
    { name: "DL — Soft Proofing sRGB",              colorSpace: "RGB",  description: "Device-Link: soft proofing simulation from sRGB", isBuiltIn: true, deviceId: null },
    { name: "DL — Ink Reduction 80pc",              colorSpace: "CMYK", description: "Device-Link: total ink area coverage 80%", isBuiltIn: true, deviceId: null },
    { name: "DL — Ink Reduction 70pc",              colorSpace: "CMYK", description: "Device-Link: total ink area coverage 70%", isBuiltIn: true, deviceId: null },
    { name: "DL — Ink Reduction 60pc",              colorSpace: "CMYK", description: "Device-Link: total ink area coverage 60%", isBuiltIn: true, deviceId: null },
    { name: "DL — White Boost 10pc",                colorSpace: "CMYK", description: "Device-Link: white ink opacity +10%", isBuiltIn: true, deviceId: null },
    { name: "DL — White Boost 20pc",                colorSpace: "CMYK", description: "Device-Link: white ink opacity +20%", isBuiltIn: true, deviceId: null },
    { name: "DL — White Reduce 10pc",               colorSpace: "CMYK", description: "Device-Link: white ink opacity -10%", isBuiltIn: true, deviceId: null },
    { name: "DL — GCR Medium",                     colorSpace: "CMYK", description: "Device-Link: medium gray component replacement", isBuiltIn: true, deviceId: null },
    { name: "DL — GCR Heavy",                      colorSpace: "CMYK", description: "Device-Link: heavy gray component replacement", isBuiltIn: true, deviceId: null },
    { name: "CMYK 60pc max",             colorSpace: "CMYK", description: "Device-Link: CMYK max ink limit 60%", isBuiltIn: true, deviceId: null },
    { name: "CMYK 65pc max",             colorSpace: "CMYK", description: "Device-Link: CMYK max ink limit 65%", isBuiltIn: true, deviceId: null },
    { name: "CMYK 70pc max",             colorSpace: "CMYK", description: "Device-Link: CMYK max ink limit 70%", isBuiltIn: true, deviceId: null },
    { name: "CMYK 75pc max",             colorSpace: "CMYK", description: "Device-Link: CMYK max ink limit 75%", isBuiltIn: true, deviceId: null },
    { name: "CMYK 80pc max",             colorSpace: "CMYK", description: "Device-Link: CMYK max ink limit 80%", isBuiltIn: true, deviceId: null },
    { name: "CMYK 85pc max",             colorSpace: "CMYK", description: "Device-Link: CMYK max ink limit 85%", isBuiltIn: true, deviceId: null },
    { name: "CMYK 90pc max",             colorSpace: "CMYK", description: "Device-Link: CMYK max ink limit 90%", isBuiltIn: true, deviceId: null },
    { name: "CMYK 95pc max",             colorSpace: "CMYK", description: "Device-Link: CMYK max ink limit 95%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 50pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 50%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 55pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 55%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 60pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 60%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 65pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 65%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 70pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 70%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 75pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 75%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 80pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 80%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 85pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 85%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 90pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 90%", isBuiltIn: true, deviceId: null },
    { name: "MaxInk 95pc",               colorSpace: "CMYK", description: "Device-Link: MaxInk reduction 95%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 10pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 10%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 20pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 20%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 30pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 30%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 40pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 40%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 50pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 50%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 60pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 60%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 70pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 70%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 80pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 80%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 90pc",             colorSpace: "RGB",  description: "Device-Link: Contrast boost 90%", isBuiltIn: true, deviceId: null },
    { name: "Contrast 100pc",            colorSpace: "RGB",  description: "Device-Link: Contrast boost 100%", isBuiltIn: true, deviceId: null },
    { name: "Lighter 10pc",              colorSpace: "RGB",  description: "Device-Link: Image lightening 10%", isBuiltIn: true, deviceId: null },
    { name: "Lighter 20pc",              colorSpace: "RGB",  description: "Device-Link: Image lightening 20%", isBuiltIn: true, deviceId: null },
    { name: "Lighter 30pc",              colorSpace: "RGB",  description: "Device-Link: Image lightening 30%", isBuiltIn: true, deviceId: null },
    { name: "Lighter 40pc",              colorSpace: "RGB",  description: "Device-Link: Image lightening 40%", isBuiltIn: true, deviceId: null },
    { name: "Lighter 50%",               colorSpace: "RGB",  description: "Device-Link: Image lightening 50%", isBuiltIn: true, deviceId: null },
    { name: "Lighter 60pc",              colorSpace: "RGB",  description: "Device-Link: Image lightening 60%", isBuiltIn: true, deviceId: null },
    { name: "Lighter 70pc",              colorSpace: "RGB",  description: "Device-Link: Image lightening 70%", isBuiltIn: true, deviceId: null },
    { name: "Lighter 80pc",              colorSpace: "RGB",  description: "Device-Link: Image lightening 80%", isBuiltIn: true, deviceId: null },
    { name: "Darker 10pc",               colorSpace: "RGB",  description: "Device-Link: Image darkening 10%", isBuiltIn: true, deviceId: null },
    { name: "Darker 20pc",               colorSpace: "RGB",  description: "Device-Link: Image darkening 20%", isBuiltIn: true, deviceId: null },
    { name: "Darker 30pc",               colorSpace: "RGB",  description: "Device-Link: Image darkening 30%", isBuiltIn: true, deviceId: null },
    { name: "Darker 40pc",               colorSpace: "RGB",  description: "Device-Link: Image darkening 40%", isBuiltIn: true, deviceId: null },
    { name: "Darker 50pc",               colorSpace: "RGB",  description: "Device-Link: Image darkening 50%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 5pc",            colorSpace: "RGB",  description: "Device-Link: Saturation boost 5%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 10pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 10%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 15pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 15%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 20pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 20%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 25pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 25%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 30pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 30%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 35pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 35%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 40pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 40%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 45pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 45%", isBuiltIn: true, deviceId: null },
    { name: "Saturation 50pc",           colorSpace: "RGB",  description: "Device-Link: Saturation boost 50%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 5pc",  colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 5%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 10pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 10%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 15pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 15%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 20pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 20%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 25pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 25%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 30pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 30%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 35pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 35%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 40pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 40%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 45pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 45%", isBuiltIn: true, deviceId: null },
    { name: "Linear Ink Reduction 50pc", colorSpace: "CMYK", description: "Device-Link: Linear ink reduction 50%", isBuiltIn: true, deviceId: null },
    ...Array.from({ length: 20 }, (_, i) => ({ name: `ECA — B-${20 - i}`, colorSpace: "RGB", description: `EasyColorAdj Brightness -${20 - i}`, isBuiltIn: true, deviceId: null })),
    ...Array.from({ length: 20 }, (_, i) => ({ name: `ECA — B${i + 1}`,  colorSpace: "RGB", description: `EasyColorAdj Brightness +${i + 1}`, isBuiltIn: true, deviceId: null })),
    ...Array.from({ length: 20 }, (_, i) => ({ name: `ECA — S${i + 1}`,  colorSpace: "RGB", description: `EasyColorAdj Saturation S${i + 1}`, isBuiltIn: true, deviceId: null })),
    ...Array.from({ length: 30 }, (_, i) => ({ name: `ECA — M${100 + i * 10}`, colorSpace: "CMYK", description: `EasyColorAdj MaxInk M${100 + i * 10}`, isBuiltIn: true, deviceId: null })),
    { name: "ET8550-DTF-Standard",       colorSpace: "RGB",  description: "Epson ET-8550 DTF standard output profile", isBuiltIn: true, deviceId: dev.id },
    { name: "ET8550-DTF-HQ",             colorSpace: "RGB",  description: "Epson ET-8550 DTF high quality 1440dpi profile", isBuiltIn: true, deviceId: dev.id },
  ];
  for (const p of profileData) {
    _db.insert(iccProfiles).values(p as any).run();
  }

  const sampleJobs = [
    { queueId: q1.id, name: "ManhattanViral_Logo.png", fileName: "ManhattanViral_Logo.png", fileType: "PNG", status: "done",     width: 8,  height: 6,  copies: 3, rotation: 0,  scalePercent: 100, posX: 0.5, posY: 0.5, inkCost: 0.18, createdAt: new Date(Date.now() - 3600000).toISOString(), ripProgress: 100, previewData: "#1a1a2e", colorAdjustBrightness: 0, colorAdjustContrast: 0, colorAdjustSaturation: 0, whiteOpacityOverride: null, whiteChokeOverride: null },
    { queueId: q1.id, name: "StreetWear_Design_v2.png", fileName: "StreetWear_Design_v2.png", fileType: "PNG", status: "printing", width: 10, height: 12, copies: 1, rotation: 0,  scalePercent: 100, posX: 0.5, posY: 7,   inkCost: 0.42, createdAt: new Date(Date.now() - 1800000).toISOString(), ripProgress: 65,  previewData: "#e63946", colorAdjustBrightness: 5, colorAdjustContrast: 0, colorAdjustSaturation: 10, whiteOpacityOverride: 95, whiteChokeOverride: null },
    { queueId: q1.id, name: "BoroughDrops_Graphic.png", fileName: "BoroughDrops_Graphic.png", fileType: "PNG", status: "pending",  width: 6,  height: 6,  copies: 5, rotation: 90, scalePercent: 85,  posX: 0.5, posY: 0.5, inkCost: 0.22, createdAt: new Date(Date.now() - 900000).toISOString(),  ripProgress: 0,   previewData: "#457b9d", colorAdjustBrightness: 0, colorAdjustContrast: 5, colorAdjustSaturation: 0, whiteOpacityOverride: null, whiteChokeOverride: 4 },
    { queueId: q1.id, name: "NYC_Graffiti_Art.png",     fileName: "NYC_Graffiti_Art.png",     fileType: "PNG", status: "hold",     width: 12, height: 8,  copies: 2, rotation: 0,  scalePercent: 100, posX: 0.5, posY: 0.5, inkCost: 0.31, createdAt: new Date(Date.now() - 600000).toISOString(),  ripProgress: 0,   previewData: "#2d6a4f", colorAdjustBrightness: -5, colorAdjustContrast: 10, colorAdjustSaturation: 15, whiteOpacityOverride: null, whiteChokeOverride: null },
  ];
  for (const j of sampleJobs) _db.insert(jobs).values(j as any).run();
  _db.update(queues).set({ jobCount: sampleJobs.length }).where(eq(queues.id, q1.id)).run();

  const defaultSettings = [
    { key: "units",             value: "inches" },
    { key: "language",          value: "en" },
    { key: "defaultPrintMode",  value: "GDIPSRW" },
    { key: "inkCostCyan",       value: "0.08" },
    { key: "inkCostMagenta",    value: "0.08" },
    { key: "inkCostYellow",     value: "0.07" },
    { key: "inkCostBlack",      value: "0.06" },
    { key: "inkCostWhite",      value: "0.10" },
    { key: "autoRip",           value: "true" },
    { key: "autoPrint",         value: "false" },
    { key: "defaultDpi",        value: "300" },
    { key: "colorMode",         value: "dark" },
    { key: "showInkCost",       value: "true" },
    { key: "printerName",       value: "EPSON ET-8550 Series" },
  ];
  for (const s of defaultSettings) {
    _db.insert(settings).values({ key: s.key, value: s.value, updatedAt: new Date().toISOString() }).run();
  }

  // Personal unlocked license
  _db.insert(license).values({
    licenseKey: "MRXE-PERSONAL-UNLOCKED-2026",
    email: "gomezfrankg@gmail.com",
    status: "active",
    plan: "enterprise",
    activatedAt: new Date().toISOString(),
    expiresAt: null,
    trialJobsUsed: 0,
    trialJobsLimit: 999999,
  }).run();

  persistDb();
}

// ── IStorage interface & implementation ─────────────────────────────────────
export interface IStorage {
  getDevices(): Device[];
  getDevice(id: number): Device | undefined;
  createDevice(d: InsertDevice): Device;
  updateDevice(id: number, d: Partial<InsertDevice>): Device | undefined;
  getPrintModes(deviceId?: number): PrintMode[];
  getPrintMode(id: number): PrintMode | undefined;
  createPrintMode(pm: InsertPrintMode): PrintMode;
  updatePrintMode(id: number, pm: Partial<InsertPrintMode>): PrintMode | undefined;
  deletePrintMode(id: number): void;
  getQueues(): Queue[];
  getQueue(id: number): Queue | undefined;
  createQueue(q: InsertQueue): Queue;
  updateQueue(id: number, q: Partial<InsertQueue>): Queue | undefined;
  deleteQueue(id: number): void;
  getJobs(queueId: number): Job[];
  getJob(id: number): Job | undefined;
  createJob(j: InsertJob): Job;
  updateJob(id: number, j: Partial<InsertJob>): Job | undefined;
  deleteJob(id: number): void;
  getIccProfiles(): IccProfile[];
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  getAllSettings(): Record<string, string>;
  getLicense(): License | null;
  setLicense(data: Partial<InsertLicense>): License;
  incrementTrialJobs(): number;
}

class DatabaseStorage implements IStorage {
  getDevices() { return _db.select().from(devices).all(); }
  getDevice(id: number) { return _db.select().from(devices).where(eq(devices.id, id)).get(); }
  createDevice(d: InsertDevice) {
    const r = _db.insert(devices).values(d).returning().get();
    persistDb(); return r;
  }
  updateDevice(id: number, d: Partial<InsertDevice>) {
    const r = _db.update(devices).set(d).where(eq(devices.id, id)).returning().get();
    persistDb(); return r;
  }

  getPrintModes(deviceId?: number) {
    if (deviceId) return _db.select().from(printModes).where(eq(printModes.deviceId, deviceId)).all();
    return _db.select().from(printModes).all();
  }
  getPrintMode(id: number) { return _db.select().from(printModes).where(eq(printModes.id, id)).get(); }
  createPrintMode(pm: InsertPrintMode) {
    const r = _db.insert(printModes).values(pm).returning().get();
    persistDb(); return r;
  }
  updatePrintMode(id: number, pm: Partial<InsertPrintMode>) {
    const r = _db.update(printModes).set(pm).where(eq(printModes.id, id)).returning().get();
    persistDb(); return r;
  }
  deletePrintMode(id: number) { _db.delete(printModes).where(eq(printModes.id, id)).run(); persistDb(); }

  getQueues() { return _db.select().from(queues).all(); }
  getQueue(id: number) { return _db.select().from(queues).where(eq(queues.id, id)).get(); }
  createQueue(q: InsertQueue) {
    const r = _db.insert(queues).values(q).returning().get();
    persistDb(); return r;
  }
  updateQueue(id: number, q: Partial<InsertQueue>) {
    const r = _db.update(queues).set(q).where(eq(queues.id, id)).returning().get();
    persistDb(); return r;
  }
  deleteQueue(id: number) { _db.delete(queues).where(eq(queues.id, id)).run(); persistDb(); }

  getJobs(queueId: number) { return _db.select().from(jobs).where(eq(jobs.queueId, queueId)).all(); }
  getJob(id: number) { return _db.select().from(jobs).where(eq(jobs.id, id)).get(); }
  createJob(j: InsertJob) {
    const job = _db.insert(jobs).values({ ...j, createdAt: new Date().toISOString() }).returning().get();
    const count = _db.select().from(jobs).where(eq(jobs.queueId, j.queueId)).all().length;
    _db.update(queues).set({ jobCount: count }).where(eq(queues.id, j.queueId)).run();
    persistDb(); return job;
  }
  updateJob(id: number, j: Partial<InsertJob>) {
    const r = _db.update(jobs).set(j).where(eq(jobs.id, id)).returning().get();
    persistDb(); return r;
  }
  deleteJob(id: number) {
    const job = this.getJob(id);
    _db.delete(jobs).where(eq(jobs.id, id)).run();
    if (job) {
      const remaining = _db.select().from(jobs).where(eq(jobs.queueId, job.queueId)).all().length;
      _db.update(queues).set({ jobCount: remaining }).where(eq(queues.id, job.queueId)).run();
    }
    persistDb();
  }

  getIccProfiles() { return _db.select().from(iccProfiles).all(); }

  getSetting(key: string): string | null {
    const row = _db.select().from(settings).where(eq(settings.key, key)).get();
    return row ? row.value : null;
  }
  setSetting(key: string, value: string): void {
    const existing = _db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      _db.update(settings).set({ value, updatedAt: new Date().toISOString() }).where(eq(settings.key, key)).run();
    } else {
      _db.insert(settings).values({ key, value, updatedAt: new Date().toISOString() }).run();
    }
    persistDb();
  }
  getAllSettings(): Record<string, string> {
    const rows = _db.select().from(settings).all();
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  getLicense(): License | null { return _db.select().from(license).get() || null; }
  setLicense(data: Partial<InsertLicense>): License {
    const existing = _db.select().from(license).get();
    let r: License;
    if (existing) {
      r = _db.update(license).set(data).where(eq(license.id, existing.id)).returning().get();
    } else {
      r = _db.insert(license).values(data as InsertLicense).returning().get();
    }
    persistDb(); return r;
  }
  incrementTrialJobs(): number {
    const lic = _db.select().from(license).get();
    if (!lic) return 0;
    const newCount = (lic.trialJobsUsed || 0) + 1;
    _db.update(license).set({ trialJobsUsed: newCount }).where(eq(license.id, lic.id)).run();
    persistDb(); return newCount;
  }
}

export const storage = new DatabaseStorage();
