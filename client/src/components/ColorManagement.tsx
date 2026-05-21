/**
 * Manhattan RIP X — Color Management (v2.1 — full DF v12 ICC pipeline)
 *
 * Panels:
 *  - ICC Source Profile
 *  - ICC Destination Profile
 *  - Rendering Intent
 *  - Ink Limits (global — per-mode overrides in PrintModeManager)
 *  - Soft Proof settings
 *  - White Channel global settings
 *  - CMYK Curve adjustments
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IccProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface Props { onClose?: () => void; }

const RENDERING_INTENTS = [
  { value: "Perceptual", desc: "Best for photos — maps colors smoothly, may shift hues" },
  { value: "Relative Colorimetric", desc: "Best for logos — preserves in-gamut colors exactly, clips out-of-gamut" },
  { value: "Saturation", desc: "Best for bright graphics — maximizes vivid colors" },
  { value: "Absolute Colorimetric", desc: "Proofing — simulates source device exactly including white point" },
] as const;

const BUILT_IN_SOURCE_PROFILES = [
  "sRGB IEC61966-2.1",
  "Adobe RGB (1998)",
  "Display P3",
  "ProPhoto RGB",
  "CMYK Generic",
  "U.S. Web Coated (SWOP) v2",
];

const BUILT_IN_DEST_PROFILES = [
  "MRX Unified RGB",
  "CADlink Unified RGB",
  "DL — Photo 8Color DTF",
  "DL — CMYW Forever Dark Transfer",
  "Epson ET-8550 DTF v2.1",
  "Generic CMYK",
];

export default function ColorManagement({ onClose }: Props) {
  const { toast } = useToast();

  // ── Global color settings pulled from /api/settings ──────────────────────
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    queryFn: () => apiRequest("GET", "/api/settings").then(r => r.json()),
  });

  const { data: profiles = [] } = useQuery<IccProfile[]>({
    queryKey: ["/api/icc-profiles"],
    queryFn: () => apiRequest("GET", "/api/icc-profiles").then(r => r.json()),
  });

  const saveSettings = useMutation({
    mutationFn: (data: Record<string, string>) => apiRequest("PATCH", "/api/settings", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Color settings saved" });
    },
  });

  const [local, setLocal] = useState<Record<string, string>>({});
  const merged = { ...settings, ...local };

  const set = (key: string, val: string) => setLocal(p => ({ ...p, [key]: val }));
  const getNum = (key: string, def: number) => Number(merged[key] ?? def);
  const getStr = (key: string, def: string) => merged[key] ?? def;

  const allProfiles = [
    ...BUILT_IN_DEST_PROFILES,
    ...profiles.map(p => p.name).filter(n => !BUILT_IN_DEST_PROFILES.includes(n)),
  ];

  const [activeTab, setActiveTab] = useState<"icc" | "curves" | "white" | "softproof">("icc");

  const handleSave = () => saveSettings.mutate(local);

  const CurveChannel = ({ ch, color }: { ch: "C" | "M" | "Y" | "K"; color: string }) => {
    const shadow  = getNum(`curve_${ch}_shadow`, 0);
    const midtone = getNum(`curve_${ch}_midtone`, 0);
    const high    = getNum(`curve_${ch}_highlight`, 0);
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: color }} />
          <span className="text-[10px] font-semibold text-foreground">{ch}</span>
        </div>
        {[
          { label: "Shadow",    key: `curve_${ch}_shadow`,    val: shadow },
          { label: "Midtone",   key: `curve_${ch}_midtone`,   val: midtone },
          { label: "Highlight", key: `curve_${ch}_highlight`, val: high },
        ].map(({ label, key, val }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground w-14">{label}</span>
            <Slider value={[val]} onValueChange={([v]) => set(key, String(v))}
              min={-50} max={50} step={1} className="flex-1" />
            <span className={`text-[9px] font-mono w-7 text-right ${val > 0 ? "text-green-400" : val < 0 ? "text-red-400" : "text-muted-foreground"}`}>
              {val > 0 ? "+" : ""}{val}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-card" style={{ minHeight: 480 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
        <span className="text-[13px] font-semibold text-foreground">Color Management</span>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-6 text-[10px] px-3" onClick={handleSave} disabled={Object.keys(local).length === 0 || saveSettings.isPending}>
            {saveSettings.isPending ? "Saving…" : "Save"}
          </Button>
          {onClose && <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onClose}>✕</Button>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-border px-3 bg-muted/10 shrink-0">
        {[
          { id: "icc",       label: "ICC Profiles" },
          { id: "curves",    label: "Channel Curves" },
          { id: "white",     label: "White Channel" },
          { id: "softproof", label: "Soft Proof" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)}
            className={`px-4 h-8 text-[11px] border-b-2 transition-colors ${
              activeTab === t.id ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">

        {/* ── ICC Profiles tab ─────────────────────────────────────────── */}
        {activeTab === "icc" && (
          <div className="space-y-5">
            {/* Source profile */}
            <Section title="Source Profile (Input)">
              <p className="text-[10px] text-muted-foreground/70 mb-2">
                The color space of your incoming artwork file.
              </p>
              <Row label="Source Profile">
                <select value={getStr("icc_source_profile", "sRGB IEC61966-2.1")}
                  onChange={e => set("icc_source_profile", e.target.value)}
                  className="flex-1 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                  {BUILT_IN_SOURCE_PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
                  {profiles.filter(p => p.colorSpace !== "output").map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </Row>
            </Section>

            {/* Destination profile */}
            <Section title="Destination Profile (Output / Printer)">
              <p className="text-[10px] text-muted-foreground/70 mb-2">
                The ICC profile that describes your printer+ink+media combination.
              </p>
              <Row label="Destination Profile">
                <select value={getStr("icc_dest_profile", "MRX Unified RGB")}
                  onChange={e => set("icc_dest_profile", e.target.value)}
                  className="flex-1 h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1.5 text-foreground">
                  {allProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Row>
            </Section>

            {/* Rendering intent */}
            <Section title="Rendering Intent">
              <div className="space-y-1.5">
                {RENDERING_INTENTS.map(ri => (
                  <label key={ri.value}
                    className={`flex items-start gap-2 p-2 rounded-sm border cursor-pointer transition-colors ${
                      getStr("rendering_intent", "Perceptual") === ri.value
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/40 hover:border-border"
                    }`}>
                    <input type="radio"
                      checked={getStr("rendering_intent", "Perceptual") === ri.value}
                      onChange={() => set("rendering_intent", ri.value)}
                      className="mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[11px] font-medium text-foreground">{ri.value}</span>
                      <p className="text-[9px] text-muted-foreground/70 mt-0.5">{ri.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </Section>

            {/* Available profiles list */}
            <Section title="Installed ICC Profiles">
              <div className="border border-border rounded-sm overflow-hidden">
                {profiles.map((p, i) => (
                  <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 text-[10px] ${i % 2 === 0 ? "bg-muted/20" : "bg-transparent"}`}>
                    <span className="w-16 text-muted-foreground/60 font-mono text-[9px]">{p.colorSpace}</span>
                    <span className="flex-1 text-foreground truncate">{p.name}</span>
                    {p.isBuiltIn && <span className="text-[8px] text-primary/60 border border-primary/30 px-1 rounded">Built-in</span>}
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* ── Channel Curves tab ───────────────────────────────────────── */}
        {activeTab === "curves" && (
          <div className="space-y-4">
            <p className="text-[10px] text-muted-foreground/70">
              Per-channel shadow/midtone/highlight adjustments applied globally during RIP.
              These are additive — job-level Easy Color Adjustments stack on top.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <CurveChannel ch="C" color="#00aeef" />
              <CurveChannel ch="M" color="#ec008c" />
              <CurveChannel ch="Y" color="#ffd700" />
              <CurveChannel ch="K" color="#666" />
            </div>
            {/* Master curves */}
            <Section title="Master Adjustments">
              {[
                { label: "Global Brightness", key: "global_brightness", def: 0 },
                { label: "Global Contrast",   key: "global_contrast",   def: 0 },
                { label: "Global Saturation", key: "global_saturation", def: 0 },
              ].map(({ label, key, def }) => {
                const v = getNum(key, def);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground w-32">{label}</span>
                    <Slider value={[v]} onValueChange={([n]) => set(key, String(n))} min={-50} max={50} step={1} className="flex-1" />
                    <span className={`text-[10px] font-mono w-7 text-right ${v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {v > 0 ? "+" : ""}{v}
                    </span>
                    {v !== 0 && (
                      <button onClick={() => set(key, "0")} className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground">↺</button>
                    )}
                  </div>
                );
              })}
            </Section>
          </div>
        )}

        {/* ── White Channel tab ────────────────────────────────────────── */}
        {activeTab === "white" && (
          <div className="space-y-5">
            <p className="text-[10px] text-muted-foreground/70">
              Global white channel settings for DTF printing. Per-job overrides are available in the SmartBar.
            </p>
            <Section title="White Underbase">
              {[
                { label: "White Opacity (global)", key: "white_opacity_global", def: 90, min: 0, max: 100 },
                { label: "White Choke (px)",       key: "white_choke_global",   def: 3,  min: 0, max: 20 },
              ].map(({ label, key, def, min, max }) => {
                const v = getNum(key, def);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground w-40">{label}</span>
                    <Slider value={[v]} onValueChange={([n]) => set(key, String(n))} min={min} max={max} step={1} className="flex-1" />
                    <input type="number" value={v} min={min} max={max}
                      onChange={e => set(key, e.target.value)}
                      className="w-12 h-5 text-[10px] font-mono text-center bg-muted/60 border border-border rounded-sm text-foreground" />
                  </div>
                );
              })}
            </Section>
            <Section title="White Pass Options">
              {[
                { label: "White Flood Pass",      key: "white_flood",   def: "0" },
                { label: "White Detail Mode",      key: "white_detail",  def: "1" },
                { label: "Remove White Haze",      key: "white_no_haze", def: "0" },
              ].map(({ label, key, def }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={getStr(key, def) === "1"}
                    onChange={e => set(key, e.target.checked ? "1" : "0")} className="w-3 h-3" />
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </label>
              ))}
            </Section>
          </div>
        )}

        {/* ── Soft Proof tab ───────────────────────────────────────────── */}
        {activeTab === "softproof" && (
          <div className="space-y-5">
            <p className="text-[10px] text-muted-foreground/70">
              Soft proofing simulates how the print will look on the substrate.
              Enables gamut warning (out-of-gamut colors shown as overlay).
            </p>
            <Section title="Soft Proof Settings">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={getStr("softproof_enabled", "0") === "1"}
                  onChange={e => set("softproof_enabled", e.target.checked ? "1" : "0")} className="w-3 h-3" />
                <span className="text-[11px] text-muted-foreground">Enable soft proofing in preview</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={getStr("gamut_warning", "0") === "1"}
                  onChange={e => set("gamut_warning", e.target.checked ? "1" : "0")} className="w-3 h-3" />
                <span className="text-[11px] text-muted-foreground">Show gamut warning (out-of-gamut overlay)</span>
              </label>
              <Row label="Gamut Warning Color">
                <input type="color" value={getStr("gamut_warning_color", "#ff00ff")}
                  onChange={e => set("gamut_warning_color", e.target.value)}
                  className="w-8 h-6 border border-border rounded cursor-pointer bg-transparent" />
                <span className="text-[10px] text-muted-foreground font-mono">{getStr("gamut_warning_color", "#ff00ff")}</span>
              </Row>
              <Row label="Simulate Substrate Color">
                <input type="color" value={getStr("substrate_simulate_color", "#ffffff")}
                  onChange={e => set("substrate_simulate_color", e.target.value)}
                  className="w-8 h-6 border border-border rounded cursor-pointer bg-transparent" />
                <span className="text-[10px] text-muted-foreground font-mono">{getStr("substrate_simulate_color", "#ffffff")}</span>
              </Row>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 pb-1 border-b border-border/40">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-muted-foreground w-36 shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2">{children}</div>
    </div>
  );
}
