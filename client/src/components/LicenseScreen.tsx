/**
 * Manhattan RIP X — License Screen
 * PERSONAL FULLY UNLOCKED BUILD
 */
import { Shield, CheckCircle, Zap } from "lucide-react";

export default function LicenseScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
      <div className="flex items-center gap-3">
        <Shield className="w-10 h-10 text-emerald-400" />
        <span className="text-2xl font-bold text-white">Manhattan RIP X</span>
      </div>

      <div className="bg-emerald-900/40 border border-emerald-500/40 rounded-xl p-6 max-w-md w-full">
        <div className="flex items-center gap-2 justify-center mb-3">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <span className="text-emerald-400 font-semibold text-lg">Enterprise — Fully Unlocked</span>
        </div>
        <p className="text-zinc-300 text-sm mb-4">Personal license — all features enabled, no restrictions.</p>

        <div className="grid grid-cols-2 gap-2 text-xs text-left">
          {[
            ["License Key", "MRXE-PERSONAL-UNLOCKED-2026"],
            ["Plan", "Enterprise"],
            ["Seats", "10"],
            ["Print Jobs", "Unlimited"],
            ["Color Profiles", "Unlimited"],
            ["Gang Sheets", "Unlimited"],
            ["Hot Folders", "Unlimited"],
            ["Expires", "Never"],
          ].map(([k, v]) => (
            <div key={k} className="bg-zinc-800/60 rounded p-2">
              <div className="text-zinc-500 mb-0.5">{k}</div>
              <div className="text-white font-medium truncate">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-zinc-500 text-xs">
        <Zap className="w-3 h-3" />
        <span>Manhattan RIP X v2.1.0 — DTF Professional RIP Software</span>
      </div>
    </div>
  );
}
