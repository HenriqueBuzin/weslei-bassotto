import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("../../lib/api", () => ({ api }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
import SubscriberArea from "./SubscriberArea";

const question = { id: "q1", label: "Quantas vezes treina?", type: "number", required: true, options: [] };
const submission = {
  id: "s1", status: "active", plan: { name: "Plano Trimestral", start_date: "2026-01-01", end_date: "2026-04-01" },
  renewal_count: 0, answers: [{ question_id: "q1", value: "3" }],
};

describe("SubscriberArea", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.patch.mockReset();
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("questions") ? [question] : [submission] }));
  });

  it("shows contract dates in Brazilian format", async () => {
    render(<MemoryRouter><SubscriberArea /></MemoryRouter>);
    expect(await screen.findAllByText(/01\/01\/2026 até 01\/04\/2026/)).toHaveLength(2);
  });

  it("saves edited answers and signals the admin", async () => {
    api.patch.mockResolvedValueOnce({ data: { ...submission, answers: [{ question_id: "q1", value: "4" }] } });
    render(<MemoryRouter><SubscriberArea /></MemoryRouter>);
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Quantas vezes treina?/);
    await user.clear(input);
    await user.type(input, "4");
    await user.click(screen.getByRole("button", { name: "Salvar respostas" }));
    expect(api.patch).toHaveBeenCalledWith("/consultancy/me/submissions/s1/answers", {
      answers: [{ question_id: "q1", value: "4" }],
    });
    expect(await screen.findByText(/admin será sinalizado/i)).toBeInTheDocument();
  });
});
