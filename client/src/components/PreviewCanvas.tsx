/**
 * Manhattan RIP X — PreviewCanvas
 * DF v12 exact-parity preview component.
 *
 * Features:
 *  - SVG rulers (H+V) with major/minor tick marks, inch labels
 *  - 8 substrate colour swatches + custom colour picker
 *  - Bleed / crop-mark SVG overlay (job.cropMarks + job.bleed)
 *  - White sheet centred in scrollable dark canvas
 *  - Job artwork thumbnail with 8-handle selection overlay
 *  - Soft-proof toggle (opacity 0.85 + sepia filter)
 *  - Zoom controls: ZoomOut | label | ZoomIn | Fit
 *  - Guides toggle (dashed centre-lines)
 *  - Mirror H/V badges on artwork
 *  - Re-RIP button → POST /api/jobs/:id/rip
 *  - RIP progress bar via SSE /api/jobs/:id/rip/progress
 *  - Ruler corner square (20×20 dark)
 */

import type { Job, Queue } from "@shared/schema";
import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  RefreshCw,
  Eye,
  Grid,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const RULER_SIZE = 20; // px thickness of each ruler

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

// mm → inch conversion (job.bleed is in inches from schema, but spec mentions mm default)
const MM_TO_IN = 1 / 25.4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ─── SVG Ruler ────────────────────────────────────────────────────────────────

interface RulerProps {
  orientation: "horizontal" | "vertical";
  length: number;       // total length in px of the ruler
  pxPerInch: number;
  totalInches: number;
  offset: number;       // scroll offset (px) to sync ruler with canvas
}

