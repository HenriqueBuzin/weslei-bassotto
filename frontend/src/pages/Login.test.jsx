import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const login = vi.hoisted(() => vi.fn());
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ login }) }));
vi.mock("../lib/jwt", () => ({ readRoles: () => ["user"] }));
import Login from "./Login";

describe("Login", () => {
  it("submits credentials and remember preference", async () => {
    login.mockResolvedValueOnce("token");
    render(<MemoryRouter initialEntries={["/login?returnTo=%2Fcheckout%3Fplano%3Danual"]}><Login /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret123");
    await user.click(screen.getByLabelText("Lembrar de mim"));
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(login).toHaveBeenCalledWith("user@example.com", "secret123", true);
  });

  it("shows the API error", async () => {
    login.mockRejectedValueOnce({ response: { data: { detail: "Credenciais inválidas" } } });
    render(<MemoryRouter><Login /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "wrong123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Credenciais inválidas")).toBeInTheDocument();
  });
});
