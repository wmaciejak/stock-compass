import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.use({ timezoneId: "America/New_York" });

test("PL and ENG switch localizes research, persists and does not redownload prices", async ({
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
  await expect(
    page.getByRole("button", { name: "Polski", exact: true }),
  ).toBeVisible({ timeout: 3000 });
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await expect(page.locator(".stock-heading h1")).toContainText("DEMO_TREND");
  await expect(page.locator(".price-chart .chart-legend")).toContainText(
    "EMA 20",
  );
  const before = await page.request
    .get("/api/analysis/DEMO_TREND")
    .then((r) => r.json());
  const completedWeek = new Date(`${before.weekly.last_bar}T00:00:00Z`);
  await expect(page.locator(".context-lines")).toContainText(
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(completedWeek),
  );
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/analysis/")) requests++;
  });
  await page.getByRole("button", { name: "Polski", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Niekorzystny układ", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.locator(".price-chart .chart-legend")).toContainText(
    "EMA 20",
  );
  await expect(page.locator(".context-lines")).toContainText(
    new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC" }).format(completedWeek),
  );
  await expect(page.locator(".assessment-card")).toContainText("trend dzienny");
  await page.getByRole("tab", { name: "Wskaźniki i nauka" }).click();
  const rsi = page
    .locator("details.indicator")
    .filter({ has: page.getByText("RSI 14", { exact: true }) });
  await rsi.locator("summary").click();
  await expect(rsi.getByText("Typowy błąd", { exact: false })).toBeVisible();
  await expect(rsi).toContainText(
    "Sam niski RSI nie oznacza dobrej okazji do wejścia",
  );
  await page.getByRole("tab", { name: "Badania i wielkość pozycji" }).click();
  await expect(page.getByLabel("Notatki badawcze")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Raport Markdown" }).click();
  const file = await download;
  expect(fs.readFileSync((await file.path())!, "utf8")).toContain(
    "DANE SYNTETYCZNE",
  );
  expect(requests).toBe(0);
  await page.getByRole("tab", { name: "Przegląd", exact: true }).click();
  await page.screenshot({
    path: path.resolve("../docs/screenshots/polish-desktop.png"),
    fullPage: false,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Twoja lista obserwowanych instrumentów.",
    }),
  ).toBeVisible();
  const after = await page.request
    .get("/api/analysis/DEMO_TREND")
    .then((r) => r.json());
  expect(after.metrics).toEqual(before.metrics);
  expect(after.assessment.label).toEqual(before.assessment.label);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Polski", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.resolve("../docs/screenshots/polish-narrow.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer view of your watchlist." }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
