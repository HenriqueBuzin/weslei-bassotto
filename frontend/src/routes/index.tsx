import { lazy } from "react";
import { createBrowserRouter, Navigate, useLocation, type RouteObject } from "react-router-dom";
import ProtectedRoute from "../auth/ProtectedRoute";
import { LEGACY_REDIRECTS, PATHS } from "./paths";

export const routeLoaders = {
  home: () => import("../pages/user/Home"),
  login: () => import("../pages/Login"),
  forgotPassword: () => import("../pages/ForgotPassword"),
  resetPassword: () => import("../pages/ResetPassword"),
  register: () => import("../pages/Register"),
  dashboard: () => import("../pages/admin/Dashboard"),
  questionnaire: () => import("../pages/user/Questionnaire"),
  subscriberArea: () => import("../pages/user/SubscriberArea"),
  checkoutBrick: () => import("../pages/user/CheckoutBrick"),
  notAuthorized: () => import("../pages/NotAuthorized"),
  notFound: () => import("../pages/NotFound"),
};

const Home = lazy(routeLoaders.home);
const Login = lazy(routeLoaders.login);
const ForgotPassword = lazy(routeLoaders.forgotPassword);
const ResetPassword = lazy(routeLoaders.resetPassword);
const Register = lazy(routeLoaders.register);
const Dashboard = lazy(routeLoaders.dashboard);
const Questionnaire = lazy(routeLoaders.questionnaire);
const SubscriberArea = lazy(routeLoaders.subscriberArea);
const CheckoutBrick = lazy(routeLoaders.checkoutBrick);
const NotAuthorized = lazy(routeLoaders.notAuthorized);
const NotFound = lazy(routeLoaders.notFound);

/**
 * The admin panel is one component reading its tab from the path, so every tab
 * and every selected student is a link somebody can paste or reload into.
 */
const adminRoutes: RouteObject[] = [
  { path: PATHS.dashboard, element: <Navigate to={PATHS.dashboardSubmissions} replace /> },
  { path: PATHS.dashboardSubmissions, element: <Dashboard /> },
  { path: `${PATHS.dashboardSubmissions}/:submissionId`, element: <Dashboard /> },
  { path: PATHS.dashboardQuestions, element: <Dashboard /> },
  { path: PATHS.dashboardEvents, element: <Dashboard /> },
];

/**
 * Keeps the query string when forwarding an old link: dropping it would turn a
 * bookmarked /checkout?plano=anual into a checkout with no plan selected.
 */
export function LegacyRedirect({ to }: { to: string }) {
  const { search } = useLocation();

  return <Navigate to={`${to}${search}`} replace />;
}

const legacyRoutes: RouteObject[] = Object.entries(LEGACY_REDIRECTS).map(([from, to]) => ({
  path: from,
  element: <LegacyRedirect to={to} />,
}));

const routes: RouteObject[] = [
  { path: PATHS.home, element: <Home /> },
  { path: PATHS.checkout, element: <CheckoutBrick /> },
  { path: PATHS.login, element: <Login /> },
  { path: PATHS.register, element: <Register /> },
  { path: PATHS.forgotPassword, element: <ForgotPassword /> },
  { path: PATHS.resetPassword, element: <ResetPassword /> },
  { path: PATHS.notAuthorized, element: <NotAuthorized /> },
  {
    path: PATHS.questionnaire,
    element: (
      <ProtectedRoute>
        <Questionnaire />
      </ProtectedRoute>
    ),
  },
  {
    path: PATHS.subscriberArea,
    element: (
      <ProtectedRoute>
        <SubscriberArea />
      </ProtectedRoute>
    ),
  },
  {
    element: <ProtectedRoute roles={["admin"]} />,
    children: adminRoutes,
  },
  ...legacyRoutes,
  { path: "*", element: <NotFound /> },
];

// se o app estiver servido em subpath, o Vite já injeta BASE_URL
export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL || "/",
});
