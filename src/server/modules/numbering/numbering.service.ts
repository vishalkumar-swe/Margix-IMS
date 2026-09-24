import {
  CODE_SERIES,
  CODE_SERIES_KEYS,
  codeDateParts,
  formatCode,
  periodOf,
  validateSeriesSettings,
  type CodeSeriesKey,
  type CodeSeriesSettings,
} from "@/lib/numbering";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { withTx, type Tx } from "@/server/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";

/**
 * Numbering master: allocates master codes (SKU-000001) and document numbers
 * (PO-2026-000001) from configurable series, and never hands out a code that
 * is already in use — whether it was allocated before a pattern change, typed
 * by hand or imported.
 */

type Db = Tx | typeof prisma;

/** Is this code already taken in the series' own table? */
const IN_USE: Record<CodeSeriesKey, (db: Db, code: string) => Promise<unknown>> = {
  SKU: (db, code) => db.sku.findUnique({ where: { code }, select: { id: true } }),
  CUSTOMER: (db, code) => db.customer.findUnique({ where: { code }, select: { id: true } }),
  SUPPLIER: (db, code) => db.supplier.findUnique({ where: { code }, select: { id: true } }),
  GODOWN: (db, code) => db.godown.findUnique({ where: { code }, select: { id: true } }),
  PO: (db, code) => db.purchaseOrder.findUnique({ where: { poNumber: code }, select: { id: true } }),
  GRN: (db, code) => db.grn.findUnique({ where: { grnNumber: code }, select: { id: true } }),
  INV: (db, code) => db.invoice.findUnique({ where: { invoiceNumber: code }, select: { id: true } }),
  DSP: (db, code) => db.outward.findUnique({ where: { outwardNumber: code }, select: { id: true } }),
  TRF: (db, code) => db.transfer.findUnique({ where: { transferNumber: code }, select: { id: true } }),
  SRN: (db, code) => db.salesReturn.findUnique({ where: { returnNumber: code }, select: { id: true } }),
  PRN: (db, code) => db.purchaseReturn.findUnique({ where: { returnNumber: code }, select: { id: true } }),
  ADJ: (db, code) => db.adjustment.findUnique({ where: { adjustmentNumber: code }, select: { id: true } }),
  OPN: (db, code) => db.openingBalance.findUnique({ where: { openingNumber: code }, select: { id: true } }),
};

/** Upper bound on codes skipped in one allocation (hand-typed codes in the way). */
const MAX_SKIPS = 10_000;

export async function getSeriesSettings(db: Db, key: CodeSeriesKey): Promise<CodeSeriesSettings> {
  const row = await db.codeSeries.findUnique({ where: { key } });
  return row ? { prefix: row.prefix, pattern: row.pattern, padding: row.padding } : { ...CODE_SERIES[key].defaults };
}

/**
 * Allocates the next free code of a series inside the caller's transaction.
 * The counter row stays locked until that transaction ends, so concurrent
 * allocations are serialised and every code is unique.
 */
export async function allocateCode(tx: Tx, key: CodeSeriesKey, date: Date = new Date()): Promise<string> {
  const settings = await getSeriesSettings(tx, key);
  const parts = codeDateParts(date);
  const counterKey = `${key}:${periodOf(settings.pattern, parts)}`;

  for (let skipped = 0; skipped < MAX_SKIPS; skipped++) {
    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO "document_sequence" ("key", "last_value")
      VALUES (${counterKey}, 1)
      ON CONFLICT ("key") DO UPDATE SET "last_value" = "document_sequence"."last_value" + 1
      RETURNING "last_value"`;
    const code = formatCode(settings, rows[0].last_value, parts);
    if (!(await IN_USE[key](tx, code))) return code;
  }
  throw new ConflictError("INVALID_STATE", `No free ${CODE_SERIES[key].label.toLowerCase()} code was found.`);
}

/**
 * The code the next allocation will most likely produce — for showing in a
 * form. Not reserved: the actual code is allocated when the record is saved.
 */
export async function previewNextCode(key: CodeSeriesKey, date: Date = new Date(), db: Db = prisma): Promise<string> {
  const settings = await getSeriesSettings(db, key);
  const parts = codeDateParts(date);
  const counter = await db.documentSequence.findUnique({
    where: { key: `${key}:${periodOf(settings.pattern, parts)}` },
    select: { lastValue: true },
  });
  let next = (counter?.lastValue ?? 0) + 1;
  for (let skipped = 0; skipped < MAX_SKIPS; skipped++, next++) {
    const code = formatCode(settings, next, parts);
    if (!(await IN_USE[key](db, code))) return code;
  }
  return formatCode(settings, next, parts);
}

export async function listCodeSeries() {
  const rows = await prisma.codeSeries.findMany({ include: { updatedBy: { select: { name: true } } } });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return Promise.all(
    CODE_SERIES_KEYS.map(async (key) => {
      const row = byKey.get(key);
      return {
        key,
        label: CODE_SERIES[key].label,
        kind: CODE_SERIES[key].kind,
        settings: await getSeriesSettings(prisma, key),
        customised: Boolean(row),
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy.name ?? null,
        nextCode: await previewNextCode(key),
      };
    }),
  );
}

export function isCodeSeriesKey(value: string): value is CodeSeriesKey {
  return (CODE_SERIES_KEYS as string[]).includes(value);
}

/** Changes a series' prefix, pattern or digit count (admin). Codes already issued never change. */
export async function updateCodeSeries(actor: Actor, key: string, input: CodeSeriesSettings) {
  if (!isCodeSeriesKey(key)) throw new NotFoundError("Code series", key);
  const settings: CodeSeriesSettings = {
    prefix: input.prefix.trim().toUpperCase(),
    pattern: input.pattern.trim().toUpperCase(),
    padding: input.padding,
  };
  const errors = validateSeriesSettings(key, settings);
  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Check the numbering settings.", Object.entries(errors).map(([path, message]) => ({ path, message })));
  }

  return withTx(async (tx) => {
    const before = await getSeriesSettings(tx, key);
    const saved = await tx.codeSeries.upsert({
      where: { key },
      create: { key, ...settings, updatedById: actor.userId },
      update: { ...settings, updatedById: actor.userId },
    });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "CodeSeries",
      entityId: null,
      oldData: { key, ...before },
      newData: { key, ...settings },
    });
    return saved;
  });
}
