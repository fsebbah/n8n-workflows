#!/usr/bin/env python3
"""Fiche des 110 outils de production : les 43 informations attendues par les équipes.

Schéma arrêté par Franck le 2026-11-10 (azy.daily#642) : 12 informations universelles,
31 spécifiques à la famille. Entrée : la liste des outils de production.

⚠️ RÈGLE ABSOLUE DE CE SCRIPT : NE RIEN INVENTER.
Chaque valeur est DÉDUITE du workflow déployé, ou LAISSÉE VIDE. Une case vide dit « je ne
sais pas », et c'est une information. Une case remplie au jugé est un piège : Franck l'a
dit sans détour — « c'est en devinant le coût qu'on a affiché 91 crédits pour 0,096 ».

⚠️ ON LIT L'INSTANCE, PAS LE DÉPÔT.
Ce qui est servi aux clients est ce qui tourne sur llm. Le dépôt peut diverger (mesuré :
255/267 identiques le 2026-11-10). Un catalogue tiré du dépôt décrirait un parc imaginaire.

⚠️ CE QUE CE SCRIPT NE PEUT PAS DÉDUIRE, et pourquoi il laisse vide :
  • `surfaces` — 231 arbitrations en attente de Franck. Le registre publie le champ, il
    est rempli sur 8 outils /239. Le déduire du nom serait le décider en cachette.
  • `cout` en monnaie — n8n ne connaît ni les tarifs ni les barèmes. Le script donne
    l'UNITÉ et le fournisseur, qui sont mesurables ; le prix appartient à api.
  • `enonciation` / `differer_vers_historique` — l'axe vocal est une décision de
    rédaction, pas une propriété du code.
  • `droit_usage` — relève des CGU des fournisseurs, pas du workflow.

⚠️ `estimated_time` EST UN PLAFOND, PAS UNE DURÉE.
C'est la somme des `timeout` des nœuds du chemin. `web-search` à 60 s de plafond répond
peut-être en 2 s. La rétention d'exécutions est de 37 h et 469 outils sur 501 sont à zéro
appel : il n'existe aucune distribution de durées réelles à publier. Le plafond est
honnête et borne le risque ; le présenter comme une durée observée serait faux.
"""
import csv
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
SORTIE = RACINE / "docs" / "catalogue"
LISTE = RACINE / "docs" / "catalogue" / "outils-production.txt"
RELEVE_DISTANT = "llm.local:/storage4/releve/executions.csv"

SOCLE = ["description", "execution", "surfaces", "scope", "requires", "result_kind",
         "livraison", "estimated_time", "cout", "irreversible", "limites_entree",
         "sort_du_perimetre"]
SPECIFIQUES = {
    "extraction": ["accepte", "taille_max_pages_max", "langues", "perd", "sortie_tronquee"],
    "recherche": ["nb_resultats", "cite_ses_sources", "fraicheur", "langue_zone", "cache"],
    "media": ["dimensions_duree", "formats_sortie", "recuperation", "duree_de_vie",
              "choix_disponibles", "droit_usage"],
    "connecteur": ["compte_requis", "scopes", "lit", "ecrit", "quota", "portee_des_donnees"],
    "llm": ["modele", "entree_max", "forme_de_sortie", "stable"],
    "asynchrone": ["suivi", "annulable", "duree_de_vie_du_resultat", "idempotent"],
    "vocal": ["enonciation", "differer_vers_historique"],
}
COLONNES = (["outil", "workflow", "methode", "famille"] + SOCLE
            + [c for f in ("extraction", "recherche", "media", "connecteur", "llm",
                           "asynchrone", "vocal") for c in SPECIFIQUES[f]]
            + ["executions_41j", "champs_renseignes"])

HOTES_INTERNES = re.compile(r"(localhost|127\.0\.0\.1|\.local\b|^$)", re.I)
# ⚠️ Espaces réservés de DOCUMENTATION, jamais appelés. Les compter comme des tiers
# banaliserait la colonne : un lecteur qui trouve un faux positif cesse de la croire.
HOTES_FICTIFS = re.compile(r"(example\.(com|org|net)|exemple\.|votre-|your-|placeholder|monsite|mon-domaine)", re.I)


# ═══ LECTURE DE L'INSTANCE ════════════════════════════════════════════════════
def tous_les_workflows():
    cle = os.environ.get("N8N_API_KEY")
    if not cle:
        sys.exit("N8N_API_KEY absente de l'environnement (source .env.local)")
    curseur, res = None, []
    while True:
        u = "http://llm.local:5678/api/v1/workflows?limit=250" + (f"&cursor={curseur}" if curseur else "")
        d = json.load(urllib.request.urlopen(
            urllib.request.Request(u, headers={"X-N8N-API-KEY": cle}), timeout=60))
        res.extend(d["data"])
        curseur = d.get("nextCursor")
        if not curseur:
            return res


def executions_par_outil():
    """Le relevé de 41 jours. Absent = colonne vide, jamais zéro inventé."""
    try:
        txt = subprocess.run(["ssh", "-o", "BatchMode=yes", RELEVE_DISTANT.split(":")[0],
                              f"cat {RELEVE_DISTANT.split(':', 1)[1]}"],
                             capture_output=True, text=True, timeout=120).stdout
    except Exception:
        return {}
    cum = {}
    for r in csv.DictReader(txt.splitlines()):
        try:
            cum[r["tool"]] = cum.get(r["tool"], 0) + int(r["executions"] or 0)
        except (KeyError, ValueError):
            continue
    return cum


