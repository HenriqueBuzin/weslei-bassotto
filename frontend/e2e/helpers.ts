import type { Page } from "@playwright/test";

export function jwt(roles: string[] = ["user"]) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600, roles })}.signature`;
}

export async function mockLogin(page: Page, roles: string[] = ["user"]) {
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: jwt(roles), token_type: "bearer" }),
    }),
  );
}

export async function mockPlans(page: Page) {
  await page.route("**/api/v1/plans", (route) =>
    route.fulfill({
      json: [
        {
          slug: "trimestral",
          name: "Plano Trimestral",
          months: 3,
          cash: 597,
          subscription_total: 638,
          monthly: 212.66,
        },
        {
          slug: "semestral",
          name: "Plano Semestral",
          months: 6,
          cash: 997,
          subscription_total: 1093,
          monthly: 182.23,
        },
        {
          slug: "anual",
          name: "Plano Anual",
          months: 12,
          cash: 1597,
          subscription_total: 1863,
          monthly: 155.25,
        },
      ],
    }),
  );
}
