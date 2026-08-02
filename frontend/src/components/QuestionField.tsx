import type { ChangeEvent } from "react";
import type { AnswerValue, Question } from "../types/consultancy";

type Props = {
  question: Question;
  value?: AnswerValue;
  onChange: (questionId: string, value: string) => void;
};

export default function QuestionField({ question, value = "", onChange }: Props) {
  const update = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange(question.id, event.target.value);

  return (
    <label className="question-field">
      {question.label}
      {question.required && <span> obrigatório</span>}
      {question.type === "textarea" && <textarea value={value} onChange={update} required={question.required} />}
      {question.type === "select" && (
        <select value={value} onChange={update} required={question.required}>
          <option value="">Selecione</option>
          {(question.options || []).map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      )}
      {question.type === "boolean" && (
        <select value={value} onChange={update} required={question.required}>
          <option value="">Selecione</option>
          <option value="Sim">Sim</option>
          <option value="Não">Não</option>
        </select>
      )}
      {(question.type === "text" || question.type === "number") && (
        <input
          type={question.type === "number" ? "number" : "text"}
          value={value}
          onChange={update}
          required={question.required}
        />
      )}
    </label>
  );
}
