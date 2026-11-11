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
    # ⚠️ DEUXIÈME CONDITION, ARBITRÉE PAR FRANCK LE 2026-11-11 : un outil IRRÉVERSIBLE
    # n'est pas proposé à la voix. Motif mesuré par les deux clients le même jour — desktop
    # n'a AUCUN crochet de confirmation (zéro `tool_call` dans tout `lib/`), front en a un
    # (`mcp_clarification_needed`) mais dans 2 écrans sur 3 et seulement si le back l'émet.
    # Rien ne s'interpose donc entre une phrase dictée et son effet. MCP en a tiré que le
    # garde-fou ne peut pas être une confirmation d'interface : c'est une application de
    # scope côté serveur, qui n'existe pas encore. Tant qu'elle n'existe pas, la voix est
    # retirée par défaut et se rouvre ligne à ligne.
    irreversible = x["irreversible"].startswith("oui")
    if (x["execution"] == "sync" and x["livraison"] == "inline"
            and x["type_resultat"] in ("text", "data") and not fichier
            and not irreversible):
        s.append("voice_realtime")
    if fichier or x["domaine"].startswith("documents"):
        s.append("email")
    # ⚠️ `agenda` A QUITTÉ CETTE FONCTION le 2026-11-11, et c'est la correction d'une
    # erreur à moi. Je l'avais ajouté par règle (« l'outil touche au calendrier »), et la
    # vérification a montré qu'il n'existe dans AUCUN workflow ni dans le registre : les 3
    # seules valeurs jamais écrites en production sont chat, voice_realtime, email. MCP l'a
    # expliqué d'un mot : l'agenda est un ÉCRAN, pas un canal d'appel. Il est maintenant
    # dans `ecrans`, avec contacts, documents et media.
    return ", ".join(dict.fromkeys(s))


# Les écrans ne se devinent pas : ils sont LUS dans la liste du PO, datée et citée.
# Après l'affaire `agenda`, je ne réinvente pas un second vocabulaire par règle.
PO = {}
PO_BRUT = {}   # la valeur TELLE QUELLE, pour que l'écart se voie au lieu de se perdre
for _l in (RACINE / "docs/catalogue/liste-po-2026-11-09.tsv").read_text(
        encoding="utf-8").splitlines():
    if _l.startswith("#") or not _l.strip() or _l.startswith("outil\t"):
        continue
    _c = _l.split("\t")
    if len(_c) >= 2 and _c[1].strip():
        PO[_c[0]] = [v.strip() for v in _c[1].replace(",", " ").split() if v.strip()]
    if len(_c) >= 4:
        PO_BRUT[_c[0]] = f"{_c[1].strip()} · {_c[3].strip()}" if _c[1].strip() else ""

ECRANS = {"agenda", "contacts", "documents", "media"}


def ecrans_de(outil):
    """Les valeurs de la liste PO qui sont des ÉCRANS, pas des canaux.

    La frontière est celle de MCP, arbitrée par Franck le 2026-11-11 : `email` est un
    CANAL (il est dans le registre, et les deux arbitrages déjà rendus l'utilisent),
    `agenda`/`contacts`/`documents`/`media` sont des vues. Les marques `(conteste)` et
    `(doute)` de la liste sont ignorées : ce sont des annotations, pas des valeurs.
    """
    return ", ".join(v for v in PO.get(outil, []) if v in ECRANS)


COLS = ["outil", "nature", "nature_motif", "workflow", "famille", "domaine", "execution",
        "entree_fichier", "irreversible", "surfaces", "surfaces_source",
        "ecrans", "ecrans_source", "po_2026_11_09", "requires",
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
        # Un webhook interne n'a pas plus d'écran que de surface.
        "ecrans": "" if interne else ecrans_de(x["outil"]),
        "ecrans_source": "" if interne else ("PO" if ecrans_de(x["outil"]) else "vide"),
        # ⚠️ LA VALEUR DU PO TELLE QUELLE, canaux ET écrans mélangés comme dans sa liste.
        # Elle n'est PAS recopiée dans `surfaces` : la liste dit « chat » là où nous
        # proposons « chat, voice_realtime », et elle porte 58 lignes `a_trancher`. La
        # mettre côte à côte fait voir l'écart ; la fusionner le ferait disparaître.
        "po_2026_11_09": PO_BRUT.get(x["outil"], ""),
        "requires": "", "execute_par": "n8n",
        "publie_aujourdhui": x["workflow"] if not desc else desc,
        "description": desc,
        "description_source": "sticky" if desc else "vide",
    })

