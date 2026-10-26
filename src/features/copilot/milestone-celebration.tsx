"use client";

import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useCopilot } from "./copilot-provider";
import { MilestoneIconView } from "./milestone-icon";

/** Milestone completion interstitial (PRD §4.1 step 4 and equivalents). */
export function MilestoneCelebration() {
  const {
    celebrationMilestone,
    dismissCelebration,
    startNextMilestone,
    progress,
    counts,
  } = useCopilot();

  if (!celebrationMilestone) return null;

  return (
    <Dialog open onClose={dismissCelebration} title={`Milestone ${celebrationMilestone.order} complete`} className="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-500 text-black">
            <PartyPopper className="size-5" aria-hidden />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MilestoneIconView icon={celebrationMilestone.icon} className="size-4 text-brand-700" />
              {celebrationMilestone.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{celebrationMilestone.celebration}</p>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Products</dt>
            <dd className="text-lg font-semibold text-slate-900 tabular-nums">{counts.activeSkus}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Open POs</dt>
            <dd className="text-lg font-semibold text-slate-900 tabular-nums">{counts.openPurchaseOrders}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Dispatches</dt>
            <dd className="text-lg font-semibold text-slate-900 tabular-nums">{counts.dispatches}</dd>
          </div>
        </dl>

        <div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Walkthrough progress</span>
            <span className="tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={dismissCelebration}>
            Finish for now
          </Button>
          <Button onClick={() => void startNextMilestone()}>Continue to the next milestone</Button>
        </div>
      </div>
    </Dialog>
  );
}
