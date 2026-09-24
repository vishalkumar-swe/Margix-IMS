import { invoiceCreateSchema, invoiceListQuerySchema } from "@/lib/validation/invoices";
import { apiRoute } from "@/server/http/api-route";
import { listInvoices } from "@/server/modules/invoices/invoice.queries";
import { createInvoice } from "@/server/modules/invoices/invoice.service";

export const GET = apiRoute({ permission: "invoice.view", query: invoiceListQuerySchema }, ({ query }) =>
  listInvoices(query),
);

export const POST = apiRoute(
  { permission: "invoice.manage", body: invoiceCreateSchema, successStatus: 201 },
  ({ actor, body }) => createInvoice(actor, body),
);
