import { Link } from "react-router-dom";
import SiteNavbar from "../../components/SiteNavbar";

export default function Home() {
  const appName = import.meta.env.VITE_APP_NAME || "Minha Empresa";
  const year = new Date().getFullYear();

  const steps = [
    { n: 1, t: "Realize a compra", d: "Escolha o plano ideal para seus objetivos." },
    { n: 2, t: "Envie a anamnese", d: "Conte sua rotina, histórico e metas." },
    { n: 3, t: "Baixe o app", d: "Acompanhe tudo no app exclusivo." },
    { n: 4, t: "Receba o treino", d: "Plano sob medida entregue a você." },
    { n: 5, t: "Supere limites", d: "Ajustes e evolução contínua." },
  ];

  const stats = [
    { n: "35k+", t: "Clientes" },
    { n: "15+", t: "Anos de experiência" },
    { n: "100%", t: "Foco em resultado" },
  ];

  return (
    <>
      <SiteNavbar />

      {/* HERO */}
      <header className="hero hero-ls d-flex align-items-center">
        <div className="container text-center">
          <h1 className="display-5 fw-bold text-white mb-2 text-uppercase tracking-1">
            {appName}
          </h1>
          <p className="lead text-white-50 mb-4">
            Atendimento exclusivo com avaliação completa e plano personalizado.
          </p>
          <div className="d-flex justify-content-center gap-2">
            <Link to="/login" className="btn btn-brand btn-lg">Quero fazer parte</Link>
            <a href="#como-funciona" className="btn btn-outline-light">Como funciona</a>
          </div>
        </div>
      </header>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="section">
        <div className="container">
          <div className="text-center mb-4">
            <h2 className="h3 text-white fw-semibold text-uppercase tracking-1">Como funciona?</h2>
            <p className="text-white-50">Em 5 etapas simples você recebe um plano sob medida.</p>
          </div>
          <div className="row g-4">
            {steps.map((s) => (
              <div className="col-12 col-md-6 col-lg-4" key={s.n}>
                <div className="card card-ghost h-100">
                  <div className="card-body">
                    <div className="step-badge">{s.n}</div>
                    <h3 className="h5 text-white">{s.t}</h3>
                    <p className="text-white-50 mb-0">{s.d}</p>
                  </div>
                </div>
              </div>
            ))}
            {/* para fechar as 5 colunas responsivas */}
            <div className="col-12 col-md-6 col-lg-4 d-none d-lg-block"></div>
          </div>
        </div>
      </section>

      {/* SOBRE */}
      <section id="sobre" className="section section-alt">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-12 col-lg-6">
              <img
                className="rounded-4 shadow-lg w-100 object-cover"
                style={{ maxHeight: 420 }}
                src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=1600&auto=format&fit=crop"
                alt="Time em ação"
              />
            </div>
            <div className="col-12 col-lg-6">
              <h2 className="h3 text-white fw-semibold mb-3 text-uppercase tracking-1">Treinador</h2>
              <p className="text-white-50 mb-3">
                Profissional com sólida formação e experiência prática. Metodologia voltada a resultados,
                combinando ciência, acompanhamento e ajustes frequentes.
              </p>
              <ul className="list-unstyled text-white-50 mb-4">
                <li className="mb-2">• Consultoria online e presencial</li>
                <li className="mb-2">• Integração com aplicativo</li>
                <li className="mb-2">• Suporte dedicado</li>
              </ul>
              <Link to="/login" className="btn btn-brand">Sou assinante</Link>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="section">
        <div className="container">
          <div className="row g-4 text-center">
            {stats.map((s, i) => (
              <div className="col-12 col-md-4" key={i}>
                <div className="stat">
                  <div className="stat-n">{s.n}</div>
                  <div className="stat-t text-white-50">{s.t}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARCEIROS / STRIP */}
      <section className="partners-strip">
        <div className="container text-center">
          <span className="text-white-50 small">Parceiros</span>
          <div className="d-flex flex-wrap justify-content-center gap-4 mt-3 opacity-75">
            <img src="https://dummyimage.com/120x40/ffffff/000000&text=Marca+1" alt="Marca 1" />
            <img src="https://dummyimage.com/120x40/ffffff/000000&text=Marca+2" alt="Marca 2" />
            <img src="https://dummyimage.com/120x40/ffffff/000000&text=Marca+3" alt="Marca 3" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-band text-center">
        <div className="container d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <h3 className="h5 text-white mb-0">Junte-se ao time e comece hoje</h3>
          <Link to="/login" className="btn btn-brand btn-lg">Quero fazer parte</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="site-footer">
        <div className="container text-center">
          <p className="text-white-50 small mb-0">
            {year} © {appName} — todos os direitos reservados.
          </p>
        </div>
      </footer>
    </>
  );
}
