import { calculateYillikIzinGemi, formatTotalWorkDays } from "../lib/gemiCore";
import { calculateUsedTotal, resolveExitYear } from "../lib/core";
import { getAsgariUcretByDate } from "../lib/asgariUcret";
import { formatMoney, parseNum } from "../lib/money";
import type { YillikGemiForm } from "./model";

export function computeYillikGemiResult(form: YillikGemiForm) {
  const usedDays = calculateUsedTotal(form.usedRows);
  const core = calculateYillikIzinGemi({
    workPeriods: form.workPeriods,
    brutUcret: form.brut,
    usedDays,
    year: resolveExitYear(form.endDate || form.workPeriods[0]?.istenCikis || ""),
  });

  const brutVal = parseNum(form.brut);
  let asgariUcretHatasi: string | null = null;
  const refDate = form.endDate || form.workPeriods.find((p) => p.istenCikis)?.istenCikis || "";
  if (brutVal > 0 && refDate) {
    const min = getAsgariUcretByDate(refDate);
    if (min && brutVal < min) {
      asgariUcretHatasi = `Girilen ücret, ${new Date(refDate).getFullYear()} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(min)} ₺).`;
    }
  }

  return {
    ...core,
    usedDays,
    workDaysLabel: formatTotalWorkDays(core.totalWorkDays),
    entitlementLines: core.totalVacationDays >= 30
      ? [{ label: "Tam yıl kuralı", value: `${Math.floor(core.totalWorkDays / 360)} yıl × 30 gün = ${core.totalVacationDays} gün` }]
      : core.totalVacationDays === 15
        ? [{ label: "180+ gün (takvim yılı)", value: "15 gün" }]
        : [{ label: "İzin hakkı", value: "0 gün" }],
    formulaText: core.remainingDays > 0 && brutVal > 0 ? `(${formatMoney(brutVal)} / 30 × ${core.remainingDays} gün)` : "—",
    asgariUcretHatasi,
    totalEntitlement: core.totalVacationDays,
  };
}

export { clampYear, formatDateTR, isDateOrderInvalid } from "../lib/dates";
