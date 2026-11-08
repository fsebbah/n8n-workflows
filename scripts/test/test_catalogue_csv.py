#!/usr/bin/env python3
"""Les CSV du catalogue et l'injection des surfaces — azy.daily#631.

    python3 scripts/test/test_catalogue_csv.py

Ce que le test protège
----------------------
 1. le CSV décrit le catalogue TEL QU'IL EST : même filtre que `Build Registry`,
    collisions de chemin signalées et non masquées ;
 2. les colonnes de décision (`surfaces`, `requires`) sont VIDES — un pré-remplissage
    serait relu comme un avis d'expert ;
 3. `fonction_source` distingue toujours le lu (`sticky`) du déduit (`jet`) ;
 4. aucun fragment de JavaScript ne fuit dans les colonnes lisibles — défaut mesuré
    sur `torah-get-page-translations`, dont l'URL porte une IIFE complète ;
 5. un jet ne se trompe pas de cible — défaut mesuré sur `server-sync`, où
    `…/api/discord/webhook/server-sync` avait été lu comme « appelle outil
    server-sync », c'est-à-dire lui-même ;
 6. l'injection pose les étiquettes dans la PREMIÈRE sticky, est idempotente, et
    n'écrit RIEN si une ligne est introuvable (tout ou rien).

Le test n'appelle pas l'API n8n : il travaille sur les CSV déjà générés et sur des
workflows factices en dossier temporaire.
"""

import csv
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
CSV_TRAFIC = RACINE / "docs" / "catalogue" / "outils-a-trafic.csv"
CSV_COMPLET = RACINE / "docs" / "catalogue" / "catalogue-complet.csv"

ok = 0
echecs = []


def verifier(intitule, obtenu, attendu):
    global ok
    if obtenu == attendu:
        ok += 1
        print(f"  ✓ {intitule}")
    else:
        echecs.append(intitule)
        print(f"  ✗ {intitule}\n      obtenu  : {obtenu!r}\n      attendu : {attendu!r}")


def charger(module, chemin):
    spec = importlib.util.spec_from_file_location(module, chemin)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def lignes(chemin):
    with open(chemin, encoding="utf-8") as fh:
        return list(csv.DictReader(l for l in fh if not l.startswith("#")))


inj = charger("injecter", RACINE / "scripts" / "catalogue" / "injecter_surfaces.py")
gen = charger("generer", RACINE / "scripts" / "catalogue" / "generer_csv_catalogue.py")

print("\nCSV du catalogue et injection des surfaces\n")

# ─────────────────────────────────────────────────────────────────────────────
print("Les deux fichiers existent et sont cohérents entre eux")
verifier("le CSV du lot de travail existe", CSV_TRAFIC.exists(), True)
verifier("le CSV complet existe", CSV_COMPLET.exists(), True)
trafic, complet = lignes(CSV_TRAFIC), lignes(CSV_COMPLET)
verifier("les colonnes sont identiques dans les deux",
         list(trafic[0].keys()), list(complet[0].keys()))
verifier("le lot de travail est le sous-ensemble à trafic du complet",
         {l["outil"] for l in trafic},
         {l["outil"] for l in complet if l["a_trafic"] == "oui"})
verifier("toutes les lignes du lot ont des exécutions",
         all(int(l["executions_cumulees"]) > 0 for l in trafic), True)

# ─────────────────────────────────────────────────────────────────────────────
print("\n⚠️ Les colonnes de DÉCISION restent vides")
remplies = [l["outil"] for l in complet if l["surfaces"] or l["requires"]]
# Si ce contrôle rougit un jour, c'est que quelqu'un a rempli le CSV — ce qui est
# le but. Il faudra alors le déplacer vers « le CSV généré », distinct du rempli.
verifier("aucune surface pré-remplie par le générateur", remplies, [])

# ─────────────────────────────────────────────────────────────────────────────
print("\nLa provenance de chaque description est dite")
verifier("fonction_source vaut toujours sticky ou jet",
         sorted({l["fonction_source"] for l in complet}), ["jet", "sticky"])
verifier("un jet est toujours préfixé JET —",
         all(l["fonction"].startswith("JET —")
             for l in complet if l["fonction_source"] == "jet"), True)
verifier("une description lue n'est jamais préfixée JET",
         all(not l["fonction"].startswith("JET —")
             for l in complet if l["fonction_source"] == "sticky"), True)
verifier("aucune fonction vide", [l["outil"] for l in complet if not l["fonction"].strip()], [])

# ─────────────────────────────────────────────────────────────────────────────
print("\n⚠️ Aucun JavaScript ne fuit dans les colonnes lisibles")
# Mesuré : l'URL de `torah-get-page-translations` porte `{{ (() => { let params = [];
# … })() }}`. Un `\{\{[^}]*\}\}` naïf laissait tout le corps dans le CSV.
FUITE = re.compile(r"=>|\$json|\{\{|\breturn\b|\bfunction\b")
sales = [(l["outil"], FUITE.search(l["appelle"] + " " + l["fonction"]).group(0))
         for l in complet if FUITE.search(l["appelle"] + " " + l["fonction"])]
verifier("ni expression n8n ni code dans `appelle` / `fonction`", sales, [])
verifier("aucune accolade résiduelle",
         [l["outil"] for l in complet if "{" in l["appelle"] or "}" in l["appelle"]], [])

print("\n…et la neutralisation gère les accolades IMBRIQUÉES")
verifier("expression simple", gen.neutraliser_expressions("={{ $env.X }}/api/v2/jobs"), "…/api/v2/jobs")
verifier("deux expressions", gen.neutraliser_expressions("={{ a }}/p/{{ b }}"), "…/p/…")
verifier("IIFE tronquée, pas nettoyée à moitié",
         gen.neutraliser_expressions("={{ $env.X }}/seg?{{ (() => { let p = []; return p })() }}"),
         "…/seg…")
