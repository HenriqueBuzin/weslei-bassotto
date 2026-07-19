import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ authApi: { post } }));
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

describe("password API failures", () => {
  beforeEach(() => post.mockReset());

  it("shows a forgot-password failure", async () => {
    post.mockImplementationOnce(async () => {
      throw { response: { data: { detail: "SMTP indisponível" } } };
    });
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "user@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar link" }).closest("form"));
    expect(await screen.findByText("SMTP indisponível")).toBeInTheDocument();
  });

  it("shows a reset failure", async () => {
    post.mockImplementationOnce(async () => {
      throw { response: { data: { detail: "Link expirado" } } };
    });
    render(
      <MemoryRouter initialEntries={["/redefinir-senha?token=abc"]}>
        <ResetPassword />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "secret123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Alterar senha" }).closest("form"));
    expect(await screen.findByText("Link expirado")).toBeInTheDocument();
  });

  it("uses generic password error fallbacks", async () => {
    post.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    const forgot = render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "user@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar link" }).closest("form"));
    expect(await screen.findByText(/Não foi possível solicitar/)).toBeInTheDocument();
    forgot.unmount();
    post.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    render(
      <MemoryRouter initialEntries={["/redefinir-senha?token=abc"]}>
        <ResetPassword />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "secret123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Alterar senha" }).closest("form"));
    expect(await screen.findByText(/Não foi possível alterar/)).toBeInTheDocument();
  });
});
