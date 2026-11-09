#!/usr/bin/env python3
"""`find_workflow_by_name` doit viser l'exemplaire ACTIF, ou refuser de deviner.

azy.daily#645 — `MCP - Gmail Server (All-in-One)` existe en 10 exemplaires et le
premier rendu par l'API est INACTIF. L'ancien « premier homonyme » aurait écrit la
correction dans un exemplaire mort PUIS l'aurait activé, mettant deux workflows
actifs sur le chemin `mcp-gmail`.

Ces contrôles n'appellent pas l'API : `iter_all_workflows` est remplacé par un
jeu de données, ce qui permet d'éprouver des situations qui n'existent pas encore
en service — plusieurs actifs, aucun actif — avant qu'elles ne surviennent.
"""
import io
import os
import sys
import contextlib
import importlib.util

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "n8n_api", os.path.join(RACINE, "n8n", "n8n_api.py"))
n8n_api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n8n_api)

reussis, echoues = 0, 0


def controle(nom, condition, detail=""):
    global reussis, echoues
    if condition:
        reussis += 1
    else:
        echoues += 1
        print(f"  ❌ {nom}" + (f"\n       {detail}" if detail else ""))


def avec(parc):
    """Remplace la source de vérité par `parc`, et capture ce qui est affiché."""
    n8n_api.iter_all_workflows = lambda limit=250: iter(parc)
    sortie = io.StringIO()
    def appeler(nom):
        with contextlib.redirect_stdout(sortie):
            r = n8n_api.find_workflow_by_name(nom)
        return r, sortie.getvalue()
    return appeler


W = lambda i, n, a: {"id": i, "name": n, "active": a}

# ── 1 · Exemplaire unique : rendu tel quel ───────────────────────────────────
r, _ = avec([W("aaa", "Solo", True)])("Solo")
controle("unique actif → rendu", r and r["id"] == "aaa", str(r))
r, _ = avec([W("bbb", "Solo", False)])("Solo")
controle("unique INACTIF → rendu quand même (rien d'ambigu)", r and r["id"] == "bbb", str(r))

# ── 2 · Absent : None, sans bruit ────────────────────────────────────────────
r, _ = avec([W("aaa", "Autre", True)])("Solo")
controle("absent → None", r is None, str(r))

# ── 3 · LE cas réel : 10 exemplaires, le 1er inactif, 1 seul actif ──────────
parc = [W("8cGBUYcClPGznpXk", "MCP - Gmail Server (All-in-One)", False)]
parc += [W(f"mort{i}", "MCP - Gmail Server (All-in-One)", False) for i in range(8)]
parc.insert(5, W("Jz4ji4p0QStwstN0", "MCP - Gmail Server (All-in-One)", True))
r, dit = avec(parc)("MCP - Gmail Server (All-in-One)")
controle("10 exemplaires, 1 actif → rend l'ACTIF, pas le premier",
         r and r["id"] == "Jz4ji4p0QStwstN0", str(r))
controle("il le DIT, en nommant l'actif retenu", "Jz4ji4p0QStwstN0" in dit and "ACTIF" in dit, dit)
controle("il nomme les exemplaires ignorés", "8cGBUYcClPGznpXk" in dit, dit)
controle("l'avertissement est visible (⚠️)", "⚠️" in dit, dit)

# L'ordre ne doit rien changer : l'actif gagne où qu'il se trouve.
for position in (0, 3, 9):
    p2 = [W(f"mort{i}", "N", False) for i in range(9)]
    p2.insert(position, W("vivant", "N", True))
    r, _ = avec(p2)("N")
    controle(f"actif en position {position} → toujours trouvé", r and r["id"] == "vivant", str(r))

# ── 4 · Ambigu : refuser, et expliquer comment s'en sortir ──────────────────
# ⚠️ Rendre None ici est VOLONTAIRE : le réimport échoue proprement au lieu
# d'écrire au hasard dans un exemplaire, puis de l'activer.
r, dit = avec([W("x", "N", True), W("y", "N", True)])("N")
controle("deux ACTIFS → refus (None)", r is None, str(r))
controle("le refus nomme les deux identifiants", "x" in dit and "y" in dit, dit)
controle("le refus propose le remède (`update <id>`)", "update <id>" in dit, dit)

r, dit = avec([W("x", "N", False), W("y", "N", False)])("N")
controle("plusieurs et AUCUN actif → refus (None)", r is None, str(r))
controle("le refus dit qu'aucun n'est actif", "aucun n'est actif" in dit, dit)

# ── 5 · Une panne d'API ne doit pas se déguiser en « absent » ───────────────
# ⚠️ `iter_all_workflows` lève RuntimeError plutôt que de rendre une liste vide,
# précisément pour qu'une erreur réseau ne ressemble pas à « ce workflow n'existe
# pas » — ce qui ferait CRÉER un doublon au lieu de mettre à jour.
def tombe(limit=250):
    raise RuntimeError("API injoignable")
    yield
n8n_api.iter_all_workflows = tombe
with contextlib.redirect_stdout(io.StringIO()):
    r = n8n_api.find_workflow_by_name("N")
controle("API en panne → None (et non une liste vide silencieuse)", r is None, str(r))

print(f"\n{reussis} contrôles réussis, {echoues} échoués")
sys.exit(1 if echoues else 0)
