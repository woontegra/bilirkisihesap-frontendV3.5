/**
 * Yıllık Ücretli İzin — standart varyantlar için paylaşılan sunum bileşeni.
 * Yalnızca yillik-izin modülü içinde paylaşılır; iş mantığı içermez.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  collectExclusionSetItems,
  exclusionItemsToUsedRows,
  tryMergeLegacyExclusionSets,
} from "@/lib/localExclusionSetsHelpers";
import {
  deleteLocalExclusionSet,
  listLocalExclusionSets,
  upsertLocalExclusionSet,
  type LocalExclusionSet,
} from "@/lib/localExclusionSetsStore";
import { createInitialUsedRows } from "./core";
import { formatMoney } from "./money";
import type { CaseListEntry, EntitlementLine, NoteBlock, UsedLeaveRow } from "./types";
import styles from "./YillikPageView.module.css";

export function FlashValue({ value, className }: { value: string; className?: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 450);
      return () => window.clearTimeout(t);
    }
  }, [value]);
  return <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>;
}

export function AnimatedMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const reduce =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = display;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 380;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  return <>{formatMoney(display)}</>;
}

function NameModal({
  open,
  initial,
  title = "Kaydı adlandır",
  fieldLabel = "Kayıt adı",
  inputId = "yillik-save-name",
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  title?: string;
  fieldLabel?: string;
  inputId?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <label className={styles.label} htmlFor={inputId}>
          {fieldLabel}
        </label>
        <input
          id={inputId}
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            İptal
          </Button>
          <Button type="button" variant="primary" onClick={() => onConfirm(name)}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { EntitlementLine } from "./types";

export type YillikPageViewProps = {
  icon: LucideIcon;
  pageTitle: string;
  pageDescription: string;
  previewTitle: string;
  previewContentId?: string;
  notes: NoteBlock[];

  startDate: string;
  endDate: string;
  workPeriodLabel: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onDateBlur: () => void;
  dateError: string | null;

  extraDateField?: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    helper?: string;
    resultLabel: string;
    resultValue: string;
  };

  /** Tarih kartının üstüne (ör. Gazeteci türü select). */
  headerControls?: ReactNode;
  /** Varsa birincil işe giriş/çıkış alanlarının yerine render edilir (çoklu dönem). */
  workPeriodsSlot?: ReactNode;

  brut: string;
  onBrutChange: (v: string) => void;
  asgariUcretHatasi: string | null;

  show18Or50?: boolean;
  is18Or50?: boolean;
  on18Or50Change?: (v: boolean) => void;
  showUnderground?: boolean;
  isUnderground?: boolean;
  onUndergroundChange?: (v: boolean) => void;

  usedRows: UsedLeaveRow[];
  onAddUsedRow: () => void;
  onUpdateUsedRow: (id: string, patch: Partial<UsedLeaveRow>) => void;
  onRemoveUsedRow: (id: string) => void;
  /** Kullanılan izin setlerini yerel depoya kaydet / içe aktar (V3 exclusionStorage parity). */
  onReplaceUsedRows?: (rows: UsedLeaveRow[]) => void;
  usedLeaveSetsModuleId?: string;
  /** false → kullanılan izin tablosu gizlenir (ör. tek sayı alanı kullanan eski gemi). */
  showUsedLeaveTable?: boolean;

  entitlementLines: EntitlementLine[];
  totalEntitlementLabel: string;
  usedTotal: number;
  remainingDays: number;
  formulaText: string;

  brutIzin: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netIzin: number;
  /** V3 employerPayment — davalı mahsup ödemesi */
  employerPayment?: string;
  onEmployerPaymentChange?: (v: string) => void;

  extraCard?: ReactNode;

  dirty: boolean;
  activeName: string | null;
  isUpdate: boolean;
  storageError: string | null;
  onClearStorageError: () => void;
  cases: CaseListEntry[];
  nameOpen: boolean;
  setNameOpen: (v: boolean) => void;
  listOpen: boolean;
  setListOpen: (v: boolean) => void;
  previewOpen: boolean;
  setPreviewOpen: (v: boolean) => void;
  confirmNew: boolean;
  setConfirmNew: (v: boolean) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (v: string | null) => void;
  onNewClick: () => void;
  onConfirmNew: () => void;
  onSaveClick: () => void;
  onPersist: (name: string) => void;
  onOpenCase: (id: string) => void;
  onConfirmDelete: () => void;
  previewSections: PreviewSection[];
};

