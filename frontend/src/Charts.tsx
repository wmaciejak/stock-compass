import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  TickMarkType,
  type Time,
  type IChartApi,
} from "lightweight-charts";
import type { Analysis, HourlyChart } from "./types";
import { api } from "./api";
import { useI18n } from "./i18n";
import { useAutoRefresh } from "./useAutoRefresh";

const colors = {
  green: "#246c56",
  red: "#a7493b",
  blue: "#3f6e87",
  gold: "#85611f",
  teal: "#087f8c",
};
const options = {
  layout: {
    background: { type: ColorType.Solid, color: "#ffffff" },
    textColor: "#344b3e",
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 14,
  },
  grid: { vertLines: { color: "#f0f2ed" }, horzLines: { color: "#f0f2ed" } },
  rightPriceScale: { borderColor: "#e9ede6" },
  timeScale: { borderColor: "#e9ede6", timeVisible: false },
  crosshair: { mode: CrosshairMode.Normal },
  handleScroll: true,
  handleScale: true,
};

export function PriceChart({
  analysis: a,
  compact = false,
  autoRefresh = 0,
}: {
  analysis: Analysis;
  compact?: boolean;
  autoRefresh?: number;
}) {
  const { t, fmt, basis, language, locale } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [interval, setInterval] = useState<"1d" | "1h">("1d");
  const [hourly, setHourly] = useState<HourlyChart | null>(null);
  const [hourlyBusy, setHourlyBusy] = useState(false);
  const [hourlyError, setHourlyError] = useState("");
  const hourlySerial = useRef(0);
  async function loadHourly(refresh = false) {
    const serial = ++hourlySerial.current;
    setHourlyBusy(true);
    setHourlyError("");
    try {
      const result = await api<HourlyChart>(
        `/chart/${a.instrument.symbol}?interval=1h&refresh=${refresh}`,
      );
      if (
        serial === hourlySerial.current &&
        result.symbol === a.instrument.symbol
      )
        setHourly(result);
    } catch (e) {
      if (serial === hourlySerial.current) setHourlyError((e as Error).message);
    } finally {
      if (serial === hourlySerial.current) setHourlyBusy(false);
    }
  }
  useEffect(() => {
    setHourly(null);
    setHourlyError("");
    setHourlyBusy(false);
    if (interval === "1h") void loadHourly(true);
    return () => {
      hourlySerial.current++;
    };
  }, [interval, a.instrument.symbol]);
  useAutoRefresh(interval === "1h" ? autoRefresh : 0, async () => {
    if (!hourlyBusy) await loadHourly(true);
  });
  const chartBars = interval === "1h" ? hourly?.bars || [] : a.bars;
  const chartZones = interval === "1h" ? hourly?.zones || [] : a.zones;
  const count = (sessions: number) =>
    Math.min(
      chartBars.length,
      sessions === chartBars.length
        ? sessions
        : sessions * (interval === "1h" ? 7 : 1),
    );
  const candleTime = (time: unknown) =>
    typeof time === "number"
      ? new Intl.DateTimeFormat(locale, {
          timeZone: a.instrument.timezone,
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(time * 1000))
      : String(time || "");
  const [ma, setMa] = useState(true);
  const [bb, setBb] = useState(false);
  const [showResistance, setShowResistance] = useState(true);
  const [showSupport, setShowSupport] = useState(true);
  const [momentum, setMomentum] = useState<"none" | "rsi" | "macd">("none");
  const [range, setRange] = useState(126);
  const [hover, setHover] = useState("");
  useEffect(() => {
    if (!host.current || !chartBars.length) return;
    const chart = createChart(host.current, {
      ...options,
      localization: {
        locale,
        priceFormatter: (price: number) => fmt(price),
        timeFormatter: candleTime,
      },
      timeScale: {
        ...options.timeScale,
        timeVisible: interval === "1h",
        secondsVisible: false,
        tickMarkFormatter: (time: Time, kind: TickMarkType) =>
          typeof time === "number"
            ? new Intl.DateTimeFormat(locale, {
                timeZone: a.instrument.timezone,
                ...(kind >= TickMarkType.Time
                  ? { hour: "2-digit", minute: "2-digit", hour12: false }
                  : { month: "short", day: "numeric" }),
              }).format(new Date(time * 1000))
            : null,
      },
      width: host.current.clientWidth,
      height: compact ? 310 : 440,
    });
    chartRef.current = chart;
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: colors.green,
      downColor: colors.red,
      borderVisible: false,
      wickUpColor: colors.green,
      wickDownColor: colors.red,
    });
    candles.setData(
      chartBars.map((b) => ({
        time: b.time as Time,
        open: b.Open,
        high: b.High,
        low: b.Low,
        close: b.Close,
      })),
    );
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volume
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    candles
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.08, bottom: 0.24 } });
    volume.setData(
      chartBars
        .filter((b) => b.Volume != null)
        .map((b) => ({
          time: b.time as Time,
          value: b.Volume!,
          color: b.Close >= b.Open ? "#67957c" : "#bc8477",
        })),
    );
    const add = (key: string, color: string, title: string, pane = 0) => {
      const series = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: 2,
          // Keep the standard indicator name short on the price axis in either language.
          title: key === "ema20" ? "EMA 20" : t(title),
          priceLineVisible: false,
          lastValueVisible: !compact,
        },
        pane,
      );
      series.setData(
        chartBars
          .filter((b) => typeof b[key] === "number")
          .map((b) => ({ time: b.time as Time, value: b[key] as number })),
      );
      return series;
    };
    if (ma) {
      add("ema20", colors.teal, "EMA 20");
      add("sma20", colors.gold, "SMA 20");
      add("sma50", colors.blue, "SMA 50");
      add("sma200", "#765679", "SMA 200");
    }
    if (bb) {
      add("bb_upper", "#786631", "BB upper");
      add("bb_lower", "#786631", "BB lower");
    }
    if (!compact) {
      chartZones
        .slice(0, 4)
        .filter((z) => showResistance || z.kind !== "resistance")
        .filter((z) => showSupport || z.kind !== "support")
        .forEach((z) => {
          candles.createPriceLine({
            price: z.low,
            color: z.kind === "support" ? "#4c7b62" : "#996045",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: t(z.kind === "support" ? "Support" : "Resistance"),
          });
          candles.createPriceLine({
            price: z.high,
            color: z.kind === "support" ? "#4c7b62" : "#996045",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
            title: "",
          });
        });
      const sc = interval === "1d" ? a.assessment.scenario : null;
      if (sc) {
        [
          [sc.entry, "Entry", colors.green],
          [sc.stop, "Invalidation", colors.red],
          [sc.target, "Structure target", colors.gold],
        ].forEach(([p, title, color]) =>
          candles.createPriceLine({
            price: p as number,
            title: t(title as string),
            color: color as string,
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
          }),
        );
      }
      if (momentum === "rsi") {
        const s = add("rsi14", "#655f92", "RSI 14", 1);
        [30, 70].forEach((v) =>
          s.createPriceLine({
            price: v,
            color: "#7d8797",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
          }),
        );
      }
      if (momentum === "macd") {
        add("macd", colors.green, "MACD", 1);
        add("macd_signal", colors.gold, "Signal", 1);
        const h = chart.addSeries(
          HistogramSeries,
          { priceLineVisible: false, title: t("Histogram") },
          1,
        );
        h.setData(
          chartBars
            .filter((b) => b.macd_hist != null)
            .map((b) => ({
              time: b.time as Time,
              value: b.macd_hist as number,
              color: (b.macd_hist as number) >= 0 ? "#67957c" : "#bc8477",
            })),
        );
      }
    }
    const setVisible = () => {
      const g = chartBars.slice(-count(range));
      if (g.length > 1)
        chart.timeScale().setVisibleRange({
          from: g[0].time as Time,
          to: g[g.length - 1].time as Time,
        });
    };
    setVisible();
    chart.subscribeCrosshairMove((p) => {
      const b = p.seriesData.get(candles);
      if (b && "close" in b)
        setHover(
          `${candleTime(p.time)} · O ${fmt(b.open)}  H ${fmt(b.high)}  L ${fmt(b.low)}  C ${fmt(b.close)}`,
        );
      else setHover("");
    });
    const ro = new ResizeObserver(() =>
      chart.applyOptions({ width: host.current?.clientWidth || 600 }),
    );
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [
    a,
    ma,
    bb,
    momentum,
    compact,
    language,
    showResistance,
    showSupport,
    interval,
    hourly,
  ]);
  useEffect(() => {
    const g = chartBars.slice(-count(range));
    if (g.length > 1)
      chartRef.current?.timeScale().setVisibleRange({
        from: g[0].time as Time,
        to: g[g.length - 1].time as Time,
      });
  }, [range, a, interval, hourly]);
  return (
    <div className="price-chart">
      {!compact && (
        <div className="chart-toolbar interval-toolbar">
          <div
            className="range-buttons"
            role="group"
            aria-label={t("Candle interval")}
          >
            <button
              aria-label={t("Daily candles")}
              aria-pressed={interval === "1d"}
              className={interval === "1d" ? "chosen" : ""}
              onClick={() => setInterval("1d")}
            >
              {t("Daily")}
            </button>
            <button
              aria-label={t("1H candles")}
              aria-pressed={interval === "1h"}
              className={interval === "1h" ? "chosen" : ""}
              onClick={() => setInterval("1h")}
            >
              1H
            </button>
          </div>
          {interval === "1h" && (
            <button
              className="text-button"
              disabled={hourlyBusy}
              onClick={() => loadHourly(true)}
            >
              {t(hourlyBusy ? "Loading hourly candles…" : "Refresh hourly")}
            </button>
          )}
        </div>
      )}
      {interval === "1h" && (
        <>
          <div className="notice small hourly-notice">
            {t(
              "Hourly chart only. Assessments, scenarios, benchmark research and backtests use completed daily bars. Indicators and zones here use completed hourly bars; this is not a validated intraday strategy.",
            )}
          </div>
          {hourlyBusy && <p role="status">{t("Loading hourly candles…")}</p>}
          {hourlyError && (
            <div className="error" role="alert">
              {t(hourlyError)}
            </div>
          )}
          {hourly && (
            <div className="hourly-provenance small muted">
              {hourly.synthetic && (
                <strong>
                  {t("SYNTHETIC")}
                  {" · "}
                </strong>
              )}
              {hourly.engine} · {hourly.source} ·{" "}
              {t(hourly.cache ? "Cached" : "Retrieved")}{" "}
              {new Date(hourly.retrieved_at).toLocaleString(locale)}
              <br />
              {t("Last completed candle ends {time} ({timezone})", {
                time: candleTime(
                  new Date(hourly.last_completed_end).getTime() / 1000,
                ),
                timezone: hourly.exchange_timezone,
              })}
              {hourly.quality.stale && (
                <strong className="negative">
                  {" "}
                  · {t("STALE HOURLY DATA")}
                </strong>
              )}
              {hourly.quality.issues.map((issue) => (
                <p key={issue}>{t(issue)}</p>
              ))}
            </div>
          )}
        </>
      )}
      <div className="chart-toolbar">
        <div className="range-buttons">
          {[
            [5, "1W"],
            [10, "2W"],
            [21, "1M"],
            [63, "3M"],
            [126, "6M"],
            [252, "1Y"],
            [chartBars.length, "All"],
          ].map(([n, label]) => (
            <button
              key={label}
              title={t(
                interval === "1h"
                  ? "{count} completed hourly candles"
                  : "{count} completed daily sessions",
                { count: count(Number(n)) },
              )}
              className={range === n ? "chosen" : ""}
              onClick={() => setRange(n as number)}
            >
              {t(label as string)}
            </button>
          ))}
        </div>
        <div className="chart-options">
          <label>
            <input
              type="checkbox"
              checked={ma}
              onChange={(e) => setMa(e.target.checked)}
            />
            {t("Averages")}
          </label>
          {!compact && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={showSupport}
                  onChange={(e) => setShowSupport(e.target.checked)}
                />
                {t("Support")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showResistance}
                  onChange={(e) => setShowResistance(e.target.checked)}
                />
                {t("Resistance")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={bb}
                  onChange={(e) => setBb(e.target.checked)}
                />
                {t("Bands")}
              </label>
              <select
                aria-label={t("Momentum panel")}
                value={momentum}
                onChange={(e) => setMomentum(e.target.value as typeof momentum)}
              >
                <option value="none">{t("Momentum panel")}</option>
                <option value="rsi">{t("RSI 14")}</option>
                <option value="macd">{t("MACD 12/26/9")}</option>
              </select>
            </>
          )}
        </div>
      </div>
      <div className="chart-hover">
        {hover ||
          t(
            "Scroll to zoom · Drag to explore · Crosshair for completed-bar values",
          )}
      </div>
      <div ref={host} data-testid="price-chart" className="chart-canvas" />
      <div className="chart-legend">
        <span>
          <i style={{ background: colors.green }} />
          {t("Price & volume")}
        </span>
        {ma && (
          <>
            <span>
              <i style={{ background: colors.teal }} />
              EMA 20
            </span>
            <span>
              <i style={{ background: colors.gold }} />
              {t("SMA 20")}
            </span>
            <span>
              <i style={{ background: colors.blue }} />
              {t("SMA 50")}
            </span>
            <span>
              <i style={{ background: "#765679" }} />
              {t("SMA 200")}
            </span>
          </>
        )}
        {bb && <span>{t("Bollinger 20 / 2σ")}</span>}
      </div>
      <div className="chart-basis">
        {(interval === "1d" || hourly) &&
          basis(
            hourly && interval === "1h"
              ? hourly.price_basis
              : a.provenance.price_basis,
          )}{" "}
        {t("OHLC · Native volume · Zones are bands, not exact floors.")}{" "}
        {t(
          interval === "1h"
            ? "1H bars; final session candle may be shorter. Times use the exchange timezone."
            : "Daily bars.",
        )}
        <br />
        {t("Charts by")}{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          {t("TradingView Lightweight Charts™")}
        </a>{" "}
        {t("· Copyright (с) 2025 TradingView, Inc.")}
      </div>
    </div>
  );
}

