import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { normalizePlanCatalog, selectPlan, usePlanCatalog } from "./usePlanCatalog";

vi.mock("../lib/api", () => ({ api: { get: vi.fn() } }));

const catalog = [
  {
    slug: "trimestral",
    name: "Plano Trimestral",
    months: "3",
    cash: "597.00",
    subscription_total: "638.00",
    monthly: "212.66",
  },
];

describe("plan catalog", () => {
  beforeEach(() => api.get.mockReset());

  it("normalizes values and selects requested plans with safe fallbacks", () => {
    const plans = normalizePlanCatalog(catalog);
    expect(plans.trimestral).toEqual({
      slug: "trimestral",
      name: "Plano Trimestral",
      months: 3,
      cash: 597,
      subscriptionTotal: 638,
      monthly: 212.66,
    });
    expect(normalizePlanCatalog(null)).toEqual({});
    expect(selectPlan(plans, "trimestral")).toBe(plans.trimestral);
    expect(selectPlan(plans, "invalid")).toBe(plans.trimestral);
    expect(selectPlan({ semestral: { slug: "semestral" } }, "invalid")).toEqual({ slug: "semestral" });
    expect(selectPlan({}, "invalid")).toBeNull();
  });

  it("loads plans from the API", async () => {
    api.get.mockResolvedValue({ data: catalog });
    const { result } = renderHook(() => usePlanCatalog());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith("/plans");
    expect(result.current.plans.trimestral.cash).toBe(597);
    expect(result.current.error).toBe("");
  });

  it("reports failures and ignores responses after unmounting", async () => {
    api.get.mockRejectedValueOnce(new Error("offline"));
    const failed = renderHook(() => usePlanCatalog());
    await waitFor(() => expect(failed.result.current.loading).toBe(false));
    expect(failed.result.current.error).toMatch(/carregar os planos/);

    let resolve;
    api.get.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const pending = renderHook(() => usePlanCatalog());
    pending.unmount();
    await act(async () => resolve({ data: catalog }));

    let reject;
    api.get.mockReturnValueOnce(new Promise((_done, fail) => (reject = fail)));
    const rejected = renderHook(() => usePlanCatalog());
    rejected.unmount();
    await act(async () => reject(new Error("offline")));
  });
});
