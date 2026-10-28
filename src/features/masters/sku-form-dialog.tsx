"use client";

import { Loader2, Pencil, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { emitCopilotEvent } from "@/lib/copilot/runtime";
import { humanize } from "@/lib/format";
import { SKU_STATUSES } from "@/lib/enums";
import { HsnPicker } from "./hsn-picker";
import { CameraScanButton } from "@/features/scan/camera-scan-button";
import { useBarcodeLookup, type AutoFillCatalogDetails } from "@/features/scan/use-barcode-lookup";

export interface SkuFormValues {
  code: string;
  name: string;
  description: string;
  categoryId: string;
  baseUomId: string;
  hsnCode: string;
  gstRate: string;
  isBatchTracked: boolean;
  tallyStockItemName: string;
  barcode: string;
  status: (typeof SKU_STATUSES)[number];
}

export const EMPTY_SKU: SkuFormValues = {
  code: "",
  name: "",
  description: "",
  categoryId: "",
  baseUomId: "",
  hsnCode: "",
  gstRate: "",
  isBatchTracked: true,
  tallyStockItemName: "",
  barcode: "",
  status: "ACTIVE",
};

/** Create (no `skuId`) or edit an SKU. Code is immutable after creation. */
export function SkuFormDialog({
  skuId,
  initial,
  categories,
  uoms,
  nextCode,
  open: controlledOpen,
  onOpenChange,
  onCreated,
  trigger,
}: {
  skuId?: string;
  /** Code the next new SKU gets when left blank (from the numbering master). */
  nextCode?: string;
  initial: SkuFormValues;
  categories?: { id: string; name: string }[];
  uoms?: { id: string; code: string; name: string }[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (sku: { id: string; code: string; name: string; barcode?: string | null; baseUomId: string; gstRate?: string | null }) => void;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (isControlled) {
      onOpenChange?.(val);
    } else {
      setInternalOpen(val);
    }
  };

  const [loadedCategories, setLoadedCategories] = useState<{ id: string; name: string }[]>(categories ?? []);
  const [loadedUoms, setLoadedUoms] = useState<{ id: string; code: string; name: string }[]>(uoms ?? []);

  useEffect(() => {
    if (categories?.length) setLoadedCategories(categories);
  }, [categories]);

  useEffect(() => {
    if (uoms?.length) setLoadedUoms(uoms);
  }, [uoms]);

  useEffect(() => {
    if (open && (!loadedCategories.length || !loadedUoms.length)) {
      Promise.all([
        !loadedCategories.length ? apiRequest<{ id: string; name: string }[]>("/categories?activeOnly=true") : Promise.resolve(null),
        !loadedUoms.length ? apiRequest<{ id: string; code: string; name: string }[]>("/uoms") : Promise.resolve(null),
      ])
        .then(([cats, units]) => {
          if (cats) setLoadedCategories(cats);
          if (units) setLoadedUoms(units);
        })
        .catch(() => {});
    }
  }, [open, loadedCategories.length, loadedUoms.length]);

  const [form, setForm] = useState(initial);
  const editing = Boolean(skuId);
  /** GST rate of the HSN code last picked, to tell following it from overriding it. */
  const [hsnRate, setHsnRate] = useState<string | null>(null);

  const onAutoFill = useCallback((details: AutoFillCatalogDetails) => {
    setForm((prev) => ({
      ...prev,
      name: details.name || prev.name,
      description: details.description ?? prev.description,
      categoryId: details.suggestedCategoryId ?? prev.categoryId,
      baseUomId: details.suggestedBaseUomId ?? prev.baseUomId,
      hsnCode: details.suggestedHsnCode ?? prev.hsnCode,
      gstRate: details.suggestedGstRate ?? prev.gstRate,
    }));
    if (details.suggestedGstRate) {
      setHsnRate(details.suggestedGstRate);
    }
  }, []);

  const { lookingUp, status: barcodeStatus, lookupBarcode } = useBarcodeLookup({
    onAutoFill,
  });

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setForm(initial);
      if (initial.barcode && !editing) {
        lookupBarcode(initial.barcode, true);
      }
    }
    prevOpenRef.current = open;
  }, [open, initial, editing, lookupBarcode]);

  const save = useApiMutation((values: SkuFormValues) => {
    const { code, status, ...common } = values;
    return editing
      ? apiRequest(`/skus/${skuId}`, { method: "PATCH", body: { ...common, status } })
      : apiRequest<{ id: string; code: string; name: string; barcode?: string | null; baseUomId: string; gstRate?: string | null }>("/skus", {
          body: {
            ...common,
            code,
            categoryId: common.categoryId || undefined,
            hsnCode: common.hsnCode || undefined,
            gstRate: common.gstRate || undefined,
            barcode: common.barcode || undefined,
          },
        });
  }, { successMessage: editing ? "Product updated" : "Product created" });
  const errors = save.fieldErrors;
  const generate = useApiMutation(() =>
    apiRequest<{ barcode: string }>(`/skus/${skuId}/barcode`, { body: { replace: true } }),
  );

  function openDialog() {
    setForm(initial);
    setHsnRate(null);
    save.reset();
    generate.reset();
    setOpen(true);
    if (initial.barcode && !editing) {
      lookupBarcode(initial.barcode, true);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await save.mutate(form);
    if (result) {
      setOpen(false);
      router.refresh();
      if (!editing) {
        emitCopilotEvent("sku.created");
        onCreated?.(result as { id: string; code: string; name: string; barcode?: string | null; baseUomId: string; gstRate?: string | null });
      }
    }
  }

  const set = <K extends keyof SkuFormValues>(key: K, value: SkuFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const id = (field: string) => `${skuId ?? "new"}-sku-${field}`;

  return (
    <>
      {trigger ? (
        trigger
      ) : editing ? (
        <Button variant="ghost" size="sm" onClick={openDialog}>
          <Pencil aria-hidden /> Edit
        </Button>
      ) : (
        <Button onClick={openDialog} data-tour="new-sku">
          <Plus aria-hidden /> New SKU
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${initial.code}` : "New SKU"} className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Code"
              htmlFor={id("code")}
              error={errors.code}
              hint={editing ? undefined : nextCode ? `Leave blank to use ${nextCode}.` : "Leave blank for the next code."}
            >
              <Input
                id={editing ? id("code") : "sku-code-input"}
                value={form.code}
                disabled={editing}
                data-tour={editing ? undefined : "sku-code"}
                placeholder={editing ? undefined : nextCode}
                onChange={(e) => set("code", e.target.value)}
              />
            </Field>
            <Field label="Name" htmlFor={id("name")} error={errors.name} required>
              <Input
                id={editing ? id("name") : "sku-name-input"}
                data-tour={editing ? undefined : "sku-name"}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Category" htmlFor={id("category")} error={errors.categoryId}>
              <Select id={id("category")} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">None</option>
                {loadedCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit" htmlFor={id("uom")} error={errors.baseUomId} required hint="Cannot change once stock has moved.">
              <Select
                id={editing ? id("uom") : "base-unit-select"}
                value={form.baseUomId}
                data-tour={editing ? undefined : "sku-unit"}
                onChange={(e) => set("baseUomId", e.target.value)}
              >
                <option value="">Select unit</option>
                {loadedUoms.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} · {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="HSN code" htmlFor={id("hsn")} error={errors.hsnCode} hint="Suggested from the name, description and category.">
              <HsnPicker
                id={editing ? id("hsn") : "hsn-input"}
                dataTour={editing ? undefined : "sku-hsn"}
                value={form.hsnCode}
                invalid={Boolean(errors.hsnCode)}
                product={{ name: form.name, description: form.description, categoryId: form.categoryId }}
                onChange={(choice) => {
                  if ("gstRate" in choice) {
                    // Picking a code applies its rate; the rate can still be overridden below.
                    setForm((prev) => ({ ...prev, hsnCode: choice.code, gstRate: choice.gstRate }));
                    setHsnRate(choice.gstRate);
                  } else {
                    setForm((prev) => ({ ...prev, hsnCode: choice.code }));
                    setHsnRate(null);
                  }
                }}
              />
            </Field>
            <Field
              label="GST %"
              htmlFor={id("gst")}
              error={errors.gstRate}
              hint={
                hsnRate === null
                  ? "Filled in from the HSN code."
                  : Number(form.gstRate) === Number(hsnRate)
                    ? `From HSN ${form.hsnCode}.`
                    : `Overrides the HSN rate of ${hsnRate}%.`
              }
            >
              <Input
                id={editing ? id("gst") : "gst-rate-select"}
                inputMode="decimal"
                value={form.gstRate}
                onChange={(e) => set("gstRate", e.target.value)}
              />
            </Field>
            <Field
              label="Barcode"
              htmlFor={id("barcode")}
              error={errors.barcode ?? generate.error?.message}
              hint={
                editing
                  ? "EAN-13 or any Code 128 value. Generate replaces it with a new internal EAN-13."
                  : "Scan or type a barcode to auto-detect product details. Leave blank to generate an internal EAN-13."
              }
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <Input
                    id={id("barcode")}
                    value={form.barcode}
                    autoComplete="off"
                    placeholder="Scan or type barcode"
                    onChange={(e) => {
                      const val = e.target.value;
                      set("barcode", val);
                      if (val.trim().length >= 8 && !editing) {
                        lookupBarcode(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (form.barcode && !editing) {
                          lookupBarcode(form.barcode, true);
                        }
                      }
                    }}
                    aria-invalid={Boolean(errors.barcode)}
                  />
                  <CameraScanButton
                    title="Scan barcode with camera"
                    onScan={(code) => {
                      setForm((prev) => ({ ...prev, barcode: code }));
                      if (!editing) {
                        lookupBarcode(code, true);
                      }
                    }}
                  />
                  {editing && (
                    <Button
                      variant="secondary"
                      loading={generate.pending}
                      onClick={async () => {
                        const sku = await generate.mutate(undefined);
                        if (sku) {
                          set("barcode", sku.barcode);
                          router.refresh();
                        }
                      }}
                    >
                      {!generate.pending && <Sparkles aria-hidden />} Generate
                    </Button>
                  )}
                </div>
                {barcodeStatus && !editing && (
                  <div
                    className={cn("text-xs flex flex-wrap items-center gap-1.5 font-medium", {
                      "text-emerald-700": barcodeStatus.tone === "success",
                      "text-amber-700": barcodeStatus.tone === "warning",
                      "text-blue-700": barcodeStatus.tone === "info",
                      "text-red-600": barcodeStatus.tone === "error",
                    })}
                  >
                    {lookingUp && <Loader2 className="size-3 animate-spin inline shrink-0" />}
                    {!lookingUp && barcodeStatus.tone === "success" && <Sparkles className="size-3 text-emerald-600 inline shrink-0" />}
                    <span>{barcodeStatus.text}</span>
                    {barcodeStatus.existingSkuId && (
                      <a
                        href={`/masters/products/${barcodeStatus.existingSkuId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold ml-1 text-amber-800 hover:text-amber-900 inline-flex items-center gap-0.5"
                      >
                        View SKU {barcodeStatus.existingSkuCode} →
                      </a>
                    )}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Tally stock item name" htmlFor={id("tally")} error={errors.tallyStockItemName} hint="Required for Tally sync.">
              <Input id={id("tally")} value={form.tallyStockItemName} onChange={(e) => set("tallyStockItemName", e.target.value)} />
            </Field>
            {editing && (
              <Field label="Status" htmlFor={id("status")} error={errors.status}>
                <Select id={id("status")} value={form.status} onChange={(e) => set("status", e.target.value as SkuFormValues["status"])}>
                  {SKU_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Description" htmlFor={id("description")} error={errors.description} className="md:col-span-2">
              <Textarea id={id("description")} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
              <input
                type="checkbox"
                checked={form.isBatchTracked}
                onChange={(e) => set("isBatchTracked", e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Track stock by batch / lot (expiry, manufacturing date)
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              id={editing ? undefined : "create-sku-submit-btn"}
              type="submit"
              loading={save.pending}
              data-tour={editing ? undefined : "create-sku"}
            >
              {editing ? "Save changes" : "Create SKU"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
