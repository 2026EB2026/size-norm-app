# -*- coding: utf-8 -*-
"""Genera app/lib/conversion/guide-ufficiali-tables.ts dalle guide trascritte.

Prende solo le tabelle che superano _scripts/verifica-ladder.py e, per ogni
brand, emette una ConversionTable per OGNI scala Atelier del suo genere
(IT, UK, US), usando come sourceLabel la colonna corrispondente della guida.
Cosi' il brand e' coperto qualunque sia la scala che l'ERP gli assegna col tag
SCALATAGLIE_.

Rigenerare con:  python _scripts/genera-tabelle-ufficiali.py
"""
import json, io, importlib.util, sys

spec = importlib.util.spec_from_file_location("ver", "_scripts/verifica-ladder.py")

def num(v):
    if v is None: return None
    try: return float(str(v).replace(',', '.'))
    except ValueError: return None

def lab(x):
    """Formatta un numero con la convenzione Atelier: 34.5 -> '34½'."""
    if x is None: return None
    if abs(x - round(x)) < 1e-9: return str(int(round(x)))
    if abs(x - int(x) - 0.5) < 1e-9: return "%d½" % int(x)
    return ("%g" % x)

# Scala Atelier per genere: (sigla, indice colonna della guida)
#   0 = base (IT/EU), 1 = UK, 2 = US
SCALES = {
    "women":  [("I", 0), ("AD", 1), ("R", 2)],
    "men":    [("G", 0), ("M", 1), ("P", 2)],
    "unisex": [("AM", 0), ("AF", 1), ("AG", 2)],
}
# Scale FR, usate solo per i brand che etichettano in FR.
SCALES_FR = {"women": ("DC", 0), "men": ("DB", 0)}

# Brand escluse a mano, con la ragione.
ESCLUSE = {
    # Confermato dal merchant il 12/10/2026: l'ERP carica questi due brand
    # con la taglia IT gia' convertita (tag SCALATAGLIE_Scarpe Donna/Uomo IT).
    # Le loro guide sono costruite sull'etichetta francese, quindi non si
    # appoggiano piu' su quelle etichette: un prodotto marcato IT va letto
    # col master italiano, come ogni altro brand sulla stessa scala.
    "Isabel Marant": "etichetta gia' convertita in IT dall'ERP: usa il master italiano",
    "Kenzo": "etichetta gia' convertita in IT dall'ERP: usa il master italiano",
}

VENDOR = {
    "Alexander McQueen": "Alexander McQueen", "Bottega Veneta": "Bottega Veneta",
    "Etro": "ETRO", "Giuseppe Zanotti": "Giuseppe Zanotti", "Gucci": "Gucci",
    "Isabel Marant": "Isabel Marant", "Jil Sander": "Jil Sander", "Khaite": "Khaite",
    "MM6 Maison Margiela": "MM6 Maison Margiela", "MSGM": "MSGM",
    "Maison Margiela": "Maison Margiela", "Moncler": "Moncler", "N 21": "N°21",
    "PS Paul Smith": "Paul Smith", "Saint Laurent": "Saint Laurent", "Staud": "Staud",
    "Stella McCartney": "Stella McCartney", "Versace": "Versace", "Clarks": "Clarks",
    "Crocs": "Crocs", "Dr. Martens": "Dr. Martens", "Marni": "Marni",
    "Alexander Wang": "Alexander Wang", "Jacquemus": "Jacquemus",
    "Veja": "Veja", "Kenzo": "Kenzo",
    "Givenchy / Jil Sander": ["Givenchy", "Jil Sander"],
    "__generico uomo IT": None, "Rotate": None, "Hunter": None,
}
# Vendor aggiuntivi che condividono la stessa scala del brand principale.
VENDOR_EXTRA = {
    "Moncler": ["Moncler Genius"],
    "Dr. Martens": ["Dr. Martens x Rick Owens"],
}

labels = json.load(io.open('_scripts/atelier-labels.json', encoding='utf8'))
guides = json.load(io.open('_scripts/guide-trascritte.json', encoding='utf8'))

sys.argv = ["ver"]
ver = importlib.util.module_from_spec(spec)
spec.loader.exec_module.__self__ if False else None

# Riuso il controllo: importo la funzione check copiandone la logica via exec.
src = io.open('_scripts/verifica-ladder.py', encoding='utf8').read()
ns = {}
exec(src.split("data = json.load")[0], ns)
check = ns["check"]

