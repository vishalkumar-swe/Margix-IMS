import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import type { Tx } from "@/server/db/transaction";
import { logger } from "@/server/observability/logger";
import { recordAudit } from "@/server/modules/audit/audit.service";

/** Keys of the `app_setting` store; each owns one JSON document. */
export type AppSettingKey = "stock-aging" | "checklist";

/**
 * Reads a settings document, merged over its defaults. A missing row means
 * "defaults"; an unreadable one (e.g. written by an older version) is logged
 * and replaced by the defaults rather than breaking every page.
 */
export async function readAppSetting<S extends z.ZodType>(
  key: AppSettingKey,
  schema: S,
  defaults: z.output<S>,
  db: Tx = prisma,
): Promise<z.output<S>> {
  const row = await db.appSetting.findUnique({ where: { key } });
  if (!row) return defaults;
  const parsed = schema.safeParse({ ...(defaults as object), ...(row.value as object) });
  if (parsed.success) return parsed.data;
  logger.warn("app setting unreadable, using defaults", { key, issues: parsed.error.issues.length });
  return defaults;
}

/** Stores a (validated) settings document and audits old → new, inside the caller's transaction. */
export async function writeAppSetting(tx: Tx, actor: Actor, key: AppSettingKey, oldValue: unknown, value: unknown): Promise<void> {
  const json = value as Prisma.InputJsonValue;
  await tx.appSetting.upsert({
    where: { key },
    update: { value: json, updatedById: actor.userId },
    create: { key, value: json, updatedById: actor.userId },
  });
  await recordAudit(tx, actor, {
    action: "SETTINGS_UPDATED",
    entityType: "AppSetting",
    entityId: key,
    oldData: oldValue,
    newData: value,
  });
}
