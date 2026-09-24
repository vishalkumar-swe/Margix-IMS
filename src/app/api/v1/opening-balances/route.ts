import { openingCreateSchema } from "@/lib/validation/opening";
import { apiRoute } from "@/server/http/api-route";
import { listOpeningBalances } from "@/server/modules/opening/opening.queries";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";

export const GET = apiRoute({ permission: "stock.view" }, () => listOpeningBalances());

export const POST = apiRoute(
  { permission: "opening.post", body: openingCreateSchema, successStatus: 201 },
  ({ actor, body }) => postOpeningBalance(actor, body),
);
