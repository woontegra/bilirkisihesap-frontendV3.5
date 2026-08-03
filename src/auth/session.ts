const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const TOKEN_EXPIRY_KEY = "token_expiry";

const AUTH_KEYS = [
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  TOKEN_EXPIRY_KEY,
  "tenant_id",
  "user_id",
  "user_role",
  "current_user",
  "email",
  "licenseValid",
  "professionalLicenseKey",
  "professionalLicenseExpiry",
  "professional_device_id",
  "licenseExpiry",
  "user",
  "v3_session",
  "v35_session",
] as const;

export type AuthUser = {
  id: number;
  email: string;
  name?: string;
  role?: string;
  tenantId?: number;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  licenseType?: string | null;
  professionalLicenseValid?: boolean;
  professionalLicense?: {
    license_key?: string;
    expires_at?: string;
  };
};

function decodeTokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join(""),
      ),
    ) as { exp?: number };
    return json.exp ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function saveSession(accessToken: string, refreshToken: string, user: AuthUser): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

  const expiry = decodeTokenExpiry(accessToken);
  localStorage.setItem(
    TOKEN_EXPIRY_KEY,
    String(expiry ?? Date.now() + 2 * 60 * 60 * 1000),
  );

  localStorage.setItem("current_user", JSON.stringify(user));
  localStorage.setItem("tenant_id", String(user.tenantId || "1"));
  localStorage.setItem("email", user.email);
  localStorage.setItem("user_id", String(user.id ?? ""));
  localStorage.setItem("user_role", (user.role ?? "").toLowerCase());
  localStorage.setItem("v3_session", JSON.stringify({ email: user.email }));
  localStorage.setItem("v35_session", "1");
  localStorage.setItem("last_login_date", new Date().toISOString());
}

export function clearSession(): void {
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key);
  }
}

export function isTokenExpired(): boolean {
  const raw = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!raw) return true;
  const expiry = Number.parseInt(raw, 10);
  return Date.now() >= expiry - 5 * 60 * 1000;
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearSession();
      return null;
    }

    const data = (await response.json()) as {
      accessToken?: string;
      refreshToken?: string;
      user?: AuthUser;
    };

    if (!data.accessToken || !data.refreshToken) {
      clearSession();
      return null;
    }

    if (data.user) {
      saveSession(data.accessToken, data.refreshToken, data.user);
    } else {
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      const expiry = decodeTokenExpiry(data.accessToken);
      localStorage.setItem(
        TOKEN_EXPIRY_KEY,
        String(expiry ?? Date.now() + 2 * 60 * 60 * 1000),
      );
    }

    return data.accessToken;
  } catch {
    clearSession();
    return null;
  }
}

/** Mevcut backend: POST /api/auth/login */
export async function loginWithPassword(email: string, password: string): Promise<LoginResponse> {
  const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = (await response.json().catch(() => ({}))) as LoginResponse & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Giriş başarısız");
  }

  if (!payload.accessToken || !payload.refreshToken || !payload.user) {
    throw new Error("Geçersiz giriş yanıtı");
  }

  const userWithMeta = {
    ...payload.user,
  };

  saveSession(payload.accessToken, payload.refreshToken, userWithMeta);

  // Lisans bayrakları V3 ile aynı localStorage anahtarlarında tutulur
  localStorage.setItem(
    "current_user",
    JSON.stringify({
      ...userWithMeta,
      licenseType: payload.licenseType ?? null,
      hasValidLicense: payload.professionalLicenseValid ?? false,
    }),
  );

  if (payload.professionalLicenseValid) {
    localStorage.setItem("licenseValid", "true");
    localStorage.setItem(
      "professionalLicenseKey",
      payload.professionalLicense?.license_key || "",
    );
    localStorage.setItem(
      "professionalLicenseExpiry",
      payload.professionalLicense?.expires_at || "",
    );
  } else {
    localStorage.setItem("licenseValid", "false");
  }

  return payload;
}

export function logout(): void {
  clearSession();
}
