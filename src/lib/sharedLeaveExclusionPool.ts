/**
 * Hesaplama sayfaları arasında paylaşılan izin / dışlama set havuzu.
 * Yıllık İzin, Fazla Mesai, Hafta Tatili, UBGT vb. uyumlu sayfalar aynı kayıtları görür.
 */

import {
  listLocalExclusionSets,
  upsertLocalExclusionSet,
  type LocalExclusionSet,
  type LocalExclusionSetItem,
} from "@/lib/localExclusionSetsStore";

export const SHARED_LEAVE_EXCLUSION_POOL_ID = "shared-leave-exclusions";

const MIGRATION_FLAG = "bilirkisi-hesap-v35:shared-leave-exclusions:migrated:v1";

/** Eski sayfa-özel localExclusionSetsStore moduleId değerleri. */
export const LEGACY_EXCLUSION_MODULE_IDS = [
  "yillik-izin-used-leave",
  "yillik-izin-basin-used-leave",
  "yillik-izin-belirli-used-leave",
  "yillik-izin-kismi-used-leave",
  "yillik-izin-mevsim-used-leave",
  "yillik-izin-gemi-used-leave",
  "yillik-izin-borclar-used-leave",
  "yillik-izin-basin-gunluk-olmayan-used-leave",
  "hafta-tatili",
] as const;

/** Eski FM / UBGT sayfa-özel localStorage anahtarları. */
export const LEGACY_FM_EXCLUSION_STORAGE_KEYS = [
  "bilirkisi-hesap-v35:fm-standart:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-donemsel:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-donemsel-haftalik:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-tanikli:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-haftalik-karma:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-vardiya-24:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-vardiya-48:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-yeralti:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-gemi-724:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-gemi-gunluk:exclusion-sets:v1",
  "bilirkisi-hesap-v35:ubgt:exclusion-sets:v1",
] as const;

type LegacyFmSet = {
  id: string;
  name: string;
  data: LocalExclusionSetItem[];
  createdAt?: string;
};

export function rowFingerprint(item: {
  type?: string;
  start: string;
  end: string;
  days: number | string;
}): string {
  const daysNum = Number(String(item.days ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  return `${String(item.type ?? "").trim().toLowerCase()}|${item.start}|${item.end}|${daysNum}`;
}

export function normalizeLeaveTypeForFm(raw?: string): string {
  const t = String(raw ?? "").trim();
  if (!t || t === "Kullanılan İzin") return "Yıllık İzin";
  return t;
}

export function normalizeLeaveTypeForHaftaTatili(raw?: string): string {
  const t = normalizeLeaveTypeForFm(raw);
  if (t === "Puantaj-Bordro") return "Diğer";
  if (["Yıllık İzin", "Rapor", "Diğer", "UBGT"].includes(t)) return t;
  return "Diğer";
}

export function fmItemsToPoolItems(
  items: Array<{ id?: string; type?: string; start: string; end: string; days: number }>,
): LocalExclusionSetItem[] {
  return items
    .filter((r) => r.start && r.end)
    .map((r) => ({
      id: r.id || `item-${Math.random().toString(36).slice(2, 10)}`,
      type: normalizeLeaveTypeForFm(r.type),
      start: r.start,
      end: r.end,
      days: Number(r.days) || 0,
    }));
}

export function poolItemsToFmItems(items: LocalExclusionSetItem[]): Array<{
  id: string;
  type: string;
  start: string;
  end: string;
  days: number;
}> {
  return items.map((it) => ({
    id: it.id || `item-${Math.random().toString(36).slice(2, 10)}`,
    type: normalizeLeaveTypeForFm(it.type),
    start: it.start || "",
    end: it.end || "",
    days: Number(it.days) || 0,
  }));
}

function readLegacyFmSets(key: string): LegacyFmSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is LegacyFmSet =>
        !!s && typeof s.name === "string" && Array.isArray(s.data),
    );
  } catch {
    return [];
  }
}

function mergeSetIntoPool(name: string, items: LocalExclusionSetItem[]): void {
  if (!name.trim() || !items.length) return;
  try {
    upsertLocalExclusionSet(SHARED_LEAVE_EXCLUSION_POOL_ID, name, items);
  } catch {
    /* skip invalid */
  }
}

/** Eski sayfa-özel depolardan havuza tek seferlik aktarım. */
export function ensureSharedLeaveExclusionPoolMigrated(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG) === "1") return;

  for (const moduleId of LEGACY_EXCLUSION_MODULE_IDS) {
    for (const set of listLocalExclusionSets(moduleId)) {
      mergeSetIntoPool(set.name, set.data);
    }
  }

  for (const key of LEGACY_FM_EXCLUSION_STORAGE_KEYS) {
    for (const set of readLegacyFmSets(key)) {
      mergeSetIntoPool(set.name, fmItemsToPoolItems(set.data));
    }
  }

  localStorage.setItem(MIGRATION_FLAG, "1");
}

export function listSharedLeaveExclusionSets(): LocalExclusionSet[] {
  ensureSharedLeaveExclusionPoolMigrated();
  return listLocalExclusionSets(SHARED_LEAVE_EXCLUSION_POOL_ID);
}

export function mergeRowsByFingerprint<T extends { id: string; start: string; end: string; days: number | string; type?: string }>(
  existing: T[],
  imported: T[],
  createId: () => string,
  mapRow?: (row: T) => T,
): T[] {
  const seen = new Set(
    existing.filter((r) => r.start && r.end).map((r) => rowFingerprint(r)),
  );
  const merged = [...existing];
  for (const raw of imported) {
    if (!raw.start || !raw.end) continue;
    const row = mapRow ? mapRow(raw) : raw;
    const fp = rowFingerprint(row);
    if (seen.has(fp)) continue;
    seen.add(fp);
    merged.push({ ...row, id: createId() });
  }
  return merged;
}
