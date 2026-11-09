#!/usr/bin/env python3
"""Croise les routes d'un workflow « MCP Server » avec ce que son nœud IMPLÉMENTE.

POURQUOI CE CONTRÔLE EXISTE
  Les workflows `MCP - Gmail Server`, `MCP - Google Calendar Server` et leurs
  semblables sont bâtis pareil : un `Switch` lit `body.resource` + `body.operation`
  et aiguille vers un nœud dynamique dont l'opération est figée dans ses paramètres.
  Rien ne garantit que cette opération figée existe dans le code du nœud. Quand
  elle n'existe pas, le nœud lève `Unknown <resource> operation: <op>` AVANT tout
  appel réseau — et comme l'échec survient avant le `respondToWebhook`, n8n ferme
  la requête en **HTTP 200 avec un corps VIDE** (cf. n8n-workflows#467).

  Conséquence : une route morte est indiscernable d'une route qui ne trouve rien.
  C'est ainsi que six routes Gmail sur vingt-deux ont pu rester cassées sans que
  personne ne le voie — dont `message/getAll`, celle qui liste une boîte entière.

CE QU'IL MESURE
  Pour chaque paire (resource, operation) routée par le `Switch`, il suit la
  connexion jusqu'au nœud cible, lit l'opération figée dans ses paramètres, et
  vérifie qu'un `case '<op>':` existe dans la fonction `execute<Resource>Operation`
  du code source du nœud.

  ⚠️ Il lit le dépôt, pas le conteneur. Le nœud installé sur llm peut différer.
  Pour trancher en service : appeler la route avec un jeton VOLONTAIREMENT faux,
  puis lire l'exécution. Une route saine échoue en « Authorization failed » (le
  nœud a appelé Google) ; une route morte échoue en « Unknown … operation » (le
  nœud n'a rien appelé). Le jeton faux rend l'essai sans effet, y compris sur les
  opérations qui, avec un vrai jeton, modifieraient des données.

USAGE
  python3 scripts/audit/controle_routes_noeuds_dynamiques.py            # tous les serveurs connus
  python3 scripts/audit/controle_routes_noeuds_dynamiques.py --tout     # tout workflow Switch→*Dynamic
CODE DE SORTIE : 0 = toutes les routes aboutissent · 2 = au moins une route morte
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def cas_implementes(chemin_ts: str) -> tuple[dict[str, set[str]], set[str]]:
    """Retourne (operations_par_ressource, operations_toutes_ressources_confondues).

    Deux structures coexistent dans custom-nodes/, et un contrôle qui n'en connaît
    qu'une invente des défauts :

      • `async function execute<Resource>Operation` + `switch (operation)` avec des
        `case '<op>':`  → Gmail, Calendar, Contacts. L'attribution à la ressource
        est alors exacte. ⚠️ La comparaison doit être INSENSIBLE À LA CASSE :
        `executeContactGroupOperation` porte la ressource `contactGroup`, et un
        rapprochement sur `contactgroup` déclarait mortes les 7 routes de Contacts.

      • une seule `execute()` avec des chaînes `if (operation === '<op>')` → Drive.
        Aucune fonction par ressource n'existe ; relevé ainsi, le nœud paraissait
        n'implémenter RIEN et ses 12 routes ressortaient toutes comme mortes. Faux.

    D'où le second jeu retourné : toutes les opérations citées par le nœud, sans
    attribution. Il sert de repli, et c'est ce repli qui permet de répondre
    « indéterminé » au lieu de « cassé » — un contrôle qui n'a rien su lire doit le
    dire, pas accuser.
    """
    src = open(chemin_ts, encoding="utf-8").read()
    par_ressource: dict[str, set[str]] = {}
    for m in re.finditer(r"async function execute(\w+?)Operation\b", src):
        debut = m.end()
        suite = re.search(r"\n(?=async function |// === )", src[debut:])
        fin = debut + (suite.start() if suite else len(src) - debut)
        bloc = src[debut:fin]
        ops = set(re.findall(r"^\s+case '([a-zA-Z]+)':", bloc, re.M))
        ops |= set(re.findall(r"operation === '([a-zA-Z]+)'", bloc))
        par_ressource[m.group(1).lower()] = ops          # clé normalisée en minuscules

    globales = set(re.findall(r"^\s+case '([a-zA-Z]+)':", src, re.M))
    globales |= set(re.findall(r"operation === '([a-zA-Z]+)'", src))
    return par_ressource, globales


def source_du_noeud(type_noeud: str) -> str | None:
    """`n8n-nodes-gmail-dynamic.gmailToolDynamic` → son .node.ts dans custom-nodes/."""
    paquet = type_noeud.split(".")[0]
    trouves = glob.glob(os.path.join(RACINE, "custom-nodes", paquet, "nodes", "*", "*.node.ts"))
    return trouves[0] if trouves else None


def controler(chemin_wf: str) -> tuple[str, list[tuple], int]:
    wf = json.load(open(chemin_wf, encoding="utf-8"))
    switchs = [n for n in wf.get("nodes", []) if n["type"] == "n8n-nodes-base.switch"]
    if not switchs:
        return wf.get("name", chemin_wf), [], 0
    sw = switchs[0]
    regles = (sw.get("parameters", {}).get("rules") or {}).get("values") or []
    conns = (wf.get("connections", {}).get(sw["name"], {}) or {}).get("main") or []
    noeuds = {n["name"]: n for n in wf["nodes"]}

    impl_par_paquet: dict[str, dict[str, set[str]]] = {}
    lignes, morts = [], 0
    for i, regle in enumerate(regles):
        paire = tuple(c.get("rightValue") for c in regle["conditions"]["conditions"])
        cible = conns[i][0]["node"] if i < len(conns) and conns[i] else None
        n = noeuds.get(cible or "")
        if n is None:
            lignes.append((paire, cible, None, None, "nœud cible absent")); morts += 1
            continue
        if "Dynamic" not in n["type"]:
            continue                      # nœud natif : hors du périmètre de ce contrôle
        ts = source_du_noeud(n["type"])
        if ts is None:
            # ⚠️ INDÉTERMINÉ, pas mort. `MCP - Google Classroom Server` porte le type
            # `CUSTOM.classroomToolDynamic` : le paquet ne s'appelle pas comme un
            # dossier de custom-nodes/, donc la source est introuvable d'ici. Compter
            # ses 26 routes comme mortes serait une accusation sans mesure.
            lignes.append((paire, cible, None, None,
                           f"INDÉTERMINÉ (source introuvable pour {n['type']})"))
            continue
        par_res, globales = impl_par_paquet.setdefault(ts, cas_implementes(ts))
        res_n = n["parameters"].get("resource")
        op_n = n["parameters"].get("operation")
        connues = par_res.get(str(res_n).lower())
        if connues:                       # attribution exacte : verdict ferme
            pourquoi = None if op_n in connues else "non implémenté pour cette ressource"
        elif globales:                    # repli sans attribution : verdict prudent
            pourquoi = None if op_n in globales else "citée nulle part dans le nœud"
        else:                             # on n'a RIEN su lire : on ne conclut pas
            pourquoi = "INDÉTERMINÉ (structure du nœud non reconnue)"
        lignes.append((paire, cible, res_n, op_n, pourquoi))
        if pourquoi and not pourquoi.startswith("INDÉTERMINÉ"):
            morts += 1
    return wf.get("name", chemin_wf), lignes, morts


def main() -> int:
    ap = argparse.ArgumentParser(description="Routes d'un MCP Server vs opérations implémentées.")
    ap.add_argument("--tout", action="store_true",
                    help="balayer tous les workflows du dépôt, pas seulement les serveurs connus")
    ap.add_argument("fichiers", nargs="*", help="workflows à contrôler (défaut : les serveurs MCP)")
    args = ap.parse_args()

    if args.fichiers:
        cibles = args.fichiers
    elif args.tout:
        cibles = sorted(glob.glob(os.path.join(RACINE, "workflows", "*.json")))
    else:
        cibles = sorted(glob.glob(os.path.join(RACINE, "workflows", "MCP_-_*Server*.json")))

    total_morts, examines = 0, 0
    for chemin in cibles:
        try:
            nom, lignes, morts = controler(chemin)
        except Exception as e:
            print(f"⚠️  {os.path.basename(chemin)} : {e}", file=sys.stderr)
            continue
        if not lignes:
            continue
        examines += 1
        print("=" * 78)
        print(f"{nom}   ({os.path.basename(chemin)})")
        print("-" * 78)
        for paire, cible, res_n, op_n, pourquoi in lignes:
            marque = "OK " if not pourquoi else "❌ "
            corps = "/".join(str(p) for p in paire)
            fait = f"{res_n}/{op_n}" if res_n else "?"
            print(f"   {marque} corps({corps}) → {cible!r} fait {fait}"
                  + (f"   ⟵ {pourquoi}" if pourquoi else ""))
        if morts:
            print(f"   ❌ {morts} route(s) morte(s) : réponse HTTP 200 à corps VIDE en service")
        else:
            print("   ✅ toutes les routes aboutissent à une opération implémentée")
        total_morts += morts

    print("=" * 78)
    print(f"{examines} workflow(s) examiné(s) · {total_morts} route(s) morte(s)")
    return 2 if total_morts else 0


if __name__ == "__main__":
    sys.exit(main())
