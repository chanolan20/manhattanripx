/**
 * ColorTuneDialog — per-job color adjust dialog
 * Right-click job → "Color Adjust" opens this 3-tab dialog
 * Tabs: Color Adjust | Processing Options | Ink Removal
 * MRX ColorTune color adjustment dialog
 */
import { useState } from "react";
import type { Job } from "@shared/schema";
import { X, Sliders, Settings2, Droplets, RotateCcw, Check, Monitor, Image } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Props {
  job: Job;
  onClose: () => void;
  onApply: (id: number, data: Partial<Job>) => void;
}

type RenderMode = "photo" | "graphic";
type HoleShape = "round" | "square" | "diamond" | "lines";

export default function ColorTuneDialog({ job, onClose, onApply }: Props) {
  // ── Color Adjust tab ──────────────────────────────────────────────────────
  const [cyan,    setCyan]    = useState(0);
  const [magenta, setMagenta] = useState(0);
  const [yellow,  setYellow]  = useState(0);
  const [black,   setBlack]   = useState(0);
  const [brightness, setBrightness] = useState(job.colorAdjustBrightness ?? 0);
  const [saturation, setSaturation] = useState(job.colorAdjustSaturation ?? 0);
  const [renderMode, setRenderMode] = useState<RenderMode>("graphic");

  // ── Processing Options tab ────────────────────────────────────────────────
  const [maxWhitePct,     setMaxWhitePct]     = useState(job.whiteOpacityOverride ?? 90);
  const [choke,           setChoke]           = useState(job.whiteChokeOverride ?? 3);
  const [whiteUnderBlack, setWhiteUnderBlack] = useState(false);

  // ── Ink Removal tab ───────────────────────────────────────────────────────
  const [irEnabled,   setIrEnabled]   = useState(false);
  const [irFreq,      setIrFreq]      = useState(45);
  const [irAngle,     setIrAngle]     = useState(45);
  const [irShape,     setIrShape]     = useState<HoleShape>("round");
  const [irHoleSize,  setIrHoleSize]  = useState(10);

  const handleApply = () => {
    onApply(job.id, {
      colorAdjustBrightness: brightness,
      colorAdjustContrast:   0,
      colorAdjustSaturation: saturation,
      whiteOpacityOverride:  maxWhitePct,
      whiteChokeOverride:    choke,
    });
    onClose();
  };

  const handleReset = () => {
    setCyan(0); setMagenta(0); setYellow(0); setBlack(0);
    setBrightness(0); setSaturation(0); setRenderMode("graphic");
    setMaxWhitePct(90); setChoke(3); setWhiteUnderBlack(false);
    setIrEnabled(false); setIrFreq(45); setIrAngle(45); setIrShape("round"); setIrHoleSize(10);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-[520px] shadow-2xl"
        onClick={e => e.stopPropagation()}
        data-testid="easy-color-adj-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Color Adjust</h2>
            <p className="text-[10px] text-muted-foreground truncate max-w-[340px]">
              {job.name}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Tabs defaultValue="color" className="flex-1">
          <TabsList className="mx-4 mt-3 grid grid-cols-3 bg-muted/40">
            <TabsTrigger value="color" className="text-xs gap-1">
              <Sliders className="w-3 h-3" />Color Adjust
            </TabsTrigger>
            <TabsTrigger value="processing" className="text-xs gap-1">
              <Settings2 className="w-3 h-3" />Processing
            </TabsTrigger>
            <TabsTrigger value="ink-removal" className="text-xs gap-1">
              <Droplets className="w-3 h-3" />Ink Removal
            </TabsTrigger>
          </TabsList>

          {/* ── Color Adjust ── */}
          <TabsContent value="color" className="px-4 pb-2 pt-3 m-0 space-y-3">
            {/* Render mode toggle */}
            <div className="flex items-center gap-1 bg-muted/30 rounded p-1 w-fit">
              <button
                onClick={() => setRenderMode("graphic")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                  renderMode === "graphic" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Image className="w-3 h-3" />Graphic
              </button>
              <button
                onClick={() => setRenderMode("photo")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                  renderMode === "photo" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Monitor className="w-3 h-3" />Photo
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground/60 -mt-1">
              {renderMode === "photo"
                ? "Photo mode — smooth tonal gradients, low sharpening"
                : "Graphic mode — high sharpening, vivid solids"}
            </p>

            {/* CMYK sliders */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">CMYK Channel Adjust</p>
              {[
                { label: "Cyan",    val: cyan,    set: setCyan,    color: "text-cyan-400",    track: "bg-cyan-500" },
                { label: "Magenta", val: magenta, set: setMagenta, color: "text-pink-400",    track: "bg-pink-500" },
                { label: "Yellow",  val: yellow,  set: setYellow,  color: "text-yellow-400",  track: "bg-yellow-500" },
                { label: "Black",   val: black,   set: setBlack,   color: "text-zinc-300",    track: "bg-zinc-400" },
              ].map(({ label, val, set, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold w-14 ${color}`}>{label}</span>
                  <Slider
                    value={[val]}
                    min={-50} max={50} step={1}
                    onValueChange={([v]) => set(v)}
                    className="flex-1"
                  />
                  <span className="text-[10px] mono text-foreground w-8 text-right">{val > 0 ? `+${val}` : val}</span>
                </div>
              ))}
            </div>

            {/* Brightness / Saturation */}
            <div className="space-y-2 pt-1 border-t border-border/40">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Global</p>
              {[
                { label: "Brightness", val: brightness, set: setBrightness },
                { label: "Saturation", val: saturation, set: setSaturation },
              ].map(({ label, val, set }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-16">{label}</span>
                  <Slider
                    value={[val]}
                    min={-100} max={100} step={1}
                    onValueChange={([v]) => set(v)}
                    className="flex-1"
                  />
                  <span className="text-[10px] mono text-foreground w-8 text-right">{val > 0 ? `+${val}` : val}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Processing Options ── */}
          <TabsContent value="processing" className="px-4 pb-2 pt-3 m-0 space-y-3">
            <AdjRow label="Max White Ink %" hint="Limit total white ink coverage (recommended: 80–100%)">
              <Slider
                value={[maxWhitePct]}
                min={0} max={100} step={5}
                onValueChange={([v]) => setMaxWhitePct(v)}
                className="flex-1"
              />
              <span className="text-[10px] mono text-foreground w-8 text-right">{maxWhitePct}%</span>
            </AdjRow>

            <AdjRow label="Choke (px)" hint="Shrink white underbase inward to prevent halo bleed">
              <Slider
                value={[choke]}
                min={0} max={10} step={1}
                onValueChange={([v]) => setChoke(v)}
                className="flex-1"
              />
              <span className="text-[10px] mono text-foreground w-8 text-right">{choke}px</span>
            </AdjRow>

            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <div>
                <span className="text-[11px] text-muted-foreground">White Under Black</span>
                <p className="text-[9px] text-muted-foreground/60">Print white layer beneath black areas (dark fabric)</p>
              </div>
              <Switch checked={whiteUnderBlack} onCheckedChange={setWhiteUnderBlack} />
            </div>

            <div className="bg-muted/20 border border-border rounded p-2 mt-1">
              <p className="text-[9px] text-muted-foreground/70">
                <span className="text-primary font-semibold">Tip:</span> For dark garments use Max White 90–100%, Choke 2–3px.
                For light garments reduce Max White to 60–70%.
              </p>
            </div>
          </TabsContent>

          {/* ── Ink Removal ── */}
          <TabsContent value="ink-removal" className="px-4 pb-2 pt-3 m-0 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-muted-foreground font-medium">Enable Ink Removal</span>
                <p className="text-[9px] text-muted-foreground/60">
                  Adds regular holes/stripes to reduce ink usage (Dark Film Transfer style)
                </p>
              </div>
              <Switch checked={irEnabled} onCheckedChange={setIrEnabled} />
            </div>

            {irEnabled && (
              <div className="space-y-3 pt-1 border-t border-border/40">
                <AdjRow label="Frequency" hint="Holes per inch — lower = larger, fewer holes">
                  <Slider value={[irFreq]} min={10} max={100} step={5} onValueChange={([v]) => setIrFreq(v)} className="flex-1" />
                  <span className="text-[10px] mono text-foreground w-10 text-right">{irFreq} lpi</span>
                </AdjRow>

                <AdjRow label="Angle" hint="Screen angle of the hole pattern">
                  <Slider value={[irAngle]} min={0} max={90} step={15} onValueChange={([v]) => setIrAngle(v)} className="flex-1" />
                  <span className="text-[10px] mono text-foreground w-8 text-right">{irAngle}°</span>
                </AdjRow>

                <AdjRow label="Hole Size" hint="Pixel diameter of each removal hole">
                  <Slider value={[irHoleSize]} min={5} max={50} step={5} onValueChange={([v]) => setIrHoleSize(v)} className="flex-1" />
                  <span className="text-[10px] mono text-foreground w-8 text-right">{irHoleSize}px</span>
                </AdjRow>

                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Hole Shape</label>
                  <Select value={irShape} onValueChange={v => setIrShape(v as HoleShape)}>
                    <SelectTrigger className="h-7 text-xs bg-muted/40 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["round","square","diamond","lines"] as HoleShape[]).map(s => (
                        <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Visual preview of pattern */}
                <div className="bg-muted/30 border border-border rounded p-2 flex items-center gap-3">
                  <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-3 h-3 bg-foreground/20"
                        style={{
                          borderRadius: irShape === "round" ? "50%" : irShape === "diamond" ? "2px" : "0",
                          transform: irShape === "diamond" ? "rotate(45deg)" : "none",
                          opacity: 0.6,
                        }}
                      />
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-foreground capitalize">{irShape} pattern</p>
                    <p className="text-[9px] text-muted-foreground">{irFreq} lpi · {irAngle}° · {irHoleSize}px</p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border mt-1">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3 h-3" />Reset All
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="h-7 px-4 text-xs gap-1" onClick={handleApply}>
              <Check className="w-3 h-3" />Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdjRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-muted-foreground w-28 shrink-0">{label}</span>
        {children}
      </div>
      {hint && <p className="text-[9px] text-muted-foreground/50 ml-28">{hint}</p>}
    </div>
  );
}
