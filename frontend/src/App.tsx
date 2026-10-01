import { useState, useEffect, useRef, useMemo } from "react";
import {
  Compass,
  LayoutDashboard,
  GitCompareArrows,
  BookOpen,
  Settings as SettingsIcon,
  Plus,
  RefreshCw,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  FlaskConical,
  TrendingUp,
  Activity,
  Clock,
  Download,
  Save,
  Trash2,
  X,
  Info,
  Menu,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  HORIZONS,
  type Analysis,
  type Watch,
  type Settings,
  type Availability,
  type SessionQuote,
} from "./types";
import { api } from "./api";
import { createI18n, LanguageProvider, useI18n, type Language } from "./i18n";
import { PriceChart, LineChart } from "./Charts";
import { Historical, Research, Journal, Context } from "./Research";
import { Comparison, Configuration } from "./Workspace";
import { useAutoRefresh } from "./useAutoRefresh";
import { AiSummaryButton, AiSummaryPanel, type AiTarget } from "./AiSummary";
import type { AiStatus, Onboarding } from "./types";
import BeginnerGuide from "./BeginnerGuide";
import BeginnerSummary from "./BeginnerSummary";
import LongTerm from "./LongTerm";
import Events from "./Events";
import EarningsStatus from "./EarningsStatus";

type View =
  | "briefing"
  | "detail"
  | "compare"
  | "journal"
  | "settings"
  | "long-term"
  | "events";
type Tab = "overview" | "indicators" | "backtests" | "research";
const defaults: Settings = {
  experience: "beginner",
  preferred_workspace: "research",
  language: "en",
  mode: "demo",
  benchmark: "SPY",
  horizon: "2–8 weeks",
  commission: 0.001,
  spread: 0.001,
};
const shortLabel = (label?: string) =>
  ({
    "Buy setup worth considering": "Worth considering",
    "Wait for confirmation": "Wait for confirmation",
    "Unfavorable setup": "Unfavorable",
    "No clear edge": "No clear edge",
    "Insufficient or stale data": "Data limited",
  })[label || ""] || "Not loaded";
function usableQuote(
  quote: SessionQuote | null | undefined,
  completed: string | null | undefined,
  now: number,
) {
  const at = quote ? Date.parse(quote.market_time) : NaN;
  return quote &&
    quote.session > (completed || "") &&
    Number.isFinite(at) &&
    at <= now + 120_000 &&
    now - at <= 30 * 60_000
    ? quote
    : null;
}
function analysisQuote(analysis: Analysis, now: number) {
  const availability: Availability | undefined = analysis.context.quote;
  const data = availability?.data;
  return usableQuote(
    availability?.status === "available" && data && !Array.isArray(data)
      ? (data as SessionQuote)
      : null,
    analysis.provenance.last_completed_bar,
    now,
  );
}
function Badge({ label }: { label?: string }) {
  const { t } = useI18n();
  const tone = label?.startsWith("Buy")
    ? "green"
    : label?.startsWith("Unfavorable")
      ? "rose"
      : label?.startsWith("Wait")
        ? "amber"
        : "gray";
  return (
    <span className={`badge ${tone}`}>
      <i />
      {t(shortLabel(label))}
    </span>
  );
}

