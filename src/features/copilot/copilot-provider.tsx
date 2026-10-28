"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { RoleCode } from "@prisma/client";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/api-client";
import { chipsForRoute } from "@/lib/copilot/chips";
import { diagnoseError, type ErrorDiagnosis } from "@/lib/copilot/diagnostics";
import {
  API_ERROR_EVENT,
  COPILOT_OPEN_EVENT,
  TOUR_START_EVENT,
  buildRuntimeContext,
  offlineAnswer,
  type ApiErrorEventDetail,
} from "@/lib/copilot/runtime";
import {
  MILESTONE_BY_ID,
  fallbackHref,
  intentHref,
  matchesPath,
  milestoneAccess,
  nextMilestone,
  progressForRole,
  stepHref,
  stepIndexForLocation,
  stepIsReadOnly,
  stepsForRole,
  visibleMilestones,
} from "@/lib/copilot/tour";
import {
  EMPTY_WORKSPACE_COUNTS,
  type AgentExecutionStep,
  type AgentStepStatus,
  type CopilotAction,
  type CopilotChatMessage,
  type CopilotConfirmation,
  type CopilotRuntimeContext,
  type GuidedNavigationIntent,
  type PersistedTourState,
  type TourMilestone,
  type TourStep,
  type WorkspaceCounts,
} from "@/lib/copilot/types";
import type { Permission } from "@/lib/permissions";
import { SERVER_COPILOT_STATE, copilotStoreFor } from "./copilot-store";

interface PendingSpotlight {
  selector: string;
  tooltipText?: string;
  title?: string;
  createdAt: number;
}

interface DiagnosticState extends ErrorDiagnosis {
  code: string;
  message: string;
  details?: unknown;
}

interface CopilotContextValue {
  role: RoleCode;
  can: (permission: Permission) => boolean;
  drawerOpen: boolean;
  openDrawer: (seed?: string) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  messages: CopilotChatMessage[];
  pending: boolean;
  sendMessage: (question: string) => Promise<void>;
  confirmAction: (
    confirmation: CopilotConfirmation,
    decision: "confirm" | "cancel",
    reason?: string,
  ) => Promise<void>;
  clearMessages: () => void;
  chips: string[];
  counts: WorkspaceCounts;
  refreshCounts: () => Promise<WorkspaceCounts>;
  tour: PersistedTourState;
  currentMilestone: TourMilestone | null;
  currentSteps: TourStep[];
  currentStep: TourStep | null;
  tourReadOnly: boolean;
  progress: { done: number; total: number };
  startTour: (milestoneId?: string) => Promise<void>;
  pauseTour: () => void;
  resumeTour: () => void;
  stopTour: () => void;
  advanceTour: () => void;
  previousTourStep: () => void;
  moveToStep: (index: number) => void;
  completeCurrentMilestone: () => void;
  celebrationMilestone: TourMilestone | null;
  dismissCelebration: () => void;
  startNextMilestone: () => Promise<void>;
  completionOpen: boolean;
  openCompletion: () => Promise<void>;
  closeCompletion: () => void;
  diagnostic: DiagnosticState | null;
  clearDiagnostic: () => void;
  pendingSpotlight: PendingSpotlight | null;
  consumeSpotlight: () => void;
  navigateIntent: (intent: CopilotAction | GuidedNavigationIntent) => Promise<{ ok: boolean; message?: string }>;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

const TOUR_PARAMS = ["ai_tour", "milestone", "step"] as const;

function withTourQuery(href: string, milestoneId: string, stepIndex: number): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("ai_tour", "p2s");
  params.set("milestone", milestoneId);
  params.set("step", String(stepIndex));
  return `${path}?${params.toString()}`;
}

