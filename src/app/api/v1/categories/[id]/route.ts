import { categoryUpdateSchema } from "@/lib/validation/masters";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { updateCategory } from "@/server/modules/masters/masters.service";

export const PATCH = apiRoute({ permission: "master.manage", body: categoryUpdateSchema }, ({ actor, params, body }) =>
  updateCategory(actor, uuidParam(params, "id", "Category"), body),
);
