import { Link } from "react-router-dom";
import { PATHS } from "../routes/paths";

export default function NotFound() {
  return (
    <div className="container mt-5">
      <h1>Página não encontrada</h1>
      <p>O endereço que você abriu não existe ou foi movido.</p>
      <Link className="btn btn-brand" to={PATHS.home}>
        Voltar ao início
      </Link>
    </div>
  );
}
