import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, roles: [] } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth.value }));
import ProtectedRoute from "./ProtectedRoute";

function renderRoute(roles) {
  return render(
    <MemoryRouter initialEntries={["/private"]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/not-authorized" element={<p>Denied page</p>} />
        <Route
          path="/private"
          element={
            <ProtectedRoute roles={roles}>
              <p>Private page</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects anonymous users", () => {
    auth.value = { isAuthenticated: false, roles: [] };
    renderRoute();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("blocks a user without the required role", () => {
    auth.value = { isAuthenticated: true, roles: ["user"] };
    renderRoute(["admin"]);
    expect(screen.getByText("Denied page")).toBeInTheDocument();
  });

  it("renders authorized content", () => {
    auth.value = { isAuthenticated: true, roles: ["admin"] };
    renderRoute(["admin"]);
    expect(screen.getByText("Private page")).toBeInTheDocument();
  });

  it("renders an outlet when used as a route element", () => {
    auth.value = { isAuthenticated: true, roles: ["user"] };
    render(
      <MemoryRouter initialEntries={["/inside"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/inside" element={<p>Outlet content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Outlet content")).toBeInTheDocument();
  });
});
