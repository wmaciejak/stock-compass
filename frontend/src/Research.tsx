import EarningsStatus from "./EarningsStatus";
import { useState, useEffect, useRef } from "react";
import {
  Calculator,
  Save,
  BookOpen,
  Download,
  ArrowUpRight,
} from "lucide-react";
import type { Analysis, Idea, Backtest, Settings, Metrics } from "./types";
import { api } from "./api";
import { useI18n } from "./i18n";
import { LineChart } from "./Charts";
import { useResearchContext } from "./ResearchContext";
import type { SizingInput } from "./types";

export function Sizing({
  a,
  notify,
}: {
  a: Analysis;
  notify: (message: string) => void;
}) {
  const { t, fmt } = useI18n();
  const { getDraft, updateDraft } = useResearchContext();
  const symbol = a.instrument.symbol;
  const draft = getDraft(symbol);
  const [result, setResult] = useState<Record<string, number | string> | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (draft.sizingInput)
      api<Record<string, number | string>>("/sizing", "POST", draft.sizingInput)
        .then((value) => {
          if (!cancelled) setResult(value);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    try {
      const inputs: SizingInput = {
        account: Number(f.get("account")),
        account_currency: String(f.get("account_currency")),
        entry: Number(f.get("entry")),
        stop: Number(f.get("stop")),
        risk_percent: Number(f.get("risk")),
        instrument_currency: a.instrument.currency,
        conversion_rate: f.get("rate") ? Number(f.get("rate")) : null,
        conversion_date: f.get("date") ? String(f.get("date")) : null,
      };
      const r = await api<Record<string, number | string>>(
        "/sizing",
        "POST",
        inputs,
      );
      updateDraft(symbol, { sizingInput: inputs });
      setResult(r);
      notify(t("Position arithmetic calculated from your inputs."));
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    }
  }
  return (
    <section className="card">
      <div className="section-title">
        <Calculator size={19} />
        <h3>{t("Position-size calculator")}</h3>
      </div>
      <p className="muted">
        {t(
          "Choose every input yourself. This tool calculates whole shares; it does not choose a risk budget.",
        )}
      </p>
      <form
        onSubmit={submit}
        className="form-grid"
        onChange={(e) =>
          updateDraft(symbol, {
            sizingForm: Object.fromEntries(
              Array.from(new FormData(e.currentTarget).entries()).map(
                ([k, v]) => [k, String(v)],
              ),
            ),
          })
        }
      >
        <label>
          {t("Available account cash")}
          <input
            name="account"
            defaultValue={draft.sizingForm?.account}
            type="number"
            min="1"
            step="any"
            required
            placeholder={t("Enter your amount")}
          />
        </label>
        <label>
          {t("Account currency")}
          <select
            name="account_currency"
            defaultValue={draft.sizingForm?.account_currency || "USD"}
          >
            <option>USD</option>
            <option>PLN</option>
            <option>EUR</option>
            <option>GBP</option>
          </select>
        </label>
        <label>
          {t("Entry ({currency})", { currency: a.instrument.currency })}
          <input
            name="entry"
            type="number"
            min="0.01"
            step="any"
            required
            defaultValue={
              draft.sizingForm?.entry ?? a.assessment.scenario?.entry.toFixed(2)
            }
            placeholder={t("Your conditional entry")}
          />
        </label>
        <label>
          {t("Invalidation ({currency})", { currency: a.instrument.currency })}
          <input
            name="stop"
            type="number"
            min="0.01"
            step="any"
            required
            defaultValue={
              draft.sizingForm?.stop ?? a.assessment.scenario?.stop.toFixed(2)
            }
            placeholder={t("Your invalidation price")}
          />
        </label>
        <label>
          {t("Chosen risk budget (%)")}
          <input
            name="risk"
            defaultValue={draft.sizingForm?.risk}
            type="number"
            min="0.001"
            max="100"
            step="any"
            required
            placeholder={t("Enter your own %")}
          />
        </label>
        <label>
          {t("FX: {currency} per account unit", {
            currency: a.instrument.currency,
          })}
          <input
            name="rate"
            defaultValue={draft.sizingForm?.rate}
            type="number"
            min="0.00001"
            step="any"
            placeholder={t("Only if currencies differ")}
          />
        </label>
        <label>
          {t("FX rate date")}
          <input
            name="date"
            type="date"
            defaultValue={draft.sizingForm?.date}
          />
        </label>
        <div className="form-action">
          <button className="primary" type="submit">
            {t("Calculate shares")}
          </button>
        </div>
      </form>
      {error && <div className="error">{t(error)}</div>}
      {result && (
        <div className="sizing-result">
          <strong>
            {t("{shares} whole shares", {
              shares: fmt(Number(result.shares), 0),
            })}
          </strong>
          <div className="mini-stats">
            <span>
              {t("Exposure")}{" "}
              <b>
                {fmt(result.exposure as number)} {result.currency}
              </b>
            </span>
            <span>
              {t("Planned loss")}{" "}
              <b>
                {fmt(result.planned_loss as number)} {result.currency}
              </b>
            </span>
            <span>
              {t("Cash remaining")}{" "}
              <b>
                {fmt(result.remaining_cash as number)} {result.currency}
              </b>
            </span>
          </div>
          <p>{t(String(result.formula))}</p>
        </div>
      )}
      <p className="small muted">
        {t(
          "A stop is a planned execution condition. Opening gaps, commission and spread can exceed the calculated loss. No leverage or order execution.",
        )}
      </p>
    </section>
  );
}

export function Research({
  a,
  notify,
}: {
  a: Analysis;
  notify: (message: string) => void;
}) {
  const { t, language } = useI18n();
  const { getDraft, updateDraft } = useResearchContext();
  const symbol = a.instrument.symbol;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const [note, setNote] = useState(getDraft(symbol).noteDraft ?? "");
  const [thesis, setThesis] = useState(getDraft(symbol).thesisDraft ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setThesis(getDraft(symbol).thesisDraft ?? "");
    setNote(getDraft(symbol).noteDraft ?? "");
    if (getDraft(symbol).noteDraft !== undefined) return;
    api<{ text: string }>(`/notes/${a.instrument.symbol}`)
      .then((n) => {
        if (!cancelled && getDraft(symbol).noteDraft === undefined)
          setNote(n.text);
      })
      .catch((e) => {
        if (!cancelled) notify(t(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [a.instrument.symbol]);
  async function save(idea = false) {
    setSaving(true);
    try {
      if (idea) {
        const snap = await api<{ id: number }>(
          `/snapshots/${a.instrument.symbol}`,
          "POST",
        );
        await api("/journal", "POST", {
          symbol: a.instrument.symbol,
          thesis,
          analysis_id: snap.id,
        });
        updateDraft(symbol, { thesisDraft: "" });
        if (symbolRef.current === symbol) setThesis("");
        notify(
          t("Research idea and its analysis snapshot saved to your journal."),
        );
      } else {
        await api(`/notes/${a.instrument.symbol}`, "PUT", { text: note });
        notify(t("Notes saved locally."));
      }
    } catch (e) {
      notify(t((e as Error).message));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="research-grid">
      <div>
        <section className="card">
          <div className="section-title">
            <BookOpen size={19} />
            <h3>{t("Your research notes")}</h3>
          </div>
          <p className="muted">
            {t(
              "Capture what you understand, what you need to verify, and the condition you are waiting for.",
            )}
          </p>
          <textarea
            aria-label={t("Research notes")}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              updateDraft(symbol, { noteDraft: e.target.value });
            }}
            rows={6}
            placeholder={t("What would make you reconsider this idea?")}
          />
          <button
            className="secondary"
            onClick={() => save()}
            disabled={saving}
          >
            <Save size={16} />
            {t("Save notes")}
          </button>
        </section>
        <section className="card">
          <h3>{t("Save a research idea")}</h3>
          <p className="muted">
            {t(
              "The current facts and rule version are saved with your thesis. Record what happened later in the journal.",
            )}
          </p>
          <textarea
            aria-label={t("Research thesis")}
            value={thesis}
            onChange={(e) => {
              setThesis(e.target.value);
              updateDraft(symbol, { thesisDraft: e.target.value });
            }}
            rows={4}
            placeholder={t(
              "My thesis, confirmation condition and invalidation…",
            )}
          />
          <button
            className="primary"
            disabled={!thesis.trim() || saving}
            onClick={() => save(true)}
          >
            {t("Save idea & snapshot")}
          </button>
        </section>
        <section className="card">
          <h3>{t("Take your research with you")}</h3>
          <p className="muted">
            {t(
              "Exports include timestamps, sources, data quality, rule version and limitations. Demo exports stay labeled synthetic.",
            )}
          </p>
          <div className="button-row">
            <a
              className="secondary button"
              href={`/api/export/${a.instrument.symbol}?language=${language}`}
              download
            >
              <Download size={16} />
              {t("Markdown report")}
            </a>
            <a
              className="secondary button"
              href={`/api/export/${a.instrument.symbol}?format=csv&language=${language}`}
              download
            >
              <Download size={16} />
              {t("Data & metrics CSV")}
            </a>
          </div>
        </section>
      </div>
      <Sizing key={symbol} a={a} notify={notify} />
    </div>
  );
}

const rows: Array<[keyof Metrics, string, boolean]> = [
  ["total_return", "Total return", true],
  ["cagr", "CAGR (≥1 year)", true],
  ["max_drawdown", "Maximum drawdown", true],
  ["trades", "Closed trades", false],
  ["win_rate", "Win rate", true],
  ["expectancy", "Expectancy (USD / trade)", false],
  ["profit_factor", "Profit factor", false],
  ["exposure", "Time exposed", true],
  ["open_positions", "Open positions", false],
];

export function Historical({
  a,
  settings,
  onSettings,
  notify,
}: {
  a: Analysis;
  settings: Settings;
  onSettings: (s: Settings) => Promise<void>;
  notify: (m: string) => void;
}) {
  const { t, fmt, pct, date } = useI18n();
  const [results, setResults] = useState<Record<string, Backtest>>({});
  const [selected, setSelected] = useState("crossover");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [commission, setCommission] = useState(settings.commission * 100);
  const [spread, setSpread] = useState(settings.spread * 100);
  useEffect(() => {
    setResults({});
    api<Record<string, Backtest>>(`/backtest/${a.instrument.symbol}`)
      .then(setResults)
      .catch((e) => notify(t(e.message)));
  }, [a.instrument.symbol, a.provenance.retrieved_at]);
  async function run() {
    setBusy(true);
    setError("");
    try {
      if (commission < 0 || commission > 5 || spread < 0 || spread > 5)
        throw new Error("Cost assumptions must be between 0% and 5%.");
      await onSettings({
        ...settings,
        commission: commission / 100,
        spread: spread / 100,
      });
      const r = await api<Backtest>(
        `/backtest/${a.instrument.symbol}`,
        "POST",
        {
          strategy: selected,
          commission: commission / 100,
          spread: spread / 100,
          cash: 10000,
        },
      );
      setResults((old) => ({ ...old, [selected]: r }));
      notify(
        t("Backtest completed using frozen rules and next-session execution."),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const r = results[selected];
  return (
    <>
      <section className="card">
        <div className="section-title">
          <h3>{t("Rules first. Results second.")}</h3>
          <span className="eyebrow">{t("LONG ONLY · NO OPTIMIZATION")}</span>
        </div>
        <div className="strategy-choice">
          <button
            className={
              selected === "crossover" ? "strategy chosen" : "strategy"
            }
            onClick={() => setSelected("crossover")}
          >
            <strong>{t("20 / 50 SMA crossover")}</strong>
            <span>
              {t(
                "Enter after SMA 20 crosses above SMA 50; exit after it crosses below. No protective stop in this template.",
              )}
            </span>
          </button>
          <button
            className={selected === "breakout" ? "strategy chosen" : "strategy"}
            onClick={() => setSelected("breakout")}
          >
            <strong>{t("20-session breakout")}</strong>
            <span>
              {t(
                "Close above the prior high; close > SMA 50 > SMA 200; SMA 50 rising; volume ≥1.2×. Trail at close − 3 ATR, never lowered.",
              )}
            </span>
          </button>
        </div>
        <p className="muted">
          {t(
            "Signals form on completed daily bars and execute at the next session’s open. Both templates and buy-and-hold allocate 95% of cash to whole shares, with no leverage. Research capital: $10,000. These are fixed daily strategies, not separate tests of each selected research horizon or holding period.",
          )}
        </p>
        <div className="cost-row">
          <label>
            {t("Commission each side (%)")}
            <input
              aria-label={t("Commission percent")}
              type="number"
              min="0"
              max="5"
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
            />
          </label>
          <label>
            {t("Round-trip spread approximation (%)")}
            <input
              aria-label={t("Spread percent")}
              type="number"
              min="0"
              max="5"
              step="0.01"
              value={spread}
              onChange={(e) => setSpread(Number(e.target.value))}
            />
          </label>
          <button
            className="primary"
            onClick={run}
            disabled={busy || !a.assessment.data_quality.actionable}
          >
            {t(busy ? "Simulating…" : "Run backtest")}
          </button>
        </div>
        <p className="small muted">
          {t(
            "Costs are editable assumptions. Spread is charged as an entry-price uplift approximating round-trip spread/slippage; no unsupported slippage parameter. Open positions stay marked at the final close.",
          )}
        </p>
        {!a.assessment.data_quality.actionable && (
          <div className="notice">
            {t(
              "Backtests blocked by data quality. Refresh or clarify the adjustment basis first.",
            )}
          </div>
        )}
        {error && <div className="error">{t(error)}</div>}
      </section>
      {r ? (
        <>
          <section className="card">
            <div className="section-title">
              <h3>{t("Historical evidence")}</h3>
              <span className="small muted">
                {date(r.dates.start)} → {date(r.dates.end)} ·{" "}
                {t("{count} sessions", { count: fmt(r.dates.sessions, 0) })}
              </span>
            </div>
            <div className="notice">
              {t(r.conclusion)} <strong>{t(r.evidence)}</strong>
            </div>
            <div className="backtest-grid">
              <div>
                <LineChart series={r.equity} />
                <p className="small muted">
                  {t(
                    "Equity in adjusted research USD; identical dates, costs and 95% allocation. Open positions are included in equity, excluded from closed-trade win rate and expectancy.",
                  )}
                </p>
              </div>
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>{t("Measure")}</th>
                    <th>{t("Strategy")}</th>
                    <th>{t("Buy & hold")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([key, label, isPct]) => (
                    <tr key={key}>
                      <td>
                        <abbr
                          title={
                            key === "max_drawdown"
                              ? t(a.terms.drawdown)
                              : key === "expectancy"
                                ? t(a.terms.expectancy)
                                : t(label)
                          }
                        >
                          {t(label)}
                        </abbr>
                      </td>
                      <td>
                        {r.metrics[key] == null
                          ? t("Undefined")
                          : isPct
                            ? pct(r.metrics[key])
                            : fmt(
                                r.metrics[key],
                                key === "trades" || key === "open_positions"
                                  ? 0
                                  : 2,
                              )}
                      </td>
                      <td>
                        {r.baseline_metrics[key] == null
                          ? t("Undefined")
                          : isPct
                            ? pct(r.baseline_metrics[key])
                            : fmt(
                                r.baseline_metrics[key],
                                key === "trades" || key === "open_positions"
                                  ? 0
                                  : 2,
                              )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <h3>{t("Does the evidence persist through time?")}</h3>
            <p className="muted">
              {t(
                "The first 80% is divided chronologically. The recent 20% is a separately identified holdout with frozen rules. These are portions of a continuing portfolio, including positions opened earlier; this is not an independent test portfolio.",
              )}
            </p>
            <div className="period-grid">
              {[...r.periods, r.holdout].map((p, n) => (
                <div
                  key={p.name}
                  className={n === 3 ? "period holdout" : "period"}
                >
                  <span className="eyebrow">
                    {n === 3
                      ? t("RECENT HOLDOUT")
                      : t("PERIOD {number}", { number: n + 1 })}
                  </span>
                  <strong>{pct(p.strategy_return)}</strong>
                  <span>
                    {t("Buy & hold")} {pct(p.baseline_return)}
                  </span>
                  <small>
                    {date(p.start)} – {date(p.end)}
                    <br />
                    {t("{count} sessions", { count: fmt(p.sessions, 0) })}
                  </small>
                </div>
              ))}
            </div>
            <details>
              <summary>{t("What drawdown and trade statistics mean")}</summary>
              <p>
                <b>{t("Drawdown:")} </b>
                {t(a.terms.drawdown)}
              </p>
              <p>
                <b>{t("Expectancy:")} </b>
                {t(a.terms.expectancy)}
              </p>
              <p>
                <b>{t("Holdout:")} </b>
                {t(a.terms.holdout)}
              </p>
              <p>
                {t(
                  "Win rate is the fraction of closed trades with net gains in this sample. Profit factor compares net winning P/L with absolute net losing P/L. Neither is a probability for the next trade.",
                )}
              </p>
              <a
                href="https://kernc.github.io/backtesting.py/doc/backtesting/"
                target="_blank"
                rel="noreferrer"
              >
                {t("Backtesting.py documentation")}
              </a>
            </details>
            <details>
              <summary>
                {t("Execution, stops, gaps & corporate actions")}
              </summary>
              {Object.entries(r.assumptions).map(([k, v]) => (
                <p key={k}>
                  <strong>{t(k)}: </strong>
                  {typeof v === "number" ? fmt(v, k === "cash" ? 0 : 4) : t(v)}
                </p>
              ))}
              <p>
                {t(
                  "There are no take-profit orders in these two strategies. Research scenario targets are structure references, not simulated exits. Sharpe is omitted to avoid unsupported frequency/risk-free-rate interpretations.",
                )}
              </p>
            </details>
            <details>
              <summary>
                {t("Closed trades ({count})", {
                  count: fmt(r.trades.length, 0),
                })}
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Entry")}</th>
                      <th>{t("Exit")}</th>
                      <th>{t("Shares")}</th>
                      <th>{t("Entry price")}</th>
                      <th>{t("Exit price")}</th>
                      <th>{t("Net P/L")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.trades.map((trade, n) => (
                      <tr key={n}>
                        <td>{date(trade.entry_date)}</td>
                        <td>{date(trade.exit_date)}</td>
                        <td>{fmt(trade.shares, 0)}</td>
                        <td>{fmt(trade.entry)}</td>
                        <td>{fmt(trade.exit)}</td>
                        <td>{fmt(trade.net_pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!r.trades.length && (
                  <p>
                    {t(
                      "No closed trades. Win rate, expectancy and profit factor are undefined.",
                    )}
                  </p>
                )}
              </div>
            </details>
          </section>
        </>
      ) : (
        <div className="empty-state">
          <BookOpen size={28} />
          <h3>{t("Evidence before conviction")}</h3>
          <p>
            {t(
              "Run a fixed strategy to see how its rules performed after your cost assumptions. A heuristic setup assessment is not a validated strategy.",
            )}
          </p>
        </div>
      )}
    </>
  );
}

export function Journal({ notify }: { notify: (m: string) => void }) {
  const { t, date } = useI18n();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Idea[]>("/journal")
      .then(setIdeas)
      .catch((e) => setError(e.message));
  }, []);
  async function save(idea: Idea) {
    try {
      await api(`/journal/${idea.id}`, "PUT", idea);
      notify(t("Outcome saved locally."));
    } catch (e) {
      notify(t((e as Error).message));
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("YOUR RESEARCH, OVER TIME")}</span>
        <h1>{t("Research journal")}</h1>
        <p>
          {t("Keep a record of the reasoning, then learn from the outcome.")}
        </p>
      </div>
      {error && <div className="error">{t(error)}</div>}
      {!ideas.length && (
        <div className="empty-state">
          <BookOpen size={32} />
          <h3>{t("Your first idea starts with a condition.")}</h3>
          <p>
            {t(
              "Open a stock’s Research tab, write a thesis, and save it with a snapshot. You can record the outcome here later.",
            )}
          </p>
        </div>
      )}
      {ideas.map((idea) => (
        <section className="card" key={idea.id}>
          <div className="section-title">
            <h3>
              {idea.symbol}
              {idea.symbol.startsWith("DEMO_") && (
                <span className="badge amber">{t("Synthetic")}</span>
              )}
            </h3>
            <span className="small muted">
              {t("Saved {saved} · Snapshot #{snapshot}", {
                saved: date(idea.created_at),
                snapshot: idea.analysis_id ?? t("none"),
              })}
            </span>
          </div>
          <p className="journal-thesis">{idea.thesis}</p>
          <label>
            {t("What happened? What did you learn?")}
            <textarea
              aria-label={t("Outcome for {symbol}", { symbol: idea.symbol })}
              rows={3}
              value={idea.outcome}
              onChange={(e) =>
                setIdeas((old) =>
                  old.map((v) =>
                    v.id === idea.id ? { ...v, outcome: e.target.value } : v,
                  ),
                )
              }
              placeholder={t("Record confirmation, invalidation, or a lesson…")}
            />
          </label>
          <button className="secondary" onClick={() => save(idea)}>
            {t("Save outcome")}
          </button>
        </section>
      ))}
    </>
  );
}

export function Context({
  a,
  notify,
}: {
  a: Analysis;
  notify: (m: string) => void;
}) {
  const { t, fmt, date } = useI18n();
  const [context, setContext] = useState(a.context);
  const [busy, setBusy] = useState(false);
  useEffect(() => setContext(a.context), [a]);
  async function load() {
    setBusy(true);
    try {
      setContext(await api(`/context/${a.instrument.symbol}`, "POST"));
    } catch (e) {
      notify(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const fundamentals = context.fundamentals;
  return (
    <section className="card">
      <div className="section-title">
        <h3>{t("Company & event context")}</h3>
        <button
          className="text-button"
          disabled={busy || a.instrument.synthetic}
          onClick={load}
        >
          {t(busy ? "Loading…" : "Load sourced news")}
          <ArrowUpRight size={15} />
        </button>
      </div>
      <p className="muted">
        {t(
          "Provider facts are separate from the locally computed technical assessment. An unknown earnings date means unknown risk.",
        )}
      </p>
      <div className="notice">
        <EarningsStatus row={a.earnings} />
      </div>
      {fundamentals?.status === "available" && fundamentals.data ? (
        <div className="fundamental-grid">
          {Object.entries(fundamentals.data).map(([k, v]) => (
            <div key={k}>
              <span>{t(k.replace(/([A-Z])/g, " $1"))}</span>
              <b>
                {v == null
                  ? t("Unavailable")
                  : typeof v === "number"
                    ? fmt(v, 2)
                    : t(String(v))}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          {t(fundamentals?.reason || "Company context unavailable.")}
        </p>
      )}
      <p className="small muted">
        {t(
          "Source: {source} · Context retrieved {retrieved}. Provider valuation/growth definitions and reporting periods may differ.",
          {
            source: t(a.provenance.source),
            retrieved: fundamentals?.retrieved_at
              ? date(fundamentals.retrieved_at, true)
              : t("unavailable"),
          },
        )}
      </p>
      {context.news?.status === "available" &&
      Array.isArray(context.news.data) ? (
        <ul className="news-list">
          {context.news.data.map((n, i) => (
            <li key={i}>
              <a href={String(n.url)} target="_blank" rel="noreferrer">
                {String(n.title)} <ArrowUpRight size={13} />
              </a>
              <small>
                {String(n.publisher)} ·{" "}
                {t("Published {published}", {
                  published: n.published_at
                    ? date(String(n.published_at), true)
                    : t("date unknown"),
                })}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">
          {t(context.news?.reason || "News unavailable.")}
        </p>
      )}
      <p className="small muted">
        {t(
          "News and opinions do not change the numerical rules. No external analyst targets or ratings are used.",
        )}
      </p>
    </section>
  );
}
