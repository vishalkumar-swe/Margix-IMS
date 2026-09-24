import { apiRoute } from "@/server/http/api-route";
import { markChecklistSeen } from "@/server/modules/checklist/checklist.service";

/** The daily popup was shown; it will not open by itself again today. */
export const POST = apiRoute({}, ({ user }) => markChecklistSeen(user.id));
