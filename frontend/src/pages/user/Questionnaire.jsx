import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

const plans = {
  trimestral: { name: "Plano Trimestral", months: 3 },
  semestral: { name: "Plano Semestral", months: 6 },
  anual: { name: "Plano Anual", months: 12 },
};

function initialPlan(value) {
  return plans[value] ? value : "trimestral";
}

function readPaymentReference(params) {
  return (
    params.get("payment_id") ||
    params.get("collection_id") ||
    params.get("preference_id") ||
    params.get("external_reference") ||
    ""
  );
}

export default function Questionnaire() {
  const [params] = useSearchParams();
  const planSlug = initialPlan(params.get("plano"));
  const plan = plans[planSlug];
  const paymentReference = readPaymentReference(params);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get("/consultancy/questions")
      .then(({ data }) => {
        if (alive) setQuestions(data);
      })
      .catch(() => {
        if (alive) setError("Nao foi possivel carregar as perguntas agora.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const canSubmit = useMemo(() => {
    const requiredAnswered = questions.every((q) => {
      if (!q.required) return true;
      const value = answers[q.id];
      return value !== undefined && value !== null && String(value).trim() !== "";
    });
    return customer.name.trim() && customer.email.trim() && customer.phone.trim() && requiredAnswered;
  }, [answers, customer, questions]);

  function setAnswer(questionId, value) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess(null);
    try {
      const payload = {
        plan_slug: planSlug,
        customer,
        payment_reference: paymentReference || null,
        answers: Object.entries(answers).map(([question_id, value]) => ({ question_id, value })),
      };
      const { data } = await api.post("/consultancy/submissions", payload);
      setSuccess(data);
    } catch (err) {
      setError(
        err?.response?.data?.detail?.missing_questions?.join(", ") ||
          "Nao foi possivel enviar suas respostas."
      );
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
          <h1>Responda o questionario inicial.</h1>
          <p>
            Essas informacoes ajudam o treinador a entender sua rotina, seus objetivos, possiveis
            limitacoes, doencas, frequencia de treino e tudo que for necessario para montar a
            estrategia.
          </p>
        </header>

        {success ? (
          <section className="success-panel">
            <p className="eyebrow">Recebido</p>
            <h2>Questionario enviado com sucesso.</h2>
            <p>
              Seu plano ficou registrado como {success.plan.name}, de {success.plan.start_date} ate{" "}
              {success.plan.end_date}. O admin ja consegue ver seu plano e todas as respostas no
              painel.
            </p>
            <Link to="/" className="btn btn-brand">
              Voltar ao inicio
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
                  O periodo e definido pelo plano pago. No painel, o admin ve o aluno, o plano, a
                  data inicial, a data final e todas as respostas cadastradas.
                </p>
                {paymentReference && <small>Referencia do pagamento: {paymentReference}</small>}
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
                  <input
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  WhatsApp
                  <input
                    value={customer.phone}
                    onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                    required
                  />
                </label>
              </div>
            </section>

            <section className="form-section">
              <h2>Perguntas da anamnese</h2>
              {loading && <p className="muted">Carregando perguntas...</p>}
              {!loading && questions.length === 0 && (
                <p className="muted">O admin ainda nao cadastrou perguntas.</p>
              )}
              <div className="dynamic-questions">
                {questions.map((question) => (
                  <label className="question-field" key={question.id}>
                    {question.label}
                    {question.required && <span> obrigatorio</span>}
                    {question.type === "textarea" && (
                      <textarea
                        value={answers[question.id] || ""}
                        onChange={(e) => setAnswer(question.id, e.target.value)}
                        required={question.required}
                      />
                    )}
                    {question.type === "select" && (
                      <select
                        value={answers[question.id] || ""}
                        onChange={(e) => setAnswer(question.id, e.target.value)}
                        required={question.required}
                      >
                        <option value="">Selecione</option>
                        {question.options.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                    {question.type === "boolean" && (
                      <select
                        value={answers[question.id] || ""}
                        onChange={(e) => setAnswer(question.id, e.target.value)}
                        required={question.required}
                      >
                        <option value="">Selecione</option>
                        <option value="Sim">Sim</option>
                        <option value="Nao">Nao</option>
                      </select>
                    )}
                    {(question.type === "text" || question.type === "number") && (
                      <input
                        type={question.type === "number" ? "number" : "text"}
                        value={answers[question.id] || ""}
                        onChange={(e) => setAnswer(question.id, e.target.value)}
                        required={question.required}
                      />
                    )}
                  </label>
                ))}
              </div>
            </section>

            {error && <div className="form-alert">{error}</div>}

            <button className="btn btn-brand btn-lg" disabled={busy || !canSubmit}>
              {busy ? "Enviando..." : "Enviar questionario"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
