import { formatDateBR } from "../../lib/date";

const statusLabels = {
  pending_payment: "Pagamento pendente",
  paid: "Pago",
  active: "Ativo",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

const eventLabels = {
  new_contract: "Novo contrato aprovado",
  renewal_approved: "Renovação aprovada",
  answers_changed: "Respostas alteradas",
  payment_failed: "Falha no pagamento",
};

function hasUnseenAnswers(submission) {
  if (!submission?.answers_changed_at) return false;
  if (!submission.answers_seen_at) return true;
  return new Date(submission.answers_changed_at) > new Date(submission.answers_seen_at);
}

function hasRecurrenceIssue(submission) {
  return submission?.recurrence_status && !["active", "authorized"].includes(submission.recurrence_status);
}

export function SubmissionsPanel({
  submissions,
  selectedSubmission,
  setSelectedSubmissionId,
  updateSubmission,
  markAnswersSeen,
  busy,
}) {
  return (
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
              {hasRecurrenceIssue(submission) && <em>Problema na recorrência</em>}
              {submission.renewal_count > 0 && <em>Recomprou {submission.renewal_count}x</em>}
              <span>{submission.plan.name}</span>
              <small>
                {formatDateBR(submission.plan.start_date)} até {formatDateBR(submission.plan.end_date)}
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
                <p>
                  {selectedSubmission.customer.email} · {selectedSubmission.customer.phone}
                </p>
              </div>
              <select
                value={selectedSubmission.status}
                onChange={(event) => updateSubmission(selectedSubmission.id, { status: event.target.value })}
                disabled={busy}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {hasRecurrenceIssue(selectedSubmission) && (
              <div className="form-alert">
                Recorrência com atenção: {selectedSubmission.recurrence_status}
                {selectedSubmission.recurrence_issue ? ` - ${selectedSubmission.recurrence_issue}` : ""}
              </div>
            )}

            <div className="subscription-editor">
              <label>
                Início
                <input
                  type="date"
                  value={selectedSubmission.plan.start_date}
                  onChange={(event) => updateSubmission(selectedSubmission.id, { start_date: event.target.value })}
                />
                <small>{formatDateBR(selectedSubmission.plan.start_date)}</small>
              </label>
              <label>
                Fim
                <input
                  type="date"
                  value={selectedSubmission.plan.end_date}
                  onChange={(event) => updateSubmission(selectedSubmission.id, { end_date: event.target.value })}
                />
                <small>{formatDateBR(selectedSubmission.plan.end_date)}</small>
              </label>
              <label>
                Referência Mercado Pago
                <input
                  value={selectedSubmission.payment_reference || ""}
                  onChange={(event) =>
                    updateSubmission(selectedSubmission.id, { payment_reference: event.target.value })
                  }
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
                    {renewal.plan_name}: {formatDateBR(renewal.start_date)} até {formatDateBR(renewal.end_date)}
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
  );
}

export function QuestionsPanel({
  questions,
  questionForm,
  editingId,
  busy,
  updateQuestionForm,
  saveQuestion,
  editQuestion,
  cancelEditing,
  removeQuestion,
}) {
  return (
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
            <button className="admin-link-button" type="button" onClick={cancelEditing}>
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
                <button onClick={() => editQuestion(question)}>Editar</button>
                <button onClick={() => removeQuestion(question.id)}>Apagar</button>
              </div>
            </article>
          ))}
          {questions.length === 0 && <p className="muted">Cadastre a primeira pergunta da anamnese.</p>}
        </div>
      </section>
    </div>
  );
}

export function EventsPanel({ events, markEventSeen }) {
  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <h2>Alertas e ocorrências</h2>
        <span>{events.filter((event) => !event.seen_at).length} não vistos</span>
      </div>
      <div className="questions-list">
        {events.map((event) => (
          <article key={event.id}>
            <div>
              <strong>{eventLabels[event.type] || event.type}</strong>
              <span>{new Date(event.created_at).toLocaleString("pt-BR")}</span>
            </div>
            {!event.seen_at && <button onClick={() => markEventSeen(event.id)}>Marcar como visto</button>}
          </article>
        ))}
        {events.length === 0 && <p className="muted">Nenhum alerta registrado.</p>}
      </div>
    </section>
  );
}
