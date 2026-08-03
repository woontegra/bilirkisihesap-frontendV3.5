import { useCallback, useEffect, useMemo, useState } from "react";
import { Newspaper } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { YillikPageView } from "../../lib/YillikPageView";
import { createEmptyUsedRow } from "../../lib/core";
import { clampYear, computeYillikBasinGunlukOlmayanResult } from "./engine";
import { createEmptyForm, snapshotKey, type SavedCase, type YillikBasinGunlukOlmayanForm } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";
import { formatDateTR, isDateOrderInvalid } from "../../lib/dates";
import { formatMoney } from "../../lib/money";

const PAGE_TITLE = "Yıllık Ücretli İzin — Basın (Günlük Olmayan)";
const PREVIEW_TITLE = "Yıllık İzin — Basın Günlük Olmayan Raporu";

export default function YillikBasinGunlukOlmayanPage() {
  const { success, error: showError } = useToast();
  const [form, setForm] = useState<YillikBasinGunlukOlmayanForm>(createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
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

  const result = useMemo(() => computeYillikBasinGunlukOlmayanResult(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(() => {
    const loaded = loadCasesSafe();
    if (!loaded.ok) { setStorageError(loaded.reason); setCases([]); return; }
    setStorageError(null); setCases(loaded.items);
  }, []);
  useEffect(() => { reloadCases(); }, [reloadCases]);

  const patch = useCallback(<K extends keyof YillikBasinGunlukOlmayanForm>(key: K, v: YillikBasinGunlukOlmayanForm[K]) => {
    setForm((p) => ({ ...p, [key]: v }));
  }, []);

  const validateDates = useCallback((start: string, end: string) => {
    if (isDateOrderInvalid(start, end)) { setDateError("Tarih sırası geçersiz."); showError("Tarih sırası geçersiz."); return false; }
    setDateError(null); return true;
  }, [showError]);

  const persist = useCallback((name: string) => {
    const saved = saveCase(name, form, {
      totalEntitlement: result.totalEntitlement, remainingDays: result.remainingDays, brutIzin: result.brutIzin,
      sgk: result.sgk, issizlik: result.issizlik, gelirVergisi: result.gelirVergisi, damgaVergisi: result.damgaVergisi, netIzin: result.netIzin,
    }, activeId || undefined);
    if (!saved) { showError("Kayıt yapılamadı"); return; }
    setActiveId(saved.id); setActiveName(saved.name); setBaseline(snapshotKey(form)); reloadCases(); success("Kayıt kaydedildi"); setNameOpen(false);
  }, [activeId, form, reloadCases, result, showError, success]);

  return (
    <YillikPageView
      icon={Newspaper}
      pageTitle={PAGE_TITLE}
      pageDescription="Günlük olmayan gazete — her 6 ayda 14 gün izin kuralı."
      previewTitle={PREVIEW_TITLE}
      notes={NOTE_BLOCKS}
      startDate={form.startDate}
      endDate={form.endDate}
      workPeriodLabel={result.workPeriodLabel}
      onStartDateChange={(v) => { patch("startDate", clampYear(v)); validateDates(clampYear(v), form.endDate); }}
      onEndDateChange={(v) => { patch("endDate", clampYear(v)); validateDates(form.startDate, clampYear(v)); }}
      onDateBlur={() => validateDates(form.startDate, form.endDate)}
      dateError={dateError}
      extraDateField={{
        label: "Mesleğe başlangıç",
        value: form.meslegeBaslangic,
        onChange: (v) => patch("meslegeBaslangic", clampYear(v)),
        resultLabel: "Devre sayısı",
        resultValue: result.izinResult.devre ? `${result.izinResult.devre} devre` : "—",
      }}
      brut={form.brut}
      onBrutChange={(v) => patch("brut", v)}
      asgariUcretHatasi={result.asgariUcretHatasi}
      usedRows={form.usedRows}
      onAddUsedRow={() => setForm((p) => ({ ...p, usedRows: [...p.usedRows, createEmptyUsedRow()] }))}
      onUpdateUsedRow={(id, row) => setForm((p) => ({ ...p, usedRows: p.usedRows.map((r) => (r.id === id ? { ...r, ...row } : r)) }))}
      onRemoveUsedRow={(id) => setForm((p) => ({ ...p, usedRows: p.usedRows.filter((r) => r.id !== id) }))}
      onReplaceUsedRows={(rows) => setForm((p) => ({ ...p, usedRows: rows }))}
      usedLeaveSetsModuleId="yillik-izin-used-leave"
      entitlementLines={result.entitlementLines}
      totalEntitlementLabel="Toplam hak"
      usedTotal={result.usedTotal}
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
      onEmployerPaymentChange={(v) => patch("employerPayment", v)}
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
      previewSections={[{ id: "basin-go", title: PREVIEW_TITLE, headers: ["Alan", "Değer"], rows: [["Meslek başlangıç", formatDateTR(form.meslegeBaslangic)], ["Net", `${formatMoney(result.netIzin)} ₺`]] }]}
    />
  );
}
