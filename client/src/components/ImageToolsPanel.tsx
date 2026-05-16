/**
 * Manhattan RIP X — Image Tools Panel
 * Three non-destructive image processing tools:
 *   - Rez Fixer: AI upscale + sharpen to target DPI
 *   - BG Remover: U2Net AI background removal
 *   - Halftone: DTF halftone screen
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job, Queue } from "@shared/schema";
import {
  Maximize2, Eraser, Grid3x3, Loader2, CheckCircle2,
  AlertCircle, ChevronRight, Image as ImageIcon, Zap, Scissors,
} from "lucide-react";
import KnockoutTools from "@/components/KnockoutTools";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ImageToolsPanelProps {
  queue: Queue | null;
  jobs: Job[];
  selectedJob: Job | null;
  onUpdate: (id: number, data: Partial<Job>) => void;
}

type ActiveTool = "rez-fix" | "bg-remove" | "halftone" | "knockout";

// ── Result banner ─────────────────────────────────────────────────────────────
function ToolResult({ message, error }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  return (
    <div className={cn(
      "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs mt-3",
      error
        ? "border-red-500/30 bg-red-500/10 text-red-400"
        : "border-green-500/30 bg-green-500/10 text-green-400"
    )}>
      {error
        ? <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        : <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
      <span>{error || message}</span>
    </div>
  );
}

// ── Before/After preview ───────────────────────────────────────────────────────
function BeforeAfterPreview({
  before,
  after,
  label,
}: { before?: string | null; after?: string; label: string }) {
  const [showAfter, setShowAfter] = useState(false);

  if (!before) {
    return (
      <div className="flex items-center justify-center h-28 rounded-lg border border-dashed border-white/10 bg-white/3 text-white/30 text-xs">
        <ImageIcon className="h-4 w-4 mr-1.5" /> Select a job to preview
      </div>
    );
  }

  const current = showAfter && after ? after : before;

  return (
    <div className="space-y-1.5">
      <div
        className="relative rounded-lg overflow-hidden bg-[#141414] border border-white/10 flex items-center justify-center"
        style={{ height: 120 }}
      >
        {/* checkerboard for transparent output */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(45deg,#2a2a2a 25%,transparent 25%),linear-gradient(-45deg,#2a2a2a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2a 75%),linear-gradient(-45deg,transparent 75%,#2a2a2a 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
          }}
        />
        <img
          src={current}
          alt={showAfter ? "After" : "Before"}
          className="relative max-h-full max-w-full object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="absolute bottom-1.5 left-1.5">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0.5 border-0",
              showAfter && after
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-white/10 text-white/60"
            )}
          >
            {showAfter && after ? "After" : "Before"}
          </Badge>
        </div>
      </div>
      {after && (
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowAfter(false)}
            className={cn(
              "flex-1 rounded py-1 text-[11px] font-medium transition-colors",
              !showAfter ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
            )}
          >Before</button>
          <button
            onClick={() => setShowAfter(true)}
            className={cn(
              "flex-1 rounded py-1 text-[11px] font-medium transition-colors",
              showAfter ? "bg-cyan-500/20 text-cyan-400" : "text-white/40 hover:text-white/60"
            )}
          >After</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────────────────────────────────────
export default function ImageToolsPanel({ queue, jobs, selectedJob, onUpdate }: ImageToolsPanelProps) {
  const { toast } = useToast();
  const [activeTool, setActiveTool] = useState<ActiveTool>("rez-fix");

  // ── Rez Fixer state ──────────────────────────────────────────────────────
  const [rezOpts, setRezOpts] = useState({
    targetDpi: "300",
    sharpenAmount: 40,
    preserveAspect: true,
  });
  const [rezResult, setRezResult] = useState<{ message?: string; error?: string; preview?: string }>({});

  // ── BG Remove state ──────────────────────────────────────────────────────
  const [bgOpts, setBgOpts] = useState({
    alphaMatte: false,
    foregroundThreshold: 240,
    backgroundThreshold: 10,
    erosionSize: 10,
  });
  const [bgResult, setBgResult] = useState<{ message?: string; error?: string; preview?: string }>({});

  // ── Halftone state ───────────────────────────────────────────────────────
  const [htOpts, setHtOpts] = useState({
    type: "dots" as "dots" | "lines" | "diamond" | "euclidean",
    frequency: 45,
    angle: 45,
    ditherOrder: "8",
    colorize: false,
    contrast: 0,
  });
  const [htResult, setHtResult] = useState<{ message?: string; error?: string; preview?: string }>({});

  // ── Mutations ────────────────────────────────────────────────────────────
  const rezMutation = useMutation({
    mutationFn: async () => {
      if (!selectedJob) throw new Error("No job selected");
      return apiRequest("POST", `/api/jobs/${selectedJob.id}/rez-fix`, {
        targetDpi: Number(rezOpts.targetDpi),
        printWidthInches: selectedJob.width || 8,
        printHeightInches: selectedJob.height || 6,
        sharpenAmount: rezOpts.sharpenAmount,
        preserveAspect: rezOpts.preserveAspect,
      });
    },
    onSuccess: (data: any) => {
      setRezResult({ message: data.tool?.message, preview: data.job?.previewData });
      onUpdate(data.job.id, data.job);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Rez Fix complete", description: data.tool?.message });
    },
    onError: (err: any) => {
      setRezResult({ error: err.message || "Rez fix failed" });
      toast({ title: "Rez Fix failed", description: err.message, variant: "destructive" });
    },
  });

  const bgMutation = useMutation({
    mutationFn: async () => {
      if (!selectedJob) throw new Error("No job selected");
      return apiRequest("POST", `/api/jobs/${selectedJob.id}/bg-remove`, bgOpts);
    },
    onSuccess: (data: any) => {
      setBgResult({ message: data.tool?.message, preview: data.job?.previewData });
      onUpdate(data.job.id, data.job);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Background removed", description: data.tool?.message });
    },
    onError: (err: any) => {
      setBgResult({ error: err.message || "Background removal failed" });
      toast({ title: "BG Remove failed", description: err.message, variant: "destructive" });
    },
  });

  const htMutation = useMutation({
    mutationFn: async () => {
      if (!selectedJob) throw new Error("No job selected");
      return apiRequest("POST", `/api/jobs/${selectedJob.id}/halftone`, {
        ...htOpts,
        ditherOrder: Number(htOpts.ditherOrder),
      });
    },
    onSuccess: (data: any) => {
      setHtResult({ message: data.tool?.message, preview: data.job?.previewData });
      onUpdate(data.job.id, data.job);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Halftone applied", description: data.tool?.message });
    },
    onError: (err: any) => {
      setHtResult({ error: err.message || "Halftone failed" });
      toast({ title: "Halftone failed", description: err.message, variant: "destructive" });
    },
  });

  const isProcessing = rezMutation.isPending || bgMutation.isPending || htMutation.isPending;
  const jobPreview = selectedJob?.previewData?.startsWith("data:") ? selectedJob.previewData : undefined;

  // ── Tool tab definitions ─────────────────────────────────────────────────
  const tabs: { id: ActiveTool; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: "rez-fix",    label: "Rez Fixer",   icon: <Maximize2 className="h-3.5 w-3.5" />,  badge: "AI" },
    { id: "bg-remove",  label: "BG Remover",  icon: <Eraser className="h-3.5 w-3.5" />,     badge: "AI" },
    { id: "halftone",   label: "Halftone",    icon: <Grid3x3 className="h-3.5 w-3.5" /> },
    { id: "knockout",   label: "Knock-out",   icon: <Scissors className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/8">
        <div className="flex items-center gap-2 mb-0.5">
          <Zap className="h-4 w-4 text-cyan-400" />
          <h2 className="font-semibold text-white text-sm tracking-wide">Image Tools</h2>
        </div>
        <p className="text-white/40 text-[11px]">
          {selectedJob ? `Working on: ${selectedJob.name}` : "Select a job in the queue"}
        </p>
      </div>

      {/* Tool tabs */}
      <div className="flex border-b border-white/8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTool(tab.id)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors relative",
              activeTool === tab.id
                ? "text-cyan-400 border-b-2 border-cyan-400 -mb-px"
                : "text-white/40 hover:text-white/70"
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="absolute top-1.5 right-1.5 text-[8px] bg-cyan-500/20 text-cyan-400 px-1 rounded">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* ── REZ FIXER ─────────────────────────────────────────────────── */}
        {activeTool === "rez-fix" && (
          <div className="space-y-4">
            <BeforeAfterPreview
              before={jobPreview}
              after={rezResult.preview}
              label="Rez Fix"
            />

            <div className="space-y-3">
              <div>
                <Label className="text-white/60 text-xs mb-1.5 block">Target DPI</Label>
                <Select
                  value={rezOpts.targetDpi}
                  onValueChange={v => setRezOpts(p => ({ ...p, targetDpi: v }))}
                >
                  <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="150">150 DPI — Draft</SelectItem>
                    <SelectItem value="300">300 DPI — Standard DTF</SelectItem>
                    <SelectItem value="600">600 DPI — High Quality</SelectItem>
                    <SelectItem value="1200">1200 DPI — Ultra</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <Label className="text-white/60 text-xs">Sharpening</Label>
                  <span className="text-white/40 text-xs">{rezOpts.sharpenAmount}%</span>
                </div>
                <Slider
                  value={[rezOpts.sharpenAmount]}
                  min={0} max={100} step={5}
                  onValueChange={([v]) => setRezOpts(p => ({ ...p, sharpenAmount: v }))}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                />
                <div className="flex justify-between text-[10px] text-white/25 mt-1">
                  <span>Soft</span><span>Sharp</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-white/60 text-xs">Preserve Aspect Ratio</Label>
                <Switch
                  checked={rezOpts.preserveAspect}
                  onCheckedChange={v => setRezOpts(p => ({ ...p, preserveAspect: v }))}
                />
              </div>
            </div>

            <div className="bg-white/4 rounded-lg px-3 py-2.5 text-[11px] text-white/50 space-y-1">
              <p className="font-medium text-white/70">How it works</p>
              <p>Upscales low-res artwork to your target DPI using Lanczos3 resampling, then applies unsharp mask to restore edge clarity — essential before printing on DTF film.</p>
            </div>

            <ToolResult message={rezResult.message} error={rezResult.error} />

            <Button
              className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 text-xs h-9"
              onClick={() => { setRezResult({}); rezMutation.mutate(); }}
              disabled={!selectedJob || isProcessing}
            >
              {rezMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Processing…</>
                : <><Maximize2 className="h-3.5 w-3.5 mr-2" />Run Rez Fixer</>}
            </Button>
          </div>
        )}

        {/* ── BG REMOVER ────────────────────────────────────────────────── */}
        {activeTool === "bg-remove" && (
          <div className="space-y-4">
            <BeforeAfterPreview
              before={jobPreview}
              after={bgResult.preview}
              label="BG Remove"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white/70 text-xs font-medium">Alpha Matting</Label>
                  <p className="text-white/35 text-[10px] mt-0.5">Better edges on hair, fur, transparency</p>
                </div>
                <Switch
                  checked={bgOpts.alphaMatte}
                  onCheckedChange={v => setBgOpts(p => ({ ...p, alphaMatte: v }))}
                />
              </div>

              {bgOpts.alphaMatte && (
                <div className="space-y-3 pl-3 border-l border-white/8">
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <Label className="text-white/55 text-xs">Foreground Threshold</Label>
                      <span className="text-white/35 text-xs">{bgOpts.foregroundThreshold}</span>
                    </div>
                    <Slider
                      value={[bgOpts.foregroundThreshold]}
                      min={200} max={255} step={5}
                      onValueChange={([v]) => setBgOpts(p => ({ ...p, foregroundThreshold: v }))}
                      className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <Label className="text-white/55 text-xs">Background Threshold</Label>
                      <span className="text-white/35 text-xs">{bgOpts.backgroundThreshold}</span>
                    </div>
                    <Slider
                      value={[bgOpts.backgroundThreshold]}
                      min={0} max={50} step={2}
                      onValueChange={([v]) => setBgOpts(p => ({ ...p, backgroundThreshold: v }))}
                      className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <Label className="text-white/55 text-xs">Edge Erosion</Label>
                      <span className="text-white/35 text-xs">{bgOpts.erosionSize}px</span>
                    </div>
                    <Slider
                      value={[bgOpts.erosionSize]}
                      min={0} max={40} step={2}
                      onValueChange={([v]) => setBgOpts(p => ({ ...p, erosionSize: v }))}
                      className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white/4 rounded-lg px-3 py-2.5 text-[11px] text-white/50 space-y-1">
              <p className="font-medium text-white/70">U2Net AI Model</p>
              <p>Uses U2Net deep learning to isolate foreground subjects. Output is a transparent PNG — ready for white underbase on DTF film. First run downloads the model (~176MB).</p>
              <div className="flex items-center gap-1.5 text-amber-400/70 mt-1.5">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>Processing takes 5–30 seconds depending on image size.</span>
              </div>
            </div>

            <ToolResult message={bgResult.message} error={bgResult.error} />

            <Button
              className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 text-xs h-9"
              onClick={() => { setBgResult({}); bgMutation.mutate(); }}
              disabled={!selectedJob || isProcessing}
            >
              {bgMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Removing background…</>
                : <><Eraser className="h-3.5 w-3.5 mr-2" />Remove Background</>}
            </Button>
          </div>
        )}

        {/* ── HALFTONE ──────────────────────────────────────────────────── */}
        {activeTool === "halftone" && (
          <div className="space-y-4">
            <BeforeAfterPreview
              before={jobPreview}
              after={htResult.preview}
              label="Halftone"
            />

            <div className="space-y-3">
              <div>
                <Label className="text-white/60 text-xs mb-1.5 block">Screen Type</Label>
                <Select
                  value={htOpts.type}
                  onValueChange={v => setHtOpts(p => ({ ...p, type: v as any }))}
                >
                  <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dots">Round Dots — Classic DTF</SelectItem>
                    <SelectItem value="lines">Halftone Lines — Vintage</SelectItem>
                    <SelectItem value="diamond">Diamond — Softer Tone</SelectItem>
                    <SelectItem value="euclidean">Euclidean — Fine Grain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <Label className="text-white/60 text-xs">Screen Frequency</Label>
                  <span className="text-white/40 text-xs">{htOpts.frequency} LPI</span>
                </div>
                <Slider
                  value={[htOpts.frequency]}
                  min={10} max={120} step={5}
                  onValueChange={([v]) => setHtOpts(p => ({ ...p, frequency: v }))}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                />
                <div className="flex justify-between text-[10px] text-white/25 mt-1">
                  <span>10 LPI (coarse)</span><span>120 LPI (fine)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <Label className="text-white/60 text-xs">Screen Angle</Label>
                  <span className="text-white/40 text-xs">{htOpts.angle}°</span>
                </div>
                <Slider
                  value={[htOpts.angle]}
                  min={0} max={90} step={15}
                  onValueChange={([v]) => setHtOpts(p => ({ ...p, angle: v }))}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                />
                <div className="flex justify-between text-[10px] text-white/25 mt-1">
                  <span>0°</span><span>45° (std)</span><span>90°</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <Label className="text-white/60 text-xs">Pre-contrast Boost</Label>
                  <span className="text-white/40 text-xs">{htOpts.contrast}%</span>
                </div>
                <Slider
                  value={[htOpts.contrast]}
                  min={0} max={50} step={5}
                  onValueChange={([v]) => setHtOpts(p => ({ ...p, contrast: v }))}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white/70 text-xs font-medium">Color Halftone</Label>
                  <p className="text-white/35 text-[10px]">Apply per RGB channel (CMYK-style)</p>
                </div>
                <Switch
                  checked={htOpts.colorize}
                  onCheckedChange={v => setHtOpts(p => ({ ...p, colorize: v }))}
                />
              </div>
            </div>

            <div className="bg-white/4 rounded-lg px-3 py-2.5 text-[11px] text-white/50 space-y-1">
              <p className="font-medium text-white/70">DTF Halftone Notes</p>
              <p>Standard DTF halftone: 45 LPI dots at 45°. Use 30–60 LPI for garment transfers; increase LPI for detailed art. Color mode applies per-channel for CMYK-style rosette.</p>
            </div>

            <ToolResult message={htResult.message} error={htResult.error} />

            <Button
              className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 text-xs h-9"
              onClick={() => { setHtResult({}); htMutation.mutate(); }}
              disabled={!selectedJob || isProcessing}
            >
              {htMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Applying halftone…</>
                : <><Grid3x3 className="h-3.5 w-3.5 mr-2" />Apply Halftone</>}
            </Button>
          </div>
        )}

        {/* ── KNOCKOUT TOOLS ─────────────────────────────────────────── */}
        {activeTool === "knockout" && (
          <KnockoutTools job={selectedJob} onUpdate={onUpdate} />
        )}

      </div>
    </div>
  );
}
