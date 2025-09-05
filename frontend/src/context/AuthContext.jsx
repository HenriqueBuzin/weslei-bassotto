// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import api from "../lib/api";
import { isExpired, readRoles } from "../lib/jwt";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAT] = useState(
    localStorage.getItem("access_token") || undefined
  );
  const [refreshToken, setRT] = useState(
    localStorage.getItem("refresh_token") || undefined
  );

  // refs para sempre ler o valor mais recente dentro do interceptor
  const accessRef = useRef(accessToken);
  const refreshRef = useRef(refreshToken);
  useEffect(() => {
    accessRef.current = accessToken;
  }, [accessToken]);
  useEffect(() => {
    refreshRef.current = refreshToken;
  }, [refreshToken]);

  const roles = useMemo(() => readRoles(accessToken), [accessToken]);
  const isAuthenticated =
    !!accessToken && !isExpired(accessToken) && !!refreshToken;

  const login = useCallback(async (email, password) => {
    const form = new URLSearchParams();
    form.set("username", email); // backend trata "username" como e-mail
    form.set("password", password);
    const { data } = await api.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    setAT(data.access_token);
    setRT(data.refresh_token);
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
  }, []);

  const logout = useCallback(() => {
    setAT(undefined);
    setRT(undefined);
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  }, []);

  const doRefresh = useCallback(async () => {
    const rt = refreshRef.current;
    if (!rt) throw new Error("no refresh token");
    const { data } = await api.post("/auth/refresh", {
      refresh_token: rt,
    });
    setAT(data.access_token);
    setRT(data.refresh_token);
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return data.access_token;
  }, []);

  // Evita múltiplos refresh concorrentes
  const refreshPromiseRef = useRef(null);

  useEffect(() => {
    const id = api.interceptors.response.use(
      (r) => r,
      async (error) => {
        const original = error.config || {};
        if (error?.response?.status !== 401 || original._retry) {
          return Promise.reject(error);
        }
        original._retry = true;

        if (!refreshRef.current) {
          logout();
          return Promise.reject(error);
        }

        try {
          if (!refreshPromiseRef.current) {
            refreshPromiseRef.current = doRefresh().finally(() => {
              refreshPromiseRef.current = null;
            });
          }
          await refreshPromiseRef.current;
          // Retry: o request interceptor vai pegar o novo token do localStorage
          return api(original);
        } catch (e) {
          logout();
          return Promise.reject(e);
        }
      }
    );
    return () => api.interceptors.response.eject(id);
  }, [doRefresh, logout]);

  const value = useMemo(
    () => ({
      accessToken,
      refreshToken,
      roles,
      isAuthenticated,
      login,
      logout,
      refresh: doRefresh,
    }),
    [accessToken, refreshToken, roles, isAuthenticated, login, logout, doRefresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider/>");
  return ctx;
}
