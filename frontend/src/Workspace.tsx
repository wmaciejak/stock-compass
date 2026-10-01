import { useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import { LineChart } from "./Charts";
import type { Analysis, Watch, Settings } from "./types";
import { Upload, CheckCircle2, Activity, ArrowRight } from "lucide-react";
import { useResearchContext } from "./ResearchContext";
import type { AiStatus } from "./types";

export function Comparison({
  watch,
  notify,
  dataRevision,
}: {
  watch: Watch[];
  notify: (m: string) => void;
  dataRevision: number;
}) {
  const { t, fmt, pct, date, basis } = useI18n();
  const { comparisonSymbols, setComparisonSymbols } = useResearchContext();
  const [selected, setSelected] = useState<string[]>(
    comparisonSymbols.length
      ? comparisonSymbols
      : watch.slice(0, 2).map((w) => w.symbol),
  );
  useEffect(
    () => setComparisonSymbols(selected),
    [selected, setComparisonSymbols],
  );
  const [comparison, setComparison] = useState<{
    analyses: Analysis[];
    series: Array<{ time: string; [key: string]: string | number }>;
    start: string;
    end: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function compare(quiet = false) {
    setBusy(true);
    setError("");
    try {
      const data = await api<{
        analyses: Analysis[];
        series: Array<{ time: string; [key: string]: string | number }>;
        start: string;
        end: string;
      }>("/compare", "POST", { symbols: selected });
      setComparison(data);
      if (!quiet) notify(t("Comparison aligned on shared completed sessions."));
    } catch (e) {
      setError((e as Error).message);
      setComparison(null);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (comparison && selected.length >= 2) void compare(true);
  }, [dataRevision]);
  const analyses = comparison?.analyses || [];
  const series = comparison?.series || [];
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("RELATIVE TO YOUR WATCHLIST")}</span>
        <h1>{t("Compare with perspective.")}</h1>
        <p>
          {t(
            "Matching dates. The same starting point. Up to four research candidates.",
          )}
        </p>
      </div>
      <section className="card">
        <div className="comparison-picks">
          {watch.map((w) => (
            <label key={w.symbol}>
              <input
                type="checkbox"
                checked={selected.includes(w.symbol)}
                onChange={(e) => {
                  if (e.target.checked && selected.length >= 4) {
                    notify(t("Choose at most four instruments."));
                    return;
                  }
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, w.symbol]
                      : old.filter((s) => s !== w.symbol),
                  );
                }}
              />
              {w.symbol}
            </label>
          ))}
          <button
            className="primary"
            disabled={selected.length < 2 || busy}
            onClick={() => void compare()}
          >
            {t(busy ? "Aligning…" : "Compare selected")}
            <ArrowRight size={16} />
          </button>
        </div>
        {error && <div className="error">{t(error)}</div>}
        {analyses.length > 1 ? (
          <>
            <h3>{t("Normalized six-month returns")}</h3>
            <p className="muted">
              {t(
                "Each series starts at 0% on {start}. All values use shared completed sessions, through {end}.",
                {
                  start: date(comparison?.start || ""),
                  end: date(comparison?.end || ""),
                },
              )}{" "}
              {basis(analyses[0].provenance.price_basis)}.
            </p>
            <LineChart
              series={series}
              labels={analyses.map((a) => a.instrument.symbol)}
              percent
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Instrument")}</th>
                    <th>{t("Setup")}</th>
                    <th>{t("RSI 14")}</th>
                    <th>{t("ATR / price")}</th>
                    <th>{t("3M vs benchmark")}</th>
                    <th>{t("Data")}</th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.map((a) => (
                    <tr key={a.instrument.symbol}>
                      <td>
                        <strong>{a.instrument.symbol}</strong>
                      </td>
                      <td>{t(a.assessment.label)}</td>
                      <td>{fmt(a.metrics.rsi14, 1)}</td>
                      <td>{pct(a.metrics.atr_pct)}</td>
                      <td>
                        {a.relative.returns["3 months"]
                          ? t("{value} pp", {
                              value: fmt(
                                a.relative.returns["3 months"]!.excess,
                              ),
                            })
                          : t("Unavailable")}
                      </td>
                      <td>{date(a.provenance.last_completed_bar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              {t(
                "Watchlist ranking is a transparent heuristic, not a market-wide ranking or probability of profit. RSI is a momentum oscillator; return relative to a benchmark is a different measure.",
              )}
            </p>
          </>
        ) : (
          <div className="empty-state small-empty">
            <Activity size={27} />
            <h3>{t("Choose two or more stocks")}</h3>
            <p>
              {t(
                "Compare their path on the same dates, then inspect the evidence behind each setup.",
              )}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

export function ImportCSV({
  notify,
  onImport,
}: {
  notify: (m: string) => void;
  onImport: () => void;
}) {
  const { t, fmt, date } = useI18n();
  const [csv, setCsv] = useState("");
  const [form, setForm] = useState({
    symbol: "",
    name: "",
    exchange: "NYSE",
    currency: "USD",
    price_basis: "unknown",
  });
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(commit = false) {
    setBusy(true);
    setError("");
    try {
      const r = await api<Record<string, unknown>>(
        `/csv/${commit ? "import" : "preview"}`,
        "POST",
        { ...form, csv },
      );
      setPreview(r);
      if (commit) {
        notify(
          t(
            "CSV imported locally. The entire source series was replaced explicitly.",
          ),
        );
        onImport();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const quality = preview?.quality as
    { issues: string[]; actionable: boolean } | undefined;
  return (
    <section className="card">
      <div className="section-title">
        <Upload size={19} />
        <h3>{t("Bring your own daily history")}</h3>
      </div>
      <p className="muted">
        {t(
          "CSV columns: Date, Open, High, Low, Close, Volume. Use YYYY-MM-DD session dates and at most 10,000 rows. No candles will be filled.",
        )}
      </p>
      <div className="form-grid">
        <label>
          {t("Symbol")}
          <input
            aria-label={t("CSV symbol")}
            value={form.symbol}
            onChange={(e) => {
              setPreview(null);
              setForm({ ...form, symbol: e.target.value.toUpperCase() });
            }}
            placeholder={t("AAPL or DEMO_MYDATA")}
          />
        </label>
        <label>
          {t("Company / instrument name")}
          <input
            aria-label={t("CSV instrument name")}
            value={form.name}
            onChange={(e) => {
              setPreview(null);
              setForm({ ...form, name: e.target.value });
            }}
          />
        </label>
        <label>
          {t("US exchange")}
          <select
            value={form.exchange}
            onChange={(e) => {
              setPreview(null);
              setForm({ ...form, exchange: e.target.value });
            }}
          >
            {["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Currency")}
          <input value="USD" readOnly />
        </label>
        <label className="wide">
          {t("OHLC adjustment convention")}
          <select
            aria-label={t("Adjustment convention")}
            value={form.price_basis}
            onChange={(e) => {
              setPreview(null);
              setForm({ ...form, price_basis: e.target.value });
            }}
          >
            <option value="unknown">{t("Unknown — strategies blocked")}</option>
            <option value="split_dividend_adjusted">
              {t("All OHLC adjusted for splits and dividends")}
            </option>
            <option value="split_adjusted">
              {t("All OHLC split-adjusted — price returns only")}
            </option>
            <option value="unadjusted">
              {t("Unadjusted — strategies blocked")}
            </option>
          </select>
        </label>
        <label className="wide">
          {t("CSV file")}
          <input
            aria-label={t("CSV file")}
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 2000000) {
                  setError("CSV is limited to 2 MB.");
                  return;
                }
                setCsv(await file.text());
                setPreview(null);
              }
            }}
          />
        </label>
      </div>
      <p className="small muted">
        {t(
          "Do not combine adjusted close with unadjusted open/high/low. Identity and price basis are declared by you. Real symbols never receive synthetic fixtures.",
        )}
      </p>
      <div className="button-row">
        <button
          className="secondary"
          disabled={!csv || !form.symbol || !form.name || busy}
          onClick={() => run()}
        >
          {t("Validate & preview")}
        </button>
        <button
          className="primary"
          disabled={!preview || busy}
          onClick={() => run(true)}
        >
          {t("Import previewed data")}
        </button>
      </div>
      {error && <div className="error">{t(error)}</div>}
      {preview && (
        <div className="import-preview">
          <h4>
            {t("{count} rows · {start} → {end}", {
              count: fmt(Number(preview.rows), 0),
              start: date(String(preview.first_date)),
              end: date(String(preview.last_date)),
            })}
          </h4>
          <span className={`badge ${quality?.actionable ? "green" : "amber"}`}>
            {quality?.actionable
              ? t("Analysis available")
              : t("Inspection only / limited quality")}
          </span>
          {quality?.issues.map((x) => (
            <p className="small" key={x}>
              {t(x)}
            </p>
          ))}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {["Date", "Open", "High", "Low", "Close", "Volume"].map(
                    (x) => (
                      <th key={x}>{t(x)}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {(preview.preview as Record<string, unknown>[]).map((r, i) => (
                  <tr key={i}>
                    {Object.entries(r).map(([key, v], n) => (
                      <td key={n}>
                        {typeof v === "number"
                          ? fmt(v, key === "Volume" ? 0 : 2)
                          : key === "Date"
                            ? date(String(v))
                            : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export function Configuration({
  settings,
  onSettings,
  notify,
  onImport,
  onRestartGuide,
}: {
  settings: Settings;
  onSettings: (s: Settings) => Promise<void>;
  notify: (m: string) => void;
  onImport: () => void;
  onRestartGuide: () => Promise<void>;
}) {
  const { t, fmt, date } = useI18n();
  const [benchmark, setBenchmark] = useState(settings.benchmark);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const ai = status?.ai_status as AiStatus | undefined;
  const [error, setError] = useState("");
  useEffect(() => {
    api<Record<string, unknown>>("/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  async function save() {
    try {
      await onSettings({ ...settings, benchmark: benchmark.toUpperCase() });
      notify(
        t(
          "Benchmark setting saved. It is validated when its history is loaded.",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("LOCAL BY DESIGN")}</span>
        <h1>{t("Your workspace.")}</h1>
        <p>
          {t(
            "Data sources, analysis defaults, and the health of your local service.",
          )}
        </p>
      </div>
      <section className="card preference-card">
        <h3>{t("Your learning preferences")}</h3>
        <div className="form-grid">
          <label>
            {t("Experience")}
            <select
              aria-label={t("Experience")}
              value={settings.experience}
              onChange={(e) =>
                void onSettings({
                  ...settings,
                  experience: e.target.value as Settings["experience"],
                }).catch((e) => setError(e.message))
              }
            >
              <option value="beginner">{t("Beginner")}</option>
              <option value="advanced">{t("Advanced")}</option>
            </select>
          </label>
          <label>
            {t("Preferred workspace")}
            <select
              aria-label={t("Preferred workspace")}
              value={settings.preferred_workspace}
              onChange={(e) =>
                void onSettings({
                  ...settings,
                  preferred_workspace: e.target
                    .value as Settings["preferred_workspace"],
                }).catch((e) => setError(e.message))
              }
            >
              <option value="research">{t("Stock research")}</option>
              <option value="long_term">{t("Long-term planning")}</option>
            </select>
          </label>
        </div>
        <p className="small muted">
          {t(
            "Your preferred workspace opens on the next visit. Technical research horizons remain separate.",
          )}
        </p>
        <button
          className="secondary"
          onClick={() =>
            void onRestartGuide().catch((e) => setError(e.message))
          }
        >
          {t("Restart beginner guide")}
        </button>
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
      </section>
      <section className="card ai-setup">
        <div className="section-title">
          <Activity size={19} />
          <h3>{t("Optional AI summaries")}</h3>
        </div>
        <p>
          {t("Model")}: <b>{ai?.model || "gpt-6.1-sol"}</b> ·{" "}
          {t(ai?.enabled ? "Enabled" : "Disabled")}
        </p>
        <p className="muted">
          {t(
            "Set OPENAI_API_KEY and STOCK_COMPASS_AI_ENABLED=1 in the backend .env file, then restart the local app. Offline mode disables AI requests.",
          )}
        </p>
        <p className="small muted">
          {t(
            "Sends this ticker's market data and research context to OpenAI. API usage is billed to your account.",
          )}
        </p>
      </section>
      <div className="research-grid">
        <div>
          <section className="card">
            <h3>{t("Research defaults")}</h3>
            <label>
              {t("Live market benchmark")}
              <input
                aria-label={t("Benchmark symbol")}
                value={benchmark}
                onChange={(e) => setBenchmark(e.target.value)}
                placeholder="SPY"
              />
            </label>
            <p className="muted">
              {t(
                "Default: SPY. Choose another US-listed USD stock or ETF. Demo uses DEMO_MARKET and stays separate.",
              )}
            </p>
            <button className="primary" onClick={save}>
              {t("Save benchmark")}
            </button>
            <div className="learning-box">
              <h4>{t("What each horizon supports")}</h4>
              <p>
                <b>{t("1–2 weeks:")} </b>
                {t(
                  "Shorter monitoring of the same completed daily signals; no separate short holding-period strategy is validated.",
                )}
              </p>
              <p>
                <b>{t("2–8 weeks:")} </b>
                {t(
                  "completed daily signals, 20/55-session structure, RSI/MACD, ATR risk and completed weekly context.",
                )}
              </p>
              <p>
                <b>{t("1–6 months:")} </b>
                {t(
                  "the same daily templates with SMA 200 and bullish completed 20-week context required for an action label. Use 3/6-month benchmark returns. No monthly or intraday execution model is implemented.",
                )}
              </p>
              <p>
                <b>{t("6–12 months:")} </b>
                {t(
                  "The same daily templates require broad trend and bullish completed 20-week context. This is technical research, not a validated long-term holding strategy or forecast.",
                )}
              </p>
            </div>
          </section>
          <ImportCSV notify={notify} onImport={onImport} />
        </div>
        <section className="card status-card">
          <div className="section-title">
            <CheckCircle2 size={19} />
            <h3>{t("System status")}</h3>
          </div>
          {error && <div className="error">{t(error)}</div>}
          {status ? (
            <>
              <dl>
                <dt>{t("Backend")}</dt>
                <dd className="positive">{t(String(status.backend))}</dd>
                <dt>{t("Indicator engine")}</dt>
                <dd>{String(status.engine)}</dd>
                <dt>{t("Rule version")}</dt>
                <dd>{String(status.rule_version)}</dd>
                <dt>{t("Cache entries")}</dt>
                <dd>{fmt(Number(status.cache_entries), 0)}</dd>
                <dt>{t("Expected published session")}</dt>
                <dd>{date(String(status.expected_session))}</dd>
                <dt>{t("Publication allowance")}</dt>
                <dd>
                  {t("{count} minutes", {
                    count: fmt(Number(status.publication_allowance_minutes), 0),
                  })}
                </dd>
                <dt>{t("Network disabled")}</dt>
                <dd>{t(status.offline ? "Yes" : "No")}</dd>
                <dt>{t("Provider")}</dt>
                <dd>
                  {t(
                    String((status.provider as Record<string, unknown>).status),
                  )}
                  <small>
                    {t(
                      String(
                        (status.provider as Record<string, unknown>).reason ||
                          "",
                      ),
                    )}
                  </small>
                </dd>
                <dt>{t("Explanations")}</dt>
                <dd>{t(String(status.ai))}</dd>
                <dt>{t("SQLite")}</dt>
                <dd className="path">{String(status.database)}</dd>
              </dl>
              <details>
                <summary>{t("Provider capability contracts")}</summary>
                <pre>
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(
                        status.capabilities as Record<
                          string,
                          Record<string, unknown>
                        >,
                      ).map(([provider, capabilities]) => [
                        t(provider),
                        Object.fromEntries(
                          Object.entries(capabilities).map(
                            ([capability, value]) => [
                              t(capability),
                              typeof value === "boolean"
                                ? t(value ? "Yes" : "No")
                                : t(String(value)),
                            ],
                          ),
                        ),
                      ]),
                    ),
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          ) : (
            <p>{t("Checking local services…")}</p>
          )}
          <p className="small muted">
            {t(
              "Core research works locally without a login or API key. Live market data and optional AI need internet; cached data show their original retrieval timestamp.",
            )}
          </p>
        </section>
      </div>
    </>
  );
}
