/**
 * Yandex Metrica güvenlik ve SPA davranış birim testleri.
 */
import assert from "node:assert/strict";
import {
  YANDEX_GOAL,
  YANDEX_TAG_JS,
  buildGoalParams,
  classifyTrackedAction,
  createYandexMetricaClient,
  foldLabel,
  isBlockedPath,
  isEnabledFlag,
  isTrackedPath,
  moduleNameFromPath,
  parseCounterId,
  readYandexMetricaEnv,
  resolvePageTitle,
  sanitizePath,
  yandexInitOptions,
} from "./yandexMetrica";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, label);
}

check("enabled only exact true", isEnabledFlag("true"), true);
check("enabled false string", isEnabledFlag("false"), false);
check("enabled missing", isEnabledFlag(undefined), false);
check("enabled 1 not enough", isEnabledFlag("1"), false);

check("counter numeric", parseCounterId("112580132"), 112580132);
check("counter rejects text", parseCounterId("abc"), null);
check("counter rejects empty", parseCounterId(""), null);
check("counter rejects float", parseCounterId("12.3"), null);

check("env both required", readYandexMetricaEnv("true", "112580132").enabled, true);
check("env missing flag", readYandexMetricaEnv(undefined, "112580132").enabled, false);
check("env missing id", readYandexMetricaEnv("true", undefined).enabled, false);
check("env false flag", readYandexMetricaEnv("false", "112580132").enabled, false);

check("sanitize query", sanitizePath("/kidem-tazminati/30isci?token=abc&email=a@b.com"), "/kidem-tazminati/30isci");
check("sanitize hash", sanitizePath("/dashboard#section"), "/dashboard");
check("sanitize both", sanitizePath("/login?next=/admin#x"), "/login");
check("sanitize absolute", sanitizePath("https://app.example.com/fazla-mesai/standart?id=9"), "/fazla-mesai/standart");
check("sanitize trailing slash", sanitizePath("/dashboard/"), "/dashboard");

check("blocked login", isBlockedPath("/login"), true);
check("blocked login query ignored", isBlockedPath("/login?token=xyz"), true);
check("blocked register", isBlockedPath("/register"), true);
check("blocked reset", isBlockedPath("/reset-password"), true);
check("blocked activate", isBlockedPath("/activate/TOKEN"), true);
check("blocked admin", isBlockedPath("/admin/users"), true);
check("blocked admin root", isBlockedPath("/admin"), true);

check("tracked dashboard", isTrackedPath("/dashboard"), true);
check("tracked calc with query", isTrackedPath("/kidem-tazminati/30isci?caseId=12"), true);
check("not tracked profile", isTrackedPath("/profile"), false);
check("not tracked login", isTrackedPath("/login"), false);
check("not tracked admin", isTrackedPath("/admin/analytics"), false);

check("module dashboard", moduleNameFromPath("/dashboard"), "dashboard");
check("module kidem", moduleNameFromPath("/kidem-tazminati/30isci?x=1"), "kidem_30isci");
check("goal params keys", Object.keys(buildGoalParams("/ucret-alacagi?email=a@b.com")).sort(), ["module", "route"]);
check("goal params clean route", buildGoalParams("/ucret-alacagi?email=a@b.com").route, "/ucret-alacagi");
check("goal params no email", JSON.stringify(buildGoalParams("/ucret-alacagi?email=a@b.com")).includes("email"), false);

check("title mapped", resolvePageTitle("Kıdem Tazminatı", "Bilirkişi Hesap"), "Kıdem Tazminatı");
check("title fallback", resolvePageTitle("  ", "Bilirkişi Hesap · Yönetim Paneli"), "Bilirkişi Hesap · Yönetim Paneli");

check("goal guide", classifyTrackedAction("Nasıl kullanılır?", "Nasıl kullanılır? Etkileşimli kılavuzu başlat"), YANDEX_GOAL.GUIDE_OPEN);
check("goal hesapla", classifyTrackedAction("Hesapla"), YANDEX_GOAL.CALCULATION_START);
check("goal bakiye hesapla", classifyTrackedAction("Bakiye Hesapla"), YANDEX_GOAL.CALCULATION_START);
check("goal kaydet", classifyTrackedAction("Kaydet"), YANDEX_GOAL.CALCULATION_SAVE);
check("goal guncelle", classifyTrackedAction("Güncelle"), YANDEX_GOAL.CALCULATION_SAVE);
check("goal pdf", classifyTrackedAction("PDF İndir"), YANDEX_GOAL.REPORT_CREATE);
check("goal reset", classifyTrackedAction("Yeni Hesaplama"), YANDEX_GOAL.CALCULATION_RESET);
check("goal temizle", classifyTrackedAction("Temizle"), YANDEX_GOAL.CALCULATION_RESET);
check("ignore katsayi uygula", classifyTrackedAction("Uygula", "Kat Sayı Hesapla"), null);
check("ignore kat sayi hesapla heading click", classifyTrackedAction("Kat Sayı Hesapla"), null);
check("ignore kaydediliyor", classifyTrackedAction("Kaydediliyor…"), null);
check("ignore hesaplama notu", classifyTrackedAction("Hesaplama Notu"), null);
check("fold tr", foldLabel("  PDF  İndir  "), "pdf indir");

