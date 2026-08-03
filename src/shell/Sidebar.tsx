import clsx from "clsx";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { NAV_GROUPS } from "./navConfig";
import styles from "./Sidebar.module.css";

type Props = {
  collapsed: boolean;
  mobileOpen: boolean;
  isDesktop: boolean;
  isAdmin: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
};

export function Sidebar({
  collapsed,
  mobileOpen,
  isDesktop,
  isAdmin,
  onToggleCollapse,
  onCloseMobile,
}: Props) {
  const narrow = isDesktop && collapsed;

  return (
    <>
      {!isDesktop && mobileOpen ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Menüyü kapat"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={clsx(
          styles.sidebar,
          narrow && styles.collapsed,
          !isDesktop && styles.drawer,
          !isDesktop && mobileOpen && styles.drawerOpen,
        )}
        aria-label="Ana menü"
      >
        <div className={styles.brandRow}>
          <img
            src="/logo.png"
            alt="Bilirkişi Hesaplama Araçları Hizmetleri"
            className={styles.brandLogo}
          />
          {!isDesktop ? (
            <button type="button" className={styles.iconBtn} onClick={onCloseMobile} aria-label="Kapat">
              <X size={18} />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.iconBtn, styles.collapseBtn)}
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>

        <nav className={styles.nav}>
          {NAV_GROUPS.map((group) => {
            if (group.adminOnly && !isAdmin) {
              return null;
            }
            return (
              <div key={group.id} className={styles.group}>
                {group.label && !narrow ? <p className={styles.groupLabel}>{group.label}</p> : null}
                <ul className={styles.list}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    if (item.disabled) {
                      return (
                        <li key={item.id}>
                          <span
                            className={clsx(styles.link, styles.disabled)}
                            title={narrow ? item.label : "Yakında"}
                          >
                            <Icon size={18} strokeWidth={1.75} className={styles.linkIcon} />
                            {!narrow ? (
                              <>
                                <span className={styles.linkLabel}>{item.label}</span>
                                {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
                              </>
                            ) : null}
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={item.id}>
                        <NavLink
                          to={item.path}
                          className={({ isActive }) =>
                            clsx(styles.link, isActive && styles.active)
                          }
                          title={narrow ? item.label : undefined}
                          onClick={() => {
                            if (!isDesktop) {
                              onCloseMobile();
                            }
                          }}
                        >
                          <Icon size={18} strokeWidth={1.75} className={styles.linkIcon} />
                          {!narrow ? (
                            <>
                              <span className={styles.linkLabel}>{item.label}</span>
                              {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
                            </>
                          ) : null}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className={styles.footer}>
          {!narrow ? (
            <>
              <p className={styles.footerTitle}>Bilirkişi Hesap</p>
              <p className={styles.footerSub}>Sürüm 3.5</p>
            </>
          ) : (
            <p className={styles.footerCollapsed} title="Bilirkişi Hesap – Sürüm 3.5">
              3.5
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