# ═══ OUTILS D'INSPECTION ══════════════════════════════════════════════════════
def noeuds(w):
    return [n for n in w.get("nodes", []) if n.get("type") != "n8n-nodes-base.stickyNote"]


def tout_le_texte(w):
    return json.dumps(noeuds(w), ensure_ascii=False)


def sticky(w):
    for n in w.get("nodes", []):
        if n.get("type") == "n8n-nodes-base.stickyNote":
            return (n.get("parameters") or {}).get("content") or ""
    return ""


def urls(w):
    for n in noeuds(w):
        u = (n.get("parameters") or {}).get("url")
        if isinstance(u, str):
            yield n, u


# Un nœud maison n'a pas d'URL : l'appel est dans son TypeScript. Le paquet dit l'hôte.
# Nœuds NATIFS d'intégration employés par les 110 outils (énuméré le 2026-11-10, pas
# supposé). Un nœud natif n'a pas d'URL : `text-to-speech` appelle OpenAI par
# `n8n-nodes-base.openAi` et ressortait « aucun hôte tiers appelé ».
# `n8n-nodes-base.redis` est volontairement ABSENT : host3 est notre infrastructure,
# pas un tiers.
HOTE_DU_TYPE = {
    "n8n-nodes-base.openAi": "api.openai.com",
    "n8n-nodes-base.linkedIn": "api.linkedin.com",
    "n8n-nodes-veo-video.veoVideo": "aiplatform.googleapis.com (Veo)",
    "n8n-nodes-gemini-image.geminiImage": "generativelanguage.googleapis.com",
}

HOTE_DU_PAQUET = {
    "gmail": "googleapis.com (Gmail)",
    "calendar": "googleapis.com (Calendar)",
    "classroom": "googleapis.com (Classroom)",
    "contacts": "people.googleapis.com",
    "drive": "googleapis.com (Drive)",
    "gemini": "generativelanguage.googleapis.com",
    "veo": "aiplatform.googleapis.com",
    "genai": "generativelanguage.googleapis.com",
    "email-imap": "serveur IMAP désigné par imap_server (fourni par l'appelant)",
}


def hotes_externes(w):
    """Les hôtes tiers réellement appelés. LA colonne la plus utile, et la plus sûre.

    ⚠️ DEUX PIÈGES MESURÉS LE 2026-11-10, et tous deux produisaient des FAUX NÉGATIFS
    sur la colonne que Franck désigne comme la plus coûteuse à devenir.

    1. UN NŒUD MAISON N'A PAS D'URL. `mcp-gmail` ressortait « aucun hôte tiers appelé »
       alors qu'il parle à l'API Google à chaque appel. Dire « non » là où la réponse
       est « oui » est bien pire que de laisser vide.

    2. UNE URL CONSTRUITE PAR EXPRESSION commençait par `{{`, et on la jetait
       entièrement. `text-to-speech` ressortait sans hôte tiers alors qu'il appelle
       l'API d'OpenAI. On lit donc le PRÉFIXE LITTÉRAL avant la première expression.
    """
    vus = []
    for _, u in urls(w):
        brut = u.lstrip("=")
        # Le préfixe littéral : tout ce qui précède la première expression.
        litteral = brut.split("{{")[0]
        m = re.search(r"https?://([A-Za-z0-9_.\-]+)", litteral)
        if not m:
            # L'hôte est peut-être APRÈS une expression (ex. `{{ $env.X }}/api/…`) :
            # on cherche alors un nom d'hôte complet n'importe où dans l'URL.
            m = re.search(r"https?://([a-z0-9][a-z0-9.\-]*\.[a-z]{2,})", brut, re.I)
        if not m:
            continue
        h = m.group(1).split("/")[0].strip()
        if HOTES_INTERNES.search(h) or HOTES_FICTIFS.search(h) or not h or "." not in h:
            continue
        if h not in vus:
            vus.append(h)
    # ⚠️ 3e PIÈGE : un appel peut partir d'un nœud CODE via `helpers.httpRequest`.
    # `text-to-speech` n'a AUCUN nœud HTTP et appelle pourtant l'API d'OpenAI depuis son
    # code — il ressortait « aucun hôte tiers appelé », ce qui est faux.
    for n in noeuds(w):
        js = (n.get("parameters") or {}).get("jsCode")
        if not isinstance(js, str):
            continue
        for h in re.findall(r"https?://([a-z0-9][a-z0-9.\-]*\.[a-z]{2,})", js, re.I):
            if not HOTES_INTERNES.search(h) and not HOTES_FICTIFS.search(h) and h not in vus:
                vus.append(h)
    for n in noeuds(w):
        t = str(n.get("type", ""))
        if t in HOTE_DU_TYPE and HOTE_DU_TYPE[t] not in vus:
            vus.append(HOTE_DU_TYPE[t])
        if "ToolDynamic" not in t:
            continue
        for cle, hote in HOTE_DU_PAQUET.items():
            if cle in t.lower() and hote not in vus:
                vus.append(hote)
    return vus


