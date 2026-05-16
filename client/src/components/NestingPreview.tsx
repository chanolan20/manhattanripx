/**
 * Manhattan RIP X — Nesting Preview
 *
 * Visual gang sheet layout. Shows auto-nested job placements on the sheet.
 * Allows adjusting sheet size, margins, spacing. Drag to reorder (future).
 * Integrates with MaxRects bin-packing backend (nestingEngine.ts).
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import type { Queue, Job } from "@shared/schema";

interface NestPlacement {
  jobId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  scalePercent: number;
  sheet: number;
}

interface NestResult {
  placements: NestPlacement[];
  sheetsUsed: number;
  utilization: number;
  totalArea: number;
  sheetArea: number;
}

interface Props {
  queue: Queue | null;
  jobs: Job[];
}

// Distinct colors for each job slot
const JOB_COLORS = [
  "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4",
];

const PX_PER_INCH = 72; // display scale: 72px = 1 inch

export default function NestingPreview({ queue, jobs }: Props) {
  const { toast } = useToast();
  const [sheetWidth, setSheetWidth] = useState(22);
  const [sheetHeight, setSheetHeight] = useState(60);
  const [marginIn, setMarginIn] = useState(0.125);
  const [spacingIn, setSpacingIn] = useState(0.1);
  const [nestResult, setNestResult] = useState<NestResult | null>(null);
  const [viewSheet, setViewSheet] = useState(1);

  const nestMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/nest", {
        queueId: queue?.id || 1,
        sheetWidthIn: sheetWidth,
        sheetHeightIn: sheetHeight,
        marginIn,
        spacingIn,
      }).then(r => r.json()),
    onSuccess: (data: NestResult) => {
      setNestResult(data);
      setViewSheet(1);
      if (data.placements.length === 0) {
        toast({ title: "No pending jobs to nest", description: "Add jobs to the queue first" });
      } else {
        toast({
          title: `Nesting complete`,
          description: `${data.placements.length} items on ${data.sheetsUsed} sheet${data.sheetsUsed > 1 ? "s" : ""} · ${(data.utilization * 100).toFixed(0)}% utilization`,
        });
      }
    },
    onError: (e: any) => toast({ title: "Nesting failed", description: e.message, variant: "destructive" }),
  });

  const pendingJobs = jobs.filter(j => j.status === "pending");

  // Scale display: fit within max canvas width
  const maxDisplayWidth = 520;
  const displayScale = Math.min(PX_PER_INCH, maxDisplayWidth / sheetWidth);
  const canvasW = sheetWidth * displayScale;
  const canvasH = sheetHeight * displayScale;

  const currentPlacements = nestResult?.placements.filter(p => p.sheet === viewSheet) || [];

  const getJobColor = (jobId: number) => {
    const idx = jobs.findIndex(j => j.id === jobId);
    return JOB_COLORS[idx % JOB_COLORS.length];
  };

  const getJobName = (jobId: number) => {
    const job = jobs.find(j => j.id === jobId);
    return job?.name || `Job #${jobId}`;
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Controls Sidebar */}
      <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-base">Nesting Preview</h2>
          <p className="text-xs text-muted-foreground mt-0.5">MaxRects auto-layout for gang sheets</p>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-5">
          {/* Sheet Size */}
          <div className="space-y-3">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Sheet Size</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={sheetWidth}
                  onChange={e => setSheetWidth(Number(e.target.value))}
                  className="h-8 text-sm"
                  min={4}
                  max={60}
                  step={0.5}
                />
                <span className="text-xs text-muted-foreground">×</span>
                <Input
                  type="number"
                  value={sheetHeight}
                  onChange={e => setSheetHeight(Number(e.target.value))}
                  className="h-8 text-sm"
                  min={4}
                  max={120}
                  step={1}
                />
                <span className="text-xs text-muted-foreground">in</span>
              </div>
              {/* Presets */}
              <div className="flex flex-wrap gap-1">
                {[
                  { w: 22, h: 60, label: "22×60" },
                  { w: 22, h: 36, label: "22×36" },
                  { w: 17, h: 24, label: "17×24" },
                  { w: 13, h: 19, label: "A3" },
                ].map(p => (
                  <button
                    key={p.label}
                    onClick={() => { setSheetWidth(p.w); setSheetHeight(p.h); }}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      sheetWidth === p.w && sheetHeight === p.h
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border text-muted-foreground hover:border-border/80"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Margin & Spacing */}
          <div className="space-y-3">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Spacing</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Margin</span>
                <span className="text-xs text-primary">{marginIn.toFixed(3)}"</span>
              </div>
              <Slider
                min={0}
                max={0.5}
                step={0.0625}
                value={[marginIn]}
                onValueChange={([v]) => setMarginIn(v)}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm">Item Spacing</span>
                <span className="text-xs text-primary">{spacingIn.toFixed(2)}"</span>
              </div>
              <Slider
                min={0}
                max={0.5}
                step={0.05}
                value={[spacingIn]}
                onValueChange={([v]) => setSpacingIn(v)}
              />
            </div>
          </div>

          {/* Job List */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">
              Pending Jobs ({pendingJobs.length})
            </Label>
            {pendingJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pending jobs in queue</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-auto">
                {pendingJobs.map((job, i) => (
                  <div key={job.id} className="flex items-center gap-2 text-xs py-1">
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ background: JOB_COLORS[i % JOB_COLORS.length] }}
                    />
                    <span className="truncate text-muted-foreground">{job.name}</span>
                    <span className="ml-auto text-muted-foreground/60 flex-shrink-0">
                      {job.width?.toFixed(1)}"×{job.height?.toFixed(1)}"
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Results Stats */}
          {nestResult && (
            <div className="bg-muted/20 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Nesting Results</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sheets used</span>
                  <span>{nestResult.sheetsUsed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items placed</span>
                  <span>{nestResult.placements.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Utilization</span>
                  <span className={nestResult.utilization > 0.8 ? "text-green-400" : nestResult.utilization > 0.5 ? "text-yellow-400" : "text-red-400"}>
                    {(nestResult.utilization * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total area</span>
                  <span>{nestResult.totalArea.toFixed(1)} in²</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Run Button */}
        <div className="p-4 border-t border-border">
          <Button
            className="w-full"
            onClick={() => nestMutation.mutate()}
            disabled={pendingJobs.length === 0 || nestMutation.isPending}
          >
            {nestMutation.isPending ? (
              <>
                <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Nesting…
              </>
            ) : "Auto-Nest Now"}
          </Button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0f]">
        {/* Sheet Tabs */}
        {nestResult && nestResult.sheetsUsed > 1 && (
          <div className="flex gap-1 px-4 py-2 border-b border-border">
            {Array.from({ length: nestResult.sheetsUsed }, (_, i) => i + 1).map(s => (
              <button
                key={s}
                onClick={() => setViewSheet(s)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  viewSheet === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                Sheet {s}
              </button>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-8">
          {!nestResult ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 border-2 border-dashed border-border/40 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
              </div>
              <p className="text-muted-foreground text-sm">Click "Auto-Nest Now" to see gang sheet layout</p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                {sheetWidth}" × {sheetHeight}" sheet · MaxRects BSSF algorithm
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Sheet background */}
              <div
                className="relative bg-white shadow-2xl overflow-hidden"
                style={{ width: canvasW, height: canvasH }}
              >
                {/* Margin indicator */}
                <div
                  className="absolute inset-0 border-2 border-dashed border-gray-300/30"
                  style={{
                    left: marginIn * displayScale,
                    top: marginIn * displayScale,
                    right: marginIn * displayScale,
                    bottom: marginIn * displayScale,
                  }}
                />

                {/* Placements */}
                {currentPlacements.map((p, i) => {
                  const color = getJobColor(p.jobId);
                  const name = getJobName(p.jobId);
                  const pw = p.width * displayScale;
                  const ph = p.height * displayScale;
                  const px = p.x * displayScale;
                  const py = p.y * displayScale;
                  return (
                    <div
                      key={i}
                      className="absolute overflow-hidden group cursor-pointer hover:z-10 transition-transform hover:scale-[1.01]"
                      style={{
                        left: px,
                        top: py,
                        width: pw,
                        height: ph,
                        backgroundColor: color + "33",
                        border: `2px solid ${color}`,
                        boxSizing: "border-box",
                      }}
                      title={`${name} · ${p.width.toFixed(2)}" × ${p.height.toFixed(2)}"${p.rotated ? " (rotated)" : ""}`}
                    >
                      {/* Striped rotation indicator */}
                      {p.rotated && (
                        <div
                          className="absolute inset-0 opacity-20"
                          style={{
                            backgroundImage: `repeating-linear-gradient(45deg, ${color}, ${color} 2px, transparent 2px, transparent 8px)`,
                          }}
                        />
                      )}
                      {/* Label */}
                      {pw > 30 && ph > 16 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span
                            className="text-center font-medium leading-tight px-1"
                            style={{
                              fontSize: Math.max(7, Math.min(12, Math.min(pw, ph) / 5)),
                              color,
                            }}
                          >
                            {name.length > 12 ? name.slice(0, 10) + "…" : name}
                            {p.rotated && " ↻"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Sheet label */}
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>{sheetWidth}" wide</span>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">
                    {currentPlacements.length} items
                  </Badge>
                  {nestResult.sheetsUsed > 1 && (
                    <Badge variant="outline" className="text-xs">
                      Sheet {viewSheet} of {nestResult.sheetsUsed}
                    </Badge>
                  )}
                </div>
                <span>{sheetHeight}" tall</span>
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-2">
                {jobs.filter(j => nestResult.placements.some(p => p.jobId === j.id && p.sheet === viewSheet)).map((job, i) => (
                  <div key={job.id} className="flex items-center gap-1.5 text-xs">
                    <div
                      className="w-3 h-3 rounded-sm border border-white/10"
                      style={{ background: getJobColor(job.id) + "55", borderColor: getJobColor(job.id) }}
                    />
                    <span className="text-muted-foreground truncate max-w-24">{job.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
