import { useEffect, useRef } from "react";

/** Wait a full interval; skip hidden tabs and never overlap scheduled runs. */
export function useAutoRefresh(minutes: number, refresh: () => Promise<void>) {
  const latest = useRef(refresh);
  latest.current = refresh;
  const running = useRef(false);
  useEffect(() => {
    if (!minutes) return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || running.current) return;
      running.current = true;
      try {
        await latest.current();
      } finally {
        running.current = false;
      }
    }, minutes * 60_000);
    return () => window.clearInterval(timer);
  }, [minutes]);
}
