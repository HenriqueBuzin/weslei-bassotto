// src/routes/index.jsx

import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import ProtectedRoute from "../auth/ProtectedRoute";

export const routeLoaders = {
  home: () => import("../pages/user/Home.jsx"),
  login: () => import("../pages/Login.jsx"),
  forgotPassword: () => import("../pages/ForgotPassword.jsx"),
  resetPassword: () => import("../pages/ResetPassword.jsx"),
  register: () => import("../pages/Register.jsx"),
  dashboard: () => import("../pages/admin/Dashboard.jsx"),
  questionnaire: () => import("../pages/user/Questionnaire.jsx"),
  subscriberArea: () => import("../pages/user/SubscriberArea.jsx"),
  checkoutBrick: () => import("../pages/user/CheckoutBrick.jsx"),
  notFound: () => import("../pages/NotFound.jsx"),
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
const NotFound = lazy(routeLoaders.notFound);

const routes = [
  { path: "/", element: <Home /> },
  { path: "/checkout", element: <CheckoutBrick /> },
  {
    path: "/questionario",
    element: (
      <ProtectedRoute>
        <Questionnaire />
      </ProtectedRoute>
    ),
  },
  { path: "/login", element: <Login /> },
  { path: "/cadastro", element: <Register /> },
  { path: "/recuperar", element: <ForgotPassword /> },
  { path: "/redefinir-senha", element: <ResetPassword /> },
  {
    path: "/assinante",
    element: (
      <ProtectedRoute>
        <SubscriberArea />
      </ProtectedRoute>
    ),
  },
  {
    path: "/app",
    element: (
      <ProtectedRoute roles={["admin"]}>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  { path: "*", element: <NotFound /> },
];

// se o app estiver servido em subpath, o Vite já injeta BASE_URL
export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL || "/",
});
