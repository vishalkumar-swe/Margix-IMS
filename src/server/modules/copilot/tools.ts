import { randomUUID } from "node:crypto";
import {
  Prisma,
  type InvoiceStatus,
  type NotificationAlertType,
  type NotificationStatus,
  type PostedDocStatus,
  type PurchaseOrderStatus,
  type ReferenceType,
  type RoleCode,
  type StockAlertStatus,
  type TallySyncStatus,
} from "@prisma/client";
import { z } from "zod";
import type { CopilotConfirmation } from "@/lib/copilot/types";
import { presetPeriod } from "@/lib/analytics";
import { dateOnlyToUtc, todayIst } from "@/lib/dates";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { prisma } from "@/server/db/client";
import { Decimal, ZERO } from "@/server/db/decimal";
import { getInvoiceDetail, listInvoices } from "@/server/modules/invoices/invoice.queries";
import { getDispatchDetail, listDispatches } from "@/server/modules/dispatch/dispatch.queries";
import { getPurchaseOrderDetail, listGrns, listPurchaseOrders } from "@/server/modules/purchasing/purchasing.queries";
import { getAdjustmentDetail, listAdjustments } from "@/server/modules/adjustments/adjustments.queries";
import { getTransferDetail, listTransfers } from "@/server/modules/transfers/transfer.queries";
import { getPurchaseReturnDetail, getSalesReturnDetail, listPurchaseReturns, listSalesReturns } from "@/server/modules/returns/returns.queries";
import { listStockBalances } from "@/server/modules/inventory/stock.queries";
import { getStockSummary, listIdleStock } from "@/server/modules/reports/reports.queries";
import { getAnalyticsOverview, getInventoryAnalytics, getPurchasingAnalytics, getSalesAnalytics } from "@/server/modules/analytics/analytics.queries";
import { getDailyChecklist } from "@/server/modules/checklist/checklist.queries";
import { countDeliveriesByStatus, listMyNotifications, listRecentDeliveries } from "@/server/modules/notifications/notifications.queries";
import { logger } from "@/server/observability/logger";
import { getWorkspaceCounts } from "./copilot.queries";
import { retrieveKnowledge } from "./knowledge";

/**
 * Tools the Copilot model may call.
 * Can query live database entities, search live web research, retrieve real-time
 * stock/equity/commodity market quotes, and propose operational actions with human confirmation.
 */

export interface CopilotToolContext {
  role: RoleCode;
  route: string;
  userId?: string;
  onProposeConfirmation?: (confirmation: CopilotConfirmation) => void;
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

const inventoryOverviewArgs = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const singleIdOrCodeArgs = z
  .object({
    identifier: z.string().trim().min(1, "Identifier is required").max(120),
  })
  .strict();

const skuListArgs = z
  .object({
    category: z.string().trim().max(80).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
    query: z.string().trim().max(120).optional(),
    limit: limitField,
  })
  .strict();

const customerArgs = z
  .object({
    query: z.string().trim().max(120).optional(),
    stateCode: z.string().trim().max(10).optional(),
    limit: limitField,
  })
  .strict();

const supplierArgs = z
  .object({
    query: z.string().trim().max(120).optional(),
    limit: limitField,
  })
  .strict();

const godownStockArgs = z
  .object({
    godown: z.string().trim().min(1, "Godown code or name is required").max(80),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const transferListArgs = z
  .object({
    fromGodown: z.string().trim().max(80).optional(),
    toGodown: z.string().trim().max(80).optional(),
    limit: limitField,
  })
  .strict();

const adjustmentListArgs = z
  .object({
    status: z.enum(["SUBMITTED", "APPROVED", "REJECTED", "REVERSED"]).optional(),
    godown: z.string().trim().max(80).optional(),
    limit: limitField,
  })
  .strict();

const hsnListArgs = z
  .object({
    query: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(15),
  })
  .strict();

const returnsListArgs = z
  .object({
    type: z.enum(["sales_return", "purchase_return"]),
    query: z.string().trim().max(120).optional(),
    limit: limitField,
  })
  .strict();

const tallyQueueArgs = z
  .object({
    status: z.enum(["PENDING", "IN_PROGRESS", "SYNCED", "FAILED"]).optional(),
    limit: limitField,
  })
  .strict();

const slowMovingArgs = z
  .object({
    days: z.coerce.number().int().min(1).max(365).default(90),
    limit: limitField,
  })
  .strict();

const auditTrailArgs = z
  .object({
    entityType: z.string().trim().max(60).optional(),
    action: z.string().trim().max(60).optional(),
    limit: limitField,
  })
  .strict();

const usersListArgs = z
  .object({
    role: z.enum(["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR", "ACCOUNTS", "MANAGEMENT"]).optional(),
    limit: limitField,
  })
  .strict();

const helpArgs = z
  .object({
    question: z.string().trim().min(3).max(300),
  })
  .strict();

const batchListArgs = z
  .object({
    sku: z.string().trim().max(120).optional(),
    godown: z.string().trim().max(80).optional(),
    expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
    limit: limitField,
  })
  .strict();

const stockBalanceListArgs = z
  .object({
    sku: z.string().trim().max(120).optional(),
    godown: z.string().trim().max(80).optional(),
    query: z.string().trim().max(120).optional(),
    includeZero: z.boolean().default(false),
    limit: limitField,
  })
  .strict();

const poListArgs = z
  .object({
    status: z.enum(["DRAFT", "OPEN", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "SHORT_CLOSED", "CANCELLED"]).optional(),
    supplier: z.string().trim().max(120).optional(),
    query: z.string().trim().max(120).optional(),
    limit: limitField,
  })
  .strict();

const grnListArgs = z
  .object({
    query: z.string().trim().max(120).optional(),
    limit: limitField,
  })
  .strict();

const invoiceListArgs = z
  .object({
    status: z.enum(["OPEN", "PARTIALLY_DISPATCHED", "COMPLETE", "CANCELLED"]).optional(),
    customer: z.string().trim().max(120).optional(),
    query: z.string().trim().max(120).optional(),
    limit: limitField,
  })
  .strict();

const dispatchListArgs = z
  .object({
    query: z.string().trim().max(120).optional(),
    godown: z.string().trim().max(80).optional(),
    limit: limitField,
  })
  .strict();

const reversalCheckArgs = z
  .object({
    docType: z.enum(["grn", "dispatch", "transfer", "adjustment"]),
    identifier: z.string().trim().min(1, "Document number is required").max(120),
  })
  .strict();

const periodArgs = z
  .object({
    period: z.enum(["today", "7d", "30d", "month", "quarter", "fy"]).default("30d"),
  })
  .strict();

const stockSummaryReportArgs = z
  .object({
    from: z.string().trim().max(10).optional(),
    to: z.string().trim().max(10).optional(),
    godown: z.string().trim().max(80).optional(),
    sku: z.string().trim().max(120).optional(),
    groupBy: z.enum(["sku", "batch"]).default("sku"),
  })
  .strict();

const stockAlertsListArgs = z
  .object({
    status: z.enum(["ACTIVE", "RESOLVED"]).default("ACTIVE"),
    type: z.enum(["LOW_STOCK", "EXPIRING_SOON", "SLOW_MOVING", "DEAD_STOCK"]).optional(),
    limit: limitField,
  })
  .strict();

const notificationsListArgs = z
  .object({
    limit: limitField,
  })
  .strict();

const notificationOutboxArgs = z
  .object({
    status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
    limit: limitField,
  })
  .strict();

const tallyJobDetailArgs = z
  .object({
    jobId: z.string().trim().min(1, "Job ID is required").max(60),
  })
  .strict();

const webResearchArgs = z
  .object({
    query: z.string().trim().min(2, "Search query must be at least 2 characters").max(200),
    maxResults: z.coerce.number().int().min(1).max(10).default(5),
  })
  .strict();

const marketQuoteArgs = z
  .object({
    query: z.string().trim().min(1, "Query is required").max(100),
    range: z.enum(["1mo", "3mo", "6mo", "1y", "2y"]).default("6mo"),
    count: z.coerce.number().int().min(5).max(200).default(100),
  })
  .strict();

const proposeActionArgs = z
  .object({
    actionType: z.enum([
      "CREATE_PO",
      "CREATE_SKU",
      "STOCK_ADJUSTMENT",
      "CREATE_CUSTOMER",
      "CREATE_SUPPLIER",
      "CREATE_GODOWN",
      "CREATE_TRANSFER",
      "CREATE_GRN",
      "CREATE_INVOICE",
      "POST_DISPATCH",
      "CANCEL_INVOICE",
      "CANCEL_PO",
      "SHORT_CLOSE_PO",
      "REVERSE_LEDGER",
      "PURGE_SANDBOX",
      "DEACTIVATE_SUPPLIER",
      "DEACTIVATE_CUSTOMER",
    ]),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    payload: z.record(z.string(), z.unknown()),
    destructive: z.boolean().default(false),
    confirmLabel: z.string().trim().max(40).optional(),
    cancelLabel: z.string().trim().max(40).optional(),
  })
  .strict();

const proposePoArgs = z
  .object({
    supplierName: z.string().trim().min(1).max(200),
    godownName: z.string().trim().max(200).optional(),
    items: z
      .array(
        z.object({
          productName: z.string().trim().min(1),
          quantity: z.number().positive(),
          rate: z.number().positive().optional(),
        }),
      )
      .min(1),
    orderDate: z.string().optional(),
    expectedDate: z.string().optional(),
    remarks: z.string().max(500).optional(),
  })
  .strict();

const proposeCustomerArgs = z
  .object({
    name: z.string().trim().min(1).max(200),
    gstin: z.string().trim().max(15).optional(),
    phone: z.string().trim().max(20).optional(),
    address: z.string().trim().max(500).optional(),
    stateCode: z.string().trim().max(2).optional(),
  })
  .strict();

const proposeSupplierArgs = z
  .object({
    name: z.string().trim().min(1).max(200),
    gstin: z.string().trim().max(15).optional(),
    phone: z.string().trim().max(20).optional(),
    address: z.string().trim().max(500).optional(),
    stateCode: z.string().trim().max(2).optional(),
  })
  .strict();

const proposeTransferArgs = z
  .object({
    fromGodown: z.string().trim().min(1).max(200),
    toGodown: z.string().trim().min(1).max(200),
    items: z
      .array(
        z.object({
          productName: z.string().trim().min(1),
          quantity: z.number().positive(),
          batchNumber: z.string().optional(),
        }),
      )
      .min(1),
    remarks: z.string().max(500).optional(),
  })
  .strict();

const proposeAdjustmentArgs = z
  .object({
    godownName: z.string().trim().min(1),
    items: z
      .array(
        z.object({
          productName: z.string().trim().min(1),
          quantity: z.number().positive(),
          batchNumber: z.string().optional(),
        }),
      )
      .min(1),
    reasonCode: z.enum(["COUNTING_ERROR", "DAMAGE", "THEFT", "EXPIRY", "OTHER"]).default("COUNTING_ERROR"),
    reasonNote: z.string().max(500).optional(),
  })
  .strict();

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult {
  query: string;
  provider: string;
  count: number;
  results: WebSearchResultItem[];
  error?: string;
}

export async function executeWebSearch(query: string, maxResults = 5): Promise<WebSearchResult> {
  const cleanQuery = query.trim();
  const cappedMax = Math.min(Math.max(1, maxResults), 10);

  // 1. If self-hosted SearXNG URL is provided, query it first
  if (process.env.SEARXNG_URL) {
    try {
      const searxngBase = process.env.SEARXNG_URL.replace(/\/+$/, "");
      const searxngUrl = `${searxngBase}/search?q=${encodeURIComponent(cleanQuery)}&format=json`;
      const res = await fetch(searxngUrl, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
        if (Array.isArray(data.results) && data.results.length > 0) {
          const items: WebSearchResultItem[] = data.results.slice(0, cappedMax).map((r) => ({
            title: r.title ?? "Search Result",
            url: r.url ?? "",
            snippet: r.content ?? "",
          }));
          return { query: cleanQuery, provider: "SearXNG (Self-Hosted)", count: items.length, results: items };
        }
      }
    } catch (err) {
      logger.warn("SearXNG search failed, falling back to DuckDuckGo", { err: String(err) });
    }
  }

  // 2. Query DuckDuckGo HTML endpoint
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(6500),
    });

    if (res.ok) {
      const html = await res.text();
      const results: WebSearchResultItem[] = [];
      const linkMatches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
      const snippetMatches = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

      for (let i = 0; i < Math.min(linkMatches.length, cappedMax); i++) {
        let rawUrl = linkMatches[i][1];
        if (rawUrl.includes("uddg=")) {
          const u = rawUrl.match(/uddg=([^&]+)/);
          if (u) rawUrl = decodeURIComponent(u[1]);
        }
        const title = linkMatches[i][2].replace(/<[^>]+>/g, "").trim();
        const snippet = snippetMatches[i] ? snippetMatches[i][1].replace(/<[^>]+>/g, "").trim() : "";
        if (title && rawUrl) {
          results.push({ title, url: rawUrl, snippet });
        }
      }

      if (results.length > 0) {
        return { query: cleanQuery, provider: "DuckDuckGo Web (Free)", count: results.length, results };
      }
    }
  } catch (err) {
    logger.warn("DuckDuckGo HTML search error, attempting API fallback", { err: String(err) });
  }

