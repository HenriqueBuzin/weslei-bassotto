import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NotAuthorized from "./NotAuthorized";
import { PATHS } from "../routes/paths";

describe("NotAuthorized", () => {
  it("explains the account is signed in but lacks access", () => {
    render(
      <MemoryRouter>
        <NotAuthorized />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Sem permissão" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para minha área" })).toHaveAttribute("href", PATHS.subscriberArea);
  });
});
