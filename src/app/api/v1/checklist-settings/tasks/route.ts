import { checklistTaskSchema } from "@/lib/validation/checklist";
import { apiRoute } from "@/server/http/api-route";
import { listChecklistTasks } from "@/server/modules/checklist/checklist.queries";
import { createChecklistTask } from "@/server/modules/checklist/checklist.service";

export const GET = apiRoute({ permission: "settings.manage" }, () => listChecklistTasks());

export const POST = apiRoute(
  { permission: "settings.manage", body: checklistTaskSchema, successStatus: 201 },
  ({ actor, body }) => createChecklistTask(actor, body),
);
