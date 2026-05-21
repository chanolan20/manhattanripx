/**
 * Manhattan RIP X — GangSheetBuilder
 * DF v12 exact parity: Auto-Nest, Center All, spacing controls, label/grid/barcode/print-length
 * toggles, stats bar, utilization meter, draggable/resizable job thumbnails, sidebar job list.
 */

import type { Queue, Job } from "@shared/schema";
import { useState, useRef, useCallback, useMemo } from "react";
import {
  LayoutGrid,
  AlignCenter,
  ZoomIn,
  ZoomOut,
  Grid,
  Barcode,
  Ruler,
  Printer,
  Tag,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface Props {
  queue: Queue | null;
  jobs: Job[];
  onUpdate: (id: number, data: Partial<Job>) => void;
}

interface PlacedJob {
  jobId: number;
  x: number; // inches
  y: number; // inches
  w: number; // inches
  h: number; // inches
}

interface ResizeState {
  id: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
}

const INCH_TO_PX = 18;

// ─── Helper: colour swatch from job ──────────────────────────────────────────
function jobColor(job: Job): string {
  if (job.previewData && job.previewData.startsWith("#")) return job.previewData;
  // Derive a stable muted colour from the job id
  const hues = [200, 160, 280, 30, 340, 60, 300, 140];
  return `hsl(${hues[job.id % hues.length]}, 45%, 42%)`;
}

// ─── Auto-nest block algorithm (DF v12 spec) ─────────────────────────────────
function blockNest(
  jobs: Job[],
  sheetWIn: number,
  spacingXIn: number,
  spacingYIn: number
): PlacedJob[] {
  const sorted = [...jobs].sort((a, b) => b.height - a.height);
  let x = spacingXIn;
  let y = spacingXIn; // start y = spacingX (spec says spacingX for initial y)
  let rowHeight = 0;
  const result: PlacedJob[] = [];

  for (const job of sorted) {
    const jw = job.width;
    const jh = job.height;
    if (x + jw > sheetWIn - spacingXIn) {
      x = spacingXIn;
      y += rowHeight + spacingYIn;
      rowHeight = 0;
    }
    result.push({ jobId: job.id, x, y, w: jw, h: jh });
    x += jw + spacingXIn;
    rowHeight = Math.max(rowHeight, jh);
  }
  return result;
}

// ─── SpacingInput ─────────────────────────────────────────────────────────────
function SpacingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        max={2}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-10 h-5 text-[10px] text-center bg-muted/60 border border-border rounded px-0.5 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
      />
    </div>
  );
}

