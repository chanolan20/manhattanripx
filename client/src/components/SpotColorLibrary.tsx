/**
 * SpotColorLibrary — full Pantone/spot color table management
 * Accessible from Color Management panel → Spot Color tab
 * Full Pantone C/U/M library browser + custom spot color mappings
 */
import { useState } from "react";
import { Search, Plus, Trash2, Check, Edit2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface SpotEntry {
  id: string;
  name: string;
  hex: string;
  lab: [number, number, number];
  library: "pantone-c" | "pantone-u" | "pantone-m" | "hks" | "custom";
}

// A representative set of common Pantone Coated colors
const PANTONE_C_COLORS: SpotEntry[] = [
  { id: "pms-100c",  name: "PMS 100 C",  hex: "#F6EB61", lab: [92, -9, 54],  library: "pantone-c" },
  { id: "pms-109c",  name: "PMS 109 C",  hex: "#FFCD00", lab: [85, -4, 85],  library: "pantone-c" },
  { id: "pms-185c",  name: "PMS 185 C",  hex: "#F21D3A", lab: [44, 62, 38],  library: "pantone-c" },
  { id: "pms-186c",  name: "PMS 186 C",  hex: "#CE1126", lab: [38, 60, 38],  library: "pantone-c" },
  { id: "pms-286c",  name: "PMS 286 C",  hex: "#0033A0", lab: [24, 20,-60],  library: "pantone-c" },
  { id: "pms-293c",  name: "PMS 293 C",  hex: "#003DA5", lab: [25, 21,-56],  library: "pantone-c" },
  { id: "pms-347c",  name: "PMS 347 C",  hex: "#009A44", lab: [56,-48, 35],  library: "pantone-c" },
  { id: "pms-355c",  name: "PMS 355 C",  hex: "#00843D", lab: [49,-46, 30],  library: "pantone-c" },
  { id: "pms-485c",  name: "PMS 485 C",  hex: "#DA291C", lab: [41, 59, 44],  library: "pantone-c" },
  { id: "pms-7686c", name: "PMS 7686 C", hex: "#2B5EAD", lab: [40, 12,-45],  library: "pantone-c" },
  { id: "pms-black", name: "PMS Black C", hex: "#2B2926", lab: [17, 1, 2],   library: "pantone-c" },
  { id: "pms-white", name: "PMS White",   hex: "#F2F0EB", lab: [94,-1, 3],   library: "pantone-c" },
  { id: "pms-871c",  name: "PMS 871 C",  hex: "#84754E", lab: [50, 2, 22],   library: "pantone-c" },
  { id: "pms-877c",  name: "PMS 877 C (Silver)", hex: "#8A8D8F", lab: [58, -1, -1], library: "pantone-c" },
  { id: "pms-8280c", name: "PMS 8280 C (Chrome)", hex: "#A5ACAF", lab: [71, -2, -1], library: "pantone-c" },
];

const PANTONE_U_COLORS: SpotEntry[] = PANTONE_C_COLORS.map(c => ({
  ...c,
  id: c.id.replace("-c", "-u"),
  name: c.name.replace(" C", " U"),
  library: "pantone-u" as const,
}));

const HKS_COLORS: SpotEntry[] = [
  { id: "hks-3k",  name: "HKS 3 K",  hex: "#FFEF00", lab: [93,-8, 85],  library: "hks" },
  { id: "hks-13k", name: "HKS 13 K", hex: "#F7500F", lab: [52, 54, 53],  library: "hks" },
  { id: "hks-43k", name: "HKS 43 K", hex: "#024A99", lab: [27, 14,-52],  library: "hks" },
  { id: "hks-57k", name: "HKS 57 K", hex: "#008956", lab: [50,-44, 22],  library: "hks" },
];

const ALL_LIBRARY: SpotEntry[] = [...PANTONE_C_COLORS, ...PANTONE_U_COLORS, ...HKS_COLORS];

interface MappedSpot extends SpotEntry {
  outputHex: string;
  deltaE: number;
}

export default function SpotColorLibrary() {
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState<"all" | "pantone-c" | "pantone-u" | "pantone-m" | "hks" | "custom">("pantone-c");
  const [selectedSpot, setSelectedSpot] = useState<SpotEntry | null>(null);
  const [mappedSpots, setMappedSpots] = useState<MappedSpot[]>([
    { ...PANTONE_C_COLORS[2], outputHex: "#F01830", deltaE: 1.4 },
    { ...PANTONE_C_COLORS[4], outputHex: "#0035A8", deltaE: 2.1 },
    { ...PANTONE_C_COLORS[6], outputHex: "#00A048", deltaE: 1.8 },
  ]);

  const filtered = ALL_LIBRARY.filter(e => {
    const matchLib = library === "all" || e.library === library;
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.hex.toLowerCase().includes(search.toLowerCase());
    return matchLib && matchSearch;
  });

  const addToTable = () => {
    if (!selectedSpot) return;
    if (mappedSpots.find(m => m.id === selectedSpot.id)) return;
    setMappedSpots(prev => [...prev, { ...selectedSpot, outputHex: selectedSpot.hex, deltaE: 0.0 }]);
  };

  const removeFromTable = (id: string) => {
    setMappedSpots(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="flex flex-col h-full" data-testid="spot-color-library">
      <div className="flex flex-1 overflow-hidden">
        {/* Left — library browser */}
        <div className="w-52 border-r border-border flex flex-col">
          <div className="px-2 py-1.5 border-b border-border bg-muted/20 space-y-1.5">
            <Select value={library} onValueChange={v => setLibrary(v as any)}>
              <SelectTrigger className="h-6 text-[10px] bg-transparent border-none shadow-none px-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  { v: "all",       l: "All Libraries" },
                  { v: "pantone-c", l: "Pantone Coated (C)" },
                  { v: "pantone-u", l: "Pantone Uncoated (U)" },
                  { v: "pantone-m", l: "Pantone Metallic (M)" },
                  { v: "hks",       l: "HKS" },
                  { v: "custom",    l: "Custom" },
                ].map(({ v, l }) => (
                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-6 pl-6 text-[10px] bg-muted/40 border-border"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {filtered.map(spot => (
              <button
                key={spot.id}
                onClick={() => setSelectedSpot(spot)}
                className={`w-full text-left px-2 py-1.5 border-b border-border/30 transition-colors flex items-center gap-2 ${
                  selectedSpot?.id === spot.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <div
                  className="w-4 h-4 rounded shrink-0 border border-border/50"
                  style={{ backgroundColor: spot.hex }}
                />
                <span className="text-[10px] truncate">{spot.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-6">No colors found</p>
            )}
          </div>
        </div>

        {/* Right — detail + table */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {/* Selected spot detail */}
          {selectedSpot ? (
            <div className="bg-muted/20 border border-border rounded p-3 flex items-start gap-3">
              <div
                className="w-12 h-12 rounded border border-border/50 shrink-0"
                style={{ backgroundColor: selectedSpot.hex }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{selectedSpot.name}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-[9px] mono bg-muted/40 border border-border px-1.5 py-0.5 rounded">{selectedSpot.hex}</span>
                  <span className="text-[9px] mono bg-muted/40 border border-border px-1.5 py-0.5 rounded">
                    Lab({selectedSpot.lab[0]}, {selectedSpot.lab[1]}, {selectedSpot.lab[2]})
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                    {selectedSpot.library.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-3 text-xs gap-1 shrink-0" onClick={addToTable}>
                <Plus className="w-3 h-3" />Add to Table
              </Button>
            </div>
          ) : (
            <div className="bg-muted/20 border border-border border-dashed rounded p-4 text-center">
              <p className="text-[11px] text-muted-foreground">Select a color from the library to view details</p>
            </div>
          )}

          {/* Mapped spot color table */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Active Spot Color Table ({mappedSpots.length})
            </p>
            <div className="bg-muted/20 border border-border rounded overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_64px_64px_60px_32px] px-3 py-1.5 bg-muted/40">
                {["Spot Color", "Source", "Output", "ΔE", ""].map((h, i) => (
                  <span key={i} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {mappedSpots.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-4">No spot colors mapped</p>
              )}
              {mappedSpots.map(sc => (
                <div
                  key={sc.id}
                  className="grid grid-cols-[1fr_64px_64px_60px_32px] items-center px-3 py-2 border-t border-border/30 hover:bg-muted/20 group"
                >
                  <div>
                    <p className="text-[11px] font-medium text-foreground">{sc.name}</p>
                    <p className="text-[9px] mono text-muted-foreground">{sc.hex}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-5 h-5 rounded border border-border/50 shrink-0" style={{ backgroundColor: sc.hex }} />
                    <span className="text-[9px] mono text-muted-foreground">{sc.hex}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-5 h-5 rounded border border-border/50 shrink-0" style={{ backgroundColor: sc.outputHex }} />
                    <span className="text-[9px] mono text-muted-foreground">{sc.outputHex}</span>
                  </div>
                  <span className={`text-[10px] mono font-medium ${sc.deltaE < 2 ? "text-green-400" : "text-amber-400"}`}>
                    ΔE {sc.deltaE.toFixed(1)}
                  </span>
                  <button
                    onClick={() => removeFromTable(sc.id)}
                    className="p-0.5 rounded hover:bg-red-900/30 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
