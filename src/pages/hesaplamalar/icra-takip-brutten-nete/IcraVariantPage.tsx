import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FilePlus2, FolderOpen, Save, Trash2, X } from "lucide-react";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  calculateInterest,
  type InterestType,
} from "./lib/interestCalculator";
import { useDepositInterestRates } from "./lib/useDepositInterestRates";
import {
  computeDamgaOnly,
  computeNetFromGrossSingle,
  computeStandartBrutNetFromGross,
  formatMoney,
  hasTwoPeriods,
  parseNum,
  type SegmentedNetPanel,
} from "./lib/brutNet";
import {
  createEmptyForm,
  snapshotKey,
  type IcraForm,
  type IcraVariant,
  type SavedCase,
} from "./model";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";
import { InterestResultPanel } from "./InterestResultPanel";
import { fmtDateTR } from "./lib/format";
import pageStyles from "./IcraVariantPage.module.css";
import styles from "../kotu-niyet-tazminati/KotuNiyetTazminatiPage.module.css";

export type { IcraVariant };

type Props = {
  variant: IcraVariant;
  title: string;
  backTo?: string;
};

function computeBrutNet(
  variant: IcraVariant,
  gross: number,
  year: number,
  period: 1 | 2,
): SegmentedNetPanel | { gross: number; damgaVergisi: number; net: number } {
  if (gross <= 0) {
    return variant === "damga"
      ? { gross: 0, damgaVergisi: 0, net: 0 }
      : {
          gross: 0,
          sgk: 0,
          issizlik: 0,
          gelirVergisiBrut: 0,
          gelirVergisiIstisna: 0,
          gelirVergisi: 0,
          damgaVergisiBrut: 0,
          damgaVergisiIstisna: 0,
          damgaVergisi: 0,
          net: 0,
          gelirVergisiDilimleri: "",
        };
  }
  if (variant === "damga") return computeDamgaOnly(gross);
  if (variant === "istisnasiz-full") return computeStandartBrutNetFromGross(gross, year);
  return computeNetFromGrossSingle(gross, year, period);
}

function NameModal({
  open,
  initial,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
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
        <h3 className={styles.modalTitle}>Kaydı adlandır</h3>
        <label className={styles.label} htmlFor="icra-save-name">
          Kayıt adı
        </label>
        <input
          id="icra-save-name"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
          }}
        />
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

