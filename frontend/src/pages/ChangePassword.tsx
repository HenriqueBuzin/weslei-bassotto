import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { apiErrorMessage } from "../lib/errors";
import { PATHS } from "../routes/paths";

/**
 * O seeder cria os administradores com senha placeholder e
 * `must_change_password`. Esta tela é a única saída desse estado: o
 * ProtectedRoute manda todo mundo para cá enquanto a flag estiver ligada.
 */
export default function ChangePassword() {
  const navigate = useNavigate();
  const { markPasswordChanged, roles } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmation) {
      setError("A confirmação não confere com a nova senha.");

      return;
    }

    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: currentPassword, password });
      markPasswordChanged();
      navigate(roles.includes("admin") ? PATHS.dashboardSubmissions : PATHS.subscriberArea, { replace: true });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Não foi possível trocar a senha."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-hero d-flex align-items-center justify-content-center min-vh-100">
      <div className="container px-3">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-5">
            <div className="glass card border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="card-body p-4 p-md-5">
                <div className="text-center mb-4">
                  <h1 className="h4 fw-bold text-white mb-1 text-uppercase tracking-1">Definir nova senha</h1>
                  <p className="text-secondary-emphasis small mb-0">
                    Sua conta usa uma senha temporária. Escolha uma senha própria para continuar.
                  </p>
                </div>

                <form onSubmit={submit} noValidate>
                  <div className="mb-3">
                    <label className="form-label text-white-50" htmlFor="current-password">
                      Senha temporária
                    </label>
                    <input
                      id="current-password"
                      className="form-control form-control-lg"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label text-white-50" htmlFor="new-password">
                      Nova senha
                    </label>
                    <input
                      id="new-password"
                      className="form-control form-control-lg"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label text-white-50" htmlFor="confirm-password">
                      Confirmar nova senha
                    </label>
                    <input
                      id="confirm-password"
                      className="form-control form-control-lg"
                      type="password"
                      autoComplete="new-password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      required
                    />
                  </div>

                  {error && <div className="alert alert-danger py-2">{error}</div>}

                  <button className="btn btn-brand btn-lg w-100" disabled={busy}>
                    {busy ? "Salvando..." : "Salvar nova senha"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
