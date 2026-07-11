import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authPost: vi.fn(), apiPost: vi.fn(), apiCall: vi.fn(), bind: vi.fn(), responseUse: vi.fn(() => 1), responseEject: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  api: Object.assign(mocks.apiCall, { post: mocks.apiPost, interceptors: { response: { use: mocks.responseUse, eject: mocks.responseEject } } }),
  authApi: { defaults: {}, post: mocks.authPost },
  bindAccessTokenGetter: mocks.bind,
}));
vi.mock("../lib/jwt", () => ({ isExpired: (token) => !token, readRoles: (token) => token ? ["user"] : [] }));
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const auth = useAuth();
  return <div>
    <span>{auth.isAuthenticated ? "authenticated" : "anonymous"}</span>
    <button onClick={() => auth.login("user@example.com", "secret123", true)}>login</button>
    <button onClick={() => auth.register("new@example.com", "secret123")}>register</button>
    <button onClick={auth.logout}>logout</button>
    <button onClick={auth.refresh}>refresh</button>
  </div>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    const values = new Map();
    const storage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, String(value))),
      removeItem: vi.fn((key) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: { ...storage } });
    mocks.authPost.mockReset();
    mocks.apiPost.mockReset();
    mocks.responseUse.mockReset();
    mocks.responseUse.mockReturnValue(1);
  });
  it("logs in, registers and logs out", async () => {
    mocks.authPost.mockImplementation((url) => {
      if (url === "/auth/login") return Promise.resolve({ data: { access_token: "token" } });
      return Promise.resolve({ data: {} });
    });
    mocks.apiPost.mockResolvedValue({ data: {} });
    render(<AuthProvider><Probe /></AuthProvider>);
    const user = userEvent.setup();
    expect(screen.getByText("anonymous")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "login" }));
    expect(await screen.findByText("authenticated")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "logout" }));
    expect(await screen.findByText("anonymous")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "register" }));
    expect(mocks.apiPost).toHaveBeenCalledWith("/auth/register", { email: "new@example.com", password: "secret123" });
    expect(mocks.authPost).toHaveBeenCalledWith("/auth/logout", null, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  });

  it("refreshes a remembered session on startup", async () => {
    window.localStorage.setItem("wb_auth_remember_session", "1");
    mocks.authPost.mockResolvedValue({ data: { access_token: "restored" } });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("authenticated")).toBeInTheDocument();
    expect(mocks.authPost).toHaveBeenCalledWith("/auth/refresh", null, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("clears markers when initial refresh fails", async () => {
    window.sessionStorage.setItem("wb_auth_active_session", "1");
    mocks.authPost.mockRejectedValue(new Error("offline"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await vi.waitFor(() => expect(window.sessionStorage.getItem("wb_auth_active_session")).toBeNull());
    expect(screen.getByText("anonymous")).toBeInTheDocument();
  });

  it("exposes a response interceptor that retries one unauthorized request", async () => {
    let rejected;
    mocks.responseUse.mockImplementation((_ok, fail) => { rejected = fail; return 9; });
    mocks.authPost.mockResolvedValue({ data: { access_token: "refreshed" } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await vi.waitFor(() => expect(rejected).toBeTypeOf("function"));
    await expect(rejected({ response: { status: 500 }, config: {} })).rejects.toBeTruthy();
    await expect(rejected({ response: { status: 401 }, config: { _retry: true } })).rejects.toBeTruthy();
    mocks.apiCall.mockResolvedValue({ data: "retried" });
    await expect(rejected({ response: { status: 401 }, config: { url: "/protected" } })).resolves.toEqual({ data: "retried" });
    mocks.authPost.mockRejectedValueOnce(new Error("refresh failed"));
    await expect(rejected({ response: { status: 401 }, config: { url: "/again" } })).rejects.toThrow("refresh failed");
  });

  it("requires the provider", () => {
    function Outside() { useAuth(); return null; }
    expect(() => render(<Outside />)).toThrow(/inside/);
  });

  it("tolerates unavailable browser storage", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    Object.defineProperty(window, "localStorage", { configurable: true, value: broken });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: broken });
    expect(() => render(<AuthProvider><Probe /></AuthProvider>)).not.toThrow();
  });
});
