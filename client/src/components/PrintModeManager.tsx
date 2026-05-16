import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PrintMode, IccProfile } from "@shared/schema";
import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Copy, Zap, Layers, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Props {
  deviceId: number;
  onClose?: () => void;
}

// Exact DFv12 engine groups from pmodes/ directory structure
const ENGINE_GROUPS: Record<string, string> = {
  "GDIPSRW":   "GDI Print Server RW (Primary DTF)",
  "GDIPRT":    "GDI Direct Printer",
  "GDIPOSTS":  "GDI PostScript",
  "GDISEPS":   "GDI Separations",
  "BMP":       "BMP / Bitmap",
  "TIFFPREV":  "TIFF Preview",
};

function getEngineKey(name: string): string {
  for (const key of Object.keys(ENGINE_GROUPS)) {
    if (name.startsWith(key + " —") || name.startsWith(key + " -") || name.startsWith(key + " ")) return key;
  }
  return "OTHER";
}

export default function PrintModeManager({ deviceId, onClose }: Props) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<PrintMode>>({});
  const [filterEngine, setFilterEngine] = useState<string>("ALL");

  const { data: printModes = [] } = useQuery<PrintMode[]>({
    queryKey: ["/api/print-modes", deviceId],
    queryFn: () => apiRequest("GET", `/api/print-modes?deviceId=${deviceId}`).then(r => r.json()),
  });

  const { data: iccProfiles = [] } = useQuery<IccProfile[]>({
    queryKey: ["/api/icc-profiles"],
  });

  const sourceProfiles = iccProfiles.filter(p =>
    !p.name.startsWith("ECA —") && !p.name.endsWith(".ink")
  );

  const filteredModes = filterEngine === "ALL"
    ? printModes
    : printModes.filter(pm => getEngineKey(pm.name) === filterEngine);

  const selected = printModes.find(pm => pm.id === selectedId) || printModes[0];

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/print-modes/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-modes"] });
      setEditing(false);
      toast({ title: "Print mode updated" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/print-modes", data).then(r => r.json()),
    onSuccess: (pm) => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-modes"] });
      setSelectedId(pm.id);
      toast({ title: "Print mode created" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/print-modes/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-modes"] });
      setSelectedId(null);
      toast({ title: "Print mode deleted" });
    },
  });

  const startEdit = () => {
    if (selected) { setEditData({ ...selected }); setEditing(true); }
  };
  const saveEdit = () => {
    if (selected) updateMutation.mutate({ id: selected.id, data: editData });
  };
  const duplicateMode = () => {
    if (selected) createMutation.mutate({ ...selected, id: undefined, name: `${selected.name} (Copy)`, isDefault: false });
  };

  const pmData = editing ? editData : selected;
  const setValue = (key: keyof PrintMode, val: any) => setEditData(d => ({ ...d, [key]: val }));

  const engineKey = selected ? getEngineKey(selected.name) : "";
  const isGDIPSRW = engineKey === "GDIPSRW";
  const isFDT = selected?.name.includes("Forever Dark Transfer");

  return (
    <div className="flex flex-col h-full" data-testid="print-mode-manager">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Print Mode Manager</h2>
          <p className="text-[10px] text-muted-foreground">Digital Factory v12 — Epson ET-8550 DTF</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Mode list */}
        <div className="w-64 border-r border-border flex flex-col">
          {/* Engine filter */}
          <div className="px-2 py-1.5 border-b border-border bg-muted/30">
            <Select value={filterEngine} onValueChange={setFilterEngine}>
              <SelectTrigger className="h-6 text-[10px] bg-transparent border-none shadow-none px-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">All Engines</SelectItem>
                {Object.entries(ENGINE_GROUPS).map(([k, label]) => (
                  <SelectItem key={k} value={k} className="text-xs">{k} — {label.split(" (")[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/20">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {filteredModes.length} Mode{filteredModes.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => createMutation.mutate({
                deviceId, name: "GDIPSRW — New Mode", resolution: 1440,
                colorProfile: "Photo 8Color 720 1pass", renderingIntent: "Perceptual",
                whiteOpacity: 90, whiteChoke: 3, cmykDensity: 100, printOrder: "W_CMYK",
                passCount: 8, mediaType: "DTF Film", inkRemoval: 0, inkRemovalHoleSize: 10, isDefault: false,
              })}
              className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {filteredModes.map((pm) => {
              const eng = getEngineKey(pm.name);
              return (
                <button
                  key={pm.id}
                  onClick={() => { setSelectedId(pm.id); setEditing(false); }}
                  className={`w-full text-left px-3 py-2 text-[11px] border-b border-border/40 transition-colors ${
                    (selected?.id === pm.id) ? "bg-primary/15 text-primary border-l-2 border-l-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                  data-testid={`pm-${pm.id}`}
                >
                  <div className="flex items-center gap-1.5">
                    {pm.isDefault && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    <span className="truncate font-medium">{pm.name}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                    <span className="font-mono bg-muted/50 px-1 rounded text-[8px]">{eng}</span>
                    <span>{pm.resolution}dpi</span>
                    {pm.inkRemoval ? <span className="text-amber-400/70">⊗holes</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode editor */}
        {selected && (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 mr-4">
                {editing ? (
                  <Input
                    value={editData.name || ""}
                    onChange={e => setValue("name", e.target.value)}
                    className="text-sm font-semibold h-7 bg-muted/40 border-border w-full"
                  />
                ) : (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{selected.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      {isGDIPSRW && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/40 text-primary">
                          <Zap className="w-2.5 h-2.5 mr-1" />DTF Engine
                        </Badge>
                      )}
                      {isFDT && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-700/50 text-amber-400">
                          Forever Dark Transfer
                        </Badge>
                      )}
                      {selected.isDefault && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-green-700/50 text-green-400">
                          Default
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-1.5 rounded">
                        {ENGINE_GROUPS[getEngineKey(selected.name)] || getEngineKey(selected.name)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {editing ? (
                  <>
                    <Button size="sm" className="h-6 px-2 text-xs" onClick={saveEdit}><Check className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}><X className="w-3 h-3" /></Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={startEdit}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={duplicateMode}><Copy className="w-3 h-3" /></Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-red-400 hover:text-red-300" onClick={() => deleteMutation.mutate(selected.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <PMSection title="Output Resolution">
                <PMSelect label="DPI" value={String(pmData?.resolution)}
                  options={["300","600","720","1200","1440","2880"]}
                  onChange={v => setValue("resolution", Number(v))} disabled={!editing} />
                <PMSelect label="Pass Count" value={String(pmData?.passCount)}
                  options={["1","2","4","6","8","12"]}
                  onChange={v => setValue("passCount", Number(v))} disabled={!editing} />
              </PMSection>

              <PMSection title="Color Management">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground">ICC Source Profile</label>
                  {editing ? (
                    <Select value={pmData?.colorProfile} onValueChange={v => setValue("colorProfile", v)}>
                      <SelectTrigger className="h-6 text-xs bg-muted/40 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="Photo 8Color 720 1pass" className="text-xs font-semibold text-primary">Photo 8Color 720 1pass ★</SelectItem>
                        {sourceProfiles.filter(p => p.colorSpace === "RGB" && p.name !== "Photo 8Color 720 1pass").map(p => (
                          <SelectItem key={p.id} value={p.name} className="text-xs">{p.name}</SelectItem>
                        ))}
                        <SelectItem value="__sep__" disabled className="text-[9px] text-muted-foreground">── CMYK ──</SelectItem>
                        {sourceProfiles.filter(p => p.colorSpace === "CMYK").map(p => (
                          <SelectItem key={p.id} value={p.name} className="text-xs">{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-[11px] font-medium text-foreground py-1">{pmData?.colorProfile}</div>
                  )}
                </div>
                <PMSelect label="Rendering Intent" value={pmData?.renderingIntent || "Perceptual"}
                  options={["Perceptual", "Relative Colorimetric", "Saturation", "Absolute Colorimetric"]}
                  onChange={v => setValue("renderingIntent", v)} disabled={!editing} />
              </PMSection>

              <PMSection title="Underbase + Highlight White">
                <PMSlider label="Underbase %" value={pmData?.whiteOpacity ?? 90}
                  min={0} max={100} step={5} unit="%" onChange={v => setValue("whiteOpacity", v)} disabled={!editing} />
                <PMSlider label="Highlight White %" value={(pmData as any)?.highlightWhite ?? 100}
                  min={0} max={100} step={5} unit="%" onChange={v => setValue("highlightWhite" as any, v)} disabled={!editing} />
                <PMSlider label="Underbase Choke" value={pmData?.whiteChoke ?? 3}
                  min={0} max={10} step={1} unit="px" onChange={v => setValue("whiteChoke", v)} disabled={!editing} />
                <div className="text-[9px] text-muted-foreground/60">
                  Recommended: Underbase 50–60% · Highlight up to 100% · Choke 2–3px
                </div>
              </PMSection>

              <PMSection title="CMYK Density">
                <PMSlider label="CMYK Density" value={pmData?.cmykDensity ?? 100}
                  min={50} max={150} step={5} unit="%" onChange={v => setValue("cmykDensity", v)} disabled={!editing} />
                <PMSelect label="Print Order" value={pmData?.printOrder || "W_CMYK"}
                  options={["W_CMYK", "CMYK_W"]}
                  onChange={v => setValue("printOrder", v)} disabled={!editing} />
              </PMSection>

              <PMSection title="Media Settings">
                <PMSelect label="Media Type" value={pmData?.mediaType || "DTF Film"}
                  options={["DTF Film","DTF Film (Premium)","DTF Film (Matte)","DTF Film (Cold Peel)","DTF Film (Hot Peel)","Single Weight Matte Paper","Photo Paper"]}
                  onChange={v => setValue("mediaType", v)} disabled={!editing} />
                <PMSelect label="Feed Mode" value={(pmData as any)?.feedMode || "Sheet"}
                  options={["Sheet","Roll"]}
                  onChange={v => setValue("feedMode" as any, v)} disabled={!editing} />
              </PMSection>

              <PMSection title="Ink Removal (Holes / Stripes)">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Enable Ink Removal</span>
                  <Switch checked={!!pmData?.inkRemoval}
                    onCheckedChange={v => setValue("inkRemoval", v ? 1 : 0)} disabled={!editing} />
                </div>
                {pmData?.inkRemoval ? (
                  <PMSlider label="Hole Size" value={pmData?.inkRemovalHoleSize ?? 10}
                    min={5} max={50} step={5} unit="px"
                    onChange={v => setValue("inkRemovalHoleSize", v)} disabled={!editing} />
                ) : null}
                <div className="text-[9px] text-muted-foreground/50">
                  Used for "Forever Dark Transfer with Holes" and "with Stripes" modes
                </div>
              </PMSection>
            </div>

            {/* White Underblock Wizard */}
            <div className="bg-amber-900/10 border border-amber-800/30 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">White Underblock Wizard</p>
                </div>
                {editing && (
                  <button className="text-[10px] text-amber-400 hover:text-amber-300 border border-amber-700/50 rounded px-2 py-0.5"
                    onClick={() => { setValue("whiteOpacity", 55); setValue("whiteChoke", 3); }}>
                    Auto-configure
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { step: "1", label: "Underbase", val: "50–60%", hint: "Full coverage" },
                  { step: "2", label: "Highlight",  val: "100%",  hint: "Max whites" },
                  { step: "3", label: "Choke",      val: "2–3px", hint: "Color bleed" },
                ].map(s => (
                  <div key={s.step} className="bg-amber-900/20 border border-amber-800/20 rounded p-1.5 text-center">
                    <div className="w-4 h-4 rounded-full bg-amber-900/40 text-amber-300 text-[9px] font-bold flex items-center justify-center mx-auto mb-1">{s.step}</div>
                    <p className="text-[9px] font-medium text-amber-300">{s.label}</p>
                    <p className="text-[10px] font-semibold text-amber-200 mono">{s.val}</p>
                    <p className="text-[8px] text-amber-400/60">{s.hint}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature flags */}
            <div className="bg-muted/20 border border-border rounded p-2">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Active Feature Flags</p>
              <div className="flex flex-wrap gap-1">
                {["UNDERBASE","DTG","DARKMODE","QFLUIDMASK","MNGDEVSPOT","PMCNEW","PDF","SVG","PSD","APHOTO","MULTILANG"].map(flag => (
                  <span key={flag} className="text-[9px] px-1.5 py-0.5 rounded border border-green-700/50 text-green-400 bg-green-900/10 font-mono">
                    {flag}=1
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PMSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/20 border border-border rounded-md p-3 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function PMSelect({ label, value, options, onChange, disabled }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-0.5">{label}</label>
      {disabled ? (
        <div className="text-[11px] font-medium text-foreground py-1">{value}</div>
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-6 text-xs bg-muted/40 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>{options.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}

function PMSlider({ label, value, min, max, step, unit, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] mono font-semibold text-foreground">{value}{unit}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step}
        onValueChange={([v]) => onChange(v)} disabled={disabled} className="w-full" />
    </div>
  );
}
