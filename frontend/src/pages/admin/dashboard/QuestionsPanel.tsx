import type { FormEventHandler } from "react";
import type { Question, QuestionForm } from "../../../types/consultancy";

type Props = {
  questions: Question[];
  questionForm: QuestionForm;
  editingId: string | null;
  busy: boolean;
  updateQuestionForm: (field: keyof QuestionForm, value: string | boolean) => void;
  saveQuestion: FormEventHandler<HTMLFormElement>;
  editQuestion: (question: Question) => void;
  cancelEditing: () => void;
  removeQuestion: (id: string) => Promise<void>;
};

export default function QuestionsPanel({
  questions,
  questionForm,
  editingId,
  busy,
  updateQuestionForm,
  saveQuestion,
  editQuestion,
  cancelEditing,
  removeQuestion,
}: Props) {
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
              onChange={(event) => updateQuestionForm("label", event.target.value)}
              required
            />
          </label>
          <div className="form-grid compact">
            <label>
              Tipo
              <select
                value={questionForm.type}
                onChange={(event) => updateQuestionForm("type", event.target.value as QuestionForm["type"])}
              >
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
                onChange={(event) => updateQuestionForm("order", event.target.value)}
              />
            </label>
          </div>
          <label>
            Opções, uma por linha
            <textarea
              value={questionForm.options}
              onChange={(event) => updateQuestionForm("options", event.target.value)}
              disabled={questionForm.type !== "select"}
              placeholder="Use apenas para perguntas de seleção"
            />
          </label>
          <div className="toggle-row">
            <label>
              <input
                type="checkbox"
                checked={questionForm.required}
                onChange={(event) => updateQuestionForm("required", event.target.checked)}
              />
              Obrigatória
            </label>
            <label>
              <input
                type="checkbox"
                checked={questionForm.active}
                onChange={(event) => updateQuestionForm("active", event.target.checked)}
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
