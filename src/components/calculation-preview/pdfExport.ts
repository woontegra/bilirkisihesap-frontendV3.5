import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { buildPrintHtmlFromSections } from "./reportLocal";
import type { PreviewSection } from "./types";

const PDF_CSS = `
  body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; font-size: 11px; }
  h1 { font-size: 14px; margin: 0 0 1rem; }
  .section { margin-bottom: 1rem; }
  .section-title { color: #4338ca; font-size: 12px; font-weight: 600; margin: 0 0 0.35rem; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #999; font-size: 10px; }
  th, td { border: 1px solid #999; padding: 5px 8px; }
  th { background: #f3f4f6; font-weight: 600; text-align: left; }
  td:last-child, th:last-child { text-align: right; }
  tr.row-blue td { background: #dbeafe; font-weight: 600; }
  tr.row-green td { background: #dcfce7; font-weight: 600; color: #16a34a; }
  td.neg { color: #dc2626; }
  td.pos { color: #16a34a; }
`;

function slugifyFileName(title: string): string {
  return title
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

/**
 * Önizleme bölümlerinden doğrudan PDF dosyası indirir (yazdır diyaloğu açmaz).
 * Kopya ikonları dahil edilmez.
 */
export async function downloadPreviewPdf(
  title: string,
  sections: PreviewSection[],
  fileName?: string,
): Promise<void> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:850px;padding:20px;box-sizing:border-box;background:#fff;z-index:-1;";
  host.innerHTML = `<style>${PDF_CSS}</style><h1>${title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</h1>${buildPrintHtmlFromSections(sections)}`;
  document.body.appendChild(host);

  try {
    await new Promise((r) => window.setTimeout(r, 50));
    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: host.scrollWidth,
      height: host.scrollHeight,
    });

    const imageData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const ratio = canvas.width / usableWidth;
    const pdfImageHeight = canvas.height / ratio;

    let heightLeft = pdfImageHeight;
    let position = 0;

    pdf.addImage(imageData, "PNG", margin, margin, usableWidth, Math.min(pdfImageHeight, usableHeight));
    heightLeft -= usableHeight;

    while (heightLeft > 0) {
      position = heightLeft - pdfImageHeight;
      pdf.addPage();
      pdf.addImage(imageData, "PNG", margin, position + margin, usableWidth, pdfImageHeight);
      heightLeft -= usableHeight;
    }

    const date = new Date().toISOString().slice(0, 10);
    pdf.save(fileName || `${slugifyFileName(title)}_${date}.pdf`);
  } finally {
    host.remove();
  }
}
