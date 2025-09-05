// src/lib/jwt.js
import { jwtDecode } from "jwt-decode";

/**
 * Retorna true se o token estiver expirado
 * ou prestes a expirar (<= 5s).
 */
export function isExpired(token) {
  if (!token) return true;
  try {
    const { exp } = jwtDecode(token);
    if (!exp) return true; // sem exp => trata como inválido
    // exp é em segundos; Date.now() em ms
    return exp * 1000 <= Date.now() + 5000;
  } catch {
    return true;
  }
}

/**
 * Lê as roles do token; [] se inválido/sem roles.
 */
export function readRoles(token) {
  if (!token) return [];
  try {
    const { roles } = jwtDecode(token);
    return Array.isArray(roles) ? roles : [];
  } catch {
    return [];
  }
}
