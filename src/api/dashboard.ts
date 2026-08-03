import { ApiError } from "@/api/client";
import type { DashboardData, FinancialSummary, SavedCase, UserInfo } from "./types";
import { apiClient } from "./client";

function readCurrentUser(): { email?: string; role?: string } | null {
  try {
    return JSON.parse(localStorage.getItem("current_user") || "null") as {
      email?: string;
      role?: string;
    } | null;
  } catch {
    return null;
  }
}

export function readIsAdmin(): boolean {
  const currentUser = readCurrentUser();
  const tenantId = Number(localStorage.getItem("tenant_id") || "1");
  return currentUser?.role === "admin" || tenantId === 1;
}

/** Verified FrontendV3 dashboard endpoints — unchanged contracts. */
export async function fetchDashboardFromApi(isAdmin: boolean): Promise<DashboardData> {
  let savedCases: SavedCase[] = [];
  let connectionError: string | null = null;

  try {
    const data = await apiClient<SavedCase[]>("/api/saved-cases");
    savedCases = Array.isArray(data) ? data : [];
  } catch (err) {
    savedCases = [];
    connectionError =
      err instanceof ApiError && err.status === 401
        ? "Oturum bulunamadı veya geçersiz. Lütfen tekrar giriş yapın."
        : "Kayıtlı hesaplamalar yüklenemedi. API bağlantısını kontrol edin.";
  }

  const currentUser = readCurrentUser();
  const emailRaw = localStorage.getItem("email") || currentUser?.email;

  let userInfo: UserInfo | null = null;
  if (emailRaw) {
    try {
      userInfo = await apiClient<UserInfo>(`/api/auth/me?email=${encodeURIComponent(emailRaw)}`);
    } catch {
      userInfo = null;
      if (!connectionError) {
        connectionError = "Kullanıcı bilgileri alınamadı.";
      }
    }
  }

  let financial: FinancialSummary | null = null;
  let financialError: string | null = null;
  if (isAdmin) {
    try {
      financial = await apiClient<FinancialSummary>("/api/admin/financial-summary");
    } catch {
      financialError = "Finansal özet yüklenemedi. Yönetici oturumu ve API bağlantısını kontrol edin.";
    }
  }

  return {
    savedCases,
    userInfo,
    financial,
    financialError,
    connectionError,
  };
}
