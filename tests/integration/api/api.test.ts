import type { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as approveRoute } from "@/app/api/v1/adjustments/[id]/approve/route";
import { GET as adjustmentsGet, POST as adjustmentsPost } from "@/app/api/v1/adjustments/route";
import { GET as dashboardGet } from "@/app/api/v1/dashboard/route";
import { POST as dispatchPost } from "@/app/api/v1/dispatches/route";
import { GET as grnGet } from "@/app/api/v1/grns/[id]/route";
import { POST as reverseRoute } from "@/app/api/v1/ledger/[id]/reverse/route";
import { GET as ledgerGet } from "@/app/api/v1/ledger/route";
import { POST as grnPost } from "@/app/api/v1/purchase-orders/[id]/grns/route";
import { GET as poGet } from "@/app/api/v1/purchase-orders/[id]/route";
import { GET as poListGet, POST as poPost } from "@/app/api/v1/purchase-orders/route";
import { POST as tallySyncPost } from "@/app/api/v1/tally/sync/route";
import { GET as usersGet } from "@/app/api/v1/users/route";
import { prisma } from "@/server/db/client";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { actorFor, createGodown, createSku, createSupplier, createUser } from "../../helpers/factories";
import { callRoute, sessionCookieFor } from "../../helpers/http";

const cookies = {} as Record<RoleCode, string>;
let skuId: string;
let godownId: string;
let batchId: string;
let supplierId: string;

beforeEach(async () => {
  for (const role of ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR", "ACCOUNTS", "MANAGEMENT"] as RoleCode[]) {
    cookies[role] = await sessionCookieFor((await createUser(role)).id);
  }
  const admin = await prisma.user.findFirstOrThrow({ where: { role: { code: "ADMIN" } }, include: { role: true } });
  const sku = await createSku({ code: "RM-001" });
  skuId = sku.id;
  godownId = (await createGodown({ code: "MAIN" })).id;
  supplierId = (await createSupplier()).id;
  await postOpeningBalance(actorFor(admin), {
    godownId,
    asOf: "2026-04-01",
    items: [{ skuId, batchNumber: "B001", quantity: "100" }],
  });
  batchId = (await prisma.batch.findFirstOrThrow({ where: { skuId } })).id;
});

/** Recursively checks that no key or value looks like a password hash. */
function containsSecret(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("scrypt$") || value.startsWith("test$");
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([k, v]) => /password/i.test(k) || containsSecret(v));
  }
  return false;
}

describe("role-based access", () => {
  it.each<[string, RoleCode, number]>([
    ["operator can dispatch", "WAREHOUSE_OPERATOR", 201],
    ["accounts cannot dispatch", "ACCOUNTS", 403],
    ["management cannot dispatch", "MANAGEMENT", 403],
  ])("%s", async (_label, role, status) => {
    const res = await callRoute(dispatchPost, {
      cookie: cookies[role],
      body: { godownId, items: [{ skuId, batchId, quantity: "1" }] },
    });
    expect(res.status).toBe(status);
  });

  it("limits PO creation, adjustment approval, Tally sync and user admin to the spec roles", async () => {
    const poBody = { supplierId, orderDate: "2026-09-01", items: [{ skuId, orderedQty: "5" }] };
    expect((await callRoute(poPost, { cookie: cookies.WAREHOUSE_OPERATOR, body: poBody })).status).toBe(403);
    expect((await callRoute(poPost, { cookie: cookies.STORE_MANAGER, body: poBody })).status).toBe(201);

    const adj = await callRoute<{ id: string }>(adjustmentsPost, {
      cookie: cookies.WAREHOUSE_OPERATOR,
      body: { godownId, reasonCode: "DAMAGE", items: [{ skuId, batchId, quantity: "-1" }] },
    });
    expect(adj.status).toBe(201);
    const approveAs = (role: RoleCode) =>
      callRoute(approveRoute, { cookie: cookies[role], method: "POST", params: { id: adj.json.data!.id } });
    expect((await approveAs("WAREHOUSE_OPERATOR")).status).toBe(403);
    expect((await approveAs("STORE_MANAGER")).status).toBe(200);

    expect((await callRoute(tallySyncPost, { cookie: cookies.STORE_MANAGER, method: "POST" })).status).toBe(403);
    expect((await callRoute(tallySyncPost, { cookie: cookies.ACCOUNTS, method: "POST" })).status).toBe(200);

    expect((await callRoute(usersGet, { cookie: cookies.STORE_MANAGER })).status).toBe(403);
    expect((await callRoute(usersGet, { cookie: cookies.ADMIN })).status).toBe(200);
  });

  it("lets every role read stock views", async () => {
    for (const role of Object.keys(cookies) as RoleCode[]) {
      expect((await callRoute(ledgerGet, { cookie: cookies[role] })).status).toBe(200);
      expect((await callRoute(dashboardGet, { cookie: cookies[role] })).status).toBe(200);
    }
  });
});

