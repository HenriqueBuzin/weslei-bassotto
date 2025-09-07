import { Link, NavLink } from "react-router-dom";

export default function SiteNavbar() {
  const appName = import.meta.env.VITE_APP_NAME || "Minha Empresa";
  return (
    <nav className="navbar navbar-expand-lg navbar-dark navbar-glass fixed-top" data-bs-theme="dark">
      <div className="container">
        <Link className="navbar-brand fw-bold tracking-1" to="/">
          {appName}
        </Link>

        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav"
          aria-controls="mainNav" aria-expanded="false" aria-label="Alternar navegação">
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="mainNav">
          <ul className="navbar-nav ms-auto align-items-lg-center gap-lg-2">
            <li className="nav-item"><NavLink className="nav-link" to="/">Início</NavLink></li>
            <li className="nav-item"><a className="nav-link" href="#servicos">Serviços</a></li>
            <li className="nav-item"><a className="nav-link" href="#sobre">Sobre</a></li>
            <li className="nav-item"><a className="nav-link" href="#contato">Contato</a></li>
            <li className="nav-item">
              <NavLink className="btn btn-sm btn-brand ms-lg-2" to="/login">Entrar</NavLink>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
