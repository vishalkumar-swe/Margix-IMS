import { z } from "zod";
import {
  clearableText,
  codeSchema,
  gstRateSchema,
  idSchema,
  optionalText,
  pageQuerySchema,
  requiredText,
} from "./common";

export const SKU_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export const skuListQuerySchema = pageQuerySchema.extend({ status: z.enum(SKU_STATUSES).optional() });

export const activeOnlyQuerySchema = z.object({ activeOnly: z.stringbool().default(false) });

export const batchListQuerySchema = z.object({ skuId: idSchema });

/** Empty string clears an optional reference/number on update. */
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable().optional());

// ---- SKU ----

export const skuCreateSchema = z.object({
  code: codeSchema,
  name: requiredText(200, "Name"),
  description: optionalText(1000),
  categoryId: idSchema.optional(),
  baseUomId: idSchema,
  hsnCode: optionalText(20),
  gstRate: gstRateSchema.optional(),
  isBatchTracked: z.boolean().default(true),
  tallyStockItemName: optionalText(200),
});

export const skuUpdateSchema = z.object({
  name: requiredText(200, "Name").optional(),
  description: clearableText(1000),
  categoryId: clearable(idSchema),
  baseUomId: idSchema.optional(),
  hsnCode: clearableText(20),
  gstRate: clearable(gstRateSchema),
  isBatchTracked: z.boolean().optional(),
  tallyStockItemName: clearableText(200),
  status: z.enum(SKU_STATUSES).optional(),
});

// ---- Godown ----

export const godownCreateSchema = z.object({
  code: codeSchema,
  name: requiredText(200, "Name"),
  address: optionalText(500),
  tallySyncEnabled: z.boolean().default(true),
  tallyGodownName: optionalText(200),
});

export const godownUpdateSchema = z.object({
  name: requiredText(200, "Name").optional(),
  address: clearableText(500),
  tallySyncEnabled: z.boolean().optional(),
  tallyGodownName: clearableText(200),
  isActive: z.boolean().optional(),
});

// ---- Suppliers & customers ----

const GSTIN = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/;
const gstinSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(GSTIN, "Enter a valid 15-character GSTIN."));
const emailSchema = z.string().trim().pipe(z.email("Enter a valid email."));

export const partyCreateSchema = z.object({
  code: codeSchema,
  name: requiredText(200, "Name"),
  gstin: z.preprocess((v) => (v === "" ? undefined : v), gstinSchema.optional()),
  email: z.preprocess((v) => (v === "" ? undefined : v), emailSchema.optional()),
  phone: optionalText(20),
  address: optionalText(500),
});

export const partyUpdateSchema = z.object({
  name: requiredText(200, "Name").optional(),
  gstin: clearable(gstinSchema),
  email: clearable(emailSchema),
  phone: clearableText(20),
  address: clearableText(500),
  isActive: z.boolean().optional(),
});

// ---- Categories & units ----

export const categoryCreateSchema = z.object({ name: requiredText(100, "Name") });
export const categoryUpdateSchema = z.object({
  name: requiredText(100, "Name").optional(),
  isActive: z.boolean().optional(),
});

export const uomCreateSchema = z.object({
  code: codeSchema,
  name: requiredText(50, "Name"),
  decimalPlaces: z.number().int().min(0).max(3).default(0),
});

export type SkuCreateInput = z.infer<typeof skuCreateSchema>;
export type SkuUpdateInput = z.infer<typeof skuUpdateSchema>;
export type GodownCreateInput = z.infer<typeof godownCreateSchema>;
export type GodownUpdateInput = z.infer<typeof godownUpdateSchema>;
export type PartyCreateInput = z.infer<typeof partyCreateSchema>;
export type PartyUpdateInput = z.infer<typeof partyUpdateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type UomCreateInput = z.infer<typeof uomCreateSchema>;
