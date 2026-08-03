import { Briefcase } from "lucide-react";
import { YillikPageView } from "../lib/YillikPageView";
import { useStandardYillikPage } from "../lib/useStandardYillikPage";
import { clampYear, computeYillikStandartResult } from "./engine";
import { createEmptyForm, snapshotKey } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";

const PAGE_TITLE = "Yıllık Ücretli İzin — İş Kanununa Göre";
const PREVIEW_TITLE = "Yıllık Ücretli İzin — Standart Raporu";

export default function YillikStandartPage() {
  const page = useStandardYillikPage({
    createEmptyForm,
    snapshotKey,
    compute: computeYillikStandartResult,
    storage: { loadCasesSafe, saveCase, deleteCase, clearCorruptCases },
    previewTitle: PREVIEW_TITLE,
    pageTitle: PAGE_TITLE,
  });

  return (
    <YillikPageView
      icon={Briefcase}
      pageTitle={PAGE_TITLE}
      pageDescription="4857 sayılı İş Kanunu kapsamında yıllık ücretli izin alacağı hesabı."
      previewTitle={PREVIEW_TITLE}
      notes={NOTE_BLOCKS}
      startDate={page.form.startDate}
      endDate={page.form.endDate}
      workPeriodLabel={page.result.workPeriodLabel}
      onStartDateChange={(v) => {
        page.patch("startDate", clampYear(v));
        page.validateDates(clampYear(v), page.form.endDate);
      }}
      onEndDateChange={(v) => {
        page.patch("endDate", clampYear(v));
        page.validateDates(page.form.startDate, clampYear(v));
      }}
      onDateBlur={() => page.validateDates(page.form.startDate, page.form.endDate)}
      dateError={page.dateError}
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
      employerPayment={page.form.employerPayment ?? ""}
      onEmployerPaymentChange={(v) => page.patch("employerPayment", v)}
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
    />
  );
}
