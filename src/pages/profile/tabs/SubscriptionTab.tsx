import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAuthMe,
  fetchRenewalOptions,
  formatProductType,
  getOptionPricing,
  startRenewal,
  type RenewalOption,
  type RenewalOptions,
} from "@/api/profile";
import { FormField } from "@/components/admin/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import styles from "./profileTabShared.module.css";

const renewalEnabled = import.meta.env.VITE_SUBSCRIPTION_RENEWAL_ENABLED === "true";
const CUSTOMER_RENEWAL_URL = "https://bilirkisihesap.com/abonelik-yenile";
const PURCHASE_URL = "https://bilirkisihesap.com/satin-al";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return "-";
  const normalizedCurrency = currency.toUpperCase() === "TL" ? "TRY" : currency.toUpperCase();
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function buildCustomerRenewalUrl(customerCode: string) {
  const url = new URL(CUSTOMER_RENEWAL_URL);
  url.searchParams.set("customer", customerCode);
  return url.toString();
}

function subscriptionExpiryWarningThreshold(productType: string | null) {
  const normalized = String(productType || "").trim().toLowerCase();
  if (["monthly", "professional_monthly", "pro_monthly"].includes(normalized)) return 7;
  if (["annual", "yearly", "professional_yearly", "pro_yearly"].includes(normalized)) return 30;
  return null;
}

function readStoredUser(): {
  email?: string;
  customerCode?: string;
  licenseType?: string | null;
} {
  try {
    const raw = JSON.parse(localStorage.getItem("current_user") || "null") as {
      email?: string;
      customerCode?: string;
      licenseType?: string | null;
    } | null;
    return {
      email: raw?.email || localStorage.getItem("email") || undefined,
      customerCode: raw?.customerCode,
      licenseType: raw?.licenseType ?? null,
    };
  } catch {
    return { email: localStorage.getItem("email") || undefined };
  }
}

