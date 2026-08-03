/**
 * V3/backend kayıt → Kötü Niyet Tazminatı form mapping.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import type { KotuNiyetForm, SavedCase } from "./model";
import { createEmptyForm } from "./model";

export const KOTU_NIYET_TYPE = "kotu_niyet_tazminati" as const;

export function isKotuNiyetRecordType(type: string | undefined | null): boolean {
  return type === KOTU_NIYET_TYPE;
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
  return asRecord(payload.form) ?? asRecord(payload.formValues) ?? payload;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapKotuNiyetFormFromBackend(data: unknown): KotuNiyetForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    return {
      startDate: str(form.startDate ?? form.iseGiris) || empty.startDate,
      endDate: str(form.endDate ?? form.istenCikis) || empty.endDate,
      brut: str(form.brut ?? form.brutUcret) || empty.brut,
      prim: str(form.prim) || empty.prim,
      ikramiye: str(form.ikramiye) || empty.ikramiye,
      yol: str(form.yol) || empty.yol,
      yemek: str(form.yemek) || empty.yemek,
      extras: empty.extras,
    };
  } catch {
    return null;
  }
}

export const kotuNiyetCaseCrud = createCalcBackendCrud({
  recordType: KOTU_NIYET_TYPE,
  isRecordType: isKotuNiyetRecordType,
  mapFormFromBackend: mapKotuNiyetFormFromBackend,
  buildSaveData: (form, result) =>
    buildCalcSavePayload({
      form,
      result,
      iseGiris: form.startDate || null,
      istenCikis: form.endDate || null,
    }),
});

export function buildKotuNiyetSaveResult(result: {
  toplamBrut: number;
  brutAmount: number;
  netAmount: number;
  weeks: number;
}): CalcSaveResult {
  return {
    brut: result.brutAmount,
    net: result.netAmount,
    toplamBrut: result.toplamBrut,
    brutAmount: result.brutAmount,
    netAmount: result.netAmount,
    weeks: result.weeks,
  };
}

export function mapKotuNiyetRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapKotuNiyetFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const toplamBrut = Number(results?.toplamBrut ?? payload.brut_total ?? results?.brut ?? 0);
  const brutAmount = Number(results?.brutAmount ?? results?.brut ?? payload.brut_total ?? 0);
  const netAmount = Number(results?.netAmount ?? results?.net ?? payload.net_total ?? 0);
  const weeks = Number(results?.weeks ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      toplamBrut: Number.isFinite(toplamBrut) ? toplamBrut : 0,
      brutAmount: Number.isFinite(brutAmount) ? brutAmount : 0,
      netAmount: Number.isFinite(netAmount) ? netAmount : 0,
      weeks: Number.isFinite(weeks) ? weeks : 0,
    },
  };
}

export async function listKotuNiyetCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(KOTU_NIYET_TYPE, mapKotuNiyetRecordToSavedCase);
}
