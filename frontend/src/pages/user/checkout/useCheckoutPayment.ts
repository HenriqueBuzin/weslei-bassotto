import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Plan } from "../../../hooks/usePlanCatalog";
import { api } from "../../../lib/api";
import { type BrickController, loadMercadoPagoScript, safeUnmountBrick } from "./mercadoPago";
import { PATHS } from "../../../routes/paths";

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;

type PaymentMode = "cash" | "subscription";

type CheckoutPaymentOptions = {
  isAuthenticated: boolean;
  plan: Plan | null;
  planSlug: string;
  renewId: string;
  paymentMode: PaymentMode;
};

type CardFormData = {
  payer?: { email?: string };
  token?: string;
  card_token_id?: string;
  payment_method_id?: string;
  paymentMethodId?: string;
};

function messageFrom(error: unknown, fallback: string) {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}

export function useCheckoutPayment({ isAuthenticated, plan, planSlug, renewId, paymentMode }: CheckoutPaymentOptions) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<BrickController | null>(null);
  const amount = useMemo(
    () => (plan ? String(paymentMode === "cash" ? plan.cash : plan.monthly) : "0"),
    [paymentMode, plan],
  );

  useEffect(() => {
    let mounted = true;

    async function mountBrick() {
      if (!isAuthenticated || !plan) return;
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
        controllerRef.current = await mp.bricks().create("cardPayment", "cardPaymentBrick_container", {
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
            onSubmit: (cardFormData: CardFormData) =>
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
                      navigate(`${PATHS.subscriberArea}?pagamento=${data.status}`);
                      return;
                    }
                    navigate(
                      `/questionario?plano=${planSlug}&payment_id=${data.payment_id}&payment_token=${encodeURIComponent(
                        data.payment_token,
                      )}`,
                    );
                  })
                  .catch((requestError) => {
                    setError(requestError?.response?.data?.detail || "Não foi possível autorizar o pagamento.");
                    reject(requestError);
                  })
                  .finally(() => setBusy(false));
              }),
            onError: (sdkError: unknown) => setError(messageFrom(sdkError, "Erro no formulário do Mercado Pago.")),
          },
        });

        if (mounted) {
          setReady(true);
          setError("");
        }
      } catch (sdkError) {
        if (mounted) {
          setError(messageFrom(sdkError, "Não foi possível carregar o Checkout Bricks do Mercado Pago."));
        }
      }
    }

    mountBrick();
    return () => {
      mounted = false;
      safeUnmountBrick(controllerRef.current);
    };
  }, [amount, isAuthenticated, navigate, paymentMode, plan, planSlug, renewId]);

  return { ready, busy, error };
}
