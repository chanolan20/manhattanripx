import type { Queue, License } from "@shared/schema";
import type { ActiveView } from "@/pages/MainApp";
import {
  Layers, LayoutGrid, Palette, Settings, Monitor, Plus, ChevronDown,
  Scissors, Shield, ShieldCheck, Zap, Crown, Wand2, FolderOpen, Sliders, Grid3X3, Sparkles
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  queues: Queue[];
  activeQueueId: number;
  activeView: ActiveView;
  onSelectQueue: (id: number) => void;
  onSelectView: (view: ActiveView) => void;
}

const mainViews: { id: ActiveView; label: string; icon: typeof Layers }[] = [
  { id: "queue", label: "Print Queue", icon: Layers },
  { id: "gang-sheet", label: "Gang Sheet Builder", icon: LayoutGrid },
  { id: "nesting", label: "Nesting Preview", icon: Grid3X3 },
  { id: "hot-folder", label: "Hot Folder / Auto", icon: FolderOpen },
  { id: "separation-studio", label: "Separation Studio", icon: Sliders },
  { id: "auto-profiler", label: "AI Auto-Profiler", icon: Sparkles },
  { id: "print-cut", label: "Print & Cut", icon: Scissors },
  { id: "image-tools", label: "Image Tools", icon: Wand2 },
  { id: "color", label: "Color Management", icon: Palette },
  { id: "print-modes", label: "Print Modes", icon: Settings },
  { id: "devices", label: "Devices", icon: Monitor },
];

const bottomViews: { id: ActiveView; label: string; icon: typeof Layers }[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "license", label: "License", icon: Shield },
];

export default function Sidebar({ queues, activeQueueId, activeView, onSelectQueue, onSelectView }: Props) {
  const [queuesOpen, setQueuesOpen] = useState(true);
  const { toast } = useToast();

  const { data: license } = useQuery<License>({
    queryKey: ["/api/license"],
    refetchInterval: 60000,
  });

  const isLicensed = true; // FULLY UNLOCKED
  const isTrial = false;
  const trialRemaining = 999999;
  const trialLow = false;

  const createQueueMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/queues", {
      name: `Queue ${queues.length + 1}`,
      deviceId: 1,
      status: "stopped",
      layoutMode: "order_page",
      autoProcess: false,
      gangSheet: false,
      sheetWidth: 13,
      sheetHeight: 19,
      substrateColor: "#ffffff",
      jobCount: 0,
    }).then(r => r.json()),
    onSuccess: (q) => {
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
      onSelectQueue(q.id);
      toast({ title: "Queue created" });
    },
  });

  return (
    <div className="w-44 border-r border-border bg-card flex flex-col overflow-hidden" data-testid="sidebar">
      {/* Main Views */}
      <div className="p-1.5 border-b border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1.5 mb-1">Workspace</p>
        {mainViews.map((v) => {
          const Icon = v.icon;
          const active = activeView === v.id;
          return (
            <button
              key={v.id}
              onClick={() => onSelectView(v.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors text-[11px] font-medium ${
                active
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid={`view-${v.id}`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span className="truncate">{v.label}</span>
            </button>
          );
        })}
      </div>

      {/* Queues */}
      <div className="flex-1 overflow-auto p-1.5">
        <div
          className="flex items-center justify-between px-1.5 mb-1 cursor-pointer"
          onClick={() => setQueuesOpen(!queuesOpen)}
        >
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <ChevronDown className={`w-3 h-3 transition-transform ${queuesOpen ? "" : "-rotate-90"}`} />
            Queues
          </p>
          <button
            className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => { e.stopPropagation(); createQueueMutation.mutate(); }}
            title="New Queue"
            data-testid="btn-new-queue"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {queuesOpen && queues.map((q) => {
          const active = activeQueueId === q.id && activeView === "queue";
          return (
            <button
              key={q.id}
              onClick={() => onSelectQueue(q.id)}
              className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-colors group ${
                active ? "bg-primary/15 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid={`queue-${q.id}`}
            >
              <StatusDot status={q.status} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">{q.name}</p>
                <p className="text-[9px] text-muted-foreground/60 truncate">{q.jobCount} jobs</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom: Settings + License */}
      <div className="border-t border-border p-1.5 space-y-0.5">
        {bottomViews.map((v) => {
          const Icon = v.icon;
          const active = activeView === v.id;
          const isLic = v.id === "license";
          return (
            <button
              key={v.id}
              onClick={() => onSelectView(v.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors text-[11px] font-medium ${
                active
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : isLic && trialLow
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid={`view-${v.id}`}
            >
              {isLic ? (
                isLicensed ? <ShieldCheck className="w-3 h-3 shrink-0 text-green-400" /> :
                <Shield className={`w-3 h-3 shrink-0 ${trialLow ? "text-red-400" : "text-yellow-400"}`} />
              ) : <Icon className="w-3 h-3 shrink-0" />}
              <span className="truncate">{v.label}</span>
              {isLic && isTrial && (
                <span className={`ml-auto text-[9px] font-medium shrink-0 ${trialLow ? "text-red-400" : "text-yellow-500"}`}>
                  {trialRemaining}
                </span>
              )}
            </button>
          );
        })}

        {/* Status footer */}
        <div className="px-2 pt-1">
          <div className="text-[9px] text-muted-foreground flex justify-between items-center">
            <span>MRX v2.1</span>
            <span className={`font-medium ${isLicensed ? "text-green-400" : "text-yellow-400"} flex items-center gap-0.5`}>
              <><Crown className="w-2.5 h-2.5" />Pro Unlocked</>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-500",
    stopped: "bg-zinc-500",
    paused: "bg-amber-500",
    error: "bg-red-500",
  };
  return (
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[status] || "bg-zinc-500"} ${status === "running" ? "animate-pulse" : ""}`} />
  );
}
