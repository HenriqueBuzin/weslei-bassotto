import { describe, expect, it } from "vitest";
import { apiErrorMessage, ERROR_MESSAGES, FIELD_LABELS } from "./errors";

function apiError(data: unknown) {
  return { response: { data } };
}

describe("apiErrorMessage", () => {
  it("uses the fallback for null errors", () => {
    expect(apiErrorMessage(null, "Falha segura")).toBe("Falha segura");
  });

  it("uses the fallback for a non-object error", () => {
    expect(apiErrorMessage("boom", "Falha segura")).toBe("Falha segura");
  });

  it("translates a known error code to pt-BR", () => {
    expect(apiErrorMessage(apiError({ code: "invalid_credentials", detail: "Invalid e-mail or password" }), "x")).toBe(
      "E-mail ou senha incorretos.",
    );
  });

  it("never leaks the English detail of a known code", () => {
    const message = apiErrorMessage(
      apiError({ code: "payment_already_used", detail: "This payment was already used" }),
      "x",
    );

    expect(message).toBe("Este pagamento já foi utilizado.");
    expect(message).not.toContain("payment");
  });

  it("lists the missing questions by name", () => {
    expect(
      apiErrorMessage(apiError({ code: "required_questions_missing", missing_questions: ["Objetivo", "Lesões"] }), "x"),
    ).toBe("Objetivo, Lesões");
  });

  it("translates the failing field names on a validation error", () => {
    expect(apiErrorMessage(apiError({ code: "validation_failed", fields: ["username", "password"] }), "x")).toBe(
      "Verifique estes campos: e-mail, senha.",
    );
  });

  it("keeps an unmapped field name as it came", () => {
    expect(apiErrorMessage(apiError({ code: "validation_failed", fields: ["nao_mapeado"] }), "x")).toBe(
      "Verifique estes campos: nao_mapeado.",
    );
  });

  it("falls back to the generic message for a validation error without fields", () => {
    expect(apiErrorMessage(apiError({ code: "validation_failed", fields: [] }), "Falha segura")).toBe("Falha segura");
  });

  it("falls back for an unknown code", () => {
    expect(apiErrorMessage(apiError({ code: "codigo_novo_do_backend" }), "Falha segura")).toBe("Falha segura");
  });

  it("uses the payload message when there is no usable code", () => {
    expect(apiErrorMessage(apiError({ message: "Servidor indisponível" }), "Falha segura")).toBe(
      "Servidor indisponível",
    );
  });

  it("optionally surfaces the transport error message", () => {
    expect(apiErrorMessage({ message: "Network Error" }, "Falha segura", true)).toBe("Network Error");
  });

  it("ignores an empty transport error message", () => {
    expect(apiErrorMessage({ message: "" }, "Falha segura", true)).toBe("Falha segura");
  });

  it("ignores a non-string transport error message", () => {
    expect(apiErrorMessage({ message: 42 }, "Falha segura", true)).toBe("Falha segura");
  });

  it("does not surface the transport message unless asked", () => {
    expect(apiErrorMessage({ message: "Network Error" }, "Falha segura")).toBe("Falha segura");
  });

  it("keeps every catalog entry in Portuguese and non-empty", () => {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      expect(message.length, code).toBeGreaterThan(0);
      expect(message, code).not.toMatch(/^[a-z_]+$/);
    }

    expect(Object.keys(FIELD_LABELS).length).toBeGreaterThan(0);
  });
});
