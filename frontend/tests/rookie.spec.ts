import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
const output = path.resolve("../.superpowers/sdd/2026-09-30-rookie-investor");
async function start(page: Page, extra: Record<string, unknown> = {}) {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      language: "en",
      experience: "beginner",
      preferred_workspace: "research",
      ...extra,
    },
  });
  await page.request.put("/api/onboarding", {
    data: { version: 1, path: "research", step: 0, state: "active" },
  });
  await page.goto("/");
}
async function planning(page: Page) {
  await page
    .getByRole("button", { name: "Long-term planning", exact: true })
    .click();
  for (const [label, value] of [
    ["Starting amount", "1000"],
    ["Monthly contribution", "100"],
    ["Years", "2"],
    ["Assumed annual return (%)", "0"],
    ["Annual ongoing fee (%)", "0"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
}
test("regular contributions remain understandable after input edits and save/reload", async ({
  page,
}) => {
  await start(page);
  await planning(page);
  await page
    .getByRole("button", { name: "Calculate scenario", exact: true })
    .click();
  await expect(page.getByTestId("planning-ending-value")).toContainText(
    "3,400",
  );
  await page.getByLabel("Monthly contribution", { exact: true }).fill("200");
  await expect(
    page.getByText("Inputs changed. Recalculate this scenario."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Plan saved" }),
  ).toContainText("Plan saved");
  await page.reload();
  await page
    .getByRole("button", { name: "Long-term planning", exact: true })
    .click();
  await expect(
    page.getByLabel("Monthly contribution", { exact: true }),
  ).toHaveValue("200");
  await page
    .getByRole("button", { name: "Calculate scenario", exact: true })
    .click();
  await expect(page.getByTestId("planning-ending-value")).toContainText(
    "5,800",
  );
});
test("delayed calculation and save preserve a newer draft", async ({
  page,
}) => {
  await start(page);
  await planning(page);
  for (const endpoint of ["scenario", "plan"]) {
    let release!: () => void, seen!: () => void;
    const held = new Promise<void>((r) => (release = r)),
      started = new Promise<void>((r) => (seen = r));
    await page.route("**/api/planning/" + endpoint, async (route) => {
      if (route.request().method() === "GET") return route.continue();
      const response = await route.fetch();
      seen();
      await held;
      await route.fulfill({ response });
    });
    await page
      .getByRole("button", {
        name: endpoint === "scenario" ? "Calculate scenario" : "Save plan",
        exact: true,
      })
      .click();
    await started;
    await page
      .getByLabel("Monthly contribution", { exact: true })
      .fill(endpoint === "scenario" ? "250" : "350");
    release();
    await expect(
      page.getByRole("button", {
        name: endpoint === "scenario" ? "Calculate scenario" : "Save plan",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Monthly contribution", { exact: true }),
    ).toHaveValue(endpoint === "scenario" ? "250" : "350");
    await page.unroute("**/api/planning/" + endpoint);
  }
  await expect(
    page.getByText("Inputs changed. Recalculate this scenario."),
  ).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
});
test("beginner overview precedes chart and evidence remains keyboard accessible", async ({
  page,
}) => {
  await start(page);
  await expect(page.getByTestId("beginner-summary").first()).toBeVisible();
  await page.locator(".sidebar-stock").filter({ hasText: "TREND" }).click();
  const summary = page.getByTestId("beginner-summary");
  await expect(summary).toContainText("Main caution");
  await expect(summary).toContainText("Watch next");
  await expect(page.getByTestId("price-chart")).not.toBeVisible();
  const disclosure = page.getByText("Explore the evidence", { exact: true });
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await page.getByRole("tab", { name: "Indicators & learning" }).click();
  await page.locator(".indicator summary").first().click();
  await expect(
    page.getByText("Common mistake:", { exact: true }).first(),
  ).toBeVisible();
});
test("guide skip resume explicit steps and settings restart persist", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Plan regular investing", exact: true })
    .click();
  await expect(page.getByTestId("beginner-guide")).toContainText(
    "Define a goal",
  );
  await page
    .getByRole("button", { name: "I understand this step", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume guide", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume guide", exact: true }).click();
  await expect(page.getByTestId("beginner-guide")).toContainText(
    "Enter a regular contribution",
  );
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "I understand this step", exact: true })
      .click();
  await expect(page.getByTestId("beginner-guide")).toContainText(
    "Guide completed",
  );
  await page
    .getByRole("button", { name: "Settings & data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restart beginner guide", exact: true })
    .click();
  await expect(page.getByTestId("beginner-guide")).toContainText(
    "Choose an example or ticker",
  );
  await page.getByLabel("Experience").selectOption("advanced");
  await expect(page.getByTestId("beginner-guide")).not.toBeVisible();
});
test("planning works without market analysis and fees use backend annual series", async ({
  page,
}) => {
  await page.route("**/api/analysis/**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline market data" } }),
  );
  await start(page, { preferred_workspace: "long_term" });
  await expect(
    page.getByRole("heading", { name: "Long-term planning", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load illustrative example", exact: true })
    .click();
  await page.getByLabel("Annual ongoing fee (%)").fill("1");
  await page
    .getByRole("button", { name: "Calculate scenario", exact: true })
    .click();
  await expect(page.getByTestId("planning-fee-impact")).not.toContainText(
    "0.00 USD",
  );
  await expect(
    page.getByRole("table", { name: "Annual scenario values" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Understanding fees" }),
  ).toHaveAttribute("href", /investor.gov/);
  await page.getByLabel("Years", { exact: true }).fill("2.5");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("whole years");
});
test("calendar sorts estimates and retains unknown coverage without refresh downloads", async ({
  page,
}) => {
  await start(page);
  await expect(page.getByTestId("beginner-summary").first()).toBeVisible();
  const base = {
    name: "Example",
    kind: "earnings",
    date_basis: "exchange_local",
    exchange_timezone: "America/New_York",
    source: "Yahoo",
    retrieved_at: "2026-09-29T12:00:00Z",
    freshness: "stale",
    refresh_error: null,
    in_window: false,
    reason_code: null,
    last_reported_date: null,
    date_start: null,
    date_end: null,
  };
  await page.route("**/api/watchlist/events?*", (route) =>
    route.fulfill({
      json: {
        generated_at: "2026-09-30T12:00:00Z",
        mode: "demo",
        offline: true,
        freshness_hours: 24,
        rows: [
          {
            ...base,
            symbol: "LATE",
            status: "estimated",
            date_start: "2026-10-20",
            date_end: "2026-10-22",
            in_window: true,
          },
          {
            ...base,
            symbol: "EARLY",
            status: "estimated",
            date_start: "2026-10-01",
            date_end: "2026-10-01",
            in_window: true,
            refresh_error: { message: "Provider unavailable" },
          },
          {
            ...base,
            symbol: "LEGACY",
            status: "unknown",
            reason_code: "legacy_date_unverified",
            last_reported_date: "2026-10-03",
          },
          {
            ...base,
            symbol: "ETF",
            status: "not_applicable",
            reason_code: "etf",
          },
          {
            ...base,
            symbol: "OUTSIDE",
            status: "estimated",
            date_start: "2026-12-01",
            date_end: "2026-12-01",
          },
        ],
      },
    }),
  );
  let downloads = 0;
  page.on("request", (r) => {
    if (r.url().includes("/analysis/") && r.url().includes("refresh=true"))
      downloads++;
  });
  await page
    .getByRole("button", { name: "Earnings calendar", exact: true })
    .click();
  await expect(
    page.getByTestId("earnings-agenda").locator("article").first(),
  ).toContainText("EARLY");
  await expect(page.getByTestId("earnings-agenda")).toContainText("Estimated");
  await expect(page.getByTestId("earnings-coverage")).toContainText(
    "Unverified last reported date",
  );
  await expect(page.getByTestId("earnings-coverage")).toContainText(
    "Company earnings do not apply",
  );
  await expect(page.getByTestId("earnings-coverage")).toContainText(
    "Outside selected window",
  );
  await expect(page.getByTestId("earnings-agenda")).toContainText(
    "Refresh failed",
  );
  await page.getByRole("button", { name: "90 days", exact: true }).click();
  expect(downloads).toBe(0);
});
test("Polish planning and mobile guide remain readable without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, { language: "pl", preferred_workspace: "long_term" });
  await expect(
    page.getByRole("heading", {
      name: "Planowanie długoterminowe",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Wczytaj przykładowe założenia", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Oblicz scenariusz", exact: true })
    .click();
  await expect(page.getByTestId("planning-ending-value")).toBeVisible();
  const annualTable = page.getByRole("region", {
    name: "Roczne wartości scenariusza",
    exact: true,
  });
  await annualTable.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => annualTable.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await page.getByText("Założenia i ograniczenia", { exact: true }).click();
  await expect(
    page.getByText("Stała stopa zwrotu", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(output, "task-2-mobile-pl.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Otwórz nawigację", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Kalendarz wyników", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kalendarz wyników", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("late startup preferences do not undo an explicit navigation choice", async ({
  page,
}) => {
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (seen = r));
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    seen();
    await held;
    await route.fulfill({ response });
  });
  await start(page);
  await started;
  await page
    .getByRole("button", { name: "Long-term planning", exact: true })
    .click();
  release();
  await expect(
    page.getByRole("heading", { name: "Long-term planning", exact: true }),
  ).toBeVisible();
});

for (const language of ["en", "pl"] as const) {
  test(
    "failed guide load retries the saved non-default progress in " + language,
    async ({ page }) => {
      const saved = {
        version: 1,
        path: "long_term",
        step: 2,
        state: "dismissed",
      };
      await page.request.put("/api/settings", {
        data: {
          mode: "demo",
          language,
          experience: "beginner",
          preferred_workspace: "research",
        },
      });
      await page.request.put("/api/onboarding", { data: saved });
      let first = true,
        writes = 0;
      await page.route("**/api/onboarding", async (route) => {
        if (route.request().method() === "PUT") {
          writes++;
          return route.continue();
        }
        if (first) {
          first = false;
          return route.fulfill({
            status: 503,
            json: { detail: "Service is unavailable." },
          });
        }
        return route.continue();
      });
      await page.goto("/");
      const guide = page.getByTestId("beginner-guide");
      await expect(guide.getByRole("alert")).toContainText(
        language === "en"
          ? "Saved guide progress could not be loaded."
          : "Nie udało się wczytać zapisanego postępu przewodnika.",
      );
      await page
        .getByRole("button", {
          name:
            language === "en"
              ? "Retry loading guide"
              : "Spróbuj ponownie wczytać przewodnik",
          exact: true,
        })
        .click();
      await expect(
        guide.getByRole("button", {
          name: language === "en" ? "Resume guide" : "Wznów przewodnik",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.request.get("/api/onboarding").then((r) => r.json()),
      ).toEqual(saved);
      expect(writes).toBe(0);
      await guide
        .getByRole("button", {
          name: language === "en" ? "Resume guide" : "Wznów przewodnik",
          exact: true,
        })
        .click();
      await expect(guide).toContainText(
        language === "en"
          ? "Inspect the fee comparison"
          : "Sprawdź wpływ opłat",
      );
      await expect(guide).toContainText(
        language === "en" ? "Step 3 of 4" : "Krok 3 z 4",
      );
    },
  );
}

test("a delayed guide retry cannot replace a newer explicit restart", async ({
  page,
}) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      language: "en",
      experience: "beginner",
      preferred_workspace: "research",
    },
  });
  await page.request.put("/api/onboarding", {
    data: { version: 1, path: "long_term", step: 2, state: "dismissed" },
  });
  let first = true,
    release!: () => void,
    seen!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (seen = r));
  await page.route("**/api/onboarding", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    if (first) {
      first = false;
      return route.fulfill({
        status: 503,
        json: { detail: "Service is unavailable." },
      });
    }
    const response = await route.fetch();
    seen();
    await held;
    await route.fulfill({ response });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Retry loading guide", exact: true })
    .click();
  await started;
  await expect(page.getByTestId("beginner-guide")).toContainText(
    "Loading saved guide…",
  );
  await page
    .getByRole("button", { name: "Settings & data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restart beginner guide", exact: true })
    .click();
  await expect(page.getByTestId("beginner-guide")).toContainText(
    "Choose an example or ticker",
  );
  const lateResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/onboarding") && r.request().method() === "GET",
  );
  release();
  await (await lateResponse).finished();
  await expect(
    page.getByRole("button", { name: "I understand this step", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "I understand this step", exact: true })
    .click();
  await expect(page.getByTestId("beginner-guide")).toContainText(
    "Read the conclusion and caution",
  );
  expect(
    await page.request.get("/api/onboarding").then((r) => r.json()),
  ).toEqual({ version: 1, path: "research", step: 1, state: "active" });
});

test("advanced mode hides failed guide loading and its retry", async ({
  page,
}) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      language: "en",
      experience: "advanced",
      preferred_workspace: "research",
    },
  });
  await page.route("**/api/onboarding", (route) =>
    route.fulfill({ status: 503, json: { detail: "Service is unavailable." } }),
  );
  await page.goto("/");
  await expect(page.getByTestId("price-chart")).toBeVisible();
  await expect(page.getByTestId("beginner-guide")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry loading guide", exact: true }),
  ).not.toBeVisible();
});

// Source timestamps stay fixed: presentation must not replace retrieval time with "now".
function eventFixture(mode = "demo", rows?: Record<string, unknown>[]) {
  const base = {
    name: "Fixture company",
    kind: "earnings",
    date_basis: "exchange_local",
    exchange_timezone: "America/New_York",
    source: "Yahoo",
    retrieved_at: "2026-09-29T12:00:00Z",
    freshness: "stale",
    refresh_error: null,
    in_window: false,
    reason_code: null,
    last_reported_date: null,
    date_start: null,
    date_end: null,
  };
  return {
    generated_at: "2026-10-01T12:00:00Z",
    mode,
    offline: true,
    freshness_hours: 24,
    rows: rows ?? [
      {
        ...base,
        symbol: "TODAY",
        status: "estimated",
        date_start: "2026-10-01",
        date_end: "2026-10-01",
        in_window: true,
        refresh_error: { message: "Provider unavailable" },
      },
      {
        ...base,
        symbol: "RANGE",
        status: "estimated",
        date_start: "2026-10-20",
        date_end: "2026-10-22",
        in_window: true,
      },
      {
        ...base,
        symbol: "UNKNOWN",
        status: "unknown",
        reason_code: "no_cache",
        retrieved_at: null,
        freshness: "unknown",
      },
      {
        ...base,
        symbol: "LEGACY",
        status: "unknown",
        reason_code: "legacy_date_unverified",
        last_reported_date: "2026-10-03",
      },
      { ...base, symbol: "ETF", status: "not_applicable", reason_code: "etf" },
      {
        ...base,
        symbol: "OUTSIDE",
        status: "estimated",
        date_start: "2026-12-01",
        date_end: "2026-12-01",
      },
    ],
  };
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: /^(Open navigation|Otwórz nawigację)$/,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const timezoneId of ["America/Los_Angeles", "Pacific/Auckland"]) {
  test(
    "same-day and range labels remain calendar dates in " + timezoneId,
    async ({ browser }) => {
      const context = await browser.newContext({
        timezoneId,
        baseURL: "http://127.0.0.1:8767",
      });
      const page = await context.newPage();
      await page.route("**/api/watchlist/events?*", (route) =>
        route.fulfill({ json: eventFixture() }),
      );
      await start(page);
      await navigate(page, "Earnings calendar");
      const agenda = page.getByTestId("earnings-agenda");
      await expect(agenda.locator("article").first()).toContainText("TODAY");
      await expect(agenda.locator("article").first()).toContainText(
        "10/1/2026",
      );
      await expect(agenda).toContainText("10/20/2026 – 10/22/2026");
      await expect(agenda).toContainText("Needs refresh");
      await expect(agenda).toContainText("Refresh failed");
      const original = new Date("2026-09-29T12:00:00Z").toLocaleString(
        "en-US",
        { timeZone: timezoneId },
      );
      await expect(agenda.locator("article").first()).toContainText(original);
      await expect(page.getByTestId("earnings-coverage")).toContainText(
        "No cached earnings information",
      );
      await expect(page.getByTestId("earnings-coverage")).toContainText(
        "10/3/2026",
      );
      await context.close();
    },
  );
}

test("guide research completion skip resume and restart preserve saved plans and notes", async ({
  page,
}) => {
  await start(page);
  await planning(page);
  await page.getByLabel("Goal name (optional)").fill("My own goal");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Plan saved" }),
  ).toBeVisible();
  const savedPlan = await page.request
    .get("/api/planning/plan")
    .then((r) => r.json());
  await navigate(page, "Research briefing");
  await page.locator(".sidebar-stock").filter({ hasText: "TREND" }).click();
  await page.getByRole("tab", { name: "Research & sizing" }).click();
  await page
    .getByLabel("Research notes")
    .fill("A question that belongs to me.");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect
    .poll(() => page.request.get("/api/notes/DEMO_TREND").then((r) => r.json()))
    .toEqual({ text: "A question that belongs to me." });
  const guide = page.getByTestId("beginner-guide");
  await guide
    .getByRole("button", { name: "Understand a stock", exact: true })
    .click();
  await guide
    .getByRole("button", { name: "I understand this step", exact: true })
    .click();
  await guide.getByRole("button", { name: "Skip guide", exact: true }).click();
  await page.getByRole("button", { name: "Polski", exact: true }).click();
  await page.reload();
  await guide
    .getByRole("button", { name: "Wznów przewodnik", exact: true })
    .click();
  await expect(guide).toContainText("Krok 2 z 4");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await guide.getByRole("button", { name: "Back", exact: true }).click();
  await expect(guide).toContainText("Step 1 of 4");
  for (let i = 0; i < 4; i++)
    await guide
      .getByRole("button", { name: "I understand this step", exact: true })
      .click();
  await expect(guide).toContainText("Guide completed");
  await navigate(page, "Settings & data");
  await page
    .getByRole("button", { name: "Restart beginner guide", exact: true })
    .click();
  await expect(guide).toContainText("Step 1 of 4");
  expect(
    await page.request.get("/api/planning/plan").then((r) => r.json()),
  ).toEqual(savedPlan);
  expect(
    await page.request.get("/api/notes/DEMO_TREND").then((r) => r.json()),
  ).toEqual({ text: "A question that belongs to me." });
});

