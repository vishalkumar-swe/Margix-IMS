import { apiRoute } from "@/server/http/api-route";
import {
  getSandboxStatus,
  purgeSandboxData,
  seedSandboxData,
} from "@/server/modules/copilot/sandbox.service";

export const GET = apiRoute({ permission: "dashboard.view" }, () => getSandboxStatus());

export const POST = apiRoute({ permission: "settings.manage" }, ({ actor }) => seedSandboxData(actor));

export const DELETE = apiRoute({ permission: "settings.manage" }, ({ actor }) => purgeSandboxData(actor));
