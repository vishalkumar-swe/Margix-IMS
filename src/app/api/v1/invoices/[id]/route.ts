import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getInvoiceDetail } from "@/server/modules/invoices/invoice.queries";

export const GET = apiRoute({ permission: "invoice.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "Invoice");
  return assertFound(await getInvoiceDetail(id), "Invoice", id);
});
