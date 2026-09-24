import { checklistSettingsSchema } from "@/lib/validation/checklist";
import { apiRoute } from "@/server/http/api-route";
import { getChecklistSettings } from "@/server/modules/checklist/checklist.queries";
import { saveChecklistSettings } from "@/server/modules/checklist/checklist.service";

export const GET = apiRoute({ permission: "settings.manage" }, () => getChecklistSettings());

/** Which system items appear, whether the popup opens on login and whether sign-out asks first. */
export const PATCH = apiRoute({ permission: "settings.manage", body: checklistSettingsSchema }, ({ actor, body }) =>
  saveChecklistSettings(actor, body),
);
