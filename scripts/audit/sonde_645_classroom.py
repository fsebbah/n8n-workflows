#!/usr/bin/env python3
"""Essai des 33 routes de `mcp-classroom` à JETON VOLONTAIREMENT INVALIDE. #645

    python3 scripts/audit/sonde_645_classroom.py              # les 33 routes
    python3 scripts/audit/sonde_645_classroom.py --route course/get
    python3 scripts/audit/sonde_645_classroom.py --attendu-marqueur

CE QU'IL MESURE, ET POURQUOI UN JETON FAUX SUFFIT
-------------------------------------------------
L'analyse statique rend 33 paires SAINES sur 33 : le nœud implémente chaque opération
routée, et le workflow lui passe exactement les paramètres qu'il lit. Mais elle lit la
source du DÉPÔT, et le nœud qui tourne est celui du CONTENEUR — chargé depuis le
répertoire custom de n8n, d'où son type `CUSTOM.classroomToolDynamic`. Rien ne garantit
que les deux coïncident. L'essai tranche cela, et lui seul.

Un jeton invalide est le bon discriminateur parce que les deux pannes qu'on cherche se
produisent de part et d'autre du réseau :

  route ABSENTE du nœud installé → le nœud lève « Unknown <resource> operation »
                                   AVANT tout appel réseau            → 501
  route PRÉSENTE                 → la requête part, Google refuse le jeton → 401

Un 401 est donc un SUCCÈS de l'essai : il prouve que la route existe, qu'elle a été
routée, et qu'elle a bien atteint Google. Aucune donnée n'est lue ni écrite — Google
refuse avant d'agir. C'est ce qui rend l'essai sûr sur `course/delete` comme sur
`course/get`.

⚠️ LE JETON EST FABRIQUÉ, JAMAIS EMPRUNTÉ
Aucune variable d'environnement, aucun fichier, aucun argument : la chaîne est engendrée
ici et ne correspond à aucun compte. Un vrai jeton transformerait 33 refus inoffensifs en
33 opérations réelles, dont cinq destructions.

⚠️ CE QUE L'ESSAI RÉPOND SELON LA VERSION DÉPLOYÉE — et il ne suppose RIEN
Le marqueur d'erreur #645 n'est pas encore réimporté sur Classroom. Tant qu'il ne l'est
pas, un refus de Google TUE le workflow avant son `respondToWebhook`, et n8n ferme la
requête en **200 à corps vide** — le symptôme même que #645 corrige. L'essai accepte donc
les deux formes et dit laquelle il a vue :

  AVANT  200 + corps vide            → route atteinte, enveloppe absente (défaut connu)
  APRÈS  401 + error_code GOOGLE_AUTH_REJECTED  → route atteinte, enveloppe conforme

`--attendu-marqueur` exige la forme APRÈS et sort en échec sinon : c'est ce drapeau qu'on
passe une fois le réimport fait, pour prouver que l'enveloppe est bien arrivée.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOTE = os.environ.get("N8N_SONDE_HOTE", "http://llm.local:5678")
CHEMIN = "/webhook/mcp-classroom"

# Jeton fabriqué sur place. Il ne vient d'aucun compte et n'en ouvre aucun.
JETON_INVALIDE = "SONDE-645-JETON-VOLONTAIREMENT-INVALIDE-%d" % int(time.time())

# Identifiants fantaisistes : ils n'ont pas à exister, Google refuse le jeton avant de
# les regarder. Leur seul rôle est d'éviter qu'un paramètre MANQUANT soit confondu avec
# une route absente — ce serait attribuer à la route un défaut qui vient de l'essai.
FAUX = {
    "course_id": "SONDE645COURS",
    "coursework_id": "SONDE645DEVOIR",
    "submission_id": "SONDE645COPIE",
    "announcement_id": "SONDE645ANNONCE",
    "topic_id": "SONDE645THEME",
    "user_id": "sonde645@example.invalid",
    "owner_id": "me",
    "name": "Sonde 645 — ne pas utiliser",
    "title": "Sonde 645 — ne pas utiliser",
    "text": "Sonde 645 — ne pas utiliser",
    "description": "Sonde 645",
    "section": "S645",
    "room": "R645",
    "course_state": "ACTIVE",
    "state": "DRAFT",
    "work_type": "ASSIGNMENT",
    "max_points": 20,
    "due_date": "2027-01-01",
    "due_time": "12:00",
    "scheduled_time": "2027-01-01T12:00:00Z",
    "assigned_grade": 15,
    "draft_grade": 15,
    "return_all": False,
    "limit": 1,
}


def routes_du_workflow():
    """Les paires (resource, operation) et les champs honorés, LUS DANS LE WORKFLOW.

    On ne récite pas une liste écrite à la main : elle divergerait du workflow au
    premier ajout de route, et l'essai déclarerait saine une route qu'il n'a pas
    essayée. La matrice est la même source que le schéma publié.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "matrice_contrat_mcp", os.path.join(RACINE, "scripts", "audit", "matrice_contrat_mcp.py"))
    M = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(M)
    for chemin, _nom, lignes in M.toutes_les_matrices({"mcp-classroom"}):
        return [(l["resource"], l["operation"], l["honores"]) for l in lignes]
    return []


