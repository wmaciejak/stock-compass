import { test, expect } from "@playwright/test";
import path from "node:path";

function result(
  symbol: string,
  language = "en",
  browser_context: unknown = {},
) {
  const claim = {
    text:
      language === "pl"
        ? "Poczekaj na potwierdzenie dzienne."
        : "Wait for daily confirmation.",
    source_refs: ["daily.assessment.summary"],
  };
  return {
    id: `run-${symbol}`,
    symbol,
    horizon: "2–8 weeks",
    language,
    state: "succeeded",
    created_at: "2026-09-30T12:00:00Z",
    updated_at: "2026-09-30T12:01:00Z",
    context_changed: false,
    error: null,
    result: {
      content: {
        symbol,
        horizon: "2–8 weeks",
        language,
        summary: claim,
        recommendation: "wait_for_confirmation",
        confidence: "moderate",
        confidence_reason: claim,
        rationale: [claim],
        counterargument: claim,
        near_term: claim,
        scenarios: ["base", "bull", "bear"].map((kind) => ({
          kind,
          outlook: claim,
          confirmation: claim,
          invalidation: claim,
          levels: [],
          events: [],
        })),
        best_supported_scenario: "base",
        next_observations: [claim],
        risks: [claim],
        missing_context: ["Full news articles are unavailable."],
      },
      model: "gpt-6.1-sol",
      generated_at: "2026-09-30T12:01:00Z",
      response_id: "resp_fixture",
      usage: { input_tokens: 1234, output_tokens: 456 },
      fingerprint: "fixture",
      prompt_version: "stock-compass-ai-v1",
      schema_version: "stock-compass-ai-schema-v1",
      browser_context,
      manifest: [
        {
          name: "daily_history",
          status: "available",
          count: 500,
          bytes: 10000,
        },
      ],
      source_dates: { daily: { last_completed_bar: "2026-09-29" } },
      evidence: {
        "daily.assessment.summary": {
          label: "Daily assessment",
          value: "Completed daily evidence",
          path: "daily.assessment.summary",
        },
      },
    },
  };
}

test.beforeEach(async ({ page }) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
      language: "en",
      horizon: "2–8 weeks",
    },
  });
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        reason: null,
        model: "gpt-6.1-sol",
        active_run: null,
      },
    }),
  );
  await page.route("**/api/ai/summaries/*", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: null })
      : route.fallback(),
  );
});

test("AI buttons exist per ticker and browsing never generates", async ({
  page,
}) => {
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/ai/summaries/") && r.method() === "POST")
      posts++;
  });
  await page.goto("/");
  const rows = page.locator(".watch-table tbody tr");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all())
    await expect(
      row.getByRole("button", { name: "Summarize with AI", exact: true }),
    ).toBeVisible();
  await rows.first().locator(".instrument-button").click();
  await expect(
    page
      .locator(".stock-heading")
      .getByRole("button", { name: "Summarize with AI", exact: true }),
  ).toBeVisible();
  expect(posts).toBe(0);
});

