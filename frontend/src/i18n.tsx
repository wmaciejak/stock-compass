import { createContext, useContext, useMemo, type ReactNode } from "react";
import analysisPL from "../../locales/analysis.pl.json";
import workspacePL from "../../locales/workspace.pl.json";
import rookiePL from "../../locales/rookie.pl.json";
import appPL from "../../locales/app.pl.json";

export type Language = "en" | "pl";
type Values = Record<string, string | number>;
const catalog: Record<string, string> = {
  ...analysisPL,
  ...workspacePL,
  ...appPL,
  ...rookiePL,
};
const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const token = /\{([A-Za-z]\w*)\}/g;
const patterns = Object.entries(catalog)
  .filter(([source]) => /\{[A-Za-z]\w*\}/.test(source))
  .map(([source, translated]) => {
    const names: string[] = [];
    let last = 0;
    let pattern = "^";
    for (const match of source.matchAll(token)) {
      pattern += escape(source.slice(last, match.index)) + "([\\s\\S]*?)";
      names.push(match[1]);
      last = match.index! + match[0].length;
    }
    pattern += escape(source.slice(last)) + "$";
    return {
      regex: new RegExp(pattern),
      names,
      translated,
      specificity: source.length - names.length * 4,
    };
  })
  .sort((a, b) => b.specificity - a.specificity);

export function createI18n(language: Language) {
  const locale = language === "pl" ? "pl-PL" : "en-US";
  const cache = new Map<string, string>();
  const interpolate = (text: string, values: Values = {}) =>
    text.replace(token, (whole, name: string) =>
      values[name] == null ? whole : String(values[name]),
    );
  function translate(source: string, depth = 0): string {
    if (language === "en" || !source || depth > 4) return source;
    const key = normalize(source);
    const exact = catalog[key];
    if (exact != null) return exact;
    const cached = cache.get(key);
    if (cached != null) return cached;
    for (const pattern of patterns) {
      const match = key.match(pattern.regex);
      if (!match) continue;
      const values = Object.fromEntries(
        pattern.names.map((name, i) => [
          name,
          translate(match[i + 1], depth + 1),
        ]),
      );
      const result = interpolate(pattern.translated, values);
      if (cache.size >= 2048) cache.delete(cache.keys().next().value!);
      cache.set(key, result);
      return result;
    }
    if (key.includes("; "))
      return key
        .split("; ")
        .map((part) => translate(part, depth + 1))
        .join("; ");
    return source;
  }
  const t = (source: string, values?: Values): string => {
    if (values)
      return interpolate(
        language === "pl" ? (catalog[normalize(source)] ?? source) : source,
        values,
      );
    return translate(source);
  };
  const fmt = (value: number | null | undefined, digits = 2) =>
    value == null || !Number.isFinite(value)
      ? t("Unavailable")
      : new Intl.NumberFormat(locale, {
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        }).format(value);
  const pct = (value: number | null | undefined) =>
    value == null ? "—" : `${value > 0 ? "+" : ""}${fmt(value)}%`;
  const date = (value: string, withTime = false) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t(value);
    // Session/trade dates are calendar labels, not instants in the browser timezone.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
      return new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(
        parsed,
      );
    return withTime
      ? parsed.toLocaleString(locale)
      : parsed.toLocaleDateString(locale);
  };
  return {
    t,
    fmt,
    pct,
    date,
    language,
    locale,
    basis: (value: string) => t(value.replaceAll("_", " ")),
  };
}

const LanguageContext = createContext(createI18n("en"));
export function LanguageProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const value = useMemo(() => createI18n(language), [language]);
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
export const useI18n = () => useContext(LanguageContext);
