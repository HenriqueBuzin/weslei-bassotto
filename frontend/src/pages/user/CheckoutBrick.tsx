import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { selectPlan, usePlanCatalog } from "../../hooks/usePlanCatalog";
import { useCheckoutPayment } from "./checkout/useCheckoutPayment";

function brl(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export default function CheckoutBrick() {
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const requestedPlanSlug = params.get("plano") || "trimestral";
  const { plans, loading: plansLoading, error: plansError } = usePlanCatalog();
  const plan = selectPlan(plans, requestedPlanSlug);
  const planSlug = plan?.slug || requestedPlanSlug;
  const renewId = params.get("renew") || "";
  const [paymentMode, setPaymentMode] = useState<"cash" | "subscription">("subscription");
  const { ready, busy, error } = useCheckoutPayment({ isAuthenticated, plan, planSlug, renewId, paymentMode });

  if (!isAuthenticated) {
    const returnTo = `/checkout?plano=${planSlug}${renewId ? `&renew=${renewId}` : ""}`;
    return (
      <main className="questionnaire-page">
        <div className="questionnaire-shell">
          <section className="success-panel">
            <p className="eyebrow">Área do assinante</p>
            <h1>Entre ou crie sua conta para assinar.</h1>
            <p>O e-mail da conta identifica o aluno. No cartão, o titular poderá informar outro e-mail.</p>
            <Link className="btn btn-brand" to={`/cadastro?returnTo=${encodeURIComponent(returnTo)}`}>
              Criar conta
            </Link>
            <Link className="btn btn-outline-light" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
              Entrar
            </Link>
          </section>
        </div>
      </main>
    );
  }

  if (plansLoading || !plan) {
    return (
      <main className="questionnaire-page">
        <div className="questionnaire-shell">
          <section className="success-panel">
            <h1>{plansLoading ? "Carregando planos..." : "Planos indisponíveis"}</h1>
            {plansError && <div className="form-alert">{plansError}</div>}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="questionnaire-page">
      <div className="questionnaire-shell">
        <Link to="/" className="back-link">
          Voltar para os planos
        </Link>

        <header className="questionnaire-header">
          <p className="eyebrow">Pagamento dentro do site</p>
          <h1>{plan.name}</h1>
          <p>
            Escolha pagamento à vista ou assinatura mensal recorrente. O Mercado Pago processa os dados do cartão com
            segurança.
          </p>
          {renewId && <p className="muted">Renovação da sua consultoria atual.</p>}
        </header>

        <section className="questionnaire-form">
          <div className="form-section">
            <h2>Forma de pagamento</h2>
            <div className="payment-mode-grid">
              <button
                type="button"
                className={paymentMode === "cash" ? "active" : ""}
                onClick={() => setPaymentMode("cash")}
              >
                <strong>À vista</strong>
                <span>{brl(plan.cash)} em uma cobrança</span>
              </button>
              <button
                type="button"
                className={paymentMode === "subscription" ? "active" : ""}
                onClick={() => setPaymentMode("subscription")}
              >
                <strong>Assinatura mensal</strong>
                <span>
                  {plan.months}x de {brl(plan.monthly)}
                </span>
              </button>
            </div>
          </div>

          <div className="form-section">
            <h2>Resumo</h2>
            <div className="purchase-summary purchase-summary-wide">
              <strong>{brl(paymentMode === "cash" ? plan.cash : plan.subscriptionTotal)}</strong>
              <span>{paymentMode === "cash" ? "À vista" : "Total da assinatura"}</span>
              <p>
                {paymentMode === "cash"
                  ? "Uma cobrança única no cartão."
                  : `Cobranças mensais recorrentes por ${plan.months} meses.`}
              </p>
              <small>
                O e-mail pedido no cartão é o e-mail do proprietário do cartão. Ele pode ser diferente do e-mail da
                conta no site.
              </small>
            </div>
          </div>

          <div className="form-section">
            <h2>Cartão</h2>
            {!ready && <p className="muted">Carregando Mercado Pago...</p>}
            <div id="cardPaymentBrick_container" />
          </div>

          {busy && <div className="success-alert">Processando pagamento...</div>}
          {error && <div className="form-alert">{error}</div>}
        </section>
      </div>
    </main>
  );
}
