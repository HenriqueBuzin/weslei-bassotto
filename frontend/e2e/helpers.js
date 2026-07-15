export function jwt(roles = ["user"]) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600, roles })}.signature`;
}

export async function mockLogin(page, roles = ["user"]) {
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: jwt(roles), token_type: "bearer" }),
    }),
  );
}
