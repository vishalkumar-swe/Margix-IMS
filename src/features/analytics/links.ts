import type { AnalyticsExportSection, AnalyticsTab, Period, PeriodPreset } from "@/lib/analytics";
import { toQueryString } from "@/lib/search-params";

/** The current analytics view, as carried in the URL. */
export interface AnalyticsView {
  tab: AnalyticsTab;
  preset: PeriodPreset;
  period: Period;
  categoryId?: string;
  skuId?: string;
  customerId?: string;
  supplierId?: string;
}

function filterParams(view: AnalyticsView) {
  return {
    preset: view.preset,
    ...(view.preset === "custom" ? view.period : {}),
    categoryId: view.categoryId,
    skuId: view.skuId,
    customerId: view.customerId,
    supplierId: view.supplierId,
  };
}

/** Same filters, another tab. */
export function tabHref(view: AnalyticsView, tab: AnalyticsTab): string {
  return `/analytics${toQueryString({ tab, ...filterParams(view) })}`;
}

/** CSV download of one section with the current filters. */
export function exportHref(view: AnalyticsView, section: AnalyticsExportSection): string {
  return `/api/v1/analytics/export${toQueryString({ section, ...filterParams(view) })}`;
}
