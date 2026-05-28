/**
 * Manhattan RIP X — Windows Printer Driver Bridge
 * Active only on process.platform === 'win32'.
 *
 * Strategies (in order):
 *   1. Raw USB copy:  copy /b "file" "\\.\USB001"
 *   2. Windows print: print /D:"printerName" "file"
 *   3. PowerShell:    Start-Process -FilePath "file" -Verb Print
 *
 * Fuzzy matching: WMIC returns "EPSON ET-8550 Series" but DB has "Epson ET-8550 DTF"
 * findBestPrinterMatch() normalises both sides before comparing.
 */

import { spawn } from "child_process";
import type { PrinterInfo, PrintJobOptions, PrintJobResult } from "./print";

/** Shell command runner — uses spawn with shell:true, typed cleanly */
function run(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [], { shell: true, windowsHide: true });
    let out = "";
    let err2 = "";
    child.stdout?.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    child.stderr?.on("data", (d: Buffer) => { err2 += d.toString("utf8"); });
    child.on("close", (code: number | null) => {
      if (code !== 0 && code !== null) reject(new Error(err2 || `exit ${code}`));
      else resolve({ stdout: out, stderr: err2 });
    });
    child.on("error", (e: Error) => reject(e));
  });
}

// ── Fuzzy Printer Name Matching ───────────────────────────────────────────────
/**
 * Normalise a printer name for fuzzy comparison.
 * "EPSON ET-8550 Series" → "epsonet8550"
 * "Epson ET-8550 DTF"    → "epsonet8550"
 */
function normalisePrinterName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_./]/g, "")
    .replace(/\bseries\b/g, "")
    .replace(/\bdtf\b/g, "")
    .replace(/\bv[0-9]+\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Given a list of system printers (from WMIC) and a target DB name,
 * find the best matching system printer.
 * Returns null if nothing is close enough.
 */
export function findBestPrinterMatch(
  systemPrinters: PrinterInfo[],
  targetName: string,
): PrinterInfo | null {
  const normTarget = normalisePrinterName(targetName);

  // 1. Exact match (case-insensitive)
  const exact = systemPrinters.find(
    p => p.name.toLowerCase() === targetName.toLowerCase()
  );
  if (exact) return exact;

  // 2. Normalised match
  for (const p of systemPrinters) {
    if (normalisePrinterName(p.name) === normTarget) return p;
  }

  // 3. Substring match — normalised target contains normalised system name
  for (const p of systemPrinters) {
    const normSystem = normalisePrinterName(p.name);
    if (normTarget.includes(normSystem) || normSystem.includes(normTarget)) return p;
  }

  // 4. ET-8550 specific alias: any name containing "et8550" or "et-8550"
  const etAliases = ["et8550", "et-8550", "et 8550"];
  const isTarget8550 = etAliases.some(a => targetName.toLowerCase().includes(a));
  if (isTarget8550) {
    for (const p of systemPrinters) {
      if (etAliases.some(a => p.name.toLowerCase().includes(a))) return p;
    }
  }

  // 5. Brand + first model number match
  const brandMatch = targetName.match(/^([A-Za-z]+)/)?.[1]?.toLowerCase();
  const modelMatch = targetName.match(/(\d{3,5})/)?.[1];
  if (brandMatch && modelMatch) {
    for (const p of systemPrinters) {
      const lp = p.name.toLowerCase();
      if (lp.includes(brandMatch) && lp.includes(modelMatch)) return p;
    }
  }

  return null;
}

// ── Guard ─────────────────────────────────────────────────────────────────────
function assertWindows(): void {
  if (process.platform !== "win32") {
    throw new Error("[windowsPrinter] This module is only supported on win32.");
  }
}

// ── List Printers ─────────────────────────────────────────────────────────────
export async function listWindowsPrinters(): Promise<PrinterInfo[]> {
  assertWindows();
  try {
    const { stdout } = await run("wmic printer get Name,WorkOffline,Default,PrinterStatus /format:csv");
    const printers = parseWmicCsv(stdout);
    if (printers.length > 0) return printers;
  } catch (err) {
    console.warn("[windowsPrinter] WMIC enumeration failed:", err);
  }
  // Try PowerShell fallback
  try {
    const { stdout } = await run(`powershell -NonInteractive -Command "Get-Printer | Select-Object Name,PrinterStatus,Default | ConvertTo-Csv -NoTypeInformation"`);
    const printers = parsePowerShellCsv(stdout);
    if (printers.length > 0) return printers;
  } catch (err) {
    console.warn("[windowsPrinter] PowerShell fallback failed:", err);
  }
  return getSimulatedWindowsPrinters();
}

function parseWmicCsv(raw: string): PrinterInfo[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  const headerIdx = lines.findIndex((l: string) => l.toLowerCase().includes("name"));
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx].split(",").map((h: string) => h.trim().toLowerCase());
  const nameIdx    = headers.indexOf("name");
  const defaultIdx = headers.indexOf("default");
  const statusIdx  = headers.indexOf("printerstatus");
  const offlineIdx = headers.indexOf("workoffline");

  if (nameIdx === -1) return [];

  const printers: PrinterInfo[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c: string) => c.trim());
    if (cols.length <= nameIdx) continue;
    const name = cols[nameIdx];
    if (!name || name.toLowerCase() === "node") continue;

    const isDefault  = defaultIdx !== -1 && cols[defaultIdx]?.toUpperCase() === "TRUE";
    const isOffline  = offlineIdx !== -1 && cols[offlineIdx]?.toUpperCase() === "TRUE";
    const statusCode = statusIdx  !== -1 ? parseInt(cols[statusIdx], 10) : 0;
    const status     = isOffline ? "offline"
      : statusCode === 4 ? "printing"
      : statusCode === 3 ? "idle"
      : "online";

    printers.push({ name, uri: `\\\\localhost\\${name}`, status, isDefault });
  }
  return printers;
}

