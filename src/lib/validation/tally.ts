import { z } from "zod";
import { pageQuerySchema } from "./common";

export const TALLY_SYNC_STATUSES = ["PENDING", "IN_PROGRESS", "SYNCED", "FAILED"] as const;

export const tallyJobsQuerySchema = pageQuerySchema.extend({
  status: z.enum(TALLY_SYNC_STATUSES).optional(),
});
