import { invoiceCancelSchema } from "@/lib/validation/invoices";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { cancelInvoice } from "@/server/modules/invoices/invoice.service";

export const POST = apiRoute({ permission: "invoice.manage", body: invoiceCancelSchema }, ({ actor, params, body }) =>
  cancelInvoice(actor, uuidParam(params, "id", "Invoice"), body.reason),
);