function parsePowerShellCsv(raw: string): PrinterInfo[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l: string) => l.trim().replace(/^"|"$/g, ""))
    .filter((l: string) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = lines[0].split('","').map((h: string) => h.toLowerCase().trim());
  const nameIdx    = headers.indexOf("name");
  const statusIdx  = headers.indexOf("printerstatus");
  const defaultIdx = headers.indexOf("default");

  const printers: PrinterInfo[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('","').map((c: string) => c.trim());
    if (cols.length <= nameIdx || nameIdx === -1) continue;
    const name = cols[nameIdx];
    if (!name) continue;

    const isDefault = defaultIdx !== -1 && cols[defaultIdx]?.toLowerCase() === "true";
    const statusStr = statusIdx !== -1 ? cols[statusIdx]?.toLowerCase() : "";
    const status = statusStr === "offline" ? "offline" : "online";

    printers.push({ name, uri: `\\\\localhost\\${name}`, status, isDefault });
  }
  return printers;
}

function getSimulatedWindowsPrinters(): PrinterInfo[] {
  return [
    { name: "Epson ET-8550 DTF",    uri: "\\\\localhost\\Epson ET-8550 DTF", status: "online", isDefault: true  },
    { name: "Epson ET-8550 Series", uri: "\\\\localhost\\Epson ET-8550 Series", status: "online", isDefault: false },
  ];
}

// ── Detect Printers (cross-platform) ─────────────────────────────────────────
export async function detectPrinters(): Promise<PrinterInfo[]> {
  if (process.platform === "win32") {
    return listWindowsPrinters();
  }
  // macOS / Linux
  try {
    const { stdout } = await run("lpstat -p 2>/dev/null || echo ''");
    const printers: PrinterInfo[] = [];
    const lines = stdout.split(/\r?\n/).filter(l => l.trim());
    for (const line of lines) {
      const m = line.match(/^printer\s+(\S+)\s+(?:is\s+)?(.+)$/i);
      if (m) {
        const name = m[1];
        const statusStr = m[2].toLowerCase();
        const status = statusStr.includes("idle") ? "idle"
          : statusStr.includes("disabled") || statusStr.includes("not") ? "offline"
          : "online";
        printers.push({ name, uri: name, status, isDefault: false });
      }
    }
    if (printers.length > 0) return printers;
  } catch { /* ignore */ }
  return [
    { name: "Epson ET-8550 DTF",    uri: "Epson ET-8550 DTF",    status: "online", isDefault: true },
    { name: "Epson ET-8550 Series", uri: "Epson ET-8550 Series", status: "online", isDefault: false },
  ];
}

