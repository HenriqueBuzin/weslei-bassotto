import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ post: vi.fn() }));
const auth = vi.hoisted(() => ({ markPasswordChanged: vi.fn(), roles: ["admin"] as string[] }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ api }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => navigate,
}));

import ChangePassword from "./ChangePassword";

function renderPage() {
  render(
    <MemoryRouter>
      <ChangePassword />
    </MemoryRouter>,
  );
}

async function fill(current: string, next: string, confirmation: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Senha temporária"), current);
  await user.type(screen.getByLabelText("Nova senha"), next);
  await user.type(screen.getByLabelText("Confirmar nova senha"), confirmation);
  await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
}

describe("ChangePassword", () => {
  beforeEach(() => {
    api.post.mockReset();
    navigate.mockReset();
    auth.markPasswordChanged.mockReset();
    auth.roles = ["admin"];
  });

  it("sends the change and takes an admin to the panel", async () => {
    api.post.mockResolvedValue({ data: { ok: true } });

    renderPage();
    await fill("TrocarNoPrimeiroAcesso1!", "senha-propria", "senha-propria");

    expect(api.post).toHaveBeenCalledWith("/auth/change-password", {
      current_password: "TrocarNoPrimeiroAcesso1!",
      password: "senha-propria",
    });
    expect(auth.markPasswordChanged).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/painel/alunos", { replace: true });
  });

  it("takes a plain subscriber to the subscriber area", async () => {
    auth.roles = ["user"];
    api.post.mockResolvedValue({ data: { ok: true } });

    renderPage();
    await fill("temporaria", "senha-propria", "senha-propria");

    expect(navigate).toHaveBeenCalledWith("/assinante", { replace: true });
  });

  it("refuses a confirmation that does not match, without calling the API", async () => {
    renderPage();
    await fill("temporaria", "senha-propria", "outra-coisa");

    expect(await screen.findByText("A confirmação não confere com a nova senha.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(auth.markPasswordChanged).not.toHaveBeenCalled();
  });

  it("shows the pt-BR message when the temporary password is wrong", async () => {
    api.post.mockRejectedValue({
      response: { data: { code: "current_password_invalid", detail: "The current password does not match" } },
    });

    renderPage();
    await fill("errada", "senha-propria", "senha-propria");

    expect(await screen.findByText("A senha atual está incorreta.")).toBeInTheDocument();
    expect(auth.markPasswordChanged).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to a generic message on an unknown failure", async () => {
    api.post.mockRejectedValue(new Error("boom"));

    renderPage();
    await fill("temporaria", "senha-propria", "senha-propria");

    expect(await screen.findByText("Não foi possível trocar a senha.")).toBeInTheDocument();
  });
});
