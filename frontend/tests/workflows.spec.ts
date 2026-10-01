import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test("advanced research workflow, persisted ticker, charts, strategies, sizing and exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
    },
  });
  await page.request.delete("/api/watchlist/DEMO_RANGE");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clearer view of your watchlist." }),
  ).toBeVisible();
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page
    .getByRole("button", { name: "Add ticker", exact: true })
    .last()
    .click();
  await page.getByLabel("Ticker symbol").fill("DEMO_RANGE");
  await page.getByRole("button", { name: "Add to watchlist" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(
    page
      .locator(".watch-table .instrument-button")
      .filter({ hasText: "DEMO_RANGE" }),
  ).toBeVisible();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Price, participation & structure" }),
  ).toBeVisible();
  await expect(page.getByLabel("Refresh selected stock")).toBeEnabled();
  let downloads = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/analysis/")) downloads++;
  });
  const resistance = page.getByLabel("Resistance", { exact: true });
  const support = page.getByLabel("Support", { exact: true });
  await expect(support).toBeChecked();
  await support.uncheck();
  await expect(support).not.toBeChecked();
  await expect(resistance).toBeChecked();
  await support.check();
  await expect(support).toBeChecked();
  await expect(resistance).toBeChecked();
  await resistance.uncheck();
  await expect(resistance).not.toBeChecked();
  await expect(page.locator(".price-chart .chart-legend")).toContainText(
    "EMA 20",
  );
  await resistance.check();
  await expect(resistance).toBeChecked();
  await page.getByRole("button", { name: "3M", exact: true }).click();
  await page.getByLabel("Bands", { exact: true }).check();
  await page.getByLabel("Momentum panel").selectOption("rsi");
  const chart = page.getByTestId("price-chart");
  await chart.hover();
  await page.mouse.wheel(0, -180);
  await expect(page.locator(".price-chart .chart-legend")).toContainText(
    "Bollinger",
  );
  expect(downloads).toBe(0);
  await page.getByRole("tab", { name: "Indicators & learning" }).click();
  await page
    .locator(".indicator")
    .filter({ hasText: "RSI 14" })
    .locator("summary")
    .click();
  await expect(
    page.getByText("Low RSI alone is not a good entry", { exact: false }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Historical evidence" }).click();
  await page.getByRole("button", { name: "Run backtest" }).click();
  await expect(
    page.getByRole("heading", { name: "Historical evidence", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("RECENT HOLDOUT", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "20-session breakout", exact: false })
    .click();
  await page.getByRole("button", { name: "Run backtest" }).click();
  await expect(
    page.getByRole("heading", { name: "Historical evidence", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Research & sizing" }).click();
  await page
    .getByLabel("Research notes")
    .fill("Wait for a confirmed close; verify event risk.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await page
    .getByLabel("Research thesis")
    .fill("Synthetic idea to investigate after confirmation.");
  await page.getByRole("button", { name: "Save idea & snapshot" }).click();
  await expect(page.getByRole("status")).toContainText("Research idea");
  await page.getByLabel("Available account cash").fill("10000");
  await page.getByLabel("Entry (USD)", { exact: true }).fill("100");
  await page.getByLabel("Invalidation (USD)", { exact: true }).fill("95");
  await page.getByLabel("Chosen risk budget (%)").fill("1");
  await page.getByRole("button", { name: "Calculate shares" }).click();
  await expect(page.getByText("20 whole shares")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Markdown report" }).click();
  const file = await download;
  const downloadPath = await file.path();
  expect(fs.readFileSync(downloadPath!, "utf8")).toContain("SYNTHETIC DEMO");
  await page
    .getByRole("button", { name: "Research journal", exact: true })
    .click();
  await expect(
    page.getByText("Synthetic idea to investigate after confirmation.").last(),
  ).toBeVisible();
  await page
    .getByLabel("Outcome for DEMO_TREND")
    .last()
    .fill("No confirmation: stayed patient.");
  await page.getByRole("button", { name: "Save outcome" }).last().click();
  await page
    .getByRole("button", { name: "Compare stocks", exact: true })
    .click();
  await page.getByRole("button", { name: "Compare selected" }).click();
  await expect(
    page.getByRole("heading", { name: "Normalized six-month returns" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("desktop and narrow inspection plus provider error state", async ({
  page,
}) => {
  const output = path.resolve("../docs/screenshots");
  fs.mkdirSync(output, { recursive: true });
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
    },
  });
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page.screenshot({
    path: path.join(output, "desktop-briefing.png"),
    fullPage: true,
  });
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await page.screenshot({
    path: path.join(output, "desktop-analysis.png"),
    fullPage: true,
  });
  await page.screenshot({
    path: path.join(output, "desktop-preview.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page.screenshot({
    path: path.join(output, "narrow-analysis.png"),
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.mouse.move(382, 730);
  await page.mouse.wheel(0, 1000);
  await expect(
    page.getByRole("heading", { name: "Unfavorable setup", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: path.join(output, "narrow-scrolled.png"),
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Live research", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Market data is unavailable." }),
  ).toBeVisible();
  await expect(
    page
      .locator(".error-state")
      .getByText("Offline mode: network access disabled.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, "provider-error.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(page.getByTestId("price-chart")).toBeVisible();
});

test("CSV preview and explicit unknown-basis import suppress action", async ({
  page,
}) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings & data" }).click();
  await page.getByLabel("CSV symbol").fill("DEMO_BROWSER");
  await page.getByLabel("CSV instrument name").fill("Synthetic imported data");
  await page
    .getByLabel("CSV file")
    .setInputFiles(path.resolve("../fixtures/DEMO_RANGE.csv"));
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await expect(
    page.getByText("Inspection only / limited quality"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import previewed data" }).click();
  await expect(page.getByRole("status")).toContainText("CSV imported locally");
  await page
    .getByRole("button", { name: "Research briefing", exact: true })
    .click();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_BROWSER" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Insufficient or stale data" }),
  ).toBeVisible();
  await expect(
    page.getByText("Actionable assessment suppressed"),
  ).toBeVisible();
});

test("late refresh cannot replace a newer selected instrument", async ({
  page,
}) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
    },
  });
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  let release!: () => void;
  const pending = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const seen = new Promise<void>((r) => (started = r));
  await page.route(
    "**/api/analysis/DEMO_TREND?refresh=true*",
    async (route) => {
      const response = await route.fetch();
      started();
      await pending;
      await route.fulfill({ response });
    },
  );
  await page.getByRole("button", { name: "Refresh selected stock" }).click();
  await seen;
  await page.locator(".sidebar-stock").filter({ hasText: "RANGE" }).click();
  await expect(page.locator(".stock-heading h1")).toContainText("DEMO_RANGE");
  release();
  await expect(
    page.getByRole("button", { name: "Refresh selected stock" }),
  ).toBeEnabled();
  await expect(page.locator(".stock-heading h1")).toContainText("DEMO_RANGE");
  // Wait on the successful interception response, then allow a rendered tick.
  await page.getByRole("tab", { name: "Indicators & learning" }).click();
  await expect(page.locator(".stock-heading h1")).toContainText("DEMO_RANGE");
});

test("reimporting selected CSV invalidates the old analysis", async ({
  page,
}) => {
  const csv = fs.readFileSync(
    path.resolve("../fixtures/DEMO_RANGE.csv"),
    "utf8",
  );
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
    },
  });
  const body = {
    symbol: "DEMO_REPLACE",
    name: "Synthetic replacement",
    exchange: "NYSE",
    currency: "USD",
    price_basis: "split_dividend_adjusted",
    csv,
  };
  await page.request.post("/api/csv/import", { data: body });
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_REPLACE" })
    .click();
  await expect(page.locator(".stock-heading h1")).toContainText("DEMO_REPLACE");
  await page.getByRole("button", { name: "Settings & data" }).click();
  await page.getByLabel("CSV symbol").fill("DEMO_REPLACE");
  await page.getByLabel("CSV instrument name").fill("Synthetic replacement");
  await page
    .getByLabel("CSV file")
    .setInputFiles(path.resolve("../fixtures/DEMO_RANGE.csv"));
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await page.getByRole("button", { name: "Import previewed data" }).click();
  await expect(page.getByRole("status")).toContainText("CSV imported locally");
  await page.locator(".sidebar-stock").filter({ hasText: "REPLACE" }).click();
  await expect(
    page.getByRole("heading", { name: "Insufficient or stale data" }),
  ).toBeVisible();
  await expect(
    page.getByText("Actionable assessment suppressed"),
  ).toBeVisible();
});
