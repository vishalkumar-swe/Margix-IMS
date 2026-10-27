import type { InvoiceStatus, PostedDocStatus, PurchaseOrderStatus, RoleCode } from "@prisma/client";
import { z } from "zod";
import { dateOnlyToUtc, todayIst } from "@/lib/dates";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/server/db/client";
import { Decimal, ZERO } from "@/server/db/decimal";
import { getInvoiceDetail, listInvoices } from "@/server/modules/invoices/invoice.queries";
import { getDispatchDetail, listDispatches } from "@/server/modules/dispatch/dispatch.queries";
import { getPurchaseOrderDetail, listPurchaseOrders } from "@/server/modules/purchasing/purchasing.queries";
import { logger } from "@/server/observability/logger";
import { getWorkspaceCounts } from "./copilot.queries";
import { retrieveKnowledge } from "./knowledge";

/**
 * Read-only tools the Copilot model may call. They deliberately cannot write:
 * the model explains a document or points at the screen, and the human still
 * performs the action through the ordinary UI with RBAC enforced server-side.
 */

export interface CopilotToolContext {
  role: RoleCode;
  route: string;
}

export interface OpenAiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface CopilotTool {
  name: string;
  description: string;
  permission: Permission;
  parameters: Record<string, unknown>;
  execute: (args: unknown, context: CopilotToolContext) => Promise<unknown>;
}

const MAX_TOOL_RESULT_LENGTH = 6000;
const MAX_ROWS = 10;

const limitField = z.coerce.number().int().min(1).max(MAX_ROWS).default(5);

const productArgs = z
  .object({
    query: z.string().trim().min(1, "Give a product code, name or barcode.").max(120),
    limit: limitField,
  })
  .strict();

