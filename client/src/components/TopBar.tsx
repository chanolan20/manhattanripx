/**
 * Manhattan RIP X — TopBar v2.1
 * DF v12-exact layout: title bar → menu bar → large icon toolbar strip
 * NEW: ink level gauges wired to /api/ink-levels (6-channel CMYKWW),
 *      spooler status wired to /api/spooler/status,
 *      Spot Color Library button, Knockout button.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Device, Queue, Job } from "@shared/schema";
import { Play, Square, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActiveView } from "@/pages/MainApp";
import { apiRequest } from "@/lib/queryClient";

interface InkChannel {
  channel: string;
  label: string;
  color: string;
  pct: number;
}
interface InkLevelsResponse {
  device: string;
  inkSetup: string;
  channels: InkChannel[];
  updatedAt: string;
}
interface SpoolerStatusResponse {
  state: "idle" | "ripping" | "printing";
  activeQueues: number;
  jobs: { total: number; processing: number; pending: number; done: number; error: number };
  currentJob: Job | null;
  updatedAt: string;
}

interface Props {
  device: Device | null;
  activeQueue: Queue | null;
  selectedJob: Job | null;
  onQueueStart: () => void;
  onQueueStop: () => void;
  onOpenPrintModes: () => void;
  onOpenColorMgmt: () => void;
  onOpenManageQueues?: () => void;
  onSelectView?: (v: ActiveView) => void;
  onOpenJob?: () => void;
  onDeleteJob?: () => void;
  onHoldJob?: () => void;
  onReleaseJob?: () => void;
  onRipJob?: () => void;
  onPrintJob?: () => void;
  onColorAdjJob?: () => void;
  onAbortJob?: () => void;
  onCenterJob?: () => void;
  onRemoveDone?: () => void;
}

type MenuItemEntry = string | { label: string; shortcut?: string };
type MenuGroup = { label: string; items: MenuItemEntry[] };

const MENU_ITEMS: MenuGroup[] = [
  {
    label: "File",
    items: [
      { label: "Open Job…", shortcut: "Ctrl+O" },
      { label: "Import Folder…" },
      { label: "Import PDF…" },
      { label: "Import PSD…" },
      "---",
      { label: "Export Queue" },
      "---",
      { label: "Exit", shortcut: "Alt+F4" },
    ],
  },
  {
    label: "Queue",
    items: [
      { label: "Start Queue", shortcut: "F5" },
      { label: "Stop Queue", shortcut: "F6" },
      "---",
      { label: "Manage Queues…" },
      "---",
      { label: "Gang Sheet Builder" },
      { label: "Nesting Preview" },
    ],
  },
  {
    label: "Jobs",
    items: [
      { label: "Hold Job" },
      { label: "Release Job" },
      { label: "Rip Only" },
      { label: "Print Job", shortcut: "F8" },
      "---",
      { label: "Easy Color Adjustments…" },
      { label: "View Raw Data" },
      "---",
      { label: "Remove Job", shortcut: "Del" },
      { label: "Remove All Done" },
    ],
  },
  {
    label: "Devices",
    items: [
      { label: "Manage Devices…" },
      { label: "Manage Print Modes…" },
      "---",
      { label: "Printer Status" },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Hot Folder / Automation" },
      { label: "Separation Studio" },
      { label: "AI Auto-Profiler" },
      "---",
      { label: "Color Management…" },
      { label: "Spot Color Library…" },
      "---",
      { label: "Image Tools" },
      { label: "Print & Cut" },
    ],
  },
  {
    label: "View",
    items: [
      { label: "Print Queue" },
      { label: "Gang Sheet Builder" },
      { label: "Color Management" },
      { label: "Print Mode Manager" },
    ],
  },
  {
    label: "Help",
    items: [
      { label: "Getting Started" },
      { label: "Check for Updates" },
      "---",
      { label: "About Manhattan RIP X" },
    ],
  },
];

// MRX-style toolbar button
function TBtn({
  icon, label, onClick, variant, title, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  variant?: "destructive" | "primary";
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded
        min-w-[38px] h-[46px] transition-colors
        ${disabled ? "opacity-30 cursor-not-allowed" :
          variant === "destructive"
            ? "text-red-400/80 hover:text-red-300 hover:bg-red-950/40 cursor-pointer"
            : variant === "primary"
            ? "text-primary hover:bg-primary/10 cursor-pointer"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
        }
      `}
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      <span className="text-[9px] leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

function Icon({ children, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

const VSep = () => <div className="w-px h-8 bg-border/60 mx-0.5 shrink-0" />;

// Ink gauge bar — one channel
function InkGauge({ channel, color, pct, label }: InkChannel) {
  const isLow = pct < 20;
  const isMed = pct >= 20 && pct < 40;
  const fillColor = isLow ? "#ef4444" : isMed ? "#f59e0b" : color;
  return (
    <div className="flex flex-col items-center gap-0.5" title={`${label}: ${pct}%`}>
      <div className="w-[14px] h-[26px] bg-muted/40 border border-border/60 rounded-sm overflow-hidden relative">
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-500"
          style={{ height: `${pct}%`, backgroundColor: fillColor }}
        />
        {isLow && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[6px] text-red-300 font-bold leading-none">!</span>
          </div>
        )}
      </div>
      <span className="text-[7px] text-muted-foreground font-mono leading-none">{channel}</span>
    </div>
  );
}

export default function TopBar({
  device, activeQueue, selectedJob,
  onQueueStart, onQueueStop,
  onOpenPrintModes, onOpenColorMgmt, onOpenManageQueues,
  onSelectView,
  onOpenJob, onDeleteJob, onHoldJob, onReleaseJob,
  onRipJob, onPrintJob, onColorAdjJob, onAbortJob, onCenterJob,
  onRemoveDone,
}: Props) {
  const isRunning = activeQueue?.status === "running";
  const hasJob = !!selectedJob;
  const cleanupRef = useRef<(() => void) | null>(null);

  // ── Live ink levels (poll every 30s) ─────────────────────────────────────
  const { data: inkData } = useQuery<InkLevelsResponse>({
    queryKey: ["/api/ink-levels"],
    queryFn: () => apiRequest("GET", "/api/ink-levels").then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  // ── Live spooler status (poll every 5s) ──────────────────────────────────
  const { data: spoolerData } = useQuery<SpoolerStatusResponse>({
    queryKey: ["/api/spooler/status"],
    queryFn: () => apiRequest("GET", "/api/spooler/status").then(r => r.json()),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  // Fallback channels if API hasn't responded yet
  const inkChannels: InkChannel[] = inkData?.channels ?? [
    { channel: "C",  label: "Cyan",      color: "#00b8d9", pct: 0 },
    { channel: "M",  label: "Magenta",   color: "#ff006e", pct: 0 },
    { channel: "Y",  label: "Yellow",    color: "#ffd000", pct: 0 },
    { channel: "K",  label: "Black",     color: "#444444", pct: 0 },
    { channel: "W",  label: "White (L)", color: "#e0e0e0", pct: 0 },
    { channel: "W2", label: "White (R)", color: "#c8c8c8", pct: 0 },
  ];

  const spoolerState = spoolerData?.state ?? (isRunning ? "printing" : "idle");
  const spoolerLabel =
    spoolerState === "printing" ? "● Printing" :
    spoolerState === "ripping"  ? "◉ Ripping"  :
    "■ Idle";
  const spoolerColor =
    spoolerState === "printing" ? "text-green-400" :
    spoolerState === "ripping"  ? "text-cyan-400"  :
    "text-muted-foreground";

  // Electron menu bridge
  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case "Open Job…":           onOpenJob?.();           break;
      case "Remove Job":          onDeleteJob?.();         break;
      case "Hold Job":            onHoldJob?.();           break;
      case "Release Job":         onReleaseJob?.();        break;
      case "Rip Only":            onRipJob?.();            break;
      case "Print Job":           onPrintJob?.();          break;
      case "Easy Color Adjustments…": onColorAdjJob?.();  break;
      case "Remove All Done":     onRemoveDone?.();        break;
      case "Abort":               onAbortJob?.();          break;
      case "Start Queue":         onQueueStart();          break;
      case "Stop Queue":          onQueueStop();           break;
      case "Manage Queues…":      onOpenManageQueues?.();  break;
      case "Manage Print Modes…": onOpenPrintModes();      break;
      case "Color Management…":   onOpenColorMgmt();       break;
      case "Print Queue":         onSelectView?.("queue"); break;
      case "Gang Sheet Builder":  onSelectView?.("gang-sheet");  break;
      case "Color Management":    onSelectView?.("color"); break;
      case "Print Mode Manager":  onSelectView?.("print-modes"); break;
    }
  }, [selectedJob, activeQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMenu = (label: string) => handleMenuAction(label);

  useEffect(() => {
    const eAPI = (window as any).electronAPI;
    if (!eAPI?.onMenuAction) return;
    const cleanup = eAPI.onMenuAction((action: string) => handleMenuAction(action));
    cleanupRef.current = cleanup;
    return () => { cleanupRef.current?.(); };
  }, [handleMenuAction]);

  // Low ink warning flag
  const hasLowInk = inkChannels.some(ch => ch.pct < 20);

  return (
    <div className="flex flex-col shrink-0 bg-[hsl(220_13%_11%)] border-b border-border select-none">
      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 h-7 border-b border-border/40">
        <span className="text-[11px] font-semibold text-foreground/90 tracking-wide">
          Manhattan RIP X
        </span>
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground/60">
          {device && (
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${device.status === "online" ? "bg-green-400" : "bg-red-500"}`} />
              {device.name}
            </span>
          )}
          {hasLowInk && (
            <span className="text-amber-400 font-medium animate-pulse">⚠ Low Ink</span>
          )}
          {inkData?.inkSetup && (
            <span className="font-mono text-muted-foreground/40">{inkData.inkSetup}</span>
          )}
        </div>
      </div>

      {/* ── Menu bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center h-6 px-1 border-b border-border/30 gap-0">
        {MENU_ITEMS.map(menu => (
          <DropdownMenu key={menu.label}>
            <DropdownMenuTrigger asChild>
              <button className="px-2.5 h-6 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-sm transition-colors">
                {menu.label}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[200px] text-xs" align="start" sideOffset={0}>
              {menu.items.map((item, i) =>
                item === "---" ? (
                  <DropdownMenuSeparator key={i} />
                ) : (
                  <DropdownMenuItem
                    key={typeof item === "string" ? item : item.label}
                    className="text-xs flex justify-between gap-8"
                    onSelect={() => handleMenu(typeof item === "string" ? item : item.label)}
                  >
                    <span>{typeof item === "string" ? item : item.label}</span>
                    {typeof item !== "string" && item.shortcut && (
                      <span className="text-muted-foreground/60 text-[10px] font-mono">{item.shortcut}</span>
                    )}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </div>

      {/* ── Icon Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center h-[54px] px-2 gap-0.5 overflow-x-auto">

        {/* File */}
        <TBtn label="Open" title="Open Job (Ctrl+O)" onClick={onOpenJob}
          icon={<Icon><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></Icon>} />
        <TBtn label="Remove" title="Remove Selected Job (Del)" variant="destructive" disabled={!hasJob} onClick={onDeleteJob}
          icon={<Icon><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Icon>} />

        <VSep />

        {/* Job control */}
        <TBtn label="Hold" title="Hold Selected Job" disabled={!hasJob} onClick={onHoldJob}
          icon={<Icon><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></Icon>} />
        <TBtn label="Release" title="Release Held Job" disabled={!hasJob} onClick={onReleaseJob}
          icon={<Icon><polygon points="5 3 19 12 5 21 5 3"/></Icon>} />

        <VSep />

        {/* Print ops */}
        <TBtn label="Spool" title="Spool / RIP Job" disabled={!hasJob} onClick={onRipJob}
          icon={<Icon><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></Icon>} />
        <TBtn label="Print" title="Print Selected Job (F8)" variant="primary" disabled={!hasJob} onClick={onPrintJob}
          icon={<Icon><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></Icon>} />
        <TBtn label="Rip Only" title="RIP without printing" disabled={!hasJob} onClick={onRipJob}
          icon={<Icon><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Icon>} />

        <VSep />

        {/* Layout */}
        <TBtn label="Center" title="Center job on sheet" disabled={!hasJob} onClick={onCenterJob}
          icon={<Icon><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></Icon>} />
        <TBtn label="Fit Page" title="Fit job to page" disabled={!hasJob} onClick={() => {}}
          icon={<Icon><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></Icon>} />
        <TBtn label="Fit Width" title="Fit job to width" disabled={!hasJob} onClick={() => {}}
          icon={<Icon><polyline points="9 3 3 3 3 9"/><polyline points="15 3 21 3 21 9"/><line x1="3" y1="3" x2="10" y2="10"/><line x1="21" y1="3" x2="14" y2="10"/></Icon>} />

        <VSep />

        {/* Color / settings */}
        <TBtn label="Color Adj" title="Easy Color Adjustments" disabled={!hasJob} onClick={onColorAdjJob}
          icon={<Icon><circle cx="13" cy="6" r="2"/><circle cx="6" cy="16" r="2"/><circle cx="20" cy="16" r="2"/><path d="M6 14v-2a6 6 0 0 1 6-6h1"/><path d="M20 14v-4a8 8 0 0 0-8-8"/></Icon>} />
        <TBtn label="Print Modes" title="Manage Print Modes" onClick={onOpenPrintModes}
          icon={<Icon><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 17.66l-1.41 1.41M22 12h-2M4 12H2M19.07 19.07l-1.41-1.41M5.34 6.34L3.93 4.93M12 22v-2M12 4V2"/></Icon>} />
        <TBtn label="Queues" title="Manage Queues" onClick={onOpenManageQueues}
          icon={<Icon><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Icon>} />

        <VSep />

        {/* DF v12 NEW: Spot Color Library button */}
        <TBtn label="Spot Color" title="Spot Color Library (Pantone / brand colors)" onClick={() => onSelectView?.("color")}
          icon={<Icon>
            <circle cx="8" cy="8" r="3" fill="hsl(var(--primary)/0.3)"/>
            <circle cx="16" cy="8" r="3" fill="none"/>
            <circle cx="12" cy="15" r="3" fill="none"/>
            <path d="M8 8h8M8 8l4 7M16 8l-4 7"/>
          </Icon>} />

        {/* DF v12 NEW: Knockout button */}
        <TBtn label="Knockout" title="White knockout — remove white underbase from selected area" disabled={!hasJob} onClick={() => {}}
          icon={<Icon>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M8 12h8M12 8v8" strokeDasharray="2 1"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" fill="hsl(var(--background))"/>
          </Icon>} />

        <VSep />

        {/* Abort */}
        <TBtn label="Abort" title="Abort current job" variant="destructive" disabled={!hasJob} onClick={onAbortJob}
          icon={<Icon><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></Icon>} />

        <VSep />

        {/* Start / Stop queue toggle */}
        <button
          onClick={isRunning ? onQueueStop : onQueueStart}
          data-testid="btn-queue-toggle"
          className={`
            flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded h-[46px] min-w-[52px]
            font-medium text-[10px] transition-colors shrink-0
            ${isRunning
              ? "bg-red-900/40 border border-red-800/50 text-red-300 hover:bg-red-900/60"
              : "bg-green-900/30 border border-green-800/50 text-green-300 hover:bg-green-900/50"
            }
          `}
        >
          {isRunning
            ? <><Square className="w-4 h-4" /><span>Stop</span></>
            : <><Play className="w-4 h-4" /><span>Start</span></>
          }
        </button>

        <div className="flex-1" />

        {/* ── Live Ink Gauges (CMYKWW) ───────────────────────────────────── */}
        <div className="flex items-end gap-1 mr-2 shrink-0" title={`Ink levels — ${inkData?.device ?? "ET-8550"}`}>
          <span className="text-[8px] text-muted-foreground/50 mb-1 mr-0.5 font-mono">INK</span>
          {inkChannels.map(ch => <InkGauge key={ch.channel} {...ch} />)}
        </div>

        {/* ── Spooler / Queue status ─────────────────────────────────────── */}
        <div className="flex flex-col items-end justify-center text-[9px] border-l border-border pl-2 shrink-0 min-w-[72px]">
          <span className="text-muted-foreground/60">
            Jobs: <span className="text-foreground font-mono">{spoolerData?.jobs.total ?? activeQueue?.jobCount ?? 0}</span>
            {(spoolerData?.jobs.error ?? 0) > 0 && (
              <span className="text-red-400 ml-1">({spoolerData!.jobs.error} err)</span>
            )}
          </span>
          <span className={`font-medium ${spoolerColor}`}>{spoolerLabel}</span>
        </div>
      </div>
    </div>
  );
}
