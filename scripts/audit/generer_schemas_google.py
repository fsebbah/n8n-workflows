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
    "mcp-classroom": "Serveur Google Classroom : cours, devoirs, copies rendues, notes, "
                     "élèves, enseignants, annonces et thèmes du compte Google de "
                     "l'utilisateur.",
}
# ⚠️ CLASSROOM A REJOINT LE GÉNÉRATEUR LE 2026-11-10, et voici pourquoi il en était sorti.
# Ses 33 paires étaient classées INDÉTERMINÉES « nœud hors dépôt ». C'était faux : la
# source EST dans le dépôt (`n8n-nodes-classroom-dynamic`), mais son type de nœud vaut
# `CUSTOM.classroomToolDynamic` — n8n nomme `CUSTOM` le paquet des nœuds chargés depuis
# son répertoire custom — et le résolveur découpait sur le point. Corrigé : 33 SAINES,
# zéro morte, zéro mal câblée. C'est le serveur le mieux raccordé des cinq.
#
# Son schéma existait, mais ÉCRIT À LA MAIN, avec trois types faux que la matrice
# contredit : `state` en `boolean` quand le nœud le lit `as string` (PUBLISHED/DRAFT),
# `assigned_grade` et `draft_grade` en `string` quand le nœud les lit `as number`.
# Il déclarait aussi `google_account_id`, que SEUL le nœud `Extract Token` pose et que
# PLUS AUCUN nœud ne lit : un sélecteur de compte promis, jamais branché. Le compte est
# déterminé par le jeton, et par lui seul — fait à retenir pour #645/#646. Généré, le
# schéma ne le déclare plus : la matrice ne voit que ce qui est réellement honoré.

# ⚠️ VOCABULAIRE FERMÉ ET UNITÉS — sans quoi l'additif est inutilisable.
# La matrice sait QUELS champs sont honorés et de quel TYPE. Elle ne sait pas que
# `recurrence` n'accepte que quatre mots, ni que `reminder_email` compte des MINUTES.
# Un champ déclaré `string` sans liste fermée oblige l'agent à deviner : il écrira
# « every day », le workflow traduira en '' et l'événement sortira non récurrent,
# SANS erreur. C'est la panne silencieuse habituelle, déplacée d'un cran dans le LLM.
#
# Les listes ci-dessous sont relevées sur les `options` du nœud (CalendarToolDynamic
# lignes ~240-370) et sur la table de traduction posée par le workflow : l'agent parle
# en mots (`daily`, `tomato`), l'expression du workflow les convertit en RRULE et en
# identifiant de couleur Google. Toute modification de l'une doit suivre l'autre.
ENUMS_CHAMPS = {
    "mcp-calendar": {
        "recurrence": ["daily", "weekly", "monthly", "yearly"],
        "visibility": ["default", "public", "private", "confidential"],
        "status": ["confirmed", "tentative", "cancelled"],
        "color_id": ["lavender", "sage", "grape", "flamingo", "banana", "tangerine",
                     "peacock", "graphite", "blueberry", "basil", "tomato"],
        "order_by": ["startTime", "updated"],
    },
    "mcp-classroom": {
        # Lues sur le nœud : `courseWorkState`/`announcementState` partagent `state`.
        "state": ["PUBLISHED", "DRAFT"],
        "course_state": ["ACTIVE", "ARCHIVED", "PROVISIONED", "DECLINED", "SUSPENDED"],
        "work_type": ["ASSIGNMENT", "SHORT_ANSWER_QUESTION", "MULTIPLE_CHOICE_QUESTION"],
    },
}