def appeler(resource, operation, honores, delai=25):
    # ⚠️ LES DEUX NOMS, et c'est une mesure, pas une précaution de style.
    # Le Classroom DÉPLOYÉ lit `headers['x-google-access-token'] || body.access_token`.
    # Il ignore `oauth_token`, qui est le nom que MCP ÉMET. Le dépôt corrige cela
    # (lecture des trois canaux), mais ce n'est pas réimporté. Un essai n'envoyant que
    # `oauth_token` ne mesurerait donc pas les routes : il mesurerait ce seul écart, et
    # les 33 rendraient « jeton non reçu » sans qu'on sache rien de leur état.
    corps = {"resource": resource, "operation": operation,
             "oauth_token": JETON_INVALIDE, "access_token": JETON_INVALIDE}
    for champ in honores:
        if champ in FAUX:
            corps[champ] = FAUX[champ]
    donnees = json.dumps(corps).encode()
    req = urllib.request.Request(HOTE + CHEMIN, data=donnees, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=delai) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:                      # délai, réseau
        return None, f"{type(e).__name__}: {e}"


_API = {}


def _api():
    """Client de l'API n8n, chargé à la demande — l'essai marche sans lui, en dégradé."""
    if "mod" not in _API:
        sys.path.insert(0, os.path.join(RACINE, "scripts", "n8n"))
        try:
            import n8n_api as A
            A.load_env()
            _API["mod"] = A
        except Exception as e:
            _API["mod"] = None
            print(f"   (API n8n indisponible : {type(e).__name__}) ", file=sys.stderr)
    return _API["mod"]


def _epurer(message: str) -> str:
    """Retire du message tout ce qui ressemble à un jeton AVANT affichage.

    ⚠️ n8n recopie la requête COMPLÈTE dans ses erreurs, en-têtes comprises
    (`context.request.headers`), et un `Authorization: Bearer …` s'y trouve en clair.
    Le nôtre est fabriqué et inoffensif, mais l'essai doit rester sûr le jour où
    quelqu'un le lance avec autre chose, et la trace ne doit jamais devenir un endroit
    où lire un jeton.
    """
    import re
    m = str(message or "")
    m = re.sub(r"(ya29|1//|SONDE-645)[A-Za-z0-9._\-]*", "<JETON>", m)
    m = re.sub(r"(?i)(bearer\s+)\S+", r"\1<JETON>", m)
    return m


def message_execution(id_workflow, depuis_ms, essais=6):
    """Le message d'erreur de la dernière exécution, ou None.

    Avant le réimport du marqueur, le workflow MEURT avant de répondre : la réponse
    HTTP est un 200 vide, et le motif n'existe QUE dans l'exécution. C'est donc là
    qu'il faut le lire pour distinguer une route morte d'un refus de Google — sans
    quoi l'essai ne peut rien conclure tant que le marqueur n'est pas déployé.
    """
    A = _api()
    if A is None:
        return None
    for _ in range(essais):
        time.sleep(0.6)
        r = A.api_request("GET", f"/executions?workflowId={id_workflow}&limit=3")
        d = (r.json() if hasattr(r, "json") else r) or {}
        for e in (d.get("data") or []):
            if not e.get("startedAt"):
                continue
            if e["startedAt"] < depuis_ms:
                continue
            r2 = A.api_request("GET", f"/executions/{e['id']}?includeData=true")
            det = (r2.json() if hasattr(r2, "json") else r2) or {}
            rd = ((det.get("data") or {}).get("resultData")) or {}
            err = rd.get("error") or {}
            return {"noeud": rd.get("lastNodeExecuted"),
                    "message": _epurer(err.get("message")),
                    "http": err.get("httpCode")}
    return None