const stockArgs = z
  .object({
    product: z.string().trim().min(1, "Give a product code, name or barcode.").max(120),
    godown: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const documentArgs = z
  .object({
    type: z.enum(["purchase_order", "invoice", "dispatch"]),
    query: z.string().trim().max(120).optional(),
    status: z.string().trim().max(40).optional(),
    limit: limitField,
  })
  .strict();

const documentStatusArgs = z
  .object({
    type: z.enum(["purchase_order", "invoice", "dispatch"]),
    number: z.string().trim().min(1, "Give the document number, e.g. PO-2026-0001.").max(60),
  })
  .strict();

const alertsArgs = z
  .object({
    limit: limitField,
  })
  .strict();

const fefoPickArgs = z
  .object({
    product: z.string().trim().min(1, "Give a product code, name or barcode.").max(120),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    godown: z.string().trim().max(80).optional(),
  })
  .strict();

const expiringBatchesArgs = z
  .object({
    days: z.coerce.number().int().min(1).max(365).default(60),
    godown: z.string().trim().max(80).optional(),
    limit: limitField,
  })
  .strict();

const godownsArgs = z
  .object({
    limit: limitField,
  })
  .strict();

const ledgerArgs = z
  .object({
    product: z.string().trim().max(120).optional(),
    godown: z.string().trim().max(80).optional(),
    referenceNo: z.string().trim().max(80).optional(),
    limit: limitField,
  })
  .strict();

const dispatchReadinessArgs = z
  .object({
    invoiceNumber: z.string().trim().min(1, "Give an invoice number, e.g. INV-2026-0001.").max(60),
  })
  .strict();

const reorderArgs = z
  .object({
    limit: limitField,
  })
  .strict();

const helpArgs = z
  .object({
    question: z.string().trim().min(3).max(300),
  })
  .strict();

const PO_STATUSES = ["DRAFT", "OPEN", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "SHORT_CLOSED", "CANCELLED"] as const;
const INVOICE_STATUSES = ["OPEN", "PARTIALLY_DISPATCHED", "COMPLETE", "CANCELLED"] as const;
const DISPATCH_STATUSES = ["POSTED", "PARTIALLY_REVERSED", "REVERSED"] as const;

type DocumentType = z.infer<typeof documentArgs>["type"];

interface ProductRef {
  id: string;
  code: string;
  name: string;
  baseUom: { code: string };
}

/** Keeps a tool result inside the prompt budget without emitting invalid JSON. */
export function serializeToolResult(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  if (text.length <= MAX_TOOL_RESULT_LENGTH) return text;
  return JSON.stringify({
    truncated: true,
    note: "Result too large for the prompt. Narrow the query or ask for a specific document/product.",
    preview: text.slice(0, MAX_TOOL_RESULT_LENGTH),
  });
}

function productLabel(product: { code: string; name: string }): string {
  return `${product.code} — ${product.name}`;
}

function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isExpired(expiryDate: Date | null): boolean {
  return expiryDate !== null && expiryDate.getTime() < dateOnlyToUtc(todayIst()).getTime();
}

function typePermission(type: DocumentType): Permission {
  if (type === "purchase_order") return "po.view";
  if (type === "invoice") return "invoice.view";
  return "dispatch.view";
}

function productSearchWhere(query: string) {
  return {
    status: "ACTIVE" as const,
    OR: [
      { code: { contains: query, mode: "insensitive" as const } },
      { name: { contains: query, mode: "insensitive" as const } },
      { barcode: { equals: query } },
    ],
  };
}

export async function findProduct(query: string): Promise<ProductRef | null> {
  const select = {
    id: true,
    code: true,
    name: true,
    baseUom: { select: { code: true } },
  };
  const exact = await prisma.sku.findFirst({
    where: {
      OR: [
        { code: { equals: query, mode: "insensitive" } },
        { barcode: { equals: query } },
      ],
    },
    select,
  });
  if (exact) return exact;
  return prisma.sku.findFirst({ where: productSearchWhere(query), orderBy: { code: "asc" }, select });
}

export async function findGodown(query: string) {
  const select = { id: true, code: true, name: true };
  const exact = await prisma.godown.findFirst({
    where: { OR: [{ code: { equals: query, mode: "insensitive" } }, { name: { equals: query, mode: "insensitive" } }] },
    select,
  });
  if (exact) return exact;
  return prisma.godown.findFirst({
    where: { OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] },
    orderBy: { code: "asc" },
    select,
  });
}

function parseStatus<T extends string>(
  values: readonly T[],
  status: string | undefined,
): T | undefined | { error: string } {
  if (!status) return undefined;
  const normalized = status.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((values as readonly string[]).includes(normalized)) return normalized as T;
  return { error: `Unknown status "${status}". Use one of: ${values.join(", ")}.` };
}

const TOOLS: CopilotTool[] = [
  {
    name: "get_workspace_summary",
    description:
      "Live totals for active products, stock lines, godowns, open purchase orders, invoices awaiting dispatch, dispatches, active low-stock alerts and pending Tally jobs. Use for count, status and overview questions.",
    permission: "dashboard.view",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      const counts = await getWorkspaceCounts();
      return { counts };
    },
  },
  {
    name: "search_products",
    description:
      "Find active products (SKUs) by code, name or barcode. Returns the product code, name, base unit, HSN, GST rate and whether batches are tracked. Use before referring to a product the user named loosely.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product code, name or barcode, e.g. BASMATI or SKU-001." },
        limit: { type: "integer", minimum: 1, maximum: MAX_ROWS, default: 5, description: "Maximum products to return." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async execute(args) {
      const { query, limit } = productArgs.parse(args);
      const products = await prisma.sku.findMany({
        where: productSearchWhere(query),
        orderBy: { code: "asc" },
        take: limit,
        select: {
          id: true,
          code: true,
          name: true,
          barcode: true,
          hsnCode: true,
          gstRate: true,
          isBatchTracked: true,
          baseUom: { select: { code: true } },
        },
      });
      return {
        count: products.length,
        products: products.map((product) => ({
          id: product.id,
          code: product.code,
          name: product.name,
          barcode: product.barcode,
          hsnCode: product.hsnCode,
          gstRate: product.gstRate?.toString() ?? null,
          baseUnit: product.baseUom.code,
          batchTracked: product.isBatchTracked,
        })),
      };
    },
  },
  {
    name: "check_stock",
    description:
      "On-hand stock for one product, broken down by godown and batch in FEFO order. Use before saying whether an order or dispatch can be fulfilled. Returns zero rows when the product has no stock.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "Product code, name or barcode." },
        godown: { type: "string", description: "Optional godown code or name; omit for all godowns." },
      },
      required: ["product"],
      additionalProperties: false,
    },
    async execute(args) {
      const { product: productQuery, godown: godownQuery } = stockArgs.parse(args);
      const product = await findProduct(productQuery);
      if (!product) return { error: `No product matched "${productQuery}".` };

      const godown = godownQuery ? await findGodown(godownQuery) : null;
      if (godownQuery && !godown) return { error: `No godown matched "${godownQuery}".` };

      const rows = await prisma.stockBalance.findMany({
        where: { skuId: product.id, godownId: godown?.id, quantity: { gt: 0 } },
        orderBy: [{ godown: { code: "asc" } }, { batch: { expiryDate: { sort: "asc", nulls: "last" } } }],
        take: 40,
        select: {
          quantity: true,
          updatedAt: true,
          godown: { select: { code: true, name: true } },
          batch: { select: { batchNumber: true, expiryDate: true } },
        },
      });
      const totalRow = await prisma.stockBalance.aggregate({
        where: { skuId: product.id, godownId: godown?.id, quantity: { gt: 0 } },
        _sum: { quantity: true },
      });
      const total = totalRow._sum.quantity ?? ZERO;

      return {
        product: { code: product.code, name: product.name, baseUnit: product.baseUom.code },
        godown: godown ? { code: godown.code, name: godown.name } : "all godowns",
        totalQuantity: total.toString(),
        batches: rows.map((row) => ({
          godown: row.godown.code,
          batch: row.batch.batchNumber,
          expiryDate: dateOnly(row.batch.expiryDate),
          expired: isExpired(row.batch.expiryDate),
          quantity: row.quantity.toString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
        note: rows.length === 0 ? "No stock on hand for this product in the selected scope." : undefined,
      };
    },
  },
  {
    name: "list_documents",
    description:
      "List purchase orders, invoices or dispatches, optionally filtered by a search term and status. Use to find a document the user is asking about or to show what is open.",
    permission: "dashboard.view",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["purchase_order", "invoice", "dispatch"], description: "Document family." },
        query: { type: "string", description: "Optional document number, party name or reference." },
        status: {
          type: "string",
          description: `Optional status. Purchase orders: ${PO_STATUSES.join(", ")}. Invoices: ${INVOICE_STATUSES.join(", ")}. Dispatches: ${DISPATCH_STATUSES.join(", ")}.`,
        },
        limit: { type: "integer", minimum: 1, maximum: MAX_ROWS, default: 5, description: "Maximum documents to return." },
      },
      required: ["type"],
      additionalProperties: false,
    },
    async execute(args, context) {
      const { type, query, status, limit } = documentArgs.parse(args);
      if (!can(context.role, typePermission(type))) return { error: "Your role cannot access those documents." };
      if (type === "purchase_order") {
        const parsed = parseStatus(PO_STATUSES, status);
        if (parsed && typeof parsed === "object") return parsed;
        const { items, total } = await listPurchaseOrders({
          page: 1,
          pageSize: limit,
          q: query,
          status: parsed as PurchaseOrderStatus | undefined,
        });
        return {
          type,
          total,
          documents: items.map((item) => ({
            id: item.id,
            number: item.poNumber,
            status: item.status,
            party: item.supplier.name,
            date: dateOnly(item.orderDate),
            expectedDate: dateOnly(item.expectedDate),
            lines: item._count.items,
            receipts: item._count.grns,
          })),
        };
      }

      if (type === "invoice") {
        const parsed = parseStatus(INVOICE_STATUSES, status);
        if (parsed && typeof parsed === "object") return parsed;
        const { items, total } = await listInvoices({
          page: 1,
          pageSize: limit,
          q: query,
          status: parsed as InvoiceStatus | undefined,
        });
        return {
          type,
          total,
          documents: items.map((item) => ({
            id: item.id,
            number: item.invoiceNumber,
            status: item.status,
            party: item.customer.name,
            date: dateOnly(item.invoiceDate),
            lines: item._count.items,
            dispatches: item._count.outwards,
          })),
        };
      }

      const parsed = parseStatus(DISPATCH_STATUSES, status);
      if (parsed && typeof parsed === "object") return parsed;
      const { items, total } = await listDispatches({
        page: 1,
        pageSize: limit,
        q: query,
        status: parsed as PostedDocStatus | undefined,
      });
      return {
        type,
        total,
        documents: items.map((item) => ({
          id: item.id,
          number: item.outwardNumber,
          status: item.status,
          party: item.customer?.name ?? null,
          godown: item.godown.code,
          date: dateOnly(item.dispatchedAt),
          reference: item.referenceNo,
          lines: item._count.items,
        })),
      };
    },
  },
  {
    name: "get_document_status",
    description:
      "Full status of one purchase order, invoice or dispatch by its number, including ordered vs received or billed vs dispatched quantities. Use when the user asks why a document is stuck, partial or complete.",
    permission: "dashboard.view",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["purchase_order", "invoice", "dispatch"], description: "Document family." },
        number: { type: "string", description: "Document number, e.g. PO-2026-0001, INV-2026-0001 or DC-2026-0001." },
      },
      required: ["type", "number"],
      additionalProperties: false,
    },
    async execute(args, context) {
      const { type, number } = documentStatusArgs.parse(args);
      if (!can(context.role, typePermission(type))) return { error: "Your role cannot access that document." };
      return documentStatus(type, number);
    },
  },
  {
    name: "get_low_stock_alerts",
    description:
      "Active low-stock alerts with the product, godown, current quantity and reorder threshold. Use for stockout, reorder and replenishment questions.",
    permission: "alert.view",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: MAX_ROWS, default: 5, description: "Maximum alerts to return." },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const { limit } = alertsArgs.parse(args);
      const alerts = await prisma.stockAlert.findMany({
        where: { status: "ACTIVE", alertType: "LOW_STOCK" },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          currentQty: true,
          thresholdQty: true,
          updatedAt: true,
          sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
          godown: { select: { code: true, name: true } },
        },
      });
      return {
        count: alerts.length,
        alerts: alerts.map((alert) => ({
          product: productLabel(alert.sku),
          baseUnit: alert.sku.baseUom.code,
          godown: alert.godown.code,
          currentQuantity: alert.currentQty.toString(),
          reorderLevel: alert.thresholdQty.toString(),
          updatedAt: alert.updatedAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "search_help",
    description:
      "Search the Margix operational knowledge base for rules and how-to explanations: SKU codes, units, GST, ledger, batches, FEFO, Tally sync, returns, adjustments and error codes. Use for policy or 'why' questions.",
    permission: "dashboard.view",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The user's question or the rule being looked up." },
      },
      required: ["question"],
      additionalProperties: false,
    },
    async execute(args, context) {
      const { question } = helpArgs.parse(args);
      const entries = retrieveKnowledge(question, context.route, 3);
      return {
        articles: entries.map((entry) => ({ title: entry.title, body: entry.body })),
        note: entries.length === 0 ? "No exact article. Explain the ledger-first model and point to the closest screen." : undefined,
      };
    },
  },
  {
    name: "get_fefo_pick_list",
    description:
      "Calculate optimal FEFO (First-Expiry-First-Out) batch picking for fulfilling a required product quantity. Prioritizes earliest expiring batches, skips expired batches, and reports exact batch numbers, available quantities, and pick quantities.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "Product code, name or barcode." },
        quantity: { type: "number", description: "Target quantity to allocate/pick." },
        godown: { type: "string", description: "Optional godown code or name; omit for all godowns." },
      },
      required: ["product", "quantity"],
      additionalProperties: false,
    },
    async execute(args) {
      const { product: productQuery, quantity, godown: godownQuery } = fefoPickArgs.parse(args);
      const product = await findProduct(productQuery);
      if (!product) return { error: `No product matched "${productQuery}".` };

      const godown = godownQuery ? await findGodown(godownQuery) : null;
      if (godownQuery && !godown) return { error: `No godown matched "${godownQuery}".` };

      const now = dateOnlyToUtc(todayIst());
      const allRows = await prisma.stockBalance.findMany({
        where: {
          skuId: product.id,
          godownId: godown?.id,
          quantity: { gt: 0 },
          OR: [{ batch: { expiryDate: null } }, { batch: { expiryDate: { gte: now } } }],
        },
        orderBy: [{ batch: { expiryDate: { sort: "asc", nulls: "last" } } }, { quantity: "desc" }],
        take: 200,
        select: {
          quantity: true,
          godown: { select: { id: true, code: true, name: true } },
          batch: { select: { batchNumber: true, expiryDate: true } },
        },
      });

      // A dispatch is posted from one godown. When no godown is named, choose
      // the earliest-expiring godown that can cover the whole request, or the
      // largest one so the shortfall is measured against a real pick face.
      const groups = new Map<
        string,
        { code: string; name: string; quantity: Decimal; rows: typeof allRows }
      >();
      for (const row of allRows) {
        const group = groups.get(row.godown.id) ?? {
          code: row.godown.code,
          name: row.godown.name,
          quantity: ZERO,
          rows: [],
        };
        group.quantity = group.quantity.plus(row.quantity);
        group.rows.push(row);
        groups.set(row.godown.id, group);
      }
      const requested = new Decimal(quantity);
      const orderedGroups = [...groups.values()].sort((a, b) => {
        if (a.quantity.gte(requested) !== b.quantity.gte(requested)) {
          return a.quantity.gte(requested) ? -1 : 1;
        }
        if (a.quantity.gte(requested)) {
          const aExpiry = a.rows[0]?.batch.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bExpiry = b.rows[0]?.batch.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return aExpiry - bExpiry;
        }
        return b.quantity.comparedTo(a.quantity);
      });
      const selected = orderedGroups[0];
      const rows = (selected?.rows ?? []).slice(0, 30);
      const warehouseTotal = allRows.reduce((sum, row) => sum.plus(row.quantity), ZERO);

      let needed = new Decimal(quantity);
      const allocations: Array<{
        batch: string;
        expiryDate: string | null;
        godown: string;
        availableQty: string;
        pickQty: string;
        remainingInBatch: string;
      }> = [];

      for (const row of rows) {
        if (needed.lte(0)) break;
        const avail = row.quantity;
        const pick = Decimal.min(avail, needed);
        needed = needed.minus(pick);
        allocations.push({
          batch: row.batch.batchNumber,
          expiryDate: dateOnly(row.batch.expiryDate),
          godown: row.godown.code,
          availableQty: avail.toString(),
          pickQty: pick.toString(),
          remainingInBatch: avail.minus(pick).toString(),
        });
      }

      const totalAllocated = new Decimal(quantity).minus(needed);
      const isFulfilled = needed.lte(0);

      return {
        product: { code: product.code, name: product.name, unit: product.baseUom.code },
        godown: selected ? `${selected.code} — ${selected.name}` : null,
        godownAvailableQty: selected?.quantity.toString() ?? "0",
        warehouseAvailableQty: warehouseTotal.toString(),
        requestedQty: quantity.toString(),
        allocatedQty: totalAllocated.toString(),
        shortfallQty: needed.toString(),
        status: isFulfilled ? "FULLY_ALLOCATED" : "INSUFFICIENT_STOCK",
        pickList: allocations,
        recommendation: isFulfilled
          ? `Pick ${totalAllocated.toString()} ${product.baseUom.code} from godown ${selected?.code} across ${allocations.length} FEFO batch(es). Earliest expiring batch picked first.`
          : groups.size > 1
            ? `No single godown covers ${quantity} ${product.baseUom.code}. The best godown (${selected?.code}) has ${selected?.quantity.toString()}; transfer or inward stock before dispatching.`
            : `Shortfall of ${needed.toString()} ${product.baseUom.code}. Only ${totalAllocated.toString()} available in unexpired batches.`,
      };
    },
  },
  {
    name: "check_expiring_batches",
    description:
      "Find batches expiring within a specified number of days (e.g. 30, 60, 90) or already expired. Returns product details, godown, batch number, remaining quantity, and days until expiry.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, default: 60, description: "Days ahead to look for expiry." },
        godown: { type: "string", description: "Optional godown code or name." },
        limit: { type: "integer", minimum: 1, maximum: MAX_ROWS, default: 5, description: "Max batches to return." },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const { days, godown: godownQuery, limit } = expiringBatchesArgs.parse(args);
      const godown = godownQuery ? await findGodown(godownQuery) : null;
      if (godownQuery && !godown) return { error: `No godown matched "${godownQuery}".` };

      const now = dateOnlyToUtc(todayIst());
      const cutoff = new Date(now.getTime() + days * 86400000);

      const rows = await prisma.stockBalance.findMany({
        where: {
          godownId: godown?.id,
          quantity: { gt: 0 },
          batch: {
            expiryDate: {
              not: null,
              lte: cutoff,
            },
          },
        },
        orderBy: { batch: { expiryDate: "asc" } },
        take: limit,
        select: {
          quantity: true,
          sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
          godown: { select: { code: true, name: true } },
          batch: { select: { batchNumber: true, expiryDate: true } },
        },
      });

      return {
        count: rows.length,
        timeframeDays: days,
        batches: rows.map((r) => {
          const exp = r.batch.expiryDate ? r.batch.expiryDate.getTime() : 0;
          const daysLeft = Math.ceil((exp - now.getTime()) / 86400000);
          return {
            product: productLabel(r.sku),
            godown: r.godown.code,
            batch: r.batch.batchNumber,
            expiryDate: dateOnly(r.batch.expiryDate),
            quantity: r.quantity.toString(),
            unit: r.sku.baseUom.code,
            daysLeft,
            status: daysLeft < 0 ? "EXPIRED" : daysLeft === 0 ? "EXPIRES_TODAY" : daysLeft <= 30 ? "CRITICAL_NEAR_EXPIRY" : "APPROACHING_EXPIRY",
          };
        }),
      };
    },
  },
  {
    name: "get_godowns",
    description:
      "List all active warehouse godowns with state, address, and count of active stock lines.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: MAX_ROWS, default: 5, description: "Max godowns to return." },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const { limit } = godownsArgs.parse(args);
      const godowns = await prisma.godown.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
        take: limit,
        select: {
          id: true,
          code: true,
          name: true,
          address: true,
          tallySyncEnabled: true,
          _count: { select: { stockBalances: { where: { quantity: { gt: 0 } } } } },
        },
      });

      return {
        count: godowns.length,
        godowns: godowns.map((g) => ({
          id: g.id,
          code: g.code,
          name: g.name,
          address: g.address,
          tallySyncEnabled: g.tallySyncEnabled,
          activeStockLines: g._count.stockBalances,
        })),
      };
    },
  },
  {
    name: "get_recent_ledger_movements",
    description:
      "Query recent signed double-entry inventory ledger movements. Shows chronological entry numbers (LE-######), movement types (INWARD, OUTWARD, ADJUSTMENT), signed quantities, balances after, and reference document numbers.",
    permission: "ledger.view",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "Optional product code or name to filter movements." },
        godown: { type: "string", description: "Optional godown code or name." },
        referenceNo: { type: "string", description: "Optional reference number (e.g. PO number, GRN number, Outward number)." },
        limit: { type: "integer", minimum: 1, maximum: MAX_ROWS, default: 5, description: "Max movements to return." },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const { product: productQuery, godown: godownQuery, referenceNo, limit } = ledgerArgs.parse(args);
      const sku = productQuery ? await findProduct(productQuery) : null;
      if (productQuery && !sku) return { error: `No product matched "${productQuery}".` };

      const godown = godownQuery ? await findGodown(godownQuery) : null;
      if (godownQuery && !godown) return { error: `No godown matched "${godownQuery}".` };

      const entries = await prisma.inventoryLedger.findMany({
        where: {
          skuId: sku?.id,
          godownId: godown?.id,
          referenceNo: referenceNo ? { contains: referenceNo, mode: "insensitive" } : undefined,
        },
        orderBy: { entryNo: "desc" },
        take: limit,
        select: {
          entryNo: true,
          movementType: true,
          quantity: true,
          balanceAfter: true,
          referenceType: true,
          referenceNo: true,
          remarks: true,
          createdAt: true,
          sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
          godown: { select: { code: true } },
          batch: { select: { batchNumber: true } },
        },
      });

      return {
        count: entries.length,
        movements: entries.map((e) => ({
          entryNo: `LE-${e.entryNo.toString().padStart(6, "0")}`,
          movementType: e.movementType,
          quantity: e.quantity.toString(),
          balanceAfter: e.balanceAfter.toString(),
          product: productLabel(e.sku),
          godown: e.godown.code,
          batch: e.batch.batchNumber,
          reference: `${e.referenceType}: ${e.referenceNo}`,
          remarks: e.remarks,
          timestamp: e.createdAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "check_dispatch_readiness",
    description:
      "Inspect an invoice to determine if warehouse unexpired stock is sufficient to dispatch all remaining quantities. Evaluates each line item against live FEFO stock.",
    permission: "dispatch.view",
    parameters: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string", description: "Invoice number to verify readiness for, e.g. INV-2026-0001." },
      },
      required: ["invoiceNumber"],
      additionalProperties: false,
    },
    async execute(args) {
      const { invoiceNumber } = dispatchReadinessArgs.parse(args);
      const invoice = await prisma.invoice.findFirst({
        where: { invoiceNumber: { equals: invoiceNumber, mode: "insensitive" } },
        select: { id: true },
      });
      if (!invoice) return { error: `No invoice found with number "${invoiceNumber}".` };

      const detail = await getInvoiceDetail(invoice.id);
      if (!detail) return { error: `No invoice found with number "${invoiceNumber}".` };

      const now = dateOnlyToUtc(todayIst());
      const lineChecks = [];
      let hasRemaining = false;

      // Lines share stock when the same SKU appears twice, so compare total
      // required quantity per SKU. A dispatch is posted from one godown, so a
      // SKU is only ready if a single godown can cover all its lines.
      const requiredBySku = new Map<string, Decimal>();
      for (const item of detail.items) {
        const remaining = item.quantity.minus(item.dispatchedQty);
        if (remaining.lte(0)) continue;
        requiredBySku.set(item.skuId, (requiredBySku.get(item.skuId) ?? ZERO).plus(remaining));
      }

      const stockBySku = new Map<
        string,
        Map<string, { quantity: Decimal; code: string; name: string }>
      >();
      for (const [skuId] of requiredBySku) {
        const stockRows = await prisma.stockBalance.findMany({
          where: {
            skuId,
            quantity: { gt: 0 },
            OR: [{ batch: { expiryDate: null } }, { batch: { expiryDate: { gte: now } } }],
          },
          select: {
            quantity: true,
            godown: { select: { id: true, code: true, name: true } },
          },
        });
        const byGodown = new Map<string, { quantity: Decimal; code: string; name: string }>();
        for (const row of stockRows) {
          const entry = byGodown.get(row.godown.id) ?? {
            quantity: ZERO,
            code: row.godown.code,
            name: row.godown.name,
          };
          entry.quantity = entry.quantity.plus(row.quantity);
          byGodown.set(row.godown.id, entry);
        }
        stockBySku.set(skuId, byGodown);
      }

      // Intersect godowns that can cover every required SKU.
      let eligibleGodowns: Map<string, { code: string; name: string }> | null = null;
      for (const [skuId, required] of requiredBySku) {
        const byGodown = stockBySku.get(skuId) ?? new Map();
        const eligible = new Map(
          [...byGodown.entries()]
            .filter(([, entry]) => entry.quantity.gte(required))
            .map(([id, entry]) => [id, { code: entry.code, name: entry.name }]),
        );
        if (eligibleGodowns === null) {
          eligibleGodowns = eligible;
        } else {
          for (const id of [...eligibleGodowns.keys()]) {
            if (!eligible.has(id)) eligibleGodowns.delete(id);
          }
        }
      }
      const recommendedGodown = eligibleGodowns?.values().next().value ?? null;

      for (const item of detail.items) {
        const remaining = item.quantity.minus(item.dispatchedQty);
        if (remaining.lte(0)) {
          lineChecks.push({
            product: productLabel(item.sku),
            billed: item.quantity.toString(),
            dispatched: item.dispatchedQty.toString(),
            remaining: "0",
            availableUnexpiredStock: "0",
            unit: item.sku.baseUom.code,
            status: "ALREADY_DISPATCHED",
          });
          continue;
        }

        hasRemaining = true;
        const byGodown = stockBySku.get(item.skuId) ?? new Map();
        const totalRequired = requiredBySku.get(item.skuId) ?? remaining;
        let bestGodownQty = ZERO;
        for (const entry of byGodown.values()) {
          if (entry.quantity.gt(bestGodownQty)) bestGodownQty = entry.quantity;
        }
        const canFulfill = bestGodownQty.gte(totalRequired);

        lineChecks.push({
          product: productLabel(item.sku),
          billed: item.quantity.toString(),
          dispatched: item.dispatchedQty.toString(),
          remaining: remaining.toString(),
          availableUnexpiredStock: bestGodownQty.toString(),
          unit: item.sku.baseUom.code,
          canFulfill,
          status: canFulfill ? "READY" : "SHORTAGE",
        });
      }

      const cancelled = detail.status === "CANCELLED";
      const canDispatch = (eligibleGodowns?.size ?? 0) > 0;
      const overallReadiness = cancelled
        ? "CANCELLED"
        : !hasRemaining
          ? "FULLY_DISPATCHED"
          : canDispatch
            ? "READY_TO_DISPATCH"
            : "STOCK_SHORTAGE";

      return {
        invoiceId: detail.id,
        invoiceNumber: detail.invoiceNumber,
        customer: detail.customer.name,
        invoiceStatus: detail.status,
        overallReadiness,
        recommendedGodown: recommendedGodown
          ? `${recommendedGodown.code} — ${recommendedGodown.name}`
          : null,
        lines: lineChecks,
        recommendedAction: cancelled
          ? `Invoice ${detail.invoiceNumber} is cancelled. Do not dispatch against it.`
          : !hasRemaining
            ? `Invoice ${detail.invoiceNumber} is already fully dispatched. There is nothing left to pick.`
            : canDispatch && recommendedGodown
              ? `Proceed to create dispatch outward for invoice ${detail.invoiceNumber} from godown ${recommendedGodown.code}. Unexpired stock covers every line.`
              : `No single godown currently covers all remaining lines. Transfer or inward stock before dispatching.`,
      };
    },
  },
  {
    name: "get_reorder_recommendations",
    description:
      "Find inventory items at or below reorder threshold levels across godowns, providing reorder recommendations and active alert statuses.",
    permission: "alert.view",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: MAX_ROWS, default: 5, description: "Max recommendations to return." },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const { limit } = reorderArgs.parse(args);
      const alerts = await prisma.stockAlert.findMany({
        where: { status: "ACTIVE", alertType: "LOW_STOCK" },
        take: limit,
        orderBy: { currentQty: "asc" },
        select: {
          currentQty: true,
          thresholdQty: true,
          sku: {
            select: {
              code: true,
              name: true,
              baseUom: { select: { code: true } },
            },
          },
          godown: { select: { code: true, name: true } },
        },
      });

      return {
        count: alerts.length,
        recommendations: alerts.map((a) => {
          const deficit = a.thresholdQty.minus(a.currentQty);
          return {
            product: productLabel(a.sku),
            godown: a.godown.code,
            currentStock: a.currentQty.toString(),
            reorderLevel: a.thresholdQty.toString(),
            recommendedMinimumOrder: (deficit.gt(0) ? deficit : a.thresholdQty).toString(),
            unit: a.sku.baseUom.code,
          };
        }),
      };
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function copilotToolsForRole(role: RoleCode): OpenAiTool[] {
  return TOOLS.filter((tool) => can(role, tool.permission)).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Runs one tool call and returns its raw result. Failures become `{ error }`
 * data, never a 500. Internal callers use this so long results are not cut by
 * the prompt-size serialiser.
 */
export async function executeCopilotToolData(
  name: string,
  rawArguments: string,
  context: CopilotToolContext,
): Promise<unknown> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { error: `Unknown tool "${name}".` };
  if (!can(context.role, tool.permission)) return { error: "Your role cannot access that data." };

  let args: unknown;
  try {
    args = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return { error: "Arguments were not valid JSON." };
  }

  try {
    return await tool.execute(args, context);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: error.issues
          .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
          .join("; "),
      };
    }
    logger.warn("copilot tool failed", {
      tool: name,
      err: error instanceof Error ? error.message : String(error),
    });
    return { error: "The lookup failed. Answer from general Margix guidance and suggest the relevant screen." };
  }
}

