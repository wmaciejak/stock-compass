import type { EarningsRow } from "./types";
import { useI18n } from "./i18n";
const reasons: Record<string, string> = {
  synthetic: "Synthetic example: no company earnings",
  etf: "Company earnings do not apply",
  csv_identity_unverified: "Imported instrument identity is unverified",
  no_cache: "No cached earnings information",
  legacy_date_unverified: "Legacy date is unverified until a normal refresh",
  earnings_unknown: "Next earnings timing is unknown",
  invalid_timestamps: "Provider dates could not be verified",
  invalid_range: "Provider date range is invalid",
  past_event: "Last reported date has passed; update needed",
  exchange_timezone_unknown: "Exchange timezone could not be verified",
};
export default function EarningsStatus({
  row,
  compact = false,
}: {
  row?: EarningsRow | null;
  compact?: boolean;
}) {
  const { t, date } = useI18n();
  return (
    <div className={compact ? "earnings-status compact" : "earnings-status"}>
      {row?.status === "estimated" ? (
        <>
          <span className="badge amber">{t("Estimated")}</span>{" "}
          <span>
            {row.date_start ? date(row.date_start) : t("Date unknown")}
            {row.date_end && row.date_end !== row.date_start
              ? " – " + date(row.date_end)
              : ""}
          </span>
          {!compact && (
            <p className="small muted">
              {t(
                "Exchange-local date; precise announcement time is unavailable.",
              )}{" "}
              {row.exchange_timezone}
            </p>
          )}
        </>
      ) : (
        <span>
          {t(
            reasons[row?.reason_code || ""] ||
              "Next earnings timing is unknown",
          )}
        </span>
      )}
      {row?.last_reported_date && (
        <p className="small">
          {t("Unverified last reported date")}: {date(row.last_reported_date)}
        </p>
      )}
      {row?.status !== "not_applicable" && (
        <p className="small muted">
          {t(
            row?.freshness === "stale"
              ? "Needs refresh"
              : row?.freshness === "fresh"
                ? "Metadata retrieved within 24 hours"
                : "Freshness unknown",
          )}
        </p>
      )}
      {row?.refresh_error && (
        <p className="notice small">
          {t("Refresh failed; showing cached information.")}{" "}
          {t(
            String(row.refresh_error.message || row.refresh_error.reason || ""),
          )}
        </p>
      )}
      {!compact && row?.status !== "not_applicable" && (
        <p className="small muted">
          {t("Source")}: {row?.source || t("Unavailable")} · {t("Retrieved")}:{" "}
          {row?.retrieved_at ? date(row.retrieved_at, true) : t("Unavailable")}
        </p>
      )}
    </div>
  );
}
