import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  deleteLocalExclusionSet,
  listLocalExclusionSets,
  upsertLocalExclusionSet,
  type LocalExclusionSet,
} from "@/lib/localExclusionSetsStore";
import { tryMergeLegacyExclusionSets } from "@/lib/localExclusionSetsHelpers";
import { clampYear, formatDateTR, formatMoney, newLocalId, parseNum } from "./money";
import type { DateRange, ExcludedDay, NetBreakdown, TableRow } from "./types";
import { ManualBrutWageApplyControls } from "./ManualBrutWageApplyControls";
import { getMinWageForStartISO, yearsFromTableRows } from "./manualBrutApply";
import { MahsuplasamaModal } from "./MahsuplasamaModal";
import {
  excludedDaysToSetItems,
  HT_EXCLUSION_SETS_MODULE_ID,
  setItemsToExcludedDays,
} from "./exclusionSets";

export type HaftaTatiliComputeResult = {
  rows: TableRow[];
  totalBrut: number;
  year: number;
  net: NetBreakdown;
  hakkaniyet: number;
  mahsupSonuc: number;
};

export type HaftaTatiliBaseForm = {
  dateRanges: DateRange[];
  excludedDays: ExcludedDay[];
  expiryStart: string | null;
  selectedHolidayIds: string[];
  rows: TableRow[];
  settleAmount: string;
  globalCoefficient: number;
  kullanimBaslangic?: string;
  kullanimBitis?: string;
  kullanimGunSayisi?: 1 | 2 | 3 | 4;
  geceCalisan?: boolean;
};

export type HaftaTatiliStorage<TForm extends HaftaTatiliBaseForm> = {
  loadCasesSafe: () => { ok: boolean; items: { id: string; name: string; form: TForm; updatedAt: string }[]; reason?: string };
  saveCase: (name: string, form: TForm, results: { totalBrut: number; netAmount: number }, existingId?: string | null) => { id: string; name: string } | null;
  deleteCase: (id: string) => void;
  clearCorruptCases: () => void;
};

export type HaftaTatiliPageConfig<TForm extends HaftaTatiliBaseForm> = {
  pageTitle: string;
  previewTitle: string;
  notes: string[];
  showSeasonal: boolean;
  showGeceCalisan: boolean;
  createEmptyForm: () => TForm;
  snapshotKey: (form: TForm) => string;
  compute: (form: TForm) => HaftaTatiliComputeResult;
  buildAutoRows: (form: TForm) => TableRow[];
  applyCoefficient: (form: TForm, k: number) => TForm;
  calcKatsayi: (a: string, b: string) => number;
  storage: HaftaTatiliStorage<TForm>;
  styles: Record<string, string>;
  exclusionSetsModuleId?: string;
};

function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  useEffect(() => {
    if (reduce) { setDisplay(value); return; }
    const from = display;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 380);
      setDisplay(from + (value - from) * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from last displayed
  }, [value, reduce]);
  return <span className={className}><>{formatMoney(display)}</></span>;
}

function NameModal({
  open,
  initial,
  title = "Kaydı adlandır",
  onClose,
  onConfirm,
  styles,
}: {
  open: boolean;
  initial: string;
  title?: string;
  onClose: () => void;
  onConfirm: (n: string) => void;
  styles: Record<string, string>;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => { if (open) setName(initial); }, [open, initial]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Vazgeç</Button>
          <Button type="button" variant="primary" size="sm" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>Kaydet</Button>
        </div>
      </div>
    </div>
  );
}

function mergeAutoWithManual(auto: TableRow[], prevRows: TableRow[]): TableRow[] {
  return auto.map((r) => {
    const prev = prevRows.find((p) => p.startISO === r.startISO && p.endISO === r.endISO);
    if (!prev) return r;
    let next = r;
    if (prev.brutManual && prev.wage > 0) {
      next = { ...next, wage: prev.wage, brutManual: true };
    }
    if (prev.manualWeekCount) {
      next = { ...next, weekCount: prev.weekCount, manualWeekCount: true };
    }
    return next;
  });
}