export function YillikPageView(props: YillikPageViewProps) {
  const Icon = props.icon;
  const { success, error: showError } = useToast();
  const usedLeaveSetsModuleId = props.usedLeaveSetsModuleId ?? "yillik-izin-used-leave";
  const showUsedLeaveTable = props.showUsedLeaveTable !== false;
  const [usedSaveOpen, setUsedSaveOpen] = useState(false);
  const [usedImportOpen, setUsedImportOpen] = useState(false);
  const [savedUsedSets, setSavedUsedSets] = useState<LocalExclusionSet[]>([]);

  const refreshUsedSets = useCallback(() => {
    setSavedUsedSets(listLocalExclusionSets(usedLeaveSetsModuleId));
  }, [usedLeaveSetsModuleId]);

  useEffect(() => {
    if (!showUsedLeaveTable || !props.onReplaceUsedRows) return;
    let cancelled = false;
    void (async () => {
      const merged = await tryMergeLegacyExclusionSets(usedLeaveSetsModuleId);
      if (cancelled) return;
      if (merged && merged.imported > 0) {
        success(`${merged.imported} eski kullanılan-izin seti yerel depoya alındı`);
      }
      refreshUsedSets();
    })();
    return () => {
      cancelled = true;
    };
  }, [showUsedLeaveTable, props.onReplaceUsedRows, usedLeaveSetsModuleId, refreshUsedSets, success]);

  const hasUsedLeaveData = props.usedRows.some((r) => r.start && r.end);
  const hasAnyUsedLeaveContent = props.usedRows.some((r) => r.start || r.end || r.days);

  const persistUsedSet = (name: string) => {
    try {
      const items = collectExclusionSetItems(props.usedRows);
      upsertLocalExclusionSet(usedLeaveSetsModuleId, name, items);
      refreshUsedSets();
      setUsedSaveOpen(false);
      success("Kullanılan izinler kaydedildi");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  };

  const openUsedImport = () => {
    refreshUsedSets();
    setUsedImportOpen(true);
  };

  const importUsedSet = (set: LocalExclusionSet) => {
    if (!props.onReplaceUsedRows) return;
    props.onReplaceUsedRows(exclusionItemsToUsedRows(set.data, 7));
    setUsedImportOpen(false);
    success(`"${set.name}" içe aktarıldı`);
  };

  const removeUsedSet = (id: string) => {
    deleteLocalExclusionSet(usedLeaveSetsModuleId, id);
    refreshUsedSets();
    success("Set silindi");
  };

  const rescanLegacyUsed = async () => {
    const merged = await tryMergeLegacyExclusionSets(usedLeaveSetsModuleId, { force: true });
    refreshUsedSets();
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

  const clearAllUsedRows = () => {
    if (!props.onReplaceUsedRows) return;
    props.onReplaceUsedRows(createInitialUsedRows(7));
    success("Kullanılan izin satırları temizlendi");
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden>
          <Icon size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className={styles.title}>{props.pageTitle}</h1>
          <p className={styles.desc}>{props.pageDescription}</p>
          <div className={styles.privacyBadge}>
            <ShieldCheck size={12} /> %100 lokal · ağ isteği yok
          </div>
          {props.activeName ? <div className={styles.recordBadge}>Kayıt: {props.activeName}</div> : null}
        </div>
      </header>

      {props.storageError ? (
        <div className={styles.storageBanner}>
          {props.storageError}{" "}
          <Button type="button" variant="ghost" size="sm" onClick={props.onClearStorageError}>
            Temizle
          </Button>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Tarih bilgileri</h2>
            </div>
            {props.headerControls ? <div className={styles.headerControls}>{props.headerControls}</div> : null}
            {props.workPeriodsSlot ? (
              <>
                {props.workPeriodsSlot}
                <div className={styles.field} style={{ marginTop: "0.65rem" }}>
                  <span className={styles.label}>Çalışma süresi (ilk giriş — son çıkış)</span>
                  <div className={styles.readonlyBox}>
                    <FlashValue value={props.workPeriodLabel || "—"} />
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.fields3}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="yillik-start">
                    İşe giriş
                  </label>
                  <input
                    id="yillik-start"
                    type="date"
                    max="9999-12-31"
                    className={`${styles.input} ${props.dateError ? styles.inputError : ""}`}
                    value={props.startDate}
                    onChange={(e) => props.onStartDateChange(e.target.value)}
                    onBlur={props.onDateBlur}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="yillik-end">
                    İşten çıkış
                  </label>
                  <input
                    id="yillik-end"
                    type="date"
                    max="9999-12-31"
                    className={`${styles.input} ${props.dateError ? styles.inputError : ""}`}
                    value={props.endDate}
                    onChange={(e) => props.onEndDateChange(e.target.value)}
                    onBlur={props.onDateBlur}
                  />
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Çalışma süresi</span>
                  <div className={styles.readonlyBox}>
                    <FlashValue value={props.workPeriodLabel || "—"} />
                  </div>
                </div>
              </div>
            )}
            {props.dateError ? <p className={styles.warn}>{props.dateError}</p> : null}

            {props.extraDateField ? (
              <div className={styles.fields3} style={{ marginTop: "0.65rem" }}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="yillik-extra-date">
                    {props.extraDateField.label}
                  </label>
                  <input
                    id="yillik-extra-date"
                    type="date"
                    max="9999-12-31"
                    className={styles.input}
                    value={props.extraDateField.value}
                    onChange={(e) => props.extraDateField?.onChange(e.target.value)}
                  />
                  {props.extraDateField.helper ? <p className={styles.helper}>{props.extraDateField.helper}</p> : null}
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>{props.extraDateField.resultLabel}</span>
                  <div className={styles.readonlyBox}>
                    <FlashValue value={props.extraDateField.resultValue || "—"} />
                  </div>
                </div>
              </div>
            ) : null}

            {(props.show18Or50 || props.showUnderground) && (
              <div className={styles.flagRow} style={{ marginTop: "0.65rem" }}>
                {props.show18Or50 ? (
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={!!props.is18Or50}
                      onChange={(e) => props.on18Or50Change?.(e.target.checked)}
                    />
                    18 yaş altı / 50 yaş üstü
                  </label>
                ) : null}
                {props.showUnderground ? (
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={!!props.isUnderground}
                      onChange={(e) => props.onUndergroundChange?.(e.target.checked)}
                    />
                    Yeraltı işçisi (+4 gün)
                  </label>
                ) : null}
              </div>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Brüt ücret</h2>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="yillik-brut">
                Aylık brüt ücret
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="yillik-brut"
                  className={`${styles.inputBare} ${props.asgariUcretHatasi ? styles.inputError : ""}`}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={props.brut}
                  onChange={(e) => props.onBrutChange(e.target.value)}
                />
                <span className={styles.currency} aria-hidden>
                  ₺
                </span>
              </div>
              {props.asgariUcretHatasi ? <p className={styles.warn}>{props.asgariUcretHatasi}</p> : null}
            </div>
          </section>

          {showUsedLeaveTable ? (
            <section className={styles.card}>
              <div className={styles.cardTitleRow}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>Kullanılan izin günleri</h2>
                </div>
                {props.onReplaceUsedRows ? (
                  <div className={styles.inlineActions}>
                    <Button type="button" variant="soft" size="sm" onClick={openUsedImport}>
                      <Download size={14} /> İçe Aktar
                    </Button>
                    <Button
                      type="button"
                      variant="soft"
                      size="sm"
                      disabled={!hasUsedLeaveData}
                      onClick={() => setUsedSaveOpen(true)}
                    >
                      <Save size={14} /> Kaydet
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={!hasAnyUsedLeaveContent}
                      onClick={clearAllUsedRows}
                    >
                      <Trash2 size={14} /> Tümünü Sil
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className={styles.usedTableWrap}>
                <table className={styles.usedTable}>
                  <thead>
                    <tr>
                      <th>Başlangıç</th>
                      <th>Bitiş</th>
                      <th>Gün</th>
                      <th aria-label="Sil" />
                    </tr>
                  </thead>
                  <tbody>
                    {props.usedRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="date"
                            className={styles.tableInput}
                            value={row.start}
                            onChange={(e) => props.onUpdateUsedRow(row.id, { start: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className={styles.tableInput}
                            value={row.end}
                            onChange={(e) => props.onUpdateUsedRow(row.id, { end: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.tableInput}
                            inputMode="decimal"
                            value={row.days}
                            onChange={(e) => props.onUpdateUsedRow(row.id, { days: e.target.value })}
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.removeBtn}
                            onClick={() => props.onRemoveUsedRow(row.id)}
                            aria-label="Satırı sil"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className={styles.addRowBtn} onClick={props.onAddUsedRow}>
                <Plus size={14} /> Satır ekle
              </button>
            </section>
          ) : null}

          {props.extraCard}

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div className={styles.notes}>
              {props.notes.map((n, i) => {
                if (n.kind === "heading") return <p key={i} className={styles.noteHeading}>{n.text}</p>;
                return (
                  <p
                    key={i}
                    className={`${styles.note} ${n.kind === "li" ? styles.noteLi : ""} ${n.emphasis === "warning" ? styles.noteWarn : ""}`}
                  >
                    {n.text}
                  </p>
                );
              })}
            </div>
          </section>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>İzin hakkı</h2>
            </div>
            <div className={styles.lineList}>
              {props.entitlementLines.map((line) => (
                <div key={line.label} className={styles.line}>
                  <span>{line.label}</span>
                  <strong>{line.value}</strong>
                </div>
              ))}
              <div className={styles.line}>
                <span>{props.totalEntitlementLabel}</span>
                <strong>
                  <FlashValue value={`${props.remainingDays + props.usedTotal} gün`} />
                </strong>
              </div>
              <div className={styles.line}>
                <span>Kullanılan</span>
                <strong>{props.usedTotal} gün</strong>
              </div>
              <div className={styles.line}>
                <span>Kalan</span>
                <strong>{props.remainingDays} gün</strong>
              </div>
              <div className={styles.line}>
                <span>Formül</span>
                <span className={styles.formulaText}>{props.formulaText}</span>
              </div>
            </div>
            <div className={styles.resultStack} style={{ marginTop: "0.6rem" }}>
              <div className={`${styles.resultCard} ${styles.resultCardAccent}`}>
                <div className={styles.resultLabel}>Brüt izin alacağı</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={props.brutIzin} /> ₺
                </div>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <div className={styles.resultStack}>
              <div className={styles.lineList}>
                <div className={styles.line}>
                  <span>Brüt izin alacağı</span>
                  <strong>
                    <FlashValue value={formatMoney(props.brutIzin)} /> ₺
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>SGK (%14)</span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(props.sgk)} /> ₺
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>İşsizlik (%1)</span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(props.issizlik)} /> ₺
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>
                    Gelir vergisi{props.gelirVergisiDilimleri ? ` ${props.gelirVergisiDilimleri}` : ""}
                  </span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(props.gelirVergisi)} /> ₺
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>Damga vergisi (‰7,59)</span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(props.damgaVergisi)} /> ₺
                  </strong>
                </div>
              </div>
              <div className={`${styles.resultCard} ${styles.resultCardStrong}`}>
                <div className={styles.resultLabel}>Net izin alacağı</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={props.netIzin} /> ₺
                </div>
              </div>
              {props.onEmployerPaymentChange ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <label className={styles.label}>
                    Davalı tarafından yıllık ücretli izin bedeli adı altında yapılan ödeme (mahsup)
                  </label>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={props.employerPayment ?? ""}
                    onChange={(e) => props.onEmployerPaymentChange?.(e.target.value)}
                    placeholder="0,00"
                  />
                  {(() => {
                    const pay =
                      Number(String(props.employerPayment ?? "").replace(/\./g, "").replace(",", ".")) || 0;
                    const mahsupNet = Math.max(0, Math.round((props.netIzin - pay) * 100) / 100);
                    const mahsupBrut = Math.max(0, Math.round((props.brutIzin - pay) * 100) / 100);
                    return pay > 0 || props.employerPayment ? (
                      <div className={styles.lineList} style={{ marginTop: "0.5rem" }}>
                        <div className={styles.line}>
                          <span>Mahsup sonrası (brüt − ödeme)</span>
                          <strong>{formatMoney(mahsupBrut)} ₺</strong>
                        </div>
                        <div className={styles.line}>
                          <span>Mahsup sonrası (net − ödeme)</span>
                          <strong>{formatMoney(mahsupNet)} ₺</strong>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <div className={`${styles.stickyBar} ${props.dirty ? styles.stickyBarDirty : ""}`}>
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {props.dirty
              ? "Kaydedilmemiş değişiklikler var"
              : props.activeName
                ? `Kayıt: ${props.activeName}`
                : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="ghost" size="sm" onClick={() => props.setListOpen(true)}>
              <FolderOpen size={14} /> Aç
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={() => props.setPreviewOpen(true)}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={props.onNewClick}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={props.onSaveClick}>
              <Save size={14} /> {props.isUpdate ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={props.nameOpen}
        initial={props.activeName || props.pageTitle}
        onClose={() => props.setNameOpen(false)}
        onConfirm={props.onPersist}
      />

      <NameModal
        open={usedSaveOpen}
        initial=""
        title="Kullanılan İzinleri Kaydet"
        fieldLabel="Set adı"
        inputId="yillik-used-leave-set-name"
        onClose={() => setUsedSaveOpen(false)}
        onConfirm={persistUsedSet}
      />

      {usedImportOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setUsedImportOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <h3 className={styles.modalTitle}>Kaydedilmiş İzin Setlerini İçe Aktar</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void rescanLegacyUsed()}
                title="Sunucudaki eski setleri yeniden tara"
              >
                <RefreshCw size={14} /> Yeniden tara
              </Button>
            </div>
            {savedUsedSets.length === 0 ? (
              <p className={styles.helper}>
                Kaydedilmiş set yok. Kullanılan izin günlerindeki “Kaydet” ile mevcut satırları saklayabilirsiniz.
              </p>
            ) : (
              <ul className={styles.setList}>
                {savedUsedSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.data.length} satır</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button type="button" variant="soft" size="sm" onClick={() => importUsedSet(set)}>
                        <Download size={13} /> İçe aktar
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => removeUsedSet(set.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button type="button" variant="soft" size="sm" onClick={() => setUsedImportOpen(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {props.listOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => props.setListOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => props.setListOpen(false)} aria-label="Kapat">
                <X size={16} />
              </Button>
            </div>
            {props.cases.length === 0 ? (
              <p className={styles.helper}>Henüz kayıt yok.</p>
            ) : (
              <div className={styles.caseList}>
                {props.cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · {c.subtitle}
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => props.onOpenCase(c.id)}>
                        Aç
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="icon"
                        aria-label="Sil"
                        onClick={() => props.setConfirmDeleteId(c.id)}
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

      <CalculationPreviewModal
        open={props.previewOpen}
        onClose={() => props.setPreviewOpen(false)}
        title={props.previewTitle}
        sections={props.previewSections}
        contentId={props.previewContentId || "yillik-preview-content"}
      />

      <ConfirmDialog
        open={props.confirmNew}
        title="Yeni hesaplama"
        description="Kaydedilmemiş değişiklikler silinecek. Devam edilsin mi?"
        confirmLabel="Evet, yeni"
        onConfirm={props.onConfirmNew}
        onCancel={() => props.setConfirmNew(false)}
      />

      <ConfirmDialog
        open={!!props.confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={props.onConfirmDelete}
        onCancel={() => props.setConfirmDeleteId(null)}
      />
    </div>
  );
}
