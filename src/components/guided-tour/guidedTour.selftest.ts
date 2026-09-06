/**
 * Guided tour storage + auto-advance helpers — unit checks.
 */
import assert from "node:assert/strict";
import {
  datesReadyIn,
  isValidDatePair,
  parseTourMoney,
  scheduleReadyCheck,
  wageReadyIn,
} from "./autoAdvance";
import { loadTourPrefs, saveTourPrefs, shouldOfferWelcome } from "./storage";
import { pickPlacement, placeBubble } from "./geometry";

const mem = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => mem.set(k, v),
    removeItem: (k: string) => mem.delete(k),
  },
  configurable: true,
});

mem.clear();
assert.equal(shouldOfferWelcome("__test-tour__", 1), true);
saveTourPrefs("__test-tour__", { version: 1, neverShowWelcome: true });
assert.equal(shouldOfferWelcome("__test-tour__", 1), false);
assert.equal(loadTourPrefs("__test-tour__", 1).neverShowWelcome, true);
assert.equal(shouldOfferWelcome("__test-tour__", 2), true);

assert.equal(isValidDatePair("2020-01-01", "2021-01-01"), true);
assert.equal(isValidDatePair("2021-01-01", "2020-01-01"), false);
assert.equal(isValidDatePair("", "2020-01-01"), false);
assert.equal(parseTourMoney("27.000,50"), 27000.5);
assert.equal(parseTourMoney("27000"), 27000);
assert.equal(parseTourMoney(""), 0);

assert.equal(datesReadyIn(null), false);
assert.equal(wageReadyIn(null), false);

const rect = { top: 100, left: 100, width: 200, height: 40 };
assert.equal(pickPlacement(rect, "auto", 800, 600), "bottom");
const pos = placeBubble(rect, "top", 800, 600, 320, 200);
assert.ok(pos.top < rect.top);

await new Promise<void>((resolve, reject) => {
  let calls = 0;
  let timer: number | null = null;
  scheduleReadyCheck({
    delayMs: 30,
    isReady: () => {
      calls += 1;
      return calls >= 2;
    },
    onReady: () => {
      try {
        assert.ok(calls >= 2);
        resolve();
      } catch (e) {
        reject(e);
      }
    },
    isCancelled: () => false,
    setTimer: (id) => {
      timer = id;
    },
    maxPolls: 5,
    pollMs: 20,
  });
  void timer;
});

mem.clear();
console.log("guided-tour.selftest: geçti ✔");
