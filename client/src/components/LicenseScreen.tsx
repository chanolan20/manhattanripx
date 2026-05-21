/**
 * Manhattan RIP X — License Screen (FULLY UNLOCKED — Personal Copy)
 */
import { CheckCircle, Unlock, Zap } from "lucide-react";

interface LicenseScreenProps {
  onClose?: () => void;
}

export default function LicenseScreen({ onClose }: LicenseScreenProps) {
  return (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-100 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
            <Unlock className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Manhattan RIP X</h1>
            <p className="text-xs text-zinc-400">License & Activation</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl leading-none">×</button>
        )}
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-6">
        {/* Unlocked badge */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">Pro — Fully Unlocked</h2>
            <p className="text-zinc-400 text-sm mt-1">All features active · No print limit · No expiry</p>
          </div>
        </div>

        {/* License details */}
        <div className="w-full max-w-sm bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-2 text-sm">
          {[
            ["Plan", "Pro (Lifetime)"],
            ["License Key", "MRXP-PERSONAL-UNLOCKED-2026"],
            ["Email", "gomezfrankg@gmail.com"],
            ["Prints Remaining", "Unlimited"],
            ["Expires", "Never"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-zinc-400">{k}</span>
              <span className="text-zinc-100 font-mono text-xs">{v}</span>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="w-full max-w-sm space-y-2">
          {[
            "Full RIP engine — halftone, TAC, ink limits",
            "All Epson DTF drivers (ET-8550, L18050, SC-P700…)",
            "Gang Sheet Builder — unlimited sheets",
            "Color Management — ICC profiles, soft proof",
            "Windows & macOS — all features unlocked",
            "Hot Folder, Nesting, AI Auto-Profiler",
          ].map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm text-zinc-300">
              <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              {f}
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-600 text-center pt-2">
          Manhattan RIP X v2.1.0 · © 2026 Manhattan Viral · Personal License
        </p>
      </div>
    </div>
  );
}
