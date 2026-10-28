/**
 * The Copilot chat SSE contract.
 *
 * Every answer path — the model stream, the autonomous agent and the domain
 * guard — writes these events, and the browser reads them. They used to be
 * untyped object literals on both sides, so a path could emit a shape the
 * client silently ignored: a guardrail refusal sent as `{type:"token",text}`
 * left the user watching an empty bubble spin until the stream closed. Typing
 * the union makes that a compile error instead of a dead screen.
 */
import type { AgentExecutionStep, AgentStepStatus, CopilotAction, CopilotConfirmation } from "./types";

/** The steps now known, with their current status. Re-sent as the plan grows. */
export interface CopilotPlanEvent {
  type: "plan";
  thinking?: string;
  steps: AgentExecutionStep[];
}

/** One step changed state. */
export interface CopilotStepEvent {
  type: "step";
  stepIndex: number;
  status: AgentStepStatus;
  outputSummary?: string;
}

/** A chunk of answer text. */
export interface CopilotDeltaEvent {
  delta: string;
}

/** Terminal event: the answer is complete. */
export interface CopilotDoneEvent {
  done: true;
  actions?: CopilotAction[];
  sources?: string[];
  confirmation?: CopilotConfirmation;
}

/** The answer failed; the browser shows this instead of the text. */
export interface CopilotErrorEvent {
  error: string;
}

export type CopilotStreamEvent =
  | CopilotPlanEvent
  | CopilotStepEvent
  | CopilotDeltaEvent
  | CopilotDoneEvent
  | CopilotErrorEvent;

/**
 * Shape the browser decodes. One frame carries the fields of whichever event
 * it is, so every field is optional. `AssertReadable` below fails to compile
 * if a server event ever carries a field this frame cannot express — that is
 * the check that keeps the two sides from drifting apart again.
 */
export interface CopilotStreamFrame {
  type?: "plan" | "step";
  thinking?: string;
  steps?: AgentExecutionStep[];
  stepIndex?: number;
  status?: AgentStepStatus;
  outputSummary?: string;
  delta?: string;
  done?: boolean;
  actions?: CopilotAction[];
  sources?: string[];
  confirmation?: CopilotConfirmation;
  error?: string;
}

/** Every key of every union member, not just the keys they share. */
type AllKeys<T> = T extends unknown ? keyof T : never;

/** Field names a server event emits that the browser frame cannot express. */
type UnreadableFields = Exclude<AllKeys<CopilotStreamEvent>, keyof CopilotStreamFrame>;

/**
 * `never` the moment an event gains a field the frame lacks, which makes the
 * assignment below a compile error. Field *types* are checked separately:
 * each event must stay assignable to the frame.
 */
type NoStreamDrift = [UnreadableFields] extends [never] ? true : never;
type EventsFitFrame<Event extends CopilotStreamFrame> = Event;
export type ReadableCopilotEvent = EventsFitFrame<CopilotStreamEvent>;

/** Compile-time proof that the browser can read everything the server emits. */
export const COPILOT_STREAM_CONTRACT_VERIFIED: NoStreamDrift = true;

const encoder = new TextEncoder();

/** Encodes one event as an SSE frame. */
export function encodeCopilotEvent(event: CopilotStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}
