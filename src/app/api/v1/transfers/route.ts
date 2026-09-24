import { transferCreateSchema, transferListQuerySchema } from "@/lib/validation/transfers";
import { apiRoute } from "@/server/http/api-route";
import { listTransfers } from "@/server/modules/transfers/transfer.queries";
import { postTransfer } from "@/server/modules/transfers/transfer.service";

export const GET = apiRoute({ permission: "transfer.view", query: transferListQuerySchema }, ({ query }) =>
  listTransfers(query),
);

export const POST = apiRoute(
  { permission: "transfer.create", body: transferCreateSchema, successStatus: 201 },
  ({ actor, body }) => postTransfer(actor, body),
);
