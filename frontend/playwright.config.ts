import { defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserPath = process.env.COMPASS_CHROME ||
  (existsSync(macChrome) ? macChrome : undefined);
// Each invocation has a fresh database; workers inherit this path.
const databasePath = process.env.COMPASS_TEST_DB ||= path.join(
  mkdtempSync(path.join(tmpdir(), "stock-compass-browser-")), "compass.sqlite",
);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:8767",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: {
      executablePath: browserPath,
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "../.venv/bin/python -m uvicorn compass.api:app --app-dir ../backend --host 127.0.0.1 --port 8767",
    env: {
      STOCK_COMPASS_OFFLINE: "1",
      STOCK_COMPASS_AI_ENABLED: "0",
      OPENAI_API_KEY: "",
      STOCK_COMPASS_PORT: "8767",
      STOCK_COMPASS_DB: databasePath,
    },
    url: "http://127.0.0.1:8767/api/status",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
