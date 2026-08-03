/**
 * Lokal exclusion / kullanılan-izin set yardımcıları —
 * UsedLeaveRow ↔ LocalExclusionSetItem ve salt-okunur legacy GET.
 */

import { apiClient } from "@/api/client";
import {
  clearExclusionLegacyImportedFlag,
  mergeLegacyExclusionSets,
  type LocalExclusionSetItem,
  wasExclusionLegacyImported,
} from "@/lib/localExclusionSetsStore";

export type UsedLeaveLike = {
  id: string;
  start: string;
  end: string;
  days: string;
};

function toDays(value: string | number | undefined | null): number {
  return Number(String(value ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

/** Kaydet: başlangıç+bitiş dolu satırlar (V3 rowsToExcludedDays). */
export function collectExclusionSetItems(rows: UsedLeaveLike[]): LocalExclusionSetItem[] {
  return rows
    .filter((r) => r.start && r.end)
    .map((r) => ({
      id: r.id || `item-${Math.random().toString(36).slice(2, 10)}`,
      type: "Kullanılan İzin",
      start: r.start,
      end: r.end,
      days: toDays(r.days),
    }));
}

/** İçe aktar: LocalExclusionSetItem[] → UsedLeaveRow şekli. */
export function exclusionItemsToUsedRows(items: LocalExclusionSetItem[], minRows = 2): UsedLeaveLike[] {
  if (!items.length) {
    return Array.from({ length: minRows }, () => ({
      id: Math.random().toString(36).slice(2),
      start: "",
      end: "",
      days: "",
    }));
  }
  return items.map((row) => ({
    id: row.id || Math.random().toString(36).slice(2),
    start: row.start || "",
    end: row.end || "",
    days: row.days != null ? String(row.days) : "",
  }));
}

/** Salt-okunur legacy GET; backend'e yazmaz. force=true → flag temizleyip yeniden tara. */
export async function tryMergeLegacyExclusionSets(
  moduleId: string,
  options?: { force?: boolean },
): Promise<{ imported: number; skipped: number } | null> {
  if (!options?.force && wasExclusionLegacyImported(moduleId)) return null;
  if (options?.force) clearExclusionLegacyImportedFlag(moduleId);
  try {
    const raw = await apiClient<unknown>("/api/exclusion-sets", { method: "GET" });
    const list = Array.isArray(raw) ? raw : [];
    return mergeLegacyExclusionSets(
      moduleId,
      list.filter((e): e is { id?: number; name?: string; data?: unknown } => !!e && typeof e === "object"),
    );
  } catch {
    return null;
  }
}
