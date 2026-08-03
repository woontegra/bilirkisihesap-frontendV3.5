import type { NoteBlock } from "../lib/types";

export const NOTE_BLOCKS: NoteBlock[] = [
  { text: "4857 sayılı İş Kanunu — Madde 53", kind: "heading" },
  {
    text: "Bir yıldan beş yıla kadar (beş yıl dahil) ondört gün; beş yıldan fazla onbeş yıldan az yirmi gün; onbeş yıl (dahil) ve daha fazla yirmialtı günden az olamaz.",
    kind: "li",
  },
  {
    text: "Yer altı işlerinde çalışan işçilerin yıllık ücretli izin süreleri dörder gün arttırılarak uygulanır.",
    kind: "li",
  },
  {
    text: "Onsekiz ve daha küçük yaştaki işçilerle elli ve daha yukarı yaştaki işçilere verilecek yıllık ücretli izin süresi yirmi günden az olamaz.",
    kind: "li",
  },
  { text: "Davacı, kullandığı yıllık izin günlerini kendi beyanları ve imzalı izin formlarıyla ispatlayabilir.", kind: "li" },
  { text: "İşten çıkış tarihinde yıllık izin bedeli ödemesi yapılmışsa mahsup edilmelidir.", emphasis: "warning" },
];
