import {

  Bell,

  Bookmark,

  CreditCard,

  LogOut,

  Menu,

  MessageSquare,

  PanelLeft,

  RefreshCw,

  Settings,

  Ticket,

  UserRound,

  Users,

  Video,

} from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { fetchNotifications, markNotificationsRead } from "@/api/notifications";

import type { NotificationItem } from "@/api/types";

import { logout } from "@/auth/session";

import { Button } from "@/components/ui/Button";

import { getDataSourceMode } from "@/data/source";

import styles from "./Topbar.module.css";



type Props = {

  title: string;

  isDesktop: boolean;

  onOpenMobile: () => void;

  onToggleCollapse: () => void;

  onRefresh?: () => void;

  userName?: string;

  userEmail?: string;

  userRoleLabel?: string;

};



function isTicketNotification(item: NotificationItem): boolean {

  if (item.type === "ticket") return true;

  const title = (item.title || "").toLocaleLowerCase("tr-TR");

  return (

    title.includes("destek talebi") ||

    title.includes("yanıt verildi") ||

    title.includes("yanit verildi")

  );

}



function readStoredUser(): { name?: string; email?: string; role?: string; tenantId?: number } {

  try {

    const raw = JSON.parse(localStorage.getItem("current_user") || "null") as {

      name?: string;

      email?: string;

      role?: string;

      tenantId?: number;

    } | null;

    return {

      name: raw?.name || undefined,

      email: raw?.email || localStorage.getItem("email") || undefined,

      role: raw?.role || localStorage.getItem("user_role") || undefined,

      tenantId: raw?.tenantId ?? Number(localStorage.getItem("tenant_id") || "1"),

    };

  } catch {

    return {

      email: localStorage.getItem("email") || undefined,

      tenantId: Number(localStorage.getItem("tenant_id") || "1"),

    };

  }

}



