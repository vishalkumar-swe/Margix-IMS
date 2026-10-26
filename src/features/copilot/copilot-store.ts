import { MILESTONE_BY_ID } from "@/lib/copilot/tour";
import { IDLE_TOUR, type PersistedTourState } from "@/lib/copilot/types";

/**
 * Walkthrough state lives outside React so it can be hydrated from
 * localStorage without a setState-in-effect round trip, and so every widget
 * (launcher, bar, overlays) renders from one consistent snapshot.
 *
 * Persisted: milestone progress. Ephemeral: the celebration and completion
 * dialogs, which must not survive a reload.
 */
export interface CopilotStoreState {
  tour: PersistedTourState;
  celebrationId: string | null;
  completionOpen: boolean;
}

export type TourUpdater = (current: PersistedTourState) => PersistedTourState;

const STORAGE_PREFIX = "margix.copilot.v1";

function idleTour(): PersistedTourState {
  return { ...IDLE_TOUR, completed: [] };
}

function safeTourState(raw: string | null): PersistedTourState {
  if (!raw) return idleTour();
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedTourState>;
    const milestoneId =
      typeof parsed.milestoneId === "string" && MILESTONE_BY_ID.has(parsed.milestoneId) ? parsed.milestoneId : null;
    return {
      active: Boolean(parsed.active) && Boolean(milestoneId),
      paused: Boolean(parsed.paused),
      milestoneId,
      stepIndex: Number.isFinite(parsed.stepIndex) ? Math.max(0, Math.floor(Number(parsed.stepIndex))) : 0,
      completed: Array.isArray(parsed.completed)
        ? parsed.completed.filter((id): id is string => typeof id === "string" && MILESTONE_BY_ID.has(id))
        : [],
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : null,
    };
  } catch {
    return idleTour();
  }
}

export interface CopilotStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => CopilotStoreState;
  setTour: (updater: TourUpdater) => void;
  setCelebration: (milestoneId: string | null) => void;
  setCompletion: (open: boolean) => void;
}

function createStore(userId: string): CopilotStore {
  const storageKey = `${STORAGE_PREFIX}.${userId}`;
  const listeners = new Set<() => void>();
  let snapshot: CopilotStoreState | null = null;

  function read(): CopilotStoreState {
    if (snapshot) return snapshot;
    let tour = idleTour();
    if (typeof window !== "undefined") {
      try {
        tour = safeTourState(window.localStorage.getItem(storageKey));
      } catch {
        // Private mode or blocked storage: the walkthrough still works in memory.
      }
    }
    snapshot = { tour, celebrationId: null, completionOpen: false };
    return snapshot;
  }

  function emit(next: CopilotStoreState) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: read,
    setTour(updater) {
      const current = read();
      const next = updater(current.tour);
      if (next === current.tour) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Keep the in-memory state even when it cannot be persisted.
      }
      emit({ ...current, tour: next });
    },
    setCelebration(milestoneId) {
      const current = read();
      if (current.celebrationId === milestoneId) return;
      emit({ ...current, celebrationId: milestoneId });
    },
    setCompletion(open) {
      const current = read();
      if (current.completionOpen === open) return;
      emit({ ...current, completionOpen: open });
    },
  };
}

const stores = new Map<string, CopilotStore>();

/** One store per user for the lifetime of the tab. */
export function copilotStoreFor(userId: string): CopilotStore {
  let store = stores.get(userId);
  if (!store) {
    store = createStore(userId);
    stores.set(userId, store);
  }
  return store;
}

/** Stable snapshot used during server rendering and hydration. */
export const SERVER_COPILOT_STATE: CopilotStoreState = {
  tour: idleTour(),
  celebrationId: null,
  completionOpen: false,
};
