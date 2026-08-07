/**
 * Every user facing path in pt-BR, in one place. The API stays in English; only
 * what the visitor sees in the address bar is translated.
 *
 * Each screen is addressable, so any state worth returning to lives in the URL
 * and survives a reload or being pasted to someone else.
 */
export const PATHS = {
  home: "/",
  checkout: "/pagamento",
  questionnaire: "/questionario",
  login: "/entrar",
  register: "/cadastro",
  forgotPassword: "/recuperar-senha",
  // The API mails this one, so it must not change without changing the mail.
  resetPassword: "/redefinir-senha",
  subscriberArea: "/assinante",
  dashboard: "/painel",
  dashboardSubmissions: "/painel/alunos",
  dashboardQuestions: "/painel/perguntas",
  dashboardEvents: "/painel/alertas",
  notAuthorized: "/sem-permissao",
} as const;

/** Paths shipped before the pt-BR rename; kept so old links still resolve. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/login": PATHS.login,
  "/checkout": PATHS.checkout,
  "/recuperar": PATHS.forgotPassword,
  "/app": PATHS.dashboardSubmissions,
  "/not-authorized": PATHS.notAuthorized,
};

/** Query parameter carrying where to go after signing in. */
export const REDIRECT_PARAM = "redirecionar";

/**
 * Only same-site paths may be followed after login: taking an arbitrary value
 * from the query string would let a crafted link bounce users off-site.
 */
export function safeRedirect(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

/** Builds a login link that comes back to `target` once authenticated. */
export function loginWithRedirect(target: string): string {
  return `${PATHS.login}?${REDIRECT_PARAM}=${encodeURIComponent(target)}`;
}

/** Builds a register link that comes back to `target` once authenticated. */
export function registerWithRedirect(target: string): string {
  return `${PATHS.register}?${REDIRECT_PARAM}=${encodeURIComponent(target)}`;
}

/** The admin tab a dashboard URL refers to. */
export const DASHBOARD_TABS = {
  [PATHS.dashboardSubmissions]: "submissions",
  [PATHS.dashboardQuestions]: "questions",
  [PATHS.dashboardEvents]: "events",
} as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[keyof typeof DASHBOARD_TABS];