describe("response contract", () => {
  it("returns the spec §10.4 error format for insufficient stock", async () => {
    const res = await callRoute(dispatchPost, {
      cookie: cookies.WAREHOUSE_OPERATOR,
      body: { godownId, items: [{ skuId, batchId, quantity: "150" }] },
    });
    expect(res.status).toBe(409);
    expect(res.json).toEqual({
      success: false,
      error: {
        code: "INSUFFICIENT_STOCK",
        message: "Requested quantity exceeds available batch stock.",
        details: { sku: "RM-001", godown: "MAIN", batch: "B001", available: "100", requested: "150" },
      },
    });
  });

  it("serialises decimals and entry numbers as strings", async () => {
    const res = await callRoute<{ items: { quantity: unknown; entryNo: unknown }[] }>(ledgerGet, {
      cookie: cookies.ADMIN,
    });
    expect(res.json.success).toBe(true);
    expect(res.json.data!.items[0]).toMatchObject({ quantity: "100", entryNo: "1" });
  });

  it("answers 404 for malformed and unknown ids, 400 for invalid bodies", async () => {
    expect((await callRoute(poGet, { cookie: cookies.ADMIN, params: { id: "not-a-uuid" } })).status).toBe(404);
    expect(
      (await callRoute(poGet, { cookie: cookies.ADMIN, params: { id: "00000000-0000-4000-8000-000000000000" } }))
        .status,
    ).toBe(404);

    const bad = await callRoute(dispatchPost, {
      cookie: cookies.ADMIN,
      body: { godownId, items: [{ skuId, batchId, quantity: "1.2345" }] },
    });
    expect(bad.status).toBe(400);
    expect(bad.json.error?.details).toEqual([
      { path: "items.0.quantity", message: "Enter a positive number with at most 3 decimal places." },
    ]);
  });

  it("never exposes password hashes", async () => {
    const manager = cookies.STORE_MANAGER;
    const po = await callRoute<{ id: string }>(poPost, {
      cookie: manager,
      body: { supplierId, orderDate: "2026-09-01", submit: true, items: [{ skuId, orderedQty: "5" }] },
    });
    const poItem = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.json.data!.id } });
    const grn = await callRoute<{ id: string }>(grnPost, {
      cookie: manager,
      params: { id: po.json.data!.id },
      body: { godownId, items: [{ purchaseOrderItemId: poItem.id, batchNumber: "B002", receivedQty: "5", acceptedQty: "5" }] },
    });
    const entry = await prisma.inventoryLedger.findFirstOrThrow({ where: { referenceId: grn.json.data!.id } });
    await callRoute(reverseRoute, { cookie: manager, params: { id: entry.id }, body: { reason: "test" } });

    const responses = await Promise.all([
      callRoute(poListGet, { cookie: manager }),
      callRoute(poGet, { cookie: manager, params: { id: po.json.data!.id } }),
      callRoute(grnGet, { cookie: manager, params: { id: grn.json.data!.id } }),
      callRoute(ledgerGet, { cookie: manager }),
      callRoute(adjustmentsGet, { cookie: manager }),
      callRoute(dashboardGet, { cookie: manager }),
      callRoute(usersGet, { cookie: cookies.ADMIN }),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(containsSecret(res.json)).toBe(false);
    }
  });
});
