import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { YillikPageView } from "../lib/YillikPageView";
import { createEmptyUsedRow } from "../lib/core";
import { clampYear, computeYillikBasinResult } from "./engine";
import { createEmptyForm, snapshotKey, type SavedCase, type YillikBasinForm } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";
import { formatDateTR, isDateOrderInvalid } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { PreviewSection } from "@/components/calculation-preview";
import styles from "../lib/YillikPageView.module.css";

const PAGE_TITLE = "Yıllık Ücretli İzin — Basın (Günlük Gazete)";
const PREVIEW_TITLE = "Yıllık İzin — Basın Günlük Gazete Raporu";

export default function YillikBasinPage() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [form, setForm] = useState<YillikBasinForm>(createEmptyForm);
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

  const result = useMemo(() => computeYillikBasinResult(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(() => {
    const loaded = loadCasesSafe();
    if (!loaded.ok) { setStorageError(loaded.reason); setCases([]); return; }
    setStorageError(null);
    setCases(loaded.items);
  }, []);

  useEffect(() => { reloadCases(); }, [reloadCases]);

  const validateDates = useCallback((start: string, end: string) => {
    if (isDateOrderInvalid(start, end)) {
      setDateError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
      showError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
      return false;
    }
    setDateError(null);
    return true;
  }, [showError]);

  const patch = useCallback(<K extends keyof YillikBasinForm>(key: K, value: YillikBasinForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const persist = useCallback((name: string) => {
    const saved = saveCase(name, form, {
      totalEntitlement: result.totalEntitlement, remainingDays: result.remainingDays, brutIzin: result.brutIzin,
      sgk: result.sgk, issizlik: result.issizlik, gelirVergisi: result.gelirVergisi, damgaVergisi: result.damgaVergisi, netIzin: result.netIzin,
    }, activeId || undefined);
    if (!saved) { showError("Kayıt yapılamadı"); return; }
    setActiveId(saved.id); setActiveName(saved.name); setBaseline(snapshotKey(form)); reloadCases(); success("Kayıt kaydedildi"); setNameOpen(false);
  }, [activeId, form, reloadCases, result, showError, success]);

  const previewSections: PreviewSection[] = useMemo(() => [{
    id: "basin",
    title: PREVIEW_TITLE,
    headers: ["Alan", "Değer"],
    rows: [
      ["Mesleğe başlangıç", formatDateTR(form.meslegeBaslangic)],
      ["İşe giriş", formatDateTR(form.startDate)],
      ["İşten çıkış", formatDateTR(form.endDate)],
      ["Toplam izin", `${result.totalEntitlement} gün`],
      ["Net alacak", `${formatMoney(result.netIzin)} ₺`],
    ],
  }], [form, result]);

  return (
    <YillikPageView
      icon={Newspaper}
      pageTitle={PAGE_TITLE}
      pageDescription="5953 sayılı Basın İş Kanunu — günlük gazete işçisi yıllık izin (4/6 hafta kuralı)."
      previewTitle={PREVIEW_TITLE}
      notes={NOTE_BLOCKS}
      headerControls={
        <div className={styles.field}>
          <label className={styles.label} htmlFor="gazeteci-turu">
            Gazeteci türü
          </label>
          <select
            id="gazeteci-turu"
            className={styles.input}
            value="gunluk"
            onChange={(e) => {
              if (e.target.value === "gunlukOlmayan") navigate("/yillik-izin/basin/gunluk-olmayan");
            }}
          >
            <option value="gunluk">Günlük gazete</option>
            <option value="gunlukOlmayan">Günlük olmayan gazete</option>
          </select>
        </div>
      }
      startDate={form.startDate}
      endDate={form.endDate}
      workPeriodLabel={result.basinDetail.aciklama || `${result.totalEntitlement} gün`}
      onStartDateChange={(v) => { patch("startDate", clampYear(v)); validateDates(clampYear(v), form.endDate); }}
      onEndDateChange={(v) => { patch("endDate", clampYear(v)); validateDates(form.startDate, clampYear(v)); }}
      onDateBlur={() => validateDates(form.startDate, form.endDate)}
      dateError={dateError}
      extraDateField={{
        label: "Mesleğe başlangıç",
        value: form.meslegeBaslangic,
        onChange: (v) => patch("meslegeBaslangic", clampYear(v)),
        helper: "10 yıllık kıdem eşiği için",
        resultLabel: "Toplam hafta",
        resultValue: result.basinDetail.toplamHafta ? `${result.basinDetail.toplamHafta} hafta` : "—",
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
      onOpenCase={(id) => {
        const c = cases.find((x) => x.id === id);
        if (!c) return;
        setForm(c.form); setActiveId(c.id); setActiveName(c.name); setBaseline(snapshotKey(c.form)); setListOpen(false);
      }}
      onConfirmDelete={() => {
        if (!confirmDeleteId) return;
        deleteCase(confirmDeleteId);
        if (activeId === confirmDeleteId) { setActiveId(null); setActiveName(null); }
        setConfirmDeleteId(null); reloadCases();
      }}
      previewSections={previewSections}
    />
  );
}
