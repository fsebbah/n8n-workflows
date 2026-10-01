#!/usr/bin/env python3
"""Relevé quotidien des exécutions par outil — « exposé au registre / réellement appelé ».

    python3 scripts/audit/releve_executions.py            # relève aujourd'hui
    python3 scripts/audit/releve_executions.py --report    # lit l'historique accumulé
    python3 scripts/audit/releve_executions.py --dry-run   # n'écrit pas le CSV

POURQUOI UN RELEVÉ ET PAS UN INVENTAIRE
---------------------------------------
La question posée était : parmi les outils exposés au registre, lesquels ne servent à
personne ? Un inventaire ponctuel ne peut PAS y répondre, et j'ai essayé avant de le dire —
n8n ne garde que ~2 jours d'exécutions, donc « 0 appel » ne distingue pas un outil mensuel
d'un outil mort depuis un an.

Trois colonnes de compensation ont été calculées puis ÉCARTÉES, chacune pour une raison
mesurée (2026-09-30) :

  • âge du dernier commit : 145 fichiers sur 251 partagent la date 2026-06-29, un import en
    masse. La colonne mesurerait une manipulation de dépôt, pas l'abandon d'un outil.
  • références dans les dépôts voisins : MCP construit les URL dynamiquement depuis le
    registre. Un outil appelé PAR MCP n'apparaît donc en clair nulle part — la colonne
    repère les appels codés en dur, c'est-à-dire l'inverse du cas normal.
  • couverture : azy.front, azy.desktop et azy.infra ne sont pas clonés localement.
    « Non référencé » peut simplement vouloir dire « référencé là où je ne regarde pas ».

Il ne reste qu'une colonne honnête : l'historique d'exécution. D'où ce relevé, qui
l'ACCUMULE. Au bout de trente jours, « 0 exécution en 30 jours » devient une affirmation
défendable. Pas avant, et le rapport refuse de conclure tant que la fenêtre est trop courte.

MÉTHODE
-------
Un appel `/executions?workflowId=<id>` par outil : filtré, donc **sans plafond de
pagination** — ces zéros sont fermes. Un comptage global serait tronqué par la pagination
(mesuré : 3000 exécutions couvrent ~21 h, dont 2580 pour le seul `Claude - Batch Poller`).

Deux confondants à écarter, et le script les écarte :
  • un **témoin non nul** est exigé — si AUCUN outil n'a d'exécution, la sonde est en panne
    et le relevé est refusé plutôt qu'enregistré comme un parc à l'arrêt ;
  • `saveDataSuccessExecution` : un workflow réglé pour ne pas enregistrer ses succès
    afficherait 0 sans être inactif. Le réglage est relevé et porté dans le CSV.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
CSV = RACINE / "reports" / "releve_executions.csv"
COLONNES = ["date", "tool", "workflow", "actif", "expose", "executions",
            "derniere_execution", "sauve_succes", "dans_le_depot"]

# Noms exclus du registre par `MCP - Tools - Registry` (`Build Registry`).
EXCLUS = ("Registry", "TORAH")

# Troisième axe, découvert en lançant le relevé (2026-10-01) : le SERVEUR porte 576
# workflows avec webhook, le DÉPÔT 251. Plus de la moitié des outils exposés au registre
# ne sont donc pas versionnés — ni relus, ni testés, ni restaurables après incident.
# Un outil exposé + jamais appelé + absent du dépôt est le candidat le plus net ; un outil
# absent du dépôt mais TRÈS appelé est un problème plus urgent, dans l'autre sens.
DOSSIER_WORKFLOWS = RACINE / "workflows"


def api(chemin: str):
    base = (os.environ.get("N8N_API_URL") or "").rstrip("/")
    cle = os.environ.get("N8N_API_KEY") or ""
    if not base or not cle:
        print("❌ N8N_API_URL / N8N_API_KEY absents — sourcer .env.local", file=sys.stderr)
        raise SystemExit(2)
    req = urllib.request.Request(base + chemin, headers={"X-N8N-API-KEY": cle})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def tous_les_workflows() -> list[dict]:
    out, cur = [], ""
    while True:
        d = api("/workflows?limit=250" + (f"&cursor={cur}" if cur else ""))
        out.extend(d.get("data") or [])
        cur = d.get("nextCursor")
        if not cur:
            break
    # L'API peut rendre un même workflow sur deux pages ; on dédoublonne par id.
    vus, uniques = set(), []
    for w in out:
        if w["id"] not in vus:
            vus.add(w["id"])
            uniques.append(w)
    return uniques


def chemins_du_depot() -> set[str]:
    """Chemins de webhook présents dans les fichiers versionnés."""
    chemins = set()
    for fichier in DOSSIER_WORKFLOWS.glob("*.json"):
        try:
            wf = json.loads(fichier.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        p = chemin_webhook(wf)
        if p:
            chemins.add(p)
    return chemins


def chemin_webhook(wf: dict) -> str | None:
    for n in wf.get("nodes") or []:
        if str(n.get("type", "")).endswith("webhook"):
            p = str((n.get("parameters") or {}).get("path") or "")
            if p:
                return p
    return None


def relever() -> list[dict]:
    aujourdhui = dt.date.today().isoformat()
    du_depot = chemins_du_depot()
    lignes = []
    for wf in tous_les_workflows():
        chemin = chemin_webhook(wf)
        if not chemin:
            continue
        nom = wf.get("name") or ""
        expose = bool(wf.get("active")) and not any(x in nom for x in EXCLUS)
        try:
            ex = (api(f"/executions?workflowId={wf['id']}&limit=100").get("data") or [])
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  ⚠ {nom} : exécutions illisibles ({type(e).__name__})", file=sys.stderr)
            continue
        lignes.append({
            "date": aujourdhui,
            "tool": chemin,
            "workflow": nom,
            "actif": int(bool(wf.get("active"))),
            "expose": int(expose),
            "executions": len(ex),
            "derniere_execution": (ex[0].get("startedAt") or "")[:19] if ex else "",
            "sauve_succes": (wf.get("settings") or {}).get("saveDataSuccessExecution", "defaut"),
            "dans_le_depot": int(chemin in du_depot),
        })
    return lignes


def ecrire(lignes: list[dict]) -> None:
    """Remplace les lignes du jour, conserve les précédentes (relevé idempotent)."""
    CSV.parent.mkdir(parents=True, exist_ok=True)
    aujourdhui = lignes[0]["date"]
    anciennes = []
    if CSV.exists():
        with CSV.open(newline="", encoding="utf-8") as fh:
            anciennes = [r for r in csv.DictReader(fh) if r.get("date") != aujourdhui]
    with CSV.open("w", newline="", encoding="utf-8") as fh:
        wr = csv.DictWriter(fh, fieldnames=COLONNES)
        wr.writeheader()
        wr.writerows(anciennes)
        wr.writerows(lignes)


def rapport() -> int:
    if not CSV.exists():
        print("Aucun relevé. Lancer le script sans option d'abord.")
        return 1
    with CSV.open(newline="", encoding="utf-8") as fh:
        lignes = list(csv.DictReader(fh))
    jours = sorted({r["date"] for r in lignes})
    total = defaultdict(int)
    vu = {}
    expose_dernier = {}
    for r in lignes:
        total[r["tool"]] += int(r["executions"])
        if int(r["executions"]):
            vu[r["tool"]] = max(vu.get(r["tool"], ""), r["derniere_execution"])
        if r["date"] == jours[-1]:
            # Un même chemin peut être porté par plusieurs workflows (doublons ci-dessous) :
            # on agrège par `max` au lieu d'écraser, sinon le dernier lu décide seul.
            expose_dernier[r["tool"]] = max(expose_dernier.get(r["tool"], 0), int(r["expose"]))

    depot_dernier: dict[str, int] = {}
    doublons: dict[str, list[str]] = defaultdict(list)
    for r in lignes:
        if r["date"] != jours[-1]:
            continue
        depot_dernier[r["tool"]] = max(depot_dernier.get(r["tool"], 0),
                                       int(r.get("dans_le_depot") or 0))
        if int(r["expose"]):
            doublons[r["tool"]].append(r["workflow"])
    exposes = [t for t, e in expose_dernier.items() if e]
    jamais = sorted(t for t in exposes if not total[t])
    print(f"\nFenêtre observée : {len(jours)} jour(s) — du {jours[0]} au {jours[-1]}")
    print(f"Outils exposés au registre : {len(exposes)}")
    print(f"Outils vus s'exécuter      : {len(exposes) - len(jamais)}")
    print(f"Jamais vus s'exécuter      : {len(jamais)}\n")

    hors_depot = sorted(t for t in exposes if not depot_dernier.get(t, 1))
    if hors_depot:
        print(f"⚠️  Exposés mais ABSENTS du dépôt : {len(hors_depot)} sur {len(exposes)}")
        print("    Ni relus, ni testés, ni restaurables après incident.")
        actifs_hors = sorted((t for t in hors_depot if total[t]), key=lambda t: -total[t])
        if actifs_hors:
            print(f"    Dont {len(actifs_hors)} qui TOURNENT — l'urgence est de les"
                  " versionner, pas de les supprimer :")
            for t in actifs_hors[:10]:
                print(f"      {total[t]:>6}  {t}")
        print()
    else:
        print("✅ Tous les outils exposés sont versionnés dans le dépôt.")
        orphelins = sum(1 for r in lignes if r["date"] == jours[-1]
                        and not int(r.get("dans_le_depot") or 0))
        if orphelins:
            print(f"   ({orphelins} workflows du serveur sont absents du dépôt, mais AUCUN"
                  " n'est actif —")
            print("    des copies mortes, pas un trou de gouvernance.)")
        print()

    # Deux workflows ACTIFS sur le même chemin : n8n n'en sert qu'un, et lequel n'est pas
    # écrit nulle part. Déjà vu sur `torah-translate-batch` (Dispatcher vs Orchestrator),
    # où le fichier du dépôt et le serveur ne désignaient pas le même gagnant.
    multiples = {t: w for t, w in doublons.items() if len(w) > 1}
    if multiples:
        print(f"⚠️  {len(multiples)} chemin(s) servi(s) par PLUSIEURS workflows actifs :")
        for t, w in sorted(multiples.items()):
            print(f"   {t}")
            for nom in w:
                print(f"      {nom}")
        print("    n8n n'en sert qu'un, arbitrairement. À trancher workflow par workflow.")
        print()

    if len(jours) < 14:
        print(f"⚠️  {len(jours)} jour(s) d'historique : TROP COURT pour conclure.")
        print("   Un outil appelé une fois par mois est ici indistinguable d'un outil mort.")
        print("   Le relevé doit tourner au moins deux semaines avant d'être exploitable.\n")
    else:
        print(f"Après {len(jours)} jours, « jamais vu » devient un argument — pas une preuve :")
        print("   un outil saisonnier (fin de mois, rentrée scolaire) peut encore manquer.\n")

    print("Les plus sollicités :")
    for t, n in sorted(total.items(), key=lambda kv: -kv[1])[:10]:
        if n:
            print(f"   {n:>6}  {t}")
    if jamais:
        print(f"\nExposés et jamais vus ({len(jamais)}) — candidats, pas verdicts :")
        for t in jamais[:40]:
            print(f"   {t}")
        if len(jamais) > 40:
            print(f"   … et {len(jamais) - 40} autres")
    masques = sorted({r["tool"] for r in lignes
                      if r["sauve_succes"] not in ("defaut", "all", "")})
    if masques:
        print(f"\n⚠️  {len(masques)} outil(s) ne sauvegardent pas tous leurs succès — leur")
        print("    zéro ne veut rien dire :")
        for t in masques[:10]:
            print(f"   {t}")
    print()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--report", action="store_true", help="lire l'historique accumulé")
    ap.add_argument("--dry-run", action="store_true", help="relever sans écrire")
    args = ap.parse_args()

    if args.report:
        return rapport()

    lignes = relever()
    if not lignes:
        print("❌ Aucun outil relevé — sonde en panne, rien n'est écrit.", file=sys.stderr)
        return 2
    # Témoin non nul : un parc entier à zéro est bien plus probablement une sonde cassée
    # qu'un parc à l'arrêt. On refuse d'enregistrer un relevé qu'on ne peut pas croire.
    actifs = sum(1 for l in lignes if l["executions"])
    if actifs == 0:
        print("❌ Aucune exécution sur AUCUN des outils : témoin absent, sonde suspecte.",
              file=sys.stderr)
        print("   Rien n'est écrit — vérifier l'API avant de conclure à un parc inactif.",
              file=sys.stderr)
        return 2
    print(f"{len(lignes)} outils relevés, {actifs} avec au moins une exécution")
    if args.dry_run:
        print("--dry-run : rien n'est écrit")
        return 0
    ecrire(lignes)
    print(f"→ {CSV.relative_to(RACINE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
