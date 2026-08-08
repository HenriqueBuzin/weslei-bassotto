import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authPost: vi.fn(),
  apiPost: vi.fn(),
  apiCall: vi.fn(),
  bind: vi.fn(),
  responseUse: vi.fn(() => 1),
  responseEject: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  api: Object.assign(mocks.apiCall, {
    post: mocks.apiPost,
    interceptors: { response: { use: mocks.responseUse, eject: mocks.responseEject } },
  }),
  authApi: { defaults: {}, post: mocks.authPost },
  bindAccessTokenGetter: mocks.bind,
}));
vi.mock("../lib/jwt", () => ({ isExpired: (token) => !token, readRoles: (token) => (token ? ["user"] : []) }));
import {
  AuthProvider,
  clearSessionMarker,
  markSession,
  shouldTryInitialRefresh,
  storageGet,
  storageRemove,
  storageSet,
  useAuth,
} from "./AuthContext";

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.isAuthenticated ? "authenticated" : "anonymous"}</span>
      <span data-testid="must-change">{auth.mustChangePassword ? "must-change" : "free"}</span>
      <button onClick={auth.markPasswordChanged}>mark changed</button>
      <button onClick={() => auth.login("user@example.com", "secret123", true)}>login</button>
      <button onClick={() => auth.register("new@example.com", "secret123")}>register</button>
      <button onClick={auth.logout}>logout</button>
      <button onClick={auth.refresh}>refresh</button>
    </div>
  );
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
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    expect(screen.getByText("anonymous")).toBeInTheDocument();
    expect(mocks.bind.mock.calls.at(-1)[0]()).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "login" }));
    expect(await screen.findByText("authenticated")).toBeInTheDocument();
    expect(mocks.bind.mock.calls.at(-1)[0]()).toBe("token");
    await user.click(screen.getByRole("button", { name: "logout" }));
    expect(await screen.findByText("anonymous")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "register" }));
    expect(mocks.apiPost).toHaveBeenCalledWith("/auth/register", { email: "new@example.com", password: "secret123" });
    expect(mocks.authPost).toHaveBeenCalledWith("/auth/logout", null, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
  });

  it("keeps the temporary-password flag from login and clears it when changed", async () => {
    mocks.authPost.mockResolvedValue({ data: { access_token: "token", must_change_password: true } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "login" }));
    expect(await screen.findByText("must-change")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "mark changed" }));
    expect(await screen.findByText("free")).toBeInTheDocument();
  });

  /**
   * O access token vive em memoria e um F5 recria a sessao pelo refresh. Se o
   * refresh nao repetisse a flag, recarregar a pagina viraria a forma de escapar
   * da troca obrigatoria.
   */
  it("keeps the flag across a reload, because refresh repeats it", async () => {
    window.localStorage.setItem("wb_auth_remember_session", "1");
    mocks.authPost.mockResolvedValue({ data: { access_token: "restored", must_change_password: true } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("authenticated")).toBeInTheDocument();
    expect(screen.getByTestId("must-change").textContent).toBe("must-change");
  });

  it("leaves the flag off when the API does not send it", async () => {
    mocks.authPost.mockResolvedValue({ data: { access_token: "token" } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "login" }));
    expect(await screen.findByText("authenticated")).toBeInTheDocument();
    expect(screen.getByTestId("must-change").textContent).toBe("free");
  });

  it("drops the flag on logout", async () => {
    mocks.authPost.mockImplementation((url) =>
      url === "/auth/login"
        ? Promise.resolve({ data: { access_token: "token", must_change_password: true } })
        : Promise.resolve({ data: {} }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "login" }));
    expect(await screen.findByText("must-change")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "logout" }));
    expect(await screen.findByText("free")).toBeInTheDocument();
  });

  it("refreshes a remembered session on startup", async () => {
    window.localStorage.setItem("wb_auth_remember_session", "1");
    mocks.authPost.mockResolvedValue({ data: { access_token: "restored" } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
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
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await vi.waitFor(() => expect(window.sessionStorage.getItem("wb_auth_active_session")).toBeNull());
    expect(screen.getByText("anonymous")).toBeInTheDocument();
  });

  it("exposes a response interceptor that retries one unauthorized request", async () => {
    let accepted, rejected;
    mocks.responseUse.mockImplementation((ok, fail) => {
      accepted = ok;
      rejected = fail;
      return 9;
    });
    mocks.authPost.mockResolvedValue({ data: { access_token: "refreshed" } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await vi.waitFor(() => expect(rejected).toBeTypeOf("function"));
    expect(accepted({ data: "ok" })).toEqual({ data: "ok" });
    await expect(rejected({ response: { status: 500 } })).rejects.toBeTruthy();
    await expect(rejected({ response: { status: 500 }, config: {} })).rejects.toBeTruthy();
    await expect(rejected({ response: { status: 401 }, config: { _retry: true } })).rejects.toBeTruthy();
    mocks.apiCall.mockResolvedValue({ data: "retried" });
    await expect(rejected({ response: { status: 401 }, config: { url: "/protected" } })).resolves.toEqual({
      data: "retried",
    });
    mocks.authPost.mockRejectedValueOnce(new Error("refresh failed"));
    await expect(rejected({ response: { status: 401 }, config: { url: "/again" } })).rejects.toThrow("refresh failed");
  });

  it("requires the provider", () => {
    function Outside() {
      useAuth();
      return null;
    }
    expect(() => render(<Outside />)).toThrow(/inside/);
  });

  it("shares one refresh between concurrent unauthorized responses", async () => {
    let rejected;
    let resolveRefresh;
    mocks.responseUse.mockImplementation((_ok, fail) => {
      rejected = fail;
      return 10;
    });
    mocks.authPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    mocks.apiCall.mockResolvedValue({ data: "retried" });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await vi.waitFor(() => expect(rejected).toBeTypeOf("function"));
    const first = rejected({ response: { status: 401 }, config: { url: "/first" } });
    const second = rejected({ response: { status: 401 }, config: { url: "/second" } });
    resolveRefresh({ data: { access_token: "shared" } });
    await expect(Promise.all([first, second])).resolves.toEqual([{ data: "retried" }, { data: "retried" }]);
    expect(mocks.authPost).toHaveBeenCalledTimes(1);
  });

  it("tolerates unavailable browser storage", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: broken });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: broken });
    expect(() =>
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      ),
    ).not.toThrow();
  });

  it("covers storage and non-browser helper fallbacks", () => {
    expect(storageGet(undefined, "x")).toBeUndefined();
    expect(() => storageSet(undefined, "x", "1")).not.toThrow();
    expect(() => storageRemove(undefined, "x")).not.toThrow();
    expect(() =>
      storageSet(
        {
          setItem: () => {
            throw new Error("blocked");
          },
        },
        "x",
        "1",
      ),
    ).not.toThrow();
    expect(() =>
      storageRemove(
        {
          removeItem: () => {
            throw new Error("blocked");
          },
        },
        "x",
      ),
    ).not.toThrow();
    const original = globalThis.window;
    vi.stubGlobal("window", undefined);
    expect(shouldTryInitialRefresh()).toBe(false);
    expect(() => markSession()).not.toThrow();
    expect(() => clearSessionMarker()).not.toThrow();
    vi.stubGlobal("window", original);
  });
});
