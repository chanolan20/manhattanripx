/**
 * Manhattan RIP X — TopBar
 * Exact MRX layout: title bar → menu bar → large icon toolbar strip
 */

import type { Device, Queue } from "@shared/schema";
import { Play, Square, Palette, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActiveView } from "@/pages/MainApp";

interface Props {
  device: Device | null;
  activeQueue: Queue | null;
  onQueueStart: () => void;
  onQueueStop: () => void;
  onOpenPrintModes: () => void;
  onOpenColorMgmt: () => void;
  onOpenManageQueues?: () => void;
  onSelectView?: (v: ActiveView) => void;
}

type MenuItemEntry = string | { label: string; shortcut?: string; url?: string };
type MenuGroup = { label: string; items: MenuItemEntry[] };

const MENU_ITEMS: MenuGroup[] = [
  {
    label: "File",
    items: [
      { label: "Open Job…", shortcut: "Ctrl+O" },
      { label: "Import Folder…" },
      { label: "Import PDF…" },
      { label: "Import PSD…" },
      { label: "Import SVG…" },
      "---",
      { label: "Export Queue" },
      { label: "Archive Job" },
      "---",
      { label: "Exit", shortcut: "Alt+F4" },
    ],
  },
  {
    label: "Queue",
    items: [
      { label: "Start Queue", shortcut: "F5" },
      { label: "Stop Queue", shortcut: "F6" },
      { label: "Pause Queue" },
      "---",
      { label: "Manage Queues…" },
      { label: "Queue Properties…" },
      "---",
      { label: "Gang Sheet Builder" },
      { label: "Nesting Preview" },
      "---",
      { label: "Import Queue…" },
      { label: "Export Queue…" },
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
      { label: "Update Drivers…" },
      { label: "Manage Print Modes…" },
      "---",
      { label: "Printer Status" },
      { label: "Printer Settings…" },
      { label: "Nozzle Check" },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Hot Folder / Automation" },
      { label: "Separation Studio" },
      { label: "AI Auto-Profiler" },
      "---",
      { label: "Spot Color Tables…" },
      { label: "Color Management…" },
      { label: "ICC Profiles…" },
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
      "---",
      { label: "Dark Theme" },
      { label: "Show Rulers" },
      { label: "Show Preview" },
    ],
  },
  {
    label: "Help",
    items: [
      { label: "Getting Started" },
      { label: "Manhattan RIP X Help", url: "https://manhattanripx.com/help" },
      { label: "Check for Updates" },
      "---",
      { label: "About Manhattan RIP X" },
    ],
  },
];

