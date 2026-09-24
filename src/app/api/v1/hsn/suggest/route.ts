import { hsnSuggestQuerySchema } from "@/lib/validation/hsn";
import { apiRoute } from "@/server/http/api-route";
import { suggestHsnCodes } from "@/server/modules/hsn/hsn.queries";

/** Recommended HSN codes for a product being created or edited. */
export const GET = apiRoute({ permission: "master.view", query: hsnSuggestQuerySchema }, ({ query }) => suggestHsnCodes(query));
