import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../lib/errors";
import { loginWithRedirect, PATHS, REDIRECT_PARAM, safeRedirect } from "../routes/paths";
import "./Login.css";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const destination = safeRedirect(params.get(REDIRECT_PARAM), PATHS.subscriberArea);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await register(email, password);
      navigate(destination);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Não foi possível criar sua conta."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-hero d-flex align-items-center justify-content-center min-vh-100">
      <div className="container px-3">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-5">
            <div className="glass card border-0 shadow-lg rounded-4">
              <div className="card-body p-4 p-md-5">
                <h1 className="h4 fw-bold text-white text-center text-uppercase">Criar conta</h1>
                <p className="text-white-50 text-center">Esta será sua conta para acompanhar o plano e a anamnese.</p>
                <form onSubmit={submit}>
                  <label className="form-label text-white-50" htmlFor="register-email">
                    E-mail
                  </label>
                  <input
                    id="register-email"
                    className="form-control form-control-lg mb-3"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <label className="form-label text-white-50" htmlFor="register-password">
                    Senha
                  </label>
                  <input
                    id="register-password"
                    className="form-control form-control-lg mb-3"
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <label className="form-label text-white-50" htmlFor="register-confirmation">
                    Confirmar senha
                  </label>
                  <input
                    id="register-confirmation"
                    className="form-control form-control-lg mb-3"
                    type="password"
                    minLength={6}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    required
                  />
                  {error && <div className="alert alert-danger">{error}</div>}
                  <button className="btn btn-brand btn-lg w-100" disabled={busy}>
                    {busy ? "Criando..." : "Criar conta"}
                  </button>
                </form>
                <p className="text-white-50 text-center mt-3 mb-0">
                  Já possui conta?{" "}
                  <Link className="link-light" to={loginWithRedirect(destination)}>
                    Entrar
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
