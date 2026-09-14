import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { readIsAdmin } from "@/data/source";
import {
  captureYandexDomAction,
  isYandexMetricaActive,
  isTrackedPath,
  trackYandexGoal,
  trackYandexPageView,
} from "./yandexMetrica";

type Props = {
  pageTitle: string;
};

/**
 * Giriş yapmış normal kullanıcının hesaplama kabuğunda Yandex Metrica.
 * Login AppShell dışındadır; admin kullanıcı ve /admin rotaları izlenmez.
 */
export function YandexMetricaTracker({ pageTitle }: Props) {
  const { pathname } = useLocation();
  const isAdmin = readIsAdmin();

  useEffect(() => {
    if (isAdmin || !isYandexMetricaActive()) return;
    const title =
      pageTitle.trim() ||
      (typeof document !== "undefined" ? document.title : "");
    trackYandexPageView(pathname, title);
  }, [isAdmin, pathname, pageTitle]);

  useEffect(() => {
    if (isAdmin || !isYandexMetricaActive()) return;

    const currentPath = () => window.location.pathname;
    let lastErrorAt = 0;

    const reportFrontendError = (filename?: string) => {
      if (filename && /mc\.yandex|metrika\/tag\.js/i.test(filename)) return;
      const now = Date.now();
      if (now - lastErrorAt < 4000) return;
      lastErrorAt = now;
      const path = currentPath();
      if (!isTrackedPath(path)) return;
      trackYandexGoal("frontend_error", path);
    };

    const onClick = (event: MouseEvent) => {
      captureYandexDomAction(event.target, currentPath());
    };

    const onSubmit = (event: Event) => {
      const submitter = "submitter" in event ? (event as SubmitEvent).submitter : null;
      captureYandexDomAction(submitter ?? event.target, currentPath());
    };

    const onError = (event: ErrorEvent) => {
      reportFrontendError(event.filename);
    };

    const onRejection = () => {
      reportFrontendError();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [isAdmin]);

  return null;
}
