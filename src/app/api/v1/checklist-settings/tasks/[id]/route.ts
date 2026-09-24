import { checklistTaskSchema } from "@/lib/validation/checklist";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { deleteChecklistTask, updateChecklistTask } from "@/server/modules/checklist/checklist.service";

export const PATCH = apiRoute({ permission: "settings.manage", body: checklistTaskSchema }, ({ actor, params, body }) =>
  updateChecklistTask(actor, uuidParam(params, "id", "Checklist task"), body),
);

export const DELETE = apiRoute({ permission: "settings.manage" }, ({ actor, params }) =>
  deleteChecklistTask(actor, uuidParam(params, "id", "Checklist task")),
);
