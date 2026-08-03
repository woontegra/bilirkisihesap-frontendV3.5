/**
 * Manuel Brüt Ücret şablonları — tarayıcı içi lokal depolama.
 * Benzersiz anahtar; başka sayfalarla ve V3 ile paylaşılmaz.
 */

import type { ManuelBrutPeriodsMap, ManuelBrutTemplate } from "./model";
import { findFloorViolations } from "./validation";

/** V3.5 sayfasına özel, versiyonlu depolama anahtarı */
export const MANUEL_BRUT_STORAGE_KEY = "bilirkisi-hesap-v35:manuel-brut-ucret:templates:v1" as const;

type PayloadV1 = {
  version: 1;
  templates: ManuelBrutTemplate[];
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeName(s: string): string {
  return String(s).trim().toLowerCase();
}

function cleanPeriods(periods: ManuelBrutPeriodsMap): ManuelBrutPeriodsMap {
  const cleaned: ManuelBrutPeriodsMap = {};
  for (const [k, v] of Object.entries(periods)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

export type StorageLoadResult =
  | { ok: true; templates: ManuelBrutTemplate[] }
  | { ok: false; templates: ManuelBrutTemplate[]; reason: string };

export function loadTemplatesSafe(): StorageLoadResult {
  if (typeof window === "undefined") {
    return { ok: true, templates: [] };
  }
  try {
    const raw = localStorage.getItem(MANUEL_BRUT_STORAGE_KEY);
    if (!raw) return { ok: true, templates: [] };
    const parsed = JSON.parse(raw) as Partial<PayloadV1>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.templates)) {
      return { ok: false, templates: [], reason: "Desteklenmeyen veya bozuk lokal veri bulundu." };
    }
    const templates = parsed.templates.filter(
      (t): t is ManuelBrutTemplate =>
        !!t &&
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        !!t.periods &&
        typeof t.periods === "object",
    );
    return { ok: true, templates };
  } catch {
    return { ok: false, templates: [], reason: "Lokal veri okunamadı. Kayıtlar güvenli şekilde boşaltıldı." };
  }
}

function writePayload(payload: PayloadV1): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MANUEL_BRUT_STORAGE_KEY, JSON.stringify(payload));
}

function readOrEmpty(): PayloadV1 {
  const result = loadTemplatesSafe();
  return { version: 1, templates: result.templates };
}

export function getTemplateById(id: string): ManuelBrutTemplate | undefined {
  return loadTemplatesSafe().templates.find((t) => t.id === id);
}

export function findByNameCaseInsensitive(
  name: string,
  excludeId?: string,
): ManuelBrutTemplate | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  return loadTemplatesSafe().templates.find(
    (t) => normalizeName(t.name) === n && t.id !== excludeId,
  );
}

export function addTemplate(name: string, periods: ManuelBrutPeriodsMap): ManuelBrutTemplate | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (findByNameCaseInsensitive(trimmed)) return null;
  const cleaned = cleanPeriods(periods);
  if (Object.keys(cleaned).length === 0) return null;
  if (findFloorViolations(cleaned).length > 0) return null;

  const entry: ManuelBrutTemplate = {
    id: newId(),
    name: trimmed,
    periods: cleaned,
    updatedAt: new Date().toISOString(),
  };
  const payload = readOrEmpty();
  payload.templates.push(entry);
  writePayload(payload);
  return entry;
}

export function updateTemplate(id: string, name: string, periods: ManuelBrutPeriodsMap): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const cleaned = cleanPeriods(periods);
  if (Object.keys(cleaned).length === 0) return false;
  if (findFloorViolations(cleaned).length > 0) return false;
  if (findByNameCaseInsensitive(trimmed, id)) return false;

  const payload = readOrEmpty();
  const idx = payload.templates.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  payload.templates[idx] = {
    ...payload.templates[idx],
    name: trimmed,
    periods: cleaned,
    updatedAt: new Date().toISOString(),
  };
  writePayload(payload);
  return true;
}

export function deleteTemplate(id: string): void {
  const payload = readOrEmpty();
  payload.templates = payload.templates.filter((t) => t.id !== id);
  writePayload(payload);
}

export function clearCorruptStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MANUEL_BRUT_STORAGE_KEY);
}
