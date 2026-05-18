import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;

const plans = {
  trimestral: { name: "Plano Trimestral", months: 3, cash: 597, subscriptionTotal: 638, monthly: 212.66 },
  semestral: { name: "Plano Semestral", months: 6, cash: 997, subscriptionTotal: 1093, monthly: 182.23 },
  anual: { name: "Plano Anual", months: 12, cash: 1597, subscriptionTotal: 1863, monthly: 155.25 },
};

function brl(value) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function loadMercadoPagoScript() {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = resolve;
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
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const planSlug = plans[params.get("plano")] ? params.get("plano") : "trimestral";
  const renewId = params.get("renew") || "";
  const plan = plans[planSlug];
  const [paymentMode, setPaymentMode] = useState("subscription");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);

  const amount = useMemo(
    () => String(paymentMode === "cash" ? plan.cash : plan.monthly),
    [paymentMode, plan.cash, plan.monthly]
  );

  useEffect(() => {
    let mounted = true;

    async function mountBrick() {
      if (!publicKey) {
        setError("VITE_MP_PUBLIC_KEY nao configurada.");
        return;
      }

      try {
        setError("");
        setReady(false);
        safeUnmountBrick(controllerRef.current);
        controllerRef.current = null;
        await loadMercadoPagoScript();
        if (!mounted) return;

        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
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
              new Promise((resolve, reject) => {
                const payerEmail = cardFormData?.payer?.email;
                const token = cardFormData?.token || cardFormData?.card_token_id;
                const paymentMethodId = cardFormData?.payment_method_id || cardFormData?.paymentMethodId;

                if (!payerEmail || !token) {
                  setError("Preencha o e-mail do proprietario do cartao e os dados do cartao.");
                  reject();
                  return;
                }

                setBusy(true);
                setError("");
                api
                  .post("/payments/card-subscription", {
                    plan_slug: planSlug,
                    payer_email: payerEmail,
                    card_token_id: token,
                    payment_method_id: paymentMethodId,
                    payment_mode: paymentMode,
                  })
                  .then(({ data }) => {
                    resolve();
                    if (renewId) {
                      return api
                        .post(`/consultancy/me/submissions/${renewId}/renew`, {
                          plan_slug: planSlug,
                          payment_reference: data.preapproval_id,
                        })
                        .then(() => navigate("/assinante?renovacao=ok"));
                    }
                    navigate(
                      `/questionario?plano=${planSlug}&preapproval_id=${data.preapproval_id}&email=${encodeURIComponent(
                        payerEmail
                      )}`
                    );
                  })
                  .catch((err) => {
                    setError(err?.response?.data?.detail || "Nao foi possivel autorizar o pagamento.");
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
          setError(err?.message || "Nao foi possivel carregar o Checkout Bricks do Mercado Pago.");
        }
      }
    }

    mountBrick();

    return () => {
      mounted = false;
      safeUnmountBrick(controllerRef.current);
    };
  }, [amount, navigate, paymentMode, planSlug, renewId]);

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
            Escolha pagamento a vista ou assinatura mensal recorrente. O Mercado Pago processa os
            dados do cartao com seguranca.
          </p>
          {renewId && <p className="muted">Renovacao da sua consultoria atual.</p>}
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
                <strong>A vista</strong>
                <span>{brl(plan.cash)} em uma cobranca</span>
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
              <span>{paymentMode === "cash" ? "A vista" : "Total da assinatura"}</span>
              <p>
                {paymentMode === "cash"
                  ? "Uma cobranca unica no cartao."
                  : `Cobrancas mensais recorrentes por ${plan.months} meses.`}
              </p>
              <small>
                O e-mail pedido no cartao e o e-mail do proprietario do cartao. Ele pode ser
                diferente do e-mail da conta no site.
              </small>
            </div>
          </div>

          <div className="form-section">
            <h2>Cartao</h2>
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
