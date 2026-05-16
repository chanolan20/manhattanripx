/**
 * Digital Factory v12 — SmartBar
 *
 * Exact DFv12 SmartBar layout (bottom-right panel):
 *
 * Tab strip: Queue | Page | Job  (always visible at top)
 *
 * Job tab (left→right, top→bottom):
 *   Row 0:  [Print mode dropdown ─────────────────────────── full width]  [Reset]
 *   Row 1:  [Copies…  full 1/3] [Tiles…  full 1/3] [Duplicate  full 1/3]
 *   Row 2:  job name text label (truncated)
 *   Row 3:  W spinner | lock | H spinner | Scale % spinner | Rotate select | X spinner | Y spinner
 *   Row 4:  [Color Adjust ──────────────────────────────── TALL full width button]
 *   Row 5:  [Crop Mark  1/3] [Invert  1/3] [Mirror  1/3]  [Layer  1/3?]
 *   Row 6:  (spacer flex-1)  [Apply]  [🖨 Print]
 */

import type { Job, Queue } from "@shared/schema";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Printer, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import EasyColorAdjDialog from "@/components/EasyColorAdjDialog";

interface Props {
  job: Job | null;
  queue: Queue | null;
  onUpdate: (data: Partial<Job>) => void;
  onPrint: () => void;
  onOpenColorMgmt: () => void;
}

// Exact DFv12 print modes (from pmodes/ directory in DFv12 EXE)
const PRINT_MODES = [
  "GDIPSRW — CMYW Forever Dark Transfer",
  "GDIPSRW — CMYW Forever Dark Transfer with Holes",
  "GDIPSRW — CMYW Forever Dark Transfer with Stripes",
  "GDIPSRW — Default",
  "GDIPSRW — CMYK",
  "GDIPSRW — RGB",
  "GDIPSRW — Single Weight Matte Paper 1440×720 Best",
  "GDIPRT — Default",
  "GDIPRT — Cadlink RGB",
  "GDIPRT — 600x600 Halftone",
  "GDIPRT — sRGB",
  "GDIPOSTS — Default",
  "GDIPOSTS — CMYK",
  "GDIPOSTS — RGB",
  "GDISEPS — Default",
  "GDISEPS — CMYK",
  "GDISEPS — Color",
  "BMP — ColorWhite",
  "BMP — Color",
  "BMP — Alpha",
  "BMP — Gray",
  "BMP — GrayInvert",
  "TIFFPREV — Default",
  "TIFFPREV — CMYK",
  "TIFFPREV — RGB",
];

