import { useEffect, useState } from "react";
import { fetchAuthMe } from "@/api/profile";
import styles from "./ProfileHeader.module.css";

function readStoredUser(): {
  name?: string;
  email?: string;
  role?: string;
  licenseType?: string | null;
} {
  try {
    const raw = JSON.parse(localStorage.getItem("current_user") || "null") as {
      name?: string;
      email?: string;
      role?: string;
      licenseType?: string | null;
    } | null;
    return {
      name: raw?.name || undefined,
      email: raw?.email || localStorage.getItem("email") || undefined,
      role: raw?.role || localStorage.getItem("user_role") || undefined,
      licenseType: raw?.licenseType ?? null,
    };
  } catch {
    return { email: localStorage.getItem("email") || undefined };
  }
}

function formatSubscriptionDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return "-";
  }
}

function getSubscriptionTypeLabel(type: string | null | undefined): string {
  if (!type) return "Abonelik Yok";
  const labels: Record<string, string> = {
    annual: "Yıllık Standart Abonelik",
    monthly: "Aylık Standart Abonelik",
    trial: "Deneme Aboneliği",
    starter: "Starter",
    professional: "Professional",
    demo: "Demo",
  };
  return labels[type] || type;
}

export default function ProfileHeader() {
  const stored = readStoredUser();
  const [name, setName] = useState(stored.name || "Kullanıcı");
  const [email, setEmail] = useState(stored.email || "");
  const [role, setRole] = useState(stored.role || "");
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);
  const [subscriptionType, setSubscriptionType] = useState<string | null>(
    stored.licenseType ?? null,
  );

  useEffect(() => {
    let active = true;
    const emailParam = stored.email;
    if (!emailParam) return;

    void (async () => {
      try {
        const me = await fetchAuthMe(emailParam);
        if (!active) return;
        if (typeof me.name === "string" && me.name.trim()) setName(me.name);
        if (typeof me.email === "string" && me.email.trim()) setEmail(me.email);
        if (typeof me.role === "string" && me.role.trim()) setRole(me.role);
        setSubscriptionEndsAt(
          typeof me.subscriptionEndsAt === "string" ? me.subscriptionEndsAt : null,
        );
        setSubscriptionType(
          (typeof me.subscriptionType === "string" ? me.subscriptionType : null) ||
            (typeof me.licenseType === "string" ? me.licenseType : null),
        );
      } catch {
        /* localStorage fallback yeterli */
      }
    })();

    return () => {
      active = false;
    };
  }, [stored.email]);

  const roleLabel =
    role.toLowerCase() === "admin" ? "Yönetici" : role ? role.toUpperCase() : "";

  return (
    <header className={styles.header}>
      <div className={styles.avatar} aria-hidden>
        <img src="/logo.png" alt="" className={styles.avatarImg} />
      </div>
      <div className={styles.meta}>
        <h2 className={styles.name}>{name}</h2>
        {email ? <p className={styles.email}>{email}</p> : null}
        <div className={styles.badges}>
          {roleLabel ? <span className={styles.role}>{roleLabel}</span> : null}
          <span className={styles.subStatus}>
            <span className={styles.dot} aria-hidden />
            {getSubscriptionTypeLabel(subscriptionType)}
          </span>
          <span className={styles.renewal}>
            Yenileme: {formatSubscriptionDate(subscriptionEndsAt)}
          </span>
        </div>
      </div>
    </header>
  );
}
