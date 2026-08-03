import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  Eye,
  FilePlus2,
  FolderOpen,
  Save,
  ShieldCheck,
  Trash2,
  UserX,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  buildIseAlmamaSaveResult,
  iseAlmamaCaseCrud,
  listIseAlmamaCasesFromBackend,
  mapIseAlmamaFormFromBackend,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import {
  clampYearInDateInput,
  computeIseAlmama,
  formatDateTR,
  formatMoney,
  isDateOrderInvalid,
  normalizeKatsayi,
} from "./engine";
import {
  NOTE_BLOCKS,
  createEmptyForm,
  snapshotKey,
  type IseAlmamaForm,
  type SavedCase,
} from "./model";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import styles from "./IseAlmamaTazminatiPage.module.css";

const PAGE_TITLE = "İşe Başlatmama Tazminatı";
const PREVIEW_TITLE = "İşe Başlatmama Tazminatı Rapor";

function FlashValue({ value, className }: { value: string; className?: string }) {
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
  return (
    <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>
  );
}

function AnimatedMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from last displayed
  }, [value, reduce]);

  return <>{formatMoney(display)}</>;
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
        <label className={styles.label} htmlFor="ia-save-name">
          Kayıt adı
        </label>
        <input
          id="ia-save-name"
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
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim())}
          >
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function IseAlmamaTazminatiPage() {
  const { success, error: showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<IseAlmamaForm>(createEmptyForm);
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
  const [caseSaving, setCaseSaving] = useState(false);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const result = useMemo(() => computeIseAlmama(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listIseAlmamaCasesFromBackend();
      setStorageError(null);
      setCases(items);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıtlar yüklenemedi";
      setStorageError(message);
      const local = loadCasesSafe();
      setCases(local.ok ? local.items : []);
    }
  }, []);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  /* Profil → Kaydedilen Hesaplamalar: ?caseId= ile backend kaydını aç (yalnızca form; hesap lokal) */
  useEffect(() => {
    if (!caseIdParam) {
      backendLoadedCaseIdRef.current = null;
      return;
    }
    if (backendLoadedCaseIdRef.current === caseIdParam) return;
    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      showError("Geçersiz kayıt kimliği");
      return;
    }
    let cancelled = false;
    void getSavedCase(numericId)
      .then((record) => {
        if (cancelled) return;
        const mapped = mapIseAlmamaFormFromBackend(record.data);
        if (!mapped) {
          showError("Kayıt formu okunamadı");
          return;
        }
        setForm(mapped);
        setActiveId(String(numericId));
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(mapped));
        setDateError(null);
        backendLoadedCaseIdRef.current = caseIdParam;
        success(`Kayıt yüklendi: ${resolveSavedCaseDisplayName(record)}`);
        const next = new URLSearchParams(searchParams);
        next.delete("caseId");
        setSearchParams(next, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          backendLoadedCaseIdRef.current = null;
          showError("Kayıt yüklenemedi");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseIdParam, searchParams, setSearchParams, showError, success]);

  const patch = useCallback(<K extends keyof IseAlmamaForm>(key: K, value: IseAlmamaForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validateDates = useCallback(
    (start: string, end: string) => {
      if (isDateOrderInvalid(start, end)) {
        setDateError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
        showError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
        return false;
      }
      setDateError(null);
      return true;
    },
    [showError],
  );

  const handleNew = useCallback(() => {
    if (dirty) {
      setConfirmNew(true);
      return;
    }
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
  }, [dirty]);

  const doNew = useCallback(() => {
    setConfirmNew(false);
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
  }, []);

  const persist = useCallback(
    async (name: string, existingId?: string | null) => {
      if (!(result.brutVal > 0) || result.coefRows.length === 0) {
        showError("Geçerli bir brüt ücret giriniz");
        return;
      }
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      try {
        const record = await iseAlmamaCaseCrud.saveCase(
          name,
          form,
          buildIseAlmamaSaveResult({
            brutForNet: result.brutForNet,
            netTazminat: result.netTazminat,
            selectedKatsayi: result.selectedKatsayi,
          }),
          existingId,
        );
        const recordId = String(record.id);
        setActiveId(recordId);
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(form));
        setCaseIdParam(recordId);
        backendLoadedCaseIdRef.current = recordId;
        await reloadCases();
        success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
        setNameOpen(false);
      } catch (error) {
        showError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Kayıt yapılamadı",
        );
      } finally {
        setCaseSaving(false);
      }
    },
    [form, result, reloadCases, setCaseIdParam, showError, success],
  );

  const handleSaveClick = useCallback(() => {
    if (!(result.brutVal > 0) || result.coefRows.length === 0) {
      showError("Geçerli bir brüt ücret giriniz");
      return;
    }
    if (activeId && activeName && /^\d+$/.test(activeId)) {
      void persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, persist, result.brutVal, result.coefRows.length, showError]);

  const openCase = useCallback(
    (c: SavedCase) => {
      const next = { ...createEmptyForm(), ...c.form, selectedKatsayi: normalizeKatsayi(c.form.selectedKatsayi) };
      setForm(next);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(snapshotKey(next));
      setDateError(null);
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
    },
    [success],
  );

  const doDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      if (/^\d+$/.test(confirmDeleteId)) {
        await iseAlmamaCaseCrud.removeCase(confirmDeleteId);
      } else {
        deleteCase(confirmDeleteId);
      }
      if (activeId === confirmDeleteId) {
        setActiveId(null);
        setActiveName(null);
      }
      setConfirmDeleteId(null);
      await reloadCases();
      success("Kayıt silindi");
    } catch (error) {
      showError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıt silinemedi",
      );
    }
  }, [activeId, confirmDeleteId, reloadCases, showError, success]);

  const previewSections = useMemo((): PreviewSection[] => {
    const sections: PreviewSection[] = [
      {
        id: "genel",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["Çıplak Brüt Ücret", result.brutVal ? `${formatMoney(result.brutVal)} ₺` : "—"],
          ["İşe Giriş Tarihi", form.startDate ? formatDateTR(form.startDate) : "—"],
          ["İşten Çıkış Tarihi", form.endDate ? formatDateTR(form.endDate) : "—"],
          ["Çalışma Süresi", result.workPeriod?.label || "—"],
          ["Seçili Katsayı", `${result.selectedKatsayi} aylık`],
        ],
      },
    ];

    if (result.coefRows.length > 0) {
      sections.push({
        id: "katsayi",
        title: "İşe Başlatmama Tazminatı Hesaplama Detayı",
        headers: ["Katsayı", "Hesaplama", "Tutar"],
        rows: result.coefRows.map((row) => [
          `${row.k}x`,
          `${formatMoney(result.brutVal)} × ${row.k}`,
          `${formatMoney(row.value)} ₺`,
        ]),
      });
    }

    sections.push({
      id: "brutten-nete",
      title: "Brütten Nete",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt İşe Başlatmama Tazminatı", `${formatMoney(result.brutForNet)} ₺`],
        ["Damga Vergisi (Binde 7,59)", `-${formatMoney(result.damgaVergisi)} ₺`],
        ["Net İşe Başlatmama Tazminatı", `${formatMoney(result.netTazminat)} ₺`],
      ],
    });

    return sections;
  }, [form.endDate, form.startDate, result]);

  const defaultBrutPlaceholder =
    result.coefRows.find((r) => r.k === result.selectedKatsayi)?.value ??
    result.coefRows[result.coefRows.length - 1]?.value ??
    0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden>
          <UserX size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className={styles.title}>{PAGE_TITLE}</h1>
          <p className={styles.desc}>
            İş Kanunu kapsamında işe başlatmama tazminatı — 4–8 aylık katsayı tablosu ve damga
            vergisi (binde 7,59). Hesaplama tamamen lokal çalışır.
          </p>
          <div className={styles.privacyBadge}>
            <ShieldCheck size={12} /> %100 lokal · ağ isteği yok
          </div>
          {activeName ? <div className={styles.recordBadge}>Kayıt: {activeName}</div> : null}
        </div>
      </header>

      {storageError ? (
        <div className={styles.storageBanner}>
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
        </div>
      ) : null}

      <div className={styles.layout}>
        <div style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Hesaplama bilgileri</h2>
            </div>
            <div className={styles.fields3}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ia-ise-giris">
                  İşe giriş
                </label>
                <input
                  id="ia-ise-giris"
                  type="date"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.startDate}
                  onChange={(e) => patch("startDate", clampYearInDateInput(e.target.value))}
                  onBlur={() => {
                    if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                  }}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ia-isten-cikis">
                  İşten çıkış
                </label>
                <input
                  id="ia-isten-cikis"
                  type="date"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.endDate}
                  onChange={(e) => patch("endDate", clampYearInDateInput(e.target.value))}
                  onBlur={() => {
                    if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                  }}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Çalışma süresi</span>
                <div className={styles.readonlyBox}>
                  <FlashValue value={result.workPeriod?.label || "—"} />
                </div>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Ücret ve katsayı</h2>
            </div>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ia-brut">
                  Çıplak brüt ücret
                </label>
                <input
                  id="ia-brut"
                  className={`${styles.input} ${result.asgariUcretHatasi ? styles.inputError : ""}`}
                  inputMode="decimal"
                  placeholder="Örn: 25.000"
                  value={form.brut}
                  onChange={(e) => patch("brut", e.target.value)}
                />
                <p className={styles.helper}>Dava tarihindeki emsal brüt ücret yazılabilir.</p>
                {result.asgariUcretHatasi ? (
                  <p className={styles.warn}>{result.asgariUcretHatasi}</p>
                ) : null}
              </div>
            </div>

            <p className={styles.cardHint} style={{ marginTop: "0.75rem" }}>
              Katsayı tablosu (4–8 ay). Net dönüşümde varsayılan seçili dilimdir; opsiyonel brüt alanı
              doldurulursa o tutar kullanılır. Kıdem süresi katsayıyı otomatik seçmez.
            </p>
            {result.coefRows.length === 0 ? (
              <p className={styles.emptyCoef}>Geçerli brüt girildiğinde satırlar listelenir.</p>
            ) : (
              <div className={styles.coefGrid} role="radiogroup" aria-label="Katsayı seçimi">
                {result.coefRows.map((row) => {
                  const active = row.k === result.selectedKatsayi;
                  return (
                    <button
                      key={row.k}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`${styles.coefCard} ${active ? styles.coefCardHighlight : ""}`}
                      onClick={() => patch("selectedKatsayi", row.k)}
                    >
                      <div className={styles.coefK}>{row.k} aylık</div>
                      <div className={styles.coefVal}>
                        <FlashValue value={`${formatMoney(row.value)} ₺`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.fields} style={{ marginTop: "0.75rem" }}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ia-brut-net-ops">
                  Brüt tutar (opsiyonel)
                </label>
                <input
                  id="ia-brut-net-ops"
                  className={styles.input}
                  inputMode="decimal"
                  placeholder={
                    result.coefRows.length
                      ? `Varsayılan: ${formatMoney(defaultBrutPlaceholder)}`
                      : "Varsayılan: seçili katsayı"
                  }
                  value={form.brutInputForNet}
                  onChange={(e) => patch("brutInputForNet", e.target.value)}
                />
                <p className={styles.helper}>
                  Boş bırakılırsa seçili katsayı satırı ({result.selectedKatsayi} aylık) kullanılır.
                  V3 varsayılanı 8 aylıktır.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div className={styles.notes}>
              {NOTE_BLOCKS.map((n, i) => (
                <p
                  key={i}
                  className={`${styles.note} ${n.emphasis === "warning" ? styles.noteWarn : ""}`}
                >
                  {n.text}
                </p>
              ))}
            </div>
          </section>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brüt / net sonuç</h2>
            </div>
            <p className={styles.cardHint}>
              Brüt tutardan yalnızca binde 7,59 oranında damga vergisi kesintisi uygulanır. Gelir
              vergisi uygulanmaz.
            </p>
            <div className={styles.resultStack}>
              <div className={`${styles.resultCard} ${styles.resultCardAccent}`}>
                <div className={styles.resultLabel}>Brüt işe başlatmama</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={result.brutForNet} /> ₺
                </div>
              </div>
              <div className={styles.lineList}>
                <div className={styles.line}>
                  <span>Damga vergisi (‰7,59)</span>
                  <strong className={styles.deduction}>
                    −
                    <FlashValue value={formatMoney(result.damgaVergisi)} /> ₺
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>Seçili katsayı</span>
                  <strong>{result.selectedKatsayi} aylık</strong>
                </div>
              </div>
              <div className={`${styles.resultCard} ${styles.resultCardStrong}`}>
                <div className={styles.resultLabel}>Net işe başlatmama</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={result.netTazminat} /> ₺
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}>
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty
              ? "Kaydedilmemiş değişiklikler var"
              : activeName
                ? `Kayıt: ${activeName}`
                : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} /> Aç
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleNew}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSaveClick} disabled={caseSaving}>
              <Save size={14} /> {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={nameOpen}
        initial={activeName || PAGE_TITLE}
        onClose={() => setNameOpen(false)}
        onConfirm={(name) => void persist(name, null)}
      />

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setListOpen(false)}
                aria-label="Kapat"
              >
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
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net{" "}
                        {formatMoney(c.results.netTazminat)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => openCase(c)}>
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
        description="Kaydedilmemiş veriler silinecek. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={doNew}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <CalculationPreviewModal
        open={previewOpen}
        title={PREVIEW_TITLE}
        sections={previewSections}
        contentId="ise-almama-preview"
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
