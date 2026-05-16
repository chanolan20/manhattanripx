import type { Queue, Job } from "@shared/schema";
import { useState, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { LayoutGrid, AlignCenter, AlignLeft, Move, Maximize2, Tag, Printer, ZoomIn, ZoomOut, Grid, Barcode, Ruler, Layers, RotateCcw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

interface Props {
  queue: Queue | null;
  jobs: Job[];
  onUpdate: (id: number, data: Partial<Job>) => void;
}

interface PlacedJob {
  jobId: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const INCH_TO_PX = 18; // scale factor for display

export default function GangSheetBuilder({ queue, jobs, onUpdate }: Props) {
  const [placed, setPlaced] = useState<PlacedJob[]>(() =>
    jobs.filter(j => j.status !== "done").map((j, i) => ({
      jobId: j.id,
      x: (i % 3) * (j.width * INCH_TO_PX + 8) + 8,
      y: Math.floor(i / 3) * (j.height * INCH_TO_PX + 8) + 8,
      w: j.width * INCH_TO_PX,
      h: j.height * INCH_TO_PX,
    }))
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<{ id: number; ox: number; oy: number } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showBarcodes, setShowBarcodes] = useState(false);
  const [showPrintLength, setShowPrintLength] = useState(true);
  const [autoNest, setAutoNest] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sheetW = (queue?.sheetWidth || 13) * INCH_TO_PX;
  const sheetH = (queue?.sheetHeight || 19) * INCH_TO_PX;
  const scale = zoom / 100;

  const handleMouseDown = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelected(id);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const p = placed.find(p => p.jobId === id);
    if (p) setDragging({ id, ox: e.clientX - p.x * scale, oy: e.clientY - p.y * scale });
  }, [placed, scale]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const rawX = (e.clientX - dragging.ox) / scale;
    const rawY = (e.clientY - dragging.oy) / scale;
    const p = placed.find(p => p.jobId === dragging.id);
    if (!p) return;
    const newX = Math.max(0, Math.min(sheetW - p.w, rawX));
    const newY = Math.max(0, Math.min(sheetH - p.h, rawY));
    setPlaced(prev => prev.map(item => item.jobId === dragging.id ? { ...item, x: newX, y: newY } : item));
  }, [dragging, placed, scale, sheetW, sheetH]);

  const handleMouseUp = () => setDragging(null);

  const autoNestJobs = () => {
    let x = 0, y = 0, rowH = 0;
    const newPlaced = placed.map(p => {
      const job = jobs.find(j => j.id === p.jobId);
      if (!job) return p;
      const pw = job.width * INCH_TO_PX;
      const ph = job.height * INCH_TO_PX;
      if (x + pw > sheetW) { x = 0; y += rowH + 4; rowH = 0; }
      const np = { ...p, x, y, w: pw, h: ph };
      x += pw + 4;
      rowH = Math.max(rowH, ph);
      return np;
    });
    setPlaced(newPlaced);
  };

  const totalInkCost = jobs
    .filter(j => placed.find(p => p.jobId === j.id))
    .reduce((sum, j) => sum + j.inkCost * j.copies, 0);

  const coverage = (placed.reduce((sum, p) => sum + p.w * p.h, 0) / (sheetW * sheetH)) * 100;

  return (
    <div className="flex flex-col flex-1 overflow-hidden" data-testid="gang-sheet-builder">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <span className="panel-title">Gang Sheet Builder</span>
        <div className="w-px h-4 bg-border" />
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={autoNestJobs}>
          <LayoutGrid className="w-3 h-3" /> Auto-Nest
        </Button>
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1">
          <AlignCenter className="w-3 h-3" /> Center All
        </Button>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5">
          <Switch checked={showLabels} onCheckedChange={setShowLabels} className="scale-75" />
          <span className="text-[10px] text-muted-foreground">Labels</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch checked={showGrid} onCheckedChange={setShowGrid} className="scale-75" />
          <span className="text-[10px] text-muted-foreground">Grid</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch checked={showBarcodes} onCheckedChange={setShowBarcodes} className="scale-75" />
          <span className="text-[10px] text-muted-foreground">Barcodes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch checked={showPrintLength} onCheckedChange={setShowPrintLength} className="scale-75" />
          <span className="text-[10px] text-muted-foreground">Print Length</span>
        </div>
        <div className="flex-1" />
        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mr-2">
          <span>Coverage: <span className={`font-semibold mono ${coverage > 80 ? "text-green-400" : coverage > 50 ? "text-amber-400" : "text-foreground"}`}>{coverage.toFixed(1)}%</span></span>
          <span>Film: <span className="font-semibold text-foreground">{queue?.sheetWidth}"×{queue?.sheetHeight}"</span></span>
          {showPrintLength && (
            <span>Print Length: <span className="font-semibold mono text-cyan-400">{((placed.reduce((max, p) => Math.max(max, p.y + p.h), 0)) / INCH_TO_PX).toFixed(1)}"</span></span>
          )}
          <span>Est. Cost: <span className="font-semibold mono text-foreground">${totalInkCost.toFixed(2)}</span></span>
        </div>
        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground" onClick={() => setZoom(z => Math.max(30, z - 10))}>
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="text-[10px] mono text-muted-foreground w-8 text-center">{zoom}%</span>
          <button className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground" onClick={() => setZoom(z => Math.min(200, z + 10))}>
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>
        <Button size="sm" className="h-6 px-3 text-xs gap-1">
          <Printer className="w-3 h-3" /> Print Gang Sheet
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          className="flex-1 overflow-auto bg-[#111] flex items-start justify-center p-6"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            ref={canvasRef}
            className="relative bg-white border border-border/40 shadow-2xl select-none"
            style={{
              width: sheetW * scale,
              height: sheetH * scale,
              cursor: dragging ? "grabbing" : "default",
            }}
          >
            {/* Grid overlay */}
            {showGrid && (
              <svg
                className="absolute inset-0 pointer-events-none"
                width="100%" height="100%"
                style={{ opacity: 0.15 }}
              >
                <defs>
                  <pattern id="grid-inch" x="0" y="0" width={INCH_TO_PX * scale} height={INCH_TO_PX * scale} patternUnits="userSpaceOnUse">
                    <path d={`M ${INCH_TO_PX * scale} 0 L 0 0 0 ${INCH_TO_PX * scale}`} fill="none" stroke="#0088cc" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-inch)" />
              </svg>
            )}

            {/* Ruler marks */}
            <div className="absolute top-0 left-0 right-0 h-3 bg-zinc-200/80 border-b border-zinc-300 flex overflow-hidden pointer-events-none">
              {Array.from({ length: Math.floor(queue?.sheetWidth || 13) + 1 }, (_, i) => (
                <div key={i} className="absolute flex flex-col items-center" style={{ left: i * INCH_TO_PX * scale }}>
                  <div className="h-2 w-px bg-zinc-500" />
                  <span style={{ fontSize: "6px", color: "#888", marginTop: 1 }}>{i}"</span>
                </div>
              ))}
            </div>

            {/* Jobs */}
            {placed.map(p => {
              const job = jobs.find(j => j.id === p.jobId);
              if (!job) return null;
              const isSelected = selected === p.jobId;
              return (
                <div
                  key={p.jobId}
                  className={`absolute rounded border-2 overflow-hidden cursor-grab active:cursor-grabbing transition-shadow
                    ${isSelected ? "border-primary shadow-lg shadow-primary/20 ring-1 ring-primary/30" : "border-white/20 hover:border-white/40"}
                  `}
                  style={{
                    left: p.x * scale,
                    top: p.y * scale,
                    width: p.w * scale,
                    height: p.h * scale,
                  }}
                  onMouseDown={e => handleMouseDown(e, p.jobId)}
                  data-testid={`gang-job-${p.jobId}`}
                >
                  {/* Design fill */}
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: job.previewData || "#888", opacity: 0.85 }}
                  >
                    <svg viewBox="0 0 100 100" style={{ width: "50%", height: "50%", opacity: 0.4 }}>
                      <circle cx="50" cy="38" r="22" fill="white" />
                      <rect x="20" y="65" width="60" height="7" rx="3.5" fill="white" />
                      <rect x="30" y="76" width="40" height="4.5" rx="2.25" fill="white" opacity="0.6" />
                    </svg>
                  </div>

                  {/* Barcode */}
                  {showBarcodes && p.w * scale > 50 && (
                    <div className="absolute top-1 right-1">
                      <div className="bg-white px-1 py-0.5 rounded-sm">
                        <div className="flex items-end gap-px h-4">
                          {Array.from({ length: 18 }).map((_, i) => (
                            <div
                              key={i}
                              className="bg-black"
                              style={{ width: i % 3 === 0 ? 2 : 1, height: i % 5 === 0 ? "100%" : "60%" }}
                            />
                          ))}
                        </div>
                        <p style={{ fontSize: "5px", color: "#000", textAlign: "center", marginTop: 1 }}>JOB-{String(job.id).padStart(4, "0")}</p>
                      </div>
                    </div>
                  )}

                  {/* Label */}
                  {showLabels && p.w * scale > 40 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                      <p className="text-[8px] text-white/90 truncate">{job.name.replace(/\.[^.]+$/, "")}</p>
                      <div className="flex items-center gap-1">
                        {job.copies > 1 && (
                          <p className="text-[7px] text-white/60">×{job.copies}</p>
                        )}
                        <p className="text-[7px] text-white/50">{job.width.toFixed(1)}"×{job.height.toFixed(1)}"</p>
                      </div>
                    </div>
                  )}

                  {/* Size handle */}
                  {isSelected && (
                    <div className="absolute bottom-0.5 right-0.5 w-2 h-2 bg-primary border border-white/20 rounded-sm cursor-se-resize" />
                  )}
                </div>
              );
            })}

            {/* No jobs */}
            {placed.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <LayoutGrid className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs text-zinc-600">No jobs in queue</p>
                  <p className="text-[10px] text-zinc-700 mt-1">Add jobs to the production queue first</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar — job list */}
        <div className="w-44 border-l border-border bg-card overflow-auto">
          <div className="panel-header border-b border-border">
            <span className="panel-title">Jobs ({placed.length})</span>
          </div>
          <div className="p-1.5 space-y-1">
            {jobs.filter(j => j.status !== "done").map(job => {
              const isPlaced = placed.find(p => p.jobId === job.id);
              const isSel = selected === job.id;
              return (
                <button
                  key={job.id}
                  onClick={() => setSelected(job.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors border ${
                    isSel ? "bg-primary/15 text-primary border-primary/20" : "border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm shrink-0 border border-white/10" style={{ backgroundColor: job.previewData || "#333" }} />
                    <span className="truncate">{job.name.replace(/\.[^.]+$/, "")}</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[9px] text-muted-foreground/60">{job.width}"×{job.height}"</span>
                    {job.copies > 1 && <span className="text-[9px] text-muted-foreground/60">×{job.copies}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
