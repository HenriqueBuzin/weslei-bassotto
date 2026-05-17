// src/routes/index.jsx

import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import ProtectedRoute from "../auth/ProtectedRoute";

// code-splitting
const Home = lazy(() => import("../pages/user/Home.jsx"));
const Login = lazy(() => import("../pages/Login.jsx"));
const ForgotPassword = lazy(() => import("../pages/ForgotPassword.jsx"));
const ResetPassword = lazy(() => import("../pages/ResetPassword.jsx"));
const Dashboard = lazy(() => import("../pages/admin/Dashboard.jsx"));
const Questionnaire = lazy(() => import("../pages/user/Questionnaire.jsx"));
const SubscriberArea = lazy(() => import("../pages/user/SubscriberArea.jsx"));
const CheckoutBrick = lazy(() => import("../pages/user/CheckoutBrick.jsx"));
const NotFound = lazy(() => import("../pages/NotFound.jsx"));

const routes = [
  { path: "/", element: <Home /> },
  { path: "/checkout", element: <CheckoutBrick /> },
  { path: "/questionario", element: <Questionnaire /> },
  { path: "/login", element: <Login /> },
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
