import { MAPPABLE_FIELDS } from "./fieldCatalog";
import type { ColumnMapping, MappableFieldKey, ParsedSheet, TableView } from "./model";
import { buildTableFromGeometry, type GeomLine } from "./pdfLayout";
import { normalizeText } from "./utils";

/**
 * Otomatik başlık satırı tespiti ve sütun → standart alan tahmini.
 * Tahminler yalnızca öneridir; kullanıcı onayı olmadan hesaplamaya geçilmez.
 *
 * PDF'de sütun şeması seçilen başlık satırının geometrisinden üretilir;
 * veri satırlarının x koordinatları yeni sütun açmaz.
 */

/** İlk ~12 satır içinde en çok metinsel/dolu hücreye sahip satırı başlık kabul eder. */
export function guessHeaderRowIndex(grid: string[][]): number {
  const limit = Math.min(grid.length, 12);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const cells = grid[i] ?? [];
    const nonEmpty = cells.filter((c) => (c ?? "").toString().trim() !== "").length;
    const textual = cells.filter((c) => /[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test((c ?? "").toString())).length;
    const score = nonEmpty + textual * 1.5;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Başlık satırından sütun sayısını türetir.
 * Sondaki tamamen boş hücreler atılır; ortadaki boş hücreler "Sütun N" olur.
 * Veri satırı genişliği sütun sayısını ASLA artırmaz.
 */
export function headersFromRow(headerRow: string[]): string[] {
  const raw = (headerRow ?? []).map((c) => (c ?? "").toString().trim());
  let end = raw.length;
  while (end > 0 && raw[end - 1] === "") end -= 1;
  const sliced = raw.slice(0, end);
  return sliced.map((h, i) => h || `Sütun ${i + 1}`);
}

/** ParsedSheet + başlık satırından normalize edilmiş TableView üretir. */
export function toTableView(sheet: ParsedSheet, headerRowIndex: number, pageNumber: number): TableView {
  if (sheet.geometry && sheet.geometry.length > 0) {
    const built = buildTableFromGeometry(sheet.geometry as GeomLine[], headerRowIndex);
    return {
      headers: built.headers,
      rows: built.rows,
      headerRowIndex: built.headerRowIndex,
      sheetName: sheet.name,
      pageNumber,
    };
  }

  const grid = sheet.grid;
  const headerRow = grid[headerRowIndex] ?? [];
  const headers = headersFromRow(headerRow);
  const colCount = headers.length;

  const rows: string[][] = [];
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const src = grid[r] ?? [];
    const normalized: string[] = [];
    for (let c = 0; c < colCount; c++) normalized.push((src[c] ?? "").toString().trim());
    // Tekrar eden başlık satırını atla (Excel/CSV nadiren, PDF birleşik grid için).
    if (isDuplicateHeader(normalized, headers)) continue;
    if (normalized.every((c) => c === "")) continue;
    rows.push(normalized);
  }

  return { headers, rows, headerRowIndex, sheetName: sheet.name, pageNumber };
}

function isDuplicateHeader(row: string[], headers: string[]): boolean {
  const hNorm = headers.map((h) => normalizeText(h)).filter(Boolean);
  if (hNorm.length < 3) return false;
  let matches = 0;
  for (let i = 0; i < hNorm.length; i++) {
    if (normalizeText(row[i] ?? "") === hNorm[i]) matches += 1;
  }
  return matches >= Math.max(3, Math.ceil(hNorm.length * 0.6));
}

type Candidate = { field: MappableFieldKey; score: number };

/**
 * Başlık skorlaması — daha uzun anahtar kelime eşleşmesine öncelik verir.
 * "Mesai Açıklama" → Esas Çalışma Saat Aralığı (genel Açıklama / tek giriş değil).
 * "İzin Açıklama" → izin/tatil.
 */
function scoreHeader(header: string): Candidate | null {
  const norm = normalizeText(header);
  if (!norm) return null;

  if (norm === "mesai aciklama" || norm.includes("mesai aciklama")) {
    return { field: "esasCalismaSaatAraligi", score: 1.1 };
  }
  if (norm === "izin aciklama" || norm.includes("izin aciklama")) {
    return { field: "izinTatilKodu", score: 1.1 };
  }
  if (norm === "esas calisma saat araligi" || norm.includes("saat araligi")) {
    return { field: "esasCalismaSaatAraligi", score: 1.05 };
  }
  if (norm.includes("kart") && (norm.includes("aralik") || norm.includes("giris cikis"))) {
    return { field: "kartSaatAraligi", score: 1.05 };
  }

  let best: Candidate | null = null;
  for (const field of MAPPABLE_FIELDS) {
    for (const kw of field.keywords) {
      const nkw = normalizeText(kw);
      if (!nkw) continue;
      let score = 0;
      if (norm === nkw) score = 1;
      else if (norm.startsWith(nkw) || norm.endsWith(nkw)) score = 0.85;
      else if (norm.includes(nkw)) score = 0.7;
      else if (nkw.includes(norm) && norm.length >= 3) score = 0.55;
      if (score > 0) {
        score += Math.min(0.08, nkw.length * 0.004);
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { field: field.key as MappableFieldKey, score };
      }
    }
  }
  return best;
}

/**
 * Başlıklardan sütun eşlemelerini tahmin eder. Aynı alana birden çok sütun
 * eşleşirse en yüksek güvenli olan kalır; diğerleri "review" olur.
 */
export function autoDetectMappings(headers: string[]): ColumnMapping[] {
  const candidates = headers.map((h) => scoreHeader(h));

  const bestByField = new Map<MappableFieldKey, { colIndex: number; score: number }>();
  candidates.forEach((cand, colIndex) => {
    if (!cand) return;
    const existing = bestByField.get(cand.field);
    if (!existing || cand.score > existing.score) {
      bestByField.set(cand.field, { colIndex, score: cand.score });
    }
  });

  return headers.map((header, columnIndex) => {
    const cand = candidates[columnIndex];
    if (cand && bestByField.get(cand.field)?.colIndex === columnIndex) {
      return {
        columnIndex,
        header,
        mode: "field",
        field: cand.field,
        autoGuessed: true,
        confidence: cand.score,
      } satisfies ColumnMapping;
    }
    return {
      columnIndex,
      header,
      mode: "review",
      autoGuessed: false,
      confidence: cand?.score ?? 0,
    } satisfies ColumnMapping;
  });
}
