import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Система открывается вкладкой портала, поэтому базовый путь задаётся при сборке: APP_BASE_PATH=/automation/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.APP_BASE_PATH || "/";
  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { [`${base}api`]: { target: env.API_TARGET || "http://localhost:8000", rewrite: (path) => path.replace(base, "/") } },
    },
    build: { sourcemap: true, target: "es2020" },
  };
});
