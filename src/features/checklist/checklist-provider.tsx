"use client";

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api-client";
import { ChecklistDialog } from "./checklist-dialog";

interface ChecklistContextValue {
  open: () => void;
}

const ChecklistContext = createContext<ChecklistContextValue | null>(null);

/**
 * Owns the daily checklist popup for the app shell. It opens by itself on the
 * first page of the IST day (`autoOpen`, decided by the server) and records
 * that it was shown; any screen can reopen it with useChecklist().open().
 */
export function ChecklistProvider({ autoOpen, children }: { autoOpen: boolean; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(autoOpen);
  /** Each opening mounts a fresh dialog, which loads current data. */
  const [openings, setOpenings] = useState(0);

  // The shell stays mounted across navigations: a new IST day (after a refresh) opens it again.
  const [previousAutoOpen, setPreviousAutoOpen] = useState(autoOpen);
  if (autoOpen !== previousAutoOpen) {
    setPreviousAutoOpen(autoOpen);
    if (autoOpen) {
      setOpenings((n) => n + 1);
      setIsOpen(true);
    }
  }

  useEffect(() => {
    if (!autoOpen) return;
    // Idempotent. Remember it server-side, so other tabs and devices do not pop it up again today.
    apiRequest("/checklist/seen", { method: "POST" }).catch(() => {});
  }, [autoOpen]);

  const open = useCallback(() => {
    setOpenings((n) => n + 1);
    setIsOpen(true);
  }, []);

  return (
    <ChecklistContext value={{ open }}>
      {children}
      <ChecklistDialog key={openings} open={isOpen} onClose={() => setIsOpen(false)} />
    </ChecklistContext>
  );
}

export function useChecklist(): ChecklistContextValue {
  const context = use(ChecklistContext);
  if (!context) throw new Error("useChecklist must be used inside <ChecklistProvider>.");
  return context;
}
