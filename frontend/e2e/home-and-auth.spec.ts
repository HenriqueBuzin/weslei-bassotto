import { expect, test } from "@playwright/test";
import { mockLogin, mockPlans } from "./helpers";

test("approved home remains responsive without horizontal overflow", async ({ page }) => {
  await mockPlans(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Weslei Bassotto/i })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});

test("anonymous checkout asks for an account", async ({ page }) => {
  await mockPlans(page);
  await page.goto("/pagamento?plano=semestral", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Entre ou crie sua conta para assinar." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveAttribute("href", /redirecionar/);
});

test("login returns the subscriber to the selected destination", async ({ page }) => {
  await mockLogin(page);
  await mockPlans(page);
  await page.route("**/api/v1/consultancy/questions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/consultancy/me/submissions", (route) => route.fulfill({ json: [] }));
  await page.goto("/entrar?redirecionar=%2Fassinante", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill("user@example.com");
  await page.locator("#login-password").fill("secret123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/assinante$/);
  await expect(page.getByRole("heading", { name: "Nenhum plano encontrado" })).toBeVisible();
});
