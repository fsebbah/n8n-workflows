#!/usr/bin/env python3
"""Matrice du contrat MCP↔n8n par service : paires resource/operation + params.

MCP RETIRE tout champ hors InputSchema. La matrice doit donc être exacte : un
param oublié n'arrive jamais, et une paire morte déclarée fait échouer un agent.

Pour chaque paire routée par le `Switch`, ce script suit la connexion jusqu'au nœud
cible, vérifie que le nœud IMPLÉMENTE l'opération, et relève les `$json.body.X`
lus PAR CE NŒUD. Requis / optionnel se lit à la présence d'un repli `||` dans
l'expression : `{{ $json.body.x }}` est requis, `{{ $json.body.x || '' }}` ne l'est pas.
"""
import glob
import json
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TABLEAUX = {"attendees", "label_ids", "resource_names", "attachments", "person_fields"}
BOOLEENS = {"all_day", "single_events", "return_all", "include_spam_trash",
            "include_images", "state", "html", "permanent", "replyAll"}
ENTIERS = {"max_results", "page_size", "limit", "max_files", "max_points", "imap_port"}
OBJETS = {"plugin_context", "context", "metadata"}


def typer(c):
    if c in TABLEAUX: return "array"
    if c in BOOLEENS: return "boolean"
    if c in ENTIERS: return "integer"
    if c in OBJETS: return "object"
    return "string"


def cas_implementes(ts):
    src = open(ts, encoding="utf-8").read()
    par_res = {}
    for m in re.finditer(r"async function execute(\w+?)Operation\b", src):
        d = m.end()
        suite = re.search(r"\n(?=async function |// === )", src[d:])
        bloc = src[d:d + (suite.start() if suite else len(src) - d)]
        ops = set(re.findall(r"^\s+case '([a-zA-Z]+)':", bloc, re.M))
        ops |= set(re.findall(r"operation === '([a-zA-Z]+)'", bloc))
        par_res[m.group(1).lower()] = ops
    glob_ops = set(re.findall(r"^\s+case '([a-zA-Z]+)':", src, re.M))
    glob_ops |= set(re.findall(r"operation === '([a-zA-Z]+)'", src))
    return par_res, glob_ops


def source(type_noeud):
    paquet = type_noeud.split(".")[0]
    t = glob.glob(os.path.join(RACINE, "custom-nodes", paquet, "nodes", "*", "*.node.ts"))
    return t[0] if t else None


def champs(noeud):
    """Champs du corps lus par CE nœud, avec requis/optionnel."""
    brut = json.dumps(noeud.get("parameters") or {}, ensure_ascii=False)
    trouves = {}
    for m in re.finditer(r"\$json\.body\.([a-zA-Z_][a-zA-Z0-9_]*)([^\"]{0,24})", brut):
        nom, suite = m.group(1), m.group(2)
        if nom in ("access_token", "oauth_token", "resource", "operation"):
            continue
        optionnel = "||" in suite or "?." in suite
        trouves[nom] = trouves.get(nom, True) and not optionnel
    # nœuds Code : `body.X`
    js = (noeud.get("parameters") or {}).get("jsCode") or ""
    for m in re.finditer(r"\bbody\.([a-zA-Z_][a-zA-Z0-9_]*)([^\n]{0,24})", js):
        nom, suite = m.group(1), m.group(2)
        if nom in ("access_token", "oauth_token", "resource", "operation"):
            continue
        trouves[nom] = trouves.get(nom, True) and "||" not in suite
    return trouves


def matrice(chemin_wf):
    wf = json.load(open(chemin_wf, encoding="utf-8"))
    whs = [n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.webhook"]
    path = whs[0]["parameters"].get("path") if whs else None
    noeuds = {n["name"]: n for n in wf["nodes"]}
    sws = [n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.switch"]
    lignes = []
    if not sws:
        # email-imap : pas de Switch, un IF puis un Code node.
        code = [n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.code"]
        ch = {}
        for n in code:
            ch.update(champs(n))
        actions = sorted(set(re.findall(r"action === '([a-zA-Z_]+)'",
                        json.dumps(wf, ensure_ascii=False))))
        return path, wf["name"], [("—", a, "n/a", True, ch) for a in actions] or [("—", "?", "n/a", True, ch)]
    sw = sws[0]
    conns = (wf["connections"].get(sw["name"], {}) or {}).get("main") or []
    impl_cache = {}
    for i, regle in enumerate(sw["parameters"]["rules"]["values"]):
        paire = tuple(c.get("rightValue") for c in regle["conditions"]["conditions"])
        cible = conns[i][0]["node"] if i < len(conns) and conns[i] else None
        n = noeuds.get(cible or "")
        if n is None:
            lignes.append((paire[0], paire[1], cible, False, {})); continue
        ts = source(n["type"])
        sain = None
        if ts:
            par_res, glob_ops = impl_cache.setdefault(ts, cas_implementes(ts))
            res_n = str(n["parameters"].get("resource")).lower()
            op_n = n["parameters"].get("operation")
            connues = par_res.get(res_n)
            sain = (op_n in connues) if connues else (op_n in glob_ops if glob_ops else None)
        lignes.append((paire[0], paire[1], cible, sain, champs(n)))
    return path, wf["name"], lignes


CIBLES = {"mcp-gmail", "mcp-calendar", "mcp-drive", "mcp-contacts",
          "mcp-classroom", "email-imap"}
sortie = []
for f in sorted(glob.glob(os.path.join(RACINE, "workflows", "*.json"))):
    try:
        wf = json.load(open(f, encoding="utf-8"))
    except Exception:
        continue
    whs = [n for n in wf.get("nodes", []) if n["type"] == "n8n-nodes-base.webhook"]
    if not whs or whs[0]["parameters"].get("path") not in CIBLES:
        continue
    sortie.append(matrice(f))

for path, nom, lignes in sorted(sortie):
    saines = [l for l in lignes if l[3] is True]
    mortes = [l for l in lignes if l[3] is False]
    inconnues = [l for l in lignes if l[3] is None]
    print(f"\n## `{path}` — {nom}")
    print(f"{len(saines)} paire(s) saine(s), {len(mortes)} morte(s), {len(inconnues)} indéterminée(s)\n")
    print("| resource | operation | params requis | params optionnels |")
    print("|---|---|---|---|")
    for res, op, cible, sain, ch in saines:
        req = ", ".join(f"`{c}`:{typer(c)}" for c, r in sorted(ch.items()) if r) or "—"
        opt = ", ".join(f"`{c}`:{typer(c)}" for c, r in sorted(ch.items()) if not r) or "—"
        print(f"| `{res}` | `{op}` | {req} | {opt} |")
    if mortes:
        print(f"\n**MORTES — ne pas déclarer, ne pas appeler** : "
              + ", ".join(f"`{r}/{o}`" for r, o, *_ in mortes))
    if inconnues:
        print(f"\n**INDÉTERMINÉES** (source du nœud introuvable depuis le dépôt) : "
              + ", ".join(f"`{r}/{o}`" for r, o, *_ in inconnues))
