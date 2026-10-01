import { useEffect, useState } from "react";
import { api } from "./api";
import type { EventsResponse } from "./types";
import { useI18n } from "./i18n";
import EarningsStatus from "./EarningsStatus";
export default function Events({
  mode,
  dataRevision,
  watchRevision,
  onOpenStock,
}: {
  mode: "demo" | "live";
  dataRevision: number;
  watchRevision: number;
  onOpenStock: (symbol: string) => void;
}) {
  const { t, date } = useI18n();
  const [windowDays, setWindowDays] = useState(30),
    [data, setData] = useState<EventsResponse | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api<EventsResponse>(
      `/watchlist/events?mode=${mode}&window_days=${windowDays}`,
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode, dataRevision, watchRevision, windowDays]);
  const agenda = (data?.rows || [])
    .filter((r) => r.status === "estimated" && r.in_window)
    .sort(
      (a, b) =>
        (a.date_start || "").localeCompare(b.date_start || "") ||
        a.symbol.localeCompare(b.symbol),
    );
  const coverage = (data?.rows || []).filter((r) => !agenda.includes(r));
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("CACHED WATCHLIST EVENTS")}</span>
        <h1>{t("Earnings calendar")}</h1>
        <p>
          {t(
            "Estimated company earnings dates from your watchlist. Unknown dates remain a risk to verify.",
          )}
        </p>
      </div>
      <div className="calendar-controls">
        <div className="segmented">
          {[30, 90].map((n) => (
            <button
              key={n}
              aria-pressed={windowDays === n}
              className={windowDays === n ? "active" : ""}
              onClick={() => setWindowDays(n)}
            >
              {t("{days} days", { days: n })}
            </button>
          ))}
        </div>
        <p className="small muted">
          {t(
            "This page reads cached metadata. Use the existing watchlist refresh to update it.",
          )}
        </p>
      </div>
      {data?.offline && (
        <p className="notice">{t("Offline: showing cached event coverage.")}</p>
      )}
      {error && (
        <div className="error" role="alert">
          {t(error)}
        </div>
      )}
      {!data && !error && <p role="status">{t("Loading cached events…")}</p>}
      {data && (
        <>
          <section className="card" data-testid="earnings-agenda">
            <h2>{t("Upcoming estimates")}</h2>
            {!agenda.length && (
              <p>
                {t(
                  "No dated estimates in this window. This does not mean there is no earnings risk.",
                )}
              </p>
            )}
            {agenda.map((r) => (
              <article key={r.symbol} className="event-row">
                <div>
                  <button
                    className="text-button"
                    onClick={() => onOpenStock(r.symbol)}
                  >
                    {r.symbol}
                  </button>
                  <p>{r.name}</p>
                  <span className="small muted">{t("Company earnings")}</span>
                </div>
                <EarningsStatus row={r} />
              </article>
            ))}
          </section>
          <section className="card" data-testid="earnings-coverage">
            <h2>{t("Watchlist coverage")}</h2>
            {!data.rows.length && (
              <p>
                {t(
                  "Your watchlist is empty. Add an instrument to see its event coverage.",
                )}
              </p>
            )}
            {!coverage.length && !!data.rows.length && (
              <p>
                {t("All watched instruments have an estimate in this window.")}
              </p>
            )}
            {coverage.map((r) => (
              <article key={r.symbol} className="event-row">
                <div>
                  <button
                    className="text-button"
                    onClick={() => onOpenStock(r.symbol)}
                  >
                    {r.symbol}
                  </button>
                  <p>{r.name}</p>
                  {r.status === "estimated" && (
                    <span className="badge gray">
                      {t("Outside selected window")}
                    </span>
                  )}
                </div>
                <EarningsStatus row={r} />
              </article>
            ))}
          </section>
          <p className="small muted">
            {t("Coverage generated")}: {date(data.generated_at, true)}.{" "}
            {t(
              "Freshness is a retrieval cue, not a guarantee of event accuracy.",
            )}
          </p>
        </>
      )}
    </>
  );
}