export function LineChart({
  series,
  height = 290,
  labels = ["Strategy", "Buy & hold"],
  percent = false,
}: {
  series: Array<{ time: string; [k: string]: string | number }>;
  height?: number;
  labels?: string[];
  percent?: boolean;
}) {
  const { t, fmt, language, locale } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current || !series.length) return;
    const chart = createChart(host.current, {
      ...options,
      localization: { locale },
      width: host.current.clientWidth,
      height,
    });
    const keys = Object.keys(series[0]).filter((k) => k !== "time");
    keys.forEach((key, n) => {
      const s = chart.addSeries(LineSeries, {
        color: [colors.green, colors.gold, colors.blue, "#765679"][n % 4],
        lineWidth: 2,
        title: t(labels[n]),
        priceLineVisible: false,
        priceFormat: percent
          ? { type: "custom", formatter: (p: number) => `${fmt(p, 1)}%` }
          : undefined,
      });
      s.setData(
        series.map((b) => ({ time: b.time as Time, value: b[key] as number })),
      );
    });
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() =>
      chart.applyOptions({ width: host.current?.clientWidth || 600 }),
    );
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [series, height, labels.join(","), percent, language]);
  return (
    <>
      <div ref={host} className="chart-canvas" data-testid="line-chart" />
      <div className="chart-legend">
        {labels.map((l, n) => (
          <span key={l}>
            <i
              style={{
                background: [colors.green, colors.gold, colors.blue, "#765679"][
                  n % 4
                ],
              }}
            />
            {t(l)}
          </span>
        ))}
      </div>
    </>
  );
}
