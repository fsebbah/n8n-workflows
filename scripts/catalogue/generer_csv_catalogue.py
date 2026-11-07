#!/usr/bin/env python3
"""Produit les CSV du catalogue d'outils — azy.daily#631.

    python3 scripts/catalogue/generer_csv_catalogue.py

Écrit deux fichiers dans docs/catalogue/ :

    outils-a-trafic.csv     les outils ayant servi au moins une fois  (le lot de travail)
    catalogue-complet.csv   les 237 outils publiés                    (la vue d'ensemble)

À quoi ça sert
-------------
Décider, outil par outil, DANS QUELLES SURFACES il a du sens (`chat`,
`voice_realtime`, `email`, `agenda`) et quelles CAPACITÉS CLIENT il exige
(`files_in`, `files_out`, `camera`…). Ces deux champs seront ensuite posés en
sticky note et lus par `Build Registry` (parseurs livrés par la PR #564).

⚠️ LA RÉPARTITION DU TRAVAIL EST VOLONTAIRE ET STRICTE
Ce script remplit UNIQUEMENT des colonnes factuelles, vérifiables, sans jugement :
méthode, catégorie, mode de réponse, services appelés, rend-il un binaire, trafic.

Les colonnes `surfaces` et `requires` sont laissées VIDES. Ce sont des décisions
produit : savoir qu'un outil extrait du texte d'un PDF ne dit pas si une persona
en conversation vocale doit pouvoir l'appeler. Un pré-remplissage serait relu
comme l'avis d'un expert et ne le serait pas — et plus personne ne distinguerait
le constaté du supposé.

La colonne `fonction` fait exception et porte sa provenance dans
`fonction_source` :
    sticky  →  lu dans `**Description:**`, fiable
    jet     →  DÉDUIT du code par ce script, À RELIRE

18 des 26 outils à trafic n'ont aucune description. On ne peut pas décider de la
surface d'usage d'un outil sans savoir ce qu'il fait : le jet est là pour donner
un point de départ relisable, pas pour faire autorité.

Sur l'absence de dérivation de `requires`
-----------------------------------------
`requires` n'est PAS dérivé, et c'est mesuré : `responseFormat: file` vit sur des
nœuds httpRequest qui TÉLÉCHARGENT un fichier (537 réponses `json`, 11 `text`,
1 seule `binary` dans tout le parc), et 11 outils acceptent des octets OU une URL
donc n'exigent rien. Un examen du JSON ne distingue pas une entrée d'une sortie.
La colonne `rend_binaire` est fiable (`respondWith: 'binary'`) ; `accepte_octets`
et `accepte_url` sont INDICATIVES et marquées comme telles.
"""

import collections
import csv
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
SORTIE = RACINE / "docs" / "catalogue"
RELEVE_DISTANT = "llm.local:/storage4/releve/executions.csv"

COLONNES = [
    "outil", "workflow", "methode", "category",
    "fonction", "fonction_source",
    "mode", "appelle", "rend_binaire", "accepte_octets_indicatif", "accepte_url_indicatif",
    "executions_cumulees", "a_trafic", "collision_de_chemin",
    "surfaces", "requires",
]


def config():
    env = {}
    for ligne in open(RACINE / ".env.local"):
        ligne = ligne.strip()
        if "=" in ligne and not ligne.startswith("#"):
            cle, val = ligne.split("=", 1)
            env[cle] = val.strip().strip('"').strip("'")
    return env


def workflows_actifs(env):
    """Tous les workflows actifs, curseur suivi — le parc dépasse 250 (#543)."""
    base = env["N8N_API_URL"].rstrip("/")
    entetes = {"X-N8N-API-KEY": env["N8N_API_KEY"]}
    tous, curseur = [], None
    while True:
        url = f"{base}/workflows?active=true&limit=250" + (f"&cursor={curseur}" if curseur else "")
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=entetes), timeout=60))
        tous += d["data"]
        curseur = d.get("nextCursor")
        if not curseur:
            return tous


