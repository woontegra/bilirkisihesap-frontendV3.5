/**
 * Lokal ekstra hesaplama setleri deposu.
 * Hesap motorundan bağımsız; network yok (CRUD lokal).
 * İsteğe bağlı salt-okunur legacy GET import ayrı çağrılır.
 */

export type LocalExtraSetItem = {
  id: string;
  name: string;
  value: string;
};

export type LocalExtraSet = {
  id: string;
  name: string;
  data: LocalExtraSetItem[];
  createdAt: string;
  updatedAt: string;
  /** Backend'den tek seferlik aktarıldıysa kaynak id */
  legacyBackendId?: number;
};

type StorePayload = {
  version: 1;
  sets: LocalExtraSet[];
};

function newId(prefix = "set"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function scopeIds(): { tenantId: string; userId: string } {
  try {
    return {
      tenantId: localStorage.getItem("tenant_id") || "0",
      userId: localStorage.getItem("user_id") || "0",
    };
  } catch {
    return { tenantId: "0", userId: "0" };
  }
}

export function localExtraSetsKey(moduleId: string): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:${moduleId}:extra-sets:v1:t${tenantId}:u${userId}`;
}

export function legacyImportFlagKey(moduleId: string): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:${moduleId}:extra-sets-legacy-imported:v1:t${tenantId}:u${userId}`;
}

function readStore(moduleId: string): LocalExtraSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(localExtraSetsKey(moduleId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StorePayload>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sets)) return [];
    return parsed.sets.filter(
      (s): s is LocalExtraSet =>
        !!s && typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.data),
    );
  } catch {
    return [];
  }
}

function writeStore(moduleId: string, sets: LocalExtraSet[]): void {
  if (typeof window === "undefined") return;
  const payload: StorePayload = { version: 1, sets };
  localStorage.setItem(localExtraSetsKey(moduleId), JSON.stringify(payload));
}

export function listLocalExtraSets(moduleId: string): LocalExtraSet[] {
  return readStore(moduleId).slice().sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export function upsertLocalExtraSet(
  moduleId: string,
  name: string,
  items: LocalExtraSetItem[],
): LocalExtraSet {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Lütfen bir isim girin");
  if (!items.length) throw new Error("Kaydedilecek ekstra hesaplama bulunamadı");
  const now = new Date().toISOString();
  const sets = readStore(moduleId);
  const existing = sets.find((s) => s.name.toLocaleLowerCase("tr") === trimmed.toLocaleLowerCase("tr"));
  const data = items.map((it) => ({
    id: it.id || newId("item"),
    name: String(it.name || ""),
    value: it.value == null ? "" : String(it.value),
  }));
  if (existing) {
    const updated: LocalExtraSet = { ...existing, name: trimmed, data, updatedAt: now };
    writeStore(
      moduleId,
      sets.map((s) => (s.id === existing.id ? updated : s)),
    );
    return updated;
  }
  const created: LocalExtraSet = {
    id: newId("set"),
    name: trimmed,
    data,
    createdAt: now,
    updatedAt: now,
  };
  writeStore(moduleId, [...sets, created]);
  return created;
}

export function deleteLocalExtraSet(moduleId: string, id: string): void {
  writeStore(
    moduleId,
    readStore(moduleId).filter((s) => s.id !== id),
  );
}

export function wasLegacyImported(moduleId: string): boolean {
  try {
    return localStorage.getItem(legacyImportFlagKey(moduleId)) === "1";
  } catch {
    return false;
  }
}

export function markLegacyImported(moduleId: string): void {
  try {
    localStorage.setItem(legacyImportFlagKey(moduleId), "1");
  } catch {
    /* ignore */
  }
}

export function clearLegacyImportedFlag(moduleId: string): void {
  try {
    localStorage.removeItem(legacyImportFlagKey(moduleId));
  } catch {
    /* ignore */
  }
}

/**
 * Salt okunur backend listesini lokale aktarır.
 * Aynı legacyBackendId veya aynı isim varsa atlar (mükerrer yok).
 * Backend'e yazmaz.
 */
export function mergeLegacyExtraSets(
  moduleId: string,
  legacy: Array<{ id?: number; name?: string; data?: unknown }>,
): { imported: number; skipped: number } {
  const sets = readStore(moduleId);
  const byLegacy = new Set(sets.map((s) => s.legacyBackendId).filter((x): x is number => typeof x === "number"));
  const byName = new Set(sets.map((s) => s.name.toLocaleLowerCase("tr")));
  let imported = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  const next = [...sets];

  for (const raw of legacy) {
    const name = String(raw?.name || "").trim();
    const backendId = Number(raw?.id);
    if (!name) {
      skipped++;
      continue;
    }
    if (Number.isFinite(backendId) && backendId > 0 && byLegacy.has(backendId)) {
      skipped++;
      continue;
    }
    if (byName.has(name.toLocaleLowerCase("tr"))) {
      skipped++;
      continue;
    }
    let dataRaw = raw.data;
    if (typeof dataRaw === "string") {
      try {
        dataRaw = JSON.parse(dataRaw);
      } catch {
        dataRaw = [];
      }
    }
    const data: LocalExtraSetItem[] = Array.isArray(dataRaw)
      ? dataRaw
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => ({
            id: String(e.id || newId("item")),
            name: String(e.name ?? e.label ?? ""),
            value: e.value == null ? "" : String(e.value),
          }))
      : [];
    const created: LocalExtraSet = {
      id: newId("set"),
      name,
      data,
      createdAt: now,
      updatedAt: now,
      legacyBackendId: Number.isFinite(backendId) && backendId > 0 ? backendId : undefined,
    };
    next.push(created);
    byName.add(name.toLocaleLowerCase("tr"));
    if (created.legacyBackendId) byLegacy.add(created.legacyBackendId);
    imported++;
  }

  writeStore(moduleId, next);
  markLegacyImported(moduleId);
  return { imported, skipped };
}
