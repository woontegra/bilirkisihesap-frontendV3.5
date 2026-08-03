import { calculateGunlukGazeteIzin } from "../lib/basinGunlukGazete";
import { calculateYillikIzin, resolveExitYear } from "../lib/core";
import { getAsgariUcretByDate } from "../lib/asgariUcret";
import { formatMoney, parseNum } from "../lib/money";
import type { StandardComputeResult } from "../lib/types";
import type { YillikBasinForm } from "./model";

export function computeYillikBasinResult(form: YillikBasinForm): StandardComputeResult & {
  basinDetail: ReturnType<typeof calculateGunlukGazeteIzin>;
} {
  const izin = calculateGunlukGazeteIzin(form.meslegeBaslangic, form.startDate, form.endDate);
  const core = calculateYillikIzin({
    years: 0,
    totalEntitlement: izin.izinGun,
    brutUcret: form.brut,
    usedRows: form.usedRows,
    exitYear: resolveExitYear(form.endDate),
  });

  const brutVal = parseNum(form.brut);
  let asgariUcretHatasi: string | null = null;
  if (brutVal > 0 && form.endDate) {
    const min = getAsgariUcretByDate(form.endDate);
    if (min && brutVal < min) {
      asgariUcretHatasi = `Girilen ücret, ${new Date(form.endDate).getFullYear()} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(min)} ₺).`;
    }
  }

  const entitlementLines = izin.izinGun > 0
    ? [
        { label: "İlk 10 yıl (4 hafta/yıl)", value: `${izin.y1} yıl × 4 hafta = ${izin.h1} hafta` },
        { label: "10+ yıl (6 hafta/yıl)", value: `${izin.y2} yıl × 6 hafta = ${izin.h2} hafta` },
        { label: "Toplam hafta", value: `${izin.toplamHafta} hafta (${izin.izinGun} gün)` },
      ]
    : [{ label: "İzin hakkı", value: izin.aciklama || "0 gün" }];

  return {
    workPeriodLabel: izin.aciklama || `${izin.izinGun} gün`,
    entitlementLines,
    totalEntitlement: core.totalEntitlement,
    usedTotal: core.usedTotal,
    remainingDays: core.remainingDays,
    formulaText: core.remainingDays > 0 && brutVal > 0 ? `(${formatMoney(brutVal)} / 30 × ${core.remainingDays} gün)` : "—",
    brutIzin: core.brutIzin,
    sgk: core.sgk,
    issizlik: core.issizlik,
    gelirVergisi: core.gelirVergisi,
    gelirVergisiDilimleri: core.gelirVergisiDilimleri,
    damgaVergisi: core.damgaVergisi,
    netIzin: core.netIzin,
    asgariUcretHatasi,
    basinDetail: izin,
  };
}

export { clampYear, formatDateTR, isDateOrderInvalid } from "../lib/dates";
