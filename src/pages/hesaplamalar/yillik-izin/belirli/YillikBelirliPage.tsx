import { FileCheck } from "lucide-react";
import { YillikPageView } from "../lib/YillikPageView";
import { WorkPeriodsEditor } from "../lib/WorkPeriodsEditor";
import { useStandardYillikPage } from "../lib/useStandardYillikPage";
import { withSyncedSpan, type SimpleWorkPeriod } from "../lib/multiPeriodModel";
import { clampYear, computeYillikBelirliResult } from "./engine";
import { createEmptyForm, snapshotKey } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";

const PAGE_TITLE = "Yıllık Ücretli İzin — Belirli Süreli";
const PREVIEW_TITLE = "Yıllık İzin — Belirli Süreli Raporu";

export default function YillikBelirliPage() {
  const page = useStandardYillikPage({
    createEmptyForm,
    snapshotKey,
    compute: computeYillikBelirliResult,
    storage: { loadCasesSafe, saveCase, deleteCase, clearCorruptCases },
    previewTitle: PREVIEW_TITLE,
    pageTitle: PAGE_TITLE,
  });

  const setPeriods = (periods: SimpleWorkPeriod[]) => {
    page.setForm(withSyncedSpan({ ...page.form, workPeriods: periods }));
    const spanStart = periods[0]?.iseGiris || "";
    const spanEnd = periods[periods.length - 1]?.istenCikis || "";
    page.validateDates(spanStart, spanEnd);
  };

  return (
    <YillikPageView
      icon={FileCheck}
      pageTitle={PAGE_TITLE}
      pageDescription="Belirli süreli sözleşmede yıllık izin alacağı."
      previewTitle={PREVIEW_TITLE}
      notes={NOTE_BLOCKS}
      startDate={page.form.startDate}
      endDate={page.form.endDate}
      workPeriodLabel={page.result.workPeriodLabel}
      onStartDateChange={() => {}}
      onEndDateChange={() => {}}
      onDateBlur={() => page.validateDates(page.form.startDate, page.form.endDate)}
      dateError={page.dateError}
      workPeriodsSlot={
        <WorkPeriodsEditor
          periods={page.form.workPeriods}
          onChange={(next) => setPeriods(next as SimpleWorkPeriod[])}
          clampYear={clampYear}
          onDateBlur={() => page.validateDates(page.form.startDate, page.form.endDate)}
        />
      }
      brut={page.form.brut}
      onBrutChange={(v) => page.patch("brut", v)}
      asgariUcretHatasi={page.result.asgariUcretHatasi}
      show18Or50
      is18Or50={page.form.is18Or50}
      on18Or50Change={(v) => page.patch("is18Or50", v)}
      showUnderground
      isUnderground={page.form.isUnderground}
      onUndergroundChange={(v) => page.patch("isUnderground", v)}
      usedRows={page.form.usedRows}
      {...page.usedRowHandlers}
      usedLeaveSetsModuleId="yillik-izin-used-leave"
      entitlementLines={page.result.entitlementLines}
      totalEntitlementLabel="Toplam hak"
      usedTotal={page.result.usedTotal}
      remainingDays={page.result.remainingDays}
      formulaText={page.result.formulaText}
      brutIzin={page.result.brutIzin}
      sgk={page.result.sgk}
      issizlik={page.result.issizlik}
      gelirVergisi={page.result.gelirVergisi}
      gelirVergisiDilimleri={page.result.gelirVergisiDilimleri}
      damgaVergisi={page.result.damgaVergisi}
      netIzin={page.result.netIzin}
      dirty={page.dirty}
      activeName={page.activeName}
      isUpdate={page.isUpdate}
      storageError={page.storageError}
      onClearStorageError={page.setStorageError}
      cases={page.caseList}
      nameOpen={page.nameOpen}
      setNameOpen={page.setNameOpen}
      listOpen={page.listOpen}
      setListOpen={page.setListOpen}
      previewOpen={page.previewOpen}
      setPreviewOpen={page.setPreviewOpen}
      confirmNew={page.confirmNew}
      setConfirmNew={page.setConfirmNew}
      confirmDeleteId={page.confirmDeleteId}
      setConfirmDeleteId={page.setConfirmDeleteId}
      onNewClick={page.handleNewClick}
      onConfirmNew={page.doNew}
      onSaveClick={page.handleSaveClick}
      onPersist={page.persist}
      onOpenCase={page.onOpenCase}
      onConfirmDelete={page.onConfirmDelete}
      previewSections={page.previewSections}
      employerPayment={page.form.employerPayment ?? ""}
      onEmployerPaymentChange={(v) => page.patch("employerPayment", v)}
    />
  );
}
