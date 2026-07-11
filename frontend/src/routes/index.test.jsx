import { describe, expect, it } from "vitest";

import { router } from "./index";

describe("application routes", () => {
  it("registers all public and protected routes", () => {
    const paths = router.routes.map((route) => route.path);
    expect(paths).toEqual(expect.arrayContaining([
      "/", "/checkout", "/questionario", "/login", "/cadastro", "/recuperar",
      "/redefinir-senha", "/assinante", "/app", "*",
    ]));
  });
});
