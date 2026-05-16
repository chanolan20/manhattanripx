import type { Queue, Job } from "@shared/schema";
import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Trash2, Pause, Play, Printer, AlertCircle, CheckCircle,
  Clock, Upload, MoreVertical, ChevronDown, ChevronUp, Search,
  SortAsc, Filter, Sliders, Layers, Zap, Barcode
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import ColorTuneDialog from "@/components/ColorTuneDialog";
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
  printing: 0, processing: 1, ripping: 2, pending: 3, hold: 4, done: 5, error: 6
};

export default function QueuePanel({
  queue, jobs, selectedJobId, onSelectJob,
  onDeleteJob, onHoldJob, onReleaseJob, onPrintJob, onDrop, onUpdateJob,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"status" | "name" | "time">("status");
  const [colorAdjJob, setColorAdjJob] = useState<Job | null>(null);
  const [rawDataJob, setRawDataJob] = useState<Job | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => onDrop(files),
    noClick: true,
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/tiff": [".tif", ".tiff"], "application/pdf": [".pdf"] },
  });

  const filtered = jobs
    .filter(j => !search || j.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "status") return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const activeJobs = filtered.filter(j => ["processing", "printing", "ripping"].includes(j.status));
  const pendingJobs = filtered.filter(j => j.status === "pending" || j.status === "hold");
  const completedJobs = filtered.filter(j => j.status === "done" || j.status === "error");

  const stats = {
    total: jobs.length,
    printing: jobs.filter(j => j.status === "printing" || j.status === "processing").length,
    pending: jobs.filter(j => j.status === "pending").length,
    done: jobs.filter(j => j.status === "done").length,
    error: jobs.filter(j => j.status === "error").length,
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden" data-testid="queue-panel">
      {/* Queue header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="panel-title">Queue</span>
          {queue && (
            <span className="text-[11px] font-semibold text-foreground">{queue.name}</span>
          )}
          <QueueStatusBadge status={queue?.status || "stopped"} />
        </div>
        <div className="flex items-center gap-1">
          {/* Stats bar */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mr-2">
            <span className="text-foreground font-medium">{stats.total}</span> jobs
            {stats.printing > 0 && <span className="text-blue-400">• {stats.printing} printing</span>}
            {stats.pending > 0 && <span>• {stats.pending} pending</span>}
            {stats.error > 0 && <span className="text-red-400">• {stats.error} error</span>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                <SortAsc className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={() => setSortBy("status")} className="text-xs">Sort by Status</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("name")} className="text-xs">Sort by Name</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("time")} className="text-xs">Sort by Time</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find job..."
            className="h-6 pl-6 text-xs bg-muted/40 border-border"
            data-testid="input-search-jobs"
          />
        </div>
      </div>

      {/* Drop zone + job list */}
      <div className="flex-1 overflow-auto" {...getRootProps()}>
        <input {...getInputProps()} />

        {isDragActive && (
          <div className="absolute inset-0 z-10 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center">
            <div className="text-center">
              <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm text-primary font-medium">Drop files to add to queue</p>
              <p className="text-xs text-muted-foreground">PNG, JPG, TIFF, PDF supported</p>
            </div>
          </div>
        )}

        {jobs.length === 0 && !isDragActive && (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <Upload className="w-8 h-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Drop print files here</p>
            <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, TIFF, PDF accepted</p>
          </div>
        )}

        {/* Column headers */}
        {jobs.length > 0 && (
          <div className="sticky top-0 z-10 grid grid-cols-[20px_1fr_60px_55px_50px_30px] gap-0 bg-muted/60 border-b border-border px-2 py-1">
            {["#","Name","Dims","Status","Cost",""].map((h, i) => (
              <span key={i} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{h}</span>
            ))}
          </div>
        )}

        {/* Job rows */}
        {filtered.map((job, index) => (
          <JobRow
            key={job.id}
            job={job}
            index={index + 1}
            isSelected={selectedJobId === job.id}
            onSelect={() => onSelectJob(job.id === selectedJobId ? null : job.id)}
            onDelete={() => onDeleteJob(job.id)}
            onHold={() => onHoldJob(job.id)}
            onRelease={() => onReleaseJob(job.id)}
            onPrint={() => onPrintJob(job.id)}
            onColorAdj={() => setColorAdjJob(job)}
            onViewRawData={() => setRawDataJob(job)}
            onRipOnly={() => onPrintJob(job.id)}
          />
        ))}

        {/* Bottom drop hint */}
        {jobs.length > 0 && (
          <div className="py-3 text-center border-t border-border/40 mt-1">
            <p className="text-[10px] text-muted-foreground/40">Drop files to add • Max 2000 jobs</p>
          </div>
        )}
      </div>

      {/* ColorTune Dialog */}
      {colorAdjJob && (
        <ColorTuneDialog
          job={colorAdjJob}
          onClose={() => setColorAdjJob(null)}
          onApply={(id, data) => {
            onUpdateJob?.(id, data);
            setColorAdjJob(null);
          }}
        />
      )}

      {/* View Raw Data Panel */}
      {rawDataJob && (
        <ViewRawDataPanel
          job={rawDataJob}
          onClose={() => setRawDataJob(null)}
        />
      )}
    </div>
  );
}

