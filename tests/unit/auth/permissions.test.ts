import type { RoleCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, type Permission } from "@/lib/permissions";

/** Baseline matrix from spec §4.2 — any change here must be a deliberate policy decision. */
const SPEC_MATRIX: [Permission, RoleCode[]][] = [
  ["stock.view", ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR", "ACCOUNTS", "MANAGEMENT"]],
  ["po.manage", ["ADMIN", "STORE_MANAGER"]],
  ["grn.create", ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR"]],
  ["dispatch.create", ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR"]],
  ["adjustment.request", ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR"]],
  ["adjustment.approve", ["ADMIN", "STORE_MANAGER"]],
  ["tally.sync", ["ADMIN", "ACCOUNTS"]],
  ["user.manage", ["ADMIN"]],
  ["audit.view", ["ADMIN", "STORE_MANAGER", "ACCOUNTS"]],
];

const ROLES: RoleCode[] = ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR", "ACCOUNTS", "MANAGEMENT"];

describe("permission matrix", () => {
  it.each(SPEC_MATRIX)("%s", (permission, allowed) => {
    for (const role of ROLES) {
      expect(can(role, permission), `${role} → ${permission}`).toBe(allowed.includes(role));
    }
  });
});
