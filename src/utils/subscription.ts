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

export type SubscriptionDateSource = {
  subscriptionStartsAt?: string | null;
  subscriptionEndsAt?: string | null;
  createdAt?: string | null;
  demoLicense?: {
    activatedAt?: string | null;
    expiresAt?: string | null;
    createdAt?: string | null;
  } | null;
};

function normalizeDateInput(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : value;
}

/** Bitiş: demo lisansı veya abonelik bitişi (/api/auth/me). */
export function resolveSubscriptionEndsAt(source: SubscriptionDateSource): string | null {
  return (
    normalizeDateInput(source.demoLicense?.expiresAt) ??
    normalizeDateInput(source.subscriptionEndsAt)
  );
}

/**
 * Başlangıç: subscriptionStartsAt → demo activatedAt → (bitiş varsa) createdAt.
 * Sahte tarih üretilmez.
 */
export function resolveSubscriptionStartsAt(
  source: SubscriptionDateSource,
  endOverride?: string | null,
): string | null {
  const direct =
    normalizeDateInput(source.subscriptionStartsAt) ??
    normalizeDateInput(source.demoLicense?.activatedAt);
  if (direct) {
    return direct;
  }

  const end = endOverride ?? resolveSubscriptionEndsAt(source);
  if (!end) {
    return null;
  }

  return (
    normalizeDateInput(source.createdAt) ??
    normalizeDateInput(source.demoLicense?.createdAt)
  );
}

export function buildSubscriptionProgress(source: SubscriptionDateSource): SubscriptionProgress {
  const endDate = resolveSubscriptionEndsAt(source);
  const startDate = resolveSubscriptionStartsAt(source, endDate);
  return calculateSubscription(startDate, endDate);
}

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

  const toLocalDayStart = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const calendarDayDiff = (from: Date, to: Date) =>
    Math.round((toLocalDayStart(to).getTime() - toLocalDayStart(from).getTime()) / msDay);

  // Başlangıç ve bitiş günleri dahil (5 Ağu 2026 → 4 Ağu 2027 = 365 gün)
  const totalDays = Math.max(1, calendarDayDiff(startDate, endDate) + 1);

  const startDay = toLocalDayStart(startDate);
  const nowDay = toLocalDayStart(now);
  const daysUsed =
    nowDay < startDay
      ? 0
      : Math.min(totalDays, calendarDayDiff(startDate, now) + 1);
  const daysRemaining = Math.max(0, totalDays - daysUsed);
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
    return "Plan bilgisi yok";
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