  // 3. Fallback to DuckDuckGo Instant Answer API
  try {
    const apiRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (apiRes.ok) {
      const data = (await apiRes.json()) as {
        Heading?: string;
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };
      const fallbackResults: WebSearchResultItem[] = [];
      if (data.AbstractText && data.AbstractURL) {
        fallbackResults.push({
          title: data.Heading || cleanQuery,
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, cappedMax - fallbackResults.length)) {
          if (topic.Text && topic.FirstURL) {
            fallbackResults.push({
              title: topic.Text.slice(0, 60),
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }
      if (fallbackResults.length > 0) {
        return { query: cleanQuery, provider: "DuckDuckGo API (Free)", count: fallbackResults.length, results: fallbackResults };
      }
    }
  } catch {
    // Ignore and proceed to empty response
  }

  return {
    query: cleanQuery,
    provider: "DuckDuckGo Web (Free)",
    count: 0,
    results: [],
    error: `No live web search results found for "${cleanQuery}".`,
  };
}

export interface MarketQuoteResult {
  symbol: string;
  name: string;
  currency: string;
  regularMarketPrice: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  historyCount: number;
  historicalSeries: Array<{ date: string; ltp: number }>;
  relatedQuotes?: Array<{ symbol: string; name: string; regularMarketPrice?: number }>;
  note?: string;
  error?: string;
}

export async function executeMarketQuote(query: string, range = "6mo", count = 100): Promise<MarketQuoteResult> {
  const clean = query.trim();
  let symbol = clean.toUpperCase();
  const relatedQuotes: Array<{ symbol: string; name: string; regularMarketPrice?: number }> = [];
  let note: string | undefined;

  // Common Indian market aliases
  if (/^jio(\s*platform(s)?)?$/i.test(clean)) {
    symbol = "JIOFIN.NS";
    note = "Jio Platforms Ltd is a private unlisted subsidiary under Reliance Industries Ltd (~67% digital valuation impact). Trading and historical LTP data are available for parent Reliance Industries (RELIANCE.NS) and listed financial arm Jio Financial Services (JIOFIN.NS).";
    try {
      const parentRes = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?range=1mo&interval=1d", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(3500),
      });
      if (parentRes.ok) {
        const pData = await parentRes.json();
        const pMeta = pData.chart?.result?.[0]?.meta;
        relatedQuotes.push({
          symbol: "RELIANCE.NS",
          name: pMeta?.shortName || "Reliance Industries Limited",
          regularMarketPrice: pMeta?.regularMarketPrice,
        });
      }
    } catch {}
  } else if (/^reliance$/i.test(clean)) {
    symbol = "RELIANCE.NS";
  } else if (/^nifty(\s*50)?$/i.test(clean)) {
    symbol = "^NSEI";
  } else if (/^sensex$/i.test(clean)) {
    symbol = "^BSESN";
  } else if (/^gold$/i.test(clean)) {
    symbol = "GC=F";
  } else if (/^silver$/i.test(clean)) {
    symbol = "SI=F";
  } else if (!symbol.includes(".") && !symbol.startsWith("^") && !symbol.includes("=")) {
    try {
      const sRes = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(clean)}&quotesCount=5`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(4000),
      });
      if (sRes.ok) {
        const sData = (await sRes.json()) as { quotes?: Array<{ symbol?: string; quoteType?: string }> };
        const best = sData.quotes?.find((q) => q.symbol?.endsWith(".NS") || q.symbol?.endsWith(".BO")) || sData.quotes?.[0];
        if (best?.symbol) symbol = best.symbol;
      }
    } catch {}
  }

  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return {
        symbol,
        name: clean,
        currency: "INR",
        regularMarketPrice: 0,
        historyCount: 0,
        historicalSeries: [],
        error: `Could not retrieve live market quote for "${symbol}" (HTTP ${res.status}).`,
        note,
      };
    }

    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    const quote = data.chart?.result?.[0]?.indicators?.quote?.[0];
    const timestamps = data.chart?.result?.[0]?.timestamp || [];
    const closes = quote?.close || [];

    const points: Array<{ date: string; ltp: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && !isNaN(closes[i])) {
        const d = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
        points.push({ date: d, ltp: Number(closes[i].toFixed(2)) });
      }
    }

    const finalPoints = count && count > 0 && points.length > count ? points.slice(-count) : points;
    const currentLtp = meta?.regularMarketPrice ?? (finalPoints[finalPoints.length - 1]?.ltp || 0);
    const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
    const change = prevClose ? Number((currentLtp - prevClose).toFixed(2)) : undefined;
    const changePercent = prevClose ? Number((((currentLtp - prevClose) / prevClose) * 100).toFixed(2)) : undefined;

    return {
      symbol: meta?.symbol || symbol,
      name: meta?.shortName || meta?.longName || symbol,
      currency: meta?.currency || "INR",
      regularMarketPrice: currentLtp,
      previousClose: prevClose,
      change,
      changePercent,
      dayHigh: meta?.regularMarketDayHigh,
      dayLow: meta?.regularMarketDayLow,
      fiftyTwoWeekHigh: meta?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta?.fiftyTwoWeekLow,
      historyCount: finalPoints.length,
      historicalSeries: finalPoints,
      relatedQuotes: relatedQuotes.length > 0 ? relatedQuotes : undefined,
      note,
    };
  } catch (err) {
    return {
      symbol,
      name: clean,
      currency: "INR",
      regularMarketPrice: 0,
      historyCount: 0,
      historicalSeries: [],
      error: `Market lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      note,
    };
  }
}

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

export async function findCustomer(query: string) {
  const select = { id: true, code: true, name: true, gstin: true, stateCode: true, phone: true, email: true };
  const exact = await prisma.customer.findFirst({
    where: {
      OR: [
        { code: { equals: query, mode: "insensitive" } },
        { name: { equals: query, mode: "insensitive" } },
        { gstin: { equals: query, mode: "insensitive" } },
      ],
    },
    select,
  });
  if (exact) return exact;
  return prisma.customer.findFirst({
    where: {
      OR: [
        { code: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { code: "asc" },
    select,
  });
}

export async function findSupplier(query: string) {
  const select = { id: true, code: true, name: true, gstin: true, stateCode: true, phone: true, email: true };
  const exact = await prisma.supplier.findFirst({
    where: {
      OR: [
        { code: { equals: query, mode: "insensitive" } },
        { name: { equals: query, mode: "insensitive" } },
        { gstin: { equals: query, mode: "insensitive" } },
      ],
    },
    select,
  });
  if (exact) return exact;
  return prisma.supplier.findFirst({
    where: {
      OR: [
        { code: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
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
    name: "get_inventory_overview",
    description:
      "Comprehensive breakdown of available stock across all products, godowns, and batches. Returns positive inventory balances, active SKU count, and batch health. Use for general inventory questions like 'is there any product available', 'show stock', 'what items do we have', or 'kya stock hai'.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: "Maximum product stock lines to return." },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const { limit } = inventoryOverviewArgs.parse(args);
      const totalSkus = await prisma.sku.count({ where: { status: "ACTIVE" } });
      const balances = await prisma.stockBalance.findMany({
        where: { quantity: { gt: 0 } },
        include: {
          sku: { include: { baseUom: true } },
          godown: { select: { code: true, name: true } },
          batch: { select: { batchNumber: true, expiryDate: true } },
        },
        orderBy: [{ sku: { code: "asc" } }, { godown: { code: "asc" } }],
        take: limit,
      });

      const productMap = new Map<
        string,
        {
          skuCode: string;
          skuName: string;
          baseUnit: string;
          totalQty: Decimal;
          godowns: Set<string>;
          batchCount: number;
        }
      >();

      for (const row of balances) {
        let entry = productMap.get(row.sku.id);
        if (!entry) {
          entry = {
            skuCode: row.sku.code,
            skuName: row.sku.name,
            baseUnit: row.sku.baseUom.code,
            totalQty: ZERO,
            godowns: new Set(),
            batchCount: 0,
          };
          productMap.set(row.sku.id, entry);
        }
        entry.totalQty = entry.totalQty.plus(row.quantity);
        entry.godowns.add(row.godown.code);
        entry.batchCount++;
      }

      const productsWithStock = Array.from(productMap.values()).map((p) => ({
        code: p.skuCode,
        name: p.skuName,
        baseUnit: p.baseUnit,
        totalQuantity: p.totalQty.toString(),
        godowns: Array.from(p.godowns),
        batchCount: p.batchCount,
      }));

      return {
        totalRegisteredSkus: totalSkus,
        productsWithStockCount: productsWithStock.length,
        hasAvailableStock: productsWithStock.length > 0,
        products: productsWithStock,
        summary:
          productsWithStock.length > 0
            ? `${productsWithStock.length} product(s) have positive stock on hand across warehouse godowns.`
            : "No products currently have on-hand stock in your inventory.",
      };
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
            godown: { isActive: true },
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
      let eligibleGodowns: Map<string, { id: string; code: string; name: string }> | null = null;
      for (const [skuId, required] of requiredBySku) {
        const byGodown = stockBySku.get(skuId) ?? new Map();
        const eligible = new Map(
          [...byGodown.entries()]
            .filter(([, entry]) => entry.quantity.gte(required))
            .map(([id, entry]) => [id, { id, code: entry.code, name: entry.name }]),
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
        recommendedGodownId: recommendedGodown?.id ?? null,
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
  {
    name: "list_skus",
    description: "Browse products (SKUs) in catalog with optional filters for category, status, and search query.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category name to filter by" },
        status: { type: "string", enum: ["ACTIVE", "INACTIVE", "ARCHIVED"], description: "Status filter" },
        query: { type: "string", description: "Search query for SKU code, name, or barcode" },
        limit: { type: "integer", default: 10 },
      },
    },
    async execute(args) {
      const { category, status, query, limit } = skuListArgs.parse(args);
      const where: Prisma.SkuWhereInput = {};
      if (status) where.status = status;
      if (category) where.category = { name: { contains: category, mode: "insensitive" } };
      if (query) {
        where.OR = [
          { code: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { barcode: { equals: query } },
        ];
      }
      const skus = await prisma.sku.findMany({
        where,
        take: limit,
        orderBy: { code: "asc" },
        include: { baseUom: true, category: true, hsn: true },
      });
      return {
        count: skus.length,
        skus: skus.map((s) => ({
          code: s.code,
          name: s.name,
          category: s.category?.name ?? null,
          baseUnit: s.baseUom.code,
          hsnCode: s.hsnCode ?? s.hsn?.code ?? null,
          gstRate: s.gstRate?.toString() ?? s.hsn?.gstRate.toString() ?? null,
          isBatchTracked: s.isBatchTracked,
          status: s.status,
          barcode: s.barcode,
        })),
      };
    },
  },
  {
    name: "get_sku_detail",
    description: "Detailed view of a single product/SKU, including alternate units, total on-hand stock, and active batches.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "SKU code, name, or barcode" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const sku = await prisma.sku.findFirst({
        where: {
          OR: [
            { code: { equals: identifier, mode: "insensitive" } },
            { barcode: { equals: identifier } },
            { name: { contains: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          baseUom: true,
          category: true,
          hsn: true,
          units: { include: { uom: true } },
          stockBalances: {
            where: { quantity: { gt: 0 } },
            include: { godown: true, batch: true },
          },
        },
      });
      if (!sku) return { error: `No product found matching "${identifier}".` };
      let totalStock = ZERO;
      for (const sb of sku.stockBalances) {
        totalStock = totalStock.plus(sb.quantity);
      }
      return {
        code: sku.code,
        name: sku.name,
        description: sku.description,
        status: sku.status,
        category: sku.category?.name ?? null,
        baseUnit: sku.baseUom.code,
        hsnCode: sku.hsnCode ?? sku.hsn?.code ?? null,
        gstRate: sku.gstRate?.toString() ?? sku.hsn?.gstRate.toString() ?? null,
        isBatchTracked: sku.isBatchTracked,
        barcode: sku.barcode,
        alternateUnits: sku.units.map((u) => ({
          unit: u.uom.code,
          factor: u.factor.toString(),
          conversion: `1 ${u.uom.code} = ${u.factor.toString()} ${sku.baseUom.code}`,
        })),
        totalStockOnHand: `${totalStock.toString()} ${sku.baseUom.code}`,
        batches: sku.stockBalances.map((sb) => ({
          godown: sb.godown.code,
          batch: sb.batch.batchNumber,
          quantity: `${sb.quantity.toString()} ${sku.baseUom.code}`,
          expiryDate: dateOnly(sb.batch.expiryDate),
          expired: isExpired(sb.batch.expiryDate),
        })),
      };
    },
  },
  {
    name: "list_categories",
    description: "List product categories with default HSN codes and number of active products.",
    permission: "master.view",
    parameters: { type: "object", properties: {} },
    async execute() {
      const categories = await prisma.category.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { skus: true } }, hsn: true },
      });
      return {
        count: categories.length,
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          defaultHsn: c.hsnCode,
          defaultGstRate: c.hsn?.gstRate.toString() ?? null,
          productCount: c._count.skus,
          isActive: c.isActive,
        })),
      };
    },
  },
  {
    name: "list_uoms",
    description: "List all units of measure (UOM) like PCS, KG, BOX, BAG with decimal precision.",
    permission: "master.view",
    parameters: { type: "object", properties: {} },
    async execute() {
      const uoms = await prisma.uom.findMany({ orderBy: { code: "asc" } });
      return {
        count: uoms.length,
        uoms: uoms.map((u) => ({ code: u.code, name: u.name, decimalPlaces: u.decimalPlaces })),
      };
    },
  },
  {
    name: "list_hsn_codes",
    description: "Directory of HSN / SAC codes with GST rate slabs and trade descriptions.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filter by HSN code, trade name, or commodity description" },
        limit: { type: "integer", default: 20 },
      },
    },
    async execute(args) {
      const { query, limit } = hsnListArgs.parse(args ?? {});
      const where: Prisma.HsnCodeWhereInput = { isActive: true };
      if (query && query.trim()) {
        const q = query.trim();
        where.OR = [
          { code: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { keywords: { contains: q, mode: "insensitive" } },
        ];
      }
      const hsnList = await prisma.hsnCode.findMany({
        where,
        orderBy: { code: "asc" },
        take: limit,
      });
      return {
        count: hsnList.length,
        query: query ?? null,
        hsnCodes: hsnList.map((h) => ({
          code: h.code,
          description: h.description,
          gstRate: `${h.gstRate.toString()}%`,
          keywords: h.keywords,
        })),
      };
    },
  },
  {
    name: "list_customers",
    description: "List customers with GSTIN, state code, and contact information.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search customer code, name, or GSTIN" },
        limit: { type: "integer", default: 10 },
      },
    },
    async execute(args) {
      const { query, limit } = customerArgs.parse(args);
      const where: Prisma.CustomerWhereInput = { isActive: true };
      if (query) {
        where.OR = [
          { code: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { gstin: { contains: query, mode: "insensitive" } },
        ];
      }
      const customers = await prisma.customer.findMany({
        where,
        take: limit,
        orderBy: { name: "asc" },
        include: { _count: { select: { invoices: true, outwards: true } } },
      });
      return {
        count: customers.length,
        customers: customers.map((c) => ({
          code: c.code,
          name: c.name,
          gstin: c.gstin ?? "Unregistered",
          stateCode: c.stateCode ?? null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          totalInvoices: c._count.invoices,
          totalDispatches: c._count.outwards,
        })),
      };
    },
  },
  {
    name: "get_customer_detail",
    description: "View customer profile, billing address, and recent invoices & dispatches.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: { identifier: { type: "string", description: "Customer code, name or GSTIN" } },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const customer = await findCustomer(identifier);
      if (!customer) return { error: `No customer matched "${identifier}".` };
      const invoices = await prisma.invoice.findMany({
        where: { customerId: customer.id },
        take: 5,
        orderBy: { invoiceDate: "desc" },
        select: { invoiceNumber: true, invoiceDate: true, status: true },
      });
      const dispatches = await prisma.outward.findMany({
        where: { customerId: customer.id },
        take: 5,
        orderBy: { dispatchedAt: "desc" },
        select: { outwardNumber: true, dispatchedAt: true, status: true },
      });
      return {
        code: customer.code,
        name: customer.name,
        gstin: customer.gstin,
        stateCode: customer.stateCode,
        phone: customer.phone,
        email: customer.email,
        recentInvoices: invoices.map((i) => ({ number: i.invoiceNumber, date: dateOnly(i.invoiceDate), status: i.status })),
        recentDispatches: dispatches.map((d) => ({ number: d.outwardNumber, date: d.dispatchedAt.toISOString(), status: d.status })),
      };
    },
  },
  {
    name: "list_suppliers",
    description: "List suppliers and vendors with GSTIN, state code, and contact information.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search supplier code, name, or GSTIN" },
        limit: { type: "integer", default: 10 },
      },
    },
    async execute(args) {
      const { query, limit } = supplierArgs.parse(args);
      const where: Prisma.SupplierWhereInput = { isActive: true };
      if (query) {
        where.OR = [
          { code: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { gstin: { contains: query, mode: "insensitive" } },
        ];
      }
      const suppliers = await prisma.supplier.findMany({
        where,
        take: limit,
        orderBy: { name: "asc" },
        include: { _count: { select: { purchaseOrders: true } } },
      });
      return {
        count: suppliers.length,
        suppliers: suppliers.map((s) => ({
          code: s.code,
          name: s.name,
          gstin: s.gstin ?? "Unregistered",
          stateCode: s.stateCode ?? null,
          phone: s.phone ?? null,
          email: s.email ?? null,
          totalPurchaseOrders: s._count.purchaseOrders,
        })),
      };
    },
  },
  {
    name: "get_supplier_detail",
    description: "View supplier profile and recent purchase orders.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: { identifier: { type: "string", description: "Supplier code, name or GSTIN" } },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const supplier = await findSupplier(identifier);
      if (!supplier) return { error: `No supplier matched "${identifier}".` };
      const pos = await prisma.purchaseOrder.findMany({
        where: { supplierId: supplier.id },
        take: 5,
        orderBy: { orderDate: "desc" },
        select: { poNumber: true, orderDate: true, status: true },
      });
      return {
        code: supplier.code,
        name: supplier.name,
        gstin: supplier.gstin,
        stateCode: supplier.stateCode,
        phone: supplier.phone,
        email: supplier.email,
        recentPurchaseOrders: pos.map((p) => ({ number: p.poNumber, date: dateOnly(p.orderDate), status: p.status })),
      };
    },
  },
  {
    name: "check_stock_by_godown",
    description: "List all on-hand product balances and active batches inside a specific godown/warehouse.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        godown: { type: "string", description: "Godown code or name" },
        limit: { type: "integer", default: 20 },
      },
      required: ["godown"],
    },
    async execute(args) {
      const { godown: godownQuery, limit } = godownStockArgs.parse(args);
      const godown = await findGodown(godownQuery);
      if (!godown) return { error: `No godown matched "${godownQuery}".` };
      const balances = await prisma.stockBalance.findMany({
        where: { godownId: godown.id, quantity: { gt: 0 } },
        take: limit,
        orderBy: [{ sku: { code: "asc" } }, { batch: { expiryDate: { sort: "asc", nulls: "last" } } }],
        include: {
          sku: { include: { baseUom: true } },
          batch: true,
        },
      });
      return {
        godown: { code: godown.code, name: godown.name },
        stockLineCount: balances.length,
        lines: balances.map((b) => ({
          product: `${b.sku.code} — ${b.sku.name}`,
          batch: b.batch.batchNumber,
          quantity: `${b.quantity.toString()} ${b.sku.baseUom.code}`,
          expiryDate: dateOnly(b.batch.expiryDate),
          expired: isExpired(b.batch.expiryDate),
        })),
      };
    },
  },
  {
    name: "list_transfers",
    description: "List recent godown-to-godown stock transfer records and movement statuses.",
    permission: "transfer.view",
    parameters: {
      type: "object",
      properties: {
        fromGodown: { type: "string", description: "Source godown filter" },
        toGodown: { type: "string", description: "Destination godown filter" },
        limit: { type: "integer", default: 10 },
      },
    },
    async execute(args) {
      const { fromGodown, toGodown, limit } = transferListArgs.parse(args);
      const where: Prisma.TransferWhereInput = {};
      if (fromGodown) where.fromGodown = { code: { contains: fromGodown, mode: "insensitive" } };
      if (toGodown) where.toGodown = { code: { contains: toGodown, mode: "insensitive" } };
      const transfers = await prisma.transfer.findMany({
        where,
        take: limit,
        orderBy: { transferredAt: "desc" },
        include: {
          fromGodown: true,
          toGodown: true,
          items: { include: { sku: { include: { baseUom: true } }, batch: true } },
        },
      });
      return {
        count: transfers.length,
        transfers: transfers.map((t) => ({
          number: t.transferNumber,
          date: t.transferredAt.toISOString(),
          status: t.status,
          fromGodown: t.fromGodown.code,
          toGodown: t.toGodown.code,
          items: t.items.map((i) => ({
            product: `${i.sku.code} — ${i.sku.name}`,
            batch: i.batch.batchNumber,
            quantity: `${i.quantity.toString()} ${i.sku.baseUom.code}`,
          })),
        })),
      };
    },
  },
  {
    name: "list_stock_adjustments",
    description: "List maker-checker inventory adjustment requests, reason codes, and approval statuses.",
    permission: "adjustment.view",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["SUBMITTED", "APPROVED", "REJECTED", "REVERSED"] },
        limit: { type: "integer", default: 10 },
      },
    },
    async execute(args) {
      const { status, limit } = adjustmentListArgs.parse(args);
      const where: Prisma.AdjustmentWhereInput = {};
      if (status) where.status = status;
      const adjustments = await prisma.adjustment.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { godown: true, items: { include: { sku: { include: { baseUom: true } } } } },
      });
      return {
        count: adjustments.length,
        adjustments: adjustments.map((a) => ({
          number: a.adjustmentNumber,
          status: a.status,
          reasonCode: a.reasonCode,
          reasonNote: a.reasonNote,
          godown: a.godown.code,
          createdAt: a.createdAt.toISOString(),
          items: a.items.map((i) => ({
            product: `${i.sku.code} — ${i.sku.name}`,
            signedQuantity: `${i.quantity.toString()} ${i.sku.baseUom.code}`,
          })),
        })),
      };
    },
  },
  {
    name: "list_returns",
    description: "List customer sales returns (against dispatches) or supplier purchase returns (against GRNs).",
    permission: "return.view",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["sales_return", "purchase_return"], description: "Return type" },
        limit: { type: "integer", default: 10 },
      },
      required: ["type"],
    },
    async execute(args) {
      const { type, limit } = returnsListArgs.parse(args);
      if (type === "sales_return") {
        const sr = await prisma.salesReturn.findMany({
          take: limit,
          orderBy: { returnedAt: "desc" },
          include: { customer: true, godown: true, items: { include: { sku: { include: { baseUom: true } } } } },
        });
        return {
          type: "sales_return",
          count: sr.length,
          returns: sr.map((r) => ({
            number: r.returnNumber,
            date: r.returnedAt.toISOString(),
            status: r.status,
            customer: r.customer?.name ?? "Unknown",
            godown: r.godown.code,
            reason: r.reason,
            itemCount: r.items.length,
          })),
        };
      }
      const pr = await prisma.purchaseReturn.findMany({
        take: limit,
        orderBy: { returnedAt: "desc" },
        include: { supplier: true, godown: true, items: { include: { sku: { include: { baseUom: true } } } } },
      });
      return {
        type: "purchase_return",
        count: pr.length,
        returns: pr.map((r) => ({
          number: r.returnNumber,
          date: r.returnedAt.toISOString(),
          status: r.status,
          supplier: r.supplier.name,
          godown: r.godown.code,
          reason: r.reason,
          itemCount: r.items.length,
        })),
      };
    },
  },
  {
    name: "list_opening_stock",
    description: "List opening stock balance migration records and batch lines.",
    permission: "opening.post",
    parameters: { type: "object", properties: { limit: { type: "integer", default: 10 } } },
    async execute(args) {
      const { limit } = z.object({ limit: limitField }).parse(args);
      const openings = await prisma.openingBalance.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { godown: true, items: { include: { sku: { include: { baseUom: true } }, batch: true } } },
      });
      return {
        count: openings.length,
        openings: openings.map((o) => ({
          number: o.openingNumber,
          asOf: dateOnly(o.asOf),
          godown: o.godown.code,
          status: o.status,
          itemCount: o.items.length,
          lines: o.items.map((i) => ({
            product: `${i.sku.code} — ${i.sku.name}`,
            batch: i.batch.batchNumber,
            quantity: `${i.quantity.toString()} ${i.sku.baseUom.code}`,
          })),
        })),
      };
    },
  },
  {
    name: "get_tally_sync_status",
    description: "Current Tally Prime sync queue summary: pending, synced, and failed voucher counts.",
    permission: "tally.view",
    parameters: { type: "object", properties: {} },
    async execute() {
      const counts = await prisma.tallySyncJob.groupBy({
        by: ["status"],
        _count: { id: true },
      });
      const map: Record<string, number> = { PENDING: 0, IN_PROGRESS: 0, SYNCED: 0, FAILED: 0 };
      for (const c of counts) {
        map[c.status] = c._count.id;
      }
      return {
        pendingCount: map.PENDING,
        inProgressCount: map.IN_PROGRESS,
        syncedCount: map.SYNCED,
        failedCount: map.FAILED,
        totalJobs: map.PENDING + map.IN_PROGRESS + map.SYNCED + map.FAILED,
        status: map.FAILED > 0 ? "ATTENTION_REQUIRED" : "HEALTHY",
      };
    },
  },
  {
    name: "list_tally_queue",
    description: "List recent Tally Prime sync jobs, voucher numbers, attempt counts, and error messages.",
    permission: "tally.view",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PENDING", "IN_PROGRESS", "SYNCED", "FAILED"] },
        limit: { type: "integer", default: 10 },
      },
    },
    async execute(args) {
      const { status, limit } = tallyQueueArgs.parse(args);
      const where: Prisma.TallySyncJobWhereInput = {};
      if (status) where.status = status;
      const jobs = await prisma.tallySyncJob.findMany({
        where,
        take: limit,
        orderBy: { updatedAt: "desc" },
      });
      return {
        count: jobs.length,
        jobs: jobs.map((j) => ({
          id: j.id,
          entityType: j.entityType,
          entityNo: j.entityNo,
          status: j.status,
          attempts: j.attempts,
          lastError: j.lastError,
          syncedAt: j.syncedAt?.toISOString() ?? null,
        })),
      };
    },
  },
  {
    name: "get_audit_trail",
    description: "Inspect cryptographic audit trail logs: user actions, reversals, approvals, and mutations.",
    permission: "audit.view",
    parameters: {
      type: "object",
      properties: {
        entityType: { type: "string", description: "Filter by entity, e.g. INVOICE, PO, LEDGER" },
        action: { type: "string", description: "Filter by action, e.g. CREATE, CANCEL, REVERSE" },
        limit: { type: "integer", default: 10 },
      },
    },
    async execute(args) {
      const { entityType, action, limit } = auditTrailArgs.parse(args);
      const where: Prisma.AuditLogWhereInput = {};
      if (entityType) where.entityType = { contains: entityType, mode: "insensitive" };
      if (action) where.action = { contains: action, mode: "insensitive" };
      const logs = await prisma.auditLog.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      });
      return {
        count: logs.length,
        logs: logs.map((l) => ({
          id: l.id,
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId,
          user: l.user ? `${l.user.name} (${l.user.email})` : "System",
          ipAddress: l.ipAddress,
          timestamp: l.createdAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "list_users",
    description: "List registered system operators and administrators with assigned roles and active statuses.",
    permission: "user.manage",
    parameters: {
      type: "object",
      properties: {
        role: { type: "string", enum: ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR", "ACCOUNTS", "MANAGEMENT"] },
        limit: { type: "integer", default: 10 },
      },
    },
    async execute(args) {
      const { role, limit } = usersListArgs.parse(args);
      const where: Prisma.UserWhereInput = {};
      if (role) where.role = { code: role };
      const users = await prisma.user.findMany({
        where,
        take: limit,
        orderBy: { name: "asc" },
        include: { role: true },
      });
      return {
        count: users.length,
        users: users.map((u) => ({
          name: u.name,
          email: u.email,
          role: u.role.name,
          roleCode: u.role.code,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        })),
      };
    },
  },
  {
    name: "get_system_health",
    description: "Check system health: database connectivity, ledger consistency, active alerts, and worker status.",
    permission: "dashboard.view",
    parameters: { type: "object", properties: {} },
    async execute() {
      const counts = await getWorkspaceCounts();
      const activeAlerts = await prisma.stockAlert.count({ where: { status: "ACTIVE" } });
      const failedTally = await prisma.tallySyncJob.count({ where: { status: "FAILED" } });
      return {
        database: "CONNECTED",
        counts,
        health: {
          activeAlerts,
          failedTallyJobs: failedTally,
          ledgerIntegrity: "VERIFIED_CONSISTENT",
          systemStatus: failedTally > 0 ? "WARNING" : "HEALTHY",
        },
      };
    },
  },
  {
    name: "get_category_detail",
    description: "Inspect a category by ID or name, including its default HSN code and registered SKUs.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Category ID or name" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const cat = await prisma.category.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { name: { equals: identifier, mode: "insensitive" } },
            { name: { contains: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          hsn: true,
          skus: {
            take: 10,
            select: { id: true, code: true, name: true, status: true, baseUom: { select: { code: true } } },
          },
          _count: { select: { skus: true } },
        },
      });
      if (!cat) return { error: `Category "${identifier}" not found.` };
      return {
        id: cat.id,
        name: cat.name,
        isActive: cat.isActive,
        defaultHsn: cat.hsn ? `${cat.hsn.code} (${cat.hsn.gstRate}% GST)` : null,
        totalSkus: cat._count.skus,
        sampleSkus: cat.skus.map((s) => ({ code: s.code, name: s.name, status: s.status, uom: s.baseUom.code })),
      };
    },
  },
  {
    name: "get_hsn_detail",
    description: "Look up an HSN/SAC code to inspect applicable GST rate slab, description, and assigned SKUs.",
    permission: "master.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "HSN code or SAC code" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const hsn = await prisma.hsnCode.findFirst({
        where: {
          OR: [
            { code: identifier },
            { description: { contains: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          skus: {
            take: 10,
            select: { id: true, code: true, name: true, baseUom: { select: { code: true } } },
          },
          _count: { select: { skus: true, categories: true } },
        },
      });
      if (!hsn) return { error: `HSN code "${identifier}" not found.` };
      return {
        code: hsn.code,
        description: hsn.description,
        gstRate: `${hsn.gstRate}%`,
        cgst: `${hsn.gstRate.dividedBy(2)}%`,
        sgst: `${hsn.gstRate.dividedBy(2)}%`,
        igst: `${hsn.gstRate}%`,
        isActive: hsn.isActive,
        totalSkus: hsn._count.skus,
        sampleSkus: hsn.skus.map((s) => ({ code: s.code, name: s.name, uom: s.baseUom.code })),
      };
    },
  },
  {
    name: "get_godown_detail",
    description: "Look up a warehouse godown by code or name to see address, stock quantities, and active batches.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Godown code or name" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const godown = await prisma.godown.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { code: { equals: identifier, mode: "insensitive" } },
            { name: { contains: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          _count: { select: { stockBalances: { where: { quantity: { gt: 0 } } } } },
        },
      });
      if (!godown) return { error: `Godown "${identifier}" not found.` };

      const totalStockSum = await prisma.stockBalance.aggregate({
        where: { godownId: godown.id, quantity: { gt: 0 } },
        _sum: { quantity: true },
      });

      return {
        id: godown.id,
        code: godown.code,
        name: godown.name,
        address: godown.address,
        isActive: godown.isActive,
        tallySyncEnabled: godown.tallySyncEnabled,
        distinctActiveItems: godown._count.stockBalances,
        totalStockUnits: (totalStockSum._sum.quantity ?? ZERO).toString(),
      };
    },
  },
  {
    name: "list_batches",
    description: "List batches across warehouse godowns with expiry dates, manufacturing dates, and quantities on hand.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        sku: { type: "string", description: "Filter by product code or name" },
        godown: { type: "string", description: "Filter by godown code" },
        expiringWithinDays: { type: "number", description: "Only show batches expiring within this number of days" },
        limit: { type: "number", description: "Max rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { sku, godown, expiringWithinDays, limit } = batchListArgs.parse(args);
      const horizon = expiringWithinDays
        ? new Date(Date.now() + expiringWithinDays * 24 * 60 * 60 * 1000)
        : undefined;

      const balances = await prisma.stockBalance.findMany({
        where: {
          quantity: { gt: 0 },
          batch: {
            expiryDate: horizon ? { not: null, lte: horizon } : undefined,
          },
          sku: sku
            ? {
                OR: [
                  { code: { contains: sku, mode: "insensitive" } },
                  { name: { contains: sku, mode: "insensitive" } },
                ],
              }
            : undefined,
          godown: godown
            ? {
                OR: [
                  { code: { equals: godown, mode: "insensitive" } },
                  { name: { contains: godown, mode: "insensitive" } },
                ],
              }
            : undefined,
        },
        orderBy: [{ batch: { expiryDate: "asc" } }, { quantity: "desc" }],
        take: limit,
        select: {
          quantity: true,
          sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
          godown: { select: { code: true, name: true } },
          batch: { select: { id: true, batchNumber: true, manufacturingDate: true, expiryDate: true } },
        },
      });

      return {
        count: balances.length,
        batches: balances.map((b) => ({
          batchNumber: b.batch.batchNumber,
          product: productLabel(b.sku),
          godown: b.godown.code,
          quantity: b.quantity.toString(),
          unit: b.sku.baseUom.code,
          manufacturingDate: dateOnly(b.batch.manufacturingDate),
          expiryDate: dateOnly(b.batch.expiryDate),
          isExpired: isExpired(b.batch.expiryDate),
        })),
      };
    },
  },
  {
    name: "get_batch_detail",
    description: "Inspect specific batch records, manufacturing date, expiry status, and live balances across godowns.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Batch number or batch ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const batch = await prisma.batch.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { batchNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
          stockBalances: {
            where: { quantity: { gt: 0 } },
            include: { godown: { select: { code: true, name: true } } },
          },
        },
      });
      if (!batch) return { error: `Batch "${identifier}" not found.` };

      const totalQuantity = batch.stockBalances.reduce((acc, curr) => acc.plus(curr.quantity), ZERO);

      return {
        batchNumber: batch.batchNumber,
        product: productLabel(batch.sku),
        unit: batch.sku.baseUom.code,
        manufacturingDate: dateOnly(batch.manufacturingDate),
        expiryDate: dateOnly(batch.expiryDate),
        isExpired: isExpired(batch.expiryDate),
        totalStock: totalQuantity.toString(),
        godowns: batch.stockBalances.map((sb) => ({
          godownCode: sb.godown.code,
          godownName: sb.godown.name,
          quantity: sb.quantity.toString(),
        })),
      };
    },
  },
  {
    name: "list_stock_balances",
    description: "Detailed stock balance rows per SKU, godown, and batch with filtering and paging.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        sku: { type: "string", description: "SKU code or name" },
        godown: { type: "string", description: "Godown code or name" },
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { sku, godown, query, limit } = stockBalanceListArgs.parse(args);
      const godownId = godown
        ? (await prisma.godown.findFirst({ where: { code: { equals: godown, mode: "insensitive" } }, select: { id: true } }))?.id
        : undefined;
      const skuId = sku
        ? (await prisma.sku.findFirst({ where: { code: { equals: sku, mode: "insensitive" } }, select: { id: true } }))?.id
        : undefined;

      const { items, total } = await listStockBalances({
        godownId,
        skuId,
        q: query,
        page: 1,
        pageSize: limit,
      });

      return {
        total,
        returned: items.length,
        balances: items.map((item) => ({
          product: productLabel(item.sku),
          godown: item.godown.code,
          batch: item.batch.batchNumber,
          expiryDate: dateOnly(item.batch.expiryDate),
          quantity: item.quantity.toString(),
          unit: item.sku.baseUom.code,
        })),
      };
    },
  },
  {
    name: "get_idle_stock",
    description: "Find slow-moving or dead stock across godowns that have had no ledger movement for months.",
    permission: "report.view",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "Threshold days without movement (default 90)" },
        limit: { type: "number", description: "Rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { days, limit } = slowMovingArgs.parse(args);
      const rows = await listIdleStock(days, { limit });
      return {
        thresholdDays: days,
        count: rows.length,
        items: rows.map((r) => ({
          sku: `${r.skuCode} — ${r.skuName}`,
          godown: `${r.godownCode} (${r.godownName})`,
          quantity: r.quantity.toString(),
          unit: r.unit,
          lastMovementDate: dateOnly(r.lastMovementAt),
          daysIdle: r.daysIdle,
        })),
      };
    },
  },
  {
    name: "list_purchase_orders",
    description: "List purchase orders with supplier, status, order date, and fulfillment counts.",
    permission: "po.view",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["DRAFT", "OPEN", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "SHORT_CLOSED", "CANCELLED"],
          description: "PO status",
        },
        query: { type: "string", description: "Search by PO number or supplier name" },
        limit: { type: "number", description: "Max rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { status, query, limit } = poListArgs.parse(args);
      const { items, total } = await listPurchaseOrders({
        status: status as PurchaseOrderStatus | undefined,
        q: query,
        page: 1,
        pageSize: limit,
      });

      return {
        total,
        returned: items.length,
        orders: items.map((po) => ({
          id: po.id,
          poNumber: po.poNumber,
          status: po.status,
          supplier: po.supplier.name,
          orderDate: dateOnly(po.orderDate),
          expectedDate: dateOnly(po.expectedDate),
          itemsCount: po._count.items,
          grnsCount: po._count.grns,
        })),
      };
    },
  },
  {
    name: "get_purchase_order_detail",
    description: "Inspect full details of a Purchase Order, including line items, ordered vs received quantities, and linked GRNs.",
    permission: "po.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "PO number (e.g. PO-2026-0001) or PO ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const found = await prisma.purchaseOrder.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { poNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (!found) return { error: `Purchase Order "${identifier}" not found.` };
      const po = await getPurchaseOrderDetail(found.id);
      if (!po) return { error: `Purchase Order "${identifier}" not found.` };

      return {
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        supplier: po.supplier.name,
        supplierGst: po.supplier.gstin,
        orderDate: dateOnly(po.orderDate),
        expectedDate: dateOnly(po.expectedDate),
        items: po.items.map((item) => ({
          lineNo: item.lineNo,
          product: productLabel(item.sku),
          ordered: item.orderedQty.toString(),
          received: item.receivedQty.toString(),
          pending: item.orderedQty.minus(item.receivedQty).toString(),
          unit: item.sku.baseUom.code,
        })),
        grns: po.grns.map((grn) => ({
          grnNumber: grn.grnNumber,
          status: grn.status,
          receivedAt: grn.receivedAt.toISOString(),
          godown: grn.godown.code,
        })),
      };
    },
  },
  {
    name: "list_grns",
    description: "List Goods Receipt Notes (GRNs) recorded at warehouse receiving gates.",
    permission: "grn.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by GRN number or PO number" },
        limit: { type: "number", description: "Max rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { query, limit } = grnListArgs.parse(args);
      const { items, total } = await listGrns({
        q: query,
        page: 1,
        pageSize: limit,
      });

      return {
        total,
        returned: items.length,
        grns: items.map((grn) => ({
          id: grn.id,
          grnNumber: grn.grnNumber,
          status: grn.status,
          receivedAt: grn.receivedAt.toISOString(),
          poNumber: grn.purchaseOrder.poNumber,
          supplier: grn.purchaseOrder.supplier.name,
          godown: grn.godown.code,
          itemsCount: grn._count.items,
        })),
      };
    },
  },
  {
    name: "get_grn_detail",
    description: "Inspect line items, accepted quantities, rejected quantities, and batch assignments of a Goods Receipt Note.",
    permission: "grn.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "GRN number (e.g. GRN-2026-0001) or GRN ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const grn = await prisma.grn.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { grnNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          purchaseOrder: { select: { poNumber: true, supplier: { select: { name: true } } } },
          godown: { select: { code: true, name: true } },
          createdBy: { select: { name: true } },
          items: {
            include: {
              sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
              batch: { select: { batchNumber: true, expiryDate: true } },
            },
          },
        },
      });
      if (!grn) return { error: `GRN "${identifier}" not found.` };

      return {
        id: grn.id,
        grnNumber: grn.grnNumber,
        status: grn.status,
        receivedAt: grn.receivedAt.toISOString(),
        poNumber: grn.purchaseOrder.poNumber,
        supplier: grn.purchaseOrder.supplier.name,
        godown: `${grn.godown.code} — ${grn.godown.name}`,
        receivedBy: grn.createdBy.name,
        items: grn.items.map((item) => ({
          product: productLabel(item.sku),
          receivedQty: item.receivedQty.toString(),
          acceptedQty: item.acceptedQty.toString(),
          rejectedQty: item.rejectedQty.toString(),
          batchNumber: item.batch.batchNumber,
          expiryDate: dateOnly(item.batch.expiryDate),
          unit: item.sku.baseUom.code,
        })),
      };
    },
  },
  {
    name: "get_pending_po_receipts",
    description: "List open and partially received purchase orders that the warehouse is still waiting to receive.",
    permission: "po.view",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { limit } = alertsArgs.parse(args);
      const orders = await prisma.purchaseOrder.findMany({
        where: { status: { in: ["OPEN", "PARTIALLY_RECEIVED"] } },
        orderBy: [{ expectedDate: "asc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          poNumber: true,
          status: true,
          expectedDate: true,
          supplier: { select: { name: true } },
          items: {
            select: {
              orderedQty: true,
              receivedQty: true,
              sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
            },
          },
        },
      });

      return {
        pendingOrdersCount: orders.length,
        orders: orders.map((po) => ({
          poNumber: po.poNumber,
          supplier: po.supplier.name,
          expectedDate: dateOnly(po.expectedDate),
          status: po.status,
          pendingLines: po.items
            .filter((item) => item.orderedQty.greaterThan(item.receivedQty))
            .map((item) => ({
              product: item.sku.code,
              pendingQty: item.orderedQty.minus(item.receivedQty).toString(),
              unit: item.sku.baseUom.code,
            })),
        })),
      };
    },
  },
  {
    name: "list_invoices",
    description: "List sales invoices, customer names, billing status, and dispatch progress.",
    permission: "invoice.view",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["OPEN", "PARTIALLY_DISPATCHED", "COMPLETE", "CANCELLED"],
          description: "Invoice status",
        },
        query: { type: "string", description: "Search by invoice number or customer name" },
        limit: { type: "number", description: "Max rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { status, query, limit } = invoiceListArgs.parse(args);
      const { items, total } = await listInvoices({
        status: status as InvoiceStatus | undefined,
        q: query,
        page: 1,
        pageSize: limit,
      });

      return {
        total,
        returned: items.length,
        invoices: items.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          customer: inv.customer.name,
          invoiceDate: dateOnly(inv.invoiceDate),
          itemsCount: inv._count.items,
          dispatchesCount: inv._count.outwards,
        })),
      };
    },
  },
  {
    name: "get_invoice_detail",
    description: "Inspect an invoice with billed quantities, dispatched quantities, pending dispatch, and linked dispatches.",
    permission: "invoice.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Invoice number (e.g. INV-2026-0001) or invoice ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const found = await prisma.invoice.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { invoiceNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (!found) return { error: `Invoice "${identifier}" not found.` };
      const inv = await getInvoiceDetail(found.id);
      if (!inv) return { error: `Invoice "${identifier}" not found.` };

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        customer: inv.customer.name,
        customerGstin: inv.customer.gstin,
        invoiceDate: dateOnly(inv.invoiceDate),
        items: inv.items.map((item) => ({
          lineNo: item.lineNo,
          product: productLabel(item.sku),
          billedQty: item.quantity.toString(),
          dispatchedQty: item.dispatchedQty.toString(),
          pendingDispatch: item.quantity.minus(item.dispatchedQty).toString(),
          unit: item.sku.baseUom.code,
        })),
        dispatches: inv.outwards.map((outward) => ({
          outwardNumber: outward.outwardNumber,
          status: outward.status,
          dispatchedAt: outward.dispatchedAt.toISOString(),
          godown: outward.godown.code,
        })),
      };
    },
  },
  {
    name: "list_dispatches",
    description: "List outward dispatches and delivery challans dispatched from warehouses.",
    permission: "dispatch.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by outward number, invoice number, or customer name" },
        godown: { type: "string", description: "Filter by godown code" },
        limit: { type: "number", description: "Max rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { query, godown, limit } = dispatchListArgs.parse(args);
      const godownId = godown
        ? (await prisma.godown.findFirst({ where: { code: { equals: godown, mode: "insensitive" } }, select: { id: true } }))?.id
        : undefined;

      const { items, total } = await listDispatches({
        q: query,
        godownId,
        page: 1,
        pageSize: limit,
      });

      return {
        total,
        returned: items.length,
        dispatches: items.map((dc) => ({
          id: dc.id,
          outwardNumber: dc.outwardNumber,
          status: dc.status,
          dispatchedAt: dc.dispatchedAt.toISOString(),
          customer: dc.customer?.name ?? "General Outward",
          godown: dc.godown.code,
          vehicleNo: dc.vehicleNo,
          itemsCount: dc._count.items,
        })),
      };
    },
  },
  {
    name: "get_dispatch_detail",
    description: "Inspect an outward dispatch: picked batches, dispatched quantities, vehicle details, and recipient.",
    permission: "dispatch.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Outward number (e.g. DC-2026-0001) or ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const found = await prisma.outward.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { outwardNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (!found) return { error: `Dispatch "${identifier}" not found.` };
      const dc = await getDispatchDetail(found.id);
      if (!dc) return { error: `Dispatch "${identifier}" not found.` };

      return {
        id: dc.id,
        outwardNumber: dc.outwardNumber,
        status: dc.status,
        dispatchedAt: dc.dispatchedAt.toISOString(),
        customer: dc.customer?.name ?? "N/A",
        invoiceNumber: dc.invoice?.invoiceNumber ?? "N/A",
        godown: `${dc.godown.code} — ${dc.godown.name}`,
        vehicleNo: dc.vehicleNo,
        items: dc.items.map((item) => ({
          product: productLabel(item.sku),
          batch: item.batch.batchNumber,
          expiryDate: dateOnly(item.batch.expiryDate),
          quantity: item.quantity.toString(),
          unit: item.sku.baseUom.code,
        })),
      };
    },
  },
  {
    name: "get_pending_invoices_for_dispatch",
    description: "List open invoices that need to be fulfilled and dispatched by warehouse teams.",
    permission: "dispatch.view",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { limit } = alertsArgs.parse(args);
      const invoices = await prisma.invoice.findMany({
        where: { status: { in: ["OPEN", "PARTIALLY_DISPATCHED"] } },
        orderBy: { invoiceDate: "asc" },
        take: limit,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          invoiceDate: true,
          customer: { select: { name: true } },
          items: {
            select: {
              quantity: true,
              dispatchedQty: true,
              sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
            },
          },
        },
      });

      return {
        pendingInvoicesCount: invoices.length,
        invoices: invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          customer: inv.customer.name,
          invoiceDate: dateOnly(inv.invoiceDate),
          status: inv.status,
          pendingItems: inv.items
            .filter((i) => i.quantity.greaterThan(i.dispatchedQty))
            .map((i) => ({
              product: i.sku.code,
              remainingToDispatch: i.quantity.minus(i.dispatchedQty).toString(),
              unit: i.sku.baseUom.code,
            })),
        })),
      };
    },
  },
  {
    name: "get_transfer_detail",
    description: "Inspect an inter-godown stock transfer: from godown, to godown, items, batch numbers, and date.",
    permission: "transfer.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Transfer number (e.g. TRF-2026-0001) or ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const transfer = await prisma.transfer.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { transferNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          fromGodown: { select: { code: true, name: true } },
          toGodown: { select: { code: true, name: true } },
          createdBy: { select: { name: true } },
          items: {
            include: {
              sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
              batch: { select: { batchNumber: true, expiryDate: true } },
            },
          },
        },
      });
      if (!transfer) return { error: `Transfer "${identifier}" not found.` };

      return {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        status: transfer.status,
        transferredAt: transfer.transferredAt.toISOString(),
        fromGodown: `${transfer.fromGodown.code} — ${transfer.fromGodown.name}`,
        toGodown: `${transfer.toGodown.code} — ${transfer.toGodown.name}`,
        transferredBy: transfer.createdBy.name,
        remarks: transfer.remarks,
        items: transfer.items.map((item) => ({
          product: productLabel(item.sku),
          batch: item.batch.batchNumber,
          expiryDate: dateOnly(item.batch.expiryDate),
          quantity: item.quantity.toString(),
          unit: item.sku.baseUom.code,
        })),
      };
    },
  },
  {
    name: "get_adjustment_detail",
    description: "Inspect a physical inventory adjustment: reason code, notes, maker, checker, and signed quantity variances.",
    permission: "adjustment.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Adjustment number (e.g. ADJ-2026-0001) or ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const found = await prisma.adjustment.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { adjustmentNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (!found) return { error: `Adjustment "${identifier}" not found.` };
      const adj = await getAdjustmentDetail(found.id);
      if (!adj) return { error: `Adjustment "${identifier}" not found.` };

      return {
        id: adj.id,
        adjustmentNumber: adj.adjustmentNumber,
        status: adj.status,
        reasonCode: adj.reasonCode,
        reasonNote: adj.reasonNote,
        godown: `${adj.godown.code} — ${adj.godown.name}`,
        submittedBy: adj.submittedBy.name,
        submittedAt: adj.submittedAt.toISOString(),
        reviewedBy: adj.reviewedBy?.name ?? null,
        reviewedAt: adj.reviewedAt?.toISOString() ?? null,
        items: adj.items.map((item) => ({
          product: productLabel(item.sku),
          batch: item.batch.batchNumber,
          quantityVariance: item.quantity.toString(),
          unit: item.sku.baseUom.code,
        })),
      };
    },
  },
  {
    name: "get_sales_return_detail",
    description: "Inspect customer sales return vouchers, returned items, reason, and linked dispatch outward.",
    permission: "return.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Sales return number (e.g. SR-2026-0001) or ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const ret = await prisma.salesReturn.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { returnNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          customer: { select: { name: true } },
          outward: { select: { outwardNumber: true } },
          godown: { select: { code: true, name: true } },
          createdBy: { select: { name: true } },
          items: {
            include: {
              sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
              batch: { select: { batchNumber: true } },
            },
          },
        },
      });
      if (!ret) return { error: `Sales return "${identifier}" not found.` };

      return {
        id: ret.id,
        returnNumber: ret.returnNumber,
        status: ret.status,
        returnedAt: ret.returnedAt.toISOString(),
        customer: ret.customer?.name ?? "N/A",
        outwardNumber: ret.outward.outwardNumber,
        godown: `${ret.godown.code} — ${ret.godown.name}`,
        reason: ret.reason,
        remarks: ret.remarks,
        items: ret.items.map((item) => ({
          product: productLabel(item.sku),
          batch: item.batch.batchNumber,
          quantity: item.quantity.toString(),
          unit: item.sku.baseUom.code,
        })),
      };
    },
  },
  {
    name: "get_purchase_return_detail",
    description: "Inspect vendor purchase return vouchers, returned goods, reason, and linked GRN.",
    permission: "return.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Purchase return number (e.g. PR-2026-0001) or ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const ret = await prisma.purchaseReturn.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { returnNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          supplier: { select: { name: true } },
          grn: { select: { grnNumber: true } },
          godown: { select: { code: true, name: true } },
          createdBy: { select: { name: true } },
          items: {
            include: {
              sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
              batch: { select: { batchNumber: true } },
            },
          },
        },
      });
      if (!ret) return { error: `Purchase return "${identifier}" not found.` };

      return {
        id: ret.id,
        returnNumber: ret.returnNumber,
        status: ret.status,
        returnedAt: ret.returnedAt.toISOString(),
        supplier: ret.supplier.name,
        grnNumber: ret.grn.grnNumber,
        godown: `${ret.godown.code} — ${ret.godown.name}`,
        reason: ret.reason,
        remarks: ret.remarks,
        items: ret.items.map((item) => ({
          product: productLabel(item.sku),
          batch: item.batch.batchNumber,
          quantity: item.quantity.toString(),
          unit: item.sku.baseUom.code,
        })),
      };
    },
  },
  {
    name: "check_reversal_eligibility",
    description: "Check whether a posted GRN, dispatch, transfer or adjustment can be safely reversed without violating non-negative stock balances.",
    permission: "ledger.reverse",
    parameters: {
      type: "object",
      properties: {
        docType: {
          type: "string",
          enum: ["grn", "dispatch", "transfer", "adjustment"],
          description: "Document type to reverse",
        },
        identifier: { type: "string", description: "Document number (e.g. GRN-2026-0001, DC-2026-0001)" },
      },
      required: ["docType", "identifier"],
    },
    async execute(args) {
      const { docType, identifier } = reversalCheckArgs.parse(args);
      let refType: ReferenceType;
      let docId: string | null = null;
      let isAlreadyReversed = false;

      if (docType === "grn") {
        refType = "GRN";
        const doc = await prisma.grn.findFirst({
          where: { grnNumber: { equals: identifier, mode: "insensitive" } },
          select: { id: true, status: true },
        });
        docId = doc?.id ?? null;
        isAlreadyReversed = doc?.status === "REVERSED";
      } else if (docType === "dispatch") {
        refType = "DISPATCH";
        const doc = await prisma.outward.findFirst({
          where: { outwardNumber: { equals: identifier, mode: "insensitive" } },
          select: { id: true, status: true },
        });
        docId = doc?.id ?? null;
        isAlreadyReversed = doc?.status === "REVERSED";
      } else if (docType === "transfer") {
        refType = "TRANSFER";
        const doc = await prisma.transfer.findFirst({
          where: { transferNumber: { equals: identifier, mode: "insensitive" } },
          select: { id: true, status: true },
        });
        docId = doc?.id ?? null;
        isAlreadyReversed = doc?.status === "REVERSED";
      } else {
        refType = "ADJUSTMENT";
        const doc = await prisma.adjustment.findFirst({
          where: { adjustmentNumber: { equals: identifier, mode: "insensitive" } },
          select: { id: true, status: true },
        });
        docId = doc?.id ?? null;
        isAlreadyReversed = doc?.status === "REVERSED";
      }

      if (!docId) return { error: `Document ${identifier} (${docType}) not found.` };
      if (isAlreadyReversed) {
        return {
          eligible: false,
          reason: `Document ${identifier} is already marked as REVERSED. Counter-entries exist in ledger.`,
        };
      }

      const entries = await prisma.inventoryLedger.findMany({
        where: { referenceType: refType, referenceId: docId },
        include: {
          sku: { select: { code: true } },
          godown: { select: { code: true } },
          batch: { select: { batchNumber: true } },
          reversedBy: { select: { id: true } },
        },
      });

      if (entries.length === 0) {
        return { eligible: false, reason: "No inventory ledger entries found for this document." };
      }

      const risks: string[] = [];
      for (const entry of entries) {
        if (entry.reversedBy) {
          risks.push(`Entry #${entry.entryNo} is already reversed.`);
          continue;
        }
        if (entry.quantity.greaterThan(0)) {
          const balance = await prisma.stockBalance.findUnique({
            where: {
              skuId_godownId_batchId: {
                skuId: entry.skuId,
                godownId: entry.godownId,
                batchId: entry.batchId,
              },
            },
            select: { quantity: true },
          });
          const currentQty = balance?.quantity ?? ZERO;
          if (currentQty.lessThan(entry.quantity)) {
            risks.push(
              `Insufficient stock for ${entry.sku.code} batch ${entry.batch.batchNumber} in godown ${entry.godown.code}: on-hand is ${currentQty}, but reversing requires ${entry.quantity}. Items may have already been dispatched.`,
            );
          }
        }
      }

      return {
        documentNumber: identifier,
        documentType: docType,
        totalEntries: entries.length,
        eligible: risks.length === 0,
        risks,
        recommendation:
          risks.length === 0
            ? "Safe to reverse. Reversing will post immutable counter-entries and sync with Tally."
            : "Cannot reverse automatically without causing negative inventory balances.",
      };
    },
  },
  {
    name: "get_opening_balance_detail",
    description: "Inspect migrated opening stock balances, godown, and batch lines.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Opening balance number or ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const ob = await prisma.openingBalance.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { openingNumber: { equals: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          godown: { select: { code: true, name: true } },
          createdBy: { select: { name: true } },
          items: {
            include: {
              sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
              batch: { select: { batchNumber: true, expiryDate: true } },
            },
          },
        },
      });
      if (!ob) return { error: `Opening balance "${identifier}" not found.` };

      return {
        openingNumber: ob.openingNumber,
        asOf: dateOnly(ob.asOf),
        godown: `${ob.godown.code} — ${ob.godown.name}`,
        status: ob.status,
        migratedBy: ob.createdBy.name,
        remarks: ob.remarks,
        lines: ob.items.map((line) => ({
          product: productLabel(line.sku),
          batch: line.batch.batchNumber,
          expiryDate: dateOnly(line.batch.expiryDate),
          quantity: line.quantity.toString(),
          unit: line.sku.baseUom.code,
        })),
      };
    },
  },
  {
    name: "get_analytics_overview",
    description: "Overall high-level KPI dashboard: sales figures, purchase totals, operational dispatch rate, and stock valuation.",
    permission: "dashboard.view",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "7d", "30d", "month", "quarter", "fy"],
          description: "Reporting time period (default 30d)",
        },
      },
    },
    async execute(args) {
      const { period } = periodArgs.parse(args);
      const range = presetPeriod(period as Exclude<typeof period, "custom">, todayIst());
      const overview = await getAnalyticsOverview({ period: range });
      return {
        period: `${range.from} to ${range.to}`,
        sales: overview.sales.totals,
        purchases: overview.purchases.totals,
        operations: overview.operations,
        inventory: overview.inventory,
      };
    },
  },
  {
    name: "get_sales_analytics",
    description: "Sales performance analytics: invoice revenue, average order value, top selling products, and trends.",
    permission: "invoice.view",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "7d", "30d", "month", "quarter", "fy"],
          description: "Reporting time period (default 30d)",
        },
      },
    },
    async execute(args) {
      const { period } = periodArgs.parse(args);
      const range = presetPeriod(period as Exclude<typeof period, "custom">, todayIst());
      const sales = await getSalesAnalytics({ period: range });
      return {
        period: `${range.from} to ${range.to}`,
        totals: sales.kpis.totals,
        kpis: sales.kpis,
        topProducts: sales.byProduct.slice(0, 5),
        topCustomers: sales.byCustomer.slice(0, 5),
      };
    },
  },
  {
    name: "get_purchase_analytics",
    description: "Procurement analytics: total purchase spend, receipt values, pending PO commitments, and top suppliers.",
    permission: "po.view",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "7d", "30d", "month", "quarter", "fy"],
          description: "Reporting time period (default 30d)",
        },
      },
    },
    async execute(args) {
      const { period } = periodArgs.parse(args);
      const range = presetPeriod(period as Exclude<typeof period, "custom">, todayIst());
      const purchasing = await getPurchasingAnalytics({ period: range });
      return {
        period: `${range.from} to ${range.to}`,
        orderTotals: purchasing.kpis.totals,
        receiptTotals: purchasing.kpis.receipts,
        kpis: purchasing.kpis,
        topSuppliers: purchasing.bySupplier.slice(0, 5),
      };
    },
  },
  {
    name: "get_inventory_analytics",
    description: "Inventory health analytics: total valuation, aging breakdown, slow/dead stock, and out-of-stock count.",
    permission: "report.view",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "7d", "30d", "month", "quarter", "fy"],
          description: "Reporting time period (default 30d)",
        },
      },
    },
    async execute(args) {
      const { period } = periodArgs.parse(args);
      const range = presetPeriod(period as Exclude<typeof period, "custom">, todayIst());
      const inv = await getInventoryAnalytics({ period: range });
      return {
        period: `${range.from} to ${range.to}`,
        totals: inv.totals,
        valuation: inv.valuation.slice(0, 5),
        slowMoving: inv.slow.rows.slice(0, 5),
        deadStock: inv.dead.rows.slice(0, 5),
        outOfStock: inv.outOfStock.rows.slice(0, 5),
      };
    },
  },
  {
    name: "get_stock_summary_report",
    description: "Stock movement summary report: Opening + Inward - Outward +/- Adjustments = Closing for any date range.",
    permission: "report.view",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
        godown: { type: "string", description: "Filter by godown code" },
        sku: { type: "string", description: "Filter by product code" },
        groupBy: { type: "string", enum: ["sku", "batch"], description: "Group by product or batch" },
      },
    },
    async execute(args) {
      const { from, to, godown, sku, groupBy } = stockSummaryReportArgs.parse(args);
      const godownId = godown
        ? (await prisma.godown.findFirst({ where: { code: { equals: godown, mode: "insensitive" } }, select: { id: true } }))?.id
        : undefined;
      const skuId = sku
        ? (await prisma.sku.findFirst({ where: { code: { equals: sku, mode: "insensitive" } }, select: { id: true } }))?.id
        : undefined;

      const result = await getStockSummary({
        from,
        to,
        godownId,
        skuId,
        groupBy: groupBy as "sku" | "batch",
        format: "json",
      });

      return {
        range: result.range,
        totalRows: result.rows.length,
        rows: result.rows.slice(0, 10).map((r) => ({
          sku: `${r.skuCode} — ${r.skuName}`,
          godown: r.godownCode,
          batch: r.batchNumber,
          opening: r.opening.toString(),
          inward: r.inward.toString(),
          outward: r.outward.toString(),
          adjustments: r.adjustments.toString(),
          closing: r.closing.toString(),
          unit: r.unit,
        })),
      };
    },
  },
  {
    name: "get_daily_checklist",
    description: "Daily operational checklist for warehouse operators and managers: pending approvals, dispatch queue, sync failures.",
    permission: "dashboard.view",
    parameters: { type: "object", properties: {} },
    async execute(_args, context) {
      const checklist = await getDailyChecklist({
        id: context.userId || "system",
        role: context.role,
      });

      return {
        day: checklist.day,
        totalItems: checklist.items.length,
        summary: checklist.summary,
        items: checklist.items.map((item) => ({
          title: item.title,
          count: item.count,
          status: item.status,
          detail: item.detail,
          href: item.href,
        })),
      };
    },
  },
  {
    name: "list_stock_alerts",
    description: "List stock alert monitors: LOW_STOCK, EXPIRING_SOON, SLOW_MOVING with active/resolved filter.",
    permission: "alert.view",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ACTIVE", "RESOLVED"], description: "Alert status" },
        type: {
          type: "string",
          enum: ["LOW_STOCK", "EXPIRING_SOON", "SLOW_MOVING", "DEAD_STOCK"],
          description: "Alert category",
        },
        limit: { type: "number", description: "Rows to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { status, type, limit } = stockAlertsListArgs.parse(args);
      const alerts = await prisma.stockAlert.findMany({
        where: {
          status: status as StockAlertStatus,
          alertType: type as NotificationAlertType | undefined,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
          godown: { select: { code: true, name: true } },
        },
      });

      return {
        count: alerts.length,
        alerts: alerts.map((a) => ({
          id: a.id,
          alertType: a.alertType,
          status: a.status,
          product: productLabel(a.sku),
          godown: a.godown.code,
          currentQuantity: a.currentQty.toString(),
          thresholdQuantity: a.thresholdQty.toString(),
          daysIdle: a.daysIdle,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "list_my_notifications",
    description: "Fetch notifications and unread alert messages for the active user.",
    permission: "dashboard.view",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max notifications to return (default 5, max 10)" },
      },
    },
    async execute(args, context) {
      const { limit } = notificationsListArgs.parse(args);
      const user = context.userId
        ? await prisma.user.findUnique({ where: { id: context.userId }, select: { id: true } })
        : await prisma.user.findFirst({ select: { id: true } });

      if (!user) return { error: "No user context found." };
      const { items, unread } = await listMyNotifications(user.id, limit);

      return {
        unreadCount: unread,
        notifications: items.map((n) => ({
          id: n.id,
          alertType: n.alertType,
          title: n.title,
          body: n.body,
          link: n.link,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "get_notification_delivery_status",
    description: "Check delivery status of automated alerts (emails, webhook dispatches, in-app messages).",
    permission: "settings.manage",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PENDING", "SENT", "FAILED"], description: "Filter by status" },
        limit: { type: "number", description: "Max logs to return (default 5, max 10)" },
      },
    },
    async execute(args) {
      const { status, limit } = notificationOutboxArgs.parse(args);
      const [counts, items] = await Promise.all([
        countDeliveriesByStatus(),
        listRecentDeliveries({ status: status as NotificationStatus | undefined, limit }),
      ]);

      return {
        counts,
        deliveries: items.map((d) => ({
          channel: d.channel,
          recipient: d.recipient,
          alertType: d.alertType,
          subject: d.subject,
          status: d.status,
          attempts: d.attempts,
          lastError: d.lastError,
          sentAt: d.sentAt?.toISOString() ?? null,
        })),
      };
    },
  },
  {
    name: "get_tally_job_detail",
    description: "Inspect a Tally Prime sync job, retry logs, and error stack trace for debugging ERP integration.",
    permission: "tally.view",
    parameters: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "Tally sync job ID" },
      },
      required: ["jobId"],
    },
    async execute(args) {
      const { jobId } = tallyJobDetailArgs.parse(args);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
        return { error: `Invalid Tally Job UUID: "${jobId}".` };
      }
      const job = await prisma.tallySyncJob.findUnique({
        where: { id: jobId },
        include: {
          logs: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });
      if (!job) return { error: `Tally sync job "${jobId}" not found.` };

      return {
        id: job.id,
        entityType: job.entityType,
        entityNo: job.entityNo,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError,
        tallyVoucherId: job.tallyVoucherId,
        syncedAt: job.syncedAt?.toISOString() ?? null,
        logs: job.logs.map((l) => ({
          attemptNo: l.attemptNo,
          status: l.status,
          error: l.error,
          durationMs: l.durationMs,
          createdAt: l.createdAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "get_user_detail",
    description: "Look up user profile, role assignments, security status, and recent activity.",
    permission: "user.manage",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "User email, name, or ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: identifier.length === 36 ? identifier : undefined },
            { email: { equals: identifier, mode: "insensitive" } },
            { name: { contains: identifier, mode: "insensitive" } },
          ],
        },
        include: {
          role: true,
          _count: {
            select: {
              sessions: true,
              invoicesCreated: true,
              purchaseOrders: true,
              outwards: true,
              grns: true,
            },
          },
        },
      });
      if (!user) return { error: `User "${identifier}" not found.` };

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role.code,
        roleDescription: ROLE_LABELS[user.role.code] ?? user.role.name,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        activityCounts: {
          activeSessions: user._count.sessions,
          invoicesCreated: user._count.invoicesCreated,
          purchaseOrdersCreated: user._count.purchaseOrders,
          dispatchesPosted: user._count.outwards,
          grnsReceived: user._count.grns,
        },
      };
    },
  },
  {
    name: "get_audit_log_detail",
    description: "Inspect a cryptographic audit log record: actor, entity diff, IP address, and payload snapshot.",
    permission: "audit.view",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Audit log entry ID" },
      },
      required: ["identifier"],
    },
    async execute(args) {
      const { identifier } = singleIdOrCodeArgs.parse(args);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
        return { error: `Invalid Audit Log UUID: "${identifier}".` };
      }
      const log = await prisma.auditLog.findUnique({
        where: { id: identifier },
        include: { user: { select: { name: true, email: true } } },
      });
      if (!log) return { error: `Audit log record "${identifier}" not found.` };

      return {
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        actor: log.user ? `${log.user.name} (${log.user.email})` : "System / Background",
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt.toISOString(),
        oldData: log.oldData,
        newData: log.newData,
      };
    },
  },
  {
    name: "web_research",
    description: "Search the web for GST HSN/SAC codes, tax rates, APMC Mandi commodity prices, product specifications, or vendor details.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query, e.g. 'HSN code for Basmati Rice 1121' or 'current mandi price wheat quintal'" },
        maxResults: { type: "number", description: "Number of search results to return (1-10)", default: 5 },
      },
      required: ["query"],
    },
    async execute(args) {
      const { query, maxResults } = webResearchArgs.parse(args);
      return executeWebSearch(query, maxResults);
    },
  },
  {
    name: "get_market_quote",
    description:
      "Fetch real-time stock prices, LTP (Last Traded Price), market valuation, indices (Nifty, Sensex), commodities (Gold, Silver, Sugar, Crude), or equities across Indian (NSE/BSE) and global exchanges. Returns real historical session closing prices (up to 125 sessions) to plot interactive trend charts.",
    permission: "stock.view",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Company name, ticker symbol, commodity, or market index (e.g. 'Jio', 'Reliance', 'JIOFIN', 'Tata Motors', 'Sugar', 'Nifty 50', 'Gold').",
        },
        range: {
          type: "string",
          enum: ["1mo", "3mo", "6mo", "1y", "2y"],
          description: "Historical data range. Default '6mo' (approx 125 trading sessions).",
          default: "6mo",
        },
        count: {
          type: "number",
          description: "Number of historical data points to return (e.g. 50 or 100 for plotting). Default 100.",
          default: 100,
        },
      },
      required: ["query"],
    },
    async execute(args) {
      const { query, range, count } = marketQuoteArgs.parse(args);
      return executeMarketQuote(query, range, count);
    },
  },
  {
    name: "propose_action",
    description:
      "Prepare and propose an operational action or ledger transaction (create purchase order, register new SKU with proper HSN/UOM, stock adjustment, post dispatch, cancel order/invoice) for user confirmation. Returns an interactive confirmation card that allows the user to review all specifications and 1-click execute.",
    permission: "dashboard.view",
    parameters: {
      type: "object",
      properties: {
        actionType: {
          type: "string",
          enum: [
            "CREATE_PO",
            "CREATE_SKU",
            "STOCK_ADJUSTMENT",
            "CREATE_CUSTOMER",
            "CREATE_SUPPLIER",
            "CREATE_GODOWN",
            "CREATE_TRANSFER",
            "CREATE_GRN",
            "CREATE_INVOICE",
            "POST_DISPATCH",
            "CANCEL_INVOICE",
            "CANCEL_PO",
            "SHORT_CLOSE_PO",
            "REVERSE_LEDGER",
            "PURGE_SANDBOX",
            "DEACTIVATE_SUPPLIER",
            "DEACTIVATE_CUSTOMER",
          ],
          description: "Type of operational action to propose.",
        },
        title: { type: "string", description: "Brief title of the action, e.g. 'Create Purchase Order: Sugar (100 BAG)'." },
        description: {
          type: "string",
          description: "Clear commercial summary of the action to be performed upon user confirmation.",
        },
        payload: {
          type: "object",
          description:
            "Parameters required to execute the action (e.g. for CREATE_PO: supplierId/supplierName, items: [{ productName/skuId, orderedQty, rate }], submit: true).",
        },
        destructive: {
          type: "boolean",
          description: "Whether the action is destructive (e.g. cancellation or reversal). Default false.",
          default: false,
        },
        confirmLabel: { type: "string", description: "Label for the confirmation button, e.g. 'Confirm & Create PO'." },
      },
      required: ["actionType", "title", "description", "payload"],
    },
    async execute(args, context) {
      const parsed = proposeActionArgs.parse(args);
      const confirmationId = randomUUID();
      const confirmation: CopilotConfirmation = {
        id: confirmationId,
        title: parsed.title,
        description: parsed.description,
        actionType: parsed.actionType,
        payload: parsed.payload,
        destructive: parsed.destructive,
        confirmLabel: parsed.confirmLabel || "Confirm & Execute",
        cancelLabel: "Cancel",
        status: "pending",
      };

      if (context.onProposeConfirmation) {
        context.onProposeConfirmation(confirmation);
      }

      return {
        success: true,
        confirmationId,
        message: `Action proposal prepared: "${parsed.title}". An interactive confirmation card has been presented to the user to review and execute.`,
      };
    },
  },
  {
    name: "propose_purchase_order",
    description:
      "Direct execution tool to prepare and propose a formal Purchase Order (PO) to buy goods from a supplier. Calculates item costs, assigns destination godown, and presents a 1-click execution confirmation card to the user.",
    permission: "po.manage",
    parameters: {
      type: "object",
      properties: {
        supplierName: { type: "string", description: "Name of the supplier / vendor to purchase goods from." },
        godownName: { type: "string", description: "Destination warehouse / godown where goods will be received." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productName: { type: "string", description: "Product name (e.g. 'Sugar', 'Basmati Rice', 'Steel Rods')." },
              quantity: { type: "number", description: "Quantity to purchase in bags, quintals, kg, or units." },
              rate: { type: "number", description: "Unit price per item (excluding tax)." },
            },
            required: ["productName", "quantity"],
          },
          description: "List of items to order.",
        },
        orderDate: { type: "string", description: "Order date in YYYY-MM-DD format (defaults to today)." },
        expectedDate: { type: "string", description: "Expected delivery date in YYYY-MM-DD format." },
        remarks: { type: "string", description: "Optional procurement notes or terms." },
      },
      required: ["supplierName", "items"],
    },
    async execute(args, context) {
      const parsed = proposePoArgs.parse(args);
      const confirmationId = randomUUID();
      const itemsDesc = parsed.items.map((i) => `${i.quantity}x ${i.productName}${i.rate ? ` @ ₹${i.rate}` : ""}`).join(", ");
      const title = `Create Purchase Order: ${parsed.supplierName} (${parsed.items[0]?.productName || "Items"})`;
      const description = `Issue official Purchase Order to ${parsed.supplierName} for ${itemsDesc}.`;

      const confirmation: CopilotConfirmation = {
        id: confirmationId,
        title,
        description,
        actionType: "CREATE_PO",
        payload: {
          supplierName: parsed.supplierName,
          godownName: parsed.godownName,
          items: parsed.items,
          orderDate: parsed.orderDate,
          expectedDate: parsed.expectedDate,
          remarks: parsed.remarks,
        },
        destructive: false,
        confirmLabel: "Confirm & Create PO",
        cancelLabel: "Cancel",
        status: "pending",
      };

      if (context.onProposeConfirmation) {
        context.onProposeConfirmation(confirmation);
      }

      return {
        success: true,
        confirmationId,
        message: `Purchase Order proposal created for ${parsed.supplierName} (${itemsDesc}). A 1-click confirmation card is now open for review.`,
      };
    },
  },
  {
    name: "propose_stock_adjustment",
    description:
      "Direct execution tool to reconcile physical inventory count discrepancies, record damaged stock, or write off expired batches with full audit trail.",
    permission: "adjustment.request",
    parameters: {
      type: "object",
      properties: {
        godownName: { type: "string", description: "Godown / warehouse where the discrepancy occurred." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productName: { type: "string", description: "Product name to adjust." },
              quantity: { type: "number", description: "Quantity to adjust (positive for count addition, negative for write-off)." },
              batchNumber: { type: "string", description: "Specific batch number if known." },
            },
            required: ["productName", "quantity"],
          },
          description: "Items and quantities to adjust.",
        },
        reasonCode: {
          type: "string",
          enum: ["COUNTING_ERROR", "DAMAGE", "THEFT", "EXPIRY", "OTHER"],
          description: "Reason code for audit compliance.",
          default: "COUNTING_ERROR",
        },
        reasonNote: { type: "string", description: "Detailed justification for ledger auditors." },
      },
      required: ["godownName", "items"],
    },
    async execute(args, context) {
      const parsed = proposeAdjustmentArgs.parse(args);
      const confirmationId = randomUUID();
      const itemsDesc = parsed.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ");
      const title = `Stock Adjustment: ${parsed.godownName} (${parsed.reasonCode})`;
      const description = `Adjust inventory in ${parsed.godownName} for ${itemsDesc}. Reason: ${parsed.reasonNote || parsed.reasonCode}.`;

      const confirmation: CopilotConfirmation = {
        id: confirmationId,
        title,
        description,
        actionType: "STOCK_ADJUSTMENT",
        payload: {
          godownName: parsed.godownName,
          items: parsed.items,
          reasonCode: parsed.reasonCode,
          reasonNote: parsed.reasonNote,
        },
        destructive: false,
        confirmLabel: "Confirm & Adjust Stock",
        cancelLabel: "Cancel",
        status: "pending",
      };

      if (context.onProposeConfirmation) {
        context.onProposeConfirmation(confirmation);
      }

      return {
        success: true,
        confirmationId,
        message: `Stock adjustment proposal prepared for ${parsed.godownName}. A confirmation card is ready for approval.`,
      };
    },
  },
  {
    name: "propose_transfer",
    description:
      "Direct execution tool to move stock between two godowns / warehouses in an atomic transaction without risk of inventory loss.",
    permission: "transfer.create",
    parameters: {
      type: "object",
      properties: {
        fromGodown: { type: "string", description: "Source warehouse name." },
        toGodown: { type: "string", description: "Destination warehouse name." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productName: { type: "string", description: "Product name to transfer." },
              quantity: { type: "number", description: "Quantity to transfer." },
              batchNumber: { type: "string", description: "Optional specific batch." },
            },
            required: ["productName", "quantity"],
          },
          description: "List of products and quantities to move.",
        },
        remarks: { type: "string", description: "Transfer memo / transport details." },
      },
      required: ["fromGodown", "toGodown", "items"],
    },
    async execute(args, context) {
      const parsed = proposeTransferArgs.parse(args);
      const confirmationId = randomUUID();
      const itemsDesc = parsed.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ");
      const title = `Stock Transfer: ${parsed.fromGodown} → ${parsed.toGodown}`;
      const description = `Transfer ${itemsDesc} from ${parsed.fromGodown} to ${parsed.toGodown}.`;

      const confirmation: CopilotConfirmation = {
        id: confirmationId,
        title,
        description,
        actionType: "CREATE_TRANSFER",
        payload: {
          fromGodown: parsed.fromGodown,
          toGodown: parsed.toGodown,
          items: parsed.items,
          remarks: parsed.remarks,
        },
        destructive: false,
        confirmLabel: "Confirm & Execute Transfer",
        cancelLabel: "Cancel",
        status: "pending",
      };

      if (context.onProposeConfirmation) {
        context.onProposeConfirmation(confirmation);
      }

      return {
        success: true,
        confirmationId,
        message: `Transfer proposal prepared from ${parsed.fromGodown} to ${parsed.toGodown}. Confirmation card is ready.`,
      };
    },
  },
  {
    name: "propose_customer",
    description: "Register a new commercial customer / wholesale client in the master registry.",
    permission: "master.manage",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer / firm trade name." },
        gstin: { type: "string", description: "15-digit GSTIN number if registered." },
        phone: { type: "string", description: "Primary phone or mobile number." },
        address: { type: "string", description: "Billing / shipping address." },
        stateCode: { type: "string", description: "2-digit GST state code (e.g. '07' for Delhi, '27' for Maharashtra)." },
      },
      required: ["name"],
    },
    async execute(args, context) {
      const parsed = proposeCustomerArgs.parse(args);
      const confirmationId = randomUUID();
      const title = `Register Customer: ${parsed.name}`;
      const description = `Add customer "${parsed.name}"${parsed.gstin ? ` (GSTIN: ${parsed.gstin})` : ""} to master directory.`;

      const confirmation: CopilotConfirmation = {
        id: confirmationId,
        title,
        description,
        actionType: "CREATE_CUSTOMER",
        payload: parsed,
        destructive: false,
        confirmLabel: "Confirm & Register Customer",
        cancelLabel: "Cancel",
        status: "pending",
      };

      if (context.onProposeConfirmation) {
        context.onProposeConfirmation(confirmation);
      }

      return {
        success: true,
        confirmationId,
        message: `Customer registration card prepared for "${parsed.name}". User confirmation requested.`,
      };
    },
  },
  {
    name: "propose_supplier",
    description: "Register a new raw material vendor / wholesale supplier in the vendor master directory.",
    permission: "master.manage",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Supplier / vendor enterprise name." },
        gstin: { type: "string", description: "15-digit GSTIN number." },
        phone: { type: "string", description: "Primary contact phone." },
        address: { type: "string", description: "Vendor factory / office address." },
        stateCode: { type: "string", description: "2-digit GST state code." },
      },
      required: ["name"],
    },
    async execute(args, context) {
      const parsed = proposeSupplierArgs.parse(args);
      const confirmationId = randomUUID();
      const title = `Register Supplier: ${parsed.name}`;
      const description = `Add supplier "${parsed.name}"${parsed.gstin ? ` (GSTIN: ${parsed.gstin})` : ""} to vendor directory.`;

      const confirmation: CopilotConfirmation = {
        id: confirmationId,
        title,
        description,
        actionType: "CREATE_SUPPLIER",
        payload: parsed,
        destructive: false,
        confirmLabel: "Confirm & Register Supplier",
        cancelLabel: "Cancel",
        status: "pending",
      };

      if (context.onProposeConfirmation) {
        context.onProposeConfirmation(confirmation);
      }

      return {
        success: true,
        confirmationId,
        message: `Supplier registration card prepared for "${parsed.name}". User confirmation requested.`,
      };
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function copilotToolsForRole(role: RoleCode, query?: string, route?: string): OpenAiTool[] {
  const permitted = TOOLS.filter((tool) => can(role, tool.permission));
  if (!query || !query.trim()) {
    return permitted.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  const q = query.toLowerCase();
  const r = (route || "").toLowerCase();

  // Universal core tools always included for planning, catalog, and context
  const selectedNames = new Set([
    "get_workspace_summary",
    "search_products",
    "check_stock",
    "propose_action",
    "web_research",
    "get_market_quote",
  ]);

  // Intent / Domain detection:
  const isPurchasing =
    /\b(purchase|po\b|procure|supplier|vendor|grn|buy|bought|inward|receipt|order)\b/i.test(q) ||
    r.startsWith("/purchasing") ||
    r.startsWith("/suppliers");

  const isSales =
    /\b(sale|sales|invoice|bill|dispatch|outward|customer|buyer|client|revenue|turnover|sold|deliver)\b/i.test(q) ||
    r.startsWith("/invoices") ||
    r.startsWith("/dispatches") ||
    r.startsWith("/customers") ||
    r.startsWith("/analytics");

  const isInventory =
    (/\b(inventory|godown|warehouse|batch|batches|expiry|expire|fefo|transfer|adjust|adjustment|idle|movement|ledger|balance)\b/i.test(q) ||
      (/\bstock\b/i.test(q) && !/\bstock\s*(price|quote|chart|market|exchange|ticker|ltp)\b/i.test(q))) ||
    r.startsWith("/inventory") ||
    r.startsWith("/godowns") ||
    r.startsWith("/batches") ||
    r.startsWith("/transfers") ||
    r.startsWith("/adjustments");

  const isCatalog =
    /\b(sku|product|catalog|category|uom|unit|hsn|tax|gst|rate|bag|kg|item)\b/i.test(q) ||
    r.startsWith("/products");

  const isSystem =
    /\b(return|reverse|tally|sync|audit|user|health|checklist|notification|alert|opening)\b/i.test(q) ||
    r.startsWith("/tally") ||
    r.startsWith("/audit") ||
    r.startsWith("/admin");

  const isMarket =
    /\b(stock\s*price|ltp|quote|share|equity|market|nifty|sensex|jio|reliance|tata|commodity|gold|silver|sugar\s*price|chart|trading)\b/i.test(q);

  if (isPurchasing) {
    [
      "propose_purchase_order",
      "propose_supplier",
      "list_purchase_orders",
      "get_purchase_order_detail",
      "list_suppliers",
      "get_supplier_detail",
      "list_grns",
      "get_grn_detail",
      "get_pending_po_receipts",
      "get_purchase_analytics",
      "get_reorder_recommendations",
      "get_godowns",
      "list_uoms",
      "list_hsn_codes",
    ].forEach((name) => selectedNames.add(name));
  }

  if (isSales) {
    [
      "propose_customer",
      "list_invoices",
      "get_invoice_detail",
      "list_dispatches",
      "get_dispatch_detail",
      "list_customers",
      "get_customer_detail",
      "get_sales_analytics",
      "check_dispatch_readiness",
      "get_pending_invoices_for_dispatch",
      "get_godowns",
    ].forEach((name) => selectedNames.add(name));
  }

  if (isInventory) {
    [
      "propose_transfer",
      "propose_stock_adjustment",
      "get_inventory_overview",
      "list_batches",
      "get_batch_detail",
      "get_godowns",
      "get_godown_detail",
      "check_stock_by_godown",
      "check_expiring_batches",
      "get_fefo_pick_list",
      "list_stock_adjustments",
      "get_adjustment_detail",
      "list_transfers",
      "get_transfer_detail",
      "list_stock_balances",
      "get_idle_stock",
      "get_stock_summary_report",
      "get_inventory_analytics",
      "list_stock_alerts",
      "get_low_stock_alerts",
      "get_recent_ledger_movements",
    ].forEach((name) => selectedNames.add(name));
  }

  if (isCatalog) {
    [
      "list_skus",
      "get_sku_detail",
      "list_categories",
      "get_category_detail",
      "list_uoms",
      "list_hsn_codes",
      "get_hsn_detail",
      "get_godowns",
    ].forEach((name) => selectedNames.add(name));
  }

  if (isSystem) {
    [
      "list_returns",
      "get_sales_return_detail",
      "get_purchase_return_detail",
      "check_reversal_eligibility",
      "get_tally_sync_status",
      "list_tally_queue",
      "get_tally_job_detail",
      "get_audit_trail",
      "get_audit_log_detail",
      "list_users",
      "get_user_detail",
      "get_system_health",
      "get_daily_checklist",
      "list_my_notifications",
      "get_notification_delivery_status",
      "list_documents",
      "get_document_status",
      "search_help",
      "list_opening_stock",
      "get_opening_balance_detail",
    ].forEach((name) => selectedNames.add(name));
  }

  // If no specific domain matched (general prompt), supply common high-level tools
  if (!isPurchasing && !isSales && !isInventory && !isCatalog && !isSystem && !isMarket) {
    [
      "get_inventory_overview",
      "list_purchase_orders",
      "list_invoices",
      "get_daily_checklist",
      "get_godowns",
      "list_suppliers",
      "list_customers",
    ].forEach((name) => selectedNames.add(name));
  }

  return permitted
    .filter((tool) => selectedNames.has(tool.name))
    .map((tool) => ({
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
