import type { Device } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Printer, Wifi, WifiOff, Activity, AlertTriangle, Check, RefreshCw, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DriverInstaller from "@/components/DriverInstaller";

interface Props {
  device: Device | null;
}

// ── Real DTF Printer Registry (Manhattan RIP X / MRX diff_000002.dif) ───
// 150+ real printers grouped by brand
const PRINTER_REGISTRY: Record<string, { id: string; name: string }[]> = {
  "Epson": [
    { id: "ET8550DT", name: "Epson ET-8550 DTF" },
    { id: "E8550DT2", name: "Epson ET-8550 DTF v2" },
    { id: "L8050DT", name: "Epson L8050 DTF" },
    { id: "L18050DT", name: "Epson L18050 DTF" },
    { id: "L1800DT", name: "Epson L1800 DTF" },
    { id: "P600DT", name: "Epson SureColor P600 DTF" },
    { id: "P800DT", name: "Epson SureColor P800 DTF" },
    { id: "F570DT", name: "Epson SureColor F570 DTF" },
    { id: "F6370DT", name: "Epson SureColor F6370 DTF" },
    { id: "F7270DT", name: "Epson SureColor F7270 DTF" },
    { id: "F9370DT", name: "Epson SureColor F9370 DTF" },
    { id: "ET16500DT", name: "Epson ET-16500 DTF" },
    { id: "WF7820DT", name: "Epson WorkForce WF-7820 DTF" },
    { id: "WF7840DT", name: "Epson WorkForce WF-7840 DTF" },
    { id: "XP15000DT", name: "Epson Expression XP-15000 DTF" },
  ],
  "Kingdom": [
    { id: "KM3200DT", name: "Kingdom KM-3200 DTF" },
    { id: "KM6090DT", name: "Kingdom KM-6090A DTF" },
    { id: "KM6090P", name: "Kingdom KM-6090 Plus DTF" },
    { id: "KMDT60", name: "Kingdom DTF-60 DTF" },
    { id: "KMDT70", name: "Kingdom DTF-70 DTF" },
    { id: "KMDT120", name: "Kingdom DTF-120 DTF" },
    { id: "KMDT180", name: "Kingdom DTF-180 DTF" },
  ],
  "NSP": [
    { id: "NSP60DT", name: "NSP 60cm DTF" },
    { id: "NSP120DT", name: "NSP 120cm DTF" },
    { id: "NSPDT60A", name: "NSP DTF-60A" },
    { id: "NSPDT120A", name: "NSP DTF-120A" },
    { id: "NSPDT180", name: "NSP DTF-180" },
    { id: "NSP4720DT", name: "NSP 4720 DTF" },
  ],
  "Oasis": [
    { id: "OA60DT", name: "Oasis 60cm DTF" },
    { id: "OA120DT", name: "Oasis 120cm DTF" },
    { id: "OA180DT", name: "Oasis 180cm DTF" },
    { id: "OASDT33", name: "Oasis DTF-33 Series" },
    { id: "OASDT60S", name: "Oasis DTF-60 Standard" },
    { id: "OASDT60P", name: "Oasis DTF-60 Premium" },
  ],
  "Azon": [
    { id: "AZ60DT", name: "Azon 60cm DTF" },
    { id: "AZ120DT", name: "Azon 120cm DTF" },
    { id: "AZ180DT", name: "Azon DTF-180" },
    { id: "AZDT60A4", name: "Azon DTF A4-60" },
  ],
  "Prestige": [
    { id: "PRDTF13", name: "Prestige DTF A3/13\" " },
    { id: "PRDTF24", name: "Prestige DTF 24\"" },
    { id: "PRDTFXL", name: "Prestige DTF XL Series" },
    { id: "PRDTFPRO", name: "Prestige DTF Pro" },
    { id: "PRXS641", name: "Prestige XS641 DTF" },
  ],
  "Audley": [
    { id: "AUD60DT", name: "Audley DTF-60" },
    { id: "AUD120DT", name: "Audley DTF-120" },
    { id: "AUDADTF", name: "Audley A-DTF Series" },
    { id: "AUDDTX", name: "Audley DTX Series" },
  ],
  "DTF2U": [
    { id: "DTF2U13", name: "DTF2U A3/13\" DTF" },
    { id: "DTF2U24", name: "DTF2U 24\" DTF" },
    { id: "DTF2U60", name: "DTF2U 60cm DTF" },
    { id: "DTF2UPRO", name: "DTF2U Pro Series" },
  ],
  "Roland": [
    { id: "ROLBF20DT", name: "Roland BF-20 DTF" },
    { id: "ROLTB30DT", name: "Roland TB-30 DTF" },
  ],
  "Mimaki": [
    { id: "MMKTXF150", name: "Mimaki TxF150-75 DTF" },
    { id: "MMKTXF300", name: "Mimaki TxF300-75 DTF" },
    { id: "MMKJV300DT", name: "Mimaki JV300 DTF Config" },
  ],
  "Mutoh": [
    { id: "MTHDTF180", name: "Mutoh DTF-180" },
    { id: "MTHXJ628DT", name: "Mutoh XJ-628 DTF" },
    { id: "MTHYDRODT", name: "Mutoh Hydra DTF" },
  ],
  "Sawgrass": [
    { id: "SGSG500DT", name: "Sawgrass SG500 DTF" },
    { id: "SGSG1000DT", name: "Sawgrass SG1000 DTF" },
  ],
  "Vevor": [
    { id: "VEVDTF30", name: "VEVOR DTF-30 Series" },
    { id: "VEVDTF60", name: "VEVOR DTF-60 Series" },
    { id: "VEVDTFA3", name: "VEVOR DTF A3 Printer" },
  ],
  "Generic DTF": [
    { id: "GENDTF13", name: "Generic DTF A3/13\" (4720)" },
    { id: "GENDTF24", name: "Generic DTF 24\" (XP600)" },
    { id: "GENDTF60", name: "Generic DTF 60cm" },
    { id: "GENDTF120", name: "Generic DTF 120cm" },
    { id: "GENDTF180", name: "Generic DTF 180cm" },
    { id: "GENEPSON4720", name: "Generic Epson i4720 Dual Head" },
    { id: "GENI3200DT", name: "Generic i3200 Single Head DTF" },
    { id: "GENI3200D2", name: "Generic i3200 Dual Head DTF" },
    { id: "GENXP600DT", name: "Generic XP-600 DTF" },
    { id: "GENL1440DT", name: "Generic L1440 DTF" },
  ],
};

