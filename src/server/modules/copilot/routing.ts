/**
 * Request routing for the Copilot: which domain a question belongs to, and
 * whether it needs the model at all.
 *
 * Both the tool list and the system prompt are assembled from this one
 * detection so they can never drift apart, and so a question only ever pays
 * for the playbooks and schemas it actually needs. Shipping every playbook and
 * all 76 tool schemas on every turn costs ~6k input tokens per provider round,
 * and a tool-using answer takes several rounds.
 */

export const COPILOT_DOMAINS = [
  "purchasing",
  "sales",
  "inventory",
  "catalog",
  "system",
  "market",
] as const;

export type CopilotDomain = (typeof COPILOT_DOMAINS)[number];

/** Route prefixes that put a question in a domain regardless of its wording. */
const DOMAIN_ROUTES: Record<CopilotDomain, readonly string[]> = {
  purchasing: ["/purchase-orders", "/purchase-returns", "/grns", "/masters/suppliers"],
  sales: ["/invoices", "/dispatches", "/sales-returns", "/masters/customers", "/analytics"],
  inventory: ["/stock", "/ledger", "/transfers", "/adjustments", "/opening-stock", "/masters/godowns", "/alerts"],
  catalog: ["/masters/skus", "/masters/categories", "/masters/hsn"],
  system: ["/tally", "/audit", "/admin", "/account", "/reports"],
  market: [],
};

/**
 * Term matchers. Suffixes are matched explicitly (`invoice` must also catch
 * `invoices`) — a trailing `\b` after a singular stem silently misses every
 * plural, which is how most people phrase these questions.
 */
const DOMAIN_TERMS: Record<CopilotDomain, RegExp> = {
  purchasing: /\b(purchas\w*|po|procure\w*|supplier\w*|vendor\w*|grn\w*|buy|bought|inward\w*|receipt\w*|order\w*)\b/i,
  sales: /\b(sale\w*|invoice\w*|bill\w*|dispatch\w*|outward\w*|customer\w*|buyer\w*|client\w*|revenue\w*|turnover|sold|deliver\w*)\b/i,
  inventory:
    /\b(inventor\w*|godown\w*|warehouse\w*|batch\w*|expir\w*|fefo|transfer\w*|adjust\w*|idle|movement\w*|ledger\w*|balance\w*)\b/i,
  catalog: /\b(sku\w*|product\w*|catalog\w*|categor\w*|uom\w*|unit\w*|hsn|tax\w*|gst|rate\w*|bag\w*|kg|item\w*|barcode\w*|scan\w*|ean\w*|upc\w*)\b/i,
  system: /\b(return\w*|revers\w*|tally|sync\w*|audit\w*|user\w*|health|checklist\w*|notification\w*|alert\w*|opening)\b/i,
  market:
    /\b(stock\s*price|ltp|quote\w*|share\w*|equity|market\w*|nifty|sensex|commodit\w*|gold|silver|mandi\w*|apmc|arbitrage|trading)\b/i,
};

/** "stock price of Reliance" is a market question, not an inventory one. */
const MARKET_STOCK = /\bstock\s*(price|quote|chart|market|exchange|ticker|ltp)\b/i;

/** Questions that need live web intelligence rather than the database alone. */
const RESEARCH_TERMS = /\b(mandi|apmc|wholesale\s*(price|rate)|market\s*rate|arbitrage|benchmark|competitor|import|export|landed\s*cost)\b/i;

export interface CopilotRouting {
  domains: Set<CopilotDomain>;
  /** The question asks for live web intelligence. */
  research: boolean;
}

/** Domains a question touches, from its wording and the screen it was asked on. */
export function detectDomains(message: string, route = ""): CopilotRouting {
  const text = message || "";
  const path = route.toLowerCase();
  const domains = new Set<CopilotDomain>();

  for (const domain of COPILOT_DOMAINS) {
    const byRoute = DOMAIN_ROUTES[domain].some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
    let byTerm = DOMAIN_TERMS[domain].test(text);
    if (domain === "inventory" && byTerm && MARKET_STOCK.test(text) && !/\bgodown|batch|warehouse\b/i.test(text)) {
      byTerm = false;
    }
    if (byRoute || byTerm) domains.add(domain);
  }

  if (MARKET_STOCK.test(text)) domains.add("market");

  return { domains, research: RESEARCH_TERMS.test(text) };
}

/**
 * Intents the autonomous planner renders deterministically from live data.
 * These are pure reads with a fixed table layout, so the model would only add
 * latency, tokens and a chance to hallucinate over data it did not change.
 */
const FAST_PATH_INTENTS = new Set([
  "anchored_record",
  "audit_trail",
  "check_demo_status",
  "copilot_capabilities",
  "daily_checklist",
  "document_status",
  "expiring_batches",
  "godowns",
  "idle_stock",
  "inventory_overview",
  "list_batches",
  "list_categories",
  "list_customers",
  "list_dispatches",
  "list_grns",
  "list_hsn_codes",
  "list_invoices",
  "list_opening_stock",
  "list_purchase_orders",
  "list_returns",
  "list_stock_adjustments",
  "list_suppliers",
  "list_transfers",
  "list_uoms",
  "list_users",
  "my_notifications",
  "stock_check",
  "system_health",
  "tally_status",
]);

/**
 * Wording that asks for judgement, comparison or prose. A deterministic table
 * is the wrong answer to these even when the underlying intent is a plain read.
 */
const NEEDS_REASONING =
  /\b(why|how|explain\w*|analy\w*|compar\w*|recommend\w*|suggest\w*|should\s+i|advice|advise|plan\w*|forecast\w*|predict\w*|insight\w*|summar\w*|draft|write|opinion\w*|best|worst|optimi\w*|trend\w*|reason\w*)\b|\b(kyun|kyu|kaise|samjha\w*|sujhav|salah)\b/i;

const MAX_FAST_PATH_WORDS = 16;

/**
 * Tier 1: answer straight from the database with no provider call.
 *
 * Deliberately conservative — a wrong fast-path decision shows the user a bare
 * table where they wanted reasoning, so anything long, analytical or
 * mid-conversation falls through to the model.
 */
export function shouldUseFastPath(message: string, intent: string, historyLength = 0): boolean {
  if (!FAST_PATH_INTENTS.has(intent)) return false;
  const text = message.trim();
  if (!text) return false;
  if (NEEDS_REASONING.test(text)) return false;
  if (text.split(/\s+/).length > MAX_FAST_PATH_WORDS) return false;
  // Mid-conversation turns usually lean on what was said before; let the model
  // keep that thread rather than answering with a context-free table.
  if (historyLength > 0) return false;
  return true;
}
