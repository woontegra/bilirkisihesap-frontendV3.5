/**
 * Dönemsel — Metin Hesaplaması (V3 format, simple variant).
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { buildDonemselFmMetinCards } from "./seasonalHours";
import type { DonemselFormSnapshot } from "./model";
import styles from "./DonemselFmPage.module.css";

export function MetinHesaplamasi({ form }: { form: DonemselFormSnapshot }) {
  const [open, setOpen] = useState(false);
  const cards = useMemo(
    () =>
      buildDonemselFmMetinCards({
        dateIn: form.dateIn,
        dateOut: form.dateOut,
        summerPattern: form.summerPattern,
        winterPattern: form.winterPattern,
        witnesses: form.witnessesSeasons,
      }),
    [form.dateIn, form.dateOut, form.summerPattern, form.winterPattern, form.witnessesSeasons],
  );

  return (
    <section className={styles.card} style={{ animationDelay: "110ms" }}>
      <button
        type="button"
        className={styles.metinToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <strong>Metin Hesaplaması</strong>
          <span className={styles.metinHint}>Metin üzerinden hesaplama yapmak için tıklayın</span>
        </span>
        <ChevronDown size={16} className={open ? styles.metinChevronOpen : undefined} />
      </button>
      {open ? (
        <div className={styles.metinBody}>
          <p className={styles.panelHint}>
            Özet metinler yaz/kış desenine ve cetvelde kullanılan haftalık FM formülüne göredir; asgari ücret
            dönemleri ve tanık kesişimleri cetvel satırlarında ayrıca uygulanır.
          </p>
          {cards.map((c) => (
            <pre key={c.key} className={styles.metinPre}>
              {c.text}
            </pre>
          ))}
        </div>
      ) : null}
    </section>
  );
}
