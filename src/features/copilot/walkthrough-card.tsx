"use client";

import { ArrowRight, CircleCheck, Play, Printer, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { visibleMilestones } from "@/lib/copilot/tour";
import { useCopilot } from "./copilot-provider";
import { MilestoneIconView } from "./milestone-icon";

/**
 * Dashboard entry point for the Product-to-Sale walkthrough (PRD §7.4).
 * Existing progress is restored from the user's saved tour state.
 */
export function WalkthroughCard() {
  const { role, tour, progress, startTour, currentMilestone } = useCopilot();
  const milestones = visibleMilestones(role);
  if (milestones.length === 0) return null;

  const complete = progress.done >= progress.total;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand-700" aria-hidden />
            Product to Sale walkthrough
          </span>
        }
        description={
          complete
            ? "Every milestone is complete for your role."
            : "A guided tour from creating a product to a FEFO dispatch and reconciliation."
        }
        actions={
          <Link href="/copilot/cheatsheet" className={buttonVariants({ variant: "ghost", size: "sm" })} target="_blank">
            <Printer aria-hidden /> Cheatsheet
          </Link>
        }
      />
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[11px] font-medium text-slate-500 tabular-nums">
            {progress.done}/{progress.total}
          </span>
        </div>

        <ol className="divide-y divide-slate-100">
          {milestones.map((milestone) => {
            const done = tour.completed.includes(milestone.id);
            const active = tour.active && currentMilestone?.id === milestone.id;
            return (
              <li key={milestone.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    done ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {done ? <CircleCheck className="size-4" aria-hidden /> : <MilestoneIconView icon={milestone.icon} className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {milestone.order}. {milestone.title}
                  </p>
                  <p className="truncate text-xs text-slate-500">{milestone.description}</p>
                </div>
                {active ? (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                    In progress
                  </span>
                ) : (
                  <Button
                    variant={done ? "ghost" : "secondary"}
                    size="sm"
                    onClick={() => void startTour(milestone.id)}
                  >
                    {done ? "Review" : <><Play aria-hidden /> Start</>}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            The Copilot never posts a transaction; every write stays in your hands.
          </p>
          <Button size="sm" onClick={() => void startTour()}>
            {tour.active ? "Continue walkthrough" : complete ? "Walk through again" : "Start walkthrough"}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
