/**
 * Manhattan RIP X — Printer Driver Profiles
 *
 * Comprehensive printer profile database combining:
 *   - BlackBox RIP supported printer families (bbrip.com)
 *   - Epson native driver parameters for each model
 *   - DTF-optimized print mode defaults
 *   - ICC profile suggestions per model
 *
 * Epson models supported:
 *   A3+: L18050, L8180, ET-8550, SC-P700, L1800, 1390, 1410
 *   A4:  L8050, L8160, ET-8500, SC-P900, L805, L800
 */

export interface PrinterProfile {
  id: string;
  brand: "Epson";
  model: string;
  family: string;                    // e.g. "L18050 / L8050"
  format: "A3+" | "A3" | "A4" | "A2";
  maxWidthMM: number;
  maxHeightMM: number;
  maxWidthIn: number;
  maxHeightIn: number;
  inkChannels: InkChannel[];
  defaultInkOrder: string[];         // channel names in physical print order
  dtfWhiteChannel: string;           // which channel carries white ink
  supportedResolutions: Resolution[];
  defaultResolution: Resolution;
  rollSupport: boolean;
  maxRollLengthMM: number;
  usbSupport: boolean;
  networkSupport: boolean;
  driverType: "ESC/P2" | "ESC/POS" | "Epson Inkjet";
  ippUri?: string;                   // IPP URI template
  dtfDefaults: DTFDefaults;
  blackboxRipSupported: boolean;
  notes: string;
}

export interface InkChannel {
  name: string;
  color: string;                     // hex
  slot: number;                      // physical slot 0-indexed
  isDTFWhite?: boolean;
}

export interface Resolution {
  dpiX: number;
  dpiY: number;
  label: string;
  passCount: number;
}