def champs_du_corps(w):
    return sorted(set(re.findall(r"\bbody\.([a-zA-Z_][a-zA-Z0-9_]*)", tout_le_texte(w)))
                  | set(re.findall(r"\$json\.body\.([a-zA-Z_][a-zA-Z0-9_]*)", tout_le_texte(w))))


def plafond_secondes(w):
    """Somme des `timeout` des nœuds HTTP. ⚠️ Un PLAFOND, jamais une durée observée."""
    total = 0
    for n in noeuds(w):
        t = ((n.get("parameters") or {}).get("options") or {}).get("timeout")
        if isinstance(t, (int, float)):
            total += t
    return round(total / 1000) if total else None


def methodes_sortantes(w):
    """{méthode: [hôtes]} des appels sortants — base de `irreversible`."""
    par_methode = {}
    for n, u in urls(w):
        m = str((n.get("parameters") or {}).get("method") or "GET").upper()
        h = re.search(r"https?://([A-Za-z0-9_.\-]+)", u)
        cible = h.group(1) if h else "(expression)"
        par_methode.setdefault(m, [])
        if cible not in par_methode[m]:
            par_methode[m].append(cible)
    return par_methode


def modeles_llm(w):
    t = tout_le_texte(w)
    mods = set(re.findall(r'"?model"?\s*:\s*[\'"]([a-zA-Z0-9.\-]{6,})[\'"]', t))
    mods |= set(re.findall(r"model:\s*[\'\"]([a-zA-Z0-9.\-]{6,})[\'\"]", t))
    pilotable = bool(re.search(r"model:\s*\$?json|\.model\s*\|\||body\.model", t))
    return sorted(m for m in mods if not m.startswith("http")), pilotable


# ⚠️ Écrits SANS séparateur : les noms d'opérations mélangent `listFolders`,
# `list_folders` et `fetch_email`. On normalise des deux côtés, sinon `fetch_email`
# ressort « non classée » et `irreversible` dit « à vérifier » pour une simple lecture.
LECTURES = {"get", "getall", "getmany", "list", "search", "download", "freebusy",
            "listfolders", "fetchemail", "read", "export", "check"}
ECRITURES = {"create", "update", "delete", "send", "reply", "move", "quickadd",
             "addattendee", "removeattendee", "addlabels", "removelabels", "modify",
             "markread", "markunread", "trash", "upload", "patch", "insert", "generate"}


def operations_maison(w):
    """Les `resource/operation` des nœuds *ToolDynamic.

    ⚠️ POURQUOI CETTE FONCTION EXISTE, et c'est le trou qu'elle comble :
    nos six connecteurs Google et le nœud IMAP n'ont AUCUN paramètre `url` — l'appel
    est fait dans le TypeScript du nœud. Une lecture du catalogue par URL les voyait
    donc comme des outils qui n'appellent rien, et `irreversible` ressortait VIDE pour
    `mcp-gmail`, qui sait pourtant envoyer et supprimer des courriels.

    C'était la pire case vide possible : vide se lit « on ne sait pas », alors que la
    réponse était lisible à deux lignes de là.
    """
    ops = []
    for n in noeuds(w):
        if "ToolDynamic" not in str(n.get("type", "")):
            continue
        p = n.get("parameters") or {}
        op = str(p.get("operation") or "").strip()
        if not op or "{{" in op:
            continue
        res = str(p.get("resource") or "").strip()
        ops.append(f"{res}/{op}" if res else op)
    return sorted(set(ops))


def lectures_ecritures_maison(w):
    lit, ecrit, inconnues = [], [], []
    for o in operations_maison(w):
        # `list_folders` et `listFolders` désignent la même chose : on normalise.
        base = re.sub(r"[_\-]", "", o.split("/")[-1]).lower()
        (lit if base in LECTURES else ecrit if base in ECRITURES else inconnues).append(o)
    return lit, ecrit, inconnues


# ═══ DÉDUCTION DU SOCLE ═══════════════════════════════════════════════════════
def description(w):
    """La phrase du pense-bête, jamais une phrase fabriquée.

    ⚠️ Vide = le pense-bête n'en porte pas. C'est le compte des 162 outils sans
    description, et c'est le chiffre qu'il faut voir — pas une prose auto-générée qui
    donnerait l'illusion d'une documentation. Front l'a dit : un outil dont la
    description ne permet pas de décider quand l'utiliser ne devrait pas être offert.
    """
    s = sticky(w)
    for motif in (r"\*\*Description\s*:?\*\*\s*(.+?)(?:\n\n|\n\*\*|$)",
                  r"\*\*Purpose\s*:?\*\*\s*(.+?)(?:\n\n|\n\*\*|$)"):
        m = re.search(motif, s, re.S | re.I)
        if m:
            d = " ".join(m.group(1).split())
            d = re.sub(r"^⚠️\s*", "", d)
            if len(d) > 8:
                return d[:400]
    return ""


def execution(w):
    t = tout_le_texte(w)
    if re.search(r"responseCode\"?\s*:\s*\"?202", t) or "callback_url" in t or "callbackUrl" in t:
        return "async"
    return "sync"


def scope(w):
    champs = set(champs_du_corps(w))
    t = tout_le_texte(w)
    s = []
    if "guild_id" in champs or "guildId" in t:
        s.append("guild")
    if champs & {"tenant_id", "project_id"}:
        s.append("tenant")
    if champs & {"user_id", "oauth_token", "access_token", "google_access_token",
                 "imap_username", "student_id"}:
        s.append("user")
    return "|".join(s) if s else "public"


