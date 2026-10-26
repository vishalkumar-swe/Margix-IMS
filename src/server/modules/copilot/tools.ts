import type { InvoiceStatus, PostedDocStatus, PurchaseOrderStatus, RoleCode } from "@prisma/client";
import { z } from "zod";
import { dateOnlyToUtc, todayIst } from "@/lib/dates";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/server/db/client";
import { ZERO } from "@/server/db/decimal";
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

function toolError(message: string): string {
  return JSON.stringify({ error: message });
}

/** Keeps a tool result inside the prompt budget without losing the JSON shape. */
export function serializeToolResult(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  return text.length > MAX_TOOL_RESULT_LENGTH ? `${text.slice(0, MAX_TOOL_RESULT_LENGTH)}…` : text;
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

async function findProduct(query: string): Promise<ProductRef | null> {
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

async function findGodown(query: string) {
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
      const total = rows.reduce((sum, row) => sum.plus(row.quantity), ZERO);

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

/** Runs one tool call. Every failure becomes data for the model, never a 500. */
export async function executeCopilotTool(
  name: string,
  rawArguments: string,
  context: CopilotToolContext,
): Promise<string> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return toolError(`Unknown tool "${name}".`);
  if (!can(context.role, tool.permission)) return toolError("Your role cannot access that data.");

  let args: unknown;
  try {
    args = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return toolError("Arguments were not valid JSON.");
  }

  try {
    return serializeToolResult(await tool.execute(args, context));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return toolError(error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`).join("; "));
    }
    logger.warn("copilot tool failed", {
      tool: name,
      err: error instanceof Error ? error.message : String(error),
    });
    return toolError("The lookup failed. Answer from general Margix guidance and suggest the relevant screen.");
  }
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
        unit: item.entryUom?.code ?? item.sku.baseUom.code,
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
      number: invoice.invoiceNumber,
      status: invoice.status,
      party: invoice.customer.name,
      date: dateOnly(invoice.invoiceDate),
      lines: invoice.items.map((item) => ({
        product: productLabel(item.sku),
        billed: item.quantity.toString(),
        dispatched: item.dispatchedQty.toString(),
        remaining: item.quantity.minus(item.dispatchedQty).toString(),
        unit: item.entryUom?.code ?? item.sku.baseUom.code,
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
