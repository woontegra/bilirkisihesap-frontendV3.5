/**
 * UBGT dışlanabilir gün aralıkları — lokal set deposu (API yok).
 * Fazla mesai `exclusionSets` / localExtraSetsStore deseni.
 */

import { newLocalId, type UbgtExcludedDayRow } from "./model";

const KEY = "bilirkisi-hesap-v35:ubgt:exclusion-sets:v1" as const;

export type SavedUbgtExclusionSet = {
  id: string;
  name: string;
  data: UbgtExcludedDayRow[];
  createdAt: string;
};

function readAll(): SavedUbgtExclusionSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SavedUbgtExclusionSet =>
        !!s && typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.data),
    );
  } catch {
    return [];
  }
}

function writeAll(sets: SavedUbgtExclusionSet[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(sets));
}

export function getAllExclusionSets(): SavedUbgtExclusionSet[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveExclusionSet(name: string, data: UbgtExcludedDayRow[]): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const sets = readAll();
  sets.push({
    id: newLocalId("ubgt-ex"),
    name: trimmed,
    data: data.map((d) => ({ ...d, id: d.id || newLocalId("ex") })),
    createdAt: new Date().toISOString(),
  });
  writeAll(sets);
  return true;
}

export function deleteExclusionSet(id: string): boolean {
  writeAll(readAll().filter((s) => s.id !== id));
  return true;
}
