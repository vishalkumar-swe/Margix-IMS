import { expect, test } from "@playwright/test";
import { signIn, USERS } from "./support/app";

/**
 * Security headers are sent, and the Content Security Policy does not block
 * anything the app itself needs (scripts, styles, fonts, images, live
 * updates, the barcode engine) on the main screens.
 */
const PAGES = [
  "/",
  "/stock",
  "/ledger",
  "/purchase-orders",
  "/purchase-orders/new",
  "/dispatches/new",
  "/analytics",
  "/masters/skus",
  "/admin/integrations",
  "/admin/notifications",
];

test("every response carries the security headers", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("the main screens load without Content Security Policy violations", async ({ browser }) => {
  const page = await signIn(browser, USERS.admin);
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /content security policy/i.test(message.text())) violations.push(message.text());
  });

  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
  }
  // The barcode engine (ZXing WebAssembly) compiles under the policy.
  const wasmCompiles = await page.evaluate(async () => {
    const bytes = await (await fetch("/vendor/zxing/zxing_reader-3.1.3.wasm")).arrayBuffer();
    return WebAssembly.validate(bytes) && (await WebAssembly.compile(bytes)) instanceof WebAssembly.Module;
  });

  expect(wasmCompiles).toBe(true);
  expect(violations).toEqual([]);
});
