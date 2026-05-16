import type { Job, Queue } from "@shared/schema";
import { Eye, ZoomIn, ZoomOut, Maximize2, Loader2, RefreshCw, Printer } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Props {
  job: Job | null;
  queue: Queue | null;
  onQueueUpdate?: (id: number, data: any) => void;
}

const SUBSTRATE_SWATCHES = [
  { label: "White", color: "#ffffff" },
  { label: "Black", color: "#000000" },
  { label: "Red", color: "#cc2200" },
  { label: "Navy", color: "#0a1a6b" },
  { label: "Orange", color: "#e87700" },
  { label: "Forest", color: "#1a4d2e" },
  { label: "Gray", color: "#777777" },
];

export default function PreviewPanel({ job, queue, onQueueUpdate }: Props) {
  const [zoom, setZoom] = useState(100);
  const [showWhite, setShowWhite] = useState(false);
  const [ripProgress, setRipProgress] = useState<number | null>(null);
  const [isRipping, setIsRipping] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  const substrateColor = queue?.substrateColor || "#ffffff";
  const isDark = parseInt(substrateColor.replace("#", ""), 16) < 0x888888;

  // ── SSE: subscribe to rip progress for selected job ────────────────────────
  useEffect(() => {
    if (!job) return;
    if (job.status === "processing" || job.ripProgress < 100) {
      const baseUrl = (window as any).__PORT_5000__ || "";
      const url = `${baseUrl}/api/jobs/${job.id}/rip/progress`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "progress") {
            setRipProgress(data.pct);
            setIsRipping(true);
          } else if (data.type === "complete" || data.type === "status") {
            setRipProgress(data.pct || 100);
            setIsRipping(data.status === "processing");
            // Refresh job data
            queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
          } else if (data.type === "error") {
            setIsRipping(false);
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        setIsRipping(false);
      };

      return () => { es.close(); eventSourceRef.current = null; };
    }
  }, [job?.id, job?.status]);

  // Track rip progress from job state
  useEffect(() => {
    if (job) {
      setRipProgress(job.ripProgress);
      setIsRipping(job.status === "processing");
    }
  }, [job?.ripProgress, job?.status]);

  // ── Substrate color switch — PATCH /api/queues/:id ──────────────────────────
  const substateMutation = useMutation({
    mutationFn: ({ color }: { color: string }) =>
      apiRequest("PATCH", `/api/queues/${queue!.id}`, { substrateColor: color }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/queues"] }),
  });

  const handleSubstrateChange = (color: string) => {
    if (queue) substateMutation.mutate({ color });
  };

  // ── Re-RIP button ────────────────────────────────────────────────────────────
  const reRipMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${job!.id}/rip`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "RIP started" });
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
    },
    onError: (e: any) => toast({ title: e.message || "RIP failed", variant: "destructive" }),
  });

  // ── Print button ─────────────────────────────────────────────────────────────
  const printMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${job!.id}/print`).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: data.message || "Job sent to printer" });
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
    },
    onError: (e: any) => toast({ title: e.message || "Print failed", variant: "destructive" }),
  });

  const hasRealPreview = job?.previewData?.startsWith("data:");
  const displayProgress = ripProgress ?? job?.ripProgress ?? 0;

  return (
    <div className="flex flex-col h-full" data-testid="preview-panel">
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">Preview</span>
        <div className="flex items-center gap-1">
          <button
            className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setZoom(z => Math.max(25, z - 25))}
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="text-[10px] mono text-muted-foreground w-8 text-center">{zoom}%</span>
          <button
            className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setZoom(z => Math.min(300, z + 25))}
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors ml-1"
            onClick={() => setZoom(100)}
            title="Fit"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-auto flex items-center justify-center p-3"
        style={{ backgroundColor: "#141414" }}
      >
        {job ? (
          <div className="flex flex-col items-center gap-2 w-full">
            {/* Loading overlay when ripping */}
            {isRipping && (
              <div className="flex items-center gap-2 text-xs text-primary mb-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Processing… {displayProgress}%</span>
              </div>
            )}

            {/* Preview substrate with image */}
            <div
              className="relative shadow-2xl border border-white/10 overflow-hidden flex-shrink-0"
              style={{
                backgroundColor: substrateColor,
                width: `${Math.min(job.width * 10 * (zoom / 100), 240)}px`,
                height: `${Math.min(job.height * 10 * (zoom / 100), 240)}px`,
                transition: "all 0.2s ease",
              }}
            >
              {/* Real image preview from RIP */}
              {hasRealPreview ? (
                <img
                  src={job.previewData!}
                  alt={job.name}
                  className="w-full h-full object-contain"
                  style={{
                    transform: `rotate(${job.rotation}deg)`,
                    filter: [
                      job.colorAdjustBrightness !== 0 ? `brightness(${1 + job.colorAdjustBrightness / 100})` : "",
                      job.colorAdjustContrast !== 0 ? `contrast(${1 + job.colorAdjustContrast / 100})` : "",
                      job.colorAdjustSaturation !== 0 ? `saturate(${1 + job.colorAdjustSaturation / 20})` : "",
                    ].filter(Boolean).join(" ") || "none",
                  }}
                />
              ) : (
                /* Fallback color swatch when no real preview yet */
                <div
                  className="absolute inset-2 rounded-sm opacity-90 flex items-center justify-center"
                  style={{
                    backgroundColor: (job.previewData && !job.previewData.startsWith("data:")) ? job.previewData : "#555",
                    transform: `rotate(${job.rotation}deg)`,
                    filter: `brightness(${1 + (job.colorAdjustBrightness || 0) / 100}) contrast(${1 + (job.colorAdjustContrast || 0) / 100}) saturate(${1 + (job.colorAdjustSaturation || 0) / 100})`,
                  }}
                >
                  {isRipping ? (
                    <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 100 100" width="60%" height="60%" opacity={0.5}>
                      <circle cx="50" cy="35" r="25" fill="white" fillOpacity="0.3"/>
                      <rect x="20" y="65" width="60" height="8" rx="4" fill="white" fillOpacity="0.5"/>
                      <rect x="30" y="77" width="40" height="5" rx="2.5" fill="white" fillOpacity="0.3"/>
                    </svg>
                  )}
                </div>
              )}

              {/* Progress bar overlay during processing */}
              {isRipping && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
              )}

              {/* White underbase overlay */}
              {showWhite && (
                <div
                  className="absolute rounded-sm border border-white/30 pointer-events-none"
                  style={{
                    inset: `${(job.whiteChokeOverride ?? 3) * 2}px`,
                    backgroundColor: "rgba(255,255,255,0.15)",
                    transform: `rotate(${job.rotation}deg)`,
                  }}
                />
              )}

              <div className="absolute inset-0 border border-primary/20 pointer-events-none" />
            </div>

            {/* Action buttons */}
            {job.filePath && (
              <div className="flex gap-1.5 mt-1">
                <button
                  onClick={() => reRipMutation.mutate()}
                  disabled={reRipMutation.isPending || isRipping}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Re-process this file"
                  data-testid="button-re-rip"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${reRipMutation.isPending ? "animate-spin" : ""}`} />
                  Re-RIP
                </button>
                <button
                  onClick={() => printMutation.mutate()}
                  disabled={printMutation.isPending}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/20 hover:bg-primary/30 text-primary transition-colors disabled:opacity-50"
                  title="Send to printer"
                  data-testid="button-print-preview"
                >
                  <Printer className="w-2.5 h-2.5" />
                  Print
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <Eye className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/50">Select a job to preview</p>
          </div>
        )}
      </div>

      {/* Substrate selector — wired to API */}
      <div className="border-t border-border px-2 py-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Substrate:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {SUBSTRATE_SWATCHES.map((s) => (
              <button
                key={s.color}
                className={`w-4 h-4 rounded border transition-all ${
                  substrateColor === s.color
                    ? "border-primary ring-1 ring-primary scale-110"
                    : "border-border hover:border-foreground/40"
                }`}
                style={{ backgroundColor: s.color }}
                title={s.label}
                onClick={() => handleSubstrateChange(s.color)}
                data-testid={`swatch-${s.label.toLowerCase()}`}
              />
            ))}
            {/* Custom color picker */}
            <label
              className="w-4 h-4 rounded border border-border cursor-pointer hover:border-foreground/40 overflow-hidden"
              title="Custom color"
            >
              <input
                type="color"
                value={substrateColor}
                onChange={e => handleSubstrateChange(e.target.value)}
                className="opacity-0 w-0 h-0 absolute"
              />
              <div
                className="w-full h-full"
                style={{
                  background: "linear-gradient(135deg, #f00 0%, #ff0 25%, #0f0 50%, #0ff 75%, #f0f 100%)",
                }}
              />
            </label>
          </div>
          <button
            className={`ml-auto text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              showWhite ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            onClick={() => setShowWhite(!showWhite)}
            data-testid="button-toggle-white-layer"
          >
            W Layer
          </button>
        </div>
      </div>

      {/* Job info */}
      {job && (
        <div className="border-t border-border px-2 py-1.5 space-y-1">
          <div className="grid grid-cols-2 gap-x-2 text-[10px]">
            <InfoRow label="File" value={job.fileType} />
            <InfoRow label="Size" value={`${job.width}" × ${job.height}"`} />
            {job.pixelWidth && job.pixelHeight && (
              <InfoRow label="Px" value={`${job.pixelWidth} × ${job.pixelHeight}`} />
            )}
            {job.dpi && <InfoRow label="DPI" value={String(job.dpi)} />}
            <InfoRow label="Copies" value={String(job.copies)} />
            <InfoRow label="Scale" value={`${job.scalePercent}%`} />
            <InfoRow label="Ink Cost" value={`$${(job.inkCost || 0).toFixed(3)}`} />
            {job.fileSize && (
              <InfoRow label="File" value={`${(job.fileSize / 1024).toFixed(0)} KB`} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="mono text-foreground font-medium">{value}</span>
    </>
  );
}
