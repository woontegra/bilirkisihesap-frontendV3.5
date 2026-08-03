import { HaftaTatiliCalcPage, type HaftaTatiliPageConfig } from "../lib/HaftaTatiliCalcPage";
import {
  applyGlobalCoefficient,
  buildAutoRows,
  calcKatsayi,
  computeBasinHaftaTatili,
} from "./engine";
import { createEmptyForm, NOTE_BLOCKS, snapshotKey, type BasinForm, weekDayMultiplier } from "./model";
import { loadCasesSafe, saveCase, deleteCase, clearCorruptCases } from "./storage";
import styles from "./HaftaTatiliBasinPage.module.css";

const config: HaftaTatiliPageConfig<BasinForm> = {
  pageTitle: "Basın İş Hafta Tatili Alacağı",
  previewTitle: "Basın İş Hafta Tatili Rapor",
  notes: NOTE_BLOCKS,
  showSeasonal: false,
  showGeceCalisan: true,
  createEmptyForm,
  snapshotKey,
  compute: computeBasinHaftaTatili,
  buildAutoRows,
  applyCoefficient: (form, k) => ({
    ...form,
    globalCoefficient: k,
    rows: applyGlobalCoefficient(form.rows.length ? form.rows : buildAutoRows(form), k, weekDayMultiplier(form)),
  }),
  calcKatsayi,
  storage: { loadCasesSafe, saveCase, deleteCase, clearCorruptCases },
  styles,
};

export default function HaftaTatiliBasinPage() {
  return <HaftaTatiliCalcPage config={config} />;
}
