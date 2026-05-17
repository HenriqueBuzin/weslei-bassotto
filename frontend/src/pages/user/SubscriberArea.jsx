import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const plans = [
  { slug: "trimestral", name: "Plano Trimestral", months: 3 },
  { slug: "semestral", name: "Plano Semestral", months: 6 },
  { slug: "anual", name: "Plano Anual", months: 12 },
];

function answersToMap(submission) {
  return Object.fromEntries((submission?.answers || []).map((answer) => [answer.question_id, answer.value || ""]));
}

export default function SubscriberArea() {
  const { logout } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) || submissions[0],
    [selectedId, submissions]
  );

  async function loadAll() {
    setError("");
    try {
      const [questionRes, submissionRes] = await Promise.all([
        api.get("/consultancy/questions"),
        api.get("/consultancy/me/submissions"),
      ]);
      setQuestions(questionRes.data);
      setSubmissions(submissionRes.data);
      setSelectedId((current) => current || submissionRes.data[0]?.id || null);
      setAnswers(answersToMap(submissionRes.data[0]));
    } catch {
      setError("Nao foi possivel carregar sua area do assinante.");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setAnswers(answersToMap(selected));
  }, [selected?.id]);

  function setAnswer(questionId, value) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  async function saveAnswers(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        answers: Object.entries(answers).map(([question_id, value]) => ({ question_id, value })),
      };
      const { data } = await api.patch(`/consultancy/me/submissions/${selected.id}/answers`, payload);
      setSubmissions((items) => items.map((item) => (item.id === selected.id ? data : item)));
      setNotice("Respostas atualizadas. O admin sera sinalizado ate visualizar a alteracao.");
    } catch (err) {
      setError(
        err?.response?.data?.detail?.missing_questions?.join(", ") ||
          "Nao foi possivel salvar suas respostas."
      );
    } finally {
      setBusy(false);
    }
  }

  async function renewPlan(planSlug) {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post(`/consultancy/me/submissions/${selected.id}/renew`, {
        plan_slug: planSlug,
      });
      setSubmissions((items) => items.map((item) => (item.id === selected.id ? data : item)));
      setNotice("Renovacao registrada. O admin vera a recompra e as datas atualizadas.");
    } catch {
      setError("Nao foi possivel registrar a renovacao agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="subscriber-page">
      <section className="subscriber-hero">
        <div>
          <p className="eyebrow">Area do assinante</p>
          <h1>Seu plano e sua anamnese.</h1>
          <p>
            Aqui voce acompanha o periodo contratado, renova a consultoria e atualiza suas respostas
            quando algo mudar na rotina.
          </p>
        </div>
        <div className="subscriber-actions">
          <Link className="btn btn-outline-light" to="/">
            Voltar ao site
          </Link>
          <button className="btn btn-brand" onClick={logout}>
            Sair
          </button>
        </div>
      </section>

      <section className="subscriber-shell">
        {error && <div className="form-alert">{error}</div>}
        {notice && <div className="success-alert">{notice}</div>}

        {submissions.length === 0 ? (
          <div className="admin-panel">
            <h2>Nenhum plano encontrado</h2>
            <p className="muted">
              Compre um plano pelo site e preencha o questionario para aparecer aqui.
            </p>
            <Link className="btn btn-brand" to="/#planos">
              Ver planos
            </Link>
          </div>
        ) : (
          <div className="subscriber-grid">
            <aside className="admin-panel">
              <div className="panel-heading">
                <h2>Planos</h2>
                <span>{submissions.length}</span>
              </div>
              <div className="submission-list">
                {submissions.map((submission) => (
                  <button
                    className={selected?.id === submission.id ? "active" : ""}
                    onClick={() => setSelectedId(submission.id)}
                    key={submission.id}
                  >
                    <strong>{submission.plan.name}</strong>
                    <span>{submission.status}</span>
                    <small>
                      {submission.plan.start_date} ate {submission.plan.end_date}
                    </small>
                  </button>
                ))}
              </div>
            </aside>

            <section className="admin-panel">
              {selected && (
                <>
                  <div className="panel-heading">
                    <div>
                      <h2>{selected.plan.name}</h2>
                      <p>
                        Periodo: {selected.plan.start_date} ate {selected.plan.end_date}
                      </p>
                    </div>
                    <span className="pill">Renovacoes: {selected.renewal_count || 0}</span>
                  </div>

                  <div className="renewal-grid">
                    {plans.map((plan) => (
                      <article key={plan.slug}>
                        <strong>{plan.name}</strong>
                        <span>{plan.months} meses</span>
                        <button className="btn btn-brand" disabled={busy} onClick={() => renewPlan(plan.slug)}>
                          Renovar
                        </button>
                      </article>
                    ))}
                  </div>

                  <form className="admin-form subscriber-form" onSubmit={saveAnswers}>
                    <h2>Editar respostas</h2>
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
                    <button className="btn btn-brand" disabled={busy}>
                      {busy ? "Salvando..." : "Salvar respostas"}
                    </button>
                  </form>
                </>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
