/**
 * V3/backend kayıt → Ücret Alacağı form mapping.
 * Yalnızca form alanlarını doldurur; sonucu backend'den almaz (lokal motor yeniden hesaplar).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import type { CetvelRow, HesaplamaTab, SavedCase, UcretAlacagiForm } from "./model";
import { createEmptyForm, newLocalId } from "./model";

export const UCRET_ALACAGI_TYPE = "ucret_alacagi" as const;

export function isUcretAlacagiRecordType(type: string | undefined | null): boolean {
  return type === UCRET_ALACAGI_TYPE;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unwrapData(data: unknown): Record<string, unknown> {
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

function pickForm(payload: Record<string, unknown>): Record<string, unknown> {
  const form = asRecord(payload.form);
  if (!form) return payload;
  const inner = asRecord(form.form);
  return inner ?? form;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function mapRows(raw: unknown): CetvelRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const rec = asRecord(r) ?? {};
      const startISO = str(rec.startISO ?? rec.start ?? "");
      const endISO = str(rec.endISO ?? rec.end ?? "");
      return {
        id: str(rec.id || newLocalId("row")),
        rangeLabel: str(rec.rangeLabel ?? ""),
        startISO,
        endISO,
        katsayi: Number(rec.katsayi ?? 1) || 1,
        ucret: Number(rec.ucret ?? 0) || 0,
        gunSayisi: Number(rec.gunSayisi ?? rec.days ?? 0) || 0,
        ayGunSayisi: Number(rec.ayGunSayisi ?? 30) || 30,
        ucretManual: Boolean(rec.ucretManual),
        odenenUcret: Number(rec.odenenUcret ?? rec.odenen_ucret ?? 0) || 0,
        netVerisiYok: rec.netVerisiYok != null ? Boolean(rec.netVerisiYok) : undefined,
      } as CetvelRow;
    })
    .filter((r) => !!r.startISO);
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

/** Backend data → lokal form. Bozuksa null. */
export function mapUcretAlacagiFormFromBackend(data: unknown): UcretAlacagiForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    const activeTab: HesaplamaTab = form.activeTab === "net" ? "net" : "brut";
    const cetvelRows = mapRows(form.cetvelRows ?? form.rows);
    const netCetvelRows = mapRows(form.netCetvelRows);
    return {
      startDate: str(form.startDate) || empty.startDate,
      endDate: str(form.endDate) || empty.endDate,
      activeTab,
      cetvelRows,
      netCetvelRows,
      globalKatsayi: Number(form.globalKatsayi ?? 1) || 1,
      netGlobalKatsayi: Number(form.netGlobalKatsayi ?? 1) || 1,
      hasCustomKatsayi: Number(form.globalKatsayi ?? 1) !== 1,
      netHasCustomKatsayi: Number(form.netGlobalKatsayi ?? 1) !== 1,
      netForGross: empty.netForGross,
      netTabGrossForNet: empty.netTabGrossForNet,
    };
  } catch {
    return null;
  }
}

export const ucretAlacagiCaseCrud = createCalcBackendCrud({
  recordType: UCRET_ALACAGI_TYPE,
  isRecordType: isUcretAlacagiRecordType,
  mapFormFromBackend: mapUcretAlacagiFormFromBackend,
  buildSaveData: (form, result) =>
    buildCalcSavePayload({
      form,
      result,
      iseGiris: form.startDate || null,
      istenCikis: form.endDate || null,
    }),
});

export function buildUcretAlacagiSaveResult(totalBrut: number, totalNet: number): CalcSaveResult {
  return { brut: totalBrut, net: totalNet, totalBrut, totalNet };
}

export function mapUcretAlacagiRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapUcretAlacagiFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const totalBrut = Number(payload.brut_total ?? results?.brut ?? results?.totalBrut ?? 0);
  const totalNet = Number(payload.net_total ?? results?.net ?? results?.totalNet ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      totalBrut: Number.isFinite(totalBrut) ? totalBrut : 0,
      totalNet: Number.isFinite(totalNet) ? totalNet : 0,
    },
  };
}

export async function listUcretAlacagiCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(UCRET_ALACAGI_TYPE, mapUcretAlacagiRecordToSavedCase);
}
