import { describe, expect, it, vi } from "vitest";

import { routeLoaders, router } from "./index";

import { useLocation } from "react-router-dom";

function LocationProbe() {
  const { pathname, search } = useLocation();

  return <span data-testid="here">{`${pathname}${search}`}</span>;
}

describe("application routes", () => {
  it("registers all public and protected routes", () => {
    const paths = router.routes.map((route) => route.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/pagamento",
        "/questionario",
        "/entrar",
        "/cadastro",
        "/recuperar-senha",
        "/redefinir-senha",
        "/assinante",
        "/sem-permissao",
        // links shipped before the rename must still land somewhere
        "/login",
        "/checkout",
        "/recuperar",
        "/app",
        "*",
      ]),
    );
  });

  it("uses root as the basename fallback", async () => {
    vi.resetModules();
    vi.stubEnv("BASE_URL", "");
    const { router: fallbackRouter } = await import("./index");
    expect(fallbackRouter.basename).toBe("/");
    fallbackRouter.dispose();
    vi.unstubAllEnvs();
  });

  it("forwards a legacy link without dropping its query string", async () => {
    const { LEGACY_REDIRECTS } = await import("./paths");
    const { LegacyRedirect } = await import("./index");
    const { createMemoryRouter, RouterProvider } = await import("react-router-dom");
    const { render, screen } = await import("@testing-library/react");

    // A bookmarked /checkout?plano=anual has to reach the checkout still knowing
    // which plan was picked.
    const router = createMemoryRouter(
      [
        { path: "/checkout", element: <LegacyRedirect to={LEGACY_REDIRECTS["/checkout"]} /> },
        { path: LEGACY_REDIRECTS["/checkout"], element: <LocationProbe /> },
      ],
      { initialEntries: ["/checkout?plano=anual&renew=s1"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByTestId("here")).toHaveTextContent("/pagamento?plano=anual&renew=s1");
  });

  it("loads every code-split route", async () => {
    const modules = await Promise.all(Object.values(routeLoaders).map((load) => load()));

    // Sem numero fixo: o que importa e que todo loader declarado resolva num
    // componente, nao quantos sao. A contagem literal so quebrava a cada rota
    // nova, sem nunca ter pegado um defeito.
    expect(modules).toHaveLength(Object.keys(routeLoaders).length);
    expect(modules.every((module) => module.default)).toBe(true);
  });
});