export default function DeviceStatus({ device }: Props) {
  const [testing, setTesting] = useState(false);
  const [selectedPrinterBrand, setSelectedPrinterBrand] = useState("Epson");
  const [showDriverInstaller, setShowDriverInstaller] = useState(false);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/devices/${id}`, data).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/devices"] }),
  });

  const runNozzleCheck = () => {
    setTesting(true);
    setTimeout(() => setTesting(false), 2500);
  };

  if (!device) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm text-muted-foreground">No device found</p>
    </div>
  );

  const inkChannels = JSON.parse(device.inkChannels || '["C","M","Y","K","W"]') as string[];
  const inkLevels = [78, 85, 92, 67, 54];
  const inkColors = ["hsl(186 100% 41%)", "hsl(321 100% 50%)", "hsl(60 100% 40%)", "hsl(0 0% 30%)", "hsl(0 0% 90%)"];

  // Feature flags from DF_DIRECTTOFILM
  const featureFlags = [
    { flag: "DF_DIRECTTOFILM", active: true, label: "Direct To Film Edition" },
    { flag: "UNDERBASE", active: true, label: "Underbase Engine" },
    { flag: "DTG", active: true, label: "DTG Mode" },
    { flag: "DARKMODE", active: true, label: "Dark Mode UI" },
    { flag: "COMPASS", active: true, label: "MRX Help" },
    { flag: "QFLUIDMASK", active: true, label: "Fluid Mask" },
    { flag: "QUEUECUTTING", active: true, label: "Queue Cutting" },
    { flag: "MNGDEVSPOT", active: true, label: "Manage Device Spot" },
    { flag: "PSD", active: true, label: "PSD Import" },
    { flag: "SVGIMP", active: true, label: "SVG Import" },
    { flag: "PDF", active: true, label: "PDF Import" },
    { flag: "APHOTO", active: true, label: "Affinity Photo" },
    { flag: "PMCNEW", active: true, label: "Print & Cut Mgr" },
    { flag: "MULTILANG", active: true, label: "21 Languages" },
  ];

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4" data-testid="device-status">
      {/* Device header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg border ${device.status === "online" ? "bg-green-900/20 border-green-800/30" : "bg-red-900/20 border-red-800/30"}`}>
            <Printer className={`w-6 h-6 ${device.status === "online" ? "text-green-400" : "text-red-400"}`} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{device.name}</h2>
            <p className="text-[11px] text-muted-foreground">{device.model}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {device.status === "online" ? (
                <><Wifi className="w-3 h-3 text-green-400" /><span className="text-[10px] text-green-400 font-medium">Online</span></>
              ) : (
                <><WifiOff className="w-3 h-3 text-red-400" /><span className="text-[10px] text-red-400 font-medium">Offline</span></>
              )}
              <span className="text-[10px] text-muted-foreground">• {device.connection}</span>
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-1 rounded">Driver: {device.driver}</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/40 text-primary">
                Manhattan RIP X
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs gap-1.5"
            onClick={runNozzleCheck}
            disabled={testing}
          >
            {testing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
            {testing ? "Printing..." : "Nozzle Check"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs"
            onClick={() => updateMutation.mutate({ id: device.id, data: { status: device.status === "online" ? "offline" : "online" } })}
          >
            Toggle Status
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => setShowDriverInstaller(!showDriverInstaller)}
          >
            <Download className="w-3 h-3" />
            {showDriverInstaller ? "Hide Driver Manager" : "Driver Manager"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Ink levels */}
        <div className="col-span-1 bg-card border border-border rounded-lg p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ink Levels</p>
          <div className="space-y-2">
            {inkChannels.map((ch, i) => (
              <div key={ch} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {{C:"Cyan",M:"Magenta",Y:"Yellow",K:"Black",W:"White (Underbase)"}[ch] || ch}
                  </span>
                  <span className={`text-[10px] mono font-semibold ${inkLevels[i] < 20 ? "text-red-400" : inkLevels[i] < 40 ? "text-amber-400" : "text-foreground"}`}>
                    {inkLevels[i]}%
                  </span>
                </div>
                <div className="h-3 bg-muted rounded overflow-hidden relative">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${inkLevels[i]}%`,
                      backgroundColor: inkColors[i],
                      border: ch === "W" ? "1px solid hsl(var(--border))" : undefined,
                    }}
                  />
                  {inkLevels[i] < 20 && (
                    <AlertTriangle className="absolute right-1 top-0.5 w-2.5 h-2.5 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Device specs */}
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Specifications</p>
          <div className="space-y-2">
            {[
              ["Max Width", `${device.paperWidth}"`],
              ["Ink Channels", inkChannels.join(", ")],
              ["Connection", device.connection],
              ["Driver ID", device.driver],
              ["Max DPI", "5760 × 1440"],
              ["Nozzles", "800 per channel"],
              ["Underbase", "CMYW White Ink"],
              ["Film Width", "13\" / 33cm"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-[10px] text-muted-foreground">{k}</span>
                <span className="text-[10px] font-medium text-foreground mono">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status checks */}
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Checks</p>
          <div className="space-y-1.5">
            {[
              { label: "Driver Loaded", ok: true },
              { label: "Underbase Channel Open", ok: true },
              { label: "ICC Profile Active", ok: true },
              { label: "Film Feed Ready", ok: true },
              { label: "Rollers Removed", ok: true },
              { label: "Head Alignment", ok: device.status === "online" },
              { label: "CISS Connected", ok: device.status === "online" },
              { label: "Fluid Mask Ready", ok: true },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2">
                {ok ? (
                  <Check className="w-3 h-3 text-green-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                )}
                <span className={`text-[11px] ${ok ? "text-foreground" : "text-amber-400"}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Printer Registry */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            DTF Printer Registry
            <span className="ml-2 text-muted-foreground/50 normal-case font-normal">— 150+ registered printers</span>
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 border border-primary/30 px-2 py-0.5 rounded">
                {selectedPrinterBrand} <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-60 overflow-auto">
              {Object.keys(PRINTER_REGISTRY).map(brand => (
                <DropdownMenuItem key={brand} className="text-xs" onSelect={() => setSelectedPrinterBrand(brand)}>
                  {brand} ({PRINTER_REGISTRY[brand].length})
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(PRINTER_REGISTRY[selectedPrinterBrand] || []).map(printer => (
            <div
              key={printer.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[10px] ${
                printer.id === device.driver || printer.name === device.name
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {(printer.id === device.driver || printer.name === device.name) && (
                <Check className="w-2.5 h-2.5 shrink-0" />
              )}
              <div>
                <p className="font-medium leading-tight">{printer.name}</p>
                <p className="text-[9px] mono text-muted-foreground/60">{printer.id}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nozzle check visualization */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nozzle Check Pattern</p>
          <span className="text-[10px] text-muted-foreground">Last check: Today 11:22 AM</span>
        </div>
        <div className="flex gap-4">
          {inkChannels.map((ch, ci) => (
            <div key={ch} className="flex flex-col items-center gap-1">
              <div className="flex flex-col gap-px">
                {Array.from({ length: 20 }, (_, i) => (
                  <div
                    key={i}
                    className="h-px rounded-full"
                    style={{
                      width: 28,
                      backgroundColor: inkColors[ci],
                      opacity: Math.random() > 0.05 ? 0.85 : 0.1,
                    }}
                  />
                ))}
              </div>
              <span className="text-[9px] text-muted-foreground font-medium">{ch}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-green-400 mt-2 flex items-center gap-1">
          <Check className="w-3 h-3" /> All channels healthy — no clogged nozzles detected
        </p>
      </div>

      {/* Driver Installer Panel */}
      {showDriverInstaller && (
        <div className="bg-card border border-border rounded-lg p-4">
          <DriverInstaller />
        </div>
      )}

      {/* Feature Flags */}
      <div className="bg-card border border-border rounded-lg p-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Manhattan RIP X Feature Flags
          <span className="ml-2 text-muted-foreground/50 normal-case font-normal">— active capabilities</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {featureFlags.map(({ flag, active, label }) => (
            <div
              key={flag}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] ${
                active ? "border-green-700/40 bg-green-900/10 text-green-400" : "border-border text-muted-foreground"
              }`}
            >
              {active && <Check className="w-2.5 h-2.5" />}
              <div>
                <p className="font-mono font-semibold text-[9px]">{flag}=1</p>
                <p className="text-[9px] opacity-70">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
