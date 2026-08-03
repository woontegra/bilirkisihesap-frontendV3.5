import { Calendar, FileText, Scale, WifiOff } from "lucide-react";
import { useMemo } from "react";
import { StatePanel } from "@/components/ui/StatePanel";
import { useDashboard } from "@/hooks/useDashboard";
import {
  calculateSubscription,
  getSubscriptionTypeLabel,
} from "@/utils/subscription";
import { formatDate } from "@/utils/format";
import { DashboardSkeleton } from "./components/DashboardSkeleton";
import { FinancialSummaryCard } from "./components/FinancialSummary";
import { MonthlyChart } from "./components/MonthlyChart";
import { RecentRecords } from "./components/RecentRecords";
import { StatCards, type StatItem } from "./components/StatCards";
import { SubscriptionCard } from "./components/SubscriptionCard";
import { TypeDistributionChart } from "./components/TypeDistributionChart";
import styles from "./DashboardPage.module.css";

export default function DashboardPage() {
  const {
    loading,
    savedCases,
    userInfo,
    financial,
    financialError,
    connectionError,
    isAdmin,
    reload,
  } = useDashboard();

  const sub = useMemo(() => {
    const start = userInfo?.demoLicense?.activatedAt ?? userInfo?.subscriptionStartsAt;
    const end = userInfo?.demoLicense?.expiresAt ?? userInfo?.subscriptionEndsAt;
    return calculateSubscription(start, end);
  }, [userInfo]);

  const planLabel = useMemo(
    () => getSubscriptionTypeLabel(userInfo?.subscriptionType, Boolean(userInfo?.demoLicense)),
    [userInfo],
  );

  const monthlyCount = useMemo(() => {
    const now = new Date();
    return savedCases.filter((c) => {
      const source = c.created_at || c.createdAt;
      if (!source) return false;
      try {
        const d = new Date(source);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      } catch {
        return false;
      }
    }).length;
  }, [savedCases]);

  const lastLogin = useMemo(() => {
    try {
      const value = localStorage.getItem("last_login_date");
      if (!value) return "İlk Giriş";
      return formatDate(value, true);
    } catch {
      return "İlk Giriş";
    }
  }, []);

  const lastRecordName = savedCases[0]?.name ?? savedCases[0]?.aciklama ?? "—";

  const stats: StatItem[] = [
    {
      id: "total",
      label: "Toplam Hesaplama",
      value: savedCases.length,
      numeric: true,
      hint: "Kayıtlı hesaplamalar",
      icon: FileText,
      tone: "teal",
    },
    {
      id: "month",
      label: "Bu Ayki Hesaplama",
      value: monthlyCount,
      numeric: true,
      hint: "Cari ay",
      icon: Scale,
      tone: "blue",
    },
    {
      id: "login",
      label: "Son Giriş",
      value: lastLogin,
      icon: Calendar,
      tone: "green",
    },
    {
      id: "last",
      label: "Son Kayıt",
      value: lastRecordName,
      icon: Scale,
      tone: "amber",
    },
  ];

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className={`anim-fade-up ${styles.page}`}>
      {connectionError ? (
        <StatePanel
          icon={WifiOff}
          tone="danger"
          title="Bağlantı hatası"
          description={connectionError}
          actionLabel="Tekrar dene"
          onAction={reload}
        />
      ) : null}

      <StatCards items={stats} />

      {isAdmin ? (
        <FinancialSummaryCard financial={financial} error={financialError} />
      ) : null}

      <SubscriptionCard planLabel={planLabel} sub={sub} />

      <div className={styles.chartGrid}>
        <TypeDistributionChart savedCases={savedCases} />
        <MonthlyChart savedCases={savedCases} />
      </div>

      <RecentRecords savedCases={savedCases} />
    </div>
  );
}
