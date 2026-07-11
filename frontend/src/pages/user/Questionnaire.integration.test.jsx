import { render, screen, waitFor } from "@testing-library/react";
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
});