function Ruler({ orientation, length, pxPerInch, totalInches, offset }: RulerProps) {
  const isH = orientation === "horizontal";
  const w = isH ? length : RULER_SIZE;
  const h = isH ? RULER_SIZE : length;

  // Build tick marks
  const ticks: React.ReactElement[] = [];
  const quarter = pxPerInch / 4; // px per 0.25"
  const totalQuarters = Math.ceil(totalInches * 4) + 4;

  for (let q = 0; q <= totalQuarters; q++) {
    const pos = q * quarter - offset;
    if (pos < -20 || pos > length + 20) continue;
    const isMajor = q % 4 === 0;      // every 1"
    const isSemi  = q % 2 === 0;      // every 0.5"
    const tickLen = isMajor ? RULER_SIZE * 0.65 : isSemi ? RULER_SIZE * 0.4 : RULER_SIZE * 0.25;
    const inchVal = q / 4;

    if (isH) {
      ticks.push(
        <g key={q}>
          <line
            x1={pos} y1={RULER_SIZE - tickLen}
            x2={pos} y2={RULER_SIZE}
            stroke="#666" strokeWidth={isMajor ? 1 : 0.5}
          />
          {isMajor && inchVal > 0 && (
            <text
              x={pos + 2} y={RULER_SIZE - tickLen - 1}
              fill="#aaa"
              fontSize={8}
              fontFamily="monospace"
            >
              {inchVal}"
            </text>
          )}
        </g>
      );
    } else {
      ticks.push(
        <g key={q}>
          <line
            x1={RULER_SIZE - tickLen} y1={pos}
            x2={RULER_SIZE}           y2={pos}
            stroke="#666" strokeWidth={isMajor ? 1 : 0.5}
          />
          {isMajor && inchVal > 0 && (
            <text
              x={1} y={pos - 1}
              fill="#aaa"
              fontSize={8}
              fontFamily="monospace"
              writingMode="vertical-rl"
              textAnchor="end"
            >
              {inchVal}"
            </text>
          )}
        </g>
      );
    }
  }

  return (
    <svg
      width={w}
      height={h}
      style={{
        display: "block",
        background: "#1a1a2e",
        flexShrink: 0,
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {ticks}
    </svg>
  );
}

// ─── Crop-mark + Bleed SVG overlay ────────────────────────────────────────────

interface CropMarkOverlayProps {
  sheetW: number;
  sheetH: number;
  jobLeft: number;
  jobTop: number;
  jobW: number;
  jobH: number;
  bleedPx: number; // bleed distance in px
}

function CropMarkOverlay({
  sheetW, sheetH, jobLeft, jobTop, jobW, jobH, bleedPx,
}: CropMarkOverlayProps) {
  const gap = 4;     // gap from artwork edge (px)
  const len = 10;    // crop-mark line length (px)

  // Four corners of the artwork
  const x0 = jobLeft;
  const y0 = jobTop;
  const x1 = jobLeft + jobW;
  const y1 = jobTop + jobH;

  // Bleed box coordinates
  const bx0 = x0 - bleedPx;
  const by0 = y0 - bleedPx;
  const bx1 = x1 + bleedPx;
  const by1 = y1 + bleedPx;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 15,
      }}
      width={sheetW}
      height={sheetH}
    >
      {/* Bleed boundary dashed rect */}
      {bleedPx > 0 && (
        <rect
          x={bx0} y={by0}
          width={bx1 - bx0} height={by1 - by0}
          fill="none"
          stroke="rgba(0,140,255,0.55)"
          strokeWidth={0.75}
          strokeDasharray="4 3"
        />
      )}

      {/* Crop-mark lines at 4 corners */}
      {/* Top-left */}
      <line x1={x0 - gap - len} y1={y0 - gap}       x2={x0 - gap}       y2={y0 - gap}       stroke="#333" strokeWidth={0.75} />
      <line x1={x0 - gap}       y1={y0 - gap - len} x2={x0 - gap}       y2={y0 - gap}       stroke="#333" strokeWidth={0.75} />
      {/* Top-right */}
      <line x1={x1 + gap}       y1={y0 - gap}       x2={x1 + gap + len} y2={y0 - gap}       stroke="#333" strokeWidth={0.75} />
      <line x1={x1 + gap}       y1={y0 - gap - len} x2={x1 + gap}       y2={y0 - gap}       stroke="#333" strokeWidth={0.75} />
      {/* Bottom-left */}
      <line x1={x0 - gap - len} y1={y1 + gap}       x2={x0 - gap}       y2={y1 + gap}       stroke="#333" strokeWidth={0.75} />
      <line x1={x0 - gap}       y1={y1 + gap}       x2={x0 - gap}       y2={y1 + gap + len} stroke="#333" strokeWidth={0.75} />
      {/* Bottom-right */}
      <line x1={x1 + gap}       y1={y1 + gap}       x2={x1 + gap + len} y2={y1 + gap}       stroke="#333" strokeWidth={0.75} />
      <line x1={x1 + gap}       y1={y1 + gap}       x2={x1 + gap}       y2={y1 + gap + len} stroke="#333" strokeWidth={0.75} />
    </svg>
  );
}

// ─── Selection handles ─────────────────────────────────────────────────────────

interface SelectionHandlesProps {
  jobW: number;
  jobH: number;
}