export default function SmartBar({ job, queue, onUpdate, onPrint, onOpenColorMgmt }: Props) {
  const { toast } = useToast();
  const [local, setLocal] = useState<Partial<Job>>({});
  const [showColorAdj, setShowColorAdj] = useState(false);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [activeTab, setActiveTab] = useState<"queue" | "page" | "job">("job");
  const [printMode, setPrintMode] = useState(PRINT_MODES[0]);

  useEffect(() => {
    if (job) {
      setLocal({
        width: job.width,
        height: job.height,
        scalePercent: job.scalePercent,
        rotation: job.rotation,
        posX: job.posX,
        posY: job.posY,
        copies: job.copies,
      });
    } else {
      setLocal({});
    }
  }, [job?.id]);

  const set = (key: keyof Job, val: any) => setLocal(p => ({ ...p, [key]: val }));

  const handleApply = () => {
    if (job) onUpdate(local);
  };

  const handleWidthChange = (v: number) => {
    if (aspectLocked && job) {
      const ratio = (job.height || 1) / (job.width || 1);
      set("height", parseFloat((v * ratio).toFixed(2)));
    }
    set("width", v);
  };
  const handleHeightChange = (v: number) => {
    if (aspectLocked && job) {
      const ratio = (job.width || 1) / (job.height || 1);
      set("width", parseFloat((v * ratio).toFixed(2)));
    }
    set("height", v);
  };

  const ripMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${job!.id}/rip`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "RIP started" });
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
    },
    onError: (e: any) => toast({ title: e.message || "RIP failed", variant: "destructive" }),
  });

  // Empty state
  if (!job) {
    return (
      <div className="shrink-0 border-t border-border bg-[hsl(220_13%_12%)]" style={{ minHeight: 160 }}>
        <TabStrip active={activeTab} onChange={setActiveTab} />
        <div className="flex items-center justify-center" style={{ height: 120 }}>
          <p className="text-[10px] text-muted-foreground/40">Select a job to view properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t-2 border-border bg-[hsl(220_13%_12%)] flex flex-col" style={{ minHeight: 160 }}>
      {/* ── Tab strip ─────────────────────────────────────────────────── */}
      <TabStrip active={activeTab} onChange={setActiveTab} />

      {/* ── Queue tab ─────────────────────────────────────────────────── */}
      {activeTab === "queue" && (
        <div className="flex items-start gap-4 px-3 py-2 flex-wrap">
          <SmartField label="Queue">
            <span className="text-[11px] text-foreground">{queue?.name || "—"}</span>
          </SmartField>
          <SmartField label="Print Mode">
            <span className="text-[11px] text-muted-foreground">1440×720 Color Opaque</span>
          </SmartField>
          <SmartField label="Status">
            <span className={`text-[11px] font-semibold ${queue?.status === "running" ? "text-green-400" : "text-zinc-400"}`}>
              {queue?.status || "stopped"}
            </span>
          </SmartField>
          <SmartField label="Jobs">
            <span className="text-[11px] font-mono text-foreground">{queue?.jobCount ?? 0}</span>
          </SmartField>
          <SmartField label="Sheet">
            <span className="text-[11px] font-mono text-muted-foreground">
              {queue?.sheetWidth || 22}" × {queue?.sheetHeight || 60}"
            </span>
          </SmartField>
          <div className="ml-auto">
            <Button size="sm" className="h-6 text-[10px] px-3" onClick={onOpenColorMgmt}>
              Color Adjust
            </Button>
          </div>
        </div>
      )}

      {/* ── Page tab ──────────────────────────────────────────────────── */}
      {activeTab === "page" && (
        <div className="flex items-start gap-4 px-3 py-2 flex-wrap">
          <SmartField label="Sheet Width">
            <span className="text-[11px] font-mono">{queue?.sheetWidth || 22}"</span>
          </SmartField>
          <SmartField label="Sheet Height">
            <span className="text-[11px] font-mono">{queue?.sheetHeight || 60}"</span>
          </SmartField>
          <SmartField label="Substrate">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-sm border border-border"
                style={{ backgroundColor: queue?.substrateColor || "#fff" }} />
              <span className="text-[11px] font-mono text-muted-foreground">{queue?.substrateColor || "#ffffff"}</span>
            </div>
          </SmartField>
          <SmartField label="Resolution">
            <span className="text-[11px] font-mono text-muted-foreground">1440×720 dpi</span>
          </SmartField>
          <SmartField label="Color Profile">
            <span className="text-[11px] font-mono text-muted-foreground">MRX Unified RGB</span>
          </SmartField>
        </div>
      )}

      {/* ── Job tab ───────────────────────────────────────────────────── */}
      {activeTab === "job" && (
        <div className="flex flex-col flex-1 min-h-0">

          {/* ── Row 0: Print mode dropdown — FULL WIDTH (MRX exact) ── */}
          <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 border-b border-border/40">
            <select
              value={printMode}
              onChange={e => setPrintMode(e.target.value)}
              className="flex-1 h-[22px] text-[10px] bg-muted/70 border border-border rounded-sm px-1.5 text-foreground appearance-none cursor-pointer min-w-0"
            >
              {PRINT_MODES.map(pm => (
                <option key={pm} value={pm}>{pm}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              className="h-[22px] text-[9px] px-2 text-muted-foreground shrink-0"
              onClick={() => ripMutation.mutate()}
              disabled={ripMutation.isPending}
            >
              {ripMutation.isPending ? "RIPing…" : "Reset"}
            </Button>
          </div>

          {/* ── Row 1: Copies… | Tiles… | Duplicate — full width (MRX exact) ── */}
          <div className="flex items-center px-2 py-1 gap-1 border-b border-border/40">
            <Button size="sm" variant="outline"
              className="flex-1 h-[22px] text-[10px] px-1 rounded-sm">
              Copies…
            </Button>
            <Button size="sm" variant="outline"
              className="flex-1 h-[22px] text-[10px] px-1 rounded-sm">
              Tiles…
            </Button>
            <Button size="sm" variant="outline"
              className="flex-1 h-[22px] text-[10px] px-1 rounded-sm">
              Duplicate
            </Button>
          </div>

          {/* ── Row 2: Job name + copies counter ── */}
          <div className="flex items-center gap-2 px-2 py-0.5">
            <span className="flex-1 text-[10px] text-muted-foreground truncate min-w-0">{job.name}</span>
            {/* Copies inline spinner */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                className="w-4 h-4 border border-border/60 rounded-sm text-[9px] text-muted-foreground hover:text-foreground bg-muted/30 leading-none"
                onClick={() => set("copies", Math.max(1, (local.copies ?? job.copies) - 1))}
              >−</button>
              <span className="w-6 text-center text-[10px] font-mono font-semibold text-foreground">{local.copies ?? job.copies}</span>
              <button
                className="w-4 h-4 border border-border/60 rounded-sm text-[9px] text-muted-foreground hover:text-foreground bg-muted/30 leading-none"
                onClick={() => set("copies", Math.min(999, (local.copies ?? job.copies) + 1))}
              >+</button>
            </div>
          </div>

          {/* ── Row 3: W | lock | H | Scale | Rotate | X | Y ── */}
          <div className="flex items-end gap-2 px-2 pb-1 flex-wrap">
            {/* Width */}
            <SpinField label="W (in)">
              <SpinBox
                value={local.width ?? job.width}
                onChange={handleWidthChange}
                step={0.1} min={0.1} max={60}
                width={58}
              />
            </SpinField>

            {/* Aspect lock */}
            <button
              className={`mb-0.5 p-0.5 rounded transition-colors ${aspectLocked ? "text-primary" : "text-muted-foreground/40"}`}
              onClick={() => setAspectLocked(!aspectLocked)}
              title={aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
            >
              {aspectLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>

            {/* Height */}
            <SpinField label="H (in)">
              <SpinBox
                value={local.height ?? job.height}
                onChange={handleHeightChange}
                step={0.1} min={0.1} max={120}
                width={58}
              />
            </SpinField>

            {/* Scale */}
            <SpinField label="Scale %">
              <SpinBox
                value={local.scalePercent ?? job.scalePercent}
                onChange={v => set("scalePercent", v)}
                step={5} min={10} max={400}
                width={52}
              />
            </SpinField>

            {/* Rotate */}
            <SpinField label="Rotate">
              <select
                value={local.rotation ?? job.rotation}
                onChange={e => set("rotation", Number(e.target.value))}
                className="h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1 text-foreground"
                style={{ width: 72 }}
              >
                <option value={0}>None</option>
                <option value={90}>90°</option>
                <option value={180}>180°</option>
                <option value={270}>270°</option>
                <option value={-1}>Auto Best</option>
              </select>
            </SpinField>

            {/* X */}
            <SpinField label="X (in)">
              <SpinBox value={local.posX ?? job.posX} onChange={v => set("posX", v)} step={0.1} min={0} max={60} width={52} />
            </SpinField>

            {/* Y */}
            <SpinField label="Y (in)">
              <SpinBox value={local.posY ?? job.posY} onChange={v => set("posY", v)} step={0.1} min={0} max={120} width={52} />
            </SpinField>
          </div>

          {/* ── Row 4: Color Adjust — TALL FULL-WIDTH button (MRX exact) ── */}
          <div className="px-2 pb-1">
            <Button
              variant="outline"
              className="w-full h-8 text-[11px] font-semibold rounded-sm border-border/80 hover:bg-muted/80"
              onClick={() => setShowColorAdj(true)}
            >
              Easy Color Adjustments
            </Button>
          </div>

          {/* ── Row 5: Crop Mark | Invert | Mirror | Layer ── */}
          <div className="flex items-center gap-1 px-2 pb-1">
            <Button size="sm" variant="outline" className="flex-1 h-[22px] text-[10px] px-1 rounded-sm">
              Crop Mark
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-[22px] text-[10px] px-1 rounded-sm"
              onClick={() => set("rotation", ((local.rotation ?? job.rotation) + 180) % 360)}>
              Invert
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-[22px] text-[10px] px-1 rounded-sm">
              Mirror
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-[22px] text-[10px] px-1 rounded-sm">
              Layer
            </Button>
          </div>

          {/* ── Row 6: Apply + Print ── */}
          <div className="flex items-center gap-1 px-2 pb-2 mt-auto">
            <div className="flex-1" />
            <Button size="sm" className="h-6 text-[10px] px-4" onClick={handleApply}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[10px] px-3"
              onClick={onPrint}
            >
              <Printer className="w-3 h-3 mr-1" /> Print
            </Button>
          </div>
        </div>
      )}

      {showColorAdj && job && (
        <EasyColorAdjDialog
          job={job}
          onClose={() => setShowColorAdj(false)}
          onApply={(id, data) => { onUpdate(data); setShowColorAdj(false); }}
        />
      )}
    </div>
  );
}

// Tab strip
function TabStrip({ active, onChange }: { active: string; onChange: (t: any) => void }) {
  return (
    <div className="flex items-center border-b border-border px-2 pt-1 shrink-0">
      {(["queue", "page", "job"] as const).map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`
            text-[10px] h-6 px-3 rounded-none border-b-2 capitalize transition-colors
            ${active === tab
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
            }
          `}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
  );
}

function SmartField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-muted-foreground/70 leading-none">{label}</span>
      {children}
    </div>
  );
}

// SpinField — label above, input below (matches MRX field layout)
function SpinField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-muted-foreground/70 leading-none">{label}</span>
      {children}
    </div>
  );
}

function SpinBox({ value, onChange, step = 1, min, max, width = 60 }: {
  value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; width?: number;
}) {
  return (
    <input
      type="number"
      value={typeof value === "number" ? parseFloat(value.toFixed(2)) : ""}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="h-[22px] text-[10px] font-mono bg-muted/60 border border-border rounded-sm px-1 text-foreground focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:opacity-100 [&::-webkit-inner-spin-button]:opacity-100"
      style={{ width }}
    />
  );
}
