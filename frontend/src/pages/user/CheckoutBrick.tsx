import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { selectPlan, usePlanCatalog } from "../../hooks/usePlanCatalog";

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;

function brl(value) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function loadMercadoPagoScript() {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function safeUnmountBrick(controller) {
  try {
    controller?.unmount?.();
  } catch {
    // The SDK can throw when React already removed the Brick container.
  }
}

export default function CheckoutBrick() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedPlanSlug = params.get("plano") || "trimestral";
  const { plans, loading: plansLoading, error: plansError } = usePlanCatalog();
  const plan = selectPlan(plans, requestedPlanSlug);
  const hasPlan = Boolean(plan);
  const planSlug = plan?.slug || requestedPlanSlug;
  const renewId = params.get("renew") || "";
  const [paymentMode, setPaymentMode] = useState("subscription");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);

  const amount = useMemo(
    () => (plan ? String(paymentMode === "cash" ? plan.cash : plan.monthly) : "0"),
    [paymentMode, plan],
  );

  useEffect(() => {
    let mounted = true;

    async function mountBrick() {
      if (!isAuthenticated || !hasPlan) return;
      if (!publicKey) {
        setError("VITE_MP_PUBLIC_KEY não configurada.");
        return;
      }

      try {
        setError("");
        setReady(false);
        safeUnmountBrick(controllerRef.current);
        controllerRef.current = null;
        await loadMercadoPagoScript();
        if (!mounted) return;

        const MercadoPago = window.MercadoPago as NonNullable<typeof window.MercadoPago>;
        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
        const bricksBuilder = mp.bricks();
        controllerRef.current = await bricksBuilder.create("cardPayment", "cardPaymentBrick_container", {
          initialization: { amount },
          customization: {
            visual: { style: { theme: "dark" } },
            paymentMethods: { maxInstallments: 1 },
          },
          callbacks: {
            onReady: () => {
              setReady(true);
              setError("");
            },
            onSubmit: (cardFormData) =>
              new Promise<void>((resolve, reject) => {
                const payerEmail = cardFormData?.payer?.email;
                const token = cardFormData?.token || cardFormData?.card_token_id;
                const paymentMethodId = cardFormData?.payment_method_id || cardFormData?.paymentMethodId;

                if (!payerEmail || !token) {
                  setError("Preencha o e-mail do proprietário do cartão e os dados do cartão.");
                  reject();
                  return;
                }

                setBusy(true);
                setError("");
                const endpoint = renewId ? `/payments/me/renewals/${renewId}` : "/payments/card-subscription";
                api
                  .post(endpoint, {
                    plan_slug: planSlug,
                    payer_email: payerEmail,
                    card_token_id: token,
                    payment_method_id: paymentMethodId,
                    payment_mode: paymentMode,
                  })
                  .then(({ data }) => {
                    resolve();
                    if (renewId) {
                      navigate(`/assinante?pagamento=${data.status}`);
                      return;
                    }
                    navigate(
                      `/questionario?plano=${planSlug}&payment_id=${data.payment_id}&payment_token=${encodeURIComponent(
                        data.payment_token,
                      )}`,
                    );
                  })
                  .catch((err) => {
                    setError(err?.response?.data?.detail || "Não foi possível autorizar o pagamento.");
                    reject(err);
                  })
                  .finally(() => setBusy(false));
              }),
            onError: (err) => setError(err?.message || "Erro no formulario do Mercado Pago."),
          },
        });

        if (mounted) {
          setReady(true);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setError(err?.message || "Não foi possível carregar o Checkout Bricks do Mercado Pago.");
        }
      }
    }

    mountBrick();

    return () => {
      mounted = false;
      safeUnmountBrick(controllerRef.current);
    };
  }, [amount, hasPlan, isAuthenticated, navigate, paymentMode, planSlug, renewId]);

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
