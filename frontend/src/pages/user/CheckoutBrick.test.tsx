import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: false,
  post: vi.fn(),
  brickOptions: null,
  catalog: {
    plans: {
      trimestral: {
        slug: "trimestral",
        name: "Plano Trimestral",
        months: 3,
        cash: 597,
        subscriptionTotal: 638,
        monthly: 212.66,
      },
      semestral: {
        slug: "semestral",
        name: "Plano Semestral",
        months: 6,
        cash: 997,
        subscriptionTotal: 1093,
        monthly: 182.23,
      },
      anual: { slug: "anual", name: "Plano Anual", months: 12, cash: 1597, subscriptionTotal: 1863, monthly: 155.25 },
    },
    loading: false,
    error: "",
  },
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: state.authenticated }) }));
vi.mock("../../lib/api", () => ({ api: { post: state.post } }));
vi.mock("../../hooks/usePlanCatalog", () => ({
  usePlanCatalog: () => state.catalog,
  selectPlan: (plans, slug) => plans[slug] || plans.trimestral,
}));

let CheckoutBrick: typeof import("./CheckoutBrick").default;

describe("CheckoutBrick", () => {
  beforeAll(async () => {
    vi.stubEnv("VITE_MP_PUBLIC_KEY", "TEST-public-key");
    ({ default: CheckoutBrick } = await import("./CheckoutBrick"));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    state.authenticated = false;
    state.post.mockReset();
    state.brickOptions = null;
    state.catalog.plans = {
      trimestral: {
        slug: "trimestral",
        name: "Plano Trimestral",
        months: 3,
        cash: 597,
        subscriptionTotal: 638,
        monthly: 212.66,
      },
      semestral: {
        slug: "semestral",
        name: "Plano Semestral",
        months: 6,
        cash: 997,
        subscriptionTotal: 1093,
        monthly: 182.23,
      },
      anual: { slug: "anual", name: "Plano Anual", months: 12, cash: 1597, subscriptionTotal: 1863, monthly: 155.25 },
    };
    state.catalog.loading = false;
    state.catalog.error = "";
    delete window.MercadoPago;
  });
  it("does not load card fields before authentication", () => {
    state.authenticated = false;
    render(
      <MemoryRouter initialEntries={["/checkout?plano=semestral"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Entre ou crie sua conta para assinar." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
      "href",
      expect.stringContaining("returnTo"),
    );
    expect(document.querySelector("#cardPaymentBrick_container")).not.toBeInTheDocument();
  });

  it("preserves renewal destination for anonymous accounts", () => {
    state.authenticated = false;
    render(
      <MemoryRouter initialEntries={["/checkout?plano=anual&renew=s1"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Criar conta" }).getAttribute("href")).toContain("renew%3Ds1");
  });

  it("shows plan catalog loading and unavailable states", () => {
    state.authenticated = true;
    state.catalog.loading = true;
    const view = render(
      <MemoryRouter initialEntries={["/checkout?plano=inexistente"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Carregando planos..." })).toBeInTheDocument();
    view.unmount();

    state.catalog.loading = false;
    state.catalog.error = "Falha ao carregar planos";
    state.catalog.plans = {};
    render(
      <MemoryRouter initialEntries={["/checkout?plano=inexistente"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Planos indisponíveis" })).toBeInTheDocument();
    expect(screen.getByText("Falha ao carregar planos")).toBeInTheDocument();
  });

  it("submits card data through the backend adapter", async () => {
    state.authenticated = true;
    state.post.mockResolvedValueOnce({ data: { payment_id: "p1", payment_token: "secret", status: "approved" } });
    window.MercadoPago = class {
      bricks() {
        return {
          create: async (_type, _container, options) => {
            state.brickOptions = options;
            options.callbacks.onReady();
            return { unmount: vi.fn() };
          },
        };
      }
    };
    render(
      <MemoryRouter initialEntries={["/checkout?plano=trimestral"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.brickOptions).not.toBeNull());
    await act(() =>
      state.brickOptions.callbacks.onSubmit({
        payer: { email: "card@example.com" },
        token: "card-token",
        payment_method_id: "visa",
      }),
    );
    expect(state.post).toHaveBeenCalledWith(
      "/payments/card-subscription",
      expect.objectContaining({
        plan_slug: "trimestral",
        payer_email: "card@example.com",
        card_token_id: "card-token",
      }),
    );
    delete window.MercadoPago;
  });

  it("supports cash renewal and handles card validation and gateway errors", async () => {
    state.authenticated = true;
    window.MercadoPago = class {
      bricks() {
        return {
          create: async (_type, _container, options) => {
            state.brickOptions = options;
            return { unmount: vi.fn() };
          },
        };
      }
    };
    render(
      <MemoryRouter initialEntries={["/checkout?plano=anual&renew=s1"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /À vista/ }));
    await user.click(screen.getByRole("button", { name: /Assinatura mensal/ }));
    await user.click(screen.getByRole("button", { name: /À vista/ }));
    await waitFor(() => expect(state.brickOptions).not.toBeNull());
    await expect(state.brickOptions.callbacks.onSubmit({})).rejects.toBeUndefined();
    expect(await screen.findByText(/Preencha o e-mail/)).toBeInTheDocument();
    state.post.mockRejectedValue({ response: { data: { detail: "Cartão recusado" } } });
    await expect(
      state.brickOptions.callbacks.onSubmit({ payer: { email: "card@example.com" }, card_token_id: "token" }),
    ).rejects.toBeTruthy();
    expect(await screen.findByText("Cartão recusado")).toBeInTheDocument();
    expect(state.post).toHaveBeenCalledWith(
      "/payments/me/renewals/s1",
      expect.objectContaining({ payment_mode: "cash" }),
    );
  });

  it("navigates after a successful renewal and reports Brick callback errors", async () => {
    state.authenticated = true;
    state.post.mockResolvedValue({ data: { status: "approved" } });
    window.MercadoPago = class {
      bricks() {
        return {
          create: async (_type, _container, options) => {
            state.brickOptions = options;
            return { unmount: vi.fn() };
          },
        };
      }
    };
    render(
      <MemoryRouter initialEntries={["/checkout?plano=semestral&renew=s1"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.brickOptions).not.toBeNull());
    act(() => state.brickOptions.callbacks.onError({ message: "Brick indisponível" }));
    expect(screen.getByText("Brick indisponível")).toBeInTheDocument();
    await act(() => state.brickOptions.callbacks.onSubmit({ payer: { email: "card@example.com" }, token: "token" }));
    expect(state.post).toHaveBeenCalledWith("/payments/me/renewals/s1", expect.any(Object));
  });

  it("loads the Mercado Pago script when the SDK is absent", async () => {
    state.authenticated = true;
    const append = vi.spyOn(document.body, "appendChild").mockImplementation((script) => {
      if (script.tagName !== "SCRIPT") return script;
      window.MercadoPago = class {
        bricks() {
          return {
            create: async (_type, _container, options) => {
              state.brickOptions = options;
              return {
                unmount: vi.fn(() => {
                  throw new Error("already removed");
                }),
              };
            },
          };
        }
      };
      queueMicrotask(() => script.onload?.());
      return script;
    });
    const view = render(
      <MemoryRouter initialEntries={["/checkout"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.brickOptions).not.toBeNull());
    expect(append).toHaveBeenCalled();
    view.unmount();
    append.mockRestore();
  });

  it("shows SDK initialization failures", async () => {
    state.authenticated = true;
    window.MercadoPago = class {
      constructor() {
        throw new Error("SDK inválido");
      }
    };
    render(
      <MemoryRouter initialEntries={["/checkout"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    expect(await screen.findByText("SDK inválido")).toBeInTheDocument();
  });

  it("uses generic SDK and payment errors", async () => {
    state.authenticated = true;
    window.MercadoPago = class {
      bricks() {
        return {
          create: async (_type, _container, options) => {
            state.brickOptions = options;
            return { unmount: vi.fn() };
          },
        };
      }
    };
    state.post.mockRejectedValueOnce({});
    render(
      <MemoryRouter initialEntries={["/checkout"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.brickOptions).not.toBeNull());
    act(() => state.brickOptions.callbacks.onError({}));
    expect(screen.getByText(/Erro no formulário/)).toBeInTheDocument();
    await expect(
      state.brickOptions.callbacks.onSubmit({ payer: { email: "card@example.com" }, token: "token" }),
    ).rejects.toEqual({});
    expect(await screen.findByText(/Não foi possível autorizar/)).toBeInTheDocument();
  });

  it("does not update state after unmounting during SDK load", async () => {
    state.authenticated = true;
    let resolveScript;
    const append = vi.spyOn(document.body, "appendChild").mockImplementation((script) => {
      if (script.tagName === "SCRIPT") resolveScript = script.onload;
      return script;
    });
    const view = render(
      <MemoryRouter>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    view.unmount();
    window.MercadoPago = class {};
    resolveScript?.();
    await act(async () => {});
    append.mockRestore();
  });

  it("ignores SDK load errors after unmounting", async () => {
    state.authenticated = true;
    let rejectScript;
    const append = vi.spyOn(document.body, "appendChild").mockImplementation((script) => {
      if (script.tagName === "SCRIPT") rejectScript = script.onerror;
      return script;
    });
    const view = render(
      <MemoryRouter>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    view.unmount();
    rejectScript?.(new Error("late failure"));
    await act(async () => {});
    append.mockRestore();
  });

  it("ignores a Brick that finishes creating after unmounting", async () => {
    state.authenticated = true;
    let resolveCreate;
    window.MercadoPago = class {
      bricks() {
        return {
          create: () =>
            new Promise((resolve) => {
              resolveCreate = resolve;
            }),
        };
      }
    };
    const view = render(
      <MemoryRouter>
        <CheckoutBrick />
      </MemoryRouter>,
    );
    await waitFor(() => expect(resolveCreate).toBeTypeOf("function"));
    view.unmount();
    resolveCreate({ unmount: vi.fn() });
    await act(async () => {});
  });

  it("uses the generic SDK error when the failure has no message", async () => {
    state.authenticated = true;
    window.MercadoPago = class {
      constructor() {
        throw {};
      }
    };

    render(
      <MemoryRouter initialEntries={["/checkout"]}>
        <CheckoutBrick />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Não foi possível carregar o Checkout Bricks do Mercado Pago.")).toBeInTheDocument();
  });
});
