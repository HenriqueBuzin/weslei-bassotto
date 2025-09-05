// src/pages/Login.jsx
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPwd] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        "Falha no login";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container mt-5" style={{ maxWidth: 420 }}>
      <h1 className="mb-3">Login</h1>

      <form onSubmit={onSubmit}>
        <div className="mb-3">
          <label className="form-label">E-mail</label>
          <input
            className="form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Senha</label>
          <input
            className="form-control"
            value={password}
            onChange={(e) => setPwd(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {err && <div className="alert alert-danger">{err}</div>}

        <button className="btn btn-primary w-100" disabled={busy}>
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
