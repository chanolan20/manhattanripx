/**
 * Digital Factory v12 — Manage Queues Dialog
 *
 * Exact DFv12 Manage Queues dialog:
 * - Table: Queue Name | Print Mode | Device | Port | Status | Actions
 * - Add / Remove / Duplicate / Set Default buttons
 * - Queue properties edit panel on right
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Queue, Device, PrintMode } from "@shared/schema";
import {
  Plus, Trash2, Copy, Check, X, Settings2, Play, Square, Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  running: "text-green-400",
  stopped: "text-zinc-400",
  paused:  "text-amber-400",
  error:   "text-red-400",
};

const STATUS_DOT: Record<string, string> = {
  running: "bg-green-500 animate-pulse",
  stopped: "bg-zinc-500",
  paused:  "bg-amber-500",
  error:   "bg-red-500",
};

export default function ManageQueuesDialog({ onClose }: Props) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Queue>>({});

  const { data: queues = [] } = useQuery<Queue[]>({ queryKey: ["/api/queues"] });
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: printModes = [] } = useQuery<PrintMode[]>({
    queryKey: ["/api/print-modes", 1],
    queryFn: () => apiRequest("GET", "/api/print-modes?deviceId=1").then(r => r.json()),
  });

  const selected = queues.find(q => q.id === selectedId) || queues[0] || null;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/queues/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
      setEditing(false);
      toast({ title: "Queue updated" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/queues", data).then(r => r.json()),
    onSuccess: (q) => {
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
      setSelectedId(q.id);
      toast({ title: "Queue created" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/queues/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queues"] });
      setSelectedId(null);
      toast({ title: "Queue removed" });
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "start" | "stop" }) =>
      apiRequest("POST", `/api/queues/${id}/${action}`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/queues"] }),
  });

  const handleAdd = () => {
    createMutation.mutate({
      name: `Queue ${queues.length + 1}`,
      deviceId: devices[0]?.id || 1,
      status: "stopped",
      layoutMode: "order_page",
      autoProcess: false,
      gangSheet: false,
      sheetWidth: 22,
      sheetHeight: 60,
      substrateColor: "#ffffff",
      jobCount: 0,
    });
  };

  const handleDuplicate = () => {
    if (selected) {
      createMutation.mutate({
        ...selected,
        id: undefined,
        name: `${selected.name} (Copy)`,
        status: "stopped",
        jobCount: 0,
      });
    }
  };

  const startEdit = () => {
    if (selected) { setEditData({ ...selected }); setEditing(true); }
  };
  const saveEdit = () => {
    if (selected) updateMutation.mutate({ id: selected.id, data: editData });
  };
  const setValue = (key: keyof Queue, val: any) => setEditData(d => ({ ...d, [key]: val }));

  const queueDevice = devices.find(d => d.id === selected?.deviceId);
  const defaultPrintMode = printModes.find(pm => pm.isDefault);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        style={{ width: 760, maxHeight: "80vh" }}
        onClick={e => e.stopPropagation()}
        data-testid="manage-queues-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Manage Queues</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex overflow-hidden" style={{ height: "calc(80vh - 56px)" }}>
          {/* Left: Queue list */}
          <div className="flex flex-col border-r border-border" style={{ width: 320 }}>
            {/* Table header */}
            <div className="flex items-center px-2 py-1.5 border-b border-border bg-muted/30">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider w-6 shrink-0" />
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider flex-1 min-w-0 px-1">Queue Name</span>
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider w-20 shrink-0 px-1">Device</span>
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider w-16 shrink-0 px-1">Status</span>
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider w-12 shrink-0 text-center">Jobs</span>
            </div>

            {/* Queue rows */}
            <div className="flex-1 overflow-auto">
              {queues.map((q) => {
                const isSelected = (selectedId || queues[0]?.id) === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => { setSelectedId(q.id); setEditing(false); }}
                    className={`
                      w-full flex items-center border-b border-border/40 py-1.5 text-left transition-colors
                      ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/30 border-l-2 border-l-transparent"}
                    `}
                  >
                    <div className="w-6 shrink-0 flex items-center justify-center">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[q.status] || "bg-zinc-500"}`} />
                    </div>
                    <span className="flex-1 min-w-0 px-1 text-[11px] font-medium truncate">{q.name}</span>
                    <span className="w-20 shrink-0 px-1 text-[10px] text-muted-foreground truncate">
                      {devices.find(d => d.id === q.deviceId)?.name || "—"}
                    </span>
                    <span className={`w-16 shrink-0 px-1 text-[10px] font-semibold ${STATUS_COLORS[q.status] || "text-zinc-400"}`}>
                      {q.status}
                    </span>
                    <span className="w-12 shrink-0 text-center text-[10px] font-mono text-muted-foreground">{q.jobCount}</span>
                  </button>
                );
              })}
              {queues.length === 0 && (
                <div className="flex items-center justify-center h-20 text-[11px] text-muted-foreground/50">
                  No queues configured
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-2 py-2 border-t border-border bg-muted/10">
              <Button size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={handleAdd}>
                <Plus className="w-3 h-3" />Add
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={handleDuplicate} disabled={!selected}>
                <Copy className="w-3 h-3" />Dupe
              </Button>
              <Button
                size="sm" variant="outline"
                className="h-6 text-[10px] px-2 gap-1 text-red-400 hover:text-red-300"
                onClick={() => selected && deleteMutation.mutate(selected.id)}
                disabled={!selected || queues.length <= 1}
              >
                <Trash2 className="w-3 h-3" />Remove
              </Button>
              <div className="flex-1" />
              {selected && (
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-6 text-[10px] px-2 gap-1 ${selected.status === "running" ? "text-red-400" : "text-green-400"}`}
                  onClick={() => actionMutation.mutate({ id: selected.id, action: selected.status === "running" ? "stop" : "start" })}
                >
                  {selected.status === "running" ? <><Square className="w-2.5 h-2.5" />Stop</> : <><Play className="w-2.5 h-2.5" />Start</>}
                </Button>
              )}
            </div>
          </div>

          {/* Right: Properties panel */}
          <div className="flex-1 overflow-auto">
            {selected ? (
              <div className="p-4 space-y-4">
                {/* Queue header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 mr-4">
                    {editing ? (
                      <Input
                        value={editData.name || ""}
                        onChange={e => setValue("name", e.target.value)}
                        className="text-sm font-semibold h-7 bg-muted/40 border-border"
                      />
                    ) : (
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{selected.name}</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {queueDevice?.name || "No device"} · {selected.jobCount} jobs
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {editing ? (
                      <>
                        <Button size="sm" className="h-6 px-2 text-xs" onClick={saveEdit}>
                          <Check className="w-3 h-3 mr-1" />Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={startEdit}>
                        <Pencil className="w-3 h-3 mr-1" />Edit
                      </Button>
                    )}
                  </div>
                </div>

                {/* Properties grid */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Device */}
                  <PropSection title="Output Device">
                    <PropField label="Device">
                      {editing ? (
                        <Select value={String(editData.deviceId || selected.deviceId)} onValueChange={v => setValue("deviceId", Number(v))}>
                          <SelectTrigger className="h-6 text-xs bg-muted/40 border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {devices.map(d => (
                              <SelectItem key={d.id} value={String(d.id)} className="text-xs">{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[11px] text-foreground">{queueDevice?.name || "—"}</span>
                      )}
                    </PropField>
                    <PropField label="Port">
                      <span className="text-[11px] text-muted-foreground font-mono">{queueDevice?.port || "USB001"}</span>
                    </PropField>
                    <PropField label="Print Mode">
                      {editing ? (
                        <Select value={String(editData.layoutMode || selected.layoutMode)} onValueChange={v => setValue("layoutMode", v)}>
                          <SelectTrigger className="h-6 text-xs bg-muted/40 border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {printModes.slice(0, 8).map(pm => (
                              <SelectItem key={pm.id} value={pm.name} className="text-xs truncate">{pm.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {defaultPrintMode?.name || "1440×720 Color Opaque"}
                        </span>
                      )}
                    </PropField>
                  </PropSection>

                  {/* Sheet */}
                  <PropSection title="Sheet / Media">
                    <PropField label="Width (in)">
                      {editing ? (
                        <input
                          type="number"
                          value={editData.sheetWidth ?? selected.sheetWidth}
                          onChange={e => setValue("sheetWidth", parseFloat(e.target.value))}
                          className="h-6 text-[11px] font-mono bg-muted/60 border border-border rounded px-2 w-20 text-foreground"
                        />
                      ) : (
                        <span className="text-[11px] font-mono text-foreground">{selected.sheetWidth}"</span>
                      )}
                    </PropField>
                    <PropField label="Height (in)">
                      {editing ? (
                        <input
                          type="number"
                          value={editData.sheetHeight ?? selected.sheetHeight}
                          onChange={e => setValue("sheetHeight", parseFloat(e.target.value))}
                          className="h-6 text-[11px] font-mono bg-muted/60 border border-border rounded px-2 w-20 text-foreground"
                        />
                      ) : (
                        <span className="text-[11px] font-mono text-foreground">{selected.sheetHeight}"</span>
                      )}
                    </PropField>
                    <PropField label="Substrate">
                      <div className="flex items-center gap-1.5">
                        {editing ? (
                          <input
                            type="color"
                            value={editData.substrateColor || selected.substrateColor || "#ffffff"}
                            onChange={e => setValue("substrateColor", e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer border border-border"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded border border-border"
                            style={{ backgroundColor: selected.substrateColor || "#ffffff" }} />
                        )}
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {(editing ? editData.substrateColor : selected.substrateColor) || "#ffffff"}
                        </span>
                      </div>
                    </PropField>
                  </PropSection>

                  {/* Processing */}
                  <PropSection title="Processing">
                    <PropField label="Layout Mode">
                      {editing ? (
                        <Select value={editData.layoutMode || selected.layoutMode || "order_page"} onValueChange={v => setValue("layoutMode", v)}>
                          <SelectTrigger className="h-6 text-xs bg-muted/40 border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="order_page" className="text-xs">Order of Page</SelectItem>
                            <SelectItem value="fill_sheet" className="text-xs">Fill Sheet</SelectItem>
                            <SelectItem value="gang_sheet" className="text-xs">Gang Sheet</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[11px] text-muted-foreground capitalize">
                          {(selected.layoutMode || "order_page").replace(/_/g, " ")}
                        </span>
                      )}
                    </PropField>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">Auto Process</span>
                      <Switch
                        checked={!!(editing ? editData.autoProcess : selected.autoProcess)}
                        onCheckedChange={v => editing && setValue("autoProcess", v)}
                        disabled={!editing}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">Gang Sheet Mode</span>
                      <Switch
                        checked={!!(editing ? editData.gangSheet : selected.gangSheet)}
                        onCheckedChange={v => editing && setValue("gangSheet", v)}
                        disabled={!editing}
                      />
                    </div>
                  </PropSection>

                  {/* Status info */}
                  <PropSection title="Queue Status">
                    <PropField label="Current Status">
                      <span className={`text-[11px] font-semibold capitalize ${STATUS_COLORS[selected.status] || "text-zinc-400"}`}>
                        {selected.status}
                      </span>
                    </PropField>
                    <PropField label="Jobs in Queue">
                      <span className="text-[11px] font-mono text-foreground">{selected.jobCount}</span>
                    </PropField>
                    <PropField label="ID">
                      <span className="text-[11px] font-mono text-muted-foreground/60">Q{String(selected.id).padStart(4, "0")}</span>
                    </PropField>
                  </PropSection>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground/50">
                Select a queue to view properties
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/10">
          <Button variant="ghost" size="sm" className="h-7 px-4 text-xs" onClick={onClose}>Close</Button>
          {editing && (
            <Button size="sm" className="h-7 px-4 text-xs" onClick={saveEdit}>
              <Check className="w-3 h-3 mr-1" />Save Changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PropSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/20 border border-border rounded-md p-3 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function PropField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      {children}
    </div>
  );
}
