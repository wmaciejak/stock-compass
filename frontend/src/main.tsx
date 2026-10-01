import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ResearchContextProvider } from "./ResearchContext";
import { createI18n } from "./i18n";
import "./styles.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    const { t } = createI18n(
      document.documentElement.lang === "pl" ? "pl" : "en",
    );
    return this.state.error ? (
      <div className="fatal-error">
        <h1>{t("Stock Compass encountered a display error.")}</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>
          {t("Reload workspace")}
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ResearchContextProvider>
      <App />
    </ResearchContextProvider>
  </ErrorBoundary>,
);
