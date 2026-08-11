#!/usr/bin/env python3
"""Non-régression : les workflows de catalogue corpus doivent traduire une erreur
de l'API Torah en code HTTP entier, exact, et lisible par le plugin.

    python3 scripts/test/test_corpus_erreurs.py            # hors ligne, sur le JSON
    python3 scripts/test/test_corpus_erreurs.py --en-ligne # + appels réels aux webhooks

Ce que le test protège
----------------------
`onError: continueRegularOutput` ne produit PAS `{statusCode, body}` quand
l'appel échoue : n8n émet l'objet d'erreur, sans `statusCode`, et avec un code
TEXTUEL (`ERR_BAD_REQUEST`). L'ancien `input.statusCode || 200` retombait donc
sur 200, le spread `{success: true, ...data}` recopiait `error.code` tel quel, et
le nœud Respond refusait une chaîne comme code HTTP — le plugin recevait

    HTTP 500  {"code":0,"message":"Invalid status code: \"ERR_BAD_REQUEST\"…"}

au lieu d'un 404 NOT_FOUND. Voir azy.daily#215 et n8n-workflows#422 (même mode
de défaillance sur DOCUMENT - Job Status).

Le code JS est exécuté par node, extrait du JSON du workflow : le test porte donc
sur ce qui sera importé dans n8n, pas sur une copie susceptible de diverger.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = RACINE / "workflows"

FICHIERS = ["Torah_Corpus.json", "Torah_Corpus_Sedarim.json", "Torah_Corpus_Traites.json"]

# (libellé, item reçu par « Format Response », code HTTP attendu, fragment de message)
CAS = [
    ("succès 200", {"statusCode": 200, "body": {"traites": []}}, 200, None),
    (
        "404 API avec fullResponse",
        {"statusCode": 404, "body": {"detail": {"message": "Seder non trouve"}}},
        404,
        "Seder non trouve",
    ),
    (
        "échec node, 404 enfoui dans le message",
        {"error": {"message": '404 - {"detail":{"message":"Seder non trouve"}}',
                   "code": "ERR_BAD_REQUEST"}},
        404,
        "Seder non trouve",
    ),
    (
        "échec node, 500 avec detail texte",
        {"error": {"message": '500 - {"detail":"boom"}', "code": "ERR_BAD_RESPONSE"}},
        500,
        "boom",
    ),
    (
        "timeout : aucun code HTTP lisible",
        {"error": {"message": "The connection was aborted", "code": "ECONNABORTED"}},
        502,
        "aborted",
    ),
]

# Reproduit l'expression du nœud Respond, pour vérifier la CHAÎNE complète et pas
# seulement la sortie du Code node.
RESPOND = "s.error ? (Number(s.error.code) || 500) : 200"

echecs = []


def controle(libelle, obtenu, attendu):
    ok = obtenu == attendu
    print(f"  {'✅' if ok else '❌'} {libelle:52} {obtenu}"
          + ("" if ok else f"  (attendu : {attendu})"))
    if not ok:
        echecs.append(libelle)


for nom in FICHIERS:
    d = json.loads((WORKFLOWS / nom).read_text(encoding="utf-8"))
    code = next(
        n["parameters"]["jsCode"]
        for n in d["nodes"]
        if n["name"] == "Format Response"
    )
    print(f"\n{nom}")

    for libelle, item, attendu_code, fragment in CAS:
        js = (
            "const $input = { first: () => ({ json: "
            + json.dumps(item)
            + " }) };\n"
            "const s = (function(){\n" + code + "\n})()[0].json;\n"
            "console.log(JSON.stringify({http: " + RESPOND + ", s}));"
        )
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                         encoding="utf-8") as f:
            f.write(js)
            chemin = f.name
        r = subprocess.run(["node", chemin], capture_output=True, text=True)
        pathlib.Path(chemin).unlink()
        if r.returncode != 0:
            controle(libelle, f"erreur node : {r.stderr.strip()[:80]}", attendu_code)
            continue
        sortie = json.loads(r.stdout)
        controle(libelle, sortie["http"], attendu_code)
        if fragment:
            msg = (sortie["s"].get("error") or {}).get("message", "")
            controle(f"  └ message porte « {fragment} »", fragment in msg, True)

    # Le code HTTP ne doit jamais pouvoir être une chaîne : c'est ce que n8n refuse.
    for n in d["nodes"]:
        rc = n.get("parameters", {}).get("options", {}).get("responseCode")
        if isinstance(rc, str) and "$json.error" in rc:
            controle(f"responseCode de « {n['name']} » force un entier",
                     "Number(" in rc, True)

# ------------------------------------------------------------------ en ligne
if "--en-ligne" in sys.argv:
    BASE = "http://llm.local:5678/webhook"
    print("\nappels réels")
    for libelle, chemin, params, attendu in [
        ("seder inexistant", "torah-corpus-traites",
         {"corpus": "Chasidut Breslov", "seder": "Nexistepas"}, 404),
        ("corpus inexistant", "torah-corpus-sedarim", {"corpus": "Nexistepas"}, 404),
        ("corpus valide", "torah-corpus-sedarim", {"corpus": "Bavli"}, 200),
    ]:
        url = f"{BASE}/{chemin}?" + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                obtenu = r.status
        except urllib.error.HTTPError as e:
            obtenu = e.code
        except Exception as e:  # noqa: BLE001
            obtenu = f"injoignable : {e}"
        controle(libelle, obtenu, attendu)

print()
if echecs:
    print(f"❌ {len(echecs)} contrôle(s) en échec")
    sys.exit(1)
print("✅ tous les contrôles passent")
