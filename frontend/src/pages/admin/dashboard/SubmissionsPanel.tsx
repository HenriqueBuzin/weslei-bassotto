import { formatDateBR } from "../../../lib/date";
import type { Submission, SubmissionPatch } from "../../../types/consultancy";

const statusLabels = {
  pending_payment: "Pagamento pendente",
  paid: "Pago",
  active: "Ativo",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

function hasUnseenAnswers(submission?: Submission) {
  if (!submission?.answers_changed_at) return false;
  if (!submission.answers_seen_at) return true;
  return new Date(submission.answers_changed_at) > new Date(submission.answers_seen_at);
}

function hasRecurrenceIssue(submission?: Submission) {
  return submission?.recurrence_status && !["active", "authorized"].includes(submission.recurrence_status);
}

type Props = {
  submissions: Submission[];
  selectedSubmission?: Submission;
  setSelectedSubmissionId: (id: string) => void;
  updateSubmission: (id: string, patch: SubmissionPatch) => Promise<void>;
  markAnswersSeen: (id: string) => Promise<void>;
  busy: boolean;
};

export default function SubmissionsPanel({
  submissions,
  selectedSubmission,
  setSelectedSubmissionId,
  updateSubmission,
  markAnswersSeen,
  busy,
}: Props) {
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
