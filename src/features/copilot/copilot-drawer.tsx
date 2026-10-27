"use client";

import {
  AlertOctagon,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Headphones,
  Loader2,
  Mic,
  MicOff,
  Send,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import type { AgentExecutionStep } from "@/lib/copilot/types";
import { useCopilot } from "./copilot-provider";
import { MarkdownLite } from "./markdown-lite";
import { MilestoneIconView } from "./milestone-icon";

interface SpeechRecognitionResultLike {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function AgentExecutionCard({
  thinking,
  steps,
}: {
  thinking?: string;
  steps: AgentExecutionStep[];
}) {
  const [expanded, setExpanded] = useState(true);
  const total = steps.length;
  const completed = steps.filter((s) => s.status === "completed").length;
  const isRunning = steps.some((s) => s.status === "running" || s.status === "pending");
  const failed = steps.filter((s) => s.status === "failed").length;

  return (
    <div className="mb-2.5 overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/80 shadow-2xs transition-all">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-100/70"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            {isRunning ? (
              <>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-60" />
                <Loader2 className="size-3.5 animate-spin text-blue-600" />
              </>
            ) : failed > 0 ? (
              <XCircle className="size-3.5 text-rose-500" />
            ) : (
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            )}
          </span>
          <span className="font-semibold text-slate-800 truncate text-[11px] sm:text-xs">
            {isRunning
              ? `Agent Executing (${completed}/${total} completed)...`
              : `Autonomous Agent Execution (${total} steps)`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-slate-500">
          <span className="rounded-full bg-slate-200/90 px-1.5 py-0.2 text-[10px] font-medium tabular-nums text-slate-700">
            {completed}/{total}
          </span>
          {expanded ? <ChevronUp className="size-3.5 text-slate-400" /> : <ChevronDown className="size-3.5 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200/70 bg-white/70 px-3 py-2 text-xs space-y-2">
          {thinking && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-2 text-[11px] text-indigo-950 leading-relaxed">
              <span className="font-semibold text-indigo-700 flex items-center gap-1 mb-0.5">
                <Cpu className="size-3" />
                Agent Reasoning & Objective
              </span>
              <p className="italic text-slate-600">{thinking}</p>
            </div>
          )}

          <div className="space-y-1.5">
            {steps.map((step, idx) => {
              const isStepRunning = step.status === "running";
              const isStepDone = step.status === "completed";
              const isStepFailed = step.status === "failed";

              return (
                <div
                  key={`${step.name}-${idx}`}
                  className={cn(
                    "flex items-start gap-2 rounded-lg p-1.5 text-[11px] transition-colors border",
                    isStepRunning
                      ? "border-blue-200 bg-blue-50/70 text-blue-950"
                      : isStepDone
                      ? "border-slate-100 bg-slate-50/50 text-slate-700"
                      : isStepFailed
                      ? "border-rose-200 bg-rose-50/70 text-rose-950"
                      : "border-transparent text-slate-400",
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {isStepRunning ? (
                      <Loader2 className="size-3 animate-spin text-blue-600" />
                    ) : isStepDone ? (
                      <CheckCircle2 className="size-3 text-emerald-600" />
                    ) : isStepFailed ? (
                      <XCircle className="size-3 text-rose-500" />
                    ) : (
                      <span className="inline-block size-2.5 rounded-full border border-slate-300" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="font-medium truncate text-slate-800">
                        {step.name}
                      </p>
                      <span className="shrink-0 rounded bg-slate-100 px-1 py-0.2 text-[9px] font-mono text-slate-600">
                        {step.tool}
                      </span>
                    </div>

                    {step.description && !step.outputSummary && (
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {step.description}
                      </p>
                    )}

                    {step.outputSummary && (
                      <p
                        className={cn(
                          "text-[10px] mt-0.5 font-medium flex items-center gap-1",
                          isStepFailed ? "text-rose-600" : "text-emerald-700",
                        )}
                      >
                        {isStepDone && "✓ "}
                        {step.outputSummary}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Right-hand Copilot drawer: conversation, chips, diagnostics and composer (PRD §7.2). */
export function CopilotDrawer() {
  const {
    drawerOpen,
    closeDrawer,
    messages,
    pending,
    sendMessage,
    confirmAction,
    chips,
    diagnostic,
    clearDiagnostic,
    navigateIntent,
    startTour,
    tour,
    currentMilestone,
    progress,
    pauseTour,
    resumeTour,
    can,
  } = useCopilot();
  const toast = useToast();
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [floorMode, setFloorMode] = useState(false);
  const [voiceSpoken, setVoiceSpoken] = useState(true);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const Recognition = speechRecognition();

  function speakText(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text
        .replace(/[*#_`[\]]/g, "")
        .replace(/\(.*?\)/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .trim();
      if (!clean) return;
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "en-IN";
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Best-effort synthesis
    }
  }

  useEffect(() => {
    if (!floorMode || !voiceSpoken || pending) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant" && last.content) {
      speakText(last.content);
    }
  }, [messages, floorMode, voiceSpoken, pending]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [drawerOpen]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, pending, diagnostic]);

  useEffect(() => {
    if (!drawerOpen) {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [drawerOpen]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const question = input.trim();
    if (!question || pending) return;
    setInput("");
    await sendMessage(question);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function toggleMic() {
    if (!Recognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index][0].transcript)
        .join(" ")
        .trim();
      if (transcript) {
        setInput(transcript);
        if (floorMode) {
          setTimeout(() => {
            void sendMessage(transcript);
            setInput("");
          }, 300);
        }
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      toast.error("Microphone could not start. Check browser permissions.");
    }
  }

  async function handleQuickSeedDemo() {
    setSandboxLoading(true);
    try {
      await apiRequest("/copilot/sandbox", { method: "POST" });
      toast.success("Sandbox demo data seeded! Check Stock & Invoices.");
      void sendMessage("What sample data was seeded in the sandbox?");
    } catch {
      toast.error("Failed to seed sandbox data");
    } finally {
      setSandboxLoading(false);
    }
  }

  if (!drawerOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[98] bg-slate-900/25 backdrop-blur-[1px]" onClick={closeDrawer} aria-hidden />
      <aside
        ref={panelRef}
        id="copilot-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="AI Copilot"
        className="glass-strong fixed inset-y-0 right-0 z-[100] flex w-full max-w-lg lg:max-w-xl flex-col border-l shadow-2xl transition-all"
      >
        <header className="shrink-0 border-b border-slate-200 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-500 text-black">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">AI Copilot</p>
                  {floorMode && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-800">
                      Floor Mode
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-slate-500">
                  {tour.active && currentMilestone
                    ? `Milestone ${currentMilestone.order}: ${currentMilestone.title}`
                    : "Ask about this screen or the ledger rules"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = !floorMode;
                  setFloorMode(next);
                  toast.info(next ? "Warehouse Floor Hands-Free Mode activated." : "Floor Mode off.");
                }}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors border",
                  floorMode
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
                title="Warehouse Floor Hands-Free Mode (speaks answers aloud)"
              >
                <Headphones className="size-3" />
                <span>Floor</span>
              </button>
              {floorMode && (
                <button
                  type="button"
                  onClick={() => setVoiceSpoken(!voiceSpoken)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                  title={voiceSpoken ? "Mute speech" : "Enable speech"}
                >
                  {voiceSpoken ? <Volume2 className="size-3.5 text-emerald-600" /> : <VolumeX className="size-3.5 text-slate-400" />}
                </button>
              )}
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close Copilot"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-slate-500 tabular-nums">
              {progress.done}/{progress.total} completed
            </span>
            {tour.active &&
              (tour.paused ? (
                <Button variant="link" size="sm" className="h-auto" onClick={resumeTour}>
                  Resume
                </Button>
              ) : (
                <Button variant="link" size="sm" className="h-auto" onClick={pauseTour}>
                  Pause
                </Button>
              ))}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-brand-200 bg-brand-50/80 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MilestoneIconView icon="package" className="size-4 text-brand-700" />
                  Product to Sale, in six milestones
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  I can explain any screen, spot the exact control, and walk you from creating a product to a FEFO
                  dispatch and Tally reconciliation. I never post a transaction for you.
                </p>
                {progress.total > 0 ? (
                  <Button className="mt-3" size="sm" onClick={() => void startTour()}>
                    Start the walkthrough
                  </Button>
                ) : null}
              </div>
              {can("settings.manage") && (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <Database className="size-3.5 text-amber-700" />
                      Sandbox Demo Mode
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs bg-white hover:bg-amber-100"
                      loading={sandboxLoading}
                      onClick={handleQuickSeedDemo}
                    >
                      Seed Demo Data
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-amber-800">
                    Instantly load 100 bags stock & open invoice to test FEFO dispatching.
                  </p>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Suggested for this page
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[92%] rounded-xl px-3 py-2",
                  message.role === "user"
                    ? "bg-brand-500 text-black"
                    : "border border-slate-200 bg-white text-slate-700 shadow-sm",
                )}
              >
                {message.role === "user" ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                ) : (
                  <>
                    {message.steps && message.steps.length > 0 && (
                      <AgentExecutionCard thinking={message.thinking} steps={message.steps} />
                    )}
                    {message.content ? (
                      <MarkdownLite text={message.content} />
                    ) : !message.steps || message.steps.length === 0 ? (
                      <span className="flex items-center gap-1 py-1" aria-label="Copilot is thinking">
                        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
                      </span>
                    ) : null}
                  </>
                )}
                {message.role === "assistant" && message.confirmation && (
                  <div
                    className={cn(
                      "mt-2.5 rounded-xl border p-3 text-xs shadow-sm transition-all",
                      message.confirmation.status === "pending"
                        ? message.confirmation.destructive
                          ? "border-red-300 bg-red-50/70"
                          : "border-blue-300 bg-blue-50/70"
                        : message.confirmation.status === "executed"
                        ? "border-emerald-300 bg-emerald-50/80"
                        : message.confirmation.status === "cancelled"
                        ? "border-slate-300 bg-slate-100/80"
                        : "border-rose-300 bg-rose-50/80",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {message.confirmation.status === "pending" ? (
                        message.confirmation.destructive ? (
                          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
                        ) : (
                          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-blue-600" />
                        )
                      ) : message.confirmation.status === "executed" ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      ) : message.confirmation.status === "cancelled" ? (
                        <Ban className="mt-0.5 size-4 shrink-0 text-slate-500" />
                      ) : (
                        <AlertOctagon className="mt-0.5 size-4 shrink-0 text-rose-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p
                            className={cn(
                              "font-semibold text-xs",
                              message.confirmation.status === "pending"
                                ? message.confirmation.destructive
                                  ? "text-red-900"
                                  : "text-blue-900"
                                : message.confirmation.status === "executed"
                                ? "text-emerald-900"
                                : message.confirmation.status === "cancelled"
                                ? "text-slate-800"
                                : "text-rose-900",
                            )}
                          >
                            {message.confirmation.title}
                          </p>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              message.confirmation.status === "pending"
                                ? message.confirmation.destructive
                                  ? "bg-red-200 text-red-800"
                                  : "bg-blue-200 text-blue-800"
                                : message.confirmation.status === "executed"
                                ? "bg-emerald-200 text-emerald-800"
                                : message.confirmation.status === "cancelled"
                                ? "bg-slate-200 text-slate-700"
                                : "bg-rose-200 text-rose-800",
                            )}
                          >
                            {message.confirmation.status}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "mt-1 text-xs leading-relaxed",
                            message.confirmation.status === "pending"
                              ? message.confirmation.destructive
                                ? "text-red-800"
                                : "text-blue-800"
                              : message.confirmation.status === "executed"
                              ? "text-emerald-800"
                              : message.confirmation.status === "cancelled"
                              ? "text-slate-600"
                              : "text-rose-800",
                          )}
                        >
                          {message.confirmation.resultMessage || message.confirmation.description}
                        </p>

                        {message.confirmation.status === "pending" && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant={message.confirmation.destructive ? "danger" : "primary"}
                              className="h-7 text-xs font-medium"
                              disabled={pending}
                              onClick={() => void confirmAction(message.confirmation!, "confirm")}
                            >
                              Confirm & Execute
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs"
                              disabled={pending}
                              onClick={() => void confirmAction(message.confirmation!, "cancel")}
                            >
                              Cancel / Abort
                            </Button>
                            {message.confirmation.alternatives?.map((alt, idx) => (
                              <Button
                                key={idx}
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-slate-600 underline hover:bg-slate-200/60"
                                disabled={pending}
                                onClick={() => void sendMessage(alt.label)}
                              >
                                {alt.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {message.role === "assistant" && message.actions && message.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                    {message.actions.map((action, index) => (
                      <Button
                        key={`${action.label}-${index}`}
                        variant="secondary"
                        size="sm"
                        className="h-auto py-1.5 text-xs"
                        onClick={async () => {
                          const result = await navigateIntent(action);
                          if (result.ok) closeDrawer();
                        }}
                      >
                        <ArrowUpRight aria-hidden /> {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {pending && messages[messages.length - 1]?.content === "" && (
            <p className="text-[11px] text-slate-400">Answering from the Margix knowledge base…</p>
          )}
        </div>

        {diagnostic && (
          <div className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-900">{diagnostic.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-red-800">{diagnostic.explanation}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {diagnostic.actions.map((action, index) => (
                    <Button
                      key={`${action.label}-${index}`}
                      variant="secondary"
                      size="sm"
                      className="h-auto py-1.5 text-xs"
                      onClick={async () => {
                        const result = await navigateIntent(action);
                        if (result.ok) {
                          clearDiagnostic();
                          closeDrawer();
                        }
                      }}
                    >
                      <ArrowUpRight aria-hidden /> {action.label}
                    </Button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={clearDiagnostic}
                className="rounded p-1 text-red-400 hover:bg-red-100 hover:text-red-700"
                aria-label="Dismiss explanation"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-slate-200 px-4 py-3">
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void sendMessage(chip)}
                disabled={pending}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-slate-900 disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
          {listening && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs text-brand-900 animate-pulse">
              <Mic className="size-4 text-brand-700 animate-bounce" />
              <span className="font-medium">
                {floorMode
                  ? "Hands-free floor listening... Speak command (e.g. \"Where is Basmati?\", \"Check stock\")"
                  : "Listening to speech... Speak clearly"}
              </span>
            </div>
          )}
          <form onSubmit={submit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about this screen…"
              aria-label="Ask the Copilot"
              data-copilot-ignore
              className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-slate-400 focus:outline-2 focus:outline-offset-2 focus:outline-slate-900"
              maxLength={1200}
            />
            {Recognition && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={toggleMic}
                aria-label={listening ? "Stop dictation" : "Dictate a question"}
                title={listening ? "Stop dictation" : "Dictate a question"}
              >
                {listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
              </Button>
            )}
            <Button type="submit" size="icon" loading={pending} aria-label="Send question">
              {!pending && <Send aria-hidden />}
            </Button>
          </form>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            Answers come from Margix rules and your current page state. The Copilot never posts, reverses or deletes
            anything — every ledger write needs your confirmation.
          </p>
        </div>
      </aside>
    </>
  );
}