export default function App() {
  const [settings, setSettings] = useState(defaults);
  const [aiStatus, setAiStatus] = useState<AiStatus>({
    enabled: false,
    reason: "loading",
    model: "gpt-6.1-sol",
  });
  const [aiTarget, setAiTarget] = useState<AiTarget | null>(null);
  useEffect(() => {
    api<AiStatus>("/ai/status")
      .then(setAiStatus)
      .catch(() =>
        setAiStatus({
          enabled: false,
          reason: "service_unavailable",
          model: "gpt-6.1-sol",
        }),
      );
  }, []);
  const i18n = useMemo(
    () => createI18n(settings.language || "en"),
    [settings.language],
  );
  const { t, fmt, pct, date, locale, basis } = i18n;
  const [languageBusy, setLanguageBusy] = useState(false);
  useEffect(() => {
    document.documentElement.lang = settings.language || "en";
    document.title =
      settings.language === "pl"
        ? "Stock Compass · Analiza z perspektywą"
        : "Stock Compass · Research with perspective";
  }, [settings.language]);
  const [watch, setWatch] = useState<Watch[]>([]);
  const [watchRevision, setWatchRevision] = useState(0);
  const watchSymbols = useRef("");
  function updateWatch(w: Watch[]) {
    const signature = w
      .map((x) => x.symbol)
      .sort()
      .join("|");
    if (watchSymbols.current !== signature) {
      watchSymbols.current = signature;
      setWatchRevision((n) => n + 1);
    }
    setWatch(w);
  }
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideLoading, setGuideLoading] = useState(true);
  const [guideError, setGuideError] = useState("");
  const guideSerial = useRef(0);
  async function loadGuide() {
    const id = ++guideSerial.current;
    setGuideLoading(true);
    setGuideError("");
    try {
      const progress = await api<Onboarding>("/onboarding");
      if (id === guideSerial.current) setOnboarding(progress);
    } catch (e) {
      if (id === guideSerial.current) setGuideError((e as Error).message);
    } finally {
      if (id === guideSerial.current) setGuideLoading(false);
    }
  }
  useEffect(() => {
    void loadGuide();
    return () => {
      guideSerial.current++;
    };
  }, []);
  async function saveGuide(progress: Onboarding) {
    const id = ++guideSerial.current;
    setGuideBusy(true);
    setGuideLoading(false);
    setGuideError("");
    try {
      const p = await api<Onboarding>("/onboarding", "PUT", progress);
      if (id === guideSerial.current) setOnboarding(p);
    } catch (e) {
      if (id === guideSerial.current) setGuideError((e as Error).message);
    } finally {
      if (id === guideSerial.current) setGuideBusy(false);
    }
  }
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (
      aiTarget &&
      (aiTarget.symbol !== selected ||
        aiTarget.horizon !== settings.horizon ||
        aiTarget.language !== settings.language ||
        aiTarget.mode !== settings.mode)
    )
      setAiTarget(null);
  }, [selected, settings.horizon, settings.language, settings.mode, aiTarget]);
  function summarize(symbol: string) {
    openStock(symbol);
    setAiTarget({
      symbol,
      horizon: settings.horizon,
      language: settings.language,
      mode: settings.mode,
      nonce: Date.now(),
    });
  }
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [view, setView] = useState<View>("briefing");
  const navigationChosen = useRef(false);
  function navigate(next: View) {
    navigationChosen.current = true;
    setView(next);
  }
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("compass-auto-refresh"));
      return [1, 5, 15, 30].includes(saved) ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [quoteNow, setQuoteNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setQuoteNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const refreshing = useRef(false);
  const [mobile, setMobile] = useState(false);
  const [revision, setRevision] = useState(0);
  const [bootReady, setBootReady] = useState(false);
  const bootPending = useRef(true);
  const [dataRevision, setDataRevision] = useState(0);
  const serial = useRef(0);
  const settingsSerial = useRef(0);
  const current = useRef({ selected, settings, revision });
  current.current = { selected, settings, revision };
  const notify = (m: string) => setToast(m);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  async function refreshWatch(mode = settings.mode) {
    const context = current.current;
    const w = await api<Watch[]>(`/watchlist?mode=${mode}`);
    if (
      current.current.settings.mode === mode &&
      current.current.revision === context.revision &&
      current.current.settings.horizon === context.settings.horizon &&
      current.current.settings.benchmark === context.settings.benchmark
    )
      updateWatch(w);
    return w;
  }
  useEffect(() => {
    if (revision > 0) refreshWatch().catch((e) => notify(e.message));
  }, [revision]);
  useEffect(() => {
    let live = true;
    api<Settings>("/settings")
      .then(async (s) => {
        if (!live) return;
        setSettings(s);
        if (!navigationChosen.current)
          setView(
            s.preferred_workspace === "long_term" ? "long-term" : "briefing",
          );
        setBootReady(true);
        const w = await api<Watch[]>(`/watchlist?mode=${s.mode}`);
        if (live) {
          updateWatch(w);
          setSelected(w[0]?.symbol || "");
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const id = ++serial.current;
    if (!selected) {
      setAnalysis(null);
      setLoading("");
      return;
    }
    if (bootReady && bootPending.current) return;
    setAnalysis(null);
    setError("");
    setLoading("Loading completed bars and calculating locally…");
    api<Analysis>(`/analysis/${selected}`)
      .then(async (a) => {
        if (id === serial.current) {
          setAnalysis(a);
          setLoading("");
          await refreshWatch(a.instrument.synthetic ? "demo" : "live");
        }
      })
      .catch((e) => {
        if (id === serial.current) {
          setError(e.message);
          setLoading("");
        }
      });
  }, [selected, settings.horizon, settings.benchmark, settings.mode, revision]);
  async function changeSettings(s: Settings) {
    const id = ++settingsSerial.current;
    const r = await api<Settings>("/settings", "PUT", s);
    if (id !== settingsSerial.current) return;
    setSettings(r);
    if (r.mode !== settings.mode) {
      setAnalysis(null);
      setSelected("");
      const w = await refreshWatch(r.mode);
      if (
        id === settingsSerial.current &&
        current.current.settings.mode === r.mode &&
        !current.current.selected
      )
        setSelected(w[0]?.symbol || "");
      navigate("briefing");
    }
    return;
  }
  async function changeMode(mode: "demo" | "live") {
    try {
      await changeSettings({ ...settings, mode });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function changeLanguage(language: Language) {
    if (languageBusy || settings.language === language) return;
    setLanguageBusy(true);
    try {
      await changeSettings({ ...current.current.settings, language });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLanguageBusy(false);
    }
  }
  function openStock(s: string) {
    setSelected(s);
    navigate("detail");
    setTab("overview");
    setMobile(false);
    window.scrollTo({ top: 0 });
  }
  async function refresh(all = false) {
    if (refreshing.current || !selected) return;
    refreshing.current = true;
    const id = ++serial.current;
    const target = selected;
    setBusy(true);
    setError("");
    try {
      let last: Analysis | null = null;
      const symbols = all
        ? [
            selected,
            ...watch.map((w) => w.symbol).filter((s) => s !== selected),
          ]
        : [selected];
      let refreshBenchmark = true;
      for (const s of symbols) {
        try {
          const a = await api<Analysis>(
            `/analysis/${s}?refresh=true&refresh_benchmark=${refreshBenchmark}`,
          );
          refreshBenchmark = false;
          if (s === selected) last = a;
        } catch (e) {
          notify(`${s}: ${(e as Error).message}`);
          if (s === target && id === serial.current)
            setError((e as Error).message);
        }
      }
      if (last && id === serial.current && current.current.selected === target)
        setAnalysis(last);
      await refreshWatch();
      setDataRevision((n) => n + 1);
    } finally {
      if (id === serial.current) setLoading("");
      refreshing.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!bootReady || !selected || !bootPending.current) return;
    bootPending.current = false;
    setLoading("Loading completed bars and calculating locally…");
    void refresh(true).catch((e) => {
      setError((e as Error).message);
      setLoading("");
    });
  }, [bootReady, selected]);
  useAutoRefresh(autoRefresh, async () => {
    if (busy || loading) return;
    try {
      await refresh(true);
    } catch (e) {
      notify((e as Error).message);
    }
  });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAddError("");
    try {
      await api("/watchlist", "POST", { symbol });
      const mode = symbol.toUpperCase().startsWith("DEMO_") ? "demo" : "live";
      if (mode !== settings.mode) await changeSettings({ ...settings, mode });
      await refreshWatch(mode);
      setSelected(symbol.toUpperCase().trim());
      setAddOpen(false);
      setSymbol("");
      notify("Ticker added and saved locally.");
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(s: string) {
    try {
      await api(`/watchlist/${s}`, "DELETE");
      const w = await refreshWatch();
      if (selected === s) setSelected(w[0]?.symbol || "");
      notify(`${s} removed from this watchlist.`);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function snapshot() {
    const id = serial.current;
    const target = selected;
    try {
      await api(`/snapshots/${target}`, "POST");
      notify(
        "Analysis snapshot saved locally. Future changes will be compared with this record.",
      );
      const saved = await api<Analysis>(`/analysis/${target}`);
      if (id === serial.current && current.current.selected === target)
        setAnalysis(saved);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const count = watch.filter(
    (w) => w.label === "Buy setup worth considering",
  ).length;
  const waiting = watch.filter(
    (w) => w.label === "Wait for confirmation",
  ).length;
  const evaluated = watch.filter((w) => w.status === "available").length;
  const market = analysis?.relative.returns["1 month"];
  const quote = analysis ? analysisQuote(analysis, quoteNow) : null;
  return (
    <LanguageProvider language={settings.language || "en"}>
      <div className="app-shell">
        <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("briefing");
            }}
          >
            <div className="brand-mark">
              <Compass size={25} />
            </div>
            <div>
              {t("stock compass")}
              <span>{t("RESEARCH WITH PERSPECTIVE")}</span>
            </div>
          </a>
          <div className="workspace-label">{t("PERSONAL WORKSPACE")}</div>
          <nav>
            {(
              [
                ["briefing", LayoutDashboard, "Research briefing"],
                ["long-term", TrendingUp, "Long-term planning"],
                ["events", Clock, "Earnings calendar"],
                ["compare", GitCompareArrows, "Compare stocks"],
                ["journal", BookOpen, "Research journal"],
                ["settings", SettingsIcon, "Settings & data"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                className={view === key ? "nav-item active" : "nav-item"}
                onClick={() => {
                  navigate(key);
                  setMobile(false);
                }}
              >
                <Icon size={18} />
                {t(label)}
                {view === key && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-watch">
            <div className="sidebar-caption">
              <span>{t("YOUR WATCHLIST")}</span>
              <button
                aria-label={t("Add ticker")}
                onClick={() => setAddOpen(true)}
              >
                <Plus size={16} />
              </button>
            </div>
            {watch.map((w) => (
              <button
                className={
                  selected === w.symbol && view === "detail"
                    ? "sidebar-stock selected"
                    : "sidebar-stock"
                }
                key={w.symbol}
                onClick={() => openStock(w.symbol)}
              >
                <span className="ticker-initial">
                  {w.symbol.replace("DEMO_", "").slice(0, 1)}
                </span>
                <span>
                  {w.symbol.replace("DEMO_", "")}
                  <small>
                    {w.symbol.startsWith("DEMO_")
                      ? t("Synthetic example")
                      : w.instrument?.name || t("Awaiting market data")}
                  </small>
                </span>
                <span
                  className={
                    (usableQuote(
                      w.quote,
                      w.provenance?.last_completed_bar,
                      quoteNow,
                    )?.change_percent ??
                      w.change ??
                      0) >= 0
                      ? "stock-change positive"
                      : "stock-change negative"
                  }
                >
                  {pct(
                    usableQuote(
                      w.quote,
                      w.provenance?.last_completed_bar,
                      quoteNow,
                    )?.change_percent ?? w.change,
                  )}
                  {usableQuote(
                    w.quote,
                    w.provenance?.last_completed_bar,
                    quoteNow,
                  ) && (
                    <small
                      title={t("Timestamped provider quote; may be delayed.")}
                    >
                      {t("today")}
                    </small>
                  )}
                </span>
              </button>
            ))}
            {!watch.length && (
              <p className="small muted">{t("Add an instrument to begin.")}</p>
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="local-status">
              <ShieldCheck size={16} />
              <span>
                {t("Private. Local. Yours.")}
                <small>{t("Research stays on this Mac.")}</small>
              </span>
            </div>
            <div className="sidebar-footer">
              {t("Daily research · No order execution")}
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="mobile-menu"
                aria-label={t("Open navigation")}
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={20} />
              </button>
              <span>{t("Workspace")}</span>
              <ChevronRight size={13} />
              <strong>
                {view === "detail"
                  ? selected.replace("DEMO_", "")
                  : t(
                      {
                        briefing: "Research briefing",
                        "long-term": "Long-term planning",
                        events: "Earnings calendar",
                        compare: "Compare stocks",
                        journal: "Research journal",
                        settings: "Settings & data",
                      }[view],
                    )}
              </strong>
            </div>
            <div className="topbar-right">
              <label className="auto-refresh-control">
                {t("Auto-refresh")}
                <select
                  aria-label={t("Auto-refresh interval")}
                  title={t(
                    "Pauses while this tab is hidden. Current-session quotes may be delayed; technical decisions use completed bars.",
                  )}
                  value={autoRefresh}
                  onChange={(e) => {
                    const minutes = Number(e.target.value);
                    setAutoRefresh(minutes);
                    try {
                      localStorage.setItem(
                        "compass-auto-refresh",
                        String(minutes),
                      );
                    } catch {
                      // Refresh still works when browser storage is unavailable.
                    }
                  }}
                >
                  <option value={0}>{t("Off")}</option>
                  <option value={1}>{t("1 minute")}</option>
                  <option value={5}>{t("5 minutes")}</option>
                  <option value={15}>{t("15 minutes")}</option>
                  <option value={30}>{t("30 minutes")}</option>
                </select>
              </label>
              <span className="local-pill">
                <i />
                {t("Local service")}
              </span>
              <div className="mode-toggle">
                <button
                  className={settings.mode === "demo" ? "active" : ""}
                  onClick={() => changeMode("demo")}
                >
                  <FlaskConical size={14} />
                  {t("Demo")}
                </button>
                <button
                  className={settings.mode === "live" ? "active" : ""}
                  onClick={() => changeMode("live")}
                >
                  {t("Live research")}
                </button>
              </div>
              <div
                className="language-switch"
                role="group"
                aria-label={t("Interface language")}
              >
                <button
                  type="button"
                  lang="en"
                  aria-label="English"
                  aria-pressed={settings.language === "en"}
                  className={settings.language === "en" ? "active" : ""}
                  disabled={languageBusy}
                  onClick={() => changeLanguage("en")}
                >
                  ENG
                </button>
                <button
                  type="button"
                  lang="pl"
                  aria-label="Polski"
                  aria-pressed={settings.language === "pl"}
                  className={settings.language === "pl" ? "active" : ""}
                  disabled={languageBusy}
                  onClick={() => changeLanguage("pl")}
                >
                  PL
                </button>
              </div>
            </div>
          </header>
          <main>
            {settings.mode === "demo" && (
              <div className="demo-banner">
                <FlaskConical size={16} />
                <span>
                  <strong>{t("Synthetic demo workspace")}</strong>{" "}
                  {t(
                    "· Reproducible examples, not real prices or company facts.",
                  )}
                </span>
                <button onClick={() => changeMode("live")}>
                  {t("Explore real stocks")}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            <BeginnerGuide
              progress={onboarding}
              preferences={settings}
              analysis={analysis}
              onProgress={(p) => void saveGuide(p)}
              busy={guideBusy}
              loading={guideLoading}
              onRetry={() => void loadGuide()}
              error={guideError}
              onResearch={() =>
                selected ? openStock(selected) : navigate("briefing")
              }
              onPlanning={() => {
                navigate("long-term");
                setMobile(false);
              }}
              onDemo={() =>
                void changeSettings({
                  ...current.current.settings,
                  mode: "demo",
                })
                  .then(() => openStock("DEMO_TREND"))
                  .catch((e) => notify(e.message))
              }
            />
            {view === "briefing" && (
              <>
                <div className="page-heading heading-row">
                  <div>
                    <span className="eyebrow">
                      {t("A LITTLE CLARITY. A BETTER NEXT QUESTION.")}
                    </span>
                    <h1>{t("A clearer view of your watchlist.")}</h1>
                    <p>
                      {t(
                        "Understand the evidence, weigh the uncertainty, and know what to watch next.",
                      )}
                    </p>
                  </div>
                  <div className="heading-actions">
                    <button
                      className="secondary"
                      onClick={() => refresh(true)}
                      disabled={busy || !watch.length}
                    >
                      <RefreshCw size={15} className={busy ? "spinning" : ""} />
                      {t(busy ? "Refreshing…" : "Refresh watchlist")}
                    </button>
                    <button
                      className="primary"
                      onClick={() => setAddOpen(true)}
                    >
                      <Plus size={16} />
                      {t("Add ticker")}
                    </button>
                  </div>
                </div>
                <div className="briefing-stats">
                  <div className="stat-card">
                    <div className="stat-label">
                      <TrendingUp size={17} />
                      {t("Setups worth a closer look")}
                    </div>
                    <div className="stat-value">
                      {count}
                      <span>
                        {t("of")} {watch.length} {t("instruments")}
                      </span>
                    </div>
                    <p>{t("Confirmed rule + defensible scenario")}</p>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">
                      <Clock size={17} />
                      {t("Patience has a place")}
                    </div>
                    <div className="stat-value">
                      {waiting}
                      <span>{t("waiting for confirmation")}</span>
                    </div>
                    <p>{t("Missing conditions are stated explicitly")}</p>
                  </div>
                  <div className="stat-card market-stat">
                    <div className="stat-label">
                      <Activity size={17} />
                      {t(
                        settings.mode === "demo"
                          ? "Synthetic market context"
                          : `${settings.benchmark} market context`,
                      )}
                    </div>
                    <div className="stat-value">
                      {market ? pct(market.benchmark) : "—"}
                      <span>{t("1-month aligned return")}</span>
                    </div>
                    <p>
                      {market
                        ? t("Completed sessions through {date}", {
                            date: date(market.end),
                          })
                        : t("Benchmark unavailable until history is loaded")}
                    </p>
                  </div>
                </div>
                <section className="card watch-card">
                  <div className="section-title">
                    <div>
                      <h2>{t("Your watchlist")}</h2>
                      <p>
                        {t(
                          "Ranked by transparent setup criteria, within this list only.",
                        )}
                      </p>
                    </div>
                    <div className="horizon-select">
                      <label>
                        {t("Research horizon")}
                        <select
                          aria-label={t("Research horizon")}
                          value={settings.horizon}
                          onChange={(e) =>
                            changeSettings({
                              ...settings,
                              horizon: e.target.value,
                            }).catch((e) => notify(e.message))
                          }
                        >
                          {HORIZONS.map((horizon) => (
                            <option key={horizon} value={horizon}>
                              {t(horizon)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="watch-table">
                      <thead>
                        <tr>
                          <th>{t("Instrument")}</th>
                          <th>{t("Price")}</th>
                          <th>{t("Change")}</th>
                          <th>{t("Daily trend")}</th>
                          <th>{t("Setup assessment")}</th>
                          <th>{t("Event context")}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {watch.map((w) => (
                          <tr
                            key={w.symbol}
                            className={w.symbol === selected ? "focused" : ""}
                          >
                            <td>
                              <button
                                className="instrument-button"
                                onClick={() => openStock(w.symbol)}
                              >
                                <span className="ticker-avatar">
                                  {w.symbol.replace("DEMO_", "").slice(0, 1)}
                                </span>
                                <span>
                                  <strong>{w.symbol}</strong>
                                  <small>
                                    {w.instrument?.name
                                      ? w.instrument.synthetic
                                        ? t(w.instrument.name)
                                        : w.instrument.name
                                      : t(
                                          "Open to request verified market data",
                                        )}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              {w.close != null ? (
                                <>
                                  <strong>
                                    $
                                    {fmt(
                                      usableQuote(
                                        w.quote,
                                        w.provenance?.last_completed_bar,
                                        quoteNow,
                                      )?.price ?? w.close,
                                    )}
                                  </strong>
                                  {usableQuote(
                                    w.quote,
                                    w.provenance?.last_completed_bar,
                                    quoteNow,
                                  ) ? (
                                    <>
                                      <small
                                        title={t(
                                          "Timestamped provider quote; may be delayed.",
                                        )}
                                      >
                                        {t("Today · provisional")}
                                      </small>
                                      <small>
                                        {t("As of {time}", {
                                          time: new Intl.DateTimeFormat(
                                            locale,
                                            {
                                              month: "numeric",
                                              day: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            },
                                          ).format(
                                            new Date(w.quote!.market_time),
                                          ),
                                        })}
                                      </small>
                                      <small>
                                        {t("Daily close {price}", {
                                          price: `$${fmt(w.close)}`,
                                        })}{" "}
                                        · {w.provenance?.last_completed_bar}
                                      </small>
                                    </>
                                  ) : (
                                    <small>
                                      {t("Completed daily bar")}{" "}
                                      {w.provenance?.last_completed_bar}
                                      {w.provenance?.retrieved_at
                                        ? ` · ${t("Retrieved")} ${date(w.provenance.retrieved_at, true)}`
                                        : ""}
                                    </small>
                                  )}
                                </>
                              ) : (
                                <button
                                  className="text-button"
                                  onClick={() => openStock(w.symbol)}
                                >
                                  {t("Load analysis")}
                                  <ArrowUpRight size={13} />
                                </button>
                              )}
                            </td>
                            <td
                              className={
                                (usableQuote(
                                  w.quote,
                                  w.provenance?.last_completed_bar,
                                  quoteNow,
                                )?.change_percent ??
                                  w.change ??
                                  0) >= 0
                                  ? "positive"
                                  : "negative"
                              }
                            >
                              {pct(
                                usableQuote(
                                  w.quote,
                                  w.provenance?.last_completed_bar,
                                  quoteNow,
                                )?.change_percent ?? w.change,
                              )}
                              <small>
                                {t(
                                  usableQuote(
                                    w.quote,
                                    w.provenance?.last_completed_bar,
                                    quoteNow,
                                  )
                                    ? "Today · provisional"
                                    : "Completed daily",
                                )}
                              </small>
                            </td>
                            <td>
                              <span className="trend-text">
                                {t(w.trend || "Unknown")}
                              </span>
                            </td>
                            <td>
                              <Badge label={w.label} />
                              {w.status === "available" && (
                                <details className="score-detail">
                                  <summary>
                                    {t("Why this rank ·")} {w.score}/100
                                  </summary>
                                  <p>
                                    {t(
                                      "Heuristic setup score; not a profit probability.",
                                    )}
                                  </p>
                                  {w.contributions?.map((c) => (
                                    <p key={c.group}>
                                      <b>
                                        {t(c.group)} {c.points}/{c.maximum}
                                      </b>
                                      <br />
                                      {t(c.reason)}
                                    </p>
                                  ))}
                                </details>
                              )}
                            </td>
                            <td>
                              <EarningsStatus row={w.earnings} compact />
                              <small>
                                {w.timestamp
                                  ? t("Analyzed {time}", {
                                      time: new Date(
                                        w.timestamp,
                                      ).toLocaleTimeString(locale, {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }),
                                    })
                                  : t("Not analyzed")}
                              </small>
                            </td>
                            <td>
                              <AiSummaryButton
                                symbol={w.symbol}
                                status={aiStatus}
                                onClick={() => summarize(w.symbol)}
                              />
                              <button
                                className="icon-button remove"
                                aria-label={t("Remove {symbol}", {
                                  symbol: w.symbol,
                                })}
                                onClick={() => remove(w.symbol)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-foot">
                    <Info size={13} />
                    <span>
                      {evaluated} {t("of")} {watch.length}{" "}
                      {t(
                        "instruments evaluated. No qualifying setup is a valid conclusion. Ranking is research triage, not a claim about the entire market.",
                      )}
                    </span>
                  </div>
                </section>
                {loading && <Loading text={loading} />}
                {error && <ErrorState error={error} retry={() => refresh()} />}
                {analysis && (
                  <div className="briefing-focus">
                    <section className="card">
                      <div className="section-title">
                        <div>
                          <span className="eyebrow">{t("IN FOCUS")}</span>
                          <h2>{analysis.instrument.symbol}</h2>
                          <p>
                            {analysis.instrument.synthetic
                              ? t(analysis.instrument.name)
                              : analysis.instrument.name}
                          </p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => openStock(selected)}
                        >
                          {t("Explore analysis")}
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                      {settings.experience === "beginner" ? (
                        <>
                          <BeginnerSummary analysis={analysis} />
                          <details className="evidence-disclosure">
                            <summary>{t("Explore the evidence")}</summary>
                            <PriceChart analysis={analysis} compact />
                          </details>
                        </>
                      ) : (
                        <PriceChart analysis={analysis} compact />
                      )}
                    </section>
                    {settings.experience !== "beginner" && (
                      <div className="focus-summary">
                        <span className="eyebrow">
                          {t("WHAT THE EVIDENCE SAYS")}
                        </span>
                        <Badge label={analysis.assessment.label} />
                        <h2>
                          {t(
                            analysis.assessment.label === "Unfavorable setup"
                              ? "Wait for the trend to repair."
                              : analysis.assessment.label ===
                                  "Buy setup worth considering"
                                ? "A conditional idea to research."
                                : "Let the setup come to you.",
                          )}
                        </h2>
                        <p>{t(analysis.assessment.summary)}</p>
                        <div className="next-watch">
                          <span className="eyebrow">
                            {t("YOUR NEXT CONDITION")}
                          </span>
                          <p>{t(analysis.assessment.next_condition)}</p>
                        </div>
                        <button
                          className="primary"
                          onClick={() => openStock(selected)}
                        >
                          {t("See the reasoning")}
                          <ArrowRight size={16} />
                        </button>
                        <div className="focus-foot">
                          <ShieldCheck size={15} />
                          {t(
                            "Deterministic setup assessment. Optional AI interpretation.",
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="learning-strip">
                  <BookOpen size={21} />
                  <div>
                    <strong>
                      {t("Good research is more than a green indicator.")}
                    </strong>
                    <p>
                      {t(
                        "A low RSI alone does not establish a good entry. Start with trend, structure, confirmation, and what would prove the idea wrong.",
                      )}
                    </p>
                  </div>
                </div>
              </>
            )}
            {view === "detail" && (
              <>
                {loading && <Loading text={loading} />}
                {error && <ErrorState error={error} retry={() => refresh()} />}
                {analysis && (
                  <>
                    <div className="page-heading heading-row stock-heading">
                      <div>
                        <span className="eyebrow">
                          {analysis.instrument.exchange} ·{" "}
                          {analysis.instrument.currency} ·{" "}
                          {t(
                            analysis.instrument.synthetic
                              ? "SYNTHETIC INSTRUMENT"
                              : analysis.instrument.instrument_type,
                          )}
                        </span>
                        <h1>
                          {analysis.instrument.symbol}
                          <span>
                            {analysis.instrument.synthetic
                              ? t(analysis.instrument.name)
                              : analysis.instrument.name}
                          </span>
                        </h1>
                        <div className="stock-price">
                          ${fmt(quote?.price ?? analysis.metrics.Close)}
                          <span
                            className={
                              (quote?.change_percent ??
                                analysis.metrics.daily_change ??
                                0) >= 0
                                ? "positive"
                                : "negative"
                            }
                          >
                            {pct(
                              quote?.change_percent ??
                                analysis.metrics.daily_change,
                            )}{" "}
                            {t(
                              quote ? "today · provisional" : "completed daily",
                            )}
                          </span>
                          <small>
                            {quote ? (
                              <>
                                {t("Provider quote · as of {time}", {
                                  time: date(quote.market_time, true),
                                })}{" "}
                                ·{" "}
                                {t("Completed close {price} on {day}", {
                                  price: `$${fmt(analysis.metrics.Close)}`,
                                  day:
                                    analysis.provenance.last_completed_bar ||
                                    "—",
                                })}
                              </>
                            ) : (
                              <>
                                {t("Completed session")}{" "}
                                {analysis.provenance.last_completed_bar}
                              </>
                            )}
                          </small>
                        </div>
                      </div>
                      <div className="heading-actions">
                        <AiSummaryButton
                          symbol={analysis.instrument.symbol}
                          status={aiStatus}
                          onClick={() => summarize(analysis.instrument.symbol)}
                        />
                        <button className="secondary" onClick={snapshot}>
                          <Save size={15} />
                          {t("Save snapshot")}
                        </button>
                        <a
                          className="secondary button"
                          download
                          href={`/api/export/${selected}?language=${settings.language}`}
                        >
                          <Download size={15} />
                          {t("Export")}
                        </a>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => refresh()}
                          aria-label={t("Refresh selected stock")}
                        >
                          <RefreshCw
                            size={16}
                            className={busy ? "spinning" : ""}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="provenance-bar">
                      <ShieldCheck size={14} />
                      <span>
                        {analysis.engine} ·{" "}
                        {basis(analysis.provenance.price_basis)} ·{" "}
                        {t(analysis.provenance.cache ? "Cached" : "Retrieved")}{" "}
                        {date(analysis.provenance.retrieved_at, true)} ·{" "}
                        {analysis.provenance.source}
                      </span>
                    </div>
                    <div className="stock-tabs" role="tablist">
                      {(
                        [
                          "overview",
                          "indicators",
                          "backtests",
                          "research",
                        ] as Tab[]
                      ).map((tabKey) => (
                        <button
                          role="tab"
                          aria-selected={tab === tabKey}
                          className={tab === tabKey ? "active" : ""}
                          key={tabKey}
                          onClick={() => setTab(tabKey)}
                        >
                          {t(
                            tabKey === "overview"
                              ? "Overview"
                              : tabKey === "indicators"
                                ? "Indicators & learning"
                                : tabKey === "backtests"
                                  ? "Historical evidence"
                                  : "Research & sizing",
                          )}
                        </button>
                      ))}
                      <select
                        aria-label={t("Detail research horizon")}
                        value={settings.horizon}
                        onChange={(e) =>
                          changeSettings({
                            ...settings,
                            horizon: e.target.value,
                          }).catch((e) => notify(e.message))
                        }
                      >
                        {HORIZONS.map((horizon) => (
                          <option key={horizon} value={horizon}>
                            {t(horizon)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {analysis.assessment.data_quality.issues.length > 0 && (
                      <div
                        className={
                          analysis.assessment.data_quality.actionable
                            ? "notice"
                            : "quality-warning"
                        }
                      >
                        <AlertCircle size={17} />
                        <div>
                          <strong>
                            {t(
                              analysis.assessment.data_quality.actionable
                                ? "Data limitations"
                                : "Actionable assessment suppressed",
                            )}
                          </strong>
                          {analysis.assessment.data_quality.issues.map((x) => (
                            <p key={x}>{t(x)}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {tab === "overview" && (
                      <>
                        {settings.experience === "beginner" && (
                          <BeginnerSummary analysis={analysis} />
                        )}
                        <details
                          className={
                            settings.experience === "beginner"
                              ? "evidence-disclosure"
                              : "advanced-evidence"
                          }
                          open={
                            settings.experience === "beginner"
                              ? undefined
                              : true
                          }
                        >
                          <summary>{t("Explore the evidence")}</summary>
                          <div className="overview-grid">
                            <section className="card chart-card">
                              <div className="section-title">
                                <h3>{t("Price, participation & structure")}</h3>
                                <Badge label={analysis.assessment.label} />
                              </div>
                              <PriceChart
                                analysis={analysis}
                                autoRefresh={autoRefresh}
                              />
                            </section>
                            <section className="card assessment-card">
                              <span className="eyebrow">
                                {t("PLAIN-ENGLISH ASSESSMENT")}
                              </span>
                              <h2>{t(analysis.assessment.label)}</h2>
                              <p>{t(analysis.assessment.summary)}</p>
                              <div className="next-watch">
                                <span className="eyebrow">
                                  {t("WHAT TO WATCH NEXT")}
                                </span>
                                <p>{t(analysis.assessment.next_condition)}</p>
                              </div>
                              <div className="context-lines">
                                <span>
                                  {t("Research horizon")}
                                  <b>{t(analysis.assessment.horizon)}</b>
                                </span>
                                <span>
                                  {t("Completed weekly context")}
                                  <b
                                    className={
                                      analysis.weekly.trend === "Bullish"
                                        ? "positive"
                                        : "muted"
                                    }
                                  >
                                    {t(analysis.weekly.trend)}
                                  </b>
                                </span>
                                <span>
                                  {t("Weekly bar")}
                                  <b>
                                    {analysis.weekly.last_bar
                                      ? date(analysis.weekly.last_bar)
                                      : t("Unavailable")}
                                  </b>
                                </span>
                                <span>
                                  {t("Rules")}
                                  <b>{analysis.assessment.rule_version}</b>
                                </span>
                              </div>
                              <p className="small muted horizon-scope">
                                {t(analysis.assessment.horizon_scope)}
                              </p>
                              <EarningsStatus row={analysis.earnings} compact />
                            </section>
                          </div>
                          <div className="evidence-grid">
                            <section className="card">
                              <div className="section-title">
                                <CheckCircle2 size={19} className="positive" />
                                <h3>{t("Facts supporting a long idea")}</h3>
                              </div>
                              <ul className="evidence-list">
                                {analysis.assessment.supporting.map((x) => (
                                  <li key={x}>{t(x)}</li>
                                ))}
                              </ul>
                            </section>
                            <section className="card">
                              <div className="section-title">
                                <AlertCircle size={19} className="amber-text" />
                                <h3>{t("Facts asking for caution")}</h3>
                              </div>
                              <ul className="evidence-list caution">
                                {analysis.assessment.opposing.map((x) => (
                                  <li key={x}>{t(x)}</li>
                                ))}
                              </ul>
                            </section>
                          </div>
                          <ScenarioCard a={analysis} />
                          <div className="evidence-grid">
                            <section className="card">
                              <h3>{t("Against the market benchmark")}</h3>
                              <p className="muted">
                                {t("Return relative to")} {analysis.benchmark}{" "}
                                {t(
                                  "is separate from the RSI momentum indicator.",
                                )}
                              </p>
                              {analysis.relative.status === "available" ? (
                                <>
                                  <div className="relative-grid">
                                    {Object.entries(
                                      analysis.relative.returns,
                                    ).map(([name, r]) => (
                                      <div key={name}>
                                        <span>{t(name)}</span>
                                        <strong
                                          className={
                                            (r?.excess || 0) >= 0
                                              ? "positive"
                                              : "negative"
                                          }
                                        >
                                          {r
                                            ? `${fmt(r.excess)} ${t("pp")}`
                                            : t("Unavailable")}
                                        </strong>
                                        <small>
                                          {r
                                            ? t(
                                                "Stock {return} · {benchmark} {market}",
                                                {
                                                  return: pct(r.stock),
                                                  benchmark: analysis.benchmark,
                                                  market: pct(r.benchmark),
                                                },
                                              )
                                            : t("Not enough aligned sessions")}
                                        </small>
                                      </div>
                                    ))}
                                  </div>
                                  <LineChart
                                    series={analysis.relative.series}
                                    labels={[
                                      analysis.instrument.symbol,
                                      analysis.benchmark,
                                    ]}
                                    percent
                                    height={220}
                                  />
                                </>
                              ) : (
                                <div className="notice">
                                  {t(analysis.relative.reason || "Unavailable")}
                                </div>
                              )}
                            </section>
                            <Context a={analysis} notify={notify} />
                          </div>
                          {analysis.changes.length > 0 && (
                            <section className="card">
                              <h3>{t("Since your saved analysis")}</h3>
                              {analysis.changes.map((x) => (
                                <p key={x}>{t(x)}</p>
                              ))}
                            </section>
                          )}
                        </details>
                      </>
                    )}
                    {tab === "indicators" && (
                      <>
                        <section className="card">
                          <h3>
                            {t("Lessons from")} {analysis.instrument.symbol}
                          </h3>
                          <div className="contextual-lessons">
                            {analysis.lessons.map((l) => (
                              <div key={l.title}>
                                <h4>{t(l.title)}</h4>
                                <p>{t(l.text)}</p>
                                <a
                                  href={l.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {t("Learn more")} <ArrowUpRight size={12} />
                                </a>
                              </div>
                            ))}
                          </div>
                        </section>
                        <section className="card">
                          <div className="section-title">
                            <h3>
                              {t("Understand the reading, then its role.")}
                            </h3>
                            <span className="eyebrow">
                              {analysis.engine.toUpperCase()}
                            </span>
                          </div>
                          <p className="muted">
                            {t("Values are calculated locally from")}{" "}
                            {analysis.assessment.data_quality.bars}{" "}
                            {t(
                              "completed daily sessions. Unavailable values stay unavailable. Expand each metric for an explanation and a common mistake.",
                            )}
                          </p>
                          <div className="indicator-grid">
                            {analysis.education.map((e) => (
                              <details className="indicator" key={e.key}>
                                <summary>
                                  <span>{t(e.name)}</span>
                                  <strong>
                                    {t(
                                      e.reading == null
                                        ? "Unavailable"
                                        : fmt(
                                            e.reading,
                                            e.key === "volume_ratio" ? 2 : 2,
                                          ),
                                    )}
                                    {e.key === "volume_ratio" &&
                                    e.reading != null
                                      ? "×"
                                      : ""}
                                  </strong>
                                </summary>
                                <p>
                                  <b>{t("Measures:")}</b> {t(e.measures)}
                                </p>
                                <p>
                                  <b>{t("Role here:")}</b> {t(e.role)}
                                </p>
                                <p>
                                  <b>{t("Common mistake:")}</b> {t(e.mistake)}
                                </p>
                                <a
                                  href={e.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {t("Library reference")}
                                  <ArrowUpRight size={13} />
                                </a>
                              </details>
                            ))}
                          </div>
                        </section>
                        <section className="card">
                          <h3>{t("Causal support & resistance zones")}</h3>
                          <p className="muted">
                            {t(
                              "Two bars on each side confirm a swing. It becomes available two sessions after the pivot. Zones group pivots within 0.3 ATR over the preceding 125 sessions.",
                            )}
                          </p>
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>{t("Kind")}</th>
                                  <th>{t("Zone")}</th>
                                  <th>{t("Touches")}</th>
                                  <th>{t("Available after close")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {analysis.zones.map((z, n) => (
                                  <tr key={n}>
                                    <td>{t(z.kind)}</td>
                                    <td>
                                      {fmt(z.low)}–{fmt(z.high)}
                                    </td>
                                    <td>{z.touches}</td>
                                    <td>{z.available_date}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {!analysis.zones.length && (
                            <p>
                              {t("No confirmed swing zones in this history.")}
                            </p>
                          )}
                        </section>
                        <section className="card">
                          <h3>{t("Candle observations")}</h3>
                          {analysis.patterns.length ? (
                            analysis.patterns.map((p) => (
                              <p key={p.name}>
                                <strong>
                                  {t(p.name)}: {t(p.direction)}.
                                </strong>{" "}
                                {t(p.context)}
                              </p>
                            ))
                          ) : (
                            <p className="muted">
                              {t(
                                "No selected TA-Lib candle pattern on the latest completed session. A pattern alone never changes the recommendation.",
                              )}
                            </p>
                          )}
                          <p className="small muted">
                            {t(
                              "Selection: engulfing, hammer and shooting star.",
                            )}{" "}
                            <a
                              href="https://ta-lib.github.io/ta-lib-python/func_groups/pattern_recognition.html"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("TA-Lib pattern reference")}
                            </a>
                          </p>
                        </section>
                        <section className="card">
                          <h3>{t("How watchlist sorting works")}</h3>
                          <p className="muted">
                            {t("Heuristic setup score:")}{" "}
                            {analysis.assessment.score}
                            {t(
                              "/100, not a probability. Moving averages are one correlated group. Candles and ADX do not add score.",
                            )}
                          </p>
                          {analysis.assessment.contributions.map((c) => (
                            <div className="score-row" key={c.group}>
                              <b>{t(c.group)}</b>
                              <div>
                                <div className="score-track">
                                  <i
                                    style={{
                                      width: `${(c.points / c.maximum) * 100}%`,
                                    }}
                                  />
                                </div>
                                <small>{t(c.reason)}</small>
                              </div>
                              <span>
                                {c.points}/{c.maximum}
                              </span>
                            </div>
                          ))}
                        </section>
                      </>
                    )}
                    {tab === "backtests" && (
                      <Historical
                        a={analysis}
                        settings={settings}
                        onSettings={changeSettings}
                        notify={notify}
                      />
                    )}
                    {tab === "research" && (
                      <Research a={analysis} notify={notify} />
                    )}
                  </>
                )}
              </>
            )}
            {bootReady && (
              <div hidden={view !== "long-term"}>
                <LongTerm notify={notify} />
              </div>
            )}
            {view === "events" && (
              <Events
                mode={settings.mode}
                dataRevision={dataRevision}
                watchRevision={watchRevision}
                onOpenStock={openStock}
              />
            )}
            {view === "compare" && (
              <Comparison
                key={revision}
                watch={watch}
                notify={notify}
                dataRevision={dataRevision}
              />
            )}
            {view === "journal" && <Journal notify={notify} />}
            {view === "settings" && (
              <Configuration
                settings={settings}
                onSettings={changeSettings}
                notify={notify}
                onRestartGuide={async () => {
                  await saveGuide({
                    version: 1,
                    path: "research",
                    step: 0,
                    state: "active",
                  });
                }}
                onImport={() => {
                  setAnalysis(null);
                  setRevision((n) => n + 1);
                }}
              />
            )}
            <footer className="page-footer">
              <span>
                <Compass size={14} />
                {t("Stock Compass · Personal research")}
              </span>
              <span>
                {t(
                  "Conditions over conviction. Historical evidence is not a forecast.",
                )}
              </span>
            </footer>
          </main>
        </div>
        {toast && (
          <div className="toast" role="status">
            <Info size={17} />
            <span>{t(toast)}</span>
            <button
              aria-label={t("Dismiss notification")}
              onClick={() => setToast("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {addOpen && (
          <div
            className="modal-backdrop"
            onClick={() => !busy && setAddOpen(false)}
          >
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-title"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="modal-close icon-button"
                aria-label={t("Close add ticker")}
                onClick={() => setAddOpen(false)}
              >
                <X size={20} />
              </button>
              <div className="modal-symbol">
                <Plus size={23} />
              </div>
              <h2 id="add-title">{t("A stock worth understanding.")}</h2>
              <p>
                {t(
                  "US-listed stocks, ETFs and ADRs. We verify real symbols with the provider before adding them.",
                )}
              </p>
              <form onSubmit={add}>
                <label>
                  {t("Ticker symbol")}
                  <input
                    autoFocus
                    aria-label={t("Ticker symbol")}
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder={
                      settings.mode === "demo" ? "DEMO_RANGE" : t("e.g. AAPL")
                    }
                    required
                    maxLength={20}
                  />
                </label>
                <div className="notice small">
                  {t(
                    "Demo examples: DEMO_TREND, DEMO_RANGE, DEMO_VOLATILE. A real symbol uses live data and may require a network request.",
                  )}
                </div>
                {addError && (
                  <div className="error" role="alert">
                    {t(addError)}
                  </div>
                )}
                <button
                  className="primary full-width"
                  disabled={busy}
                  type="submit"
                >
                  {t(busy ? "Verifying symbol…" : "Add to watchlist")}
                  <ArrowRight size={16} />
                </button>
              </form>
            </section>
          </div>
        )}
      </div>
      {aiTarget && (
        <AiSummaryPanel
          key={`${aiTarget.symbol}:${aiTarget.horizon}:${aiTarget.language}`}
          target={aiTarget}
          dataRevision={dataRevision + Math.floor(quoteNow / 60000)}
          onClose={() => setAiTarget(null)}
        />
      )}
    </LanguageProvider>
  );
}

function Loading({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <div className="loading-state">
      <RefreshCw className="spinning" size={20} />
      <span>{t(text)}</span>
    </div>
  );
}
function ErrorState({ error, retry }: { error: string; retry: () => void }) {
  const { t } = useI18n();
  return (
    <section className="error-state">
      <AlertCircle size={24} />
      <div>
        <h3>{t("Market data is unavailable.")}</h3>
        <p>{t(error)}</p>
        <p className="small">
          {t(
            "No placeholder prices were substituted. Demo, imported CSV, notes and cached history remain available.",
          )}
        </p>
        <button className="secondary" onClick={retry}>
          {t("Retry request")}
        </button>
      </div>
    </section>
  );
}
function ScenarioCard({ a }: { a: Analysis }) {
  const { t, fmt } = useI18n();
  const sc = a.assessment.scenario;
  return (
    <section className="card scenario-card">
      <div className="section-title">
        <h3>{t("A conditional research scenario")}</h3>
        <span className="eyebrow">{t("STRUCTURE + VOLATILITY")}</span>
      </div>
      {sc ? (
        <>
          <div className="scenario-levels">
            <div>
              <span>{t("Entry reference")}</span>
              <strong>
                ${fmt(sc.entry)}–{fmt(sc.entry_max)}
              </strong>
              <small>{t("Next-open price must be in range")}</small>
            </div>
            <ArrowRight size={20} />
            <div>
              <span>{t("Invalidation")}</span>
              <strong className="negative">${fmt(sc.stop)}</strong>
              <small>{t("Where the long idea breaks")}</small>
            </div>
            <div>
              <span>{t("Structural target zone")}</span>
              <strong>${fmt(sc.target)}</strong>
              <small>{t("Historical structure, not a forecast")}</small>
            </div>
            <div>
              <span>{t("Potential reward / risk")}</span>
              <strong>{fmt(sc.reward_risk)} : 1</strong>
              <small>{t("At the upper entry reference")}</small>
            </div>
          </div>
          <p className="muted">{t(sc.trigger)}</p>
          <details>
            <summary>{t("How these levels are derived")}</summary>
            <p>{t(sc.basis)}</p>
            <p>
              {t(
                "Reward/risk = (target − entry) / (entry − invalidation). This arithmetic does not include the probability of reaching either level. Costs and gaps can worsen the outcome.",
              )}
            </p>
          </details>
        </>
      ) : (
        <div className="no-scenario">
          <ShieldCheck size={23} />
          <div>
            <strong>{t("No defensible scenario to present.")}</strong>
            <p>
              {t(
                "The current data, signal or overhead structure cannot support a valid entry < target and stop < entry with at least 1.5 reward/risk. Withholding a scenario is part of the analysis.",
              )}
            </p>
          </div>
        </div>
      )}
      <p className="small muted">
        {t(
          "Research conditions do not establish personal suitability. A stop cannot guarantee a maximum loss during an opening gap.",
        )}
      </p>
    </section>
  );
}
