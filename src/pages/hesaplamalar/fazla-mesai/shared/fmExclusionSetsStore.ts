/**
 * Fazla Mesai — paylaşılan izin/dışlama set deposu (tüm FM varyantları).
 */

import { deleteLocalExclusionSet, upsertLocalExclusionSet } from "@/lib/localExclusionSetsStore";
import {
  SHARED_LEAVE_EXCLUSION_POOL_ID,
  fmItemsToPoolItems,
  listSharedLeaveExclusionSets,
  mergeRowsByFingerprint,
  poolItemsToFmItems,
} from "@/lib/sharedLeaveExclusionPool";

export type FmExclusionItem = {
  id: string;
  type: string;
  start: string;
  end: string;
  days: number;
};

export type SavedExclusionSet = {
  id: string;
  name: string;
  data: FmExclusionItem[];
  createdAt: string;
};

export function getAllExclusionSets(): SavedExclusionSet[] {
  return listSharedLeaveExclusionSets().map((set) => ({
    id: set.id,
    name: set.name,
    data: poolItemsToFmItems(set.data) as FmExclusionItem[],
    createdAt: set.createdAt,
  }));
}

export function saveExclusionSet(name: string, data: FmExclusionItem[]): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const items = fmItemsToPoolItems(data);
  if (!items.length) return false;
  upsertLocalExclusionSet(SHARED_LEAVE_EXCLUSION_POOL_ID, trimmed, items);
  return true;
}

export function deleteExclusionSet(id: string): boolean {
  deleteLocalExclusionSet(SHARED_LEAVE_EXCLUSION_POOL_ID, id);
  return true;
}

/** İçe aktarma: UBGT korunur, diğer satırlar birleştirilir, mükerrer eklenmez. */
export function mergeFmExclusionImport<T extends FmExclusionItem>(
  prev: T[],
  loaded: T[],
  newLocalId: () => string,
): T[] {
  const isUbgt = (e: FmExclusionItem) => String(e.type || "").trim() === "UBGT";
  const prevUbgt = prev.filter(isUbgt);
  const loadedUbgt = loaded.filter(isUbgt);
  const loadedOther = loaded.filter((e) => !isUbgt(e));
  const ubgt = prevUbgt.length > 0 ? prevUbgt : loadedUbgt;
  const mergedOther = mergeRowsByFingerprint(
    prev.filter((e) => !isUbgt(e)),
    loadedOther,
    newLocalId,
  );
  return [...ubgt, ...mergedOther] as T[];
}
