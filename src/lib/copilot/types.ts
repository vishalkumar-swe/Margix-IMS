import type { RoleCode } from "@prisma/client";
import type { Permission } from "@/lib/permissions";

/**
 * Everything the Copilot and the walkthrough engine share. Kept in `lib/` so
 * both the browser (spotlight/tour) and the server (chat) can use it without
 * importing React or Prisma runtime code.
 */

/** Executable action produced by the AI or by a walkthrough step (PRD §6.1). */
export interface GuidedNavigationIntent {
  /** Target application path, e.g. "/dispatches/new". May contain {placeholders}. */
  route: string;
  /** Query params merged into the route. Values may contain {placeholders}. */
  params?: Record<string, string>;
  /** CSS selector of the element to spotlight once the route has rendered. */
  highlightSelector?: string;
  /** Contextual explanation anchored to the spotlight. */
  tooltipText?: string;
  /** Optional data a future form version can consume (kept small and serialisable). */
  prefillData?: Record<string, string | number | boolean | null>;
  /** Guardrail evaluated client-side against live workspace counts. */
  prerequisiteCheck?: PrerequisiteCheck;
  /** Permission required to use the action; hidden when the role lacks it. */
  permission?: Permission;
  /** When set, clicking the action launches this walkthrough instead of navigating. */
  tourMilestoneId?: string;
}

export type PrerequisiteCheck =
  | "hasSku"
  | "hasOpenPurchaseOrder"
  | "hasOpenInvoice"
  | "hasDispatchableInvoice"
  | "hasDispatch"
  | "hasTallyJob";

/** A button rendered under a Copilot answer. */
export interface CopilotAction extends GuidedNavigationIntent {
  label: string;
  description?: string;
}

export type CopilotActionType =
  | "CANCEL_INVOICE"
  | "CANCEL_PO"
  | "SHORT_CLOSE_PO"
  | "REVERSE_LEDGER"
  | "PURGE_SANDBOX"
  | "SEED_SANDBOX"
  | "POST_DISPATCH"
  | "CREATE_PO"
  | "CREATE_INVOICE"
  | "CREATE_GRN"
  | "CREATE_SKU"
  | "CREATE_CUSTOMER"
  | "CREATE_SUPPLIER"
  | "CREATE_GODOWN"
  | "CREATE_TRANSFER"
  | "DEACTIVATE_SUPPLIER"
  | "DEACTIVATE_CUSTOMER"
  | "STOCK_ADJUSTMENT";

export interface CopilotAlternativeOption {
  label: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface CopilotConfirmation {
  id: string;
  title: string;
  description: string;
  actionType: CopilotActionType;
  payload: Record<string, unknown>;
  destructive: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  alternatives?: CopilotAlternativeOption[];
  status: "pending" | "confirmed" | "cancelled" | "executed" | "failed";
  resultMessage?: string;
}

/** Safe, non-secret page state sent with a question (PRD §5.1). */
export interface CopilotRuntimeContext {
  route: string;
  pageTitle?: string;
  role: RoleCode;
  /** Visible form inputs, keyed by a human label. Never passwords or files. */
  form?: Record<string, string>;
  /** Currently focused control, when it has a useful label. */
  focused?: string;
  /** Validation / API error the user is looking at. */
  error?: { code: string; message: string; details?: unknown };
  /** Recent errors captured by the global interceptor. */
  recentErrors?: string[];
}

export type AgentStepStatus = "pending" | "running" | "completed" | "failed";

export interface AgentExecutionStep {
  name: string;
  tool: string;
  description?: string;
  status: AgentStepStatus;
  outputSummary?: string;
}

export interface CopilotChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  steps?: AgentExecutionStep[];
  actions?: CopilotAction[];
  confirmation?: CopilotConfirmation;
  createdAt: number;
  /** Suggested question chips shown above the composer. */
  chips?: string[];
}

export interface CopilotChatRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  context: CopilotRuntimeContext;
}

/** Live counts used for guardrails, deep-link interpolation and completion reports. */
export interface WorkspaceCounts {
  activeSkus: number;
  stockLines: number;
  godowns: number;
  openPurchaseOrders: number;
  grns: number;
  openInvoices: number;
  dispatches: number;
  lowStockAlerts: number;
  pendingTally: number;
  latestSkuId: string | null;
  latestOpenPurchaseOrderId: string | null;
  latestInvoiceId: string | null;
  latestOpenInvoiceId: string | null;
  latestDispatchId: string | null;
}

export const EMPTY_WORKSPACE_COUNTS: WorkspaceCounts = {
  activeSkus: 0,
  stockLines: 0,
  godowns: 0,
  openPurchaseOrders: 0,
  grns: 0,
  openInvoices: 0,
  dispatches: 0,
  lowStockAlerts: 0,
  pendingTally: 0,
  latestSkuId: null,
  latestOpenPurchaseOrderId: null,
  latestInvoiceId: null,
  latestOpenInvoiceId: null,
  latestDispatchId: null,
};

/** One spotlighted instruction in a milestone. */
export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Path pattern. `[id]` matches one segment; `*` matches anything. */
  path: string;
  /** Navigable URL. May contain {counts} placeholders. Defaults to `path`. */
  href?: string;
  /** CSS selector of the element to spotlight. */
  target?: string;
  placement?: "top" | "bottom" | "auto";
  /** How the step completes. `route` waits for `completeOnPath`. */
  advanceOn?: "manual" | "click" | "route" | "event";
  eventName?: string;
  completeOnPath?: string;
  /** A search param that marks success, e.g. GRN posted → ?posted=GRN-… */
  completeOnSearchParam?: string;
  /** Roles that see this step. Omitted = every role with milestone access. */
  roles?: RoleCode[];
  /** Permission needed to perform the action; read-only roles still see the text. */
  permission?: Permission;
  /** Shown instead of action copy for a read-only role. */
  readOnlyNote?: string;
  /** A question the user can send without typing. */
  askPrompt?: string;
}

export type MilestoneIcon = "package" | "truck" | "box" | "file" | "tally" | "check";

export interface TourMilestone {
  id: string;
  order: number;
  title: string;
  shortTitle: string;
  description: string;
  icon: MilestoneIcon;
  fullRoles: RoleCode[];
  readRoles: RoleCode[];
  /** Full walkthrough for permitted roles. */
  steps: TourStep[];
  /** A single explanatory step for read-only roles. */
  readStep: TourStep;
  /** Short, celebratory line when the milestone is completed. */
  celebration: string;
}

export interface PersistedTourState {
  active: boolean;
  paused: boolean;
  milestoneId: string | null;
  stepIndex: number;
  completed: string[];
  startedAt: string | null;
}

export const IDLE_TOUR: PersistedTourState = {
  active: false,
  paused: false,
  milestoneId: null,
  stepIndex: 0,
  completed: [],
  startedAt: null,
};

export type MilestoneAccess = "full" | "read" | "hidden";
