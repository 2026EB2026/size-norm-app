# -*- coding: utf-8 -*-
"""Genera app/lib/conversion/new-balance-tables.ts dalla guida ufficiale.

Fonte: https://www.newbalance.it/it/size-guide.html, letta il 2026-10-21.

New Balance pubblica tabelle diverse per uomo, donna e bambino, e i suoi
prodotti arrivano dall'ERP su QUATTRO scale diverse, quindi una tabella sola
non basta:

  BQ   Scarpe USA UO/DO 1.5   57 prodotti   etichette M6/W7.5
  #BM  Bambino Scarpe US      36 prodotti   etichette K7 / 5.5
  AG   Scarpe Unisex USA       4 prodotti
  R    Scarpe Donna USA        3 prodotti
  P    Scarpe Uomo USA         1 prodotto

Rigenerare con:  python _scripts/genera-new-balance.py
"""
import io, json, re

# (EU, cm, UK, US uomo, US donna) — tabella uomo (larghezza standard D).
UOMO = [
 ("34",20.5,"2","2.5","4"),("35",21,"2.5","3","4.5"),("35.5",21.5,"3","3.5","5"),
 ("36",22,"3.5","4","5.5"),("37",22.5,"4","4.5","6"),("37.5",23,"4.5","5","6.5"),
 ("38",23.5,"5","5.5","7"),("38.5",24,"5.5","6","7.5"),("39.5",24.5,"6","6.5","8"),
 ("40",25,"6.5","7","8.5"),("40.5",25.5,"7","7.5","9"),("41.5",26,"7.5","8","9.5"),
 ("42",26.5,"8","8.5","10"),("42.5",27,"8.5","9","10.5"),("43",27.5,"9","9.5","11"),
 ("44",28,"9.5","10","11.5"),("44.5",28.5,"10","10.5","12"),("45",29,"10.5","11","12.5"),
 ("45.5",29.5,"11","11.5","13"),("46.5",30,"11.5","12","13.5"),("47",30.5,"12","12.5","14"),
 ("47.5",31,"12.5","13","14.5"),("48.5",31.5,"13","13.5","15"),("49",32,"13.5","14","15.5"),
 ("50",33,"14.5","15","16.5"),("51",34,"15.5","16","17.5"),("52",35,"16.5","17","18.5"),
 ("53",36,"17.5","18","19.5"),("54",37,"18.5","19",None),("55",38,"19.5","20",None)]

# Tabella donna (larghezza standard B).
DONNA = [
 ("34",21,"2","2.5","4"),("34.5",21.5,"2.5","3","4.5"),("35",22,"3","3.5","5"),
 ("36",22.5,"3.5","4","5.5"),("36.5",23,"4","4.5","6"),("37",23.5,"4.5","5","6.5"),
 ("37.5",24,"5","5.5","7"),("38",24.5,"5.5","6","7.5"),("39",25,"6","6.5","8"),
 ("40",25.5,"6.5","7","8.5"),("40.5",26,"7","7.5","9"),("41",26.5,"7.5","8","9.5"),
 ("41.5",27,"8","8.5","10"),("42.5",27.5,"8.5","9","10.5"),("43",28,"9","9.5","11"),
 ("43.5",28.5,"9.5","10","11.5"),("44",29,"10","10.5","12"),("45",29.5,"10.5","11","12.5"),
 ("45.5",30,"11","11.5","13"),("46",30.5,"11.5","12","13.5"),("46.5",31,"12","12.5","14")]

# Bambino: (EU, cm, UK, US bambino). UK None dove la fonte ha un refuso.
BIMBO_PICCOLO = [
 ("15",8,"0","0"),("16",8.5,"0.5","1"),("16.5",9,"1","1.5"),("17",9.5,"1.5","2"),
 ("18",10,"2","2.5"),("18.5",10,"2.5","3"),("19",10.5,"3","3.5"),("20",11,"3.5","4"),
 ("20.5",11.5,"4","4.5"),("21",12,"4.5","5"),("21.5",12,"5","5.5"),("22.5",12.5,"5.5","6"),
 ("23",13,"6","6.5"),("23.5",13.5,"6.5","7"),("24",14,"7","7.5"),("25",14.5,"7.5","8"),
 ("25.5",15,"8","8.5"),("26",15,"8.5","9"),("26.5",15.5,"9","9.5"),("27.5",16,"9.5","10"),
 ("28",16.5,"10","10.5"),("28.5",17,"10.5","11"),("29",17.5,"11","11.5"),
 ("30",17.5,"11.5","12"),("30.5",18,"12","12.5"),("31",18.5,"12.5","13"),("32",19,"13","13.5")]

