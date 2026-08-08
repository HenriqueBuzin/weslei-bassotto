import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { NavLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { DASHBOARD_TABS, PATHS, type DashboardTab } from "../../routes/paths";
import { EventsPanel, QuestionsPanel, SubmissionsPanel } from "./DashboardPanels";
import type { AdminEvent, Question, QuestionForm, Submission, SubmissionPatch } from "../../types/consultancy";

const EDIT_PARAM = "editar";

const TAB_PATHS: Record<DashboardTab, string> = {
  submissions: PATHS.dashboardSubmissions,
  questions: PATHS.dashboardQuestions,
  events: PATHS.dashboardEvents,
};

const emptyQuestion: QuestionForm = {
  label: "",
  type: "textarea",
  options: "",
  required: true,
  active: true,
  order: 0,
};

function normalizeQuestion(question: Question): QuestionForm {
  return {
    ...question,
    options: Array.isArray(question.options) ? question.options.join("\n") : "",
  };
}

function payloadFromQuestion(question: QuestionForm) {
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

/**
 * The whole panel is addressable: the tab comes from the path, the open student
 * from its segment and the question being edited from the query string. A
 * reload therefore returns to the same screen with freshly loaded data.
 */
export default function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { submissionId } = useParams();
  const [params, setParams] = useSearchParams();

  const location = useLocation();

  const tab: DashboardTab = useMemo(() => {
    // Drop the trailing student id so /painel/alunos/<id> still means "alunos".
    const path = location.pathname.replace(/\/[0-9a-fA-F]{24}$/, "");

    return DASHBOARD_TABS[path as keyof typeof DASHBOARD_TABS] ?? "submissions";
  }, [location.pathname]);

  const requestedEditingId = params.get(EDIT_PARAM);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [questionForm, setQuestionForm] = useState(emptyQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedSubmission = useMemo(
    () => submissions.find((item) => item.id === submissionId) || submissions[0],
    [submissionId, submissions],
  );

  const setSelectedSubmissionId = useCallback(
    (id: string) => navigate(`${PATHS.dashboardSubmissions}/${id}`),
    [navigate],
  );

  const setEditingId = useCallback(
    (id: string | null) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (id === null) {
            next.delete(EDIT_PARAM);
          } else {
            next.set(EDIT_PARAM, id);
          }

          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  async function loadAll() {
    setError("");
    try {
      const [questionRes, submissionRes, eventRes] = await Promise.all([
        api.get("/consultancy/admin/questions"),
        api.get("/consultancy/admin/submissions"),
        api.get("/consultancy/admin/events"),
      ]);
      setQuestions(questionRes.data);
      setSubmissions(submissionRes.data);
      setEvents(eventRes.data);
    } catch {
      setError("Não foi possível carregar o painel administrativo.");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // A pergunta em edição é derivada, nunca imposta: um ?editar= que aponta para
  // pergunta apagada simplesmente não resolve, e o painel oferece uma nova. A
  // versão anterior limpava o parâmetro dentro de um efeito, o que dependia da
  // ordem entre a navegação e o fim do carregamento e falhava sob carga.
  const editingQuestion = useMemo(
    () => questions.find((item) => item.id === requestedEditingId) ?? null,
    [questions, requestedEditingId],
  );

  const editingId = editingQuestion?.id ?? null;

  // Um F5 chega com ?editar=<id> já definido, então o formulário se preenche do
  // que a API acabou de devolver, e não de estado local velho.
  useEffect(() => {
    setQuestionForm(editingQuestion === null ? emptyQuestion : normalizeQuestion(editingQuestion));
  }, [editingQuestion]);

  function updateQuestionForm(field: keyof QuestionForm, value: string | boolean) {
    setQuestionForm((current) => ({ ...current, [field]: value }));
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
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

  async function removeQuestion(id: string) {
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

  async function updateSubmission(id: string, patch: SubmissionPatch) {
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

  async function markAnswersSeen(id: string) {
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

  async function markEventSeen(id: string) {
    try {
      await api.post(`/consultancy/admin/events/${id}/seen`);
      setEvents((items) =>
        items.map((item) => (item.id === id ? { ...item, seen_at: new Date().toISOString() } : item)),
      );
    } catch {
      setError("Não foi possível marcar o alerta como visto.");
    }
  }

  function editQuestion(question: Question) {
    setEditingId(question.id);
  }

  function cancelEditing() {
    setEditingId(null);
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <div>
          <p className="eyebrow">Painel</p>
          <h1>Admin consultoria</h1>
        </div>
        <nav>
          <NavLink className={tab === "submissions" ? "active" : ""} to={TAB_PATHS.submissions}>
            Alunos e respostas
          </NavLink>
          <NavLink className={tab === "questions" ? "active" : ""} to={TAB_PATHS.questions}>
            Perguntas
          </NavLink>
          <NavLink className={tab === "events" ? "active" : ""} to={TAB_PATHS.events}>
            Alertas ({events.filter((event) => !event.seen_at).length})
          </NavLink>
        </nav>
        <button className="admin-logout" onClick={logout}>
          Sair
        </button>
      </aside>

      <section className="admin-content">
        {error && <div className="form-alert">{error}</div>}
        {tab === "submissions" && (
          <SubmissionsPanel
            submissions={submissions}
            selectedSubmission={selectedSubmission}
            setSelectedSubmissionId={setSelectedSubmissionId}
            updateSubmission={updateSubmission}
            markAnswersSeen={markAnswersSeen}
            busy={busy}
          />
        )}
        {tab === "questions" && (
          <QuestionsPanel
            questions={questions}
            questionForm={questionForm}
            editingId={editingId}
            busy={busy}
            updateQuestionForm={updateQuestionForm}
            saveQuestion={saveQuestion}
            editQuestion={editQuestion}
            cancelEditing={cancelEditing}
            removeQuestion={removeQuestion}
          />
        )}
        {tab === "events" && <EventsPanel events={events} markEventSeen={markEventSeen} />}
      </section>
    </main>
  );
}