def requires(w):
    """Les préalables LUS dans le code : jeton de compte, clé de fournisseur, entrée."""
    champs = set(champs_du_corps(w))
    t = tout_le_texte(w)
    r = []
    if champs & {"oauth_token", "access_token", "google_access_token"}:
        r.append("compte Google connecté (jeton dans le corps)")
    if champs & {"imap_password", "imap_username"}:
        r.append("identifiants IMAP (fournis par api)")
    for p in sorted(set(re.findall(r"api_keys\.([a-z_]+)", t))):
        r.append(f"clé fournisseur {p} (plugin_context.api_keys.{p})")
    if champs & {"file_id", "folder_id", "document", "file_url", "image_url", "pdf_url",
                 "audio_url", "video_url", "url"}:
        r.append("fichier ou URL en entrée")
    for m in sorted(set(re.findall(r"errors\.push\(\s*['\"]([^'\"]{3,70})['\"]", t)))[:4]:
        r.append(f"validé: {m}")
    return " ; ".join(r)


def result_kind_et_livraison(w):
    """Le type rendu et la voie de livraison — ou VIDE si ce n'est pas déductible.

    ⚠️ LA RÉPONSE EST OPAQUE DANS LA MAJORITÉ DES CAS. 90 % des répondeurs font
    `JSON.stringify($json)` : le corps réel est bâti dans un nœud Code en amont, et
    lire le répondeur n'apprend RIEN. Une première version cherchait des mots dans tout
    le workflow : elle classait `pdf-ocr` et `mathpix` en `image` — deux outils qui
    rendent du TEXTE — parce que l'image était leur ENTRÉE.

    On ne reconnaît donc que des CLÉS DE SORTIE nommées, posées par le code. Si aucune
    ne ressort, on laisse VIDE : un `image` faux est plus coûteux qu'une case vide, et
    c'est à l'équipe qui connaît l'outil de la remplir.
    """
    t = tout_le_texte(w)
    code = " ".join((n.get("parameters") or {}).get("jsCode") or "" for n in noeuds(w))
    expr = " ".join(str((n.get("parameters") or {}).get("responseBody") or "")
                    for n in noeuds(w) if n.get("type") == "n8n-nodes-base.respondToWebhook")
    sortie = code + " " + expr

    # ⚠️ `responseFormat: file` SUR UN NŒUD HTTP décrit un TÉLÉCHARGEMENT D'ENTRÉE,
    # pas une réponse binaire. `audio-transcription` récupère l'audio à transcrire par
    # ce moyen et ressortait « livraison: binaire » alors qu'il rend du texte en JSON.
    # Seul le RÉPONDEUR décide de la livraison.
    rend_fichier = any(n.get("type") == "n8n-nodes-base.respondToWebhook"
                       and (n.get("parameters") or {}).get("respondWith") in ("binary", "file")
                       for n in noeuds(w))
    binaire = rend_fichier

    # Clés de SORTIE, par ordre de spécificité. `image_url` est volontairement ABSENT :
    # il désigne aussi bien l'image reçue en entrée (mesuré sur mathpix et pdf-ocr).
    # ⚠️ D'ABORD LE SERVICE APPELÉ, et c'est la seule règle vraiment fiable.
    # Un OCR produit du TEXTE depuis une image ; une génération d'image produit une
    # IMAGE depuis du texte. Les CLÉS ne permettent pas de les distinguer : `pdf-ocr` et
    # `audio-transcription` portent `image_base64` et `audio_base64` en ENTRÉE, et
    # ressortaient donc classés « image » et « audio » — l'inverse de ce qu'ils rendent.
    # Le point d'accès, lui, dit le sens de la transformation.
    SERVICES = [
        ("text", r"/v1/ocr|/v3/text|/v3/pdf|/transcriptions|vision\.googleapis|"
                 r"documentai|/v1/messages|/chat/completions|/v1/responses|"
                 r"generativelanguage.*generateContent"),
        ("image", r"/images/generations|quickchart\.io|geminiImage"),
        ("audio", r"/audio/speech|elevenlabs|openAi.*audio"),
        ("video", r"veoVideo|aiplatform.*publishers/google/models/veo"),
        ("file", r"gotenberg|/forms/chromium|render-pdf"),
    ]
    types_noeuds = " ".join(str(n.get("type", "")) for n in noeuds(w))
    urls_brutes = " ".join(u for _, u in urls(w)) + " " + types_noeuds
    for nom, motif in SERVICES:
        if re.search(motif, urls_brutes, re.I):
            # ⚠️ Un outil peut appeler PLUSIEURS services (pdf-ocr : Mistral OCR ET
            # Mathpix ; les deux rendent du texte). Le premier qui correspond dans
            # l'ordre ci-dessus gagne, et l'ordre place le TEXTE en tête parce qu'une
            # chaîne d'extraction cite presque toujours un modèle de langage ensuite.
            kind_service = nom
            break
    else:
        kind_service = ""

    CLES = [
        ("audio", r"\b(audio_base64|audio_url|audio_content|speech_base64)\s*[:=]"),
        ("video", r"\b(video_base64|video_url|video_uri|gcs_uri)\s*[:=]"),
        ("image", r"\b(b64_json|image_base64|chart_url|generated_image|image_data)\s*[:=]"),
        ("file", r"\b(pdf_base64|pdf_url|epub_base64|file_base64|download_url)\s*[:=]"),
        ("text", r"\b(translation|transcription|summary|markdown|latex|answer|"
                 r"generated_text|full_translation|raw_markdown)\s*[:=]"),
    ]
    kind = kind_service
    if not kind:
        for nom, motif in CLES:
            if re.search(motif, sortie, re.I):
                kind = nom
                break
    if not kind:
        if rend_fichier or binaire:
            kind = "file"
        elif any(n.get("type") == "n8n-nodes-base.respondToWebhook" for n in noeuds(w)):
            # Un répondeur JSON sans clé reconnue rend une structure : `data` est le
            # plus honnête qu'on puisse dire sans ouvrir l'outil.
            kind = "data"

    liv = ""
    if rend_fichier:
        liv = "binaire"
    # ⚠️ Une `data:` URI dans le code est le plus souvent une ENTRÉE acceptée (c'est le
    # cas de mathpix et pdf-ocr, qui reçoivent l'image ainsi). On n'en déduit une
    # livraison que si le RÉPONDEUR lui-même en construit une.
    elif re.search(r"data:(image|audio|application)/", expr):
        liv = "data_uri"
    # Un résultat textuel ou structuré voyage dans le corps JSON, sauf URL explicite.
    elif kind in ("text", "data") and not re.search(
            r"\b(result_url|download_url|public_url|signed_url)\s*[:=]", sortie):
        liv = "inline"
    else:
        tiers = hotes_externes(w)
        rend_une_url = re.search(r"\b(chart_url|image_url|video_url|audio_url|public_url|"
                                 r"signed_url|result_url|download_url|status_url)\s*[:=]", sortie)
        # ⚠️ `url_tiers` exige que l'URL RENDUE désigne le tiers, pas seulement que le
        # workflow l'appelle. `document-translate-worker` ressortait `url_tiers` parce
        # qu'il appelle Anthropic, alors qu'il ne rend que NOS chemins de polling. Un
        # faux `url_tiers` ferait courir après une fuite inexistante — et banaliserait
        # la colonne au point d'en masquer une vraie.
        url_tierce = any(re.search(re.escape(h.split(" ")[0]), sortie) for h in tiers) if tiers else False
        if rend_une_url and url_tierce:
            liv = "url_tiers"
        elif rend_une_url:
            liv = "url_chat_api"
        elif kind:
            liv = "inline"
    return kind, liv


