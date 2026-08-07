/**
 * The API answers with a stable machine readable `code` and an English `detail`.
 * All Portuguese copy the user reads lives here, so backend wording changes
 * never leak into the interface.
 */

export const ERROR_MESSAGES: Record<string, string> = {
  // Autenticação
  unauthenticated: "Faça login para continuar.",
  invalid_credentials: "E-mail ou senha incorretos.",
  login_locked: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  access_token_invalid: "Sua sessão expirou. Entre novamente.",
  access_token_expected: "Sua sessão expirou. Entre novamente.",
  refresh_token_missing: "Sua sessão expirou. Entre novamente.",
  refresh_token_invalid: "Sua sessão expirou. Entre novamente.",
  refresh_token_expected: "Sua sessão expirou. Entre novamente.",
  refresh_token_reused: "Sua sessão expirou. Entre novamente.",
  user_not_found: "Conta não encontrada.",
  forbidden_role: "Você não tem permissão para acessar isto.",
  csrf_check_failed: "Não foi possível validar a requisição. Recarregue a página.",

  // Cadastro e senha
  email_already_registered: "Este e-mail já está cadastrado.",
  current_password_invalid: "A senha atual está incorreta.",
  password_reset_token_invalid: "Link inválido, expirado ou já utilizado.",

  // Anamnese e contratos
  approved_payment_required: "É necessário um pagamento aprovado antes de responder à anamnese.",
  required_questions_missing: "Responda todas as perguntas obrigatórias.",
  customer_email_mismatch: "Use o mesmo e-mail da sua conta nos dados do aluno.",
  submission_not_found: "Contrato não encontrado.",
  submission_not_owned: "Você não tem permissão para alterar este contrato.",
  question_not_found: "Pergunta não encontrada.",
  admin_event_not_found: "Alerta não encontrado.",

  // Pagamentos
  payment_not_found: "Pagamento não encontrado.",
  payment_already_used: "Este pagamento já foi utilizado.",
  payment_plan_mismatch: "O pagamento não corresponde a esta contratação.",
  payment_owned_by_another_account: "Este pagamento pertence a outra conta.",
  payment_gateway_error: "Não foi possível processar o pagamento. Tente novamente.",
  payment_webhook_rejected: "Não foi possível processar a notificação de pagamento.",
  webhook_signature_invalid: "Notificação de pagamento não autenticada.",

  // Genéricos
  invalid_id: "Identificador inválido.",
  route_not_found: "Recurso não encontrado.",
  request_failed: "Não foi possível concluir a requisição.",
};

/** Field names as the user knows them, for validation errors. */
export const FIELD_LABELS: Record<string, string> = {
  username: "e-mail",
  email: "e-mail",
  password: "senha",
  current_password: "senha atual",
  token: "token",
  remember: "lembrar de mim",
  label: "pergunta",
  type: "tipo",
  options: "opções",
  required: "obrigatória",
  active: "ativa",
  order: "ordem",
  plan_slug: "plano",
  payer_email: "e-mail do pagador",
  card_token_id: "cartão",
  payment_mode: "forma de pagamento",
  payment_id: "pagamento",
  payment_token: "token do pagamento",
  status: "situação",
  start_date: "data de início",
  end_date: "data de término",
  payment_reference: "referência do pagamento",
  answers: "respostas",
  "customer.name": "nome",
  "customer.email": "e-mail",
  "customer.phone": "telefone",
};

type ApiErrorPayload = {
  code?: string;
  detail?: string;
  fields?: string[];
  missing_questions?: string[];
  message?: string;
};

type ErrorShape = { response?: { data?: ApiErrorPayload }; message?: unknown };

function fieldList(fields: string[]) {
  return fields.map((field) => FIELD_LABELS[field] ?? field).join(", ");
}

export function apiErrorMessage(error: unknown, fallback: string, includeErrorMessage = false) {
  const candidate = (error && typeof error === "object" ? error : {}) as ErrorShape;
  const data = candidate.response?.data;

  // Missing answers are listed by name, which is more useful than a generic text.
  if (data?.missing_questions?.length) {
    return data.missing_questions.join(", ");
  }

  if (data?.code === "validation_failed" && data.fields?.length) {
    return `Verifique estes campos: ${fieldList(data.fields)}.`;
  }

  if (data?.code && ERROR_MESSAGES[data.code]) {
    return ERROR_MESSAGES[data.code];
  }

  if (data?.message) {
    return data.message;
  }

  return includeErrorMessage && typeof candidate.message === "string" && candidate.message
    ? candidate.message
    : fallback;
}
