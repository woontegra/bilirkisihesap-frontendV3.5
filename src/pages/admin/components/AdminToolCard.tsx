import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { AdminCardCategory, AdminToolCardConfig } from "../adminCards";
import styles from "./AdminToolCard.module.css";

type Props = {
  card: AdminToolCardConfig;
  index: number;
};

const CATEGORY_ICON: Record<AdminCardCategory, string> = {
  operations: styles.operations,
  support: styles.support,
  analytics: styles.analytics,
  system: styles.system,
};

const CATEGORY_CARD: Record<AdminCardCategory, string> = {
  operations: styles.operationsCard,
  support: styles.supportCard,
  analytics: styles.analyticsCard,
  system: styles.systemCard,
};

export function AdminToolCard({ card, index }: Props) {
  const Icon = card.icon;
  const comingSoon = card.status === "coming_soon";
  const delayMs = 60 + index * 45;
  const animStyle = { animationDelay: `${delayMs}ms` } as const;
  const className = clsx(
    styles.card,
    CATEGORY_CARD[card.category],
    comingSoon ? styles.soon : styles.link,
  );

  const body = (
    <>
      <span className={styles.sheen} aria-hidden />
      <div className={styles.top}>
        <span className={clsx(styles.iconWrap, CATEGORY_ICON[card.category])}>
          <Icon size={18} strokeWidth={1.75} className={styles.icon} aria-hidden />
        </span>
        {comingSoon ? (
          <span className={styles.soonBadge}>Yakında</span>
        ) : (
          <ArrowUpRight size={16} className={styles.arrow} aria-hidden />
        )}
      </div>

      <h2 className={styles.title}>{card.title}</h2>
      <p className={styles.desc}>{card.description}</p>

      <div className={styles.footer}>
        <span className={styles.status}>
          {comingSoon ? "Hazırlanıyor" : "Yönetim sayfasına git"}
        </span>
        {!comingSoon ? (
          <ArrowUpRight size={14} className={styles.arrowInline} aria-hidden />
        ) : null}
      </div>
    </>
  );

  if (comingSoon) {
    return (
      <div
        className={className}
        style={animStyle}
        role="group"
        aria-label={`${card.title} — yakında`}
        tabIndex={0}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      to={card.route}
      className={className}
      style={animStyle}
      aria-label={`${card.title} sayfasına git`}
    >
      {body}
    </Link>
  );
}
