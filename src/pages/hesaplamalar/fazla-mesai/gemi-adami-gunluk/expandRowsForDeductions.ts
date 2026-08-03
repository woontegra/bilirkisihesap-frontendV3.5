/**
 * Gemi Adamı Günlük — UBGT / yıllık izin düşüm satırı motoru.
 * Düşüm günleri 7 günlük pencerelere yerleştirilir; her pencere 1 hafta düşüme karşılık gelir.
 * FM: 48 saat sınırı; tutar: 240 / 1,25. (V3 expandGemiGunlukRowsForDeductions mantığı)
 */

import { getAsgariUcretByDate } from "./asgariUcret";
import {
  FAZLA_MESAI_DENOMINATOR,
  FAZLA_MESAI_KATSAYI,
  GEMI_DAILY_REF_HOURS,
  MODE270_SIMPLE_REDUCTION_HOURS,
  WEEKLY_WORK_LIMIT,
} from "./constants";
import type { ExclusionItem, PeriodRow, SevenDayMode } from "./model";
import { newLocalId } from "./model";
import { normalizeFmDeductionDays } from "../shared/deductionCore";

const LEGACY_ONLY_EXCLUSION_TYPES = new Set(["Rapor", "Diğer", "Puantaj/Bordro"]);
const EPS = 1e-7;

export type GemiExpandFmParams = {
  dailyNet: number;
  hg: number;
  weeklyOffDay: number | null;
  davaciSevenDay: SevenDayMode;
  applyYargitay270FmDeduction?: boolean;
};

type NormalizedDeductionOnDate = {
  dateISO: string;
  kind: "UBGT" | "YILLIK_IZIN" | "OTHER";
  dayWeight: number;
};

export function bilirkisiRoundWeeklyTotalHours(value: number): number {
  const E = 1e-9;
  if (!Number.isFinite(value) || value <= 0) return 0;
  const int = Math.floor(value + E);
  const frac = value - int;
  if (frac < 0.5 - E) return int;
  if (frac > 0.5 + E) return int + 1;
  return int + 0.5;
}

export function calculateFm(weeks: number, brut: number, kats: number, fmHours: number): number {
  const step1 = Number((weeks * brut).toFixed(6));
  const step2 = Number((step1 * kats).toFixed(6));
  const step3 = Number((step2 * fmHours).toFixed(6));
  const step4 = Number((step3 / FAZLA_MESAI_DENOMINATOR).toFixed(6));
  const step5 = Number((step4 * FAZLA_MESAI_KATSAYI).toFixed(6));
  return Number(step5.toFixed(2));
}