// ─── LabelSwitch ─────────────────────────────────────────────────────────────
function LabelSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="scale-75 origin-left" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GangSheetBuilder({ queue, jobs, onUpdate }: Props) {
  const sheetWIn = queue?.sheetWidth ?? 22;
  const sheetHIn = queue?.sheetHeight ?? 60;

  // Active (non-done) jobs
  const activeJobs = useMemo(() => jobs.filter((j) => j.status !== "done"), [jobs]);

  // Placed jobs on canvas (in inches)
  const [placed, setPlaced] = useState<PlacedJob[]>(() =>
    activeJobs.map((j, i) => ({
      jobId: j.id,
      x: (i % 3) * (j.width + 0.2) + 0.2,
      y: Math.floor(i / 3) * (j.height + 0.2) + 0.2,
      w: j.width,
      h: j.height,
    }))
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);

  // Drag state
  const dragging = useRef<{ id: number; oxPx: number; oyPx: number } | null>(null);
  // Resize state
  const resizing = useRef<ResizeState | null>(null);

  // Labels/overlays
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showBarcodes, setShowBarcodes] = useState(false);
  const [showPrintLength, setShowPrintLength] = useState(true);

  // Spacing (inches)
  const [spacingX, setSpacingX] = useState(0.1);
  const [spacingY, setSpacingY] = useState(0.1);

  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const scale = zoom / 100;
  const sheetWPx = sheetWIn * INCH_TO_PX * scale;
  const sheetHPx = sheetHIn * INCH_TO_PX * scale;

  // ── Stats ──────────────────────────────────────────────────────────────────
  const sheetAreaSqIn = sheetWIn * sheetHIn;

  const { coverage, printLengthIn, estCost } = useMemo(() => {
    let usedArea = 0;
    let maxY = 0;
    let cost = 0;

    for (const p of placed) {
      usedArea += p.w * p.h;
      maxY = Math.max(maxY, p.y + p.h);
      const job = jobs.find((j) => j.id === p.jobId);
      if (job) cost += job.inkCost * job.copies;
    }

    const cov = sheetAreaSqIn > 0 ? Math.min(100, (usedArea / sheetAreaSqIn) * 100) : 0;
    return { coverage: cov, printLengthIn: maxY, estCost: cost };
  }, [placed, jobs, sheetAreaSqIn]);

  const waste = 100 - coverage;

  const coverageColor =
    coverage > 80 ? "text-green-400" : coverage > 50 ? "text-amber-400" : "text-red-400";

  // ── Auto-Nest ──────────────────────────────────────────────────────────────
  const handleAutoNest = useCallback(() => {
    const nested = blockNest(activeJobs, sheetWIn, spacingX, spacingY);
    setPlaced(nested);
  }, [activeJobs, sheetWIn, spacingX, spacingY]);

  // ── Center All ─────────────────────────────────────────────────────────────
  const handleCenterAll = useCallback(() => {
    if (placed.length === 0) return;
    // Find bounding box of all placed jobs
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of placed) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    }
    const groupW = maxX - minX;
    const groupH = maxY - minY;
    const offsetX = (sheetWIn - groupW) / 2 - minX;
    const offsetY = (sheetHIn - groupH) / 2 - minY;

    setPlaced((prev) =>
      prev.map((p) => ({
        ...p,
        x: Math.max(0, p.x + offsetX),
        y: Math.max(0, p.y + offsetY),
      }))
    );
  }, [placed, sheetWIn, sheetHIn]);

  // ── Add job from sidebar drag ──────────────────────────────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const jobIdStr = e.dataTransfer.getData("gangsheet/jobId");
      if (!jobIdStr) return;
      const jobId = parseInt(jobIdStr, 10);
      if (placed.find((p) => p.jobId === jobId)) return; // already placed
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const dropXPx = (e.clientX - rect.left) / scale;
      const dropYPx = (e.clientY - rect.top) / scale;
      const dropXIn = dropXPx / INCH_TO_PX;
      const dropYIn = dropYPx / INCH_TO_PX;

      setPlaced((prev) => [
        ...prev,
        {
          jobId,
          x: Math.max(0, Math.min(sheetWIn - job.width, dropXIn - job.width / 2)),
          y: Math.max(0, Math.min(sheetHIn - job.height, dropYIn - job.height / 2)),
          w: job.width,
          h: job.height,
        },
      ]);
      setSelected(jobId);
    },
    [placed, jobs, scale, sheetWIn, sheetHIn]
  );

  // ── Drag (move) handlers ───────────────────────────────────────────────────
  const handleJobMouseDown = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      setSelected(id);
      const p = placed.find((p) => p.jobId === id);
      if (!p) return;
      // offset = mousePos - jobTopLeft in canvas px coords
      const canvasRect = canvasWrapRef.current?.getBoundingClientRect();
      if (!canvasRect) return;
      const mouseXInCanvas = e.clientX - canvasRect.left;
      const mouseYInCanvas = e.clientY - canvasRect.top;
      dragging.current = {
        id,
        oxPx: mouseXInCanvas - p.x * INCH_TO_PX * scale,
        oyPx: mouseYInCanvas - p.y * INCH_TO_PX * scale,
      };
    },
    [placed, scale]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      e.preventDefault();
      const p = placed.find((p) => p.jobId === id);
      if (!p) return;
      resizing.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        startW: p.w,
        startH: p.h,
      };
    },
    [placed]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Handle dragging
      if (dragging.current) {
        const canvasRect = canvasWrapRef.current?.getBoundingClientRect();
        if (!canvasRect) return;
        const mouseXInCanvas = e.clientX - canvasRect.left;
        const mouseYInCanvas = e.clientY - canvasRect.top;

        const p = placed.find((p) => p.jobId === dragging.current!.id);
        if (!p) return;

        const newXPx = mouseXInCanvas - dragging.current.oxPx;
        const newYPx = mouseYInCanvas - dragging.current.oyPx;
        const newXIn = newXPx / (INCH_TO_PX * scale);
        const newYIn = newYPx / (INCH_TO_PX * scale);
        const clampedX = Math.max(0, Math.min(sheetWIn - p.w, newXIn));
        const clampedY = Math.max(0, Math.min(sheetHIn - p.h, newYIn));

        setPlaced((prev) =>
          prev.map((item) =>
            item.jobId === dragging.current!.id
              ? { ...item, x: clampedX, y: clampedY }
              : item
          )
        );
        return;
      }

      // Handle resizing
      if (resizing.current) {
        const rs = resizing.current;
        const deltaPx = {
          x: e.clientX - rs.startX,
          y: e.clientY - rs.startY,
        };
        const deltaIn = {
          x: deltaPx.x / (INCH_TO_PX * scale),
          y: deltaPx.y / (INCH_TO_PX * scale),
        };
        const newW = Math.max(0.5, rs.startW + deltaIn.x);
        const newH = Math.max(0.5, rs.startH + deltaIn.y);

        setPlaced((prev) =>
          prev.map((item) =>
            item.jobId === rs.id ? { ...item, w: newW, h: newH } : item
          )
        );
      }
    },
    [placed, scale, sheetWIn, sheetHIn]
  );

  const handleCanvasMouseUp = useCallback(() => {
    dragging.current = null;
    resizing.current = null;
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Clicked bare canvas — deselect
    if (e.target === canvasWrapRef.current || (e.target as HTMLElement).dataset.sheetBg) {
      setSelected(null);
    }
  }, []);

  // ── Sidebar drag start ─────────────────────────────────────────────────────
  const handleSidebarDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, jobId: number) => {
      e.dataTransfer.setData("gangsheet/jobId", String(jobId));
      e.dataTransfer.effectAllowed = "copy";
    },
    []
  );

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const zoomOut = () => setZoom((z) => Math.max(25, Math.round((z - 10) / 10) * 10));
  const zoomIn = () => setZoom((z) => Math.min(300, Math.round((z + 10) / 10) * 10));

  // ── Print length Y (in sheet px) ──────────────────────────────────────────
  const printLengthPx = printLengthIn * INCH_TO_PX * scale;

  // ── Ruler tick counts ─────────────────────────────────────────────────────
  const hTicks = Math.ceil(sheetWIn) + 1;
  const vTicks = Math.ceil(sheetHIn) + 1;

  return (
    <div className="flex flex-col flex-1 overflow-hidden" data-testid="gang-sheet-builder">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        {/* Title */}
        <span className="text-[11px] font-semibold text-foreground/80 tracking-wide mr-1">
          Gang Sheet Builder
        </span>

        {/* Nest / Center */}
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={handleAutoNest}
        >
          <LayoutGrid className="w-3 h-3" />
          Auto-Nest
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={handleCenterAll}
        >
          <AlignCenter className="w-3 h-3" />
          Center All
        </Button>

        {/* Separator */}
        <div className="w-px h-4 bg-border shrink-0" />

        {/* Spacing inputs */}
        <SpacingInput label="Spacing X" value={spacingX} onChange={setSpacingX} />
        <SpacingInput label="Y" value={spacingY} onChange={setSpacingY} />

        {/* Separator */}
        <div className="w-px h-4 bg-border shrink-0" />

        {/* Label switches */}
        <LabelSwitch label="Labels" checked={showLabels} onCheckedChange={setShowLabels} />
        <LabelSwitch label="Grid" checked={showGrid} onCheckedChange={setShowGrid} />
        <LabelSwitch label="Barcodes" checked={showBarcodes} onCheckedChange={setShowBarcodes} />
        <LabelSwitch label="Print Length" checked={showPrintLength} onCheckedChange={setShowPrintLength} />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
          <span>
            Coverage:{" "}
            <span className={`font-semibold font-mono ${coverageColor}`}>
              {coverage.toFixed(1)}%
            </span>
          </span>
          <span>
            Waste:{" "}
            <span className="font-semibold font-mono text-muted-foreground">
              {waste.toFixed(1)}%
            </span>
          </span>
          <span>
            Film:{" "}
            <span className="font-semibold text-foreground">
              {sheetWIn}″×{sheetHIn}″
            </span>
          </span>
          {showPrintLength && (
            <span>
              Print Length:{" "}
              <span className="font-semibold font-mono text-cyan-400">
                {printLengthIn.toFixed(1)}″
              </span>
            </span>
          )}
          <span>
            Est. Cost:{" "}
            <span className="font-semibold font-mono text-foreground">
              ${estCost.toFixed(2)}
            </span>
          </span>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            onClick={zoomOut}
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-mono text-muted-foreground w-8 text-center">
            {zoom}%
          </span>
          <button
            className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            onClick={zoomIn}
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>

        <Button size="sm" className="h-6 px-3 text-[10px] gap-1 shrink-0">
          <Printer className="w-3 h-3" />
          Print Gang Sheet
        </Button>
      </div>

      {/* ── Utilization meter ────────────────────────────────────────────── */}
      <div className="relative w-full shrink-0" style={{ height: 6 }}>
        {/* Background (waste) */}
        <div className="absolute inset-0 bg-zinc-700/50" />
        {/* Coverage fill */}
        <div
          className="absolute left-0 top-0 bottom-0 transition-all duration-300"
          style={{
            width: `${coverage}%`,
            backgroundColor:
              coverage > 80 ? "#4ade80" : coverage > 50 ? "#fbbf24" : "#f87171",
          }}
        />
        {/* Label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            className="text-[8px] font-mono font-semibold leading-none"
            style={{ color: "rgba(255,255,255,0.75)", textShadow: "0 0 4px rgba(0,0,0,0.8)" }}
          >
            {coverage.toFixed(1)}% utilization
          </span>
        </div>
      </div>

      {/* ── Body: canvas + sidebar ────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Canvas area ───────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-auto bg-[#111] flex items-start justify-center p-8 select-none"
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onClick={handleCanvasClick}
        >
          {/* Inner centering wrapper */}
          <div
            className="relative"
            style={{
              minWidth: sheetWPx + 40,
              minHeight: sheetHPx + 40,
            }}
          >
            {/* Horizontal ruler strip */}
            <div
              className="absolute top-0 bg-zinc-800/90 border-b border-zinc-700 overflow-hidden pointer-events-none z-10"
              style={{
                left: 20, // offset for left ruler width
                height: 20,
                width: sheetWPx,
              }}
            >
              {Array.from({ length: hTicks }, (_, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex flex-col items-center"
                  style={{ left: i * INCH_TO_PX * scale }}
                >
                  <div className="h-3 w-px bg-zinc-500/70" />
                  <span style={{ fontSize: 6, color: "#888", lineHeight: 1, marginTop: 1 }}>
                    {i}″
                  </span>
                </div>
              ))}
            </div>

            {/* Vertical ruler strip */}
            <div
              className="absolute left-0 bg-zinc-800/90 border-r border-zinc-700 overflow-hidden pointer-events-none z-10"
              style={{
                top: 20,
                width: 20,
                height: sheetHPx,
              }}
            >
              {Array.from({ length: vTicks }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 flex items-center"
                  style={{ top: i * INCH_TO_PX * scale }}
                >
                  <div className="w-3 h-px bg-zinc-500/70" />
                  {i % 2 === 0 && (
                    <span
                      style={{
                        fontSize: 6,
                        color: "#888",
                        lineHeight: 1,
                        marginLeft: 1,
                        writingMode: "horizontal-tb",
                      }}
                    >
                      {i}″
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Corner square */}
            <div
              className="absolute top-0 left-0 bg-zinc-800/90 border-r border-b border-zinc-700 z-20"
              style={{ width: 20, height: 20 }}
            />

            {/* Sheet */}
            <div
              ref={canvasWrapRef}
              data-sheet-bg="1"
              className="absolute bg-white shadow-2xl"
              style={{
                top: 20,
                left: 20,
                width: sheetWPx,
                height: sheetHPx,
                cursor: dragging.current ? "grabbing" : "default",
              }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {/* Grid overlay */}
              {showGrid && (
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width="100%"
                  height="100%"
                  style={{ opacity: 0.15 }}
                >
                  <defs>
                    <pattern
                      id="gsb-grid"
                      x="0"
                      y="0"
                      width={INCH_TO_PX * scale}
                      height={INCH_TO_PX * scale}
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d={`M ${INCH_TO_PX * scale} 0 L 0 0 0 ${INCH_TO_PX * scale}`}
                        fill="none"
                        stroke="#0077cc"
                        strokeWidth="0.5"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#gsb-grid)" />
                </svg>
              )}

              {/* Print length indicator */}
              {showPrintLength && printLengthPx > 0 && printLengthPx <= sheetHPx && (
                <div
                  className="absolute left-0 right-0 pointer-events-none z-20"
                  style={{ top: printLengthPx }}
                >
                  <div
                    className="w-full border-t-2 border-dashed border-cyan-400"
                    style={{ opacity: 0.85 }}
                  />
                  <span
                    className="absolute right-1 text-cyan-400 font-mono"
                    style={{ fontSize: 7, top: 2 }}
                  >
                    {printLengthIn.toFixed(1)}″
                  </span>
                </div>
              )}

              {/* Empty state */}
              {placed.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <Layers className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No jobs placed</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      Drag from the sidebar or click Auto-Nest
                    </p>
                  </div>
                </div>
              )}

              {/* Placed jobs */}
              {placed.map((p) => {
                const job = jobs.find((j) => j.id === p.jobId);
                if (!job) return null;
                const isSelected = selected === p.jobId;
                const jWPx = p.w * INCH_TO_PX * scale;
                const jHPx = p.h * INCH_TO_PX * scale;
                const jXPx = p.x * INCH_TO_PX * scale;
                const jYPx = p.y * INCH_TO_PX * scale;
                const color = jobColor(job);
                const showInner = jWPx > 30;

                return (
                  <div
                    key={p.jobId}
                    className={`absolute overflow-hidden rounded-sm cursor-grab active:cursor-grabbing transition-shadow ${
                      isSelected
                        ? "ring-2 ring-primary shadow-lg shadow-primary/25"
                        : "ring-1 ring-white/20 hover:ring-white/40"
                    }`}
                    style={{
                      left: jXPx,
                      top: jYPx,
                      width: jWPx,
                      height: jHPx,
                      backgroundColor: color,
                    }}
                    onMouseDown={(e) => handleJobMouseDown(e, p.jobId)}
                    data-testid={`gang-job-${p.jobId}`}
                  >
                    {/* Artwork placeholder */}
                    <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.35 }}>
                      <svg viewBox="0 0 100 100" style={{ width: "55%", height: "55%" }}>
                        <circle cx="50" cy="38" r="22" fill="white" />
                        <rect x="20" y="65" width="60" height="7" rx="3.5" fill="white" />
                        <rect x="30" y="76" width="40" height="4.5" rx="2.25" fill="white" opacity="0.6" />
                      </svg>
                    </div>

                    {/* Label overlay (bottom) */}
                    {showLabels && showInner && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 pointer-events-none">
                        <p className="text-[8px] text-white/90 truncate leading-tight">
                          {job.name.replace(/\.[^.]+$/, "")}
                        </p>
                        <div className="flex items-center gap-1 mt-px">
                          {job.copies > 1 && (
                            <span className="text-[7px] text-white/60 font-mono">×{job.copies}</span>
                          )}
                          <span className="text-[7px] text-white/50 font-mono">
                            {p.w.toFixed(1)}″×{p.h.toFixed(1)}″
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Label tag (top-left corner) when showLabels */}
                    {showLabels && showInner && (
                      <div className="absolute top-1 left-1 pointer-events-none">
                        <div className="bg-white/90 rounded-sm px-1 py-px flex items-center gap-0.5 shadow">
                          <Tag className="w-1.5 h-1.5 text-zinc-600" />
                          <span style={{ fontSize: 5.5, color: "#333", lineHeight: 1 }}>
                            {String(job.id).padStart(3, "0")}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Barcode placeholder (bottom-right area) */}
                    {showBarcodes && jWPx > 50 && (
                      <div className="absolute top-1 right-1 pointer-events-none">
                        <div className="bg-white rounded-sm px-1 py-0.5 shadow-sm">
                          {/* Barcode bars */}
                          <div className="flex items-end gap-px" style={{ height: 10 }}>
                            {Array.from({ length: 16 }, (_, i) => (
                              <div
                                key={i}
                                className="bg-black"
                                style={{
                                  width: i % 3 === 0 ? 2 : 1,
                                  height: i % 5 === 0 ? "100%" : "60%",
                                }}
                              />
                            ))}
                          </div>
                          <p style={{ fontSize: 4.5, color: "#000", textAlign: "center", marginTop: 1 }}>
                            JOB-{String(job.id).padStart(4, "0")}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Copies badge */}
                    {job.copies > 1 && (
                      <div className="absolute top-1 left-1/2 -translate-x-1/2 pointer-events-none">
                        <div className="bg-primary text-white rounded-full px-1 leading-tight shadow"
                          style={{ fontSize: 6 }}>
                          ×{job.copies}
                        </div>
                      </div>
                    )}

                    {/* Resize handle (selected only) */}
                    {isSelected && (
                      <div
                        className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-primary border border-white rounded-sm cursor-se-resize z-30 hover:bg-primary/80"
                        onMouseDown={(e) => handleResizeMouseDown(e, p.jobId)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <div className="w-44 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/10 shrink-0">
            <span className="text-[11px] font-semibold text-foreground/80">
              Jobs ({activeJobs.length})
            </span>
            <Layers className="w-3 h-3 text-muted-foreground" />
          </div>

          {/* Job list */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {activeJobs.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 text-center mt-4 px-2">
                No jobs in queue
              </p>
            )}
            {activeJobs.map((job) => {
              const isPlaced = !!placed.find((p) => p.jobId === job.id);
              const isSel = selected === job.id;
              const color = jobColor(job);

              return (
                <button
                  key={job.id}
                  draggable
                  onDragStart={(e) => handleSidebarDragStart(e, job.id)}
                  onClick={() => {
                    setSelected(job.id);
                    // If not placed yet, add to canvas at a default position
                    if (!placed.find((p) => p.jobId === job.id)) {
                      setPlaced((prev) => [
                        ...prev,
                        {
                          jobId: job.id,
                          x: spacingX,
                          y: spacingX,
                          w: job.width,
                          h: job.height,
                        },
                      ]);
                    }
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-[10px] border transition-all cursor-grab active:cursor-grabbing ${
                    isSel
                      ? "bg-primary/12 border-primary/30 text-primary"
                      : isPlaced
                      ? "border-border/40 text-foreground hover:bg-muted/40 hover:text-foreground"
                      : "border-border/20 text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {/* Color swatch */}
                    <div
                      className="w-3 h-3 rounded-sm shrink-0 border border-white/10"
                      style={{ backgroundColor: color }}
                    />
                    {/* Name */}
                    <span className="truncate flex-1 leading-tight">
                      {job.name.replace(/\.[^.]+$/, "")}
                    </span>
                    {/* Copies badge */}
                    {job.copies > 1 && (
                      <span className="shrink-0 text-[8px] bg-muted rounded px-0.5 font-mono text-muted-foreground">
                        ×{job.copies}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5 gap-1">
                    <span className="text-[9px] text-muted-foreground/60 font-mono">
                      {job.width.toFixed(1)}″×{job.height.toFixed(1)}″
                    </span>
                    {!isPlaced && (
                      <span className="text-[8px] text-muted-foreground/40 italic">drag</span>
                    )}
                    {isPlaced && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: color, opacity: 0.8 }}
                        title="Placed on sheet"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sidebar footer stats */}
          <div className="border-t border-border bg-muted/10 px-3 py-2 shrink-0 space-y-1">
            <div className="flex justify-between text-[9px] text-muted-foreground/70">
              <span>Placed</span>
              <span className="font-mono text-foreground">
                {placed.length}/{activeJobs.length}
              </span>
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/70">
              <span>Coverage</span>
              <span className={`font-mono font-semibold ${coverageColor}`}>
                {coverage.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/70">
              <span>Cost</span>
              <span className="font-mono text-foreground">${estCost.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
