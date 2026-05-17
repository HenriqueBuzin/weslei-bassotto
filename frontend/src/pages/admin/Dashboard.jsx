import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const emptyQuestion = {
  label: "",
  type: "textarea",
  options: "",
  required: true,
  active: true,
  order: 0,
};

const statusLabels = {
  pending_payment: "Pagamento pendente",
  paid: "Pago",
  active: "Ativo",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

function hasUnseenAnswers(submission) {
  if (!submission?.answers_changed_at) return false;
  if (!submission.answers_seen_at) return true;
  return new Date(submission.answers_changed_at) > new Date(submission.answers_seen_at);
}

function normalizeQuestion(question) {
  return {
    ...question,
    options: Array.isArray(question.options) ? question.options.join("\n") : "",
  };
}

function payloadFromQuestion(question) {
  return {
    label: question.label,
    type: question.type,
    options: question.options
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    required: question.required,
    active: question.active,
    order: Number(question.order) || 0,
  };
}

export default function Dashboard() {
  const { logout } = useAuth();
  const [tab, setTab] = useState("submissions");
  const [questions, setQuestions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [questionForm, setQuestionForm] = useState(emptyQuestion);
  const [editingId, setEditingId] = useState(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedSubmission = useMemo(
    () => submissions.find((item) => item.id === selectedSubmissionId) || submissions[0],
    [selectedSubmissionId, submissions]
  );

  async function loadAll() {
    setError("");
    try {
      const [questionRes, submissionRes] = await Promise.all([
        api.get("/consultancy/admin/questions"),
        api.get("/consultancy/admin/submissions"),
      ]);
      setQuestions(questionRes.data);
      setSubmissions(submissionRes.data);
      setSelectedSubmissionId((current) => current || submissionRes.data[0]?.id || null);
    } catch {
      setError("Não foi possível carregar o painel administrativo.");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function updateQuestionForm(field, value) {
    setQuestionForm((current) => ({ ...current, [field]: value }));
  }

  async function saveQuestion(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = payloadFromQuestion(questionForm);
      if (editingId) {
        await api.patch(`/consultancy/admin/questions/${editingId}`, payload);
      } else {
        await api.post("/consultancy/admin/questions", payload);
      }
      setQuestionForm(emptyQuestion);
      setEditingId(null);
      await loadAll();
    } catch {
      setError("Não foi possível salvar a pergunta.");
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(id) {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/consultancy/admin/questions/${id}`);
      await loadAll();
    } catch {
      setError("Não foi possível apagar a pergunta.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSubmission(id, patch) {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch(`/consultancy/admin/submissions/${id}`, patch);
      setSubmissions((items) => items.map((item) => (item.id === id ? data : item)));
    } catch {
      setError("Não foi possível atualizar o aluno.");
    } finally {
      setBusy(false);
    }
  }

  async function markAnswersSeen(id) {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/consultancy/admin/submissions/${id}/answers/seen`);
      setSubmissions((items) => items.map((item) => (item.id === id ? data : item)));
    } catch {
      setError("Não foi possível marcar as respostas como vistas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <div>
          <p className="eyebrow">Painel</p>
          <h1>Admin consultoria</h1>
        </div>
        <nav>
          <button className={tab === "submissions" ? "active" : ""} onClick={() => setTab("submissions")}>
            Alunos e respostas
          </button>
          <button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>
            Perguntas
          </button>
        </nav>
        <button className="admin-logout" onClick={logout}>
          Sair
        </button>
      </aside>

      <section className="admin-content">
        {error && <div className="form-alert">{error}</div>}

        {tab === "submissions" && (
          <div className="admin-grid">
            <section className="admin-panel">
              <div className="panel-heading">
                <h2>Alunos</h2>
                <span>{submissions.length} registros</span>
              </div>
              <div className="submission-list">
                {submissions.map((submission) => (
                  <button
                    className={selectedSubmission?.id === submission.id ? "active" : ""}
                    onClick={() => setSelectedSubmissionId(submission.id)}
                    key={submission.id}
                  >
                    <strong>{submission.customer.name}</strong>
                    {hasUnseenAnswers(submission) && <em>Respostas novas/alteradas</em>}
                    {submission.renewal_count > 0 && <em>Recomprou {submission.renewal_count}x</em>}
                    <span>{submission.plan.name}</span>
                    <small>
                      {submission.plan.start_date} até {submission.plan.end_date}
                    </small>
                  </button>
                ))}
                {submissions.length === 0 && <p className="muted">Nenhum questionário respondido ainda.</p>}
              </div>
            </section>

            <section className="admin-panel detail-panel">
              {selectedSubmission ? (
                <>
                  <div className="panel-heading">
                    <div>
                      <h2>{selectedSubmission.customer.name}</h2>
                      <p>{selectedSubmission.customer.email} · {selectedSubmission.customer.phone}</p>
                    </div>
                    <select
                      value={selectedSubmission.status}
                      onChange={(e) => updateSubmission(selectedSubmission.id, { status: e.target.value })}
                      disabled={busy}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="subscription-editor">
                    <label>
                      Início
                      <input
                        type="date"
                        value={selectedSubmission.plan.start_date}
                        onChange={(e) => updateSubmission(selectedSubmission.id, { start_date: e.target.value })}
                      />
                    </label>
                    <label>
                      Fim
                      <input
                        type="date"
                        value={selectedSubmission.plan.end_date}
                        onChange={(e) => updateSubmission(selectedSubmission.id, { end_date: e.target.value })}
                      />
                    </label>
                    <label>
                      Referência Mercado Pago
                      <input
                        value={selectedSubmission.payment_reference || ""}
                        onChange={(e) => updateSubmission(selectedSubmission.id, { payment_reference: e.target.value })}
                        placeholder="payment_id, preference_id ou observação"
                      />
                    </label>
                  </div>

                  {hasUnseenAnswers(selectedSubmission) && (
                    <div className="admin-signal">
                      <strong>Respostas novas ou alteradas pelo aluno.</strong>
                      <button
                        className="btn btn-brand"
                        disabled={busy}
                        onClick={() => markAnswersSeen(selectedSubmission.id)}
                      >
                        Marcar como visto
                      </button>
                    </div>
                  )}

                  {selectedSubmission.renewal_count > 0 && (
                    <div className="renewal-history">
                      <h3>Histórico de renovação</h3>
                      {selectedSubmission.renewals.map((renewal, index) => (
                        <p key={`${renewal.created_at}-${index}`}>
                          {renewal.plan_name}: {renewal.start_date} até {renewal.end_date}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="answers-list">
                    {selectedSubmission.answers.map((answer) => (
                      <article key={answer.question_id}>
                        <h3>{answer.label}</h3>
                        <p>{String(answer.value || "Sem resposta")}</p>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted">Selecione um aluno para ver detalhes.</p>
              )}
            </section>
          </div>
        )}

        {tab === "questions" && (
          <div className="admin-grid questions-layout">
            <section className="admin-panel">
              <div className="panel-heading">
                <h2>{editingId ? "Editar pergunta" : "Nova pergunta"}</h2>
              </div>
              <form className="admin-form" onSubmit={saveQuestion}>
                <label>
                  Pergunta
                  <textarea
                    value={questionForm.label}
                    onChange={(e) => updateQuestionForm("label", e.target.value)}
                    required
                  />
                </label>
                <div className="form-grid compact">
                  <label>
                    Tipo
                    <select value={questionForm.type} onChange={(e) => updateQuestionForm("type", e.target.value)}>
                      <option value="textarea">Texto longo</option>
                      <option value="text">Texto curto</option>
                      <option value="number">Número</option>
                      <option value="select">Seleção</option>
                      <option value="boolean">Sim ou não</option>
                    </select>
                  </label>
                  <label>
                    Ordem
                    <input
                      type="number"
                      value={questionForm.order}
                      onChange={(e) => updateQuestionForm("order", e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Opções, uma por linha
                  <textarea
                    value={questionForm.options}
                    onChange={(e) => updateQuestionForm("options", e.target.value)}
                    disabled={questionForm.type !== "select"}
                    placeholder="Use apenas para perguntas de seleção"
                  />
                </label>
                <div className="toggle-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={questionForm.required}
                      onChange={(e) => updateQuestionForm("required", e.target.checked)}
                    />
                    Obrigatória
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={questionForm.active}
                      onChange={(e) => updateQuestionForm("active", e.target.checked)}
                    />
                    Ativa
                  </label>
                </div>
                <button className="btn btn-brand" disabled={busy}>
                  {busy ? "Salvando..." : "Salvar pergunta"}
                </button>
                {editingId && (
                  <button
                    className="admin-link-button"
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setQuestionForm(emptyQuestion);
                    }}
                  >
                    Cancelar edição
                  </button>
                )}
              </form>
            </section>

            <section className="admin-panel">
              <div className="panel-heading">
                <h2>Perguntas cadastradas</h2>
                <span>{questions.length} itens</span>
              </div>
              <div className="questions-list">
                {questions.map((question) => (
                  <article key={question.id}>
                    <div>
                      <strong>{question.label}</strong>
                      <span>
                        {question.type} · ordem {question.order} · {question.active ? "ativa" : "inativa"}
                      </span>
                    </div>
                    <div className="row-actions">
                      <button
                        onClick={() => {
                          setEditingId(question.id);
                          setQuestionForm(normalizeQuestion(question));
                        }}
                      >
                        Editar
                      </button>
                      <button onClick={() => removeQuestion(question.id)}>Apagar</button>
                    </div>
                  </article>
                ))}
                {questions.length === 0 && <p className="muted">Cadastre a primeira pergunta da anamnese.</p>}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