DESCRIPTIONS_CHAMPS = {
    "mcp-calendar": {
        "recurrence": "répétition de l'événement ; pour un cas non couvert, utiliser "
                      "`recurrence_rule` à la place",
        "recurrence_rule": "règle RRULE brute (RFC 5545), p. ex. "
                           "`RRULE:FREQ=WEEKLY;BYDAY=MO,TH` ; prime sur `recurrence`",
        "recurrence_count": "nombre d'occurrences ; 0 = sans fin. Ignoré avec "
                            "`recurrence_rule`, qui porte déjà son propre COUNT",
        "use_default_reminders": "laisser les rappels par défaut de l'agenda (vrai par "
                                 "défaut). Poser `reminder_email` ou `reminder_popup` "
                                 "le bascule automatiquement à faux",
        "reminder_email": "rappel par courriel, en MINUTES avant le début (1440 = la "
                          "veille). 0 = pas de rappel courriel",
        "reminder_popup": "rappel à l'écran, en MINUTES avant le début. 0 = aucun",
        "color_id": "couleur de l'événement ; le nom ou l'identifiant Google (1 à 11)",
        "visibility": "visibilité de l'événement pour les autres membres de l'agenda",
        "status": "statut de l'événement. UNIQUEMENT en `update` : omis, le statut "
                  "actuel est conservé",
        "add_google_meet": "créer une visioconférence Google Meet et l'attacher à "
                           "l'événement. UNIQUEMENT en `create`",
        "all_day": "événement sur la journée entière ; `start` et `end` sont alors "
                   "ramenés à leur date, l'heure est ignorée",
        "timezone": "fuseau IANA, p. ex. `Europe/Paris` ; ignoré si `all_day`",
        "start": "début, en ISO 8601 (`2026-11-12T14:00:00+01:00`)",
        "end": "fin, en ISO 8601",
        "attendees": "adresses des participants",
        "time_min": "borne basse de la recherche, en ISO 8601",
        "time_max": "borne haute de la recherche, en ISO 8601",
        "calendar_id": "identifiant de l'agenda ; `primary` par défaut",
        # Les 5 opérations routées le 2026-11-10 : elles étaient implémentées par le
        # nœud et absentes du Switch, donc inatteignables.
        "attendee_email": "adresse du participant à ajouter ou retirer. UNIQUEMENT en "
                          "`addAttendee` / `removeAttendee`",
        "destination_calendar_id": "agenda vers lequel déplacer l'événement. UNIQUEMENT "
                                   "en `move`",
        "text": "l'événement décrit en une phrase, que Google interprète lui-même "
                "(« Déjeuner avec Marie jeudi 13h »). UNIQUEMENT en `quickAdd`",
        "calendars": "agendas dont on interroge la disponibilité ; `primary` par défaut. "
                     "UNIQUEMENT en `freeBusy`",
    },
    "mcp-classroom": {
        "assigned_grade": "note DÉFINITIVE, visible de l'élève. Décimale acceptée",
        "draft_grade": "note PROVISOIRE, invisible de l'élève tant qu'elle n'est pas "
                       "rendue (`studentSubmission/return`). Décimale acceptée",
        "max_points": "barème du devoir ; 0 = devoir non noté",
        "state": "`PUBLISHED` est visible des élèves, `DRAFT` ne l'est pas",
        "due_date": "date d'échéance, `AAAA-MM-JJ`",
        "due_time": "heure d'échéance, `HH:MM` ; sans `due_date`, sans effet",
        "scheduled_time": "publication différée, en ISO 8601 ; exige `state: DRAFT`",
        "return_all": "rendre tous les résultats, en paginant ; `limit` est alors ignoré",
        "limit": "nombre maximal de résultats quand `return_all` est faux",
    },
}

# Le canal du jeton n'est pas le même partout — le dire au lieu de le supposer.
NOTES_JETON = {
    None: """
_⚠️ **Le jeton OAuth n'est volontairement PAS déclaré ci-dessus.** MCP l'injecte APRÈS
son filtrage par schéma (`client.py:104`, valeur venue de Redis), donc il arrive qu'il
soit déclaré ou non — mesuré le 2026-11-09 : un champ non déclaré est bien arrivé sur
`llm-call-messages`. Le déclarer serait inutile, et surtout néfaste : un champ déclaré
est un champ que le LLM peut POSER, ce qui lui permettrait d'agir sur le compte d'un
tiers si un contenu hostile le lui soufflait._

_Les nœuds lisent `oauth_token || access_token` dans le CORPS, et c'est inchangé : c'est
le contrat des appelants directs (chat.api), qui ne passent pas par le filtre de MCP.
Jamais de `$env`._
""",
    "mcp-classroom": """
_⚠️ **Le jeton OAuth n'est volontairement PAS déclaré ci-dessus** — voir la note des
autres serveurs : MCP l'injecte après son filtrage, donc le déclarer n'apporte rien et
offrirait au LLM la possibilité de le poser._

_Ce serveur accepte le jeton par TROIS canaux, dans cet ordre (nœud `Extract Token
(RFC-089)`) : en-tête `x-google-access-token`, puis `body.oauth_token`, puis
`body.access_token`. **MCP n'émet QUE `body.oauth_token`** — jamais d'en-tête, jamais
plusieurs noms, par posture de sécurité (confirmé le 2026-11-10). L'en-tête et
`access_token` restent donc là pour les appelants directs. Aucune convergence sur
l'en-tête n'est prévue : les quatre autres serveurs ne liront pas l'en-tête. Jamais de
`$env`._

_⚠️ `resource` EST déclaré ici, contrairement aux quatre autres : les `STATIC_MAPPINGS`
de MCP l'injectent pour gmail, calendar, contacts et drive, mais pas pour classroom._

_⚠️ `google_account_id` n'est volontairement PAS déclaré : le workflow le recopie mais
aucun nœud ne le lit. Le compte Google visé est déterminé par le jeton, et par lui
seul — aucun champ du corps ne permet de choisir un compte (azy.daily#645)._
""",
}

