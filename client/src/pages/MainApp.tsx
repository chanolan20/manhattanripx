/**
 * Manhattan RIP X — MainApp
 *
 * MRX main application layout — queue list + preview + JobBar:
 *
 *  ┌──────────────────────────────────────────────────────┐
 *  │  Title Bar (logo · device name · status)             │
 *  │  Menu Bar (File Queue Jobs Devices Tools View Help)  │
 *  │  Icon Toolbar (Open Remove Hold Release Spool Print…)│
 *  ├──────────────────────────────────────────────────────┤
 *  │  [Queue 1 ▶] [Queue 2] [+]   ···   [Tools nav tabs] │
 *  ├────────────────────────────┬─────────────────────────┤
 *  │                            │  Preview Canvas          │
 *  │  Job List (table)          │  (rulers, gray bg,       │
 *  │  Name/Status/PrintMode/    │   white sheet, image)   │
 *  │  Copies/Cost/Type/Dims/Port│                          │
 *  ├─────────────────┬──────────┤─────────────────────────┤
 *  │  Reserved ──────│─ Browse  │  Smart Bar (thumbnail,   │
 *  │  (done jobs)    │          │  job name, W×H, scale,   │
 *  │                 │          │  pos, copies, actions)   │
 *  └─────────────────┴──────────┴─────────────────────────┘
 */

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Queue, Job, Device, PrintMode } from "@shared/schema";
import QueueJobList from "@/components/QueueJobList";
import PreviewCanvas from "@/components/PreviewCanvas";
import SmartBar from "@/components/SmartBar";
import PrintModeManager from "@/components/PrintModeManager";
import GangSheetBuilder from "@/components/GangSheetBuilder";
import ColorManagement from "@/components/ColorManagement";
import DeviceStatus from "@/components/DeviceStatus";
import TopBar from "@/components/TopBar";
import SettingsPage from "@/components/SettingsPage";
import LicenseScreen from "@/components/LicenseScreen";
import PrintCutManager from "@/components/PrintCutManager";
import ImageToolsPanel from "@/components/ImageToolsPanel";
import HotFolderPanel from "@/components/HotFolderPanel";
import AutoProfilerPanel from "@/components/AutoProfilerPanel";
import SeparationStudio from "@/components/SeparationStudio";
import NestingPreview from "@/components/NestingPreview";
import ManageQueuesDialog from "@/components/ManageQueuesDialog";
import OnboardingChecklist, { useShowOnboarding } from "@/components/OnboardingChecklist";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, ChevronDown, Settings, Shield, ShieldCheck, Zap, Crown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useMutation as useMut } from "@tanstack/react-query";

export type ActiveView =
  | "queue"
  | "gang-sheet"
  | "nesting"
  | "hot-folder"
  | "separation-studio"
  | "auto-profiler"
  | "print-cut"
  | "image-tools"
  | "color"
  | "print-modes"
  | "devices"
  | "settings"
  | "license";

// Mapping from tool views to display labels (shown in secondary tab strip)
const TOOL_VIEWS: { id: ActiveView; label: string }[] = [
  { id: "gang-sheet", label: "Gang Sheet Builder" },
  { id: "nesting", label: "Nesting Preview" },
  { id: "hot-folder", label: "Hot Folder" },
  { id: "separation-studio", label: "Separation Studio" },
  { id: "auto-profiler", label: "AI Profiler" },
  { id: "print-cut", label: "Print & Cut" },
  { id: "image-tools", label: "Image Tools" },
  { id: "color", label: "Color Mgmt" },
  { id: "print-modes", label: "Print Modes" },
  { id: "devices", label: "Devices" },
];