test("empty offline coverage and failed market loading leave both new pages navigable", async ({
  page,
}) => {
  await page.route("**/api/analysis/**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline market data" } }),
  );
  await page.route("**/api/watchlist?mode=*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/watchlist/events?*", (route) =>
    route.fulfill({ json: eventFixture("live", []) }),
  );
  await start(page, { mode: "live" });
  await expect(page.getByText("Add an instrument to begin.")).toBeVisible();
  await navigate(page, "Earnings calendar");
  await expect(page.getByTestId("earnings-coverage")).toContainText(
    "Your watchlist is empty",
  );
  await expect(page.getByTestId("earnings-agenda")).toContainText(
    "This does not mean there is no earnings risk",
  );
  await expect(
    page.getByText("Offline: showing cached event coverage."),
  ).toBeVisible();
  await navigate(page, "Long-term planning");
  await page
    .getByRole("button", { name: "Load illustrative example", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Calculate scenario", exact: true })
    .click();
  await expect(page.getByTestId("planning-ending-value")).toBeVisible();
  await navigate(page, "Earnings calendar");
  await expect(page.getByTestId("earnings-coverage")).toContainText(
    "Your watchlist is empty",
  );
});

test("calendar reacts to normal data refresh and mode without starting a second download", async ({
  page,
}) => {
  let revision = 0;
  const modes: string[] = [];
  await page.route("**/api/watchlist/events?*", (route) => {
    const mode = new URL(route.request().url()).searchParams.get("mode")!;
    modes.push(mode);
    const fixture = eventFixture(mode);
    fixture.rows[0].date_start = revision ? "2026-10-02" : "2026-10-01";
    fixture.rows[0].date_end = fixture.rows[0].date_start;
    return route.fulfill({ json: fixture });
  });
  await page.clock.install();
  await start(page);
  await expect(
    page.getByRole("button", { name: "Refresh watchlist", exact: true }),
  ).toBeEnabled();
  await navigate(page, "Earnings calendar");
  await expect(page.getByTestId("earnings-agenda")).toContainText("10/1/2026");
  let bulk = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/analysis/") && r.url().includes("refresh=true"))
      bulk++;
  });
  await page.getByRole("button", { name: "90 days", exact: true }).click();
  await expect.poll(() => modes.length).toBe(2);
  expect(bulk).toBe(0);
  const watched = await page.request
    .get("/api/watchlist?mode=demo")
    .then((r) => r.json());
  revision++;
  await page.getByLabel("Auto-refresh interval").selectOption("1");
  await page.clock.fastForward(60_000);
  await expect(page.getByTestId("earnings-agenda")).toContainText("10/2/2026");
  expect(bulk).toBe(watched.length);
  await page.getByLabel("Auto-refresh interval").selectOption("0");
  await page
    .getByRole("button", { name: "Live research", exact: true })
    .click();
  await expect.poll(() => modes.at(-1)).toBe("live");
  await navigate(page, "Earnings calendar");
  await expect(page.getByTestId("earnings-agenda")).toContainText("10/2/2026");
});

