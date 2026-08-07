import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Questionnaire from "./Questionnaire";
import { api } from "../../lib/api";

const catalog = vi.hoisted(() => ({
  plans: {
    trimestral: { slug: "trimestral", name: "Plano Trimestral", months: 3 },
    semestral: { slug: "semestral", name: "Plano Semestral", months: 6 },
    anual: { slug: "anual", name: "Plano Anual", months: 12 },
  },
  loading: false,
  error: "",
}));
vi.mock("../../lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../hooks/usePlanCatalog", () => ({
  usePlanCatalog: () => catalog,
  selectPlan: (plans, slug) => plans[slug] || plans.trimestral,
}));

describe("Questionnaire payment gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog.plans = {
      trimestral: { slug: "trimestral", name: "Plano Trimestral", months: 3 },
      semestral: { slug: "semestral", name: "Plano Semestral", months: 6 },
      anual: { slug: "anual", name: "Plano Anual", months: 12 },
    };
    catalog.loading = false;
    catalog.error = "";
  });

  it("shows plan catalog loading and unavailable states", async () => {
    api.get.mockResolvedValue({ data: [] });
    catalog.loading = true;
    const view = render(
      <MemoryRouter>
        <Questionnaire />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Carregando planos..." })).toBeInTheDocument();
    view.unmount();

    catalog.loading = false;
    catalog.error = "Falha ao carregar planos";
    catalog.plans = {};
    render(
      <MemoryRouter initialEntries={["/questionario?plano=inexistente"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Planos indisponíveis" })).toBeInTheDocument();
    expect(screen.getByText("Falha ao carregar planos")).toBeInTheDocument();
  });

  it("keeps the form locked while payment is pending", async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url.includes("/status") ? { status: "pending" } : [] }),
    );
    render(
      <MemoryRouter initialEntries={["/questionario?plano=trimestral&payment_id=abc&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/ainda está sendo confirmado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar questionário/i })).not.toBeInTheDocument();
  });

  it("unlocks the form only after approved status", async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url.includes("/status") ? { status: "approved" } : [] }),
    );
    render(
      <MemoryRouter initialEntries={["/questionario?plano=trimestral&payment_id=abc&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /enviar questionário/i })).toBeInTheDocument());
  });

  it("shows the purchase link when payment data is missing", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter initialEntries={["/questionario?plano=invalid"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/finalize a compra/i)).toBeInTheDocument();
  });

  it("locks the form when payment status cannot be loaded", async () => {
    api.get.mockImplementation((url) =>
      url.includes("/status") ? Promise.reject(new Error("offline")) : Promise.resolve({ data: [] }),
    );
    render(
      <MemoryRouter initialEntries={["/questionario?payment_id=abc&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/finalize a compra/i)).toBeInTheDocument();
  });

  it("ignores completed questionnaire requests after unmounting", async () => {
    let resolveQuestions;
    let resolveProfile;
    let resolveStatus;
    api.get.mockImplementation((url) => {
      if (url.includes("/status")) return new Promise((resolve) => (resolveStatus = resolve));
      if (url.includes("/me")) return new Promise((resolve) => (resolveProfile = resolve));
      return new Promise((resolve) => (resolveQuestions = resolve));
    });
    const view = render(
      <MemoryRouter initialEntries={["/questionario?payment_id=abc&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    resolveStatus({ data: { status: "approved" } });
    expect(await screen.findByText(/Carregando perguntas/)).toBeInTheDocument();
    view.unmount();
    resolveQuestions({ data: [] });
    resolveProfile({ data: {} });
    await act(async () => {});

    let rejectQuestions;
    api.get.mockImplementation((url) =>
      url.includes("/questions")
        ? new Promise((_resolve, reject) => (rejectQuestions = reject))
        : new Promise(() => {}),
    );
    const rejectedView = render(
      <MemoryRouter>
        <Questionnaire />
      </MemoryRouter>,
    );
    rejectedView.unmount();
    rejectQuestions(new Error("late failure"));
    await act(async () => {});

    let rejectStatus;
    api.get.mockImplementation((url) =>
      url.includes("/status") ? new Promise((_resolve, reject) => (rejectStatus = reject)) : new Promise(() => {}),
    );
    const statusView = render(
      <MemoryRouter initialEntries={["/questionario?payment_id=abc&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    statusView.unmount();
    rejectStatus(new Error("late status failure"));
    await act(async () => {});
  });

  it("renders every question type, formats phone and submits answers", async () => {
    const questions = [
      { id: "text", label: "Objetivo", type: "text", required: true },
      { id: "number", label: "Dias", type: "number", required: false },
      { id: "textarea", label: "Doenças", type: "textarea", required: true },
      { id: "select", label: "Nível", type: "select", options: ["Iniciante"], required: true },
      { id: "boolean", label: "Fuma?", type: "boolean", required: true },
    ];
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.includes("/status")
          ? { status: "approved" }
          : url.includes("/me")
            ? { email: "user@example.com" }
            : questions,
      }),
    );
    api.post.mockResolvedValue({
      data: { plan: { name: "Plano Trimestral", start_date: "2026-01-01", end_date: "2026-04-01" } },
    });
    render(
      <MemoryRouter initialEntries={["/questionario?plano=trimestral&payment_id=p1&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Nome completo/), "Aluno Teste");
    await user.type(screen.getByLabelText(/WhatsApp/), "54991126308");
    await user.type(screen.getByLabelText(/Objetivo/), "Hipertrofia");
    await user.type(screen.getByLabelText(/Doenças/), "Nenhuma");
    await user.selectOptions(screen.getByLabelText(/Nível/), "Iniciante");
    await user.selectOptions(screen.getByLabelText(/Fuma/), "Não");
    await user.click(screen.getByRole("button", { name: /Enviar questionário/ }));
    expect(api.post).toHaveBeenCalledWith("/consultancy/submissions", expect.objectContaining({ payment_id: "p1" }));
    expect(await screen.findByText(/Questionário enviado com sucesso/)).toBeInTheDocument();
  });

  it("shows question loading and submission errors", async () => {
    api.get.mockImplementation((url) =>
      url.includes("/status")
        ? Promise.resolve({ data: { status: "approved" } })
        : url.includes("/questions")
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({ data: { email: "user@example.com" } }),
    );
    render(
      <MemoryRouter initialEntries={["/questionario?payment_id=p1&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument();
  });

  it("shows missing-question details returned by submission", async () => {
    const question = { id: "q1", label: "Objetivo", type: "text", required: false };
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.includes("/status")
          ? { status: "approved" }
          : url.includes("/me")
            ? { email: "user@example.com" }
            : [question],
      }),
    );
    api.post.mockRejectedValue({
      response: { data: { code: "required_questions_missing", missing_questions: ["Doenças"] } },
    });
    render(
      <MemoryRouter initialEntries={["/questionario?payment_id=p1&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Nome completo/), "Aluno");
    await user.type(screen.getByLabelText(/WhatsApp/), "54999990000");
    await user.click(screen.getByRole("button", { name: /Enviar questionário/ }));
    expect(await screen.findByText("Doenças")).toBeInTheDocument();
  });

  it("handles missing profile email and missing select options", async () => {
    const question = { id: "q1", label: "Escolha", type: "select", required: false };
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.includes("/status") ? { status: "approved" } : url.includes("/me") ? {} : [question],
      }),
    );
    render(
      <MemoryRouter initialEntries={["/questionario?payment_id=p1&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("E-mail")).toHaveValue("");
    expect(screen.getByLabelText("Escolha").options).toHaveLength(1);
  });

  it("shows a generic submission error", async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.includes("/status")
          ? { status: "approved" }
          : url.includes("/me")
            ? { email: "user@example.com" }
            : [],
      }),
    );
    api.post.mockRejectedValueOnce(new Error("offline"));
    render(
      <MemoryRouter initialEntries={["/questionario?payment_id=p1&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Nome completo/), "Aluno");
    await user.type(screen.getByLabelText(/WhatsApp/), "54999990000");
    await user.click(screen.getByRole("button", { name: /Enviar questionário/ }));
    expect(await screen.findByText(/Não foi possível enviar suas respostas/)).toBeInTheDocument();
  });

  it("normalizes invalid question data and shows a textual API detail", async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.includes("/status")
          ? { status: "approved" }
          : url.includes("/me")
            ? { email: "user@example.com" }
            : {},
      }),
    );
    api.post.mockRejectedValueOnce({
      response: { data: { code: "payment_already_used", detail: "This payment was already used" } },
    });
    render(
      <MemoryRouter initialEntries={["/questionario?payment_id=p1&payment_token=secret"]}>
        <Questionnaire />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    expect(await screen.findByText(/admin ainda não cadastrou perguntas/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Nome completo/), "Aluno");
    await user.type(screen.getByLabelText(/WhatsApp/), "54999990000");
    await user.click(screen.getByRole("button", { name: /Enviar questionário/ }));
    expect(await screen.findByText("Este pagamento já foi utilizado.")).toBeInTheDocument();
  });
});
