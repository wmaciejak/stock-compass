import { useEffect, useRef, useState } from "react";
import { Sparkles, X, RefreshCw } from "lucide-react";
import { api, ApiError } from "./api";
import { useI18n } from "./i18n";
import { useResearchContext } from "./ResearchContext";
import type {
  AiClaim,
  AiResult,
  AiRun,
  AiStatus,
  BrowserResearch,
} from "./types";

export type AiTarget = {
  symbol: string;
  horizon: string;
  language: "en" | "pl";
  mode: "demo" | "live";
  nonce: number;
};
const active = (run: AiRun | null) =>
  !!run && ["preparing", "running"].includes(run.state);
const actionLabels: Record<string, string> = {
  consider_buy_setup: "Consider the buy setup",
  wait_for_confirmation: "Wait for confirmation",
  avoid_new_entry: "Avoid a new entry",
  insufficient_data: "Insufficient data",
};
const reasonLabels: Record<string, string> = {
  ai_offline: "AI is unavailable in offline mode.",
  ai_disabled: "Enable AI and add your API key in the backend .env file.",
  missing_key: "Add your OpenAI API key in the backend .env file.",
  loading: "Checking AI availability…",
  service_unavailable: "The local AI service is unavailable.",
};
const errorLabels: Record<string, string> = {
  authentication_failed:
    "OpenAI credentials or model permissions were rejected.",
  model_unavailable:
    "The configured model is unavailable for this API account.",
  rate_limited:
    "OpenAI returned HTTP 429. This saved error does not distinguish credits, spending limits, or request limits. Check billing and API limits.",
  credit_balance_exhausted:
    "OpenAI API credits are exhausted. Add credits in OpenAI billing before generating again.",
  organization_spend_limit_exceeded:
    "This OpenAI organization reached its spending limit. Review the organization limit before generating again.",
  project_spend_limit_exceeded:
    "This OpenAI project reached its spending limit. Review the project limit before generating again.",
  organization_usage_limit_exceeded:
    "This OpenAI organization reached its approved usage limit. Request a higher limit or contact OpenAI support.",
  quota_exceeded:
    "OpenAI API quota is unavailable. Check API credits and spending limits before generating again.",
  request_rate_limited:
    "OpenAI request/token rate limit reached. Check API limits; wait before retrying if temporary, or raise the token limit if this request is too large.",
  request_too_large:
    "This request exceeds the entire token rate limit. Waiting alone will not make it fit. Raise the model/project token limit or reduce the input context.",
  api_limit_unknown:
    "OpenAI returned HTTP 429 without a recognized limit code. Check billing and API limits.",
  provider_unavailable:
    "OpenAI could not complete this request. No automatic retry was made.",
  context_token_budget_exceeded:
    "AI input exceeds the configured request token budget. No summary was generated.",
  token_count_unavailable:
    "OpenAI token count could not be checked. No summary was generated.",
  refused: "OpenAI declined this request.",
  incomplete_result: "OpenAI returned an incomplete result.",
  invalid_result:
    "AI output does not match the captured evidence or data-quality rules.",
  delivery_unknown:
    "OpenAI delivery is unknown. The request may have been billed; regenerating starts a new request.",
  interrupted:
    "The local service restarted. This job was not automatically resubmitted.",
  request_conflict:
    "This request ID has already been used with different inputs.",
  ai_busy: "Another AI summary is running. Wait for that job to finish.",
  context_unavailable:
    "Load usable daily market data before generating an AI summary.",
  recovery_unknown:
    "The submission could not be recovered. It may have been billed. Generate explicitly to start a new request.",
};
const limitErrors = new Set([
  "rate_limited",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
  "quota_exceeded",
  "request_rate_limited",
  "request_too_large",
  "api_limit_unknown",
]);
const errorMessage = (e: unknown) =>
  e instanceof ApiError
    ? errorLabels[e.code] || e.message
    : (e as Error).message;
