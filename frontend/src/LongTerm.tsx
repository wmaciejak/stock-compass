import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import type { PlanningInput, PlanningResult } from "./types";

type Draft = Record<keyof PlanningInput, string>;
const blank: Draft = {
  goal_name: "",
  target_amount: "",
  initial_amount: "0",
  monthly_contribution: "",
  years: "10",
  currency: "USD",
  annual_return: "0",
  annual_fee: "0",
};
const example: Draft = {
  goal_name: "",
  target_amount: "",
  initial_amount: "1000",
  monthly_contribution: "100",
  years: "10",
  currency: "USD",
  annual_return: "5",
  annual_fee: "0.2",
};
const labels: Record<keyof PlanningInput, string> = {
  goal_name: "Goal name (optional)",
  target_amount: "Target amount (optional)",
  initial_amount: "Starting amount",
  monthly_contribution: "Monthly contribution",
  years: "Years",
  currency: "Display currency",
  annual_return: "Assumed annual return (%)",
  annual_fee: "Annual ongoing fee (%)",
};
const limits: Partial<Record<keyof PlanningInput, [number, number]>> = {
  initial_amount: [0, 1e9],
  monthly_contribution: [0, 1e7],
  years: [1, 50],
  annual_return: [-50, 50],
  annual_fee: [0, 10],
  target_amount: [0, 1e12],
};
const assumptions =
  "Hypothetical constant effective annual returns and proportional ongoing fees; contributions at month end. Fee impact includes foregone growth. Excludes taxes, inflation, transaction costs, FX movements and changing market prices. Currency is a display unit, with no conversion.";
