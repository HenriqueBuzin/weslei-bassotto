import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../lib/api";
import "./Login.css";

export default function ForgotPassword() {
  const appName = import.meta.env.VITE_APP_NAME;
  const year = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setResetUrl("");
    try {
      const { data } = await authApi.post("/auth/forgot-password", { email });
      if (data.email_sent) {
        setMessage("Enviamos um link para redefinir sua senha. Confira seu Gmail.");
      } else {
        setMessage("Se este e-mail estiver cadastrado, voce recebera um link para redefinir sua senha.");
      }
      if (data.reset_url) setResetUrl(data.reset_url);
    } catch (err) {
      setError(err?.response?.data?.detail || "Nao foi possivel solicitar a recuperacao agora.");
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
                    Recuperar senha
                  </h1>
                  <p className="text-secondary-emphasis small mb-0">
                    Informe seu e-mail para receber o link de redefinicao
                  </p>
                </div>

                <form onSubmit={onSubmit}>
                  <div className="mb-3">
                    <label className="form-label text-white-50">E-mail</label>
                    <input
                      className="form-control form-control-lg"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      autoComplete="username"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>

                  {message && <div className="alert alert-success py-2">{message}</div>}
                  {resetUrl && (
                    <div className="alert alert-warning py-2">
                      Ambiente de teste: <Link to={resetUrl.replace(window.location.origin, "")}>abrir link</Link>
                    </div>
                  )}
                  {error && <div className="alert alert-danger py-2">{error}</div>}

                  <button className="btn btn-brand btn-lg w-100" disabled={busy}>
                    {busy ? "Enviando..." : "Enviar link"}
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
