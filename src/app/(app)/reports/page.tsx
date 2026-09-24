import { CalendarDays, ChartColumn, Hourglass, PackageX, ScrollText, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { todayIst } from "@/lib/dates";
import { requirePagePermission } from "@/server/auth/current-user";
import { getEnv } from "@/server/config/env";

export const metadata: Metadata = { title: "Reports" };

interface ReportLink {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export default async function ReportsPage() {
  await requirePagePermission("report.view");
  const env = getEnv();
  const today = todayIst();

  const reports: ReportLink[] = [
    {
      href: "/reports/stock-summary",
      title: "Stock summary",
      description: "Opening, inward, outward, adjustments and closing per SKU and godown for any period.",
      icon: ChartColumn,
    },
    {
      href: `/reports/stock-summary?from=${today}&to=${today}`,
      title: "Daily inventory",
      description: "Today's opening + inward − outward ± adjustments = closing.",
      icon: CalendarDays,
    },
    {
      href: "/reports/movements",
      title: "Movement report",
      description: "Every ledger entry in a period with reference and user.",
      icon: ScrollText,
    },
    {
      href: "/reports/slow-stock",
      title: "Slow stock",
      description: `Stock with no movement for ${env.SLOW_STOCK_DAYS}+ days.`,
      icon: Hourglass,
    },
    {
      href: "/reports/dead-stock",
      title: "Dead stock",
      description: `Stock with no movement for ${env.DEAD_STOCK_DAYS}+ days.`,
      icon: PackageX,
    },
  ];

  return (
    <>
      <PageHeader title="Reports" description="Computed from the inventory ledger. Every report can be downloaded as CSV." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <Link
            key={report.title}
            href={report.href}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300"
          >
            <report.icon className="size-5 text-brand-700" aria-hidden />
            <p className="mt-3 font-medium text-slate-900">{report.title}</p>
            <p className="mt-1 text-sm text-slate-500">{report.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