export default function SubscriptionTab() {
  const toast = useToast();
  const stored = readStoredUser();
  const [customerCode, setCustomerCode] = useState(stored.customerCode || "");
  const [licenseType, setLicenseType] = useState(stored.licenseType || "");
  const [renewal, setRenewal] = useState<RenewalOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [renewalStarting, setRenewalStarting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const isDemo = licenseType.toLowerCase() === "demo";

  useEffect(() => {
    let active = true;
    const email = stored.email;
    if (!email) return;
    void (async () => {
      try {
        const me = await fetchAuthMe(email);
        if (!active) return;
        if (typeof me.customerCode === "string") setCustomerCode(me.customerCode);
        if (typeof me.licenseType === "string") setLicenseType(me.licenseType);
        else if (typeof me.subscriptionType === "string") setLicenseType(me.subscriptionType);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [stored.email]);

  useEffect(() => {
    if (isDemo || !renewalEnabled) {
      setLoading(false);
      setRenewal(null);
      return;
    }
    let active = true;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const options = await fetchRenewalOptions();
        if (!active) return;
        setRenewal(options);
        setSelectedIndex(0);
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof Error ? err.message : "Abonelik ve yenileme bilgileri yüklenemedi.",
        );
        setRenewal(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isDemo, reloadKey]);

  const selectedOption: RenewalOption | null = renewal?.options[selectedIndex] ?? null;
  const pricing = useMemo(
    () => (renewal ? getOptionPricing(renewal, selectedOption) : null),
    [renewal, selectedOption],
  );

  const warningThreshold = subscriptionExpiryWarningThreshold(renewal?.currentPackage ?? null);
  const isExpired =
    renewal?.remainingDays !== null &&
    renewal?.remainingDays !== undefined &&
    renewal.remainingDays <= 0;
  const expiringSoon =
    isExpired ||
    (warningThreshold !== null &&
      renewal?.remainingDays !== null &&
      renewal?.remainingDays !== undefined &&
      renewal.remainingDays <= warningThreshold);

  const copyCustomerCode = async () => {
    if (!customerCode) return;
    try {
      await navigator.clipboard.writeText(customerCode);
      toast.success("Müşteri numaranız kopyalandı.");
    } catch {
      toast.error("Müşteri numarası kopyalanamadı.");
    }
  };

  const startSelectedRenewal = useCallback(async () => {
    if (!selectedOption || renewalStarting) return;
    setRenewalStarting(true);
    try {
      const url = await startRenewal({
        productType: selectedOption.productType,
        period: selectedOption.period,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Yenileme oturumu oluşturulamadı.");
    } finally {
      setRenewalStarting(false);
    }
  }, [renewalStarting, selectedOption, toast]);

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.rowBetween}>
          <div>
            <h3 className={styles.panelTitle}>Müşteri Numarası</h3>
            <p className={styles.panelDesc} style={{ marginBottom: 0 }}>
              {customerCode || "Müşteri numarası henüz atanmadı"}
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {customerCode ? (
              <>
                <Button variant="soft" size="sm" onClick={() => void copyCustomerCode()}>
                  <Copy size={14} aria-hidden /> Kopyala
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() =>
                    window.open(buildCustomerRenewalUrl(customerCode), "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink size={14} aria-hidden /> Yenileme Sayfası
                </Button>
              </>
            ) : null}
            {isDemo ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => window.open(PURCHASE_URL, "_blank", "noopener,noreferrer")}
              >
                Abonelik Satın Al
              </Button>
            ) : renewalEnabled ? (
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedOption || renewalStarting}
                onClick={() => void startSelectedRenewal()}
              >
                {renewalStarting ? "Başlatılıyor..." : "Aboneliği Uzat"}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {isDemo ? (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Demo Abonelik</h3>
          <p className={styles.panelDesc}>
            Demo hesabınız sınırlı süreli erişim sağlar. Tam abonelik için satın alma sayfasını
            ziyaret edin.
          </p>
          <Button
            variant="primary"
            onClick={() => window.open(PURCHASE_URL, "_blank", "noopener,noreferrer")}
          >
            Satın Al
          </Button>
        </section>
      ) : renewalEnabled ? (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Abonelik Bilgileri</h3>
          <p className={styles.panelDesc}>Mevcut paketiniz ve yenileme seçenekleriniz</p>

          {loading ? (
            <p className={styles.muted}>Abonelik bilgileri yükleniyor...</p>
          ) : loadError ? (
            <div className={styles.error}>
              <p>{loadError}</p>
              <div style={{ marginTop: "0.55rem" }}>
                <Button variant="soft" size="sm" onClick={() => setReloadKey((v) => v + 1)}>
                  <RefreshCw size={14} aria-hidden /> Tekrar Dene
                </Button>
              </div>
            </div>
          ) : renewal ? (
            <>
              {expiringSoon ? (
                <p className={styles.warn}>
                  {renewal.remainingDays !== null && renewal.remainingDays <= 0
                    ? "Abonelik süreniz sona ermiş."
                    : `Aboneliğinizin bitmesine ${renewal.remainingDays} gün kaldı.`}
                </p>
              ) : null}

              <dl className={styles.dl} style={{ marginTop: "0.75rem" }}>
                <div>
                  <dt>Mevcut Paket</dt>
                  <dd>
                    {renewal.currentPackage
                      ? formatProductType(renewal.currentPackage)
                      : "Paket bilgisi yok"}
                  </dd>
                </div>
                <div>
                  <dt>Lisans Bitiş Tarihi</dt>
                  <dd>{formatDate(renewal.licenseEnd)}</dd>
                </div>
                <div>
                  <dt>Kalan Süre</dt>
                  <dd>
                    {renewal.remainingDays === null ? "-" : `${renewal.remainingDays} gün`}
                  </dd>
                </div>
                <div>
                  <dt>Bağlı Baro</dt>
                  <dd>{renewal.linkedBaro ?? "Bağlı baro yok"}</dd>
                </div>
              </dl>

              <div style={{ marginTop: "1rem" }}>
                <h4 className={styles.panelTitle} style={{ fontSize: "var(--fs-sm)" }}>
                  Yenileme Fiyatı
                </h4>
                {renewal.campaign ? (
                  <p className={styles.success}>
                    {renewal.campaign.name ?? "Aktif yenileme kampanyası"} —{" "}
                    {formatDate(renewal.campaign.startsAt)} – {formatDate(renewal.campaign.endsAt)}
                  </p>
                ) : (
                  <p className={styles.muted}>Aktif yenileme kampanyası yok</p>
                )}

                {renewal.options.length > 0 ? (
                  <FormField label="Paket ve süre seçimi">
                    <select
                      value={String(selectedIndex)}
                      onChange={(e) => setSelectedIndex(Number(e.target.value))}
                    >
                      {renewal.options.map((option, index) => (
                        <option key={`${option.productType}-${String(option.period)}`} value={index}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                ) : (
                  <p className={styles.muted}>Kullanılabilir paket seçeneği yok.</p>
                )}

                {pricing ? (
                  <div className={styles.priceGrid} style={{ marginTop: "0.75rem" }}>
                    <div>
                      <dt className={styles.muted}>Normal Fiyat</dt>
                      <dd style={{ margin: "0.2rem 0 0", fontWeight: 600 }}>
                        {formatMoney(pricing.normalPrice, pricing.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className={styles.muted}>Kampanya İndirimi</dt>
                      <dd style={{ margin: "0.2rem 0 0", fontWeight: 600 }}>
                        {renewal.campaign
                          ? pricing.discountPercent !== null
                            ? `%${pricing.discountPercent}`
                            : pricing.discountAmount !== null
                              ? `-${formatMoney(pricing.discountAmount, pricing.currency)}`
                              : "-"
                          : "Uygulanmıyor"}
                      </dd>
                    </div>
                    <div>
                      <dt className={styles.muted}>Ödenecek Tutar</dt>
                      <dd style={{ margin: "0.2rem 0 0", fontWeight: 700, color: "var(--accent-hover)" }}>
                        {formatMoney(
                          renewal.campaign
                            ? (pricing.finalAmount ?? pricing.normalPrice)
                            : (pricing.normalPrice ?? pricing.finalAmount),
                          pricing.currency,
                        )}
                      </dd>
                    </div>
                  </div>
                ) : null}

                {renewal.message ? <p className={styles.muted}>{renewal.message}</p> : null}
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Abonelik Bilgileri</h3>
          <p className={styles.panelDesc}>
            Abonelik yenileme şu anda bu ortamda etkin değil. Destek için ticket açabilirsiniz.
          </p>
        </section>
      )}
    </div>
  );
}
