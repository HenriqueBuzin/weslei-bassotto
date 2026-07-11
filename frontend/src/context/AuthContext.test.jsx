import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authPost: vi.fn(), apiPost: vi.fn(), bind: vi.fn(), responseUse: vi.fn(() => 1), responseEject: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  api: Object.assign(vi.fn(), { post: mocks.apiPost, interceptors: { response: { use: mocks.responseUse, eject: mocks.responseEject } } }),
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
  </div>;
}

describe("AuthContext", () => {
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
});