test("late saved-plan loading does not overwrite an edited draft and invalid save preserves valid plan", async ({
  page,
}) => {
  const saved = {
    initial_amount: 1000,
    monthly_contribution: 100,
    years: 2,
    annual_return: 0,
    annual_fee: 0,
    currency: "USD",
    goal_name: "Saved goal",
    target_amount: null,
  };
  await page.request.put("/api/planning/plan", { data: saved });
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (seen = r));
  await page.route("**/api/planning/plan", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    seen();
    await held;
    await route.fulfill({ response });
  });
  await start(page, { preferred_workspace: "long_term" });
  await started;
  await page.getByLabel("Monthly contribution", { exact: true }).fill("250");
  release();
  await expect(
    page.getByRole("button", { name: "Save plan", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("Monthly contribution", { exact: true }),
  ).toHaveValue("250");
  await page.getByLabel("Years", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(
    await page.request.get("/api/planning/plan").then((r) => r.json()),
  ).toEqual(saved);
});

for (const language of ["en", "pl"] as const) {
  for (const mobile of [false, true]) {
    test(`rookie ${language} ${mobile ? "mobile" : "desktop"} layouts and screenshots`, async ({
      page,
    }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      const screenshotDir = path.resolve("../docs/screenshots");
      const prefix = `rookie-${language}-${mobile ? "mobile" : "desktop"}`;
      async function capture(name: string, selector: string) {
        await page.locator(selector).first().scrollIntoViewIfNeeded();
        await noOverflow(page);
        await page.screenshot({
          path: path.join(screenshotDir, `${prefix}-${name}.png`),
          fullPage: false,
        });
      }
      await page.route("**/api/watchlist/events?*", (route) =>
        route.fulfill({ json: eventFixture() }),
      );
      await start(page, { language });
      await expect(page.getByTestId("beginner-summary").first()).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: language === "en" ? "Refresh watchlist" : "Odśwież listę",
          exact: true,
        }),
      ).toBeEnabled();
      const guide = page.getByTestId("beginner-guide");
      await expect(guide).toContainText(
        language === "en"
          ? "Choose an example or ticker"
          : "Wybierz przykład lub symbol",
      );
      await capture("guide", '[data-testid="beginner-guide"]');
      await navigate(
        page,
        language === "en" ? "Research briefing" : "Przegląd rynku",
      );
      if (mobile) {
        await page
          .getByRole("button", { name: "Otwórz nawigację", exact: true })
          .or(
            page.getByRole("button", { name: "Open navigation", exact: true }),
          )
          .click();
      }
      await page.locator(".sidebar-stock").filter({ hasText: "TREND" }).click();
      await expect(page.locator(".stock-heading h1")).toContainText(
        "DEMO_TREND",
      );
      await expect(page.getByTestId("beginner-summary")).toContainText(
        language === "en" ? "Main caution" : "Główna kwestia do sprawdzenia",
      );
      await capture("summary", '[data-testid="beginner-summary"]');
      await navigate(
        page,
        language === "en" ? "Long-term planning" : "Planowanie długoterminowe",
      );
      await guide
        .getByRole("button", {
          name:
            language === "en"
              ? "Plan regular investing"
              : "Zaplanuj regularne inwestowanie",
          exact: true,
        })
        .click();
      await expect(guide).toContainText(
        language === "en" ? "Define a goal" : "Określ cel",
      );
      await capture("planning-guide", '[data-testid="beginner-guide"]');
      await page
        .getByRole("button", {
          name:
            language === "en"
              ? "Load illustrative example"
              : "Wczytaj przykładowe założenia",
          exact: true,
        })
        .click();
      await capture("planner", ".planning-grid form");
      if (mobile) await capture("planner-actions", ".planning-actions");
      await page
        .getByRole("button", {
          name: language === "en" ? "Calculate scenario" : "Oblicz scenariusz",
          exact: true,
        })
        .click();
      await expect(page.getByTestId("planning-ending-value")).toBeVisible();
      await capture("result", ".planning-result");
      if (mobile)
        await capture("annual-table", ".planning-result .table-scroll");
      await expect(
        page.getByRole("heading", {
          name: language === "en" ? "ETF learning" : "Poznaj ETF-y",
          exact: true,
        }),
      ).toBeVisible();
      await capture("lessons", ".etf-lessons");
      await navigate(
        page,
        language === "en" ? "Earnings calendar" : "Kalendarz wyników",
      );
      await expect(page.getByTestId("earnings-agenda")).toContainText(
        language === "en" ? "Estimated" : "Szacowany termin",
      );
      await capture("agenda", '[data-testid="earnings-agenda"]');
      await expect(page.getByTestId("earnings-coverage")).toContainText(
        language === "en"
          ? "Company earnings do not apply"
          : "Wyniki firmy nie mają zastosowania",
      );
      await capture("coverage", '[data-testid="earnings-coverage"]');
    });
  }
}