function SelectionHandles({ jobW, jobH }: SelectionHandlesProps) {
  // 8 handle positions: 4 corners + 4 midpoints
  const handlePositions = [
    { cx: 0,      cy: 0      }, // top-left
    { cx: jobW/2, cy: 0      }, // top-mid
    { cx: jobW,   cy: 0      }, // top-right
    { cx: jobW,   cy: jobH/2 }, // mid-right
    { cx: jobW,   cy: jobH   }, // bottom-right
    { cx: jobW/2, cy: jobH   }, // bottom-mid
    { cx: 0,      cy: jobH   }, // bottom-left
    { cx: 0,      cy: jobH/2 }, // mid-left
  ];

  const S = 5; // half-size of handle square

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 20,
      }}
      width={jobW}
      height={jobH}
    >
      {/* Selection border */}
      <rect
        x={0.5} y={0.5}
        width={jobW - 1} height={jobH - 1}
        fill="none"
        stroke="#4a9eff"
        strokeWidth={1.5}
        strokeDasharray="5 3"
      />
      {/* 8 handles */}
      {handlePositions.map(({ cx, cy }, i) => (
        <rect
          key={i}
          x={cx - S} y={cy - S}
          width={S * 2} height={S * 2}
          fill="#4a9eff"
          stroke="#ffffff"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface Props {
  job: Job | null;
  queue: Queue | null;
  onQueueUpdate?: (id: number, data: Partial<Queue>) => void;
}

export default function PreviewCanvas({ job, queue, onQueueUpdate }: Props) {
  const [zoom, setZoom]               = useState(100);
  const [fitMode, setFitMode]         = useState(true);
  const [softProof, setSoftProof]     = useState(false);
  const [showGuides, setShowGuides]   = useState(true);
  const [ripProgress, setRipProgress] = useState<number | null>(null);
  const [isRipping, setIsRipping]     = useState(false);
  const [scrollX, setScrollX]         = useState(0);
  const [scrollY, setScrollY]         = useState(0);

  const canvasRef   = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast }   = useToast();

  const substrateColor = queue?.substrateColor ?? "#ffffff";
  const isDark = hexLuminance(substrateColor) < 128;

  // ── Sheet dimensions ──────────────────────────────────────────────────────
  const sheetWidthIn  = queue?.sheetWidth  ?? 13;
  const sheetHeightIn = queue?.sheetHeight ?? 19;

  // ── pxPerInch ─────────────────────────────────────────────────────────────
  const [containerW, setContainerW] = useState(600);
  const [containerH, setContainerH] = useState(400);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerW(width);
      setContainerH(height);
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  const fitPxPerInch = Math.max(4, Math.min(20,
    Math.min(
      (containerW - 80) / sheetWidthIn,
      (containerH - 80) / sheetHeightIn,
    )
  ));

  const pxPerInch = fitMode
    ? fitPxPerInch
    : Math.max(4, Math.min(20, (zoom / 100) * 14));

  const sheetW = Math.round(sheetWidthIn  * pxPerInch);
  const sheetH = Math.round(sheetHeightIn * pxPerInch);

  // ── Job geometry ──────────────────────────────────────────────────────────
  const jobWin   = job?.width  ?? 10;
  const jobHin   = job?.height ?? 10;
  const jobW     = jobWin   * pxPerInch;
  const jobH     = jobHin   * pxPerInch;
  // posX/posY are 0..1 fractions of sheet (left/top of artwork)
  const jobLeft  = (job?.posX ?? 0.05) * sheetW;
  const jobTop   = (job?.posY ?? 0.05) * sheetH;

  // Bleed in px (schema field is in inches)
  const bleedIn  = job?.bleed ?? (3 * MM_TO_IN); // fallback 3mm
  const bleedPx  = bleedIn * pxPerInch;

  // ── Effective display zoom percentage ─────────────────────────────────────
  const displayZoom = fitMode
    ? Math.round(fitPxPerInch / 14 * 100)
    : zoom;

  // ── Zoom controls ─────────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    setFitMode(false);
    setZoom(z => ZOOM_LEVELS.find(l => l > z) ?? 300);
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitMode(false);
    setZoom(z => [...ZOOM_LEVELS].reverse().find(l => l < z) ?? 25);
  }, []);

  const handleFit = useCallback(() => {
    setFitMode(true);
    setZoom(100);
  }, []);

  // ── Scroll sync for ruler offsets ─────────────────────────────────────────
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollX(e.currentTarget.scrollLeft);
    setScrollY(e.currentTarget.scrollTop);
  }, []);

  // ── Substrate mutation ────────────────────────────────────────────────────
  const substrateMutation = useMutation({
    mutationFn: (color: string) =>
      apiRequest("PATCH", `/api/queues/${queue!.id}`, { substrateColor: color }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
      onQueueUpdate?.(queue!.id, { substrateColor: substrateMutation.variables });
    },
  });

  // ── Re-RIP mutation ───────────────────────────────────────────────────────
  const reRipMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${job!.id}/rip`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "RIP started", description: job?.name });
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
    },
    onError: () => {
      toast({ title: "RIP failed", variant: "destructive" });
    },
  });

  // ── SSE rip progress ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!job) return;
    setRipProgress(job.ripProgress);
    setIsRipping(job.status === "processing" || job.status === "ripping");
  }, [job?.ripProgress, job?.status]);

  useEffect(() => {
    if (!job) return;
    if (job.status !== "processing" && job.status !== "ripping") return;

    const baseUrl = (window as any).__PORT_5000__ ?? "";
    const es = new EventSource(`${baseUrl}/api/jobs/${job.id}/rip/progress`);

    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "progress") {
          setRipProgress(d.pct);
          setIsRipping(true);
        } else if (d.type === "complete" || d.type === "status") {
          setRipProgress(d.pct ?? 100);
          setIsRipping(d.status === "processing");
          queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      setIsRipping(false);
    };

    return () => es.close();
  }, [job?.id, job?.status]);

  // ── Padding around sheet ──────────────────────────────────────────────────
  const PAD = 40; // px padding around the sheet in the scrollable area

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col flex-1 overflow-hidden"
      style={{ background: "hsl(215 15% 13%)", borderBottom: "1px solid hsl(var(--border))" }}
    >
      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-2 py-1 shrink-0"
        style={{
          background: "hsl(220 13% 10%)",
          borderBottom: "1px solid hsl(var(--border))",
          height: 30,
        }}
      >
        {/* Left: substrate swatches */}
        <div className="flex items-center gap-1">
          <span
            style={{
              fontSize: 9,
              color: "hsl(var(--muted-foreground))",
              opacity: 0.6,
              marginRight: 2,
              fontFamily: "monospace",
            }}
          >
            Substrate
          </span>

          {SUBSTRATE_COLORS.map(s => (
            <button
              key={s.color}
              title={s.label}
              disabled={!queue}
              onClick={() => queue && substrateMutation.mutate(s.color)}
              style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                backgroundColor: s.color,
                border: `1.5px solid ${
                  substrateColor === s.color
                    ? "hsl(var(--primary))"
                    : "rgba(255,255,255,0.15)"
                }`,
                outline: substrateColor === s.color ? "1px solid hsl(var(--primary))" : "none",
                outlineOffset: 1,
                cursor: "pointer",
                transition: "transform 0.1s",
                flexShrink: 0,
              }}
            />
          ))}

          {/* Custom colour picker */}
          <input
            type="color"
            value={substrateColor}
            disabled={!queue}
            onChange={e => queue && substrateMutation.mutate(e.target.value)}
            title="Custom substrate color"
            style={{
              width: 14,
              height: 14,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          />
        </div>

        {/* Right: guides + soft-proof + re-rip + zoom */}
        <div className="flex items-center gap-1">
          {/* Guides toggle */}
          <button
            onClick={() => setShowGuides(g => !g)}
            title="Toggle guides"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 3,
              border: `1px solid ${showGuides ? "hsl(var(--primary) / 0.6)" : "hsl(var(--border))"}`,
              color: showGuides ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              background: showGuides ? "hsl(var(--primary) / 0.08)" : "transparent",
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            <Grid style={{ width: 11, height: 11 }} />
            Guides
          </button>

          {/* Soft-proof toggle */}
          <button
            onClick={() => setSoftProof(p => !p)}
            title="Soft Proof"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 3,
              border: `1px solid ${softProof ? "hsl(var(--primary) / 0.6)" : "hsl(var(--border))"}`,
              color: softProof ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              background: softProof ? "hsl(var(--primary) / 0.08)" : "transparent",
              cursor: "pointer",
              marginRight: 2,
              fontFamily: "monospace",
            }}
          >
            <Eye style={{ width: 11, height: 11 }} />
            {softProof ? "Proof On" : "Soft Proof"}
          </button>

          {/* Re-RIP button */}
          {job && (
            <button
              onClick={() => reRipMutation.mutate()}
              disabled={reRipMutation.isPending}
              title="Re-RIP job"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 3,
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
                background: "transparent",
                cursor: reRipMutation.isPending ? "not-allowed" : "pointer",
                marginRight: 4,
                fontFamily: "monospace",
                opacity: reRipMutation.isPending ? 0.5 : 1,
              }}
            >
              {reRipMutation.isPending
                ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                : <RefreshCw style={{ width: 11, height: 11 }} />
              }
              Re-RIP
            </button>
          )}

          {/* Zoom out */}
          <button
            onClick={handleZoomOut}
            title="Zoom out"
            style={{
              padding: "2px 3px",
              borderRadius: 3,
              border: "none",
              background: "transparent",
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <ZoomOut style={{ width: 13, height: 13 }} />
          </button>

          {/* Zoom label */}
          <span
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: "hsl(var(--muted-foreground))",
              minWidth: 32,
              textAlign: "center",
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={() => {
              // Cycle to nearest ZOOM_LEVELS value on click
              const nearest = ZOOM_LEVELS.reduce((a, b) =>
                Math.abs(b - displayZoom) < Math.abs(a - displayZoom) ? b : a
              );
              setFitMode(false);
              setZoom(nearest);
            }}
            title="Click to snap to zoom level"
          >
            {displayZoom}%
          </span>

          {/* Zoom in */}
          <button
            onClick={handleZoomIn}
            title="Zoom in"
            style={{
              padding: "2px 3px",
              borderRadius: 3,
              border: "none",
              background: "transparent",
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <ZoomIn style={{ width: 13, height: 13 }} />
          </button>

          {/* Fit button */}
          <button
            onClick={handleFit}
            title="Fit to window"
            style={{
              padding: "2px 3px",
              borderRadius: 3,
              border: fitMode ? "1px solid hsl(var(--primary) / 0.5)" : "1px solid hsl(var(--border))",
              background: fitMode ? "hsl(var(--primary) / 0.08)" : "transparent",
              color: fitMode ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Maximize2 style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>

      {/* ── RIP progress bar (shown when ripping) ──────────────────────── */}
      {isRipping && (
        <div
          style={{
            height: 18,
            flexShrink: 0,
            background: "hsl(220 13% 10%)",
            borderBottom: "1px solid hsl(var(--border))",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 8px",
          }}
        >
          <Loader2
            style={{
              width: 10, height: 10,
              color: "hsl(var(--primary))",
              animation: "spin 1s linear infinite",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              height: 4,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${ripProgress ?? 0}%`,
                height: "100%",
                background: "hsl(var(--primary))",
                transition: "width 0.3s ease",
                borderRadius: 2,
              }}
            />
          </div>
          <span
            style={{
              fontSize: 9,
              fontFamily: "monospace",
              color: "hsl(var(--primary))",
              flexShrink: 0,
              minWidth: 28,
              textAlign: "right",
            }}
          >
            {ripProgress ?? 0}%
          </span>
        </div>
      )}

      {/* ── Ruler + Canvas area ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left column: corner square + vertical ruler ──────────────── */}
        <div
          style={{
            width: RULER_SIZE,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {/* Corner square (ruler intersection) */}
          <div
            style={{
              width: RULER_SIZE,
              height: RULER_SIZE,
              background: "#1a1a2e",
              flexShrink: 0,
              borderRight: "1px solid #333",
              borderBottom: "1px solid #333",
            }}
          />
          {/* Vertical ruler */}
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              borderRight: "1px solid #333",
            }}
          >
            <Ruler
              orientation="vertical"
              length={containerH - RULER_SIZE}
              pxPerInch={pxPerInch}
              totalInches={sheetHeightIn + 2}
              offset={Math.max(0, scrollY - PAD)}
            />
          </div>
        </div>

        {/* ── Right column: horizontal ruler + scrollable canvas ────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Horizontal ruler */}
          <div
            style={{
              height: RULER_SIZE,
              flexShrink: 0,
              overflow: "hidden",
              borderBottom: "1px solid #333",
            }}
          >
            <Ruler
              orientation="horizontal"
              length={containerW - RULER_SIZE}
              pxPerInch={pxPerInch}
              totalInches={sheetWidthIn + 2}
              offset={Math.max(0, scrollX - PAD)}
            />
          </div>

          {/* Scrollable canvas */}
          <div
            ref={el => {
              // Assign both refs
              (canvasRef as any).current = el;
            }}
            style={{ flex: 1, overflow: "auto", position: "relative" }}
            onScroll={handleScroll}
          >
            {/* Measure container size */}
            <div
              ref={containerRef}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            />

            {/* Inner: centres the sheet */}
            <div
              style={{
                minWidth:  sheetW + PAD * 2,
                minHeight: sheetH + PAD * 2,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: PAD,
                boxSizing: "border-box",
                background: "hsl(215 15% 16%)",
              }}
            >
              {/* ── Sheet ──────────────────────────────────────────────── */}
              <div
                style={{
                  position: "relative",
                  width: sheetW,
                  height: sheetH,
                  backgroundColor: substrateColor,
                  border: "1px solid rgba(0,0,0,0.35)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
                  flexShrink: 0,
                  // Soft-proof: simulate narrow-gamut print rendering
                  filter: softProof
                    ? "sepia(0.18) saturate(0.85) contrast(0.97)"
                    : "none",
                  opacity: softProof ? 0.92 : 1,
                }}
              >
                {/* ── Page guides (dashed centre-lines) ─────────────── */}
                {showGuides && (
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      zIndex: 5,
                      overflow: "visible",
                    }}
                    width={sheetW}
                    height={sheetH}
                  >
                    {/* Vertical centre line */}
                    <line
                      x1={sheetW / 2} y1={0}
                      x2={sheetW / 2} y2={sheetH}
                      stroke="rgba(60,130,255,0.35)"
                      strokeWidth={0.75}
                      strokeDasharray="6 4"
                    />
                    {/* Horizontal centre line */}
                    <line
                      x1={0} y1={sheetH / 2}
                      x2={sheetW} y2={sheetH / 2}
                      stroke="rgba(60,130,255,0.35)"
                      strokeWidth={0.75}
                      strokeDasharray="6 4"
                    />
                  </svg>
                )}

                {/* ── No-job placeholder ─────────────────────────────── */}
                {!job && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        userSelect: "none",
                        textAlign: "center",
                        lineHeight: 1.6,
                        color: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
                        fontFamily: "monospace",
                      }}
                    >
                      {sheetWidthIn}" × {sheetHeightIn}"
                      <br />
                      Drop or select a job to preview
                    </p>
                  </div>
                )}

                {/* ── Job artwork ────────────────────────────────────── */}
                {job && (() => {
                  const clampedLeft = Math.max(0, Math.min(sheetW - jobW, jobLeft));
                  const clampedTop  = Math.max(0, Math.min(sheetH - jobH, jobTop));
                  const clampedW    = Math.min(sheetW, jobW);
                  const clampedH    = Math.min(sheetH, jobH);
                  const fontSize    = Math.max(7, Math.min(13, Math.min(clampedW, clampedH) / 5));
                  const subFontSize = Math.max(6, Math.min(9,  Math.min(clampedW, clampedH) / 8));

                  return (
                    <>
                      {/* Crop marks + bleed overlay */}
                      {job.cropMarks && (
                        <CropMarkOverlay
                          sheetW={sheetW}
                          sheetH={sheetH}
                          jobLeft={clampedLeft}
                          jobTop={clampedTop}
                          jobW={clampedW}
                          jobH={clampedH}
                          bleedPx={bleedPx}
                        />
                      )}

                      {/* Artwork container */}
                      <div
                        style={{
                          position: "absolute",
                          left: clampedLeft,
                          top:  clampedTop,
                          width: clampedW,
                          height: clampedH,
                          cursor: "default",
                        }}
                      >
                        {/* Selection handles (8-point) */}
                        <SelectionHandles jobW={clampedW} jobH={clampedH} />

                        {/* Artwork fill — grey placeholder or previewData */}
                        {job.previewData ? (
                          <img
                            src={job.previewData}
                            alt={job.name}
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "fill",
                              display: "block",
                              userSelect: "none",
                              pointerEvents: "none",
                            }}
                            draggable={false}
                          />
                        ) : (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              backgroundColor: "#3a3a4a",
                              opacity: 0.85,
                            }}
                          />
                        )}

                        {/* Artwork label (always shown over fill) */}
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            pointerEvents: "none",
                          }}
                        >
                          <span
                            style={{
                              color: "rgba(255,255,255,0.85)",
                              fontWeight: 700,
                              textAlign: "center",
                              paddingLeft: 4,
                              paddingRight: 4,
                              lineHeight: 1.2,
                              fontSize,
                              textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                              maxWidth: "90%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {job.name.replace(/\.[^.]+$/, "")}
                          </span>
                          <span
                            style={{
                              color: "rgba(255,255,255,0.5)",
                              marginTop: 2,
                              fontSize: subFontSize,
                              fontFamily: "monospace",
                            }}
                          >
                            {(job.width ?? 0).toFixed(2)}" × {(job.height ?? 0).toFixed(2)}"
                          </span>
                        </div>

                        {/* Mirror H/V badges */}
                        {(job.mirrorH || job.mirrorV) && (
                          <div
                            style={{
                              position: "absolute",
                              top: 3,
                              right: 3,
                              display: "flex",
                              gap: 2,
                              zIndex: 25,
                              pointerEvents: "none",
                            }}
                          >
                            {job.mirrorH && (
                              <span
                                title="Mirror Horizontal"
                                style={{
                                  fontSize: 9,
                                  background: "rgba(0,0,0,0.65)",
                                  color: "#99ccff",
                                  borderRadius: 2,
                                  padding: "1px 3px",
                                  fontFamily: "monospace",
                                  lineHeight: 1,
                                }}
                              >
                                ↔
                              </span>
                            )}
                            {job.mirrorV && (
                              <span
                                title="Mirror Vertical"
                                style={{
                                  fontSize: 9,
                                  background: "rgba(0,0,0,0.65)",
                                  color: "#99ccff",
                                  borderRadius: 2,
                                  padding: "1px 3px",
                                  fontFamily: "monospace",
                                  lineHeight: 1,
                                }}
                              >
                                ↕
                              </span>
                            )}
                          </div>
                        )}

                        {/* RIP progress overlay on artwork */}
                        {isRipping && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "rgba(0,0,0,0.6)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              zIndex: 30,
                            }}
                          >
                            <div style={{ textAlign: "center" }}>
                              <Loader2
                                style={{
                                  width: 20,
                                  height: 20,
                                  color: "hsl(var(--primary))",
                                  animation: "spin 1s linear infinite",
                                  margin: "0 auto 4px",
                                  display: "block",
                                }}
                              />
                              <p
                                style={{
                                  fontSize: 9,
                                  fontFamily: "monospace",
                                  fontWeight: 700,
                                  color: "hsl(var(--primary))",
                                  margin: 0,
                                }}
                              >
                                {ripProgress ?? 0}%
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              {/* end sheet */}
            </div>
            {/* end inner centering wrapper */}
          </div>
          {/* end scrollable canvas */}
        </div>
        {/* end right column */}
      </div>
      {/* end ruler + canvas area */}

      {/* Global keyframe for spin (used by Loader2 inline-style animation) */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
