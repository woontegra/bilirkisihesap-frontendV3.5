import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  findTourTarget,
  pickPlacement,
  placeBubble,
  readTargetRect,
  scrollTargetIntoView,
  type Placement,
  type Rect,
} from "./geometry";
import { loadTourPrefs, saveTourPrefs, shouldOfferWelcome } from "./storage";
import { scheduleReadyCheck } from "./autoAdvance";
import type { GuidedTourDefinition, GuidedTourStep, GuidedTourStepMode } from "./types";
import styles from "./GuidedTour.module.css";

type Props = {
  definition: GuidedTourDefinition;
  offerWelcomeOnMount?: boolean;
  active: boolean;
  onActiveChange: (active: boolean) => void;
  welcomeOpen: boolean;
  onWelcomeOpenChange: (open: boolean) => void;
  welcomeTitle: string;
  welcomeBody: string;
  welcomeStartLabel?: string;
  welcomeLaterLabel?: string;
  welcomeNeverLabel?: string;
  onCollectingComplete?: () => void;
  onDismiss?: () => void;
  initialStepIndex?: number;
  /** Fired once when the tour becomes active (welcome Başlat or openTour). */
  onTourStarted?: () => void;
  /** Hide spotlight while a page modal (e.g. preview) is open; tour stays active. */
  paused?: boolean;
};

function visibleSteps(def: GuidedTourDefinition): GuidedTourStep[] {
  const ctx = { getTargetEl: findTourTarget };
  return def.steps.filter((s) => !s.when || s.when(ctx));
}

function stepMode(step: GuidedTourStep): GuidedTourStepMode {
  return step.mode ?? (step.autoAdvance ? "auto" : "finish");
}