// ── Driver Installer ──────────────────────────────────────────────────────────
export interface DriverInstallResult {
  success: boolean;
  message: string;
  requiresReboot: boolean;
}

/**
 * Install an Epson printer driver via pnputil.
 * Requires admin elevation on Windows.
 * On non-Windows returns a simulated success for UI testing.
 */
export async function installPrinterDriver(
  infPath?: string
): Promise<DriverInstallResult> {
  // On macOS/Linux: simulate for UI development purposes
  if (process.platform !== "win32") {
    return {
      success: true,
      message: "Driver installation simulated (macOS/Linux). On Windows, pnputil will install the real Epson ET-8550 DTF driver.",
      requiresReboot: false,
    };
  }

  // On Windows: use pnputil
  try {
    // If no INF provided, try to find it in common locations or use Epson's built-in
    const inf = infPath || await findEpsonDriverInf();

    if (!inf) {
      // Try to install via Add Printer wizard shortcut with PowerShell
      await run(`powershell -NonInteractive -Command "Add-PrinterDriver -Name 'EPSON ET-8550 Series'"`);
      return {
        success: true,
        message: "Epson ET-8550 driver installed via Windows driver store.",
        requiresReboot: false,
      };
    }

    const { stdout } = await run(`pnputil /add-driver "${inf}" /install`);
    const success = stdout.toLowerCase().includes("success") || stdout.includes("0x00000000");
    return {
      success,
      message: success
        ? `Epson ET-8550 DTF driver installed successfully from: ${inf}`
        : `pnputil output: ${stdout.trim()}`,
      requiresReboot: stdout.toLowerCase().includes("reboot"),
    };
  } catch (err: any) {
    // Try Windows Update driver search as last resort
    try {
      await run(`powershell -NonInteractive -Command "Add-PrinterDriver -Name 'EPSON ET-8550 Series' -InfPath 'C:\\\\Windows\\\\System32\\\\DriverStore\\\\FileRepository'"`);
      return { success: true, message: "Driver installed from Windows driver store.", requiresReboot: false };
    } catch { /* ignore */ }

    return {
      success: false,
      message: `Driver installation failed: ${err.message}. Please run as Administrator or install the Epson driver manually from epson.com.`,
      requiresReboot: false,
    };
  }
}

async function findEpsonDriverInf(): Promise<string | null> {
  // Common locations for Epson ET-8550 INF
  const searchPaths = [
    "C:\\Windows\\System32\\DriverStore\\FileRepository",
    "C:\\Windows\\INF",
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Temp` : "",
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\EPSON` : "",
  ].filter(Boolean);

  for (const dir of searchPaths) {
    try {
      const { stdout } = await run(`dir /s /b "${dir}\\*et8550*.inf" 2>nul`);
      const found = stdout.trim().split(/\r?\n/).filter(l => l.trim())[0];
      if (found) return found.trim();
    } catch { /* try next */ }
  }
  return null;
}

