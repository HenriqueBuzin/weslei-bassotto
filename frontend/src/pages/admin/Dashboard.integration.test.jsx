import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("../../lib/api", () => ({ api }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
import Dashboard from "./Dashboard";

const submission = {
  id: "s1", customer: { name: "Aluno", email: "user@example.com", phone: "(54) 99999-0000" }, status: "active",
  plan: { name: "Plano Trimestral", start_date: "2026-01-01", end_date: "2026-04-01" }, answers: [], renewals: [],
  renewal_count: 0, answers_changed_at: "2026-01-02T00:00:00Z", answers_seen_at: null,
};
const event = { id: "e1", type: "payment_failed", created_at: "2026-01-03T12:00:00Z", seen_at: null };

describe("Dashboard", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.get.mockImplementation((url) => {
      if (url.endsWith("/questions")) return Promise.resolve({ data: [] });
      if (url.endsWith("/submissions")) return Promise.resolve({ data: [submission] });
      return Promise.resolve({ data: [event] });
    });
  });

  it("shows unseen answers and payment alerts", async () => {
    render(<Dashboard />);
    expect(await screen.findByText("Respostas novas/alteradas")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Alertas (1)" }));
    expect(screen.getByText("Falha no pagamento")).toBeInTheDocument();
  });

  it("marks an alert as seen", async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    render(<Dashboard />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Alertas (1)" }));
    await user.click(screen.getByRole("button", { name: "Marcar como visto" }));
    expect(api.post).toHaveBeenCalledWith("/consultancy/admin/events/e1/seen");
    expect(screen.getByRole("button", { name: "Alertas (0)" })).toBeInTheDocument();
  });

  it("creates, edits and deletes questionnaire questions", async () => {
    const question = { id: "q1", label: "Frequência semanal", type: "select", options: ["3", "4"], required: true, active: true, order: 2 };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/questions") ? [question] : [] }));
    api.post.mockResolvedValue({ data: question });
    api.patch.mockResolvedValue({ data: question });
    api.delete.mockResolvedValue({});
    render(<Dashboard />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Perguntas" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("heading", { name: "Editar pergunta" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Pergunta"));
    await user.type(screen.getByLabelText("Pergunta"), "Nova frequência");
    await user.click(screen.getByRole("button", { name: "Salvar pergunta" }));
    expect(api.patch).toHaveBeenCalledWith("/consultancy/admin/questions/q1", expect.objectContaining({ label: "Nova frequência" }));
    await user.click(screen.getByRole("button", { name: "Perguntas" }));
    await user.click(screen.getByRole("button", { name: "Apagar" }));
    expect(api.delete).toHaveBeenCalledWith("/consultancy/admin/questions/q1");
  });

  it("creates a new select question with normalized options", async () => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({ data: {} });
    render(<Dashboard />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Perguntas" }));
    await user.type(screen.getByLabelText("Pergunta"), "Qual seu nível?");
    await user.selectOptions(screen.getByLabelText("Tipo"), "select");
    await user.type(screen.getByLabelText(/Opções/), "Iniciante\nAvançado");
    await user.click(screen.getByRole("button", { name: "Salvar pergunta" }));
    expect(api.post).toHaveBeenCalledWith("/consultancy/admin/questions", expect.objectContaining({
      options: ["Iniciante", "Avançado"], type: "select",
    }));
  });

  it("updates contract fields and marks changed answers as seen", async () => {
    api.patch.mockResolvedValue({ data: { ...submission, status: "finished", answers_seen_at: "2026-01-03" } });
    api.post.mockResolvedValue({ data: { ...submission, answers_seen_at: "2026-01-03" } });
    render(<Dashboard />);
    const user = userEvent.setup();
    const status = await screen.findByDisplayValue("Ativo");
    await user.click(screen.getByRole("button", { name: "Marcar como visto" }));
    expect(api.post).toHaveBeenCalledWith("/consultancy/admin/submissions/s1/answers/seen");
    await user.selectOptions(status, "finished");
    expect(api.patch).toHaveBeenCalledWith("/consultancy/admin/submissions/s1", { status: "finished" });
  });

  it("shows a load error", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    render(<Dashboard />);
    expect(await screen.findByText(/Não foi possível carregar o painel/)).toBeInTheDocument();
  });
});
