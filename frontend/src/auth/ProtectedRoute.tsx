import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loginWithRedirect, PATHS } from "../routes/paths";

type ProtectedRouteProps = {
  roles?: string[];
  children?: ReactNode;
};

export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { isAuthenticated, roles: myRoles = [] } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Carrying the whole location back means signing in lands on the screen the
    // visitor actually asked for, instead of dropping them at the start.
    const target = `${location.pathname}${location.search}`;

    return <Navigate to={loginWithRedirect(target)} replace />;
  }

  if (Array.isArray(roles) && roles.length > 0) {
    const ok = myRoles.some((r) => roles.includes(r));
    if (!ok) return <Navigate to={PATHS.notAuthorized} replace />;
  }

  // Se foi usado como wrapper, renderiza os filhos; senão, usa <Outlet/>
  return children ? children : <Outlet />;
}
