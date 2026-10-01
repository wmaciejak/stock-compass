import { test, expect } from "@playwright/test";
import path from "node:path";

test("optional auto-refresh schedules daily and hourly data, pauses hidden tabs and persists", async ({
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
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await page.getByRole("button", { name: "1H candles", exact: true }).click();
  await expect(page.locator(".hourly-provenance")).toBeVisible();
  const refreshSelectedStock = page.getByRole("button", { name: "Refresh selected stock", exact: true });
  await expect(refreshSelectedStock).toBeEnabled();
  const watchlist = await page.request.get("/api/watchlist?mode=demo").then((r) => r.json()) as Array<{ symbol: string }>;
  const expectedDaily = new Set(["DEMO_TREND", ...watchlist.map((w) => w.symbol)]).size;
  const control = page.getByLabel("Auto-refresh interval", { exact: true });
  await expect(control).toHaveValue("0");
  let daily = 0,
    hourly = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/analysis/") && r.url().includes("refresh=true"))
      daily++;
    if (r.url().includes("/api/chart/") && r.url().includes("refresh=true"))
      hourly++;
  });
  await page.clock.fastForward(60_000);
  expect(daily).toBe(0);
  expect(hourly).toBe(0);
  await control.selectOption("1");
  await page.clock.fastForward(60_000);
  await expect.poll(() => daily).toBe(expectedDaily);
  await expect.poll(() => hourly).toBe(1);
  await expect(
    page.getByRole("button", { name: "Refresh hourly", exact: true }),
  ).toBeEnabled();
  await expect(refreshSelectedStock).toBeEnabled();
  await page.evaluate(() =>
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    }),
  );
  await page.clock.fastForward(60_000);
  expect(daily).toBe(expectedDaily);
  expect(hourly).toBe(1);
  await page.evaluate(() =>
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    }),
  );
  await page.reload();
  await expect(control).toHaveValue("1");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh watchlist" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Polski", exact: true }).click();
  await expect(
    page.getByLabel("Interwał automatycznego odświeżania"),
  ).toHaveValue("1");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.resolve("../docs/screenshots/auto-refresh-narrow.png"),
  });
  await page
    .getByLabel("Interwał automatycznego odświeżania")
    .selectOption("0");
  const dailyAfterReload = daily;
  const hourlyAfterReload = hourly;
  await page.clock.fastForward(30 * 60_000);
  expect(daily).toBe(dailyAfterReload);
  expect(hourly).toBe(hourlyAfterReload);
});

test("page reload and timer refresh every watchlist symbol", async ({
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
  await page.clock.install();
  const requested: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/analysis/") && r.url().includes("refresh=true"))
      requested.push(new URL(r.url()).pathname.split("/").at(-1)!);
  });
  const symbols = (
    (await page.request
      .get("/api/watchlist?mode=demo")
      .then((r) => r.json())) as Array<{ symbol: string }>
  ).map((w) => w.symbol);
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh watchlist" }),
  ).toBeEnabled();
  await expect(
    page
      .locator(".watch-table")
      .getByText("Retrieved", { exact: false })
      .first(),
  ).toBeVisible();
  expect(new Set(requested)).toEqual(new Set(symbols));
  requested.length = 0;
  await page.getByLabel("Auto-refresh interval").selectOption("1");
  await page.clock.fastForward(60_000);
  await expect.poll(() => new Set(requested).size).toBe(symbols.length);
  await expect(
    page.getByRole("button", { name: "Refresh watchlist" }),
  ).toBeEnabled();
  expect(new Set(requested)).toEqual(new Set(symbols));
  requested.length = 0;
  await page.reload();
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh watchlist" }),
  ).toBeEnabled();
  expect(new Set(requested)).toEqual(new Set(symbols));
  await page.getByLabel("Auto-refresh interval").selectOption("0");
});

test("a slow automatic refresh cannot overlap the next scheduled refresh", async ({
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
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await expect(page.getByLabel("Refresh selected stock")).toBeEnabled();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(
    "**/api/analysis/DEMO_TREND?refresh=true*",
    async (route) => {
      requests++;
      const response = await route.fetch();
      await pending;
      await route.fulfill({ response });
    },
  );
  await page.getByLabel("Auto-refresh interval").selectOption("1");
  await page.clock.fastForward(60_000);
  await expect.poll(() => requests).toBe(1);
  await page.clock.fastForward(60_000);
  expect(requests).toBe(1);
  release();
  await expect(page.getByLabel("Refresh selected stock")).toBeEnabled();
  await page.getByLabel("Auto-refresh interval").selectOption("0");
});

test("visible comparison values are recalculated after the timed watchlist refresh", async ({
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
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh watchlist" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Compare stocks" }).click();
  let comparisons = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/compare")) comparisons++;
  });
  await page.getByRole("button", { name: "Compare selected" }).click();
  await expect.poll(() => comparisons).toBe(1);
  await expect(
    page.getByRole("heading", { name: "Normalized six-month returns" }),
  ).toBeVisible();
  await page.getByLabel("Auto-refresh interval").selectOption("1");
  await page.clock.fastForward(60_000);
  await expect.poll(() => comparisons).toBe(2);
  await page.getByLabel("Auto-refresh interval").selectOption("0");
});
