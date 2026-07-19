import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("uses the approved fallback brand and WhatsApp number", async () => {
  vi.stubEnv("VITE_APP_NAME", "");
  vi.stubEnv("VITE_WHATSAPP_NUMBER", "");
  const { default: Home } = await import("./Home");
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Weslei Bassotto" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /WhatsApp/ })[0]).toHaveAttribute("href", "https://wa.me/555491126308");
});
