import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:8080";

export default defineConfig({
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
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [react()]
});