EN_TETE = """\
# Fiche d'arbitrage des surfaces — les 109 outils de production. azy.daily#631 / #642.
#
# À TRANCHER : `surfaces` et `ecrans` (et `requires` si besoin). `description` si besoin.
#
# ⚠️ DEUX COLONNES DEPUIS LE 2026-11-11, PARCE QUE CE SONT DEUX QUESTIONS.
#   surfaces  OÙ LA CONVERSATION APPELLE L'OUTIL — chat | voice_realtime | email
#             C'est le SEUL axe que le filtre MCP applique. Vide = invisible de l'agent :
#             ne pas laisser vide chez un `outil client`.
#   ecrans    DEPUIS QUELLE VUE L'OUTIL EST PROPOSÉ — agenda | contacts | documents | media
#             Relayé par MCP comme métadonnée d'affichage, jamais filtré. Vide est
#             LÉGITIME : beaucoup d'outils n'ont pas d'écran dédié.
#
#   La frontière est celle de MCP : `email` est un CANAL, pas un écran. Elle est tenue par
#   deux mesures — `email` est l'une des 3 valeurs réellement présentes dans le registre,
#   et les deux arbitrages déjà rendus l'utilisent (office-extractor, pdf-ocr en
#   « chat, email »). Les écrans, eux, sont LUS dans la liste du PO du 2026-11-09
#   (`liste-po-2026-11-09.tsv`), jamais déduits.
#
#   ⚠️ ET `agenda` A CHANGÉ DE COLONNE. Il était une surface dans les versions
#   précédentes de cette fiche : c'était une erreur, je l'avais introduit par règle. Il
#   n'existe dans aucun workflow ni dans le registre, parce que ce n'est pas un canal.
#
#   ⚠️ LA QUESTION QUI RESTE OUVERTE, et qui est pour toi : si l'agent peut être invoqué
#   DEPUIS une vue avec un contexte borné — une conversation lancée dans l'agenda, scopée
#   agenda — alors cette vue devient aussi un canal d'appel, et la valeur doit passer dans
#   `surfaces`. Tant que ce n'est pas le cas, les 4 restent des écrans.
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
# ⚠️ LA VOIX EST RETIRÉE PAR DÉFAUT AUX OUTILS IRRÉVERSIBLES — arbitrage du 2026-11-11.
#   35 des 68 outils proposés en `voice_realtime` portaient `irreversible = oui` ; ils
#   passent à `chat` seul. Il reste 33 propositions vocales, toutes réversibles.
#   Pour les retrouver : `irreversible = oui` ET `surfaces` sans `voice_realtime` — ce
#   critère rend 39 lignes, pas 35 : 4 outils irréversibles n'avaient de toute façon jamais
#   été proposés à la voix, pour un autre motif (fichier en entrée ou exécution asynchrone)
#   — audio-transcription, document-translate-worker, office-extractor, torah-pdf.
#   C'est un DÉFAUT, pas un verdict : rouvre ligne à ligne ce qui doit l'être.
#
#   ⚠️ ET QUATRE D'ENTRE ELLES SONT RETIRÉES À TORT, je le sais en l'écrivant :
#   `web-search`, `entity-list`, `games-list`, `progress-get` ne font que LIRE. Elles ne
#   sont marquées irréversibles que par le sur-signalement décrit plus bas. Ce sont les
#   quatre premières à rouvrir, et elles ne demandent aucun arbitrage de fond.
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
