/**
 * Gemi Adamı 7/24 — UBGT / yıllık izin düşüm satırı köprüsü (V3 expandGemi724RowsForDeductions).
 */

import { getAsgariUcretByDate } from "./asgariUcret";
import type { ExclusionItem, PeriodRow } from "./model";
import { newLocalId } from "./model";
import {
  buildSevenDayDeductionWindows,
  filterExclusionsForWeeklyOff,
  normalizeFmDeductionDaysFiltered,
  parseFmDate,
} from "../shared/deductionCore";

const LEGACY_ONLY_EXCLUSION_TYPES = new Set([
  "Rapor",
  "Diğer",
  "Puantaj/Bordro",
  "Puantaj-Bordro",
]);

const MOTOR_TYPES = new Set(["UBGT", "Yıllık İzin"]);
const LEGACY_FM_TYPES = new Set([
  "Yıllık İzin",
  "UBGT",
  "Rapor",
  "Diğer",
  "Puantaj/Bordro",
  "Puantaj-Bordro",
]);

const DENOM = 240;
const FACTOR = 1.25;
const DAILY_NET_HOURS = 13;
const WEEKLY_LIMIT = 48;
const LEAVE_HOURS = 8;
const DAMGA_ORANI = 0.00759;
const GELIR_VERGISI_ORANI = 0.15;
const YARGITAY_270_DEDUCTION_HOURS = 5 + 12 / 60;
const EPS = 1e-7;

type NormalizedDay = { dateISO: string; dayWeight: number; kind: "UBGT" | "YILLIK_IZIN" };

type DeductionWindow = {
  startISO: string;
  endISO: string;
  deductions: NormalizedDay[];
  totalDeductionDayUnits: number;
  caption: string;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return startOfLocalDay(next);
}

function gemi724FmNet(weeks: number, brut: number, kats: number, fmHours: number): { fm: number; net: number } {
  const step1 = Number((weeks * brut).toFixed(6));
  const step2 = Number((step1 * kats).toFixed(6));
  const step3 = Number((step2 * fmHours).toFixed(6));
  const step4 = Number((step3 / DENOM).toFixed(6));
  const step5 = Number((step4 * FACTOR).toFixed(6));
  const fm = Number(step5.toFixed(2));
  const net = Number((fm * (1 - DAMGA_ORANI - GELIR_VERGISI_ORANI)).toFixed(2));
  return { fm, net };
}

export function exclusionsNeedLegacySplit(exclusions: ExclusionItem[]): boolean {
  if (!exclusions?.length) return false;
  return exclusions.some((ex) => LEGACY_ONLY_EXCLUSION_TYPES.has(String(ex.type || "").trim()));
}

function parseLocalDay(iso: string): Date | null {
  return parseFmDate(iso);
}

export { filterExclusionsForWeeklyOff } from "../shared/deductionCore";

export function normalizeDeductionDays(
  exclusions: ExclusionItem[],
  weeklyOffDay: number | null,
): NormalizedDay[] {
  return normalizeFmDeductionDaysFiltered(filterExclusionsForWeeklyOff(exclusions, weeklyOffDay));
}

export function buildSevenDayWindows(
  normalizedDays: NormalizedDay[],
  periodEnd: Date,
): DeductionWindow[] {
  return buildSevenDayDeductionWindows(
    normalizedDays.map((d) => ({
      dateISO: d.dateISO,
      kind: d.kind,
      originalType: d.kind,
      dayWeight: d.dayWeight,
      sourceIds: [],
    })),
    periodEnd,
  );
}

/** Düşüm penceresi haftalık FM: weeklyNet=(7-excl)*13; fm=max(0, weeklyNet-48-8). */
export function gemi724FmHoursForDeduction(excludedUnits: number): number {
  const excl = Math.max(0, Math.min(7, Number(excludedUnits) || 0));
  const weeklyNet = (7 - excl) * DAILY_NET_HOURS;
  return Math.max(0, weeklyNet - WEEKLY_LIMIT - LEAVE_HOURS);
}

export function fmHoursForDeductionWindow(excludedUnits: number): number {
  return gemi724FmHoursForDeduction(excludedUnits);
}