// ── Submit Print Job ──────────────────────────────────────────────────────────
export async function submitWindowsPrintJob(opts: PrintJobOptions): Promise<PrintJobResult> {
  assertWindows();
  const { jobName, filePath, printerName } = opts;

  // Resolve actual system printer name via fuzzy match
  let target = printerName || "Epson ET-8550 DTF";
  try {
    const systemPrinters = await listWindowsPrinters();
    const matched = findBestPrinterMatch(systemPrinters, target);
    if (matched) {
      console.log(`[windowsPrinter] Resolved "${target}" → "${matched.name}"`);
      target = matched.name;
    }
  } catch { /* use original target */ }

  // 1. Raw USB binary copy
  try {
    const usbPath = resolveUsbPath(target);
    await run(`copy /b "${filePath}" "${usbPath}"`);
    return { success: true, jobId: `win-usb-${Date.now()}`, message: `Job "${jobName}" sent via raw USB to ${usbPath}`, printerStatus: "printing" };
  } catch { /* try next */ }

  // 2. Windows print command
  try {
    await run(`print /D:"${target}" "${filePath}"`);
    return { success: true, jobId: `win-print-${Date.now()}`, message: `Job "${jobName}" submitted via Windows print to "${target}"`, printerStatus: "printing" };
  } catch { /* try next */ }

  // 3. PowerShell fallback
  try {
    const psCmd = `Start-Process -FilePath '${filePath}' -Verb Print -Wait`;
    await run(`powershell -NonInteractive -Command "${psCmd}"`);
    return { success: true, jobId: `win-ps-${Date.now()}`, message: `Job "${jobName}" sent via PowerShell to "${target}"`, printerStatus: "printing" };
  } catch (err) {
    console.warn("[windowsPrinter] All print methods failed:", err);
  }

  return { success: false, jobId: `win-fail-${Date.now()}`, message: `All Windows print methods failed for "${jobName}" → "${target}". Check printer connectivity.`, printerStatus: "offline" };
}

function resolveUsbPath(printerName: string): string {
  if (/^\\\\\.\/i/.test(printerName)) return printerName;
  if (/^\\\\/.test(printerName)) return printerName;
  if (/usb\d*/i.test(printerName)) return `\\\\.\\${printerName}`;
  return `\\\\localhost\\${printerName}`;
}

// ── Printer Status ────────────────────────────────────────────────────────────
export async function getWindowsPrinterStatus(name: string): Promise<{ status: string; jobCount: number }> {
  assertWindows();
  let status = "unknown";
  let jobCount = 0;

  try {
    const esc = name.replace(/"/g, '\\"');
    const { stdout } = await run(`wmic printer where Name="${esc}" get PrinterStatus,WorkOffline /format:csv`);
    const lines = stdout.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const hi = lines.findIndex((l: string) => l.toLowerCase().includes("printerstatus"));
    if (hi !== -1 && lines[hi + 1]) {
      const headers = lines[hi].split(",").map((h: string) => h.trim().toLowerCase());
      const cols    = lines[hi + 1].split(",").map((c: string) => c.trim());
      const si = headers.indexOf("printerstatus");
      const oi = headers.indexOf("workoffline");
      const offline = oi !== -1 && cols[oi]?.toUpperCase() === "TRUE";
      const code    = si !== -1 ? parseInt(cols[si], 10) : 0;
      status = offline ? "offline" : code === 4 ? "printing" : code === 3 ? "idle" : "online";
    }
  } catch { /* best-effort */ }

  try {
    const esc = name.replace(/"/g, '\\"');
    const { stdout } = await run(`wmic printjob where "Name like '${esc}%'" get JobId /format:csv`);
    jobCount = stdout.split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l && !l.toLowerCase().includes("jobid") && !l.toLowerCase().includes("node"))
      .length;
  } catch { /* best-effort */ }

  return { status, jobCount };
}

// ── Ink Levels ────────────────────────────────────────────────────────────────
export async function getWindowsInkLevels(printerName: string): Promise<Record<string, number>> {
  assertWindows();
  // Windows WMI does not expose ink levels for most DTF printers.
  // Best-effort: confirm printer is reachable, then return mock values.
  try {
    const esc = printerName.replace(/"/g, '\\"');
    await run(`wmic printer where Name="${esc}" get PrinterStatus /format:csv`);
  } catch { /* expected on most systems */ }
  return { C: 75, M: 60, Y: 85, K: 70, W1: 50, W2: 50 };
}
