#!/usr/bin/env python3
"""Fiche d'arbitrage des surfaces — les 109 outils de production. azy.daily#631 / #642.

`surfaces` sort PRÉ-REMPLI par des règles explicites, marquées `jet`. Ce n'est pas une
décision : c'est une proposition à corriger. Les règles ont été éprouvées contre les
arbitrages déjà rendus par Franck — et l'épreuve en a cassé une (voir `voice_realtime`).
"""
import csv, sys, pathlib

RACINE = pathlib.Path("/storage6/pi6/n8n-workflows")
SORTIE = pathlib.Path(sys.argv[1])

lignes = [l for l in (RACINE / "docs/catalogue/fiche-outils-production.csv")
          .read_text(encoding="utf-8").splitlines(True) if not l.startswith("#")]
prod = list(csv.DictReader(lignes))

# Arbitrages DÉJÀ rendus : ils ne sont pas reproposés, ils sont repris tels quels.
RENDUS = {"pdf-ocr": "chat, email", "office-extractor": "chat, email"}

# ⚠️ CE QUE LA LISTE DES 109 N'AVAIT PAS FAIT.
# `outils-production.txt` excluait l'ADMINISTRATION (Stripe et consorts). Elle n'a jamais
# exclu les WEBHOOKS INTERNES : des points d'entrée qu'aucun client ne choisit — récepteurs
# d'événements, plomberie de chat.api, récupération asynchrone, diagnostic. Un webhook
# interne n'a pas de surface : la question ne se pose pas pour lui.
# Proposition à trancher, motif mesuré pour chacun.
INTERNE = {
 "job-status/:job_id":        "chemin LITTÉRAL — /webhook/job-status/<id> n'est pas enregistré, injoignable",
 "document-job-status":       "récupération d'un travail asynchrone : appelé par celui qui a reçu le 202",
 "mcp-test-echo":             "outil de diagnostic",
 "lichess-webhook":           "RÉCEPTEUR d'événement : c'est Lichess qui nous appelle",
 "member-join":               "RÉCEPTEUR d'événement de plateforme",
 "guild/member/leave":        "RÉCEPTEUR d'événement de plateforme",
 "mention":                   "RÉCEPTEUR d'événement Discord",
 "private-channel-request":   "action de plateforme Discord, déclenchée par le bot",
 "llm-call-stream":           "relais LLM brut : plomberie de chat.api",
 "claude-call-stream-with-skills": "relais LLM brut : plomberie de chat.api",
 "anthropic-list-skills":     "introspection du fournisseur : administration",
 "llm-intention":             "routage d'intention, en amont de toute sélection d'outil",
 "credits-check":             "plomberie de facturation",
 "credits-refund":            "plomberie de facturation",
 "products-persist":          "écriture en masse du catalogue produits : administration",
 "scriptorium-qc-review":     "contrôle qualité du corpus Torah : outillage interne",
 "discord/dm-resolve":        "résolution d'identifiant interne au bot",
 "discord/student-context":   "constitution de contexte interne, en amont de l'agent",
}


def propose(x):
    s = ["chat"]                      # surface par défaut : rien ici n'est hostile au chat
    fichier = bool(x["accepte"].strip()) or x["type_resultat"] in ("file", "image", "audio", "video")
    # ⚠️ RÈGLE APPRISE DE L'ARBITRAGE SUR `office-extractor`, pas déduite.
    # Ma première version proposait la voix pour tout ce qui répond vite et en ligne.
    # Franck avait exclu `office-extractor` — sync, inline, texte. Le motif n'est pas la
    # vitesse : c'est qu'il EXIGE UN FICHIER, et qu'une conversation vocale n'a pas de
    # sélecteur de fichier. L'entrée interdit la surface, pas le temps de réponse.
    if (x["execution"] == "sync" and x["livraison"] == "inline"
            and x["type_resultat"] in ("text", "data") and not fichier):
        s.append("voice_realtime")
    if fichier or x["domaine"].startswith("documents"):
        s.append("email")
    if "calendar" in x["outil"] or "Calendar" in x["workflow"]:
        s.append("agenda")
    return ", ".join(dict.fromkeys(s))


COLS = ["outil", "nature", "nature_motif", "workflow", "famille", "domaine", "execution",
        "entree_fichier", "irreversible", "surfaces", "surfaces_source", "requires",
        "execute_par", "publie_aujourdhui", "description", "description_source"]

