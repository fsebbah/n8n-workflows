#!/usr/bin/env python3
"""Divergences entre les workflows du DÉPÔT et ceux que l'instance SERT réellement.

    python3 scripts/audit/divergences_depot_instance.py            # tableau
    python3 scripts/audit/divergences_depot_instance.py --markdown  # pour un document

POURQUOI CET OUTIL EXISTE
-------------------------
Demandé le 2026-11-10, après la confirmation que l'instance n8n de `host2.local` n'existe
plus : « si des devs ont été faits sur n8n host2.local, il faut les refaire ». La question
ne se tranche pas de mémoire, et surtout elle ne se tranche pas en regardant host2 — qui
est éteint. Elle se tranche en comparant ce que le dépôt contient à ce que l'instance
vivante sert.

⚠️ ET LA RÉPONSE DÉPEND D'UN FAIT D'ARCHITECTURE, à garder en tête en lisant la sortie :
les instances n8n du parc ont partagé une MÊME base PostgreSQL (`prod001.local:5435/n8n`).
Un workflow modifié depuis l'interface de host2 a donc été écrit dans la base que llm lit
aujourd'hui : il n'a pas disparu avec l'instance. C'est pourquoi la sortie ne comporte
presque jamais « à refaire », mais « à exporter » ou « à réimporter » — le travail existe,
il est seulement d'un seul côté.

MÉTHODE
-------
L'empreinte ne porte que sur le CÂBLAGE : pour chaque nœud, (nom, type, paramètres,
onError), plus les connexions. Sont ignorés les identifiants, les positions, `versionId`
et `activeVersion` — du bruit d'éditeur qui ferait diverger des workflows identiques.

⚠️ `activeVersion` mérite une mention : 250 des 269 fichiers du dépôt en portent un, qui
est un INSTANTANÉ COMPLET et souvent périmé du workflow. Le comparer ferait apparaître des
divergences qui n'existent pas. Il est retiré par `import_workflow`/`update_workflow` avant
tout envoi à l'API, donc il n'est jamais déployé.

⚠️ LE SENS de l'écart est une ESTIMATION, pas une mesure. Il compare la date du dernier
commit touchant le fichier à l'`updatedAt` de l'instance. Un commit de pure reformulation
peut donc faire paraître le dépôt « en avance » alors que son contenu est plus ancien.
Les cas « même jour » ne sont pas tranchables ainsi et sont signalés comme à inspecter.
"""
from __future__ import annotations

import glob
import hashlib
import json
import os
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RACINE, "scripts", "n8n"))
import n8n_api as A  # noqa: E402


