/**
 * Manhattan RIP X — DriverInstaller
 * Matches DF v12's driver installation UI in Settings/Devices.
 * On Windows: calls pnputil via /api/drivers/install
 * On macOS: shows simulated success with instructions
 */

import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, CheckCircle2, XCircle, Loader2, AlertTriangle, Printer, RefreshCw } from "lucide-react";

interface DriverInstallResult {
  success: boolean;
  message: string;
  requiresReboot: boolean;
}

interface DetectedPrinter {
  name: string;
  uri: string;
  status: string;
  isDefault: boolean;
}

export default function DriverInstaller() {
  const [installing, setInstalling] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [installResult, setInstallResult] = useState<DriverInstallResult | null>(null);
  const [detectedPrinters, setDetectedPrinters] = useState<DetectedPrinter[]>([]);
  const [hasDetected, setHasDetected] = useState(false);

  const isWindows = typeof window !== "undefined"
    ? (window as any).electronAPI?.isWindows ?? (navigator.userAgent.includes("Windows"))
    : false;

  const isMac = typeof window !== "undefined"
    ? (window as any).electronAPI?.isMac ?? (navigator.userAgent.includes("Mac"))
    : false;

  async function handleDetectPrinters() {
    setDetecting(true);
    try {
      // Try Electron IPC first (faster, more reliable)
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.detectPrinters) {
        const printers = await electronAPI.detectPrinters();
        setDetectedPrinters(Array.isArray(printers) ? printers : []);
      } else {
        const res = await apiRequest("GET", "/api/printers/detect");
        const data = await res.json();
        setDetectedPrinters(data.printers || []);
      }
      setHasDetected(true);
    } catch (err: any) {
      setDetectedPrinters([]);
      setHasDetected(true);
    } finally {
      setDetecting(false);
    }
  }

  async function handleInstallDriver() {
    setInstalling(true);
    setInstallResult(null);
    try {
      // Try Electron IPC first (can spawn elevated pnputil)
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.installPrinterDriver) {
        const result = await electronAPI.installPrinterDriver();
        setInstallResult(result);
      } else {
        const res = await apiRequest("POST", "/api/drivers/install", {});
        const result = await res.json();
        setInstallResult(result);
      }
    } catch (err: any) {
      setInstallResult({
        success: false,
        message: err.message || "Installation failed",
        requiresReboot: false,
      });
    } finally {
      setInstalling(false);
    }
  }

  const et8550Match = detectedPrinters.find(p =>
    p.name.toLowerCase().includes("et") &&
    (p.name.toLowerCase().includes("8550") || p.name.toLowerCase().includes("et-8550"))
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Printer className="w-5 h-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Printer Driver Manager</h3>
          <p className="text-[11px] text-muted-foreground">
            {isWindows
              ? "Installs Epson ET-8550 DTF driver via Windows Driver Store (pnputil)"
              : "macOS driver management — uses CUPS / built-in Epson driver"}
          </p>
        </div>
      </div>

      {/* Platform badge */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {isWindows ? "Windows" : isMac ? "macOS" : "Linux"}
        </Badge>
        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
          Epson ET-8550 DTF Edition
        </Badge>
      </div>

      {/* Detect Printers section */}
      <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-foreground">Detected System Printers</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-[10px] gap-1.5"
            onClick={handleDetectPrinters}
            disabled={detecting}
          >
            {detecting
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            {detecting ? "Scanning…" : "Scan Printers"}
          </Button>
        </div>

        {hasDetected && (
          <div className="space-y-1.5">
            {detectedPrinters.length === 0 ? (
              <div className="flex items-center gap-2 text-[11px] text-amber-400">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                No printers detected. Is the Epson ET-8550 connected and powered on?
              </div>
            ) : (
              detectedPrinters.map((p, i) => {
                const isEpson = p.name.toLowerCase().includes("epson");
                const isET8550 = p.name.toLowerCase().includes("8550");
                const isDTF = p.name.toLowerCase().includes("dtf");
                const isMatched = isET8550;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-[10px] ${
                      isMatched
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Printer className="w-3 h-3 shrink-0" />
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.isDefault && <span className="text-[9px] opacity-60">Default</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDTF && (
                        <Badge variant="outline" className="text-[9px] h-4 border-green-700/40 text-green-400">DTF</Badge>
                      )}
                      <span className={`text-[9px] ${
                        p.status === "online" || p.status === "idle" ? "text-green-400"
                        : p.status === "printing" ? "text-blue-400"
                        : "text-red-400"
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}

            {et8550Match && !et8550Match.name.toLowerCase().includes("dtf") && (
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 mt-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Found "{et8550Match.name}" — install the DTF driver below to get full MRX color control
              </div>
            )}

            {et8550Match?.name.toLowerCase().includes("dtf") && (
              <div className="flex items-center gap-1.5 text-[10px] text-green-400 mt-1">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                Epson ET-8550 DTF driver detected — MRX is ready to print
              </div>
            )}
          </div>
        )}
      </div>

      {/* Driver Install section */}
      <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-3">
        <div>
          <p className="text-[11px] font-semibold text-foreground mb-0.5">Install Epson ET-8550 DTF Driver</p>
          <p className="text-[10px] text-muted-foreground">
            {isWindows
              ? "Runs pnputil to install the Epson ET-8550 DTF driver from the Windows Driver Store. Requires Administrator privileges."
              : "macOS uses the built-in Epson driver (Gutenprint/Epson-inkjet-printer-escpr). Your Epson ET-8550 should be visible in System Settings → Printers."}
          </p>
        </div>

        {isWindows && (
          <div className="text-[10px] text-muted-foreground/70 bg-muted/20 rounded px-2 py-1.5 border border-border/50 font-mono">
            pnputil /add-driver epson_et8550.inf /install
          </div>
        )}

        <Button
          className="w-full h-8 text-[11px] font-semibold gap-2"
          onClick={handleInstallDriver}
          disabled={installing}
        >
          {installing ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Installing Driver…</>
          ) : (
            <><Download className="w-3.5 h-3.5" /> Install Epson ET-8550 DTF Driver</>
          )}
        </Button>

        {installResult && (
          <div className={`flex items-start gap-2 px-3 py-2 rounded border text-[11px] ${
            installResult.success
              ? "bg-green-900/20 border-green-700/40 text-green-400"
              : "bg-red-900/20 border-red-700/40 text-red-400"
          }`}>
            {installResult.success
              ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            <div>
              <p>{installResult.message}</p>
              {installResult.requiresReboot && (
                <p className="text-amber-400 mt-1 font-semibold">⚠ Restart required to complete driver installation</p>
              )}
            </div>
          </div>
        )}

        {!isWindows && (
          <div className="text-[10px] text-muted-foreground/70 space-y-1">
            <p className="font-semibold text-muted-foreground">macOS Setup Instructions:</p>
            <ol className="list-decimal list-inside space-y-0.5 ml-1">
              <li>Connect Epson ET-8550 via USB or WiFi</li>
              <li>Open System Settings → Printers & Scanners</li>
              <li>Click + and select your Epson ET-8550</li>
              <li>macOS will auto-install the Epson ESC/P-R driver</li>
              <li>Return here and click "Scan Printers" to confirm</li>
            </ol>
          </div>
        )}
      </div>

      {/* MRX Color Profile info */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
        <p className="text-[10px] font-semibold text-primary mb-1">MRX Color Profiles Active</p>
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          {[
            { label: "ET8550DT", desc: "Epson ET-8550 DTF (primary)" },
            { label: "E8550DT2", desc: "Epson ET-8550 DTF v2" },
            { label: "EasyColorAdj", desc: "B1-B20 / S1-S20 / M100-M390" },
          ].map(({ label, desc }) => (
            <div key={label} className="bg-primary/10 rounded px-2 py-1 border border-primary/20">
              <p className="font-mono font-semibold text-primary text-[9px]">{label}</p>
              <p className="text-muted-foreground text-[9px] leading-tight">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
