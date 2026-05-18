import { Link } from "react-router-dom";
import SiteNavbar from "../../components/SiteNavbar";

const whatsappNumber = (import.meta.env.VITE_WHATSAPP_NUMBER || "555491126308").replace(/\D/g, "");
const whatsappUrl = `https://wa.me/${whatsappNumber}`;

const steps = [
  {
    number: "01",
    title: "Anamnese",
    text: "Avalio seu histórico de saúde, treinos, objetivos e possíveis limitações. Você preenche tudo na área do assinante com seu login.",
  },
  {
    number: "02",
    title: "Planejamento de treino personalizado",
    text: "Nada de planilha genérica: cada aluno recebe um treino específico, periodizado e pensado para evoluir com segurança.",
  },
  {
    number: "03",
    title: "Treino no aplicativo",
    text: "Você recebe o treino pelo aplicativo, com plano completo e vídeos em que explico a execução e a biomecânica dos exercícios.",
  },
  {
    number: "04",
    title: "Planejamento alimentar",
    text: "Cardápio para todos os dias, lista de compras e substituições alimentares para facilitar sua rotina e manter constância.",
  },
  {
    number: "05",
    title: "Acompanhamento full time",
    text: "Suporte diário, bate-papo semanal, formulário de acompanhamento aos sábados e ajustes sempre que necessário.",
  },
];

const plans = [
  {
    slug: "trimestral",
    name: "Plano Trimestral",
    period: "3 meses",
    cash: "R$ 597,00",
    recurring: "3 cobranças mensais de R$ 212,66",
    installmentTotal: "R$ 638,00",
    installments: "3x de R$ 212,66",
    protocols: "2 protocolos de treino",
  },
  {
    slug: "semestral",
    name: "Plano Semestral",
    period: "6 meses",
    cash: "R$ 997,00",
    recurring: "6 cobranças mensais de R$ 182,23",
    installmentTotal: "R$ 1.093,00",
    installments: "6x de R$ 182,23",
    protocols: "3 protocolos de treino",
    featured: true,
  },
  {
    slug: "anual",
    name: "Plano Anual",
    period: "12 meses",
    cash: "R$ 1.597,00",
    recurring: "12 cobranças mensais de R$ 155,25",
    installmentTotal: "R$ 1.863,00",
    installments: "12x de R$ 155,25",
    protocols: "6 protocolos de treino",
  },
];

const testimonials = [
  {
    quote:
      "Atendimento muito próximo e treino bem explicado. Consegui criar rotina e finalmente enxergar evolução semana após semana.",
    name: "Aluna da consultoria",
  },
  {
    quote:
      "O suporte faz diferença. Sempre que tive dúvida, recebi orientação clara para ajustar treino, dieta e execução.",
    name: "Cliente acompanhado",
  },
  {
    quote:
      "Planejamento individualizado de verdade. Não é só receber uma planilha: tem acompanhamento, cobrança e estratégia.",
    name: "Aluno online",
  },
  {
    quote:
      "A combinação de treino, alimentação e feedback semanal deixou o processo muito mais simples de seguir.",
    name: "Avaliação Google Business",
  },
];

const gallery = [
  "/consultoria/weslei-terra-execucao.jpeg",
  "/consultoria/weslei-maquina.jpeg",
  "/consultoria/weslei-espelho-wide.jpeg",
  "/consultoria/weslei-barra-relogio.jpeg",
];

