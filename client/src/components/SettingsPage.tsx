import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Settings, DollarSign, Printer, Sliders, Globe, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
];

const UNITS = [
  { value: "inches", label: "Inches (in)" },
  { value: "mm", label: "Millimeters (mm)" },
  { value: "cm", label: "Centimeters (cm)" },
];

const DPI_OPTIONS = [
  { value: "150", label: "150 DPI — Draft" },
  { value: "300", label: "300 DPI — Standard" },
  { value: "600", label: "600 DPI — High Quality" },
  { value: "1200", label: "1200 DPI — Maximum" },
];

export default function SettingsPage({ onClose }: { onClose?: () => void }) {
  const { toast } = useToast();

  const { data: settings = {}, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const isDirty = Object.keys(localSettings).length > 0;

  const getValue = (key: string, fallback: string = "") =>
    localSettings[key] !== undefined ? localSettings[key] : (settings[key] ?? fallback);

  const set = (key: string, value: string) =>
    setLocalSettings(prev => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/settings", { ...settings, ...localSettings }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setLocalSettings({});
      toast({ title: "Settings saved" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const reset = () => setLocalSettings({});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground text-sm">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background" data-testid="settings-page">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Preferences</span>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button size="sm" variant="ghost" onClick={reset} className="h-7 text-xs gap-1">
              <RotateCcw className="w-3 h-3" /> Discard
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending}
            className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90"
            data-testid="button-save-settings"
          >
            <Save className="w-3 h-3" />
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="general" className="h-full">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-4 h-9 gap-1">
            <TabsTrigger value="general" className="text-xs h-7 data-[state=active]:bg-muted rounded">General</TabsTrigger>
            <TabsTrigger value="ink" className="text-xs h-7 data-[state=active]:bg-muted rounded">Ink Cost</TabsTrigger>
            <TabsTrigger value="print" className="text-xs h-7 data-[state=active]:bg-muted rounded">Print</TabsTrigger>
            <TabsTrigger value="display" className="text-xs h-7 data-[state=active]:bg-muted rounded">Display</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="p-5 space-y-6 mt-0">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Language & Region</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Interface Language</Label>
                  <Select value={getValue("language", "en")} onValueChange={v => set("language", v)}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map(l => (
                        <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Measurement Units</Label>
                  <Select value={getValue("units", "inches")} onValueChange={v => set("units", v)}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-units">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => (
                        <SelectItem key={u.value} value={u.value} className="text-xs">{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <Separator className="bg-border/50" />

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Workflow</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Auto RIP on Import</p>
                    <p className="text-xs text-muted-foreground">Automatically process files when added to queue</p>
                  </div>
                  <Switch
                    checked={getValue("autoRip", "true") === "true"}
                    onCheckedChange={v => set("autoRip", String(v))}
                    data-testid="switch-auto-rip"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Auto Print After RIP</p>
                    <p className="text-xs text-muted-foreground">Send to printer automatically when RIP completes</p>
                  </div>
                  <Switch
                    checked={getValue("autoPrint", "false") === "true"}
                    onCheckedChange={v => set("autoPrint", String(v))}
                    data-testid="switch-auto-print"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Show Ink Cost</p>
                    <p className="text-xs text-muted-foreground">Display cost estimate in job list</p>
                  </div>
                  <Switch
                    checked={getValue("showInkCost", "true") === "true"}
                    onCheckedChange={v => set("showInkCost", String(v))}
                    data-testid="switch-show-ink-cost"
                  />
                </div>
              </div>
            </section>

            <Separator className="bg-border/50" />

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Default RIP Settings</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Default Resolution</Label>
                  <Select value={getValue("defaultDpi", "300")} onValueChange={v => set("defaultDpi", v)}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-dpi">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DPI_OPTIONS.map(d => (
                        <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Default Print Mode</Label>
                  <Select value={getValue("defaultPrintMode", "GDIPSRW")} onValueChange={v => set("defaultPrintMode", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["GDIPSRW", "GDIPRT", "GDIPOSTS", "GDISEPS", "BMP", "TIFFPREV"].map(m => (
                        <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          </TabsContent>

          {/* Ink Cost Tab */}
          <TabsContent value="ink" className="p-5 space-y-6 mt-0">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Ink Cost per mL (USD)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Set the cost of each ink channel per milliliter. Used to calculate job cost estimates.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "inkCostCyan", label: "Cyan (C)", color: "#00bcd4", default: "0.08" },
                  { key: "inkCostMagenta", label: "Magenta (M)", color: "#e91e8c", default: "0.08" },
                  { key: "inkCostYellow", label: "Yellow (Y)", color: "#f5c518", default: "0.07" },
                  { key: "inkCostBlack", label: "Black (K)", color: "#555", default: "0.06" },
                  { key: "inkCostWhite", label: "White (W)", color: "#fff", default: "0.10" },
                ].map(ch => (
                  <div key={ch.key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-border/50"
                        style={{ backgroundColor: ch.color }}
                      />
                      {ch.label}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={getValue(ch.key, ch.default)}
                        onChange={e => set(ch.key, e.target.value)}
                        className="h-8 text-xs pl-5"
                        data-testid={`input-${ch.key}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-muted/30 rounded border border-border/50">
                <p className="text-xs text-muted-foreground">
                  Estimated cost per square inch at 100% coverage:{" "}
                  <span className="text-foreground font-medium">
                    ${(
                      (parseFloat(getValue("inkCostCyan", "0.08")) +
                       parseFloat(getValue("inkCostMagenta", "0.08")) +
                       parseFloat(getValue("inkCostYellow", "0.07")) +
                       parseFloat(getValue("inkCostBlack", "0.06")) +
                       parseFloat(getValue("inkCostWhite", "0.10"))) * 0.0012
                    ).toFixed(5)}
                  </span>
                </p>
              </div>
            </section>
          </TabsContent>

          {/* Print Tab */}
          <TabsContent value="print" className="p-5 space-y-6 mt-0">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Printer className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Printer Configuration</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">CUPS Printer Name</Label>
                  <Input
                    value={getValue("printerName", "Epson_ET-8550_DTF")}
                    onChange={e => set("printerName", e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="Epson_ET-8550_DTF"
                    data-testid="input-printer-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    Run <code className="bg-muted px-1 rounded">lpstat -p</code> in Terminal to list available printers
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Printer IP Address (optional)</Label>
                  <Input
                    value={getValue("printerIp", "")}
                    onChange={e => set("printerIp", e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="192.168.1.100"
                    data-testid="input-printer-ip"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Use IPP Direct Mode</p>
                    <p className="text-xs text-muted-foreground">Connect directly via IPP instead of CUPS spooler</p>
                  </div>
                  <Switch
                    checked={getValue("useIppDirect", "false") === "true"}
                    onCheckedChange={v => set("useIppDirect", String(v))}
                    data-testid="switch-ipp-direct"
                  />
                </div>
              </div>
            </section>
          </TabsContent>

          {/* Display Tab */}
          <TabsContent value="display" className="p-5 space-y-6 mt-0">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Interface</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Color Mode</Label>
                  <Select value={getValue("colorMode", "dark")} onValueChange={v => set("colorMode", v)}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-color-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark" className="text-xs">Dark (recommended)</SelectItem>
                      <SelectItem value="light" className="text-xs">Light</SelectItem>
                      <SelectItem value="system" className="text-xs">Follow system</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Show Job Thumbnails</p>
                    <p className="text-xs text-muted-foreground">Display image previews in the queue list</p>
                  </div>
                  <Switch
                    checked={getValue("showThumbnails", "true") === "true"}
                    onCheckedChange={v => set("showThumbnails", String(v))}
                    data-testid="switch-thumbnails"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Compact Queue View</p>
                    <p className="text-xs text-muted-foreground">Smaller job rows to fit more items on screen</p>
                  </div>
                  <Switch
                    checked={getValue("compactView", "false") === "true"}
                    onCheckedChange={v => set("compactView", String(v))}
                    data-testid="switch-compact-view"
                  />
                </div>
              </div>
            </section>

            <Separator className="bg-border/50" />

            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">About Manhattan RIP X</h3>
              <div className="bg-muted/30 rounded border border-border/50 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Version: <span className="text-foreground">2.0.0</span></p>
                <p className="text-xs text-muted-foreground">Engine: <span className="text-foreground">GDIPSRW / Sharp + ImageMagick</span></p>
                <p className="text-xs text-muted-foreground">Platform: <span className="text-foreground">macOS / Windows (Electron)</span></p>
                <p className="text-xs text-muted-foreground">© 2026 Manhattan RIP X. All rights reserved.</p>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-2 leading-relaxed">
                Epson®, ET-8550®, and SureColor® are registered trademarks of Seiko Epson Corporation.
                Manhattan RIP X is an independent product and is not affiliated with, endorsed by, or sponsored by Seiko Epson Corporation or any other hardware manufacturer.
                All other product names and trademarks are the property of their respective owners.
              </p>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
