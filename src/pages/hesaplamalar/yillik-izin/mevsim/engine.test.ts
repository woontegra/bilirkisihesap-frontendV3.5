import { computeYillikMevsimResult } from "./engine";
import { createEmptyForm } from "./model";
const r = computeYillikMevsimResult({ ...createEmptyForm(), startDate: "2018-01-01", endDate: "2023-01-01", brut: "25.000" });
if (r.totalEntitlement !== 70) throw new Error(`yillik-mevsim engine.test: expected 70 got ${r.totalEntitlement}`);
console.log("yillik-mevsim engine.test: 1 test geçti ✔");
