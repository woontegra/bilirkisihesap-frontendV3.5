/**
 * API kök URL.
 * - Dev: boş → Vite `/api` proxy (localhost:4000)
 * - Prod: VITE_API_URL veya https://api.bilirkisihesap.com
 */
const DEFAULT_PRODUCTION_API = "https://api.bilirkisihesap.com";

export function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (import.meta.env.DEV) return "";
  return DEFAULT_PRODUCTION_API;
}

export const API_BASE_URL = resolveApiBaseUrl();