verifier("URL sans expression inchangée",
         gen.neutraliser_expressions("https://api.mistral.ai/v1/ocr"), "https://api.mistral.ai/v1/ocr")

# ─────────────────────────────────────────────────────────────────────────────
print("\n⚠️ Un jet ne se trompe pas de cible")
# Mesuré sur `server-sync` : `…/api/discord/webhook/server-sync` est une route du
# BACKEND, et le jet annonçait « appelle outil server-sync » — lui-même.
faux = gen.jet_description({"nodes": []}, "server-sync",
                           "…/api/discord/webhook/server-sync")
verifier("une route backend contenant /webhook/ n'est pas lue comme un outil",
         "outil server-sync" in faux, False)
vrai = gen.jet_description({"nodes": []}, "x", "…/webhook/torah-chunk")
verifier("un vrai appel d'outil n8n est reconnu", "outil torah-chunk" in vrai, True)

# ─────────────────────────────────────────────────────────────────────────────
print("\nLes collisions de chemin sont SIGNALÉES, pas masquées")
par_chemin = {}
for l in complet:
    par_chemin.setdefault(l["outil"], []).append(l)
collisions = {k: v for k, v in par_chemin.items() if len(v) > 1}
verifier("les lignes en collision portent la mention",
         all(l["collision_de_chemin"] for v in collisions.values() for l in v), True)
verifier("les autres ne la portent pas",
         [l["outil"] for k, v in par_chemin.items() if len(v) == 1
          for l in v if l["collision_de_chemin"]], [])
# Masquer la collision ferait disparaître du fichier des workflows actifs.
verifier("au moins une collision connue est présente (config/*)",
         all(k.startswith("config/") for k in collisions), True)

# ─────────────────────────────────────────────────────────────────────────────
print("\nInjection — normalisation identique à celle du parseur")
verifier("découpe, trim, minuscule",
         inj.valeurs({"surfaces": "  CHAT , Voice_Realtime ,, EMAIL ", "requires": ""}),
         {"Surfaces": ["chat", "voice_realtime", "email"]})
verifier("colonnes vides → rien à poser", inj.valeurs({"surfaces": "", "requires": "  "}), {})
verifier("requires seul", inj.valeurs({"surfaces": "", "requires": "files_out"}),
         {"Requires": ["files_out"]})

print("\nInjection — pose, remplace, et reste idempotente")
base = "## Mon outil\n\n**Description:**\nFait des choses\n"
une = inj.poser(base, {"Surfaces": ["chat"]})
verifier("l'étiquette est ajoutée", "**Surfaces:** chat" in une, True)
verifier("la description est préservée", "Fait des choses" in une, True)
deux = inj.poser(une, {"Surfaces": ["chat"]})
verifier("réinjection : aucune duplication", deux.count("**Surfaces:**"), 1)
trois = inj.poser(une, {"Surfaces": ["email", "agenda"]})
verifier("un arbitrage corrigé REMPLACE l'ancien", "**Surfaces:** email, agenda" in trois, True)
verifier("…et l'ancien a disparu", "**Surfaces:** chat" in trois, False)

# ─────────────────────────────────────────────────────────────────────────────
print("\nInjection — TOUT OU RIEN sur un workflow introuvable")
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    wf_dir = tmp / "workflows"
    wf_dir.mkdir()
    bon = {"name": "Faux Outil", "nodes": [
        {"type": "n8n-nodes-base.webhook", "parameters": {"path": "faux"}},
        {"type": "n8n-nodes-base.stickyNote", "parameters": {"content": "## Faux Outil\n"}},
    ]}
    (wf_dir / "Faux_Outil.json").write_text(json.dumps(bon), encoding="utf-8")
    csv_p = tmp / "lot.csv"
    csv_p.write_text(
        "outil,workflow,surfaces,requires\n"
        "faux,Faux Outil,chat,\n"
        "absent,Workflow Inexistant,chat,\n", encoding="utf-8")

    # On détourne les chemins du module le temps de l'essai.
    inj.WORKFLOWS, inj.LISTE = wf_dir, tmp / "liste.txt"
    code = inj.main.__wrapped__ if hasattr(inj.main, "__wrapped__") else None
    sys.argv = ["injecter", str(csv_p)]
    sortie = inj.main()
    verifier("sortie en erreur", sortie, 1)
    verifier("le workflow valide n'a PAS été modifié",
             json.loads((wf_dir / "Faux_Outil.json").read_text())["nodes"][1]
             ["parameters"]["content"], "## Faux Outil\n")
    verifier("aucun fichier-liste écrit", (tmp / "liste.txt").exists(), False)

    # Et avec un CSV entièrement résoluble, ça écrit.
    csv_p.write_text("outil,workflow,surfaces,requires\nfaux,Faux Outil,chat,files_out\n",
                     encoding="utf-8")
    sys.argv = ["injecter", str(csv_p)]
    verifier("sortie normale", inj.main(), 0)
    contenu = json.loads((wf_dir / "Faux_Outil.json").read_text())["nodes"][1]["parameters"]["content"]
    verifier("Surfaces posée", "**Surfaces:** chat" in contenu, True)
    verifier("Requires posée", "**Requires:** files_out" in contenu, True)
    verifier("fichier-liste écrit avec le STEM",
             (tmp / "liste.txt").read_text().strip(), "Faux_Outil")

print(f"\nRésultat : {ok} ok, {len(echecs)} échec(s)\n")
if echecs:
    for e in echecs:
        print(f"  - {e}")
    sys.exit(1)
