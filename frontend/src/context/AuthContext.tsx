import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, authApi, bindAccessTokenGetter } from "../lib/api";
import { isExpired, readRoles } from "../lib/jwt";

type StorageLike = {
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

type AuthContextValue = {
  accessToken: string | undefined;
  roles: string[];
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  markPasswordChanged: () => void;
  login: (email: string, password: string, remember?: boolean) => Promise<string>;
  register: (email: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
  refresh: () => Promise<string>;
};

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const Ctx = createContext<AuthContextValue | null>(null);
const REMEMBER_SESSION_KEY = "wb_auth_remember_session";
const ACTIVE_SESSION_KEY = "wb_auth_active_session";

export function storageGet(storage: StorageLike | null | undefined, key: string) {
  try {
    return storage?.getItem?.(key);
  } catch {
    return null;
  }
}

export function storageSet(storage: StorageLike | null | undefined, key: string, value: string) {
  try {
    storage?.setItem?.(key, value);
  } catch {}
}

export function storageRemove(storage: StorageLike | null | undefined, key: string) {
  try {
    storage?.removeItem?.(key);
  } catch {}
}

export function shouldTryInitialRefresh() {
  if (typeof window === "undefined") return false;
  return (
    storageGet(window.sessionStorage, ACTIVE_SESSION_KEY) === "1" ||
    storageGet(window.localStorage, REMEMBER_SESSION_KEY) === "1"
  );
}

export function markSession(remember = false) {
  if (typeof window === "undefined") return;
  storageSet(window.sessionStorage, ACTIVE_SESSION_KEY, "1");
  if (remember) {
    storageSet(window.localStorage, REMEMBER_SESSION_KEY, "1");
  } else {
    storageRemove(window.localStorage, REMEMBER_SESSION_KEY);
  }
}

export function clearSessionMarker() {
  if (typeof window === "undefined") return;
  storageRemove(window.sessionStorage, ACTIVE_SESSION_KEY);
  storageRemove(window.localStorage, REMEMBER_SESSION_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAT] = useState<string | undefined>(undefined);
  // Vem do login e do refresh: enquanto for true, o ProtectedRoute nao deixa o
  // usuario chegar em outra tela. Fica em memoria junto do access token, e o
  // refresh a repete para o F5 nao virar uma forma de escapar da troca.
  const [mustChangePassword, setMustChange] = useState(false);

  authApi.defaults.withCredentials = true;

  useEffect(() => bindAccessTokenGetter(() => accessToken), [accessToken]);

  const roles = useMemo(() => readRoles(accessToken), [accessToken]);
  const isAuthenticated = !!accessToken && !isExpired(accessToken);

  const login = useCallback(async (email: string, password: string, remember = false) => {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    form.set("remember", remember ? "true" : "false");
    const { data } = await authApi.post("/auth/login", form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    markSession(remember);
    setMustChange(!!data.must_change_password);
    setAT(data.access_token);
    return data.access_token;
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await api.post("/auth/register", { email, password });
      return login(email, password, false);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.post("/auth/logout", null, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    } finally {
      clearSessionMarker();
      setMustChange(false);
      setAT(undefined);
    }
  }, []);

  const doRefresh = useCallback(async () => {
    const { data } = await authApi.post("/auth/refresh", null, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    markSession(storageGet(window.localStorage, REMEMBER_SESSION_KEY) === "1");
    setMustChange(!!data.must_change_password);
    setAT(data.access_token);
    return data.access_token;
  }, []);

  useEffect(() => {
    if (!shouldTryInitialRefresh()) return;
    (async () => {
      try {
        await doRefresh();
      } catch {
        clearSessionMarker();
      }
    })();
  }, [doRefresh]);

  const markPasswordChanged = useCallback(() => setMustChange(false), []);

  const refreshPromiseRef = useRef<Promise<string> | null>(null);
  useEffect(() => {
    const id = api.interceptors.response.use(
      (r) => r,
      async (error: AxiosError) => {
        const original = error.config as RetryConfig | undefined;
        if (error.response?.status !== 401 || !original || original._retry) {
          return Promise.reject(error);
        }
        original._retry = true;
        try {
          if (!refreshPromiseRef.current) {
            refreshPromiseRef.current = doRefresh().finally(() => {
              refreshPromiseRef.current = null;
            });
          }
          await refreshPromiseRef.current;
          return api(original);
        } catch (e) {
          clearSessionMarker();
          setAT(undefined);
          return Promise.reject(e);
        }
      },
    );
    return () => api.interceptors.response.eject(id);
  }, [doRefresh]);

  const value = useMemo(
    () => ({
      accessToken,
      roles,
      isAuthenticated,
      mustChangePassword,
      markPasswordChanged,
      login,
      register,
      logout,
      refresh: doRefresh,
    }),
    [accessToken, roles, isAuthenticated, mustChangePassword, markPasswordChanged, login, register, logout, doRefresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider/>");
  return ctx;
}