def classer_message(info):
    """Verdict d'une route depuis le message de son exécution."""
    if not info:
        return None
    m = info.get("message") or ""
    # ⚠️ L'ORDRE COMPTE, pour la même raison que dans `Qualifier la réponse` :
    # « Unknown … operation » ne porte aucun statut HTTP, c'est un défaut de câblage
    # chez nous. Le classer après les codes HTTP ferait chercher la panne chez Google.
    if __import__("re").search(r"Unknown\s+\w+\s+operation", m, __import__("re").I):
        return ("ROUTE MORTE", "TOOL_OPERATION_UNKNOWN",
                "absente du nœud INSTALLÉ : le conteneur diverge du dépôt")
    if "Access token is required" in m:
        return ("JETON NON REÇU", "",
                "le nœud n'a rien reçu : canal de jeton non reconnu par la version déployée")
    http = str(info.get("http") or "")
    if http in ("401", "403") or __import__("re").search(
            r"\b40[13]\b|Invalid Credentials|Authorization failed", m, __import__("re").I):
        return ("ROUTE VIVANTE", "GOOGLE_AUTH_REJECTED", f"Google a refusé le jeton ({http or '401'})")
    if http or __import__("re").search(r"\b\d{3}\b", m):
        # Google a RÉPONDU, quel que soit le code : la route est donc bien vivante.
        return ("ROUTE VIVANTE", "", f"Google a répondu {http or 'un statut'} — route atteinte")
    return ("INDÉTERMINÉ", "", (m[:70] or "aucun message"))


def verdict(statut, texte):
    """Classe la réponse. Rend (étiquette, code, détail)."""
    if statut is None:
        return "INJOIGNABLE", "", texte[:90]
    corps = None
    if texte.strip():
        try:
            corps = json.loads(texte)
        except Exception:
            corps = None

    if isinstance(corps, dict) and ("error_code" in corps or "error" in corps):
        code = corps.get("error_code") or (corps.get("error") or {}).get("code") or ""
        if code == "GOOGLE_AUTH_REJECTED":
            # Le seul résultat attendu : la route existe et a atteint Google.
            return "ROUTE VIVANTE", code, f"HTTP {statut}"
        if code == "TOOL_OPERATION_UNKNOWN":
            # Le nœud INSTALLÉ n'implémente pas cette opération, contrairement au dépôt.
            return "ROUTE MORTE", code, f"HTTP {statut}"
        if code == "TOOL_ROUTE_UNKNOWN":
            # Le Switch ne connaît pas la paire : elle n'est pas routée.
            return "NON ROUTÉE", code, f"HTTP {statut}"
        return "ERREUR AUTRE", code, f"HTTP {statut} {str(corps.get('error'))[:60]}"

    if statut == 200 and not texte.strip():
        # L'état AVANT réimport : le nœud a levé, le workflow est mort avant de
        # répondre. La route a bien été atteinte, mais rien ne le dit dans la réponse.
        return "200 VIDE", "", "enveloppe absente — marqueur #645 non déployé"
    if isinstance(corps, dict) and corps.get("success") is True:
        # Un succès avec un jeton invalide serait très grave : il voudrait dire qu'un
        # autre jeton que le nôtre a servi.
        return "SUCCÈS INATTENDU", "", "un jeton invalide ne doit JAMAIS réussir"
    return "INATTENDU", "", f"HTTP {statut} {texte[:70]}"


