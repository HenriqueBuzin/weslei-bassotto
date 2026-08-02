import type { AdminEvent } from "../../../types/consultancy";

const eventLabels = {
  new_contract: "Novo contrato aprovado",
  renewal_approved: "Renovação aprovada",
  answers_changed: "Respostas alteradas",
  payment_failed: "Falha no pagamento",
};

type Props = {
  events: AdminEvent[];
  markEventSeen: (id: string) => Promise<void>;
};

export default function EventsPanel({ events, markEventSeen }: Props) {
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
              <strong>{eventLabels[event.type as keyof typeof eventLabels] || event.type}</strong>
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