def irreversible(w):
    """Déduit des VERBES sortants. Une écriture chez un tiers ne se défait pas d'ici."""
    # ⚠️ D'ABORD les nœuds maison : ils n'ont pas d'URL, et ce sont EUX qui agissent
    # sur le compte de l'utilisateur. Les ignorer rendait `mcp-gmail` « inconnu ».
    lit_m, ecrit_m, inconnues_m = lectures_ecritures_maison(w)
    if ecrit_m:
        return "oui — opérations d'écriture sur le compte : " + ", ".join(ecrit_m[:8])
    if inconnues_m:
        return "à vérifier — opérations non classées : " + ", ".join(inconnues_m[:6])
    if lit_m:
        return "non (opérations de lecture seule : " + ", ".join(lit_m[:6]) + ")"

    par_m = methodes_sortantes(w)
    ecritures = {m: h for m, h in par_m.items() if m in ("POST", "PUT", "PATCH", "DELETE")}
    if not ecritures:
        return "non (aucun appel sortant en écriture)" if par_m else ""
    externes = set(hotes_externes(w))
    cibles = sorted({h for hs in ecritures.values() for h in hs if h in externes})
    # ⚠️ Un POST vers une API de GÉNÉRATION (LLM, image) n'écrit rien chez le client :
    # il consomme du quota. C'est un coût, pas une irréversibilité.
    # ⚠️ Envoyer un document à un OCR est un TRAITEMENT, pas une écriture chez le
    # client : rien n'y est créé qu'on ne puisse défaire. Mesuré : `pdf-ocr` ressortait
    # « irréversible — écrit chez eu.api.mathpix.com », ce qui est faux et aurait fait
    # classer un OCR au même rang qu'un envoi de courriel.
    # ⚠️ Cela ne dit rien de la CONFIDENTIALITÉ : les données sortent bel et bien du
    # périmètre, et c'est la colonne `sort_du_perimetre` qui le porte.
    generation = {"api.anthropic.com", "api.openai.com", "generativelanguage.googleapis.com",
                  "api.mistral.ai", "api.deepseek.com", "quickchart.io",
                  "eu.api.mathpix.com", "api.mathpix.com", "api.elevenlabs.io",
                  "aiplatform.googleapis.com"}
    ecrit_client = [c for c in cibles if c not in generation]
    if ecrit_client:
        return "oui — écrit chez : " + ", ".join(ecrit_client)
    if cibles:
        return "non (appels sortants = génération, pas d'écriture chez l'utilisateur)"
    return "à vérifier — écriture vers une cible en expression"


