import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders recurrence issues, renewal history and answers", async () => {
    const detailed = { ...submission, recurrence_status: "failed", recurrence_issue: "Cartão recusado", renewal_count: 1,
      renewals: [{ plan_name: "Plano Semestral", start_date: "2026-04-01", end_date: "2026-10-01", created_at: "2026-01-01" }],
      answers: [{ question_id: "q1", label: "Doenças", value: "Nenhuma" }], answers_seen_at: "2026-01-02T01:00:00Z" };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/submissions") ? [detailed] : [] }));
    render(<Dashboard />);
    expect(await screen.findByText(/Problema na recorrência/)).toBeInTheDocument();
    expect(screen.getByText(/Cartão recusado/)).toBeInTheDocument();
    expect(screen.getByText("Histórico de renovação")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma")).toBeInTheDocument();
  });

  it("cancels question editing", async () => {
    const question = { id: "q1", label: "Pergunta teste", type: "text", options: [], required: false, active: false, order: 0 };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/questions") ? [question] : [] }));
    render(<Dashboard />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Perguntas" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /Cancelar edição/ }));
    expect(screen.getByRole("heading", { name: "Nova pergunta" })).toBeInTheDocument();
  });

  it.each([
    ["save", "Não foi possível salvar a pergunta"],
    ["delete", "Não foi possível apagar a pergunta"],
    ["submission", "Não foi possível atualizar o aluno"],
    ["answers", "Não foi possível marcar as respostas como vistas"],
    ["event", "Não foi possível marcar o alerta como visto"],
  ])("shows the %s action error", async (action, message) => {
    const question = { id: "q1", label: "Pergunta teste", type: "text", options: [], required: true, active: true, order: 0 };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/questions") ? [question] : url.endsWith("/submissions") ? [submission] : [event] }));
    render(<Dashboard />);
    const user = userEvent.setup();
    if (action === "save") { api.post.mockRejectedValueOnce(new Error()); await user.click(await screen.findByRole("button", { name: "Perguntas" })); await user.type(screen.getByLabelText("Pergunta"), "Nova pergunta"); await user.click(screen.getByRole("button", { name: "Salvar pergunta" })); }
    if (action === "delete") { api.delete.mockRejectedValueOnce(new Error()); await user.click(await screen.findByRole("button", { name: "Perguntas" })); await user.click(screen.getByRole("button", { name: "Apagar" })); }
    if (action === "submission") { api.patch.mockRejectedValueOnce(new Error()); await user.selectOptions(await screen.findByDisplayValue("Ativo"), "finished"); }
    if (action === "answers") { api.post.mockRejectedValueOnce(new Error()); await user.click(await screen.findByRole("button", { name: "Marcar como visto" })); }
    if (action === "event") { api.post.mockRejectedValueOnce(new Error()); await user.click(await screen.findByRole("button", { name: "Alertas (1)" })); await user.click(screen.getByRole("button", { name: "Marcar como visto" })); }
    expect(await screen.findByText((content) => content.includes(message.replace("Não foi possível ", "")))).toBeInTheDocument();
  });

  it("exercises selection, contract fields and every question control", async () => {
    const second = { ...submission, id: "s2", customer: { ...submission.customer, name: "Segundo aluno", email: "second@example.com" },
      answers_changed_at: null, answers_seen_at: null, answers: [{ question_id: "q-empty", label: "Resposta vazia", value: "" }] };
    const question = { id: "q1", label: "Pergunta teste", type: "select", options: ["A"], required: false, active: false, order: 3 };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/questions") ? [question] : url.endsWith("/submissions") ? [submission, second] : [{ ...event, id: "e2", type: "custom", seen_at: "2026-01-01" }] }));
    api.patch.mockImplementation((url, patch) => Promise.resolve({ data: { ...(url.includes("s2") ? second : submission), ...patch } }));
    render(<Dashboard />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Segundo aluno/ }));
    expect(screen.getByText("Sem resposta")).toBeInTheDocument();
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-02-01" } });
    fireEvent.change(dates[1], { target: { value: "2026-05-01" } });
    await user.type(screen.getByLabelText("Referência Mercado Pago"), "ref-2");
    await user.click(screen.getByRole("button", { name: "Perguntas" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Ordem")); await user.type(screen.getByLabelText("Ordem"), "5");
    await user.click(screen.getByLabelText("Obrigatória"));
    await user.click(screen.getByLabelText("Ativa"));
    expect(screen.getByLabelText("Obrigatória")).toBeChecked();
    expect(screen.getByLabelText("Ativa")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Alunos e respostas" }));
    await user.click(screen.getByRole("button", { name: /Aluno Respostas/ }));
    await user.click(screen.getByRole("button", { name: /Alertas/ }));
    expect(screen.getByText("custom")).toBeInTheDocument();
  });

  it("renders empty lists and recurrence without a detail", async () => {
    const recurrence = { ...submission, recurrence_status: "failed", recurrence_issue: "", answers_changed_at: null };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/submissions") ? [recurrence] : [] }));
    render(<Dashboard />);
    expect(await screen.findByText(/Recorrência com atenção: failed/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Perguntas" }));
    expect(screen.getByText(/Cadastre a primeira pergunta/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Alertas (0)" }));
    expect(screen.getByText(/Nenhum alerta registrado/)).toBeInTheDocument();
  });

  it("normalizes missing question options and preserves unrelated rows during updates", async () => {
    const second = { ...submission, id: "s2", customer: { ...submission.customer, name: "Segundo" }, answers_changed_at: null };
    const question = { id: "q1", label: "Sem opções", type: "select", required: true, active: true, order: 0 };
    const secondEvent = { ...event, id: "e2", seen_at: "2026-01-04" };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/questions") ? [question] : url.endsWith("/submissions") ? [submission, second] : [event, secondEvent] }));
    api.post.mockImplementation((url) => Promise.resolve({ data: url.includes("answers/seen") ? { ...submission, answers_seen_at: "2026-01-05" } : { ok: true } }));
    render(<Dashboard />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Marcar como visto" }));
    await user.click(screen.getByRole("button", { name: "Perguntas" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText(/Opções/)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /Alertas/ }));
    await user.click(screen.getByRole("button", { name: "Marcar como visto" }));
    expect(screen.getAllByText(/Falha no pagamento/)).toHaveLength(2);
  });
});
