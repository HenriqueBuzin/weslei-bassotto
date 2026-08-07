import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
const catalog = vi.hoisted(() => ({
  plans: {
    trimestral: { slug: "trimestral", name: "Plano Trimestral", months: 3 },
    semestral: { slug: "semestral", name: "Plano Semestral", months: 6 },
    anual: { slug: "anual", name: "Plano Anual", months: 12 },
  },
  loading: false,
  error: "",
}));
vi.mock("../../lib/api", () => ({ api }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("../../hooks/usePlanCatalog", () => ({
  usePlanCatalog: () => catalog,
}));
import SubscriberArea from "./SubscriberArea";

const question = { id: "q1", label: "Quantas vezes treina?", type: "number", required: true, options: [] };
const submission = {
  id: "s1",
  status: "active",
  plan: { name: "Plano Trimestral", start_date: "2026-01-01", end_date: "2026-04-01" },
  renewal_count: 0,
  answers: [{ question_id: "q1", value: "3" }],
};

describe("SubscriberArea", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.patch.mockReset();
    catalog.plans = {
      trimestral: { slug: "trimestral", name: "Plano Trimestral", months: 3 },
      semestral: { slug: "semestral", name: "Plano Semestral", months: 6 },
      anual: { slug: "anual", name: "Plano Anual", months: 12 },
    };
    catalog.loading = false;
    catalog.error = "";
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url.includes("questions") ? [question] : [submission] }),
    );
  });

  it("asks the subscriber to review once the questionnaire changed", async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.includes("questions")
          ? [question]
          : [{ ...submission, questionnaire_changed_at: "2026-02-01T10:00:00Z" }],
      }),
    );

    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/A anamnese foi atualizada/)).toBeInTheDocument();
  });

  it("stays quiet while the questionnaire is unchanged", async () => {
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Editar respostas" })).toBeInTheDocument();
    expect(screen.queryByText(/A anamnese foi atualizada/)).not.toBeInTheDocument();
  });

  it("shows contract dates in Brazilian format", async () => {
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    expect(await screen.findAllByText(/01\/01\/2026 até 01\/04\/2026/)).toHaveLength(2);
  });

  it("shows plan catalog loading and unavailable notices", async () => {
    catalog.loading = true;
    const loadingView = render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Carregando opções de renovação...")).toBeInTheDocument();
    loadingView.unmount();

    catalog.loading = false;
    catalog.error = "Falha ao carregar planos";
    catalog.plans = {};
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Falha ao carregar planos")).toBeInTheDocument();
  });

  it("saves edited answers and signals the admin", async () => {
    api.patch.mockResolvedValueOnce({ data: { ...submission, answers: [{ question_id: "q1", value: "4" }] } });
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Quantas vezes treina?/);
    await waitFor(() => expect(input).toHaveValue(3));
    await user.clear(input);
    await user.type(input, "4");
    await user.click(screen.getByRole("button", { name: "Salvar respostas" }));
    expect(api.patch).toHaveBeenCalledWith("/consultancy/me/submissions/s1/answers", {
      answers: [{ question_id: "q1", value: "4" }],
    });
    expect(await screen.findByText(/admin será sinalizado/i)).toBeInTheDocument();
  });

  it("renders all editable types and starts a renewal", async () => {
    const allQuestions = [
      { id: "t", label: "Texto", type: "text", required: false, options: [] },
      { id: "a", label: "Detalhes", type: "textarea", required: false, options: [] },
      { id: "s", label: "Nível", type: "select", required: false, options: ["Alto"] },
      { id: "b", label: "Fuma", type: "boolean", required: false, options: [] },
    ];
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url.includes("questions") ? allQuestions : [submission] }),
    );
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    expect(await screen.findByLabelText("Texto")).toBeInTheDocument();
    expect(screen.getByLabelText("Detalhes")).toBeInTheDocument();
    expect(screen.getByLabelText("Nível")).toBeInTheDocument();
    expect(screen.getByLabelText("Fuma")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Renovar" })[1]);
  });

  it("shows approved and pending renewal notices", async () => {
    render(
      <MemoryRouter initialEntries={["/assinante?pagamento=pending"]}>
        <SubscriberArea />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Pagamento em análise/)).toBeInTheDocument();
  });

  it("reloads after an approved renewal", async () => {
    render(
      <MemoryRouter initialEntries={["/assinante?pagamento=approved"]}>
        <SubscriberArea />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Pagamento aprovado e renovação registrada/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  it("shows required-question errors when saving", async () => {
    api.patch.mockRejectedValue({
      response: { data: { code: "required_questions_missing", missing_questions: ["Objetivo"] } },
    });
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Salvar respostas" }));
    expect(await screen.findByText("Objetivo")).toBeInTheDocument();
  });

  it("shows a generic save error", async () => {
    api.patch.mockRejectedValueOnce(new Error("offline"));
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Salvar respostas" }));
    expect(await screen.findByText(/Não foi possível salvar suas respostas/)).toBeInTheDocument();
  });

  it("switches contracts and edits every answer control", async () => {
    const questions = [
      { id: "text", label: "Texto", type: "text", required: false, options: [] },
      { id: "area", label: "Área", type: "textarea", required: false, options: [] },
      { id: "select", label: "Seleção", type: "select", required: false, options: ["A"] },
      { id: "bool", label: "Booleano", type: "boolean", required: false, options: [] },
    ];
    const second = {
      ...submission,
      id: "s2",
      plan: { ...submission.plan, name: "Plano Semestral" },
      answers: [{ question_id: "text", value: "" }],
    };
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url.includes("questions") ? questions : [submission, second] }),
    );
    api.patch.mockResolvedValue({ data: { ...second, answers: [] } });
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Plano Semestral/ }));
    await user.type(screen.getByLabelText("Texto"), "Resposta");
    await user.type(screen.getByLabelText("Área"), "Detalhes");
    await user.selectOptions(screen.getByLabelText("Seleção"), "A");
    await user.selectOptions(screen.getByLabelText("Booleano"), "Sim");
    await user.click(screen.getByRole("button", { name: "Salvar respostas" }));
    expect(screen.getByLabelText("Texto")).toHaveValue("Resposta");
  });

  it("shows an empty state and load failures", async () => {
    api.get.mockResolvedValue({ data: [] });
    const view = render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Nenhum plano encontrado")).toBeInTheDocument();
    view.unmount();
    api.get.mockRejectedValue(new Error("offline"));
    render(
      <MemoryRouter>
        <SubscriberArea />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Não foi possível carregar sua área/)).toBeInTheDocument();
  });
});
