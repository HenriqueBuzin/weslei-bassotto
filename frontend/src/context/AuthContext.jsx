// src/context/AuthContext.jsx

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { api, authApi, bindAccessTokenGetter } from "../lib/api";
import { isExpired, readRoles } from "../lib/jwt";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAT] = useState(undefined);

  // disponibiliza o token atual pro axios
  useEffect(() => bindAccessTokenGetter(() => accessToken), [accessToken]);

  const roles = useMemo(() => readRoles(accessToken), [accessToken]);
  const isAuthenticated = !!accessToken && !isExpired(accessToken);

  const login = useCallback(async (email, password) => {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    const { data } = await authApi.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    });
    setAT(data.access_token); // refresh ficou HttpOnly cookie
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.post("/auth/logout", null, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    } finally {
      setAT(undefined);
    }
  }, []);

  const doRefresh = useCallback(async () => {
    const { data } = await authApi.post("/auth/refresh", null, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    setAT(data.access_token);
    return data.access_token;
  }, []);

  // silent refresh on mount (se cookie existir, volta um access)
  useEffect(() => {
    (async () => {
      try {
        await doRefresh();
      } catch {
        /* sem cookie ou inválido => fica deslogado */
      }
    })();
  }, [doRefresh]);

  // Retry 401 => tenta refresh 1x
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
        try {
          if (!refreshPromiseRef.current) {
            refreshPromiseRef.current = doRefresh().finally(() => (refreshPromiseRef.current = null));
          }
          await refreshPromiseRef.current;
          return api(original);
        } catch (e) {
          setAT(undefined);
          return Promise.reject(e);
        }
      }
    );
    return () => api.interceptors.response.eject(id);
  }, [doRefresh]);

  const value = useMemo(
    () => ({ accessToken, roles, isAuthenticated, login, logout, refresh: doRefresh }),
    [accessToken, roles, isAuthenticated, login, logout, doRefresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider/>");
  return ctx;
}
