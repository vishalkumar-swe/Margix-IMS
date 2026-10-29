"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { emitCopilotEvent } from "@/lib/copilot/runtime";
import { HsnPicker } from "./hsn-picker";
import { CameraScanButton } from "@/features/scan/camera-scan-button";
import { PhoneScanButton } from "@/features/scan/phone-scan-button";
import { useBarcodeScanListener } from "@/features/scan/phone-scanner-provider";
import { useBarcodeLookup } from "@/features/scan/use-barcode-lookup";
import { EMPTY_SKU, type SkuFormValues } from "./sku-form-dialog";

export function SkuStandaloneForm({
  categories,
  uoms,
  nextCode,
  initialBarcode,
}: {
  categories: { id: string; name: string }[];
  uoms: { id: string; code: string; name: string }[];
  nextCode?: string;
  initialBarcode?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<SkuFormValues>(() => ({
    ...EMPTY_SKU,
    barcode: initialBarcode ?? "",
  }));
  const [hsnRate, setHsnRate] = useState<string | null>(null);

  const [loadedCategories, setLoadedCategories] = useState<{ id: string; name: string }[]>(categories);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);

  useEffect(() => {
    if (categories?.length) setLoadedCategories(categories);
  }, [categories]);

  const { lookingUp, status: barcodeStatus, lookupBarcode } = useBarcodeLookup({
    onAutoFill: (details) => {
      if (details.suggestedCategoryId && details.suggestedCategoryName) {
        setLoadedCategories((prev) => {
          if (prev.some((c) => c.id === details.suggestedCategoryId)) return prev;
          return [...prev, { id: details.suggestedCategoryId!, name: details.suggestedCategoryName! }];
        });
      }

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
    },
  });

  const handleQuickCreateCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setCreatingCat(true);
    try {
      const created = await apiRequest<{ id: string; name: string }>("/categories", {
        method: "POST",
        body: { name },
      });
      setLoadedCategories((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, categoryId: created.id }));
      setNewCatName("");
      setNewCatOpen(false);
    } catch {
      // Handled
    } finally {
      setCreatingCat(false);
    }
  };

  const initialLookedUpRef = useRef<string>("");
  useEffect(() => {
    if (initialBarcode && initialLookedUpRef.current !== initialBarcode) {
      initialLookedUpRef.current = initialBarcode;
      void lookupBarcode(initialBarcode, false);
    }
  }, [initialBarcode, lookupBarcode]);

  // Listen for ambient mobile phone scans in background while form is active
  useBarcodeScanListener((code) => {
    setForm((prev) => ({ ...prev, barcode: code }));
    void lookupBarcode(code, true);
  }, true);

  const save = useApiMutation((values: SkuFormValues) => {
    return apiRequest<{ id: string; code: string }>("/skus", {
      body: {
        code: values.code,
        name: values.name,
        description: values.description,
        baseUomId: values.baseUomId,
        isBatchTracked: values.isBatchTracked,
        tallyStockItemName: values.tallyStockItemName,
        categoryId: values.categoryId || undefined,
        hsnCode: values.hsnCode || undefined,
        gstRate: values.gstRate || undefined,
        barcode: values.barcode || undefined,
      },
    });
  }, { successMessage: "Product created" });

  const errors = save.fieldErrors;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await save.mutate(form);
    if (result) {
      emitCopilotEvent("sku.created");
      router.push("/purchase-orders/new");
    }
  }

  const set = <K extends keyof SkuFormValues>(key: K, value: SkuFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Code"
              htmlFor="sku-code-input"
              error={errors.code}
              hint={nextCode ? `Leave blank to use ${nextCode}.` : "Leave blank for the next code."}
            >
              <Input
                id="sku-code-input"
                value={form.code}
                data-tour="sku-code"
                placeholder={nextCode}
                onChange={(e) => set("code", e.target.value)}
              />
            </Field>
            <Field label="Name" htmlFor="sku-name-input" error={errors.name} required>
              <Input
                id="sku-name-input"
                data-tour="sku-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field
              label="Category"
              htmlFor="sku-category-select"
              error={errors.categoryId}
              hint={
                <button
                  type="button"
                  onClick={() => setNewCatOpen((v) => !v)}
                  className="text-brand-600 hover:text-brand-700 underline text-xs font-semibold ml-1 inline-flex items-center gap-0.5"
                >
                  <Plus className="size-3 inline" /> {newCatOpen ? "Cancel" : "Add category"}
                </button>
              }
            >
              <div className="space-y-1.5">
                <Select id="sku-category-select" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                  <option value="">None</option>
                  {loadedCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {newCatOpen && (
                  <div className="flex gap-2 pt-1 animate-in fade-in duration-150">
                    <Input
                      value={newCatName}
                      placeholder="New category name"
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleQuickCreateCategory();
                        }
                      }}
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleQuickCreateCategory}
                      loading={creatingCat}
                      disabled={!newCatName.trim()}
                      className="h-8 text-xs shrink-0"
                    >
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </Field>
            <Field label="Unit" htmlFor="base-unit-select" error={errors.baseUomId} required hint="Cannot change once stock has moved.">
              <Select
                id="base-unit-select"
                value={form.baseUomId}
                data-tour="sku-unit"
                onChange={(e) => set("baseUomId", e.target.value)}
              >
                <option value="">Select unit</option>
                {uoms.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} · {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="HSN code" htmlFor="hsn-input" error={errors.hsnCode} hint="Suggested from the name, description and category.">
              <HsnPicker
                id="hsn-input"
                dataTour="sku-hsn"
                value={form.hsnCode}
                invalid={Boolean(errors.hsnCode)}
                product={{ name: form.name, description: form.description, categoryId: form.categoryId }}
                onChange={(choice) => {
                  if ("gstRate" in choice) {
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
              htmlFor="gst-rate-select"
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
                id="gst-rate-select"
                inputMode="decimal"
                value={form.gstRate}
                onChange={(e) => set("gstRate", e.target.value)}
              />
            </Field>
            <Field
              label="Barcode"
              htmlFor="sku-barcode-input"
              error={errors.barcode}
              hint="Scan or type a barcode to auto-detect product details. Leave blank to generate an internal EAN-13."
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <Input
                    id="sku-barcode-input"
                    value={form.barcode}
                    autoComplete="off"
                    placeholder="Scan or type barcode"
                    onChange={(e) => {
                      const val = e.target.value;
                      set("barcode", val);
                      if (val.trim().length >= 8) {
                        lookupBarcode(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (form.barcode) {
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
                      lookupBarcode(code, true);
                    }}
                  />
                  <PhoneScanButton
                    title="Connect mobile phone as scanner"
                    onScan={(code) => {
                      setForm((prev) => ({ ...prev, barcode: code }));
                      lookupBarcode(code, true);
                    }}
                  />
                </div>
                {barcodeStatus && (
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
            <Field label="Tally stock item name" htmlFor="sku-tally-input" error={errors.tallyStockItemName} hint="Required for Tally sync.">
              <Input id="sku-tally-input" value={form.tallyStockItemName} onChange={(e) => set("tallyStockItemName", e.target.value)} />
            </Field>
            <Field label="Description" htmlFor="sku-description-input" error={errors.description} className="md:col-span-2">
              <Textarea id="sku-description-input" value={form.description} onChange={(e) => set("description", e.target.value)} />
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
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="secondary" onClick={() => router.push("/masters/skus")}>
              Cancel
            </Button>
            <Button
              id="create-sku-submit-btn"
              type="submit"
              loading={save.pending}
              data-tour="create-sku"
            >
              Create SKU
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export default SkuStandaloneForm;