function enrichRowsWithoutDeductions(rows: PeriodRow[]): PeriodRow[] {
  return rows.map((row) => ({ ...row }));
}

function applyYargitay270ToFmHours(fmHours: number, apply: boolean): number {
  if (!apply) return fmHours;
  return Math.max(0, fmHours - YARGITAY_270_DEDUCTION_HOURS);
}

function expandWithMotor(
  rows: PeriodRow[],
  exclusions: ExclusionItem[],
  weeklyOffDay: number | null,
  applyYargitay270FmDeduction: boolean,
): PeriodRow[] {
  const out: PeriodRow[] = [];
  const allNormalized = normalizeFmDeductionDaysFiltered(exclusions);

  rows.forEach((row, rowIdx) => {
    if (row.isManual) {
      out.push(row);
      return;
    }
    const startISO = row.startISO;
    const endISO = row.endISO;
    const w0 = row.weeks ?? 0;
    if (!startISO || !endISO || w0 <= 0) {
      out.push(row);
      return;
    }

    const periodStart = parseLocalDay(startISO);
    const periodEnd = parseLocalDay(endISO);
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      out.push(...enrichRowsWithoutDeductions([row]));
      return;
    }

    const daysInPeriod = allNormalized.filter((d) => {
      const dd = parseLocalDay(d.dateISO);
      return dd && dd >= periodStart && dd <= periodEnd;
    });

    if (daysInPeriod.length === 0) {
      out.push(...enrichRowsWithoutDeductions([row]));
      return;
    }

    const windows = buildSevenDayWindows(daysInPeriod, periodEnd);
    if (windows.length === 0) {
      out.push(...enrichRowsWithoutDeductions([row]));
      return;
    }

    const originalWeeks = Math.max(0, Math.floor(Number(row.weeks) || 0));
    const baseWeeks = Math.max(0, originalWeeks - windows.length);
    const baseFmHours = applyYargitay270ToFmHours(row.fmHours ?? 0, applyYargitay270FmDeduction);

    if (baseWeeks > 0) {
      const { fm, net } = gemi724FmNet(baseWeeks, row.brut, row.katsayi, baseFmHours);
      out.push({
        ...row,
        id: `gemi724-base-${rowIdx}-${startISO}-${endISO}`,
        startISO,
        endISO,
        weeks: baseWeeks,
        fmHours: baseFmHours,
        fm,
        net,
        yillikIzinAciklama: undefined,
        note: undefined,
        isDeductionRow: false,
      });
    }

    windows.forEach((win, winIdx) => {
      const excludedDays = win.totalDeductionDayUnits;
      const brut = getAsgariUcretByDate(win.startISO) ?? row.brut;
      let fmHours =
        excludedDays > EPS ? gemi724FmHoursForDeduction(excludedDays) : row.fmHours ?? 0;
      fmHours = applyYargitay270ToFmHours(fmHours, applyYargitay270FmDeduction);
      if (fmHours <= EPS) return;
      const { fm, net } = gemi724FmNet(1, brut, row.katsayi, fmHours);
      out.push({
        ...row,
        id: `gemi724-ded-${rowIdx}-${winIdx}-${win.startISO}-${win.endISO}`,
        startISO: win.startISO,
        endISO: win.endISO,
        weeks: 1,
        brut,
        fmHours,
        fm,
        net,
        yillikIzinAciklama: win.caption || undefined,
        note: undefined,
        isDeductionRow: true,
      });
    });
  });

  return out.length > 0 ? out : rows;
}

