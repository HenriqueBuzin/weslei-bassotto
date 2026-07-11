import { describe, expect, it, vi } from "vitest";

import { router } from "./index";

describe("application routes", () => {
  it("registers all public and protected routes", () => {
    const paths = router.routes.map((route) => route.path);
    expect(paths).toEqual(expect.arrayContaining([
      "/", "/checkout", "/questionario", "/login", "/cadastro", "/recuperar",
      "/redefinir-senha", "/assinante", "/app", "*",
    ]));
  });

  it("uses root as the basename fallback", async () => {
    vi.resetModules();
    vi.stubEnv("BASE_URL", "");
    const { router: fallbackRouter } = await import("./index.jsx");
    expect(fallbackRouter.basename).toBe("/");
    fallbackRouter.dispose();
    vi.unstubAllEnvs();
  });
});
