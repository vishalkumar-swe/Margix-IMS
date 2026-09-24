import type { NotificationAlertType, NotificationRule } from "@prisma/client";
import { NOTIFICATION_ALERT_TYPES } from "@/lib/enums";
import type { NotificationRuleInput } from "@/lib/validation/notifications";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { withTx, type Tx } from "@/server/db/transaction";
import { ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";

/** A rule as used by the services: the stored row, or the defaults when there is none. */
export type NotificationRuleSettings = Omit<NotificationRule, "updatedAt" | "updatedById"> & {
  updatedAt: Date | null;
  /** False while the built-in defaults apply. */
  customised: boolean;
};

/**
 * Built-in defaults: low stock is announced immediately, slow-moving stock in
 * a morning digest, both in-app to administrators and store managers. E-mail
 * and WhatsApp stay off until recipients are configured.
 */
export const DEFAULT_NOTIFICATION_RULES: Record<NotificationAlertType, Omit<NotificationRuleSettings, "updatedAt" | "customised">> = {
  LOW_STOCK: {
    alertType: "LOW_STOCK",
    isEnabled: true,
    frequency: "IMMEDIATE",
    digestTime: "09:00",
    inAppEnabled: true,
    emailEnabled: false,
    whatsappEnabled: false,
    inAppRoles: ["ADMIN", "STORE_MANAGER"],
    inAppUserIds: [],
    emailRecipients: [],
    whatsappRecipients: [],
  },
  SLOW_MOVING: {
    alertType: "SLOW_MOVING",
    isEnabled: true,
    frequency: "DAILY_DIGEST",
    digestTime: "09:00",
    inAppEnabled: true,
    emailEnabled: false,
    whatsappEnabled: false,
    inAppRoles: ["ADMIN", "STORE_MANAGER"],
    inAppUserIds: [],
    emailRecipients: [],
    whatsappRecipients: [],
  },
};

function withDefaults(alertType: NotificationAlertType, row: NotificationRule | null): NotificationRuleSettings {
  if (!row) return { ...DEFAULT_NOTIFICATION_RULES[alertType], updatedAt: null, customised: false };
  return {
    alertType: row.alertType,
    isEnabled: row.isEnabled,
    frequency: row.frequency,
    digestTime: row.digestTime,
    inAppEnabled: row.inAppEnabled,
    emailEnabled: row.emailEnabled,
    whatsappEnabled: row.whatsappEnabled,
    inAppRoles: row.inAppRoles,
    inAppUserIds: row.inAppUserIds,
    emailRecipients: row.emailRecipients,
    whatsappRecipients: row.whatsappRecipients,
    updatedAt: row.updatedAt,
    customised: true,
  };
}

export async function getNotificationRule(alertType: NotificationAlertType, db: Tx = prisma): Promise<NotificationRuleSettings> {
  return withDefaults(alertType, await db.notificationRule.findUnique({ where: { alertType } }));
}

export async function listNotificationRules(): Promise<NotificationRuleSettings[]> {
  const rows = await prisma.notificationRule.findMany();
  return NOTIFICATION_ALERT_TYPES.map((type) => withDefaults(type, rows.find((r) => r.alertType === type) ?? null));
}

/** Saves who is notified about an alert type, how and how often (audited). */
export function saveNotificationRule(
  actor: Actor,
  alertType: NotificationAlertType,
  input: NotificationRuleInput,
): Promise<NotificationRuleSettings> {
  return withTx(async (tx) => {
    if (input.inAppUserIds.length > 0) {
      const found = await tx.user.count({ where: { id: { in: input.inAppUserIds } } });
      if (found !== input.inAppUserIds.length) {
        throw new ValidationError("The request is invalid.", [{ path: "inAppUserIds", message: "Unknown user selected." }]);
      }
    }
    const before = await getNotificationRule(alertType, tx);
    const data = { ...input, updatedById: actor.userId };
    const row = await tx.notificationRule.upsert({
      where: { alertType },
      update: data,
      create: { alertType, ...data },
    });
    const after = withDefaults(alertType, row);
    await recordAudit(tx, actor, {
      action: "NOTIFICATION_RULE_SAVED",
      entityType: "NotificationRule",
      entityId: alertType,
      oldData: before,
      newData: after,
    });
    return after;
  });
}
