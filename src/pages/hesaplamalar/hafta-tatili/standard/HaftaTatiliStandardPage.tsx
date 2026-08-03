import { HaftaTatiliCalcPage, type HaftaTatiliPageConfig } from "../lib/HaftaTatiliCalcPage";
import {
  applyGlobalCoefficient,
  buildAutoRows,
  calcKatsayi,
  computeStandardHaftaTatili,
} from "./engine";
import { createEmptyForm, NOTE_BLOCKS, snapshotKey, type StandardForm } from "./model";
import { loadCasesSafe, saveCase, deleteCase, clearCorruptCases } from "./storage";
import styles from "./HaftaTatiliStandardPage.module.css";

const config: HaftaTatiliPageConfig<StandardForm> = {
  pageTitle: "Standart Hafta Tatili Alacağı",
  previewTitle: "Standart Hafta Tatili Rapor",
  notes: NOTE_BLOCKS,
  showSeasonal: true,
  showGeceCalisan: false,
  createEmptyForm,
  snapshotKey,
  compute: computeStandardHaftaTatili,
  buildAutoRows,
  applyCoefficient: (form, k) => ({ ...form, globalCoefficient: k, rows: applyGlobalCoefficient(form.rows.length ? form.rows : buildAutoRows(form), k) }),
  calcKatsayi,
  storage: { loadCasesSafe, saveCase, deleteCase, clearCorruptCases },
  styles,
};

export default function HaftaTatiliStandardPage() {
  return <HaftaTatiliCalcPage config={config} />;
}
