#!/usr/bin/env python3
"""Régénère l'InputSchema des serveurs Google DEPUIS la matrice. TOUT OU RIEN.

Pourquoi générer plutôt que rédiger : MCP retire tout champ hors schéma, et
déclarer un champ que le nœud IGNORE est tout aussi nuisible — le LLM croit
pouvoir filtrer alors que non. Les deux erreurs produisent la même panne
silencieuse, à un cran de distance. Le schéma ne doit donc contenir QUE les champs
qu'une opération SAINE honore réellement, et c'est la matrice qui le sait.

Un seul analyseur : ce script importe `matrice_contrat_mcp`. Deux analyseurs
divergeraient, et c'est le schéma qui mentirait.
"""
import importlib.util
import json
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location(
    "matrice_contrat_mcp", os.path.join(RACINE, "scripts", "audit", "matrice_contrat_mcp.py"))
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)

DESCRIPTIONS = {
    "mcp-gmail": "Serveur Gmail : lire, chercher, envoyer, classer les messages, fils et "
                 "brouillons du compte Google de l'utilisateur.",
    "mcp-calendar": "Serveur Google Agenda : lister les agendas de l'utilisateur et créer, "
                    "lire, chercher, modifier ou supprimer ses événements.",
    "mcp-contacts": "Serveur Google Contacts : lire, créer, modifier, chercher et grouper "
                    "les fiches de contact du compte Google de l'utilisateur.",
    "mcp-drive": "Serveur Google Drive : lister, chercher, lire, créer, déplacer et partager "
                 "les fichiers et dossiers du compte Google de l'utilisateur.",
}
# Classroom est volontairement absent : ses 33 paires sont INDÉTERMINÉES (nœud
# `CUSTOM.classroomToolDynamic` hors dépôt). Générer un schéma pour des paires non
# vérifiées reviendrait à promettre ce qu'on ne sait pas tenir.

ENTETE = """
**Description:**
{DESC}

**InputSchema:**
```json
{SCHEMA}
```

_Généré le 2026-11-09 par `scripts/audit/generer_schemas_google.py` depuis la matrice
du câblage réel (azy.daily#642 / #645). **Ne pas modifier à la main** : régénérer._

_Ne figurent ici que les champs qu'une opération SAINE honore RÉELLEMENT. Un champ
que le nœud ignore est volontairement absent : le déclarer ferait croire à un
filtrage qui n'a pas lieu — la même panne silencieuse, un cran plus loin._

_⚠️ MCP retire tout champ hors schéma. Toute évolution du workflow qui lit un
nouveau champ du corps doit être suivie d'une régénération, sinon le champ
n'arrivera jamais._

_⚠️ Jeton OAuth accepté sous `oauth_token` (nom émis par MCP) **ou** `access_token`
(nom historique des appelants directs). Les nœuds lisent `oauth_token ||
access_token`. Jamais de `$env`._
{TABLEAU}"""


def construire(path, lignes):
    saines = [l for l in lignes if l["statut"] == "SAINE"]
    if not saines:
        raise ValueError(f"{path}: aucune paire saine")
    props, requis_par_op = {}, {}
    for l in saines:
        for champ in l["honores"]:
            props.setdefault(champ, {"type": M.typer(champ)})
    props["operation"] = {"type": "string",
                          "enum": sorted({l["operation"] for l in saines}),
                          "description": "opération à exécuter"}
    props["resource"] = {"type": "string",
                         "enum": sorted({l["resource"] for l in saines}),
                         "description": "ressource visée ; MCP fournit un défaut pour "
                                        "ce serveur, le déclarer permet de l'écraser"}
    props["oauth_token"] = {"type": "string",
                            "description": "jeton OAuth Google (nom émis par MCP)"}
    props["access_token"] = {"type": "string",
                             "description": "jeton OAuth Google (nom historique, équivalent)"}
    schema = {"type": "object", "required": ["operation"], "properties": props}

    # Le tableau par opération : c'est lui qui dit QUOI envoyer, et s'il filtre.
    corps = "\n".join(
        f"| `{l['resource']}` | `{l['operation']}` | "
        + (", ".join(f"`{c}`" for c in l["honores"]) or "—") + " | "
        + ("**cherchable**" if l["cherchable"] else "liste-seule") + " |"
        for l in saines)
    mortes = [l for l in lignes if l["statut"].startswith("MORTE")]
    bloc = ("\n**Paires appelables** — champs honorés, et si l'opération FILTRE :\n\n"
            "| resource | operation | champs honorés | listing |\n|---|---|---|---|\n"
            + corps + "\n")
    if mortes:
        bloc += ("\n**Non offertes par ce serveur** (absentes de l'enum, un agent ne peut "
                 "pas les demander) : "
                 + ", ".join(f"`{l['resource']}/{l['operation']}`" for l in mortes) + ".\n")
    return schema, bloc


def remplacer_schema(contenu, texte):
    """Remplace le bloc **Description:** → fin du schéma, ou l'ajoute."""
    motif = re.compile(r"\n\*\*Description:\*\*.*?(?=\n## |\Z)", re.S)
    if motif.search(contenu):
        return motif.sub(texte, contenu, count=1)
    return contenu.rstrip() + "\n" + texte


prevu, erreurs = {}, []
for path, nom, lignes in M.toutes_les_matrices(set(DESCRIPTIONS)):
    try:
        schema, bloc = construire(path, lignes)
    except Exception as e:
        erreurs.append(str(e)); continue
    fichier = None
    for f in __import__("glob").glob(os.path.join(RACINE, "workflows", "*.json")):
        wf = json.load(open(f, encoding="utf-8"))
        whs = [n for n in wf.get("nodes", []) if n["type"] == "n8n-nodes-base.webhook"]
        if whs and whs[0]["parameters"].get("path") == path:
            fichier = f; break
    if fichier is None:
        erreurs.append(f"{path}: fichier introuvable"); continue
    stickies = [n for n in wf["nodes"] if n["type"] == "n8n-nodes-base.stickyNote"]
    if not stickies:
        erreurs.append(f"{path}: aucune sticky note"); continue
    texte = ENTETE.replace("{DESC}", DESCRIPTIONS[path]) \
                  .replace("{SCHEMA}", json.dumps(schema, ensure_ascii=False, indent=2)) \
                  .replace("{TABLEAU}", bloc)
    stickies[0]["parameters"]["content"] = remplacer_schema(
        stickies[0]["parameters"].get("content") or f"## {wf['name']}\n", texte)
    prevu[fichier] = (path, wf, len(schema["properties"]), len(bloc.splitlines()))

if erreurs or len(prevu) != len(DESCRIPTIONS):
    print(f"ÉCHEC — rien écrit ({len(prevu)}/{len(DESCRIPTIONS)})", file=sys.stderr)
    for e in erreurs:
        print(f"   • {e}", file=sys.stderr)
    sys.exit(1)

for f, (path, wf, nprops, nl) in sorted(prevu.items(), key=lambda x: x[1][0]):
    json.dump(wf, open(f, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"   {path:<16} {nprops} champs déclarés")
print(f"\n{len(prevu)} schémas régénérés")
