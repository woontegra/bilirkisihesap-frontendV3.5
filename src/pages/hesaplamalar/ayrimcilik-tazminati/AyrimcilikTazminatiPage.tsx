import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  Eye,
  FilePlus2,
  FolderOpen,
  Save,
  Scale,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";

import {
  KATSAYILAR,
  clampYearInDateInput,
  computeAyrimcilik,
  formatDateTR,
  formatMoney,
  isDateOrderInvalid,
} from "./engine";
import { NOTE_BLOCKS, createEmptyForm, snapshotKey, type AyrimcilikForm, type SavedCase } from "./model";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";
import styles from "./AyrimcilikTazminatiPage.module.css";

const PAGE_TITLE = "Ayrımcılık Tazminatı";
const PREVIEW_TITLE = "Ayrımcılık Tazminatı Rapor";

function FlashValue({ value }: { value: string }) {
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

  return <span className={flash ? styles.valueFlash : ""}>{value}</span>;
}

function AnimatedMoney({ value }: { value: number }) {
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
        <label className={styles.label} htmlFor="ay-save-name">
          Kayıt adı
        </label>
        <input
          id="ay-save-name"
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

export default function AyrimcilikTazminatiPage() {
  const { success, error: showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<AyrimcilikForm>(createEmptyForm);
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

  const result = useMemo(() => computeAyrimcilik(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

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

  // Lokal kayıt açma (?caseId= ile)
  const didOpenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!caseIdParam) return;
    if (didOpenRef.current === caseIdParam) return;
    didOpenRef.current = caseIdParam;

    const found = cases.find((c) => c.id === caseIdParam);
    if (!found) {
      showError("Kayıt bulunamadı");
      return;
    }

    const nextForm = { ...createEmptyForm(), ...found.form };
    setForm(nextForm);
    setActiveId(found.id);
    setActiveName(found.name);
    setBaseline(snapshotKey(nextForm));
    setDateError(null);

    const next = new URLSearchParams(searchParams);
    next.delete("caseId");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cases is source; do not refetch
  }, [caseIdParam, cases, searchParams, setSearchParams, showError]);

  const patch = useCallback(<K extends keyof AyrimcilikForm>(key: K, value: AyrimcilikForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validateDates = useCallback(
    (start: string, end: string, message: string) => {
      if (isDateOrderInvalid(start, end)) {
        setDateError(message);
        showError(message);
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
    (name: string, existingId?: string | null) => {
      if (!(result.brutVal > 0)) {
        showError("Geçerli bir brüt ücret giriniz");
        return;
      }

      const saved = saveCase(
        name,
        form,
        { brutForNetConversion: result.brutForNetConversion, netTazminat: result.netTazminat },
        existingId,
      );
      if (!saved) {
        showError("Kayıt yapılamadı");
        return;
      }

      setActiveId(saved.id);
      setActiveName(saved.name);
      setBaseline(snapshotKey(form));
      reloadCases();
      success(existingId ? "Kayıt güncellendi" : "Kayıt kaydedildi");
      setNameOpen(false);
    },
    [form, reloadCases, result.brutForNetConversion, result.netTazminat, result.brutVal, showError, success],
  );

  const handleSaveClick = useCallback(() => {
    if (!(result.brutVal > 0)) {
      showError("Geçerli bir brüt ücret giriniz");
      return;
    }
    if (activeId && activeName) {
      persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, persist, result.brutVal, showError]);

  const openCase = useCallback(
    (c: SavedCase) => {
      const next = { ...createEmptyForm(), ...c.form };
      setForm(next);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(snapshotKey(next));
      setDateError(null);
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
      // Açılan kayıt için URL'u temizle (lokal-only)
      const nextUrl = new URLSearchParams(searchParams);
      nextUrl.delete("caseId");
      setSearchParams(nextUrl, { replace: true });
    },
    [searchParams, setSearchParams, success],
  );

  const doDelete = useCallback(() => {
    if (!confirmDeleteId) return;
    deleteCase(confirmDeleteId);
    if (activeId === confirmDeleteId) {
      setActiveId(null);
      setActiveName(null);
    }
    setConfirmDeleteId(null);
    reloadCases();
    success("Kayıt silindi");
  }, [activeId, confirmDeleteId, reloadCases, success]);

  const activeK = useMemo(() => {
    if (!(result.brutVal > 0)) return 4;
    const ratio = result.brutForNetConversion / result.brutVal;
    const rounded = Math.round(ratio);
    return (KATSAYILAR as readonly number[]).includes(rounded) ? rounded : 4;
  }, [result.brutForNetConversion, result.brutVal]);

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
        ],
      },
    ];

    if (result.coefRows.length > 0) {
      sections.push({
        id: "katsayi",
        title: "Ayrımcılık Tazminatı Hesaplama Detayı",
        headers: ["Katsayı", "Hesaplama", "Tutar"],
        rows: result.coefRows.map((row) => [
          `${row.k} ay`,
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
        ["Brüt Ayrımcılık Tazminatı", `${formatMoney(result.brutForNetConversion)} ₺`],
        ["Damga Vergisi (Binde 7,59)", `-${formatMoney(result.damgaVergisi)} ₺`],
        ["Net Ayrımcılık Tazminatı", `${formatMoney(result.netTazminat)} ₺`],
      ],
      lastRowTone: "green",
    });

    return sections;
  }, [form.endDate, form.startDate, result]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden>
          <Scale size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className={styles.title}>{PAGE_TITLE}</h1>
          <p className={styles.desc}>
            1–4 aylık katsayı tablosu, damga vergisi (binde 7,59) ve net ayrımcılık tazminatı —
            hesaplama tamamen lokal çalışır.
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
              <h2 className={styles.cardTitle}>Tarih bilgileri</h2>
            </div>
            <div className={styles.fields3}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ay-ise-giris">
                  İşe giriş
                </label>
                <input
                  id="ay-ise-giris"
                  type="date"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.startDate}
                  onChange={(e) => patch("startDate", clampYearInDateInput(e.target.value))}
                  onBlur={() => {
                    if (form.startDate && form.endDate) {
                      validateDates(
                        form.startDate,
                        form.endDate,
                        "İşe giriş tarihi, işten çıkış tarihinden sonra olamaz.",
                      );
                    }
                  }}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ay-isten-cikis">
                  İşten çıkış
                </label>
                <input
                  id="ay-isten-cikis"
                  type="date"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.endDate}
                  onChange={(e) => patch("endDate", clampYearInDateInput(e.target.value))}
                  onBlur={() => {
                    if (form.startDate && form.endDate) {
                      validateDates(
                        form.startDate,
                        form.endDate,
                        "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.",
                      );
                    }
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
              <h2 className={styles.cardTitle}>Ücret & opsiyonel brüt</h2>
            </div>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ay-brut">
                  Çıplak brüt ücret
                </label>
                <input
                  id="ay-brut"
                  className={`${styles.input} ${result.asgariUcretHatasi ? styles.inputError : ""}`}
                  inputMode="decimal"
                  placeholder="Örn: 25.000"
                  value={form.brut}
                  onChange={(e) => patch("brut", e.target.value)}
                />
                <p className={styles.helper}>Dava tarihindeki emsal brüt ücret yazılabilir.</p>
                {result.asgariUcretHatasi ? <p className={styles.warn}>{result.asgariUcretHatasi}</p> : null}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ay-brut-net-ops">
                  Brüt tutar (opsiyonel)
                </label>
                <input
                  id="ay-brut-net-ops"
                  className={styles.input}
                  inputMode="decimal"
                  placeholder={
                    result.coefRows.length
                      ? `Varsayılan: ${formatMoney(result.coefRows[result.coefRows.length - 1].value)}`
                      : "Varsayılan: 4 aylık"
                  }
                  value={form.brutInputForNet}
                  onChange={(e) => patch("brutInputForNet", e.target.value)}
                />
                <p className={styles.helper}>
                  Boş bırakılırsa tablonun son satırı (4 aylık) kullanılır; tablo yoksa çıplak brüt.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Katsayı tablosu (1–4 ay)</h2>
            </div>
            <p className={styles.cardHint}>
              Brüt ücret × 1..4 dilimleri. Opsiyonel brüt alanı boşsa varsayılan olarak 4 aylık tutar
              net dönüşümde esas alınır.
            </p>

            {result.coefRows.length === 0 ? (
              <p className={styles.emptyCoef}>Brüt ücret girildiğinde satırlar listelenir.</p>
            ) : (
              <div className={styles.coefGrid}>
                {result.coefRows.map((row) => (
                  <div
                    key={row.k}
                    className={`${styles.coefCard} ${row.k === activeK ? styles.coefCardHighlight : ""}`}
                  >
                    <div className={styles.coefK}>{row.k} aylık</div>
                    <div className={styles.coefVal}>
                      <FlashValue value={`${formatMoney(row.value)} ₺`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div
              className={styles.notes}
              style={{ maxHeight: "min(50vh, 28rem)", overflowY: "auto", paddingRight: 2 }}
            >
              {NOTE_BLOCKS.map((n, i) => (
                <p key={i} className={`${styles.note} ${n.variant === "alert" ? styles.noteWarn : ""}`}>
                  {n.text}
                </p>
              ))}
            </div>
          </section>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <p className={styles.cardHint}>Brüt tutardan yalnızca binde 7,59 oranında damga vergisi kesintisi uygulanır.</p>
            <div className={styles.resultStack}>
              <div className={`${styles.resultCard} ${styles.resultCardAccent}`}>
                <div className={styles.resultLabel}>Brüt ayrımcılık</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={result.brutForNetConversion} /> ₺
                </div>
              </div>

              <div className={styles.lineList}>
                <div className={styles.line}>
                  <span>Damga vergisi (‰7,59)</span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(result.damgaVergisi)} /> ₺
                  </strong>
                </div>
              </div>

              <div className={`${styles.resultCard} ${styles.resultCardStrong}`}>
                <div className={styles.resultLabel}>Net tazminat</div>
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
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? `Kayıt: ${activeName}` : "Yeni hesaplama"}
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
            <Button type="button" variant="primary" size="sm" onClick={handleSaveClick}>
              <Save size={14} /> {activeId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={nameOpen}
        initial={activeName || PAGE_TITLE}
        onClose={() => setNameOpen(false)}
        onConfirm={(name) => persist(name, null)}
      />

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle} style={{ marginBottom: 0 }}>
                Kayıtlı hesaplamalar
              </h3>
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
              <p className={styles.helper} style={{ marginTop: "0.85rem" }}>
                Henüz kayıt yok.
              </p>
            ) : (
              <div className={styles.caseList} style={{ marginTop: "0.85rem" }}>
                {cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net {formatMoney(c.results.netTazminat)} ₺
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
        contentId="ayrimcilik-preview"
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}

