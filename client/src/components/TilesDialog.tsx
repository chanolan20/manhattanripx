/**
 * Manhattan RIP X — Tiles Dialog (DF v12 equivalent)
 * Configure tile grid: rows × cols, overlap, and preview the tiled layout.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Grid2X2 } from "lucide-react";

interface Props {
  tileRows: number;
  tileCols: number;
  tileOverlap: number;
  onApply: (rows: number, cols: number, overlap: number) => void;
  onClose: () => void;
}

export default function TilesDialog({ tileRows, tileCols, tileOverlap, onApply, onClose }: Props) {
  const [rows, setRows] = useState(tileRows);
  const [cols, setCols] = useState(tileCols);
  const [overlap, setOverlap] = useState(tileOverlap);

  const totalTiles = rows * cols;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 rounded-t-lg">
          <Grid2X2 className="w-4 h-4 text-primary" />
          <span className="text-[12px] font-semibold text-foreground">Tiles Settings</span>
          <div className="flex-1" />
          <button className="text-muted-foreground hover:text-foreground text-[12px]" onClick={onClose}>✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Grid dimensions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Rows</label>
              <div className="flex items-center gap-1">
                <button className="w-6 h-6 border border-border rounded text-muted-foreground hover:text-foreground bg-muted/30 text-[11px]"
                  onClick={() => setRows(Math.max(1, rows - 1))}>−</button>
                <input type="number" value={rows} min={1} max={20}
                  onChange={e => setRows(Math.max(1, Math.min(20, Number(e.target.value))))}
                  className="flex-1 h-6 text-[11px] font-mono text-center bg-muted/60 border border-border rounded text-foreground" />
                <button className="w-6 h-6 border border-border rounded text-muted-foreground hover:text-foreground bg-muted/30 text-[11px]"
                  onClick={() => setRows(Math.min(20, rows + 1))}>+</button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Columns</label>
              <div className="flex items-center gap-1">
                <button className="w-6 h-6 border border-border rounded text-muted-foreground hover:text-foreground bg-muted/30 text-[11px]"
                  onClick={() => setCols(Math.max(1, cols - 1))}>−</button>
                <input type="number" value={cols} min={1} max={20}
                  onChange={e => setCols(Math.max(1, Math.min(20, Number(e.target.value))))}
                  className="flex-1 h-6 text-[11px] font-mono text-center bg-muted/60 border border-border rounded text-foreground" />
                <button className="w-6 h-6 border border-border rounded text-muted-foreground hover:text-foreground bg-muted/30 text-[11px]"
                  onClick={() => setCols(Math.min(20, cols + 1))}>+</button>
              </div>
            </div>
          </div>

          {/* Overlap */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">
              Overlap (inches) — for alignment marks
            </label>
            <input type="number" value={overlap} min={0} max={1} step={0.0625}
              onChange={e => setOverlap(Math.max(0, Math.min(1, Number(e.target.value))))}
              className="w-full h-7 text-[11px] font-mono bg-muted/60 border border-border rounded px-2 text-foreground" />
          </div>

          {/* Grid preview */}
          <div>
            <div className="text-[10px] text-muted-foreground mb-1.5">
              Preview — {totalTiles} tile{totalTiles !== 1 ? "s" : ""} ({rows}×{cols})
            </div>
            <div
              className="border border-border/60 bg-muted/20 rounded p-2"
              style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cols, 8)}, 1fr)`, gap: 3, minHeight: 40 }}
            >
              {Array.from({ length: Math.min(totalTiles, 64) }).map((_, i) => (
                <div key={i} className="bg-primary/20 border border-primary/30 rounded-sm"
                  style={{ aspectRatio: "1", minHeight: 14 }} />
              ))}
              {totalTiles > 64 && (
                <div className="col-span-full text-center text-[9px] text-muted-foreground">+{totalTiles - 64} more…</div>
              )}
            </div>
          </div>

          {totalTiles === 1 && (
            <p className="text-[10px] text-muted-foreground/60 text-center">
              Set rows or columns above 1 to enable tiling
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 pb-4">
          <Button variant="outline" className="flex-1 h-7 text-[11px]" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 h-7 text-[11px]" onClick={() => onApply(rows, cols, overlap)}>Apply Tiles</Button>
        </div>
      </div>
    </div>
  );
}