def limites_entree(w):
    """Bornes LUES dans le code : tailles, pages, plafonds de liste, formats."""
    t = tout_le_texte(w)
    bornes = []
    for motif, modele in (
        (r"max_files[^0-9]{0,12}(\d+)", "max_files={}"),
        (r"(?:maxSize|max_size|MAX_SIZE)[^0-9]{0,12}(\d+)", "taille_max={}"),
        (r"(?:max_pages|pages_max|totalPages\s*>\s*)(\d+)", "pages_max={}"),
        (r"maxValue:\s*(\d+)", "limite_max={}"),
        (r"(?:max_tokens)\"?\s*:\s*(\d+)", "max_tokens={}"),
        (r"max_results[^0-9]{0,12}(\d+)", "max_results={}"),
    ):
        for v in sorted(set(re.findall(motif, t)), key=lambda x: -int(x))[:1]:
            bornes.append(modele.format(v))
    fmts = sorted(set(re.findall(r"\b(pdf|docx|xlsx|pptx|png|jpe?g|webp|mp3|wav|m4a|mp4|csv|html|epub)\b",
                                 t, re.I)))
    if fmts:
        bornes.append("formats cités: " + ",".join(f.lower() for f in fmts[:10]))
    return " ; ".join(bornes)


def cout(w):
    """L'UNITÉ et le fournisseur, jamais un prix : n8n n'a aucun barème."""
    t = tout_le_texte(w)
    parts = []
    mods, _ = modeles_llm(w)
    if re.search(r"api\.(anthropic|openai|mistral|deepseek)\.com|generativelanguage", t):
        parts.append("jetons (1000 jetons)" + (f" — modèle(s): {','.join(mods[:3])}" if mods else ""))
    for h, unite in (("mathpix", "page"), ("quickchart", "appel"),
                     ("googleapis.com/youtube", "quota YouTube (unités)"),
                     ("elevenlabs", "caractère"), ("api.lichess", "appel")):
        if h in t:
            parts.append(f"{unite} ({h})")
    if not parts:
        return ""
    return " ; ".join(dict.fromkeys(parts))


# ═══ FAMILLES ═════════════════════════════════════════════════════════════════
MOTEURS_RECHERCHE = ("serpapi", "serper", "brave", "tavily", "bing", "duckduckgo",
                     "customsearch", "semanticscholar", "arxiv", "crossref", "newsapi",
                     "gnews", "openalex")


def familles(w, kind, exec_mode, nom_outil):
    t = tout_le_texte(w)
    f = []
    if re.search(r"api\.(anthropic|openai|mistral|deepseek)\.com|generativelanguage", t):
        f.append("llm")
    if any(m in t for m in MOTEURS_RECHERCHE) or re.search(r"customsearch|/search\b", t):
        f.append("recherche")
    # ⚠️ RESSERRÉ : un `re.search("extract")` sur tout le JSON classait 51 outils sur
    # 110 en « extraction », simplement parce qu'un commentaire ou un nom de variable
    # contenait le mot. Une famille qui attrape la moitié du parc ne renseigne rien.
    # Il faut DEUX indices : un service d'extraction appelé OU un nom d'outil explicite,
    # ET une entrée de type fichier ou URL.
    service_extraction = bool(re.search(
        r"mathpix|/ocr|ocr/|textract|vision|documentai|whisper|transcriptions|"
        r"pdf-extractor|image-ocr|unstructured", t, re.I))
    nom_extraction = bool(re.search(
        r"(ocr|extract|docx|office|html|csv|table|pdf|transcri|structure)", nom_outil, re.I))
    entree_fichier = bool(set(champs_du_corps(w)) & {
        "file_id", "folder_id", "file_url", "image_url", "pdf_url", "audio_url",
        "video_url", "document", "data", "url", "content", "base64", "file"})
    if (service_extraction or nom_extraction) and entree_fichier:
        f.append("extraction")
    # `file` seul sur-déclenche (toute réponse binaire). On exige une PRODUCTION.
    produit_media = bool(re.search(r"gotenberg|render-pdf|images/generations|veo|"
                                   r"text-to-speech|tts|quickchart|generate", t, re.I))
    if kind in ("image", "audio", "video") or (kind == "file" and produit_media):
        f.append("media")
    if set(champs_du_corps(w)) & {"oauth_token", "access_token", "google_access_token",
                                  "imap_password"}:
        f.append("connecteur")
    if exec_mode == "async":
        f.append("asynchrone")
    return f or ["autre"]


def champs_extraction(w):
    t = tout_le_texte(w)
    fmts = sorted(set(re.findall(r"\b(pdf|docx|xlsx|pptx|png|jpe?g|webp|mp3|wav|m4a|mp4|csv|html)\b",
                                 t, re.I)))
    langues = sorted(set(re.findall(r"['\"](?:fr|en|he|ar|es|de|it|pt|ru|zh)['\"]", t)))
    return {
        "accepte": ",".join(f.lower() for f in fmts[:12]),
        "taille_max_pages_max": limites_entree(w).split(" ; formats")[0] or "",
        "langues": ",".join(l.strip("'\"") for l in langues[:12]),
        # `perd` et `sortie_tronquee` ne se déduisent pas du code : savoir qu'un OCR
        # abandonne la mise en page demande de comparer entrée et sortie sur un vrai
        # document. À remplir après mesure, pas par supposition.
        "perd": "",
        "sortie_tronquee": "oui (max_tokens posé)" if re.search(r"max_tokens", t) else "",
    }