test("AI result uses the requested ticker, drafts, model and narrow layout", async ({
  page,
}) => {
  let submitted: any;
  await page.route("**/api/ai/summaries/*", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: null });
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 202,
      json: { ...result("DEMO_TREND"), state: "preparing", result: null },
    });
  });
  await page.route("**/api/ai/runs/*", (route) =>
    route.fulfill({
      json: result("DEMO_TREND", "en", submitted.browser_context),
    }),
  );
  await page.goto("/");
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await page
    .getByRole("tab", { name: "Research & sizing", exact: true })
    .click();
  await page
    .getByLabel("Research notes", { exact: true })
    .fill("Unsaved note from visible app");
  await page
    .getByLabel("Research thesis", { exact: true })
    .fill("Wait for price confirmation");
  await page
    .locator(".stock-heading")
    .getByRole("button", { name: "Summarize with AI", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "AI outlook · DEMO_TREND" }),
  ).toBeVisible();
  await expect(page.locator(".ai-summary")).toContainText("gpt-6.1-sol");
  await expect(page.locator(".ai-summary")).toContainText(
    "Wait for daily confirmation.",
  );
  expect(submitted.browser_context.note_draft).toBe(
    "Unsaved note from visible app",
  );
  expect(submitted.browser_context.thesis_draft).toBe(
    "Wait for price confirmation",
  );
  await page
    .locator(".ai-summary")
    .screenshot({ path: path.resolve("../docs/screenshots/ai-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".ai-summary")
    .screenshot({ path: path.resolve("../docs/screenshots/ai-narrow.png") });
  await page.locator(".ai-scenarios").scrollIntoViewIfNeeded();
  await page.locator(".ai-summary").screenshot({
    path: path.resolve("../docs/screenshots/ai-narrow-scenarios.png"),
  });
});

test("AI is explicit about offline configuration and supports Polish", async ({
  page,
}) => {
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      json: {
        enabled: false,
        reason: "ai_offline",
        model: "gpt-6.1-sol",
        active_run: null,
      },
    }),
  );
  await page.goto("/");
  await expect(
    page
      .locator(".watch-table tbody tr")
      .first()
      .getByRole("button", { name: "Summarize with AI", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Polski", exact: true }).click();
  await expect(
    page
      .locator(".watch-table tbody tr")
      .first()
      .getByRole("button", { name: "Podsumuj z AI", exact: true }),
  ).toBeVisible();
});

test("AI unknown delivery reopens without silently generating again", async ({
  page,
}) => {
  let posts = 0;
  await page.addInitScript(() =>
    localStorage.setItem(
      "compass-ai:demo:DEMO_TREND:2–8 weeks:en:run",
      "saved-unknown",
    ),
  );
  await page.route("**/api/ai/summaries/*", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: null });
    posts++;
    return route.fulfill({
      status: 202,
      json: { ...result("DEMO_TREND"), state: "preparing", result: null },
    });
  });
  await page.route("**/api/ai/runs/*", (route) =>
    route.fulfill({
      json: {
        ...result("DEMO_TREND"),
        id: "saved-unknown",
        state: "delivery_unknown",
        result: null,
        error: {
          code: "delivery_unknown",
          message:
            "The request may have been billed. Regenerating starts a new request.",
        },
      },
    }),
  );
  await page.goto("/");
  await page
    .locator(".watch-table tbody tr")
    .filter({ hasText: "DEMO_TREND" })
    .getByRole("button", { name: "Summarize with AI", exact: true })
    .click();
  await expect(page.locator(".ai-summary").getByRole("alert")).toContainText(
    "may have been billed",
  );
  expect(posts).toBe(0);
});

