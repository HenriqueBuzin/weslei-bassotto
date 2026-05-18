import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function readEnv(env, key, fallback = "") {
  return process.env[key] ?? env[key] ?? fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const proxyTarget = readEnv(env, "VITE_PROXY_TARGET", "http://localhost:8080");
  const hmrDisabled = readEnv(env, "VITE_HMR_DISABLED") === "true";
  const hmrHost = readEnv(env, "VITE_HMR_HOST");
  const hmrProtocol = readEnv(env, "VITE_HMR_PROTOCOL", "wss");
  const hmrClientPort = readEnv(env, "VITE_HMR_CLIENT_PORT");
  const hmrPath = readEnv(env, "VITE_HMR_PATH");

  return {
    envDir: "..",
    server: {
      host: true,
      port: 5173,
      allowedHosts: [
        "dev.wesleibassotto.com.br",
        "wesleibassotto.com.br",
        "www.wesleibassotto.com.br",
        "localhost",
        "127.0.0.1",
      ],
      hmr: hmrDisabled
        ? false
        : hmrHost
          ? {
              host: hmrHost,
              protocol: hmrProtocol,
              clientPort: hmrClientPort ? Number(hmrClientPort) : 443,
              path: hmrPath || undefined,
            }
          : undefined,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
  };
});
