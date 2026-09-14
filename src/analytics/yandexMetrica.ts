import { readCurrentUser } from "@/auth/session";

export const YANDEX_TAG_JS = "https://mc.yandex.ru/metrika/tag.js";

export const YANDEX_GOAL = {
  GUIDE_OPEN: "guide_open",
  CALCULATION_START: "calculation_start",
  CALCULATION_SAVE: "calculation_save",
  REPORT_CREATE: "report_create",
  CALCULATION_RESET: "calculation_reset",
  FRONTEND_ERROR: "frontend_error",
} as const;

export type YandexGoalName = (typeof YANDEX_GOAL)[keyof typeof YANDEX_GOAL];

export type YandexGoalParams = {
  route: string;
  module: string;
};

type YmCallable = ((...args: unknown[]) => void) & {
  a?: unknown[];
  l?: number;
};

type YandexWindow = Window & { ym?: YmCallable };

const TRACKED_PREFIXES = [
  "/dashboard",
  "/kidem-tazminati",
  "/ihbar-tazminati",
  "/fazla-mesai",
  "/yillik-izin",
  "/ubgt",
  "/hafta-tatili",
  "/ucret-alacagi",
  "/is-arama-izni-ucreti",
  "/bakiye-ucret-alacagi",
  "/prim-alacagi",
  "/kotu-niyet-tazminati",
  "/bosta-gecen-sure-ucreti",
  "/ise-almama-tazminati",
  "/ayrimcilik-tazminati",
  "/haksiz-fesih-tazminati",
  "/icra-takip-brutten-nete",
  "/davaci-ucreti",
  "/araclar/manuel-brut-ucret",
] as const;

const BLOCKED_PREFIXES = [
  "/login",
  "/register",
  "/signup",
  "/kayit",
  "/forgot-password",
  "/forgot",
  "/reset-password",
  "/sifre-sifirla",
  "/sifre",
  "/activate",
  "/activation",
  "/aktivasyon",
  "/verify-email",
  "/admin",
] as const;

const MODULE_BY_PREFIX: Array<{ prefix: string; module: string }> = [
  { prefix: "/dashboard", module: "dashboard" },
  { prefix: "/kidem-tazminati/30isci", module: "kidem_30isci" },
  { prefix: "/kidem-tazminati/borclar", module: "kidem_borclar" },
  { prefix: "/kidem-tazminati/gemi", module: "kidem_gemi" },
  { prefix: "/kidem-tazminati/mevsimlik", module: "kidem_mevsimlik" },
  { prefix: "/kidem-tazminati/basin", module: "kidem_basin" },
  { prefix: "/kidem-tazminati/kismi-sureli", module: "kidem_kismi_sureli" },
  { prefix: "/kidem-tazminati/belirli-sureli", module: "kidem_belirli_sureli" },
  { prefix: "/kidem-tazminati", module: "kidem" },
  { prefix: "/fazla-mesai/tanikli-standart", module: "fazla_mesai_tanikli" },
  { prefix: "/fazla-mesai/haftalik-karma", module: "fazla_mesai_haftalik_karma" },
  { prefix: "/fazla-mesai/donemsel-haftalik", module: "fazla_mesai_donemsel_haftalik" },
  { prefix: "/fazla-mesai/donemsel", module: "fazla_mesai_donemsel" },
  { prefix: "/fazla-mesai/yeralti-isci", module: "fazla_mesai_yeralti" },
  { prefix: "/fazla-mesai/vardiya-24", module: "fazla_mesai_vardiya24" },
  { prefix: "/fazla-mesai/vardiya-48", module: "fazla_mesai_vardiya48" },
  { prefix: "/fazla-mesai/gemi-adami-gunluk", module: "fazla_mesai_gemi_gunluk" },
  { prefix: "/fazla-mesai/gemi-adami-7-24", module: "fazla_mesai_gemi_724" },
  { prefix: "/fazla-mesai/ev-isci", module: "fazla_mesai_ev_isci" },
  { prefix: "/fazla-mesai/puantaj", module: "fazla_mesai_puantaj" },
  { prefix: "/fazla-mesai/standart", module: "fazla_mesai_standart" },
  { prefix: "/fazla-mesai", module: "fazla_mesai" },
  { prefix: "/ubgt/alacagi", module: "ubgt_alacagi" },
  { prefix: "/ubgt/bilirkisi", module: "ubgt_bilirkisi" },
  { prefix: "/ubgt", module: "ubgt" },
  { prefix: "/ihbar-tazminati", module: "ihbar" },
  { prefix: "/yillik-izin", module: "yillik_izin" },
  { prefix: "/hafta-tatili", module: "hafta_tatili" },
  { prefix: "/davaci-ucreti", module: "davaci_ucreti" },
  { prefix: "/ucret-alacagi", module: "ucret_alacagi" },
  { prefix: "/is-arama-izni-ucreti", module: "is_arama_izni" },
  { prefix: "/bakiye-ucret-alacagi", module: "bakiye_ucret" },
  { prefix: "/prim-alacagi", module: "prim_alacagi" },
  { prefix: "/kotu-niyet-tazminati", module: "kotu_niyet" },
  { prefix: "/bosta-gecen-sure-ucreti", module: "bosta_gecen_sure" },
  { prefix: "/ise-almama-tazminati", module: "ise_almama" },
  { prefix: "/ayrimcilik-tazminati", module: "ayrimcilik" },
  { prefix: "/haksiz-fesih-tazminati", module: "haksiz_fesih" },
  { prefix: "/icra-takip-brutten-nete", module: "icra_takip" },
  { prefix: "/araclar/manuel-brut-ucret", module: "manuel_brut_ucret" },
];