out, skipped = [], []
for g in guides:
    brand = g["brand"]
    if brand in ESCLUSE:
        skipped.append((brand, g["gender"], ESCLUSE[brand]))
        continue
    vendor = VENDOR.get(brand)
    vendors = vendor if isinstance(vendor, list) else ([vendor] if vendor else [])
    vendors = vendors + VENDOR_EXTRA.get(brand, [])
    problems = check(g)
    if not g["rows"] or not vendors or problems:
        skipped.append((brand, g["gender"],
                        "ladder non pulito" if problems else "nessun vendor noto"))
        continue
    gender = g["gender"]
    if gender not in SCALES:
        skipped.append((brand, gender, "genere senza scala Atelier (%s)" % gender))
        continue

    targets = list(SCALES[gender])
    if g.get("base_e_fr") and gender in SCALES_FR:
        targets.append(SCALES_FR[gender])

    for sigla, col in targets:
        valid = set(labels.get(sigla, []))
        if not valid: continue
        mappings = []
        for r in g["rows"]:
            base, uk, us, cm = (num(r[0]), num(r[1]), num(r[2]), num(r[3]))
            # L'etichetta Marant/Kenzo e' la FR: la IT e' una in meno.
            it = base - 1 if (g.get("base_e_fr") and sigla not in ("DC", "DB")) else base
            src_val = {0: it, 1: uk, 2: us}[col]
            key = lab(src_val)
            if key is None or key not in valid: continue
            mappings.append({
                "sourceLabel": key, "us": lab(us), "eu": lab(it),
                "uk": lab(uk), "cm": (("%g" % cm) if cm is not None else None),
                "jpMm": int(round(cm * 10)) if cm is not None else None,
            })
        if len(mappings) >= 4:
            for v in vendors:
                out.append({"scaleSigla": sigla, "brand": v, "mappings": mappings,
                            "fonte": g["fonte"], "gender": gender})

def ts(v):
    return "null" if v is None else ('"%s"' % v if isinstance(v, str) else str(v))

lines = [
 '// AUTO-GENERATO da _scripts/genera-tabelle-ufficiali.py — NON MODIFICARE A MANO',
 '// Fonte: le guide taglie ufficiali dei brand trascritte in',
 '// _scripts/guide-trascritte.json. Rigenerare con:',
 '//   python _scripts/genera-tabelle-ufficiali.py',
 '',
 'import type { ConversionTable } from "./types";',
 '',
 '/**',
 ' * Tabelle di conversione prese dalle guide pubblicate dai brand.',
 ' *',
 ' * Per ogni brand ne esiste una per ciascuna scala Atelier del suo genere',
 ' * (IT, UK, US): il prodotto arriva dall\'ERP con un tag SCALATAGLIE_ che puo',
 ' * puntare a una qualsiasi delle tre, e `lookupConversion` sceglie la tabella',
 ' * brand-specific prima di quella generica. I numeri sono gli stessi in tutte,',
 ' * cambia solo la colonna usata come sourceLabel.',
 ' *',
 ' * Solo le guide che superano _scripts/verifica-ladder.py finiscono qui.',
 ' */',
 'export const GUIDE_UFFICIALI_TABLES: readonly ConversionTable[] = [',
]
for t in out:
    lines.append('  {')
    lines.append('    // %s — %s' % (t["fonte"], t["gender"]))
    lines.append('    scaleSigla: "%s",' % t["scaleSigla"])
    lines.append('    brand: "%s",' % t["brand"])
    lines.append('    isSeed: true,')
    lines.append('    mappings: [')
    for m in t["mappings"]:
        lines.append('      { sourceLabel: %s, us: %s, eu: %s, uk: %s, cm: %s, jpMm: %s },' % (
            ts(m["sourceLabel"]), ts(m["us"]), ts(m["eu"]), ts(m["uk"]), ts(m["cm"]), ts(m["jpMm"])))
    lines.append('    ],')
    lines.append('  },')
lines.append('];')
lines.append('')
io.open('app/lib/conversion/guide-ufficiali-tables.ts', 'w', encoding='utf8').write("\n".join(lines))

print("tabelle generate:", len(out))
brands = sorted({t["brand"] for t in out})
print("brand coperti (%d): %s" % (len(brands), ", ".join(brands)))
print("\nsaltate:")
for s in sorted(set(skipped)): print("  -", s[0], s[1], "->", s[2])
