/**
 * API kök URL.
 * - Dev: boş → Vite `/api` proxy (localhost:4000)
 * - Vercel prod: boş → vercel.json `/api` rewrite → api.bilirkisihesap.com
 * - Özel host: VITE_API_URL=https://api.bilirkisihesap.com
 */
export function resolveApiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();

if (import.meta.env.PROD && !API_BASE_URL) {
  console.info(
    "[API] VITE_API_URL boş — istekler aynı origin /api üzerinden gider (Vercel rewrite veya reverse proxy gerekir).",
  );
}
