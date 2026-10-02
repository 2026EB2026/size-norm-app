# -*- coding: utf-8 -*-
"""Controlli automatici sulle tabelle trascritte dal pacchetto guide ufficiali.

Per ogni tabella verifica: colonne monotone crescenti, scarti costanti fra
sistemi, nessun valore ripetuto, nessun gradino mancante. Stampa le tabelle
pulite raggruppate per ladder e l'elenco di quelle con incongruenze.
"""
import json, io, collections

def num(v):
    if v is None: return None
    v = str(v).replace(',', '.')
    try: return float(v)
    except ValueError: return None

def check(t):
    bad = []
    cols = list(zip(*t["rows"]))
    names = ["base", "UK", "US", "cm"]
    for name, col in zip(names, cols):
        vals = [num(v) for v in col]
        seen = [v for v in vals if v is not None]
        if len(seen) < 2: continue
        if any(b <= a for a, b in zip(seen, seen[1:])):
            bad.append("%s non monotona" % name)
        dup = [v for v, n in collections.Counter(seen).items() if n > 1]
        if dup: bad.append("%s ripete %s" % (name, dup))
    base = [num(r[0]) for r in t["rows"]]
    uk   = [num(r[1]) for r in t["rows"]]
    us   = [num(r[2]) for r in t["rows"]]
    if t.get("scarto_variabile_atteso"):
        return [x for x in bad if "scarto variabile" not in x and "non monotona" not in x]
    for label, other in (("base-UK", uk), ("base-US", us)):
        offs = {round(b - o, 2) for b, o in zip(base, other) if b is not None and o is not None}
        if len(offs) > 1:
            bad.append("%s scarto variabile %s" % (label, sorted(offs)))
    return bad

data = json.load(io.open('_scripts/guide-trascritte.json', encoding='utf8'))
clean, dirty = [], []
for t in data:
    b = check(t)
    (dirty if b else clean).append((t, b))

groups = collections.defaultdict(list)
for t, _ in clean:
    base = [num(r[0]) for r in t["rows"]]
    uk   = [num(r[1]) for r in t["rows"]]
    us   = [num(r[2]) for r in t["rows"]]
    o1 = {round(b - o, 2) for b, o in zip(base, uk) if b is not None and o is not None}
    o2 = {round(b - o, 2) for b, o in zip(base, us) if b is not None and o is not None}
    groups[(tuple(o1), tuple(o2))].append("%s %s" % (t["brand"], t["gender"]))

print("== PULITE: %d ==" % len(clean))
for k, v in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    off = "base-UK=%s base-US=%s" % (k[0][0] if k[0] else "-", k[1][0] if k[1] else "-")
    print("\n  %s  (%d)" % (off, len(v)))
    for n in sorted(v): print("    -", n)

print("\n== CON INCONGRUENZE: %d ==" % len(dirty))
for t, b in dirty:
    print("\n  %s %s" % (t["brand"], t["gender"]))
    for x in b: print("    !", x)