export interface DTFDefaults {
  whiteOpacity: number;              // 0–100
  whiteUnderBlack: number;           // 0–100
  whiteChokePx: number;
  maxInkLimit: number;               // total area coverage %
  colorBoostMode: "photo" | "graphic";
  feedMode: "sheet" | "roll";
  bidirectional: boolean;
  mediaType: string;
  paperThicknessMM: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Printer Profile Database
// ─────────────────────────────────────────────────────────────────────────────

export const PRINTER_PROFILES: PrinterProfile[] = [

  // ── EPSON ET-8550 (A3+) — Primary target for Manhattan RIP X ─────────────
  {
    id: "epson_et8550",
    brand: "Epson",
    model: "ET-8550",
    family: "ET-8550 / ET-8500",
    format: "A3+",
    maxWidthMM: 329,
    maxHeightMM: 1200,   // roll
    maxWidthIn: 12.95,
    maxHeightIn: 47.24,
    inkChannels: [
      { name: "Photo Black", color: "#111111", slot: 0 },
      { name: "Cyan",        color: "#00aeef", slot: 1 },
      { name: "Magenta",     color: "#ec008c", slot: 2 },
      { name: "Yellow",      color: "#fff200", slot: 3 },
      { name: "Photo Cyan",  color: "#7dd3ef", slot: 4 },
      { name: "Photo Magenta", color: "#f49ac2", slot: 5 },
      { name: "White",       color: "#ffffff", slot: 6, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "Photo Cyan", "Photo Magenta", "Photo Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 360,  label: "720×360 (Draft)",    passCount: 4  },
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)", passCount: 8  },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8  },
      { dpiX: 1440, dpiY: 1440, label: "1440×1440 (Max)",    passCount: 16 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 1200,
    usbSupport: true,
    networkSupport: true,
    driverType: "Epson Inkjet",
    ippUri: "ipp://{{host}}/ipp/print",
    dtfDefaults: {
      whiteOpacity: 80,
      whiteUnderBlack: 90,
      whiteChokePx: 1,
      maxInkLimit: 280,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "Primary Manhattan RIP X target. Supports DTF sheet and roll. White channel slot 6. Use V2 driver for Cyan variant builds.",
  },

  // ── EPSON ET-8500 (A4) ────────────────────────────────────────────────────
  {
    id: "epson_et8500",
    brand: "Epson",
    model: "ET-8500",
    family: "ET-8550 / ET-8500",
    format: "A4",
    maxWidthMM: 216,
    maxHeightMM: 600,
    maxWidthIn: 8.5,
    maxHeightIn: 23.6,
    inkChannels: [
      { name: "Photo Black", color: "#111111", slot: 0 },
      { name: "Cyan",        color: "#00aeef", slot: 1 },
      { name: "Magenta",     color: "#ec008c", slot: 2 },
      { name: "Yellow",      color: "#fff200", slot: 3 },
      { name: "Photo Cyan",  color: "#7dd3ef", slot: 4 },
      { name: "Photo Magenta", color: "#f49ac2", slot: 5 },
      { name: "White",       color: "#ffffff", slot: 6, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "Photo Cyan", "Photo Magenta", "Photo Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 360,  label: "720×360 (Draft)",    passCount: 4 },
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)", passCount: 8 },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 600,
    usbSupport: true,
    networkSupport: true,
    driverType: "Epson Inkjet",
    ippUri: "ipp://{{host}}/ipp/print",
    dtfDefaults: {
      whiteOpacity: 80,
      whiteUnderBlack: 90,
      whiteChokePx: 1,
      maxInkLimit: 270,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "A4 sibling of ET-8550. Same ink configuration, smaller format.",
  },

  // ── EPSON L18050 (A3+) ────────────────────────────────────────────────────
  {
    id: "epson_l18050",
    brand: "Epson",
    model: "L18050",
    family: "L18050 / L8050",
    format: "A3+",
    maxWidthMM: 329,
    maxHeightMM: 1200,
    maxWidthIn: 12.95,
    maxHeightIn: 47.24,
    inkChannels: [
      { name: "Black",        color: "#111111", slot: 0 },
      { name: "Cyan",         color: "#00aeef", slot: 1 },
      { name: "Magenta",      color: "#ec008c", slot: 2 },
      { name: "Yellow",       color: "#fff200", slot: 3 },
      { name: "Light Cyan",   color: "#7dd3ef", slot: 4 },
      { name: "Light Magenta",color: "#f49ac2", slot: 5 },
      { name: "White",        color: "#ffffff", slot: 6, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "Light Cyan", "Light Magenta", "Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 360,  label: "720×360 (Draft)",    passCount: 4 },
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)", passCount: 8 },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8 },
      { dpiX: 1440, dpiY: 1440, label: "1440×1440 (Max)",    passCount: 16 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 1200,
    usbSupport: true,
    networkSupport: true,
    driverType: "Epson Inkjet",
    ippUri: "ipp://{{host}}/ipp/print",
    dtfDefaults: {
      whiteOpacity: 85,
      whiteUnderBlack: 90,
      whiteChokePx: 1,
      maxInkLimit: 290,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "Popular A3+ DTF printer. High-volume shop favorite.",
  },

  // ── EPSON L8050 (A4) ─────────────────────────────────────────────────────
  {
    id: "epson_l8050",
    brand: "Epson",
    model: "L8050",
    family: "L18050 / L8050",
    format: "A4",
    maxWidthMM: 216,
    maxHeightMM: 600,
    maxWidthIn: 8.5,
    maxHeightIn: 23.6,
    inkChannels: [
      { name: "Black",        color: "#111111", slot: 0 },
      { name: "Cyan",         color: "#00aeef", slot: 1 },
      { name: "Magenta",      color: "#ec008c", slot: 2 },
      { name: "Yellow",       color: "#fff200", slot: 3 },
      { name: "Light Cyan",   color: "#7dd3ef", slot: 4 },
      { name: "Light Magenta",color: "#f49ac2", slot: 5 },
      { name: "White",        color: "#ffffff", slot: 6, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "Light Cyan", "Light Magenta", "Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 360,  label: "720×360 (Draft)",    passCount: 4 },
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)", passCount: 8 },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 600,
    usbSupport: true,
    networkSupport: true,
    driverType: "Epson Inkjet",
    ippUri: "ipp://{{host}}/ipp/print",
    dtfDefaults: {
      whiteOpacity: 85,
      whiteUnderBlack: 90,
      whiteChokePx: 1,
      maxInkLimit: 280,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "A4 version of L18050.",
  },

  // ── EPSON L8180 (A3+) ────────────────────────────────────────────────────
  {
    id: "epson_l8180",
    brand: "Epson",
    model: "L8180",
    family: "L8180 / L8160",
    format: "A3+",
    maxWidthMM: 329,
    maxHeightMM: 1200,
    maxWidthIn: 12.95,
    maxHeightIn: 47.24,
    inkChannels: [
      { name: "Black",        color: "#111111", slot: 0 },
      { name: "Cyan",         color: "#00aeef", slot: 1 },
      { name: "Magenta",      color: "#ec008c", slot: 2 },
      { name: "Yellow",       color: "#fff200", slot: 3 },
      { name: "Light Cyan",   color: "#7dd3ef", slot: 4 },
      { name: "Light Magenta",color: "#f49ac2", slot: 5 },
      { name: "White",        color: "#ffffff", slot: 6, isDTFWhite: true },
      { name: "Gloss",        color: "#e0e8ff", slot: 7 },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "Light Cyan", "Light Magenta", "Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 360,  label: "720×360 (Draft)",    passCount: 4 },
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)", passCount: 8 },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8 },
      { dpiX: 1440, dpiY: 1440, label: "1440×1440 (Max)",    passCount: 16 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 1200,
    usbSupport: true,
    networkSupport: true,
    driverType: "Epson Inkjet",
    ippUri: "ipp://{{host}}/ipp/print",
    dtfDefaults: {
      whiteOpacity: 85,
      whiteUnderBlack: 90,
      whiteChokePx: 1,
      maxInkLimit: 290,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "8-channel printer with Gloss slot. Popular professional DTF choice.",
  },

  // ── EPSON L8160 (A4) ─────────────────────────────────────────────────────
  {
    id: "epson_l8160",
    brand: "Epson",
    model: "L8160",
    family: "L8180 / L8160",
    format: "A4",
    maxWidthMM: 216,
    maxHeightMM: 600,
    maxWidthIn: 8.5,
    maxHeightIn: 23.6,
    inkChannels: [
      { name: "Black",        color: "#111111", slot: 0 },
      { name: "Cyan",         color: "#00aeef", slot: 1 },
      { name: "Magenta",      color: "#ec008c", slot: 2 },
      { name: "Yellow",       color: "#fff200", slot: 3 },
      { name: "Light Cyan",   color: "#7dd3ef", slot: 4 },
      { name: "Light Magenta",color: "#f49ac2", slot: 5 },
      { name: "White",        color: "#ffffff", slot: 6, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "Light Cyan", "Light Magenta", "Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 360,  label: "720×360 (Draft)",    passCount: 4 },
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)", passCount: 8 },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 600,
    usbSupport: true,
    networkSupport: true,
    driverType: "Epson Inkjet",
    ippUri: "ipp://{{host}}/ipp/print",
    dtfDefaults: {
      whiteOpacity: 85,
      whiteUnderBlack: 90,
      whiteChokePx: 1,
      maxInkLimit: 280,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "A4 version of L8180.",
  },

  // ── EPSON SC-P700 (A3+) ──────────────────────────────────────────────────
  {
    id: "epson_scp700",
    brand: "Epson",
    model: "SC-P700",
    family: "SC-P700 / SC-P900",
    format: "A3+",
    maxWidthMM: 329,
    maxHeightMM: 1200,
    maxWidthIn: 12.95,
    maxHeightIn: 47.24,
    inkChannels: [
      { name: "Photo Black",       color: "#111111", slot: 0 },
      { name: "Cyan",              color: "#00aeef", slot: 1 },
      { name: "Vivid Magenta",     color: "#ec008c", slot: 2 },
      { name: "Yellow",            color: "#fff200", slot: 3 },
      { name: "Vivid Light Magenta",color:"#f8b4d9", slot: 4 },
      { name: "Light Cyan",        color: "#7dd3ef", slot: 5 },
      { name: "Matte Black",       color: "#222222", slot: 6 },
      { name: "Light Lightblack",  color: "#888888", slot: 7 },
      { name: "White",             color: "#ffffff", slot: 8, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Vivid Magenta", "Yellow", "Light Cyan", "Vivid Light Magenta", "Photo Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)",  passCount: 8  },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",     passCount: 8  },
      { dpiX: 2880, dpiY: 1440, label: "2880×1440 (Ultra)",   passCount: 16 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 1200,
    usbSupport: true,
    networkSupport: true,
    driverType: "Epson Inkjet",
    ippUri: "ipp://{{host}}/ipp/print",
    dtfDefaults: {
      whiteOpacity: 85,
      whiteUnderBlack: 95,
      whiteChokePx: 1,
      maxInkLimit: 300,
      colorBoostMode: "photo",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "Professional inkset with Vivid Magenta. Excellent color gamut for DTF.",
  },

  // ── EPSON SC-P900 (A2) ───────────────────────────────────────────────────
  {
    id: "epson_scp900",
    brand: "Epson",
    model: "SC-P900",
    family: "SC-P700 / SC-P900",
    format: "A2",
    maxWidthMM: 432,
    maxHeightMM: 1200,
    maxWidthIn: 17.0,
    maxHeightIn: 47.24,
    inkChannels: [
      { name: "Photo Black",       color: "#111111", slot: 0 },
      { name: "Cyan",              color: "#00aeef", slot: 1 },
      { name: "Vivid Magenta",     color: "#ec008c", slot: 2 },
      { name: "Yellow",            color: "#fff200", slot: 3 },
      { name: "Vivid Light Magenta",color:"#f8b4d9", slot: 4 },
      { name: "Light Cyan",        color: "#7dd3ef", slot: 5 },
      { name: "Matte Black",       color: "#222222", slot: 6 },
      { name: "Light Lightblack",  color: "#888888", slot: 7 },
      { name: "White",             color: "#ffffff", slot: 8, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Vivid Magenta", "Yellow", "Light Cyan", "Vivid Light Magenta", "Photo Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)",  passCount: 8  },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",     passCount: 8  },
      { dpiX: 2880, dpiY: 1440, label: "2880×1440 (Ultra)",   passCount: 16 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 1200,
    usbSupport: true,
    networkSupport: true,
    driverType: "Epson Inkjet",
    ippUri: "ipp://{{host}}/ipp/print",
    dtfDefaults: {
      whiteOpacity: 85,
      whiteUnderBlack: 95,
      whiteChokePx: 1,
      maxInkLimit: 310,
      colorBoostMode: "photo",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "Wide-format A2 professional printer. Largest desktop Epson DTF option.",
  },

  // ── EPSON L1800 (A3+) ────────────────────────────────────────────────────
  {
    id: "epson_l1800",
    brand: "Epson",
    model: "L1800",
    family: "L1800 / L805",
    format: "A3",
    maxWidthMM: 305,
    maxHeightMM: 1200,
    maxWidthIn: 12.0,
    maxHeightIn: 47.24,
    inkChannels: [
      { name: "Black",   color: "#111111", slot: 0 },
      { name: "Cyan",    color: "#00aeef", slot: 1 },
      { name: "Magenta", color: "#ec008c", slot: 2 },
      { name: "Yellow",  color: "#fff200", slot: 3 },
      { name: "LC",      color: "#7dd3ef", slot: 4 },
      { name: "LM",      color: "#f49ac2", slot: 5 },
      { name: "White",   color: "#ffffff", slot: 6, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "LC", "LM", "Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 360,  label: "720×360 (Draft)",    passCount: 4 },
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)", passCount: 8 },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 1200,
    usbSupport: true,
    networkSupport: false,
    driverType: "Epson Inkjet",
    dtfDefaults: {
      whiteOpacity: 80,
      whiteUnderBlack: 90,
      whiteChokePx: 1,
      maxInkLimit: 270,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "Entry-level A3 DTF printer. Popular for beginners. USB only.",
  },

  // ── EPSON L805 (A4) ──────────────────────────────────────────────────────
  {
    id: "epson_l805",
    brand: "Epson",
    model: "L805",
    family: "L1800 / L805",
    format: "A4",
    maxWidthMM: 216,
    maxHeightMM: 600,
    maxWidthIn: 8.5,
    maxHeightIn: 23.6,
    inkChannels: [
      { name: "Black",   color: "#111111", slot: 0 },
      { name: "Cyan",    color: "#00aeef", slot: 1 },
      { name: "Magenta", color: "#ec008c", slot: 2 },
      { name: "Yellow",  color: "#fff200", slot: 3 },
      { name: "LC",      color: "#7dd3ef", slot: 4 },
      { name: "LM",      color: "#f49ac2", slot: 5 },
      { name: "White",   color: "#ffffff", slot: 6, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "LC", "LM", "Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 360,  label: "720×360 (Draft)",    passCount: 4 },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: true,
    maxRollLengthMM: 600,
    usbSupport: true,
    networkSupport: false,
    driverType: "Epson Inkjet",
    dtfDefaults: {
      whiteOpacity: 80,
      whiteUnderBlack: 90,
      whiteChokePx: 1,
      maxInkLimit: 260,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "A4 compact entry-level DTF. Good for proofing.",
  },

  // ── EPSON 1390 / 1410 (A3) ───────────────────────────────────────────────
  {
    id: "epson_1390",
    brand: "Epson",
    model: "Stylus Photo 1390",
    family: "1390 / 1410",
    format: "A3",
    maxWidthMM: 305,
    maxHeightMM: 900,
    maxWidthIn: 12.0,
    maxHeightIn: 35.4,
    inkChannels: [
      { name: "Black",   color: "#111111", slot: 0 },
      { name: "Cyan",    color: "#00aeef", slot: 1 },
      { name: "Magenta", color: "#ec008c", slot: 2 },
      { name: "Yellow",  color: "#fff200", slot: 3 },
      { name: "LC",      color: "#7dd3ef", slot: 4 },
      { name: "LM",      color: "#f49ac2", slot: 5 },
      { name: "White",   color: "#ffffff", slot: 6, isDTFWhite: true },
    ],
    defaultInkOrder: ["White", "Cyan", "Magenta", "Yellow", "LC", "LM", "Black"],
    dtfWhiteChannel: "White",
    supportedResolutions: [
      { dpiX: 720,  dpiY: 720,  label: "720×720 (Standard)", passCount: 8 },
      { dpiX: 1440, dpiY: 720,  label: "1440×720 (High)",    passCount: 8 },
    ],
    defaultResolution: { dpiX: 1440, dpiY: 720, label: "1440×720 (High)", passCount: 8 },
    rollSupport: false,
    maxRollLengthMM: 0,
    usbSupport: true,
    networkSupport: false,
    driverType: "ESC/P2",
    dtfDefaults: {
      whiteOpacity: 75,
      whiteUnderBlack: 85,
      whiteChokePx: 1,
      maxInkLimit: 260,
      colorBoostMode: "graphic",
      feedMode: "sheet",
      bidirectional: true,
      mediaType: "DTF Film",
      paperThicknessMM: 0.1,
    },
    blackboxRipSupported: true,
    notes: "Legacy A3 model. Sheet-only DTF. Good for budget setups.",
  },

];

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

export function getProfileById(id: string): PrinterProfile | undefined {
  return PRINTER_PROFILES.find(p => p.id === id);
}

export function getProfilesByFormat(format: PrinterProfile["format"]): PrinterProfile[] {
  return PRINTER_PROFILES.filter(p => p.format === format);
}

export function getBlackBoxProfiles(): PrinterProfile[] {
  return PRINTER_PROFILES.filter(p => p.blackboxRipSupported);
}

export function getProfileForModel(modelName: string): PrinterProfile | undefined {
  const lower = modelName.toLowerCase().replace(/[-\s]/g, "");
  return PRINTER_PROFILES.find(p =>
    p.model.toLowerCase().replace(/[-\s]/g, "").includes(lower) ||
    lower.includes(p.model.toLowerCase().replace(/[-\s]/g, ""))
  );
}
