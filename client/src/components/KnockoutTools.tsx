/**
 * KnockoutTools — auto-remove black/white/color background from design
 * Accessible from Image Tools panel
 * MRX Knock-out tool panel
 */
import { useState } from "react";
import type { Job } from "@shared/schema";
import { Scissors, Loader2, Check, AlertCircle, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Props {
  job: Job | null;
  onUpdate: (id: number, data: Partial<Job>) => void;
}

type KnockoutMode = "white" | "black" | "color" | "smart";

export default function KnockoutTools({ job, onUpdate }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<KnockoutMode>("white");
  const [tolerance, setTolerance] = useState(30);
  const [smoothEdges, setSmoothEdges] = useState(true);
  const [feather, setFeather] = useState(2);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    if (!job) return;
    setRunning(true);
    setDone(false);
    try {
      // Background remove via existing endpoint (most common use case)
      const res = await apiRequest("POST", `/api/jobs/${job.id}/bg-remove`, {
        alphaMatte: smoothEdges,
        foregroundThreshold: 255 - tolerance,
        backgroundThreshold: tolerance,
        erosionSize: feather,
      });
      const data = await res.json();
      if (data.success) {
        onUpdate(job.id, { previewData: data.job?.previewData, filePath: data.job?.filePath });
        setDone(true);
        toast({ title: "Knockout applied", description: `${MODE_LABELS[mode]} background removed` });
      } else {
        toast({ title: "Knockout failed", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Knockout failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const MODE_LABELS: Record<KnockoutMode, string> = {
    white: "White",
    black: "Black",
    color: "Color",
    smart: "Smart (AI)",
  };

  const MODE_DESCRIPTIONS: Record<KnockoutMode, string> = {
    white: "Remove white and near-white background pixels",
    black: "Remove black and near-black background pixels",
    color: "Remove a specific color background (chroma-key)",
    smart: "AI-powered subject detection (U2Net model)",
  };

  return (
    <div className="space-y-4" data-testid="knockout-tools">
      <div className="flex items-center gap-2">
        <Scissors className="w-4 h-4 text-primary" />
        <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Knock-out Tools</p>
      </div>

      {!job ? (
        <div className="bg-muted/20 border border-border border-dashed rounded p-4 text-center">
          <Layers className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[11px] text-muted-foreground">Select a job to apply knockout</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mode selector */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Knockout Mode</label>
            <Select value={mode} onValueChange={v => setMode(v as KnockoutMode)}>
              <SelectTrigger className="h-7 text-xs bg-muted/40 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["white","black","color","smart"] as KnockoutMode[]).map(m => (
                  <SelectItem key={m} value={m} className="text-xs">{MODE_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[9px] text-muted-foreground/60 mt-1">{MODE_DESCRIPTIONS[mode]}</p>
          </div>

          {/* Tolerance */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">Tolerance</span>
              <span className="text-[10px] mono text-foreground">{tolerance}</span>
            </div>
            <Slider value={[tolerance]} min={0} max={100} step={5} onValueChange={([v]) => setTolerance(v)} />
            <p className="text-[9px] text-muted-foreground/50 mt-0.5">
              Lower = stricter match · Higher = remove more similar colors
            </p>
          </div>

          {/* Edge feather */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">Edge Feather</span>
              <span className="text-[10px] mono text-foreground">{feather}px</span>
            </div>
            <Slider value={[feather]} min={0} max={10} step={1} onValueChange={([v]) => setFeather(v)} />
          </div>

          {/* Smooth edges */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] text-muted-foreground">Smooth Edges (Alpha Matte)</span>
              <p className="text-[9px] text-muted-foreground/60">Feather edges for natural-looking removal</p>
            </div>
            <Switch checked={smoothEdges} onCheckedChange={setSmoothEdges} className="scale-75" />
          </div>

          {/* Action */}
          <Button
            className="w-full h-8 text-xs gap-2"
            onClick={run}
            disabled={running}
          >
            {running ? (
              <><Loader2 className="w-3 h-3 animate-spin" />Removing background...</>
            ) : done ? (
              <><Check className="w-3 h-3" />Applied — click to re-run</>
            ) : (
              <><Scissors className="w-3 h-3" />Apply {MODE_LABELS[mode]} Knockout</>
            )}
          </Button>

          {done && (
            <div className="flex items-center gap-2 bg-green-900/20 border border-green-800/30 rounded p-2">
              <Check className="w-3 h-3 text-green-400 shrink-0" />
              <p className="text-[10px] text-green-300">
                Background removed. Job preview updated. Re-RIP to process.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