const init = yandexInitOptions();
check("init ssr", init.ssr, true);
check("init webvisor", init.webvisor, true);
check("init clickmap", init.clickmap, true);
check("init trackLinks", init.trackLinks, true);
check("init accurateTrackBounce", init.accurateTrackBounce, true);
check("init defer", init.defer, true);

type ScriptNode = {
  src: string;
  async: boolean;
  onerror: (() => void) | null;
  parentNode: { insertBefore: (node: ScriptNode, ref: ScriptNode) => void } | null;
};

function createMockHost() {
  const scripts: ScriptNode[] = [];
  const bodyScripts: ScriptNode[] = [
    {
      src: "/src/main.tsx",
      async: false,
      onerror: null,
      parentNode: {
        insertBefore(node) {
          scripts.push(node);
        },
      },
    },
  ];

  const win = {
    ym: undefined as undefined | ((...args: unknown[]) => void),
    location: { pathname: "/dashboard", origin: "https://app.test", search: "?token=secret", hash: "#x" },
  };

  const doc = {
    scripts: bodyScripts,
    getElementsByTagName(tag: string) {
      if (tag === "script") return bodyScripts;
      return [];
    },
    createElement(tag: string) {
      if (tag !== "script") throw new Error("unexpected");
      return {
        src: "",
        async: false,
        onerror: null,
        parentNode: null,
      } as ScriptNode;
    },
    head: { appendChild(node: ScriptNode) { scripts.push(node); } },
    body: { appendChild(node: ScriptNode) { scripts.push(node); } },
    documentElement: { appendChild(node: ScriptNode) { scripts.push(node); } },
  };

  return { win, doc, scripts };
}

{
  const disabled = createYandexMetricaClient({ enabled: false, counterId: 112580132 });
  disabled.ensure();
  disabled.hit("/dashboard", "Yönetim Paneli");
  disabled.goal("guide_open", "/dashboard");
  check("disabled never inits", disabled.initStarted, false);
}

{
  const { win, doc, scripts } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => {
    collected.push(args);
  };
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.ensure();
  client.ensure();
  client.ensure();
  check("script injected once", scripts.filter((s) => s.src === YANDEX_TAG_JS).length, 1);
  check("init started once", client.initStarted, true);
  check(
    "ym init once",
    collected.filter((args) => args[1] === "init").length,
    1,
  );
}

{
  const { win, doc } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => {
    collected.push(args);
  };
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  win.location.pathname = "/kidem-tazminati/30isci";
  client.hit("/kidem-tazminati/30isci?token=abc&email=user@test.com", "Kıdem Tazminatı — İş Kanununa Göre");
  client.hit("/kidem-tazminati/30isci?token=abc", "Kıdem Tazminatı — İş Kanununa Göre");
  client.hit("/fazla-mesai/standart?case=1", "Fazla Mesai — Standart");

  const hits = collected.filter((args) => args[1] === "hit");
  check("first hit not doubled", hits.length, 2);
  check("hit url is pathname only", hits[0]?.[2], "/kidem-tazminati/30isci");
  check("second route hit", hits[1]?.[2], "/fazla-mesai/standart");
  check("hit has no query", String(hits[0]?.[2]).includes("?"), false);
  check("hit has no token", JSON.stringify(hits).includes("token"), false);
  check("hit has no email", JSON.stringify(hits).includes("email"), false);
  check("hit title turkish", (hits[0]?.[3] as { title?: string } | undefined)?.title, "Kıdem Tazminatı — İş Kanununa Göre");
}

{
  const { win, doc } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => collected.push(args);
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.hit("/login", "Giriş");
  client.hit("/admin/users", "Kullanıcı Yönetimi");
  client.goal("guide_open", "/admin");
  client.goal("calculation_start", "/login");
  const hits = collected.filter((args) => args[1] === "hit");
  const goals = collected.filter((args) => args[1] === "reachGoal");
  check("no hit on login/admin", hits.length, 0);
  check("no goal on login/admin", goals.length, 0);
}

{
  const { win, doc } = createMockHost();
  const collected: unknown[][] = [];
  win.ym = (...args: unknown[]) => collected.push(args);
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.goal("guide_open", "/ucret-alacagi?token=abc");
  const goal = collected.find((args) => args[1] === "reachGoal");
  check("goal name", goal?.[2], "guide_open");
  check("goal params", goal?.[3], { route: "/ucret-alacagi", module: "ucret_alacagi" });
}

{
  const { win, doc, scripts } = createMockHost();
  const client = createYandexMetricaClient({
    enabled: true,
    counterId: 112580132,
    getWindow: () => win as never,
    getDocument: () => doc as never,
  });
  client.ensure();
  const injected = scripts.find((s) => s.src === YANDEX_TAG_JS);
  assert.ok(injected, "tag.js injected");
  assert.doesNotThrow(() => injected?.onerror?.());
  assert.doesNotThrow(() => client.hit("/dashboard", "Yönetim Paneli"));
  assert.doesNotThrow(() => client.goal("frontend_error", "/dashboard"));
}

console.log("yandexMetrica.selftest: ok");
