/**
 * Manhattan RIP X — License Screen
 * This build is FULLY UNLOCKED — all features enabled, no activation required.
 */

import { ShieldCheck, Crown, Zap, CheckCircle2 } from "lucide-react";

export default function LicenseScreen() {
  return (
    <div className="flex flex-col flex-1 overflow-auto p-6 gap-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-green-400" />
        <div>
          <h2 className="text-base font-semibold text-foreground">License — Pro Unlocked</h2>
          <p className="text-xs text-muted-foreground">All features enabled. No activation required.</p>
        </div>
      </div>

      {/* Status card */}
      <div className="border border-green-800/40 bg-green-950/20 rounded-lg p-5 flex items-start gap-4">
        <Crown className="w-8 h-8 text-green-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-green-300">PRO — Fully Unlocked</span>
            <span className="text-[10px] bg-green-900/50 text-green-400 border border-green-700/40 px-1.5 py-0.5 rounded font-mono">ACTIVE</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Manhattan RIP X is fully activated. All features — unlimited prints, gang sheet builder,
            color management, hot folders, AI profiler, all printer modes — are available with no restrictions.
          </p>
        </div>
      </div>

      {/* Feature list */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Included Features</span>
        </div>
        <div className="grid grid-cols-2 gap-0 divide-y divide-border">
          {[
            "Unlimited prints",
            "Gang Sheet Builder",
            "Full color management (ICC)",
            "Hot Folder automation",
            "AI Auto-Profiler",
            "Separation Studio",
            "All printer modes",
            "TAC / ink limit control",
            "Halftone screening",
            "White flood/detail control",
            "Mirror / flip / tile",
            "Crop marks + bleed",
            "Multi-queue support",
            "Shopify webhook integration",
            "Priority support",
            "Future updates included",
          ].map((feat, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <span className="text-xs text-foreground">{feat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Build info */}
      <div className="text-[10px] text-muted-foreground/50 font-mono space-y-0.5">
        <div>Build: Manhattan RIP X v2.1.0</div>
        <div>Platform: {typeof window !== 'undefined' && (window as any).electronAPI?.platform === 'win32' ? 'Windows' : 'macOS'}</div>
        <div>License: MRX-UNLOCKED (Pro, unlimited seats)</div>
      </div>
    </div>
  );
}
