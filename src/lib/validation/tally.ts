import { z } from "zod";
import { TALLY_SYNC_STATUSES } from "@/lib/enums";
import { pageQuerySchema } from "./common";

export { TALLY_SYNC_STATUSES } from "@/lib/enums";

export const tallyJobsQuerySchema = pageQuerySchema.extend({
  status: z.enum(TALLY_SYNC_STATUSES).optional(),
});