# Les serveurs dont MCP n'injecte PAS `resource` (hors `STATIC_MAPPINGS`).
RESOURCE_A_DECLARER = {"mcp-classroom"}

ENTETE = """
**Description:**
{DESC}

**InputSchema:**
```json
{SCHEMA}
```

_Généré le 2026-11-10 par `scripts/audit/generer_schemas_google.py` depuis la matrice
du câblage réel (azy.daily#642 / #645). **Ne pas modifier à la main** : régénérer._

_Ne figurent ici que les champs qu'une opération SAINE honore RÉELLEMENT. Un champ
que le nœud ignore est volontairement absent : le déclarer ferait croire à un
filtrage qui n'a pas lieu — la même panne silencieuse, un cran plus loin._

_⚠️ MCP retire tout champ hors schéma. Toute évolution du workflow qui lit un
nouveau champ du corps doit être suivie d'une régénération, sinon le champ
n'arrivera jamais._

{JETON}{TABLEAU}"""


def enrichir(path, props):
    """Pose les listes fermées et les unités sur les champs qui en ont une.

    ⚠️ Garde-fou : une entrée qui ne correspond à AUCUN champ honoré est une erreur,
    pas un oubli bénin. Elle signifierait que le workflow a cessé de poser ce champ et
    que la table de vocabulaire décrit un contrat disparu — exactement le mensonge que
    ce générateur existe pour empêcher.
    """
    inconnus = []
    for table, cle in ((ENUMS_CHAMPS, "enum"), (DESCRIPTIONS_CHAMPS, "description")):
        for champ, valeur in (table.get(path) or {}).items():
            if champ not in props:
                inconnus.append(f"{champ} ({cle})")
                continue
            props[champ][cle] = valeur
    if inconnus:
        raise ValueError(f"{path}: vocabulaire décrit pour des champs NON honorés : "
                         + ", ".join(sorted(inconnus)))
    return props


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
    # ⚠️ `resource` N'EST DÉCLARÉ QUE LÀ OÙ MCP NE LE FOURNIT PAS (2026-11-10).
    # Leurs `STATIC_MAPPINGS` injectent `resource` pour gmail, calendar, contacts et
    # drive — mais PAS pour classroom. Le déclarer chez les quatre premiers n'apporte
    # donc rien, et un champ déclaré est un champ que le LLM peut POSER : autant ne pas
    # lui offrir d'écraser le routage que MCP a déjà choisi. Classroom, lui, en a besoin.
    if path in RESOURCE_A_DECLARER:
        props["resource"] = {"type": "string",
                             "enum": sorted({l["resource"] for l in saines}),
                             "description": "ressource visée ; ce serveur ne reçoit pas "
                                            "de défaut, il faut la fournir"}
    # ⚠️ LE JETON N'EST PLUS DÉCLARÉ, ET C'EST MESURÉ, PAS SUPPOSÉ (2026-11-10).
    #
    # Il l'était, avec pour justification « le déclarer permet de l'écraser ». C'était
    # la mauvaise lecture : pouvoir l'écraser est le DANGER, pas la fonctionnalité.
    #
    # MCP a tracé l'ordre exact chez eux : `param_builder.build()` filtre par schéma,
    # PUIS `client.py:104` fait `body["oauth_token"] = access_token` avec un jeton venu
    # de Redis — après le filtrage et hors schéma. Le jeton arrive donc que nous le
    # déclarions ou non. Vérifié indépendamment de leur dire : le 2026-11-09, MCP a
    # appelé `llm-call-messages` et le champ `reasoning`, NON déclaré au registre, est
    # bien arrivé dans le corps. L'injection hors schéma est réelle.
    #
    # Conséquence : déclarer les deux noms était inutile ET néfaste. Un champ déclaré
    # est un champ que le LLM peut poser, et `_build_from_schema` le laisserait passer.
    # Un contenu hostile lu par l'agent — le corps d'un courriel rendu par
    # `message/get`, par exemple — pourrait lui faire appeler un outil Google avec le
    # jeton d'un tiers, et écrire les données de l'utilisateur chez l'attaquant.
    #
    # ⚠️ Les WORKFLOWS continuent de lire `oauth_token || access_token` dans le corps,
    # et il ne faut PAS y toucher : c'est le contrat des appelants DIRECTS (chat.api),
    # qui ne passent pas par le filtre de MCP. Ne plus le déclarer retire au LLM la
    # possibilité de le poser ; cela n'empêche personne de l'envoyer.
    schema = {"type": "object", "required": ["operation"],
              "properties": enrichir(path, props)}

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
                  .replace("{JETON}", NOTES_JETON.get(path) or NOTES_JETON[None]) \
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
