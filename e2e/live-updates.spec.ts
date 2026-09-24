import { expect, test } from "@playwright/test";
import { api, selectOptionContaining, signIn, USERS } from "./support/app";

/**
 * Screens update themselves: while the manager watches FG-001's stock, the
 * operator dispatches 20 in another browser, and the manager's page shows the
 * new balance with no click and no reload. Uses FG-001 (seed: 1,200 PCS) so it
 * is independent of the RM-001 worked scenario.
 */
test("a dispatch posted elsewhere appears on an open stock screen", async ({ browser }) => {
  const manager = await signIn(browser, USERS.manager);
  const operator = await signIn(browser, USERS.operator);
  const skuId = (await api<{ items: { id: string }[] }>(manager, "/skus?q=FG-001")).items[0].id;

  await manager.goto(`/stock/${skuId}`);
  await expect(manager.getByText("1,200").first()).toBeVisible();
  // Survives only if the page is never reloaded.
  await manager.evaluate(() => ((window as unknown as { __stillHere: boolean }).__stillHere = true));

  await operator.goto("/dispatches/new");
  await selectOptionContaining(operator.getByLabel("From godown"), "Main Warehouse");
  await selectOptionContaining(operator.getByLabel("SKU for line 1"), "FG-001");
  await selectOptionContaining(operator.getByLabel("Batch for line 1"), "FG-2609");
  await operator.getByLabel("Quantity for line 1").fill("20");
  await operator.getByRole("button", { name: "Post dispatch" }).click();
  await expect(operator).toHaveURL(/\/dispatches\/[0-9a-f-]{36}$/);

  await expect(manager.getByText("1,180").first()).toBeVisible({ timeout: 5_000 });
  expect(await manager.evaluate(() => (window as unknown as { __stillHere?: boolean }).__stillHere)).toBe(true);
});
