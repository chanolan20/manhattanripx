/**
 * Manhattan RIP X — QueueJobList
 *
 * MRX queue layout:
 * - Status bar: "Queue Running · total: N" above table
 * - Job table: thumbnail | Name | Status | Print Mode | Copies | Job Cost | File Type | Dimensions | Port
 * - Scroll indicator left (colored bar per status)
 * - Progress bar inline when printing/processing
 * - Bottom section: Reserved jobs (done/error) with Browse button
 */

import type { Queue, Job } from "@shared/schema";
import { useCallback, useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import {
  Trash2, Pause, Play, Printer, Upload, MoreVertical,
  Search, SortAsc, Zap, Sliders, Layers, Barcode
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import EasyColorAdjDialog from "@/components/EasyColorAdjDialog";
import ViewRawDataPanel from "@/components/ViewRawDataPanel";

interface Props {
  queue: Queue | null;
  jobs: Job[];
  selectedJobId: number | null;
  onSelectJob: (id: number | null) => void;
  onDeleteJob: (id: number) => void;
  onHoldJob: (id: number) => void;
  onReleaseJob: (id: number) => void;
  onPrintJob: (id: number) => void;
  onDrop: (files: File[]) => void;
  onUpdateJob?: (id: number, data: Partial<Job>) => void;
}

const STATUS_ORDER: Record<string, number> = {
  printing: 0, processing: 1, ripping: 2, pending: 3, hold: 4, done: 5, error: 6,
};

const STATUS_BAR_COLOR: Record<string, string> = {
  printing:   "bg-blue-500",
  processing: "bg-violet-500",
  ripping:    "bg-cyan-500",
  pending:    "bg-zinc-500",
  hold:       "bg-amber-500",
  done:       "bg-green-500",
  error:      "bg-red-500",
};

const STATUS_LABEL_CLS: Record<string, string> = {
  printing:   "text-blue-400 bg-blue-900/20 border-blue-800/40",
  processing: "text-violet-400 bg-violet-900/20 border-violet-800/40",
  ripping:    "text-cyan-400 bg-cyan-900/20 border-cyan-800/40",
  pending:    "text-zinc-400 bg-zinc-800/40 border-zinc-700/40",
  hold:       "text-amber-400 bg-amber-900/20 border-amber-800/40",
  done:       "text-green-400 bg-green-900/20 border-green-800/40",
  error:      "text-red-400 bg-red-900/20 border-red-800/40",
};

function JobThumbnail({ job }: { job: Job }) {
  const bg = job.previewData || "#2a2a3a";
  return (
    <div
      className="w-8 h-8 rounded-sm border border-border/40 shrink-0 overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: bg }}
    >
      {/* Simple colored preview block — real thumbnail when available */}
      {job.fileName?.match(/\.(png|jpg|jpeg)$/i) && (
        <span className="text-[7px] text-white/40 font-mono">{job.fileType}</span>
      )}
    </div>
  );
}

export default function QueueJobList({
  queue, jobs, selectedJobId, onSelectJob,
  onDeleteJob, onHoldJob, onReleaseJob, onPrintJob, onDrop, onUpdateJob,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"status" | "name" | "time">("status");
  const [colorAdjJob, setColorAdjJob] = useState<Job | null>(null);
  const [rawDataJob, setRawDataJob] = useState<Job | null>(null);
  const [completedOpen, setCompletedOpen] = useState(true);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => onDrop(files),
    noClick: true,
    accept: {
      "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"],
      "image/tiff": [".tif", ".tiff"], "application/pdf": [".pdf"],
    },
  });

  const filtered = jobs
    .filter(j => !search || j.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "status") return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Active jobs: printing/processing/ripping/pending/hold
  const activeJobs = filtered.filter(j => !["done", "error"].includes(j.status));
  // Reserved (done/error): shown in bottom section
  const reservedJobs = filtered.filter(j => ["done", "error"].includes(j.status));

  const isRunning = queue?.status === "running";

  const stats = {
    total: jobs.length,
    // Only show active count if queue is actually running
    active: isRunning ? jobs.filter(j => ["printing", "processing", "ripping"].includes(j.status)).length : 0,
    pending: jobs.filter(j => j.status === "pending").length,
    done: jobs.filter(j => j.status === "done").length,
    error: jobs.filter(j => j.status === "error").length,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card" data-testid="queue-panel">
      {/* ── Queue status bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-[11px]">
          {/* Running indicator */}
          <span className={`flex items-center gap-1 font-semibold ${isRunning ? "text-green-400" : "text-zinc-400"}`}>
            {isRunning
              ? <><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Queue Running</>
              : <><span className="w-2 h-2 rounded-sm bg-zinc-500" /> Queue Stopped</>
            }
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">total: <span className="text-foreground font-medium">{stats.total}</span></span>
          {stats.active > 0 && <span className="text-blue-400">· {stats.active} printing</span>}
          {stats.error > 0 && <span className="text-red-400">· {stats.error} error</span>}
        </div>

        <div className="flex items-center gap-1">
          {/* Find job */}
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Find job…"
              className="h-5 pl-6 text-[10px] w-36 bg-muted/40 border-border"
              data-testid="input-search-jobs"
            />
          </div>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-muted/60 text-muted-foreground" title="Sort">
                <SortAsc className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem className="text-xs" onClick={() => setSortBy("status")}>By Status</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => setSortBy("name")}>By Name</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => setSortBy("time")}>By Time</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Column headers ───────────────────────────────────────────────── */}
      <div className="flex items-center px-0 border-b border-border bg-muted/40 shrink-0">
        {/* status bar space */}
        <div className="w-1 shrink-0" />
        {/* thumbnail */}
        <div className="w-9 shrink-0 px-1" />
        <ColHdr className="flex-1 min-w-0">Name</ColHdr>
        <ColHdr className="w-20 shrink-0">Status</ColHdr>
        <ColHdr className="w-32 shrink-0 hidden xl:block">Print Mode</ColHdr>
        <ColHdr className="w-12 shrink-0 text-center">Copies</ColHdr>
        <ColHdr className="w-16 shrink-0 text-right">Job Cost</ColHdr>
        <ColHdr className="w-16 shrink-0 hidden lg:block">File Type</ColHdr>
        <ColHdr className="w-28 shrink-0 hidden md:block">Dimensions</ColHdr>
        <ColHdr className="w-6 shrink-0" />
      </div>

      {/* ── Active job list ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto relative" {...getRootProps()}>
        <input {...getInputProps()} />

        {/* Drag overlay */}
        {isDragActive && (
          <div className="absolute inset-0 z-20 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">Drop to add to queue</p>
              <p className="text-xs text-muted-foreground">PNG · JPG · TIFF · PDF</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeJobs.length === 0 && !isDragActive && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Upload className="w-6 h-6 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground/60">Drop print files here</p>
          </div>
        )}

        {activeJobs.map((job, i) => (
          <JobRow
            key={job.id}
            job={job}
            index={i + 1}
            isSelected={selectedJobId === job.id}
            onSelect={() => onSelectJob(job.id === selectedJobId ? null : job.id)}
            onDelete={() => onDeleteJob(job.id)}
            onHold={() => onHoldJob(job.id)}
            onRelease={() => onReleaseJob(job.id)}
            onPrint={() => onPrintJob(job.id)}
            onColorAdj={() => setColorAdjJob(job)}
            onViewRawData={() => setRawDataJob(job)}
          />
        ))}

        {/* Drop hint at bottom */}
        {activeJobs.length > 0 && (
          <div className="py-2 text-center">
            <p className="text-[9px] text-muted-foreground/30">Drop files here · Max 2000 jobs</p>
          </div>
        )}
      </div>

      {/* ── Reserved section (done/error jobs) ───────────────────────────── */}
      <div className="border-t border-border shrink-0" style={{ height: completedOpen && reservedJobs.length ? 160 : 30 }}>
        <div
          className="flex items-center justify-between px-3 h-[30px] cursor-pointer bg-muted/20 hover:bg-muted/30 transition-colors"
          onClick={() => setCompletedOpen(!completedOpen)}
        >
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <span className={`transition-transform text-[10px] ${completedOpen ? "rotate-90" : ""}`}>▶</span>
            Reserved
            {reservedJobs.length > 0 && (
              <span className="text-muted-foreground/60">({reservedJobs.length})</span>
            )}
          </span>
          <button
            className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            onClick={e => { e.stopPropagation(); /* Browse */ }}
          >
            Browse
          </button>
        </div>

        {completedOpen && reservedJobs.length > 0 && (
          <div className="overflow-auto" style={{ height: 130 }}>
            {/* Reserved column headers */}
            <div className="flex items-center px-0 border-b border-border/60 bg-muted/20 shrink-0">
              <div className="w-1 shrink-0" />
              <div className="w-9 shrink-0" />
              <ColHdr className="flex-1 min-w-0">Name</ColHdr>
              <ColHdr className="w-20 shrink-0">Status</ColHdr>
              <ColHdr className="w-32 shrink-0 hidden xl:block">Print Mode</ColHdr>
              <ColHdr className="w-12 shrink-0 text-center">Copies</ColHdr>
              <ColHdr className="w-16 shrink-0 text-right">Job Cost</ColHdr>
              <ColHdr className="w-28 shrink-0 hidden md:block">Dimensions</ColHdr>
              <ColHdr className="w-6 shrink-0" />
            </div>
            {reservedJobs.map((job, i) => (
              <JobRow
                key={job.id}
                job={job}
                index={i + 1}
                isSelected={selectedJobId === job.id}
                onSelect={() => onSelectJob(job.id === selectedJobId ? null : job.id)}
                onDelete={() => onDeleteJob(job.id)}
                onHold={() => onHoldJob(job.id)}
                onRelease={() => onReleaseJob(job.id)}
                onPrint={() => onPrintJob(job.id)}
                reserved
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {colorAdjJob && (
        <EasyColorAdjDialog
          job={colorAdjJob}
          onClose={() => setColorAdjJob(null)}
          onApply={(id, data) => { onUpdateJob?.(id, data); setColorAdjJob(null); }}
        />
      )}
      {rawDataJob && (
        <ViewRawDataPanel job={rawDataJob} onClose={() => setRawDataJob(null)} />
      )}
    </div>
  );
}

function ColHdr({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[9px] font-semibold text-muted-foreground uppercase tracking-wider py-1 px-2 ${className}`}>
      {children}
    </div>
  );
}

function JobRow({
  job, index, isSelected, onSelect, onDelete, onHold, onRelease, onPrint,
  onColorAdj, onViewRawData, reserved,
}: {
  job: Job; index: number; isSelected: boolean; reserved?: boolean;
  onSelect: () => void; onDelete: () => void; onHold: () => void;
  onRelease: () => void; onPrint: () => void;
  onColorAdj?: () => void; onViewRawData?: () => void;
}) {
  const isActive = ["printing", "processing", "ripping"].includes(job.status);
  const barColor = STATUS_BAR_COLOR[job.status] || "bg-zinc-600";
  const labelCls = STATUS_LABEL_CLS[job.status] || "";

  // Print mode abbreviation (MRX naming convention)
  const printModeShort = (job as any).printMode || "1440×720 Color Opaque";

  return (
    <div
      className={`
        flex items-center min-h-[34px] border-b border-border/30 cursor-pointer transition-colors group relative
        ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/30 border-l-2 border-l-transparent"}
        ${reserved ? "opacity-75" : ""}
      `}
      onClick={onSelect}
      data-testid={`job-row-${job.id}`}
    >
      {/* Status color bar (left edge) */}
      <div className={`w-1 self-stretch shrink-0 ${barColor} opacity-70`} />

      {/* Thumbnail */}
      <div className="w-9 shrink-0 px-1 py-1">
        <JobThumbnail job={job} />
      </div>

      {/* Name + progress */}
      <div className="flex-1 min-w-0 px-1 py-1">
        <p className="text-[11px] font-medium truncate leading-tight">{job.name.replace(/\.[^.]+$/, "")}</p>
        {isActive ? (
          <div className="flex items-center gap-1 mt-0.5">
            <Progress value={job.ripProgress ?? 0} className="h-1 flex-1" />
            <span className="text-[9px] text-muted-foreground mono w-8 shrink-0">{job.ripProgress ?? 0}%</span>
          </div>
        ) : (
          <p className="text-[9px] text-muted-foreground/60 truncate leading-tight">
            {job.fileName}
          </p>
        )}
      </div>

      {/* Status badge */}
      <div className="w-20 shrink-0 px-1">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${labelCls}`}>
          {job.status}
        </span>
      </div>

      {/* Print Mode */}
      <div className="w-32 shrink-0 px-1 hidden xl:block">
        <span className="text-[10px] text-muted-foreground truncate block">{printModeShort}</span>
      </div>

      {/* Copies */}
      <div className="w-12 shrink-0 text-center">
        <span className="text-[10px] mono text-muted-foreground">{job.copies}</span>
      </div>

      {/* Job Cost */}
      <div className="w-16 shrink-0 text-right pr-2">
        <span className="text-[10px] mono text-muted-foreground">${(job.inkCost ?? 0).toFixed(2)}</span>
      </div>

      {/* File Type */}
      <div className="w-16 shrink-0 px-1 hidden lg:block">
        <span className="text-[10px] text-muted-foreground/70 font-mono">{job.fileType || "PNG"}</span>
      </div>

      {/* Dimensions */}
      <div className="w-28 shrink-0 px-1 hidden md:block">
        <span className="text-[10px] mono text-muted-foreground">
          {(job.width ?? 0).toFixed(2)}" × {(job.height ?? 0).toFixed(2)}"
        </span>
      </div>

      {/* Actions menu */}
      <div className="w-6 shrink-0 flex items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/60 text-muted-foreground"
              onClick={e => e.stopPropagation()}
              data-testid={`job-actions-${job.id}`}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs min-w-[160px]">
            <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); onPrint(); }}>
              <Printer className="w-3 h-3 mr-2" /> Print
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); onPrint(); }}>
              <Zap className="w-3 h-3 mr-2" /> Rip Only
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {onColorAdj && (
              <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); onColorAdj(); }}>
                <Sliders className="w-3 h-3 mr-2" /> Easy Color Adjustments…
              </DropdownMenuItem>
            )}
            {onViewRawData && (
              <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); onViewRawData(); }}>
                <Layers className="w-3 h-3 mr-2" /> View Raw Data
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); job.status === "hold" ? onRelease() : onHold(); }}>
              <Pause className="w-3 h-3 mr-2" /> {job.status === "hold" ? "Release" : "Hold"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-red-400" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="w-3 h-3 mr-2" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
