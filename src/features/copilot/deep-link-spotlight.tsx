"use client";

import { useEffect } from "react";
import { useCopilot } from "./copilot-provider";
import { SpotlightOverlay, useSpotlightTarget } from "./spotlight-overlay";

const AUTO_DISMISS_MS = 20_000;

/** A one-off spotlight produced by a Copilot action or error fix link. */
export function DeepLinkSpotlight() {
  const {
    pendingSpotlight,
    consumeSpotlight,
    tour,
    celebrationMilestone,
    completionOpen,
    openDrawer,
  } = useCopilot();

  const tourRunning = tour.active && !tour.paused;
  const active = Boolean(pendingSpotlight) && !tourRunning && !celebrationMilestone && !completionOpen;
  const target = useSpotlightTarget(pendingSpotlight?.selector ?? null, active);

  useEffect(() => {
    if (!pendingSpotlight) return;
    const timer = window.setTimeout(() => consumeSpotlight(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [consumeSpotlight, pendingSpotlight]);

  useEffect(() => {
    if (!active || !target.element) return;
    const element = target.element;
    const handler = () => window.setTimeout(() => consumeSpotlight(), 220);
    element.addEventListener("click", handler);
    return () => element.removeEventListener("click", handler);
  }, [active, consumeSpotlight, target.element]);

  if (!active || !pendingSpotlight) return null;

  return (
    <SpotlightOverlay
      rect={target.rect}
      container={target.container}
      title={pendingSpotlight.title ?? "Here it is"}
      body={pendingSpotlight.tooltipText ?? "This is the control the Copilot pointed you to."}
      eyebrow="Guided shortcut"
      nextLabel="Got it"
      onNext={consumeSpotlight}
      onAsk={() => {
        consumeSpotlight();
        openDrawer(pendingSpotlight.tooltipText ?? "Explain this screen and what I should do next.");
      }}
      onClose={consumeSpotlight}
    />
  );
}
