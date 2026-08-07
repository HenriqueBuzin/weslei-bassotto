import { Link } from "react-router-dom";
import { PATHS } from "../routes/paths";

export default function NotAuthorized() {
  return (
    <div className="container mt-5">
      <h1>Sem permissão</h1>
      <p>Sua conta está autenticada, mas não tem acesso a esta área.</p>
      <Link className="btn btn-brand" to={PATHS.subscriberArea}>
        Ir para minha área
      </Link>
    </div>
  );
}
