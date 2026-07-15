import { expect, test } from "@playwright/test";

test("password recovery and reset provide clear feedback", async ({ page }) => {
  await page.route("**/api/v1/auth/forgot-password", (route) =>
    route.fulfill({ json: { ok: true, email_sent: true } }),
  );
  await page.goto("/recuperar", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill("user@example.com");
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText(/Enviamos um link/i)).toBeVisible();

  await page.route("**/api/v1/auth/reset-password", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/redefinir-senha?token=valid-token", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Nova senha").fill("new-secret");
  await page.getByLabel("Confirmar senha").fill("new-secret");
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await expect(page.getByText(/Senha alterada com sucesso/i)).toBeVisible();
});
