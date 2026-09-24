import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { AnalyticsFilters } from "@/features/analytics/analytics-filters";
import { AnalyticsTabs } from "@/features/analytics/analytics-tabs";
import { InventorySection } from "@/features/analytics/inventory-section";
import type { AnalyticsView } from "@/features/analytics/links";
import { OverviewSection } from "@/features/analytics/overview-section";
import { PurchasingSection } from "@/features/analytics/purchasing-section";
import { SalesSection } from "@/features/analytics/sales-section";
import { granularityFor, periodDays, PERIOD_PRESET_LABELS, resolvePeriod } from "@/lib/analytics";
import { formatDate, todayIst } from "@/lib/dates";
import { parseSearchParams } from "@/lib/search-params";
import { analyticsQuerySchema } from "@/lib/validation/analytics";
import { requirePagePermission } from "@/server/auth/current-user";
import {
  getAnalyticsOverview,
  getInventoryAnalytics,
  getPurchasingAnalytics,
  getSalesAnalytics,
  type AnalyticsFilters as Filters,
} from "@/server/modules/analytics/analytics.queries";
import { listCategories, listCustomers, listSkuOptions, listSuppliers } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Analytics" };

const GRANULARITY_LABELS = { day: "daily", week: "weekly", month: "monthly" } as const;

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  await requirePagePermission("report.view");
  const query = parseSearchParams(analyticsQuerySchema, await searchParams);
  const { preset, period } = resolvePeriod(query, todayIst());
  const view: AnalyticsView = {
    tab: query.tab,
    preset,
    period,
    categoryId: query.categoryId,
    skuId: query.skuId,
    customerId: query.customerId,
    supplierId: query.supplierId,
  };
  const filters: Filters = { ...view };
  const days = periodDays(period);
  const comparison = `vs previous ${days === 1 ? "day" : `${days} days`}`;

  const [categories, skus, customers, suppliers, section] = await Promise.all([
    listCategories({ activeOnly: true }),
    listSkuOptions(),
    listCustomers({ activeOnly: true }),
    listSuppliers({ activeOnly: true }),
    renderSection(view, filters, comparison),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`${PERIOD_PRESET_LABELS[preset]} · ${formatDate(period.from)} – ${formatDate(period.to)} · ${GRANULARITY_LABELS[granularityFor(period)]} trends · values in ₹, excluding GST unless stated`}
      />
      <AnalyticsTabs view={view} />
      <Card className="mb-6">
        <AnalyticsFilters
          tab={view.tab}
          preset={preset}
          period={period}
          values={view}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          skus={skus.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
          customers={customers.map((c) => ({ value: c.id, label: c.name }))}
          suppliers={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
      </Card>
      {section}
    </>
  );
}

/** Loads and renders only the active tab's figures. */
async function renderSection(view: AnalyticsView, filters: Filters, comparison: string) {
  switch (view.tab) {
    case "inventory":
      return <InventorySection data={await getInventoryAnalytics(filters)} view={view} />;
    case "sales":
      return <SalesSection data={await getSalesAnalytics(filters)} view={view} comparison={comparison} />;
    case "purchasing":
      return <PurchasingSection data={await getPurchasingAnalytics(filters)} view={view} comparison={comparison} />;
    default:
      return <OverviewSection data={await getAnalyticsOverview(filters)} view={view} comparison={comparison} />;
  }
}