def champs_recherche(w):
    t = tout_le_texte(w)
    nb = re.findall(r"(?:num|count|limit|max_results|numResults)\"?\s*[:=]\s*\"?(\d+)", t)
    return {
        "nb_resultats": max(nb, key=lambda x: int(x)) if nb else "",
        "cite_ses_sources": "oui" if re.search(r"\burl\b|\blink\b|source", t, re.I) else "",
        "fraicheur": "paramétrable" if re.search(r"dateRestrict|freshness|sortBy|published", t) else "",
        "langue_zone": "paramétrable" if re.search(r"\b(hl|gl|lr|country|language)\b", t) else "",
        "cache": "aucun cache dans le workflow" if "cache" not in t.lower() else "",
    }


def champs_media(w, kind):
    t = tout_le_texte(w)
    # ⚠️ On ne lit QUE les tailles de la forme NNNxNNN, qui sont des valeurs déclarées
    # (listes de tailles acceptées). Un `width: 600` isolé peut être une coordonnée de
    # nœud dans l'éditeur — mesuré : `position: [1140, 240]` passait pour une dimension.
    dims = sorted(set(re.findall(r"\b(\d{3,4}x\d{3,4})\b", t)))
    if not dims:
        dims = sorted(set(re.findall(r"\b(\d+:\d+)\b", t)))[:4]  # ratios type 16:9
    fmts = sorted(set(re.findall(r"\b(png|jpe?g|webp|svg|mp3|wav|mp4|pdf|epub)\b", t, re.I)))
    voix = sorted(set(re.findall(r"voice\"?\s*:\s*[\'\"]([a-zA-Z\-]{3,})[\'\"]", t)))
    types = sorted(set(re.findall(r"\b(bar|line|pie|doughnut|radar|polarArea)\b", t)))
    _, liv = result_kind_et_livraison(w)
    return {
        "dimensions_duree": ",".join(dims[:6]),
        "formats_sortie": ",".join(f.lower() for f in fmts[:8]),
        "recuperation": {"url_tiers": "public (URL tiers)", "data_uri": "usage_unique (data URI)",
                         "binaire": "flux", "url_chat_api": "jeton_chat_api",
                         "inline": "inline"}.get(liv, ""),
        # La durée de vie d'une URL tiers n'est pas dans notre code : elle est fixée par
        # le fournisseur. Ne pas l'inventer.
        "duree_de_vie": "1 h (dépôt interne)" if "document-result" in t else "",
        "choix_disponibles": ",".join((voix + types)[:8]),
        "droit_usage": "",
    }


def champs_connecteur(w):
    t = tout_le_texte(w)
    champs = set(champs_du_corps(w))
    scopes = sorted(set(re.findall(r"(https://www\.googleapis\.com/auth/[a-z.\-]+)", t)))
    # Les opérations maison d'abord : c'est là que vit l'action réelle du connecteur.
    lit_m, ecrit_m, inconnues_m = lectures_ecritures_maison(w)
    par_m = methodes_sortantes(w)
    lit = lit_m or sorted({h for h in par_m.get("GET", []) if not HOTES_INTERNES.search(h)})
    ecrit = ecrit_m or sorted({h for m in ("POST", "PUT", "PATCH", "DELETE") for h in par_m.get(m, [])
                               if not HOTES_INTERNES.search(h)})
    if inconnues_m:
        ecrit = ecrit + [f"(non classées: {','.join(inconnues_m[:4])})"]
    compte = ""
    if champs & {"oauth_token", "access_token", "google_access_token"}:
        compte = "Google (jeton OAuth dans le corps — BYOT)"
    elif "imap_password" in champs:
        compte = "boîte IMAP (identifiants dans le corps — BYOT)"
    return {
        "compte_requis": compte,
        # ⚠️ Les scopes ne sont PAS dans nos workflows : le jeton arrive déjà émis par
        # chat.api, qui seul connaît les scopes demandés au consentement. Vide ici est
        # la vérité ; les remplir au jugé tromperait sur ce que l'outil peut faire.
        "scopes": ",".join(s.rsplit("/", 1)[-1] for s in scopes) if scopes else "",
        "lit": ",".join(lit[:10]),
        "ecrit": ",".join(ecrit[:10]),
        "quota": "",
        "portee_des_donnees": "le compte que le jeton désigne (aucun sélecteur de compte dans le corps)"
        if compte.startswith("Google") else ("la boîte désignée par imap_server/imap_username"
                                             if compte else ""),
    }


def champs_llm(w):
    t = tout_le_texte(w)
    mods, pilotable = modeles_llm(w)
    entree = re.findall(r"max_tokens\"?\s*:\s*(\d+)", t)
    forme = ""
    if re.search(r"response_format|json_object|JSON valide|UNIQUEMENT en JSON", t, re.I):
        forme = "JSON"
    elif re.search(r"markdown", t, re.I):
        forme = "Markdown"
    elif mods:
        forme = "prose"
    temps = sorted(set(re.findall(r"temperature\"?\s*:\s*([0-9.]+)", t)))
    stable = ""
    if temps:
        stable = ("oui (temperature=0)" if all(float(x) == 0 for x in temps)
                  else f"non (temperature={','.join(temps)})")
    elif mods:
        stable = "non (temperature par défaut du fournisseur)"
    return {
        "modele": ",".join(mods[:3]) + (" (pilotable par le corps)" if pilotable else ""),
        "entree_max": f"max_tokens={max(entree, key=lambda x: int(x))}" if entree else "",
        "forme_de_sortie": forme,
        "stable": stable,
    }


