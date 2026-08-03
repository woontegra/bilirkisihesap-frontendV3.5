/**
 * V3 `/api/saved-cases` kayıt CRUD — tüm hesaplama sayfaları için ortak fabrika.
 */

import {
  createSavedCase,
  deleteSavedCase,
  getSavedCase,
  listSavedCases,
  updateSavedCase,
  type SavedCaseRecord,
} from "@/api/savedCases";

export type CalcSaveResult = {
  brut: number;
  net: number;
  rowCount?: number;
  [key: string]: unknown;
};

export type CalcSavedCaseListItem = {
  id: string;
  name: string;
  updatedAt: string;
  result: CalcSaveResult;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNumberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function unwrapCalcData(data: unknown): Record<string, unknown> {
  let payload: unknown = data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return {};
    }
  }
  const root = asRecord(payload) ?? {};
  const nested = asRecord(root.data);
  return nested ?? root;
}

export function buildCalcSavePayload(opts: {
  form: Record<string, unknown>;
  result: CalcSaveResult;
  iseGiris?: string | null;
  istenCikis?: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const { form, result, iseGiris, istenCikis, extra } = opts;
  return {
    form,
    formValues: form,
    ...extra,
    brut_total: result.brut,
    net_total: result.net,
    ise_giris: iseGiris ?? null,
    isten_cikis: istenCikis ?? null,
    results: {
      brut: result.brut,
      net: result.net,
      totals: { brut: result.brut, net: result.net, totalBrut: result.brut },
      ...result,
    },
  };
}

export function mapCalcRecordToListItem(record: SavedCaseRecord): CalcSavedCaseListItem {
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const brut =
    toNumberOr(payload.brut_total, 0) ||
    toNumberOr(results?.brut, 0) ||
    toNumberOr(results?.brutKidem, 0) ||
    toNumberOr(results?.toplamBrut, 0);
  const net =
    toNumberOr(payload.net_total, 0) ||
    toNumberOr(results?.net, 0) ||
    toNumberOr(results?.netKidem, 0);
  const name = record.name ?? record.kayit_adi;
  return {
    id: String(record.id),
    name: name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`,
    updatedAt: str(record.createdAt ?? record.created_at) || new Date().toISOString(),
    result: { brut, net, rowCount: 0 },
  };
}

export function createCalcBackendCrud<TForm>(opts: {
  recordType: string;
  isRecordType: (type: string | undefined) => boolean;
  mapFormFromBackend: (
    data: unknown,
    record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
  ) => TForm | null;
  buildSaveData: (form: TForm, result: CalcSaveResult) => Record<string, unknown>;
}) {
  const { recordType, isRecordType, mapFormFromBackend, buildSaveData } = opts;

  async function listCases(): Promise<CalcSavedCaseListItem[]> {
    const all = await listSavedCases();
    return all.filter((r) => isRecordType(r.type ?? r.hesaplama_tipi)).map(mapCalcRecordToListItem);
  }

  async function loadCase(id: number): Promise<{ record: SavedCaseRecord; form: TForm }> {
    const record = await getSavedCase(id);
    const form = mapFormFromBackend(record.data, record);
    if (!form) {
      throw new Error("Kayıt verisi okunamadı");
    }
    if (!isRecordType(record.type ?? record.hesaplama_tipi)) {
      throw new Error(`Bu kayıt beklenen türde değil (${record.type ?? record.hesaplama_tipi})`);
    }
    return { record, form };
  }

  async function saveCase(
    name: string,
    form: TForm,
    result: CalcSaveResult,
    existingId?: string | null,
  ): Promise<SavedCaseRecord> {
    const data = buildSaveData(form, result);
    const payload = { name: name.trim(), type: recordType, data };
    const numericId = existingId ? Number(existingId) : NaN;
    if (Number.isFinite(numericId) && numericId > 0) {
      return updateSavedCase(numericId, payload);
    }
    return createSavedCase(payload);
  }

  async function removeCase(id: string | number): Promise<void> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      throw new Error("Geçersiz kayıt kimliği");
    }
    await deleteSavedCase(numericId);
  }

  return { listCases, loadCase, saveCase, removeCase, recordType, isRecordType };
}

/** Backend kayıtlarını sayfa `SavedCase` tipine map eder. */
export async function listCalcSavedCases<T>(
  recordType: string,
  mapRecord: (record: SavedCaseRecord) => T | null,
): Promise<T[]> {
  const all = await listSavedCases();
  return all
    .filter((r) => (r.type ?? r.hesaplama_tipi) === recordType)
    .map(mapRecord)
    .filter((item): item is T => item != null);
}
