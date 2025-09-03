// src/lib/api.js
import axios from "axios";

const rawBase = import.meta.env.VITE_API_BASE;

// Falha cedo se não estiver definido
if (typeof rawBase !== "string" || rawBase.trim() === "") {
  throw new Error("VITE_API_BASE não definido. Configure VITE_API_BASE no ambiente de build/execução.");
}

// Normaliza: remove barra final; exige "/" ou "http(s)://"
const baseURL = rawBase.replace(/\/+$/, "");
const isAbs = /^https?:\/\//i.test(baseURL);
if (!isAbs && !baseURL.startsWith("/")) {
  throw new Error('VITE_API_BASE deve começar com "/" (caminho relativo) ou "http(s)://". Valor atual: ' + rawBase);
}

export const api = axios.create({
  baseURL,
  headers: { Accept: "application/json" },
  timeout: 15_000,
});

// (opcional) helper para garantir que o path comece com "/"
// export const get = (p, cfg) => api.get(p[0] === "/" ? p : `/${p}`, cfg);
