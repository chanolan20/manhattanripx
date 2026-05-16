import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { License } from "@shared/schema";
import { Shield, ShieldCheck, ShieldOff, Key, RefreshCw, LogOut, Zap, Crown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export default function LicenseScreen({ onClose }: { onClose?: () => void }) {
  const { toast } = useToast();
  const [keyInput, setKeyInput] = useState("");
  const [emailInput, setEmailInput] = useState("");

  const { data: license, isLoading } = useQuery<License>({
    queryKey: ["/api/license"],
    refetchInterval: 30000,
  });

  const activateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/license/activate", {
        licenseKey: keyInput.trim(),
        email: emailInput.trim() || undefined,
      }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/license"] });
        setKeyInput("");
        setEmailInput("");
        toast({ title: "License activated", description: `${data.license.plan.toUpperCase()} plan active` });
      } else {
        toast({ title: "Activation failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      const msg = err?.message || "Activation failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/license/deactivate").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/license"] });
      toast({ title: "License deactivated" });
    },
  });

  const formatKey = (value: string) => {
    const clean = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 16);
    return clean.match(/.{1,4}/g)?.join("-") || "";
  };

  const isActive = license?.status === "active";
  const isTrial = license?.status === "trial" || !license?.status;
  const trialPct = license ? ((license.trialJobsUsed || 0) / (license.trialJobsLimit || 25)) * 100 : 0;
  const trialRemaining = (license?.trialJobsLimit || 25) - (license?.trialJobsUsed || 0);

  const statusColors: Record<string, string> = {
    active: "text-green-400",
    trial: "text-yellow-400",
    expired: "text-red-400",
    unlicensed: "text-muted-foreground",
  };

  const planIcons: Record<string, any> = {
    pro: Crown,
    enterprise: Star,
    trial: Zap,
  };

  const PlanIcon = planIcons[license?.plan || "trial"] || Zap;

  return (
    <div className="flex flex-col h-full bg-background overflow-auto" data-testid="license-screen">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-card">
        <Shield className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">License & Activation</span>
      </div>

      <div className="flex-1 p-5 space-y-6 max-w-xl mx-auto w-full">
        {/* Current Status */}
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isActive ? (
                <ShieldCheck className="w-5 h-5 text-green-400" />
              ) : isTrial ? (
                <Shield className="w-5 h-5 text-yellow-400" />
              ) : (
                <ShieldOff className="w-5 h-5 text-red-400" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Manhattan RIP X
                </p>
                <p className={`text-xs font-medium ${statusColors[license?.status || "trial"]}`}>
                  {isActive ? "Licensed — Active" : isTrial ? "Trial Mode" : license?.status || "Unlicensed"}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`text-xs gap-1 ${isActive ? "border-green-500/40 text-green-400" : "border-yellow-500/40 text-yellow-400"}`}
            >
              <PlanIcon className="w-3 h-3" />
              {(license?.plan || "trial").toUpperCase()}
            </Badge>
          </div>

          {isActive && license && (
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">License Key</span>
                <span className="text-foreground font-mono">{license.licenseKey?.slice(0, 8)}…</span>
              </div>
              {license.email && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registered to</span>
                  <span className="text-foreground">{license.email}</span>
                </div>
              )}
              {license.activatedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Activated</span>
                  <span className="text-foreground">
                    {new Date(license.activatedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              {license.expiresAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expires</span>
                  <span className="text-foreground">
                    {new Date(license.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Trial progress */}
          {isTrial && (
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Trial Jobs Used</span>
                <span className={trialPct >= 80 ? "text-red-400" : "text-foreground"}>
                  {license?.trialJobsUsed || 0} / {license?.trialJobsLimit || 25}
                </span>
              </div>
              <Progress
                value={trialPct}
                className="h-1.5"
              />
              {trialRemaining <= 5 && (
                <p className="text-xs text-red-400">
                  ⚠ Only {trialRemaining} trial print{trialRemaining !== 1 ? "s" : ""} remaining. Activate to continue.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Activate License */}
        {!isActive && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Activate License</h3>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">License Key</Label>
                <Input
                  value={keyInput}
                  onChange={e => setKeyInput(formatKey(e.target.value))}
                  placeholder="MRXP-XXXX-XXXX-XXXX"
                  className="h-9 text-sm font-mono tracking-widest"
                  maxLength={19}
                  data-testid="input-license-key"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email Address (optional)</Label>
                <Input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="your@email.com"
                  className="h-9 text-sm"
                  data-testid="input-license-email"
                />
              </div>
              <Button
                onClick={() => activateMutation.mutate()}
                disabled={keyInput.replace(/-/g, "").length < 12 || activateMutation.isPending}
                className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
                data-testid="button-activate-license"
              >
                {activateMutation.isPending ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" /> Activating…</>
                ) : (
                  <><ShieldCheck className="w-3.5 h-3.5 mr-2" /> Activate License</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                License keys start with <code className="bg-muted px-1 rounded">MRXP</code> (Pro) or <code className="bg-muted px-1 rounded">MRXE</code> (Enterprise)
              </p>
            </div>
          </section>
        )}

        {/* Deactivate */}
        {isActive && (
          <section>
            <Separator className="bg-border/50 mb-5" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Deactivate</h3>
              <p className="text-xs text-muted-foreground">
                Removes the license from this machine and reverts to trial mode. You can re-activate on another machine using the same key.
              </p>
              <Button
                variant="outline"
                onClick={() => deactivateMutation.mutate()}
                disabled={deactivateMutation.isPending}
                className="h-8 text-xs gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10"
                data-testid="button-deactivate-license"
              >
                <LogOut className="w-3 h-3" />
                {deactivateMutation.isPending ? "Deactivating…" : "Deactivate License"}
              </Button>
            </div>
          </section>
        )}

        <Separator className="bg-border/50" />

        {/* Plans */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">Available Plans</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                name: "Pro",
                prefix: "MRXP",
                icon: Crown,
                color: "text-cyan-400",
                border: "border-cyan-500/30",
                features: ["Unlimited print jobs", "All print modes", "Real-time RIP engine", "IPP/CUPS printing", "Gang sheet builder", "ICC color management"],
              },
              {
                name: "Enterprise",
                prefix: "MRXE",
                icon: Star,
                color: "text-violet-400",
                border: "border-violet-500/30",
                features: ["Everything in Pro", "Multi-device licensing", "Priority support", "Custom ICC profiles", "Batch automation API", "White-label ready"],
              },
            ].map(plan => (
              <div
                key={plan.name}
                className={`rounded-lg border ${plan.border} bg-card/50 p-3`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <plan.icon className={`w-4 h-4 ${plan.color}`} />
                  <span className={`text-sm font-semibold ${plan.color}`}>{plan.name}</span>
                </div>
                <ul className="space-y-1">
                  {plan.features.map(f => (
                    <li key={f} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-green-400 mt-0.5">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Contact <span className="text-primary">support@manhattanripx.com</span> to purchase a license
          </p>
        </section>
      </div>
    </div>
  );
}
