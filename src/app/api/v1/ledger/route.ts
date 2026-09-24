import { ledgerQuerySchema } from "@/lib/validation/ledger";
import { apiRoute } from "@/server/http/api-route";
import { listLedgerEntries } from "@/server/modules/inventory/ledger.queries";

export const GET = apiRoute({ permission: "ledger.view", query: ledgerQuerySchema }, ({ query }) =>
  listLedgerEntries(query),
);
