import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;

const plans = {
  trimestral: { name: "Plano Trimestral", months: 3, total: 597, monthly: 199 },
  semestral: { name: "Plano Semestral", months: 6, total: 997, monthly: 166.17 },
  anual: { name: "Plano Anual", months: 12, total: 1597, monthly: 133.08 },
};

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

export default function CheckoutBrick() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const planSlug = plans[params.get("plano")] ? params.get("plano") : "trimestral";
  const plan = plans[planSlug];
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);
  const emailRef = useRef("");

  const amount = useMemo(() => String(plan.monthly), [plan.monthly]);

  useEffect(() => {
    emailRef.current = email;
  }, [email]);

  useEffect(() => {
    let mounted = true;

    async function mountBrick() {
      if (!publicKey) {
        setError("VITE_MP_PUBLIC_KEY nao configurada.");
        return;
      }

      try {
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
            onReady: () => setReady(true),
            onSubmit: (cardFormData) =>
              new Promise((resolve, reject) => {
                const payerEmail = cardFormData?.payer?.email || emailRef.current;
                const token = cardFormData?.token || cardFormData?.card_token_id;
                const paymentMethodId = cardFormData?.payment_method_id || cardFormData?.paymentMethodId;

                if (!payerEmail || !token) {
                  setError("Preencha o e-mail e os dados do cartao.");
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
                  })
                  .then(({ data }) => {
                    resolve();
                    navigate(
                      `/questionario?plano=${planSlug}&preapproval_id=${data.preapproval_id}&email=${encodeURIComponent(
                        payerEmail
                      )}`
                    );
                  })
                  .catch((err) => {
                    setError(err?.response?.data?.detail || "Nao foi possivel autorizar a assinatura.");
                    reject(err);
                  })
                  .finally(() => setBusy(false));
              }),
            onError: (err) => setError(err?.message || "Erro no formulario do Mercado Pago."),
          },
        });
      } catch {
        setError("Nao foi possivel carregar o Checkout Bricks do Mercado Pago.");
      }
    }

    mountBrick();

    return () => {
      mounted = false;
      controllerRef.current?.unmount?.();
    };
  }, [amount, navigate, planSlug]);

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
            Assinatura recorrente de {plan.months} meses: R$ {plan.monthly.toFixed(2).replace(".", ",")} por
            mes. O Mercado Pago processa os dados do cartao com seguranca.
          </p>
        </header>

        <section className="questionnaire-form">
          <div className="form-section">
            <h2>Dados para assinatura</h2>
            <div className="form-grid">
              <label>
                E-mail do comprador
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </label>
              <div className="purchase-summary">
                <strong>R$ {plan.total.toFixed(2).replace(".", ",")}</strong>
                <span>Total do plano</span>
                <p>
                  Cobranças mensais recorrentes por {plan.months} meses. Nao e parcelamento comum.
                </p>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2>Cartao</h2>
            {!ready && <p className="muted">Carregando Mercado Pago...</p>}
            <div id="cardPaymentBrick_container" />
          </div>

          {busy && <div className="success-alert">Autorizando assinatura...</div>}
          {error && <div className="form-alert">{error}</div>}
        </section>
      </div>
    </main>
  );
}