function expandLegacy(
  rows: PeriodRow[],
  exclusions: ExclusionItem[],
  weeklyOffDay: number | null,
  applyYargitay270FmDeduction: boolean,
): PeriodRow[] {
  const anchors: Date[] = [];
  for (const ex of exclusions) {
    if (!LEGACY_FM_TYPES.has(String(ex.type || "").trim())) continue;
    const s = parseLocalDay(ex.start);
    const e = parseLocalDay(ex.end || ex.start);
    if (!s || !e || s > e) continue;
    const cap = Number(ex.days) > 0 && Number.isFinite(Number(ex.days)) ? Math.floor(Number(ex.days)) : null;
    let used = 0;
    let cur = new Date(s);
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      if (isWorkDay(cur, weeklyOffDay)) {
        anchors.push(startOfLocalDay(cur));
        if (cap != null) used += 1;
      }
      cur = addDays(cur, 1);
    }
  }
  anchors.sort((a, b) => a.getTime() - b.getTime());
  const seen = new Set<string>();
  const uniq: Date[] = [];
  for (const d of anchors) {
    const k = toISODate(d);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(d);
  }

  type Block = { start: Date; end: Date; anchors: Date[] };
  const blocks: Block[] = [];
  {
    let i = 0;
    while (i < uniq.length) {
      const start = startOfLocalDay(uniq[i]);
      const end = addDays(start, 6);
      const group: Date[] = [];
      while (i < uniq.length && uniq[i].getTime() <= end.getTime()) {
        group.push(startOfLocalDay(uniq[i]));
        i += 1;
      }
      blocks.push({ start, end, anchors: group });
    }
  }

  if (blocks.length === 0) return enrichRowsWithoutDeductions(rows);

  const out: PeriodRow[] = [];
  for (const row of rows) {
    if (row.isManual) {
      out.push(row);
      continue;
    }
    const rowStart = parseLocalDay(row.startISO || "");
    const rowEnd = parseLocalDay(row.endISO || "");
    if (!rowStart || !rowEnd || rowEnd < rowStart) {
      out.push(row);
      continue;
    }

    const overlapping = blocks
      .filter((b) => !(b.end < rowStart || b.start > rowEnd))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (overlapping.length === 0) {
      out.push(row);
      continue;
    }

    const originalWeeks = Math.max(0, Math.floor(Number(row.weeks) || 0));
    const baseWeeks = Math.max(0, originalWeeks - overlapping.length);
    const baseFmHours = applyYargitay270ToFmHours(row.fmHours ?? 0, applyYargitay270FmDeduction);

    if (baseWeeks > 0) {
      const { fm, net } = gemi724FmNet(baseWeeks, row.brut, row.katsayi, baseFmHours);
      out.push({
        ...row,
        id: newLocalId("legacy-base"),
        weeks: baseWeeks,
        fmHours: baseFmHours,
        fm,
        net,
        yillikIzinAciklama: undefined,
        isDeductionRow: false,
      });
    }

    for (const blk of overlapping) {
      const b0 = rowStart > blk.start ? rowStart : blk.start;
      const b1 = rowEnd < blk.end ? rowEnd : blk.end;
      if (b0 > b1) continue;
      const excl = blk.anchors.filter((d) => d >= b0 && d <= b1).length;
      let fmHours = excl > 0 ? gemi724FmHoursForDeduction(excl) : row.fmHours ?? 0;
      fmHours = applyYargitay270ToFmHours(fmHours, applyYargitay270FmDeduction);
      if (fmHours <= EPS) continue;
      const startISO = toISODate(b0);
      const endISO = toISODate(b1);
      const brut = getAsgariUcretByDate(startISO) ?? row.brut;
      const { fm, net } = gemi724FmNet(1, brut, row.katsayi, fmHours);
      const caption = excl > 0 ? `(${excl} gün dışlama düşülmüştür)` : undefined;
      out.push({
        ...row,
        id: newLocalId("legacy-ded"),
        startISO,
        endISO,
        weeks: 1,
        brut,
        fmHours,
        fm,
        net,
        yillikIzinAciklama: caption,
        isDeductionRow: true,
      });
    }
  }

  return out.length > 0 ? out : rows;
}

export function expandRowsForDeductions(params: {
  rows: PeriodRow[];
  exclusions: ExclusionItem[];
  weeklyOffDay: number | null;
  applyYargitay270FmDeduction?: boolean;
}): PeriodRow[] {
  const { rows, exclusions, weeklyOffDay, applyYargitay270FmDeduction = false } = params;
  if (!rows.length) return rows;
  if (!exclusions?.length) return enrichRowsWithoutDeductions(rows);

  const filtered = filterExclusionsForWeeklyOff(exclusions, weeklyOffDay);

  if (exclusionsNeedLegacySplit(exclusions)) {
    return expandLegacy(rows, filtered, weeklyOffDay, applyYargitay270FmDeduction);
  }

  return expandWithMotor(rows, filtered, weeklyOffDay, applyYargitay270FmDeduction);
}