function JobRow({ job, index, isSelected, onSelect, onDelete, onHold, onRelease, onPrint, onColorAdj, onViewRawData, onRipOnly }: {
  job: Job; index: number; isSelected: boolean;
  onSelect: () => void; onDelete: () => void; onHold: () => void; onRelease: () => void; onPrint: () => void;
  onColorAdj?: () => void; onViewRawData?: () => void; onRipOnly?: () => void;
}) {
  const statusClass = `status-badge-${job.status}`;
  const isActive = job.status === "printing" || job.status === "processing";

  return (
    <div
      className={`grid grid-cols-[20px_1fr_60px_55px_50px_30px] gap-0 items-center px-2 py-1.5 border-b border-border/30 cursor-pointer transition-colors
        ${isSelected ? "row-selected" : "hover:bg-muted/40"}
      `}
      onClick={onSelect}
      data-testid={`job-row-${job.id}`}
    >
      {/* Index */}
      <span className="text-[10px] text-muted-foreground/50 font-mono">{index}</span>

      {/* Name + progress */}
      <div className="min-w-0 pr-2">
        <div className="flex items-center gap-1.5">
          {/* Color preview */}
          <div
            className="w-3 h-3 rounded-sm shrink-0 border border-white/10"
            style={{ backgroundColor: job.previewData || "#333" }}
          />
          <span className="text-[11px] font-medium truncate">{job.name.replace(/\.[^.]+$/, "")}</span>
        </div>
        {isActive && (
          <div className="mt-0.5 flex items-center gap-1">
            <Progress value={job.ripProgress} className="h-1 flex-1" />
            <span className="text-[9px] mono text-muted-foreground">{job.ripProgress}%</span>
          </div>
        )}
        {!isActive && (
          <p className="text-[9px] text-muted-foreground truncate">
            {job.copies > 1 ? `×${job.copies} copies` : ""} {job.rotation > 0 ? `${job.rotation}°` : ""}
            {job.scalePercent !== 100 ? ` ${job.scalePercent}%` : ""}
          </p>
        )}
      </div>

      {/* Dimensions */}
      <span className="text-[10px] text-muted-foreground mono">{job.width}×{job.height}"</span>

      {/* Status */}
      <div>
        <span className={`text-[9px] font-medium px-1 py-0.5 rounded border ${statusClass} uppercase tracking-wider`}>
          {job.status}
        </span>
      </div>

      {/* Cost */}
      <span className="text-[10px] mono text-muted-foreground">${job.inkCost.toFixed(2)}</span>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            onClick={e => e.stopPropagation()}
            data-testid={`job-actions-${job.id}`}
          >
            <MoreVertical className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs min-w-[160px]">
          <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); onPrint(); }}>
            <Printer className="w-3 h-3 mr-2" /> Print
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); onRipOnly?.(); }}>
            <Zap className="w-3 h-3 mr-2" /> Process Only
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); onColorAdj?.(); }}>
            <Sliders className="w-3 h-3 mr-2" /> Color Adjust...
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); onViewRawData?.(); }}>
            <Layers className="w-3 h-3 mr-2" /> View Raw Data
          </DropdownMenuItem>
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
  );
}

function QueueStatusBadge({ status }: { status: string }) {
  const cn = status === "running" ? "text-green-400 bg-green-900/30 border-green-800/50"
    : status === "stopped" ? "text-zinc-400 bg-zinc-800/40 border-zinc-700/50"
    : "text-amber-400 bg-amber-900/30 border-amber-800/50";
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cn} flex items-center gap-1`}>
      {status === "running" && <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />}
      {status}
    </span>
  );
}
