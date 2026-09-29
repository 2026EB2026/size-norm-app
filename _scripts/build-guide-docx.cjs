const fs = require("fs");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  AlignmentType,
  BorderStyle,
  LevelFormat,
} = require("docx");

const W = 9020; // usable content width on A4 with default margins (DXA)
const ACCENT = "1F3864";
const HEAD_BG = "E8EDF5";

const text = (t, o = {}) => new TextRun({ text: t, ...o });

const p = (t, o = {}) =>
  new Paragraph({
    children: Array.isArray(t) ? t : [text(t, o.run || {})],
    spacing: { after: o.after ?? 120, before: o.before ?? 0 },
    alignment: o.alignment,
    border: o.border,
  });

const h = (t, level) =>
  new Paragraph({
    text: t,
    heading: level,
    spacing: { before: 300, after: 140 },
  });

const cell = (children, { width, bold = false, bg, align } = {}) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: bg ? { type: ShadingType.CLEAR, fill: bg, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: [
      new Paragraph({
        alignment: align,
        spacing: { after: 0 },
        children: [text(children, { bold })],
      }),
    ],
  });

/** Table from a header row + body rows, with explicit DXA widths. */
function table(headers, rows, widths) {
  return new Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((t, i) =>
          cell(t, { width: widths[i], bold: true, bg: HEAD_BG }),
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((t, i) =>
              cell(String(t), {
                width: widths[i],
                align: i > 0 && /^\d+$/.test(String(t)) ? AlignmentType.CENTER : undefined,
              }),
            ),
          }),
      ),
    ],
  });
}

