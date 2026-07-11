import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ authApi: { post } }));
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

describe("password flows", () => {
  beforeEach(() => post.mockReset());

  it("requests a password reset", async () => {
    post.mockResolvedValueOnce({ data: { email_sent: true } });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(await screen.findByText(/Enviamos um link/i)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/auth/forgot-password", { email: "user@example.com" });
  });

  it("does not reset when confirmations differ", async () => {
    render(<MemoryRouter initialEntries={["/redefinir-senha?token=abc"]}><ResetPassword /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nova senha"), "secret123");
    await user.type(screen.getByLabelText("Confirmar senha"), "different");
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(screen.getByText("As senhas não conferem.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("submits a valid new password", async () => {
    post.mockResolvedValueOnce({ data: { ok: true } });
    render(<MemoryRouter initialEntries={["/redefinir-senha?token=abc"]}><ResetPassword /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nova senha"), "secret123");
    await user.type(screen.getByLabelText("Confirmar senha"), "secret123");
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(await screen.findByText(/Senha alterada com sucesso/i)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/auth/reset-password", { token: "abc", password: "secret123" });
  });

  it("shows the generic forgot-password response and development link", async () => {
    post.mockResolvedValue({ data: { email_sent: false, reset_url: `${window.location.origin}/redefinir-senha?token=dev` } });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(await screen.findByText(/Se este e-mail estiver cadastrado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "abrir link" })).toBeInTheDocument();
  });

  it("rejects a reset URL without token", async () => {
    render(<MemoryRouter initialEntries={["/redefinir-senha"]}><ResetPassword /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nova senha"), "secret123");
    await user.type(screen.getByLabelText("Confirmar senha"), "secret123");
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(screen.getByText(/Link inválido/)).toBeInTheDocument();
  });

});
