import { test, expect } from "@playwright/test";
import path from "node:path";

test("short chart ranges, research horizons and resistance visibility", async ({
  page,
}) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
      language: "en",
      horizon: "2–8 weeks",
    },
  });
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await expect(page.locator(".stock-heading h1")).toContainText("DEMO_TREND");
  let analysisRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/analysis/")) analysisRequests++;
  });
  for (const range of ["1W", "2W", "1M"]) {
    const button = page.getByRole("button", { name: range, exact: true });
    await button.click();
    await expect(button).toHaveClass("chosen");
    await expect(page.getByTestId("price-chart")).toBeVisible();
  }
  await page.getByRole("button", { name: "6M", exact: true }).click();
  await page.getByLabel("Resistance", { exact: true }).uncheck();
  await expect(
    page.getByLabel("Resistance", { exact: true }),
  ).not.toBeChecked();
  await page.locator(".price-chart").screenshot({
    path: path.resolve("../docs/screenshots/resistance-hidden.png"),
  });
  expect(analysisRequests).toBe(0);
  await page.getByLabel("Detail research horizon").selectOption("1–2 weeks");
  await expect(page.locator(".context-lines")).toContainText("1–2 weeks");
  await expect(page.locator(".horizon-scope")).toContainText(
    "not separately validated",
  );
  await page.reload();
  await expect(
    page.getByLabel("Research horizon", { exact: true }),
  ).toHaveValue("1–2 weeks");
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await expect(page.getByLabel("Detail research horizon")).toHaveValue(
    "1–2 weeks",
  );
  await page.getByRole("button", { name: "Polski", exact: true }).click();
  await page
    .getByLabel("Horyzont analizy instrumentu")
    .selectOption("6–12 months");
  await expect(page.locator(".context-lines")).toContainText("6–12 miesięcy");
  await expect(page.locator(".horizon-scope")).toContainText(
    "Dłuższa analiza techniczna",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Opór", { exact: true }).uncheck();
  await expect(page.getByLabel("Opór", { exact: true })).not.toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator(".price-chart").screenshot({
    path: path.resolve("../docs/screenshots/short-ranges-narrow.png"),
  });
});
