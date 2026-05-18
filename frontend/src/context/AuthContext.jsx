import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, authApi, bindAccessTokenGetter } from "../lib/api";
import { isExpired, readRoles } from "../lib/jwt";

const Ctx = createContext(null);
const REMEMBER_SESSION_KEY = "wb_auth_remember_session";
const ACTIVE_SESSION_KEY = "wb_auth_active_session";

function storageGet(storage, key) {
  try {
    return storage?.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {}
}

function storageRemove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {}
}

function shouldTryInitialRefresh() {
  if (typeof window === "undefined") return false;
  return (
    storageGet(window.sessionStorage, ACTIVE_SESSION_KEY) === "1" ||
    storageGet(window.localStorage, REMEMBER_SESSION_KEY) === "1"
  );
}

function markSession(remember = false) {
  if (typeof window === "undefined") return;
  storageSet(window.sessionStorage, ACTIVE_SESSION_KEY, "1");
  if (remember) {
    storageSet(window.localStorage, REMEMBER_SESSION_KEY, "1");
  } else {
    storageRemove(window.localStorage, REMEMBER_SESSION_KEY);
  }
}

function clearSessionMarker() {
  if (typeof window === "undefined") return;
  storageRemove(window.sessionStorage, ACTIVE_SESSION_KEY);
  storageRemove(window.localStorage, REMEMBER_SESSION_KEY);
}

export function AuthProvider({ children }) {
  const [accessToken, setAT] = useState(undefined);

  authApi.defaults.withCredentials = true;

  useEffect(() => bindAccessTokenGetter(() => accessToken), [accessToken]);

  const roles = useMemo(() => readRoles(accessToken), [accessToken]);
  const isAuthenticated = !!accessToken && !isExpired(accessToken);

  const login = useCallback(async (email, password, remember = false) => {
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
    setAT(data.access_token);
    return data.access_token;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.post("/auth/logout", null, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    } finally {
      clearSessionMarker();
      setAT(undefined);
    }
  }, []);

  const doRefresh = useCallback(async () => {
    const { data } = await authApi.post("/auth/refresh", null, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    markSession(storageGet(window.localStorage, REMEMBER_SESSION_KEY) === "1");
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
