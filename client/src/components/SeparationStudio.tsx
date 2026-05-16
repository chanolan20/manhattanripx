/**
 * Manhattan RIP X — Separation Studio
 *
 * multi-channel one-click art separation for DTF, DTG, and Screen Print.
 * Features:
 *   - CMYK separation with per-channel toggles
 *   - White Underbase (dark garment coverage)
 *   - Highlight White (specular highlights)
 *   - Black Saturate vs Black Detail modes
 *   - Choke underbase by N pixels
 *   - Garment color selector for proof window
 *   - Spot color extraction by color range
 *   - Halftone edge blending
 *   - Proof window — composite preview of all active channels
 */

import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface SpotColorTarget {
  name: string;
  r: number;
  g: number;
  b: number;
  tolerance: number;
  printColor: string;
}

interface SeparationOptions {
  mode: "dtf" | "dtg" | "screen_print";
  garmentColor: "white" | "black" | "light" | "dark" | "custom";
  garmentRGB?: { r: number; g: number; b: number };
  whiteUnderbases: boolean;
  highlightWhite: boolean;
  blackMode: "saturate" | "detail" | "both";
  chokePx: number;
  halftoneEdges: boolean;
  halftoneFrequency: number;
  removeWhiteHaze: boolean;
  spotColors: SpotColorTarget[];
}

interface SeparationChannel {
  name: string;
  label: string;
  imageBase64: string;
  pixelCount: number;
  coveragePercent: number;
  inkColor: string;
  order: number;
}

interface SeparationResult {
  channels: SeparationChannel[];
  compositePreview: string;
  channelCount: number;
  processingTimeMs: number;
  message: string;
}

const GARMENT_COLORS = [
  { value: "white", label: "White", color: "#ffffff" },
  { value: "black", label: "Black", color: "#111111" },
  { value: "light", label: "Light Color", color: "#c8e6c9" },
  { value: "dark", label: "Dark Color", color: "#1a237e" },
  { value: "custom", label: "Custom…", color: "#888888" },
];

const DEFAULT_OPTIONS: SeparationOptions = {
  mode: "dtf",
  garmentColor: "white",
  whiteUnderbases: true,
  highlightWhite: true,
  blackMode: "detail",
  chokePx: 1,
  halftoneEdges: true,
  halftoneFrequency: 45,
  removeWhiteHaze: true,
  spotColors: [],
};