export function HaftaTatiliCalcPage<TForm extends HaftaTatiliBaseForm>({ config }: { config: HaftaTatiliPageConfig<TForm> }) {
  const styles = config.styles;
  const exclusionModuleId = config.exclusionSetsModuleId ?? HT_EXCLUSION_SETS_MODULE_ID;
  const { success, error: showError } = useToast();
  const [form, setForm] = useState<TForm>(config.createEmptyForm);
  const [cases, setCases] = useState<{ id: string; name: string; form: TForm; updatedAt: string }[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => config.snapshotKey(config.createEmptyForm()));
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [katsayiOpen, setKatsayiOpen] = useState(false);
  const [bilinenUcret, setBilinenUcret] = useState("");
  const [asgariUcret, setAsgariUcret] = useState("");
  const [mahsupOpen, setMahsupOpen] = useState(false);
  const [exclusionSaveOpen, setExclusionSaveOpen] = useState(false);
  const [exclusionImportOpen, setExclusionImportOpen] = useState(false);
  const [savedExclusionSets, setSavedExclusionSets] = useState<LocalExclusionSet[]>([]);
  const autoSyncRef = useRef(true);

  const dirty = config.snapshotKey(form) !== baseline;
  const result = useMemo(() => config.compute(form), [form, config]);
  const manualBrutActive = useMemo(
    () => result.rows.some((r) => r.brutManual === true && r.wage > 0),
    [result.rows],
  );
  const mahsupYears = useMemo(() => yearsFromTableRows(result.rows), [result.rows]);
  const daily50Header = form.geceCalisan && config.showGeceCalisan ? "Günlük %50 Zamlı ×2 ₺" : "Günlük %50 Zamlı ₺";

  const reloadCases = useCallback(() => {
    const loaded = config.storage.loadCasesSafe();
    if (!loaded.ok) {
      setStorageError(loaded.reason || "Depo hatası");
      setCases([]);
      return;
    }
    setStorageError(null);
    setCases(loaded.items);
  }, [config.storage]);

  const refreshExclusionSets = useCallback(() => {
    setSavedExclusionSets(listLocalExclusionSets(exclusionModuleId));
  }, [exclusionModuleId]);

  useEffect(() => { reloadCases(); }, [reloadCases]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const merged = await tryMergeLegacyExclusionSets(exclusionModuleId);
      if (cancelled) return;
      if (merged && merged.imported > 0) {
        success(`${merged.imported} eski dışlama seti yerel depoya alındı`);
      }
      refreshExclusionSets();
    })();
    return () => { cancelled = true; };
  }, [exclusionModuleId, refreshExclusionSets, success]);

  useEffect(() => {
    if (!autoSyncRef.current) return;
    if (form.rows.length > 0 && form.rows.some((r) => r.manual)) return;
    const auto = config.buildAutoRows(form);
    const merged = mergeAutoWithManual(auto, form.rows);
    const keyOf = (rows: TableRow[]) =>
      JSON.stringify(rows.map((r) => [r.startISO, r.endISO, r.weekCount, r.wage, r.brutManual ? 1 : 0, r.coefficient]));
    if (keyOf(merged) !== keyOf(form.rows)) {
      setForm((prev) => ({ ...prev, rows: mergeAutoWithManual(config.buildAutoRows(prev), prev.rows) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-sync when range/exclusion inputs change
  }, [form.dateRanges, form.excludedDays, form.expiryStart, form.kullanimBaslangic, form.kullanimBitis, form.kullanimGunSayisi, form.geceCalisan, form.globalCoefficient, config]);

  const patch = useCallback(<K extends keyof TForm>(key: K, value: TForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleApplyManualBruts = useCallback((brutById: Record<string, number>) => {
    setForm((prev) => {
      const base = prev.rows.length ? prev.rows : config.buildAutoRows(prev);
      return {
        ...prev,
        rows: base.map((row) => {
          const b = brutById[row.id];
          if (b != null && Number.isFinite(b) && b > 0) {
            return { ...row, wage: b, brutManual: true };
          }
          return row;
        }) as TForm["rows"],
      };
    });
  }, [config]);

  const handleDeactivateManualBrut = useCallback(() => {
    setForm((prev) => {
      const base = prev.rows.length ? prev.rows : config.buildAutoRows(prev);
      return {
        ...prev,
        rows: base.map((row) => ({
          ...row,
          wage: getMinWageForStartISO(row.startISO),
          brutManual: false,
        })) as TForm["rows"],
      };
    });
  }, [config]);

  const persistExclusionSet = (name: string) => {
    try {
      upsertLocalExclusionSet(exclusionModuleId, name, excludedDaysToSetItems(form.excludedDays));
      refreshExclusionSets();
      setExclusionSaveOpen(false);
      success("Dışlama seti kaydedildi");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  };

  const importExclusionSet = (set: LocalExclusionSet) => {
    patch("excludedDays", setItemsToExcludedDays(set.data) as TForm["excludedDays"]);
    setExclusionImportOpen(false);
    success(`"${set.name}" içe aktarıldı`);
  };

  const removeExclusionSet = (id: string) => {
    deleteLocalExclusionSet(exclusionModuleId, id);
    refreshExclusionSets();
    success("Set silindi");
  };

  const rescanLegacyExclusions = async () => {
    const merged = await tryMergeLegacyExclusionSets(exclusionModuleId, { force: true });
    refreshExclusionSets();
    if (!merged) {
      success("Yerel setler kullanılıyor (sunucu setleri alınamadı)");
      return;
    }
    success(
      merged.imported > 0
        ? `${merged.imported} set aktarıldı${merged.skipped ? `, ${merged.skipped} atlandı` : ""}`
        : "Yeni set bulunamadı",
    );
  };

  const previewSections = useMemo((): PreviewSection[] => {
    const secs: PreviewSection[] = [];
    const valid = form.dateRanges.filter((r) => r.start && r.end);
    if (valid.length) {
      secs.push({
        id: "bilgi",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["İşe Giriş", formatDateTR(valid.map((r) => r.start).sort()[0])],
          ["İşten Çıkış", formatDateTR(valid.map((r) => r.end).sort().reverse()[0])],
          ...(form.expiryStart ? [["Zamanaşımı", formatDateTR(form.expiryStart)]] : []),
          ...(config.showGeceCalisan
            ? [["Sürekli Gece", form.geceCalisan ? "Evet (Haftada 2 gün)" : "Hayır (Haftada 1 gün)"]]
            : []),
        ],
      });
    }
    if (result.rows.length) {
      secs.push({
        id: "cetvel",
        title: "Hafta Tatili Hesaplama",
        headers: ["Dönem", "Hafta", "Ücret (BRÜT)", "Katsayı", "Günlük Brüt", daily50Header.replace(" ₺", ""), "HT Ücreti"],
        rows: [
          ...result.rows.map((r) => [
            r.period,
            String(r.weekCount),
            `${formatMoney(r.wage)} ₺`,
            String(Number(r.coefficient ?? 1).toFixed(4)),
            `${formatMoney(r.dailyWage)} ₺`,
            `${formatMoney(r.daily50)} ₺`,
            `${formatMoney(r.haftaTatiliTotal)} ₺`,
          ]),
          ["Toplam", "", "", "", "", "", `${formatMoney(result.totalBrut)} ₺`],
        ],
      });
    }
    secs.push({
      id: "net",
      title: "Brüt'ten Net'e",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt", `${formatMoney(result.totalBrut)} ₺`],
        ["SGK (%14)", `-${formatMoney(result.net.ssk)} ₺`],
        ["İşsizlik (%1)", `-${formatMoney(result.net.issizlik)} ₺`],
        [`Gelir Vergisi ${result.net.gelirVergisiDilimleri}`, `-${formatMoney(result.net.gelirVergisi)} ₺`],
        ["Damga (7,59‰)", `-${formatMoney(result.net.damgaVergisi)} ₺`],
        ["Net", `${formatMoney(result.net.netAmount)} ₺`],
        ["1/3 Hakkaniyet", `-${formatMoney(result.hakkaniyet)} ₺`],
        ["Mahsuplaşma Sonucu", `${formatMoney(result.mahsupSonuc)} ₺`],
      ],
      lastRowTone: "green",
    });
    return secs;
  }, [form, result, config.showGeceCalisan, daily50Header]);

  const doSave = (name: string) => {
    const saved = config.storage.saveCase(name, form, { totalBrut: result.totalBrut, netAmount: result.net.netAmount }, activeId);
    if (!saved) { showError("Kayıt adı gerekli"); return; }
    setActiveId(saved.id);
    setActiveName(saved.name);
    setBaseline(config.snapshotKey(form));
    reloadCases();
    success("Kayıt kaydedildi");
    setNameOpen(false);
  };

  const openCase = (c: { id: string; name: string; form: TForm }) => {
    setForm(c.form);
    setActiveId(c.id);
    setActiveName(c.name);
    setBaseline(config.snapshotKey(c.form));
    setListOpen(false);
    success(`"${c.name}" yüklendi`);
  };

  const katsayi = config.calcKatsayi(bilinenUcret, asgariUcret);
  const hasExclusions = form.excludedDays.length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroIcon}><Calculator size={18} /></div>
        <div>
          <h1 className={styles.title}>{config.pageTitle}</h1>
          <p className={styles.desc}>V3 formülleri · tamamen lokal hesaplama</p>
          <div className={styles.privacyBadge}><ShieldCheck size={13} /><span>Bu cihazda · ağ yok</span></div>
          {activeName && <div className={styles.recordBadge}>Kayıt: {activeName}</div>}
        </div>
      </header>

      {storageError && (
        <div className={styles.storageBanner}>
          {storageError}
          <Button type="button" size="sm" variant="ghost" onClick={() => { config.storage.clearCorruptCases(); reloadCases(); }}>Sıfırla</Button>
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>İşe Giriş — Çıkış Tarihleri</h2>
            {form.dateRanges.map((range) => (
              <div key={range.id} className={styles.rangeRow}>
                <input type="date" className={styles.input} value={range.start} max="9999-12-31"
                  onChange={(e) => patch("dateRanges", form.dateRanges.map((r) => r.id === range.id ? { ...r, start: clampYear(e.target.value) } : r) as TForm["dateRanges"])} />
                <span>—</span>
                <input type="date" className={styles.input} value={range.end} max="9999-12-31"
                  onChange={(e) => patch("dateRanges", form.dateRanges.map((r) => r.id === range.id ? { ...r, end: clampYear(e.target.value) } : r) as TForm["dateRanges"])} />
                <Button type="button" variant="ghost" size="sm" disabled={form.dateRanges.length <= 1}
                  onClick={() => patch("dateRanges", form.dateRanges.filter((r) => r.id !== range.id) as TForm["dateRanges"])}><Trash2 size={14} /></Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => patch("dateRanges", [...form.dateRanges, { id: newLocalId("dr"), start: "", end: "" }] as TForm["dateRanges"])}>
              <Plus size={14} /> Dönem Ekle
            </Button>
          </section>

          {config.showSeasonal && (
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>Hafta Tatili Kullanım Bilgisi</h2>
              <div className={styles.grid3}>
                <input className={styles.input} placeholder="Başlangıç gg.aa" value={form.kullanimBaslangic ?? ""}
                  onChange={(e) => patch("kullanimBaslangic" as keyof TForm, e.target.value.replace(/[^0-9.]/g, "") as TForm[keyof TForm])} />
                <input className={styles.input} placeholder="Bitiş gg.aa" value={form.kullanimBitis ?? ""}
                  onChange={(e) => patch("kullanimBitis" as keyof TForm, e.target.value.replace(/[^0-9.]/g, "") as TForm[keyof TForm])} />
                <select className={styles.input} value={form.kullanimGunSayisi ?? 4}
                  onChange={(e) => patch("kullanimGunSayisi" as keyof TForm, Number(e.target.value) as TForm[keyof TForm])}>
                  <option value={4}>4 gün (tam)</option><option value={3}>3 gün (%75)</option>
                  <option value={2}>2 gün (%50)</option><option value={1}>1 gün (%25)</option>
                </select>
              </div>
            </section>
          )}

          {config.showGeceCalisan && (
            <section className={styles.card} aria-labelledby="gece-calisan-heading">
              <label className={styles.geceBlock ?? styles.checkRow} htmlFor="gece-calisan">
                <input
                  id="gece-calisan"
                  type="checkbox"
                  checked={!!form.geceCalisan}
                  onChange={(e) => patch("geceCalisan" as keyof TForm, e.target.checked as TForm[keyof TForm])}
                />
                <span className={styles.geceText}>
                  <span id="gece-calisan-heading" className={styles.geceTitle}>Sürekli Gece Çalışanı</span>
                  <span className={styles.geceSub}>(Haftada 2 gün tatil hakkı)</span>
                  <span className={styles.geceHint}>
                    5953 Sayılı Basın İş Kanunu kapsamında görevi sürekli gece çalışmasını gerektiriyorsa işaretleyin; hafta tatili ücreti iki günlük esasa göre hesaplanır.
                  </span>
                </span>
              </label>
            </section>
          )}

          <section className={styles.card}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Dışlanabilir Günler</h2>
              <div className={styles.inlineBtns}>
                <Button type="button" size="sm" variant="soft" disabled={!hasExclusions} onClick={() => setExclusionSaveOpen(true)}>
                  <Save size={14} /> Kaydet
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  onClick={() => { refreshExclusionSets(); setExclusionImportOpen(true); }}
                >
                  <Download size={14} /> İçe aktar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={!hasExclusions}
                  onClick={() => { patch("excludedDays", [] as TForm["excludedDays"]); success("Dışlamalar temizlendi"); }}
                >
                  <Trash2 size={14} /> Tümünü sil
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => patch("excludedDays", [...form.excludedDays, { id: newLocalId("ex"), type: "Yıllık İzin", start: "", end: "", days: 0 }] as TForm["excludedDays"])}>
                  <Plus size={14} /> Ekle
                </Button>
              </div>
            </div>
            {form.excludedDays.map((ex) => (
              <div key={ex.id} className={styles.rangeRow}>
                <select className={styles.input} value={ex.type} onChange={(e) => patch("excludedDays", form.excludedDays.map((d) => d.id === ex.id ? { ...d, type: e.target.value as ExcludedDay["type"] } : d) as TForm["excludedDays"])}>
                  <option>Yıllık İzin</option><option>Rapor</option><option>Diğer</option><option>UBGT</option>
                </select>
                <input type="date" className={styles.input} value={ex.start} onChange={(e) => patch("excludedDays", form.excludedDays.map((d) => d.id === ex.id ? { ...d, start: e.target.value } : d) as TForm["excludedDays"])} />
                <input type="date" className={styles.input} value={ex.end} onChange={(e) => patch("excludedDays", form.excludedDays.map((d) => d.id === ex.id ? { ...d, end: e.target.value } : d) as TForm["excludedDays"])} />
                <Button type="button" variant="ghost" size="sm" onClick={() => patch("excludedDays", form.excludedDays.filter((d) => d.id !== ex.id) as TForm["excludedDays"])}><X size={14} /></Button>
              </div>
            ))}
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Hesaplama Tablosu</h2>
              <div className={styles.inlineBtns}>
                <input type="date" className={styles.input} title="Zamanaşımı başlangıcı" value={form.expiryStart ?? ""} onChange={(e) => patch("expiryStart", (e.target.value || null) as TForm["expiryStart"])} />
                <Button type="button" size="sm" variant="ghost" onClick={() => setKatsayiOpen(true)}>Kat Sayı</Button>
              </div>
            </div>
            <ManualBrutWageApplyControls
              rows={result.rows}
              onApplyBrutsByRowId={handleApplyManualBruts}
              manualBrutActive={manualBrutActive}
              onDeactivateManualBrut={handleDeactivateManualBrut}
              success={success}
              error={showError}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tarih (Ücret Dönemi)</th>
                    <th>Hafta</th>
                    <th>Ücret (BRÜT) ₺</th>
                    <th>Katsayı</th>
                    <th>Günlük Brüt ₺</th>
                    <th>{daily50Header}</th>
                    <th>Hafta Tatili Ücreti ₺</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 ? (
                    <tr><td colSpan={7} className={styles.emptyCell}>Tarih aralığı girin</td></tr>
                  ) : result.rows.map((row, i) => (
                    <tr key={row.id}>
                      <td>{row.period}</td>
                      <td><input type="number" className={styles.cellInput} value={row.weekCount} min={0}
                        onChange={(e) => {
                          const wc = Math.max(0, Number(e.target.value) || 0);
                          const next = form.rows.length ? [...form.rows] : [...result.rows];
                          next[i] = { ...next[i], weekCount: wc, manualWeekCount: true };
                          patch("rows", next as TForm["rows"]);
                        }} /></td>
                      <td><input className={styles.cellInput} defaultValue={formatMoney(row.wage)} key={`w-${row.id}-${row.wage}`}
                        onBlur={(e) => {
                          const wage = parseNum(e.target.value);
                          const next = form.rows.length ? [...form.rows] : [...result.rows];
                          next[i] = { ...next[i], wage, brutManual: wage > 0 };
                          patch("rows", next as TForm["rows"]);
                        }} /></td>
                      <td>{Number(row.coefficient ?? 1).toFixed(4)}</td>
                      <td>{formatMoney(row.dailyWage)}</td>
                      <td>{formatMoney(row.daily50)}</td>
                      <td className={styles.amountCell}>{formatMoney(row.haftaTatiliTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                {result.rows.length > 0 && (
                  <tfoot><tr><td colSpan={6} className={styles.totalLabel}>Toplam Brüt</td><td className={styles.amountCell}><AnimatedMoney value={result.totalBrut} /> ₺</td></tr></tfoot>
                )}
              </table>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Brüt'ten Net'e & Hakkaniyet</h2>
            <div className={styles.netGrid}>
              <div className={styles.netPanel}>
                <div className={styles.netRow}><span>Brüt</span><AnimatedMoney value={result.totalBrut} /></div>
                <div className={styles.netRow}><span>SGK (%14)</span>-{formatMoney(result.net.ssk)}</div>
                <div className={styles.netRow}><span>İşsizlik (%1)</span>-{formatMoney(result.net.issizlik)}</div>
                <div className={styles.netRow}><span>Gelir Vergisi {result.net.gelirVergisiDilimleri}</span>-{formatMoney(result.net.gelirVergisi)}</div>
                <div className={styles.netRow}><span>Damga (7,59‰)</span>-{formatMoney(result.net.damgaVergisi)}</div>
                <div className={styles.netRowStrong}><span>Net</span><AnimatedMoney value={result.net.netAmount} /></div>
              </div>
              <div className={styles.netPanel}>
                <div className={styles.netRow}><span>1/3 Hakkaniyet</span>{formatMoney(result.hakkaniyet)}</div>
                <label className={styles.label}>Mahsuplaşma Miktarı (₺)</label>
                <div className={styles.settleRow}>
                  <input className={styles.input} value={form.settleAmount} onChange={(e) => patch("settleAmount", e.target.value as TForm["settleAmount"])} />
                  <Button type="button" size="sm" variant="soft" title="Mahsuplaşma Ekle" onClick={() => setMahsupOpen(true)}>
                    <Plus size={14} />
                  </Button>
                </div>
                <div className={styles.netRowStrong}><span>Mahsup Sonucu</span><AnimatedMoney value={result.mahsupSonuc} /></div>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Notlar</h2>
            <ul className={styles.notes}>{config.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </section>
        </div>

        <aside className={styles.sideCol}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Toplam Brüt</p>
            <p className={styles.summaryValue}><AnimatedMoney value={result.totalBrut} /> ₺</p>
            <p className={styles.summaryLabel}>Net</p>
            <p className={styles.summaryValueNet}><AnimatedMoney value={result.net.netAmount} /> ₺</p>
          </div>
        </aside>
      </div>

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}>
        <div className={styles.stickyInner}>
          <span className={styles.stickyStatus}>{dirty ? "Kaydedilmemiş değişiklikler" : "Güncel"}</span>
          <div className={styles.stickyActions}>
            <Button type="button" variant="ghost" size="sm" onClick={() => (dirty ? setConfirmNew(true) : (setForm(config.createEmptyForm()), setActiveId(null), setActiveName(null), setBaseline(config.snapshotKey(config.createEmptyForm()))))}><FilePlus2 size={14} /> Yeni</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setListOpen(true)}><FolderOpen size={14} /> Aç</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewOpen(true)}><Eye size={14} /> Önizleme</Button>
            <Button type="button" variant="primary" size="sm" onClick={() => setNameOpen(true)}><Save size={14} /> Kaydet</Button>
          </div>
        </div>
      </div>

      <NameModal open={nameOpen} initial={activeName || `${config.pageTitle} — ${new Date().toLocaleDateString("tr-TR")}`} onClose={() => setNameOpen(false)} onConfirm={doSave} styles={styles} />
      <NameModal
        open={exclusionSaveOpen}
        initial=""
        title="Dışlama Setini Kaydet"
        onClose={() => setExclusionSaveOpen(false)}
        onConfirm={persistExclusionSet}
        styles={styles}
      />

      {exclusionImportOpen && (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setExclusionImportOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.sectionHead}>
              <h3 className={styles.modalTitle}>Kaydedilmiş Dışlama Setlerini İçe Aktar</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => void rescanLegacyExclusions()} title="Sunucudaki eski setleri yeniden tara">
                <RefreshCw size={14} /> Yeniden tara
              </Button>
            </div>
            {savedExclusionSets.length === 0 ? (
              <p className={styles.helper}>
                Kaydedilmiş set yok. Dışlanabilir günlerdeki “Kaydet” ile mevcut satırları saklayabilirsiniz.
              </p>
            ) : (
              <ul className={styles.setList}>
                {savedExclusionSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.data.length} satır</span>
                    </div>
                    <div className={styles.inlineBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => importExclusionSet(set)}>
                        <Download size={13} /> İçe aktar
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => removeExclusionSet(set.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setExclusionImportOpen(false)}>Kapat</Button>
            </div>
          </div>
        </div>
      )}

      {listOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
            <div className={styles.caseList}>
              {cases.length === 0 ? <p className={styles.helper}>Kayıt yok</p> : cases.map((c) => (
                <div key={c.id} className={styles.caseItem}>
                  <div><div className={styles.caseName}>{c.name}</div><div className={styles.caseMeta}>{new Date(c.updatedAt).toLocaleString("tr-TR")}</div></div>
                  <div className={styles.caseBtns}>
                    <Button size="sm" variant="primary" onClick={() => openCase(c)}>Aç</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(c.id)}><Trash2 size={14} /></Button>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.modalActions}><Button variant="ghost" size="sm" onClick={() => setListOpen(false)}>Kapat</Button></div>
          </div>
        </div>
      )}

      {katsayiOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Kat Sayı Hesapla</h3>
            <input className={styles.input} placeholder="Bilinen ücret" value={bilinenUcret} onChange={(e) => setBilinenUcret(e.target.value)} />
            <input className={styles.input} placeholder="Asgari ücret" value={asgariUcret} onChange={(e) => setAsgariUcret(e.target.value)} style={{ marginTop: "0.5rem" }} />
            <p className={styles.helper}>Katsayı: <strong>{katsayi.toFixed(4)}</strong></p>
            <div className={styles.modalActions}>
              <Button variant="ghost" size="sm" onClick={() => setKatsayiOpen(false)}>İptal</Button>
              <Button variant="primary" size="sm" onClick={() => { setForm(config.applyCoefficient(form, katsayi)); setKatsayiOpen(false); success("Katsayı uygulandı"); }}>Uygula</Button>
            </div>
          </div>
        </div>
      )}

      <MahsuplasamaModal
        open={mahsupOpen}
        years={mahsupYears}
        styles={styles}
        onClose={() => setMahsupOpen(false)}
        onSave={(total) => {
          patch("settleAmount", formatMoney(total) as TForm["settleAmount"]);
          success("Mahsuplaşma tutarı uygulandı");
        }}
      />

      <CalculationPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} title={config.previewTitle} sections={previewSections} contentId="ht-preview" />
      <ConfirmDialog open={confirmNew} title="Yeni hesap?" description="Kaydedilmemiş değişiklikler silinecek." onConfirm={() => { setConfirmNew(false); setForm(config.createEmptyForm()); setActiveId(null); setActiveName(null); setBaseline(config.snapshotKey(config.createEmptyForm())); }} onCancel={() => setConfirmNew(false)} />
      <ConfirmDialog open={!!confirmDeleteId} title="Kaydı sil?" description="Bu işlem geri alınamaz." danger onConfirm={() => { if (confirmDeleteId) { config.storage.deleteCase(confirmDeleteId); if (activeId === confirmDeleteId) { setActiveId(null); setActiveName(null); } reloadCases(); setConfirmDeleteId(null); success("Silindi"); } }} onCancel={() => setConfirmDeleteId(null)} />
    </div>
  );
}
