/**
 * Manhattan RIP X — Hot Folder / Automation Panel
 *
 * Configure watch folders that auto-import print files.
 * Shopify webhook URL for e-commerce order intake.
 * Rules: auto-nest, auto-print, file type filters.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HotFolderConfig {
  id: string;
  name: string;
  watchPath: string;
  queueId: number;
  enabled: boolean;
  autoNest: boolean;
  autoPrint: boolean;
  fileTypes: string[];
}

interface ShopifyConfig {
  storeUrl?: string;
  accessToken?: string;
  sharedSecret?: string;
  queueId?: number;
  enabled?: boolean;
  autoNest?: boolean;
  autoPrint?: boolean;
}

export default function HotFolderPanel() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showShopifyDialog, setShowShopifyDialog] = useState(false);
  const [newFolder, setNewFolder] = useState<Partial<HotFolderConfig>>({
    name: "",
    watchPath: "",
    queueId: 1,
    enabled: true,
    autoNest: true,
    autoPrint: false,
    fileTypes: ["png", "jpg", "pdf"],
  });
  const [shopifyForm, setShopifyForm] = useState<ShopifyConfig>({});

  const { data: folders = [] } = useQuery<HotFolderConfig[]>({
    queryKey: ["/api/hot-folders"],
    refetchInterval: 5000,
  });

  const { data: shopifyConfig } = useQuery<ShopifyConfig>({
    queryKey: ["/api/shopify-webhook/config"],
  });

  const addFolderMutation = useMutation({
    mutationFn: (cfg: Partial<HotFolderConfig>) =>
      apiRequest("POST", "/api/hot-folders", cfg).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hot-folders"] });
      setShowAddDialog(false);
      setNewFolder({ name: "", watchPath: "", queueId: 1, enabled: true, autoNest: true, autoPrint: false, fileTypes: ["png", "jpg", "pdf"] });
      toast({ title: "Hot folder added", description: "Watching for new files" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/hot-folders/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hot-folders"] });
      toast({ title: "Hot folder removed" });
    },
  });

  const saveShopifyMutation = useMutation({
    mutationFn: (cfg: ShopifyConfig) =>
      apiRequest("POST", "/api/shopify-webhook/config", cfg).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify-webhook/config"] });
      setShowShopifyDialog(false);
      toast({ title: "Shopify webhook saved", description: "Orders will auto-import" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const webhookUrl = `${window.location.origin.replace(/:\d+$/, ":5000")}/api/webhooks/shopify`;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Hot Folders &amp; Automation</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Watch folders auto-import files into the print queue. Shopify orders route directly to ET-8550.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShopifyForm(shopifyConfig || {}); setShowShopifyDialog(true); }}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            Shopify Webhook
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Watch Folder
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Hot Folder</DialogTitle>
                <DialogDescription>Watch a folder for new print files</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label>Folder Name</Label>
                  <Input
                    value={newFolder.name || ""}
                    onChange={e => setNewFolder(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. DTF Orders"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Watch Path</Label>
                  <Input
                    value={newFolder.watchPath || ""}
                    onChange={e => setNewFolder(f => ({ ...f, watchPath: e.target.value }))}
                    placeholder="/Users/me/Desktop/PrintOrders"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Full filesystem path to watch</p>
                </div>
                <div className="space-y-1">
                  <Label>File Types</Label>
                  <div className="flex gap-2 flex-wrap">
                    {["png", "jpg", "pdf", "tiff", "psd", "ai", "eps"].map(ext => (
                      <label key={ext} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(newFolder.fileTypes || []).includes(ext)}
                          onChange={e => {
                            const types = newFolder.fileTypes || [];
                            setNewFolder(f => ({
                              ...f,
                              fileTypes: e.target.checked
                                ? [...types, ext]
                                : types.filter(t => t !== ext),
                            }));
                          }}
                          className="rounded"
                        />
                        <span className="text-sm font-mono uppercase">{ext}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label>Auto-Nest</Label>
                    <Switch
                      checked={newFolder.autoNest ?? true}
                      onCheckedChange={v => setNewFolder(f => ({ ...f, autoNest: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Auto-Print</Label>
                    <Switch
                      checked={newFolder.autoPrint ?? false}
                      onCheckedChange={v => setNewFolder(f => ({ ...f, autoPrint: v }))}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => addFolderMutation.mutate(newFolder)}
                  disabled={!newFolder.watchPath || !newFolder.name || addFolderMutation.isPending}
                >
                  {addFolderMutation.isPending ? "Adding…" : "Add Hot Folder"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Hot Folders Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {folders.length === 0 ? (
          <Card className="col-span-2 border-dashed border-border/50">
            <CardContent className="py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <p className="text-muted-foreground text-sm">No watch folders configured yet.</p>
              <p className="text-muted-foreground text-xs mt-1">Add a folder to start auto-importing print files.</p>
            </CardContent>
          </Card>
        ) : (
          folders.map(folder => (
            <Card key={folder.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {folder.name}
                      <Badge variant={folder.enabled ? "default" : "secondary"} className="text-xs">
                        {folder.enabled ? "Active" : "Paused"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="font-mono text-xs mt-1 break-all">
                      {folder.watchPath}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive h-8 w-8"
                    onClick={() => deleteFolderMutation.mutate(folder.id)}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(folder.fileTypes || []).map(t => (
                    <Badge key={t} variant="outline" className="text-xs font-mono uppercase">{t}</Badge>
                  ))}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${folder.autoNest ? "bg-primary" : "bg-muted"}`} />
                    Auto-Nest
                  </span>
                  <span className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${folder.autoPrint ? "bg-primary" : "bg-muted"}`} />
                    Auto-Print
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Shopify Webhook Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <svg className="w-4 h-4 text-[#96bf48]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.337 23.979l7.216-1.561L20.5 4.5l-3.5.5-.664 3.5-1.5-.5.5-3.5H12l-1 4-1.5-.5.5-4H7l-1 5-1.5-.5.5-5H2L0 24l15.337-.021z" />
                </svg>
                Shopify Webhook
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {shopifyConfig?.storeUrl
                  ? `Connected to ${shopifyConfig.storeUrl}`
                  : "Not configured — orders will not auto-import"}
              </CardDescription>
            </div>
            <Badge variant={shopifyConfig?.enabled ? "default" : "secondary"}>
              {shopifyConfig?.enabled ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 rounded p-3 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Webhook URL (paste in Shopify &rarr; Settings &rarr; Notifications):</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-primary flex-1 break-all">{webhookUrl}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: "Copied to clipboard" }); }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shopify Config Dialog */}
      <Dialog open={showShopifyDialog} onOpenChange={setShowShopifyDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Shopify Webhook Settings</DialogTitle>
            <DialogDescription>Auto-import orders from your Shopify store</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Store URL</Label>
              <Input
                value={shopifyForm.storeUrl || ""}
                onChange={e => setShopifyForm(f => ({ ...f, storeUrl: e.target.value }))}
                placeholder="yourstore.myshopify.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Access Token</Label>
              <Input
                type="password"
                value={shopifyForm.accessToken || ""}
                onChange={e => setShopifyForm(f => ({ ...f, accessToken: e.target.value }))}
                placeholder="shpat_xxxxxxxx"
              />
            </div>
            <div className="space-y-1">
              <Label>Webhook Shared Secret</Label>
              <Input
                type="password"
                value={shopifyForm.sharedSecret || ""}
                onChange={e => setShopifyForm(f => ({ ...f, sharedSecret: e.target.value }))}
                placeholder="From Shopify webhook settings"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label>Auto-Nest Orders</Label>
                <Switch
                  checked={shopifyForm.autoNest ?? true}
                  onCheckedChange={v => setShopifyForm(f => ({ ...f, autoNest: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Auto-Print</Label>
                <Switch
                  checked={shopifyForm.autoPrint ?? false}
                  onCheckedChange={v => setShopifyForm(f => ({ ...f, autoPrint: v }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Webhook</Label>
              <Switch
                checked={shopifyForm.enabled ?? true}
                onCheckedChange={v => setShopifyForm(f => ({ ...f, enabled: v }))}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => saveShopifyMutation.mutate(shopifyForm)}
              disabled={saveShopifyMutation.isPending}
            >
              {saveShopifyMutation.isPending ? "Saving…" : "Save Shopify Settings"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
