import type { HsnCode } from "@prisma/client";
import type { HsnCreateInput, HsnUpdateInput } from "@/lib/validation/hsn";
import type { Actor } from "@/server/actor";
import { withTx, type Tx } from "@/server/db/transaction";
import { NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";

/**
 * HSN/SAC master maintenance. Codes are deactivated, never deleted, so the
 * products and documents that used them stay resolvable. A rate change
 * applies to products that follow the HSN rate from then on; documents keep
 * the rate they were posted with.
 */

export function createHsnCode(actor: Actor, input: HsnCreateInput) {
  return withTx(async (tx) => {
    const hsn = await tx.hsnCode.create({ data: input });
    await recordAudit(tx, actor, { action: "MASTER_CREATED", entityType: "HsnCode", entityId: null, newData: hsn });
    return hsn;
  });
}

export function updateHsnCode(actor: Actor, code: string, input: HsnUpdateInput) {
  return withTx(async (tx) => {
    const before = await tx.hsnCode.findUnique({ where: { code } });
    if (!before) throw new NotFoundError("HSN code", code);
    const after = await tx.hsnCode.update({ where: { code }, data: input });

    // Products that followed the old HSN rate follow the new one; deliberate overrides stay.
    if (input.gstRate !== undefined && !before.gstRate.equals(after.gstRate)) {
      await tx.sku.updateMany({ where: { hsnCode: code, gstRate: before.gstRate }, data: { gstRate: after.gstRate } });
    }
    await recordAudit(tx, actor, { action: "MASTER_UPDATED", entityType: "HsnCode", entityId: null, oldData: before, newData: after });
    return after;
  });
}

/**
 * Checks an HSN reference from a product or category: it must exist in the
 * master and be active. Reported against the `hsnCode` field.
 */
export async function requireActiveHsn(tx: Tx, code: string): Promise<HsnCode> {
  const hsn = await tx.hsnCode.findUnique({ where: { code } });
  if (!hsn) {
    throw new ValidationError("That HSN code is not in the HSN master.", [
      { path: "hsnCode", message: `HSN ${code} is not in the HSN master. Add it under Masters → HSN & GST first.` },
    ]);
  }
  if (!hsn.isActive) {
    throw new ValidationError("That HSN code is inactive.", [{ path: "hsnCode", message: `HSN ${code} is inactive.` }]);
  }
  return hsn;
}