out = []
for x in prod:
    rendu = RENDUS.get(x["outil"])
    desc = x["description"].strip()
    interne = x["outil"] in INTERNE
    out.append({
        "outil": x["outil"],
        "nature": "webhook interne" if interne else "outil client",
        "nature_motif": INTERNE.get(x["outil"], ""),
        "workflow": x["workflow"], "famille": x["famille"],
        "domaine": x["domaine"], "execution": x["execution"],
        "entree_fichier": "oui" if x["accepte"].strip() else "",
        "irreversible": "oui" if x["irreversible"].startswith("oui") else "non",
        # Un webhook interne n'a pas de surface : on ne propose RIEN pour lui.
        "surfaces": "" if interne else (rendu or propose(x)),
        "surfaces_source": "" if interne else ("RENDU" if rendu else "jet"),
        "requires": "", "execute_par": "n8n",
        "publie_aujourdhui": x["workflow"] if not desc else desc,
        "description": desc,
        "description_source": "sticky" if desc else "vide",
    })

EN_TETE = """\
# Fiche d'arbitrage des surfaces — les 109 outils de production. azy.daily#631 / #642.
#
# À TRANCHER : `surfaces` (et `requires` si besoin). `description` si tu veux la corriger.
#   surfaces : chat | voice_realtime | email | agenda   (liste, séparée par des virgules)
#   Vide = « personne n'a tranché » et l'outil reste INVISIBLE du filtre MCP. Ne pas laisser vide.
#
# ⚠️ `surfaces` EST PRÉ-REMPLI PAR UNE PROPOSITION, PAS PAR UNE DÉCISION.
#   surfaces_source = jet   → proposé par règle, À CORRIGER. Passer à `valide` une fois relu.
#   surfaces_source = RENDU → ton arbitrage du 2026-11-10, repris tel quel, jamais reproposé.
#
# LES RÈGLES DE LA PROPOSITION, pour que tu puisses les contester :
#   chat            tout le catalogue.
#   voice_realtime  réponse immédiate, en ligne, restituable à l'oral, ET SANS FICHIER EN ENTRÉE.
#                   (cette dernière condition vient de ton arbitrage sur office-extractor)
#   email           l'outil prend ou rend un document.
#   agenda          l'outil touche au calendrier.
#
# ⚠️ 35 des 68 outils proposés en `voice_realtime` portent `irreversible = oui`.
#   Une action sans retour, dictée à la voix. La colonne `irreversible` est là pour que tu les
#   voies en arbitrant. C'est le point à relire en premier.
#   (chiffre corrigé : il était de 41 sur 84 AVANT la colonne `nature` ; les 18 webhooks
#    internes en ont emporté 16, dont 6 irréversibles — credits-refund, products-persist…)
#
# ⚠️ ET « SANS ÉCRAN DE CONFIRMATION » EST MESURÉ, PAS SUPPOSÉ. Relevé par l'équipe desktop
#   le 2026-11-11 dans son propre dépôt : AUCUNE confirmation avant l'exécution d'un outil,
#   ni en chat ni en vocal — zéro `tool_call` dans tout `lib/`, aucun champ outil sur
#   `ChatMessage`. Le client ne voit que le message final : il n'a aucune occasion
#   d'intercepter l'appel. Leur position : `irreversible` est un critère d'EXCLUSION de
#   surface, pas une information d'affichage. Si tu les laisses en vocal, rien ne s'interpose.
#
# ⚠️ ET `irreversible` SUR-SIGNALE ENCORE. Un POST vers le backend fourni à l'appel est
#   compté comme une écriture même quand la route ne fait que lire (entity-list, games-list,
#   progress-get, web-search). Trancher demande la sémantique des routes de chat.api —
#   périmètre de l'équipe api, pas le nôtre.
"""

with SORTIE.open("w", encoding="utf-8", newline="") as fh:
    fh.write(EN_TETE)
    w = csv.DictWriter(fh, fieldnames=COLS)
    w.writeheader(); w.writerows(out)

relu = list(csv.DictReader(l for l in SORTIE.read_text(encoding="utf-8").splitlines(True)
                           if not l.startswith("#")))
assert relu == [{c: l[c] for c in COLS} for l in out], "aller-retour CSV non fidèle"
import collections
print(f"{len(relu)} lignes, {len(COLS)} colonnes → {SORTIE}")
print("aller-retour CSV vérifié fidèle.\n")
clients = [l for l in relu if l["nature"] == "outil client"]
print(f'nature proposée : {len(clients)} outils clients · '
      f'{len(relu)-len(clients)} webhooks internes\n')
print("répartition des surfaces proposées (outils clients seuls) :")
for k, v in collections.Counter(l["surfaces"] for l in clients).most_common():
    print(f"   {v:3}  {k}")
print(f"\n   surfaces vides chez les outils clients : {sum(1 for l in clients if not l['surfaces'])}")
print(f"   déjà RENDU par Franck    : {sum(1 for l in relu if l['surfaces_source']=='RENDU')}")
print(f"   description absente      : {sum(1 for l in relu if l['description_source']=='vide')}")
