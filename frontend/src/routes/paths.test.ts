import { describe, expect, it } from "vitest";
import {
  DASHBOARD_TABS,
  LEGACY_REDIRECTS,
  loginWithRedirect,
  PATHS,
  REDIRECT_PARAM,
  registerWithRedirect,
  safeRedirect,
} from "./paths";

describe("safeRedirect", () => {
  it("keeps a local path", () => {
    expect(safeRedirect("/painel/alunos/abc", PATHS.home)).toBe("/painel/alunos/abc");
  });

  it("keeps a local path carrying a query string", () => {
    expect(safeRedirect("/pagamento?plano=anual", PATHS.home)).toBe("/pagamento?plano=anual");
  });

  it("falls back when nothing was requested", () => {
    expect(safeRedirect(null, PATHS.subscriberArea)).toBe(PATHS.subscriberArea);
    expect(safeRedirect("", PATHS.subscriberArea)).toBe(PATHS.subscriberArea);
  });

  it("refuses an absolute URL so a crafted link cannot bounce users off-site", () => {
    expect(safeRedirect("https://evil.example.com", PATHS.home)).toBe(PATHS.home);
  });

  it("refuses a protocol relative URL", () => {
    expect(safeRedirect("//evil.example.com", PATHS.home)).toBe(PATHS.home);
  });

  it("refuses a path that does not start at the root", () => {
    expect(safeRedirect("painel/alunos", PATHS.home)).toBe(PATHS.home);
  });
});

describe("redirect links", () => {
  it("encodes the destination into the login link", () => {
    expect(loginWithRedirect("/pagamento?plano=anual&renew=s1")).toBe(
      `${PATHS.login}?${REDIRECT_PARAM}=%2Fpagamento%3Fplano%3Danual%26renew%3Ds1`,
    );
  });

  it("encodes the destination into the register link", () => {
    expect(registerWithRedirect("/pagamento")).toBe(`${PATHS.register}?${REDIRECT_PARAM}=%2Fpagamento`);
  });

  it("round-trips through safeRedirect", () => {
    const target = "/painel/alunos/abc?editar=q1";
    const query = new URLSearchParams(loginWithRedirect(target).split("?")[1]);

    expect(safeRedirect(query.get(REDIRECT_PARAM), PATHS.home)).toBe(target);
  });
});

describe("path catalog", () => {
  it("keeps every user facing path in pt-BR", () => {
    for (const path of Object.values(PATHS)) {
      expect(path.startsWith("/")).toBe(true);
      expect(path).not.toMatch(/login|checkout|dashboard|password|not-authorized/);
    }
  });

  it("maps each legacy path onto a current one", () => {
    const current = Object.values(PATHS) as string[];

    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(current).toContain(to);
      expect(current).not.toContain(from);
    }
  });

  it("resolves each dashboard address to its tab", () => {
    expect(DASHBOARD_TABS[PATHS.dashboardSubmissions]).toBe("submissions");
    expect(DASHBOARD_TABS[PATHS.dashboardQuestions]).toBe("questions");
    expect(DASHBOARD_TABS[PATHS.dashboardEvents]).toBe("events");
  });

  it("never changes the reset path, which the API mails out", () => {
    expect(PATHS.resetPassword).toBe("/redefinir-senha");
  });
});