# Youth: riparte da 1 dopo il 13.5.
BIMBO_YOUTH = [
 ("32.5",19,"13.5","1"),("33",19.5,"1","1.5"),("33.5",20,"1.5","2"),
 # La fonte scrive "UK 5" su questa riga, fra UK 1.5 e UK 2.5: e' un refuso
 # evidente, quindi la UK resta vuota invece di propagare un numero sbagliato.
 ("34.5",20.5,None,"2.5"),("35",21,"2.5","3"),
 ("35.5",21.5,"3","3.5"),("36",22,"3.5","4"),("37",22.5,"4","4.5"),
 ("37.5",23,"4.5","5"),("38",23.5,"5","5.5"),("38.5",24,"5.5","6"),
 ("39",24.5,"6","6.5"),("40",25,"6.5","7")]

labels = json.load(io.open('_scripts/atelier-labels.json', encoding='utf8'))

def half(x):
    """'6.5' -> '6½' per combaciare con le etichette Atelier."""
    return x.replace(".5", "½") if x.endswith(".5") else x

def row(src, eu, cm, uk, us):
    return {"sourceLabel": src, "us": us, "eu": eu, "uk": uk,
            "cm": ("%g" % cm), "jpMm": int(round(cm * 10))}

tables = []

def emit(sigla, mappings, note):
    valid = set(labels.get(sigla, []))
    keep = [m for m in mappings if m["sourceLabel"] in valid]
    if keep:
        tables.append({"sigla": sigla, "note": note, "mappings": keep})

# BQ: la coppia M/W, chiavata sulla parte uomo.
bq = []
for lab in labels.get("BQ", []):
    m = re.match(r"^M(\d+(?:\.\d+)?)/W", lab)
    if not m: continue
    hit = next((r for r in UOMO if r[3] == m.group(1)), None)
    if hit: bq.append(row(lab, hit[0], hit[1], hit[2], lab))
emit("BQ", bq, "scala doppia: `us` conserva l'etichetta M/W, il resto viene dalla riga uomo")

for sigla, src, col in (("AG", UOMO, 3), ("P", UOMO, 3), ("R", DONNA, 4)):
    out = []
    for r in src:
        if r[col] is None: continue
        out.append(row(half(r[col]), r[0], r[1], r[2], r[col]))
    emit(sigla, out, "chiavata sulla colonna US della guida")

bm = []
for eu, cm, uk, us in BIMBO_PICCOLO:
    bm.append(row("K" + us, eu, cm, uk, us))
for eu, cm, uk, us in BIMBO_YOUTH:
    bm.append(row(us, eu, cm, uk, us))
emit("#BM", bm, "`K` = little kid, numero nudo = youth, come li scrive l'ERP")

def ts(v):
    return "null" if v is None else '"%s"' % v

lines = [
 '// AUTO-GENERATO da _scripts/genera-new-balance.py — NON MODIFICARE A MANO',
 '// Fonte: newbalance.it/it/size-guide.html, letta il 2026-10-21.',
 '',
 'import type { ConversionTable } from "./types";',
 '',
 '/**',
 " * Le tabelle ufficiali New Balance.",
 ' *',
 " * Servono perche' il brand si discosta dalle master: US uomo 10 e' EU 44 per",
 " * New Balance e EU 43 in casa, e sul bambino lo scarto arriva a due numeri",
 " * (US bambino 13 = EU 31 per loro, EU 29 per noi).",
 ' *',
 " * I prodotti arrivano su quattro scale diverse, quindi la stessa guida viene",
 " * agganciata a tutte e quattro.",
 ' */',
 'export const NEW_BALANCE_TABLES: readonly ConversionTable[] = [',
]
for t in tables:
    lines.append('  {')
    lines.append('    // %s' % t["note"])
    lines.append('    scaleSigla: "%s",' % t["sigla"])
    lines.append('    brand: "New Balance",')
    lines.append('    isSeed: true,')
    lines.append('    mappings: [')
    for m in t["mappings"]:
        lines.append('      { sourceLabel: %s, us: %s, eu: %s, uk: %s, cm: %s, jpMm: %s },' % (
            ts(m["sourceLabel"]), ts(m["us"]), ts(m["eu"]), ts(m["uk"]), ts(m["cm"]), m["jpMm"]))
    lines.append('    ],')
    lines.append('  },')
lines.append('];')
lines.append('')
io.open('app/lib/conversion/new-balance-tables.ts', 'w', encoding='utf8').write("\n".join(lines))
for t in tables:
    print("%-5s %d righe" % (t["sigla"], len(t["mappings"])))
