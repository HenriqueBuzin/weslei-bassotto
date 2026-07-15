// src/pages/NotFound.jsx

import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="container mt-5">
      <h1>NotFound</h1>
      <p>NotFound.</p>
      <Link className="btn btn-brand" to="/">
        Voltar ao início
      </Link>
    </div>
  );
}
