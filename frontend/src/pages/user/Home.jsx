// src/pages/admin/Home.jsx

import React from "react";
import { useAuth } from "../../context/AuthContext";

export default function Home() {
  const { roles, logout } = useAuth();
  return (
    <div className="container mt-5">
      <h1>Home</h1>
      <p>Suas roles: {roles.join(", ") || "(nenhuma)"}</p>
      <button className="btn btn-outline-secondary" onClick={logout}>Sair</button>
    </div>
  );
}
