import { useQuery } from "@tanstack/react-query";
import type { IccProfile } from "@shared/schema";
import { useState } from "react";
import { X, Upload, Check, AlertTriangle, Palette, Sliders, Activity, Link2, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SpotColorLibrary from "@/components/SpotColorLibrary";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Props {
  onClose?: () => void;
}

// ── MRX profile groupings ─────────────────────────────────────────
const MRX_PROFILES = {
  "MRX System (RGB)": [
    "MRX Unified RGB",
    "MRX gen inkjet",
    "MRX Image RGB",
    "MRX RGB Bitmaps",
    "MRX RGB Line Art",
    "MRX HexRGB Bitmap",
    "MRX HexRGB Line Art",
    "MRX vector RGB",
    "MRX sRGB",
    "MRX gen monitor",
    "MRX gen printer",
    "CIELab",
    "eciRGB_v2",
    "sRGB",
    "genmon",
    "monitor",
    "input",
  ],
  "MRX CMYK": [
    "MRX CMYK",
    "MRX SWOP",
    "MRX image CMYK",
    "MRX vector CMYK",
    "MRXWideCMYK",
    "genCMYKPS",
    "Printer",
  ],
  "ISO Press Standards": [
    "EuroscaleCoated",
    "ISOcoated_v2_eci",
    "PSOcoated_v3",
    "PSOuncoated_v3_FOGRA52",
    "Standard EURO",
    "Standard SWOP",
  ],
  "Ink Profiles": [
    "LAB-CMYK.ink",
    "RGB-CMYK.ink",
    "SWOP-CMYK.ink",
  ],
};

// ── Device-Link profile groupings ──────────────────────────────────────────
const DEVICE_LINK_GROUPS = {
  "CMYK Max Ink": [60,65,70,75,80,85,90,95].map(v => ({ name: `DL — CMYK Max Ink ${v}%`, label: `${v}%` })),
  "MaxInk Reduction": [50,55,60,65,70,75,80,85,90,95].map(v => ({ name: `DL — MaxInk ${v}%`, label: `${v}%` })),
  "Lighter": [10,20,30,40,50,60,70,80].map(v => ({ name: `DL — Lighter ${v}%`, label: `+${v}%` })),
  "Darker": [10,20,30,40,50].map(v => ({ name: `DL — Darker ${v}%`, label: `-${v}%` })),
  "Contrast": [10,20,30,40,50,60,70,80,90,100].map(v => ({ name: `DL — Contrast ${v}%`, label: `${v}%` })),
  "Saturation": [5,10,15,20,25,30,35,40,45,50].map(v => ({ name: `DL — Saturation ${v}%`, label: `${v}%` })),
  "Special": [
    { name: "DL — CleanWhite", label: "CleanWhite" },
    ...[5,10,15,20,25,30,35,40,45,50].map(v => ({ name: `DL — Linear Ink Reduction ${v}%`, label: `LIR ${v}%` })),
  ],
};

// ── ColorTune profile groups ───────────────────────────────────────────
const ECA_GROUPS = {
  "Brightness (Darker)": Array.from({ length: 20 }, (_, i) => ({ name: `CT-B-${20 - i}`, label: `B-${20 - i}` })),
  "Brightness (Brighter)": Array.from({ length: 20 }, (_, i) => ({ name: `CT-B${i + 1}`, label: `B${i + 1}` })),
  "Saturation": Array.from({ length: 20 }, (_, i) => ({ name: `CT-S${i + 1}`, label: `S${i + 1}` })),
  "MaxInk": Array.from({ length: 30 }, (_, i) => ({ name: `CT-M${100 + i * 10}`, label: `M${100 + i * 10}` })),
};

export default function ColorManagement({ onClose }: Props) {
  const { data: profiles = [] } = useQuery<IccProfile[]>({ queryKey: ["/api/icc-profiles"] });
  const [selectedProfile, setSelectedProfile] = useState("MRX Unified RGB");
  const [renderingIntent, setRenderingIntent] = useState("Perceptual");
  const [selectedDL, setSelectedDL] = useState("DL — Saturation 15%");
  const [selectedECA, setSelectedECA] = useState("CT-B5");
  const [blackPointComp, setBlackPointComp] = useState(true);
  const [gamutWarning, setGamutWarning] = useState(false);
  const [spotColorMode, setSpotColorMode] = useState("Simulate");
  const [manageSpotDevices, setManageSpotDevices] = useState(false);

  const GAMUT_STATS = [
    { label: "sRGB Coverage", value: 92, color: "hsl(199 89% 48%)" },
    { label: "Adobe RGB Coverage", value: 78, color: "hsl(145 60% 40%)" },
    { label: "P3 Coverage", value: 71, color: "hsl(40 90% 50%)" },
    { label: "CMYK (PSO Coated v3)", value: 96, color: "hsl(280 60% 55%)" },
  ];

  // group profiles from the DB
  const dbProfilesByGroup: Record<string, IccProfile[]> = {};
  for (const [grpName, names] of Object.entries(MRX_PROFILES)) {
    dbProfilesByGroup[grpName] = profiles.filter(p => names.includes(p.name));
  }

  return (
    <div className="flex flex-col" data-testid="color-management">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Color Management</h2>
          <p className="text-[10px] text-muted-foreground">Manhattan RIP X — MRX Color Engine</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <Tabs defaultValue="profiles" className="flex-1">
        <TabsList className="mx-4 mt-3 grid grid-cols-5 bg-muted/40">
          <TabsTrigger value="profiles" className="text-xs">ICC Profiles</TabsTrigger>
          <TabsTrigger value="devicelinks" className="text-xs">Device-Links</TabsTrigger>
          <TabsTrigger value="colortune" className="text-xs">Color Tune</TabsTrigger>
          <TabsTrigger value="spot" className="text-xs">Spot Color</TabsTrigger>
          <TabsTrigger value="gamut" className="text-xs">Gamut</TabsTrigger>
        </TabsList>

        {/* ── ICC Profiles ── */}
        <TabsContent value="profiles" className="p-4 space-y-4 m-0">
          <div className="grid grid-cols-2 gap-4">
            {/* Profile browser */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Source Profile
              </label>
              <div className="bg-muted/20 border border-border rounded max-h-72 overflow-auto">
                {Object.entries(MRX_PROFILES).map(([grp, names]) => (
                  <div key={grp}>
                    <div className="px-2 py-1 bg-muted/40 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0">
                      {grp}
                    </div>
                    {names.map(name => (
                      <button
                        key={name}
                        onClick={() => setSelectedProfile(name)}
                        className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors border-b border-border/20 ${
                          selectedProfile === name
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        {selectedProfile === name && <Check className="w-2.5 h-2.5 shrink-0" />}
                        <span className={selectedProfile === name ? "" : "ml-4"}>{name}</span>
                      </button>
                    ))}
                  </div>
                ))}
                <button className="w-full text-left px-3 py-1.5 rounded text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground flex items-center gap-2 border-t border-dashed border-border mt-1">
                  <Upload className="w-3 h-3" />
                  Import ICC/ICM Profile...
                </button>
              </div>
            </div>

            {/* Rendering settings */}
            <div className="space-y-3">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Rendering Settings
              </label>

              <div className="bg-muted/20 border border-border rounded p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground">Selected Profile</p>
                <p className="text-xs font-semibold text-primary">{selectedProfile}</p>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Rendering Intent</label>
                <Select value={renderingIntent} onValueChange={setRenderingIntent}>
                  <SelectTrigger className="h-7 text-xs bg-muted/40 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Perceptual", "Relative Colorimetric", "Saturation", "Absolute Colorimetric"].map(i => (
                      <SelectItem key={i} value={i} className="text-xs">{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[9px] text-muted-foreground/60 mt-1">
                  {renderingIntent === "Perceptual" ? "Best for photos — compresses entire gamut proportionally" :
                   renderingIntent === "Relative Colorimetric" ? "Preserves in-gamut colors, clips out-of-gamut values" :
                   renderingIntent === "Saturation" ? "Maximizes vividness — ideal for DTF graphics" :
                   "Absolute color values — calibration and proofing only"}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-muted-foreground">Black Point Compensation</span>
                  <p className="text-[9px] text-muted-foreground/60">Preserves shadow detail across profiles</p>
                </div>
                <Switch checked={blackPointComp} onCheckedChange={setBlackPointComp} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-muted-foreground">Gamut Warning Overlay</span>
                  <p className="text-[9px] text-muted-foreground/60">Highlight out-of-gamut colors in preview</p>
                </div>
                <Switch checked={gamutWarning} onCheckedChange={setGamutWarning} />
              </div>

              <div className="bg-blue-900/20 border border-blue-800/30 rounded p-2 space-y-1">
                <p className="text-[10px] font-semibold text-blue-400">Supported File Types</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {["PSD", "PNG", "JPEG", "TIFF", "PDF", "SVG", "AI"].map(f => (
                    <Badge key={f} variant="outline" className="text-[9px] h-4 px-1.5 border-blue-700/50 text-blue-300">{f}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Device-Link Profiles ── */}
        <TabsContent value="devicelinks" className="p-4 m-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] font-semibold text-foreground">Device-Link Profiles</p>
              <span className="text-[9px] text-muted-foreground ml-1">— applied after source → output ICC conversion</span>
            </div>

            <div className="grid grid-cols-2 gap-3 max-h-[420px] overflow-auto">
              {Object.entries(DEVICE_LINK_GROUPS).map(([grp, entries]) => (
                <div key={grp} className="bg-muted/20 border border-border rounded p-2">
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{grp}</p>
                  <div className="flex flex-wrap gap-1">
                    {entries.map(e => (
                      <button
                        key={e.name}
                        onClick={() => setSelectedDL(e.name)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          selectedDL === e.name
                            ? "bg-primary/20 border-primary/40 text-primary"
                            : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedDL && (
              <div className="bg-primary/10 border border-primary/30 rounded p-2 flex items-center gap-2">
                <Check className="w-3 h-3 text-primary shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-primary">{selectedDL}</p>
                  <p className="text-[9px] text-muted-foreground">Active Device-Link profile — applied to all jobs in this queue</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Color Tuneustments ── */}
        <TabsContent value="colortune" className="p-4 m-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Sliders className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] font-semibold text-foreground">Color Tuneustments</p>
              <span className="text-[9px] text-muted-foreground ml-1">— MRX ColorTune profile system</span>
            </div>

            {Object.entries(ECA_GROUPS).map(([grp, entries]) => (
              <div key={grp} className="bg-muted/20 border border-border rounded p-2">
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{grp}</p>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-auto">
                  {entries.map(e => (
                    <button
                      key={e.name}
                      onClick={() => setSelectedECA(e.name)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        selectedECA === e.name
                          ? "bg-primary/20 border-primary/40 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {selectedECA && (
              <div className="bg-primary/10 border border-primary/30 rounded p-2 flex items-center gap-2">
                <Check className="w-3 h-3 text-primary shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-primary">{selectedECA}</p>
                  <p className="text-[9px] text-muted-foreground">Active ColorTune profile</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Spot Color (full library) ── */}
        <TabsContent value="spot" className="p-0 m-0" style={{ height: 440 }}>
          <SpotColorLibrary />
        </TabsContent>

        {/* ── Gamut ── */}
        <TabsContent value="gamut" className="p-4 m-0">
          <div className="space-y-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Printer Gamut Coverage</p>
            <div className="space-y-3">
              {GAMUT_STATS.map(s => (
                <div key={s.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">{s.label}</span>
                    <span className="text-[11px] mono font-semibold text-foreground">{s.value}%</span>
                  </div>
                  <div className="bg-muted rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${s.value}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-muted/30 border border-border rounded p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Manhattan RIP X Color Engine — ET-8550 DTF</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Engine", "Manhattan RIP X"],
                  ["Profiling", "ICC/ICM Device-Link"],
                  ["Delta E Method", "CIEDE2000"],
                  ["Total Ink Limit", "290% (DTF)"],
                  ["Underbase", "CMYW White Ink"],
                  ["ColorTune", "CT Profiles"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[9px] text-muted-foreground">{k}</p>
                    <p className="text-[11px] font-medium text-foreground">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/30 border border-border rounded p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Calibration Status</p>
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[11px] text-green-400">Calibrated — Today 2:34 PM</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["Density","Linearization","Registration"].map((step, i) => (
                  <div key={step} className="bg-muted/40 border border-border rounded p-2 text-center">
                    <div className={`w-5 h-5 rounded-full mx-auto mb-1 flex items-center justify-center text-[9px] font-bold ${
                      i < 2 ? "bg-green-900/40 text-green-400 border border-green-700/50" : "bg-muted border border-border text-muted-foreground"
                    }`}>{i < 2 ? "✓" : i + 1}</div>
                    <p className="text-[10px] font-medium text-foreground">{step}</p>
                    <p className="text-[9px] text-muted-foreground">{i < 2 ? "Complete" : "Optional"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
