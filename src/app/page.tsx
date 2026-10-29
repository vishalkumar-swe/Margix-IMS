import {
  ArrowRight,
  Boxes,
  ChartColumn,
  Check,
  FileText,
  PackageCheck,
  RefreshCw,
  ScrollText,
  Truck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-logo";
import { NAV_SECTIONS } from "@/components/layout/navigation";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "Margix India — Ledger-based inventory management" },
  description:
    "Margix India is a ledger-based inventory system: purchase orders, goods receipts, multi-godown stock, dispatch, GST invoicing, Tally sync and reporting in one place.",
};

/** Capabilities shown under the hero. Every one maps to a module that exists today. */
const CAPABILITIES = [
  "Single source of truth",
  "Multi-godown stock",
  "GST-ready documents",
  "Role-based permissions",
  "Complete audit trail",
  "Tally sync",
];

/** The arguments for the ledger model, one per card. */
const PILLARS = [
  {
    icon: ScrollText,
    title: "Ledger-based stock truth",
    body: "Every receipt, issue, transfer and adjustment posts an immutable entry to the inventory ledger. Stock, cost and tax reconcile by construction rather than by trusting a spreadsheet.",
  },
  {
    icon: PackageCheck,
    title: "Receiving that captures everything",
    body: "Raise purchase orders, then receive against them fully or partially, with batch, expiry, HSN and landed cost recorded as the goods arrive.",
  },
  {
    icon: Truck,
    title: "Dispatch without guesswork",
    body: "Issue from the correct godown and produce print-ready delivery challans in the same flow, so what left the building matches what the ledger says.",
  },
  {
    icon: FileText,
    title: "GST invoicing and returns",
    body: "Tax invoices, credit and debit notes, and both customer and supplier returns, numbered per your own series with the GST breakup calculated for you.",
  },
  {
    icon: RefreshCw,
    title: "Tally, kept in step",
    body: "A scheduled sync keeps Tally and the IMS aligned. Failed runs raise alerts instead of letting the two quietly drift apart.",
  },
  {
    icon: ChartColumn,
    title: "Reports you can act on",
    body: "Stock summary, movements, ageing, and slow and dead stock, filterable by godown or product and exportable when you need to share them.",
  },
];

/** The daily cycle, in the order the work actually happens. */
const STEPS = [
  {
    title: "Receive",
    body: "Record a goods receipt against a purchase order, in full or in part. The ledger updates the moment it is posted.",
  },
  {
    title: "Move",
    body: "Transfer between godowns and post adjustments, each with its reason attached, so every location stays exact.",
  },
  {
    title: "Dispatch and bill",
    body: "Issue the stock, print the delivery challan, raise the GST invoice, and let the sync carry it across to Tally.",
  },
];

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      <p className="mt-3 text-slate-600">{body}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="app-backdrop min-h-screen">
      <header className="glass-strong sticky top-0 z-20 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center" aria-label="Margix India — home">
            <BrandLogo variant="wordmark" className="h-6" priority />
          </Link>
          <div className="ml-auto flex items-center gap-6">
            <nav className="hidden items-center gap-6 md:flex" aria-label="Sections">
              <a href="#capabilities" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                Capabilities
              </a>
              <a href="#modules" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                Modules
              </a>
              <a href="#how" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                How it works
              </a>
              <Link href="/docs" className="text-sm font-medium text-brand-700 hover:text-brand-900 font-semibold">
                Documentation
              </Link>
            </nav>
            <Link href="/login" className={buttonVariants()}>
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24 sm:pb-20 lg:px-8">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">
              <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />
              Ledger-based inventory · Tally sync · GST-ready
            </p>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Inventory that always{" "}
              <span className="underline decoration-brand-500 decoration-4 underline-offset-4">adds up</span>.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
              Margix India records every stock movement as a posting in one ledger, so what you hold, what it cost
              and what you owe GST on can never disagree with each other.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className={buttonVariants({ size: "lg" })}>
                Sign in
                <ArrowRight aria-hidden />
              </Link>
              <a href="#modules" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Explore the modules
              </a>
            </div>

            <ul className="mt-9 flex flex-wrap gap-x-5 gap-y-2.5">
              {CAPABILITIES.map((capability) => (
                <li key={capability} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Check className="size-4 text-brand-700" aria-hidden />
                  {capability}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Capabilities"
            title="Built around the ledger, not around screens"
            body="Most inventory tools let stock, costing and tax drift apart because each is tracked separately. Here they are three views of the same postings."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="glass rounded-xl border p-6">
                <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Modules — rendered from the app's own navigation, so this never goes stale. */}
        <section id="modules" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Modules"
            title="Everything the operation needs, in one system"
            body="Access is role-based. Each person sees only the modules they have been granted, and every change is written to the audit trail."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="glass rounded-xl border p-6">
                <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{section.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {section.items.map(({ label, icon: Icon }) => (
                    <li key={label} className="flex items-center gap-2.5 text-sm text-slate-700">
                      <Icon className="size-4 shrink-0 text-brand-700" aria-hidden />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="How it works"
            title="The daily loop"
            body="Three steps cover almost everything that happens to your stock on a normal working day."
          />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ title, body }, index) => (
              <li key={title} className="glass rounded-xl border p-6">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-black">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-4 pt-6 pb-20 sm:px-6 lg:px-8">
          <div className="glass flex flex-col items-center rounded-2xl border px-6 py-12 text-center sm:px-12">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
              <Boxes className="size-6" aria-hidden />
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Ready to see the real stock position?
            </h2>
            <p className="mt-3 max-w-xl text-slate-600">
              Sign in with your Margix India account to pick up where the ledger left off.
            </p>
            <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-7" })}>
              Sign in
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <BrandLogo variant="mark" className="h-6" />
            <span>Inventory, purchasing and dispatch, on one ledger.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/docs" className="font-medium text-brand-700 hover:text-brand-900">
              Manual & Documentation
            </Link>
            <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <p>© {new Date().getFullYear()} Margix India</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
