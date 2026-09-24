import type { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as passwordRoute } from "@/app/api/v1/auth/password/route";
import { GET as meRoute } from "@/app/api/v1/auth/me/route";
import { POST as invoicesPost } from "@/app/api/v1/invoices/route";
import { POST as reorderPost } from "@/app/api/v1/reorder-rules/route";
import { GET as stockSummaryGet } from "@/app/api/v1/reports/stock-summary/route";
import { POST as transfersPost } from "@/app/api/v1/transfers/route";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/client";
import { createCustomer, createGodown, createUser } from "../../helpers/factories";
import { callRoute, sessionCookieFor } from "../../helpers/http";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;
const cookies = {} as Record<RoleCode, string>;

beforeEach(async () => {
  s = await stockedScenario("100");
  for (const [role, actor] of [
    ["ADMIN", s.admin],
    ["STORE_MANAGER", s.manager],
    ["WAREHOUSE_OPERATOR", s.operator],
  ] as const) {
    cookies[role] = await sessionCookieFor(actor.userId);
  }
  cookies.ACCOUNTS = await sessionCookieFor((await createUser("ACCOUNTS")).id);
  cookies.MANAGEMENT = await sessionCookieFor((await createUser("MANAGEMENT")).id);
});

describe("Phase 2 endpoints", () => {
  it("apply the role matrix to invoices, transfers and reorder rules", async () => {
    const customerId = (await createCustomer()).id;
    const invoice = { customerId, invoiceDate: "2026-09-24", items: [{ skuId: s.sku.id, quantity: "5" }] };
    expect((await callRoute(invoicesPost, { cookie: cookies.WAREHOUSE_OPERATOR, body: invoice })).status).toBe(403);
    expect((await callRoute(invoicesPost, { cookie: cookies.ACCOUNTS, body: invoice })).status).toBe(201);

    const destination = await createGodown();
    const transfer = {
      fromGodownId: s.godown.id,
      toGodownId: destination.id,
      items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "1" }],
    };
    expect((await callRoute(transfersPost, { cookie: cookies.MANAGEMENT, body: transfer })).status).toBe(403);
    expect((await callRoute(transfersPost, { cookie: cookies.WAREHOUSE_OPERATOR, body: transfer })).status).toBe(201);

    const rule = { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "10" };
    expect((await callRoute(reorderPost, { cookie: cookies.WAREHOUSE_OPERATOR, body: rule })).status).toBe(403);
    expect((await callRoute(reorderPost, { cookie: cookies.STORE_MANAGER, body: rule })).status).toBe(200);
  });

  it("serves reports as JSON or as a CSV download", async () => {
    const json = await callRoute<{ rows: unknown[] }>(stockSummaryGet, { cookie: cookies.MANAGEMENT });
    expect(json.status).toBe(200);
    expect(json.json.data!.rows).toHaveLength(1);

    const request = new Request("http://localhost:3000/api/v1/reports/stock-summary?format=csv", {
      headers: { cookie: cookies.MANAGEMENT, host: "localhost:3000" },
    });
    const csv = await stockSummaryGet(request, { params: Promise.resolve({}) });
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(csv.headers.get("content-disposition")).toMatch(/^attachment; filename="stock-summary_/);
    // Raw bytes: Response.text() would strip the UTF-8 BOM that Excel needs.
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain(`${s.sku.code},`);
  });
});

describe("change own password", () => {
  it("requires the current password and signs out other sessions only", async () => {
    const user = await createUser("ACCOUNTS", { passwordHash: await hashPassword("Old-Password-1") });
    const current = await sessionCookieFor(user.id);
    const other = await sessionCookieFor(user.id);

    const wrong = await callRoute(passwordRoute, {
      cookie: current,
      body: { currentPassword: "nope", newPassword: "New-Password-2" },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.json.error?.details).toEqual([{ path: "currentPassword", message: "The current password is incorrect." }]);

    const ok = await callRoute(passwordRoute, {
      cookie: current,
      body: { currentPassword: "Old-Password-1", newPassword: "New-Password-2" },
    });
    expect(ok.status).toBe(200);
    expect((await callRoute(meRoute, { cookie: current })).status).toBe(200);
    expect((await callRoute(meRoute, { cookie: other })).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "AUTH_PASSWORD_CHANGED", userId: user.id } })).toBe(1);
  });
});
