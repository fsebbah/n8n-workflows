#!/usr/bin/env python3
"""Produit le document d'exposition des outils n8n — azy.daily#642.

    python3 scripts/catalogue/generer_doc_exposition.py

Écrit `docs/catalogue/outils-exposition.md` : les 237 outils du catalogue, avec
une proposition d'exposition et les FAITS qui la motivent, pour que chaque équipe
se positionne.

Le besoin (Franck, 2026-11-08) : « Nous avons besoin des outils de production, pas
d'administration. » Il faut donc séparer ce qui sert un utilisateur final de ce qui
sert à exploiter la plateforme.

⚠️ CE DOCUMENT PROPOSE, IL NE DÉCIDE PAS
La colonne `exposition` est une proposition classée par un signal observable, et
chaque ligne porte le fait qui l'a produite. Une équipe peut contester une classe
entière en une phrase — c'est le but. Les cas réellement ambigus sont marqués
« À TRANCHER » plutôt que rangés d'autorité dans un camp.

⚠️ ET LE DOCUMENT NE PARLE PAS DE SÉCURITÉ
Mesuré : 236 des 237 webhooks n'ont AUCUNE authentification, 1 seul vérifie une
signature entrante, et 117 lisent une identité autodéclarée non vérifiée. Décider
de ne PAS exposer un outil le retire des propositions faites à un agent ; ça ne
l'empêche pas d'être déclenché par quiconque atteint le port. Les deux questions
sont distinctes et ce document ne traite que la première.
"""

import collections
import csv
import importlib.util
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]

# On réutilise le générateur de CSV plutôt que d'écrire un SECOND producteur de
# descriptions : deux implémentations divergeraient, et un lecteur ne saurait plus
# laquelle il a sous les yeux.
_spec = importlib.util.spec_from_file_location(
    "gen_csv", Path(__file__).resolve().parent / "generer_csv_catalogue.py")
_gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_gen)
SORTIE = RACINE / "docs" / "catalogue" / "outils-exposition.md"
RELEVE = "llm.local:/storage4/releve/executions.csv"


def config():
    env = {}
    for ligne in open(RACINE / ".env.local"):
        ligne = ligne.strip()
        if "=" in ligne and not ligne.startswith("#"):
            cle, val = ligne.split("=", 1)
            env[cle] = val.strip().strip('"').strip("'")
    return env


def actifs(env):
    base = env["N8N_API_URL"].rstrip("/")
    ent = {"X-N8N-API-KEY": env["N8N_API_KEY"]}
    tous, cur = [], None
    while True:
        url = f"{base}/workflows?active=true&limit=250" + (f"&cursor={cur}" if cur else "")
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=ent), timeout=60))
        tous += d["data"]
        cur = d.get("nextCursor")
        if not cur:
            return tous


