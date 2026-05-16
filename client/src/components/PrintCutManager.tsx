import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job, Queue } from "@shared/schema";
import { Scissors, Square, Target, AlignCenter, Eye, EyeOff, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface PrintCutManagerProps {
  queue: Queue | null;
  jobs: Job[];
  selectedJob: Job | null;
  onUpdate: (id: number, data: Partial<Job>) => void;
}

export default function PrintCutManager({ queue, jobs, selectedJob, onUpdate }: PrintCutManagerProps) {
  const { toast } = useToast();

  // Global crop mark settings (per-queue)
  const [cropMarks, setCropMarks] = useState({
    enabled: true,
    size: 6,          // mm
    gap: 3,           // mm
    lineWidth: 0.3,   // pt
    color: "#000000",
    bleed: 2,         // mm
  });

  const [regMarks, setRegMarks] = useState({
    enabled: true,
    type: "circle-cross", // circle-cross | crosshair | box
    size: 6,
    color: "#000000",
    position: "corners", // corners | all-sides
  });

  const [contourSettings, setContourSettings] = useState({
    autoDetect: true,
    tolerance: 2,     // px
    expand: 0,        // px — contour offset from image edge
    smoothing: 2,     // path smoothing level
    spotColor: "#FF00FF", // magenta = industry standard for cut path
  });

  // Job-level cut contour toggle
  const handleCutContourToggle = (enabled: boolean) => {
    if (!selectedJob) return;
    onUpdate(selectedJob.id, {
      hasCutContour: enabled,
      cutContourColor: enabled ? contourSettings.spotColor : undefined,
    });
  };

  // Preview canvas — show simplified crop mark layout
  const previewJobs = jobs.slice(0, 6);

  return (
    <div className="flex h-full bg-background overflow-hidden" data-testid="print-cut-manager">
      {/* Left panel — settings */}
      <div className="w-64 flex-shrink-0 border-r border-border overflow-y-auto">
        <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-2">
          <Scissors className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Print & Cut Manager</span>
        </div>

        <div className="p-4 space-y-5">
          {/* Crop Marks */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Square className="w-3.5 h-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground">Crop Marks</h3>
              </div>
              <Switch
                checked={cropMarks.enabled}
                onCheckedChange={v => setCropMarks(p => ({ ...p, enabled: v }))}
                data-testid="switch-crop-marks"
              />
            </div>

            {cropMarks.enabled && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">Mark Length</Label>
                    <span className="text-xs text-foreground font-medium">{cropMarks.size}mm</span>
                  </div>
                  <Slider
                    min={3} max={15} step={0.5}
                    value={[cropMarks.size]}
                    onValueChange={([v]) => setCropMarks(p => ({ ...p, size: v }))}
                    className="h-1.5"
                    data-testid="slider-crop-size"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">Mark Gap</Label>
                    <span className="text-xs text-foreground font-medium">{cropMarks.gap}mm</span>
                  </div>
                  <Slider
                    min={0} max={10} step={0.5}
                    value={[cropMarks.gap]}
                    onValueChange={([v]) => setCropMarks(p => ({ ...p, gap: v }))}
                    className="h-1.5"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">Bleed</Label>
                    <span className="text-xs text-foreground font-medium">{cropMarks.bleed}mm</span>
                  </div>
                  <Slider
                    min={0} max={10} step={0.5}
                    value={[cropMarks.bleed]}
                    onValueChange={([v]) => setCropMarks(p => ({ ...p, bleed: v }))}
                    className="h-1.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Mark Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={cropMarks.color}
                      onChange={e => setCropMarks(p => ({ ...p, color: e.target.value }))}
                      className="h-7 w-10 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={cropMarks.color}
                      onChange={e => setCropMarks(p => ({ ...p, color: e.target.value }))}
                      className="h-7 text-xs font-mono flex-1"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          <Separator className="bg-border/50" />

          {/* Registration Marks */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground">Registration Marks</h3>
              </div>
              <Switch
                checked={regMarks.enabled}
                onCheckedChange={v => setRegMarks(p => ({ ...p, enabled: v }))}
                data-testid="switch-reg-marks"
              />
            </div>

            {regMarks.enabled && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Mark Type</Label>
                  <Select value={regMarks.type} onValueChange={v => setRegMarks(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="circle-cross" className="text-xs">Circle + Crosshair</SelectItem>
                      <SelectItem value="crosshair" className="text-xs">Crosshair only</SelectItem>
                      <SelectItem value="box" className="text-xs">Box corners</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Position</Label>
                  <Select value={regMarks.position} onValueChange={v => setRegMarks(p => ({ ...p, position: v }))}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corners" className="text-xs">4 Corners</SelectItem>
                      <SelectItem value="all-sides" className="text-xs">All Sides (8 marks)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">Mark Size</Label>
                    <span className="text-xs text-foreground font-medium">{regMarks.size}mm</span>
                  </div>
                  <Slider
                    min={3} max={12} step={0.5}
                    value={[regMarks.size]}
                    onValueChange={([v]) => setRegMarks(p => ({ ...p, size: v }))}
                    className="h-1.5"
                  />
                </div>
              </div>
            )}
          </section>

          <Separator className="bg-border/50" />

          {/* Contour Cut */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground">Contour Cut Path</h3>
              </div>
              <Switch
                checked={selectedJob?.hasCutContour || false}
                onCheckedChange={handleCutContourToggle}
                disabled={!selectedJob}
                data-testid="switch-cut-contour"
              />
            </div>

            {(selectedJob?.hasCutContour) && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400">
                  <Scissors className="w-3 h-3" />
                  <span>Cut contour enabled for this job</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Spot Color (Cut Path)</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedJob?.cutContourColor || contourSettings.spotColor}
                      onChange={e => {
                        setContourSettings(p => ({ ...p, spotColor: e.target.value }));
                        if (selectedJob) onUpdate(selectedJob.id, { cutContourColor: e.target.value });
                      }}
                      className="h-7 w-10 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={selectedJob?.cutContourColor || contourSettings.spotColor}
                      readOnly
                      className="h-7 text-xs font-mono flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Industry standard: Magenta (#FF00FF)</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">Auto-detect Tolerance</Label>
                    <span className="text-xs text-foreground font-medium">{contourSettings.tolerance}px</span>
                  </div>
                  <Slider
                    min={1} max={20} step={1}
                    value={[contourSettings.tolerance]}
                    onValueChange={([v]) => setContourSettings(p => ({ ...p, tolerance: v }))}
                    className="h-1.5"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">Contour Expand</Label>
                    <span className="text-xs text-foreground font-medium">{contourSettings.expand}px</span>
                  </div>
                  <Slider
                    min={-10} max={20} step={1}
                    value={[contourSettings.expand]}
                    onValueChange={([v]) => setContourSettings(p => ({ ...p, expand: v }))}
                    className="h-1.5"
                  />
                </div>
              </div>
            )}

            {!selectedJob && (
              <p className="text-xs text-muted-foreground italic">
                Select a job to configure its cut contour
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Right panel — visual preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlignCenter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Sheet Layout Preview</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{queue?.sheetWidth || 13}" × {queue?.sheetHeight || 19}"</span>
            <span>{previewJobs.length} job{previewJobs.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 bg-neutral-950 overflow-auto">
          {/* Sheet preview with crop marks */}
          <div className="relative">
            {/* Crop marks around the sheet */}
            {cropMarks.enabled && (
              <>
                {/* Corner marks — simplified SVG representation */}
                <svg className="absolute inset-0 pointer-events-none overflow-visible z-10"
                  style={{ width: "100%", height: "100%" }}>
                  {/* TL */}
                  <line x1="-12" y1="0" x2="-3" y2="0" stroke={cropMarks.color} strokeWidth="0.5" />
                  <line x1="0" y1="-12" x2="0" y2="-3" stroke={cropMarks.color} strokeWidth="0.5" />
                  {/* TR */}
                  <line x1="calc(100% + 3px)" y1="0" x2="calc(100% + 12px)" y2="0" stroke={cropMarks.color} strokeWidth="0.5" />
                  <line x1="100%" y1="-12" x2="100%" y2="-3" stroke={cropMarks.color} strokeWidth="0.5" />
                </svg>
              </>
            )}

            {/* Sheet */}
            <div
              className="relative border border-border/50 bg-white/5"
              style={{
                width: "320px",
                height: `${(320 / (queue?.sheetWidth || 13)) * (queue?.sheetHeight || 19)}px`,
              }}
            >
              {/* Registration marks */}
              {regMarks.enabled && (
                <>
                  {[
                    { top: 8, left: 8 },
                    { top: 8, right: 8 },
                    { bottom: 8, left: 8 },
                    { bottom: 8, right: 8 },
                  ].map((pos, i) => (
                    <div
                      key={i}
                      className="absolute w-4 h-4 flex items-center justify-center"
                      style={pos}
                    >
                      <div className="w-3 h-3 rounded-full border border-black/60 flex items-center justify-center">
                        <div className="w-px h-3 bg-black/60 absolute" />
                        <div className="h-px w-3 bg-black/60 absolute" />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Job thumbnails */}
              {previewJobs.map((job, i) => {
                const scaleX = 320 / (queue?.sheetWidth || 13);
                const scaleY = ((320 / (queue?.sheetWidth || 13)) * (queue?.sheetHeight || 19)) / (queue?.sheetHeight || 19);
                const x = (job.posX || 0.5) * scaleX;
                const y = (job.posY || 0.5) * scaleY;
                const w = Math.min(job.width * scaleX, 80);
                const h = Math.min(job.height * scaleY, 80);

                return (
                  <div
                    key={job.id}
                    className="absolute border rounded-sm overflow-hidden"
                    style={{
                      left: Math.min(x, 320 - w - 4),
                      top: Math.min(y, ((320 / (queue?.sheetWidth || 13)) * (queue?.sheetHeight || 19)) - h - 4),
                      width: w,
                      height: h,
                      borderColor: job.hasCutContour ? (job.cutContourColor || "#FF00FF") : "rgba(255,255,255,0.2)",
                      borderWidth: job.hasCutContour ? 1.5 : 1,
                      borderStyle: job.hasCutContour ? "dashed" : "solid",
                    }}
                  >
                    {job.previewData?.startsWith("data:") ? (
                      <img src={job.previewData} alt={job.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[8px] text-white/40 px-1" style={{ backgroundColor: job.previewData || "#222" }}>
                        {job.name.split(".")[0].slice(0, 8)}
                      </div>
                    )}
                    {/* Cut contour indicator */}
                    {job.hasCutContour && (
                      <div
                        className="absolute inset-0 rounded-sm"
                        style={{
                          boxShadow: `inset 0 0 0 1.5px ${job.cutContourColor || "#FF00FF"}`,
                        }}
                      />
                    )}
                  </div>
                );
              })}

              {previewJobs.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white/20">
                  No jobs in queue
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="border-t border-border px-4 py-2 bg-card flex items-center gap-4 text-xs text-muted-foreground">
          <span>Crop marks: <span className={cropMarks.enabled ? "text-green-400" : "text-muted-foreground"}>{cropMarks.enabled ? "On" : "Off"}</span></span>
          <span>•</span>
          <span>Reg marks: <span className={regMarks.enabled ? "text-green-400" : "text-muted-foreground"}>{regMarks.enabled ? "On" : "Off"}</span></span>
          <span>•</span>
          <span>
            Cut contour jobs: <span className="text-foreground">{jobs.filter(j => j.hasCutContour).length}</span>
          </span>
          <span>•</span>
          <span>Bleed: <span className="text-foreground">{cropMarks.bleed}mm</span></span>
        </div>
      </div>
    </div>
  );
}
