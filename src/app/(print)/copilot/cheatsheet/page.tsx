import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/features/print/print-button";
import { milestoneAccess, stepsForRole, visibleMilestones } from "@/lib/copilot/tour";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Product-to-Sale cheatsheet" };

const RULES = [
  "Stock never changes directly. Only a GRN, dispatch, transfer, return or an approved adjustment writes the ledger.",
  "The ledger is immutable. Correct a posted movement with a reversal, never by editing or deleting the entry.",
  "An invoice records the sale; an open invoice does not reduce stock. Post a dispatch to move inventory.",
  "FEFO ships the earliest-expiring unexpired batch first. Leave the batch blank and use Pick batches (FEFO).",
  "Only the accepted quantity on a GRN enters stock. Rejected goods need a reason.",
  "A Tally sync failure never blocks or undoes a stock transaction. Retry it from Tally sync.",
  "The same product code is the audit anchor everywhere: purchase, stock, invoice, dispatch and ledger.",
];

/** Printable take-away version of the Product-to-Sale walkthrough, adapted to the user's role. */
export default async function CopilotCheatsheetPage() {
  const user = await requireUser();
  const milestones = visibleMilestones(user.role);

  return (
    <div className="mx-auto max-w-3xl px-6 print:max-w-none print:px-0">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">Margix IMS</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Product-to-Sale cheatsheet</h1>
            <p className="mt-1 text-sm text-slate-500">
              {ROLE_LABELS[user.role]} · {user.name} · {milestones.length} milestone
              {milestones.length === 1 ? "" : "s"} for your role
            </p>
          </div>
          <PrintButton />
        </header>

        <section className="mt-5 rounded-lg border border-brand-200 bg-brand-50 p-4 print:bg-white">
          <h2 className="text-sm font-semibold text-slate-900">The journey in one line</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">
            Product → purchase order → goods receipt (batch + expiry) → stock and ledger check → GST invoice → FEFO
            dispatch → Tally reconciliation. Each arrow is a separate, auditable document.
          </p>
        </section>

        <ol className="mt-6 space-y-5">
          {milestones.map((milestone) => {
            const access = milestoneAccess(user.role, milestone);
            const steps = stepsForRole(user.role, milestone);
            return (
              <li key={milestone.id} className="break-inside-avoid">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                    {milestone.order}
                  </span>
                  {milestone.title}
                  {access === "read" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      view only
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-xs text-slate-500">{milestone.description}</p>
                <ul className="mt-2 space-y-1.5">
                  {steps.map((step) => (
                    <li key={step.id} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-600 print:text-slate-400" aria-hidden />
                      <span>
                        <span className="font-medium text-slate-900">{step.title}.</span> {step.body}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>

        <section className="mt-8 break-inside-avoid">
          <h2 className="text-sm font-semibold text-slate-900">Rules to remember</h2>
          <ul className="mt-2 space-y-1.5">
            {RULES.map((rule) => (
              <li key={rule} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
                {rule}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="text-sm font-semibold text-slate-900">Error codes and their fix</h2>
          <table className="mt-2 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-xs tracking-wide text-slate-500 uppercase">
                <th className="py-1.5 pr-3 font-semibold">Code</th>
                <th className="py-1.5 font-semibold">What to do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <ErrorRow code="INSUFFICIENT_STOCK" fix="The selected batch has too little stock. Use Pick batches (FEFO) or another godown." />
              <ErrorRow code="OVER_RECEIPT" fix="Reduce the accepted quantity to what is still pending on the purchase order." />
              <ErrorRow code="OVER_DISPATCH" fix="Reduce the quantity to what remains undelivered on the invoice." />
              <ErrorRow code="VALIDATION_ERROR" fix="Fix the highlighted fields; nothing was saved." />
              <ErrorRow code="FORBIDDEN" fix="Your role cannot perform this write. Ask a manager or administrator." />
            </tbody>
          </table>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
          <span>Margix IMS · AI guided walkthrough</span>
          <Link href="/dashboard" className="text-brand-700 hover:underline print:hidden">
            Back to the dashboard
          </Link>
        </footer>
      </div>
    </div>
  );
}

function ErrorRow({ code, fix }: { code: string; fix: string }) {
  return (
    <tr>
      <td className="py-2 pr-3 align-top font-mono text-xs whitespace-nowrap text-slate-800">{code}</td>
      <td className="py-2 align-top text-slate-700">{fix}</td>
    </tr>
  );
}
