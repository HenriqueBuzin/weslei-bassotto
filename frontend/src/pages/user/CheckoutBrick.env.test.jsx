import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("../../lib/api", () => ({ api: { post: vi.fn() } }));
vi.mock("../../hooks/usePlanCatalog", () => ({
  usePlanCatalog: () => ({
    plans: {
      trimestral: {
        slug: "trimestral",
        name: "Plano Trimestral",
        months: 3,
        cash: 597,
        subscriptionTotal: 638,
        monthly: 212.66,
      },
    },
    loading: false,
    error: "",
  }),
  selectPlan: (plans) => plans.trimestral,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("explains when the Mercado Pago public key is missing", async () => {
  vi.stubEnv("VITE_MP_PUBLIC_KEY", "");
  const { default: CheckoutBrick } = await import("./CheckoutBrick.jsx");
  render(
    <MemoryRouter initialEntries={["/checkout"]}>
      <CheckoutBrick />
    </MemoryRouter>,
  );
  expect(await screen.findByText(/VITE_MP_PUBLIC_KEY/)).toBeInTheDocument();
});
