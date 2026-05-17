import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../lib/api";
import "./Login.css";

export default function ResetPassword() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const appName = import.meta.env.VITE_APP_NAME;
  const year = new Date().getFullYear();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!token) {
      setError("Link invalido. Solicite uma nova recuperacao de senha.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas nao conferem.");
      return;
    }

    setBusy(true);
    try {
      await authApi.post("/auth/reset-password", { token, password });
      setMessage("Senha alterada com sucesso. Voce ja pode entrar.");
      setTimeout(() => nav("/login"), 1200);
    } catch (err) {
      setError(err?.response?.data?.detail || "Nao foi possivel alterar sua senha.");
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
                    Nova senha
                  </h1>
                  <p className="text-secondary-emphasis small mb-0">
                    Crie uma nova senha para acessar sua conta
                  </p>
                </div>

                <form onSubmit={onSubmit}>
                  <div className="mb-3">
                    <label className="form-label text-white-50">Nova senha</label>
                    <input
                      className="form-control form-control-lg"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      autoComplete="new-password"
                      placeholder="Minimo 6 caracteres"
                      minLength={6}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label text-white-50">Confirmar senha</label>
                    <input
                      className="form-control form-control-lg"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      type="password"
                      autoComplete="new-password"
                      placeholder="Repita a nova senha"
                      minLength={6}
                      required
                    />
                  </div>

                  {message && <div className="alert alert-success py-2">{message}</div>}
                  {error && <div className="alert alert-danger py-2">{error}</div>}

                  <button className="btn btn-brand btn-lg w-100" disabled={busy}>
                    {busy ? "Salvando..." : "Alterar senha"}
                  </button>
                </form>

                <div className="text-center mt-3">
                  <Link to="/login" className="link-light-subtle small">
                    Voltar para login
                  </Link>
                </div>
              </div>
            </div>

            <p className="text-center text-white-50 small mt-4 mb-0">
              {year} - {appName} - todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
