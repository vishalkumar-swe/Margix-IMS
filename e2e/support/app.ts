import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { DEMO_PASSWORD } from "./env";

export const USERS = {
  manager: "manager@margix.local",
  operator: "operator@margix.local",
} as const;

/** Opens a fresh browser context signed in as the given demo user. */
export async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

/** Selects the first option whose text contains `text` (options may load asynchronously). */
export async function selectOptionContaining(select: Locator, text: string): Promise<void> {
  const option = select.locator("option", { hasText: text }).first();
  await expect(option).toBeAttached();
  await select.selectOption((await option.getAttribute("value"))!);
}

/** Calls the JSON API with the page's session and returns `data` from the envelope. */
export async function api<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1${path}`);
  expect(response.ok(), `GET ${path} → ${response.status()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

export async function stockTotal(page: Page, skuId: string): Promise<number> {
  return Number((await api<{ total: string }>(page, `/stock/skus/${skuId}`)).total);
}
