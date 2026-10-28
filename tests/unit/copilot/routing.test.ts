import { describe, expect, it } from "vitest";
import { detectDomains, shouldUseFastPath } from "@/server/modules/copilot/routing";
import { copilotToolsForRole, describeCopilotToolCall } from "@/server/modules/copilot/tools";
import { buildLlmPrompt } from "@/server/modules/copilot/knowledge";
import type { CopilotRuntimeContext, WorkspaceCounts } from "@/lib/copilot/types";

const counts: WorkspaceCounts = { activeSkus: 4, stockLines: 9, godowns: 2 } as WorkspaceCounts;
const ctx = (route: string): CopilotRuntimeContext => ({ route, role: "ADMIN" });

describe("detectDomains", () => {
  it("matches on wording", () => {
    expect([...detectDomains("create a purchase order for sugar").domains]).toContain("purchasing");
    expect([...detectDomains("show unpaid invoices").domains]).toContain("sales");
  });

  it("matches on the screen the question was asked from", () => {
    expect([...detectDomains("what is here?", "/masters/suppliers").domains]).toContain("purchasing");
    expect([...detectDomains("what is here?", "/transfers/t-1").domains]).toContain("inventory");
  });

  it("reads a share price as market, not warehouse inventory", () => {
    const { domains } = detectDomains("stock price of Reliance");
    expect(domains.has("market")).toBe(true);
    expect(domains.has("inventory")).toBe(false);
  });

  it("still treats godown stock as inventory", () => {
    expect(detectDomains("check sugar stock in the main godown").domains.has("inventory")).toBe(true);
  });

  it("flags questions needing live web intelligence", () => {
    expect(detectDomains("what is the mandi rate for makhana?").research).toBe(true);
    expect(detectDomains("list my godowns").research).toBe(false);
  });

  it("matches nothing for an off-domain greeting", () => {
    expect(detectDomains("hello there", "/dashboard").domains.size).toBe(0);
  });
});

describe("prompt and tool budget", () => {
  it("only ships the playbooks the question touches", () => {
    const lean = buildLlmPrompt("hello", ctx("/dashboard"), counts).system;
    const market = buildLlmPrompt("what is the LTP of Reliance?", ctx("/dashboard"), counts).system;
    expect(lean).not.toContain("LIVE STOCK MARKET");
    expect(market).toContain("LIVE STOCK MARKET");
    expect(market.length).toBeGreaterThan(lean.length);
  });

  it("keeps the cacheable core identical regardless of the question", () => {
    const a = buildLlmPrompt("hello", ctx("/dashboard"), counts).system;
    const b = buildLlmPrompt("show invoices", ctx("/invoices"), counts).system;
    const prefix = a.slice(0, 400);
    expect(b.startsWith(prefix)).toBe(true);
  });

  it("puts volatile runtime state last so the prefix stays stable", () => {
    const system = buildLlmPrompt("hello", ctx("/dashboard"), counts).system;
    expect(system.lastIndexOf("Runtime context JSON")).toBeGreaterThan(system.indexOf("Knowledge excerpts"));
  });

  it("scopes tool schemas to the matched domains", () => {
    const all = copilotToolsForRole("ADMIN");
    const scoped = copilotToolsForRole("ADMIN", "list my suppliers", "/masters/suppliers");
    expect(scoped.length).toBeLessThan(all.length);
    expect(scoped.map((t) => t.function.name)).toContain("list_suppliers");
    expect(scoped.map((t) => t.function.name)).not.toContain("get_tally_sync_status");
  });

  it("always includes the core planning and proposal tools", () => {
    const names = copilotToolsForRole("ADMIN", "hello", "/dashboard").map((t) => t.function.name);
    expect(names).toContain("propose_action");
    expect(names).toContain("search_products");
  });
});

describe("shouldUseFastPath", () => {
  it("answers plain lookups without the model", () => {
    expect(shouldUseFastPath("what suppliers do we have?", "list_suppliers")).toBe(true);
    expect(shouldUseFastPath("show my godowns", "godowns")).toBe(true);
  });

  it("defers anything asking for judgement to the model", () => {
    expect(shouldUseFastPath("why are supplier costs up?", "list_suppliers")).toBe(false);
    expect(shouldUseFastPath("analyze my invoices", "list_invoices")).toBe(false);
    expect(shouldUseFastPath("suppliers ki list kyun badi hai", "list_suppliers")).toBe(false);
  });

  it("never fast paths a mutation or an unknown intent", () => {
    expect(shouldUseFastPath("add sugar 100 bags", "propose_add_product")).toBe(false);
    expect(shouldUseFastPath("mandi rates for rice", "execute_web_research")).toBe(false);
  });

  it("defers long or mid-conversation turns to the model", () => {
    expect(shouldUseFastPath("list suppliers", "list_suppliers", 4)).toBe(false);
    expect(
      shouldUseFastPath(
        "please show me the suppliers we have registered in the system right now for sugar and rice",
        "list_suppliers",
      ),
    ).toBe(false);
  });
});

describe("describeCopilotToolCall", () => {
  it("turns a tool call into a readable step with its arguments", () => {
    const step = describeCopilotToolCall("get_purchase_order_detail", '{"identifier":"PO-2026-0001"}');
    expect(step.name).toBe("Purchase Order Detail");
    expect(step.tool).toBe("get_purchase_order_detail");
    expect(step.description).toBe("identifier: PO-2026-0001");
  });

  it("falls back to the tool description when there are no arguments", () => {
    expect(describeCopilotToolCall("list_suppliers", "{}").description).toBeTruthy();
  });

  it("survives the malformed argument fragments a stream can produce", () => {
    expect(describeCopilotToolCall("check_stock", '{"product":').name).toBe("Stock");
  });
});
