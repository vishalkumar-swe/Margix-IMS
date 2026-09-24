import { apiRoute } from "@/server/http/api-route";
import { getDailyChecklist } from "@/server/modules/checklist/checklist.queries";

/** Today's checklist (IST) for the signed-in user. */
export const GET = apiRoute({}, ({ user }) => getDailyChecklist(user));