export default function MainApp() {
  const [activeQueueId, setActiveQueueId] = useState<number>(1);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("queue");
  const [showPrintModeManager, setShowPrintModeManager] = useState(false);
  const [showColorManagement, setShowColorManagement] = useState(false);
  const [showManageQueues, setShowManageQueues] = useState(false);
  const { toast } = useToast();
  const { show: showOnboarding, dismiss: dismissOnboarding } = useShowOnboarding();
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);

  const { data: queues = [] } = useQuery<Queue[]>({ queryKey: ["/api/queues"] });
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/queues", activeQueueId, "jobs"],
    queryFn: () => apiRequest("GET", `/api/queues/${activeQueueId}/jobs`).then(r => r.json()),
    enabled: !!activeQueueId,
    refetchInterval: 2000,
  });

  const { data: license } = useQuery<any>({ queryKey: ["/api/license"], refetchInterval: 60000 });
  const isLicensed = license?.status === "active";
  const isTrial = !isLicensed;
  const trialRemaining = (license?.trialJobsLimit || 25) - (license?.trialJobsUsed || 0);

  const selectedJob = jobs.find(j => j.id === selectedJobId) || null;
  const activeQueue = queues.find(q => q.id === activeQueueId) || null;
  const device = devices[0] || null;

  const updateJobMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/jobs/${id}`, data).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/queues", activeQueueId, "jobs"] }),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/jobs/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queues", activeQueueId, "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
      setSelectedJobId(null);
    },
  });

  const queueActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "start" | "stop" }) =>
      apiRequest("POST", `/api/queues/${id}/${action}`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/queues"] }),
  });

  const createQueueMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/queues", {
      name: `Queue ${queues.length + 1}`,
      deviceId: 1, status: "stopped", layoutMode: "order_page",
      autoProcess: false, gangSheet: false,
      sheetWidth: 22, sheetHeight: 60, substrateColor: "#ffffff", jobCount: 0,
    }).then(r => r.json()),
    onSuccess: (q) => {
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
      setActiveQueueId(q.id);
      setActiveView("queue");
      toast({ title: "Queue created" });
    },
  });

  const handleQueueUpdate = useCallback((id: number, data: any) => {
    apiRequest("PATCH", `/api/queues/${id}`, data)
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/queues"] }));
  }, []);

  const handleDrop = useCallback((files: File[]) => {
    files.forEach((file) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("queueId", String(activeQueueId));
      const xhr = new XMLHttpRequest();
      uploadXhrRef.current = xhr;
      const baseUrl = (window as any).__PORT_5000__ || "";
      xhr.open("POST", `${baseUrl}/api/upload`);
      xhr.onload = () => {
        queryClient.invalidateQueries({ queryKey: ["/api/queues", activeQueueId, "jobs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
        if (xhr.status >= 200 && xhr.status < 300) {
          toast({ title: `"${file.name}" added to queue` });
        } else {
          toast({ title: `Upload failed: ${file.name}`, variant: "destructive" });
        }
      };
      xhr.onerror = () => {
        const colors = ["#1a1a2e","#e63946","#457b9d","#2d6a4f","#9b2226","#6a0572","#f77f00","#023e8a"];
        apiRequest("POST", `/api/queues/${activeQueueId}/jobs`, {
          name: file.name, fileName: file.name,
          fileType: file.name.split(".").pop()?.toUpperCase() || "PNG",
          status: "pending", width: 10, height: 10, copies: 1, rotation: 0,
          scalePercent: 100, posX: 0.5, posY: 0.5,
          inkCost: parseFloat((Math.random() * 0.5 + 0.1).toFixed(2)),
          ripProgress: 0, previewData: colors[Math.floor(Math.random() * colors.length)],
          colorAdjustBrightness: 0, colorAdjustContrast: 0, colorAdjustSaturation: 0,
        }).then(r => r.json()).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/queues", activeQueueId, "jobs"] });
          queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
          toast({ title: `"${file.name}" added to queue` });
        });
      };
      xhr.send(formData);
    });
  }, [activeQueueId]);

  const selectQueue = (id: number) => {
    setActiveQueueId(id);
    setActiveView("queue");
    setSelectedJobId(null);
  };

  const isQueueView = activeView === "queue";

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden" data-testid="main-app">
      {/* ── Top Bar: title + menus + toolbar ──────────────────────────────── */}
      <TopBar
        device={device}
        activeQueue={activeQueue}
        onQueueStart={() => activeQueue && queueActionMutation.mutate({ id: activeQueue.id, action: "start" })}
        onQueueStop={() => activeQueue && queueActionMutation.mutate({ id: activeQueue.id, action: "stop" })}
        onOpenPrintModes={() => setShowPrintModeManager(true)}
        onOpenColorMgmt={() => setShowColorManagement(true)}
        onOpenManageQueues={() => setShowManageQueues(true)}
        onSelectView={setActiveView}
      />

      {/* ── Queue + Tool Tabs ─────────────────────────────────────────────── */}
      <div className="flex items-end bg-[hsl(220_13%_9%)] border-b border-border px-1 pt-1 gap-0 overflow-x-auto" style={{ minHeight: 30 }}>
        {/* Queue tabs (always shown, like browser tabs) */}
        {queues.map((q) => {
          const active = activeQueueId === q.id && isQueueView;
          return (
            <button
              key={q.id}
              onClick={() => selectQueue(q.id)}
              className={`
                flex items-center gap-1.5 px-3 h-7 text-[11px] font-medium rounded-t border border-b-0 transition-colors whitespace-nowrap
                ${active
                  ? "bg-card border-border text-foreground z-10"
                  : "bg-muted/20 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }
              `}
              data-testid={`queue-tab-${q.id}`}
            >
              <StatusDot status={q.status} />
              <span>{q.name}</span>
              <span className="text-[9px] text-muted-foreground/60 font-mono">[{q.jobCount}]</span>
            </button>
          );
        })}

        {/* New queue button */}
        <button
          onClick={() => createQueueMutation.mutate()}
          className="flex items-center justify-center w-7 h-7 ml-1 rounded-t text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          title="New Queue"
          data-testid="btn-new-queue"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-border/40 mx-2 self-center" />

        {/* Tool view tabs */}
        {TOOL_VIEWS.map((v) => {
          const active = activeView === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              className={`
                px-3 h-7 text-[11px] font-medium rounded-t border border-b-0 transition-colors whitespace-nowrap
                ${active
                  ? "bg-card border-border text-primary"
                  : "bg-transparent border-transparent text-muted-foreground hover:text-foreground"
                }
              `}
              data-testid={`view-${v.id}`}
            >
              {v.label}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Settings + license in far right of tab bar */}
        <div className="flex items-center gap-1 self-center pr-1">
          <button
            onClick={() => setActiveView("settings")}
            className={`px-2 h-6 text-[10px] rounded flex items-center gap-1 transition-colors ${
              activeView === "settings" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="w-3 h-3" />
            Settings
          </button>
          <button
            onClick={() => setActiveView("license")}
            className={`px-2 h-6 text-[10px] rounded flex items-center gap-1 transition-colors ${
              activeView === "license" ? "text-primary bg-primary/10" :
              isTrial && trialRemaining <= 5 ? "text-red-400 hover:bg-red-900/20" :
              "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isLicensed
              ? <ShieldCheck className="w-3 h-3 text-green-400" />
              : <Shield className={`w-3 h-3 ${trialRemaining <= 5 ? "text-red-400" : "text-yellow-400"}`} />
            }
            {isLicensed ? "Licensed" : `Trial (${trialRemaining})`}
          </button>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Print Queue View */}
        {isQueueView && (
          <>
            {/* Left: Job list (takes ~55% of width) */}
            <div className="flex flex-col flex-1 overflow-hidden min-w-0" style={{ maxWidth: "56%" }}>
              <QueueJobList
                queue={activeQueue}
                jobs={jobs}
                selectedJobId={selectedJobId}
                onSelectJob={setSelectedJobId}
                onDeleteJob={(id) => deleteJobMutation.mutate(id)}
                onHoldJob={(id) => updateJobMutation.mutate({ id, data: { status: "hold" } })}
                onReleaseJob={(id) => updateJobMutation.mutate({ id, data: { status: "pending" } })}
                onPrintJob={(id) => updateJobMutation.mutate({ id, data: { status: "processing", ripProgress: 0 } })}
                onDrop={handleDrop}
                onUpdateJob={(id, data) => updateJobMutation.mutate({ id, data })}
              />
            </div>

            {/* Resize handle */}
            <div className="w-px bg-border cursor-col-resize hover:bg-primary/40 transition-colors" />

            {/* Right: Preview canvas + Smart Bar (takes ~44%) */}
            <div className="flex flex-col overflow-hidden" style={{ flex: "0 0 44%" }}>
              <PreviewCanvas
                job={selectedJob}
                queue={activeQueue}
                onQueueUpdate={handleQueueUpdate}
              />
              <SmartBar
                job={selectedJob}
                queue={activeQueue}
                onUpdate={(data) => selectedJob && updateJobMutation.mutate({ id: selectedJob.id, data })}
                onPrint={() => selectedJob && updateJobMutation.mutate({ id: selectedJob.id, data: { status: "processing", ripProgress: 0 } })}
                onOpenColorMgmt={() => setShowColorManagement(true)}
              />
            </div>
          </>
        )}

        {/* Tool views — full width */}
        {activeView === "gang-sheet" && (
          <GangSheetBuilder queue={activeQueue} jobs={jobs} onUpdate={(id, data) => updateJobMutation.mutate({ id, data })} />
        )}
        {activeView === "nesting" && (
          <NestingPreview queue={activeQueue} jobs={jobs} />
        )}
        {activeView === "hot-folder" && <HotFolderPanel />}
        {activeView === "separation-studio" && <SeparationStudio />}
        {activeView === "auto-profiler" && <AutoProfilerPanel />}
        {activeView === "image-tools" && (
          <ImageToolsPanel queue={activeQueue} jobs={jobs} selectedJob={selectedJob}
            onUpdate={(id, data) => updateJobMutation.mutate({ id, data })} />
        )}
        {activeView === "print-cut" && (
          <PrintCutManager queue={activeQueue} jobs={jobs} selectedJob={selectedJob}
            onUpdate={(id, data) => updateJobMutation.mutate({ id, data })} />
        )}
        {activeView === "devices" && <DeviceStatus device={device} />}
        {activeView === "color" && <ColorManagement />}
        {activeView === "print-modes" && <PrintModeManager deviceId={device?.id || 1} />}
        {activeView === "settings" && (
          <div className="flex-1 overflow-auto"><SettingsPage onClose={() => setActiveView("queue")} /></div>
        )}
        {activeView === "license" && (
          <div className="flex-1 overflow-auto"><LicenseScreen onClose={() => setActiveView("queue")} /></div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showPrintModeManager && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
          onClick={() => setShowPrintModeManager(false)}>
          <div className="bg-card border border-border rounded-lg w-[800px] max-h-[80vh] overflow-auto"
            onClick={e => e.stopPropagation()}>
            <PrintModeManager deviceId={device?.id || 1} onClose={() => setShowPrintModeManager(false)} />
          </div>
        </div>
      )}
      {showColorManagement && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
          onClick={() => setShowColorManagement(false)}>
          <div className="bg-card border border-border rounded-lg w-[700px] max-h-[80vh] overflow-auto"
            onClick={e => e.stopPropagation()}>
            <ColorManagement onClose={() => setShowColorManagement(false)} />
          </div>
        </div>
      )}
      {showManageQueues && (
        <ManageQueuesDialog onClose={() => setShowManageQueues(false)} />
      )}
      {showOnboarding && (
        <OnboardingChecklist onClose={dismissOnboarding} />
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-500", stopped: "bg-zinc-500",
    paused: "bg-amber-500", error: "bg-red-500",
  };
  return (
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[status] || "bg-zinc-500"} ${status === "running" ? "animate-pulse" : ""}`} />
  );
}
