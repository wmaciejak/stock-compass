import type { Analysis, Onboarding, Settings } from "./types";
import { useI18n } from "./i18n";
const research = [
  [
    "Choose an example or ticker",
    "Choose a synthetic example to learn offline, or open a ticker from your watchlist.",
  ],
  [
    "Read the conclusion and caution",
    "Read Conclusion, Main caution and Watch next before looking at the chart.",
  ],
  [
    "Explore the evidence",
    "Open Explore the evidence, then Indicators & learning. Expand an indicator to read its explanation and common mistake.",
  ],
  [
    "Optionally save a research note",
    "Open Research & sizing to record your own question. Saving a note is optional; the guide never changes it.",
  ],
];
const planning = [
  [
    "Define a goal",
    "Give your goal a name and optionally enter a target. Currency only labels amounts; it does not convert them.",
  ],
  [
    "Enter a regular contribution",
    "Enter your starting amount, monthly contribution and years. Calculate a hypothetical scenario using your own return assumption.",
  ],
  [
    "Inspect the fee comparison",
    "Compare contributed money and values before and after fees. Fee impact includes the growth forgone because of fees.",
  ],
  [
    "Read an ETF lesson",
    "Read the ETF learning cards below. Understand holdings, diversification, costs and currency exposure before researching an investment.",
  ],
];
export default function BeginnerGuide({
  progress,
  preferences,
  analysis,
  onProgress,
  onResearch,
  onPlanning,
  onDemo,
  busy,
  loading,
  onRetry,
  error,
}: {
  progress: Onboarding | null;
  preferences: Settings;
  analysis?: Analysis | null;
  onProgress: (p: Onboarding) => void;
  onResearch: () => void;
  onPlanning: () => void;
  onDemo: () => void;
  busy: boolean;
  loading: boolean;
  onRetry: () => void;
  error: string;
}) {
  const { t } = useI18n();
  if (preferences.experience !== "beginner") return null;
  const steps = progress?.path === "research" ? research : planning;
  function go(path: Onboarding["path"]) {
    onProgress({ ...progress!, path, step: 0, state: "active" });
    if (path === "research") onResearch();
    else onPlanning();
  }
  return (
    <section
      className="card beginner-guide"
      data-testid="beginner-guide"
      aria-label={t("Beginner guide")}
    >
      <div className="section-title">
        <h2>{t("A first step, at your pace.")}</h2>
        <span className="eyebrow">{t("BEGINNER GUIDE")}</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {t(progress ? error : "Saved guide progress could not be loaded.")}
        </p>
      )}
      {!progress ? (
        <>
          {(loading || busy) && (
            <p role="status">{t("Loading saved guide…")}</p>
          )}
          {error && (
            <button
              className="secondary"
              disabled={loading || busy}
              onClick={onRetry}
            >
              {t("Retry loading guide")}
            </button>
          )}
        </>
      ) : progress.state === "dismissed" ? (
        <>
          <p>
            {t(
              "Your guide is paused. Your notes and planning inputs stay yours.",
            )}
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              onProgress({ ...progress, state: "active" });
              progress.path === "research" ? onResearch() : onPlanning();
            }}
          >
            {t("Resume guide")}
          </button>
        </>
      ) : progress.state === "complete" ? (
        <p>{t("Guide completed. Keep exploring at your own pace.")}</p>
      ) : (
        <>
          <div className="guide-paths">
            <button
              className={progress.path === "research" ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => go("research")}
            >
              {t("Understand a stock")}
            </button>
            <button
              className={
                progress.path === "long_term" ? "primary" : "secondary"
              }
              disabled={busy}
              onClick={() => go("long_term")}
            >
              {t("Plan regular investing")}
            </button>
          </div>
          <p className="eyebrow">
            {t("Step {step} of 4", { step: progress.step + 1 })}
          </p>
          <h3>{t(steps[progress.step][0])}</h3>
          <p>{t(steps[progress.step][1])}</p>
          {progress.path === "research" && (
            <div className="guide-links">
              <button className="text-button" onClick={onResearch}>
                {t("Open stock research")}
              </button>
              {progress.step === 0 && (
                <button className="text-button" onClick={onDemo}>
                  {t("Use synthetic example")}
                </button>
              )}
              {!analysis && (
                <p className="small muted">
                  {t(
                    "Market data is optional for learning. Choose a synthetic example if live data is unavailable.",
                  )}
                </p>
              )}
            </div>
          )}
          {progress.path === "long_term" && (
            <button className="text-button" onClick={onPlanning}>
              {t("Open planning")}
            </button>
          )}
          <div className="guide-actions">
            <button
              className="secondary"
              disabled={busy || progress.step === 0}
              onClick={() =>
                onProgress({ ...progress, step: progress.step - 1 })
              }
            >
              {t("Back")}
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                onProgress({
                  ...progress,
                  step: Math.min(3, progress.step + 1),
                  state: progress.step === 3 ? "complete" : "active",
                })
              }
            >
              {t("I understand this step")}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onProgress({ ...progress, state: "dismissed" })}
            >
              {t("Skip guide")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
