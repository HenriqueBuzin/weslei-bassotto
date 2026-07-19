import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { EventsPanel, QuestionsPanel, SubmissionsPanel } from "./DashboardPanels";

const emptyQuestion = {
  label: "",
  type: "textarea",
  options: "",
  required: true,
  active: true,
  order: 0,
};

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
  const [events, setEvents] = useState([]);
  const [questionForm, setQuestionForm] = useState(emptyQuestion);
  const [editingId, setEditingId] = useState(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedSubmission = useMemo(
    () => submissions.find((item) => item.id === selectedSubmissionId) || submissions[0],
    [selectedSubmissionId, submissions],
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

  async function markEventSeen(id) {
    try {
      await api.post(`/consultancy/admin/events/${id}/seen`);
      setEvents((items) =>
        items.map((item) => (item.id === id ? { ...item, seen_at: new Date().toISOString() } : item)),
      );
    } catch {
      setError("Não foi possível marcar o alerta como visto.");
    }
  }

  function editQuestion(question) {
    setEditingId(question.id);
    setQuestionForm(normalizeQuestion(question));
  }

  function cancelEditing() {
    setEditingId(null);
    setQuestionForm(emptyQuestion);
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
          <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>
            Alertas ({events.filter((event) => !event.seen_at).length})
          </button>
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
