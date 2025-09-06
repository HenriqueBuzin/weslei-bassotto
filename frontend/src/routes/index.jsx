// src/routes/index.jsx

import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import ProtectedRoute from "../auth/ProtectedRoute";

// code-splitting
const Home = lazy(() => import("../pages/user/Home.jsx"));
const Login = lazy(() => import("../pages/Login.jsx"));
const Dashboard = lazy(() => import("../pages/admin/Dashboard.jsx"));
const NotFound = lazy(() => import("../pages/NotFound.jsx"));

const routes = [
  { path: "/", element: <Home /> },
  { path: "/login", element: <Login /> },
  {
    path: "/app",
    element: (
      <ProtectedRoute>
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
