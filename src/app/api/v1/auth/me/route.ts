import { permissionsFor } from "@/lib/permissions";
import { apiRoute } from "@/server/http/api-route";

export const GET = apiRoute({}, async ({ user }) => ({
  user,
  permissions: permissionsFor(user.role),
}));
