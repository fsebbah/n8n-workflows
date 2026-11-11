#!/usr/bin/env python3
"""Squelette MÉCANIQUE de la carte (outil, opération) → effet. azy.daily#651 / #643.

Ne décide RIEN de ce qui se rédige : `irreversible` sort VIDE partout, et la colonne
`inverse_routee` porte la seule part mesurable de ce verdict.

⚠️ DEUX ENTRÉES À PRODUIRE D'ABORD, dans le dossier passé en argument :
  wf_tous.json   la liste des workflows de l'instance, AVEC leurs nœuds
                 (`scripts/n8n/n8n_api.py`, pagination comprise — l'API en rend 2 pages).
  registre.json  `curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
                      http://llm.local:5678/webhook/mcp/tools/registry`
                 ⚠️ SANS cet en-tête le registre rend 401 puis un corps VIDE de 0 octet,
                 et le script tournerait sur zéro outil sans rien signaler.
"""
import csv, json, re, pathlib, sys

S = pathlib.Path(sys.argv[1])
RACINE = pathlib.Path("/storage6/pi6/n8n-workflows")
wfs = json.load(open(S / "wf_tous.json"))
reg = json.load(open(S / "registre.json"))["tools"]
par_id = {w["id"]: w for w in wfs}

PKGS = {"mcp-gmail": "gmail", "mcp-calendar": "calendar", "mcp-classroom": "classroom",
        "mcp-contacts": "contacts", "mcp-drive": "drive", "email-imap": "email-imap"}

# ── libellés déclarés par le TypeScript du nœud ───────────────────────────────
def declarees(d):
    rep = RACINE / "custom-nodes" / f"n8n-nodes-{d}-dynamic" / "nodes"
    fs = list(rep.rglob("*.node.ts"))
    if not fs:
        return {}
    src = fs[0].read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r"name:\s*'operation'", src):
        bloc = src[m.start(): m.start() + 6000]
        mres = re.search(r"resource:\s*\[([^\]]*)\]", bloc)
        ress = re.findall(r"'([A-Za-z0-9_]+)'", mres.group(1)) if mres else []
        ress = ress or [""]   # liste vide ≠ « aucune ressource » : c'est la racine
        mopt = re.search(r"options:\s*\[(.*?)\n\s*\],", bloc, re.S)
        if not mopt:
            continue
        for bl in re.findall(r"\{[^{}]*value:\s*'[A-Za-z0-9_]+'[^{}]*\}", mopt.group(1)):
            v = re.search(r"value:\s*'([A-Za-z0-9_]+)'", bl).group(1)
            de = re.search(r"description:\s*'([^']*)'", bl)
            for r in ress:
                out[f"{r}/{v}" if r else v] = de.group(1) if de else ""
    return out

# ── ce que le WORKFLOW route réellement ──────────────────────────────────────
def routees(outil):
    w = par_id[reg[outil]["workflow_id"]]
    ops = set()
    for n in w["nodes"]:
        if "ToolDynamic" not in str(n.get("type", "")):
            continue
        p = n.get("parameters") or {}
        op = str(p.get("operation") or "").strip()
        res = str(p.get("resource") or "").strip()
        if op and "{{" not in op:
            ops.add((res, op))
    return w["name"], ops

LECTURES = {"get", "getall", "getmany", "list", "search", "download", "freebusy",
            "listfolders", "fetchemail", "read", "export", "check"}
ECRITURES = {"create", "update", "delete", "send", "reply", "move", "quickadd",
             "addattendee", "removeattendee", "addlabels", "removelabels", "modify",
             "markread", "markunread", "trash", "upload", "patch", "insert", "generate"}
# Relations d'inverse : JUGEMENT HUMAIN, pas une dérivation. `untrash↔delete` est
# évident ; un `unshare↔share` ne l'est pas, donc il n'est pas ici.
INVERSES = {"delete": "untrash", "trash": "untrash", "star": "unstar",
            "unstar": "star", "markRead": "markUnread", "markUnread": "markRead",
            "addLabels": "removeLabels", "removeLabels": "addLabels",
            "addMembers": "removeMembers", "removeMembers": "addMembers"}

