/**
 * Manhattan RIP X — SmartBar (v2.1 — DF v12 full feature parity)
 *
 * Tab strip: Queue | Page | Job
 *
 * Job tab — exact DF v12 layout:
 *   Row 0:  Print mode dropdown + Reset
 *   Row 1:  Copies | Tiles | Duplicate
 *   Row 2:  Job name + ink cost badge
 *   Row 3:  W | lock | H | Scale | Rotate | X | Y
 *   Row 4:  White Opacity override | White Choke override (DTF-specific)
 *   Row 5:  Easy Color Adjustments (tall full-width)
 *   Row 6:  Crop Mark | Invert | Mirror H | Mirror V | Notes
 *   Row 7:  Apply | 🖨 Print
 */

import type { Job, Queue, PrintMode } from "@shared/schema";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Printer, Lock, Unlock, FlipHorizontal2, FlipVertical2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import EasyColorAdjDialog from "@/components/EasyColorAdjDialog";
import TilesDialog from "@/components/TilesDialog";

interface Props {
  job: Job | null;
  queue: Queue | null;
  onUpdate: (data: Partial<Job>) => void;
  onPrint: () => void;
  onOpenColorMgmt: () => void;
}

export default function SmartBar({ job, queue, onUpdate, onPrint, onOpenColorMgmt }: Props) {
  const { toast } = useToast();
  const [local, setLocal] = useState<Partial<Job>>({});
  const [showColorAdj, setShowColorAdj] = useState(false);
  const [showTiles, setShowTiles] = useState(false);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [activeTab, setActiveTab] = useState<"queue" | "page" | "job">("job");
  const [selectedPrintModeId, setSelectedPrintModeId] = useState<number | null>(null);

  const { data: printModes = [] } = useQuery<PrintMode[]>({
    queryKey: ["/api/print-modes"],
    queryFn: () => apiRequest("GET", `/api/print-modes?deviceId=1`).then(r => r.json()),
  });

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
        mirrorH: job.mirrorH ?? false,
        mirrorV: job.mirrorV ?? false,
        cropMarks: job.cropMarks ?? false,
        tileRows: job.tileRows ?? 1,
        tileCols: job.tileCols ?? 1,
        tileOverlap: job.tileOverlap ?? 0.125,
        whiteOpacityOverride: job.whiteOpacityOverride ?? undefined,
        whiteChokeOverride: job.whiteChokeOverride ?? undefined,
        notes: job.notes ?? "",
      });
      setSelectedPrintModeId(job.printModeId ?? (printModes[0]?.id ?? null));
    } else {
      setLocal({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  // Sync print mode id when modes load
  useEffect(() => {
    if (!selectedPrintModeId && printModes.length > 0) {
      const def = printModes.find(m => m.isDefault) ?? printModes[0];
      setSelectedPrintModeId(def?.id ?? null);
    }
  }, [printModes.length]);

  const set = (key: keyof Job, val: any) => setLocal(p => ({ ...p, [key]: val }));

  const selectedMode = printModes.find(m => m.id === selectedPrintModeId) ?? printModes[0] ?? null;

  const handleApply = () => {
    if (job) {
      onUpdate({
        ...local,
        printModeId: selectedPrintModeId ?? undefined,
        printMode: selectedMode?.name ?? undefined,
      });
    }
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
    mutationFn: () => apiRequest("POST", `/api/jobs/${job!.id}/rip`, {
      printModeId: selectedPrintModeId,
      mirrorH: local.mirrorH,
      mirrorV: local.mirrorV,
    }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "RIP started" });
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
    },
    onError: (e: any) => toast({ title: e.message || "RIP failed", variant: "destructive" }),
  });

  const isTiled = (local.tileRows ?? 1) > 1 || (local.tileCols ?? 1) > 1;
  const totalCopies = (local.copies ?? 1) * (local.tileRows ?? 1) * (local.tileCols ?? 1);

  // ── Empty state ──────────────────────────────────────────────────────────
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
      <TabStrip active={activeTab} onChange={setActiveTab} />

      {/* ── Queue tab ────────────────────────────────────────────────────── */}
      {activeTab === "queue" && (
        <div className="flex items-start gap-4 px-3 py-2 flex-wrap">
          <SmartField label="Queue">
            <span className="text-[11px] text-foreground">{queue?.name || "—"}</span>
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
          <SmartField label="Auto Process">
            <span className={`text-[11px] font-semibold ${queue?.autoProcess ? "text-green-400" : "text-zinc-400"}`}>
              {queue?.autoProcess ? "ON" : "OFF"}
            </span>
          </SmartField>
          <div className="ml-auto">
            <Button size="sm" className="h-6 text-[10px] px-3" onClick={onOpenColorMgmt}>Color Adjust</Button>
          </div>
        </div>
      )}

      {/* ── Page tab ─────────────────────────────────────────────────────── */}
      {activeTab === "page" && (
        <div className="flex items-start gap-4 px-3 py-2 flex-wrap">
          <SmartField label="Sheet Width"><span className="text-[11px] font-mono">{queue?.sheetWidth || 22}"</span></SmartField>
          <SmartField label="Sheet Height"><span className="text-[11px] font-mono">{queue?.sheetHeight || 60}"</span></SmartField>
          <SmartField label="Substrate">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-sm border border-border" style={{ backgroundColor: queue?.substrateColor || "#fff" }} />
              <span className="text-[11px] font-mono text-muted-foreground">{queue?.substrateColor || "#ffffff"}</span>
            </div>
          </SmartField>
          <SmartField label="Print Mode">
            <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{selectedMode?.name ?? "—"}</span>
          </SmartField>
          <SmartField label="Resolution">
            <span className="text-[11px] font-mono text-muted-foreground">{selectedMode?.resolution ?? 1440} dpi</span>
          </SmartField>
          <SmartField label="TAC Limit">
            <span className="text-[11px] font-mono text-muted-foreground">{selectedMode?.tacLimit ?? 320}%</span>
          </SmartField>
        </div>
      )}

      {/* ── Job tab ──────────────────────────────────────────────────────── */}
      {activeTab === "job" && (
        <div className="flex flex-col flex-1 min-h-0">

          {/* Row 0: Print mode dropdown */}
          <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 border-b border-border/40">
            <select
              value={selectedPrintModeId ?? ""}
              onChange={e => setSelectedPrintModeId(Number(e.target.value))}
              className="flex-1 h-[22px] text-[10px] bg-muted/70 border border-border rounded-sm px-1.5 text-foreground appearance-none cursor-pointer min-w-0"
            >
              {printModes.map(pm => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" className="h-[22px] text-[9px] px-2 text-muted-foreground shrink-0"
              onClick={() => ripMutation.mutate()} disabled={ripMutation.isPending}>
              {ripMutation.isPending ? "RIPing…" : "RIP"}
            </Button>
          </div>

          {/* Row 1: Copies | Tiles | Duplicate */}
          <div className="flex items-center px-2 py-1 gap-1 border-b border-border/40">
            <Button size="sm" variant="outline" className="flex-1 h-[22px] text-[10px] px-1 rounded-sm"
              onClick={() => {/* copies dialog — inline for now */}}>
              Copies ({local.copies ?? job.copies})
            </Button>
            <Button size="sm" variant={isTiled ? "default" : "outline"}
              className="flex-1 h-[22px] text-[10px] px-1 rounded-sm"
              onClick={() => setShowTiles(true)}>
              Tiles {isTiled ? `(${local.tileRows}×${local.tileCols})` : "…"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-[22px] text-[10px] px-1 rounded-sm"
              onClick={() => {
                if (job) apiRequest("POST", `/api/jobs/${job.id}/duplicate`).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
                }).catch(() => {
                  // Server may not have this route yet — just show toast
                  toast({ title: "Duplicate: update job manually" });
                });
              }}>
              Duplicate
            </Button>
          </div>

          {/* Row 2: Job name + ink cost */}
          <div className="flex items-center gap-2 px-2 py-0.5 border-b border-border/30">
            <span className="flex-1 text-[10px] text-muted-foreground truncate min-w-0">{job.name}</span>
            {/* Total copies indicator */}
            {totalCopies > 1 && (
              <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">×{totalCopies}</span>
            )}
            {/* Ink cost badge */}
            <span className="text-[9px] font-mono text-amber-400 shrink-0 bg-amber-900/20 px-1 rounded border border-amber-800/30">
              ${((job.inkCost ?? 0) * (local.copies ?? job.copies)).toFixed(3)}/job
            </span>
            {/* Inline copies spinner */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button className="w-4 h-4 border border-border/60 rounded-sm text-[9px] text-muted-foreground hover:text-foreground bg-muted/30"
                onClick={() => set("copies", Math.max(1, (local.copies ?? job.copies) - 1))}>−</button>
              <span className="w-6 text-center text-[10px] font-mono font-semibold text-foreground">{local.copies ?? job.copies}</span>
              <button className="w-4 h-4 border border-border/60 rounded-sm text-[9px] text-muted-foreground hover:text-foreground bg-muted/30"
                onClick={() => set("copies", Math.min(999, (local.copies ?? job.copies) + 1))}>+</button>
            </div>
          </div>

          {/* Row 3: W | lock | H | Scale | Rotate | X | Y */}
          <div className="flex items-end gap-2 px-2 pb-1 flex-wrap">
            <SpinField label="W (in)">
              <SpinBox value={local.width ?? job.width} onChange={handleWidthChange} step={0.1} min={0.1} max={60} width={52} />
            </SpinField>
            <button className={`mb-0.5 p-0.5 rounded transition-colors ${aspectLocked ? "text-primary" : "text-muted-foreground/40"}`}
              onClick={() => setAspectLocked(!aspectLocked)} title={aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}>
              {aspectLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
            <SpinField label="H (in)">
              <SpinBox value={local.height ?? job.height} onChange={handleHeightChange} step={0.1} min={0.1} max={120} width={52} />
            </SpinField>
            <SpinField label="Scale %">
              <SpinBox value={local.scalePercent ?? job.scalePercent} onChange={v => set("scalePercent", v)} step={5} min={10} max={400} width={48} />
            </SpinField>
            <SpinField label="Rotate">
              <select value={local.rotation ?? job.rotation} onChange={e => set("rotation", Number(e.target.value))}
                className="h-[22px] text-[10px] bg-muted/60 border border-border rounded-sm px-1 text-foreground" style={{ width: 72 }}>
                <option value={0}>None</option>
                <option value={90}>90°</option>
                <option value={180}>180°</option>
                <option value={270}>270°</option>
                <option value={-1}>Auto Best</option>
              </select>
            </SpinField>
            <SpinField label="X (in)">
              <SpinBox value={local.posX ?? job.posX} onChange={v => set("posX", v)} step={0.1} min={0} max={60} width={48} />
            </SpinField>
            <SpinField label="Y (in)">
              <SpinBox value={local.posY ?? job.posY} onChange={v => set("posY", v)} step={0.1} min={0} max={120} width={48} />
            </SpinField>
          </div>

          {/* Row 4: White overrides (DTF-specific) */}
          <div className="flex items-center gap-3 px-2 pb-1 border-b border-border/30">
            <span className="text-[9px] text-muted-foreground/60 shrink-0">White Override:</span>
            <SpinField label="Opacity %">
              <SpinBox
                value={local.whiteOpacityOverride ?? selectedMode?.whiteOpacity ?? 90}
                onChange={v => set("whiteOpacityOverride", v)}
                step={5} min={0} max={100} width={44}
              />
            </SpinField>
            <SpinField label="Choke px">
              <SpinBox
                value={local.whiteChokeOverride ?? selectedMode?.whiteChoke ?? 3}
                onChange={v => set("whiteChokeOverride", v)}
                step={1} min={0} max={20} width={36}
              />
            </SpinField>
            {(local.whiteOpacityOverride !== undefined || local.whiteChokeOverride !== undefined) && (
              <button className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground"
                onClick={() => { set("whiteOpacityOverride", undefined); set("whiteChokeOverride", undefined); }}>
                ↺ reset
              </button>
            )}
          </div>

          {/* Row 5: Easy Color Adjustments */}
          <div className="px-2 pb-1">
            <Button variant="outline" className="w-full h-8 text-[11px] font-semibold rounded-sm border-border/80 hover:bg-muted/80"
              onClick={() => setShowColorAdj(true)}>
              Easy Color Adjustments
            </Button>
          </div>

          {/* Row 6: Crop Mark | Invert | Mirror H | Mirror V | Notes */}
          <div className="flex items-center gap-1 px-2 pb-1">
            <ToggleBtn
              label="Crop Mark"
              active={local.cropMarks ?? false}
              onClick={() => set("cropMarks", !(local.cropMarks ?? false))}
            />
            <Button size="sm" variant="outline" className="flex-1 h-[22px] text-[10px] px-1 rounded-sm"
              onClick={() => set("rotation", ((local.rotation ?? job.rotation) + 180) % 360)}>
              Invert
            </Button>
            <ToggleBtn
              label={<><FlipHorizontal2 className="w-2.5 h-2.5" /><span>Mirror H</span></>}
              active={local.mirrorH ?? false}
              onClick={() => set("mirrorH", !(local.mirrorH ?? false))}
            />
            <ToggleBtn
              label={<><FlipVertical2 className="w-2.5 h-2.5" /><span>Mirror V</span></>}
              active={local.mirrorV ?? false}
              onClick={() => set("mirrorV", !(local.mirrorV ?? false))}
            />
          </div>

          {/* Row 7: Apply + Print */}
          <div className="flex items-center gap-1 px-2 pb-2 mt-auto">
            {/* Notes field */}
            <input
              value={local.notes ?? ""}
              onChange={e => set("notes", e.target.value)}
              placeholder="Job notes…"
              className="flex-1 h-[22px] text-[9px] bg-muted/40 border border-border/40 rounded-sm px-2 text-muted-foreground focus:outline-none focus:border-primary min-w-0"
            />
            <Button size="sm" className="h-6 text-[10px] px-4 shrink-0" onClick={handleApply}>
              Apply
            </Button>
            <Button size="sm" variant="destructive" className="h-6 text-[10px] px-3 shrink-0" onClick={onPrint}>
              <Printer className="w-3 h-3 mr-1" /> Print
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {showColorAdj && job && (
        <EasyColorAdjDialog
          job={job}
          onClose={() => setShowColorAdj(false)}
          onApply={(id, data) => { onUpdate(data); setShowColorAdj(false); }}
        />
      )}
      {showTiles && job && (
        <TilesDialog
          tileRows={local.tileRows ?? 1}
          tileCols={local.tileCols ?? 1}
          tileOverlap={local.tileOverlap ?? 0.125}
          onApply={(rows, cols, overlap) => {
            set("tileRows", rows);
            set("tileCols", cols);
            set("tileOverlap", overlap);
            setShowTiles(false);
          }}
          onClose={() => setShowTiles(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabStrip({ active, onChange }: { active: string; onChange: (t: any) => void }) {
  return (
    <div className="flex items-center border-b border-border px-2 pt-1 shrink-0">
      {(["queue", "page", "job"] as const).map(tab => (
        <button key={tab} onClick={() => onChange(tab)}
          className={`text-[10px] h-6 px-3 rounded-none border-b-2 capitalize transition-colors
            ${active === tab ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
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
    <input type="number" value={typeof value === "number" ? parseFloat(value.toFixed(2)) : ""}
      step={step} min={min} max={max}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="h-[22px] text-[10px] font-mono bg-muted/60 border border-border rounded-sm px-1 text-foreground focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:opacity-100 [&::-webkit-inner-spin-button]:opacity-100"
      style={{ width }}
    />
  );
}

function ToggleBtn({ label, active, onClick }: {
  label: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 h-[22px] text-[10px] px-1 rounded-sm border flex items-center justify-center gap-1 transition-colors
        ${active ? "bg-primary/20 border-primary/50 text-primary font-semibold" : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"}`}>
      {label}
    </button>
  );
}