def executions():
    """Exécutions cumulées par outil, depuis le recensement quotidien sur llm.

    ⚠️ Un zéro ne prouve pas l'absence d'appel quand les succès ne sont pas
    enregistrés (`sauve_succes: none`) : un seul workflow du parc est dans ce cas,
    `DOC - Render PDF` / `torah-pdf`. Son zéro ne vaut rien ; les autres valent.
    """
    local = Path("/tmp") / "releve_executions.csv"
    r = subprocess.run(["scp", "-o", "ConnectTimeout=10", RELEVE_DISTANT, str(local)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(f"⚠️  recensement inaccessible ({RELEVE_DISTANT}) : colonnes de trafic à 0",
              file=sys.stderr)
        return collections.Counter()
    cum = collections.Counter()
    for ligne in csv.DictReader(open(local)):
        try:
            cum[ligne["tool"]] += int(ligne["executions"] or 0)
        except (ValueError, KeyError):
            pass
    return cum


# ── Filtre du catalogue, identique à `Build Registry` après la PR #555 ──────────
EXCLU = re.compile(r"^torah-corpus")


def chemin_outil(w):
    """Le chemin publié, ou None si le workflow n'est pas un outil du catalogue.

    ⚠️ `nodes.find(webhook)` — le PREMIER seulement, comme le registre. 5 workflows
    actifs ont plusieurs webhooks, donc 6 chemins joignables ne sont pas publiés
    (dont `render-pdf` et `pdf-templates`). Reproduire la limite est volontaire :
    ce CSV décrit le catalogue TEL QU'IL EST, pas tel qu'il devrait être.
    """
    if "Registry" in w["name"]:
        return None
    webhooks = [n for n in w.get("nodes", []) if n["type"] == "n8n-nodes-base.webhook"]
    if not webhooks:
        return None
    chemin = webhooks[0].get("parameters", {}).get("path") or webhooks[0].get("webhookId") or ""
    return None if EXCLU.match(str(chemin)) else str(chemin)


def premiere_sticky(w):
    """La PREMIÈRE sticky note — la seule que `Build Registry` consulte."""
    for n in w.get("nodes", []):
        if n["type"] == "n8n-nodes-base.stickyNote":
            return n.get("parameters", {}).get("content", "") or ""
    return ""


def neutraliser_expressions(url):
    """Normalise une URL de nœud n8n pour l'affichage : `=` de tête et `{{ … }}`.

    Le `=` initial est le marqueur d'expression de n8n ; il est retiré ICI et non chez
    l'appelant, pour qu'une seule fonction porte la normalisation — sinon le contrat de
    cette fonction dépend de ce que fait son appelant, et il devient intestable.

    Remplace les `{{ … }}` par `…`, y compris IMBRIQUÉS.

    ⚠️ Un simple `\{\{[^}]*\}\}` ne suffit pas : certaines URL portent une IIFE
    complète avec des accolades internes. Mesuré sur `torah-get-page-translations`,
    dont l'URL contient `{{ (() => { let params = []; … })() }}` — la version naïve
    laissait tout le corps JavaScript dans le CSV, rendant la colonne illisible.
    On retire donc les groupes les plus INTERNES de façon répétée, puis on balaie
    tout reste d'accolade.
    """
    url = url.lstrip("=")
    precedent = None
    while precedent != url:
        precedent = url
        url = re.sub(r"\{\{[^{}]*\}\}", "…", url)
    # ⚠️ S'il reste une accolade, c'est une expression à accolades internes — une
    # IIFE qui construit une chaîne de requête. Un nettoyage « intelligent » y laisse
    # des bouts de JavaScript : mesuré sur `torah-get-page-translations`, où la
    # colonne contenait « …/segments… if ($json.corpus) … return ' ». On TRONQUE :
    # pour décrire un outil, la forme du chemin suffit, la construction des
    # paramètres n'apporte rien et nuit à la lisibilité.
    coupe = url.find("{")
    if coupe >= 0:
        url = url[:coupe].rstrip("&?") + "…"
    return re.sub(r"…{2,}", "…", url)


def services_appeles(w):
    """Les URL appelées, expressions neutralisées et dédoublonnées."""
    vus = []
    for n in w.get("nodes", []):
        url = n.get("parameters", {}).get("url")
        if not isinstance(url, str):
            continue
        propre = neutraliser_expressions(url)
        propre = re.sub(r"\?.*$", "", propre).rstrip("/")
        if propre and propre not in vus:
            vus.append(propre)
    return " ; ".join(vus[:5])


def jet_description(w, chemin, appels):
    """Premier jet DÉDUIT du code. À relire — il décrit la mécanique, pas l'intention.

    Volontairement télégraphique : un jet qui ressemble à une vraie description
    serait validé sans être lu.
    """
    morceaux = []
    noeuds = [n["name"] for n in w.get("nodes", []) if n["type"] != "n8n-nodes-base.stickyNote"]
    if appels:
        cibles = []
        for a in appels.split(" ; "):
            # ⚠️ Un autre outil n8n se reconnaît à `/webhook/` juste après l'hôte,
            # PAS à sa présence quelque part dans le chemin. Mesuré sur `server-sync`,
            # qui appelle `…/api/discord/webhook/server-sync` — une route du backend,
            # et mon jet annonçait « appelle outil server-sync », c'est-à-dire
            # lui-même. Un jet qui se trompe sur la cible est pire qu'un jet vide.
            m = re.match(r"^(?:[a-z]+:)?/?/?[^/]*/webhook/(.+)$", a)
            if m:
                cibles.append("outil " + m.group(1))
            else:
                chemin_api = re.sub(r"^.*?(/api/|/v\d)", r"\1", a)
                cibles.append(chemin_api or a)
        morceaux.append("appelle " + ", ".join(dict.fromkeys(cibles)))
    else:
        morceaux.append("aucun appel sortant")
    interessants = [n for n in noeuds
                    if not re.match(r"^(Webhook|Respond|Valid|Input Valid|Parse|Format)", n)]
    if interessants:
        morceaux.append("étapes : " + ", ".join(interessants[:4]))
    return "JET — " + " ; ".join(morceaux)


def ligne(w, chemin, cum):
    sticky = premiere_sticky(w)
    webhooks = [n for n in w["nodes"] if n["type"] == "n8n-nodes-base.webhook"]
    brut = json.dumps(w, ensure_ascii=False)

    m = re.search(r"\*\*Description[:\s]*\*\*\s*\n?([^\n*]+)", sticky, re.I)
    if m and m.group(1).strip():
        fonction, source = m.group(1).strip(), "sticky"
    else:
        fonction, source = None, "jet"

    m = re.search(r"\*\*Category:\*\*\s*([^\n*]+)", sticky, re.I)
    categorie = m.group(1).strip().lower() if m else ""

    appels = services_appeles(w)
    if fonction is None:
        fonction = jet_description(w, chemin, appels)

    binaire = any(
        n["type"] == "n8n-nodes-base.respondToWebhook"
        and n.get("parameters", {}).get("respondWith") == "binary"
        for n in w["nodes"]
    )
    octets = bool(re.search(r"file_data|image_base64|document_base64|audio_base64|pdf_base64", brut))
    url = bool(re.search(r"file_url|image_url|document_url|audio_url|video_url", brut))
    n_exec = cum.get(chemin, 0)

    return {
        "outil": chemin,
        "workflow": w["name"],
        "methode": webhooks[0].get("parameters", {}).get("httpMethod") or "POST",
        "category": categorie,
        "fonction": fonction,
        "fonction_source": source,
        # Un outil qui accepte un callback_url peut répondre en asynchrone : il n'a
        # donc guère de sens en conversation vocale temps réel. Le fait contraint la
        # décision sans la prendre.
        "mode": "callback" if "callback_url" in brut else "synchrone",
        "appelle": appels,
        "rend_binaire": "oui" if binaire else "non",
        "accepte_octets_indicatif": "oui" if octets else "",
        "accepte_url_indicatif": "oui" if url else "",
        "executions_cumulees": n_exec,
        "a_trafic": "oui" if n_exec > 0 else "non",
        # Renseigné après coup : voir `marquer_collisions`.
        "collision_de_chemin": "",
        "surfaces": "",
        "requires": "",
    }


def marquer_collisions(lignes):
    """Signale les chemins revendiqués par PLUSIEURS workflows.

    ⚠️ C'est ce qui explique l'écart entre ce fichier et `total_tools` du registre :
    239 lignes ici, 237 outils publiés. Le registre indexe `tools[webhookPath]`, donc
    deux workflows sur un même chemin s'écrasent — la dernière écriture gagne, et
    l'ordre vient de l'API.

    Limite connue et assumée (décision MCP du 2026-10-01, option c) : les seuls
    chemins en collision sont des `config/*` dont les lecteurs POST sont appelés par
    chat.api en REST, jamais sélectionnés comme outils agentiques. Le champ `method`
    de chaque entrée reste le témoin de quel verbe a gagné.

    Marquer plutôt que dédoublonner : masquer la collision ferait disparaître du
    fichier des workflows actifs et fonctionnels.
    """
    par_chemin = collections.Counter(l["outil"] for l in lignes)
    for l in lignes:
        if par_chemin[l["outil"]] > 1:
            l["collision_de_chemin"] = f"{par_chemin[l['outil']]} workflows sur ce chemin"
    return sum(1 for c in par_chemin.values() if c > 1)


def ecrire(chemin_fichier, lignes, entete):
    chemin_fichier.parent.mkdir(parents=True, exist_ok=True)
    with open(chemin_fichier, "w", newline="", encoding="utf-8") as fh:
        for l in entete:
            fh.write(f"# {l}\n")
        w = csv.DictWriter(fh, fieldnames=COLONNES)
        w.writeheader()
        w.writerows(lignes)
    print(f"  {chemin_fichier.relative_to(RACINE)}  —  {len(lignes)} lignes")


def main():
    env = config()
    cum = executions()
    lignes = []
    for w in workflows_actifs(env):
        chemin = chemin_outil(w)
        if chemin:
            lignes.append(ligne(w, chemin, cum))
    # Trafic décroissant d'abord : on décide des outils qui servent avant les autres.
    lignes.sort(key=lambda l: (-l["executions_cumulees"], l["outil"]))
    n_collisions = marquer_collisions(lignes)
    a_trafic = [l for l in lignes if l["a_trafic"] == "oui"]
    chemins = len({l["outil"] for l in lignes})

    commun = [
        "Catalogue d'outils n8n — azy.daily#631.  Généré par scripts/catalogue/generer_csv_catalogue.py",
        "",
        "À REMPLIR À LA MAIN : les colonnes `surfaces` et `requires`. Tout le reste est factuel.",
        "  surfaces : chat | voice_realtime | email | agenda   (liste, séparée par des virgules)",
        "  requires : files_in | files_out | camera | …        (quasi toujours vide, voir plus bas)",
        "",
        "`fonction_source` dit d'où vient la description :",
        "  sticky = lu dans **Description:**, fiable      jet = DÉDUIT du code, À RELIRE",
        "",
        "requires n'est PAS dérivé automatiquement, et c'est mesuré : un examen du JSON ne",
        "distingue pas un champ d'entrée d'un champ de sortie. `rend_binaire` est fiable",
        "(respondWith: binary) ; `accepte_octets` et `accepte_url` sont INDICATIVES.",
        "Un outil qui accepte octets OU url n'exige rien : un client sans sélecteur de",
        "fichier l'utilise par URL. 1 seul workflow du parc rend vraiment un binaire.",
        "",
        "`mode: callback` = l'outil peut répondre en asynchrone, donc peu compatible",
        "avec une conversation vocale temps réel.",
        "",
        "⚠️ Un `executions_cumulees` à 0 ne prouve pas l'absence d'appel pour torah-pdf",
        "(DOC - Render PDF) : ses succès ne sont pas enregistrés. Seul workflow concerné.",
        "",
        f"⚠️ {len(lignes)} lignes pour {chemins} chemins distincts : {n_collisions} chemin(s) sont",
        "revendiqués par deux workflows (verbes différents), signalés en `collision_de_chemin`.",
        "Le registre n'en publie qu'un par chemin — d'où son `total_tools` plus petit.",
    ]

    print("\nCSV du catalogue :")
    ecrire(SORTIE / "outils-a-trafic.csv", a_trafic,
           commun + ["", f"LOT DE TRAVAIL : les {len(a_trafic)} outils ayant servi au moins une fois."])
    ecrire(SORTIE / "catalogue-complet.csv", lignes,
           commun + ["", f"VUE D'ENSEMBLE : les {len(lignes)} outils publiés au catalogue.",
                     f"Dont {len(a_trafic)} ont servi ; les {len(lignes)-len(a_trafic)} autres sont à zéro sur 5 semaines."])

    sans_desc = [l["outil"] for l in a_trafic if l["fonction_source"] == "jet"]
    print(f"\n  {len(a_trafic)} outils à trafic, dont {len(sans_desc)} sans description (jet à relire)")
    print(f"  {len(lignes)} lignes pour {chemins} chemins distincts "
          f"({n_collisions} collision(s) signalée(s))")


if __name__ == "__main__":
    main()
