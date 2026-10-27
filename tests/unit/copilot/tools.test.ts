import { describe, expect, it } from "vitest";
import type { RoleCode } from "@prisma/client";
import {
  copilotToolsForRole,
  executeCopilotTool,
  executeCopilotToolData,
  serializeToolResult,
} from "@/server/modules/copilot/tools";

const context = { role: "ADMIN" as RoleCode, route: "/dashboard" };

describe("Copilot tools", () => {
  it("exposes the read-only operational tools and no write tools", () => {
    const names = copilotToolsForRole("ADMIN").map((tool) => tool.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_workspace_summary",
        "search_products",
        "check_stock",
        "list_documents",
        "get_document_status",
        "get_fefo_pick_list",
        "check_expiring_batches",
        "get_godowns",
        "get_recent_ledger_movements",
        "check_dispatch_readiness",
        "get_reorder_recommendations",
      ]),
    );
    expect(names.some((name) => /^(create|update|delete|post|cancel|reverse)_/.test(name))).toBe(false);
  });

  it("keeps oversized tool results valid JSON", () => {
    const serialized = serializeToolResult({ rows: "x".repeat(7000) });
    const parsed = JSON.parse(serialized) as { truncated: boolean; note: string; preview: string };
    expect(parsed.truncated).toBe(true);
    expect(parsed.preview.length).toBeLessThanOrEqual(6000);
  });

  it("returns an error object for an unknown tool", async () => {
    const result = (await executeCopilotToolData("drop_everything", "{}", context)) as { error: string };
    expect(result.error).toContain("Unknown tool");
  });

  it("rejects malformed arguments without touching the database", async () => {
    const result = JSON.parse(await executeCopilotTool("search_products", "{not json", context)) as {
      error: string;
    };
    expect(result.error).toContain("valid JSON");
  });

  it("validates required arguments before querying", async () => {
    const result = JSON.parse(
      await executeCopilotTool("search_products", JSON.stringify({ query: "" }), context),
    ) as { error: string };
    expect(result.error).toContain("query");
  });

  it("enforces the tool permission before execution", async () => {
    const result = (await executeCopilotToolData("get_workspace_summary", "{}", {
      role: "UNKNOWN" as RoleCode,
      route: "/dashboard",
    })) as { error: string };
    expect(result.error).toContain("role cannot access");
  });
});