/** Route without any tour params, preserving everything else. */
function withoutTourQuery(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  for (const key of TOUR_PARAMS) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** A usable list URL when a {documentId} placeholder cannot be resolved yet. */
function fallbackRoute(route: string): string {
  return fallbackHref(route) || "/dashboard";
}

export function CopilotProvider({
  user,
  permissions,
  children,
}: {
  user: { id: string; role: RoleCode };
  permissions: Permission[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const toast = useToast();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [counts, setCounts] = useState<WorkspaceCounts>(EMPTY_WORKSPACE_COUNTS);
  const [diagnostic, setDiagnostic] = useState<DiagnosticState | null>(null);
  const [pendingSpotlight, setPendingSpotlight] = useState<PendingSpotlight | null>(null);
  const countsRef = useRef(counts);
  const recentErrorsRef = useRef<string[]>([]);

  const store = copilotStoreFor(user.id);
  const { tour, celebrationId, completionOpen } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => SERVER_COPILOT_STATE,
  );

  const can = useCallback((permission: Permission) => permissions.includes(permission), [permissions]);

  const refreshCounts = useCallback(async (): Promise<WorkspaceCounts> => {
    try {
      const data = await apiRequest<WorkspaceCounts>("/copilot/context");
      setCounts(data);
      return data;
    } catch {
      return countsRef.current;
    }
  }, []);

  // Keep the ref in step with rendered counts for handlers that need the latest value.
  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<WorkspaceCounts>("/copilot/context")
      .then((data) => {
        if (!cancelled) setCounts(data);
      })
      .catch(() => {
        // Guardrails fall back to zero counts; the walkthrough still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A shared `?ai_tour=p2s&milestone=…&step=…` link opens the same step.
  useEffect(() => {
    if (searchParams.get("ai_tour") !== "p2s") return;
    const requested = searchParams.get("milestone");
    const milestone = requested ? MILESTONE_BY_ID.get(requested) : visibleMilestones(user.role)[0];
    if (!milestone || milestoneAccess(user.role, milestone) === "hidden") return;
    const steps = stepsForRole(user.role, milestone);
    if (steps.length === 0) return;
    const raw = Number(searchParams.get("step") ?? "0");
    const index = Number.isFinite(raw) ? Math.min(Math.max(0, Math.floor(raw)), steps.length - 1) : 0;
    store.setTour((previous) =>
      previous.active && previous.milestoneId === milestone.id && previous.stepIndex === index
        ? previous
        : {
            ...previous,
            active: true,
            paused: false,
            milestoneId: milestone.id,
            stepIndex: index,
            startedAt: previous.startedAt ?? new Date().toISOString(),
          },
    );
  }, [searchKey, searchParams, store, user.role]);

  const currentMilestone = tour.milestoneId ? (MILESTONE_BY_ID.get(tour.milestoneId) ?? null) : null;
  const currentSteps = useMemo(
    () => (currentMilestone ? stepsForRole(user.role, currentMilestone) : []),
    [currentMilestone, user.role],
  );
  const currentStep = currentSteps[tour.stepIndex] ?? null;
  const tourReadOnly = currentMilestone && currentStep ? stepIsReadOnly(user.role, currentMilestone, currentStep) : false;
  const progress = progressForRole(user.role, tour.completed);
  const celebrationMilestone = celebrationId ? (MILESTONE_BY_ID.get(celebrationId) ?? null) : null;

  const syncTourUrl = useCallback(
    (milestoneId: string, stepIndex: number) => {
      router.replace(withTourQuery(withoutTourQuery(pathname, searchKey), milestoneId, stepIndex), { scroll: false });
    },
    [pathname, router, searchKey],
  );

  const clearTourUrl = useCallback(() => {
    router.replace(withoutTourQuery(pathname, searchKey), { scroll: false });
  }, [pathname, router, searchKey]);

  const appendAssistant = useCallback((content: string, actions?: CopilotAction[]) => {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        actions,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  /** Moves the tour to a step, navigating when that step is on another route. */
  const moveToStep = useCallback(
    (index: number) => {
      if (!currentMilestone) return;
      const steps = stepsForRole(user.role, currentMilestone);
      const step = steps[index];
      if (!step) return;
      store.setTour((previous) => ({ ...previous, stepIndex: index, active: true, paused: false }));
      if (matchesPath(step.path, pathname)) {
        syncTourUrl(currentMilestone.id, index);
        return;
      }
      const href = stepHref(step, countsRef.current);
      if (href) {
        router.push(withTourQuery(href, currentMilestone.id, index));
      }
    },
    [currentMilestone, pathname, router, store, syncTourUrl, user.role],
  );

  const completeCurrentMilestone = useCallback(() => {
    if (!currentMilestone) return;
    const completed = Array.from(new Set([...tour.completed, currentMilestone.id]));
    const milestoneId = currentMilestone.id;
    store.setTour((previous) => ({
      ...previous,
      active: false,
      paused: false,
      milestoneId: null,
      stepIndex: 0,
      completed,
    }));
    clearTourUrl();
    const remaining = visibleMilestones(user.role).filter((milestone) => !completed.includes(milestone.id));
    const allDone = remaining.length === 0;

    // Asynchronously log to analytics audit log
    apiRequest("/copilot/progress", {
      body: { milestoneId, tourCompleted: allDone },
    }).catch(() => {
      // Best-effort progress recording
    });

    if (allDone) {
      store.setCelebration(null);
      store.setCompletion(true);
    } else {
      store.setCelebration(milestoneId);
    }
  }, [clearTourUrl, currentMilestone, store, tour.completed, user.role]);

  const advanceTour = useCallback(() => {
    if (!currentMilestone) return;
    const steps = stepsForRole(user.role, currentMilestone);
    if (tour.stepIndex >= steps.length - 1) {
      completeCurrentMilestone();
      return;
    }
    moveToStep(tour.stepIndex + 1);
  }, [completeCurrentMilestone, currentMilestone, moveToStep, tour.stepIndex, user.role]);

  const previousTourStep = useCallback(() => {
    if (tour.stepIndex <= 0) return;
    moveToStep(tour.stepIndex - 1);
  }, [moveToStep, tour.stepIndex]);

  const startTour = useCallback(
    async (milestoneId?: string) => {
      const milestone = milestoneId ? MILESTONE_BY_ID.get(milestoneId) : null;
      const fallback = visibleMilestones(user.role).find((entry) => !tour.completed.includes(entry.id)) ??
        visibleMilestones(user.role)[0];
      const target = milestone ?? fallback;
      if (!target) {
        toast.error("No walkthrough available for your role");
        return;
      }
      if (milestoneAccess(user.role, target) === "hidden") {
        toast.error("That milestone is not available for your role");
        return;
      }
      const steps = stepsForRole(user.role, target);
      if (steps.length === 0) return;
      const fresh = await refreshCounts();
      store.setTour(() => ({
        active: true,
        paused: false,
        milestoneId: target.id,
        stepIndex: 0,
        completed: tour.completed,
        startedAt: tour.startedAt ?? new Date().toISOString(),
      }));
      store.setCelebration(null);
      store.setCompletion(false);
      setDrawerOpen(false);
      const step = steps[0];
      const href = stepHref(step, fresh) ?? step.path;
      if (!matchesPath(step.path, pathname)) {
        router.push(withTourQuery(href, target.id, 0));
      } else {
        router.replace(withTourQuery(withoutTourQuery(pathname, searchKey), target.id, 0), { scroll: false });
      }
      appendAssistant(
        `**${target.title}**\n\n${target.description}\n\nI will spotlight each control and explain what it does. You can pause at any time; progress is saved for you.`,
      );
    },
    [appendAssistant, pathname, refreshCounts, router, searchKey, store, toast, tour.completed, tour.startedAt, user.role],
  );

  const pauseTour = useCallback(() => {
    store.setTour((previous) => ({ ...previous, paused: true }));
  }, [store]);

  const resumeTour = useCallback(() => {
    store.setTour((previous) => ({ ...previous, paused: false, active: true }));
    if (currentMilestone && currentStep) {
      const href = stepHref(currentStep, countsRef.current);
      if (!matchesPath(currentStep.path, pathname) && href) {
        router.push(withTourQuery(href, currentMilestone.id, tour.stepIndex));
      }
    }
  }, [currentMilestone, currentStep, pathname, router, store, tour.stepIndex]);

  const stopTour = useCallback(() => {
    store.setTour((previous) => ({ ...previous, active: false, paused: false, milestoneId: null, stepIndex: 0 }));
    store.setCelebration(null);
    clearTourUrl();
  }, [clearTourUrl, store]);

  const dismissCelebration = useCallback(() => store.setCelebration(null), [store]);

  const startNextMilestone = useCallback(async () => {
    if (!celebrationId) return;
    const next = nextMilestone(user.role, celebrationId);
    store.setCelebration(null);
    if (next) await startTour(next.id);
  }, [celebrationId, startTour, store, user.role]);

  const openCompletion = useCallback(async () => {
    store.setCompletion(true);
    await refreshCounts();
  }, [refreshCounts, store]);

  const closeCompletion = useCallback(() => store.setCompletion(false), [store]);

  // Route-driven progression: a successful submit navigates, or a document is opened.
  useEffect(() => {
    if (!tour.active || tour.paused || !currentMilestone || !currentStep) return;
    if (
      currentStep.advanceOn === "route" &&
      currentStep.completeOnPath &&
      matchesPath(currentStep.completeOnPath, pathname) &&
      (!currentStep.completeOnSearchParam || searchParams.has(currentStep.completeOnSearchParam))
    ) {
      advanceTour();
      return;
    }
    if (!matchesPath(currentStep.path, pathname)) {
      const found = stepIndexForLocation(currentSteps, pathname, tour.stepIndex);
      if (found !== null && found !== tour.stepIndex) {
        store.setTour((previous) => ({ ...previous, stepIndex: found }));
      }
    }
  }, [advanceTour, currentMilestone, currentStep, currentSteps, pathname, searchParams, store, tour.active, tour.paused, tour.stepIndex]);

  // Global API errors become fix cards (PRD §5.3).
  useEffect(() => {
    function onApiError(event: Event) {
      const detail = (event as CustomEvent<ApiErrorEventDetail>).detail;
      if (!detail || detail.code === "UNAUTHENTICATED") return;
      const diagnosis = diagnoseError(detail.code, detail.message, detail.details);
      setDiagnostic({ ...diagnosis, code: detail.code, message: detail.message, details: detail.details });
      recentErrorsRef.current = [`${detail.code}: ${detail.message}`, ...recentErrorsRef.current].slice(0, 4);
      if (detail.code !== "VALIDATION_ERROR") setDrawerOpen(true);
    }
    window.addEventListener(API_ERROR_EVENT, onApiError);
    return () => window.removeEventListener(API_ERROR_EVENT, onApiError);
  }, []);

  // Keyboard shortcut and Escape dismissal (PRD §7.1, §9.5).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setDrawerOpen((open) => !open);
        return;
      }
      if (event.key !== "Escape") return;
      if (drawerOpen) {
        setDrawerOpen(false);
        return;
      }
      if (celebrationId || completionOpen) {
        store.setCelebration(null);
        store.setCompletion(false);
        return;
      }
      if (tour.active && !tour.paused) pauseTour();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [celebrationId, completionOpen, drawerOpen, pauseTour, store, tour.active, tour.paused]);

  const sendMessage = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || pending) return;
      const assistantId = crypto.randomUUID();
      const userMessage: CopilotChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };
      const history = messages.slice(-12).map((message) => ({
        role: message.role,
        content: (message.content || "").slice(0, 16000),
        confirmation: message.confirmation,
      }));
      setMessages((current) => [
        ...current,
        userMessage,
        { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
      ]);
      setPending(true);

      const context: CopilotRuntimeContext = {
        ...buildRuntimeContext(user.role),
        error: diagnostic ? { code: diagnostic.code, message: diagnostic.message, details: diagnostic.details } : undefined,
        recentErrors: recentErrorsRef.current.slice(0, 3),
      };

      let streamed = "";
      const update = (patch: Partial<CopilotChatMessage>) => {
        setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, ...patch } : message)));
      };

      try {
        const response = await fetch("/api/v1/copilot/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, history, context }),
          credentials: "same-origin",
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? "The Copilot could not answer right now.");
        }

        if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
          const body = (await response.json()) as { answer?: string; actions?: CopilotAction[]; confirmation?: CopilotConfirmation };
          update({ content: body.answer ?? offlineAnswer(pathname), actions: body.actions, confirmation: body.confirmation });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalActions: CopilotAction[] | undefined;
        let finalConfirmation: CopilotConfirmation | undefined;
        let activeThinking: string | undefined;
        let activeSteps: AgentExecutionStep[] | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const event = JSON.parse(payload) as {
                type?: "plan" | "step" | "delta";
                thinking?: string;
                steps?: AgentExecutionStep[];
                stepIndex?: number;
                status?: AgentStepStatus;
                outputSummary?: string;
                delta?: string;
                error?: string;
                done?: boolean;
                actions?: CopilotAction[];
                confirmation?: CopilotConfirmation;
              };

              if (event.type === "plan" || (event.steps && event.thinking)) {
                activeThinking = event.thinking;
                activeSteps = event.steps;
                update({ thinking: activeThinking, steps: activeSteps ? [...activeSteps] : undefined });
              }

              if (
                (event.type === "step" || event.stepIndex !== undefined) &&
                activeSteps &&
                event.stepIndex !== undefined
              ) {
                const targetStep = activeSteps[event.stepIndex];
                if (targetStep) {
                  if (event.status) targetStep.status = event.status;
                  if (event.outputSummary !== undefined) targetStep.outputSummary = event.outputSummary;
                  activeSteps = [...activeSteps];
                  update({ steps: activeSteps });
                }
              }

              if (event.delta) {
                streamed += event.delta;
                update({ content: streamed });
              }
              if (event.error) {
                streamed += `\n\n_${event.error}_`;
                update({ content: streamed });
              }
              if (event.done) {
                finalActions = event.actions;
                if (event.confirmation) {
                  finalConfirmation = event.confirmation;
                }
              }
            } catch {
              // Ignore malformed keep-alive lines.
            }
          }
        }
        update({
          content: streamed || "I completed processing your request.",
          actions: finalActions,
          confirmation: finalConfirmation,
          thinking: activeThinking,
          steps: activeSteps,
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error && err.message && !err.message.includes("Failed to fetch")
            ? `⚠️ ${err.message}`
            : offlineAnswer(pathname);
        update({ content: errorMsg, actions: [] });
      } finally {
        setPending(false);
      }
    },
    [diagnostic, messages, pathname, pending, user.role],
  );

  const confirmAction = useCallback(
    async (
      confirmation: CopilotConfirmation,
      decision: "confirm" | "cancel",
      reason?: string,
    ) => {
      setPending(true);
      try {
        const response = await fetch("/api/v1/copilot/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            confirmationId: confirmation.id,
            actionType: confirmation.actionType,
            payload: confirmation.payload,
            decision,
            reason,
          }),
          credentials: "same-origin",
        });

        const json = await response.json();
        if (!response.ok || !json.data) {
          throw new Error(json.error?.message || json.data?.message || "Execution failed");
        }

        const res = json.data as {
          status: "executed" | "cancelled" | "failed";
          message: string;
          actions?: CopilotAction[];
        };

        setMessages((current) =>
          current.map((msg) => {
            if (msg.confirmation?.id === confirmation.id) {
              return {
                ...msg,
                confirmation: {
                  ...msg.confirmation,
                  status: res.status,
                  resultMessage: res.message,
                },
                actions: res.actions && res.actions.length > 0 ? res.actions : msg.actions,
              };
            }
            return msg;
          }),
        );

        if (res.status === "executed") {
          toast.success(res.message);
        } else if (res.status === "cancelled") {
          toast.info(res.message);
        } else {
          toast.error(res.message);
        }
        await refreshCounts();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Confirmation action failed");
      } finally {
        setPending(false);
      }
    },
    [refreshCounts, toast],
  );

  // Drawer/tour open requests from any screen (dashboard card, deep links).
  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<{ question?: string }>).detail;
      setDrawerOpen(true);
      if (detail?.question) void sendMessage(detail.question);
    }
    function onTour(event: Event) {
      const detail = (event as CustomEvent<{ milestoneId?: string }>).detail;
      void startTour(detail?.milestoneId);
    }
    window.addEventListener(COPILOT_OPEN_EVENT, onOpen);
    window.addEventListener(TOUR_START_EVENT, onTour);
    return () => {
      window.removeEventListener(COPILOT_OPEN_EVENT, onOpen);
      window.removeEventListener(TOUR_START_EVENT, onTour);
    };
  }, [sendMessage, startTour]);

  const openDrawer = useCallback(
    (seed?: string) => {
      setDrawerOpen(true);
      if (seed) void sendMessage(seed);
    },
    [sendMessage],
  );
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((open) => !open), []);
  const clearMessages = useCallback(() => setMessages([]), []);
  const clearDiagnostic = useCallback(() => setDiagnostic(null), []);

  const navigateIntent = useCallback(
    async (intent: CopilotAction | GuidedNavigationIntent): Promise<{ ok: boolean; message?: string }> => {
      if (intent.permission && !can(intent.permission)) {
        const message = "Your role does not have access to that action.";
        appendAssistant(message);
        setDrawerOpen(true);
        return { ok: false, message };
      }
      if (intent.tourMilestoneId) {
        await startTour(intent.tourMilestoneId);
        return { ok: true };
      }
      const fresh = await refreshCounts();
      const prerequisite = intent.prerequisiteCheck;
      if (prerequisite) {
        const available: Record<string, boolean> = {
          hasSku: fresh.activeSkus > 0,
          hasOpenPurchaseOrder: fresh.openPurchaseOrders > 0,
          hasOpenInvoice: fresh.openInvoices > 0,
          hasDispatchableInvoice: fresh.openInvoices > 0,
          hasDispatch: fresh.dispatches > 0,
          hasTallyJob: fresh.pendingTally > 0,
        };
        if (!available[prerequisite]) {
          const nextStep: Record<string, CopilotAction> = {
            hasSku: {
              label: "Create a product first",
              route: "/masters/skus",
              highlightSelector: '[data-tour="new-sku"]',
              permission: "master.manage",
            },
            hasOpenPurchaseOrder: {
              label: "Create a purchase order",
              route: "/purchase-orders/new",
              permission: "po.manage",
            },
            hasOpenInvoice: {
              label: "Create an invoice",
              route: "/invoices/new",
              permission: "invoice.manage",
            },
            hasDispatchableInvoice: {
              label: "Create an invoice",
              route: "/invoices/new",
              permission: "invoice.manage",
            },
            hasDispatch: {
              label: "Post a dispatch",
              route: "/dispatches/new",
              permission: "dispatch.create",
            },
            hasTallyJob: {
              label: "Open Tally sync",
              route: "/tally",
              permission: "tally.view",
            },
          };
          const message = `Before that, you need the prerequisite document. ${nextStep[prerequisite].label} first, then come back.`;
          appendAssistant(message, [nextStep[prerequisite]]);
          setDrawerOpen(true);
          return { ok: false, message };
        }
      }

      const href = intentHref(intent, fresh) ?? fallbackRoute(intent.route);
      if (intent.highlightSelector) {
        setPendingSpotlight({
          selector: intent.highlightSelector,
          tooltipText: intent.tooltipText,
          title: "Guided shortcut",
          createdAt: Date.now(),
        });
      }
      router.push(href);
      return { ok: true };
    },
    [appendAssistant, can, refreshCounts, router, startTour],
  );

  const consumeSpotlight = useCallback(() => setPendingSpotlight(null), []);

  const value: CopilotContextValue = {
    role: user.role,
    can,
    drawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    messages,
    pending,
    sendMessage,
    confirmAction,
    clearMessages,
    chips: chipsForRoute(pathname),
    counts,
    refreshCounts,
    tour,
    currentMilestone,
    currentSteps,
    currentStep,
    tourReadOnly,
    progress,
    startTour,
    pauseTour,
    resumeTour,
    stopTour,
    advanceTour,
    previousTourStep,
    moveToStep,
    completeCurrentMilestone,
    celebrationMilestone,
    dismissCelebration,
    startNextMilestone,
    completionOpen,
    openCompletion,
    closeCompletion,
    diagnostic,
    clearDiagnostic,
    pendingSpotlight,
    consumeSpotlight,
    navigateIntent,
  };

  return <CopilotContext value={value}>{children}</CopilotContext>;
}

export function useCopilot(): CopilotContextValue {
  const context = use(CopilotContext);
  if (!context) throw new Error("useCopilot must be used inside <CopilotProvider>.");
  return context;
}

/** For components that only need the launcher/tour (e.g. dashboard shortcuts). */
export function useCopilotOptional(): CopilotContextValue | null {
  return use(CopilotContext);
}
