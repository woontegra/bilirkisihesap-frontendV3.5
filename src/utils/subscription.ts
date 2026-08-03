export type SubscriptionProgress = {
  hasSubscription: boolean;
  startDate: Date | null;
  endDate: Date | null;
  totalDays: number;
  daysUsed: number;
  daysRemaining: number;
  usedPct: number;
  remainingPct: number;
};

export function calculateSubscription(
  startRaw?: string | null,
  endRaw?: string | null,
): SubscriptionProgress {
  if (!startRaw || !endRaw) {
    return {
      hasSubscription: false,
      startDate: null,
      endDate: null,
      totalDays: 0,
      daysUsed: 0,
      daysRemaining: 0,
      usedPct: 0,
      remainingPct: 0,
    };
  }

  const startDate = new Date(startRaw);
  const endDate = new Date(endRaw);
  const now = new Date();

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      hasSubscription: false,
      startDate: null,
      endDate: null,
      totalDays: 0,
      daysUsed: 0,
      daysRemaining: 0,
      usedPct: 0,
      remainingPct: 0,
    };
  }

  const msDay = 86_400_000;
  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / msDay));
  const daysUsed = Math.min(totalDays, Math.max(0, Math.round((now.getTime() - startDate.getTime()) / msDay)));
  const daysRemaining = Math.max(0, Math.round((endDate.getTime() - now.getTime()) / msDay));
  const usedPct = Math.min(100, Math.max(0, (daysUsed / totalDays) * 100));
  const remainingPct = Math.min(100, Math.max(0, (daysRemaining / totalDays) * 100));

  return {
    hasSubscription: true,
    startDate,
    endDate,
    totalDays,
    daysUsed,
    daysRemaining,
    usedPct,
    remainingPct,
  };
}

export function getSubscriptionTypeLabel(raw?: string | null, hasDemo?: boolean): string {
  if (hasDemo) {
    return "Deneme";
  }
  if (!raw) {
    return "Kullanıcı";
  }
  const lower = raw.toLowerCase();
  if (lower.includes("annual") || lower.includes("yillik") || lower.includes("yıllık")) {
    return "Yıllık Plan";
  }
  if (lower.includes("month") || lower.includes("aylik") || lower.includes("aylık")) {
    return "Aylık Plan";
  }
  return raw;
}