export function Topbar({

  title,

  isDesktop,

  onOpenMobile,

  onToggleCollapse,

  onRefresh,

  userName,

  userEmail,

  userRoleLabel,

}: Props) {

  const navigate = useNavigate();

  const stored = readStoredUser();

  const displayName = userName || stored.name || "Kullanıcı";

  const displayEmail = userEmail || stored.email || "";

  const roleLabel =

    userRoleLabel ||

    (stored.role === "admin" ? "YÖNETİCİ" : stored.role ? stored.role.toUpperCase() : "");

  const tenantId = stored.tenantId ?? Number(localStorage.getItem("tenant_id") || "1");

  const showSubUsers = tenantId === 1;



  const [menuOpen, setMenuOpen] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [notifLoading, setNotifLoading] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const notifRef = useRef<HTMLDivElement>(null);

  const source = getDataSourceMode();

  const unreadCount = notifications.filter((item) => !item.read).length;



  const loadNotifications = useCallback(async () => {

    if (source !== "api") {

      setNotifications([]);

      return;

    }

    try {

      setNotifLoading(true);

      const data = await fetchNotifications();

      setNotifications(data);

    } catch {

      setNotifications([]);

    } finally {

      setNotifLoading(false);

    }

  }, [source]);



  useEffect(() => {

    void loadNotifications();

    if (source !== "api") return;

    const timer = window.setInterval(() => {

      void loadNotifications();

    }, 30_000);

    return () => window.clearInterval(timer);

  }, [loadNotifications, source]);



  useEffect(() => {

    const onDoc = (event: MouseEvent) => {

      const target = event.target as Node;

      if (!menuRef.current?.contains(target)) setMenuOpen(false);

      if (!notifRef.current?.contains(target)) setNotifOpen(false);

    };

    document.addEventListener("mousedown", onDoc);

    return () => document.removeEventListener("mousedown", onDoc);

  }, []);



  useEffect(() => {

    if (!menuOpen && !notifOpen) return;

    const onKey = (event: KeyboardEvent) => {

      if (event.key === "Escape") {

        setMenuOpen(false);

        setNotifOpen(false);

      }

    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);

  }, [menuOpen, notifOpen]);



  async function handleNotificationToggle() {

    const next = !notifOpen;

    setNotifOpen(next);

    setMenuOpen(false);

    if (!next) return;

    await loadNotifications();

    try {

      await markNotificationsRead();

      setNotifications((items) => items.map((item) => ({ ...item, read: true })));

    } catch {

      /* sessiz */

    }

  }



  const closeMenu = () => setMenuOpen(false);



  return (

    <header className={styles.topbar}>

      <div className={styles.left}>

        <Button

          variant="ghost"

          size="icon"

          aria-label={isDesktop ? "Kenar çubuğunu daralt/genişlet" : "Menüyü aç"}

          onClick={isDesktop ? onToggleCollapse : onOpenMobile}

        >

          {isDesktop ? <PanelLeft size={18} /> : <Menu size={18} />}

        </Button>



        <a

          href="https://www.youtube.com/@bilirkisihesap"

          target="_blank"

          rel="noopener noreferrer"

          className={styles.trainingLink}

          title="Eğitim Videoları"

        >

          <Video size={15} aria-hidden />

          <span className={styles.hideMd}>Eğitim Videoları</span>

        </a>



        <div className={styles.titleBlock}>

          <h1 className={styles.title}>{title}</h1>

        </div>

      </div>



      <div className={styles.right}>

        <Link to="/profile?tab=tickets" className={styles.ticketLink} title="Destek Talebi Aç">

          <span className={styles.hideSm}>Ticket Aç</span>

          <Ticket size={15} aria-hidden />

          {unreadCount > 0 ? (

            <span className={styles.ticketBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>

          ) : (

            <span className={styles.ticketBadgeMuted}>0</span>

          )}

        </Link>



        {onRefresh ? (

          <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="Yenile">

            <RefreshCw size={16} />

          </Button>

        ) : null}



        <div className={styles.notifWrap} ref={notifRef}>

          <button

            type="button"

            className={styles.iconBtn}

            aria-label="Bildirimler"

            aria-expanded={notifOpen}

            onClick={() => void handleNotificationToggle()}

          >

            <Bell size={18} className={styles.bell} />

            {unreadCount > 0 ? (

              <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>

            ) : null}

          </button>



          {notifOpen ? (

            <div className={styles.notifPanel} role="dialog" aria-label="Bildirimler">

              <div className={styles.notifHead}>Bildirimler</div>

              <div className={styles.notifList}>

                {notifLoading ? (

                  <p className={styles.notifEmpty}>Yükleniyor...</p>

                ) : notifications.length === 0 ? (

                  <p className={styles.notifEmpty}>Henüz bildiriminiz yok</p>

                ) : (

                  notifications.map((item) => {

                    const createdAt = item.createdAt || item.created_at;

                    const ticket = isTicketNotification(item);

                    if (ticket) {

                      return (

                        <Link

                          key={item.id}

                          to="/profile?tab=tickets"

                          className={styles.notifItem}

                          onClick={() => setNotifOpen(false)}

                        >

                          <strong>{item.title}</strong>

                          {createdAt ? (

                            <span>{new Date(createdAt).toLocaleString("tr-TR")}</span>

                          ) : null}

                        </Link>

                      );

                    }

                    return (

                      <div key={item.id} className={styles.notifItemStatic}>

                        <strong>{item.title}</strong>

                        {createdAt ? (

                          <span>{new Date(createdAt).toLocaleString("tr-TR")}</span>

                        ) : null}

                      </div>

                    );

                  })

                )}

              </div>

            </div>

          ) : null}

        </div>



        <div className={styles.userWrap} ref={menuRef}>

          <button

            type="button"

            className={styles.userBtn}

            aria-expanded={menuOpen}

            aria-haspopup="menu"

            onClick={() => {

              setMenuOpen((v) => !v);

              setNotifOpen(false);

            }}

          >

            <span className={styles.avatar}>

              <img src="/logo.png" alt="" className={styles.avatarImg} />

              <UserRound size={14} className={styles.avatarFallback} />

            </span>

            <span className={styles.userMeta}>

              <span className={styles.userName}>{displayName}</span>

              {roleLabel ? <span className={styles.userRole}>{roleLabel}</span> : null}

              {!roleLabel && displayEmail ? (

                <span className={styles.userEmail}>{displayEmail}</span>

              ) : null}

            </span>

          </button>



          {menuOpen ? (

            <div className={styles.menu} role="menu">

              <div className={styles.menuHead}>

                <p className={styles.userName}>{displayName}</p>

                {displayEmail ? <p className={styles.userEmail}>{displayEmail}</p> : null}

              </div>

              <div className={styles.menuList}>

                <Link to="/profile" className={styles.menuItem} role="menuitem" onClick={closeMenu}>

                  <UserRound size={15} aria-hidden />

                  <span>Profilim</span>

                </Link>

                <Link

                  to="/profile?tab=saved"

                  className={styles.menuItem}

                  role="menuitem"

                  onClick={closeMenu}

                >

                  <Bookmark size={15} aria-hidden />

                  <span>Kayıtlı Hesaplamalarım</span>

                </Link>

                <Link

                  to="/profile?tab=subscription"

                  className={styles.menuItem}

                  role="menuitem"

                  onClick={closeMenu}

                >

                  <CreditCard size={15} aria-hidden />

                  <span>Abonelik Bilgilerim</span>

                </Link>

                <Link

                  to="/profile?tab=tickets"

                  className={styles.menuItem}

                  role="menuitem"

                  onClick={closeMenu}

                >

                  <MessageSquare size={15} aria-hidden />

                  <span>Destek Talepleri</span>

                </Link>

                {showSubUsers ? (

                  <Link

                    to="/profile?tab=subusers"

                    className={styles.menuItem}

                    role="menuitem"

                    onClick={closeMenu}

                  >

                    <Users size={15} aria-hidden />

                    <span>Alt Kullanıcılar</span>

                  </Link>

                ) : null}

                <Link

                  to="/profile?tab=settings"

                  className={styles.menuItem}

                  role="menuitem"

                  onClick={closeMenu}

                >

                  <Settings size={15} aria-hidden />

                  <span>Ayarlar</span>

                </Link>

              </div>

              <div className={styles.menuDivider} />

              <button

                type="button"

                className={`${styles.menuItem} ${styles.menuLogout}`}

                role="menuitem"

                onClick={() => {

                  closeMenu();

                  logout();

                  navigate("/login", { replace: true });

                }}

              >

                <LogOut size={15} aria-hidden />

                <span>Çıkış Yap</span>

              </button>

            </div>

          ) : null}

        </div>

      </div>

    </header>

  );

}

