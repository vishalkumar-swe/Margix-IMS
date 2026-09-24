import { stockAgingSettingsSchema, type StockAgingSettings } from "@/lib/validation/settings";
import type { Actor } from "@/server/actor";
import { getEnv } from "@/server/config/env";
import { prisma } from "@/server/db/client";
import { withTx, type Tx } from "@/server/db/transaction";
import { readAppSetting, writeAppSetting } from "./app-settings";

const KEY = "stock-aging";

/** Default time of the daily slow-moving scan (IST). */
export const DEFAULT_SLOW_MOVING_SCAN_TIME = "08:00";

/** Env values (SLOW_STOCK_DAYS / DEAD_STOCK_DAYS) are the defaults; administrators may override them. */
export function defaultStockAgingSettings(): StockAgingSettings {
  const env = getEnv();
  return {
    slowStockDays: env.SLOW_STOCK_DAYS,
    deadStockDays: env.DEAD_STOCK_DAYS,
    scanTime: DEFAULT_SLOW_MOVING_SCAN_TIME,
  };
}

/** Slow / dead stock thresholds in force (spec §6.7). */
export function getStockAgingSettings(db: Tx = prisma): Promise<StockAgingSettings> {
  return readAppSetting(KEY, stockAgingSettingsSchema, defaultStockAgingSettings(), db);
}

export function saveStockAgingSettings(actor: Actor, input: StockAgingSettings): Promise<StockAgingSettings> {
  return withTx(async (tx) => {
    const current = await getStockAgingSettings(tx);
    const next = stockAgingSettingsSchema.parse(input);
    await writeAppSetting(tx, actor, KEY, current, next);
    return next;
  });
}
