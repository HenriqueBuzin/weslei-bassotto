type ApiDetail = string | { missing_questions?: string[] };
type ApiErrorPayload = { detail?: ApiDetail; message?: string };
type ErrorShape = { response?: { data?: ApiErrorPayload }; message?: unknown };

export function apiErrorMessage(error: unknown, fallback: string, includeErrorMessage = false) {
  const candidate = (error && typeof error === "object" ? error : {}) as ErrorShape;
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  const missing = detail?.missing_questions;
  if (missing?.length) return missing.join(", ");
  if (candidate.response?.data?.message) return candidate.response.data.message;
  return includeErrorMessage && typeof candidate.message === "string" && candidate.message
    ? candidate.message
    : fallback;
}
