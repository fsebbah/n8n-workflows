#!/usr/bin/env python3
"""Injecte `**Surfaces:**` / `**Requires:**` depuis un CSV rempli — azy.daily#631.

    python3 scripts/catalogue/injecter_surfaces.py docs/catalogue/outils-a-trafic.csv --blanc
    python3 scripts/catalogue/injecter_surfaces.py docs/catalogue/outils-a-trafic.csv

Lit les colonnes `surfaces` et `requires` du CSV, les écrit dans la PREMIÈRE sticky
note du workflow correspondant, et produit le fichier-liste de réimport.

Les lignes dont `surfaces` ET `requires` sont vides sont IGNORÉES : on n'écrit rien
pour un outil non arbitré, et il n'entre pas dans la liste de réimport. On peut donc
remplir le CSV par morceaux et réinjecter autant de fois qu'on veut.

⚠️ TOUJOURS DANS LA PREMIÈRE STICKY
`Build Registry` fait `nodes.find(stickyNote)` : une étiquette posée dans la deuxième
serait invisible du catalogue, SANS AUCUNE ERREUR. 9 outils du catalogue ont plusieurs
sticky notes. Un workflow qui n'en a aucune en reçoit une, portant son nom et la
raison de son existence — une sticky muette serait un artefact.

⚠️ CE SCRIPT NE RÉIMPORTE RIEN
Il modifie les fichiers du dépôt et écrit un fichier-liste. Le réimport reste une
opération manuelle, lancée par l'utilisateur :

    python3 scripts/n8n/n8n_api.py batch-reimport <liste> --dry-run
    python3 scripts/n8n/n8n_api.py batch-reimport <liste>
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
WORKFLOWS = RACINE / "workflows"
LISTE = RACINE / "scripts" / "n8n" / "reimport-surfaces.txt"

# Les étiquettes sont posées dans cet ordre, à la fin de la sticky.
CHAMPS = ("Surfaces", "Requires")


def stem(nom_workflow):
    """Nom de fichier attendu par `batch-reimport` : le STEM, underscores compris."""
    return nom_workflow.replace(" ", "_").replace("/", "_")


def lignes_csv(chemin):
    with open(chemin, encoding="utf-8") as fh:
        utiles = (l for l in fh if not l.startswith("#"))
        return list(csv.DictReader(utiles))


def valeurs(ligne):
    """Les valeurs à poser, normalisées comme le parseur les relira.

    Même traitement que `listeStickyNote631` dans `Build Registry` : découpage sur la
    virgule, trim, minuscule, vides écartés. Normaliser ICI évite qu'un CSV rempli
    « Chat, Email » produise une sticky que le parseur relira autrement que prévu.
    """
    out = {}
    for champ in CHAMPS:
        brut = (ligne.get(champ.lower()) or "").strip()
        items = [v.strip().lower() for v in brut.split(",") if v.strip()]
        if items:
            out[champ] = items
    return out


def poser(contenu, a_poser):
    """Remplace ou ajoute les étiquettes dans un contenu de sticky.

    Idempotent : réinjecter le même CSV ne duplique rien. Une étiquette déjà présente
    est REMPLACÉE — c'est ce qui permet de corriger un arbitrage sans éditer à la main.
    """
    for champ, items in a_poser.items():
        ligne = f"**{champ}:** " + ", ".join(items)
        motif = re.compile(rf"^\*\*{champ}:\*\*.*$", re.I | re.M)
        if motif.search(contenu):
            contenu = motif.sub(ligne, contenu)
        else:
            contenu = contenu.rstrip() + "\n\n" + ligne + "\n"
    return contenu


def sticky_neuve(nom, a_poser):
    corps = "\n".join(f"**{c}:** " + ", ".join(v) for c, v in a_poser.items())
    return {
        "parameters": {
            "content": (f"## {nom}\n\n{corps}\n\n"
                        "_Note créée pour porter les surfaces d'usage (azy.daily#631). "
                        "Ce workflow n'avait aucune sticky note ; la description reste "
                        "à écrire._\n"),
            "height": 180,
            "width": 400,
        },
        "id": f"sticky-surfaces-{stem(nom)}"[:36],
        "name": "Documentation",
        "type": "n8n-nodes-base.stickyNote",
        "typeVersion": 1,
        "position": [-400, -200],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", help="le CSV rempli (colonnes surfaces / requires)")
    ap.add_argument("--blanc", action="store_true",
                    help="n'écrit rien, montre ce qui serait fait")
    args = ap.parse_args()

    lignes = lignes_csv(args.csv)
    a_traiter = [(l, valeurs(l)) for l in lignes]
    a_traiter = [(l, v) for l, v in a_traiter if v]

    if not a_traiter:
        print("Aucune ligne ne porte de `surfaces` ni de `requires` — rien à faire.")
        print("Remplir ces colonnes dans le CSV, puis relancer.")
        return 0

    # Tout résoudre AVANT d'écrire quoi que ce soit : une injection à moitié faite
    # laisserait le dépôt dans un état que personne n'a décidé.
    manquants = [l["workflow"] for l, _ in a_traiter
                 if not (WORKFLOWS / f"{stem(l['workflow'])}.json").exists()]
    if manquants:
        print(f"Erreur : {len(manquants)} workflow(s) du CSV sont introuvables dans "
              f"workflows/ — rien n'a été écrit.", file=sys.stderr)
        for m in manquants:
            print(f"   • {m!r} → {stem(m)}.json", file=sys.stderr)
        return 1

    stems, creees, remplacees = [], [], []
    for ligne, a_poser in a_traiter:
        chemin = WORKFLOWS / f"{stem(ligne['workflow'])}.json"
        wf = json.loads(chemin.read_text(encoding="utf-8"))
        stickies = [n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.stickyNote"]
        resume = " · ".join(f"{c}={','.join(v)}" for c, v in a_poser.items())

        if stickies:
            avant = stickies[0]["parameters"].get("content", "") or ""
            apres = poser(avant, a_poser)
            if any(re.search(rf"^\*\*{c}:\*\*", avant, re.I | re.M) for c in a_poser):
                remplacees.append(ligne["outil"])
            if not args.blanc:
                stickies[0]["parameters"]["content"] = apres
        else:
            creees.append(ligne["outil"])
            if not args.blanc:
                wf["nodes"].append(sticky_neuve(wf["name"], a_poser))

        prefixe = "[BLANC] " if args.blanc else ""
        print(f"  {prefixe}{ligne['outil']:<34} {resume}"
              + ("   (sticky créée)" if not stickies else ""))
        if not args.blanc:
            chemin.write_text(json.dumps(wf, indent=2, ensure_ascii=False) + "\n",
                              encoding="utf-8")
        stems.append(stem(ligne["workflow"]))

    print(f"\n{len(stems)} workflow(s) · {len(creees)} sticky créée(s) · "
          f"{len(remplacees)} étiquette(s) remplacée(s)")

    if args.blanc:
        print("\nRien n'a été écrit (--blanc). Relancer sans l'option pour appliquer.")
        return 0

    LISTE.write_text("".join(s + "\n" for s in stems), encoding="utf-8")
    # `relative_to` LÈVE quand le chemin n'est pas sous la racine — ce qui arrive dès
    # qu'on détourne LISTE, par exemple en test. Un affichage ne doit jamais faire
    # échouer une opération déjà accomplie : les fichiers sont écrits à ce stade.
    try:
        affiche = LISTE.relative_to(RACINE)
    except ValueError:
        affiche = LISTE
    print(f"\nFichier-liste écrit : {affiche}")
    print("\nRéimport — à lancer à la main, après relecture du diff :")
    print(f"    python3 scripts/n8n/n8n_api.py batch-reimport {affiche} --dry-run")
    print(f"    python3 scripts/n8n/n8n_api.py batch-reimport {affiche}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