def champs_async(w):
    t = tout_le_texte(w)
    return {
        "suivi": ("document-job-status" if "document-job-status" in t
                  else ("job-status" if "job-status" in t or "job_status" in t else "")),
        "annulable": "document-cancel" if "document-cancel" in t else "",
        "duree_de_vie_du_resultat": "1 h" if "document-result" in t else "",
        # L'idempotence demande de rejouer le MÊME appel et de comparer. Pas déductible.
        "idempotent": "",
    }


# ═══ ASSEMBLAGE ═══════════════════════════════════════════════════════════════
def fiche(outil, w, cum):
    wh = next((n for n in w["nodes"] if n.get("type") == "n8n-nodes-base.webhook"
               and (n.get("parameters") or {}).get("path") == outil), None)
    # ⚠️ `httpMethod` absent = AMBIGU, pas « GET ». 23 webhooks actifs ne le posent pas,
    # et notre propre outillage se contredit sur le défaut (n8n_api.py dit GET en deux
    # endroits, POST en trois — dont celui qui alimente le registre publié). On le
    # signale au lieu de trancher à la place de n8n.
    methode = (wh.get("parameters") or {}).get("httpMethod") if wh else None
    kind, liv = result_kind_et_livraison(w)
    exec_mode = execution(w)
    fams = familles(w, kind, exec_mode, outil)
    plafond = plafond_secondes(w)
    tiers = hotes_externes(w)

    r = {c: "" for c in COLONNES}
    r.update({
        "outil": outil,
        "workflow": w["name"],
        "methode": methode or "(non posé — ambigu)",
        "famille": "|".join(fams),
        "description": description(w),
        "execution": exec_mode,
        # ⚠️ VIDE À DESSEIN : 231 arbitrations appartiennent à Franck (azy.daily#642).
        "surfaces": "",
        "scope": scope(w),
        "requires": requires(w),
        "result_kind": kind,
        "livraison": liv,
        "estimated_time": f"<= {plafond} s (plafond des timeouts)" if plafond else "",
        "cout": cout(w),
        "irreversible": irreversible(w),
        "limites_entree": limites_entree(w),
        "sort_du_perimetre": ("oui — " + ", ".join(tiers)) if tiers else "non (aucun hôte tiers appelé)",
        "executions_41j": cum.get(outil, ""),
    })
    if "extraction" in fams:
        r.update(champs_extraction(w))
    if "recherche" in fams:
        r.update(champs_recherche(w))
    if "media" in fams:
        r.update(champs_media(w, kind))
    if "connecteur" in fams:
        r.update(champs_connecteur(w))
    if "llm" in fams:
        r.update(champs_llm(w))
    if "asynchrone" in fams:
        r.update(champs_async(w))
    # Combien de cases ce que nous savons remplit-il réellement ? Chiffre honnête,
    # qui rend visible ce qui reste à décider ou à mesurer.
    pertinents = SOCLE + [c for f in fams if f in SPECIFIQUES for c in SPECIFIQUES[f]]
    r["champs_renseignes"] = f"{sum(1 for c in pertinents if r[c])}/{len(pertinents)}"
    return r


def main():
    outils = [l.strip() for l in open(LISTE, encoding="utf-8") if l.strip() and not l.startswith("#")]
    tous = tous_les_workflows()
    cum = executions_par_outil()
    par_chemin = {}
    for w in tous:
        if not w.get("active") or w.get("isArchived"):
            continue
        for n in w.get("nodes", []):
            if n.get("type") == "n8n-nodes-base.webhook":
                p = (n.get("parameters") or {}).get("path")
                if p:
                    par_chemin.setdefault(str(p), w)

    lignes, absents = [], []
    for o in outils:
        w = par_chemin.get(o)
        if w is None:
            absents.append(o)
            continue
        lignes.append(fiche(o, w, cum))

    SORTIE.mkdir(parents=True, exist_ok=True)
    cible = SORTIE / "fiche-outils-production.csv"
    with open(cible, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Fiche des outils de production — 43 informations (azy.daily#642). "
                 "Généré par scripts/catalogue/generer_fiche_outils.py depuis l'INSTANCE llm.\n")
        fh.write("# Une case VIDE signifie « non mesurable depuis le code » ou « en attente "
                 "d'arbitrage » — JAMAIS une valeur devinée. Voir fiche-outils-README.md.\n")
        wr = csv.DictWriter(fh, fieldnames=COLONNES)
        wr.writeheader()
        wr.writerows(lignes)

    print(f"   {len(lignes)} outils décrits → {cible}")
    if absents:
        print(f"   ⚠️ {len(absents)} outil(s) sans webhook actif sur llm : {', '.join(absents)}")
    # Taux de remplissage par colonne : ce qui est vide est ce qui reste à faire.
    print("\n   remplissage par colonne (sur les outils concernés) :")
    for c in SOCLE:
        n = sum(1 for l in lignes if l[c])
        print(f"     {c:22} {n:3}/{len(lignes)}")
    for f, cols in SPECIFIQUES.items():
        concernes = [l for l in lignes if f in l["famille"].split("|")]
        if not concernes:
            continue
        print(f"     ── {f} ({len(concernes)} outils)")
        for c in cols:
            n = sum(1 for l in concernes if l[c])
            print(f"        {c:22} {n:3}/{len(concernes)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
