import { apiRoute } from "@/server/http/api-route";
import { listCodeSeries } from "@/server/modules/numbering/numbering.service";

/** Every code series with its format and the next code it will issue. */
export const GET = apiRoute({ permission: "settings.manage" }, () => listCodeSeries());
