"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { PERIOD_PRESET_LABELS, PERIOD_PRESETS, type AnalyticsTab, type Period, type PeriodPreset } from "@/lib/analytics";

interface Option {
  value: string;
  label: string;
}

/**
 * Period and dimension filters as a plain GET form: the view lives in the URL,
 * so any analytics view can be bookmarked or shared. Custom dates appear only
 * for the "Custom range" preset.
 */
export function AnalyticsFilters({
  tab,
  preset,
  period,
  values,
  categories,
  skus,
  customers,
  suppliers,
}: {
  tab: AnalyticsTab;
  preset: PeriodPreset;
  period: Period;
  values: { categoryId?: string; skuId?: string; customerId?: string; supplierId?: string };
  categories: Option[];
  skus: Option[];
  customers: Option[];
  suppliers: Option[];
}) {
  const [selected, setSelected] = useState<PeriodPreset>(preset);
  const showCustomer = tab === "overview" || tab === "sales";
  const showSupplier = tab === "overview" || tab === "purchasing";

  return (
    <form method="get" action="/analytics" className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
      <input type="hidden" name="tab" value={tab} />
      <Select
        name="preset"
        value={selected}
        onChange={(e) => setSelected(e.target.value as PeriodPreset)}
        aria-label="Period"
        className="w-auto"
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p} value={p}>
            {PERIOD_PRESET_LABELS[p]}
          </option>
        ))}
      </Select>
      {selected === "custom" && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            From
            <Input type="date" name="from" defaultValue={period.from} className="w-40" required />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            To
            <Input type="date" name="to" defaultValue={period.to} className="w-40" required />
          </label>
        </>
      )}
      <FilterSelect name="categoryId" label="All categories" value={values.categoryId} options={categories} />
      <FilterSelect name="skuId" label="All products" value={values.skuId} options={skus} />
      {showCustomer && <FilterSelect name="customerId" label="All customers" value={values.customerId} options={customers} />}
      {showSupplier && <FilterSelect name="supplierId" label="All suppliers" value={values.supplierId} options={suppliers} />}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: Option[] }) {
  return (
    <Select name={name} defaultValue={value ?? ""} aria-label={label} className="w-auto max-w-56">
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
