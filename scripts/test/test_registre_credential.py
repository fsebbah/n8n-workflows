#!/usr/bin/env python3
"""Témoins du dérivateur de registre (azy.daily#459).

    python3 scripts/test/test_registre_credential.py

Ces contrôles ne vérifient pas des COMPTES — `--check` s'en charge — mais les quatre
distinctions que la première version du dérivateur avait ratées. Chacune vient d'un faux
résultat constaté, pas d'une hypothèse :

  • les outils Google de MCP n'ont aucun nœud httpRequest (nœuds personnalisés) ;
  • `lichess-auth-start` écrit `access_token: '__PENDING__'`, une valeur de remplissage ;
  • `oauth-get` ne fait ni échange de code ni lecture Redis : il interroge l'api ;
  • `mcp-test-echo` constate la présence d'un jeton sans jamais s'en servir.

Sans ces témoins, une refonte du dérivateur peut réintroduire n'importe laquelle de ces
erreurs en gardant des totaux justes — deux faux qui se compensent restent deux faux.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "audit"))
import registre_credential as rc  # noqa: E402

ok = ko = 0


def verifier(intitule, obtenu, attendu):
    global ok, ko
    if obtenu == attendu:
        ok += 1
        print(f"  ✓ {intitule}")
    else:
        ko += 1
        print(f"  ✗ {intitule}\n      obtenu   : {obtenu}\n      attendu  : {attendu}")


lignes = {l["tool"]: l for l in rc.analyser()}


def cred(outil):
    return lignes[outil]["credential"]


print("\nDérivation du registre — témoins\n")

print("Nœuds personnalisés : le jeton n'atteint aucun appel HTTP")
for outil in ("mcp-gmail", "mcp-drive", "mcp-calendar", "mcp-contacts", "mcp-classroom"):
    verifier(f"{outil} : OAuth utilisateur, usage direct",
             (cred(outil), lignes[outil]["oauth_usage"]), (["user_oauth:google"], "direct"))

print("\nRelais : transmet le jeton à un autre outil sans parler au fournisseur")
verifier("expert-program-classroom-sync : relais, pas direct",
         (cred("expert-program-classroom-sync"), lignes["expert-program-classroom-sync"]["oauth_usage"]),
         (["user_oauth:google"], "relais"))

print("\nValeur de remplissage : `__PENDING__` n'est pas un jeton")
verifier("lichess-auth-start : courtier, jamais consommateur",
         cred("lichess-auth-start"), ["credential_broker"])

print("\nCoffre de l'api : ni échange de code ni Redis, et pourtant un courtier")
for outil in ("oauth-get", "oauth-delete"):
    verifier(f"{outil} : courtier de credential", cred(outil), ["credential_broker"])

print("\nConstater n'est pas consommer")
verifier("mcp-test-echo : aucun identifiant", cred("mcp-test-echo"), ["none"])

print("\nBYOT : le secret est dans la requête, pas dans les credentials n8n")
verifier("un outil au moins déclare caller_provided",
         any(c.startswith("caller_provided") for l in lignes.values() for c in l["credential"]), True)
verifier("acts_on ne rend que des valeurs du contrat",
         sorted({l["acts_on"] for l in lignes.values()}) == sorted(
             set(l["acts_on"] for l in lignes.values()) & rc.ACTS_ON_VALIDES), True)

print(f"\nRésultat : {ok} ok, {ko} échec(s)\n")
sys.exit(0 if ko == 0 else 1)