def identifiant_workflow():
    """L'identifiant du workflow qui sert `mcp-classroom`, lu sur l'instance."""
    A = _api()
    if A is None:
        return None
    try:
        for w in A.iter_all_workflows():
            for n in (w.get("nodes") or []):
                if (n.get("type") == "n8n-nodes-base.webhook"
                        and (n.get("parameters") or {}).get("path") == "mcp-classroom"):
                    return w["id"]
    except Exception:
        return None
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--route", help="n'essayer qu'une paire, p. ex. course/get")
    ap.add_argument("--attendu-marqueur", action="store_true",
                    help="exiger l'enveloppe #645 (après réimport) ; échoue sur un 200 vide")
    a = ap.parse_args()

    routes = routes_du_workflow()
    if not routes:
        print("ÉCHEC — aucune route lue depuis le workflow", file=sys.stderr)
        return 1
    if a.route:
        r, _, o = a.route.partition("/")
        routes = [x for x in routes if x[0] == r and x[1] == o]
        if not routes:
            print(f"ÉCHEC — route `{a.route}` absente du workflow", file=sys.stderr)
            return 1

    print(f"Hôte     : {HOTE}{CHEMIN}")
    print(f"Jeton    : fabriqué sur place, invalide par construction "
          f"({len(JETON_INVALIDE)} caractères)")
    print(f"Routes   : {len(routes)}\n")
    print(f"{'resource/operation':<34} {'verdict':<18} {'code':<24} détail")
    print("-" * 110)

    id_wf = identifiant_workflow()
    if id_wf is None:
        print("   (identifiant du workflow introuvable : classement par exécution "
              "indisponible)\n", file=sys.stderr)

    compte, par_execution = {}, [0]
    for resource, operation, honores in routes:
        from datetime import datetime, timezone
        avant = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        statut, texte = appeler(resource, operation, honores)
        etiquette, code, detail = verdict(statut, texte)
        # ⚠️ Tant que le marqueur #645 n'est pas déployé, un 200 vide ne dit RIEN :
        # une route morte et un refus de Google produisent le MÊME vide. Le motif
        # n'existe que dans l'exécution — on va le chercher là, sinon l'essai ne
        # conclut sur aucune des 33 routes.
        if etiquette == "200 VIDE" and id_wf:
            affine = classer_message(message_execution(id_wf, avant))
            if affine:
                etiquette, code, detail = affine
                detail += "  [lu dans l'exécution, pas dans la réponse]"
                par_execution[0] += 1
        compte[etiquette] = compte.get(etiquette, 0) + 1
        print(f"{resource + '/' + operation:<34} {etiquette:<18} {code:<24} {detail}")

    print("\n" + "=" * 110)
    for k in sorted(compte):
        print(f"  {k:<18} {compte[k]}")

    vivantes = compte.get("ROUTE VIVANTE", 0)
    vides = compte.get("200 VIDE", 0)
    mortes = compte.get("ROUTE MORTE", 0)
    sans_jeton = compte.get("JETON NON REÇU", 0)
    atteintes = vivantes + vides

    if sans_jeton:
        print(f"⚠️ {sans_jeton} route(s) : le nœud n'a reçu AUCUN jeton.")
        print("   La version DÉPLOYÉE lit `headers['x-google-access-token'] ||")
        print("   body.access_token` et ignore `oauth_token`, qui est le nom que MCP")
        print("   ÉMET. Le dépôt lit les trois canaux ; ce n'est pas réimporté.")
        print("   Tant que ce l'est pas, aucun appel MCP ne peut porter de jeton — et")
        print("   la sticky déployée n'a pas d'InputSchema, donc MCP retire déjà tout.")
        return 2

    print()
    if compte.get("SUCCÈS INATTENDU"):
        print("⚠️ ARRÊT — une route a RÉUSSI avec un jeton invalide. Cela signifie qu'un")
        print("   autre jeton que le nôtre a servi la requête. À remonter immédiatement.")
        return 2
    if compte.get("INJOIGNABLE"):
        print(f"⚠️ {compte['INJOIGNABLE']} route(s) injoignable(s) : l'essai ne conclut pas.")
        return 1
    if mortes:
        print(f"⚠️ {mortes} route(s) absente(s) du nœud INSTALLÉ alors que la source du")
        print("   dépôt les implémente : le conteneur ne porte pas la même version.")
        return 2
    if vides and a.attendu_marqueur:
        print(f"⚠️ {vides} route(s) rendent un 200 à corps vide : le marqueur #645 n'est")
        print("   pas déployé sur ce serveur. Les routes sont atteintes, mais l'appelant")
        print("   ne peut pas distinguer un refus d'une boîte vide.")
        return 2
    if vides:
        print(f"✓ {atteintes}/{len(routes)} routes atteintes. {vides} rendent encore un 200")
        print("  à corps vide : état ATTENDU avant le réimport du marqueur #645.")
        print("  Rejouer avec --attendu-marqueur après le réimport.")
        return 0
    if par_execution[0]:
        # ⚠️ Ne PAS conclure que l'enveloppe est bonne : elle n'a rien dit. Le verdict
        # vient de l'exécution, que seul un opérateur de n8n peut lire — pas l'appelant.
        print(f"✓ {vivantes}/{len(routes)} routes vivantes : chacune a atteint Google, "
              f"qui a refusé le jeton.")
        print(f"⚠️ MAIS {par_execution[0]} verdict(s) sur {len(routes)} ont été lus dans")
        print("   L'EXÉCUTION, pas dans la réponse : l'appelant, lui, a reçu un 200 à")
        print("   corps vide. Le câblage est donc confirmé bon ; le marqueur #645 reste")
        print("   à réimporter pour que l'appelant puisse le constater lui-même.")
        return 0
    print(f"✓ {vivantes}/{len(routes)} routes vivantes, enveloppe #645 conforme.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
