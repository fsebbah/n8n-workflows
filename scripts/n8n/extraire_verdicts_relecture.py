#!/usr/bin/env python3
"""
Extrait les verdicts de relecture de traduction Torah depuis les exécutions n8n,
SANS AUCUNE CLÉ, et les dépose en JSONL pour rejeu ultérieur (azy.daily#669).

POURQUOI CE SCRIPT EXISTE
-------------------------
`Torah Translate Simple` produit un verdict de relecture (`verification`), mais
`Torah Router / Prepare Save` le jette : il n'atteint jamais la base. Le verdict
ne survit donc que dans les données d'exécution n8n — dont la rétention est de
l'ordre de DEUX JOURS. Tout verdict produit d'ici à la création de la colonne
`review` côté torah.api serait perdu.

Ce script met les verdicts à l'abri sur disque, en attendant que la colonne
existe. Il ne REJOUE rien : l'API n'accepte pas encore `review`, et un champ non
déclaré est silencieusement ignoré par Pydantic (donc un rejeu prématuré
reperdrait tout, sans erreur). Le rejeu sera une seconde étape, après migration.

⚠️ SÉCURITÉ — LA RAISON D'ÊTRE DE LA LISTE BLANCHE
--------------------------------------------------
En BYOT, la clé d'API transite dans le CORPS de la requête. Les données
d'exécution n8n contiennent donc les clés EN CLAIR (vérifié : `execution_data`
porte des chaînes `sk-ant-…`). Conséquences, tenues par ce script :

  1. on ne copie JAMAIS un nœud, un item ou un dictionnaire entier ;
     chaque champ de sortie est nommé explicitement dans CHAMPS_* ;
  2. un dernier garde-fou relit la ligne sérialisée et REFUSE d'écrire si
     elle contient une empreinte de clé connue (voir MOTIFS_SECRET) ;
  3. le fichier de sortie vit dans scripts/n8n/logs/, ignoré par git.

Ce garde-fou est une ceinture, pas la bretelle : la protection réelle vient de
la liste blanche. Ne jamais le remplacer par un filtrage a posteriori.

⚠️ L'EMPREINTE DE TRADUCTION, ET POURQUOI ELLE N'EST PAS DÉCORATIVE
-------------------------------------------------------------------
On enregistre `empreinte_traduction` (sha256 des 2000 premiers caractères de la
traduction relue), jamais la traduction elle-même — la base l'a déjà. Au rejeu,
elle permet de refuser d'appliquer un verdict à une traduction qui a changé
depuis : chaque sauvegarde côté api pose `is_current = true` et remplace la
version précédente, donc un verdict peut viser une version qui n'est plus là.
Appliquer un avis à un texte qu'il n'a pas relu serait pire que ne rien appliquer.

USAGE
-----
    python3 scripts/n8n/extraire_verdicts_relecture.py --dry-run
    python3 scripts/n8n/extraire_verdicts_relecture.py
    python3 scripts/n8n/extraire_verdicts_relecture.py --workflow "Torah Translate Simple"
    python3 scripts/n8n/extraire_verdicts_relecture.py --limite 500

Sortie : scripts/n8n/logs/verdicts-relecture.jsonl (append, dédoublonné).
"""

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

RACINE = Path(__file__).resolve().parent.parent.parent
SORTIE = RACINE / "scripts" / "n8n" / "logs" / "verdicts-relecture.jsonl"

# Workflows susceptibles de porter un verdict. Translate Simple est le seul en
# service ; les autres sont les chemins Discord dormants, qui SUBSTITUENT la
# traduction au lieu de l'annoter (doctrine opposée, cf. azy.daily#669) — on les
# accepte en option mais on marque la doctrine dans la sortie.
WORKFLOWS_DEFAUT = ["Torah Translate Simple"]
DOCTRINE = {
    "Torah Translate Simple": "annotation",
    "Torah Translate Worker": "substitution",
    "Torah Translate Page Worker": "substitution",
    "Torah Discord Translation Pivot": "substitution",
}

# Nœuds dont on lit la sortie. Appliquer Vérification porte le verdict final.
NOEUDS_VERDICT = ["Appliquer Vérification", "Sortie sans vérification"]

