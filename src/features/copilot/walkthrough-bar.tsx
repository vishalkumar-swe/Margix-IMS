"use client";

import { ArrowRight, Pause, Play, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { matchesPath } from "@/lib/copilot/tour";
import { useCopilot } from "./copilot-provider";
import { MilestoneIconView } from "./milestone-icon";

/** Unobtrusive top banner while a walkthrough is active or paused (PRD §7.3). Never blocks controls. */
export function WalkthroughBar() {
  const pathname = usePathname();
  const {
    tour,
    currentMilestone,
    currentSteps,
    currentStep,
    celebrationMilestone,
    completionOpen,
    pauseTour,
    resumeTour,
    stopTour,
    moveToStep,
    openDrawer,
  } = useCopilot();

  if (!currentMilestone || celebrationMilestone || completionOpen) return null;
  if (!tour.active && !tour.paused) return null;

  const onStep = currentStep ? matchesPath(currentStep.path, pathname) : true;

  return (
    <div className="border-b border-brand-200 bg-brand-50/95 px-4 py-2 text-slate-800 shadow-xs backdrop-blur-sm transition-all">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700">
          <MilestoneIconView icon={currentMilestone.icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-900">
            {tour.paused ? "Walkthrough paused" : currentMilestone.title}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="flex items-center gap-1" aria-label={`Step ${tour.stepIndex + 1} of ${currentSteps.length}`}>
              {currentSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => moveToStep(index)}
                  aria-label={`Go to step ${index + 1}: ${step.title}`}
                  aria-current={index === tour.stepIndex ? "step" : undefined}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    index === tour.stepIndex ? "w-4 bg-brand-500" : "w-1.5 bg-slate-300 hover:bg-slate-400",
                    index < tour.stepIndex && "bg-brand-300",
                  )}
                />
              ))}
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {tour.stepIndex + 1}/{currentSteps.length}
            </span>
          </div>
        </div>
        {!onStep && (
          <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => moveToStep(tour.stepIndex)} title="Open the step's screen">
            Go <ArrowRight aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => openDrawer()}
          aria-label="Ask Copilot or Voice Mode"
          title="Ask Copilot or Voice Mode"
        >
          <Sparkles className="size-3.5 text-brand-600" aria-hidden />
        </Button>
        {tour.paused ? (
          <Button size="sm" className="h-7 text-xs" onClick={resumeTour}>
            <Play aria-hidden className="size-3" /> Resume
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="size-7" onClick={pauseTour} aria-label="Pause walkthrough">
            <Pause aria-hidden className="size-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-7" onClick={stopTour} aria-label="Exit walkthrough">
          <X aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
