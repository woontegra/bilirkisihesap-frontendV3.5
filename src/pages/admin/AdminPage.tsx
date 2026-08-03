import { Shield } from "lucide-react";
import { ADMIN_TOOL_CARDS } from "./adminCards";
import { AdminToolCard } from "./components/AdminToolCard";
import styles from "./AdminPage.module.css";

export default function AdminPage() {
  const readyCount = ADMIN_TOOL_CARDS.filter((c) => c.status === "ready").length;
  const soonCount = ADMIN_TOOL_CARDS.length - readyCount;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerIcon} aria-hidden>
          <Shield size={20} strokeWidth={1.75} />
        </div>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Admin Paneli</h1>
          <p className={styles.subtitle}>
            Sistem yönetim araçlarına erişiyorsunuz. Kullanıcı, abonelik, destek ve denetim
            modüllerini buradan yönetin.
          </p>
        </div>
        <div className={styles.meta}>
          <span className={styles.metaChip}>{ADMIN_TOOL_CARDS.length} araç</span>
          {soonCount > 0 ? (
            <span className={styles.metaChipMuted}>{soonCount} yakında</span>
          ) : null}
          {readyCount > 0 ? (
            <span className={styles.metaChipReady}>{readyCount} hazır</span>
          ) : null}
        </div>
      </header>

      <section className={styles.grid} aria-label="Yönetim araçları">
        {ADMIN_TOOL_CARDS.map((card, index) => (
          <AdminToolCard key={card.id} card={card} index={index} />
        ))}
      </section>
    </div>
  );
}
