#!/usr/bin/env python3
"""Matrice du contrat MCP↔n8n : paires resource/operation et champs HONORÉS.

MCP retire tout champ hors InputSchema. Mais déclarer un champ que le nœud IGNORE
est aussi nuisible : le LLM croit pouvoir filtrer alors que non. Les deux erreurs
produisent la même panne silencieuse, à un cran de distance.

⚠️ LA LEÇON QUI A FAIT RÉÉCRIRE CE SCRIPT (2026-11-09)
La première version vérifiait que l'opération était IMPLÉMENTÉE par le nœud, pas que
le workflow lui passait les BONS NOMS de paramètres. Elle a donc déclaré saines 5
routes Gmail qui s'exécutent sans erreur et ne font rien d'utile :
  message/reply  — le nœud lit `to`/`body`, le workflow posait `message` → corps VIDE
  label/create   — le nœud lit `labelName`, le workflow posait `name`
  draft/create   — le nœud lit `to`/`subject`/`body`, le workflow posait `message`
  draft/get      — le nœud lit `draftId`, le workflow posait `messageId`
  draft/delete   — idem
Vérifier l'existence d'une opération ne suffit pas : il faut vérifier le RACCORDEMENT.

TROIS VERDICTS, et un quatrième qui refuse de conclure :
  SAINE        l'opération existe ET tous les params qu'elle lit sont posés
  MAL CÂBLÉE   l'opération existe, mais le nœud lit des params que personne ne pose
  MORTE        l'opération n'existe pas dans le nœud
  INDÉTERMINÉ  la source du nœud n'est pas lisible depuis le dépôt (Classroom), ou sa
               structure ne permet pas d'attribuer les params à une opération (Drive,
               qui utilise `if (operation === …)` au lieu d'un `switch`)
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TABLEAUX = {"attendees", "label_ids", "resource_names", "attachments", "person_fields"}
BOOLEENS = {"all_day", "single_events", "return_all", "include_spam_trash",
            "include_images", "include_full_message",
            # additif Agenda du 2026-11-10 (#645)
            "add_google_meet", "use_default_reminders"}
ENTIERS = {"max_results", "page_size", "limit", "max_files", "imap_port",
           # additif Agenda du 2026-11-10 (#645) — des minutes, des comptes
           "reminder_email", "reminder_popup", "recurrence_count"}
# ⚠️ DISTINCTS DES ENTIERS, et c'est mesuré, pas supposé : le nœud Classroom lit
# `assignedGrade`/`draftGrade`/`maxPoints` `as number`, et l'API Google les typent
# `double` — une note sur 20 vaut 9,5. Le schéma écrit à la main déclarait
# `assigned_grade` et `draft_grade` en `string` : un agent envoyait "15", le nœud
# le passait tel quel, et une note arrivait en chaîne. Troisième classe de défaut.
NOMBRES = {"assigned_grade", "draft_grade", "max_points"}
# Params du nœud qui dénotent une RECHERCHE : s'ils sont honorés, l'opération filtre.
PARAMS_DE_RECHERCHE = {"query", "q", "filters", "searchQuery"}
IGNORE = {"accessToken", "resource", "operation"}


def typer(c: str) -> str:
    if c in TABLEAUX: return "array"
    if c in BOOLEENS: return "boolean"
    if c in NOMBRES: return "number"
    if c in ENTIERS: return "integer"
    return "string"


def _blocs_par_operation(src: str):
    """(resource, operation) -> corps du `case`. Vide si la structure est inconnue."""
    blocs, fonctions = {}, list(re.finditer(r"async function execute(\w+?)Operation\b", src))
    for m in fonctions:
        d = m.end()
        suite = re.search(r"\n(?=async function |// === )", src[d:])
        bloc = src[d:d + (suite.start() if suite else len(src) - d)]
        ressource = m.group(1).lower()
        avant = bloc.split("switch (operation)")[0]
        positions = [(x.group(1), x.start()) for x in re.finditer(r"case '([a-zA-Z]+)':", bloc)]
        for i, (op, pos) in enumerate(positions):
            fin = positions[i + 1][1] if i + 1 < len(positions) else len(bloc)
            corps = bloc[pos:fin]
            # Un `case` sans corps est un ALIAS du suivant (`case 'getAll': case 'getMany': {`)
            # et partage donc ses paramètres. L'ignorer déclarait `getAll` sans params.
            if not re.search(r"getNodeParameter|httpRequest|return", corps):
                j = i + 1
                while j < len(positions):
                    f2 = positions[j + 1][1] if j + 1 < len(positions) else len(bloc)
                    corps = bloc[positions[j][1]:f2]
                    if re.search(r"getNodeParameter|httpRequest|return", corps):
                        break
                    j += 1
            blocs[(ressource, op)] = avant + corps
    if fonctions:
        return blocs, True

    # Second style : une seule `execute()` avec des chaînes
    #   if (resource === 'file') { if (operation === 'list') { … } else if (…) }
    # C'est celui de Drive. Sans ce lecteur, l'analyse ne trouvait rien et rendait
    # ses 12 routes « indéterminées » — mesurables, pourtant.
    bornes_res = [(m.group(1), m.start()) for m in re.finditer(r"resource === '(\w+)'", src)]
    for i, (ressource, pos) in enumerate(bornes_res):
        fin_res = bornes_res[i + 1][1] if i + 1 < len(bornes_res) else len(src)
        bloc_res = src[pos:fin_res]
        bornes_op = [(m.group(1), m.start()) for m in re.finditer(r"operation === '(\w+)'", bloc_res)]
        for j, (op, p_op) in enumerate(bornes_op):
            fin_op = bornes_op[j + 1][1] if j + 1 < len(bornes_op) else len(bloc_res)
            blocs[(ressource.lower(), op)] = bloc_res[p_op:fin_op]
    return blocs, bool(blocs)


def analyse_noeud(chemin_ts: str):
    src = open(chemin_ts, encoding="utf-8").read()
    blocs, attribuable = _blocs_par_operation(src)
    lus, exiges = {}, {}
    for cle, corps in blocs.items():
        tous = set(re.findall(r"getNodeParameter\(\s*'([a-zA-Z_]+)'", corps))
        # 3 arguments = une valeur de repli existe dans le nœud → paramètre OPTIONNEL
        avec_defaut = set(re.findall(
            r"getNodeParameter\(\s*'([a-zA-Z_]+)'\s*,\s*[a-zA-Z_]+\s*,", corps))
        lus[cle] = tous
        exiges[cle] = tous - avec_defaut
    return lus, exiges, attribuable


def params_decoupes(chemin_ts: str) -> set:
    """Params que le nœud traite comme une CHAÎNE à découper (`.split(',')`).

    ⚠️ Leur envoyer un tableau lève `split is not a function`. `labelIds` et
    `messageIds` sont dans ce cas. Un schéma qui les déclare `array` casse l'outil
    tout en paraissant correct — troisième classe de défaut, après l'opération
    absente et le renommage de paramètre.
    """
    src = open(chemin_ts, encoding="utf-8").read()
    return set(re.findall(
        r"getNodeParameter\(\s*'([a-zA-Z_]+)'[^)]*\)\s*as string\s*\)\s*\.split", src)) | set(
        re.findall(r"const\s+\w+\s*=\s*\(this\.getNodeParameter\(\s*'([a-zA-Z_]+)'", src))


def expressions_posees(noeud) -> dict:
    """{param du nœud: expression du workflow}, `options`/`filters` aplatis."""
    p = noeud.get("parameters") or {}
    poses = {k: v for k, v in p.items() if k not in IGNORE and k not in ("options", "filters")}
    for groupe in ("options", "filters"):
        if isinstance(p.get(groupe), dict):
            poses.update(p[groupe])
    return poses


def champs_du_corps(expression) -> list:
    """Champs `body.X` cités par une expression n8n."""
    s = json.dumps(expression, ensure_ascii=False) if not isinstance(expression, str) else expression
    return sorted(set(re.findall(r"\$json\.body\.([a-zA-Z_][a-zA-Z0-9_]*)", s)))


def source_du_noeud(type_noeud: str):
    """Fichier .node.ts d'un type de nœud, y compris les types préfixés `CUSTOM.`.

    ⚠️ CE QUI RENDAIT CLASSROOM « INDÉTERMINÉ » (corrigé le 2026-11-10)
    n8n nomme `CUSTOM` le paquet des nœuds chargés depuis son répertoire custom
    (`N8N_CUSTOM_EXTENSIONS`), au lieu du nom du paquet npm. Le type vaut donc
    `CUSTOM.classroomToolDynamic` et non `n8n-nodes-classroom-dynamic.classroomToolDynamic`.
    Découper sur le point donnait « CUSTOM », un répertoire qui n'existe pas — et les
    33 paires de Classroom étaient déclarées non vérifiables alors que leur source EST
    dans le dépôt. On retombe alors sur le nom du nœud (`xToolDynamic` -> `XToolDynamic`).
    """
    paquet, _, nom = type_noeud.partition(".")
    t = glob.glob(os.path.join(RACINE, "custom-nodes", paquet, "nodes", "*", "*.node.ts"))
    if t:
        return t[0]
    if nom:
        attendu = nom[0].upper() + nom[1:] + ".node.ts"
        t = glob.glob(os.path.join(RACINE, "custom-nodes", "*", "nodes", "*", attendu))
        if t:
            return t[0]
    return None


def matrice(chemin_wf: str):
    wf = json.load(open(chemin_wf, encoding="utf-8"))
    whs = [n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.webhook"]
    path = whs[0]["parameters"].get("path") if whs else None
    noeuds = {n["name"]: n for n in wf["nodes"]}
    sws = [n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.switch"]

    if not sws:
        # email-imap : routé sur `body.action`, pas sur resource/operation.
        ch = {}
        for n in wf["nodes"]:
            if n["type"] == "n8n-nodes-base.code":
                for c in re.findall(r"\bbody\.([a-zA-Z_][a-zA-Z0-9_]*)",
                                    (n["parameters"] or {}).get("jsCode", "")):
                    ch[c] = True
        actions = sorted(set(re.findall(r"action === '([a-zA-Z_]+)'",
                                        json.dumps(wf, ensure_ascii=False))))
        return path, wf["name"], [{"resource": "—", "operation": a or "?",
                                   "statut": "INDÉTERMINÉ", "honores": sorted(ch),
                                   "ignores": [], "manquants": [], "cherchable": None}
                                  for a in (actions or ["?"])]

    sw = sws[0]
    conns = (wf["connections"].get(sw["name"], {}) or {}).get("main") or []
    cache, lignes = {}, []
    for i, regle in enumerate(sw["parameters"]["rules"]["values"]):
        paire = tuple(c.get("rightValue") for c in regle["conditions"]["conditions"])
        cible = conns[i][0]["node"] if i < len(conns) and conns[i] else None
        n = noeuds.get(cible or "")
        base = {"resource": paire[0], "operation": paire[1], "noeud": cible,
                "honores": [], "ignores": [], "manquants": [], "cherchable": None}
        if n is None:
            lignes.append({**base, "statut": "MORTE (nœud cible absent)"}); continue
        ts = source_du_noeud(n["type"])
        if ts is None:
            lignes.append({**base, "statut": "INDÉTERMINÉ (source du nœud hors dépôt)"}); continue
        lus_par_op, exiges_par_op, attribuable = cache.setdefault(ts, analyse_noeud(ts))
        res_n = str(n["parameters"].get("resource")).lower()
        op_n = str(n["parameters"].get("operation"))
        if not attribuable:
            lignes.append({**base, "statut": "INDÉTERMINÉ (params non attribuables)"}); continue
        lus = lus_par_op.get((res_n, op_n))
        if lus is None:
            lignes.append({**base, "statut": "MORTE (opération absente du nœud)"}); continue

        poses = expressions_posees(n)
        exiges = exiges_par_op.get((res_n, op_n), set())
        manquants = sorted(exiges - set(poses))      # seuls les EXIGÉS cassent
        dormantes = sorted((lus - exiges) - set(poses))   # options à valeur par défaut
        ignores_params = sorted(set(poses) - lus)
        honores, ignores = [], []
        for param, expr in poses.items():
            cibles = champs_du_corps(expr)
            (ignores if param in ignores_params else honores).extend(cibles)
        # ⚠️ DEUX SITUATIONS TRÈS DIFFÉRENTES, que la première version confondait.
        #
        # • Le workflow pose des données sous un nom que le nœud IGNORE, ET le nœud
        #   lit un nom que personne ne pose : c'est un RENOMMAGE. La donnée de
        #   l'appelant n'arrive jamais. `message/reply` posait `message` quand le
        #   nœud lit `body` → réponse à corps vide. C'est MAL CÂBLÉ.
        #
        # • Le nœud lit des params que le workflow ne pose pas, SANS que le workflow
        #   pose quoi que ce soit d'autre : ce sont des options déclarées dans le
        #   nœud avec une valeur par défaut, simplement non exposées au corps.
        #   `event/create` est dans ce cas (récurrence, rappels, visibilité) : il
        #   FONCTIONNE. Le signaler comme cassé était une sur-accusation.
        if manquants and ignores_params:
            statut = ("MAL CÂBLÉE (le nœud lit " + ", ".join(manquants)
                      + " ; le workflow pose " + ", ".join(ignores_params) + ")")
        else:
            statut = "SAINE"
        if dormantes:
            base["options_non_exposees"] = dormantes
        lignes.append({**base, "statut": statut,
                       "honores": sorted(set(honores)), "ignores": sorted(set(ignores)),
                       "manquants": manquants,
                       "cherchable": bool(lus & PARAMS_DE_RECHERCHE) and not manquants})
    return path, wf["name"], lignes


CIBLES = {"mcp-gmail", "mcp-calendar", "mcp-drive", "mcp-contacts",
          "mcp-classroom", "email-imap"}


def toutes_les_matrices(cibles=None):
    """[(chemin, nom, lignes)] — réutilisé par le générateur de schémas."""
    cibles = cibles or CIBLES
    res = []
    for f in sorted(glob.glob(os.path.join(RACINE, "workflows", "*.json"))):
        try:
            wf = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        whs = [n for n in wf.get("nodes", []) if n["type"] == "n8n-nodes-base.webhook"]
        if not whs or whs[0]["parameters"].get("path") not in cibles:
            continue
        res.append(matrice(f))
    return sorted(res)


def _rapport():
    sortie = toutes_les_matrices()

    total_mal, total_mortes = 0, 0
    for path, nom, lignes in sorted(sortie):
        saines = [l for l in lignes if l["statut"] == "SAINE"]
        mal = [l for l in lignes if l["statut"].startswith("MAL CÂBLÉE")]
        mortes = [l for l in lignes if l["statut"].startswith("MORTE")]
        indet = [l for l in lignes if l["statut"].startswith("INDÉTERMINÉ")]
        total_mal += len(mal); total_mortes += len(mortes)
        print(f"\n## `{path}` — {nom}")
        print(f"{len(saines)} SAINE(S) · {len(mal)} MAL CÂBLÉE(S) · {len(mortes)} MORTE(S) "
              f"· {len(indet)} INDÉTERMINÉE(S)\n")
        if saines:
            print("| resource | operation | champs HONORÉS | listing | champs IGNORÉS |")
            print("|---|---|---|---|---|")
            for l in saines:
                h = ", ".join(f"`{c}`:{typer(c)}" for c in l["honores"]) or "—"
                ig = ", ".join(f"`{c}`" for c in l["ignores"]) or "—"
                drapeau = "" if l["cherchable"] is None else (
                    "**cherchable**" if l["cherchable"] else "liste-seule")
                print(f"| `{l['resource']}` | `{l['operation']}` | {h} | {drapeau} | {ig} |")
        non_exposees = [l for l in saines if l.get("options_non_exposees")]
        if non_exposees:
            print("\n**Options que le nœud sait lire mais que le corps n'expose pas** "
                  "(l'opération FONCTIONNE ; ce sont des fonctionnalités dormantes) :")
            for l in non_exposees:
                print(f"- `{l['resource']}/{l['operation']}` — "
                      + ", ".join(f"`{c}`" for c in l["options_non_exposees"]))
        for etiquette, lst in (("MAL CÂBLÉES", mal), ("MORTES", mortes), ("INDÉTERMINÉES", indet)):
            if lst:
                print(f"\n**{etiquette}** — ne pas déclarer au schéma :")
                for l in lst:
                    print(f"- `{l['resource']}/{l['operation']}` — {l['statut']}")

    print(f"\n---\n{total_mal} route(s) mal câblée(s) · {total_mortes} morte(s)")
    return total_mal, total_mortes


if __name__ == "__main__":
    mal, mortes = _rapport()
    sys.exit(2 if (mal or mortes) else 0)