export default function IcraVariantPage({ variant, title, backTo = "/icra-takip-brutten-nete" }: Props) {
  const { success } = useToast();
  const [form, setForm] = useState<IcraForm>(createEmptyForm);
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

  const grossVal = parseNum(form.grossForNet);
  const twoPeriods = hasTwoPeriods(form.year);
  const brutNet = useMemo(
    () => computeBrutNet(variant, grossVal, form.year, form.period),
    [variant, grossVal, form.year, form.period],
  );
  const netTutar = "net" in brutNet ? brutNet.net : 0;

  const interestType: InterestType = form.faizTuru === "yasal" ? "LEGAL_INTEREST" : "HIGHEST_DEPOSIT_INTEREST";
  const depositEnabled = interestType === "HIGHEST_DEPOSIT_INTEREST";
  const {
    periods: depositInterestPeriods,
    loading: depositLoading,
    error: depositInterestError,
  } = useDepositInterestRates({
    enabled: depositEnabled,
    startDate: form.faizBaslangic,
    endDate: form.icraTakip,
    principal: netTutar,
  });

  const interestResult = useMemo(() => {
    if (netTutar <= 0 || !form.faizBaslangic || !form.icraTakip) return null;
    if (depositEnabled && depositInterestError) {
      return { ok: false as const, message: depositInterestError };
    }
    if (depositEnabled && depositLoading) return null;
    return calculateInterest({
      principal: netTutar,
      startDate: form.faizBaslangic,
      endDate: form.icraTakip,
      interestType,
      depositInterestRates: depositEnabled ? depositInterestPeriods : undefined,
    });
  }, [
    netTutar,
    form.faizBaslangic,
    form.icraTakip,
    interestType,
    depositEnabled,
    depositInterestPeriods,
    depositInterestError,
    depositLoading,
  ]);

  const isInterestOk = interestResult?.ok === true;
  const interestWarning = interestResult && !interestResult.ok ? interestResult.message : null;
  const totalInterest = isInterestOk ? interestResult.totalInterest : 0;
  const totalDays = isInterestOk ? interestResult.totalDays : 0;
  const takipToplami = isInterestOk ? netTutar + totalInterest : netTutar;
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(() => {
    const loaded = loadCasesSafe(variant);
    if (!loaded.ok) {
      setStorageError(loaded.reason);
      setCases([]);
      return;
    }
    setStorageError(null);
    setCases(loaded.items);
  }, [variant]);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  const applyCase = (c: SavedCase) => {
    setForm({ ...c.form });
    setActiveId(c.id);
    setActiveName(c.name);
    setBaseline(snapshotKey(c.form));
    setListOpen(false);
  };

  const resetForm = () => {
    const empty = createEmptyForm();
    setForm(empty);
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(empty));
  };

  const handleSave = (name: string) => {
    const results = { netTutar, totalInterest, takipToplami, totalDays };
    const saved = saveCase(variant, name, form, results, activeId);
    if (!saved) return;
    setActiveId(saved.id);
    setActiveName(saved.name);
    setBaseline(snapshotKey(form));
    setNameOpen(false);
    reloadCases();
    success("Kayıt kaydedildi.");
  };

  const previewSections = useMemo((): PreviewSection[] => {
    const kesintiRows: string[][] = [["Brüt alacak", `${formatMoney(grossVal)} ₺`]];
    if (variant !== "damga") {
      kesintiRows.push(["Yıl / dönem", `${form.year} / ${form.period}`]);
    }
    if (variant === "damga" && "damgaVergisi" in brutNet) {
      kesintiRows.push(["Damga vergisi (binde 7,59)", `-${formatMoney(brutNet.damgaVergisi)} ₺`]);
    }
    if ("sgk" in brutNet) {
      kesintiRows.push(
        ["SGK (%14)", `-${formatMoney(brutNet.sgk)} ₺`],
        ["İşsizlik (%1)", `-${formatMoney(brutNet.issizlik)} ₺`],
        [`Gelir vergisi ${brutNet.gelirVergisiDilimleri}`.trim(), `-${formatMoney(brutNet.gelirVergisi)} ₺`],
        ["Damga (binde 7,59)", `-${formatMoney(brutNet.damgaVergisi)} ₺`],
      );
    }
    kesintiRows.push(["Net tutar (anapara)", `${formatMoney(netTutar)} ₺`]);

    const sections: PreviewSection[] = [
      {
        id: "kesinti",
        title: "Brütten nete çevir",
        headers: ["Kalem", "Tutar"],
        rows: kesintiRows,
        lastRowTone: "green",
      },
      {
        id: "faiz-meta",
        title: "Faiz hesaplama verileri",
        headers: ["Kalem", "Değer"],
        rows: [
          ["Faiz başlangıç", fmtDateTR(form.faizBaslangic)],
          ["İcra takip", fmtDateTR(form.icraTakip)],
          [
            "Faiz türü",
            form.faizTuru === "yasal" ? "Yasal Faiz" : "Bankalarca Mevduatlara Uygulanan En Yüksek Faiz",
          ],
          ["Gün sayısı", isInterestOk ? `${totalDays} gün` : "—"],
        ],
      },
    ];

    if (isInterestOk && interestResult?.ok) {
      sections.push({
        id: "faiz-donemleri",
        title: "Faiz dönemleri",
        headers: ["Başlangıç", "Bitiş", "Gün", "Oran", "Faiz tutarı"],
        rows: interestResult.periods.map((p) => [
          fmtDateTR(p.startDate),
          fmtDateTR(p.endDate),
          String(p.days),
          `%${p.rate}`,
          `${formatMoney(p.interest)} ₺`,
        ]),
      });
      sections.push({
        id: "faiz-toplam",
        title: "Faiz toplamları",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Toplam faiz tutarı", `${formatMoney(totalInterest)} ₺`],
          ["Takip toplamı", `${formatMoney(takipToplami)} ₺`],
        ],
        lastRowTone: "blue",
      });
    }

    return sections;
  }, [
    brutNet,
    form,
    grossVal,
    interestResult,
    isInterestOk,
    netTutar,
    takipToplami,
    totalDays,
    totalInterest,
    variant,
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className={styles.helper}>
            <Link to={backTo}>← İcra Takip</Link>
          </p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.desc}>
            Brütten nete çevirme ve faiz hesabı. Yasal faiz ve bankalarca mevduatlara uygulanan en yüksek faiz (TCMB EVDS).
          </p>
          {storageError ? (
            <p className={styles.helper}>
              {storageError}{" "}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearCorruptCases(variant);
                  setStorageError(null);
                  reloadCases();
                }}
              >
                Bozuk kaydı temizle
              </Button>
            </p>
          ) : null}
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.fields}>
            <div>
              <label className={styles.label}>Brüt alacak</label>
              <input
                className={styles.input}
                value={form.grossForNet}
                onChange={(e) => setForm((f) => ({ ...f, grossForNet: e.target.value }))}
                placeholder="Brüt tutar"
              />
            </div>

            {variant !== "damga" ? (
              <>
                <div>
                  <label className={styles.label}>Gelir vergisi yılı</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={form.year}
                    onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) || f.year }))}
                  />
                </div>
                {twoPeriods ? (
                  <div className={styles.fields} style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <label className={styles.label}>
                      <input type="radio" checked={form.period === 1} onChange={() => setForm((f) => ({ ...f, period: 1 }))} /> 1.
                      dönem
                    </label>
                    <label className={styles.label}>
                      <input type="radio" checked={form.period === 2} onChange={() => setForm((f) => ({ ...f, period: 2 }))} /> 2.
                      dönem
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className={pageStyles.brutBreakdown}>
            <div className={pageStyles.breakdownRow}>
              <span className={pageStyles.breakdownLabel}>Brüt alacak tutarı</span>
              <span className={pageStyles.breakdownValue}>{formatMoney(grossVal)} ₺</span>
            </div>
            {variant === "damga" && "damgaVergisi" in brutNet ? (
              <div className={pageStyles.breakdownRow}>
                <span className={pageStyles.breakdownLabel}>Damga vergisi (binde 7,59)</span>
                <span className={`${pageStyles.breakdownValue} ${pageStyles.breakdownDeduction}`}>
                  -{formatMoney(brutNet.damgaVergisi)} ₺
                </span>
              </div>
            ) : null}
            {"sgk" in brutNet ? (
              <>
                <div className={pageStyles.breakdownRow}>
                  <span className={pageStyles.breakdownLabel}>SGK primi</span>
                  <span className={`${pageStyles.breakdownValue} ${pageStyles.breakdownDeduction}`}>
                    -{formatMoney(brutNet.sgk)} ₺
                  </span>
                </div>
                <div className={pageStyles.breakdownRow}>
                  <span className={pageStyles.breakdownLabel}>İşsizlik primi</span>
                  <span className={`${pageStyles.breakdownValue} ${pageStyles.breakdownDeduction}`}>
                    -{formatMoney(brutNet.issizlik)} ₺
                  </span>
                </div>
                <div className={pageStyles.breakdownRow}>
                  <span className={pageStyles.breakdownLabel}>Gelir vergisi</span>
                  <span className={`${pageStyles.breakdownValue} ${pageStyles.breakdownDeduction}`}>
                    -{formatMoney(brutNet.gelirVergisi)} ₺
                  </span>
                </div>
                <div className={pageStyles.breakdownRow}>
                  <span className={pageStyles.breakdownLabel}>Damga vergisi</span>
                  <span className={`${pageStyles.breakdownValue} ${pageStyles.breakdownDeduction}`}>
                    -{formatMoney(brutNet.damgaVergisi)} ₺
                  </span>
                </div>
              </>
            ) : null}
            <div className={pageStyles.breakdownRow}>
              <span className={pageStyles.breakdownLabel}>Net tutar (anapara)</span>
              <span className={`${pageStyles.breakdownValue} ${pageStyles.breakdownNet}`}>
                {formatMoney(netTutar)} ₺
              </span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Faiz</h2>
          </div>
          <div className={styles.fields}>
            <div>
              <label className={styles.label}>Faiz başlangıç</label>
              <input
                type="date"
                className={styles.input}
                value={form.faizBaslangic}
                onChange={(e) => setForm((f) => ({ ...f, faizBaslangic: e.target.value }))}
              />
            </div>
            <div>
              <label className={styles.label}>İcra takip tarihi</label>
              <input
                type="date"
                className={styles.input}
                value={form.icraTakip}
                onChange={(e) => setForm((f) => ({ ...f, icraTakip: e.target.value }))}
              />
            </div>
            <div className={styles.fields} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className={styles.label}>
                <input
                  type="radio"
                  checked={form.faizTuru === "yasal"}
                  onChange={() => setForm((f) => ({ ...f, faizTuru: "yasal" }))}
                />{" "}
                Yasal faiz
              </label>
              <label className={styles.label}>
                <input
                  type="radio"
                  checked={form.faizTuru === "en_yuksek_mevduat"}
                  onChange={() => setForm((f) => ({ ...f, faizTuru: "en_yuksek_mevduat" }))}
                />{" "}
                En yüksek mevduat faizi
              </label>
            </div>
          </div>
          {form.faizTuru === "en_yuksek_mevduat" ? (
            <p className={styles.note}>
              Faiz oranları{" "}
              <span style={{ fontFamily: "monospace" }}>evds3.tcmb.gov.tr</span> güncel verilerinden alınır.
            </p>
          ) : null}
          {depositLoading ? <p className={styles.helper}>Mevduat faiz oranları yükleniyor…</p> : null}
          {interestWarning ? <p className={styles.helper}>{interestWarning}</p> : null}
          {isInterestOk && interestResult?.ok ? (
            <div className={styles.resultCard} style={{ marginTop: "0.85rem" }}>
              <div className={styles.helper}>
                Faiz gün: {totalDays} · Faiz: {formatMoney(totalInterest)} ₺
              </div>
              <div className={styles.resultLabel}>Takip toplamı</div>
              <div className={styles.resultValue}>{formatMoney(takipToplami)} ₺</div>
            </div>
          ) : null}
        </section>
      </div>

      {isInterestOk && interestResult?.ok ? (
        <InterestResultPanel
          variant={variant}
          grossVal={grossVal}
          brutNet={brutNet}
          faizBaslangic={form.faizBaslangic}
          icraTakip={form.icraTakip}
          faizTuru={form.faizTuru}
          interestResult={interestResult}
          totalInterest={totalInterest}
          takipToplami={takipToplami}
        />
      ) : null}

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}>
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? `Kayıt: ${activeName}` : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} /> Aç
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={() => setPreviewOpen(true)} disabled={grossVal <= 0}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => (dirty ? setConfirmNew(true) : resetForm())}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
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

      <NameModal open={nameOpen} initial={activeName ?? title} onClose={() => setNameOpen(false)} onConfirm={handleSave} />

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
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net {formatMoney(c.results.netTutar)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => applyCase(c)}>
                        Aç
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="icon"
                        aria-label="Sil"
                        onClick={() => setConfirmDeleteId(c.id)}
                      >
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
            deleteCase(variant, confirmDeleteId);
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
        title={`${title} — Önizleme`}
        sections={previewSections}
        contentId={`icra-${variant}-preview`}
      />
    </div>
  );
}