const diagnosticLabels: Record<string, string> = {
  input_context_bytes: "Input context: {value} bytes",
  input_tokens: "Input tokens: {value}",
  request_token_budget: "Request token budget: {value}",
  requested_tokens: "Requested tokens: {value}",
  token_limit: "Token limit: {value}",
  remaining_tokens: "Available tokens: {value}",
  used_tokens: "Used tokens: {value}",
  project_token_limit: "Project token limit: {value}",
  remaining_project_tokens: "Available project tokens: {value}",
  max_output_tokens: "Maximum output tokens: {value}",
  request_limit: "Request limit: {value}",
  remaining_requests: "Available requests: {value}",
  retry_after_seconds: "Retry after: {value} seconds",
  token_reset: "Token limit resets in: {value}",
  project_token_reset: "Project token limit resets in: {value}",
  request_reset: "Request limit resets in: {value}",
  request_id: "Request ID: {value}",
  response_id: "Response ID: {value}",
  output_tokens: "Output tokens: {value}",
  total_tokens: "Total tokens: {value}",
  output_field: "Rejected field: {value}",
};
const validationLabels: Record<string, string> = {
  identity_mismatch: "The result identifies a different ticker, horizon or language.",
  scenario_set_mismatch: "The result does not contain exactly one base, bull and bear scenario.",
  daily_quality_restricted: "The recommendation bypasses the daily data-quality restriction.",
  buy_setup_unavailable: "The result proposes a buy setup without an actionable daily scenario.",
  missing_claim_evidence: "A claim has no captured evidence citation.",
  unknown_evidence_reference: "A claim cites evidence that is absent from the captured context.",
  invalid_price_source: "A price level cites a source that is not eligible price evidence.",
  price_value_mismatch: "A price level does not match the exact captured value.",
  price_interval_mismatch: "A price level uses a different interval from its evidence.",
  price_basis_mismatch: "A price level uses a different price basis from its evidence.",
  unsupported_trading_level: "An entry, stop or target is not from the captured daily scenario.",
  structured_output_mismatch: "The response does not conform to the evidence selections required by this request.",
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const save = (key: string, value: string | null) => {
  try {
    value === null
      ? localStorage.removeItem(key)
      : localStorage.setItem(key, value);
  } catch {
    /* Storage is optional. */
  }
};

export function AiSummaryButton({
  symbol,
  status,
  onClick,
}: {
  symbol: string;
  status: AiStatus;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      className="secondary ai-button"
      disabled={!status.enabled}
      title={
        !status.enabled
          ? t(
              reasonLabels[status.reason || "ai_disabled"] ||
                reasonLabels.service_unavailable,
            )
          : t("Analyze {symbol} with your app context", { symbol })
      }
      onClick={onClick}
    >
      <Sparkles size={14} />
      {t("Summarize with AI")}
    </button>
  );
}

function Claim({ claim, result }: { claim: AiClaim; result: AiResult }) {
  const { t } = useI18n();
  return (
    <div className="ai-claim">
      <p>{claim.text}</p>
      {claim.source_refs.length > 0 && (
        <details className="ai-evidence">
          <summary>{t("Evidence")}</summary>
          {claim.source_refs.map((ref) => {
            const source = result.evidence?.[ref];
            return (
              <p key={ref}>
                <strong>{source?.label || ref}</strong>
                <br />
                {typeof source?.value === "string"
                  ? source.value
                  : JSON.stringify(source?.value ?? "")}
                {source?.interval && (
                  <small>
                    {source.interval} · {source.price_basis}
                  </small>
                )}
                {source?.path.includes(".context.news.") &&
                  source.path.endsWith(".url") &&
                  typeof source.value === "string" &&
                  source.value.startsWith("https://") && (
                    <a href={source.value} target="_blank" rel="noreferrer">
                      {t("Source")}
                    </a>
                  )}
              </p>
            );
          })}
        </details>
      )}
    </div>
  );
}

export function AiSummaryPanel({
  target,
  dataRevision,
  onClose,
}: {
  target: AiTarget;
  dataRevision: number;
  onClose: () => void;
}) {
  const { t, date, fmt } = useI18n();
  const research = useResearchContext();
  const [run, setRun] = useState<AiRun | null>(null);
  const [previous, setPrevious] = useState<AiResult | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const runRef = useRef(run);
  runRef.current = run;
  const key = `compass-ai:${target.mode}:${target.symbol}:${target.horizon}:${target.language}`;
  const draft = research.getDraft(target.symbol);
  const comparison =
    research.comparisonSymbols.includes(target.symbol) &&
    research.comparisonSymbols.length >= 2
      ? research.comparisonSymbols
      : [];
  const browser: BrowserResearch = {
    note_draft: draft.noteDraft ?? null,
    thesis_draft: draft.thesisDraft ?? null,
    sizing_form: draft.sizingForm ?? null,
    sizing_input: draft.sizingInput ?? null,
    comparison_symbols: comparison,
  };
  const browserRef = useRef(browser);
  browserRef.current = browser;
  const result = run?.result || previous;
  const browserChanged =
    !!result && canonical(result.browser_context) !== canonical(browser);

  async function generate(force = false) {
    const id = ++generation.current;
    setSubmitting(true);
    setError("");
    if (runRef.current?.result) setPrevious(runRef.current.result);
    // Every explicit generation starts a new identity; recovery uses GET by UUID.
    const client_request_id = crypto.randomUUID();
    save(key + ":pending", client_request_id);
    try {
      const next = await api<AiRun>(
        `/ai/summaries/${encodeURIComponent(target.symbol)}`,
        "POST",
        {
          client_request_id,
          horizon: target.horizon,
          language: target.language,
          mode: target.mode,
          force,
          browser_context: browserRef.current,
        },
      );
      if (!alive.current || id !== generation.current) return;
      setRun(next);
      save(key + ":run", next.id);
      if (!active(next)) save(key + ":pending", null);
    } catch (e) {
      if (alive.current && id === generation.current) {
        setError(errorMessage(e));
      }
    } finally {
      if (alive.current && id === generation.current) setSubmitting(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    let cancelled = false;
    async function load() {
      try {
        const status = await api<AiStatus>("/ai/status");
        const latest = await api<AiRun | null>(
          `/ai/summaries/${target.symbol}?horizon=${encodeURIComponent(target.horizon)}&language=${target.language}`,
        );
        if (cancelled) return;
        if (latest?.result) setPrevious(latest.result);
        const recoveryId = read(key + ":pending");
        if (recoveryId) {
          try {
            const recovered = await api<AiRun>(
              `/ai/requests/${encodeURIComponent(recoveryId)}`,
            );
            if (cancelled) return;
            setRun(recovered);
            save(key + ":run", recovered.id);
            if (!active(recovered)) save(key + ":pending", null);
          } catch (e) {
            if (cancelled) return;
            if (!(e instanceof ApiError) || e.status !== 404) throw e;
            setError(errorLabels.recovery_unknown);
          }
          return;
        }
        const pending = status.active_run;
        if (
          pending &&
          pending.symbol === target.symbol &&
          pending.horizon === target.horizon &&
          pending.language === target.language
        ) {
          const found = await api<AiRun>(`/ai/runs/${pending.id}`);
          if (!cancelled) {
            setRun(found);
            save(key + ":run", found.id);
          }
          return;
        }
        const remembered = read(key + ":run");
        if (remembered && remembered !== latest?.id) {
          try {
            const savedRun = await api<AiRun>(`/ai/runs/${remembered}`);
            if (cancelled) return;
            if (
              active(savedRun) ||
              ["delivery_unknown", "interrupted", "failed"].includes(
                savedRun.state,
              )
            ) {
              setRun(savedRun);
              if (latest?.result) setPrevious(latest.result);
              return;
            }
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 404) throw e;
          }
        }
        if (latest?.result) {
          setRun(latest);
          return;
        }
        if (!status.enabled) {
          setError(
            t(
              reasonLabels[status.reason || "ai_disabled"] ||
                reasonLabels.service_unavailable,
            ),
          );
          return;
        }
        await generate(false);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      alive.current = false;
      generation.current++;
    };
  }, [target.nonce]);

  useEffect(() => {
    if (!active(run)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      if (cancelled) return;
      if (!document.hidden) {
        try {
          const next = await api<AiRun>(`/ai/runs/${run!.id}`);
          if (cancelled) return;
          setRun(next);
          setError("");
          if (!active(next)) {
            save(key + ":pending", null);
            return;
          }
        } catch (e) {
          if (!cancelled) setError(errorMessage(e));
        }
      }
      if (!cancelled)
        timer = setTimeout(poll, Date.now() - started > 30000 ? 5000 : 2000);
    };
    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run?.id, run?.state]);

  useEffect(() => {
    const current = runRef.current;
    if (!current?.result) return;
    let cancelled = false;
    api<AiRun>(`/ai/runs/${current.id}`)
      .then((next) => {
        if (!cancelled) setRun(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dataRevision]);

  const busy = checking || submitting || active(run);
  const content = result?.content;
  return (
    <dialog
      ref={dialog}
      className="ai-summary"
      aria-label={t("AI outlook · {symbol}", { symbol: target.symbol })}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="ai-heading">
        <div>
          <span className="eyebrow">{t("AI RESEARCH OUTLOOK")}</span>
          <h2>
            {target.symbol} <small>{t(target.horizon)}</small>
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("Close AI summary")}
        >
          <X size={20} />
        </button>
      </header>
      <div className="ai-body">
        <p className="muted ai-disclosure">
          {t(
            "Sends this ticker's market data and research context to OpenAI. API usage is billed to your account.",
          )}
        </p>
        <p className="small muted">
          {t(
            "New requests retain all price bars and research. Derived indicators cover the last 32 completed bars at 6 decimal places; current metrics and trading levels keep full precision. Tokens are counted before generation.",
          )}
        </p>
        {busy && (
          <p className="ai-progress" role="status">
            <RefreshCw size={16} className="spinning" />
            {t(
              run?.state === "preparing"
                ? "Preparing context…"
                : "Analyzing with AI…",
            )}
          </p>
        )}
        {(error || run?.error) && (
          <div className="error" role="alert">
            {t(error || errorLabels[run!.error!.code] || run!.error!.message)}
            {run?.error?.code === "invalid_result" && (
              <p>{t(validationLabels[String(run.error.diagnostics?.validation_rule)] ||
                "The precise failed check was not recorded for this saved request.")}</p>
            )}
            {run?.error && limitErrors.has(run.error.code) && (
              <p>
                <a
                  href="https://platform.openai.com/settings/organization/billing"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("OpenAI billing")}
                </a>
                {" · "}
                <a
                  href="https://platform.openai.com/settings/organization/limits"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("OpenAI API limits")}
                </a>
                {" · "}
                <a
                  href="https://platform.openai.com/settings/"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("OpenAI project settings")}
                </a>
              </p>
            )}
            {run?.error?.diagnostics && (
              <details className="ai-evidence">
                <summary>{t("Request diagnostics")}</summary>
                {Object.entries(diagnosticLabels).map(([field, label]) => {
                  const value = run.error?.diagnostics?.[field];
                  return value !== undefined ? (
                    <p key={field}>{t(label, { value })}</p>
                  ) : null;
                })}
              </details>
            )}
          </div>
        )}
        {(run?.context_changed || browserChanged) && (
          <p className="ai-stale" role="status">
            {t("Context changed — regenerate to update")}
          </p>
        )}
        {previous && !run?.result && !busy && (
          <p className="muted">{t("Previous saved summary")}</p>
        )}
        {content && result && (
          <>
            <section className="ai-verdict">
              <div>
                <span className="eyebrow">{t("RECOMMENDATION")}</span>
                <h3>
                  {t(
                    actionLabels[content.recommendation] ||
                      content.recommendation,
                  )}
                </h3>
              </div>
              <span className="ai-confidence">
                {t("Confidence")}: {t(content.confidence)}
              </span>
            </section>
            <Claim claim={content.summary} result={result} />
            <h3>{t("Why this recommendation")}</h3>
            {content.rationale.map((claim, i) => (
              <Claim key={i} claim={claim} result={result} />
            ))}
            <h3>{t("Confidence and counterargument")}</h3>
            <Claim claim={content.confidence_reason} result={result} />
            <Claim claim={content.counterargument} result={result} />
            <h3>{t("What may happen next")}</h3>
            <h4>{t("Next 1–5 trading sessions")}</h4>
            <Claim claim={content.near_term} result={result} />
            <div className="ai-scenarios">
              {content.scenarios.map((scene) => (
                <section
                  key={scene.kind}
                  className={
                    "ai-scenario " +
                    (scene.kind === content.best_supported_scenario
                      ? "best"
                      : "")
                  }
                >
                  <span className="eyebrow">
                    {t(
                      {
                        base: "Base scenario",
                        bull: "Bullish scenario",
                        bear: "Bearish scenario",
                      }[scene.kind] || scene.kind,
                    )}
                  </span>
                  {scene.kind === content.best_supported_scenario && (
                    <small>{t("Best supported")}</small>
                  )}
                  <Claim claim={scene.outlook} result={result} />
                  <h4>{t("Confirmation")}</h4>
                  <Claim claim={scene.confirmation} result={result} />
                  <h4>{t("Invalidation")}</h4>
                  <Claim claim={scene.invalidation} result={result} />
                  {scene.levels.map((level, i) => (
                    <p key={i}>
                      {level.label}: <b>{fmt(level.value)}</b>
                      <small>
                        {level.interval} · {level.price_basis}
                      </small>
                    </p>
                  ))}
                  {scene.events.map((claim, i) => (
                    <Claim key={i} claim={claim} result={result} />
                  ))}
                </section>
              ))}
            </div>
            <h3>{t("What to monitor")}</h3>
            {content.next_observations.map((claim, i) => (
              <Claim key={i} claim={claim} result={result} />
            ))}
            <h3>{t("Risks and missing context")}</h3>
            {content.risks.map((claim, i) => (
              <Claim key={i} claim={claim} result={result} />
            ))}
            {content.missing_context.map((item, i) => (
              <p key={i}>{item}</p>
            ))}
            <details className="ai-context">
              <summary>{t("Context, sources and model")}</summary>
              <p>
                {result.model} · {date(result.generated_at, true)}
              </p>
              <p>
                {t("Daily source date")}:{" "}
                {result.source_dates.daily?.last_completed_bar || "—"}
              </p>
              <p>
                {t("Input / output tokens")}: {result.usage.input_tokens ?? "—"}{" "}
                / {result.usage.output_tokens ?? "—"}
              </p>
              {run?.reused_from && (
                <p>{t("Reused saved result; no new AI call.")}</p>
              )}
              <div className="ai-manifest">
                {result.manifest.map((section) => (
                  <p key={section.name}>
                    <b>{section.name.replaceAll("_", " ")}</b> ·{" "}
                    {t(section.status)}
                    {section.count > 0 ? ` · ${section.count}` : ""}
                    {section.first_date && (
                      <small>
                        {section.first_date} → {section.last_date}
                      </small>
                    )}
                    {section.reason && <small>{t(section.reason)}</small>}
                  </p>
                ))}
              </div>
              <p className="small muted">
                {t(
                  "Research context includes saved notes, journal entries and the drafts and sizing inputs available when you clicked.",
                )}
              </p>
            </details>
          </>
        )}
        <footer className="ai-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void generate(!!result || !!run)}
          >
            <Sparkles size={15} />
            {t(result || run ? "Regenerate" : "Generate summary")}
          </button>
          <button className="secondary" onClick={onClose}>
            {t("Close")}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