test("navigation remains usable while a pending market response fails", async ({
  page,
}) => {
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (seen = r));
  await page.route("**/api/analysis/**", async (route) => {
    seen();
    await held;
    await route.fulfill({
      status: 503,
      json: { detail: "Offline market data" },
    });
  });
  await start(page);
  await started;
  await navigate(page, "Long-term planning");
  release();
  await expect(
    page.getByRole("heading", { name: "Long-term planning", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load illustrative example", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Calculate scenario", exact: true })
    .click();
  await expect(page.getByTestId("planning-ending-value")).toBeVisible();
  await navigate(page, "Earnings calendar");
  await expect(page.getByTestId("earnings-coverage")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use synthetic example", exact: true }),
  ).toBeVisible();
});

for (const language of ["en", "pl"] as const) {
  test(`mobile scenario chart keeps ${language} labels readable and large values inside its bounds`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, { language, preferred_workspace: "long_term" });
    await page
      .getByRole("button", {
        name:
          language === "en"
            ? "Load illustrative example"
            : "Wczytaj przykładowe założenia",
        exact: true,
      })
      .click();
    async function calculateAndCheck(expectedContributed: string) {
      await page
        .getByRole("button", {
          name: language === "en" ? "Calculate scenario" : "Oblicz scenariusz",
          exact: true,
        })
        .click();
      await expect(page.getByTestId("planning-ending-value")).toBeVisible();
      await expect(page.getByTestId("planning-contributed")).toHaveText(
        expectedContributed,
      );
      const svg = page.locator(".planning-chart svg");
      await svg.scrollIntoViewIfNeeded();
      const labels = await svg.locator("text").evaluateAll((nodes) =>
        nodes.map((node) => {
          const text = node as SVGTextElement;
          const box = text.getBoundingClientRect();
          const bounds = text.ownerSVGElement!.getBoundingClientRect();
          return {
            label: text.textContent,
            pixels:
              parseFloat(getComputedStyle(text).fontSize) *
              Math.abs(text.getScreenCTM()!.a),
            inside:
              box.left >= bounds.left - 1 && box.right <= bounds.right + 1,
          };
        }),
      );
      expect(labels).toHaveLength(5);
      for (const label of labels) {
        expect(
          label.pixels,
          `Rendered font size: ${label.label}`,
        ).toBeGreaterThanOrEqual(13.5);
        expect(label.inside, `Axis label is clipped: ${label.label}`).toBe(
          true,
        );
      }
      await noOverflow(page);
    }
    await calculateAndCheck(
      language === "en" ? "13,000.00 USD" : "13 000,00 USD",
    );
    for (const [id, value] of [
      ["initial_amount", "1000000000"],
      ["monthly_contribution", "10000000"],
      ["years", "50"],
      ["annual_return", "50"],
      ["annual_fee", "10"],
    ]) {
      await page.locator(`#planning-${id}`).fill(value);
    }
    await calculateAndCheck(
      language === "en" ? "7,000,000,000.00 USD" : "7 000 000 000,00 USD",
    );
    await expect(page.locator(".planning-chart figcaption")).toContainText(
      "USD",
    );
    await expect(page.getByTestId("planning-contributed")).toContainText(
      language === "en" ? "7,000,000,000.00 USD" : "7 000 000 000,00 USD",
    );
    await page.screenshot({
      path: path.resolve(
        `../docs/screenshots/rookie-${language}-mobile-large-result.png`,
      ),
    });
  });
}
