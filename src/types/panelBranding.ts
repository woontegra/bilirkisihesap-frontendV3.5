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
