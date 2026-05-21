/**
 * Manhattan RIP X — Print Mode Manager
 * Full DF v12 equivalent: halftone type/LPI/angle/dot, TAC limit,
 * per-channel ink limits, white settings, pass count, media type.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PrintMode } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, Copy, Check, Pencil } from "lucide-react";

interface Props {
  deviceId: number;
  onClose?: () => void;
}

const HALFTONE_TYPES = ["stochastic", "AM", "FM", "error_diffusion"] as const;
const DOT_SHAPES     = ["round", "elliptical", "diamond", "square", "line"] as const;
const RENDERING_INTENTS = ["Perceptual", "Relative Colorimetric", "Saturation", "Absolute Colorimetric"] as const;
const PRINT_ORDERS   = ["W_CMYK", "CMYK_W", "W_CMYK_W", "CMYK"] as const;
const MEDIA_TYPES    = ["DTF Film", "DTF Film Matte", "Transfer Paper", "Cotton", "Polyester", "Canvas"] as const;
const RESOLUTIONS    = [360, 600, 720, 1200, 1440, 2880] as const;

const DEFAULT_MODE: Partial<PrintMode> = {
  name: "New Print Mode",
  resolution: 1440,
  colorProfile: "MRX Unified RGB",
  renderingIntent: "Perceptual",
  whiteOpacity: 90,
  whiteChoke: 3,
  cmykDensity: 100,
  printOrder: "W_CMYK",
  passCount: 8,
  mediaType: "DTF Film",
  inkRemoval: 0,
  inkRemovalHoleSize: 10,
  isDefault: false,
  halftoneType: "stochastic",
  halftoneLpi: 60,
  halftoneAngle: 45,
  halftoneDotShape: "round",
  tacLimit: 320,
  inkLimitC: 100,
  inkLimitM: 100,
  inkLimitY: 100,
  inkLimitK: 100,
  inkLimitW: 90,
  whiteFlood: 0,
  whiteDetail: 1,
  blackEnhancement: 0,
  colorBoost: 0,
  description: "",
};

function InkBar({ label, value, color, onChange }: {
  label: string; value: number; color: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-sm border border-border/60 shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-mono w-4 text-muted-foreground">{label}</span>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0} max={100} step={1}
        className="flex-1"
      />
      <input
        type="number"
        value={value}
        min={0} max={100}
        onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
        className="w-10 h-5 text-[10px] font-mono text-center bg-muted/60 border border-border rounded-sm text-foreground"
      />
      <span className="text-[9px] text-muted-foreground w-2">%</span>
    </div>
  );
}

export default function PrintModeManager({ deviceId, onClose }: Props) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<PrintMode>>(DEFAULT_MODE);
  const [dirty, setDirty] = useState(false);

  const { data: modes = [] } = useQuery<PrintMode[]>({
    queryKey: ["/api/print-modes", deviceId],
    queryFn: () => apiRequest("GET", `/api/print-modes?deviceId=${deviceId}`).then(r => r.json()),
  });

  const selected = modes.find(m => m.id === selectedId) ?? null;

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/print-modes", { ...data, deviceId }).then(r => r.json()),
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-modes", deviceId] });
      setSelectedId(m.id);
      setEditing(m);
      setDirty(false);
      toast({ title: "Print mode created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/print-modes/${id}`, data).then(r => r.json()),
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-modes", deviceId] });
      setEditing(m);
      setDirty(false);
      toast({ title: "Saved" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/print-modes/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-modes", deviceId] });
      setSelectedId(null);
      setEditing(DEFAULT_MODE);
      toast({ title: "Print mode deleted" });
    },
  });

  const set = (key: keyof PrintMode, val: any) => {
    setEditing(p => ({ ...p, [key]: val }));
    setDirty(true);
  };

  const handleSelect = (m: PrintMode) => {
    setSelectedId(m.id);
    setEditing({ ...m });
    setDirty(false);
  };

  const handleSave = () => {
    if (selectedId) {
      updateMutation.mutate({ id: selectedId, data: editing });
    } else {
      createMutation.mutate(editing);
    }
  };

  const handleDuplicate = () => {
    if (!selected) return;
    createMutation.mutate({ ...editing, name: `${editing.name} (copy)`, isDefault: false });
  };

  const tacUsed = (editing.inkLimitC ?? 100) + (editing.inkLimitM ?? 100) +
    (editing.inkLimitY ?? 100) + (editing.inkLimitK ?? 100) + (editing.inkLimitW ?? 90);

  return (
    <div className="flex h-full bg-card" style={{ minHeight: 500 }}>
      {/* ── Left: Mode list ───────────────────────────────────────────────── */}
      <div className="w-52 border-r border-border flex flex-col shrink-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-[11px] font-semibold text-foreground">Print Modes</span>
          <button
            onClick={() => { setSelectedId(null); setEditing(DEFAULT_MODE); setDirty(false); }}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="New mode"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => handleSelect(m)}
              className={`w-full text-left px-3 py-2 border-b border-border/30 transition-colors group ${
                selectedId === m.id ? "bg-primary/10 text-primary" : "hover:bg-muted/30 text-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {m.isDefault && <Check className="w-2.5 h-2.5 text-green-400 shrink-0" />}
                <span className="text-[11px] font-medium truncate leading-tight">{m.name}</span>
              </div>
              <span className="text-[9px] text-muted-foreground/70 block mt-0.5">
                {m.resolution}dpi · {m.mediaType}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: Editor ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[12px] font-semibold text-foreground">
              {selectedId ? "Edit Mode" : "New Print Mode"}
              {dirty && <span className="ml-2 text-[9px] text-amber-400 font-normal">● unsaved</span>}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {selectedId && (
              <>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={handleDuplicate}>
                  <Copy className="w-3 h-3 mr-1" /> Duplicate
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-400 hover:text-red-300"
                  onClick={() => selectedId && deleteMutation.mutate(selectedId)}>
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
              </>
            )}
            <Button size="sm" className="h-6 text-[10px] px-3" onClick={handleSave} disabled={!dirty}>
              Save
            </Button>
            {onClose && (
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onClose}>✕</Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
          {/* ── Basic info ──────────────────────────────────────────────── */}
          <Section title="Mode Info">
            <Row label="Name">
              <input
                value={editing.name ?? ""}
                onChange={e => set("name", e.target.value)}
                className="flex-1 h-[22px] text-[11px] bg-muted/60 border border-border rounded-sm px-2 text-foreground focus:outline-none focus:border-primary"
              />
            </Row>
            <Row label="Description">
              <input
                value={(editing as any).description ?? ""}
                onChange={e => set("description" as any, e.target.value)}
                placeholder="Optional description…"
                className="flex-1 h-[22px] text-[11px] bg-muted/60 border border-border rounded-sm px-2 text-foreground/60 focus:outline-none focus:border-primary"
              />
            </Row>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={editing.isDefault ?? false}
                onChange={e => set("isDefault", e.target.checked)}
                className="w-3 h-3"
              />
              <label htmlFor="isDefault" className="text-[10px] text-muted-foreground cursor-pointer select-none">
                Set as default mode
              </label>
            </div>
          </Section>

          {/* ── Print settings ──────────────────────────────────────────── */}
          <Section title="Print Settings">
            <Row label="Resolution">
              <select value={editing.resolution ?? 1440} onChange={e => set("resolution", Number(e.target.value))}
                className="w-32 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                {RESOLUTIONS.map(r => <option key={r} value={r}>{r} dpi</option>)}
              </select>
            </Row>
            <Row label="Pass Count">
              <select value={editing.passCount ?? 8} onChange={e => set("passCount", Number(e.target.value))}
                className="w-32 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                {[1, 2, 4, 6, 8, 10, 12, 16].map(p => <option key={p} value={p}>{p} pass{p > 1 ? "es" : ""}</option>)}
              </select>
            </Row>
            <Row label="Media Type">
              <select value={editing.mediaType ?? "DTF Film"} onChange={e => set("mediaType", e.target.value)}
                className="w-40 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                {MEDIA_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Row>
            <Row label="Print Order">
              <select value={editing.printOrder ?? "W_CMYK"} onChange={e => set("printOrder", e.target.value)}
                className="w-40 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                {PRINT_ORDERS.map(o => <option key={o} value={o}>{o.replace(/_/g, " → ")}</option>)}
              </select>
            </Row>
          </Section>

          {/* ── Color Management ────────────────────────────────────────── */}
          <Section title="Color Management">
            <Row label="Color Profile">
              <input value={editing.colorProfile ?? "MRX Unified RGB"}
                onChange={e => set("colorProfile", e.target.value)}
                className="flex-1 h-[22px] text-[11px] bg-muted/60 border border-border rounded-sm px-2 text-foreground focus:outline-none focus:border-primary" />
            </Row>
            <Row label="Rendering Intent">
              <select value={editing.renderingIntent ?? "Perceptual"} onChange={e => set("renderingIntent", e.target.value)}
                className="w-56 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                {RENDERING_INTENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Row>
            <Row label="CMYK Density">
              <div className="flex items-center gap-2 flex-1">
                <Slider value={[editing.cmykDensity ?? 100]} onValueChange={([v]) => set("cmykDensity", v)}
                  min={50} max={100} step={1} className="flex-1" />
                <span className="text-[10px] font-mono w-8 text-right text-foreground">{editing.cmykDensity ?? 100}%</span>
              </div>
            </Row>
            <Row label="Color Boost">
              <div className="flex items-center gap-2 flex-1">
                <Slider value={[editing.colorBoost ?? 0]} onValueChange={([v]) => set("colorBoost", v)}
                  min={-20} max={20} step={1} className="flex-1" />
                <span className={`text-[10px] font-mono w-8 text-right ${(editing.colorBoost ?? 0) > 0 ? "text-green-400" : (editing.colorBoost ?? 0) < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                  {(editing.colorBoost ?? 0) > 0 ? "+" : ""}{editing.colorBoost ?? 0}
                </span>
              </div>
            </Row>
            <Row label="Black Enhancement">
              <div className="flex items-center gap-2 flex-1">
                <Slider value={[editing.blackEnhancement ?? 0]} onValueChange={([v]) => set("blackEnhancement", v)}
                  min={0} max={20} step={1} className="flex-1" />
                <span className="text-[10px] font-mono w-8 text-right text-foreground">{editing.blackEnhancement ?? 0}</span>
              </div>
            </Row>
          </Section>

          {/* ── Halftone Screening ──────────────────────────────────────── */}
          <Section title="Halftone Screening">
            <Row label="Type">
              <select value={editing.halftoneType ?? "stochastic"} onChange={e => set("halftoneType", e.target.value)}
                className="w-44 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                <option value="stochastic">Stochastic (FM)</option>
                <option value="AM">Conventional AM</option>
                <option value="FM">FM Hybrid</option>
                <option value="error_diffusion">Error Diffusion</option>
              </select>
            </Row>
            {(editing.halftoneType === "AM" || editing.halftoneType === "FM") && (
              <>
                <Row label="LPI (lines/in)">
                  <input type="number" value={editing.halftoneLpi ?? 60} min={20} max={200}
                    onChange={e => set("halftoneLpi", Number(e.target.value))}
                    className="w-20 h-[22px] text-[10px] font-mono bg-muted/60 border border-border rounded-sm px-2 text-foreground" />
                </Row>
                <Row label="Angle (°)">
                  <input type="number" value={editing.halftoneAngle ?? 45} min={0} max={360}
                    onChange={e => set("halftoneAngle", Number(e.target.value))}
                    className="w-20 h-[22px] text-[10px] font-mono bg-muted/60 border border-border rounded-sm px-2 text-foreground" />
                </Row>
                <Row label="Dot Shape">
                  <select value={editing.halftoneDotShape ?? "round"} onChange={e => set("halftoneDotShape", e.target.value)}
                    className="w-36 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                    {DOT_SHAPES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </Row>
              </>
            )}
          </Section>

          {/* ── White Channel ───────────────────────────────────────────── */}
          <Section title="White Channel (DTF)">
            <Row label="White Opacity">
              <div className="flex items-center gap-2 flex-1">
                <Slider value={[editing.whiteOpacity ?? 90]} onValueChange={([v]) => set("whiteOpacity", v)}
                  min={0} max={100} step={1} className="flex-1" />
                <span className="text-[10px] font-mono w-8 text-right text-foreground">{editing.whiteOpacity ?? 90}%</span>
              </div>
            </Row>
            <Row label="White Choke (px)">
              <input type="number" value={editing.whiteChoke ?? 3} min={0} max={20}
                onChange={e => set("whiteChoke", Number(e.target.value))}
                className="w-16 h-[22px] text-[10px] font-mono bg-muted/60 border border-border rounded-sm px-2 text-foreground" />
            </Row>
            <div className="flex items-center gap-4 mt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={!!editing.whiteFlood} onChange={e => set("whiteFlood", e.target.checked ? 1 : 0)} className="w-3 h-3" />
                <span className="text-[10px] text-muted-foreground">White Flood (extra pass)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={!!editing.whiteDetail} onChange={e => set("whiteDetail", e.target.checked ? 1 : 0)} className="w-3 h-3" />
                <span className="text-[10px] text-muted-foreground">White Detail Mode</span>
              </label>
            </div>
          </Section>

          {/* ── Ink Limits & TAC ────────────────────────────────────────── */}
          <Section title="Ink Limits & TAC">
            <div className="space-y-1.5 mb-3">
              <InkBar label="C" value={editing.inkLimitC ?? 100} color="#00aeef" onChange={v => set("inkLimitC", v)} />
              <InkBar label="M" value={editing.inkLimitM ?? 100} color="#ec008c" onChange={v => set("inkLimitM", v)} />
              <InkBar label="Y" value={editing.inkLimitY ?? 100} color="#ffd700" onChange={v => set("inkLimitY", v)} />
              <InkBar label="K" value={editing.inkLimitK ?? 100} color="#444" onChange={v => set("inkLimitK", v)} />
              <InkBar label="W" value={editing.inkLimitW ?? 90} color="#ddd" onChange={v => set("inkLimitW", v)} />
            </div>
            <Row label="TAC Limit">
              <div className="flex items-center gap-2 flex-1">
                <Slider value={[editing.tacLimit ?? 320]} onValueChange={([v]) => set("tacLimit", v)}
                  min={100} max={400} step={5} className="flex-1" />
                <span className={`text-[10px] font-mono w-10 text-right font-semibold ${
                  (editing.tacLimit ?? 320) > 350 ? "text-red-400" :
                  (editing.tacLimit ?? 320) > 300 ? "text-amber-400" : "text-green-400"
                }`}>{editing.tacLimit ?? 320}%</span>
              </div>
            </Row>
            {/* TAC usage preview bar */}
            <div className="mt-1">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-1">
                <span>Max possible ink usage (sum of limits)</span>
                <span className={tacUsed > (editing.tacLimit ?? 320) ? "text-amber-400" : "text-green-400"}>{tacUsed}%</span>
              </div>
              <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (tacUsed / 400) * 100)}%`,
                    backgroundColor: tacUsed > (editing.tacLimit ?? 320) ? "#f59e0b" : "#22c55e",
                  }} />
              </div>
            </div>
          </Section>

          {/* ── Ink Removal ─────────────────────────────────────────────── */}
          <Section title="Ink Removal (Holes)">
            <Row label="Ink Removal">
              <div className="flex items-center gap-2 flex-1">
                <Slider value={[editing.inkRemoval ?? 0]} onValueChange={([v]) => set("inkRemoval", v)}
                  min={0} max={100} step={1} className="flex-1" />
                <span className="text-[10px] font-mono w-8 text-right text-foreground">{editing.inkRemoval ?? 0}%</span>
              </div>
            </Row>
            {(editing.inkRemoval ?? 0) > 0 && (
              <Row label="Hole Size (px)">
                <input type="number" value={editing.inkRemovalHoleSize ?? 10} min={1} max={100}
                  onChange={e => set("inkRemovalHoleSize", Number(e.target.value))}
                  className="w-16 h-[22px] text-[10px] font-mono bg-muted/60 border border-border rounded-sm px-2 text-foreground" />
              </Row>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 pb-1 border-b border-border/40">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2">{children}</div>
    </div>
  );
}
