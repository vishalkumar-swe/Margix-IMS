"use client";

import { useEffect } from "react";
import { COPILOT_EVENT } from "@/lib/copilot/runtime";
import { useCopilot } from "./copilot-provider";
import { SpotlightOverlay, useSpotlightTarget } from "./spotlight-overlay";

/**
 * Drives the active spotlight: waits for the control, advances on click,
 * completed routes or product events, and renders the anchored instruction.
 */
export function TourEngine() {
  const {
    tour,
    currentMilestone,
    currentSteps,
    currentStep,
    tourReadOnly,
    celebrationMilestone,
    completionOpen,
    advanceTour,
    previousTourStep,
    pauseTour,
    openDrawer,
  } = useCopilot();

  const enabled = tour.active && !tour.paused && !celebrationMilestone && !completionOpen && Boolean(currentStep);
  const target = useSpotlightTarget(currentStep?.target ?? null, enabled);

  // Click-to-advance on navigation buttons (not on text fields).
  useEffect(() => {
    if (!enabled || currentStep?.advanceOn !== "click" || !target.element) return;
    const element = target.element;
    const handler = () => {
      window.setTimeout(() => advanceTour(), 320);
    };
    element.addEventListener("click", handler);
    return () => element.removeEventListener("click", handler);
  }, [advanceTour, currentStep?.advanceOn, enabled, target.element]);

  // Form success events (e.g. the SKU dialog closing after a save).
  useEffect(() => {
    if (!enabled || currentStep?.advanceOn !== "event" || !currentStep.eventName) return;
    const expected = currentStep.eventName;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string }>).detail;
      if (detail?.type === expected) window.setTimeout(() => advanceTour(), 260);
    };
    window.addEventListener(COPILOT_EVENT, handler);
    return () => window.removeEventListener(COPILOT_EVENT, handler);
  }, [advanceTour, currentStep?.advanceOn, currentStep?.eventName, enabled]);

  if (!enabled || !currentStep || !currentMilestone) return null;

  const index = currentSteps.findIndex((step) => step.id === currentStep.id);
  const last = index === currentSteps.length - 1;
  const stepNumber = index + 1;

  return (
    <SpotlightOverlay
      rect={target.rect}
      container={target.container}
      title={currentStep.title}
      body={currentStep.body}
      eyebrow={`Milestone ${currentMilestone.order} of 6 · ${currentMilestone.shortTitle}`}
      stepLabel={`Step ${stepNumber} of ${currentSteps.length}`}
      readOnly={tourReadOnly}
      placement={currentStep.placement}
      canPrevious={index > 0}
      nextLabel={last ? "Complete milestone" : "Next"}
      onPrevious={previousTourStep}
      onNext={advanceTour}
      onAsk={() => openDrawer(currentStep.askPrompt ?? "Explain this step in more detail.")}
      askLabel={currentStep.askPrompt ? "Ask why" : "Ask a question"}
      onClose={pauseTour}
    />
  );
}
