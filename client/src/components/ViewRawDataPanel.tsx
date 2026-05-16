/**
 * ViewRawDataPanel — per-channel CMYK raw data viewer
 * Right-click job → "View Raw Data" opens this panel as a side sheet
 * Shows C/M/Y/K/W channels, toggle individual planes, "show all as black" mode
 * MRX View Raw Data panel
 */
import { useState } from "react";
import type { Job } from "@shared/schema";
import { X, Eye, EyeOff, Layers, BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface Props {
  job: Job;
  onClose: () => void;
}

type Channel = "C" | "M" | "Y" | "K" | "W";

const CHANNEL_COLORS: Record<Channel, string> = {
  C: "#00aeef",
  M: "#ec008c",
  Y: "#fff200",
  K: "#333333",
  W: "#f0f0f0",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  C: "Cyan",
  M: "Magenta",
  Y: "Yellow",
  K: "Black",
  W: "White",
};

export default function ViewRawDataPanel({ job, onClose }: Props) {
  const [visibleChannels, setVisibleChannels] = useState<Set<Channel>>(
    new Set(["C","M","Y","K","W"] as Channel[])
  );
  const [showAsBlack, setShowAsBlack] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | "composite">("composite");

  const toggleChannel = (ch: Channel) => {
    setVisibleChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  // Mock ink coverage data per channel (would be real data from rip engine)
  const MOCK_COVERAGE: Record<Channel, number> = {
    C: 42, M: 38, Y: 55, K: 28, W: 84,
  };

  // Mock histogram data (16 buckets)
  const MOCK_HIST: Record<Channel, number[]> = {
    C: [5,8,12,18,25,22,18,14,10,8,6,4,3,2,1,1],
    M: [3,6,10,15,22,28,24,18,12,8,5,3,2,1,1,0],
    Y: [8,12,16,20,28,30,25,20,15,10,6,4,2,1,1,0],
    K: [15,20,18,15,12,10,8,6,4,3,2,1,1,0,0,0],
    W: [2,3,5,8,12,15,20,25,28,22,18,14,10,7,5,3],
  };

  const activeChannels = (["C","M","Y","K","W"] as Channel[]).filter(c => visibleChannels.has(c));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-[600px] shadow-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        data-testid="view-raw-data-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">View Raw Data</h2>
              <p className="text-[10px] text-muted-foreground truncate max-w-[380px]">{job.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left — channel controls */}
          <div className="w-44 border-r border-border flex flex-col shrink-0">
            <div className="px-3 py-2 border-b border-border bg-muted/20">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Channels</p>
            </div>

            {/* Show as Black toggle */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-[10px] text-muted-foreground">Show as Black</span>
              <Switch checked={showAsBlack} onCheckedChange={setShowAsBlack} className="scale-75" />
            </div>

            {/* Composite */}
            <button
              onClick={() => setSelectedChannel("composite")}
              className={`w-full text-left px-3 py-2 text-[11px] border-b border-border/40 transition-colors ${
                selectedChannel === "composite"
                  ? "bg-primary/15 text-primary border-l-2 border-l-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border border-border bg-gradient-to-br from-cyan-400 via-pink-400 to-yellow-400 shrink-0" />
                <span className="font-medium">Composite</span>
              </div>
              <span className="text-[9px] ml-5 text-muted-foreground/60">All channels</span>
            </button>

            {/* Per-channel buttons */}
            {(["C","M","Y","K","W"] as Channel[]).map(ch => {
              const visible = visibleChannels.has(ch);
              const isSel = selectedChannel === ch;
              return (
                <div key={ch} className={`border-b border-border/30 transition-colors ${isSel ? "bg-primary/10" : ""}`}>
                  <button
                    onClick={() => setSelectedChannel(ch)}
                    className="w-full text-left px-3 py-1.5 text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full border border-border/50 shrink-0"
                        style={{ backgroundColor: showAsBlack ? "#444" : CHANNEL_COLORS[ch] }}
                      />
                      <span className={`font-medium ${isSel ? "text-primary" : "text-muted-foreground"}`}>
                        {CHANNEL_LABELS[ch]}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); toggleChannel(ch); }}
                        className="ml-auto p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                      >
                        {visible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5 opacity-40" />}
                      </button>
                    </div>
                    {/* Mini coverage bar */}
                    <div className="mt-1 ml-5">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[8px] text-muted-foreground/50">Coverage</span>
                        <span className="text-[8px] mono text-muted-foreground/60">{MOCK_COVERAGE[ch]}%</span>
                      </div>
                      <div className="bg-muted/40 rounded-full h-1 w-full">
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{
                            width: `${MOCK_COVERAGE[ch]}%`,
                            backgroundColor: showAsBlack ? "#666" : CHANNEL_COLORS[ch],
                            opacity: visible ? 1 : 0.25,
                          }}
                        />
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Right — data view */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Preview placeholder */}
            <div className="bg-muted/20 border border-border rounded-lg overflow-hidden">
              <div className="h-48 flex items-center justify-center relative">
                {selectedChannel === "composite" ? (
                  /* Composite — show all visible channels as stacked color bars */
                  <div className="w-full h-full flex items-end">
                    {activeChannels.map((ch, i) => (
                      <div
                        key={ch}
                        className="flex-1 transition-all duration-300"
                        style={{
                          height: `${MOCK_COVERAGE[ch]}%`,
                          backgroundColor: showAsBlack ? `rgba(80,80,80,${0.3 + i * 0.1})` : CHANNEL_COLORS[ch],
                          opacity: 0.7,
                        }}
                      />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center bg-black/40 rounded px-3 py-2">
                        <Layers className="w-6 h-6 text-white/60 mx-auto mb-1" />
                        <p className="text-xs text-white/70 font-medium">
                          {job.pixelWidth || "—"}×{job.pixelHeight || "—"} px
                        </p>
                        <p className="text-[10px] text-white/50">{job.dpi || 300} dpi</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Single channel histogram */
                  <div className="w-full h-full p-4 flex flex-col">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                      style={{ color: showAsBlack ? "#888" : CHANNEL_COLORS[selectedChannel as Channel] }}
                    >
                      {CHANNEL_LABELS[selectedChannel as Channel]} Channel Histogram
                    </p>
                    <div className="flex-1 flex items-end gap-0.5">
                      {MOCK_HIST[selectedChannel as Channel]?.map((v, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm min-h-[2px] transition-all"
                          style={{
                            height: `${(v / 30) * 100}%`,
                            backgroundColor: showAsBlack ? "#555" : CHANNEL_COLORS[selectedChannel as Channel],
                            opacity: 0.8,
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-muted-foreground">0</span>
                      <span className="text-[8px] text-muted-foreground">128</span>
                      <span className="text-[8px] text-muted-foreground">255</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats table */}
            <div className="bg-muted/20 border border-border rounded p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-primary" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {selectedChannel === "composite" ? "Composite Stats" : `${CHANNEL_LABELS[selectedChannel as Channel]} Stats`}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {selectedChannel === "composite" ? (
                  <>
                    {activeChannels.map(ch => (
                      <div key={ch} className="text-center">
                        <div
                          className="w-4 h-4 rounded-full mx-auto mb-1 border border-border/50"
                          style={{ backgroundColor: showAsBlack ? "#555" : CHANNEL_COLORS[ch] }}
                        />
                        <p className="text-[10px] font-semibold text-foreground">{MOCK_COVERAGE[ch]}%</p>
                        <p className="text-[9px] text-muted-foreground">{CHANNEL_LABELS[ch]}</p>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {[
                      { l: "Coverage", v: `${MOCK_COVERAGE[selectedChannel as Channel]}%` },
                      { l: "Min", v: "0" },
                      { l: "Max", v: "255" },
                      { l: "Mean", v: "127" },
                      { l: "Std Dev", v: "42" },
                      { l: "Pixels", v: `${((job.pixelWidth || 1000) * (job.pixelHeight || 1000) * MOCK_COVERAGE[selectedChannel as Channel] / 100).toLocaleString()}` },
                    ].map(({ l, v }) => (
                      <div key={l}>
                        <p className="text-[9px] text-muted-foreground">{l}</p>
                        <p className="text-[11px] font-semibold text-foreground mono">{v}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* File info */}
            <div className="bg-muted/20 border border-border rounded p-2.5">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { l: "Resolution", v: `${job.dpi || 300} dpi` },
                  { l: "Dimensions", v: `${job.pixelWidth || "—"}×${job.pixelHeight || "—"}` },
                  { l: "Color Mode", v: "CMYK+W" },
                  { l: "File Size", v: job.fileSize ? `${(job.fileSize / 1024).toFixed(0)} KB` : "—" },
                ].map(({ l, v }) => (
                  <div key={l}>
                    <p className="text-[9px] text-muted-foreground">{l}</p>
                    <p className="text-[11px] font-medium text-foreground">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
