import { stockAgingSettingsSchema } from "@/lib/validation/settings";
import { apiRoute } from "@/server/http/api-route";
import { getStockAgingSettings, saveStockAgingSettings } from "@/server/modules/settings/stock-aging";

export const GET = apiRoute({ permission: "settings.manage" }, () => getStockAgingSettings());

/** Slow / dead stock days and the daily slow-moving scan time. */
export const PATCH = apiRoute({ permission: "settings.manage", body: stockAgingSettingsSchema }, ({ actor, body }) =>
  saveStockAgingSettings(actor, body),
);
