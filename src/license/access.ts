export const LICENSE_DENIED_CODES = [
  "LICENSE_EXPIRED",
  "DEMO_EXPIRED",
  "LICENSE_INACTIVE",
  "ACTIVE_PAID_LICENSE_REQUIRED",
] as const;

export type LicenseDeniedCode = (typeof LICENSE_DENIED_CODES)[number];

export const LICENSE_DENIED_EVENT = "license-denied";

export const SUBSCRIPTION_EXPIRED_PATH = "/subscription-expired";

const LICENSE_FREE_PREFIXES = ["/subscription-expired", "/profile"] as const;

export function normalizePathname(pathname: string): string {
  const raw = String(pathname || "").split("?")[0];
  if (!raw || raw === "/") return "/";
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function isLicenseDeniedCode(code: unknown): code is LicenseDeniedCode {
  const value = String(code || "").trim().toUpperCase();
  return (LICENSE_DENIED_CODES as readonly string[]).includes(value);
}

export function isLicenseFreePath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return LICENSE_FREE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function postLoginPath(input: {
  role?: string | null;
  licenseActive?: boolean | null;
  licenseAccessCode?: string | null;
  licenseStatus?: string | null;
}): string {
  if (String(input.role || "").toLowerCase() === "admin") {
    return "/dashboard";
  }
  if (input.licenseActive === true) return "/dashboard";
  const code = String(input.licenseAccessCode || input.licenseStatus || "").toUpperCase();
  if (isLicenseDeniedCode(code) || input.licenseActive === false) {
    return SUBSCRIPTION_EXPIRED_PATH;
  }
  return "/dashboard";
}

export function paidAccessAllowedFromMe(me: {
  role?: string | null;
  licenseActive?: boolean | null;
  licenseAccessCode?: string | null;
  licenseStatus?: string | null;
}): boolean {
  if (String(me.role || "").toLowerCase() === "admin") return true;
  if (me.licenseActive === true) return true;
  const code = String(me.licenseAccessCode || me.licenseStatus || "").toUpperCase();
  if (isLicenseDeniedCode(code) || me.licenseActive === false) return false;
  return false;
}
