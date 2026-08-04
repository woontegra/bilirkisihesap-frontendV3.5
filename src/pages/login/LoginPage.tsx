import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Calculator,
  Eye,
  EyeOff,
  Lock,
  Scale,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { isAuthenticated, loginWithPassword } from "@/auth/session";
import { usePanelBranding } from "@/context/PanelBrandingContext";
import styles from "./LoginPage.module.css";

const HERO_WORDS = ["Fazla Mesai", "Kıdem Tazminatı", "İhbar Tazminatı", "Yıllık İzin", "UBGT"];
const FLOAT_ICONS = [Calculator, Scale, TrendingUp, Sparkles] as const;

function useRotatingWord(words: string[], intervalMs = 2800) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [words.length, intervalMs]);

  return words[index];
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { branding, loginLogoSrc } = usePanelBranding();
  const pageRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoVisible, setLogoVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  const rotatingWord = useRotatingWord(HERO_WORDS);
  const emailId = useId();
  const passwordId = useId();
  const bokeh = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${(i * 19 + 5) % 100}%`,
        top: `${(i * 27 + 9) % 100}%`,
        size: 80 + (i % 5) * 48,
        delay: `${(i % 9) * 0.6}s`,
        duration: `${14 + (i % 6) * 3}s`,
        tone: i % 3,
      })),
    [],
  );

  useEffect(() => {
    const remembered = localStorage.getItem("remember_email");
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const onMove = (event: MouseEvent) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      page.style.setProperty("--mx", x.toFixed(4));
      page.style.setProperty("--my", y.toFixed(4));
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithPassword(email.trim(), password);
      if (rememberMe) {
        localStorage.setItem("remember_email", email.trim());
      } else {
        localStorage.removeItem("remember_email");
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={pageRef}
      className={`${styles.page} ${mounted ? styles.pageMounted : ""}`}
      style={{ "--mx": 0, "--my": 0 } as CSSProperties}
    >
      <div className={styles.bg} aria-hidden>
        <div className={styles.bgBase} />
        <div className={styles.bgNoise} />
        <div className={styles.lightBeams}>
          <div className={styles.beam} data-beam="1" />
          <div className={styles.beam} data-beam="2" />
          <div className={styles.beam} data-beam="3" />
        </div>
        <div className={styles.aurora} />
        <svg className={styles.network} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="netGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(94, 200, 216, 0.35)" />
              <stop offset="100%" stopColor="rgba(26, 111, 124, 0.08)" />
            </linearGradient>
          </defs>
          <g className={styles.networkLines} stroke="url(#netGrad)" strokeWidth="0.75" fill="none">
            <path d="M0 420 Q 300 280 520 380 T 1200 320" />
            <path d="M0 580 Q 400 440 680 520 T 1200 480" />
            <path d="M120 0 Q 360 200 600 120 T 1200 80" />
            <path d="M80 800 Q 420 620 760 700 T 1200 760" />
            <circle cx="520" cy="380" r="3" fill="rgba(126, 232, 248, 0.5)" />
            <circle cx="680" cy="520" r="2.5" fill="rgba(126, 232, 248, 0.4)" />
            <circle cx="360" cy="200" r="2" fill="rgba(200, 170, 90, 0.45)" />
            <circle cx="900" cy="320" r="2.5" fill="rgba(126, 232, 248, 0.35)" />
          </g>
        </svg>
        {bokeh.map((b) => (
          <span
            key={b.id}
            className={styles.bokeh}
            data-tone={b.tone}
            style={{
              left: b.left,
              top: b.top,
              width: b.size,
              height: b.size,
              animationDelay: b.delay,
              animationDuration: b.duration,
            }}
          />
        ))}
        <div className={`${styles.orb} ${styles.orbA}`} />
        <div className={`${styles.orb} ${styles.orbB}`} />
        <div className={`${styles.orb} ${styles.orbC}`} />
        <div className={styles.spotlight} />
        <div className={styles.vignette} />
      </div>

      <div className={styles.layout}>
        <aside className={styles.hero} aria-label="Tanıtım">
          <div className={styles.heroInner}>
            <span className={styles.heroBadge}>
              <Zap size={14} aria-hidden />
              Yeni nesil hesaplama motoru
            </span>

            <h1 className={styles.heroTitle}>
              Bilirkişi hesaplamalarında
              <span className={styles.heroTitleAccent}>
                <span key={rotatingWord} className={styles.heroWordSwap}>
                  {rotatingWord}
                </span>
              </span>
            </h1>

            <p className={styles.heroSub}>
              Hızlı, güvenilir ve profesyonel. Tüm iş hukuku hesaplamalarınız tek panelde —
              saniyeler içinde sonuç.
            </p>

            <ul className={styles.heroStats}>
              <li>
                <strong>50+</strong>
                <span>hesaplama türü</span>
              </li>
              <li>
                <strong>v3.5</strong>
                <span>güncel motor</span>
              </li>
              <li>
                <strong>7/24</strong>
                <span>erişim</span>
              </li>
            </ul>

            <div className={styles.floatingIcons} aria-hidden>
              {FLOAT_ICONS.map((Icon, i) => (
                <div key={Icon.name} className={styles.floatingIcon} data-index={i}>
                  <Icon size={22} strokeWidth={1.75} />
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.cardShell}>
            <div className={styles.cardBorder} aria-hidden />
            <div className={styles.cardGlow} aria-hidden />

            <div className={styles.card}>
              <span className={styles.versionBadge}>v3.5</span>

              <header className={styles.brand}>
                {logoVisible ? (
                  <img
                    src={loginLogoSrc}
                    alt=""
                    className={styles.logo}
                    style={{
                      maxHeight: branding.loginLogoMaxHeight,
                      maxWidth: branding.loginLogoMaxWidth,
                    }}
                    onError={() => setLogoVisible(false)}
                  />
                ) : (
                  <div className={styles.logoFallback} aria-hidden>
                    <Calculator size={28} />
                  </div>
                )}
                <h2 className={styles.title}>Hoş geldiniz</h2>
                <p className={styles.sub}>
                  <Shield size={15} className={styles.subIcon} aria-hidden />
                  Hesabınıza güvenli giriş yapın
                </p>
              </header>

              <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={emailId}>
                    <Sparkles size={14} className={styles.iconAmber} aria-hidden />
                    E-posta
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id={emailId}
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ornek@firma.com"
                      className={styles.input}
                    />
                    <span className={styles.inputGlow} aria-hidden />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={passwordId}>
                    <Lock size={14} className={styles.iconTeal} aria-hidden />
                    Şifre
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id={passwordId}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={styles.input}
                    />
                    <button
                      type="button"
                      className={styles.togglePassword}
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <span className={styles.inputGlow} aria-hidden />
                  </div>
                </div>

                <label className={styles.remember}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span>Beni hatırla</span>
                </label>

                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}

                <button type="submit" className={styles.submit} disabled={loading}>
                  <span className={styles.submitShine} aria-hidden />
                  <span className={styles.submitRing} aria-hidden />
                  <span className={styles.submitInner}>
                    {loading ? (
                      <>
                        <span className={styles.spinner} aria-hidden />
                        Giriş yapılıyor…
                      </>
                    ) : (
                      <>
                        <Shield size={17} aria-hidden />
                        Giriş Yap
                      </>
                    )}
                  </span>
                </button>
              </form>

              <footer className={styles.footer}>
                <span className={styles.statusDot} aria-hidden />
                Sistem aktif · Bilirkişi Hesap v3.5
              </footer>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
