import { z } from "zod";
import { MOVEMENT_TYPES } from "@/lib/enums";
import { idSchema, optionalText, requiredText } from "./common";

export { MOVEMENT_TYPES } from "@/lib/enums";

export const reversalSchema = z.object({ reason: requiredText(500, "Reason") });

export const ledgerQuerySchema = z.object({
  skuId: idSchema.optional(),
  godownId: idSchema.optional(),
  batchId: idSchema.optional(),
  movementType: z.enum(MOVEMENT_TYPES).optional(),
  referenceNo: optionalText(60),
  /** Entry number to continue after (keyset pagination, newest first). */
  cursor: z.coerce.bigint().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
