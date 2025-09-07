// src/pages/Login.jsx

import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();

  const appName = import.meta.env.VITE_APP_NAME;
  const year = new Date().getFullYear();

  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password, remember);
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
    <div className="auth-hero d-flex align-items-center justify-content-center min-vh-100">
      <div className="container px-3">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-5">
            <div className="glass card border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="card-body p-4 p-md-5">
                <div className="text-center mb-4">
                  <h1 className="h4 fw-bold text-white mb-1 text-uppercase tracking-1">
                    Entrar
                  </h1>
                  <p className="text-secondary-emphasis small mb-0">
                    Acesse sua conta para continuar
                  </p>
                </div>

                <form onSubmit={onSubmit} noValidate>
                  <div className="mb-3">
                    <label className="form-label text-white-50">E-mail</label>
                    <input
                      className={`form-control form-control-lg ${
                        err ? "is-invalid" : ""
                      }`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      autoComplete="username"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>

                  <div className="mb-2 position-relative">
                    <label className="form-label text-white-50">Senha</label>
                    <div className="input-group input-group-lg">
                      <input
                        className={`form-control ${err ? "is-invalid" : ""}`}
                        value={password}
                        onChange={(e) => setPwd(e.target.value)}
                        type={showPwd ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-outline-light-subtle"
                        onClick={() => setShowPwd((v) => !v)}
                        aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                        style={{ minWidth: 80 }}
                      >
                        {showPwd ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="remember"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      <label className="form-check-label text-white-50" htmlFor="remember">
                        Lembrar de mim
                      </label>
                    </div>
                    <Link to="/recuperar" className="link-light-subtle small">
                      Esqueci minha senha
                    </Link>
                  </div>

                  {err && <div className="alert alert-danger py-2">{err}</div>}

                  <button className="btn btn-brand btn-lg w-100" disabled={busy}>
                    {busy ? (
                      <span className="d-inline-flex align-items-center gap-2">
                        <span className="spinner-border spinner-border-sm" role="status" />
                        Entrando…
                      </span>
                    ) : (
                      "Entrar"
                    )}
                  </button>
                </form>

              </div>
            </div>

            <p className="text-center text-white-50 small mt-4 mb-0">
              {year} © {appName} — todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
