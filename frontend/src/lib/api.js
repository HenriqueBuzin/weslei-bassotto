// src/lib/api.js

import axios from "axios";

const rawBase = import.meta.env.VITE_API_BASE;
if (!rawBase || typeof rawBase !== "string" || !rawBase.trim()) {
  throw new Error("VITE_API_BASE não definido");
}
const baseURL = rawBase.replace(/\/+$/, "");

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

export const authApi = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true, // preciso p/ enviar/receber cookies (cross-site)
});

// “injeção” do access token em memória (setado pelo AuthContext)
let getAccessToken = () => undefined;
export function bindAccessTokenGetter(fn) {
  getAccessToken = fn;
}
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
