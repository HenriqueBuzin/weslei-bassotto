import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type Plan = {
  slug: string;
  name: string;
  months: number;
  cash: number;
  subscriptionTotal: number;
  monthly: number;
};

type ApiPlan = {
  slug: string;
  name: string;
  months: number | string;
  cash: number | string;
  subscription_total: number | string;
  monthly: number | string;
};

export type PlanCatalog = Record<string, Plan>;

export function normalizePlanCatalog(items: unknown): PlanCatalog {
  return Object.fromEntries(
    (Array.isArray(items) ? (items as ApiPlan[]) : []).map((plan) => [
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
  const [plans, setPlans] = useState<PlanCatalog>({});
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

export function selectPlan(plans: PlanCatalog, requestedSlug: string) {
  return plans[requestedSlug] || plans.trimestral || Object.values(plans)[0] || null;
}
