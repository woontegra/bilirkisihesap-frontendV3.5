import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchPublicPanelBranding } from "@/api/panelBranding";
import {
  DEFAULT_PANEL_BRANDING,
  resolveBrandingAssetUrl,
  type PanelBrandingSettings,
} from "@/types/panelBranding";

type PanelBrandingContextValue = {
  branding: PanelBrandingSettings;
  loading: boolean;
  refreshBranding: () => Promise<void>;
  applyBranding: (next: PanelBrandingSettings) => void;
  loginLogoSrc: string;
  panelLogoSrc: string;
  faviconSrc: string;
};

const PanelBrandingContext = createContext<PanelBrandingContextValue | null>(null);

function applyFavicon(url: string, cacheBust?: string | number) {
  const href = resolveBrandingAssetUrl(url, cacheBust);
  if (!href) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function PanelBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<PanelBrandingSettings>(DEFAULT_PANEL_BRANDING);
  const [loading, setLoading] = useState(true);
  const [assetVersion, setAssetVersion] = useState(0);

  const refreshBranding = useCallback(async () => {
    try {
      const data = await fetchPublicPanelBranding();
      setBranding(data);
    } catch {
      setBranding(DEFAULT_PANEL_BRANDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  useEffect(() => {
    applyFavicon(branding.faviconUrl, assetVersion || branding.faviconUrl);
  }, [branding.faviconUrl, assetVersion]);

  const applyBranding = useCallback((next: PanelBrandingSettings) => {
    setBranding(next);
    setAssetVersion(Date.now());
  }, []);

  const value = useMemo(
    (): PanelBrandingContextValue => ({
      branding,
      loading,
      refreshBranding,
      applyBranding,
      loginLogoSrc: resolveBrandingAssetUrl(branding.loginLogoUrl, assetVersion || branding.loginLogoUrl),
      panelLogoSrc: resolveBrandingAssetUrl(branding.panelLogoUrl, assetVersion || branding.panelLogoUrl),
      faviconSrc: resolveBrandingAssetUrl(branding.faviconUrl, assetVersion || branding.faviconUrl),
    }),
    [applyBranding, assetVersion, branding, loading, refreshBranding],
  );

  return <PanelBrandingContext.Provider value={value}>{children}</PanelBrandingContext.Provider>;
}

export function usePanelBranding(): PanelBrandingContextValue {
  const ctx = useContext(PanelBrandingContext);
  if (!ctx) {
    throw new Error("usePanelBranding must be used within PanelBrandingProvider");
  }
  return ctx;
}
