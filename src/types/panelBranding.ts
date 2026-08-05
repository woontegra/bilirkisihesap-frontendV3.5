import { API_BASE_URL } from "@/api/client";

export type PanelBrandingSettings = {
  loginLogoUrl: string;
  panelLogoUrl: string;
  faviconUrl: string;
  loginLogoMaxHeight: number;
  loginLogoMaxWidth: number;
  panelLogoMaxHeight: number;
  panelLogoMaxWidth: number;
  panelLogoCollapsedMaxHeight: number;
  panelLogoCollapsedMaxWidth: number;
};

export const PANEL_FALLBACK_LOGO_URL = "https://panel.bilirkisihesap.com/logo.png";
export const PANEL_FALLBACK_FAVICON_URL = "https://panel.bilirkisihesap.com/favicon.svg";

const LEGACY_API_HOSTS = new Set(["api.bilirkisihesap.com"]);

export const DEFAULT_PANEL_BRANDING: PanelBrandingSettings = {
  loginLogoUrl: PANEL_FALLBACK_LOGO_URL,
  panelLogoUrl: PANEL_FALLBACK_LOGO_URL,
  faviconUrl: PANEL_FALLBACK_FAVICON_URL,
  loginLogoMaxHeight: 52,
  loginLogoMaxWidth: 208,
  panelLogoMaxHeight: 38,
  panelLogoMaxWidth: 184,
  panelLogoCollapsedMaxHeight: 44,
  panelLogoCollapsedMaxWidth: 44,
};

export function resolveBrandingAssetUrl(
  url: string | null | undefined,
  cacheBust?: string | number,
): string {
  if (!url) return "";
  let resolved = url.trim();

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    try {
      const parsed = new URL(resolved);
      if (LEGACY_API_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith("/uploads/")) {
        const base = (API_BASE_URL || "").replace(/\/$/, "");
        if (base) {
          resolved = `${base}${parsed.pathname}${parsed.search}`;
        }
      }
    } catch {
      /* keep original */
    }
  } else if (resolved.startsWith("/uploads/")) {
    const base = (API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(
      /\/$/,
      "",
    );
    resolved = `${base}${resolved}`;
  } else if (resolved === "/logo.png" || resolved === "/logo_beyaz.png") {
    resolved = PANEL_FALLBACK_LOGO_URL;
  } else if (resolved === "/favicon.svg" || resolved === "/favicon.ico") {
    resolved = PANEL_FALLBACK_FAVICON_URL;
  }

  if (cacheBust === undefined || cacheBust === "") return resolved;
  const sep = resolved.includes("?") ? "&" : "?";
  return `${resolved}${sep}v=${encodeURIComponent(String(cacheBust))}`;
}

const BRANDING_CACHE_KEY = "v35_panel_branding_v3";

function normalizeCachedBranding(raw: Partial<PanelBrandingSettings>): PanelBrandingSettings {
  const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    loginLogoUrl:
      typeof raw.loginLogoUrl === "string" && raw.loginLogoUrl.trim()
        ? raw.loginLogoUrl.trim()
        : DEFAULT_PANEL_BRANDING.loginLogoUrl,
    panelLogoUrl:
      typeof raw.panelLogoUrl === "string" && raw.panelLogoUrl.trim()
        ? raw.panelLogoUrl.trim()
        : DEFAULT_PANEL_BRANDING.panelLogoUrl,
    faviconUrl:
      typeof raw.faviconUrl === "string" && raw.faviconUrl.trim()
        ? raw.faviconUrl.trim()
        : DEFAULT_PANEL_BRANDING.faviconUrl,
    loginLogoMaxHeight: num(raw.loginLogoMaxHeight, DEFAULT_PANEL_BRANDING.loginLogoMaxHeight),
    loginLogoMaxWidth: num(raw.loginLogoMaxWidth, DEFAULT_PANEL_BRANDING.loginLogoMaxWidth),
    panelLogoMaxHeight: num(raw.panelLogoMaxHeight, DEFAULT_PANEL_BRANDING.panelLogoMaxHeight),
    panelLogoMaxWidth: num(raw.panelLogoMaxWidth, DEFAULT_PANEL_BRANDING.panelLogoMaxWidth),
    panelLogoCollapsedMaxHeight: num(
      raw.panelLogoCollapsedMaxHeight,
      DEFAULT_PANEL_BRANDING.panelLogoCollapsedMaxHeight,
    ),
    panelLogoCollapsedMaxWidth: num(
      raw.panelLogoCollapsedMaxWidth,
      DEFAULT_PANEL_BRANDING.panelLogoCollapsedMaxWidth,
    ),
  };
}

export function brandingAssetVersion(branding: PanelBrandingSettings): string {
  return `${branding.loginLogoUrl}|${branding.panelLogoUrl}|${branding.faviconUrl}`;
}

export function readCachedPanelBranding(): PanelBrandingSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelBrandingSettings>;
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeCachedBranding(parsed);
  } catch {
    return null;
  }
}

export function writeCachedPanelBranding(data: PanelBrandingSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(normalizeCachedBranding(data)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function preloadBrandingAssets(
  branding: PanelBrandingSettings,
  cacheBust?: string | number,
): Promise<void> {
  const urls = [
    resolveBrandingAssetUrl(branding.loginLogoUrl, cacheBust),
    resolveBrandingAssetUrl(branding.panelLogoUrl, cacheBust),
    resolveBrandingAssetUrl(branding.faviconUrl, cacheBust),
  ].filter(Boolean);

  if (urls.length === 0) return Promise.resolve();

  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  ).then(() => undefined);
}

function isBrandingUploadPath(url: string): boolean {
  return url.includes("/uploads/branding/");
}

function probeImageUrl(src: string): Promise<boolean> {
  if (!src) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/** Railway'de kaybolmuş /uploads yollarını CDN'e çevir (API deploy edilmeden de çalışır). */
export async function ensureAccessibleBrandingSettings(
  branding: PanelBrandingSettings,
): Promise<PanelBrandingSettings> {
  async function resolveField(url: string, fallback: string): Promise<string> {
    const trimmed = url?.trim() ?? "";
    if (!trimmed || !isBrandingUploadPath(trimmed)) {
      return trimmed || fallback;
    }
    const ok = await probeImageUrl(resolveBrandingAssetUrl(trimmed));
    return ok ? trimmed : fallback;
  }

  const [loginLogoUrl, panelLogoUrl, faviconUrl] = await Promise.all([
    resolveField(branding.loginLogoUrl, PANEL_FALLBACK_LOGO_URL),
    resolveField(branding.panelLogoUrl, PANEL_FALLBACK_LOGO_URL),
    resolveField(branding.faviconUrl, PANEL_FALLBACK_FAVICON_URL),
  ]);

  return { ...branding, loginLogoUrl, panelLogoUrl, faviconUrl };
}
