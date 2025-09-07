// src/main.jsx

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

import './main.css';

import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <Suspense fallback={<div>Carregando…</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  </React.StrictMode>
);
