import { hsnCodeSchema, hsnUpdateSchema } from "@/lib/validation/hsn";
import { NotFoundError } from "@/server/errors";
import { apiRoute } from "@/server/http/api-route";
import { updateHsnCode } from "@/server/modules/hsn/hsn.service";

export const PATCH = apiRoute({ permission: "master.manage", body: hsnUpdateSchema }, ({ actor, params, body }) => {
  const code = hsnCodeSchema.safeParse(params.code);
  if (!code.success) throw new NotFoundError("HSN code", String(params.code));
  return updateHsnCode(actor, code.data, body);
});
