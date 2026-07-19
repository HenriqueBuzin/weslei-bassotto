import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const register = vi.hoisted(() => vi.fn());
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ register }) }));
import Register from "./Register";

describe("Register", () => {
  it("validates password confirmation before calling the API", async () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret123");
    await user.type(screen.getByLabelText("Confirmar senha"), "different");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(screen.getByText("As senhas não coincidem.")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers with matching credentials", async () => {
    register.mockResolvedValueOnce("token");
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret123");
    await user.type(screen.getByLabelText("Confirmar senha"), "secret123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(register).toHaveBeenCalledWith("user@example.com", "secret123");
  });

  it("shows registration API errors", async () => {
    register.mockRejectedValueOnce({ response: { data: { detail: "E-mail já cadastrado" } } });
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret123");
    await user.type(screen.getByLabelText("Confirmar senha"), "secret123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText("E-mail já cadastrado")).toBeInTheDocument();
  });

  it("uses the generic registration error", async () => {
    register.mockRejectedValueOnce(new Error("offline"));
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret123");
    await user.type(screen.getByLabelText("Confirmar senha"), "secret123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText(/Não foi possível criar sua conta/)).toBeInTheDocument();
  });
});