const bullets = (items) =>
  items.map(
    (t) =>
      new Paragraph({
        text: t,
        numbering: { reference: "dash", level: 0 },
        spacing: { after: 60 },
      }),
  );

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "dash",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "–",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 180 } } },
          },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21 } },
    },
    paragraphStyles: [
      {
        id: "Title",
        name: "Title",
        run: { size: 40, bold: true, color: ACCENT, font: "Calibri" },
        paragraph: { spacing: { after: 80 } },
      },
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, color: ACCENT, font: "Calibri" },
        paragraph: { spacing: { before: 340, after: 140 } },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 23, bold: true, color: "333333", font: "Calibri" },
        paragraph: { spacing: { before: 240, after: 100 } },
      },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children: [
        new Paragraph({ text: "Guide taglie ufficiali — cosa manca", style: "Title" }),
        p(
          [
            text("Catalogo Eleonora Bonucci · rilevazione del 23 settembre 2026", {
              color: "666666",
            }),
          ],
          {
            after: 200,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C9D3E4", space: 8 } },
          },
        ),

        p([
          text("121 vendor di calzature", { bold: true }),
          text(" a catalogo (prodotti con tag "),
          text("SUPERGRUPPO_Footwear", { font: "Consolas", size: 19 }),
          text(") confrontati con le "),
          text("55 schede adulto", { bold: true }),
          text(" del workbook CONVERSIONE TAGLIE."),
        ]),
        p([
          text("Copertura attuale: ", { bold: true }),
          text("27 vendor su 121.", { bold: true, color: "B03A2E" }),
          text(
            " Il numero tra parentesi indica quanti prodotti calzatura ha quel vendor oggi a catalogo: serve a dare l'ordine di priorità.",
          ),
        ]),

        h("0 · Non serve cercare niente — sono solo nomi da mappare", HeadingLevel.HEADING_1),
        p("Il workbook la guida ce l'ha, ma il nome non combacia con il vendor Shopify."),
        table(
          ["Vendor Shopify", "Scheda nel workbook"],
          [
            ["Adidas Originals (18)", "ADIDAS"],
            ["Y-3 (2)", "ADIDAS Y-3"],
            ["Michael by Michael Kors (1)", "MICHAEL BY MICHAEL KORS MMK"],
            ["Telfar x Converse (2)", "CONVERSE"],
            ["Comme des Garçons Play x Converse (3)", "CONVERSE"],
            ["Alexa Chung x Superga (1)", "Superga — non presente, serve la guida"],
            ["Marni x Carhartt WIP (1)", "Marni — non presente, serve la guida"],
            ["Dr. Martens x Rick Owens (1)", "DR. MARTENS o RICK OWENS? da decidere"],
            ["McQ Alexander McQueen (1)", "ALEXANDER MCQUEEN? da decidere"],
            ["MM6 Maison Margiela (2)", "MAISON MARGIELA? da decidere"],
          ],
          [3800, 5220],
        ),
        p(
          "Le ultime tre sono linee sorelle: condividono la calzata della casa madre o no? È una domanda per il reparto acquisti, non una ricerca.",
          { before: 140 },
        ),

        h("1 · Priorità alta — da cercare subito (5+ prodotti)", HeadingLevel.HEADING_1),
        table(
          ["Brand", "Prodotti", "Note"],
          [
            ["Jude", "14", "bambino"],
            ["Crocs", "11", "ha una scala proprietaria (M/W combinata)"],
            ["Gia Borghini", "11", ""],
            ["Giuseppe Zanotti", "11", ""],
            ["Stella McCartney", "10", ""],
            ["Jil Sander", "9", ""],
            ["Moschino", "8", ""],
            ["Forward", "7", ""],
            ["N°21", "7", ""],
            ["Ash", "6", ""],
            ["Chipie", "6", "bambino"],
            ["Comme des Garçons Shirt", "6", ""],
            ["Gienchi", "6", ""],
            ["MSGM", "6", ""],
            ["Puraai", "6", ""],
            ["Ambush", "5", ""],
            ["Fila", "5", ""],
            ["Manebi", "5", ""],
            ["Saint Laurent", "5", ""],
            ["Versace", "5", ""],
          ],
          [3000, 1100, 4920],
        ),

        h("2 · Priorità media (2-4 prodotti)", HeadingLevel.HEADING_1),
        ...bullets([
          "4 prodotti: By Far · Dsquared2 · Givenchy · Gucci · Hunter · Nicholas Kirkwood · Strategia For Lino Ricci",
          "3 prodotti: Clarks · Comme des Garçons Play x Converse · Enterprise Japan · Guidi · Khaite · Superga · Veja",
          "2 prodotti: Buttero · Giannico · Jacquemus · Jejia · LAutre Chose · Marni · Neous · Palm Angels · Philosophy di Lorenzo Serafini · Pom dApi · Raf Simons · Sam Edelman · Yeezy · Yume Yume · Zegna",
        ]),

        h("3 · Coda lunga (1 prodotto)", HeadingLevel.HEADING_1),
        p(
          "1017 Alyx 9SM · 3.1 Phillip Lim · Aeyde · Alberta Ferretti · Alexander Wang · Bonpoint · Buffalo · Chiara Ferragni · Colors of California · Dior Homme · Dries Van Noten · Elena Iachi · ETRO · GCDS · Hender Scheme · Hinnominate · JW Anderson · Lemaire · Missoni · Moaconcept · Moncler Genius · Nodaleto · Patou · Philippe Model · Premiata · PS Paul Smith · Reebok · Skorpios · Spalwart · Stone Island · Sunnei · Super Smalls · Tory Burch · Versace Jeans Couture · Xocoi · YMC x Solovair",
        ),

        h("4 · Già nel workbook, ma i dati vanno rifatti o completati", HeadingLevel.HEADING_1),
        p("Non sono da cercare da zero: la scheda c'è, ma non è utilizzabile così com'è."),
        table(
          ["Brand", "Problema"],
          [
            [
              "ADIDAS",
              "Colonna UK sbagliata: manca il gradino UK 4 e da lì è la copia esatta della US uomo. Verificato contro adidas.it — EU/US/CM combaciano, la UK no. Critico: i prodotti adidas sono etichettati in UK",
            ],
            [
              "CONVERSE X DRKSHDW DBL DARKSTAR",
              "UK identica alla US su tutte e 20 le righe. Su Converse può essere corretto (Chuck Taylor): da confermare",
            ],
            ["SAUCONY", "Solo colonna EU: nessuna conversione"],
            ["KANGOL", "Solo CM — sono cappelli, probabilmente fuori scope"],
            ["BIRKENSTOCK", "Solo uomo, EU+UK, nessuna US"],
            ["TOD'S", "Solo uomo, manca la donna"],
            ["HOGAN", "Donna 11 righe contro le 23 dell'uomo"],
            ["KEEN", "Uomo senza US, donna senza UK"],
            ["DIEMME", "Donna senza UK"],
          ],
          [3000, 6020],
        ),

        h("5 · Gli 8 blocchi KIDS sono illeggibili", HeadingLevel.HEADING_1),
        p(
          "DR. MARTENS KIDS · GOLDEN GOOSE KIDS · NEW BALANCE KIDS · CONVERSE KIDS · VANS KIDS · UGG KIDS · MOON BOOT KIDS · VEJA KIDS",
          { run: { bold: true } },
        ),
        p(
          "Stanno nelle colonne di appendice a destra del foglio, dove le intestazioni US/UK/JPN/EU si ripetono tre o quattro volte senza indicare la fascia d'età. Servono le guide ufficiali, oppure qualcuno che dica quale gruppo di colonne corrisponde a quale fascia.",
        ),

        h("6 · Guide nel workbook senza prodotti a catalogo", HeadingLevel.HEADING_1),
        p(
          "Pronte per quando quei brand rientreranno, oppure segno che il catalogo importato è ancora parziale.",
        ),
        p(
          "AMIRI · ASICS · AUTRY · AXEL ARIGATO · CAREL PARIS · CASTANER · CONVERSE · FENDI · G.H. BASS · GANNI · HOKA · KEEN · MOON BOOT · OFF WHITE · REDWING · SALOMON · SATISFY · SAUCONY · TIMBERLAND · TOD'S",
        ),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2] || "Guide-taglie-da-cercare.docx", buf);
  console.log("written");
});
