import { z } from "zod";
import { idSchema, optionalText, pageQuerySchema } from "./common";

export const auditQuerySchema = pageQuerySchema.extend({
  entityType: optionalText(60),
  entityId: optionalText(60),
  userId: idSchema.optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
