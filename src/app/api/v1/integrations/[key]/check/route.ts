import { apiRoute } from "@/server/http/api-route";
import { checkIntegration } from "@/server/integrations/registry";

/** Live connection check (Tally ping, SMTP handshake, WhatsApp number lookup). Sends nothing. */
export const POST = apiRoute({ permission: "settings.manage" }, ({ params }) => checkIntegration(params.key));
