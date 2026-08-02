import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./errors";

describe("apiErrorMessage", () => {
  it("uses the fallback for null errors", () => {
    expect(apiErrorMessage(null, "Falha segura")).toBe("Falha segura");
  });
});