export function isEnabledFlag(raw: string | undefined): boolean {
  return raw === "true";
}

export function parseCounterId(raw: string | undefined): number | null {
  const value = (raw ?? "").trim();
  if (!/^\d{2,16}$/.test(value)) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

export function sanitizePath(input: string | null | undefined): string {
  if (!input) return "/";
  let path = String(input).trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname;
    }
  } catch {
    /* keep raw path and strip query/hash below */
  }
  const cut = path.split("?")[0]?.split("#")[0] ?? "/";
  path = cut.trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isBlockedPath(pathname: string): boolean {
  const path = sanitizePath(pathname).toLowerCase();
  return BLOCKED_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

export function isTrackedPath(pathname: string): boolean {
  const path = sanitizePath(pathname);
  if (isBlockedPath(path)) return false;
  if (path === "/profile" || path.startsWith("/profile/")) return false;
  return TRACKED_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

export function moduleNameFromPath(pathname: string): string {
  const path = sanitizePath(pathname);
  for (const row of MODULE_BY_PREFIX) {
    if (matchesPrefix(path, row.prefix)) return row.module;
  }
  const parts = path.replace(/^\//, "").split("/").filter(Boolean);
  return parts.join("_").slice(0, 80) || "app";
}

export function buildGoalParams(pathname: string): YandexGoalParams {
  return {
    route: sanitizePath(pathname),
    module: moduleNameFromPath(pathname),
  };
}

export function resolvePageTitle(mappedTitle: string | null | undefined, fallbackTitle: string | null | undefined): string {
  const mapped = (mappedTitle ?? "").trim();
  if (mapped) return mapped;
  const fallback = (fallbackTitle ?? "").trim();
  return fallback;
}

export function foldLabel(value: string): string {
  return value.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
}

export function readActionLabel(el: Element): { visible: string; aria: string } {
  const aria = (el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
  const visible = (el.textContent || "").replace(/\s+/g, " ").trim();
  return { visible, aria };
}

export function closestActionElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest("button, a, [role='button'], input[type='submit']");
}

export function classifyTrackedAction(visibleText: string, ariaLabel = ""): YandexGoalName | null {
  const visible = foldLabel(visibleText);
  const aria = foldLabel(ariaLabel);
  const combined = `${aria} ${visible}`.trim();

  if (visible.includes("nasıl kullanılır") || aria.includes("nasıl kullanılır")) {
    return YANDEX_GOAL.GUIDE_OPEN;
  }

  if (
    visible === "yeni hesaplama" ||
    visible === "temizle" ||
    visible === "temizle ve devam et" ||
    visible.startsWith("temizle ")
  ) {
    return YANDEX_GOAL.CALCULATION_RESET;
  }

  if (
    visible === "pdf indir" ||
    visible.includes("pdf indir") ||
    visible === "excel indir" ||
    visible.includes("excel'e aktar") ||
    visible.includes("excel olarak") ||
    (visible.includes("excel") && (visible.includes("indir") || visible.includes("aktar") || visible.includes("rapor"))) ||
    visible === "rapor oluştur" ||
    visible === "rapor üret" ||
    visible.includes("rapor oluştur")
  ) {
    return YANDEX_GOAL.REPORT_CREATE;
  }

  if (visible.startsWith("kaydediliyor")) return null;
  if (visible.includes("dışlanabilir")) return null;
  if (visible === "kaydet" || visible === "güncelle" || visible === "kaydet ve kapat") {
    return YANDEX_GOAL.CALCULATION_SAVE;
  }
  if (visible.startsWith("kaydet")) {
    return YANDEX_GOAL.CALCULATION_SAVE;
  }

  if (visible.includes("kat sayı") || visible.includes("katsayı") || combined.includes("kat sayı hesapla")) {
    return null;
  }
  if (visible === "hesapla" || visible.endsWith(" hesapla")) {
    return YANDEX_GOAL.CALCULATION_START;
  }

  return null;
}

export type YandexMetricaClient = {
  enabled: boolean;
  counterId: number | null;
  initStarted: boolean;
  lastHitPath: string | null;
  ensure: () => boolean;
  hit: (pathname: string, title: string) => void;
  goal: (name: YandexGoalName, pathname: string) => void;
  scriptSrc: string;
};

export type YandexMetricaClientOptions = {
  enabled: boolean;
  counterId: number | null;
  scriptSrc?: string;
  getWindow?: () => YandexWindow | undefined;
  getDocument?: () => Document | undefined;
};

export function yandexInitOptions(): Record<string, boolean> {
  return {
    ssr: true,
    webvisor: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    defer: true,
  };
}

function installOfficialLoader(win: YandexWindow, doc: Document, src: string): void {
  win.ym =
    win.ym ||
    function ymQueue() {
      const current = win.ym as YmCallable;
      current.a = current.a || [];
      current.a.push(arguments as unknown);
    };
  (win.ym as YmCallable).l = Date.now();

  const scripts = doc.scripts;
  for (let j = 0; j < scripts.length; j += 1) {
    if (scripts[j]?.src === src) return;
  }

  const tag = doc.createElement("script");
  tag.async = true;
  tag.src = src;
  tag.onerror = () => {
    /* Reklam engelleyici / ağ hatası uygulamayı bozmasın. */
  };
  const first = doc.getElementsByTagName("script")[0];
  if (first?.parentNode) {
    first.parentNode.insertBefore(tag, first);
    return;
  }
  (doc.head ?? doc.body ?? doc.documentElement).appendChild(tag);
}

export function createYandexMetricaClient(options: YandexMetricaClientOptions): YandexMetricaClient {
  const scriptSrc = options.scriptSrc ?? YANDEX_TAG_JS;
  const enabled = Boolean(options.enabled && options.counterId);
  const counterId = enabled ? options.counterId : null;
  const client: YandexMetricaClient = {
    enabled,
    counterId,
    initStarted: false,
    lastHitPath: null,
    scriptSrc,
    ensure: () => false,
    hit: () => undefined,
    goal: () => undefined,
  };

  const winOf = () => {
    if (options.getWindow) return options.getWindow();
    if (typeof window === "undefined") return undefined;
    return window as YandexWindow;
  };
  const docOf = () => {
    if (options.getDocument) return options.getDocument();
    if (typeof document === "undefined") return undefined;
    return document;
  };

  let lastGoalKey = "";
  let lastGoalAt = 0;

  const callYm = (...args: unknown[]) => {
    try {
      const win = winOf();
      if (!win || typeof win.ym !== "function" || client.counterId == null) return;
      win.ym(...args);
    } catch {
      /* yut */
    }
  };

  client.ensure = () => {
    try {
      if (!client.enabled || client.counterId == null) return false;
      const win = winOf();
      const doc = docOf();
      if (!win || !doc) return false;
      if (client.initStarted) return true;
      client.initStarted = true;
      installOfficialLoader(win, doc, scriptSrc);
      callYm(client.counterId, "init", yandexInitOptions());
      return true;
    } catch {
      client.initStarted = false;
      return false;
    }
  };

  client.hit = (pathname, title) => {
    try {
      if (!isTrackedPath(pathname)) return;
      if (!client.ensure() || client.counterId == null) return;
      const url = sanitizePath(pathname);
      if (client.lastHitPath === url) return;
      client.lastHitPath = url;
      const pageTitle = resolvePageTitle(title, typeof document !== "undefined" ? document.title : "");
      callYm(client.counterId, "hit", url, pageTitle ? { title: pageTitle } : undefined);
    } catch {
      /* yut */
    }
  };

  client.goal = (name, pathname) => {
    try {
      if (!isTrackedPath(pathname)) return;
      if (!client.ensure() || client.counterId == null) return;
      const params = buildGoalParams(pathname);
      const key = `${name}:${params.route}`;
      const now = Date.now();
      if (key === lastGoalKey && now - lastGoalAt < 400) return;
      lastGoalKey = key;
      lastGoalAt = now;
      callYm(client.counterId, "reachGoal", name, params);
    } catch {
      /* yut */
    }
  };

  return client;
}

function isAdminUser(): boolean {
  try {
    return readCurrentUser()?.role === "admin";
  } catch {
    return false;
  }
}

let singleton: YandexMetricaClient | null = null;

export function readYandexMetricaEnv(
  enabledRaw: string | undefined = import.meta.env.VITE_YANDEX_METRICA_ENABLED,
  idRaw: string | undefined = import.meta.env.VITE_YANDEX_METRICA_ID,
): { enabled: boolean; counterId: number | null } {
  const counterId = parseCounterId(idRaw);
  return {
    enabled: isEnabledFlag(enabledRaw) && counterId != null,
    counterId,
  };
}

function getSingleton(): YandexMetricaClient {
  if (!singleton) {
    const env = readYandexMetricaEnv();
    singleton = createYandexMetricaClient(env);
  }
  return singleton;
}

export function isYandexMetricaActive(): boolean {
  return getSingleton().enabled;
}

export function trackYandexPageView(pathname: string, title: string): void {
  if (isAdminUser()) return;
  getSingleton().hit(pathname, title);
}

export function trackYandexGoal(name: YandexGoalName, pathname?: string): void {
  if (isAdminUser()) return;
  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  getSingleton().goal(name, path);
}

export function captureYandexDomAction(target: EventTarget | null, pathname: string): YandexGoalName | null {
  try {
    if (isAdminUser() || !isTrackedPath(pathname)) return null;
    const el = closestActionElement(target);
    if (!el) return null;
    const { visible, aria } = readActionLabel(el);
    const goal = classifyTrackedAction(visible, aria);
    // Kılavuz açılışı GuidedTourHost üzerinden tek kez gönderilir.
    if (!goal || goal === YANDEX_GOAL.GUIDE_OPEN) return null;
    getSingleton().goal(goal, pathname);
    return goal;
  } catch {
    return null;
  }
}

export function resetYandexMetricaForTests(): void {
  singleton = null;
}
