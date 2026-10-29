import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Clock,
  ArrowRight,
  Layers,
  Sparkles,
  Barcode,
  Truck,
  ReceiptIndianRupee,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Users,
} from "lucide-react";
import { MASTER_MANUAL_INDEX, MANUAL_CHAPTERS } from "@/lib/manual-content";
import { DocMarkdown } from "@/features/docs/doc-markdown";

export const metadata: Metadata = {
  title: "Enterprise Operational Manual & Engineering Handbook — Margix IMS",
  description:
    "Comprehensive end-to-end handbook for Margix IMS. Covers universal barcode scanning, Indian GST compliance, warehouse logistics, Tally Prime ERP, and implementation runbooks.",
};

const STATS = [
  { label: "Operational Chapters", value: "12", sub: "End-to-End Runbooks" },
  { label: "Barcode Symbologies", value: "15", sub: "EAN, UPC, GS1, GTIN, Code-39" },
  { label: "Tax Compliance", value: "100%", sub: "CGST / SGST / IGST Rules" },
  { label: "Tally Prime ERP", value: "Bidirectional", sub: "XML over HTTP Sync" },
];

const ROLE_GUIDES = [
  {
    role: "Warehouse Operations & Dispatch",
    icon: Truck,
    badge: "Operations",
    description: "Inbound PO receipt, direct GRNs, QC inspection, physical stock transfers, and dispatch verification station.",
    chapters: ["02", "03", "04", "05"],
  },
  {
    role: "Finance, Tax & Audit",
    icon: ReceiptIndianRupee,
    badge: "Finance & Accounts",
    description: "Statutory Rule 46 invoices, integer paise math, state code POS mapping, credit notes, and GSTR reporting.",
    chapters: ["04", "06", "07", "08"],
  },
  {
    role: "Catalog & Master Data",
    icon: Barcode,
    badge: "Master Data",
    description: "SKU definitions, multi-UOM conversion factors, HSN tariff library, GS1 prefix lookup, and CSV cutover.",
    chapters: ["01", "02", "05"],
  },
  {
    role: "Implementation & IT Admins",
    icon: ShieldCheck,
    badge: "Deployment & IT",
    description: "System architecture, role-based access control, tamper-proof audit trails, and the 7-day Go-Live checklist.",
    chapters: ["00", "08", "10", "11"],
  },
];

export default function DocsIndexPage() {
  return (
    <article className="max-w-[860px] mx-auto space-y-10">
      {/* Hero Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/50 p-6 sm:p-10 shadow-xs">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200/60 px-3.5 py-1 text-xs font-bold text-brand-700">
          <Sparkles className="size-3.5 text-brand-600" />
          Production Release Operational Manual v1.0
        </div>

        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
          Margix IMS — Enterprise Handbook
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          A genuine, verified, end-to-end operational handbook covering all warehouse, inventory,
          statutory GST, Tally ERP integration, and universal barcode scanning capabilities.
          Written for business owners, operations managers, implementation teams, and auditors.
        </p>

        {/* Stats Grid */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
              <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{s.value}</p>
              <p className="text-xs font-bold text-slate-700 mt-0.5">{s.label}</p>
              <p className="text-[11px] text-slate-400 truncate">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Role-Based Quick Start Guide */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="size-5 text-brand-600" />
          <h2 className="text-lg font-bold text-slate-900">Role-Based Reading Paths</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {ROLE_GUIDES.map((rg) => {
            const Icon = rg.icon;
            return (
              <div
                key={rg.role}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      <Icon className="size-3.5 text-brand-600" />
                      {rg.badge}
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-slate-900">{rg.role}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{rg.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-400">Chapters:</span>
                    {rg.chapters.map((chNum) => {
                      const ch = MANUAL_CHAPTERS.find((c) => c.number === chNum);
                      if (!ch) return null;
                      return (
                        <Link
                          key={chNum}
                          href={`/docs/${ch.slug}`}
                          className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-700 hover:bg-brand-100 transition-colors"
                        >
                          {chNum}
                        </Link>
                      );
                    })}
                  </div>
                  <span className="text-xs font-semibold text-brand-600 flex items-center gap-0.5">
                    Explore <ChevronRightIcon className="size-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Complete 12 Chapters Grid */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-brand-600" />
            <h2 className="text-lg font-bold text-slate-900">Explore the 12 Operational Chapters</h2>
          </div>
          <span className="text-xs text-slate-400">All modules covered end-to-end</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {MANUAL_CHAPTERS.map((c) => (
            <Link
              key={c.slug}
              href={`/docs/${c.slug}`}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-brand-400 hover:bg-brand-50/20 hover:shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-brand-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow-2xs">
                      {c.number}
                    </span>
                    <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-600">
                      {c.category}
                    </span>
                  </div>

                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="size-3" />
                    {c.readingTime}
                  </span>
                </div>

                <h3 className="mt-3 text-sm font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
                  {c.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 line-clamp-2">
                  {c.summary}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-brand-600 group-hover:text-brand-800">
                <span>Read chapter {c.number}</span>
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Master Manual Overview & Architecture Breakdown */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-10 shadow-xs">
        <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
          <BookOpen className="size-5 text-brand-600" />
          <h2 className="text-xl font-bold text-slate-900">Master Operations Index & Reference</h2>
        </div>

        <DocMarkdown text={MASTER_MANUAL_INDEX} />
      </section>
    </article>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
