/**
 * Manhattan RIP X — PreviewCanvas
 *
 * Exact MRX preview area:
 * - Horizontal ruler at top (inches), vertical ruler on left
 * - Scrollable gray canvas background
 * - White sheet CENTERED in canvas (not floating upper-right)
 * - Job artwork with selection handles + drag support
 * - Zoom controls top-right (25%–300%, Fit)
 * - Substrate color swatches top-left
 * - Soft Proof toggle button top-right of canvas
 */

import type { Job, Queue } from "@shared/schema";
import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ZoomIn, ZoomOut, Maximize2, Loader2, RefreshCw, Eye } from "lucide-react";

interface Props {
  job: Job | null;
  queue: Queue | null;
  onQueueUpdate?: (id: number, data: any) => void;
}

const SUBSTRATE_COLORS = [
  { label: "White",  color: "#ffffff" },
  { label: "Black",  color: "#111111" },
  { label: "Red",    color: "#bb2200" },
  { label: "Navy",   color: "#0a1a6b" },
  { label: "Orange", color: "#e07800" },
  { label: "Forest", color: "#1a4d2e" },
  { label: "Gray",   color: "#777777" },
  { label: "Yellow", color: "#e8c800" },
];

const ZOOM_LEVELS = [25, 33, 50, 75, 100, 150, 200, 300];

