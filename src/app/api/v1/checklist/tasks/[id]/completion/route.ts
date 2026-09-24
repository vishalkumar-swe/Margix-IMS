import { checklistCompletionSchema } from "@/lib/validation/checklist";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { setTaskCompletion } from "@/server/modules/checklist/checklist.service";

/** Ticks an administrator task done for today, or reopens it ({ done: false }). */
export const POST = apiRoute({ body: checklistCompletionSchema }, ({ actor, params, body }) =>
  setTaskCompletion(actor, uuidParam(params, "id", "Checklist task"), body.done),
);
