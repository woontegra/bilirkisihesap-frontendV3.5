import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Download, Eye, FilePlus2, FolderOpen, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  applyExtraSetItemsAsExtrasList,
  collectExtrasOnlyItems,
  tryMergeLegacyExtraSets,
} from "@/lib/localExtraSetsHelpers";
import {
  deleteLocalExtraSet,
  listLocalExtraSets,
  type LocalExtraSet,
  upsertLocalExtraSet,
} from "@/lib/localExtraSetsStore";
import {
  calculateRemainingDays,
  calculateRemainingLabel,
  calcWorkPeriodBilirKisi,
  computeBakiyeUcret,
  computeEklentiResult,
  formatDateTR,
  formatMoney,
  parseNum,
  validateAsgariByResignDate,
  type MonthRow,
} from "./engine";
import {
  calculateSegmentedNetFromRows,
  computeGrossFromNetSingle,
  computeNetFromGrossSingle,
  computeNetFromPeriodBrut,
  round2,
  type SegmentedNetResult,
} from "./netSegmented";
import { createEmptyForm, newLocalId, NOTE_TEXT, snapshotKey, type BakiyeForm, type SavedCase } from "./model";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";
import styles from "../kotu-niyet-tazminati/KotuNiyetTazminatiPage.module.css";

const EXTRA_SETS_MODULE_ID = "bakiye-ucret-alacagi";

