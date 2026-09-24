import { z } from "zod";
import { dateSchema, idSchema, optionalText, pageQuerySchema } from "./common";

export const auditQuerySchema = pageQuerySchema.extend({
  action: optionalText(60),
  entityType: optionalText(60),
  entityId: optionalText(60),
  userId: idSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