function toDraft(p: PlanningInput): Draft {
  return Object.fromEntries(
    Object.entries(p).map(([k, v]) => [k, v == null ? "" : String(v)]),
  ) as Draft;
}
const lessons = [
  [
    "What an ETF owns",
    "An ETF pools investors’ money in a portfolio of assets. A share gives exposure to that portfolio; inspect the actual holdings.",
  ],
  [
    "Broad and narrow diversification",
    "A broad fund can spread exposure across many companies. A sector or single-country fund is narrower; many holdings can still share the same risks.",
  ],
  [
    "Index tracking",
    "An index ETF aims to track a stated index. Its return can differ because of fees, trading and tracking differences.",
  ],
  [
    "Ongoing fees",
    "A small annual percentage can compound into a substantial difference over many years. Compare costs alongside what the fund owns.",
  ],
  [
    "Distributions and reinvestment",
    "Funds may distribute income or reinvest it. Reinvestment changes compounding; taxes and fund rules also matter.",
  ],
  [
    "Currency exposure",
    "A fund’s trading currency does not describe all its underlying currency exposure. Exchange-rate changes can affect your return.",
  ],
];
export default function LongTerm({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const { t, fmt } = useI18n();
  const [draft, setDraft] = useState<Draft>(blank),
    [saved, setSaved] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<PlanningResult | null>(null),
    [calculated, setCalculated] = useState(""),
    [errors, setErrors] = useState<
      Partial<Record<keyof PlanningInput, string>>
    >({});
  const [error, setError] = useState(""),
    [calculating, setCalculating] = useState(false),
    [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const draftRevision = useRef(0),
    alive = useRef(true),
    calcSerial = useRef(0),
    saveSerial = useRef(0);
  const fingerprint = JSON.stringify(draft);
  useEffect(() => {
    alive.current = true;
    const revision = draftRevision.current;
    api<PlanningInput | null>("/planning/plan")
      .then((p) => {
        if (!alive.current) return;
        if (p) {
          const d = toDraft(p);
          setSaved(JSON.stringify(d));
          if (draftRevision.current === revision) setDraft(d);
        }
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      })
      .finally(() => {
        if (alive.current) setLoaded(true);
      });
    return () => {
      alive.current = false;
    };
  }, []);
  function edit(key: keyof PlanningInput, value: string) {
    draftRevision.current++;
    setTouched(true);
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setError("");
  }
  function validate(): PlanningInput | null {
    const e: Partial<Record<keyof PlanningInput, string>> = {};
    const numbers: Record<string, number> = {};
    for (const [key, bounds] of Object.entries(limits)) {
      const k = key as keyof PlanningInput,
        text = draft[k].trim(),
        n = Number(text);
      if (k === "target_amount" && !text) continue;
      numbers[k] = n;
      if (
        !text ||
        !Number.isFinite(n) ||
        n < bounds![0] ||
        n > bounds![1] ||
        (k === "target_amount" && n <= 0)
      )
        e[k] = "Enter a finite number within the displayed limits.";
    }
    if (!e.years && !Number.isInteger(numbers.years))
      e.years = "Enter whole years from 1 to 50.";
    if (numbers.initial_amount === 0 && numbers.monthly_contribution === 0)
      e.monthly_contribution =
        "Starting amount or monthly contribution must be positive.";
    if (draft.goal_name.length > 100)
      e.goal_name = "Use at most 100 characters.";
    setErrors(e);
    if (Object.keys(e).length) return null;
    return {
      goal_name: draft.goal_name,
      target_amount: draft.target_amount.trim() ? numbers.target_amount : null,
      initial_amount: numbers.initial_amount,
      monthly_contribution: numbers.monthly_contribution,
      years: numbers.years,
      currency: draft.currency as PlanningInput["currency"],
      annual_return: numbers.annual_return,
      annual_fee: numbers.annual_fee,
    };
  }
  async function calculate() {
    const input = validate();
    if (!input) return;
    const captured = fingerprint,
      id = ++calcSerial.current;
    setCalculating(true);
    setError("");
    try {
      const r = await api<PlanningResult>("/planning/scenario", "POST", input);
      if (alive.current && id === calcSerial.current) {
        setResult(r);
        setCalculated(captured);
      }
    } catch (e) {
      if (alive.current && id === calcSerial.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && id === calcSerial.current) setCalculating(false);
    }
  }
  async function save() {
    const input = validate();
    if (!input) return;
    const captured = fingerprint,
      id = ++saveSerial.current;
    setSaving(true);
    setError("");
    try {
      await api<PlanningInput>("/planning/plan", "PUT", input);
      if (alive.current && id === saveSerial.current) {
        setSaved(captured);
        notify("Plan saved locally.");
      }
    } catch (e) {
      if (alive.current && id === saveSerial.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && id === saveSerial.current) setSaving(false);
    }
  }
  const amount = (value: number) =>
    `${fmt(value)} ${result?.inputs.currency || draft.currency}`;
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("REGULAR SAVING, OVER YEARS")}</span>
        <h1>{t("Long-term planning")}</h1>
        <p>
          {t(
            "Explore your own savings assumptions. This hypothetical scenario is separate from technical research horizons.",
          )}
        </p>
      </div>
      <div className="planning-grid">
        <section className="card">
          <h2>{t("Your planning inputs")}</h2>
          <p className="small muted">
            {t(
              "Currency labels amounts without FX conversion. US-listed USD instrument research remains separate.",
            )}
          </p>
          <button
            className="secondary"
            disabled={!loaded}
            onClick={() => {
              draftRevision.current++;
              setTouched(true);
              setDraft(example);
              setErrors({});
              setError("");
            }}
          >
            {t("Load illustrative example")}
          </button>
          <p className="small muted">
            {t(
              "An example is illustrative, not a recommended return, and is not saved automatically.",
            )}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void calculate();
            }}
          >
            <div className="form-grid">
              {(Object.keys(labels) as Array<keyof PlanningInput>).map(
                (key) => (
                  <label key={key} htmlFor={"planning-" + key}>
                    {t(labels[key])}
                    {key === "currency" ? (
                      <select
                        aria-label={t(labels[key])}
                        id={"planning-" + key}
                        value={draft[key]}
                        onChange={(e) => edit(key, e.target.value)}
                      >
                        {["USD", "PLN", "EUR", "GBP"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={t(labels[key])}
                        id={"planning-" + key}
                        type={key === "goal_name" ? "text" : "number"}
                        inputMode={key === "goal_name" ? "text" : "decimal"}
                        step={key === "years" ? 1 : "any"}
                        min={limits[key]?.[0]}
                        max={limits[key]?.[1]}
                        maxLength={key === "goal_name" ? 100 : undefined}
                        value={draft[key]}
                        aria-invalid={!!errors[key]}
                        aria-describedby={
                          errors[key]
                            ? "planning-error-" + key
                            : limits[key]
                              ? "planning-limits-" + key
                              : undefined
                        }
                        onChange={(e) => edit(key, e.target.value)}
                      />
                    )}
                    {limits[key] && (
                      <span
                        id={"planning-limits-" + key}
                        className="small muted"
                      >
                        {t(
                          key === "target_amount"
                            ? "Greater than 0, up to {max}"
                            : "{min} to {max}",
                          {
                            min: fmt(limits[key]![0], 0),
                            max: fmt(limits[key]![1], 0),
                          },
                        )}
                      </span>
                    )}
                    {errors[key] && (
                      <span
                        id={"planning-error-" + key}
                        className="negative small"
                        role="alert"
                      >
                        {t(errors[key]!)}
                      </span>
                    )}
                  </label>
                ),
              )}
            </div>
            <div className="planning-actions">
              <button
                className="primary"
                type="submit"
                disabled={calculating || !loaded}
              >
                {t(calculating ? "Calculating…" : "Calculate scenario")}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void save()}
                disabled={saving || !loaded}
              >
                {t(saving ? "Saving…" : "Save plan")}
              </button>
            </div>
          </form>
          <p className="small muted" aria-live="polite">
            {t(
              !loaded
                ? "Loading saved plan…"
                : saved === fingerprint
                  ? "Saved plan"
                  : touched
                    ? "Unsaved changes"
                    : "No plan saved yet",
            )}
          </p>
          {error && (
            <p className="error" role="alert">
              {t(error)}
            </p>
          )}
        </section>
        <section
          className="card planning-result"
          aria-label={t("Hypothetical scenario")}
        >
          <span className="eyebrow">{t("HYPOTHETICAL, NOT A FORECAST")}</span>
          <h2>{t("Your scenario")}</h2>
          {result ? (
            <>
              {fingerprint !== calculated && (
                <p className="notice" role="status">
                  {t("Inputs changed. Recalculate this scenario.")}
                </p>
              )}
              {result.inputs.goal_name && <h3>{result.inputs.goal_name}</h3>}
              <div className="planning-metrics">
                {[
                  [
                    "Hypothetical ending value after fees",
                    result.ending_value,
                    "planning-ending-value",
                  ],
                  [
                    "Total contributed",
                    result.total_contributed,
                    "planning-contributed",
                  ],
                  [
                    "Hypothetical growth / loss",
                    result.growth,
                    "planning-growth",
                  ],
                  [
                    "Fee impact including foregone growth",
                    result.fee_impact,
                    "planning-fee-impact",
                  ],
                ].map(([label, value, id]) => (
                  <div key={String(id)}>
                    <span>{t(String(label))}</span>
                    <strong data-testid={String(id)}>
                      {amount(Number(value))}
                    </strong>
                  </div>
                ))}
                {result.goal_gap != null && (
                  <div>
                    <span>
                      {t(
                        result.goal_gap >= 0
                          ? "Remaining to target"
                          : "Above target",
                      )}
                    </span>
                    <strong>{amount(Math.abs(result.goal_gap))}</strong>
                  </div>
                )}
              </div>
              <PlanningChart result={result} />
              <div
                className="table-scroll"
                role="region"
                aria-label={t("Annual scenario values")}
                tabIndex={0}
              >
                <table aria-label={t("Annual scenario values")}>
                  <thead>
                    <tr>
                      {[
                        "Year",
                        "Contributed money",
                        "Value before fees",
                        "Value after fees",
                      ].map((x) => (
                        <th key={x}>{t(x)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.series.map((p) => (
                      <tr key={p.year}>
                        <th scope="row">{p.year}</th>
                        <td>{amount(p.contributed)}</td>
                        <td>{amount(p.before_fees)}</td>
                        <td>{amount(p.after_fees)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>
              {t(
                "Enter your own inputs, then calculate a scenario. Saving a plan does not calculate a result.",
              )}
            </p>
          )}
          <details className="planning-assumptions">
            <summary>{t("Assumptions and limits")}</summary>
            <p>{t(assumptions)}</p>
            <p>
              {t(
                "Returns can be negative. Actual market returns vary; no probabilities or expected performance are assigned.",
              )}
            </p>
          </details>
        </section>
      </div>
      <section className="card">
        <h2>{t("ETF learning")}</h2>
        <p>
          {t(
            "Learn what a fund does before researching a specific instrument. These lessons do not rank or select funds.",
          )}
        </p>
        <div className="etf-lessons">
          {lessons.map(([title, text]) => (
            <article key={title}>
              <h3>{t(title)}</h3>
              <p>{t(text)}</p>
            </article>
          ))}
        </div>
        <div className="learning-links">
          <a
            target="_blank"
            rel="noreferrer"
            href="https://www.investor.gov/introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-2"
          >
            {t("Investor.gov ETF overview")}
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://www.investor.gov/introduction-investing/getting-started/understanding-fees"
          >
            {t("Understanding fees")}
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator"
          >
            {t("Compound-interest learning")}
          </a>
        </div>
      </section>
    </>
  );
}
function PlanningChart({ result }: { result: PlanningResult }) {
  const { t, locale } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(580);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Match SVG units to CSS pixels so axis text stays readable on narrow cards.
  const left = 90,
    right = width - 16;
  const tick = (value: number) =>
    new Intl.NumberFormat(locale, {
      notation: value >= 1e12 ? "scientific" : "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const keys = ["contributed", "before_fees", "after_fees"] as const;
  const labels = ["Contributed money", "Value before fees", "Value after fees"];
  const colors = ["#8b681c", "#8b95a0", "#246c56"];
  const max = Math.max(
    ...result.series.flatMap((p) => keys.map((k) => p[k])),
    1,
  );
  return (
    <figure className="planning-chart">
      <figcaption>
        {t("Annual scenario comparison")} · {result.inputs.currency}
      </figcaption>
      <svg
        ref={svg}
        viewBox={`0 0 ${width} 260`}
        role="img"
        aria-label={t(
          "Contributions compared with hypothetical values before and after fees. Annual values are in the table below.",
        )}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={left}
              x2={right}
              y1={220 - 180 * f}
              y2={220 - 180 * f}
              stroke="#e6eae2"
            />
            <text
              x={left - 8}
              y={224 - 180 * f}
              textAnchor="end"
              fontSize="14"
              fill="#4f6056"
            >
              {tick(max * f)}
            </text>
          </g>
        ))}
        {keys.map((key, i) => (
          <polyline
            key={key}
            fill="none"
            stroke={colors[i]}
            strokeWidth="3"
            points={result.series
              .map(
                (p) =>
                  `${left + ((right - left) * p.year) / result.inputs.years},${220 - (180 * p[key]) / max}`,
              )
              .join(" ")}
          />
        ))}
        <text x={left} y="249" fontSize="14">
          {t("Year")} 0
        </text>
        <text x={right} y="249" textAnchor="end" fontSize="14">
          {t("Year")} {result.inputs.years}
        </text>
      </svg>
      <div className="chart-legend">
        {labels.map((x, i) => (
          <span key={x}>
            <i style={{ background: colors[i] }} />
            {t(x)}
          </span>
        ))}
      </div>
    </figure>
  );
}
