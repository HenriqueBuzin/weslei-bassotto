import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { formatDateBR } from "../../lib/date";
import { selectPlan, usePlanCatalog } from "../../hooks/usePlanCatalog";
import QuestionField from "../../components/QuestionField";
import { apiErrorMessage } from "../../lib/errors";
import type { AnswerValue, Customer, Question, Submission } from "../../types/consultancy";

function formatPhoneBR(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function Questionnaire() {
  const [params] = useSearchParams();
  const requestedPlanSlug = params.get("plano") || "trimestral";
  const { plans, loading: plansLoading, error: plansError } = usePlanCatalog();
  const plan = selectPlan(plans, requestedPlanSlug);
  const planSlug = plan?.slug || requestedPlanSlug;
  const paymentId = params.get("payment_id") || "";
  const paymentToken = params.get("payment_token") || "";
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const paymentConfirmed = paymentStatus === "approved";
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [customer, setCustomer] = useState<Customer>({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Submission | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.get("/consultancy/questions"), api.get("/me")])
      .then(([questionResponse, userResponse]) => {
        if (alive) {
          setQuestions(Array.isArray(questionResponse.data) ? questionResponse.data : []);
          setCustomer((current) => ({ ...current, email: userResponse.data.email || "" }));
        }
      })
      .catch(() => {
        if (alive) setError("Não foi possível carregar as perguntas agora.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!paymentId || !paymentToken) {
      setPaymentStatus("missing");
      return;
    }
    let alive = true;
    api
      .get(`/payments/${paymentId}/status`, { params: { token: paymentToken } })
      .then(({ data }) => alive && setPaymentStatus(data.status))
      .catch(() => alive && setPaymentStatus("missing"));
    return () => {
      alive = false;
    };
  }, [paymentId, paymentToken]);

  const canSubmit = useMemo(() => {
    const requiredAnswered = questions.every((q) => {
      if (!q.required) return true;
      const value = answers[q.id];
      return value !== undefined && value !== null && String(value).trim() !== "";
    });
    return customer.name.trim() && customer.email.trim() && customer.phone.trim() && requiredAnswered;
  }, [answers, customer, questions]);

  function setAnswer(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess(null);
    try {
      const payload = {
        plan_slug: planSlug,
        customer,
        payment_id: paymentId,
        payment_token: paymentToken,
        answers: Object.entries(answers).map(([question_id, value]) => ({ question_id, value })),
      };
      const { data } = await api.post("/consultancy/submissions", payload);
      setSuccess(data);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível enviar suas respostas."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="questionnaire-page">
      <div className="questionnaire-shell">
        <Link to="/" className="back-link">
          Voltar para o site
        </Link>

        <header className="questionnaire-header">
          <p className="eyebrow">Anamnese da consultoria</p>
          <h1>Responda o questionário inicial.</h1>
          <p>
            Essas informações ajudam o treinador a entender sua rotina, seus objetivos, possíveis limitações, doenças,
            frequência de treino e tudo que for necessário para montar a estratégia.
          </p>
        </header>

        {plansLoading || !plan ? (
          <section className="success-panel">
            <h2>{plansLoading ? "Carregando planos..." : "Planos indisponíveis"}</h2>
            {plansError && <div className="form-alert">{plansError}</div>}
          </section>
        ) : success ? (
          <section className="success-panel">
            <p className="eyebrow">Recebido</p>
            <h2>Questionário enviado com sucesso.</h2>
            <p>
              Seu plano ficou registrado como {success.plan.name}, de {formatDateBR(success.plan.start_date)} até{" "}
              {formatDateBR(success.plan.end_date)}. O admin já consegue ver seu plano e todas as respostas no painel.
            </p>
            <Link to="/" className="btn btn-brand">
              Voltar ao início
            </Link>
          </section>
        ) : !paymentConfirmed ? (
          <section className="success-panel">
            <p className="eyebrow">Pagamento necessário</p>
            <h2>Anamnese liberada somente após pagamento confirmado.</h2>
            <p>
              {paymentStatus === "pending"
                ? "Seu pagamento ainda está sendo confirmado. Atualize esta página em alguns instantes."
                : "Para responder o questionário, finalize a compra e aguarde a confirmação do pagamento."}
            </p>
            <Link to="/#planos" className="btn btn-brand">
              Escolher plano
            </Link>
          </section>
        ) : (
          <form className="questionnaire-form" onSubmit={onSubmit}>
            <section className="form-section">
              <h2>Plano comprado</h2>
              <div className="purchase-summary">
                <strong>{plan.name}</strong>
                <span>{plan.months} meses de acompanhamento</span>
                <p>
                  O período é definido pelo plano pago. No painel, o admin vê o aluno, o plano, a data inicial, a data
                  final e todas as respostas cadastradas.
                </p>
                <small>Pagamento confirmado com segurança.</small>
              </div>
            </section>

            <section className="form-section">
              <h2>Dados do aluno</h2>
              <div className="form-grid">
                <label>
                  Nome completo
                  <input
                    value={customer.name}
                    onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  E-mail
                  <input type="email" value={customer.email} readOnly required />
                </label>
                <label>
                  WhatsApp
                  <input
                    value={customer.phone}
                    onChange={(e) => setCustomer((c) => ({ ...c, phone: formatPhoneBR(e.target.value) }))}
                    inputMode="tel"
                    maxLength={15}
                    placeholder="(54) 99112-6308"
                    required
                  />
                </label>
              </div>
            </section>

            <section className="form-section">
              <h2>Perguntas da anamnese</h2>
              {loading && <p className="muted">Carregando perguntas...</p>}
              {!loading && questions.length === 0 && <p className="muted">O admin ainda não cadastrou perguntas.</p>}
              <div className="dynamic-questions">
                {questions.map((question) => (
                  <QuestionField
                    question={question}
                    value={answers[question.id] || ""}
                    onChange={setAnswer}
                    key={question.id}
                  />
                ))}
              </div>
            </section>

            {error && <div className="form-alert">{error}</div>}

            <button className="btn btn-brand btn-lg" disabled={busy || !canSubmit}>
              {busy ? "Enviando..." : "Enviar questionário"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
