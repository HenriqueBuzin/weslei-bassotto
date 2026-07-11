import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Home from "./Home";

describe("approved home", () => {
  it("renders all plans and primary actions", () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Weslei Bassotto" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plano Trimestral" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plano Semestral" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plano Anual" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Assinar" })).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Tirar dúvidas no WhatsApp/i })).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });
});