test("AI opens an outdated saved result without generating again", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/api/ai/summaries/*", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { ...result("DEMO_TREND"), context_changed: true },
      });
    posts++;
    return route.fulfill({
      status: 202,
      json: { ...result("DEMO_TREND"), state: "preparing", result: null },
    });
  });
  await page.goto("/");
  await page
    .locator(".watch-table tbody tr")
    .filter({ hasText: "DEMO_TREND" })
    .getByRole("button", { name: "Summarize with AI", exact: true })
    .click();
  await expect(page.locator(".ai-summary")).toContainText(
    "Context changed — regenerate to update",
  );
  await expect(
    page
      .locator(".ai-summary")
      .getByRole("button", { name: "Regenerate", exact: true }),
  ).toBeEnabled();
  expect(posts).toBe(0);
});

test("AI recovers a lost submission acknowledgement by UUID with GET only", async ({
  page,
}) => {
  let posts = 0;
  const uuid = "e2158d7f-dacb-4b8b-b299-bdf9f2bc472a";
  await page.addInitScript(
    (id) =>
      localStorage.setItem(
        "compass-ai:demo:DEMO_TREND:2–8 weeks:en:pending",
        id,
      ),
    uuid,
  );
  await page.route("**/api/ai/requests/*", (route) =>
    route.fulfill({
      json: result("DEMO_TREND", "en", { note_draft: "Draft before reload" }),
    }),
  );
  await page.route("**/api/ai/summaries/*", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: null });
    posts++;
    return route.fulfill({
      status: 409,
      json: {
        code: "request_conflict",
        detail: "Different inputs for the same UUID.",
      },
    });
  });
  await page.goto("/");
  await page
    .locator(".watch-table tbody tr")
    .filter({ hasText: "DEMO_TREND" })
    .getByRole("button", { name: "Summarize with AI", exact: true })
    .click();
  await expect(page.locator(".ai-summary")).toContainText(
    "Wait for daily confirmation.",
  );
  expect(posts).toBe(0);
});

for (const change of ["ticker", "horizon", "language"] as const) {
  test(`AI isolates a late response after changing ${change}`, async ({
    page,
  }) => {
    let held: import("@playwright/test").Route | undefined;
    const submissions: any[] = [];
    await page.route("**/api/ai/summaries/*", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: null });
      submissions.push(route.request().postDataJSON());
      if (submissions.length === 1) {
        held = route;
        return;
      }
      const symbol = change === "ticker" ? "DEMO_VOLATILE" : "DEMO_TREND";
      const next = result(
        symbol,
        submissions[1].language,
        submissions[1].browser_context,
      );
      next.horizon = submissions[1].horizon;
      next.result.content.horizon = submissions[1].horizon;
      return route.fulfill({ json: next });
    });
    await page.goto("/");
    await page
      .locator(".watch-table tbody tr")
      .filter({ hasText: "DEMO_TREND" })
      .getByRole("button", { name: "Summarize with AI", exact: true })
      .click();
    await expect.poll(() => !!held).toBe(true);
    await page.getByRole("button", { name: "Close AI summary" }).click();
    if (change === "ticker")
      await page
        .locator(".sidebar-stock")
        .filter({ hasText: "VOLATILE" })
        .click();
    if (change === "horizon") {
      await page
        .getByLabel("Detail research horizon")
        .selectOption("1–2 weeks");
      await expect(page.getByLabel("Detail research horizon")).toHaveValue(
        "1–2 weeks",
      );
    }
    if (change === "language")
      await page.getByRole("button", { name: "Polski", exact: true }).click();
    expect(submissions).toHaveLength(1);
    await page
      .locator(".stock-heading")
      .getByRole("button", {
        name: change === "language" ? "Podsumuj z AI" : "Summarize with AI",
        exact: true,
      })
      .click();
    await expect.poll(() => submissions.length).toBe(2);
    await held!.fulfill({ json: result("DEMO_TREND") });
    const panel = page.locator(".ai-summary");
    await expect(panel).toContainText("gpt-6.1-sol");
    if (change === "ticker")
      await expect(panel.locator("h2")).toContainText("DEMO_VOLATILE");
    if (change === "horizon")
      await expect(panel.locator("h2")).toContainText("1–2 weeks");
    if (change === "language")
      await expect(panel).toContainText("Poczekaj na potwierdzenie dzienne.");
    expect(submissions).toHaveLength(2);
  });
}

test("AI explains uncertain delivery in Polish", async ({ page }) => {
  await page.request.put("/api/settings", {
    data: {
      mode: "demo",
      experience: "advanced",
      preferred_workspace: "research",
      language: "pl",
      horizon: "2–8 weeks",
    },
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "compass-ai:demo:DEMO_TREND:2–8 weeks:pl:run",
      "polish-unknown",
    ),
  );
  await page.route("**/api/ai/runs/*", (route) =>
    route.fulfill({
      json: {
        ...result("DEMO_TREND", "pl"),
        id: "polish-unknown",
        state: "delivery_unknown",
        result: null,
        error: {
          code: "delivery_unknown",
          message:
            "OpenAI delivery is unknown. The request may have been billed; regenerating starts a new request.",
        },
      },
    }),
  );
  await page.goto("/");
  await page
    .locator(".watch-table tbody tr")
    .filter({ hasText: "DEMO_TREND" })
    .getByRole("button", { name: "Podsumuj z AI", exact: true })
    .click();
  await expect(page.locator(".ai-summary").getByRole("alert")).toContainText(
    "Żądanie mogło zostać naliczone",
  );
});

test("AI keeps cleared notes and current sizing strings after tab navigation", async ({
  page,
}) => {
  await page.request.put("/api/notes/DEMO_TREND", {
    data: { text: "Previously saved note" },
  });
  let submitted: any;
  await page.route("**/api/ai/summaries/*", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: null });
    submitted = route.request().postDataJSON();
    return route.fulfill({
      json: result("DEMO_TREND", "en", submitted.browser_context),
    });
  });
  await page.goto("/");
  await page
    .locator(".watch-table .instrument-button")
    .filter({ hasText: "DEMO_TREND" })
    .click();
  await page
    .getByRole("tab", { name: "Research & sizing", exact: true })
    .click();
  await expect(page.getByLabel("Research notes", { exact: true })).toHaveValue(
    "Previously saved note",
  );
  await page.getByLabel("Research notes", { exact: true }).fill("");
  await page
    .getByLabel("Research thesis", { exact: true })
    .fill("Retained thesis");
  await page
    .getByLabel("Available account cash", { exact: true })
    .fill("10000");
  await page.getByLabel("Entry (USD)", { exact: true }).fill("120");
  await page.getByLabel("Invalidation (USD)", { exact: true }).fill("110");
  await page.getByLabel("Chosen risk budget (%)", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Calculate shares", exact: true })
    .click();
  await expect(page.locator(".sizing-result")).toBeVisible();
  await page.getByLabel("Available account cash", { exact: true }).fill("");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page
    .getByRole("tab", { name: "Research & sizing", exact: true })
    .click();
  await expect(page.getByLabel("Research notes", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Research thesis", { exact: true })).toHaveValue(
    "Retained thesis",
  );
  await expect(
    page.getByLabel("Available account cash", { exact: true }),
  ).toHaveValue("");
  await page
    .locator(".stock-heading")
    .getByRole("button", { name: "Summarize with AI", exact: true })
    .click();
  await expect(page.locator(".ai-summary")).toContainText("gpt-6.1-sol");
  expect(submitted.browser_context.note_draft).toBe("");
  expect(submitted.browser_context.sizing_form.account).toBe("");
  expect(submitted.browser_context.sizing_input.account).toBe(10000);
});

test("AI marks an aged saved context without making a generation request", async ({
  page,
}) => {
  await page.clock.install();
  let changed = false;
  let posts = 0;
  const browser = {
    note_draft: null,
    thesis_draft: null,
    sizing_form: null,
    sizing_input: null,
    comparison_symbols: [],
  };
  await page.route("**/api/ai/summaries/*", (route) => {
    if (route.request().method() === "POST") posts++;
    return route.fulfill({ json: result("DEMO_TREND", "en", browser) });
  });
  await page.route("**/api/ai/runs/*", (route) =>
    route.fulfill({
      json: {
        ...result("DEMO_TREND", "en", browser),
        context_changed: changed,
      },
    }),
  );
  await page.goto("/");
  await page
    .locator(".watch-table tbody tr")
    .filter({ hasText: "DEMO_TREND" })
    .getByRole("button", { name: "Summarize with AI", exact: true })
    .click();
  await expect(page.locator(".ai-summary")).toContainText("gpt-6.1-sol");
  await expect(page.locator(".ai-stale")).toHaveCount(0);
  changed = true;
  await page.clock.fastForward(61000);
  await expect(page.locator(".ai-stale")).toContainText(
    "Context changed — regenerate to update",
  );
  expect(posts).toBe(0);
});

for (const [code, language, message] of [
  [
    "credit_balance_exhausted",
    "en",
    "OpenAI API credits are exhausted. Add credits in OpenAI billing before generating again.",
  ],
  [
    "project_spend_limit_exceeded",
    "en",
    "This OpenAI project reached its spending limit. Review the project limit before generating again.",
  ],
  ["request_rate_limited", "pl", "Osiągnięto limit żądań lub tokenów OpenAI."],
] as const) {
  test(`AI identifies ${code} and links account settings in ${language}`, async ({
    page,
  }) => {
    await page.request.put("/api/settings", {
      data: { mode: "demo", language, horizon: "2–8 weeks" },
    });
    await page.addInitScript(
      (lang) =>
        localStorage.setItem(
          `compass-ai:demo:DEMO_TREND:2–8 weeks:${lang}:run`,
          "limit-fixture",
        ),
      language,
    );
    await page.route("**/api/ai/runs/*", (route) =>
      route.fulfill({
        json: {
          ...result("DEMO_TREND", language),
          id: "limit-fixture",
          state: "failed",
          result: null,
          error: { code, message: "Sanitized backend error" },
        },
      }),
    );
    let posts = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/ai/summaries/") && r.method() === "POST")
        posts++;
    });
    await page.goto("/");
    await page
      .locator(".watch-table tbody tr")
      .filter({ hasText: "DEMO_TREND" })
      .getByRole("button", {
        name: language === "pl" ? "Podsumuj z AI" : "Summarize with AI",
        exact: true,
      })
      .click();
    const alert = page.locator(".ai-summary").getByRole("alert");
    await expect(alert).toContainText(message);
    await expect(
      alert.locator(
        'a[href="https://platform.openai.com/settings/organization/billing"]',
      ),
    ).toBeVisible();
    await expect(
      alert.locator(
        'a[href="https://platform.openai.com/settings/organization/limits"]',
      ),
    ).toBeVisible();
    expect(posts).toBe(0);
  });
}

for (const language of ["en", "pl"] as const) {
  test(`AI shows safe request diagnostics in ${language} without resubmitting`, async ({
    page,
  }) => {
    await page.request.put("/api/settings", { data: { language } });
    await page.addInitScript(
      (lang) =>
        localStorage.setItem(
          `compass-ai:demo:DEMO_TREND:2–8 weeks:${lang}:run`,
          "diagnostics-fixture",
        ),
      language,
    );
    await page.route("**/api/ai/runs/*", (route) =>
      route.fulfill({
        json: {
          ...result("DEMO_TREND", language),
          id: "diagnostics-fixture",
          state: "failed",
          result: null,
          error: {
            code: "request_too_large",
            message: "Sanitized error",
            diagnostics: {
              request_id: "req_browser123",
              input_context_bytes: 1845923,
              requested_tokens: 280000,
              token_limit: 30000,
              remaining_tokens: 0,
              retry_after_seconds: 56,
            },
          },
        },
      }),
    );
    let posts = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/ai/summaries/") && r.method() === "POST")
        posts++;
    });
    await page.goto("/");
    await page
      .locator(".watch-table tbody tr")
      .filter({ hasText: "DEMO_TREND" })
      .getByRole("button", {
        name: language === "pl" ? "Podsumuj z AI" : "Summarize with AI",
        exact: true,
      })
      .click();
    const alert = page.locator(".ai-summary").getByRole("alert");
    await expect(page.locator(".ai-summary")).toContainText(
      language === "pl"
        ? "ostatnich 32 zakończonych świec"
        : "last 32 completed bars",
    );
    await expect(alert).toContainText(
      language === "pl" ? "cały limit tokenów" : "entire token rate limit",
    );
    await alert
      .getByText(
        language === "pl" ? "Diagnostyka żądania" : "Request diagnostics",
        { exact: true },
      )
      .click();
    await expect(alert).toContainText("req_browser123");
    await expect(alert).toContainText("280000");
    await expect(alert).toContainText("30000");
    await expect(alert).toContainText(
      language === "pl"
        ? "Kontekst wejściowy: 1845923 bajtów"
        : "Input context: 1845923 bytes",
    );
    await expect(
      alert.locator(
        'a[href="https://platform.openai.com/settings/organization/limits"]',
      ),
    ).toBeVisible();
    expect(posts).toBe(0);
  });
}

for (const language of ["en", "pl"] as const) {
  test(`AI local token budget rejection is explicit in ${language}`, async ({ page }) => {
    await page.request.put("/api/settings", { data: { language } });
    await page.addInitScript((lang) => localStorage.setItem(`compass-ai:demo:DEMO_TREND:2–8 weeks:${lang}:run`, "budget-fixture"), language);
    await page.route("**/api/ai/runs/*", (route) => route.fulfill({ json: {
      ...result("DEMO_TREND", language), id: "budget-fixture", state: "failed", result: null,
      error: { code: "context_token_budget_exceeded", message: "Sanitized local failure", diagnostics: {
        input_tokens: 178001, max_output_tokens: 12000, requested_tokens: 190001, request_token_budget: 190000,
      } },
    } }));
    let posts = 0;
    page.on("request", (r) => { if (r.url().includes("/api/ai/summaries/") && r.method() === "POST") posts++; });
    await page.goto("/");
    await page.locator(".watch-table tbody tr").filter({ hasText: "DEMO_TREND" }).getByRole("button", {
      name: language === "pl" ? "Podsumuj z AI" : "Summarize with AI", exact: true,
    }).click();
    const alert = page.locator(".ai-summary").getByRole("alert");
    await expect(alert).toContainText(language === "pl" ? "ustawiony budżet tokenów" : "configured request token budget");
    await alert.locator("summary").click();
    await expect(alert).toContainText(language === "pl" ? "Tokeny wejściowe: 178001" : "Input tokens: 178001");
    await expect(alert).toContainText(language === "pl" ? "Budżet tokenów żądania: 190000" : "Request token budget: 190000");
    expect(posts).toBe(0);
  });
}

for (const language of ["en", "pl"] as const) {
  test(`AI explains rejected output safely in ${language} without another paid request`, async ({ page }) => {
    await page.request.put("/api/settings", { data: { language } });
    await page.addInitScript((lang) => localStorage.setItem(`compass-ai:demo:DEMO_TREND:2–8 weeks:${lang}:run`, "validation-fixture"), language);
    await page.route("**/api/ai/runs/*", (route) => route.fulfill({ json: {
      ...result("DEMO_TREND", language), id: "validation-fixture", state: "failed", result: null,
      error: { code: "invalid_result", message: "Sanitized output error", diagnostics: {
        validation_rule: "price_value_mismatch", output_field: "scenarios.0.levels.0.value",
        response_id: "resp_rejected_fixture", input_tokens: 140000, output_tokens: 2000,
        raw_response: "Private generated advice", unknown_field: "Private provider detail",
      } },
    } }));
    let posts = 0;
    page.on("request", (r) => { if (r.url().includes("/api/ai/summaries/") && r.method() === "POST") posts++; });
    await page.goto("/");
    await page.locator(".watch-table tbody tr").filter({ hasText: "DEMO_TREND" }).getByRole("button", {
      name: language === "pl" ? "Podsumuj z AI" : "Summarize with AI", exact: true,
    }).click();
    const alert = page.locator(".ai-summary").getByRole("alert");
    await expect(alert).toContainText(language === "pl" ? "Poziom ceny nie odpowiada dokładnej wartości" : "A price level does not match the exact captured value");
    await alert.locator("summary").click();
    await expect(alert).toContainText("scenarios.0.levels.0.value");
    await expect(alert).toContainText("resp_rejected_fixture");
    await expect(alert).toContainText(language === "pl" ? "Tokeny wyjściowe: 2000" : "Output tokens: 2000");
    await expect(alert).not.toContainText("Private");
    expect(posts).toBe(0);
  });
}

test("AI explains that older saved output failures have no recorded validation reason", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("compass-ai:demo:DEMO_TREND:2–8 weeks:en:run", "older-validation-fixture"));
  await page.route("**/api/ai/runs/*", (route) => route.fulfill({ json: {
    ...result("DEMO_TREND"), id: "older-validation-fixture", state: "failed", result: null,
    error: { code: "invalid_result", message: "Sanitized output error" },
  } }));
  await page.goto("/");
  await page.locator(".watch-table tbody tr").filter({ hasText: "DEMO_TREND" }).getByRole("button", { name: "Summarize with AI", exact: true }).click();
  await expect(page.locator(".ai-summary").getByRole("alert")).toContainText("The precise failed check was not recorded for this saved request.");
});
