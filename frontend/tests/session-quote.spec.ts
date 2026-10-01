import { test, expect } from "@playwright/test";

test("main percentages show fresh provisional quote, then fall back to completed daily data", async ({
  page,
}) => {
  const sample = await page.request
    .get("/api/analysis/DEMO_TREND")
    .then((r) => r.json());
  const day = sample.provenance.last_completed_bar as string;
  let quoteTime = new Date().toISOString();
  const quote = () => ({
    price: 94.8,
    previous_close: 100,
    change_percent: -5.2,
    market_time: quoteTime,
    session: "2099-01-01",
    source: "Test provider",
    price_basis: "provider_native",
    delay: "unknown",
  });
  const analysis = () => ({
    ...sample,
    instrument: {
      ...sample.instrument,
      symbol: "ZZQFIXTURE",
      name: "Test fixture",
      synthetic: false,
    },
    context: {
      ...sample.context,
      quote: {
        status: "available",
        data: quote(),
        retrieved_at: new Date().toISOString(),
      },
    },
  });
  const watch = () => [
    {
      symbol: "ZZQFIXTURE",
      status: "available",
      score: 0,
      instrument: analysis().instrument,
      close: sample.metrics.Close,
      change: 2.5,
      quote: quote(),
      provenance: sample.provenance,
    },
  ];
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      json: {
        mode: "live",
        experience: "advanced",
        preferred_workspace: "research",
        language: "en",
        benchmark: "SPY",
        horizon: "2–8 weeks",
        commission: 0.001,
        spread: 0.001,
      },
    }),
  );
  await page.route("**/api/watchlist?mode=live", (route) =>
    route.fulfill({ json: watch() }),
  );
  await page.route("**/api/analysis/ZZQFIXTURE?*", (route) =>
    route.fulfill({ json: analysis() }),
  );
  await page.goto("/");
  await expect(page.locator(".watch-table")).toContainText("-5.20%");
  await expect(page.locator(".watch-table")).toContainText(
    "Today · provisional",
  );
  await expect(page.locator(".watch-table")).toContainText("Daily close");
  await expect(page.locator(".sidebar-stock")).toContainText("-5.20%");
  await page.locator(".watch-table .instrument-button").click();
  await expect(page.locator(".stock-price")).toContainText("$94.80");
  await expect(page.locator(".stock-price")).toContainText("-5.20%");
  await expect(page.locator(".stock-price")).toContainText(day);
  quoteTime = new Date(Date.now() - 60 * 60_000).toISOString();
  await page.reload();
  await expect(page.locator(".watch-table")).toContainText("+2.50%");
  await expect(page.locator(".watch-table")).not.toContainText(
    "Today · provisional",
  );
});
