import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Devices ─────────────────────────────────────────────────────────────────
export const devices = sqliteTable("devices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  model: text("model").notNull().default("Epson ET-8550 DTF"),
  driver: text("driver").notNull().default("ET8550-DTF-v2.1"),
  status: text("status").notNull().default("online"),
  connection: text("connection").notNull().default("USB"),
  ipAddress: text("ip_address"),
  paperWidth: real("paper_width").notNull().default(13.0),
  inkChannels: text("ink_channels").notNull().default('["C","M","Y","K","W"]'),
  port: text("port").notNull().default("USB001"),
});
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devices.$inferSelect;

// ─── Print Modes ──────────────────────────────────────────────────────────────
export const printModes = sqliteTable("print_modes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  resolution: integer("resolution").notNull().default(600),
  colorProfile: text("color_profile").notNull().default("sRGB IEC61966-2.1"),
  renderingIntent: text("rendering_intent").notNull().default("Perceptual"),
  whiteOpacity: integer("white_opacity").notNull().default(90),
  whiteChoke: integer("white_choke").notNull().default(3),
  cmykDensity: integer("cmyk_density").notNull().default(100),
  printOrder: text("print_order").notNull().default("W_CMYK"),
  passCount: integer("pass_count").notNull().default(4),
  mediaType: text("media_type").notNull().default("DTF Film"),
  inkRemoval: integer("ink_removal").notNull().default(0),
  inkRemovalHoleSize: integer("ink_removal_hole_size").notNull().default(10),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});
export const insertPrintModeSchema = createInsertSchema(printModes).omit({ id: true });
export type InsertPrintMode = z.infer<typeof insertPrintModeSchema>;
export type PrintMode = typeof printModes.$inferSelect;

// ─── Queues ───────────────────────────────────────────────────────────────────
export const queues = sqliteTable("queues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  deviceId: integer("device_id").notNull(),
  printModeId: integer("print_mode_id"),
  status: text("status").notNull().default("stopped"),
  layoutMode: text("layout_mode").notNull().default("order_page"),
  autoProcess: integer("auto_process", { mode: "boolean" }).notNull().default(false),
  gangSheet: integer("gang_sheet", { mode: "boolean" }).notNull().default(false),
  sheetWidth: real("sheet_width").notNull().default(13.0),
  sheetHeight: real("sheet_height").notNull().default(19.0),
  substrateColor: text("substrate_color").notNull().default("#ffffff"),
  jobCount: integer("job_count").notNull().default(0),
});
export const insertQueueSchema = createInsertSchema(queues).omit({ id: true });
export type InsertQueue = z.infer<typeof insertQueueSchema>;
export type Queue = typeof queues.$inferSelect;

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  queueId: integer("queue_id").notNull(),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull().default("PNG"),
  status: text("status").notNull().default("pending"),
  width: real("width").notNull().default(10),
  height: real("height").notNull().default(10),
  copies: integer("copies").notNull().default(1),
  rotation: integer("rotation").notNull().default(0),
  scalePercent: real("scale_percent").notNull().default(100),
  posX: real("pos_x").notNull().default(0),
  posY: real("pos_y").notNull().default(0),
  colorAdjustBrightness: integer("color_adjust_brightness").notNull().default(0),
  colorAdjustContrast: integer("color_adjust_contrast").notNull().default(0),
  colorAdjustSaturation: integer("color_adjust_saturation").notNull().default(0),
  whiteOpacityOverride: integer("white_opacity_override"),
  whiteChokeOverride: integer("white_choke_override"),
  inkCost: real("ink_cost").notNull().default(0),
  createdAt: text("created_at").notNull().default(""),
  ripProgress: integer("rip_progress").notNull().default(0),
  previewData: text("preview_data"),          // base64 data URL for real preview
  filePath: text("file_path"),                // server-side path to uploaded file
  fileSize: integer("file_size"),             // bytes
  pixelWidth: integer("pixel_width"),         // original px width
  pixelHeight: integer("pixel_height"),       // original px height
  dpi: integer("dpi").default(300),
  // Cut contour
  hasCutContour: integer("has_cut_contour", { mode: "boolean" }).notNull().default(false),
  cutContourColor: text("cut_contour_color"),
  printMode: text("print_mode"),
  xOffset: real("x_offset").notNull().default(0),
  yOffset: real("y_offset").notNull().default(0),
});
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// ─── ICC Profiles ─────────────────────────────────────────────────────────────
export const iccProfiles = sqliteTable("icc_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  deviceId: integer("device_id"),
  colorSpace: text("color_space").notNull().default("RGB"),
  description: text("description"),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(true),
});
export const insertIccProfileSchema = createInsertSchema(iccProfiles).omit({ id: true });
export type InsertIccProfile = z.infer<typeof insertIccProfileSchema>;
export type IccProfile = typeof iccProfiles.$inferSelect;

// ─── Settings ────────────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(""),
});
export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// ─── License ────────────────────────────────────────────────────────────────
export const license = sqliteTable("license", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  licenseKey: text("license_key"),
  email: text("email"),
  status: text("status").notNull().default("unlicensed"), // unlicensed | active | expired | trial
  activatedAt: text("activated_at"),
  expiresAt: text("expires_at"),
  machineId: text("machine_id"),
  plan: text("plan").notNull().default("trial"), // trial | pro | enterprise
  trialJobsUsed: integer("trial_jobs_used").notNull().default(0),
  trialJobsLimit: integer("trial_jobs_limit").notNull().default(25),
});
export const insertLicenseSchema = createInsertSchema(license).omit({ id: true });
export type InsertLicense = z.infer<typeof insertLicenseSchema>;
export type License = typeof license.$inferSelect;
