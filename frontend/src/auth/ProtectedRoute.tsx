import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type ProtectedRouteProps = {
  roles?: string[];
  children?: ReactNode;
};

export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { isAuthenticated, roles: myRoles = [] } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (Array.isArray(roles) && roles.length > 0) {
    const ok = myRoles.some((r) => roles.includes(r));
    if (!ok) return <Navigate to="/not-authorized" replace />;
  }

  // Se foi usado como wrapper, renderiza os filhos; senão, usa <Outlet/>
  return children ? children : <Outlet />;
}
