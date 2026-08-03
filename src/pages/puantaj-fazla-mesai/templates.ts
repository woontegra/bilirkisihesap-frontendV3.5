import type { PuantajTemplate } from "./model";
import { id, normalizeText } from "./utils";

/**
 * Puantaj eşleştirme şablonlarının LOKAL yönetimi.
 * Tüm veriler yalnızca localStorage'da tutulur; hiçbir ağ isteği yapılmaz.
 */

export const TEMPLATE_SCHEMA_VERSION = 2;
const STORAGE_KEY = "puantaj_fm_templates_v2";
const LEGACY_STORAGE_KEY = "puantaj_fm_templates_v1";

function safeParse(json: string | null): PuantajTemplate[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    return Array.isArray(data) ? (data as PuantajTemplate[]) : [];
  } catch {
    return [];
  }
}

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function loadTemplates(): PuantajTemplate[] {
  if (!hasStorage()) return [];
  const current = safeParse(localStorage.getItem(STORAGE_KEY));
  if (current.length > 0) return current;
  // v1 → v2: codeMap aynı; yalnızca depo anahtarı yükselir.
  const legacy = safeParse(localStorage.getItem(LEGACY_STORAGE_KEY));
  if (legacy.length > 0) {
    const migrated = legacy.map((t) => ({ ...t, version: Math.max(t.version ?? 1, TEMPLATE_SCHEMA_VERSION) }));
    persist(migrated);
    return migrated;
  }
  return [];
}

function persist(list: PuantajTemplate[]): void {
  if (!hasStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function saveTemplate(template: PuantajTemplate): PuantajTemplate {
  const list = loadTemplates();
  const now = new Date().toISOString();
  const idx = list.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    const updated: PuantajTemplate = {
      ...template,
      version: (list[idx].version ?? 1) + 1,
      updatedAt: now,
      createdAt: list[idx].createdAt ?? now,
    };
    list[idx] = updated;
    persist(list);
    return updated;
  }
  const created: PuantajTemplate = {
    ...template,
    id: template.id || id("tpl"),
    version: template.version || 1,
    createdAt: now,
    updatedAt: now,
  };
  list.push(created);
  persist(list);
  return created;
}

export function deleteTemplate(templateId: string): void {
  persist(loadTemplates().filter((t) => t.id !== templateId));
}

export function duplicateTemplate(templateId: string): PuantajTemplate | null {
  const list = loadTemplates();
  const src = list.find((t) => t.id === templateId);
  if (!src) return null;
  const now = new Date().toISOString();
  const copy: PuantajTemplate = {
    ...src,
    id: id("tpl"),
    name: `${src.name} (kopya)`,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  list.push(copy);
  persist(list);
  return copy;
}

/**
 * Belge başlıklarından bir imza üretir (sıra bağımsız, normalize edilmiş).
 * Aynı format tekrar yüklendiğinde uygun şablonu önermek için kullanılır.
 */
export function buildSignature(headers: string[]): string {
  return headers
    .map((h) => normalizeText(h))
    .filter(Boolean)
    .sort()
    .join("|");
}

/** İmzaya göre en uygun şablonu döner (birebir imza eşleşmesi veya yüksek örtüşme). */
export function suggestTemplate(headers: string[]): PuantajTemplate | null {
  const sig = buildSignature(headers);
  if (!sig) return null;
  const list = loadTemplates();
  if (list.length === 0) return null;

  const exact = list.find((t) => t.signature === sig);
  if (exact) return exact;

  const headerSet = new Set(sig.split("|"));
  let best: { t: PuantajTemplate; score: number } | null = null;
  for (const t of list) {
    const tokens = t.signature.split("|").filter(Boolean);
    if (tokens.length === 0) continue;
    const overlap = tokens.filter((tok) => headerSet.has(tok)).length;
    const score = overlap / Math.max(tokens.length, headerSet.size);
    if (!best || score > best.score) best = { t, score };
  }
  return best && best.score >= 0.6 ? best.t : null;
}