function NameModal({
  open,
  initial,
  title = "Kaydı adlandır",
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  title?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

function NetBreakdown({ data, title }: { data: SegmentedNetResult & { gross?: number }; title: string }) {
  const gross = data.gross ?? data.totalGross;
  return (
    <div className={styles.fields} style={{ marginTop: "0.5rem", gap: "0.25rem" }}>
      <p className={styles.label} style={{ fontWeight: 600 }}>
        {title}
      </p>
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Brüt</span>
        <span>{formatMoney(gross)} ₺</span>
      </p>
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>SGK (%14)</span>
        <span>−{formatMoney(data.totalSgk)} ₺</span>
      </p>
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>İşsizlik (%1)</span>
        <span>−{formatMoney(data.totalIssizlik)} ₺</span>
      </p>
      {(data.totalGelirVergisiIstisna ?? 0) > 0 ? (
        <>
          <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>GV brüt</span>
            <span>−{formatMoney(data.totalGelirVergisiBrut)} ₺</span>
          </p>
          <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>GV istisna</span>
            <span>+{formatMoney(data.totalGelirVergisiIstisna)} ₺</span>
          </p>
        </>
      ) : null}
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>GV {data.gelirVergisiDilimleri || ""}</span>
        <span>−{formatMoney(data.totalGelirVergisi)} ₺</span>
      </p>
      {(data.totalDamgaVergisiIstisna ?? 0) > 0 ? (
        <>
          <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Damga brüt</span>
            <span>−{formatMoney(data.totalDamgaVergisiBrut)} ₺</span>
          </p>
          <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Damga istisna</span>
            <span>+{formatMoney(data.totalDamgaVergisiIstisna)} ₺</span>
          </p>
        </>
      ) : null}
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Damga</span>
        <span>−{formatMoney(data.totalDamgaVergisi)} ₺</span>
      </p>
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
        <span>Net</span>
        <span>{formatMoney(data.totalNet)} ₺</span>
      </p>
    </div>
  );
}

export default function BakiyeUcretAlacagiPage() {
  const { success, error: showError } = useToast();
  const [form, setForm] = useState<BakiyeForm>(createEmptyForm);
  const [grossForNet, setGrossForNet] = useState("");
  const [netForGross, setNetForGross] = useState("");
  const lastSyncedTotal = useRef<number | null>(null);
  const [editingGross, setEditingGross] = useState<Record<number, string>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<number, { gross: number; net: number }>>({});
  const [eklentiFor, setEklentiFor] = useState<string | null>(null);
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});
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
  const [extraSaveOpen, setExtraSaveOpen] = useState(false);
  const [extraImportOpen, setExtraImportOpen] = useState(false);
  const [savedExtraSets, setSavedExtraSets] = useState<LocalExtraSet[]>([]);

  const refreshExtraSets = useCallback(() => {
    setSavedExtraSets(listLocalExtraSets(EXTRA_SETS_MODULE_ID));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const merged = await tryMergeLegacyExtraSets(EXTRA_SETS_MODULE_ID);
      if (cancelled) return;
      if (merged && merged.imported > 0) {
        success(`${merged.imported} eski ekstra set yerel depoya alındı`);
      }
      refreshExtraSets();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshExtraSets, success]);

  const hasExtraSetData = form.extras.some((e) => String(e.value ?? "").trim() !== "");

  const openExtraImport = () => {
    refreshExtraSets();
    setExtraImportOpen(true);
  };

  const persistExtraSet = (name: string) => {
    try {
      const items = collectExtrasOnlyItems(form.extras);
      upsertLocalExtraSet(EXTRA_SETS_MODULE_ID, name, items);
      refreshExtraSets();
      setExtraSaveOpen(false);
      success("Ekstra hesaplamalar kaydedildi");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  };

  const importExtraSet = (set: LocalExtraSet) => {
    setForm((f) => ({ ...f, extras: applyExtraSetItemsAsExtrasList(set.data) }));
    setExtraImportOpen(false);
    success("Ekstra hesaplamalar yüklendi");
  };

  const removeExtraSet = (id: string) => {
    deleteLocalExtraSet(EXTRA_SETS_MODULE_ID, id);
    refreshExtraSets();
    success("Set silindi");
  };

  const rescanLegacy = async () => {
    const merged = await tryMergeLegacyExtraSets(EXTRA_SETS_MODULE_ID, { force: true });
    refreshExtraSets();
    if (!merged) {
      success("Yerel setler kullanılıyor (sunucu setleri alınamadı)");
      return;
    }
    success(
      merged.imported > 0
        ? `${merged.imported} set eklendi (${merged.skipped} atlandı)`
        : `Yeni set yok (${merged.skipped} atlandı)`,
    );
  };

  const monthly = useMemo(() => {
    const base = parseNum(form.brut);
    const extras = form.extras.reduce((a, e) => a + parseNum(e.value), 0);
    return base + extras;
  }, [form]);

  const result = useMemo(() => {
    if (!form.startDate || !form.endDate || !form.resignDate || monthly <= 0) return null;
    return computeBakiyeUcret({
      startDate: form.startDate,
      endDate: form.endDate,
      resignDate: form.resignDate,
      monthly,
    });
  }, [form, monthly]);

  useEffect(() => {
    setRowOverrides({});
    setEditingGross({});
  }, [result?.totalAmount, result?.monthRows.length]);

  useEffect(() => {
    if (!result || result.error || !result.monthRows.length) return;
    const total = result.totalAmount;
    if (lastSyncedTotal.current === total) return;
    lastSyncedTotal.current = total;
    setGrossForNet(formatMoney(total));
  }, [result]);

  const displayMonthRows: MonthRow[] = useMemo(() => {
    if (!result?.monthRows) return [];
    return result.monthRows.map((mr, i) => {
      const ov = rowOverrides[i];
      return ov ? { ...mr, gross: ov.gross, net: ov.net } : mr;
    });
  }, [result, rowOverrides]);

  const displayTotal = useMemo(
    () => round2(displayMonthRows.reduce((a, b) => a + b.gross, 0)),
    [displayMonthRows],
  );

  const asgariErr = validateAsgariByResignDate(form.resignDate, parseNum(form.brut));
  const remainingDays = calculateRemainingDays(form.resignDate, form.endDate);
  const remainingLabel = calculateRemainingLabel(form.resignDate, form.endDate);
  const workPeriod = useMemo(() => {
    if (!form.startDate || !form.endDate) return null;
    const wp = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
    return wp.label ? wp : null;
  }, [form.startDate, form.endDate]);
  const selectedYear = form.resignDate ? new Date(form.resignDate).getFullYear() : new Date().getFullYear();
  const dirty = snapshotKey(form) !== baseline;

  const grossVal = parseNum(grossForNet);
  const netPanel = useMemo((): (SegmentedNetResult & { gross?: number }) | null => {
    if (grossVal <= 0) return null;
    const totalFromRows = displayTotal;
    if (displayMonthRows.length && Math.abs(grossVal - totalFromRows) < 1) {
      const rows = displayMonthRows.map((mr) => {
        const ucret = mr.days > 0 ? (mr.gross * 30) / mr.days : monthly;
        return {
          ucret,
          katsayi: 1,
          gunSayisi: mr.days,
          ayGunSayisi: 30,
          startISO: mr.start,
          odenenUcret: 0,
        };
      });
      return calculateSegmentedNetFromRows(rows);
    }
    return computeNetFromGrossSingle(grossVal, selectedYear);
  }, [grossVal, displayMonthRows, displayTotal, monthly, selectedYear]);

  const netVal = parseNum(netForGross);
  const grossFromNet = useMemo(() => {
    if (netVal <= 0) return null;
    if (netPanel && netPanel.totalNet > 0 && Math.abs(netVal - netPanel.totalNet) < 1) {
      return { ...netPanel, gross: netPanel.totalGross };
    }
    return computeGrossFromNetSingle(netVal, selectedYear);
  }, [netVal, selectedYear, netPanel]);

  const eklentiPreview = eklentiFor
    ? computeEklentiResult(eklentiMonths[eklentiFor] ?? Array(12).fill(""))
    : 0;

  const reloadCases = useCallback(() => {
    const loaded = loadCasesSafe();
    if (!loaded.ok) {
      setStorageError(loaded.reason);
      setCases([]);
      return;
    }
    setStorageError(null);
    setCases(loaded.items);
  }, []);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  const resetForm = () => {
    const empty = createEmptyForm();
    setForm(empty);
    setGrossForNet("");
    setNetForGross("");
    lastSyncedTotal.current = null;
    setRowOverrides({});
    setEditingGross({});
    setEklentiFor(null);
    setEklentiMonths({});
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(empty));
  };

  const applyCase = (c: SavedCase) => {
    setForm({ ...c.form });
    setActiveId(c.id);
    setActiveName(c.name);
    setBaseline(snapshotKey(c.form));
    lastSyncedTotal.current = null;
    setListOpen(false);
  };

  const handleSave = (name: string) => {
    if (!result || result.error) return;
    const results = {
      rows: result.rows,
      monthRows: displayMonthRows,
      totalAmount: displayTotal || result.totalAmount,
      monthly,
    };
    const saved = saveCase(name, form, results, activeId);
    if (!saved) return;
    setActiveId(saved.id);
    setActiveName(saved.name);
    setBaseline(snapshotKey(form));
    setNameOpen(false);
    reloadCases();
    success("Kayıt kaydedildi.");
  };

  const openEklenti = (itemId: string) => {
    setEklentiMonths((prev) => (prev[itemId] ? prev : { ...prev, [itemId]: Array(12).fill("") }));
    setEklentiFor(itemId);
  };

  const applyEklenti = () => {
    if (!eklentiFor) return;
    const months = eklentiMonths[eklentiFor] ?? Array(12).fill("");
    const value = computeEklentiResult(months) || 0;
    setForm((f) => ({
      ...f,
      extras: f.extras.map((e) => (e.id === eklentiFor ? { ...e, value: formatMoney(value) } : e)),
    }));
    setEklentiFor(null);
  };

  const handleMonthGrossBlur = (index: number) => {
    const raw = editingGross[index];
    if (raw === undefined) return;
    setEditingGross((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    const parsed = parseNum(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const mr = displayMonthRows[index] ?? result?.monthRows[index];
    if (!mr) return;
    const monthlyEquiv = mr.days > 0 ? (parsed * 30) / mr.days : parsed;
    const net = round2(computeNetFromPeriodBrut(monthlyEquiv, mr.days, mr.start));
    setRowOverrides((prev) => ({ ...prev, [index]: { gross: round2(parsed), net } }));
    const newTotal = round2(
      (result?.monthRows ?? []).reduce((a, b, i) => {
        if (i === index) return a + parsed;
        return a + (rowOverrides[i]?.gross ?? b.gross);
      }, 0),
    );
    setGrossForNet(formatMoney(newTotal));
  };

  const previewSections = useMemo((): PreviewSection[] => {
    if (!displayMonthRows.length) return [];
    const extraRows = form.extras
      .filter((e) => e.label.trim() || parseNum(e.value) > 0)
      .map((e) => [e.label || "Kalem", `${formatMoney(parseNum(e.value))} ₺`]);
    const sections: PreviewSection[] = [
      {
        id: "cetvel",
        title: "Bakiye cetveli",
        headers: ["Dönem", "Gün", "Brüt", "Net"],
        rows: displayMonthRows.map((mr) => [
          `${formatDateTR(mr.start)} – ${formatDateTR(mr.end)}`,
          String(mr.days),
          `${formatMoney(mr.gross)} ₺`,
          `${formatMoney(mr.net)} ₺`,
        ]),
        lastRowTone: "blue",
      },
      {
        id: "ozet",
        title: "Özet",
        headers: ["Kalem", "Değer"],
        rows: [
          ["Çıplak brüt", `${formatMoney(parseNum(form.brut))} ₺`],
          ...extraRows,
          ["Aylık toplam", `${formatMoney(monthly)} ₺`],
          ["Toplam brüt", `${formatMoney(displayTotal)} ₺`],
          ["Kalan gün", String(remainingDays)],
          ...(remainingLabel ? [["Kalan süre", remainingLabel] as [string, string]] : []),
        ],
        lastRowTone: "green",
      },
    ];
    if (netPanel) {
      sections.push({
        id: "net",
        title: "Brütten nete",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Brüt", `${formatMoney(netPanel.totalGross)} ₺`],
          ["SGK", `−${formatMoney(netPanel.totalSgk)} ₺`],
          ["İşsizlik", `−${formatMoney(netPanel.totalIssizlik)} ₺`],
          ["GV brüt", `−${formatMoney(netPanel.totalGelirVergisiBrut)} ₺`],
          ["GV istisna", `+${formatMoney(netPanel.totalGelirVergisiIstisna)} ₺`],
          ["GV", `−${formatMoney(netPanel.totalGelirVergisi)} ₺`],
          ["Damga brüt", `−${formatMoney(netPanel.totalDamgaVergisiBrut)} ₺`],
          ["Damga istisna", `+${formatMoney(netPanel.totalDamgaVergisiIstisna)} ₺`],
          ["Damga", `−${formatMoney(netPanel.totalDamgaVergisi)} ₺`],
          ["Net", `${formatMoney(netPanel.totalNet)} ₺`],
        ],
        lastRowTone: "green",
      });
    }
    return sections;
  }, [displayMonthRows, displayTotal, form, monthly, remainingDays, remainingLabel, netPanel]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className={styles.title}>Bakiye Ücret Alacağı</h1>
          <p className={styles.desc}>
            <Calculator size={14} style={{ verticalAlign: "-2px", marginRight: "0.25rem" }} />
            Fesih sonrası kalan süre — ay bölme + istisnalı brütten nete.
          </p>
          {storageError ? (
            <p className={styles.helper}>
              {storageError}{" "}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearCorruptCases();
                  setStorageError(null);
                  reloadCases();
                }}
              >
                Temizle
              </Button>
            </p>
          ) : null}
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.fields}>
            <div>
              <label className={styles.label}>Çalışma dönemi başlangıcı</label>
              <input
                type="date"
                className={styles.input}
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className={styles.label}>Çalışma dönemi sonu</label>
              <input
                type="date"
                className={styles.input}
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            {workPeriod ? (
              <p className={styles.helper}>
                Çalışma süresi: {workPeriod.label}
              </p>
            ) : null}
            <div>
              <label className={styles.label}>İş Akdinin Fesih Edildiği Tarih</label>
              <input
                type="date"
                className={styles.input}
                value={form.resignDate}
                onChange={(e) => setForm((f) => ({ ...f, resignDate: e.target.value }))}
              />
            </div>
            <div>
              <label className={styles.label}>Kalan Süre</label>
              <p className={styles.helper}>
                {remainingDays > 0
                  ? `${remainingDays} gün${remainingLabel ? ` (${remainingLabel})` : ""}`
                  : "—"}
              </p>
            </div>
            <div>
              <label className={styles.label}>Çıplak Brüt Ücret</label>
              <input
                className={styles.input}
                value={form.brut}
                onChange={(e) => setForm((f) => ({ ...f, brut: e.target.value }))}
                placeholder="25.000,00"
              />
              {asgariErr ? <p className={styles.helper}>{asgariErr}</p> : null}
            </div>

            <div>
              <div className={styles.cardTitleRow} style={{ marginBottom: "0.35rem" }}>
                <label className={styles.label} style={{ margin: 0 }}>
                  Ekstra Hesaplamalar (Prim, İkramiye, Yol, Yemek vb.)
                </label>
                <div className={styles.inlineActions}>
                  <Button type="button" variant="soft" size="sm" onClick={openExtraImport}>
                    <Download size={14} /> İçe Aktar
                  </Button>
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    onClick={() => setExtraSaveOpen(true)}
                    disabled={!hasExtraSetData}
                  >
                    <Save size={14} /> Kaydet
                  </Button>
                </div>
              </div>
              <div className={styles.fields} style={{ gap: "0.4rem", marginTop: "0.35rem" }}>
                {form.extras.map((it) => (
                  <div
                    key={it.id}
                    style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}
                  >
                    <input
                      className={styles.input}
                      style={{ flex: "1 1 6rem", minWidth: "5rem" }}
                      value={it.label}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          extras: f.extras.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)),
                        }))
                      }
                      placeholder="Kalem adı"
                    />
                    <input
                      className={styles.input}
                      style={{ flex: "1 1 6rem", minWidth: "5rem" }}
                      value={it.value}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          extras: f.extras.map((x) => (x.id === it.id ? { ...x, value: e.target.value } : x)),
                        }))
                      }
                      placeholder="0,00"
                    />
                    <Button type="button" variant="soft" size="sm" onClick={() => openEklenti(it.id)}>
                      <Calculator size={13} /> Eklenti Hesapla
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Sil"
                      onClick={() => setForm((f) => ({ ...f, extras: f.extras.filter((x) => x.id !== it.id) }))}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      extras: [...f.extras, { id: newLocalId("extra"), label: "Ek Kalem", value: "" }],
                    }))
                  }
                >
                  <Plus size={14} /> Kalem
                </Button>
              </div>
              <p className={styles.helper} style={{ marginTop: "0.4rem" }}>
                Aylık toplam: {formatMoney(monthly)} ₺
              </p>
            </div>
            <p className={styles.note}>{NOTE_TEXT}</p>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Bakiye cetveli</h2>
          </div>
          {result?.error ? <p className={styles.helper}>{result.error}</p> : null}
          {displayMonthRows.length ? (
            <>
              <div className={styles.resultCard}>
                <div className={styles.resultLabel}>Toplam brüt</div>
                <div className={styles.resultValue}>{formatMoney(displayTotal)} ₺</div>
              </div>
              <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left">Dönem</th>
                      <th align="right">Gün</th>
                      <th align="right">Brüt</th>
                      <th align="right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMonthRows.map((mr, i) => (
                      <tr key={i}>
                        <td>
                          {formatDateTR(mr.start)} – {formatDateTR(mr.end)}
                        </td>
                        <td align="right">{mr.days}</td>
                        <td align="right">
                          <input
                            className={styles.input}
                            style={{ width: "6.5rem", textAlign: "right", padding: "0.2rem 0.35rem" }}
                            value={editingGross[i] ?? formatMoney(mr.gross)}
                            onChange={(e) => setEditingGross((prev) => ({ ...prev, [i]: e.target.value }))}
                            onBlur={() => handleMonthGrossBlur(i)}
                            onFocus={() =>
                              setEditingGross((prev) =>
                                prev[i] === undefined ? { ...prev, [i]: formatMoney(mr.gross) } : prev,
                              )
                            }
                          />
                        </td>
                        <td align="right">{formatMoney(mr.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className={styles.helper}>Tarihleri ve ücreti girin.</p>
          )}

          <div className={styles.fields} style={{ marginTop: "0.85rem" }}>
            <div>
              <label className={styles.label}>Brütten Nete Çevir</label>
              <input
                className={styles.input}
                value={grossForNet}
                onChange={(e) => setGrossForNet(e.target.value)}
                placeholder={result ? formatMoney(result.totalAmount) : ""}
              />
              {netPanel ? <NetBreakdown data={netPanel} title="Brütten nete dökümü" /> : null}
            </div>
            <div>
              <label className={styles.label}>Netten Brüte Çevir</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                <input
                  className={styles.input}
                  style={{ flex: 1, minWidth: "8rem" }}
                  value={netForGross}
                  onChange={(e) => setNetForGross(e.target.value)}
                />
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  disabled={!netPanel || netPanel.totalNet <= 0}
                  onClick={() => netPanel && setNetForGross(formatMoney(netPanel.totalNet))}
                >
                  Sol panelin netini kullan
                </Button>
              </div>
              {grossFromNet ? <NetBreakdown data={grossFromNet} title="Netten brüte dökümü" /> : null}
            </div>
          </div>
        </section>
      </div>

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}>
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? `Kayıt: ${activeName}` : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} /> Aç
            </Button>
            <Button
              type="button"
              variant="soft"
              size="sm"
              disabled={!result || !!result.error || !displayMonthRows.length}
              onClick={() => setPreviewOpen(true)}
            >
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => (dirty ? setConfirmNew(true) : resetForm())}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!result || !!result.error}
              onClick={() => {
                if (activeId && activeName) handleSave(activeName);
                else setNameOpen(true);
              }}
            >
              <Save size={14} /> {activeId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal open={nameOpen} initial={activeName ?? "Bakiye Ücret"} onClose={() => setNameOpen(false)} onConfirm={handleSave} />

      <NameModal
        open={extraSaveOpen}
        initial=""
        title="Ekstra Hesaplamaları Kaydet"
        onClose={() => setExtraSaveOpen(false)}
        onConfirm={persistExtraSet}
      />

      {extraImportOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setExtraImportOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <h3 className={styles.modalTitle}>Kaydedilmiş Setleri İçe Aktar</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => void rescanLegacy()} title="Sunucudaki eski setleri yeniden tara">
                <RefreshCw size={14} /> Yeniden tara
              </Button>
            </div>
            {savedExtraSets.length === 0 ? (
              <p className={styles.helper}>
                Kaydedilmiş set yok. Ekstra Hesaplamalar bölümündeki “Kaydet” ile mevcut kalemleri saklayabilirsiniz.
              </p>
            ) : (
              <ul className={styles.setList}>
                {savedExtraSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.data.length} kalem</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button type="button" variant="soft" size="sm" onClick={() => importExtraSet(set)}>
                        <Download size={13} /> İçe aktar
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => removeExtraSet(set.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button type="button" variant="soft" size="sm" onClick={() => setExtraImportOpen(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {eklentiFor ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setEklentiFor(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Eklenti hesaplama</h3>
            <p className={styles.helper}>Son 12 aylık bordro tutarlarını girin. Formül: (toplam / 360) × 30</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(7rem, 1fr))",
                gap: "0.5rem",
                marginTop: "0.75rem",
              }}
            >
              {(eklentiMonths[eklentiFor] ?? Array(12).fill("")).map((value, index) => (
                <label key={index} className={styles.label}>
                  {index + 1}. ay
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEklentiMonths((prev) => ({
                        ...prev,
                        [eklentiFor]: (prev[eklentiFor] ?? Array(12).fill("")).map((m, i) => (i === index ? v : m)),
                      }));
                    }}
                    placeholder="1.250,00"
                  />
                </label>
              ))}
            </div>
            <p className={styles.helper} style={{ marginTop: "0.5rem" }}>
              Sonuç: <strong>{formatMoney(eklentiPreview)} ₺</strong>
            </p>
            <div className={styles.modalActions}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEklentiFor(null)}>
                İptal
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={applyEklenti}>
                Uygula
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setListOpen(false)} aria-label="Kapat">
                <X size={16} />
              </Button>
            </div>
            {cases.length === 0 ? (
              <p className={styles.helper}>Henüz kayıt yok.</p>
            ) : (
              <div className={styles.caseList}>
                {cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.savedAt).toLocaleString("tr-TR")} · {formatMoney(c.results.totalAmount)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => applyCase(c)}>
                        Aç
                      </Button>
                      <Button type="button" variant="danger" size="icon" aria-label="Sil" onClick={() => setConfirmDeleteId(c.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmNew}
        title="Yeni hesaplama"
        description="Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={() => {
          setConfirmNew(false);
          resetForm();
        }}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={() => {
          if (confirmDeleteId) {
            deleteCase(confirmDeleteId);
            if (activeId === confirmDeleteId) resetForm();
            reloadCases();
            success("Kayıt silindi.");
          }
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <CalculationPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Bakiye Ücret Alacağı — Önizleme"
        sections={previewSections}
        contentId="bakiye-ucret-preview"
      />
    </div>
  );
}
