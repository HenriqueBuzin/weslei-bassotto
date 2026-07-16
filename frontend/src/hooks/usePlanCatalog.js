import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function normalizePlanCatalog(items) {
  return Object.fromEntries(
    (Array.isArray(items) ? items : []).map((plan) => [
      plan.slug,
      {
        slug: plan.slug,
        name: plan.name,
        months: Number(plan.months),
        cash: Number(plan.cash),
        subscriptionTotal: Number(plan.subscription_total),
        monthly: Number(plan.monthly),
      },
    ]),
  );
}

export function usePlanCatalog() {
  const [plans, setPlans] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    api
      .get("/plans")
      .then(({ data }) => {
        if (!mounted) return;
        setPlans(normalizePlanCatalog(data));
        setError("");
      })
      .catch(() => {
        if (mounted) setError("Não foi possível carregar os planos. Tente novamente em alguns instantes.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { plans, loading, error };
}

export function selectPlan(plans, requestedSlug) {
  return plans[requestedSlug] || plans.trimestral || Object.values(plans)[0] || null;
}
