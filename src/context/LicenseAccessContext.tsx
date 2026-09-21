import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Outlet } from "react-router-dom";
import { fetchAuthMe } from "@/api/profile";
import { decodeAccessTokenClaims, isAuthenticated, isPlatformAdmin } from "@/auth/session";
import { ForcePasswordChangeModal } from "@/components/auth/ForcePasswordChangeModal";
import {
  isLicenseDeniedCode,
  LICENSE_DENIED_EVENT,
  paidAccessAllowedFromMe,
  type LicenseDeniedCode,
} from "@/license/access";
import { LicenseLoadingScreen } from "@/license/LicenseLoadingScreen";

export type LicenseAccessState = {
  loading: boolean;
  hydrated: boolean;
  allowed: boolean;
  isAdmin: boolean;
  code: string | null;
  licenseType: string | null;
  subscriptionType: string | null;
  expiresAt: string | null;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  markDenied: (code?: string | null) => void;
};

const LicenseAccessContext = createContext<LicenseAccessState | null>(null);

export function useLicenseAccess(): LicenseAccessState {
  const ctx = useContext(LicenseAccessContext);
  if (!ctx) {
    throw new Error("useLicenseAccess must be used within LicenseAccessProvider");
  }
  return ctx;
}

export function useLicenseAccessOptional(): LicenseAccessState | null {
  return useContext(LicenseAccessContext);
}

function applyMe(me: {
  role?: string | null;
  licenseActive?: boolean | null;
  licenseAccessCode?: string | null;
  licenseStatus?: string | null;
  licenseType?: string | null;
  subscriptionType?: string | null;
  subscriptionEndsAt?: string | null;
}) {
  return {
    allowed: paidAccessAllowedFromMe(me),
    isAdmin: String(me.role || "").toLowerCase() === "admin" || isPlatformAdmin(),
    code: me.licenseAccessCode ? String(me.licenseAccessCode) : me.licenseStatus ? String(me.licenseStatus) : null,
    licenseType: me.licenseType ?? null,
    subscriptionType: me.subscriptionType ?? null,
    expiresAt: me.subscriptionEndsAt ?? null,
  };
}

function clearDecision() {
  return {
    allowed: false,
    isAdmin: false,
    code: null as string | null,
    licenseType: null as string | null,
    subscriptionType: null as string | null,
    expiresAt: null as string | null,
  };
}

export function LicenseAccessProvider({ children }: { children?: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [licenseType, setLicenseType] = useState<string | null>(null);
  const [subscriptionType, setSubscriptionType] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const sessionUserIdRef = useRef<number | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const applyDecision = useCallback((next: ReturnType<typeof applyMe>) => {
    setAllowed(next.allowed);
    setIsAdmin(next.isAdmin);
    setCode(next.code);
    setLicenseType(next.licenseType);
    setSubscriptionType(next.subscriptionType);
    setExpiresAt(next.expiresAt);
  }, []);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!isAuthenticated()) {
      sessionUserIdRef.current = null;
      hydratedRef.current = false;
      setHydrated(false);
      setLoading(false);
      applyDecision(clearDecision());
      return;
    }

    const userId = decodeAccessTokenClaims()?.userId ?? null;
    const userChanged =
      sessionUserIdRef.current != null && userId != null && sessionUserIdRef.current !== userId;
    if (userChanged) {
      hydratedRef.current = false;
      setHydrated(false);
      applyDecision(clearDecision());
    }

    const blocking = options?.silent === false || !hydratedRef.current;
    if (blocking) setLoading(true);

    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }

    const run = (async () => {
      try {
        const me = await fetchAuthMe({ force: true });
        const next = applyMe(me);
        sessionUserIdRef.current = Number(me.id ?? userId) || userId;
        applyDecision(next);
        hydratedRef.current = true;
        setHydrated(true);
      } catch {
        applyDecision({
          ...clearDecision(),
          isAdmin: isPlatformAdmin(),
          code: "ACTIVE_PAID_LICENSE_REQUIRED",
        });
        hydratedRef.current = true;
        setHydrated(true);
      } finally {
        setLoading(false);
        inflightRef.current = null;
      }
    })();

    inflightRef.current = run;
    await run;
  }, [applyDecision]);

  const markDenied = useCallback((deniedCode?: string | null) => {
    if (isPlatformAdmin()) return;
    setAllowed(false);
    setCode(isLicenseDeniedCode(deniedCode) ? (deniedCode as LicenseDeniedCode) : "LICENSE_EXPIRED");
  }, []);

  useEffect(() => {
    void refresh({ silent: false });
  }, [refresh]);

  useEffect(() => {
    const onDenied = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string }>).detail;
      markDenied(detail?.code);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && hydratedRef.current) {
        void refresh({ silent: true });
      }
    };
    const onAuth = () => {
      if (!isAuthenticated()) {
        sessionUserIdRef.current = null;
        hydratedRef.current = false;
        setHydrated(false);
        setLoading(false);
        applyDecision(clearDecision());
      }
    };
    window.addEventListener(LICENSE_DENIED_EVENT, onDenied);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("auth-changed", onAuth);
    return () => {
      window.removeEventListener(LICENSE_DENIED_EVENT, onDenied);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("auth-changed", onAuth);
    };
  }, [applyDecision, markDenied, refresh]);

  const value = useMemo(
    () => ({
      loading,
      hydrated,
      allowed,
      isAdmin,
      code,
      licenseType,
      subscriptionType,
      expiresAt,
      refresh,
      markDenied,
    }),
    [loading, hydrated, allowed, isAdmin, code, licenseType, subscriptionType, expiresAt, refresh, markDenied],
  );

  const showBootScreen = !hydrated && loading;

  return (
    <LicenseAccessContext.Provider value={value}>
      {showBootScreen ? <LicenseLoadingScreen /> : (children ?? <Outlet />)}
      {hydrated ? <ForcePasswordChangeModal /> : null}
    </LicenseAccessContext.Provider>
  );
}
