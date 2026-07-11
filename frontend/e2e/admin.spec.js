import { expect, test } from "@playwright/test";
import { mockLogin } from "./helpers";

test("admin sees alerts and creates a questionnaire field", async ({ page }) => {
  await mockLogin(page, ["admin"]);
  let questions = [];
  await page.route("**/api/v1/consultancy/admin/questions", async (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      questions = [{ id: "q1", ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
      await route.fulfill({ status: 201, json: questions[0] });
    } else await route.fulfill({ json: questions });
  });
  await page.route("**/api/v1/consultancy/admin/submissions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/consultancy/admin/events", (route) => route.fulfill({ json: [
    { id: "e1", type: "payment_failed", created_at: new Date().toISOString(), seen_at: null },
  ] }));

  await page.goto("/login?returnTo=%2Fapp", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill("admin@example.com");
  await page.locator("#login-password").fill("secret123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Alertas (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Perguntas" }).click();
  await page.getByLabel("Pergunta").fill("Quantas vezes treina por semana?");
  await page.getByRole("button", { name: "Salvar pergunta" }).click();
  await expect(page.getByText("Quantas vezes treina por semana?")).toBeVisible();
});
