/**
 * Gemi Adamı — Günlük Çalışan Fazla Mesai motoru (%100 lokal).
 * Backend gemiFM.service + V3 sayfa sonrası tanık FM override / birleştirme / düşüm.
 */

import { getAsgariUcretByDate, getAsgariUcretPeriodsInRange } from "./asgariUcret";
import {
  applyMode270DetailedHireYear,
  applyMode270SimpleToRows,
} from "../shared/mode270Core";
import {
  DAMGA_ORAN,
  FAZLA_MESAI_DENOMINATOR,
  FAZLA_MESAI_KATSAYI,
  GEMI_DAILY_REF_HOURS,
  HALF_YEAR_DAY_LIMIT,
  ISSIZLIK_ORANI,
  MAX_WEEKS_PER_YEAR,
  MODE270_SIMPLE_REDUCTION_HOURS,
  PANDEMI_BASLANGIC,
  PANDEMI_BITIS,
  PANDEMI_SABIT_GUN,
  SGK_ORANI,
  WEEKLY_WORK_LIMIT,
} from "./constants";
import {
  bilirkisiRoundWeeklyTotalHours,
  buildSevenDayWindowsForTest,
  calculateFm,
  expandGemiGunlukRowsForDeductions,
  gemiFmHoursForDeductionWeek,
  makeBlankManualRow,
} from "./expandRowsForDeductions";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import { preserveWeeks } from "./preserveWeeks";
import {
  newLocalId,
  type GemiGunlukFormSnapshot,
  type GemiGunlukResult,
  type PeriodRow,
  type RowOverride,
  type SevenDayMode,
  type Witness,
} from "./model";

export {
  bilirkisiRoundWeeklyTotalHours,
  buildSevenDayWindowsForTest as buildSevenDayWindows,
  calculateFm,
  gemiFmHoursForDeductionWeek,
  makeBlankManualRow,
};
export { WEEKLY_WORK_LIMIT, GEMI_DAILY_REF_HOURS as DAILY_REF, FAZLA_MESAI_DENOMINATOR as DENOM, FAZLA_MESAI_KATSAYI as FACTOR };

/* ── Sayı / para ── */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseMoneyInput(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

export { sanitizeMoneyTyping } from "@/utils/moneyInput";

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

export function formatHours(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

export function parseKatsayi(value: string): number {
  const n = parseMoneyInput(value);
  return n > 0 ? n : 1;
}

/** V3 `ceilWeeklyWorkHoursToHalfHour` — metin / tanık FM. */
export function ceilWeeklyWorkHoursToHalfHour(weeklyTotal: number): number {
  const GRID_EPS = 1e-7;
  if (!Number.isFinite(weeklyTotal)) return 0;
  const doubled = weeklyTotal * 2;
  const nearestHalf = Math.round(doubled);
  if (Math.abs(doubled - nearestHalf) < GRID_EPS) return nearestHalf / 2;
  return Math.ceil(doubled - GRID_EPS) / 2;
}

/* ── Tarih ── */

export function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? "").trim());
}

function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetweenIsoInclusive(startISO: string, endISO: string): number {
  if (!isValidIsoDate(startISO) || !isValidIsoDate(endISO)) return 0;
  return isoToUtcDays(endISO) - isoToUtcDays(startISO) + 1;
}

export function validateDateRange(startIso: string, endIso: string): string | null {
  if (!startIso || !endIso) return null;
  if (!isValidIsoDate(startIso) || !isValidIsoDate(endIso)) return "Geçersiz tarih.";
  if (endIso < startIso) return "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
  return null;
}