export function exclusionsNeedLegacySplit(exclusions: ExclusionItem[]): boolean {
  if (!exclusions?.length) return false;
  return exclusions.some((ex) => LEGACY_ONLY_EXCLUSION_TYPES.has(String(ex.type || "").trim()));
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function parseFmDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim().slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWorkDay(d: Date, weeklyOffDay: number | null): boolean {
  if (weeklyOffDay == null) return true;
  return d.getDay() !== weeklyOffDay;
}

function formatDayUnits(n: number): string {
  if (Math.abs(n - 0.5) < 1e-6) return "0,5";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(n).replace(".", ",");
}

function formatWindowCaption(deductions: NormalizedDeductionOnDate[]): string {
  if (deductions.length === 0) return "";
  const ubgtUnits = deductions.filter((d) => d.kind === "UBGT").reduce((s, d) => s + d.dayWeight, 0);
  const izinUnits = deductions.filter((d) => d.kind === "YILLIK_IZIN").reduce((s, d) => s + d.dayWeight, 0);
  const parts: string[] = [];
  if (ubgtUnits > 0) parts.push(`${formatDayUnits(ubgtUnits)} gün UBGT`);
  if (izinUnits > 0) parts.push(`${formatDayUnits(izinUnits)} gün yıllık izin`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return `(${parts[0]} düşülmüştür)`;
  return `(${parts.join(" + ")} düşülmüştür)`;
}

/** Normalize UBGT / Yıllık İzin günleri (V3 deductionCore). */
export function normalizeDeductionDays(
  exclusions: ExclusionItem[],
  weeklyOffDay: number | null,
): NormalizedDeductionOnDate[] {
  return normalizeFmDeductionDays(exclusions, weeklyOffDay);
}

type DeductionWindow = {
  startISO: string;
  endISO: string;
  deductions: NormalizedDeductionOnDate[];
  totalDeductionDayUnits: number;
  caption: string;
};

function buildSevenDayWindows(normalizedDays: NormalizedDeductionOnDate[], periodEnd: Date): DeductionWindow[] {
  if (normalizedDays.length === 0) return [];
  const sorted = [...normalizedDays].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const windows: DeductionWindow[] = [];
  let i = 0;
  while (i < sorted.length) {
    const firstDay = parseFmDate(sorted[i].dateISO);
    if (!firstDay) {
      i++;
      continue;
    }
    const windowEnd = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + 6);
    const group: NormalizedDeductionOnDate[] = [];
    while (i < sorted.length) {
      const d = parseFmDate(sorted[i].dateISO);
      if (!d || d > windowEnd) break;
      group.push(sorted[i]);
      i++;
    }
    const clippedEnd = windowEnd > periodEnd ? periodEnd : windowEnd;
    windows.push({
      startISO: toISODate(firstDay),
      endISO: toISODate(clippedEnd),
      deductions: group,
      totalDeductionDayUnits: group.reduce((s, d) => s + d.dayWeight, 0),
      caption: formatWindowCaption(group),
    });
  }
  return windows;
}

function remainingNetWeeklyForGemiDeduction(
  dailyNet: number,
  weeklyWorkingDays: number,
  excludedUnits: number,
  davaciSevenDay: SevenDayMode,
): number {
  const hgSafe = Math.max(1, Math.min(7, Math.floor(weeklyWorkingDays) || 6));
  const excl = Math.max(0, Math.min(hgSafe, Number(excludedUnits) || 0));
  if (hgSafe !== 7) {
    return Math.max(0, (hgSafe - excl) * dailyNet);
  }
  if (davaciSevenDay === "tatilsiz") {
    return Math.max(0, (7 - excl) * dailyNet);
  }
  const holidayExtra = Math.max(0, dailyNet - GEMI_DAILY_REF_HOURS);
  return Math.max(0, 6 * dailyNet + holidayExtra - excl * dailyNet);
}

export function gemiFmHoursForDeductionWeek(fmParams: GemiExpandFmParams, excludedUnits: number): number {
  const remainingNetWeekly = remainingNetWeeklyForGemiDeduction(
    fmParams.dailyNet,
    fmParams.hg,
    excludedUnits,
    fmParams.davaciSevenDay,
  );
  const totalRounded = bilirkisiRoundWeeklyTotalHours(remainingNetWeekly);
  let fmWeek = Math.max(0, totalRounded - WEEKLY_WORK_LIMIT);
  if (fmParams.applyYargitay270FmDeduction) {
    fmWeek = Math.max(0, fmWeek - MODE270_SIMPLE_REDUCTION_HOURS);
  }
  return fmWeek;
}

function expandWithMotor(
  rows: PeriodRow[],
  exclusions: ExclusionItem[],
  weeklyOffDay: number | null,
  fmParams: GemiExpandFmParams | undefined,
): PeriodRow[] {
  const out: PeriodRow[] = [];
  const allNormalized = normalizeDeductionDays(exclusions, weeklyOffDay);

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

    const periodStart = parseFmDate(startISO);
    const periodEnd = parseFmDate(endISO);
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      out.push(row);
      return;
    }

    const daysInPeriod = allNormalized.filter((d) => {
      const dd = parseFmDate(d.dateISO);
      return dd && dd >= periodStart && dd <= periodEnd;
    });

    if (daysInPeriod.length === 0) {
      out.push(row);
      return;
    }

    const windows = buildSevenDayWindows(daysInPeriod, periodEnd);
    if (windows.length === 0) {
      out.push(row);
      return;
    }

    const originalWeeks = Math.max(0, Math.floor(Number(row.weeks) || 0));
    const deductionWeekCount = windows.length;
    const baseWeeks = Math.max(0, originalWeeks - deductionWeekCount);

    if (baseWeeks > 0) {
      const brut = row.brut ?? (getAsgariUcretByDate(startISO) || 0);
      const kats = row.katsayi ?? 1;
      const fmHours = row.fmHours ?? 0;
      out.push({
        ...row,
        id: `gemi-base-${rowIdx}-${startISO}-${endISO}`,
        startISO,
        endISO,
        weeks: baseWeeks,
        brut,
        fmHours,
        fm: calculateFm(baseWeeks, brut, kats, fmHours),
        yillikIzinAciklama: undefined,
        note: undefined,
        isDeductionRow: false,
      });
    }

    windows.forEach((win, winIdx) => {
      const excludedDays = win.totalDeductionDayUnits;
      const brut = getAsgariUcretByDate(win.startISO) ?? row.brut;
      const kats = row.katsayi ?? 1;
      let fmHours = row.fmHours ?? 0;
      if (fmParams && excludedDays > EPS) {
        fmHours = gemiFmHoursForDeductionWeek(fmParams, excludedDays);
      }
      if (fmParams && fmHours <= EPS) return;
      out.push({
        ...row,
        id: `gemi-ded-${rowIdx}-${winIdx}-${win.startISO}-${win.endISO}`,
        startISO: win.startISO,
        endISO: win.endISO,
        weeks: 1,
        brut,
        katsayi: kats,
        fmHours,
        fm: calculateFm(1, brut, kats, fmHours),
        isDeductionRow: true,
        yillikIzinAciklama: win.caption || undefined,
        note: win.caption || undefined,
      });
    });
  });

  return out.length > 0 ? out : rows;
}