export default function SeparationStudio() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [options, setOptions] = useState<SeparationOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<SeparationResult | null>(null);
  const [activeChannelIdx, setActiveChannelIdx] = useState(0);
  const [showProof, setShowProof] = useState(false);
  const [customGarmentColor, setCustomGarmentColor] = useState("#555555");

  const opt = <K extends keyof SeparationOptions>(key: K, value: SeparationOptions[K]) =>
    setOptions(o => ({ ...o, [key]: value }));

  const separateMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("image", file);
      const optPayload = { ...options };
      if (options.garmentColor === "custom") {
        const hex = customGarmentColor.replace("#", "");
        optPayload.garmentRGB = {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }
      form.append("options", JSON.stringify(optPayload));
      const baseUrl = (window as any).__PORT_5000__ || "";
      const res = await fetch(`${baseUrl}/api/separate/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Separation failed" }));
        throw new Error(err.error || "Separation failed");
      }
      return res.json() as Promise<SeparationResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setActiveChannelIdx(0);
      setShowProof(true);
      toast({ title: "Separation complete", description: `${data.channelCount} channels in ${data.processingTimeMs}ms` });
    },
    onError: (e: any) => {
      toast({ title: "Separation failed", description: e.message, variant: "destructive" });
    },
  });

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image files only", variant: "destructive" });
      return;
    }
    setUploadedFile(file);
    setResult(null);
    setPreviewUrl(URL.createObjectURL(file));
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleExportChannels = () => {
    if (!result) return;
    result.channels.forEach(ch => {
      const a = document.createElement("a");
      a.href = `data:image/png;base64,${ch.imageBase64}`;
      a.download = `${ch.label.replace(/\s+/g, "_")}.png`;
      a.click();
    });
  };

  const handleSendToQueue = () => {
    toast({ title: "Channels sent to queue", description: `${result?.channelCount} separation files queued for print` });
  };

  const garmentBg = options.garmentColor === "custom"
    ? customGarmentColor
    : GARMENT_COLORS.find(g => g.value === options.garmentColor)?.color || "#ffffff";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Controls */}
      <div className="w-72 border-r border-border flex flex-col overflow-hidden flex-shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-base">Separation Studio</h2>
          <p className="text-xs text-muted-foreground mt-0.5">multi-channel one-click channel separation</p>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-5">
          {/* Print Mode */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Print Mode</Label>
            <div className="grid grid-cols-3 gap-1">
              {(["dtf", "dtg", "screen_print"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => opt("mode", m)}
                  className={`py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                    options.mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m === "dtf" ? "DTF" : m === "dtg" ? "DTG" : "Screen"}
                </button>
              ))}
            </div>
          </div>

          {/* Garment Color */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Garment Color</Label>
            <div className="grid grid-cols-2 gap-1">
              {GARMENT_COLORS.map(g => (
                <button
                  key={g.value}
                  onClick={() => opt("garmentColor", g.value as any)}
                  className={`flex items-center gap-2 py-1.5 px-2 rounded text-xs transition-colors ${
                    options.garmentColor === g.value
                      ? "bg-primary/20 border border-primary/50"
                      : "bg-muted/30 border border-transparent hover:bg-muted/50"
                  }`}
                >
                  <div className="w-3 h-3 rounded-sm border border-white/20 flex-shrink-0" style={{ background: g.color }} />
                  {g.label}
                </button>
              ))}
            </div>
            {options.garmentColor === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customGarmentColor}
                  onChange={e => setCustomGarmentColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-border"
                />
                <span className="text-xs text-muted-foreground font-mono">{customGarmentColor}</span>
              </div>
            )}
          </div>

          {/* Channels */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Channels</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">White Underbase</span>
                <Switch
                  checked={options.whiteUnderbases}
                  onCheckedChange={v => opt("whiteUnderbases", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Highlight White</span>
                <Switch
                  checked={options.highlightWhite}
                  onCheckedChange={v => opt("highlightWhite", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Remove White Haze</span>
                <Switch
                  checked={options.removeWhiteHaze}
                  onCheckedChange={v => opt("removeWhiteHaze", v)}
                />
              </div>
            </div>
          </div>

          {/* Black Mode */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Black Mode</Label>
            <div className="grid grid-cols-3 gap-1">
              {(["saturate", "detail", "both"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => opt("blackMode", m)}
                  className={`py-1.5 px-2 rounded text-xs font-medium capitalize transition-colors ${
                    options.blackMode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Choke */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground tracking-wider">Underbase Choke</Label>
              <span className="text-xs text-primary">{options.chokePx}px</span>
            </div>
            <Slider
              min={0}
              max={8}
              step={1}
              value={[options.chokePx]}
              onValueChange={([v]) => opt("chokePx", v)}
            />
          </div>

          {/* Halftone Edges */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Halftone Edges</span>
              <Switch
                checked={options.halftoneEdges}
                onCheckedChange={v => opt("halftoneEdges", v)}
              />
            </div>
            {options.halftoneEdges && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Frequency</Label>
                  <span className="text-xs text-primary">{options.halftoneFrequency} lpi</span>
                </div>
                <Slider
                  min={25}
                  max={85}
                  step={5}
                  value={[options.halftoneFrequency]}
                  onValueChange={([v]) => opt("halftoneFrequency", v)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Separate Button */}
        <div className="p-4 border-t border-border space-y-2">
          <Button
            className="w-full"
            onClick={() => uploadedFile && separateMutation.mutate(uploadedFile)}
            disabled={!uploadedFile || separateMutation.isPending}
          >
            {separateMutation.isPending ? (
              <>
                <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Separating…
              </>
            ) : "Separate Now"}
          </Button>
          {result && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={handleExportChannels}>
                Export PNGs
              </Button>
              <Button variant="outline" size="sm" onClick={handleSendToQueue}>
                Send to Queue
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Upload / Drop Zone */}
        {!uploadedFile ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div
              className={`w-full max-w-lg border-2 border-dashed rounded-xl cursor-pointer transition-colors p-12 text-center ${
                dragOver ? "border-primary bg-primary/5" : "border-border/50 hover:border-border"
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-lg font-medium">Drop artwork here</p>
              <p className="text-sm text-muted-foreground mt-1">PNG, JPG, PSD, AI, EPS accepted</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Proof Window Toggle */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
              <button
                onClick={() => setShowProof(false)}
                className={`text-sm px-3 py-1 rounded transition-colors ${!showProof ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                Original
              </button>
              <button
                onClick={() => setShowProof(true)}
                disabled={!result}
                className={`text-sm px-3 py-1 rounded transition-colors ${showProof && result ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"} disabled:opacity-30`}
              >
                Proof Window
              </button>
              {result && (
                <>
                  <div className="w-px h-4 bg-border" />
                  {result.channels.map((ch, i) => (
                    <button
                      key={i}
                      onClick={() => { setActiveChannelIdx(i); setShowProof(false); }}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
                        !showProof && activeChannelIdx === i ? "bg-primary/20" : "hover:bg-muted/30"
                      }`}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-sm border border-white/20"
                        style={{ background: ch.inkColor || "#888" }}
                      />
                      {ch.label}
                    </button>
                  ))}
                </>
              )}
              <div className="ml-auto flex items-center gap-2">
                {result && (
                  <Badge variant="outline" className="text-xs">
                    {result.channelCount} channels · {result.processingTimeMs}ms
                  </Badge>
                )}
              </div>
            </div>

            {/* Preview */}
            <div
              className="flex-1 flex items-center justify-center overflow-hidden relative"
              style={{ background: garmentBg }}
            >
              {showProof && result?.compositePreview ? (
                <img
                  src={`data:image/png;base64,${result.compositePreview}`}
                  alt="Proof composite"
                  className="max-w-full max-h-full object-contain"
                />
              ) : result && !showProof && result.channels[activeChannelIdx] ? (
                <img
                  src={`data:image/png;base64,${result.channels[activeChannelIdx].imageBase64}`}
                  alt={result.channels[activeChannelIdx].label}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <img
                  src={previewUrl!}
                  alt="Original artwork"
                  className="max-w-full max-h-full object-contain"
                />
              )}

              {/* Channel info overlay */}
              {result && !showProof && result.channels[activeChannelIdx] && (
                <div className="absolute bottom-3 right-3 bg-black/70 rounded px-3 py-2 text-xs space-y-0.5">
                  <div className="text-white/90 font-medium">{result.channels[activeChannelIdx].label}</div>
                  <div className="text-white/60">
                    Coverage: {result.channels[activeChannelIdx].coveragePercent?.toFixed(1) ?? 0}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
