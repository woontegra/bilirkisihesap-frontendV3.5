import * as XLSX from "xlsx";
import type { ParsedDocument, ParsedSheet } from "../model";

/**
 * Excel (.xlsx/.xls) ayrıştırma — SheetJS ile, tamamen tarayıcı içinde.
 * Her sekme, ham hücre matrisine (string) dönüştürülür.
 */
export async function parseExcel(file: File): Promise<ParsedDocument> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const sheets: ParsedSheet[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const json = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const grid = json.map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? "" : String(c))) : []));
    sheets.push({ name: name || `Sayfa ${sheets.length + 1}`, grid });
  }

  return {
    fileName: file.name,
    kind: "excel",
    sheets,
    warnings: sheets.length === 0 ? ["Excel dosyasında okunabilir sayfa bulunamadı."] : [],
  };
}
