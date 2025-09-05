// src/lib/api.js

import axios from "axios";

// Lê e valida VITE_API_BASE (pode ser "/api/v1" ou "https://api.seuapp.com/api/v1")
const rawBase = import.meta.env.VITE_API_BASE;

if (typeof rawBase !== "string" || rawBase.trim() === "") {
  throw new Error(
    "VITE_API_BASE não definido. Configure VITE_API_BASE no ambiente de build/execução."
  );
}

// Normaliza: remove barras finais repetidas
const baseURL = rawBase.replace(/\/+$/, "");

// Tem que ser caminho absoluto (começando com "/") ou URL absoluta http(s)
const isAbsoluteUrl = /^https?:\/\//i.test(baseURL);
if (!isAbsoluteUrl && !baseURL.startsWith("/")) {
  throw new Error(
    `VITE_API_BASE deve começar com "/" (caminho relativo) ou "http(s)://". Valor atual: ${rawBase}`
  );
}

const api = axios.create({
  baseURL,
  headers: { Accept: "application/json" },
  withCredentials: false, // usamos Bearer token, não cookies
  timeout: 15_000,
});

// Injeta Authorization: Bearer <access_token> se existir no localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// Helpers opcionais para gerenciar tokens no localStorage
export function setAuthTokens(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem("access_token", accessToken);
  if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
}

export function clearAuthTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}
