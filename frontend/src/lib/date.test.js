import { describe, expect, it } from "vitest";
import { formatDateBR } from "./date";

describe("formatDateBR", () => {
  it("formats API dates as dd/mm/yyyy", () => {
    expect(formatDateBR("2026-07-11T18:00:00Z")).toBe("11/07/2026");
  });

  it("keeps invalid values readable", () => {
    expect(formatDateBR("unknown")).toBe("unknown");
  });
});
