import type { GuidedTourPrefs } from "./types";

const PREFIX = "bh.guidedTour";

function storageKey(tourId: string): string {
  return `${PREFIX}.${tourId}`;
}

export function loadTourPrefs(tourId: string, version: number): GuidedTourPrefs {
  try {
    const raw = localStorage.getItem(storageKey(tourId));
    if (!raw) return { version, neverShowWelcome: false };
    const parsed = JSON.parse(raw) as Partial<GuidedTourPrefs>;
    const storedVersion = typeof parsed.version === "number" ? parsed.version : 0;
    // Version bump re-enables the welcome offer.
    if (storedVersion < version) {
      return { version, neverShowWelcome: false };
    }
    return {
      version: storedVersion,
      neverShowWelcome: Boolean(parsed.neverShowWelcome),
    };
  } catch {
    return { version, neverShowWelcome: false };
  }
}

export function saveTourPrefs(tourId: string, prefs: GuidedTourPrefs): void {
  try {
    localStorage.setItem(storageKey(tourId), JSON.stringify(prefs));
  } catch {
    // private mode / quota — ignore
  }
}

export function shouldOfferWelcome(tourId: string, version: number): boolean {
  return !loadTourPrefs(tourId, version).neverShowWelcome;
}
