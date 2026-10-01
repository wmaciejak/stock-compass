import { test, expect } from "@playwright/test";
import path from "node:path";

test("actual hourly candles, interval-local indicators, controls and daily research separation", async ({
  page,
}) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
      language: "en",
    },
  });
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  const before = await page.request
    .get("/api/analysis/DEMO_TREND")
    .then((r) => r.json());
  await page.getByRole("button", { name: "1H candles", exact: true }).click();
  await expect(page.locator(".hourly-provenance")).toContainText(
    "synthetic hourly fixture",
  );
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await expect(page.locator(".hourly-notice")).toContainText("daily");
  await expect(page.locator(".price-chart .chart-legend")).toContainText(
    "EMA 20",
  );
  let downloads = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/chart/")) downloads++;
  });
  await page.getByRole("button", { name: "1W", exact: true }).click();
  await page.getByLabel("Resistance", { exact: true }).uncheck();
  const support = page.getByLabel("Support", { exact: true });
  await expect(support).toBeChecked();
  await support.uncheck();
  await expect(support).not.toBeChecked();
  await expect(
    page.getByLabel("Resistance", { exact: true }),
  ).not.toBeChecked();
  await support.check();
  await page.getByLabel("Bands", { exact: true }).check();
  await page.getByLabel("Momentum panel").selectOption("rsi");
  await page.getByRole("button", { name: "Polski", exact: true }).click();
  await expect(page.locator(".hourly-notice")).toContainText("dziennych");
  await expect(page.getByLabel("Wsparcie", { exact: true })).toBeChecked();
  expect(downloads).toBe(0);
  await page.locator(".price-chart").screenshot({
    path: path.resolve("../docs/screenshots/hourly-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".price-chart").screenshot({
    path: path.resolve("../docs/screenshots/hourly-narrow.png"),
  });
  await page
    .getByRole("button", { name: "Świece dzienne", exact: true })
    .click();
  await expect(page.locator(".hourly-provenance")).toHaveCount(0);
  const after = await page.request
    .get("/api/analysis/DEMO_TREND")
    .then((r) => r.json());
  expect(after.metrics).toEqual(before.metrics);
  expect(after.assessment.label).toEqual(before.assessment.label);
});

test("hourly errors stay explicit and late responses cannot replace daily candles", async ({
  page,
}) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
      language: "en",
    },
  });
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await expect(page.locator(".stock-heading h1")).toContainText("DEMO_TREND");
  await page.route("**/api/chart/DEMO_TREND?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "No completed regular-session hourly candles available.",
      }),
    }),
  );
  await page.getByRole("button", { name: "1H candles", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No completed");
  await expect(page.locator(".hourly-provenance")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Daily candles", exact: true })
    .click();
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page.unroute("**/api/chart/DEMO_TREND?*");
  let release!: () => void;
  let received!: () => void;
  const pending = new Promise<void>((r) => (release = r));
  const ready = new Promise<void>((r) => (received = r));
  await page.route("**/api/chart/DEMO_TREND?*", async (route) => {
    const response = await route.fetch();
    received();
    await pending;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "1H candles", exact: true }).click();
  await ready;
  await page
    .getByRole("button", { name: "Daily candles", exact: true })
    .click();
  release();
  await expect(
    page.getByRole("button", { name: "Daily candles", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".hourly-provenance")).toHaveCount(0);
  await expect(page.getByTestId("price-chart")).toBeVisible();
});

test("opening 1H refreshes stale history even when auto-refresh is off", async ({ page }) => {
  await page.request.put("/api/settings", { data: { mode: "demo", experience: "advanced", preferred_workspace: "research", language: "en" } });
  const template = await page.request.get("/api/chart/DEMO_TREND?interval=1h").then((r) => r.json());
  const requests: boolean[] = [];
  await page.route("**/api/chart/DEMO_TREND?*", (route) => {
    const fresh = new URL(route.request().url()).searchParams.get("refresh") === "true";
    requests.push(fresh);
    return route.fulfill({ json: { ...template, cache: !fresh,
      quality: { ...template.quality, stale: !fresh, issues: fresh ? [] : ["Hourly history is stale relative to the latest expected published candle."] },
    } });
  });
  await page.goto("/");
  await page.locator(".watch-table .instrument-button").filter({ hasText: "DEMO_TREND" }).click();
  await expect(page.getByLabel("Auto-refresh interval", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "1H candles", exact: true }).click();
  await expect(page.locator(".hourly-provenance")).toContainText("Retrieved");
  await expect(page.locator(".hourly-provenance")).not.toContainText("STALE HOURLY DATA");
  expect(requests).toEqual([true]);
  await page.getByRole("button", { name: "Daily candles", exact: true }).click();
  await page.getByRole("button", { name: "1H candles", exact: true }).click();
  await expect(page.locator(".hourly-provenance")).toBeVisible();
  expect(requests).toEqual([true,true]);
});
