import { HaftaTatiliCalcPage, type HaftaTatiliPageConfig } from "../lib/HaftaTatiliCalcPage";
import {
  applyGlobalCoefficient,
  buildAutoRows,
  calcKatsayi,
  computeGemiHaftaTatili,
} from "./engine";
import { createEmptyForm, NOTE_BLOCKS, snapshotKey, type GemiForm } from "./model";
import { loadCasesSafe, saveCase, deleteCase, clearCorruptCases } from "./storage";
import styles from "./HaftaTatiliGemiPage.module.css";

const config: HaftaTatiliPageConfig<GemiForm> = {
  pageTitle: "Gemi Adamı Hafta Tatili Alacağı",
  previewTitle: "Gemi Adamı Hafta Tatili Rapor",
  notes: NOTE_BLOCKS,
  showSeasonal: false,
  showGeceCalisan: false,
  createEmptyForm,
  snapshotKey,
  compute: computeGemiHaftaTatili,
  buildAutoRows,
  applyCoefficient: (form, k) => ({ ...form, globalCoefficient: k, rows: applyGlobalCoefficient(form.rows.length ? form.rows : buildAutoRows(form), k) }),
  calcKatsayi,
  storage: { loadCasesSafe, saveCase, deleteCase, clearCorruptCases },
  styles,
};

export default function HaftaTatiliGemiPage() {
  return <HaftaTatiliCalcPage config={config} />;
}
