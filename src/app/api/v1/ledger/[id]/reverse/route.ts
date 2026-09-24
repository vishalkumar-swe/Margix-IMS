import { reversalSchema } from "@/lib/validation/ledger";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";

export const POST = apiRoute(
  { permission: "ledger.reverse", body: reversalSchema, successStatus: 201 },
  ({ actor, params, body }) => reverseEntry(actor, uuidParam(params, "id", "Ledger entry"), body.reason),
);
