import { expect, test, type Page } from "@playwright/test";
import { api, selectOptionContaining, signIn, stockTotal, USERS } from "./support/app";

/**
 * Spec §14 worked scenario through the UI, as the roles that would do it:
 * opening 500 → GRN +300 = 800 → dispatch −200 = 600 → adjustment −25 = 575
 * → GRN +1000 = 1575 → reversal of that GRN = 575.
 * The seed provides RM-001 with 500 in batch B-100 of G001 and an open PO for 1000.
 */
const SKU = "RM-001";
const GODOWN = "Main Warehouse";

test("worked scenario: PO → GRN → dispatch → adjustment → reversal", async ({ browser }) => {
  const manager = await signIn(browser, USERS.manager);
  const operator = await signIn(browser, USERS.operator);
  const skuId = (await api<{ items: { id: string }[] }>(manager, `/skus?q=${SKU}`)).items[0].id;
  expect(await stockTotal(manager, skuId)).toBe(500);

  // Manager raises a purchase order for 300.
  await manager.goto("/purchase-orders/new");
  await selectOptionContaining(manager.getByLabel("Supplier"), "Global Polymers");
  await selectOptionContaining(manager.getByLabel("SKU for line 1"), SKU);
  await manager.getByLabel("Quantity for line 1").fill("300");
  await manager.getByRole("button", { name: "Create & open" }).click();
  await expect(manager).toHaveURL(/\/purchase-orders\/[0-9a-f-]{36}$/);

  // Operator receives it in full.
  await receiveGoods(operator, manager.url(), "B-200", "300");
  expect(await stockTotal(manager, skuId)).toBe(800);

  // Operator dispatches 200 from the opening batch.
  await operator.goto("/dispatches/new");
  await selectOptionContaining(operator.getByLabel("From godown"), GODOWN);
  await selectOptionContaining(operator.getByLabel("SKU for line 1"), SKU);
  await selectOptionContaining(operator.getByLabel("Batch for line 1"), "B-100");
  await operator.getByLabel("Quantity for line 1").fill("200");
  await operator.getByRole("button", { name: "Post dispatch" }).click();
  await expect(operator).toHaveURL(/\/dispatches\/[0-9a-f-]{36}$/);
  expect(await stockTotal(manager, skuId)).toBe(600);

  // Operator requests a 25 reduction; nothing moves until the manager approves.
  await operator.goto("/adjustments/new");
  await selectOptionContaining(operator.getByLabel("Godown"), GODOWN);
  await operator.getByLabel("Notes").fill("Bag torn during handling, counted twice.");
  await selectOptionContaining(operator.getByLabel("SKU for line 1"), SKU);
  await selectOptionContaining(operator.getByLabel("Batch for line 1"), "B-100");
  await operator.getByLabel("Quantity for line 1").fill("25");
  await operator.getByRole("button", { name: "Submit for approval" }).click();
  await expect(operator).toHaveURL(/\/adjustments\/[0-9a-f-]{36}$/);
  await expect(operator.getByRole("button", { name: "Approve & post" })).toHaveCount(0); // maker ≠ checker
  expect(await stockTotal(manager, skuId)).toBe(600);

  await manager.goto(operator.url());
  await manager.getByRole("button", { name: "Approve & post" }).click();
  await expect(manager.getByText("Approved", { exact: true }).first()).toBeVisible();
  expect(await stockTotal(manager, skuId)).toBe(575);

  // The seeded open PO for 1000 is received…
  const openPo = (await api<{ items: { id: string }[] }>(manager, "/purchase-orders?status=OPEN")).items[0];
  await receiveGoods(operator, `/purchase-orders/${openPo.id}`, "B-300", "1000");
  expect(await stockTotal(manager, skuId)).toBe(1575);

  // …then found to be a mistake and reversed by the manager.
  const latestGrn = (await api<{ items: { id: string }[] }>(manager, "/grns")).items[0];
  await manager.goto(`/grns/${latestGrn.id}`);
  await manager.getByRole("button", { name: "Reverse" }).click();
  await manager.getByLabel("Reason").fill("Delivery was for another company; returned at the gate.");
  await manager.getByRole("button", { name: "Post reversal" }).click();
  await expect(manager.getByRole("button", { name: "Reverse" })).toHaveCount(0);
  expect(await stockTotal(manager, skuId)).toBe(575);
});

async function receiveGoods(page: Page, poUrl: string, batch: string, quantity: string): Promise<void> {
  await page.goto(poUrl);
  await selectOptionContaining(page.getByLabel("Receiving godown"), GODOWN);
  await page.getByLabel(`Batch for ${SKU}`).fill(batch);
  await page.getByLabel(`Received quantity for ${SKU}`).fill(quantity);
  await page.getByLabel(`Accepted quantity for ${SKU}`).fill(quantity);
  await page.getByRole("button", { name: "Post GRN" }).click();
  await expect(page.getByText("posted. Stock has been updated.")).toBeVisible();
}