export default function Home() {
  const appName = import.meta.env.VITE_APP_NAME || "Weslei Bassotto";
  const year = new Date().getFullYear();

  return (
    <>
      <SiteNavbar />

      <header className="hero-consultoria" id="inicio">
        <div className="hero-copy">
          <p className="eyebrow">Consultoria online personalizada</p>
          <h1>{appName}</h1>
          <p className="hero-lead">
            Treino, dieta e acompanhamento direto para mulheres que querem evoluir com método,
            segurança e constância.
          </p>
          <div className="hero-actions">
            <a className="btn btn-brand btn-lg" href="#planos">
              Quero fazer parte
            </a>
            <Link className="btn btn-outline-light btn-lg" to="/assinante">
              Área do assinante
            </Link>
          </div>
        </div>
        <div className="hero-meta" aria-label="Credenciais">
          <span>CREF 03373-G/SC</span>
          <span>21 anos de musculação</span>
          <span>Estética feminina</span>
        </div>
      </header>

      <main>
        <section className="section section-intro" id="como-funciona">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">Veja como funciona</p>
              <h2>Uma consultoria para acompanhar sua rotina de perto.</h2>
              <p>
                O processo combina avaliação inicial, treino no aplicativo, estratégia alimentar e
                ajustes semanais para manter sua evolução acontecendo.
              </p>
            </div>

            <div className="process-list">
              {steps.map((step) => (
                <article className="process-item" key={step.number}>
                  <span>{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section coach-band" id="sobre">
          <div className="container coach-grid">
            <div>
              <p className="eyebrow">Treinador</p>
              <h2>Especialista em treino, estética feminina e estética abdominal.</h2>
              <p>
                Consultoria conduzida por profissional com CREF 03373-G/SC, especialista em
                estética feminina, estética abdominal e diástase abdominal.
              </p>
              <ul className="credential-list">
                <li>Praticante de musculação há 21 anos</li>
                <li>Dúvidas por WhatsApp ou videochamada</li>
                <li>Ajustes de estratégia conforme sua resposta semanal</li>
              </ul>
            </div>
            <div className="coach-photo-wrap">
              <img
                src="/consultoria/weslei-espelho-vertical.jpeg"
                alt="Weslei Bassotto em academia"
              />
            </div>
          </div>
        </section>

        <section className="section" id="planos">
          <div className="container">
            <div className="section-heading center">
              <p className="eyebrow">Escolha seu plano</p>
              <h2>Assinaturas com período fechado e acompanhamento mensal.</h2>
              <p>
                Você escolhe pagar à vista ou em assinatura mensal recorrente pelo período do
                plano, direto pelo Mercado Pago dentro do site.
              </p>
            </div>

            <div className="plans-grid">
              {plans.map((plan) => (
                <article className={`plan-card ${plan.featured ? "featured" : ""}`} key={plan.slug}>
                  {plan.featured && <span className="plan-tag">Mais escolhido</span>}
                  <p className="plan-period">{plan.period}</p>
                  <h3>{plan.name}</h3>
                  <div className="price-block">
                    <span>Total do plano</span>
                    <strong>{plan.cash}</strong>
                  </div>
                  <p className="installments">
                    À vista: {plan.cash}
                    <br />
                    Assinatura: {plan.recurring}
                  </p>
                  <ul>
                    <li>{plan.protocols}</li>
                    <li>Suporte direto comigo de segunda à segunda</li>
                    <li>Dieta personalizada elaborada por nutricionista</li>
                    <li>Ajustes semanais de treino e dieta</li>
                  </ul>
                  <Link className="btn btn-brand w-100" to={`/checkout?plano=${plan.slug}`}>
                    Assinar
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section testimonials-band" id="depoimentos">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">Quero fazer parte</p>
              <h2>Depoimentos de alunos.</h2>
              <p>
                Estes textos estão prontos como base. Quando você enviar os depoimentos reais do
                Google Business, é só trocar.
              </p>
            </div>
            <div className="testimonials-grid">
              {testimonials.map((testimonial) => (
                <article className="testimonial-card" key={testimonial.quote}>
                  <p>“{testimonial.quote}”</p>
                  <strong>{testimonial.name}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="gallery-strip" aria-label="Fotos da consultoria">
          {gallery.map((src) => (
            <div
              className="gallery-tile"
              key={src}
              role="img"
              aria-label="Treino em academia"
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
        </section>

        <section className="cta-final" id="contato">
          <div className="container">
            <p className="eyebrow">Comece agora</p>
            <h2>Entre para a consultoria e receba uma estratégia individualizada.</h2>
            <div className="cta-actions">
              <a className="btn btn-brand btn-lg" href="#planos">
                Ver planos
              </a>
              <a className="btn btn-outline-light btn-lg" href={whatsappUrl} target="_blank" rel="noreferrer">
                Tirar dúvidas no WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <strong>{appName}</strong>
          <span>{year} © Todos os direitos reservados.</span>
        </div>
      </footer>
    </>
  );
}
