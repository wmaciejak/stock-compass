import type { Analysis, BeginnerReading } from "./types";
import { useI18n } from "./i18n";

// Old snapshots can lack the adapter. Keep quality restrictions ahead of any label.
function fallback(a: Analysis): BeginnerReading {
  const q = a.assessment.data_quality;
  if (!q.actionable || q.stale)
    return {
      conclusion: "Insufficient or stale data",
      explanation:
        "The available daily prices cannot support an actionable assessment.",
      caution_kind: "data",
      caution: q.issues.join("; ") || "Daily data are incomplete or stale.",
      next_condition:
        "Refresh or verify the daily data and adjustment convention before reviewing a setup.",
      supporting: [],
    };
  const company =
    !a.instrument.synthetic && a.instrument.instrument_type !== "ETF";
  const event = a.earnings;
  const estimated = company && event?.status === "estimated";
  const unknown = company && (!event || event.status === "unknown");
  return {
    conclusion: a.assessment.label,
    explanation: a.assessment.summary,
    caution_kind: estimated
      ? "earnings"
      : unknown
        ? "event_unknown"
        : a.assessment.opposing.length
          ? "opposing"
          : "uncertainty",
    caution: estimated
      ? `Provider-estimated earnings date: ${event.date_start === event.date_end ? event.date_start : event.date_start + " – " + event.date_end}. Verify the date; a price gap can exceed a planned loss.`
      : unknown
        ? "Next earnings timing is unknown or unverified. Event-driven price gaps cannot be excluded."
        : a.assessment.opposing[0] ||
          "The evidence is uncertain. A technical setup does not guarantee future performance.",
    next_condition: a.assessment.next_condition,
    supporting: a.assessment.supporting.slice(0, 3),
  };
}
export default function BeginnerSummary({ analysis }: { analysis: Analysis }) {
  const { t } = useI18n();
  const b = analysis.beginner || fallback(analysis);
  return (
    <section className="card beginner-summary" data-testid="beginner-summary">
      {analysis.instrument.synthetic && (
        <span className="badge gray">{t("Synthetic example")}</span>
      )}
      <span className="eyebrow">{t("Conclusion")}</span>
      <h2>{t(b.conclusion)}</h2>
      <p>{t(b.explanation)}</p>
      <div className="beginner-caution">
        <h3>{t("Main caution")}</h3>
        <p>{t(b.caution)}</p>
      </div>
      <div className="next-watch">
        <h3>{t("Watch next")}</h3>
        <p>{t(b.next_condition)}</p>
      </div>
      {!!b.supporting.length && (
        <ul className="evidence-list">
          {b.supporting.slice(0, 3).map((x) => (
            <li key={x}>{t(x)}</li>
          ))}
        </ul>
      )}
      <details>
        <summary>{t("What do these terms mean?")}</summary>
        <p>
          {t(
            "Confirmation means checking the stated condition after a completed trading session. A price gap is a sudden jump between trading prices; a stop may not limit the loss.",
          )}
        </p>
        {Object.entries(analysis.terms).map(([term, meaning]) => (
          <p key={term}>
            <b>{t(term)}: </b>
            {t(meaning)}
          </p>
        ))}
      </details>
    </section>
  );
}