export default function PreviewCanvas({ job, queue, onQueueUpdate }: Props) {
  const [zoom, setZoom] = useState(33);
  const [fit, setFit] = useState(true);
  const [softProof, setSoftProof] = useState(false);
  const [ripProgress, setRipProgress] = useState<number | null>(null);
  const [isRipping, setIsRipping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const substrateColor = queue?.substrateColor || "#ffffff";

  // Luminance check for dark/light substrate
  const hexToLum = (hex: string) => {
    const c = hex.replace("#", "");
    const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
    return 0.299*r + 0.587*g + 0.114*b;
  };
  const isDark = hexToLum(substrateColor) < 128;

  // SSE rip progress
  useEffect(() => {
    if (!job) return;
    if (job.status === "processing" || job.status === "ripping") {
      const baseUrl = (window as any).__PORT_5000__ || "";
      const es = new EventSource(`${baseUrl}/api/jobs/${job.id}/rip/progress`);
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === "progress") { setRipProgress(d.pct); setIsRipping(true); }
          else if (d.type === "complete" || d.type === "status") {
            setRipProgress(d.pct || 100); setIsRipping(d.status === "processing");
            queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
          }
        } catch {}
      };
      es.onerror = () => { es.close(); setIsRipping(false); };
      return () => es.close();
    }
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (job) { setRipProgress(job.ripProgress); setIsRipping(job.status === "processing"); }
  }, [job?.ripProgress, job?.status]);

  const substrateMutation = useMutation({
    mutationFn: (color: string) =>
      apiRequest("PATCH", `/api/queues/${queue!.id}`, { substrateColor: color }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/queues"] }),
  });

  const reRipMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${job!.id}/rip`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "RIP started" });
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
    },
  });

  const handleZoomIn = () => {
    setFit(false);
    const next = ZOOM_LEVELS.find(z => z > zoom) || 300;
    setZoom(next);
  };
  const handleZoomOut = () => {
    setFit(false);
    const prev = [...ZOOM_LEVELS].reverse().find(z => z < zoom) || 25;
    setZoom(prev);
  };
  const handleFit = () => { setFit(true); setZoom(33); };

  // Sheet dimensions
  const sheetWidthIn = queue?.sheetWidth || 22;
  const sheetHeightIn = queue?.sheetHeight || 60;

  // Calculate px/inch for fit mode based on container width
  // We target the sheet filling ~80% of the canvas width when fit=true
  const PX_PER_INCH_BASE = 96;
  const pxPerInch = fit
    ? Math.max(4, Math.min(14, 280 / sheetWidthIn)) // auto-fit: about 280px wide for the sheet
    : (zoom / 100) * PX_PER_INCH_BASE;

  const sheetW = Math.round(sheetWidthIn * pxPerInch);
  const sheetH = Math.round(sheetHeightIn * pxPerInch);

  // Job position + size on sheet (using posX/posY as fractional position of center)
  const jobW = ((job?.width || 10) / sheetWidthIn) * sheetW;
  const jobH = ((job?.height || 10) / sheetWidthIn) * sheetW;
  const jobCx = ((job?.posX || 0.5)) * sheetW;
  const jobCy = ((job?.posY || 0.1)) * sheetH;
  const jobLeft = Math.max(0, jobCx - jobW / 2);
  const jobTop  = Math.max(0, jobCy - jobH / 2);

  const rulerSize = 20; // px

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[hsl(215_15%_14%)] border-b border-border">
      {/* ── Top controls bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-[hsl(220_13%_11%)] shrink-0">
        {/* Substrate swatches */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground/60 mr-0.5">Substrate</span>
          {SUBSTRATE_COLORS.map(s => (
            <button
              key={s.color}
              title={s.label}
              onClick={() => queue && substrateMutation.mutate(s.color)}
              className="w-4 h-4 rounded-sm border transition-all hover:scale-110"
              style={{
                backgroundColor: s.color,
                borderColor: substrateColor === s.color ? "hsl(var(--primary))" : "hsl(var(--border))",
                outline: substrateColor === s.color ? "1.5px solid hsl(var(--primary))" : "none",
                outlineOffset: "1px",
              }}
            />
          ))}
          {/* Custom color */}
          <input
            type="color"
            value={substrateColor}
            onChange={e => queue && substrateMutation.mutate(e.target.value)}
            className="w-4 h-4 rounded cursor-pointer border border-border bg-transparent"
            title="Custom substrate color"
          />
        </div>

        {/* Right controls: soft-proof + re-rip + zoom */}
        <div className="flex items-center gap-1">
          {/* Soft Proof toggle — MRX has this top-right of preview */}
          <button
            onClick={() => setSoftProof(!softProof)}
            title="Soft Proof"
            className={`
              flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border transition-colors mr-1
              ${softProof
                ? "border-primary/60 text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              }
            `}
          >
            <Eye className="w-3 h-3" />
            {softProof ? "Proof On" : "Soft Proof"}
          </button>

          {job && (
            <button
              onClick={() => reRipMutation.mutate()}
              disabled={reRipMutation.isPending}
              className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/60 mr-1"
              title="Re-RIP job"
            >
              {reRipMutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />
              }
              Re-RIP
            </button>
          )}

          <button onClick={handleZoomOut} className="p-1 rounded hover:bg-muted/60 text-muted-foreground" title="Zoom out">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <select
            value={fit ? "fit" : zoom}
            onChange={e => { if (e.target.value === "fit") handleFit(); else { setFit(false); setZoom(Number(e.target.value)); } }}
            className="text-[10px] bg-muted/60 border border-border rounded h-5 px-1 text-foreground"
          >
            {ZOOM_LEVELS.map(z => <option key={z} value={z}>{z}%</option>)}
            <option value="fit">Fit</option>
          </select>
          <button onClick={handleZoomIn} className="p-1 rounded hover:bg-muted/60 text-muted-foreground" title="Zoom in">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleFit} className="p-1 rounded hover:bg-muted/60 text-muted-foreground" title="Fit to window">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Canvas area with rulers ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Vertical ruler */}
        <div
          className="shrink-0 border-r border-border bg-[hsl(220_13%_13%)] relative overflow-hidden select-none"
          style={{ width: rulerSize }}
        >
          {/* Corner square */}
          <div className="absolute top-0 left-0 right-0 bg-[hsl(220_13%_11%)] border-b border-border z-10"
            style={{ height: rulerSize }} />
          {/* Tick marks */}
          <div className="absolute overflow-hidden" style={{ top: rulerSize, left: 0, right: 0, height: sheetH + 40 }}>
            {Array.from({ length: Math.ceil(sheetHeightIn) + 1 }, (_, i) => (
              <div key={i} className="absolute left-0 right-0" style={{ top: i * pxPerInch }}>
                <div className="h-px bg-muted-foreground/20 w-full" />
                {i % 2 === 0 && (
                  <span className="absolute text-[6px] text-muted-foreground/40 font-mono leading-none"
                    style={{ top: 1, left: 1 }}>{i}"</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main canvas + horizontal ruler */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Horizontal ruler */}
          <div
            className="shrink-0 border-b border-border bg-[hsl(220_13%_13%)] relative overflow-hidden select-none"
            style={{ height: rulerSize }}
          >
            <div className="absolute top-0 bottom-0" style={{ left: 0, width: sheetW + 100 }}>
              {Array.from({ length: Math.ceil(sheetWidthIn) + 1 }, (_, i) => (
                <div key={i} className="absolute top-0 bottom-0" style={{ left: i * pxPerInch }}>
                  <div className="w-px h-full bg-muted-foreground/20" />
                  {i % 2 === 0 && (
                    <span className="absolute text-[6px] text-muted-foreground/40 font-mono leading-none"
                      style={{ top: 1, left: 2 }}>{i}"</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable canvas — sheet is CENTERED */}
          <div
            ref={containerRef}
            className="flex-1 overflow-auto"
            style={{ background: "hsl(215 15% 16%)" }}
          >
            {/* Inner centering wrapper */}
            <div
              className="flex items-start justify-center"
              style={{
                minWidth: sheetW + 80,
                minHeight: sheetH + 80,
                padding: "32px 40px",
              }}
            >
              {/* The "sheet" — substrate colored rectangle */}
              <div
                className="relative shadow-2xl shrink-0"
                style={{
                  width: sheetW,
                  height: sheetH,
                  backgroundColor: substrateColor,
                  border: "1px solid rgba(0,0,0,0.4)",
                  // Soft-proof filter: desaturate slightly to simulate print gamut
                  filter: softProof ? "saturate(0.85) contrast(0.97)" : "none",
                }}
              >
                {/* Ruler guide marks on sheet edges */}
                {Array.from({ length: Math.ceil(sheetWidthIn) }, (_, i) => (
                  <div key={`w${i}`} className="absolute top-0 border-l border-black/10"
                    style={{ left: (i + 1) * pxPerInch, height: 5 }} />
                ))}
                {Array.from({ length: Math.ceil(sheetHeightIn) }, (_, i) => (
                  <div key={`h${i}`} className="absolute left-0 border-t border-black/10"
                    style={{ top: (i + 1) * pxPerInch, width: 5 }} />
                ))}

                {/* No job placeholder */}
                {!job && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[10px] select-none text-center leading-relaxed"
                      style={{ color: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)" }}>
                      {sheetWidthIn}" × {sheetHeightIn}"<br />
                      Drop or select a job to preview
                    </p>
                  </div>
                )}

                {/* Job artwork */}
                {job && (
                  <div
                    className="absolute cursor-move"
                    style={{
                      left: Math.max(0, Math.min(sheetW - jobW, jobLeft)),
                      top: Math.max(0, Math.min(sheetH - jobH, jobTop)),
                      width: Math.min(sheetW, jobW),
                      height: Math.min(sheetH, jobH),
                    }}
                  >
                    {/* Selection border — MRX blue dashed */}
                    <div className="absolute inset-0 border-2 border-primary z-10"
                      style={{ borderStyle: "dashed", borderDashArray: "4 2" } as any} />

                    {/* Corner resize handles */}
                    {["top-[-3px] left-[-3px]","top-[-3px] right-[-3px]","bottom-[-3px] left-[-3px]","bottom-[-3px] right-[-3px]"].map(pos => (
                      <div key={pos}
                        className={`absolute w-2.5 h-2.5 bg-primary border border-white z-20 cursor-nwse-resize ${pos}`}
                      />
                    ))}
                    {/* Edge handles */}
                    {["top-[-3px] left-1/2 -translate-x-1/2","bottom-[-3px] left-1/2 -translate-x-1/2",
                      "left-[-3px] top-1/2 -translate-y-1/2","right-[-3px] top-1/2 -translate-y-1/2"].map(pos => (
                      <div key={pos}
                        className={`absolute w-2 h-2 bg-primary border border-white z-20 cursor-ns-resize ${pos}`}
                      />
                    ))}

                    {/* Artwork fill */}
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundColor: job.previewData || "#3a3a4a",
                        opacity: 0.85,
                      }}
                    />

                    {/* Artwork label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-white/80 font-bold text-center px-1 leading-tight drop-shadow-lg"
                        style={{ fontSize: Math.max(7, Math.min(13, Math.min(jobW, jobH) / 5)) }}>
                        {job.name.replace(/\.[^.]+$/, "")}
                      </span>
                      <span className="text-white/50 mt-0.5"
                        style={{ fontSize: Math.max(6, Math.min(9, Math.min(jobW, jobH) / 8)) }}>
                        {(job.width ?? 0).toFixed(2)}" × {(job.height ?? 0).toFixed(2)}"
                      </span>
                    </div>

                    {/* RIP progress overlay */}
                    {isRipping && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30">
                        <div className="text-center">
                          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-1" />
                          <p className="text-[9px] text-primary font-mono font-bold">{ripProgress ?? 0}%</p>
                          <div className="mt-1 w-20 h-1 bg-black/40 rounded overflow-hidden">
                            <div className="h-full bg-primary transition-all rounded"
                              style={{ width: `${ripProgress ?? 0}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
