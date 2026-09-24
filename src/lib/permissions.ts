import type { RoleCode } from "@prisma/client";

/**
 * Role-based access control (spec §4.2). Isomorphic: the server enforces it,
 * the UI uses it only to hide actions a user cannot perform.
 */
export type Permission =
  | "dashboard.view"
  | "stock.view"
  | "ledger.view"
  | "ledger.reverse"
  | "po.view"
  | "po.manage"
  | "grn.view"
  | "grn.create"
  | "dispatch.view"
  | "dispatch.create"
  | "adjustment.view"
  | "adjustment.request"
  | "adjustment.approve"
  | "invoice.view"
  | "invoice.manage"
  | "transfer.view"
  | "transfer.create"
  | "return.view"
  | "return.create"
  | "alert.view"
  | "alert.manage"
  | "report.view"
  | "opening.post"
  | "master.view"
  | "master.manage"
  | "user.manage"
  | "tally.view"
  | "tally.sync"
  | "audit.view";

const ALL_ROLES: readonly RoleCode[] = [
  "ADMIN",
  "STORE_MANAGER",
  "WAREHOUSE_OPERATOR",
  "ACCOUNTS",
  "MANAGEMENT",
];

const PERMISSION_ROLES: Record<Permission, readonly RoleCode[]> = {
  "dashboard.view": ALL_ROLES,
  "stock.view": ALL_ROLES,
  "ledger.view": ALL_ROLES,
  "ledger.reverse": ["ADMIN", "STORE_MANAGER"],
  "po.view": ALL_ROLES,
  "po.manage": ["ADMIN", "STORE_MANAGER"],
  "grn.view": ALL_ROLES,
  "grn.create": ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR"],
  "dispatch.view": ALL_ROLES,
  "dispatch.create": ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR"],
  "adjustment.view": ALL_ROLES,
  "adjustment.request": ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR"],
  "adjustment.approve": ["ADMIN", "STORE_MANAGER"],
  "invoice.view": ALL_ROLES,
  "invoice.manage": ["ADMIN", "STORE_MANAGER", "ACCOUNTS"],
  "transfer.view": ALL_ROLES,
  "transfer.create": ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR"],
  "return.view": ALL_ROLES,
  "return.create": ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR"],
  "alert.view": ALL_ROLES,
  "alert.manage": ["ADMIN", "STORE_MANAGER"],
  "report.view": ALL_ROLES,
  "opening.post": ["ADMIN"],
  "master.view": ALL_ROLES,
  "master.manage": ["ADMIN"],
  "user.manage": ["ADMIN"],
  "tally.view": ["ADMIN", "STORE_MANAGER", "ACCOUNTS", "MANAGEMENT"],
  "tally.sync": ["ADMIN", "ACCOUNTS"],
  "audit.view": ["ADMIN", "STORE_MANAGER", "ACCOUNTS"],
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: "System Administrator",
  STORE_MANAGER: "Store Manager",
  WAREHOUSE_OPERATOR: "Warehouse Operator",
  ACCOUNTS: "Accounts",
  MANAGEMENT: "Management",
};

export function can(role: RoleCode, permission: Permission): boolean {
  return PERMISSION_ROLES[permission].includes(role);
}

export function permissionsFor(role: RoleCode): Permission[] {
  return (Object.keys(PERMISSION_ROLES) as Permission[]).filter((p) => can(role, p));
}
