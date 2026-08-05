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

export const DEFAULT_PANEL_BRANDING: PanelBrandingSettings = {
  loginLogoUrl: "/logo.png",
  panelLogoUrl: "/logo.png",
  faviconUrl: "/favicon.svg",
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
  let resolved = url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    resolved = url;
  } else if (url.startsWith("/uploads/")) {
    const base = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    resolved = `${base}${url}`;
  }
  if (cacheBust === undefined || cacheBust === "") return resolved;
  const sep = resolved.includes("?") ? "&" : "?";
  return `${resolved}${sep}v=${encodeURIComponent(String(cacheBust))}`;
}

const BRANDING_CACHE_KEY = "v35_panel_branding";

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