def empreinte(wf) -> str:
    noeuds = sorted(
        (n.get("name"), n.get("type"),
         json.dumps(n.get("parameters") or {}, sort_keys=True, ensure_ascii=False),
         n.get("onError") or "")
        for n in (wf.get("nodes") or []))
    conns = json.dumps(wf.get("connections") or {}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(
        json.dumps([noeuds, conns], ensure_ascii=False).encode()).hexdigest()[:12]


def date_commit(fichier: str) -> str:
    return subprocess.run(["git", "log", "-1", "--format=%cs", "--", fichier],
                          capture_output=True, text=True, cwd=RACINE).stdout.strip()


def releve():
    deploye = {}
    for w in A.iter_all_workflows():
        deploye.setdefault(w["name"], []).append(w)

    identiques, divergents, absents, homonymes = [], [], [], []
    for f in sorted(glob.glob(os.path.join(RACINE, "workflows", "*.json"))):
        try:
            local = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        nom = local.get("name")
        if not nom:
            continue
        rel = os.path.relpath(f, RACINE)
        copies = deploye.get(nom)
        if not copies:
            absents.append((nom, rel, date_commit(rel)))
            continue
        if len(copies) > 1:
            homonymes.append((nom, len(copies), sum(1 for c in copies if c.get("active"))))
        # ⚠️ La copie ACTIVE fait référence : `find_workflow_by_name` fait de même, et
        # comparer une copie inactive ferait diverger des workflows qui ne servent pas.
        actifs = [c for c in copies if c.get("active")] or copies
        if empreinte(local) == empreinte(actifs[0]):
            identiques.append(nom)
            continue
        g, u = date_commit(rel), (actifs[0].get("updatedAt") or "")[:10]
        sens = ("llm EN AVANCE → à exporter vers le dépôt" if u > g else
                "dépôt EN AVANCE → à réimporter" if g > u else
                "même jour → à inspecter")
        divergents.append((nom, rel, len(local.get("nodes") or []),
                           len(actifs[0].get("nodes") or []), g, u, sens))
    return deploye, identiques, divergents, absents, homonymes


def main():
    md = "--markdown" in sys.argv
    deploye, ident, div, abs_, hom = releve()
    tot = sum(len(v) for v in deploye.values())
    e = print

    if md:
        e("# Divergences dépôt ↔ instance\n")
        e(f"Généré par `scripts/audit/divergences_depot_instance.py` — "
          f"instance `{A.N8N_API_URL}`.\n")
        e("⚠️ L'instance n8n de `host2.local` n'existe plus (port 5678 fermé, décision du "
          "2026-07-09 confirmée le 2026-11-10). Les instances ont partagé la base "
          "`prod001.local:5435/n8n` : un workflow modifié depuis l'interface de host2 a "
          "donc été écrit dans la base que llm lit. **Rien n'est à refaire de zéro** — "
          "le travail divergent existe d'un côté ou de l'autre.\n")
        e(f"- instance : **{tot}** workflows, {len(deploye)} noms distincts")
        e(f"- dépôt : **{len(ident) + len(div) + len(abs_)}** fichiers comparés")
        e(f"  - identiques au déployé : **{len(ident)}**")
        e(f"  - divergents : **{len(div)}**")
        e(f"  - absents de l'instance : **{len(abs_)}**")
        e(f"  - noms en doublon sur l'instance : **{len(hom)}**\n")
        e("## Divergents\n")
        e("| workflow | nœuds dépôt / instance | dernier commit | updatedAt | à faire |")
        e("|---|---|---|---|---|")
        for nom, rel, a, b, g, u, sens in sorted(div, key=lambda x: x[6]):
            ecart = f"{a} / {b}" + (" ⚠️" if a != b else "")
            e(f"| `{nom}` | {ecart} | {g} | {u} | {sens} |")
        if abs_:
            e("\n## Présents au dépôt, absents de l'instance\n")
            e("| workflow | dernier commit |")
            e("|---|---|")
            for nom, rel, g in abs_:
                e(f"| `{nom}` | {g} |")
        if hom:
            e("\n## Noms en doublon sur l'instance\n")
            e("⚠️ `find_workflow_by_name` ne retient que la copie ACTIVE et refuse de "
              "deviner s'il y en a plusieurs — c'est ce qui évite qu'un réimport mette à "
              "jour une copie inactive puis l'active.\n")
            e("| workflow | copies | actives |")
            e("|---|---|---|")
            for nom, n, act in hom:
                e(f"| `{nom}` | {n} | {act} |")
        return 0

    e(f"instance {A.N8N_API_URL} : {tot} workflows, {len(deploye)} noms distincts")
    e(f"dépôt : {len(ident) + len(div) + len(abs_)} fichiers · {len(ident)} identiques · "
      f"{len(div)} divergents · {len(abs_)} absents · {len(hom)} noms en doublon\n")
    for nom, rel, a, b, g, u, sens in sorted(div, key=lambda x: x[6]):
        e(f"  {nom[:44]:<46} {a:>3}/{b:<3} {g} {u}  {sens}")
    for nom, rel, g in abs_:
        e(f"  {nom[:44]:<46} {'—':>7} {g} {'—':<10}  absent de l'instance")
    return 0


if __name__ == "__main__":
    sys.exit(main())