export function isValidRange(startIso: string, endIso: string): boolean {
  return !validateDateRange(startIso, endIso) && !!startIso && !!endIso;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Backend calculateWeekCount (exclusions=[] ile): round(gün/7), 25→26, ≤370 ise max 52. */
export function calculateWeekCount(startIso: string, endIso: string): number {
  const days = daysBetweenIsoInclusive(startIso, endIso);
  if (days <= 0) return 0;
  let weeks = Math.round(days / 7);
  if (weeks === 25 && days <= HALF_YEAR_DAY_LIMIT) weeks = 26;
  if (days <= 370 && weeks > MAX_WEEKS_PER_YEAR) weeks = MAX_WEEKS_PER_YEAR;
  if (weeks < 1) weeks = 1;
  return weeks;
}

export function calculateWeeksBetweenDates(startISO: string, endISO: string): number {
  if (!isValidIsoDate(startISO) || !isValidIsoDate(endISO) || endISO < startISO) return 0;
  return Math.max(0, Math.round(daysBetweenIsoInclusive(startISO, endISO) / 7));
}

export function computeZamanasimiNihaiBaslangic(
  davaTarihi: string,
  arabuluculukBaslangic: string,
  arabuluculukBitis: string,
  iseGiris: string,
): string | null {
  if (!isValidIsoDate(davaTarihi)) return null;
  const davaMs = isoToUtcMs(davaTarihi);
  const limitMs = Date.UTC(
    new Date(davaMs).getUTCFullYear() - 5,
    new Date(davaMs).getUTCMonth(),
    new Date(davaMs).getUTCDate(),
  );

  let arabuluculukGun = 0;
  if (isValidIsoDate(arabuluculukBaslangic) && isValidIsoDate(arabuluculukBitis)) {
    arabuluculukGun = Math.max(
      0,
      isoToUtcDays(arabuluculukBitis) - isoToUtcDays(arabuluculukBaslangic) + 1,
    );
  }

  let pandemiGun = 0;
  if (isValidIsoDate(iseGiris)) {
    const iseMs = isoToUtcMs(iseGiris);
    const pandemiBasMs = isoToUtcMs(PANDEMI_BASLANGIC);
    const pandemiBitMs = isoToUtcMs(PANDEMI_BITIS);
    if (iseMs < pandemiBasMs) pandemiGun = PANDEMI_SABIT_GUN;
    else if (iseMs >= pandemiBasMs && iseMs <= pandemiBitMs) {
      pandemiGun = Math.max(0, Math.round((pandemiBitMs - iseMs) / 86400000) + 1);
    }
  }

  const nihaiMs = limitMs - arabuluculukGun * 86400000 - pandemiGun * 86400000;
  const d = new Date(nihaiMs);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/* ── Saat ── */

export function parseTimeToHours(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

export function normalizeTimeStr(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  const clean = String(timeStr).trim().replace(".", ":");
  const [hs, ms] = clean.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function rawDailyHoursBetween(startHour: number, endHour: number): number {
  let raw = endHour - startHour;
  if (raw < 0) raw += 24;
  if (raw > 24) raw -= 24;
  return raw;
}

export function computeBreakHours(dailyGross: number): number {
  if (!Number.isFinite(dailyGross) || dailyGross <= 0) return 0;
  if (dailyGross <= 4) return 0.25;
  if (dailyGross <= 7.5) return 0.5;
  if (dailyGross < 11) return 1;
  if (dailyGross < 14) return 1.5;
  if (dailyGross < 15) return 2;
  return 3;
}

export function calculateDailyWorkHours(inT: string, outT: string): number {
  const a = parseTimeToHours(inT);
  let b = parseTimeToHours(outT);
  if (a == null || b == null) return 0;
  if (b === 0 && a > 0) b = 24;
  return rawDailyHoursBetween(a, b);
}

/** Cetvel FM: yuvarlamasız (backend computeClassic). */
export function computeWeeklyHoursRaw(dailyHours: number, weeklyDays: number, sevenDayMode: SevenDayMode): number {
  const n = Number(weeklyDays) || 0;
  if (n === 7 && sevenDayMode === "tatilli") {
    return dailyHours * 6 + Math.max(0, dailyHours - GEMI_DAILY_REF_HOURS);
  }
  const daysWork = n > 0 ? n : 7;
  return dailyHours * daysWork;
}

export function computeFmHoursWeekly(dailyHours: number, weeklyDays: number, sevenDayMode: SevenDayMode): number {
  return Math.max(0, computeWeeklyHoursRaw(dailyHours, weeklyDays, sevenDayMode) - WEEKLY_WORK_LIMIT);
}

/** Alias tests. */
export function computeWeeklyHours(dailyHours: number, weeklyDays: number, sevenDayMode: SevenDayMode): number {
  return computeWeeklyHoursRaw(dailyHours, weeklyDays, sevenDayMode);
}

export function computeFmMoney(weeks: number, brut: number, katsayi: number, fmHours: number): { fm: number; net: number } {
  const fm = calculateFm(weeks, brut, katsayi, fmHours);
  const net = Number((fm * (1 - DAMGA_ORAN - 0.15)).toFixed(2));
  return { fm, net };
}

/* ── Segmentasyon (backend normalizeWitnessDateRanges) ── */

type DateSegment = { start: string; end: string; witnessIds: string[] };

function clipRange(
  a: { start: string; end: string },
  bound: { start: string; end: string },
): { start: string; end: string } | null {
  const start = a.start > bound.start ? a.start : bound.start;
  const end = a.end < bound.end ? a.end : bound.end;
  if (start > end) return null;
  return { start, end };
}

export function buildDateSegments(
  claimStart: string,
  claimEnd: string,
  witnesses: Witness[],
): DateSegment[] {
  if (!isValidRange(claimStart, claimEnd)) return [];

  const effective: { start: string; end: string; id: string }[] = [];
  for (const w of witnesses) {
    const tin = normalizeTimeStr(w.in);
    const tout = normalizeTimeStr(w.out);
    if (!w.dateIn || !w.dateOut || !tin || !tout || !isValidRange(w.dateIn, w.dateOut)) continue;
    const clipped = clipRange({ start: w.dateIn, end: w.dateOut }, { start: claimStart, end: claimEnd });
    if (clipped) effective.push({ ...clipped, id: w.id });
  }

  // Tanık yoksa / hepsi eksikse: davacı dönemi tek segment (V3 synthetic witness)
  if (effective.length === 0) {
    const pivots = new Set<string>();
    pivots.add(claimStart);
    pivots.add(addDaysIso(claimEnd, 1));
    for (const p of getAsgariUcretPeriodsInRange(claimStart, claimEnd)) {
      if (p.start > claimStart && p.start <= claimEnd) pivots.add(p.start);
    }
    const sorted = [...pivots].sort();
    const segments: DateSegment[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const segStart = sorted[i];
      const segEnd = addDaysIso(sorted[i + 1], -1);
      if (segStart > segEnd) continue;
      if (segStart < claimStart || segEnd > claimEnd) continue;
      segments.push({ start: segStart, end: segEnd, witnessIds: [] });
    }
    return segments;
  }

  const pivots = new Set<string>();
  pivots.add(claimStart);
  pivots.add(addDaysIso(claimEnd, 1));
  for (const r of effective) {
    pivots.add(r.start);
    pivots.add(addDaysIso(r.end, 1));
  }
  for (const p of getAsgariUcretPeriodsInRange(claimStart, claimEnd)) {
    if (p.start > claimStart && p.start <= claimEnd) pivots.add(p.start);
  }

  const sorted = [...pivots].sort();
  const segments: DateSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = addDaysIso(sorted[i + 1], -1);
    if (segStart > segEnd) continue;
    if (segStart < claimStart || segEnd > claimEnd) continue;
    const active = effective.filter((r) => !(segEnd < r.start || segStart > r.end)).map((r) => r.id);
    if (active.length === 0) continue;
    segments.push({ start: segStart, end: segEnd, witnessIds: active });
  }
  return segments;
}

function computeSegmentHours(
  witnessIds: string[],
  witnesses: Witness[],
  davaciStartH: number,
  davaciEndH: number,
): { startH: number; endH: number; raw: number; brk: number; net: number } {
  const active = witnesses.filter((w) => witnessIds.includes(w.id));
  let startH = davaciStartH;
  let endH = davaciEndH;

  if (active.length > 0) {
    let latestStart = davaciStartH;
    let earliestEnd = davaciEndH;
    for (const w of active) {
      const wStart = parseTimeToHours(normalizeTimeStr(w.in) || "");
      let wEnd = parseTimeToHours(normalizeTimeStr(w.out) || "");
      if (wStart == null || wEnd == null) continue;
      if (wEnd === 0 && wStart > 0) wEnd = 24;
      const clippedStart = Math.max(wStart, davaciStartH);
      const clippedEnd = Math.min(wEnd, davaciEndH);
      if (clippedStart > latestStart) latestStart = clippedStart;
      if (clippedEnd < earliestEnd) earliestEnd = clippedEnd;
    }
    if (latestStart < earliestEnd) {
      startH = latestStart;
      endH = earliestEnd;
    }
  }

  const raw = rawDailyHoursBetween(startH, endH);
  const brk = computeBreakHours(raw);
  const net = Math.max(0, raw - brk);
  return { startH, endH, raw, brk, net };
}

/* ── 270 (V3 backend sırası: expand öncesi) ── */

export function applyMode270Simple(rows: PeriodRow[]): PeriodRow[] {
  const baseline = rows[0]?.fmHours ?? 0;
  return applyMode270SimpleToRows(rows, baseline).map((r) => ({
    ...r,
    fm: calculateFm(r.weeks, r.brut, r.katsayi, r.fmHours),
  }));
}

function applyMode270Detailed(
  rows: PeriodRow[],
  iseGirisISO: string,
  istenCikisISO: string,
  weeklyFmHours: number,
  zamanasimiISO: string | null,
): PeriodRow[] {
  const withWeeks = applyMode270DetailedHireYear(
    rows,
    iseGirisISO,
    istenCikisISO,
    weeklyFmHours,
    zamanasimiISO,
  );
  return withWeeks.map((r) => ({ ...r, weeks: r.weeks }));
}

/* ── Tanık best FM + ardışık birleştirme (V3 sayfa sonrası) ── */

function witnessWeeklyFmHours(
  w: Witness,
  davaciInH: number,
  davaciOutH: number,
  weeklyDays: number,
): number {
  const tin = normalizeTimeStr(w.in);
  const tout = normalizeTimeStr(w.out);
  if (!tin || !tout) return 0;
  let tIn = parseTimeToHours(tin) ?? 0;
  let tOut = parseTimeToHours(tout) ?? 0;
  if (tOut === 0 && tIn > 0) tOut = 24;
  tIn = Math.max(tIn, davaciInH);
  tOut = Math.min(tOut, davaciOutH);
  const brut = Math.max(0, tOut - tIn);
  const brk = computeBreakHours(brut);
  const net = Math.max(0, brut - brk);
  const hg = Number(weeklyDays) || 6;
  return Math.max(0, ceilWeeklyWorkHoursToHalfHour(net * hg) - WEEKLY_WORK_LIMIT);
}

function applyWitnessBestFm(
  rows: PeriodRow[],
  witnesses: Witness[],
  davaciIn: string,
  davaciOut: string,
  weeklyDays: number,
  yargitay270: boolean,
  katsayi: number,
): PeriodRow[] {
  const dIn = parseTimeToHours(normalizeTimeStr(davaciIn) || "") ?? 0;
  let dOut = parseTimeToHours(normalizeTimeStr(davaciOut) || "") ?? 0;
  if (dOut === 0 && dIn > 0) dOut = 24;

  const tanikFM = witnesses
    .filter((t) => t.dateIn && t.dateOut && normalizeTimeStr(t.in) && normalizeTimeStr(t.out))
    .map((t) => ({
      startMs: isoToUtcMs(t.dateIn.slice(0, 10)),
      endMs: isoToUtcMs(t.dateOut.slice(0, 10)),
      fmHours: witnessWeeklyFmHours(t, dIn, dOut, weeklyDays),
    }));

  if (tanikFM.length === 0) return rows;

  return rows.map((row) => {
    if (row.isManual || row.isDeductionRow) return row;
    const rS = isoToUtcMs(row.startISO);
    const rE = isoToUtcMs(row.endISO);
    const active = tanikFM.filter((t) => t.startMs <= rS && t.endMs >= rE);
    if (active.length === 0) return row;
    const best = active.reduce((p, c) => (c.fmHours > p.fmHours ? c : p));
    const bestFmAdjusted = yargitay270
      ? Math.max(0, (best.fmHours || 0) - MODE270_SIMPLE_REDUCTION_HOURS)
      : best.fmHours || 0;
    const rowFm = Number(row.fmHours) || 0;
    if (Math.abs(bestFmAdjusted - rowFm) < 1e-6) return row;
    return {
      ...row,
      fmHours: bestFmAdjusted,
      fm: calculateFm(row.weeks, row.brut, katsayi, bestFmAdjusted),
    };
  });
}

function mergeConsecutiveSameFm(rows: PeriodRow[], katsayi: number): PeriodRow[] {
  const merged: PeriodRow[] = [];
  for (const row of rows) {
    if (row.isManual || row.isDeductionRow) {
      merged.push(row);
      continue;
    }
    const last = merged[merged.length - 1];
    if (
      last &&
      !last.isManual &&
      !last.isDeductionRow &&
      last.fmHours === row.fmHours &&
      last.brut === row.brut &&
      last.katsayi === row.katsayi
    ) {
      const mergedStart = (last.startISO || "").slice(0, 10);
      const mergedEnd = (row.endISO || "").slice(0, 10);
      let totalWeeks =
        mergedStart.length >= 10 && mergedEnd.length >= 10
          ? Math.max(1, calculateWeeksBetweenDates(mergedStart, mergedEnd) || 1)
          : (last.weeks || 0) + (row.weeks || 0);
      const spanDays = daysBetweenIsoInclusive(mergedStart, mergedEnd);
      if (Number.isFinite(spanDays) && spanDays > 0 && spanDays <= 370) {
        totalWeeks = Math.min(52, totalWeeks);
      }
      merged[merged.length - 1] = {
        ...last,
        endISO: row.endISO,
        weeks: totalWeeks,
        fm: calculateFm(totalWeeks, last.brut, katsayi, last.fmHours),
      };
    } else {
      merged.push({ ...row });
    }
  }
  return merged;
}

/* ── Overrides ── */

export function applyRowOverrides(
  rows: PeriodRow[],
  overrides: Record<string, RowOverride>,
  manualRows: PeriodRow[] = [],
  defaultKatsayi = 1,
): PeriodRow[] {
  const applyOne = (row: PeriodRow): PeriodRow | null => {
    const ov = overrides[row.id];
    if (ov?.hidden && !row.isManual) return null;
    if (!ov) {
      if (!row.isManual) return row;
      return {
        ...row,
        fm: calculateFm(row.weeks, row.brut, row.katsayi || defaultKatsayi, row.fmHours),
      };
    }
    let startISO = ov.startISO ?? row.startISO;
    let endISO = ov.endISO ?? row.endISO;
    let weeks = ov.weeks ?? row.weeks;
    if ((ov.startISO != null || ov.endISO != null) && isValidIsoDate(startISO) && isValidIsoDate(endISO)) {
      let w = Math.max(1, calculateWeeksBetweenDates(startISO, endISO) || 1);
      const spanDays = daysBetweenIsoInclusive(startISO, endISO);
      if (spanDays > 0 && spanDays <= 370) w = Math.min(52, w);
      weeks = w;
    }
    const brut = ov.brut ?? row.brut;
    const katsayi = ov.katsayi ?? row.katsayi;
    const fmHours = ov.fmHours ?? row.fmHours;
    return {
      ...row,
      startISO,
      endISO,
      weeks,
      brut,
      katsayi,
      fmHours,
      fm: calculateFm(weeks, brut, katsayi, fmHours),
    };
  };

  const base: PeriodRow[] = [];
  for (const r of rows) {
    const next = applyOne(r);
    if (next) base.push(next);
  }

  const manuals = (manualRows ?? [])
    .map((m) => applyOne(m))
    .filter((x): x is PeriodRow => !!x);

  if (manuals.length === 0) return base;

  const result: PeriodRow[] = [];
  const placed = new Set<string>();
  for (const r of base) {
    result.push(r);
    for (const m of manuals) {
      if (m.insertAfter === r.id && !placed.has(m.id)) {
        result.push(m);
        placed.add(m.id);
      }
    }
  }
  for (const m of manuals) {
    if (!placed.has(m.id)) result.push(m);
  }
  return result;
}

export function createManualPeriodRow(katsayi: number, insertAfter?: string): PeriodRow {
  return makeBlankManualRow(katsayi, insertAfter);
}

/* ── Totals ── */

export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Pick<
  GemiGunlukResult,
  | "toplamFm"
  | "sgk"
  | "issizlik"
  | "gelirVergisi"
  | "gelirVergisiDilimleri"
  | "damgaVergisi"
  | "netYillik"
  | "hakkaniyetIndirimi"
  | "mahsupTutari"
  | "sonNet"
> {
  const toplamFm = round2(rows.reduce((sum, r) => sum + (r.fm || 0), 0));
  const sgk = round2(toplamFm * SGK_ORANI);
  const issizlik = round2(toplamFm * ISSIZLIK_ORANI);
  const matrah = Math.max(0, toplamFm - sgk - issizlik);
  const gv = calculateIncomeTaxWithBrackets(exitYear, matrah);
  const gelirVergisi = round2(gv.tax);
  const damgaVergisi = round2(toplamFm * DAMGA_ORAN);
  const netYillik = round2(toplamFm - sgk - issizlik - gelirVergisi - damgaVergisi);
  const hakkaniyetIndirimi = round2(toplamFm / 3);
  const mahsupTutari = parseMoneyInput(mahsupInput);
  const sonNet = Math.max(0, round2(toplamFm - hakkaniyetIndirimi - mahsupTutari));
  return {
    toplamFm,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri: gv.summary,
    damgaVergisi,
    netYillik,
    hakkaniyetIndirimi,
    mahsupTutari,
    sonNet,
  };
}

function emptyResult(): GemiGunlukResult {
  return {
    dailyGrossHours: 0,
    breakHours: 0,
    dailyNetHours: 0,
    weeklyRawHours: 0,
    weeklyRoundedHours: 0,
    baselineWeeklyFmHours: 0,
    rows: [],
    toplamFm: 0,
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netYillik: 0,
    hakkaniyetIndirimi: 0,
    mahsupTutari: 0,
    sonNet: 0,
    warnings: [],
  };
}

/* ── Ana hesap ── */

export function computeGemiGunlukResult(form: GemiGunlukFormSnapshot): GemiGunlukResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError) warnings.push(dateError);

  const tin = normalizeTimeStr(form.davaciIn);
  const tout = normalizeTimeStr(form.davaciOut);
  if (!form.iseGiris || !form.istenCikis || dateError || !tin || !tout) {
    return emptyResult();
  }

  const davaciStartH = parseTimeToHours(tin)!;
  let davaciEndH = parseTimeToHours(tout)!;
  if (davaciEndH === 0 && davaciStartH > 0) davaciEndH = 24;

  const dailyGrossHours = rawDailyHoursBetween(davaciStartH, davaciEndH);
  const breakHours = computeBreakHours(dailyGrossHours);
  const dailyNetHours = Math.max(0, dailyGrossHours - breakHours);
  const weeklyRawHours = computeWeeklyHoursRaw(dailyNetHours, form.weeklyDays, form.sevenDayMode);
  const weeklyRoundedHours = ceilWeeklyWorkHoursToHalfHour(weeklyRawHours);
  const baselineWeeklyFmHours = Math.max(0, weeklyRawHours - WEEKLY_WORK_LIMIT);
  const baselineWeeklyFmHoursRounded = Math.max(0, weeklyRoundedHours - WEEKLY_WORK_LIMIT);

  const katsayi = parseKatsayi(form.katSayi);
  const yargitay270 = form.mode270 === "simple";

  let claimStart = form.iseGiris;
  const nihai = form.zamanasimi?.nihaiBaslangic || null;
  if (nihai && isValidIsoDate(nihai) && nihai > claimStart) claimStart = nihai;

  const dateSegments = buildDateSegments(claimStart, form.istenCikis, form.witnesses);
  let pipeRows: PeriodRow[] = [];

  for (const seg of dateSegments) {
    const hours = computeSegmentHours(seg.witnessIds, form.witnesses, davaciStartH, davaciEndH);
    const segWeekly = computeWeeklyHoursRaw(hours.net, form.weeklyDays, form.sevenDayMode);
    const segFmHours = Math.max(0, segWeekly - WEEKLY_WORK_LIMIT);

    const weeks = calculateWeekCount(seg.start, seg.end);
    if (weeks <= 0) continue;
    const brut = getAsgariUcretByDate(seg.start) || 0;
    pipeRows.push({
      id: newLocalId("row"),
      startISO: seg.start,
      endISO: seg.end,
      weeks,
      brut,
      katsayi,
      fmHours: segFmHours,
      fm: calculateFm(weeks, brut, katsayi, segFmHours),
      dailyNet: hours.net,
      annualLeaveHg: Number(form.weeklyDays) || 6,
      annualLeaveSevenDay: form.weeklyDays === 7 ? form.sevenDayMode : "tatilsiz",
      isDeductionRow: false,
    });
  }

  // Backend sırası: 270 → (client) tanık FM override → birleştir → düşüm expand
  if (form.mode270 === "simple") {
    pipeRows = applyMode270Simple(pipeRows);
  } else if (form.mode270 === "detailed") {
    pipeRows = applyMode270Detailed(
      pipeRows,
      form.iseGiris,
      form.istenCikis,
      baselineWeeklyFmHours,
      nihai,
    ).map((r) => ({
      ...r,
      fm: calculateFm(r.weeks, r.brut, r.katsayi, r.fmHours),
    }));
  }

  pipeRows = applyWitnessBestFm(
    pipeRows,
    form.witnesses,
    form.davaciIn,
    form.davaciOut,
    form.weeklyDays,
    yargitay270,
    katsayi,
  );
  pipeRows = mergeConsecutiveSameFm(pipeRows, katsayi);

  const weeklyOffNum =
    form.haftaTatiliGunu === "" || form.haftaTatiliGunu == null ? null : Number(form.haftaTatiliGunu);
  const weeklyOffDay = Number.isInteger(weeklyOffNum) ? weeklyOffNum : null;

  if (form.exclusions.length > 0 && dailyNetHours > 0) {
    const originalTotalWeeks = pipeRows.reduce((s, r) => s + (Number(r.weeks) || 0), 0);
    pipeRows = expandGemiGunlukRowsForDeductions(pipeRows, form.exclusions, {
      weeklyOffDay,
      fmParams: {
        dailyNet: dailyNetHours,
        hg: Number(form.weeklyDays) || 6,
        weeklyOffDay,
        davaciSevenDay: form.sevenDayMode,
        applyYargitay270FmDeduction: yargitay270,
      },
    });
    pipeRows = preserveWeeks(pipeRows, originalTotalWeeks).map((r) => ({
      ...r,
      fm: calculateFm(r.weeks, r.brut, r.katsayi, r.fmHours),
    }));
  }

  const rows = applyRowOverrides(pipeRows, form.rowOverrides ?? {}, form.manualRows ?? [], katsayi);

  const exitYear = form.istenCikis ? Number(form.istenCikis.slice(0, 4)) : new Date().getFullYear();
  const totals = computeTotalsFromRows(rows, exitYear, form.mahsup);

  return {
    dailyGrossHours,
    breakHours,
    dailyNetHours,
    weeklyRawHours,
    weeklyRoundedHours,
    baselineWeeklyFmHours: baselineWeeklyFmHoursRounded,
    rows,
    ...totals,
    warnings,
  };
}

/** Test alias — eski include270 API. */
export function fmHoursForDeductionWindow(
  dailyHours: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
  excludedUnits: number,
): number {
  return gemiFmHoursForDeductionWeek(
    {
      dailyNet: dailyHours,
      hg: weeklyDays,
      weeklyOffDay: null,
      davaciSevenDay: sevenDayMode,
    },
    excludedUnits,
  );
}
