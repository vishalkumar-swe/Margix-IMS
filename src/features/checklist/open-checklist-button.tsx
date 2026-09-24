"use client";

import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChecklist } from "./checklist-provider";

/** Reopens today's checklist (app header: icon only; dashboard: labelled). */
export function OpenChecklistButton({ variant = "icon" }: { variant?: "icon" | "labelled" }) {
  const checklist = useChecklist();
  if (variant === "labelled") {
    return (
      <Button variant="secondary" onClick={checklist.open}>
        <ListChecks aria-hidden /> Today&apos;s checklist
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="icon" onClick={checklist.open} aria-label="Today's checklist" title="Today's checklist">
      <ListChecks aria-hidden />
    </Button>
  );
}
