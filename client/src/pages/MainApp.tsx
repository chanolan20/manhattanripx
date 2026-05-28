/**
 * Manhattan RIP X — MainApp
 * Full DFv12-equivalent layout with all features wired.
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Queue, Job, Device } from "@shared/schema";
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
import { Plus, Settings, Shield, ShieldCheck } from "lucide-react";
import PanelErrorBoundary from "@/components/PanelErrorBoundary";

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

const TOOL_VIEWS: { id: ActiveView; label: string }[] = [
  { id: "gang-sheet",        label: "Gang Sheet Builder" },
  { id: "nesting",           label: "Nesting Preview" },
  { id: "hot-folder",        label: "Hot Folder" },
  { id: "separation-studio", label: "Separation Studio" },
  { id: "auto-profiler",     label: "AI Profiler" },
  { id: "print-cut",         label: "Print & Cut" },
  { id: "image-tools",       label: "Image Tools" },
  { id: "color",             label: "Color Mgmt" },
  { id: "print-modes",       label: "Print Modes" },
  { id: "devices",           label: "Devices" },
];

// ── Upload helper — works in both Electron (IPC) and browser (XHR) ─────────
async function uploadFilesToQueue(
  files: File[] | string[],
  queueId: number,
  onSuccess: (name: string) => void,
  onError: (name: string, err: string) => void,
) {
  const eAPI = (window as any).electronAPI;

  for (const file of files) {
    if (typeof file === "string") {
      // Local filesystem path from Electron dialog
      if (eAPI?.uploadFile) {
        const result = await eAPI.uploadFile(file, queueId);
        if (result?.error) onError(file.split(/[/\\]/).pop() || file, result.error);
        else onSuccess(file.split(/[/\\]/).pop() || file);
      }
    } else {
      // Browser File object (drag-drop or file input)
      // Always use absolute URL so it works whether the renderer loaded via
      // file:// (initial load) or http://localhost:5000 (after backend ready)
      await new Promise<void>((resolve) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("queueId", String(queueId));
        const eAPI = (window as any).electronAPI;
        const port = 5000;
        const base = eAPI?.isElectron
          ? `http://localhost:${port}`
          : (window.location.origin.startsWith('file:') ? `http://localhost:${port}` : '');
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}/api/upload`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) onSuccess(file.name);
          else onError(file.name, `Server error ${xhr.status}: ${xhr.responseText.slice(0,120)}`);
          resolve();
        };
        xhr.onerror = () => { onError(file.name, "Cannot reach print server — is it still starting?"); resolve(); };
        xhr.send(formData);
      });
    }
  }
}

export default function MainApp() {
  const [activeQueueId, setActiveQueueId]       = useState<number>(1);
  const [selectedJobId, setSelectedJobId]       = useState<number | null>(null);
  const [activeView, setActiveView]             = useState<ActiveView>("queue");
  const [showPrintModeManager, setShowPrintModeManager] = useState(false);
  const [showColorManagement, setShowColorManagement]   = useState(false);
  const [showManageQueues, setShowManageQueues]         = useState(false);
  const [showColorAdjForJob, setShowColorAdjForJob]     = useState(false);
  const { toast } = useToast();
  const { show: showOnboarding, dismiss: dismissOnboarding } = useShowOnboarding();

  // ── Data queries ───────────────────────────────────────────────────────────
  const { data: queues = [] } = useQuery<Queue[]>({ queryKey: ["/api/queues"] });
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/queues", activeQueueId, "jobs"],
    queryFn: () => apiRequest("GET", `/api/queues/${activeQueueId}/jobs`).then(r => r.json()),
    enabled: !!activeQueueId,
    refetchInterval: 1500,
  });
  const { data: license } = useQuery<any>({ queryKey: ["/api/license"], refetchInterval: 60000 });

  const isLicensed    = license?.status === "active";
  const isTrial       = !isLicensed;
  const trialRemaining = (license?.trialJobsLimit || 25) - (license?.trialJobsUsed || 0);

  const selectedJob  = jobs.find(j => j.id === selectedJobId) ?? null;
  const activeQueue  = queues.find(q => q.id === activeQueueId) ?? null;
  const device       = devices[0] ?? null;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const invalidateJobs = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/queues", activeQueueId, "jobs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
  };

  const updateJobMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/jobs/${id}`, data).then(r => r.json()),
    onSuccess: invalidateJobs,
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/jobs/${id}`).then(r => r.json()),
    onSuccess: () => { invalidateJobs(); setSelectedJobId(null); },
  });

  const ripJobMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/jobs/${id}/rip`).then(r => r.json()),
    onSuccess: () => { toast({ title: "RIP started" }); invalidateJobs(); },
    onError: (e: any) => toast({ title: e.message || "RIP failed", variant: "destructive" }),
  });

  const printJobMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/jobs/${id}/print`).then(r => r.json()),
    onSuccess: () => { toast({ title: "Print job sent" }); invalidateJobs(); },
    onError: (e: any) => toast({ title: e.message || "Print failed", variant: "destructive" }),
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

  // ── Toolbar action callbacks ───────────────────────────────────────────────
  const handleOpenJob = useCallback(async () => {
    const eAPI = (window as any).electronAPI;
    if (eAPI?.openFileDialog) {
      const result = await eAPI.openFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        await uploadFilesToQueue(
          result.filePaths,
          activeQueueId,
          (name) => {
            invalidateJobs();
            toast({ title: `"${name}" added to queue` });
          },
          (name, err) => toast({ title: `Upload failed: ${name} — ${err}`, variant: "destructive" }),
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueueId]);

  const handleDrop = useCallback(async (files: File[]) => {
    await uploadFilesToQueue(
      files,
      activeQueueId,
      (name) => { invalidateJobs(); toast({ title: `"${name}" added to queue` }); },
      (name, err) => toast({ title: `Upload failed: ${name} — ${err}`, variant: "destructive" }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueueId]);

  const handleDeleteJob = useCallback(() => {
    if (selectedJobId) deleteJobMutation.mutate(selectedJobId);
  }, [selectedJobId, deleteJobMutation]);

  const handleHoldJob = useCallback(() => {
    if (selectedJobId) updateJobMutation.mutate({ id: selectedJobId, data: { status: "hold" } });
  }, [selectedJobId, updateJobMutation]);

  const handleReleaseJob = useCallback(() => {
    if (selectedJobId) updateJobMutation.mutate({ id: selectedJobId, data: { status: "pending" } });
  }, [selectedJobId, updateJobMutation]);

  const handleRipJob = useCallback(() => {
    if (selectedJobId) ripJobMutation.mutate(selectedJobId);
  }, [selectedJobId, ripJobMutation]);

  const handlePrintJob = useCallback(() => {
    if (selectedJobId) printJobMutation.mutate(selectedJobId);
  }, [selectedJobId, printJobMutation]);

  const handleAbortJob = useCallback(() => {
    if (selectedJobId) {
      apiRequest("DELETE", `/api/jobs/${selectedJobId}/rip`).catch(() => {});
      updateJobMutation.mutate({ id: selectedJobId, data: { status: "pending", ripProgress: 0 } });
    }
  }, [selectedJobId, updateJobMutation]);

  const handleCenterJob = useCallback(() => {
    if (selectedJobId && activeQueue) {
      updateJobMutation.mutate({
        id: selectedJobId,
        data: {
          posX: (activeQueue.sheetWidth || 22) / 2,
          posY: (activeQueue.sheetHeight || 60) / 2,
        },
      });
    }
  }, [selectedJobId, activeQueue, updateJobMutation]);

  const handleRemoveDone = useCallback(() => {
    jobs.filter(j => j.status === "done" || j.status === "error").forEach(j => {
      deleteJobMutation.mutate(j.id);
    });
    toast({ title: "Removed completed jobs" });
  }, [jobs, deleteJobMutation, toast]);

  const selectQueue = (id: number) => {
    setActiveQueueId(id);
    setActiveView("queue");
    setSelectedJobId(null);
  };

  const isQueueView = activeView === "queue";

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden" data-testid="main-app">

      {/* ── Top Bar ───────────────────────────────────────────────────────────── */}
      <TopBar
        device={device}
        activeQueue={activeQueue}
        selectedJob={selectedJob}
        onQueueStart={() => activeQueue && queueActionMutation.mutate({ id: activeQueue.id, action: "start" })}
        onQueueStop={() => activeQueue && queueActionMutation.mutate({ id: activeQueue.id, action: "stop" })}
        onOpenPrintModes={() => setShowPrintModeManager(true)}
        onOpenColorMgmt={() => setShowColorManagement(true)}
        onOpenManageQueues={() => setShowManageQueues(true)}
        onSelectView={setActiveView}
        onOpenJob={handleOpenJob}
        onDeleteJob={handleDeleteJob}
        onHoldJob={handleHoldJob}
        onReleaseJob={handleReleaseJob}
        onRipJob={handleRipJob}
        onPrintJob={handlePrintJob}
        onColorAdjJob={() => selectedJob && setShowColorAdjForJob(true)}
        onAbortJob={handleAbortJob}
        onCenterJob={handleCenterJob}
        onRemoveDone={handleRemoveDone}
      />

      {/* ── Queue + Tool Tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-end bg-[hsl(220_13%_9%)] border-b border-border px-1 pt-1 gap-0 overflow-x-auto shrink-0" style={{ minHeight: 30 }}>
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

        <button
          onClick={() => createQueueMutation.mutate()}
          className="flex items-center justify-center w-7 h-7 ml-1 rounded-t text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          title="New Queue"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-border/40 mx-2 self-center shrink-0" />

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
            >
              {v.label}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Settings + license */}
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

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Print Queue View */}
        {isQueueView && (
          <>
            <div className="flex flex-col flex-1 overflow-hidden min-w-0" style={{ maxWidth: "56%" }}>
              <QueueJobList
                queue={activeQueue}
                jobs={jobs}
                selectedJobId={selectedJobId}
                onSelectJob={setSelectedJobId}
                onDeleteJob={(id) => deleteJobMutation.mutate(id)}
                onHoldJob={(id) => updateJobMutation.mutate({ id, data: { status: "hold" } })}
                onReleaseJob={(id) => updateJobMutation.mutate({ id, data: { status: "pending" } })}
                onPrintJob={(id) => printJobMutation.mutate(id)}
                onDrop={handleDrop}
                onUpdateJob={(id, data) => updateJobMutation.mutate({ id, data })}
              />
            </div>

            <div className="w-px bg-border cursor-col-resize hover:bg-primary/40 transition-colors shrink-0" />

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
                onPrint={() => selectedJob && printJobMutation.mutate(selectedJob.id)}
                onOpenColorMgmt={() => setShowColorManagement(true)}
              />
            </div>
          </>
        )}

        {/* Tool views — each wrapped in an error boundary so crashes show a retry button */}
        {activeView === "gang-sheet" && (
          <PanelErrorBoundary name="Gang Sheet Builder">
            <GangSheetBuilder queue={activeQueue} jobs={jobs} onUpdate={(id, data) => updateJobMutation.mutate({ id, data })} />
          </PanelErrorBoundary>
        )}
        {activeView === "nesting" && (
          <PanelErrorBoundary name="Nesting Preview">
            <NestingPreview queue={activeQueue} jobs={jobs} />
          </PanelErrorBoundary>
        )}
        {activeView === "hot-folder" && (
          <PanelErrorBoundary name="Hot Folder">
            <HotFolderPanel />
          </PanelErrorBoundary>
        )}
        {activeView === "separation-studio" && (
          <PanelErrorBoundary name="Separation Studio">
            <SeparationStudio />
          </PanelErrorBoundary>
        )}
        {activeView === "auto-profiler" && (
          <PanelErrorBoundary name="AI Profiler">
            <AutoProfilerPanel />
          </PanelErrorBoundary>
        )}
        {activeView === "image-tools" && (
          <PanelErrorBoundary name="Image Tools">
            <ImageToolsPanel queue={activeQueue} jobs={jobs} selectedJob={selectedJob}
              onUpdate={(id, data) => updateJobMutation.mutate({ id, data })} />
          </PanelErrorBoundary>
        )}
        {activeView === "print-cut" && (
          <PanelErrorBoundary name="Print &amp; Cut">
            <PrintCutManager queue={activeQueue} jobs={jobs} selectedJob={selectedJob}
              onUpdate={(id, data) => updateJobMutation.mutate({ id, data })} />
          </PanelErrorBoundary>
        )}
        {activeView === "devices" && (
          <PanelErrorBoundary name="Devices">
            <DeviceStatus device={device} />
          </PanelErrorBoundary>
        )}
        {activeView === "color" && (
          <PanelErrorBoundary name="Color Management">
            <ColorManagement />
          </PanelErrorBoundary>
        )}
        {activeView === "print-modes" && (
          <PanelErrorBoundary name="Print Modes">
            <PrintModeManager deviceId={device?.id || 1} />
          </PanelErrorBoundary>
        )}
        {activeView === "settings" && (
          <div className="flex-1 overflow-auto"><SettingsPage onClose={() => setActiveView("queue")} /></div>
        )}
        {activeView === "license" && (
          <div className="flex-1 overflow-auto"><LicenseScreen /></div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
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