# ── Listes blanches : AUCUN autre champ ne sort d'ici ────────────────────────
CHAMPS_IDENTITE = ("segment_id", "commentary_id", "job_id", "request_id",
                   "target_language", "targetLanguage")
CHAMPS_VERDICT = ("approved", "confidence", "divergence", "notes", "suggestion",
                  "provider", "model")
CHAMPS_ISSUE = ("severite", "extrait", "explication")

# Empreintes de clés connues. Une seule suffit à faire échouer tout le lot.
MOTIFS_SECRET = [
    re.compile(r"sk-ant-"), re.compile(r"sk-proj-"), re.compile(r"sk-[A-Za-z0-9]{20}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{10}"), re.compile(r"gsk_[A-Za-z0-9]{10}"),
    re.compile(r"xai-[A-Za-z0-9]{10}"), re.compile(r"\bBearer\s+[A-Za-z0-9._\-]{20}"),
    re.compile(r"ya29\."), re.compile(r"\"api_key\"\s*:\s*\"[^\"]{8}"),
]


def charger_env():
    """Même convention que n8n_api.py : .env.local à la racine du dépôt."""
    conf = {}
    f = RACINE / ".env.local"
    if f.exists():
        for ligne in f.read_text().splitlines():
            ligne = ligne.strip()
            if ligne and not ligne.startswith("#") and "=" in ligne:
                cle, val = ligne.split("=", 1)
                conf[cle] = val
    return conf


def empreinte(texte):
    if not texte:
        return None
    return "sha256:" + hashlib.sha256(texte[:2000].encode("utf-8")).hexdigest()[:32]


def garde_fou(ligne):
    """Dernière barrière. Rend le motif fautif, ou None si la ligne est propre."""
    for motif in MOTIFS_SECRET:
        if motif.search(ligne):
            return motif.pattern
    return None


