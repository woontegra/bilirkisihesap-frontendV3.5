/**
 * Tanıklı Standart — dışlanabilir gün setlerinin lokal kaydı (izolasyon).
 */

import type { ExclusionItem } from "./model";
import { newLocalId } from "./model";

const KEY = "bilirkisi-hesap-v35:fm-tanikli:exclusion-sets:v1" as const;

export type SavedExclusionSet = {
  id: string;
  name: string;
  data: ExclusionItem[];
  createdAt: string;
};

function readAll(): SavedExclusionSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SavedExclusionSet => !!s && typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.data),
    );
  } catch {
    return [];
  }
}

function writeAll(sets: SavedExclusionSet[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(sets));
}

export function getAllExclusionSets(): SavedExclusionSet[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveExclusionSet(name: string, data: ExclusionItem[]): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const sets = readAll();
  sets.push({ id: newLocalId(), name: trimmed, data: data.map((d) => ({ ...d })), createdAt: new Date().toISOString() });
  writeAll(sets);
  return true;
}

export function deleteExclusionSet(id: string): boolean {
  writeAll(readAll().filter((s) => s.id !== id));
  return true;
}
