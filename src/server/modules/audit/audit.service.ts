import type { Prisma } from "@prisma/client";
import type { Actor } from "@/server/actor";
import type { Tx } from "@/server/db/transaction";
import { toPlainJson } from "@/server/db/serialize";

export type AuditAction =
  | "AUTH_LOGIN_SUCCEEDED"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_LOGOUT"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_PASSWORD_RESET"
  | "MASTER_CREATED"
  | "MASTER_UPDATED"
  | "MASTER_IMPORTED"
  | "PO_CREATED"
  | "PO_UPDATED"
  | "PO_SUBMITTED"
  | "PO_CANCELLED"
  | "PO_SHORT_CLOSED"
  | "INVOICE_CREATED"
  | "INVOICE_CANCELLED"
  | "TRANSFER_POSTED"
  | "SALES_RETURN_POSTED"
  | "PURCHASE_RETURN_POSTED"
  | "REORDER_RULE_SAVED"
  | "AUTH_PASSWORD_CHANGED"
  | "GRN_POSTED"
  | "DISPATCH_POSTED"
  | "OPENING_BALANCE_POSTED"
  | "ADJUSTMENT_SUBMITTED"
  | "ADJUSTMENT_APPROVED"
  | "ADJUSTMENT_REJECTED"
  | "LEDGER_ENTRY_REVERSED"
  | "TALLY_SYNC_RUN"
  | "TALLY_JOB_RETRIED"
  | "SETTINGS_UPDATED"
  | "NOTIFICATION_RULE_SAVED"
  | "NOTIFICATION_TEST_SENT"
  | "NOTIFICATION_RETRIED"
  | "SLOW_MOVING_SCAN_RUN"
  | "CHECKLIST_TASK_CREATED"
  | "CHECKLIST_TASK_UPDATED"
  | "CHECKLIST_TASK_DELETED"
  | "CHECKLIST_TASK_COMPLETED"
  | "CHECKLIST_TASK_REOPENED";

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
}

/**
 * Appends an audit record (spec §11). Always called inside the business
 * transaction so the audit trail can never disagree with what was committed.
 */
export async function recordAudit(tx: Tx, actor: Actor | null, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: actor?.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldData: toJsonInput(entry.oldData),
      newData: toJsonInput(entry.newData),
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
      requestId: actor?.requestId ?? null,
    },
  });
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return toPlainJson(value) as Prisma.InputJsonValue;
}