def trafic():
    local = Path("/tmp") / "releve_exposition.csv"
    r = subprocess.run(["scp", "-o", "ConnectTimeout=10", RELEVE, str(local)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(f"⚠️  recensement inaccessible : colonnes de trafic à 0", file=sys.stderr)
        return collections.Counter(), 0
    cum = collections.Counter()
    jours = set()
    for l in csv.DictReader(open(local)):
        jours.add(l["date"])
        try:
            cum[l["tool"]] += int(l["executions"] or 0)
        except (ValueError, KeyError):
            pass
    return cum, len(jours)


# ── Les classes de NON-exposition, par ordre de PRÉCÉDENCE ────────────────────
# L'ordre compte : `stripe-webhook` est un callback entrant avant d'être de
# l'administration, et `jobs/user-cleanup` est un cron avant d'appeler /admin/.
def classer(chemin, w, appelants, brut):
    if appelants:
        return ("NON", "plomberie",
                "appelé par " + ", ".join(sorted(appelants)[:2]))
    if "callback" in chemin or chemin == "stripe-webhook":
        return ("NON", "callback entrant", "un service externe nous appelle")
    if re.search(r"oauth|auth-start|auth-callback", chemin):
        return ("NON", "oauth / redirect", "redirection de navigateur, pas un outil")
    if re.search(r"^jobs/|sync-status|-sync$|cleanup", chemin):
        return ("NON", "cron / sync", "déclenché par une horloge")
    if re.search(r"^config/|plugin-config|branding|get-prompts", chemin):
        return ("NON", "configuration", "lit ou écrit de la configuration")
    if re.search(r"^notif-|^alert-|notify|credits/exhausted", chemin):
        return ("NON", "notification émise", "le système émet, personne n'appelle")
    if re.search(r"embedder|tokenizer|vector-store|qdrant-|enricher|metadata-extractor"
                 r"|tenant-resolve|request-validator|cost-calculator", chemin):
        return ("NON", "brique technique", "composant interne, jamais choisi par un agent")
    # Administration : provisionne, enregistre des secrets, ou pilote un /admin/.
    admin = "/admin" in brut
    if re.search(r"stripe-register|register-if-needed|tenant/settings|dataset/generate", chemin):
        return ("NON", "administration", "provisionne ou configure la plateforme")
    if admin:
        return ("À TRANCHER", "administration ?",
                "appelle un endpoint /admin/ mais sert peut-être un utilisateur")
    if chemin == "create-free-subscriber":
        return ("À TRANCHER", "administration ?",
                "provisionne un abonné : inscription utilisateur ou acte d'admin ?")
    return ("OUI", "production", "sert un utilisateur final")


MUTE = re.compile(r"/(create|update|delete|remove|save|add|debit|refund|checkout"
                  r"|cancel|register|persist|ingest|revoke|reset|sync)\b", re.I)


def effets(w):
    """Les appels réellement MUTANTS — verbe ET chemin, jamais le simple POST.

    ⚠️ Beaucoup de nos lectures sont en POST (`torah-get-page` par exemple).
    Compter les POST donnait 148 mutations au lieu de 38, et c'était faux.
    """
    out = []
    for n in w.get("nodes", []):
        pm = n.get("parameters", {})
        u = pm.get("url")
        if not isinstance(u, str):
            continue
        m = (pm.get("method") or "GET").upper()
        propre = re.sub(r"\{\{.*?\}\}", "…", u)
        if m == "DELETE":
            out.append("DELETE")
        elif m in ("POST", "PUT", "PATCH") and MUTE.search(u):
            out.append("écrit")
        elif "discord.com/api" in propre and m != "GET":
            out.append("poste sur Discord")
    return sorted(set(out))


def main():
    env = config()
    cum, jours = trafic()
    tous = actifs(env)

    cat = {}
    for w in tous:
        if "Registry" in w["name"]:
            continue
        whs = [n for n in w.get("nodes", []) if n["type"] == "n8n-nodes-base.webhook"]
        if not whs:
            continue
        p = whs[0]["parameters"].get("path") or whs[0].get("webhookId") or ""
        if not str(p).startswith("torah-corpus"):
            cat[str(p)] = (w, whs[0])

    # Qui appelle qui, d'après le dépôt (plancher : un appel venu de MCP ou
    # chat.api n'y figure pas).
    appelants = collections.defaultdict(set)
    for f in (RACINE / "workflows").iterdir():
        if f.suffix != ".json":
            continue
        try:
            wf = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        s = json.dumps(wf, ensure_ascii=False)
        nom = wf.get("name")
        for p in cat:
            if re.search(r"/webhook/" + re.escape(p) + r"(?![\w-])", s) and nom and nom != cat[p][0]["name"]:
                appelants[p].add(nom)

    lignes = []
    for p, (w, wh) in cat.items():
        brut = json.dumps(w, ensure_ascii=False)
        sticky = next((n["parameters"].get("content", "")
                       for n in w.get("nodes", []) if n["type"] == "n8n-nodes-base.stickyNote"), "")
        # ⚠️ Chaque outil DOIT porter une explication : on ne peut pas se positionner
        # sur un outil dont personne ne sait ce qu'il fait. 184 sur 239 n'ont aucune
        # `**Description:**` — à défaut, on DÉDUIT du code, et on le dit.
        m = re.search(r"\*\*Description[:\s]*\*\*\s*\n?([^\n*]+)", sticky, re.I)
        if m and m.group(1).strip():
            desc, source = m.group(1).strip(), "lue"
        else:
            desc = _gen.jet_description(w, p, _gen.services_appeles(w)).replace("JET — ", "")
            source = "déduite"
        ms = re.search(r"\*\*Surfaces:\*\*\s*([^\n*]+)", sticky, re.I)
        exp, classe, motif = classer(p, w, appelants[p], brut)
        lignes.append({
            "outil": p,
            "workflow": w["name"],
            "methode": wh["parameters"].get("httpMethod") or "POST",
            "exposition": exp,
            "classe": classe,
            "motif": motif,
            "description": desc,
            "description_source": source,
            "effets": ", ".join(effets(w)) or "lecture seule",
            "auth": wh["parameters"].get("authentication") or "aucune",
            "mode": "callback" if "callback_url" in brut else "synchrone",
            "surfaces": ms.group(1).strip() if ms else "",
            "exec": cum.get(p, 0),
        })
    lignes.sort(key=lambda l: (l["exposition"] != "OUI", l["exposition"] != "À TRANCHER",
                               -l["exec"], l["outil"]))

    par_exp = collections.Counter(l["exposition"] for l in lignes)
    par_classe = collections.Counter(l["classe"] for l in lignes)
    sans_auth = sum(1 for l in lignes if l["auth"] == "aucune")
    mutants = [l for l in lignes if l["effets"] != "lecture seule"]
    sans_desc = sum(1 for l in lignes if l["description_source"] == "déduite")

    d = []
    a = d.append
    a("# Outils n8n — proposition d'exposition")
    a("")
    a("> Document pour **azy.daily#642**. Généré par "
      "`scripts/catalogue/generer_doc_exposition.py`, régénérable.")
    a("")
    a(f"**{len(lignes)} outils** publiés au catalogue `mcp/tools/registry`. "
      f"Trafic cumulé sur **{jours} relevés quotidiens**.")
    a("")
    a("## Ce que ce document fait, et ne fait pas")
    a("")
    a("La colonne **exposition** est une **proposition**, classée par un signal "
      "observable, et chaque ligne porte le fait qui l'a produite. "
      "**Une équipe peut contester une classe entière en une phrase** — c'est le but. "
      "Les cas réellement ambigus sont marqués `À TRANCHER` plutôt que rangés d'autorité.")
    a("")
    a("⚠️ **Ce document ne parle pas de sécurité.** Décider de ne pas exposer un outil "
      "le retire des propositions faites à un agent ; **ça ne l'empêche pas d'être "
      "déclenché** par quiconque atteint le port. Mesuré :")
    a("")
    a("```")
    a(f"authentification sur le nœud Webhook     {sans_auth} / {len(lignes)} sans aucune")
    a( "vérification d'une signature entrante    1  (youtube-extract, et c'est tout)")
    a( "identité lue dans le corps, NON vérifiée 117 / 237  (user_id, guild_id, tenant_id)")
    a("```")
    a("")
    a("Les deux questions — *que proposer* et *qui peut déclencher* — sont distinctes. "
      "Ce document ne traite que la première.")
    a("")
    a("## Proposition, en un coup d'œil")
    a("")
    a("| exposition | n |")
    a("|---|---:|")
    for e in ("OUI", "À TRANCHER", "NON"):
        a(f"| **{e}** | {par_exp[e]} |")
    a("")
    a("### Détail des `NON`")
    a("")
    a("| classe | n | pourquoi |")
    a("|---|---:|---|")
    motifs = {}
    for l in lignes:
        if l["exposition"] == "NON":
            motifs.setdefault(l["classe"], l["motif"])
    for c, n in par_classe.most_common():
        if c in motifs:
            a(f"| {c} | {n} | {motifs[c]} |")
    a("")
    a("## Ce qu'il faut savoir avant de se positionner")
    a("")
    a(f"- **{len(mutants)} outils effectuent un appel réellement mutant** — jugé sur le "
      "verbe **et** un chemin de mutation, jamais sur le simple POST. "
      "*(Beaucoup de nos lectures sont en POST : compter les POST donnait 148 et c'était faux.)*")
    a(f"- ⚠️ **{sans_desc} outils sur {len(lignes)} n'ont aucune description écrite.** "
      "Leur explication ci-dessous est **déduite du code** (services appelés, étapes) et "
      "marquée *(déduite)*. Elle décrit la **mécanique**, pas l'**intention** — à relire par "
      "l'équipe qui connaît l'outil. C'est le vrai obstacle du chantier : on ne peut pas "
      "décider d'exposer un outil dont personne ne sait ce qu'il fait.")
    a("- ⚠️ **Je ne peux pas dire lesquels exigent un secret de l'appelant.** Quatre tentatives, "
      "quatre résultats faux : `subscription-checkout-create` lit sa clé Stripe dans "
      "`$json.stripe_key` (donc BYOT) et aucune détection ne l'a vu. Un examen du JSON d'un "
      "workflow ne dit pas ce qui est **vérifié**. **Question ouverte pour api :** pour chaque "
      "appel mutant, votre backend exige-t-il quelque chose ?")
    a("")
    a("## Les outils proposés à l'exposition")
    a("")
    a("| outil | méth. | ce qu'il fait | effets | mode | surfaces | exéc. |")
    a("|---|---|---|---|---|---|---:|")
    for l in lignes:
        if l["exposition"] != "OUI":
            continue
        d_ = l["description"].replace("|", "\\|")[:150]
        if l["description_source"] == "déduite":
            d_ += " *(déduite)*"
        a(f"| `{l['outil']}` | {l['methode']} | {d_} | {l['effets']} | {l['mode']} | "
          f"{l['surfaces'] or '—'} | {l['exec']} |")
    a("")
    a("## ⚠️ À trancher")
    a("")
    a("| outil | ce qu'il fait | pourquoi c'est ambigu | exéc. |")
    a("|---|---|---|---:|")
    for l in lignes:
        if l["exposition"] == "À TRANCHER":
            d_ = l["description"].replace("|", "\\|")[:130]
            if l["description_source"] == "déduite":
                d_ += " *(déduite)*"
            a(f"| `{l['outil']}` | {d_} | {l['motif']} | {l['exec']} |")
    a("")
    a("## Les outils proposés à la NON-exposition")
    a("")
    a("<details><summary>Déplier la liste complète</summary>")
    a("")
    a("| outil | classe | ce qu'il fait | motif | effets | exéc. |")
    a("|---|---|---|---|---|---:|")
    for l in lignes:
        if l["exposition"] != "NON":
            continue
        d_ = l["description"].replace("|", "\\|")[:110]
        if l["description_source"] == "déduite":
            d_ += " *(déduite)*"
        a(f"| `{l['outil']}` | {l['classe']} | {d_} | {l['motif'][:48]} | {l['effets']} | {l['exec']} |")
    a("")
    a("</details>")
    a("")
    a("---")
    a("")
    a("— équipe n8n")
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text("\n".join(d) + "\n", encoding="utf-8")
    print(f"  {SORTIE.relative_to(RACINE)}  —  {len(d)} lignes de markdown")
    print(f"  exposition : " + " · ".join(f"{e} {par_exp[e]}" for e in ("OUI", "À TRANCHER", "NON")))
    print(f"  {len(mutants)} mutants · {sans_desc} sans description · {sans_auth} sans auth")


if __name__ == "__main__":
    main()
