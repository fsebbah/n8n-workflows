#!/usr/bin/env python3
"""Récapitulatif des scripts du dépôt : chemin + description, groupés par dossier.

    python3 scripts/menu.py              # le menu complet
    python3 scripts/menu.py --check      # code 1 si un script n'a pas de description
    python3 scripts/menu.py torah        # filtre sur un motif (chemin ou description)

POURQUOI PAS LA VERSION `sed -n '2p'` DE RÉFÉRENCE (azy.infra `scripts/menu.sh`)

La convention « ligne 2 = description » est bonne, mais la lire avec `sed -n '2p'`
ne marche pas sur ce dépôt — mesuré le 2026-11-17 sur les 168 scripts suivis :

    ligne 2 exploitable directement      :  38
    ligne 2 = ouverture de docstring nue :  33   ← la description est en ligne 3
    ligne 2 vide ou trop courte          :  97

Un fichier Python qui ouvre son docstring sur une ligne seule rend les trois
guillemets nus comme description, et un fichier à shebang + ligne vide rend la
chaîne vide. La version de référence aurait donc rapporté 130 scripts « à
compléter » alors qu'il y en a SEPT. Ce script lit la première ligne de PROSE,
d'où qu'elle vienne : docstring Python (même ouvert sur sa propre ligne), bloc
JSDoc, ou commentaire croisillon.

⚠️ Et c'est un piège qui se mord la queue : ce fichier-ci a d'abord refusé de
démarrer parce que son propre docstring citait les trois guillemets littéraux,
ce qui le refermait. D'où la périphrase.

⚠️ Il ne liste que les fichiers SUIVIS PAR GIT, et exclut les dépendances
embarquées (`lib/`, `custom-nodes/`, `.untracked/`, `static/`, `docs/js/`,
`docs/samples/`) : sans ce filtre, 135 fichiers de `.untracked/notebooklm-mcp-cli`
noient le récapitulatif.
"""
from __future__ import annotations

import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

EXTENSIONS = ('.sh', '.py', '.js')

# Dépendances embarquées et copies de travail : ce ne sont pas NOS scripts.
EXCLU = re.compile(
    r'^(lib/|custom-nodes/|\.untracked/|static/|docs/js/|docs/samples/|node_modules/)'
)

# Lignes qui ne décrivent rien même quand elles sont en tête.
BRUIT = re.compile(r'^(-\*-|coding[:=]|!|usr/|/usr/|eslint|jshint|type:|@ts-)')

# Barres de séparation et lignes sans prose : `=====`, `-----`, une icône seule.
# Mesuré : sans ce filtre, `deploy.sh` est décrit par « ===================== ».
SEPARATEUR = re.compile(r'^[=\-_*#~+.\s]*$')


def est_prose(texte: str) -> bool:
    """Au moins trois lettres consécutives, sinon ce n'est pas une phrase."""
    return bool(re.search(r'[A-Za-zÀ-ÿ]{3}', texte)) and not SEPARATEUR.match(texte)

OUVRE_DOCSTRING = re.compile(r'^[rubfRUBF]*("""|\'\'\')(.*)$')
PREFIXE_COMMENTAIRE = re.compile(r'^(#+|//+|/\*+|\*+)\s*')
# « nom.py -- description » / « nom.sh — description » : on garde la description.
REDONDANCE = re.compile(r'^[\w\-.]+\.(sh|py|js)\s*(--|—|:)\s*')

MINIMUM = 12  # en dessous, ce n'est pas une description mais un fragment


def scripts_suivis() -> list[str]:
    """Les scripts que git suit, hors dépendances embarquées."""
    try:
        sortie = subprocess.run(
            ['git', 'ls-files'], cwd=RACINE,
            capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("⚠️  pas un dépôt git, ou git absent", file=sys.stderr)
        return []
    return sorted(
        f for f in sortie.split('\n')
        if f and f.endswith(EXTENSIONS) and not EXCLU.match(f)
    )


def description(chemin: Path) -> str | None:
    """La première ligne de prose du fichier, quelle que soit sa forme."""
    try:
        lignes = chemin.read_text(encoding='utf-8', errors='replace').split('\n')
    except OSError:
        return None

    i = 1 if lignes and lignes[0].startswith('#!') else 0
    while i < len(lignes) and not lignes[i].strip():
        i += 1
    if i >= len(lignes):
        return None

    tete = lignes[i].strip()

    # Docstring Python. Le contenu peut suivre les guillemets ou commencer en dessous.
    ouverture = OUVRE_DOCSTRING.match(tete)
    if ouverture:
        suite = ouverture.group(2).strip().rstrip('"\'')
        if len(suite) >= MINIMUM and est_prose(suite):
            return propre(suite)
        return premiere_prose(lignes[i + 1:i + 6])

    # Commentaire, y compris un bloc JSDoc dont `/**` est seul sur sa ligne.
    if PREFIXE_COMMENTAIRE.match(tete):
        nu = PREFIXE_COMMENTAIRE.sub('', tete).strip()
        if len(nu) >= MINIMUM and not BRUIT.match(nu) and est_prose(nu):
            return propre(nu)
        return premiere_prose(lignes[i + 1:i + 5])

    return None


def premiere_prose(lignes: list[str]) -> str | None:
    for ligne in lignes:
        nu = PREFIXE_COMMENTAIRE.sub('', ligne.strip()).strip().rstrip('"\'')
        if len(nu) >= MINIMUM and not BRUIT.match(nu) and est_prose(nu):
            return propre(nu)
    return None


def propre(texte: str) -> str:
    return REDONDANCE.sub('', ' '.join(texte.split()))


def main() -> int:
    motifs = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv

    fichiers = scripts_suivis()
    if not fichiers:
        return 1

    par_dossier: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    sans = []
    for rel in fichiers:
        desc = description(RACINE / rel)
        if desc is None:
            sans.append(rel)
        if motifs and not any(
                m.lower() in rel.lower() or m.lower() in (desc or '').lower()
                for m in motifs):
            continue
        par_dossier[str(Path(rel).parent)].append((Path(rel).name, desc))

    if check:
        print(f"{len(fichiers) - len(sans)}/{len(fichiers)} scripts décrits.")
        if sans:
            print(f"\n{len(sans)} sans description — ligne 2 ou docstring à compléter :")
            for rel in sans:
                print(f"  {rel}")
            return 1
        return 0

    largeur = max((len(n) for v in par_dossier.values() for n, _ in v), default=20)
    for dossier in sorted(par_dossier):
        affiches = sorted(par_dossier[dossier])
        print(f"\n\033[1m{dossier}/\033[0m  ({len(affiches)})")
        for nom, desc in affiches:
            texte = desc or '\033[2m(sans description)\033[0m'
            print(f"  {nom:<{largeur}}  {texte[:110]}")

    montres = sum(len(v) for v in par_dossier.values())
    fin = f"\n{montres} script(s)"
    if motifs:
        fin += f" sur {len(fichiers)} (filtre : {' '.join(motifs)})"
    if sans:
        fin += f" · {len(sans)} sans description (`--check` les liste)"
    print(fin)
    return 0


if __name__ == '__main__':
    sys.exit(main())