// MRX-style toolbar button: large icon + text label below
function TBtn({
  icon,
  label,
  onClick,
  variant,
  title,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  variant?: "destructive" | "active";
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={`
        flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded
        min-w-[38px] h-[46px] transition-colors
        ${variant === "destructive"
          ? "text-red-400/80 hover:text-red-300 hover:bg-red-950/40"
          : active
          ? "text-primary bg-primary/15 border border-primary/20"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }
      `}
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      <span className="text-[9px] leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

// SVG icon helper
function Icon({ children, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

const VSep = () => <div className="w-px h-8 bg-border/60 mx-0.5" />;

export default function TopBar({ device, activeQueue, onQueueStart, onQueueStop, onOpenPrintModes, onOpenColorMgmt, onOpenManageQueues, onSelectView }: Props) {
  const isRunning = activeQueue?.status === "running";
  const deviceOnline = device?.status === "online";

  const handleMenu = (label: string) => {
    if (label === "Manage Print Modes…" || label === "Print Mode Manager") onOpenPrintModes();
    if (label === "Color Management…" || label === "Color Management") onOpenColorMgmt();
    if (label === "Manage Queues…") onOpenManageQueues?.();
    if (label === "Queue Properties…") onOpenManageQueues?.();
    if (label === "Start Queue") onQueueStart();
    if (label === "Stop Queue") onQueueStop();
    if (label === "Hot Folder / Automation") onSelectView?.("hot-folder");
    if (label === "Separation Studio") onSelectView?.("separation-studio");
    if (label === "AI Auto-Profiler") onSelectView?.("auto-profiler");
    if (label === "Gang Sheet Builder") onSelectView?.("gang-sheet");
    if (label === "Nesting Preview") onSelectView?.("nesting");
    if (label === "Print Queue") onSelectView?.("queue");
    if (label === "Image Tools") onSelectView?.("image-tools");
    if (label === "Print & Cut") onSelectView?.("print-cut");
  };

  return (
    <div className="flex flex-col bg-[hsl(220_13%_11%)] border-b border-border select-none">
      {/* ── Title bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center h-7 px-3 border-b border-border/40 bg-[hsl(220_13%_9%)]">
        {/* Logo mark */}
        <svg width="16" height="16" viewBox="0 0 32 32" fill="none" className="mr-2 shrink-0">
          <rect x="1" y="1" width="30" height="30" rx="4" fill="hsl(199 89% 48% / 0.12)" stroke="hsl(199 89% 48%)" strokeWidth="1.5" />
          <path d="M5 24V8l5.5 9L16 8l5.5 9L27 8v16" stroke="hsl(199 89% 48%)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="27" r="1.5" fill="hsl(199 89% 48%)" />
        </svg>
        <span className="text-[11px] font-semibold text-foreground/90 tracking-wide">
          Manhattan RIP X — DTF Edition{device ? ` — ${device.name.replace(/ DTF$/, "")}` : ""}
        </span>
        <div className="flex-1" />
        {/* Printer status pill */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-2 py-0.5 border border-border/40 rounded bg-muted/20">
          <span className={`w-1.5 h-1.5 rounded-full ${deviceOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          <span>{device?.name || "No Printer"}</span>
          <span className={`font-semibold ${deviceOnline ? "text-green-400" : "text-red-400"}`}>
            {device?.status?.toUpperCase() || "OFFLINE"}
          </span>
        </div>
      </div>

      {/* ── Menu bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center h-6 px-1 border-b border-border/30 gap-0">
        {MENU_ITEMS.map((menu) => (
          <DropdownMenu key={menu.label}>
            <DropdownMenuTrigger asChild>
              <button className="px-2.5 h-full text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus:outline-none">
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

      {/* ── Icon Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center h-[54px] px-2 gap-0.5">
        {/* File ops */}
        <label title="Open Job">
          <input type="file" accept=".png,.jpg,.jpeg,.tif,.tiff,.pdf,.psd,.svg" className="hidden" />
          <TBtn label="Open" icon={<Icon><><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></></Icon>} />
        </label>
        <TBtn label="Remove" variant="destructive" icon={<Icon><><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></></Icon>} />

        <VSep />

        {/* Job control */}
        <TBtn label="Hold" icon={<Icon><><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></></Icon>} />
        <TBtn label="Release" icon={<Icon><polygon points="5 3 19 12 5 21 5 3"/></Icon>} />

        <VSep />

        {/* Print ops */}
        <TBtn label="Spool" icon={<Icon><><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></></Icon>} />
        <TBtn label="Print" icon={<Icon><><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></></Icon>} />
        <TBtn label="Rip Only" icon={<Icon><><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></></Icon>} />

        <VSep />

        {/* Layout */}
        <TBtn label="Center" icon={<Icon><><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></></Icon>} />
        <TBtn label="Fit Page" icon={<Icon><><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></></Icon>} />
        <TBtn label="Fit Width" icon={<Icon><><polyline points="9 3 3 3 3 9"/><polyline points="15 3 21 3 21 9"/><line x1="3" y1="3" x2="10" y2="10"/><line x1="21" y1="3" x2="14" y2="10"/></></Icon>} />

        <VSep />

        {/* Color */}
        <TBtn label="Color Adj" onClick={onOpenColorMgmt}
          icon={<Icon><><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></></Icon>}
        />
        <TBtn label="Print Modes" onClick={onOpenPrintModes}
          icon={<Icon><><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 17.66l-1.41 1.41M22 12h-2M4 12H2M19.07 19.07l-1.41-1.41M5.34 6.34L3.93 4.93M12 22v-2M12 4V2"/></></Icon>}
        />
        <TBtn label="Queues" onClick={onOpenManageQueues}
          icon={<Icon><><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></></Icon>}
        />

        <VSep />

        {/* Abort */}
        <TBtn label="Abort" variant="destructive"
          icon={<Icon><><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></></Icon>}
        />

        <VSep />

        {/* Start / Stop queue */}
        <button
          onClick={isRunning ? onQueueStop : onQueueStart}
          data-testid="btn-queue-toggle"
          className={`
            flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded h-[46px] min-w-[52px]
            font-medium text-[10px] transition-colors
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

        {/* Right: ink levels */}
        <div className="flex items-end gap-1.5 mr-2">
          <span className="text-[9px] text-muted-foreground/60 mb-0.5 mr-0.5">INK</span>
          {[
            { ch: "C", color: "#00b8d9", val: 72 },
            { ch: "M", color: "#ff006e", val: 55 },
            { ch: "Y", color: "#ffd000", val: 88 },
            { ch: "K", color: "#444", val: 61 },
            { ch: "W", color: "#ddd", val: 45 },
          ].map(({ ch, color, val }) => (
            <div key={ch} className="flex flex-col items-center gap-0.5">
              <div className="w-4 h-6 bg-muted/40 border border-border/60 rounded-sm overflow-hidden relative">
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all"
                  style={{ height: `${val}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-[8px] text-muted-foreground font-mono">{ch}</span>
            </div>
          ))}
        </div>

        {/* Queue costing info */}
        <div className="flex flex-col items-end justify-center mr-1 text-[9px] text-muted-foreground/60 border-l border-border pl-2">
          <span>Jobs: {activeQueue?.jobCount ?? 0}</span>
          <span className={activeQueue?.status === "running" ? "text-green-400 font-medium" : "text-muted-foreground"}>
            {activeQueue?.status === "running" ? "● Running" : activeQueue?.status === "stopped" ? "■ Stopped" : "● " + (activeQueue?.status || "Idle")}
          </span>
        </div>
      </div>
    </div>
  );
}
