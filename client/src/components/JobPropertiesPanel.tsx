import type { Job } from "@shared/schema";
import { useState, useEffect } from "react";
import { Sliders, RotateCw, Info } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Props {
  job: Job | null;
  onUpdate: (data: Partial<Job>) => void;
}

// ── ColorTune profile name helpers ─────────────────────────────────────
// MRX ColorTune naming: Brightness = B-20..B20, Saturation = S1..S20
function brightnessToECA(val: number): string {
  if (val === 0) return "—";
  if (val < 0) return `CT-B${val}`; // e.g. CT-B-5
  return `CT-B${val}`;              // e.g. CT-B5
}
function saturationToECA(val: number): string {
  if (val <= 0) return "—";
  return `CT-S${val}`;
}

export default function JobPropertiesPanel({ job, onUpdate }: Props) {
  const [local, setLocal] = useState<Partial<Job>>({});

  useEffect(() => {
    if (job) {
      setLocal({
        copies: job.copies,
        rotation: job.rotation,
        scalePercent: job.scalePercent,
        width: job.width,
        height: job.height,
        colorAdjustBrightness: job.colorAdjustBrightness,
        colorAdjustContrast: job.colorAdjustContrast,
        colorAdjustSaturation: job.colorAdjustSaturation,
        whiteOpacityOverride: job.whiteOpacityOverride,
        whiteChokeOverride: job.whiteChokeOverride,
      });
    }
  }, [job?.id]);

  const handleChange = (key: keyof Job, value: any) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    if (job) onUpdate(local);
  };

  if (!job) {
    return (
      <div className="flex flex-col h-full" data-testid="job-properties-panel">
        <div className="panel-header">
          <span className="panel-title">Job Properties</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <Sliders className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/50">Select a job to edit properties</p>
          </div>
        </div>
      </div>
    );
  }

  const brightness = local.colorAdjustBrightness ?? 0;
  const saturation = local.colorAdjustSaturation ?? 0;
  // Clamp brightness to B-20..B20, saturation to S0..S20
  const ecaBrightness = brightnessToECA(Math.max(-20, Math.min(20, brightness)));
  const ecaSaturation = saturationToECA(Math.max(0, Math.min(20, saturation)));

  // Supported file types from feature flags
  const supportedTypes = ["PNG","JPEG","PSD","PDF","SVG","TIFF","AI","EPS","BMP"];
  const fileExt = job.fileType?.toUpperCase();
  const isSupported = supportedTypes.includes(fileExt);

  return (
    <div className="flex flex-col h-full" data-testid="job-properties-panel">
      <div className="panel-header">
        <span className="panel-title">Job Properties</span>
        <span className="text-[10px] text-primary truncate max-w-[120px]">{job.name.replace(/\.[^.]+$/, "")}</span>
      </div>

      <Tabs defaultValue="layout" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="h-7 grid grid-cols-3 mx-2 mt-2 bg-muted/40">
          <TabsTrigger value="layout" className="text-[10px] h-5">Layout</TabsTrigger>
          <TabsTrigger value="color" className="text-[10px] h-5">Color</TabsTrigger>
          <TabsTrigger value="ink" className="text-[10px] h-5">Ink</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          {/* Layout tab */}
          <TabsContent value="layout" className="p-2 space-y-3 m-0">
            {/* File info */}
            <Section title="File">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[9px] h-4 px-1.5 ${isSupported ? "border-green-700/50 text-green-400" : "border-amber-700/50 text-amber-400"}`}
                >
                  {fileExt}
                </Badge>
                <span className="text-[10px] text-muted-foreground truncate">{job.fileName}</span>
              </div>
            </Section>

            {/* Size */}
            <Section title="Size">
              <div className="grid grid-cols-2 gap-2">
                <Field label='Width (in)'>
                  <NumInput
                    value={local.width ?? job.width}
                    onChange={v => handleChange("width", v)}
                    step={0.1}
                    min={0.1}
                    max={13}
                  />
                </Field>
                <Field label='Height (in)'>
                  <NumInput
                    value={local.height ?? job.height}
                    onChange={v => handleChange("height", v)}
                    step={0.1}
                    min={0.1}
                    max={60}
                  />
                </Field>
              </div>
            </Section>

            {/* Scale */}
            <Section title="Scale">
              <SliderField
                label="Scale %"
                value={local.scalePercent ?? job.scalePercent}
                min={10}
                max={400}
                step={5}
                onChange={v => handleChange("scalePercent", v)}
              />
              <div className="flex gap-1 mt-1">
                {[50, 75, 100, 150, 200].map(v => (
                  <button
                    key={v}
                    className={`flex-1 text-[9px] py-0.5 rounded border transition-colors ${
                      (local.scalePercent ?? job.scalePercent) === v
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                    onClick={() => handleChange("scalePercent", v)}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </Section>

            {/* Rotation */}
            <Section title="Rotation">
              <div className="flex gap-1">
                {[0, 90, 180, 270].map(r => (
                  <button
                    key={r}
                    className={`flex-1 flex flex-col items-center py-1.5 rounded border text-[9px] transition-colors ${
                      (local.rotation ?? job.rotation) === r
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                    onClick={() => handleChange("rotation", r)}
                  >
                    <RotateCw className="w-3 h-3 mb-0.5" style={{ transform: `rotate(${r}deg)` }} />
                    {r}°
                  </button>
                ))}
              </div>
            </Section>

            {/* Copies */}
            <Section title="Copies">
              <div className="flex items-center gap-2">
                <button
                  className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground text-xs transition-colors"
                  onClick={() => handleChange("copies", Math.max(1, (local.copies ?? job.copies) - 1))}
                >-</button>
                <span className="text-sm font-semibold text-foreground mono w-6 text-center">{local.copies ?? job.copies}</span>
                <button
                  className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground text-xs transition-colors"
                  onClick={() => handleChange("copies", Math.min(999, (local.copies ?? job.copies) + 1))}
                >+</button>
                <span className="text-[10px] text-muted-foreground">copies</span>
              </div>
            </Section>
          </TabsContent>

          {/* Color tab — Color Tuneustments with real CT profile mapping */}
          <TabsContent value="color" className="p-2 space-y-3 m-0">
            <Section title="Color Tuneustments">
              {/* Brightness — B-20 to B20 */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-muted-foreground">Brightness</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] mono text-primary/80">{ecaBrightness}</span>
                    <span className="text-[10px] mono font-semibold text-foreground">{brightness}</span>
                    <button className="text-[9px] text-muted-foreground hover:text-foreground" onClick={() => handleChange("colorAdjustBrightness", 0)}>↺</button>
                  </div>
                </div>
                <Slider
                  value={[Math.max(-20, Math.min(20, brightness))]}
                  min={-20} max={20} step={1}
                  onValueChange={([v]) => handleChange("colorAdjustBrightness", v)}
                  className="w-full"
                />
                <div className="flex justify-between mt-0.5">
                  <span className="text-[9px] text-muted-foreground/50">B-20</span>
                  <span className="text-[9px] text-muted-foreground/50">B20</span>
                </div>
              </div>

              {/* Contrast */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-muted-foreground">Contrast</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] mono font-semibold text-foreground">{local.colorAdjustContrast ?? 0}</span>
                    <button className="text-[9px] text-muted-foreground hover:text-foreground" onClick={() => handleChange("colorAdjustContrast", 0)}>↺</button>
                  </div>
                </div>
                <Slider
                  value={[local.colorAdjustContrast ?? 0]}
                  min={-100} max={100} step={5}
                  onValueChange={([v]) => handleChange("colorAdjustContrast", v)}
                  className="w-full"
                />
              </div>

              {/* Saturation — S1 to S20 */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-muted-foreground">Saturation</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] mono text-primary/80">{ecaSaturation}</span>
                    <span className="text-[10px] mono font-semibold text-foreground">{saturation}</span>
                    <button className="text-[9px] text-muted-foreground hover:text-foreground" onClick={() => handleChange("colorAdjustSaturation", 0)}>↺</button>
                  </div>
                </div>
                <Slider
                  value={[Math.max(0, Math.min(20, saturation))]}
                  min={0} max={20} step={1}
                  onValueChange={([v]) => handleChange("colorAdjustSaturation", v)}
                  className="w-full"
                />
                <div className="flex justify-between mt-0.5">
                  <span className="text-[9px] text-muted-foreground/50">S1</span>
                  <span className="text-[9px] text-muted-foreground/50">S20</span>
                </div>
              </div>
            </Section>

            <div className="flex items-start gap-1.5 bg-blue-900/20 border border-blue-800/30 rounded p-2">
              <Info className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-blue-300/80">
                Color Tuneustments use real MRX CT profiles (CT series). Values override print mode defaults for this job only.
              </p>
            </div>
          </TabsContent>

          {/* Ink tab — Underbase (not "White Underbase") */}
          <TabsContent value="ink" className="p-2 space-y-3 m-0">
            <Section title="Underbase Overrides">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">Use print mode defaults</span>
                <button
                  className="text-[9px] text-primary hover:underline"
                  onClick={() => { handleChange("whiteOpacityOverride", null); handleChange("whiteChokeOverride", null); }}
                >Reset</button>
              </div>

              <SliderField
                label="Underbase Opacity Override"
                value={local.whiteOpacityOverride ?? 90}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={v => handleChange("whiteOpacityOverride", v)}
                highlighted={local.whiteOpacityOverride != null}
              />
              <SliderField
                label="Underbase Choke Override"
                value={local.whiteChokeOverride ?? 3}
                min={0}
                max={10}
                step={1}
                unit="px"
                onChange={v => handleChange("whiteChokeOverride", v)}
                highlighted={local.whiteChokeOverride != null}
              />
              <div className="text-[9px] text-muted-foreground/60 space-y-0.5">
                <p>• 2–3px choke: color substrates</p>
                <p>• 4–5px choke: black/dark substrates</p>
                <p>• &gt;5px: check printer alignment</p>
              </div>
            </Section>

            <Section title="Ink Cost Estimate">
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold mono text-foreground">${job.inkCost.toFixed(3)}</span>
                <span className="text-[10px] text-muted-foreground">per transfer</span>
              </div>
              <div className="mt-1 space-y-1">
                {[
                  { ch: "C", color: "hsl(186 100% 41%)", pct: 18 },
                  { ch: "M", color: "hsl(321 100% 50%)", pct: 22 },
                  { ch: "Y", color: "hsl(60 100% 40%)", pct: 15 },
                  { ch: "K", color: "hsl(0 0% 25%)", pct: 10 },
                  { ch: "W", color: "hsl(0 0% 90%)", pct: 35, border: true },
                ].map((ink) => (
                  <div key={ink.ch} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: ink.color, border: ink.border ? "1px solid hsl(var(--border))" : undefined }}
                    />
                    <span className="text-[10px] mono text-muted-foreground w-3">{ink.ch}</span>
                    <div className="flex-1 bg-muted rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${ink.pct}%`, backgroundColor: ink.color }} />
                    </div>
                    <span className="text-[9px] mono text-muted-foreground w-6">{ink.pct}%</span>
                  </div>
                ))}
              </div>
            </Section>
          </TabsContent>
        </div>

        {/* Apply button */}
        <div className="border-t border-border p-2">
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleApply}
            data-testid="btn-apply-properties"
          >
            Apply Changes
          </Button>
        </div>
      </Tabs>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, step = 1, min, max }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <Input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="h-6 text-xs mono bg-muted/40 border-border"
    />
  );
}

function SliderField({ label, value, min, max, step, unit, onChange, highlighted }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void; highlighted?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] ${highlighted ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
        <span className="text-[10px] mono font-semibold text-foreground">{value}{unit || ""}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}
