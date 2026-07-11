import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false, post: vi.fn(), brickOptions: null }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: state.authenticated }) }));
vi.mock("../../lib/api", () => ({ api: { post: state.post } }));
import CheckoutBrick from "./CheckoutBrick";

describe("CheckoutBrick", () => {
  it("does not load card fields before authentication", () => {
    state.authenticated = false;
    render(<MemoryRouter initialEntries={["/checkout?plano=semestral"]}><CheckoutBrick /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Entre ou crie sua conta para assinar." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute("href", expect.stringContaining("returnTo"));
    expect(document.querySelector("#cardPaymentBrick_container")).not.toBeInTheDocument();
  });

  it("submits card data through the backend adapter", async () => {
    state.authenticated = true;
    state.post.mockResolvedValueOnce({ data: { payment_id: "p1", payment_token: "secret", status: "approved" } });
    window.MercadoPago = class {
      bricks() {
        return { create: async (_type, _container, options) => {
          state.brickOptions = options;
          options.callbacks.onReady();
          return { unmount: vi.fn() };
        } };
      }
    };
    render(<MemoryRouter initialEntries={["/checkout?plano=trimestral"]}><CheckoutBrick /></MemoryRouter>);
    await waitFor(() => expect(state.brickOptions).not.toBeNull());
    await act(() => state.brickOptions.callbacks.onSubmit({ payer: { email: "card@example.com" }, token: "card-token", payment_method_id: "visa" }));
    expect(state.post).toHaveBeenCalledWith("/payments/card-subscription", expect.objectContaining({
      plan_slug: "trimestral", payer_email: "card@example.com", card_token_id: "card-token",
    }));
    delete window.MercadoPago;
  });
});