def extraire_un(item, meta):
    """Construit un enregistrement à partir d'UN item, champ par champ nommé."""
    j = item.get("json") or {}
    if not isinstance(j, dict):
        return None

    verif = j.get("verification")
    saut = j.get("verify_skipped")
    # Rien à dire sur cet item : ni verdict, ni motif de saut.
    if not isinstance(verif, dict) and saut is None:
        return None

    enr = {
        "extrait_le": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "execution_id": meta["execution_id"],
        "demarree_a": meta["demarree_a"],
        "workflow": meta["workflow"],
        "doctrine": DOCTRINE.get(meta["workflow"], "inconnue"),
    }
    for champ in CHAMPS_IDENTITE:
        if j.get(champ) not in (None, ""):
            enr.setdefault("target_language" if champ == "targetLanguage" else champ,
                           j[champ])

    enr["empreinte_traduction"] = empreinte(j.get("translation"))
    enr["verify_skipped"] = saut

    if isinstance(verif, dict):
        verdict = {c: verif.get(c) for c in CHAMPS_VERDICT if verif.get(c) is not None}
        problemes = []
        for pb in (verif.get("issues") or []):
            if isinstance(pb, dict):
                problemes.append({c: pb.get(c) for c in CHAMPS_ISSUE
                                  if pb.get(c) is not None})
            elif isinstance(pb, str):
                problemes.append({"explication": pb})
        if problemes:
            verdict["issues"] = problemes
        enr["verdict"] = verdict
    else:
        enr["verdict"] = None

    return enr


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    limite = 250
    if "--limite" in args:
        limite = int(args[args.index("--limite") + 1])
    workflows = WORKFLOWS_DEFAUT
    if "--workflow" in args:
        workflows = [args[args.index("--workflow") + 1]]

    conf = charger_env()
    base = conf.get("N8N_API_URL", "http://llm.local:5678/api/v1")
    cle = conf.get("N8N_API_KEY", "")
    if not cle:
        print("[ERREUR] N8N_API_KEY absente de .env.local", file=sys.stderr)
        return 2
    entetes = {"X-N8N-API-KEY": cle, "accept": "application/json"}

    # Résolution des identifiants de workflow par nom.
    # ⚠️ Le parc dépasse 250 workflows : SANS pagination, `Torah Translate Simple`
    #    n'est pas dans la première page et le script conclut « introuvable ».
    par_nom, curseur = {}, None
    while True:
        params = {"limit": 250}
        if curseur:
            params["cursor"] = curseur
        r = requests.get(f"{base}/workflows", headers=entetes,
                         params=params, timeout=60)
        r.raise_for_status()
        charge = r.json()
        for w in charge.get("data", []):
            par_nom[w["name"]] = w["id"]
        curseur = charge.get("nextCursor")
        if not curseur:
            break
    cibles = {n: par_nom[n] for n in workflows if n in par_nom}
    manquants = [n for n in workflows if n not in par_nom]
    for n in manquants:
        print(f"[ATTENTION] workflow introuvable : {n}")
    if not cibles:
        print("[ERREUR] aucun workflow cible résolu", file=sys.stderr)
        return 2

    # Dédoublonnage sur (execution_id, segment/commentary) depuis l'existant.
    deja = set()
    if SORTIE.exists():
        for ligne in SORTIE.read_text().splitlines():
            try:
                e = json.loads(ligne)
                deja.add((e.get("execution_id"),
                          e.get("segment_id") or e.get("commentary_id")))
            except Exception:
                continue

    nouveaux, avec_verdict, sautes, refuses = [], 0, 0, 0

    for nom, wid in cibles.items():
        re_ = requests.get(f"{base}/executions", headers=entetes,
                           params={"workflowId": wid, "limit": limite},
                           timeout=120)
        re_.raise_for_status()
        execs = re_.json().get("data", [])
        print(f"[INFO] {nom} : {len(execs)} exécution(s) dans la fenêtre de rétention")

        for ex in execs:
            eid = ex.get("id")
            det = requests.get(f"{base}/executions/{eid}", headers=entetes,
                               params={"includeData": "true"}, timeout=120)
            if det.status_code != 200:
                continue
            d = det.json()
            meta = {"execution_id": str(eid),
                    "demarree_a": d.get("startedAt"),
                    "workflow": nom}
            runs = ((d.get("data") or {}).get("resultData") or {}).get("runData") or {}
            for noeud in NOEUDS_VERDICT:
                for passage in runs.get(noeud, []):
                    for bloc in ((passage.get("data") or {}).get("main") or []):
                        for item in (bloc or []):
                            enr = extraire_un(item, meta)
                            if not enr:
                                continue
                            ident = (enr["execution_id"],
                                     enr.get("segment_id") or enr.get("commentary_id"))
                            if ident in deja:
                                continue
                            ligne = json.dumps(enr, ensure_ascii=False)
                            fautif = garde_fou(ligne)
                            if fautif:
                                refuses += 1
                                print(f"[REFUS] exéc. {eid} : empreinte de secret "
                                      f"détectée ({fautif}) — ligne NON écrite")
                                continue
                            deja.add(ident)
                            nouveaux.append(ligne)
                            if enr["verdict"]:
                                avec_verdict += 1
                            else:
                                sautes += 1

    print(f"\n[BILAN] {len(nouveaux)} nouvel(le)s ligne(s) — "
          f"{avec_verdict} avec verdict, {sautes} sans (motif de saut)")
    if refuses:
        print(f"[BILAN] {refuses} ligne(s) REFUSÉE(S) par le garde-fou secret")

    if dry:
        print("[DRY-RUN] rien écrit. Aperçu (verdicts seulement, champs nommés) :")
        for ligne in nouveaux[:5]:
            e = json.loads(ligne)
            if e["verdict"]:
                v = e["verdict"]
                print(f"   {e.get('segment_id') or e.get('commentary_id')} | "
                      f"approved={v.get('approved')} conf={v.get('confidence')} "
                      f"issues={len(v.get('issues') or [])} "
                      f"relecteur={v.get('provider')}/{v.get('model')}")
            else:
                print(f"   {e.get('segment_id') or e.get('commentary_id')} | "
                      f"saut : {e['verify_skipped']}")
        return 0

    if not nouveaux:
        print("[INFO] rien de neuf à écrire")
        return 0

    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    with SORTIE.open("a", encoding="utf-8") as f:
        for ligne in nouveaux:
            f.write(ligne + "\n")
    print(f"[OK] écrit dans {SORTIE}")
    print("[RAPPEL] aucun rejeu effectué : la colonne `review` n'existe pas encore "
          "côté torah.api (azy.daily#669). Ce fichier est la réserve en attendant.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
