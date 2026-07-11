import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Questionnaire from "./Questionnaire";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

describe("Questionnaire payment gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the form locked while payment is pending", async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("/status") ? { status: "pending" } : [] }));
    render(<MemoryRouter initialEntries={["/questionario?plano=trimestral&payment_id=abc&payment_token=secret"]}><Questionnaire /></MemoryRouter>);
    expect(await screen.findByText(/ainda está sendo confirmado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar questionário/i })).not.toBeInTheDocument();
  });

  it("unlocks the form only after approved status", async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("/status") ? { status: "approved" } : [] }));
    render(<MemoryRouter initialEntries={["/questionario?plano=trimestral&payment_id=abc&payment_token=secret"]}><Questionnaire /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: /enviar questionário/i })).toBeInTheDocument());
  });

  it("shows the purchase link when payment data is missing", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter initialEntries={["/questionario?plano=invalid"]}><Questionnaire /></MemoryRouter>);
    expect(await screen.findByText(/finalize a compra/i)).toBeInTheDocument();
  });

  it("renders every question type, formats phone and submits answers", async () => {
    const questions = [
      { id: "text", label: "Objetivo", type: "text", required: true },
      { id: "number", label: "Dias", type: "number", required: false },
      { id: "textarea", label: "Doenças", type: "textarea", required: true },
      { id: "select", label: "Nível", type: "select", options: ["Iniciante"], required: true },
      { id: "boolean", label: "Fuma?", type: "boolean", required: true },
    ];
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("/status") ? { status: "approved" } : url.includes("/me") ? { email: "user@example.com" } : questions }));
    api.post.mockResolvedValue({ data: { plan: { name: "Plano Trimestral", start_date: "2026-01-01", end_date: "2026-04-01" } } });
    render(<MemoryRouter initialEntries={["/questionario?plano=trimestral&payment_id=p1&payment_token=secret"]}><Questionnaire /></MemoryRouter>);
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
    api.get.mockImplementation((url) => url.includes("/status")
      ? Promise.resolve({ data: { status: "approved" } })
      : url.includes("/questions") ? Promise.reject(new Error("offline")) : Promise.resolve({ data: { email: "user@example.com" } }));
    render(<MemoryRouter initialEntries={["/questionario?payment_id=p1&payment_token=secret"]}><Questionnaire /></MemoryRouter>);
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument();
  });

  it("shows missing-question details returned by submission", async () => {
    const question = { id: "q1", label: "Objetivo", type: "text", required: false };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("/status") ? { status: "approved" } : url.includes("/me") ? { email: "user@example.com" } : [question] }));
    api.post.mockRejectedValue({ response: { data: { detail: { missing_questions: ["Doenças"] } } } });
    render(<MemoryRouter initialEntries={["/questionario?payment_id=p1&payment_token=secret"]}><Questionnaire /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Nome completo/), "Aluno");
    await user.type(screen.getByLabelText(/WhatsApp/), "54999990000");
    await user.click(screen.getByRole("button", { name: /Enviar questionário/ }));
    expect(await screen.findByText("Doenças")).toBeInTheDocument();
  });

  it("handles missing profile email, missing select options and generic submission errors", async () => {
    const question = { id: "q1", label: "Escolha", type: "select", required: false };
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("/status") ? { status: "approved" } : url.includes("/me") ? {} : [question] }));
    api.post.mockRejectedValueOnce(new Error("offline"));
    render(<MemoryRouter initialEntries={["/questionario?payment_id=p1&payment_token=secret"]}><Questionnaire /></MemoryRouter>);
    const user = userEvent.setup();
    expect(await screen.findByLabelText("E-mail")).toHaveValue("");
    await user.type(screen.getByLabelText(/Nome completo/), "Aluno");
    await user.type(screen.getByLabelText(/WhatsApp/), "54999990000");
    await user.click(screen.getByRole("button", { name: /Enviar questionário/ }));
    expect(await screen.findByText(/Não foi possível enviar suas respostas/)).toBeInTheDocument();
  });
});