/** Legacy: Rapor/Diğer/Puantaj — 7 günlük blok, anchor gün sayısına göre FM. */
function expandLegacy(
  rows: PeriodRow[],
  exclusions: ExclusionItem[],
  fmParams: GemiExpandFmParams,
): PeriodRow[] {
  const FM_TYPES = new Set(["Yıllık İzin", "UBGT", "Rapor", "Diğer", "Puantaj/Bordro"]);
  const out: PeriodRow[] = [];

  const materializeAnchors = (weeklyOffDay: number | null): Date[] => {
    const anchors: Date[] = [];
    for (const ex of exclusions) {
      if (!FM_TYPES.has(ex.type)) continue;
      const s = parseFmDate(ex.start);
      const e = parseFmDate(ex.end);
      if (!s || !e || s > e) continue;
      const cap = Number(ex.days) > 0 && Number.isFinite(Number(ex.days)) ? Math.floor(Number(ex.days)) : null;
      let used = 0;
      let cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      const end = new Date(e.getFullYear(), e.getMonth(), e.getDate());
      while (cur <= end) {
        if (cap != null && used >= cap) break;
        if (isWorkDay(cur, weeklyOffDay)) {
          anchors.push(new Date(cur));
          if (cap != null) used += 1;
        }
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      }
    }
    anchors.sort((a, b) => a.getTime() - b.getTime());
    const uniq: Date[] = [];
    const seen = new Set<string>();
    for (const d of anchors) {
      const key = toISODate(d);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(d);
    }
    return uniq;
  };

  rows.forEach((row, rowIdx) => {
    if (row.isManual) {
      out.push(row);
      return;
    }
    const startISO = row.startISO;
    const endISO = row.endISO;
    const W0 = row.weeks ?? 0;
    if (!startISO || !endISO || W0 <= 0) {
      out.push(row);
      return;
    }
    const segStart = parseFmDate(startISO);
    const segEnd = parseFmDate(endISO);
    if (!segStart || !segEnd || segEnd < segStart) {
      out.push(row);
      return;
    }

    const anchors = materializeAnchors(fmParams.weeklyOffDay).filter((d) => d >= segStart && d <= segEnd);
    if (anchors.length === 0) {
      out.push(row);
      return;
    }

    type Hit = { clipStart: Date; clipEnd: Date; leaveDaysInt: number };
    const leaveHits: Hit[] = [];
    let i = 0;
    while (i < anchors.length) {
      const start = anchors[i];
      const nominalEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      const end = nominalEnd > segEnd ? segEnd : nominalEnd;
      const group: Date[] = [];
      while (i < anchors.length && anchors[i].getTime() <= end.getTime()) {
        group.push(anchors[i]);
        i += 1;
      }
      const leaveDaysInt = Math.min(fmParams.hg, group.length);
      if (leaveDaysInt >= 1) leaveHits.push({ clipStart: start, clipEnd: end, leaveDaysInt });
    }

    if (leaveHits.length === 0) {
      out.push(row);
      return;
    }

    let H = 0;
    const leavePositiveRows: PeriodRow[] = [];
    const kats = row.katsayi ?? 1;
    const baselineFm = row.fmHours ?? 0;
    const brutPeriod = row.brut ?? (getAsgariUcretByDate(startISO) || 0);
    const dailyNet = fmParams.dailyNet;

    leaveHits.forEach((hit, j) => {
      const remaining = remainingNetWeeklyForGemiDeduction(
        dailyNet,
        fmParams.hg,
        hit.leaveDaysInt,
        fmParams.davaciSevenDay,
      );
      const totalRounded = bilirkisiRoundWeeklyTotalHours(remaining);
      let fmWeek = Math.max(0, totalRounded - WEEKLY_WORK_LIMIT);
      if (fmParams.applyYargitay270FmDeduction) {
        fmWeek = Math.max(0, fmWeek - MODE270_SIMPLE_REDUCTION_HOURS);
      }
      if (fmWeek <= EPS) {
        H += 1;
        return;
      }
      const brutW = getAsgariUcretByDate(toISODate(hit.clipStart)) || 0;
      const caption = `(${hit.leaveDaysInt} gün dışlama düşülmüştür)`;
      leavePositiveRows.push({
        id: `gemi-yl-${rowIdx}-${j}-${toISODate(hit.clipStart)}`,
        startISO: toISODate(hit.clipStart),
        endISO: toISODate(hit.clipEnd),
        weeks: 1,
        brut: brutW,
        katsayi: kats,
        fmHours: fmWeek,
        fm: calculateFm(1, brutW, kats, fmWeek),
        isDeductionRow: true,
        yillikIzinAciklama: caption,
        note: caption,
      });
    });

    const lp = leavePositiveRows.length;
    const normalWeeks = Math.max(0, W0 - H - lp);
    if (normalWeeks > 0) {
      out.push({
        ...row,
        id: `gemi-yl-base-${rowIdx}-${startISO}-${endISO}`,
        weeks: normalWeeks,
        brut: brutPeriod,
        katsayi: kats,
        fmHours: baselineFm,
        fm: calculateFm(normalWeeks, brutPeriod, kats, baselineFm),
        isDeductionRow: false,
      });
    }
    out.push(...leavePositiveRows);
  });

  return out.length > 0 ? out : rows;
}

