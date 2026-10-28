import type { ApiClientError } from "@/lib/api-client";
import {
  SCREEN_ANCHOR_KINDS,
  deriveAnchorFromRoute,
  type ScreenAnchor,
  type ScreenAnchorKind,
} from "./screen-anchor";
import type { CopilotRuntimeContext } from "./types";

/**
 * Browser-side collection of the safe slice of page state sent with a question
 * (PRD §5.1). Passwords, files, hidden inputs and anything marked
 * `data-copilot-ignore` never leave the page.
 */
const MAX_FIELDS = 24;
const MAX_VALUE_LENGTH = 180;
const SECRET_AUTOCOMPLETE = /(password|one-time-code|cc-|current-password|new-password)/i;

function labelFor(control: HTMLElement): string | null {
  const explicit = control.getAttribute("aria-label");
  if (explicit) return explicit;
  const id = control.id;
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const wrapped = control.closest("label");
  if (wrapped?.textContent) return wrapped.textContent.trim();
  const placeholder = control.getAttribute("placeholder");
  if (placeholder) return placeholder;
  const name = control.getAttribute("name");
  return name || null;
}

function readableValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | null {
  if (control instanceof HTMLSelectElement) {
    const option = control.selectedOptions[0];
    return option?.textContent?.trim() || null;
  }
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    return control.checked ? "checked" : "unchecked";
  }
  const value = control.value.trim();
  if (!value) return null;
  if (control instanceof HTMLInputElement && control.type === "date") return value;
  return value.slice(0, MAX_VALUE_LENGTH);
}

/** Visible, labelled form controls from the active form/dialog. */
export function collectFormContext(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  const root = dialog ?? document.querySelector("main") ?? document.body;
  const controls = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"),
  );
  const result: Record<string, string> = {};
  for (const control of controls) {
    if (Object.keys(result).length >= MAX_FIELDS) break;
    if (control.disabled || control.type === "hidden" || control.type === "file") continue;
    if (control.hasAttribute("data-copilot-ignore")) continue;
    if (control instanceof HTMLInputElement && SECRET_AUTOCOMPLETE.test(control.autocomplete)) continue;
    if (control.offsetParent === null && control.type !== "hidden") continue;
    const label = labelFor(control);
    const value = readableValue(control);
    if (!label || value === null) continue;
    if (result[label]) continue;
    result[label] = value;
  }
  return result;
}

const ANCHOR_KINDS = new Set<string>(SCREEN_ANCHOR_KINDS);

/**
 * The record the user has singled out on screen, if any. A page opts in by
 * putting `data-copilot-entity` (plus `-id` and optionally `-label`) on a row
 * or card, and marking the active one with `data-copilot-selected`,
 * `aria-selected` or `aria-current`. Keyboard focus counts as a selection too.
 */
function selectedAnchor(): ScreenAnchor | null {
  if (typeof document === "undefined") return null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-copilot-entity]"));
  if (candidates.length === 0) return null;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const chosen =
    candidates.find((element) => element.matches("[data-copilot-selected], [aria-selected='true'], [aria-current='true'], [aria-current='page']")) ??
    (active ? candidates.find((element) => element.contains(active)) : undefined) ??
    (candidates.length === 1 ? candidates[0] : undefined);
  if (!chosen) return null;
  const kind = chosen.dataset.copilotEntity;
  if (!kind || !ANCHOR_KINDS.has(kind)) return null;
  const id = chosen.dataset.copilotEntityId?.trim();
  const label = chosen.dataset.copilotEntityLabel?.trim() || chosen.textContent?.trim().slice(0, 120);
  if (!id && !label) return null;
  return { kind: kind as ScreenAnchorKind, id: id || undefined, label: label || undefined, source: "selection" };
}

/** Selection wins over the URL; the URL still anchors every detail screen. */
export function collectScreenAnchor(route: string): ScreenAnchor | undefined {
  return selectedAnchor() ?? deriveAnchorFromRoute(route) ?? undefined;
}

export function focusedLabel(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return undefined;
  return labelFor(active) ?? undefined;
}

export function pageTitle(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.title.replace(/\s*·\s*Margix India\s*$/, "").trim() || undefined;
}

export interface ApiErrorEventDetail {
  code: string;
  message: string;
  details?: unknown;
  path?: string;
  at: number;
}

export const API_ERROR_EVENT = "margix:api-error";
export const COPILOT_EVENT = "margix:copilot-event";
export const COPILOT_OPEN_EVENT = "margix:copilot-open";
export const TOUR_START_EVENT = "margix:tour-start";

export function emitApiError(error: ApiClientError, path?: string): void {
  if (typeof window === "undefined") return;
  const detail: ApiErrorEventDetail = {
    code: error.code,
    message: error.message,
    details: error.details,
    path,
    at: Date.now(),
  };
  window.dispatchEvent(new CustomEvent<ApiErrorEventDetail>(API_ERROR_EVENT, { detail }));
}

/** Forms announce successful writes so the tour can advance without guessing. */
export function emitCopilotEvent(type: string, detail: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COPILOT_EVENT, { detail: { type, ...detail, at: Date.now() } }));
}

export function buildRuntimeContext(role: CopilotRuntimeContext["role"]): CopilotRuntimeContext {
  const route = typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
  return {
    route,
    pageTitle: pageTitle(),
    role,
    form: collectFormContext(),
    focused: focusedLabel(),
    anchor: collectScreenAnchor(route),
  };
}

/** Last-resort answer when even the local API cannot be reached. */
export function offlineAnswer(route: string): string {
  const advice: Record<string, string> = {
    "/stock": "Stock is a projection of the immutable ledger. Use an adjustment (approved by a second person) to correct a physical count.",
    "/ledger": "Correct a posted movement with a reversal, never by editing the entry.",
    "/invoices": "An invoice records the sale but does not reduce stock; post a dispatch to move inventory.",
    "/dispatches": "Enter the SKU and quantity, leave the batch blank, then use Pick batches (FEFO).",
    "/purchase-orders": "Open an OPEN purchase order to receive goods with batch and expiry.",
    "/masters/skus": "Create the product once; its code becomes permanent when stock moves.",
  };
  const key = Object.keys(advice)
    .filter((prefix) => route === prefix || route.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  return [
    "The AI service is unreachable, but the guided walkthrough still works offline.",
    key ? advice[key] : "Use the walkthrough bar to continue step by step.",
    "Core rule: stock never changes directly — only GRNs, dispatches, transfers, returns and approved adjustments write the ledger.",
  ].join("\n\n");
}