COLS = ["outil", "workflow", "resource", "operation", "libelle_du_noeud", "declaree",
        "ecrit", "ecrit_source", "cible_ecriture", "inverse_candidat",
        "inverse_declaree", "inverse_routee", "irreversible", "irreversible_source"]

lignes, stats = [], {}
for outil, d in PKGS.items():
    if outil not in reg:
        continue
    decl = declarees(d)
    nom, ops = routees(outil)
    noms_routes = {f"{r}/{o}" if r else o for r, o in ops}
    for res, op in sorted(ops):
        cle = f"{res}/{op}" if res else op
        base = re.sub(r"[_\-]", "", op).lower()
        if base in ECRITURES:
            ecrit, src = "oui", "verbe"
        elif base in LECTURES:
            ecrit, src = "non", "verbe"
        else:
            ecrit, src = "", "A_REDIGER"          # les 7 que le verbe ne classe pas
        inv = INVERSES.get(op, "")
        cle_inv = (f"{res}/{inv}" if res and inv else inv)
        lignes.append({
            "outil": outil, "workflow": nom, "resource": res, "operation": op,
            "libelle_du_noeud": decl.get(cle, ""),
            "declaree": "oui" if cle in decl else "NON (route morte)",
            "ecrit": ecrit, "ecrit_source": src,
            "cible_ecriture": "compte Google de l'utilisateur (oauth_token)"
                              if ecrit == "oui" and outil != "email-imap"
                              else ("boîte IMAP de l'utilisateur" if ecrit == "oui" else ""),
            "inverse_candidat": cle_inv,
            "inverse_declaree": ("" if not inv else
                                 "oui" if cle_inv in decl else "non"),
            "inverse_routee": ("" if not inv else
                               "oui" if cle_inv in noms_routes else "non"),
            "irreversible": "", "irreversible_source": "A_REDIGER",
        })
    stats[outil] = (len(ops), len(decl))

chemin = S / "carte-operations-squelette.csv"
with chemin.open("w", encoding="utf-8", newline="") as fh:
    fh.write("# Squelette MÉCANIQUE de la carte (outil, opération) → effet. azy.daily#651 / #643.\n")
    fh.write("# Clé = (outil, operation) ROUTÉE par le workflow — jamais l'opération déclarée par le nœud.\n")
    fh.write("# `ecrit_source: verbe` = déduit du nom de l'opération. `A_REDIGER` = le verbe ne décide pas.\n")
    fh.write("# `irreversible` est VIDE PARTOUT : il se rédige. `inverse_routee` en est la seule part mesurable.\n")
    fh.write("# `declaree: NON (route morte)` = le workflow appelle une opération que le nœud ne connaît pas.\n")
    csv.DictWriter(fh, fieldnames=COLS).writeheader()
    csv.DictWriter(fh, fieldnames=COLS).writerows(lignes)

print(f"{len(lignes)} opérations routées écrites dans {chemin}\n")
for o, (r, d) in stats.items():
    print(f"  {o:14} {r:3} routées / {d:3} déclarées")
print()
mortes = [l for l in lignes if l["declaree"].startswith("NON")]
aredig = [l for l in lignes if l["ecrit_source"] == "A_REDIGER"]
rev     = [l for l in lignes if l["inverse_routee"] == "oui"]
cablabl = [l for l in lignes if l["inverse_declaree"] == "oui" and l["inverse_routee"] == "non"]
definit = [l for l in lignes if l["inverse_declaree"] == "non"]
print(f"routes mortes                        : {len(mortes)}  " +
      ", ".join(f'{l["outil"]}:{l["resource"]}/{l["operation"]}' for l in mortes))
print(f"`ecrit` que le verbe ne décide pas    : {len(aredig)}  " +
      ", ".join(f'{l["resource"]}/{l["operation"]}' for l in aredig))
print(f"inverse DÉCLARÉ et ROUTÉ  (réversible)      : {len(rev)}")
print(f"inverse DÉCLARÉ, NON ROUTÉ (câblable chez nous): {len(cablabl)}  " +
      ", ".join(f'{l["outil"]}:{l["resource"]}/{l["operation"]} → {l["inverse_candidat"]}' for l in cablabl))
print(f"inverse INEXISTANT dans le nœud              : {len(definit)}")
print(f"`ecrit = oui` (couche grossière #643) : {sum(1 for l in lignes if l['ecrit']=='oui')}")
