import { defineConfig, devices } from "@playwright/test";

// Сквозные проверки в настоящем браузере. Перед запуском демо-данные создаются заново,
// тесты идут последовательно: они меняют общие данные в базе разработки.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "../backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000",
          cwd: "../backend",
          url: "http://127.0.0.1:8000/api/health",
          reuseExistingServer: true,
        },
        {
          command: "npx vite --host 127.0.0.1 --port 5173 --strictPort",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: true,
        },
      ],
});
