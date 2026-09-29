const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle,
} = require("docx");

const rows = JSON.parse(fs.readFileSync("_scripts/brand-scarpe.json", "utf8"));
const ACCENT = "1F3864";
const HEAD_BG = "E8EDF5";
const MISS_BG = "FDF3F2";

const t = (s, o = {}) => new TextRun({ text: s, ...o });
const p = (children, o = {}) =>
  new Paragraph({
    children: Array.isArray(children) ? children : [t(children)],
    spacing: { after: o.after ?? 120, before: o.before ?? 0 },
    border: o.border,
  });

const cell = (runs, { width, bg, align } = {}) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: bg ? { type: ShadingType.CLEAR, fill: bg, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 110, right: 110 },
    children: [
      new Paragraph({
        alignment: align,
        spacing: { after: 0 },
        children: Array.isArray(runs) ? runs : [t(runs)],
      }),
    ],
  });

const WIDTHS = [520, 4000, 4500];

const header = new TableRow({
  tableHeader: true,
  children: [
    cell([t("", { bold: true })], { width: WIDTHS[0], bg: HEAD_BG }),
    cell([t("Brand", { bold: true })], { width: WIDTHS[1], bg: HEAD_BG }),
    cell([t("Guida già disponibile", { bold: true })], { width: WIDTHS[2], bg: HEAD_BG }),
  ],
});

const body = rows.map(([brand, hit]) =>
  new TableRow({
    children: [
      cell([t(hit ? "✓" : "☐", { bold: true, color: hit ? "2E7D32" : "999999" })], {
        width: WIDTHS[0], align: AlignmentType.CENTER, bg: hit ? undefined : MISS_BG,
      }),
      cell([t(brand, { bold: !hit })], { width: WIDTHS[1], bg: hit ? undefined : MISS_BG }),
      cell(
        hit
          ? [t("sì — scheda “" + hit + "” nel workbook", { color: "2E7D32" })]
          : [t("DA RECUPERARE", { color: "B03A2E", bold: true })],
        { width: WIDTHS[2], bg: hit ? undefined : MISS_BG },
      ),
    ],
  }),
);

const covered = rows.filter(([, h]) => h).length;

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Calibri", size: 20 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", run: { size: 40, bold: true, color: ACCENT, font: "Calibri" }, paragraph: { spacing: { after: 80 } } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: ACCENT, font: "Calibri" }, paragraph: { spacing: { before: 300, after: 120 } } },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    children: [
      new Paragraph({ text: "Brand calzature — guide taglie da recuperare", style: "Title" }),
      p([t("Catalogo Eleonora Bonucci · " + rows.length + " brand con prodotti calzatura · rilevazione del 25 settembre 2026", { color: "666666" })],
        { after: 200, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C9D3E4", space: 8 } } }),
      p([
        t(String(covered), { bold: true }), t(" brand hanno già una scheda nel workbook CONVERSIONE TAGLIE. "),
        t("Per i restanti " + (rows.length - covered) + " serve la guida ufficiale del produttore.", { bold: true }),
      ]),
      p([
        t("Cosa serve per ognuno: ", { bold: true }),
        t("lo screenshot della tabella di conversione dal sito ufficiale del brand, con visibili le colonne EU, UK, US e CM, e — se il brand le distingue — le righe uomo e donna separate. Indicare sempre la pagina da cui è stata presa."),
      ]),
      p([
        t("Nota: ", { bold: true }),
        t("le righe con la spunta verde non vanno cercate, ma alcune di quelle schede hanno dati incompleti o errati (vedi il documento sulle lacune del workbook). Le due liste vanno lette insieme."),
      ], { after: 240 }),
      new Table({ columnWidths: WIDTHS, width: { size: WIDTHS.reduce((a, b) => a + b, 0), type: WidthType.DXA }, rows: [header, ...body] }),
    ],
  }],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(process.argv[2] || "Brand-calzature-guide-taglie.docx", b);
  console.log("written", rows.length, "brand");
});
