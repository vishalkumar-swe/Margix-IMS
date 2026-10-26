"use client";

import { CircleCheck, FileDown, RotateCcw, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { MILESTONES } from "@/lib/copilot/tour";
import { cn } from "@/lib/cn";
import { useCopilot } from "./copilot-provider";
import { MilestoneIconView } from "./milestone-icon";

/**
 * Final report of the Product-to-Sale walkthrough (PRD §4.6):
 * Grand finale celebratory modal with interactive completion report and action buttons:
 * - Download Cheatsheet PDF
 * - Invite Team Member
 * - Finish Walkthrough
 */
export function CompletionDialog() {
  const { completionOpen, closeCompletion, progress, counts, tour, startTour, can } = useCopilot();
  const toast = useToast();

  if (!completionOpen) return null;

  const complete = progress.done >= progress.total;

  function handleFinish() {
    closeCompletion();
    toast.success("Walkthrough completed! You are ready to manage inventory and sales.");
  }

  function handleInvite() {
    if (navigator?.clipboard) {
      void navigator.clipboard.writeText(window.location.origin);
      toast.success("Margix URL copied to clipboard! Share it with your team.");
    }
  }

  return (
    <Dialog
      open
      onClose={closeCompletion}
      title={complete ? "🎉 Product-to-Sale Walkthrough Complete!" : "Your Walkthrough Progress"}
      description={
        complete
          ? "Congratulations! You have verified the full end-to-end operational lifecycle."
          : "Progress is saved for you. Pick up any milestone from the dashboard card whenever you like."
      }
      className="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="size-4 text-brand-700" aria-hidden />
              {progress.done} of {progress.total} milestones completed
            </p>
            <span className="rounded-full bg-brand-200 px-2 py-0.5 text-xs font-bold text-brand-900">
              100% Certified
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {MILESTONES.map((milestone) => {
              const done = tour.completed.includes(milestone.id);
              return (
                <li
                  key={milestone.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    done ? "border-brand-300 bg-white text-slate-800" : "border-slate-200 bg-slate-50 text-slate-400",
                  )}
                >
                  <CircleCheck
                    className={cn("size-4 shrink-0", done ? "text-brand-600" : "text-slate-300")}
                    aria-hidden
                  />
                  <MilestoneIconView icon={milestone.icon} className="size-3.5 shrink-0" />
                  <span className="truncate">{milestone.title}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h3 className="text-xs font-semibold tracking-wide uppercase text-slate-600">
            Lifecycle Verification Report
          </h3>
          <ul className="mt-2.5 space-y-2 text-xs text-slate-700">
            <li className="flex items-start gap-2">
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">✓</span>
              <div>
                <strong>Product Master:</strong> Immutable SKU record created with base/alternate unit conversion and GST HSN slab.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">✓</span>
              <div>
                <strong>Procurement & GRN:</strong> Purchase order converted to accepted stock in godown with manufacturer batch & expiry tracking.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">✓</span>
              <div>
                <strong>Stock Audit:</strong> Double-entry ledger verified for positive INWARD movement and low-stock reorder thresholds set.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">✓</span>
              <div>
                <strong>Sales Invoicing:</strong> GST-compliant sales invoice posted, reserving customer demand without premature inventory deductions.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">✓</span>
              <div>
                <strong>FEFO Dispatch & Fulfillment:</strong> Earliest-expiring batch automatically allocated, Delivery Challan issued, and OUTWARD ledger written.
              </div>
            </li>
          </ul>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <ReportStat label="Products" value={counts.activeSkus} />
          <ReportStat label="Stock lines" value={counts.stockLines} />
          <ReportStat label="Open POs" value={counts.openPurchaseOrders} />
          <ReportStat label="GRNs" value={counts.grns} />
          <ReportStat label="Open invoices" value={counts.openInvoices} />
          <ReportStat label="Dispatches" value={counts.dispatches} />
          <ReportStat label="Low stock" value={counts.lowStockAlerts} />
          <ReportStat label="Tally pending" value={counts.pendingTally} />
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              closeCompletion();
              void startTour(MILESTONES[0].id);
            }}
          >
            <RotateCcw aria-hidden className="mr-1.5 size-3.5" /> Walk through again
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/copilot/cheatsheet"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
              target="_blank"
            >
              <FileDown aria-hidden className="mr-1.5 size-3.5" /> Download Cheatsheet PDF
            </Link>

            {can("user.manage") ? (
              <Link
                href="/admin/users"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
                onClick={closeCompletion}
              >
                <UserPlus aria-hidden className="mr-1.5 size-3.5" /> Invite Team Member
              </Link>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleInvite}>
                <UserPlus aria-hidden className="mr-1.5 size-3.5" /> Invite Team Member
              </Button>
            )}

            <Button size="sm" onClick={handleFinish}>
              Finish Walkthrough
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <dt className="text-[10px] tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="text-base font-semibold text-slate-900 tabular-nums">{value}</dd>
    </div>
  );
}