export function GuidedTourHost({
  definition,
  offerWelcomeOnMount = true,
  active,
  onActiveChange,
  welcomeOpen,
  onWelcomeOpenChange,
  welcomeTitle,
  welcomeBody,
  welcomeStartLabel = "Başlat",
  welcomeLaterLabel = "Kendim devam edeceğim",
  welcomeNeverLabel = "Bir daha gösterme",
  onCollectingComplete,
  onDismiss,
  initialStepIndex = 0,
  onTourStarted,
  paused = false,
}: Props) {
  const steps = useMemo(() => visibleSteps(definition), [definition]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement>("bottom");
  const [bubblePos, setBubblePos] = useState({ top: 24, left: 24 });

  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const offeredRef = useRef(false);
  const wasActiveRef = useRef(false);
  const userEditedRef = useRef(false);
  const advancingRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const stepsRef = useRef(steps);
  const pendingStartIndexRef = useRef<number | null>(null);
  const advanceToRef = useRef<(nextIndex: number) => void>(() => {});

  const safeIndex = Math.min(index, Math.max(0, steps.length - 1));
  const step = steps[safeIndex] ?? null;
  const mode = step ? stepMode(step) : "finish";
  const isLast = safeIndex >= steps.length - 1;

  indexRef.current = index;
  stepsRef.current = steps;

  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearActiveAttr = useCallback(() => {
    if (activeTargetRef.current) {
      activeTargetRef.current.removeAttribute("data-tour-active");
      activeTargetRef.current = null;
    }
  }, []);

  const closeTour = useCallback(() => {
    clearTimers();
    advancingRef.current = false;
    userEditedRef.current = false;
    clearActiveAttr();
    setRect(null);
    onActiveChange(false);
    onDismiss?.();
  }, [clearActiveAttr, clearTimers, onActiveChange, onDismiss]);

  const finishCollecting = useCallback(() => {
    clearTimers();
    advancingRef.current = false;
    userEditedRef.current = false;
    clearActiveAttr();
    setRect(null);
    onActiveChange(false);
    onCollectingComplete?.();
  }, [clearActiveAttr, clearTimers, onActiveChange, onCollectingComplete]);

  const advanceTo = useCallback(
    (nextIndex: number) => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      clearTimers();
      userEditedRef.current = false;
      if (nextIndex >= stepsRef.current.length) {
        finishCollecting();
        return;
      }
      setIndex(nextIndex);
      window.requestAnimationFrame(() => {
        advancingRef.current = false;
      });
    },
    [clearTimers, finishCollecting],
  );

  advanceToRef.current = advanceTo;

  const goNext = useCallback(() => {
    if (isLast) {
      finishCollecting();
      return;
    }
    advanceTo(safeIndex + 1);
  }, [advanceTo, finishCollecting, isLast, safeIndex]);

  const goPrev = useCallback(() => {
    clearTimers();
    advancingRef.current = false;
    userEditedRef.current = false;
    setIndex((i) => Math.max(0, i - 1));
  }, [clearTimers]);

  const startTour = useCallback(() => {
    clearTimers();
    advancingRef.current = false;
    userEditedRef.current = false;
    pendingStartIndexRef.current = 0;
    onWelcomeOpenChange(false);
    onActiveChange(true);
  }, [clearTimers, onActiveChange, onWelcomeOpenChange]);

  useEffect(() => {
    if (active && !wasActiveRef.current) {
      onTourStarted?.();
      clearTimers();
      advancingRef.current = false;
      userEditedRef.current = false;
      const max = Math.max(0, stepsRef.current.length - 1);
      const start = pendingStartIndexRef.current ?? initialStepIndex;
      pendingStartIndexRef.current = null;
      setIndex(Math.min(Math.max(0, start), max));
    }
    wasActiveRef.current = active;
  }, [active, clearTimers, initialStepIndex, onTourStarted]);

  const dismissWelcome = useCallback(
    (forever: boolean) => {
      if (forever) {
        saveTourPrefs(definition.id, { version: definition.version, neverShowWelcome: true });
      } else {
        const prev = loadTourPrefs(definition.id, definition.version);
        saveTourPrefs(definition.id, { ...prev, version: definition.version });
      }
      onWelcomeOpenChange(false);
    },
    [definition.id, definition.version, onWelcomeOpenChange],
  );

  useEffect(() => {
    if (!offerWelcomeOnMount || offeredRef.current) return;
    offeredRef.current = true;
    if (shouldOfferWelcome(definition.id, definition.version)) {
      onWelcomeOpenChange(true);
    }
  }, [definition.id, definition.version, offerWelcomeOnMount, onWelcomeOpenChange]);

  /* Spotlight sync — skip while paused (preview modal open) */
  useLayoutEffect(() => {
    if (!active || paused || !step) {
      clearActiveAttr();
      if (!active || paused) setRect(null);
      return;
    }

    let cancelled = false;
    const apply = async () => {
      let el = findTourTarget(step.target);
      if (!el) {
        if (!cancelled && safeIndex < steps.length - 1) advanceTo(safeIndex + 1);
        else if (!cancelled) finishCollecting();
        return;
      }
      await scrollTargetIntoView(el, step.scroll ?? "center");
      if (cancelled) return;
      el = findTourTarget(step.target);
      if (!el) return;

      clearActiveAttr();
      el.setAttribute("data-tour-active", "true");
      activeTargetRef.current = el;

      const r = readTargetRect(el);
      if (!r) return;
      const place = pickPlacement(r, step.placement ?? "auto", window.innerWidth, window.innerHeight);
      setPlacement(place);
      setRect({
        top: r.top - 6,
        left: r.left - 6,
        width: r.width + 12,
        height: r.height + 12,
      });
    };

    void apply();
    return () => {
      cancelled = true;
    };
  }, [active, paused, step, safeIndex, steps.length, clearActiveAttr, finishCollecting, advanceTo]);

  useLayoutEffect(() => {
    if (!active || paused || !rect || !bubbleRef.current) return;
    const bubbleH = bubbleRef.current.getBoundingClientRect().height || 200;
    const bubbleW = bubbleRef.current.getBoundingClientRect().width || 320;
    setBubblePos(placeBubble(rect, placement, window.innerWidth, window.innerHeight, bubbleW, bubbleH));
  }, [active, paused, rect, placement, step?.id, mode]);

  useEffect(() => {
    if (!active || paused || !step) return;
    const update = () => {
      const el = findTourTarget(step.target);
      const r = readTargetRect(el);
      if (!r) return;
      setRect({
        top: r.top - 6,
        left: r.left - 6,
        width: r.width + 12,
        height: r.height + 12,
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, paused, step]);

  useEffect(() => {
    if (!active && !welcomeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (welcomeOpen) dismissWelcome(false);
        else if (!paused) closeTour();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, welcomeOpen, paused, closeTour, dismissWelcome]);

  /**
   * Auto-advance — single mechanism:
   * - Listen to trusted input/change/keyup in capture (blur NOT required)
   * - Debounce, then poll live DOM readiness briefly (controlled/native date lag)
   * - Only after user edit on THIS step visit (geri sonrası anında fırlamaz)
   * - Effect deps avoid full `step` object so parent re-renders don't clear timers mid-type
   */
  useEffect(() => {
    if (!active || paused || mode !== "auto" || !step?.autoAdvance) return;

    const stepIndex = safeIndex;
    const delayMs = step.autoAdvance.delayMs ?? 500;
    const isReady = step.autoAdvance.isReady;
    let cancelled = false;

    userEditedRef.current = false;
    clearTimers();

    const tryAdvance = () => {
      if (cancelled || advancingRef.current) return;
      if (indexRef.current !== stepIndex) return;
      if (!userEditedRef.current) return;
      if (!isReady()) return;
      advanceToRef.current(stepIndex + 1);
    };

    const schedule = () => {
      if (cancelled || advancingRef.current) return;
      if (indexRef.current !== stepIndex) return;
      clearTimers();
      scheduleReadyCheck({
        delayMs,
        isReady,
        onReady: tryAdvance,
        isCancelled: () =>
          cancelled || advancingRef.current || indexRef.current !== stepIndex || !userEditedRef.current,
        setTimer: (id) => {
          debounceTimerRef.current = id;
        },
      });
    };

    const onUserEdit = (e: Event) => {
      if (!e.isTrusted) return;
      if (indexRef.current !== stepIndex) return;
      const t = e.target;
      if (t instanceof Element && !t.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      userEditedRef.current = true;
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        schedule();
      });
    };

    const el = findTourTarget(step.target);
    if (!el) return;

    el.addEventListener("input", onUserEdit, true);
    el.addEventListener("change", onUserEdit, true);
    el.addEventListener("keyup", onUserEdit, true);

    return () => {
      cancelled = true;
      clearTimers();
      el.removeEventListener("input", onUserEdit, true);
      el.removeEventListener("change", onUserEdit, true);
      el.removeEventListener("keyup", onUserEdit, true);
    };
  }, [active, paused, mode, safeIndex, step?.id, step?.target, step?.autoAdvance, clearTimers]);

  useEffect(
    () => () => {
      clearTimers();
      clearActiveAttr();
    },
    [clearTimers, clearActiveAttr],
  );

  const renderActions = () => {
    if (!step) return null;

    if (mode === "optional") {
      const skipLabel = step.optionalSkipLabel ?? "Ek ödemem yok";
      const confirmLabel = step.optionalConfirmLabel ?? "Ek ödemeleri tamamladım";
      return (
        <div className={styles.actions}>
          <Button variant="soft" size="sm" onClick={closeTour}>
            Kılavuzu kapat
          </Button>
          <span className={styles.actionsSpacer} />
          <Button variant="soft" size="sm" onClick={goPrev} disabled={safeIndex === 0}>
            Geri
          </Button>
          {!step.optionalHideSkip ? (
            <Button variant="soft" size="sm" onClick={goNext}>
              {skipLabel}
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={goNext}>
            {confirmLabel}
          </Button>
        </div>
      );
    }

    if (mode === "finish") {
      return (
        <div className={styles.actions}>
          <Button variant="soft" size="sm" onClick={closeTour}>
            Kılavuzu kapat
          </Button>
          <span className={styles.actionsSpacer} />
          <Button variant="soft" size="sm" onClick={goPrev} disabled={safeIndex === 0}>
            Geri
          </Button>
          <Button variant="primary" size="sm" onClick={goNext}>
            Kılavuzu tamamla
          </Button>
        </div>
      );
    }

    // auto: no İleri / Devam et / Atla — only close + back
    return (
      <div className={styles.actions}>
        <Button variant="soft" size="sm" onClick={closeTour}>
          Kılavuzu kapat
        </Button>
        <span className={styles.actionsSpacer} />
        {safeIndex > 0 ? (
          <Button variant="soft" size="sm" onClick={goPrev}>
            Geri
          </Button>
        ) : null}
      </div>
    );
  };

  const showOverlay = active && !paused && step && rect;

  return (
    <>
      {welcomeOpen ? (
        <div
          className={styles.welcomeOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-tour-welcome-title"
        >
          <div className={styles.welcomeCard}>
            <h2 id="guided-tour-welcome-title" className={styles.welcomeTitle}>
              {welcomeTitle}
            </h2>
            <p className={styles.welcomeBody}>{welcomeBody}</p>
            <div className={styles.welcomeActions}>
              <Button variant="primary" size="sm" onClick={startTour}>
                {welcomeStartLabel}
              </Button>
              <Button variant="soft" size="sm" onClick={() => dismissWelcome(false)}>
                {welcomeLaterLabel}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => dismissWelcome(true)}>
                {welcomeNeverLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showOverlay ? (
        <div className={styles.overlayRoot} aria-live="polite">
          <div
            className={styles.spotlight}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
            aria-hidden
          />
          <div
            ref={bubbleRef}
            className={styles.bubble}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`guided-tour-step-${step.id}`}
            style={{ top: bubblePos.top, left: bubblePos.left }}
          >
            <h3 id={`guided-tour-step-${step.id}`} className={styles.bubbleTitle}>
              {step.title}
            </h3>
            <p className={styles.bubbleBody}>{step.body}</p>
            <div className={styles.progress}>
              {safeIndex + 1} / {steps.length}
            </div>
            {renderActions()}
          </div>
        </div>
      ) : null}
    </>
  );
}
