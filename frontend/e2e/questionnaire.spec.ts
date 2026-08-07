import { expect, test } from "@playwright/test";
import { mockLogin, mockPlans } from "./helpers";

test("approved subscriber completes the initial questionnaire", async ({ page }) => {
  await mockLogin(page);
  await mockPlans(page);
  await page.route("**/api/v1/consultancy/questions", (route) =>
    route.fulfill({
      json: [
        { id: "q1", label: "Quantas vezes treina por semana?", type: "number", required: true, options: [] },
        { id: "q2", label: "Possui alguma doença?", type: "textarea", required: true, options: [] },
      ],
    }),
  );
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: { id: "u1", email: "user@example.com", roles: ["user"] } }),
  );
  await page.route("**/api/v1/payments/pay-1/status**", (route) =>
    route.fulfill({ json: { id: "pay-1", status: "approved" } }),
  );
  await page.route("**/api/v1/consultancy/submissions", async (route) => {
    const request = route.request();
    expect(request.postDataJSON().payment_token).toBe("claim-secret");
    await route.fulfill({
      status: 201,
      json: {
        id: "s1",
        customer: { name: "Aluno", email: "user@example.com", phone: "(54) 99999-0000" },
        plan: { name: "Plano Trimestral", start_date: "2026-01-01", end_date: "2026-04-01" },
        status: "active",
        answers: [],
        renewals: [],
        answer_revisions: [],
        renewal_count: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    });
  });

  const target = "/questionario?plano=trimestral&payment_id=pay-1&payment_token=claim-secret";
  await page.goto(`/entrar?redirecionar=${encodeURIComponent(target)}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill("user@example.com");
  await page.locator("#login-password").fill("secret123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Nome completo").fill("Aluno Teste");
  await page.getByLabel("WhatsApp").fill("54999990000");
  await page.getByLabel(/Quantas vezes treina/).fill("4");
  await page.getByLabel(/Possui alguma doença/).fill("Não");
  await page.getByRole("button", { name: "Enviar questionário" }).click();
  await expect(page.getByRole("heading", { name: "Questionário enviado com sucesso." })).toBeVisible();
});

test("pending payment never exposes questionnaire fields", async ({ page }) => {
  await mockLogin(page);
  await mockPlans(page);
  await page.route("**/api/v1/consultancy/questions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: { id: "u1", email: "user@example.com", roles: ["user"] } }),
  );
  await page.route("**/api/v1/payments/pay-1/status**", (route) =>
    route.fulfill({ json: { id: "pay-1", status: "pending" } }),
  );
  const target = "/questionario?plano=trimestral&payment_id=pay-1&payment_token=claim-secret";
  await page.goto(`/entrar?redirecionar=${encodeURIComponent(target)}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill("user@example.com");
  await page.locator("#login-password").fill("secret123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/ainda está sendo confirmado/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar questionário" })).toHaveCount(0);
});
