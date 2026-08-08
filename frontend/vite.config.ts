/// <reference types="vitest/config" />
// A referência acima é só de tipos e some na compilação: ela ensina a chave
// `test` sem que o arquivo importe vitest em tempo de execução. Importar de
// "vitest/config" fazia o servidor de desenvolvimento exigir o pacote de teste
// para subir, e ele quebrava com "Cannot find package 'vitest'".
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function readEnv(env: Record<string, string>, key: string, fallback = "") {
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
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      clearMocks: true,
      testTimeout: 15000,
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      exclude: ["e2e/**", "node_modules/**", "dist/**"],
      coverage: {
        reporter: ["text", "html"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/main.tsx", "src/**/*.test.{ts,tsx}", "src/test/**", "src/**/*.d.ts"],
        thresholds: {
          statements: 100,
          lines: 100,
          branches: 100,
          functions: 100,
        },
      },
    },
  };
});