/** Runs one tool call and serialises the result for the model. */
export async function executeCopilotTool(
  name: string,
  rawArguments: string,
  context: CopilotToolContext,
): Promise<string> {
  return serializeToolResult(await executeCopilotToolData(name, rawArguments, context));
}

async function documentStatus(type: DocumentType, number: string): Promise<unknown> {
  if (type === "purchase_order") {
    const found = await prisma.purchaseOrder.findFirst({
      where: { poNumber: { equals: number, mode: "insensitive" } },
      select: { id: true },
    });
    if (!found) return { error: `No purchase order found with number "${number}".` };
    const order = await getPurchaseOrderDetail(found.id);
    if (!order) return { error: `No purchase order found with number "${number}".` };
    return {
      type,
      id: order.id,
      number: order.poNumber,
      status: order.status,
      party: order.supplier.name,
      date: dateOnly(order.orderDate),
      expectedDate: dateOnly(order.expectedDate),
      lines: order.items.map((item) => ({
        product: productLabel(item.sku),
        ordered: item.orderedQty.toString(),
        received: item.receivedQty.toString(),
        pending: item.orderedQty.minus(item.receivedQty).toString(),
        unit: item.sku.baseUom.code,
      })),
      receipts: order.grns.map((grn) => ({
        number: grn.grnNumber,
        date: grn.receivedAt.toISOString(),
        godown: grn.godown.code,
        status: grn.status,
      })),
    };
  }

  if (type === "invoice") {
    const found = await prisma.invoice.findFirst({
      where: { invoiceNumber: { equals: number, mode: "insensitive" } },
      select: { id: true },
    });
    if (!found) return { error: `No invoice found with number "${number}".` };
    const invoice = await getInvoiceDetail(found.id);
    if (!invoice) return { error: `No invoice found with number "${number}".` };
    return {
      type,
      id: invoice.id,
      number: invoice.invoiceNumber,
      status: invoice.status,
      party: invoice.customer.name,
      date: dateOnly(invoice.invoiceDate),
      lines: invoice.items.map((item) => ({
        product: productLabel(item.sku),
        billed: item.quantity.toString(),
        dispatched: item.dispatchedQty.toString(),
        remaining: item.quantity.minus(item.dispatchedQty).toString(),
        unit: item.sku.baseUom.code,
      })),
      dispatches: invoice.outwards.map((dispatch) => ({
        number: dispatch.outwardNumber,
        date: dispatch.dispatchedAt.toISOString(),
        godown: dispatch.godown.code,
        status: dispatch.status,
      })),
    };
  }

  const found = await prisma.outward.findFirst({
    where: { outwardNumber: { equals: number, mode: "insensitive" } },
    select: { id: true },
  });
  if (!found) return { error: `No dispatch found with number "${number}".` };
  const dispatch = await getDispatchDetail(found.id);
  if (!dispatch) return { error: `No dispatch found with number "${number}".` };
  return {
    type,
    id: dispatch.id,
    number: dispatch.outwardNumber,
    status: dispatch.status,
    party: dispatch.customer?.name ?? null,
    godown: dispatch.godown.code,
    invoice: dispatch.invoice?.invoiceNumber ?? null,
    date: dispatch.dispatchedAt.toISOString(),
    lines: dispatch.items.map((item) => ({
      product: productLabel(item.sku),
      batch: item.batch.batchNumber,
      expiryDate: dateOnly(item.batch.expiryDate),
      quantity: item.quantity.toString(),
      baseUnit: item.sku.baseUom.code,
    })),
  };
}
