/**
 * Manhattan RIP X — First-Run Onboarding Checklist
 *
 * Shows on first launch (dismissed permanently via localStorage).
 * 6 steps walking the user through core workflow.
 */

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, X, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "mrx_onboarding_dismissed";
const PROGRESS_KEY = "mrx_onboarding_steps";

interface Step {
  id: string;
  title: string;
  description: string;
  action: string;
  tip?: string;
}

const STEPS: Step[] = [
  {
    id: "add_file",
    title: "Add Your First File",
    description: "Drag a PNG, PSD, or PDF artwork into the Queue panel.",
    action: "Drag a file onto the queue → left panel",
    tip: "Transparent background PNGs work best for DTF.",
  },
  {
    id: "set_mode",
    title: "Set Your Print Mode",
    description: "Choose film type and print quality so the RIP applies the right ink limits.",
    action: "Click the print mode dropdown at the top of the JobBar",
    tip: "Matte 1440×720 Best is the right starting point for most ET-8550 setups.",
  },
  {
    id: "auto_profile",
    title: "Run the AI Auto-Profiler",
    description: "Calibrate color output for your ET-8550 — takes about 60 seconds.",
    action: "Click AI Profiler tab in the top nav → Run Auto-Profile",
    tip: "Do this once per ink batch for best results. Saves significant ink over generic profiles.",
  },
  {
    id: "gang_sheet",
    title: "Build a Gang Sheet",
    description: "Arrange multiple designs on one sheet to minimize film waste.",
    action: "Click Gang Sheet Builder in the top nav → drag files → Auto-Nest",
    tip: "Auto-Nest packs designs as tight as possible. Use 13\" width for ET-8550 standard roll.",
  },
  {
    id: "hot_folder",
    title: "Set Up a Hot Folder",
    description: "Point a folder at the print queue so files auto-import when dropped in.",
    action: "Click Hot Folder tab → Add Folder → choose a folder",
    tip: "Connect your Shopify store in Hot Folder settings to pull orders automatically.",
  },
  {
    id: "first_print",
    title: "Run Your First Print",
    description: "Send the job to your ET-8550 and watch it go.",
    action: "Select a job → click the red Print button in the JobBar",
    tip: "25 prints are included in your trial. No credit card required.",
  },
];

interface Props {
  onClose: () => void;
}

export default function OnboardingChecklist({ onClose }: Props) {
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(PROGRESS_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [expanded, setExpanded] = useState<string | null>(STEPS[0].id);

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    onClose();
  };

  const completed = checked.size;
  const pct = Math.round((completed / STEPS.length) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="relative flex flex-col w-full max-w-lg mx-4 rounded-xl border border-border overflow-hidden"
        style={{ background: "hsl(220 14% 10%)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                Getting Started
              </span>
            </div>
            <h2 className="text-lg font-bold tracking-tight">Welcome to Manhattan RIP X</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete these 6 steps to set up your first print job.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 ml-4 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">
              {completed} of {STEPS.length} complete
            </span>
            <span className="text-[10px] font-bold text-primary">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-1.5">
          {STEPS.map((step, i) => {
            const done = checked.has(step.id);
            const isOpen = expanded === step.id;

            return (
              <div
                key={step.id}
                className={`
                  rounded-lg border transition-all duration-200
                  ${done
                    ? "border-primary/20 bg-primary/5"
                    : "border-border bg-muted/20 hover:bg-muted/30"
                  }
                `}
              >
                {/* Step header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                  onClick={() => setExpanded(isOpen ? null : step.id)}
                >
                  <button
                    className="shrink-0"
                    onClick={e => { e.stopPropagation(); toggle(step.id); }}
                  >
                    {done
                      ? <CheckCircle2 className="w-5 h-5 text-primary" />
                      : <Circle className="w-5 h-5 text-muted-foreground/40" />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                        Step {i + 1}
                      </span>
                    </div>
                    <p className={`text-sm font-semibold leading-tight ${done ? "line-through text-muted-foreground/50" : ""}`}>
                      {step.title}
                    </p>
                  </div>

                  <ChevronRight
                    className={`w-4 h-4 text-muted-foreground/40 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                  />
                </div>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="ml-8 space-y-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                      <div className="flex items-start gap-2 bg-muted/40 rounded-md px-3 py-2">
                        <ChevronRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                        <span className="text-[11px] font-medium text-foreground/90">{step.action}</span>
                      </div>
                      {step.tip && (
                        <p className="text-[10px] text-primary/70 italic leading-relaxed">
                          Tip: {step.tip}
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-3"
                        onClick={() => toggle(step.id)}
                      >
                        {done ? "Mark incomplete" : "Mark complete"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          {completed === STEPS.length ? (
            <p className="text-xs text-primary font-semibold">
              You're all set — your first print is ready to go.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              You can reopen this from Help → Getting Started
            </p>
          )}
          <Button size="sm" className="h-7 text-[11px] px-4 shrink-0" onClick={handleClose}>
            {completed === STEPS.length ? "Let's print" : "Skip for now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Hook — returns true on first launch (before dismissed) */
export function useShowOnboarding() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setShow(true);
  }, []);
  return { show, dismiss: () => setShow(false) };
}
