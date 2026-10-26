"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. `0` keeps the toast until dismissed. */
  duration?: number;
}

interface ToastRecord {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Errors linger; confirmations get out of the way. */
const DEFAULT_DURATION: Record<ToastTone, number> = { success: 4000, info: 5000, error: 8000 };

/** Beyond this many, the oldest toast is dropped so the corner never floods. */
const MAX_VISIBLE = 4;

/**
 * Global, non-blocking feedback for mutations. Rendered once from the root
 * layout so every screen — authenticated or not — can confirm an action or
 * report a failure that a form cannot show inline.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, number> | null>(null);
  if (timers.current === null) timers.current = new Map();

  const dismiss = useCallback((id: number) => {
    const timer = timers.current?.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current?.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, tone = "info", duration }: ToastOptions) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, tone, title, description }]);
      const timeout = duration ?? DEFAULT_DURATION[tone];
      if (timeout > 0) timers.current?.set(id, window.setTimeout(() => dismiss(id), timeout));
      return id;
    },
    [dismiss],
  );

  const success = useCallback((title: string, description?: string) => toast({ title, description, tone: "success" }), [toast]);
  const error = useCallback((title: string, description?: string) => toast({ title, description, tone: "error" }), [toast]);
  const info = useCallback((title: string, description?: string) => toast({ title, description, tone: "info" }), [toast]);

  // Clear any pending timers when the provider unmounts (a full page swap).
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map?.values() ?? []) window.clearTimeout(timer);
      map?.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toast, success, error, info, dismiss }),
    [toast, success, error, info, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Mounted up front so assistive tech has a live region to announce into. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-2 p-4 sm:inset-x-auto sm:right-0 sm:w-full sm:max-w-sm sm:items-end"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>");
  return value;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "text-emerald-600",
  error: "text-red-600",
  info: "text-brand-700",
};

function ToastCard({ item, onDismiss }: { item: ToastRecord; onDismiss: (id: number) => void }) {
  const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" ? TriangleAlert : Info;
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className="toast-enter surface-solid pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-3.5 shadow-lg"
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_STYLES[item.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words text-slate-900">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm break-words text-slate-500">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="-m-1 shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        aria-label="Dismiss notification"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
