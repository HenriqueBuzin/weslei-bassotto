import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ instances: [] }));
vi.mock("axios", () => ({
  default: {
    create: vi.fn((config) => {
      const instance = {
        config,
        interceptors: {
          request: {
            use: vi.fn((fn) => {
              instance.interceptor = fn;
            }),
          },
        },
      };
      state.instances.push(instance);
      return instance;
    }),
  },
}));

describe("API clients", () => {
  it("normalizes the base URL and injects a bound access token", async () => {
    const { api, authApi, bindAccessTokenGetter } = await import("./api");
    expect(api.config.baseURL.endsWith("/")).toBe(false);
    expect(authApi.config.withCredentials).toBe(true);
    const plain = api.interceptor({ headers: {} });
    expect(plain.headers.Authorization).toBeUndefined();
    bindAccessTokenGetter(() => "access-token");
    const secured = api.interceptor({ headers: {} });
    expect(secured.headers.Authorization).toBe("Bearer access-token");
  });

  it("fails fast without an API base URL", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE", "");
    await expect(import("./api.js")).rejects.toThrow(/VITE_API_BASE/);
    vi.unstubAllEnvs();
  });
});
