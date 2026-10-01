#!/usr/bin/env python3
"""Dérive `credential` et `acts_on` pour chaque outil du registre (azy.daily#459).

    python3 scripts/audit/registre_credential.py            # tableau lisible
    python3 scripts/audit/registre_credential.py --json     # ce que le registre consomme
    python3 scripts/audit/registre_credential.py --check    # garde anti-dérive (code 1 si écart)

POURQUOI CE SCRIPT EXISTE
-------------------------
MCP portait la liste des outils exigeant un OAuth utilisateur **codée en dur**
(`OAUTH_REQUIRED_TOOLS`, 4 entrées). Mesuré le 2026-09-29 : 8 outils en consomment
réellement un. La table avait dérivé de 4 outils sans que rien ne le signale, parce que
rien ne comparait jamais la table aux workflows. C'est ce compte-là que la garde rejoue.

LE PIÈGE PRINCIPAL
------------------
En BYOT, le secret n'est PAS dans le magasin de credentials n8n : il arrive dans le corps
ou les en-têtes de la requête. 216 outils sur 251 n'ont aucun credential n8n stocké. Un
dérivateur qui lirait `nodes[].credentials` les classerait tous `none` — plausible, et faux
dans le sens dangereux : un outil qui manipule le jeton OAuth Google d'un utilisateur
serait étiqueté « aucun identifiant ». On lit donc trois sources : credentials, corps,
en-têtes.

CONSOMMER N'EST PAS CONSTATER
-----------------------------
`mcp-test-echo` contient `const hasToken = !!input.access_token` : il constate la présence
du jeton, il ne s'en sert jamais. On n'accepte `user_oauth` que si l'identifiant du jeton
atteint un nœud HTTP (en-tête, URL ou corps d'un appel sortant). Sans cette règle, le
compte passe de 8 à 9 et la garde devient un générateur de faux positifs.

CONSOMMER N'EST PAS DISTRIBUER
------------------------------
`lichess-auth-*`, `oauth-get` **produisent ou servent** un jeton (échange de code, lecture
de `oauth:token:*`) au lieu d'agir avec. Catégorie à part, `credential_broker` : ce sont
les outils les plus sensibles du parc puisqu'ils remettent un identifiant à leur appelant.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
DOSSIER = RACINE / "workflows"

# ── Ce qu'on reconnaît ────────────────────────────────────────────────────────

# Un secret d'appelant nommé par fournisseur : `plugin_context.api_keys.<x>`
# ou un en-tête dédié. C'est la forme BYOT (voir la note en tête de fichier).
RE_CLE_CORPS = re.compile(r"api_keys(?:\?)?\.\s*([a-z0-9_]+)", re.I)
RE_CLE_ENTETE = re.compile(r"[Xx]-([A-Za-z]+)-[Aa]pi-[Kk]ey")

# Jeton OAiuth utilisateur, quelle que soit la porte d'entrée (corps OU en-tête :
# `expert-program-classroom-sync` accepte les deux, un scan du seul corps le manquerait).
RE_JETON = re.compile(r"\b(?:google_)?access_token\b|[Xx]-Google-Access-Token")

# Échange de code, lecture d'un jeton stocké, OU appel au coffre de l'api (`/api/n8n/oauth`) :
# l'outil FABRIQUE ou SERT le credential. `oauth-get` ne matchait aucun des trois premiers
# signaux — il demande simplement le jeton à l'api et le rend à son appelant. C'est pourtant
# le plus sensible du parc, et la première version de ce script le classait `none`.
RE_COURTIER = re.compile(r"grant_type|client_secret|oauth2?/token|oauth:token:|/api/n8n/oauth")

# Nœuds PERSONNALISÉS qui consomment eux-mêmes le jeton Google (voir sync-custom-nodes).
# Les cinq outils Google de MCP n'ont AUCUN nœud httpRequest : exiger que le jeton atteigne
# un appel HTTP les écartait tous — soit exactement les outils que #459 veut recenser.
RE_NOEUD_OAUTH = re.compile(r"(gmail|drive|calendar|contacts|classroom)ToolDynamic", re.I)

# Valeur de remplissage : `lichess-auth-start` écrit `access_token: '__PENDING__'` pour
# réserver la place avant l'échange. Le mot `access_token` y est présent sans qu'aucun jeton
# n'existe — un faux positif que seule une lecture du code révèle.
RE_REMPLISSAGE = re.compile(r"__PENDING__")

# Service auquel le jeton donne accès, déduit de l'hôte réellement appelé.
HOTES = [
    (re.compile(r"googleapis\.com|google\.com/o/oauth"), "google"),
    (re.compile(r"graph\.microsoft\.com"), "microsoft"),
    (re.compile(r"api\.linkedin\.com"), "linkedin"),
    (re.compile(r"lichess\.org"), "lichess"),
    (re.compile(r"discord\.com/api"), "discord"),
    (re.compile(r"slack\.com/api"), "slack"),
    (re.compile(r"api\.notion\.com"), "notion"),
]

# Credentials n8n dont la nature est un compte de service, pas une clé d'API.
CRED_COMPTE_SERVICE = {"googleVertexAiApi", "googleApi", "googleServiceAccount"}

# Stockage : signal de `acts_on`, jamais suffisant pour trancher user/tenant.
TYPES_STOCKAGE = ("redis", "postgres", "mySql", "mongoDb")

# `searches_web` (azy.daily#476) — dérivé de l'HÔTE EXTERNE appelé, jamais du nom de
# l'outil. MCP cherchait `web_search_tool` / `google_searcher_tool` / `google_search` :
# aucun n'est un identifiant de registre (les identifiants sont les chemins de webhook),
# et ces noms venaient de leur sous-système `agent/`. La liste des moteurs de recherche
# est courte, stable, et un outil ne peut pas interroger le web ouvert sans en appeler un.
#
# ⚠️ `youtube-searcher` (googleapis.com/youtube) et les corpus internes (`qdrant-search`,
# `entity-search`, `torah-search`) n'y figurent PAS : chercher dans un catalogue ou dans
# un corpus privé n'est pas chercher sur le web. `academic-searcher` y figure — décision
# de MCP le 2026-10-01, la récupération web savante porte des URL.
HOTES_RECHERCHE_WEB = re.compile(
    r"serpapi\.com|gnews\.io|api\.semanticscholar\.org|search\.brave\.com"
    r"|api\.tavily\.com|api\.exa\.ai|duckduckgo\.com|cse\.google|customsearch",
    re.I,
)

# Surcharge curée, DÉCLARÉE DANS LE WORKFLOW pour qu'il n'y ait qu'une source de vérité :
# une sticky note contenant `registre: acts_on=<valeur>`.
RE_SURCHARGE = re.compile(r"registre\s*:\s*acts_on\s*=\s*([a-z_]+)", re.I)

ACTS_ON_VALIDES = {"public", "user_data", "tenant_data", "service"}


def charger() -> list[tuple[str, dict]]:
    """Les workflows exposant un webhook, indexés par leur chemin d'appel."""
    outils = []
    for fichier in sorted(DOSSIER.glob("*.json")):
        try:
            wf = json.loads(fichier.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        chemin = None
        for n in wf.get("nodes") or []:
            if not str(n.get("type", "")).endswith("webhook"):
                continue
            p = str((n.get("parameters") or {}).get("path") or "")
            if p:
                chemin = p
                break
        if chemin:
            outils.append((chemin, wf))
    return outils


def texte_http(wf: dict) -> str:
    """Paramètres des seuls nœuds d'appel sortant.

    C'est ici qu'on vérifie qu'un jeton est UTILISÉ et pas seulement observé.
    """
    return json.dumps(
        [n.get("parameters") or {} for n in wf.get("nodes") or []
         if "httpRequest" in str(n.get("type", ""))],
        ensure_ascii=False,
    )


def service_de(texte: str) -> str:
    for motif, nom in HOTES:
        if motif.search(texte):
            return nom
    return "inconnu"


def deriver_credential(wf: dict, tout: str, http: str) -> tuple[list[str], str]:
    """Rend (valeurs, usage). Précédence : courtier > OAuth > BYOT > credential n8n > aucun.

    `usage` qualifie le seul cas `user_oauth` : « direct » quand l'outil appelle lui-même le
    service, « relais » quand il transmet le jeton à un autre outil du parc. MCP doit injecter
    le jeton dans les deux cas — mais seul le premier parle au fournisseur, et la distinction
    change qui est responsable en cas de fuite.

    Un outil peut cumuler plusieurs `caller_provided:` (un dispatch multi-fournisseurs en
    reçoit autant que de fournisseurs qu'il sait servir) — on les rend tous.
    """
    if RE_COURTIER.search(tout):
        return ["credential_broker"], ""

    types = " ".join(str(n.get("type", "")) for n in wf.get("nodes") or [])
    if RE_NOEUD_OAUTH.search(types):
        return ["user_oauth:google"], "direct"

    if RE_JETON.search(tout) and not RE_REMPLISSAGE.search(tout):
        if RE_JETON.search(http):
            return [f"user_oauth:{service_de(tout)}"], "direct"
        # Le jeton est lu mais n'atteint aucun appel sortant de CET outil : soit il est
        # relayé à un autre webhook du parc, soit il est seulement CONSTATÉ. La différence
        # est qu'un relais construit une charge utile à destination d'un outil tiers.
        if re.search(r"mcp_request|webhook_base_url", tout):
            return [f"user_oauth:{service_de(tout) if service_de(tout) != 'inconnu' else 'google'}"], "relais"
        return ["none"], ""

    fournisseurs = {m.lower() for m in RE_CLE_CORPS.findall(tout)}
    fournisseurs |= {m.lower() for m in RE_CLE_ENTETE.findall(tout)} - {"api"}
    if fournisseurs:
        return [f"caller_provided:{f}" for f in sorted(fournisseurs)], ""

    types_cred = {t for n in wf.get("nodes") or [] for t in (n.get("credentials") or {})}
    if types_cred & CRED_COMPTE_SERVICE:
        return ["service_account"], ""
    if types_cred:
        return ["system_key"], ""
    return ["none"], ""


def deriver_acts_on(wf: dict, tout: str) -> tuple[str, str]:
    """Rend (valeur, origine). `origine` vaut 'curé' ou 'dérivé'.

    Seuls `public` et `service` se dérivent honnêtement. La frontière user/tenant est
    SÉMANTIQUE : elle n'est écrite nulle part dans les nœuds. On applique donc le défaut
    le plus sensible (`tenant_data`) dès qu'un stockage est touché, à charge pour la passe
    curée de l'abaisser — jamais l'inverse.
    """
    for n in wf.get("nodes") or []:
        contenu = str((n.get("parameters") or {}).get("content") or "")
        m = RE_SURCHARGE.search(contenu)
        if m and m.group(1).lower() in ACTS_ON_VALIDES:
            return m.group(1).lower(), "curé"

    types = " ".join(str(n.get("type", "")) for n in wf.get("nodes") or [])
    if any(t.lower() in types.lower() for t in TYPES_STOCKAGE):
        return "tenant_data", "dérivé"
    if RE_JETON.search(tout):
        return "user_data", "dérivé"
    if re.search(r"\.local|backend_api_url", tout, re.I):
        return "service", "dérivé"
    return "public", "dérivé"


def analyser() -> list[dict]:
    lignes = []
    for chemin, wf in charger():
        tout = json.dumps(wf.get("nodes") or [], ensure_ascii=False)
        http = texte_http(wf)
        acts_on, origine = deriver_acts_on(wf, tout)
        credential, usage = deriver_credential(wf, tout, http)
        lignes.append({
            "tool": chemin,
            "workflow": wf.get("name") or "",
            "credential": credential,
            "oauth_usage": usage,
            "acts_on": acts_on,
            "acts_on_origine": origine,
            # On cherche l'hôte dans les seuls nœuds d'appel SORTANT : une mention de
            # serpapi dans une sticky note ne fait pas d'un outil un moteur de recherche.
            "searches_web": bool(HOTES_RECHERCHE_WEB.search(http)),
        })
    return lignes


# Compte de référence, mesuré le 2026-09-29 et communiqué à MCP dans azy.daily#459.
# `credential_broker` vaut 5 et non 4 : la passe manuelle avait manqué `oauth-delete`, que
# la dérivation a trouvé. C'est l'argument du script en une ligne — un humain qui lit 251
# workflows en rate un, et ne sait pas lequel.
# `--check` échoue si l'un bouge : soit un outil a changé de nature (à porter au registre),
# soit la dérivation s'est mise à mentir. Dans les deux cas, quelqu'un doit regarder.
REFERENCE = {"outils": 251, "user_oauth": 8, "credential_broker": 5, "searches_web": 3}


def compter(lignes: list[dict]) -> dict:
    return {
        "outils": len(lignes),
        "user_oauth": sum(1 for l in lignes if any(c.startswith("user_oauth") for c in l["credential"])),
        "credential_broker": sum(1 for l in lignes if "credential_broker" in l["credential"]),
        "searches_web": sum(1 for l in lignes if l["searches_web"]),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="sortie machine (registre)")
    ap.add_argument("--check", action="store_true", help="garde anti-dérive")
    args = ap.parse_args()

    lignes = analyser()
    comptes = compter(lignes)

    if args.json:
        print(json.dumps(lignes, ensure_ascii=False, indent=2))
        return 0

    if args.check:
        ecarts = [f"{k} : {comptes[k]} (référence {v})" for k, v in REFERENCE.items() if comptes[k] != v]
        if ecarts:
            print("DÉRIVE du registre :", file=sys.stderr)
            for e in ecarts:
                print(f"  • {e}", file=sys.stderr)
            print("\nSi le changement est voulu, mettre REFERENCE à jour ET prévenir MCP"
                  " (azy.daily#459).", file=sys.stderr)
            return 1
        print(f"registre conforme — {comptes['outils']} outils, "
              f"{comptes['user_oauth']} OAuth utilisateur, "
              f"{comptes['credential_broker']} courtier(s), "
              f"{comptes['searches_web']} chercheur(s) web")
        return 0

    from collections import Counter
    rep = Counter(c.split(":")[0] for l in lignes for c in l["credential"])
    print(f"\n{comptes['outils']} outils\n")
    print("credential")
    for k, v in rep.most_common():
        print(f"   {k:<20} {v}")
    print("\nacts_on")
    for k, v in Counter(l["acts_on"] for l in lignes).most_common():
        cures = sum(1 for l in lignes if l["acts_on"] == k and l["acts_on_origine"] == "curé")
        print(f"   {k:<20} {v}" + (f"   (dont {cures} curé{'s' if cures > 1 else ''})" if cures else ""))
    print("\nOAuth utilisateur (ce que MCP doit injecter)")
    for l in lignes:
        if any(c.startswith("user_oauth") for c in l["credential"]):
            print(f"   {l['tool']:<34} {l['credential'][0]:<22} {l['oauth_usage']}")
    print("\nRecherche web (azy.daily#476 — dérivé de l'hôte appelé)")
    for l in lignes:
        if l["searches_web"]:
            print(f"   {l['tool']}")
    print("\nCourtiers de credential (remettent un jeton à leur appelant)")
    for l in lignes:
        if "credential_broker" in l["credential"]:
            print(f"   {l['tool']}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
