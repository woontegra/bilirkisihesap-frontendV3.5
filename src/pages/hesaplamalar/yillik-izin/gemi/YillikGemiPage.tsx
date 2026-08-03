import { useCallback, useEffect, useMemo, useState } from "react";
import { Ship } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { YillikPageView } from "../lib/YillikPageView";
import { WorkPeriodsEditor } from "../lib/WorkPeriodsEditor";
import { createEmptyUsedRow } from "../lib/core";
import type { GemiWorkPeriod } from "../lib/types";
import { clampYear, computeYillikGemiResult } from "./engine";
import { createEmptyForm, snapshotKey, type SavedCase, type YillikGemiForm } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";
import { formatMoney } from "../lib/money";

const PAGE_TITLE = "Yıllık Ücretli İzin — Gemi Adamları";
const PREVIEW_TITLE = "Yıllık İzin — Gemi Adamları Raporu";

export default function YillikGemiPage() {
  const { success, error: showError } = useToast();
  const [form, setForm] = useState<YillikGemiForm>(createEmptyForm);
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const result = useMemo(() => computeYillikGemiResult(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(() => {
    const loaded = loadCasesSafe();
    if (!loaded.ok) { setStorageError(loaded.reason); setCases([]); return; }
    setStorageError(null); setCases(loaded.items);
  }, []);
  useEffect(() => { reloadCases(); }, [reloadCases]);

  const persist = useCallback((name: string) => {
    if (result.error) { showError(result.error); return; }
    const saved = saveCase(name, form, {
      totalEntitlement: result.totalEntitlement, remainingDays: result.remainingDays, brutIzin: result.brutIzin,
      sgk: result.sgk, issizlik: result.issizlik, gelirVergisi: result.gelirVergisi, damgaVergisi: result.damgaVergisi, netIzin: result.netIzin,
    }, activeId || undefined);
    if (!saved) { showError("Kayıt yapılamadı"); return; }
    setActiveId(saved.id); setActiveName(saved.name); setBaseline(snapshotKey(form)); reloadCases(); success("Kayıt kaydedildi"); setNameOpen(false);
  }, [activeId, form, reloadCases, result, showError, success]);


  return (
    <YillikPageView
      icon={Ship}
      pageTitle={PAGE_TITLE}
      pageDescription="Deniz İş Kanunu — 30/360 gün kuralı ile gemi adamı yıllık izin alacağı."
      previewTitle={PREVIEW_TITLE}
      notes={NOTE_BLOCKS}
      startDate={form.workPeriods[0]?.iseGiris || ""}
      endDate={form.workPeriods[form.workPeriods.length - 1]?.istenCikis || ""}
      workPeriodLabel={result.workDaysLabel}
      onStartDateChange={() => {}}
      onEndDateChange={() => {}}
      onDateBlur={() => {}}
      dateError={result.error || null}
      brut={form.brut}
      onBrutChange={(v) => setForm((f) => ({ ...f, brut: v }))}
      asgariUcretHatasi={result.asgariUcretHatasi}
      usedRows={form.usedRows}
      onAddUsedRow={() => setForm((f) => ({ ...f, usedRows: [...f.usedRows, createEmptyUsedRow()] }))}
      onUpdateUsedRow={(id, row) => setForm((f) => ({ ...f, usedRows: f.usedRows.map((r) => (r.id === id ? { ...r, ...row } : r)) }))}
      onRemoveUsedRow={(id) => setForm((f) => ({ ...f, usedRows: f.usedRows.filter((r) => r.id !== id) }))}
      onReplaceUsedRows={(rows) => setForm((f) => ({ ...f, usedRows: rows }))}
      usedLeaveSetsModuleId="yillik-izin-used-leave"
      workPeriodsSlot={
        <WorkPeriodsEditor
          title="Çalışma dönemleri (30/360)"
          periods={form.workPeriods}
          onChange={(next) => setForm((f) => ({ ...f, workPeriods: next as GemiWorkPeriod[] }))}
          clampYear={clampYear}
          showDayOverride
        />
      }
      entitlementLines={result.entitlementLines}
      totalEntitlementLabel="Toplam hak"
      usedTotal={result.usedDays}
      remainingDays={result.remainingDays}
      formulaText={result.formulaText}
      brutIzin={result.brutIzin}
      sgk={result.sgk}
      issizlik={result.issizlik}
      gelirVergisi={result.gelirVergisi}
      gelirVergisiDilimleri={result.gelirVergisiDilimleri}
      damgaVergisi={result.damgaVergisi}
      netIzin={result.netIzin}
      employerPayment={form.employerPayment}
      onEmployerPaymentChange={(v) => setForm((f) => ({ ...f, employerPayment: v }))}
      dirty={dirty}
      activeName={activeName}
      isUpdate={!!activeId}
      storageError={storageError}
      onClearStorageError={() => { clearCorruptCases(); setStorageError(null); reloadCases(); }}
      cases={cases.map((c) => ({ id: c.id, name: c.name, updatedAt: c.updatedAt, subtitle: `${formatMoney(c.results.netIzin)} ₺` }))}
      nameOpen={nameOpen}
      setNameOpen={setNameOpen}
      listOpen={listOpen}
      setListOpen={setListOpen}
      previewOpen={previewOpen}
      setPreviewOpen={setPreviewOpen}
      confirmNew={confirmNew}
      setConfirmNew={setConfirmNew}
      confirmDeleteId={confirmDeleteId}
      setConfirmDeleteId={setConfirmDeleteId}
      onNewClick={() => (dirty ? setConfirmNew(true) : (setForm(createEmptyForm()), setActiveId(null), setActiveName(null), setBaseline(snapshotKey(createEmptyForm()))))}
      onConfirmNew={() => { setConfirmNew(false); setForm(createEmptyForm()); setActiveId(null); setActiveName(null); setBaseline(snapshotKey(createEmptyForm())); }}
      onSaveClick={() => (activeName ? persist(activeName) : setNameOpen(true))}
      onPersist={persist}
      onOpenCase={(id) => { const c = cases.find((x) => x.id === id); if (c) { setForm(c.form); setActiveId(c.id); setActiveName(c.name); setBaseline(snapshotKey(c.form)); setListOpen(false); } }}
      onConfirmDelete={() => { if (confirmDeleteId) { deleteCase(confirmDeleteId); if (activeId === confirmDeleteId) { setActiveId(null); setActiveName(null); } setConfirmDeleteId(null); reloadCases(); } }}
      previewSections={[{ id: "gemi", title: PREVIEW_TITLE, headers: ["Alan", "Değer"], rows: [["Toplam gün", result.workDaysLabel], ["Net", `${formatMoney(result.netIzin)} ₺`]] }]}
    />
  );
}