export function expandGemiGunlukRowsForDeductions(
  rows: PeriodRow[],
  exclusions: ExclusionItem[] | null | undefined,
  options: { weeklyOffDay: number | null; fmParams?: GemiExpandFmParams },
): PeriodRow[] {
  const { weeklyOffDay, fmParams } = options;
  if (!rows.length) return rows;
  if (!exclusions?.length) return rows;

  if (exclusionsNeedLegacySplit(exclusions)) {
    if (!fmParams) return expandWithMotor(rows, exclusions, weeklyOffDay, undefined);
    return expandLegacy(rows, exclusions, fmParams);
  }

  return expandWithMotor(rows, exclusions, weeklyOffDay, fmParams);
}

/** Test / UI: 7 günlük pencere üretimi. */
export function buildSevenDayWindowsForTest(
  days: Array<{ dateISO: string; type: "UBGT" | "YILLIK_IZIN" }>,
  periodEnd: string,
): Array<{ start: string; end: string; excludedUnits: number }> {
  const normalized: NormalizedDeductionOnDate[] = days.map((d) => ({
    dateISO: d.dateISO,
    kind: d.type === "UBGT" ? "UBGT" : "YILLIK_IZIN",
    dayWeight: 1,
  }));
  const end = parseFmDate(periodEnd) ?? new Date();
  return buildSevenDayWindows(normalized, end).map((w) => ({
    start: w.startISO,
    end: w.endISO,
    excludedUnits: w.totalDeductionDayUnits,
  }));
}

export function makeBlankManualRow(katsayi: number, insertAfter?: string): PeriodRow {
  return {
    id: newLocalId("manual"),
    startISO: "",
    endISO: "",
    weeks: 0,
    brut: 0,
    katsayi,
    fmHours: 0,
    fm: 0,
    isManual: true,
    insertAfter,
  };
}

export { addDaysIso };
