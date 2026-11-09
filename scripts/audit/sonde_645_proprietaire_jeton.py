#!/usr/bin/env python3
"""Sonde azy.daily#645 — à QUI appartient le jeton, et n8n altère-t-il la réponse ?

CONTEXTE
  Franck a reçu, via chat.api, un agenda appartenant à yael.allouch@gmail.com, et
  des courriels d'autres personnes. Les deux symptômes passent par les mêmes deux
  webhooks n8n : `mcp-calendar` et `mcp-gmail`.

CE QUE N8N FAIT, MESURÉ (lu dans les workflows et le code des nœuds) :
  `MCP - Google Calendar Server`  →  getAllCalendars  →  accessToken = {{ $json.body.access_token }}
  `MCP - Gmail Server (All-in-One)` → les 22 opérations →  accessToken = {{ $json.body.access_token }}
  Aucun `$env`, aucun credential n8n, aucun cache, aucun compte de service, aucune
  table de correspondance. n8n est un TUYAU : il présente à Google le jeton reçu
  dans le corps, et rend la réponse telle quelle. Le périmètre des données rendues
  est donc fixé ENTIÈREMENT par le propriétaire du jeton — jamais par n8n.

CE QUE CETTE SONDE ÉTABLIT
  Elle interroge Google en direct AVEC LE MÊME JETON, puis les webhooks n8n, et
  compare. Trois questions se tranchent d'un coup :
    1. À quel compte Google ce jeton donne-t-il accès ?      (userinfo + profil Gmail)
    2. Google lui-même rend-il l'agenda de l'autre personne ? (calendarList en direct)
    3. n8n ajoute-t-il, retire-t-il ou mélange-t-il quelque chose ? (direct vs via n8n)

  Si le direct et le via-n8n rendent la MÊME chose, n8n est hors de cause et la
  question devient « à qui est ce jeton » / « pourquoi cet agenda est-il dans la
  liste Google de ce compte ». Si les deux diffèrent, c'est chez nous.

SÉCURITÉ
  • Le jeton n'est JAMAIS passé en argument (`ps` le rendrait lisible par tout le
    poste) : il vient de la variable GOOGLE_ACCESS_TOKEN ou de l'entrée standard.
  • Il n'est JAMAIS affiché. La sonde publie une EMPREINTE (sha256, 12 hexa) pour
    que chat.api calcule la même de son côté et prouve qu'il s'agit du même jeton
    sans que personne ne se l'échange.
  • Opérations en LECTURE SEULE uniquement. Aucun contenu de message n'est affiché :
    seulement les en-têtes d'acheminement, qui sont la preuve cherchée.

USAGE
  export GOOGLE_ACCESS_TOKEN='…'          # ou : … | python3 sonde… --stdin
  python3 scripts/audit/sonde_645_proprietaire_jeton.py
  python3 scripts/audit/sonde_645_proprietaire_jeton.py --messages 5
  python3 scripts/audit/sonde_645_proprietaire_jeton.py --json > /tmp/sonde.json

CODE DE SORTIE : 0 = cohérent · 2 = anomalie à expliquer · 1 = la sonde a échoué
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DELAI = 30


# ─────────────────────────────────────────────────────────────────────────────
def charger_env(chemin: str) -> dict:
    valeurs = {}
    try:
        with open(chemin) as fh:
            for ligne in fh:
                m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)", ligne)
                if m:
                    valeurs[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    except OSError:
        pass
    return valeurs


def empreinte(jeton: str) -> str:
    """Identifiant partageable du jeton. chat.api peut calculer le même :
       python3 -c "import hashlib,sys;print(hashlib.sha256(sys.argv[1].encode()).hexdigest()[:12])" "$JETON"
    """
    return hashlib.sha256(jeton.encode()).hexdigest()[:12]


def appel(url: str, *, jeton: str | None = None, corps: dict | None = None,
          methode: str | None = None) -> tuple[int, object]:
    """Retourne (statut, corps_decode). Ne lève pas sur 4xx/5xx : un 401 est une
    MESURE, pas une panne — c'est souvent la réponse la plus instructive."""
    donnees = None
    entetes = {"Accept": "application/json"}
    if corps is not None:
        donnees = json.dumps(corps).encode()
        entetes["Content-Type"] = "application/json"
    if jeton:
        entetes["Authorization"] = f"Bearer {jeton}"
    req = urllib.request.Request(url, data=donnees, headers=entetes,
                                 method=methode or ("POST" if donnees else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=DELAI) as rep:
            brut = rep.read().decode("utf-8", "replace")
            statut = rep.status
    except urllib.error.HTTPError as e:
        brut = e.read().decode("utf-8", "replace")
        statut = e.code
    except Exception as e:                                    # réseau, DNS, TLS…
        return 0, {"_erreur_transport": str(e)}
    if not brut.strip():
        # ⚠️ n8n-workflows#467 : un workflow qui échoue avant son `respondToWebhook`
        # ferme la requête en 200 AVEC UN CORPS VIDE. Le dire explicitement, sinon
        # l'essai conclut « ça marche » sur un échec.
        return statut, {"_corps_vide": True}
    try:
        return statut, json.loads(brut)
    except json.JSONDecodeError:
        return statut, {"_non_json": brut[:400]}


def appel_tokeninfo(jeton: str) -> tuple[int, object]:
    """`tokeninfo` dit QUEL client OAuth a émis le jeton et quelles portées il porte.

    ⚠️ Google documente la forme `GET ?access_token=…`, qu'on évite : une URL se
    retrouve dans les journaux d'accès, les historiques de shell et les traces de
    proxy. On poste donc le jeton dans le CORPS, forme également acceptée.
    """
    donnees = urllib.parse.urlencode({"access_token": jeton}).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/tokeninfo", data=donnees,
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "Accept": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=DELAI) as rep:
            return rep.status, json.loads(rep.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        brut = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(brut)
        except json.JSONDecodeError:
            return e.code, {"_non_json": brut[:300]}
    except Exception as e:
        return 0, {"_erreur_transport": str(e)}


def masquer(valeur: str, garder: int = 3) -> str:
    """b…h@gmail.com — assez pour comparer deux lignes, pas pour divulguer."""
    if "@" not in valeur:
        return valeur[:garder] + "…"
    local, _, domaine = valeur.partition("@")
    if len(local) <= garder:
        return local[0] + "…@" + domaine
    return local[:garder] + "…@" + domaine


# ─────────────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(
        description="Sonde #645 : propriétaire du jeton, et n8n vs Google en direct.")
    ap.add_argument("--stdin", action="store_true",
                    help="lire le jeton sur l'entrée standard au lieu de GOOGLE_ACCESS_TOKEN")
    ap.add_argument("--host", default=None,
                    help="base des webhooks (défaut : N8N_WEBHOOK_BASE_URL de .env.local)")
    ap.add_argument("--messages", type=int, default=0, metavar="N",
                    help="relever les en-têtes d'acheminement de N messages (0 = ne pas lire la boîte)")
    ap.add_argument("--en-clair", action="store_true",
                    help="afficher les adresses entières au lieu de b…h@domaine")
    ap.add_argument("--json", action="store_true", help="sortie exploitable par un script")
    args = ap.parse_args()

    jeton = sys.stdin.read().strip() if args.stdin else (os.environ.get("GOOGLE_ACCESS_TOKEN") or "").strip()
    if not jeton:
        print("Aucun jeton. `export GOOGLE_ACCESS_TOKEN='…'`, ou `… | %s --stdin`.\n"
              "⚠️ Jamais en argument de commande : `ps` le rendrait lisible."
              % os.path.basename(sys.argv[0]), file=sys.stderr)
        return 1

    env = charger_env(os.path.join(RACINE, ".env.local"))
    base = (args.host or env.get("N8N_WEBHOOK_BASE_URL") or "http://llm.local:5678/webhook").rstrip("/")
    aff = (lambda v: v) if args.en_clair else masquer

    rapport: dict = {"empreinte_jeton": empreinte(jeton), "base_webhook": base,
                     "anomalies": [], "google": {}, "n8n": {}}
    anomalies = rapport["anomalies"]
    dit = (lambda *a, **k: None) if args.json else print

    dit("=" * 74)
    dit("SONDE #645 — propriétaire du jeton, et fidélité du tuyau n8n")
    dit("=" * 74)
    dit(f"empreinte du jeton : {rapport['empreinte_jeton']}   (sha256[:12] — partageable)")
    dit(f"webhooks n8n       : {base}")

    # ── 1 · À QUI est ce jeton ? Google seul peut le dire. ────────────────────
    dit("\n1 · IDENTITÉ DU JETON (Google, sans n8n)")
    st, info = appel("https://www.googleapis.com/oauth2/v3/userinfo", jeton=jeton)
    proprietaire = None
    if st == 200 and isinstance(info, dict):
        proprietaire = info.get("email")
        rapport["google"]["userinfo"] = {"email": proprietaire, "sub": info.get("sub"),
                                         "email_verified": info.get("email_verified")}
        dit(f"   propriétaire : {aff(proprietaire or '?')}")
        dit(f"   sub (ID Google) : {info.get('sub')}")
    else:
        rapport["google"]["userinfo"] = {"statut": st, "reponse": info}
        dit(f"   ⚠️ userinfo refuse : statut {st} → {str(info)[:160]}")
        if st == 401:
            anomalies.append("jeton expiré ou révoqué : userinfo répond 401")

    st, tok = appel_tokeninfo(jeton)
    if st == 200 and isinstance(tok, dict):
        portees = (tok.get("scope") or "").split()
        rapport["google"]["tokeninfo"] = {"aud": tok.get("aud"), "sub": tok.get("sub"),
                                          "email": tok.get("email"), "expires_in": tok.get("expires_in"),
                                          "scopes": portees}
        dit(f"   client OAuth (aud) : {tok.get('aud')}")
        dit(f"   expire dans : {tok.get('expires_in')} s")
        dit(f"   portées ({len(portees)}) : " + ", ".join(p.rsplit('/', 1)[-1] for p in portees))
        # Le `sub` du jeton et celui de userinfo doivent désigner la même personne.
        if info and isinstance(info, dict) and info.get("sub") and tok.get("sub") \
           and info["sub"] != tok["sub"]:
            anomalies.append("userinfo et tokeninfo ne désignent PAS le même compte")
    else:
        dit(f"   ⚠️ tokeninfo refuse : statut {st}")

    # ── 2 · La boîte que ce jeton ouvre réellement ───────────────────────────
    dit("\n2 · BOÎTE GMAIL OUVERTE PAR CE JETON (Google, sans n8n)")
    st, prof = appel("https://gmail.googleapis.com/gmail/v1/users/me/profile", jeton=jeton)
    boite = None
    if st == 200 and isinstance(prof, dict):
        boite = prof.get("emailAddress")
        rapport["google"]["gmail_profile"] = {"emailAddress": boite,
                                              "messagesTotal": prof.get("messagesTotal")}
        dit(f"   boîte : {aff(boite or '?')}   ({prof.get('messagesTotal')} messages)")
        if proprietaire and boite and proprietaire.lower() != boite.lower():
            anomalies.append(f"le jeton s'identifie {proprietaire} mais ouvre la boîte {boite}")
    else:
        rapport["google"]["gmail_profile"] = {"statut": st, "reponse": prof}
        dit(f"   (statut {st} — portée Gmail probablement absente de ce jeton)")

    # ── 3 · Les agendas, vus par Google puis vus à travers n8n ───────────────
    dit("\n3 · AGENDAS — GOOGLE EN DIRECT, PUIS LE MÊME APPEL À TRAVERS N8N")
    st_g, direct = appel("https://www.googleapis.com/calendar/v3/users/me/calendarList", jeton=jeton)
    st_n, via = appel(f"{base}/mcp-calendar",
                      corps={"access_token": jeton, "resource": "calendar", "operation": "getAll"})

    def extraire(obj):
        """Google rend {items:[…]}. n8n enveloppe : {success, data:{items:[…]}, error}."""
        if not isinstance(obj, dict):
            return None
        if isinstance(obj.get("items"), list):
            return obj["items"]
        d = obj.get("data")
        if isinstance(d, dict) and isinstance(d.get("items"), list):
            return d["items"]
        return None

    ag_direct, ag_via = extraire(direct), extraire(via)
    rapport["google"]["calendarList"] = {"statut": st_g, "n": len(ag_direct or [])}
    rapport["n8n"]["mcp_calendar"] = {"statut": st_n, "n": len(ag_via or []) if ag_via is not None else None,
                                      "reponse_brute": None if ag_via is not None else via}

    dit(f"   Google en direct : statut {st_g}, {len(ag_direct or [])} agendas")
    dit(f"   via n8n          : statut {st_n}, "
        + (f"{len(ag_via)} agendas" if ag_via is not None else f"ILLISIBLE → {str(via)[:200]}"))

    if ag_via is None:
        if isinstance(via, dict) and via.get("_corps_vide"):
            anomalies.append("mcp-calendar répond 200 AVEC UN CORPS VIDE "
                             "(le workflow a échoué avant son respondToWebhook — cf. #467)")
        else:
            anomalies.append("la réponse de mcp-calendar n'est pas exploitable")

    if ag_direct is not None:
        dit("\n   Détail des agendas rendus par Google (c'est ce que n8n relaie) :")
        dit("   " + "-" * 69)
        for a in ag_direct:
            ident = a.get("id", "?")
            marques = []
            if a.get("primary"):
                marques.append("PRINCIPAL")
            if a.get("selected") is False:
                marques.append("selected=false")
            if a.get("hidden"):
                marques.append("hidden=true")
            if a.get("deleted"):
                marques.append("deleted=true")
            dit(f"   • {aff(ident):<34} rôle={a.get('accessRole','?'):<15} "
                + (" ".join(marques) if marques else ""))
            # Un agenda dont l'identifiant est l'adresse d'une AUTRE personne.
            ressemble_a_une_personne = "@" in ident and not ident.endswith(
                ("group.calendar.google.com", "group.v.calendar.google.com",
                 "import.calendar.google.com", "calendar.google.com"))
            if ressemble_a_une_personne and proprietaire and ident.lower() != proprietaire.lower():
                anomalies.append(
                    f"agenda d'une autre personne dans la liste : {ident} "
                    f"(rôle {a.get('accessRole')}, "
                    f"selected={a.get('selected')}, hidden={a.get('hidden')})")
        # Le principal doit être le propriétaire du jeton.
        princ = [a.get("id") for a in ag_direct if a.get("primary")]
        if princ and proprietaire and princ[0].lower() != proprietaire.lower():
            anomalies.append(f"l'agenda PRINCIPAL est {princ[0]}, pas {proprietaire} : "
                             "ce jeton n'est pas celui que l'on croit")

        # Fidélité du tuyau : mêmes identifiants des deux côtés ?
        if ag_via is not None:
            d_ids, v_ids = {a.get("id") for a in ag_direct}, {a.get("id") for a in ag_via}
            if d_ids == v_ids:
                dit(f"\n   ✅ n8n rend EXACTEMENT les mêmes {len(d_ids)} agendas que Google : "
                    "le tuyau est fidèle, il n'ajoute ni ne mélange rien.")
                rapport["n8n"]["fidele"] = True
            else:
                rapport["n8n"]["fidele"] = False
                anomalies.append(f"n8n et Google divergent — en trop chez n8n : "
                                 f"{sorted(v_ids - d_ids)} ; manquants : {sorted(d_ids - v_ids)}")
        rapport["google"]["agendas"] = [
            {k: a.get(k) for k in ("id", "summary", "accessRole", "primary", "selected", "hidden")}
            for a in ag_direct]

    # ── 4 · Le webhook Gmail répond-il ? (lecture seule, sans contenu) ───────
    dit("\n4 · WEBHOOK GMAIL (lecture seule)")
    st_l, lab = appel(f"{base}/mcp-gmail",
                      corps={"access_token": jeton, "resource": "label", "operation": "getAll"})
    etiquettes = None
    if isinstance(lab, dict):
        d = lab.get("data")
        if isinstance(d, dict) and isinstance(d.get("labels"), list):
            etiquettes = d["labels"]
        elif isinstance(lab.get("labels"), list):
            etiquettes = lab["labels"]
    rapport["n8n"]["mcp_gmail_labels"] = {"statut": st_l,
                                          "n": len(etiquettes) if etiquettes is not None else None}
    dit(f"   label/getAll : statut {st_l}, "
        + (f"{len(etiquettes)} étiquettes" if etiquettes is not None else f"ILLISIBLE → {str(lab)[:200]}"))
    if etiquettes is None and isinstance(lab, dict) and lab.get("_corps_vide"):
        anomalies.append("mcp-gmail répond 200 avec un corps VIDE sur label/getAll")

    if args.messages > 0:
        # ⚠️ `resource=message, operation=getAll` : le switch du workflow route cette
        # paire, mais le nœud `gmailToolDynamic` ne déclare PAS `getAll` pour
        # `message` (il connaît `search` et `getMany`, et n'aliase `getAll` que pour
        # draft/label/thread, cf. custom-nodes/n8n-nodes-gmail-dynamic). On l'appelle
        # QUAND MÊME : c'est précisément ce qu'il faut mesurer en service.
        dit(f"\n   message/getAll (contrat tel qu'exposé, {args.messages} max) :")
        st_m, msgs = appel(f"{base}/mcp-gmail",
                           corps={"access_token": jeton, "resource": "message",
                                  "operation": "getAll", "return_all": False})
        dit(f"   statut {st_m} → {str(msgs)[:220]}")
        rapport["n8n"]["mcp_gmail_messages"] = {"statut": st_m, "reponse": str(msgs)[:500]}
        if isinstance(msgs, dict) and (msgs.get("_corps_vide") or "Unknown" in str(msgs)):
            anomalies.append("message/getAll ne passe pas par le nœud Gmail "
                             "(`getAll` non déclaré pour `message`)")

        # Et la même lecture EN DIRECT, pour nommer le destinataire réel : c'est la
        # preuve cherchée (« ces courriels sont-ils ceux de quelqu'un d'autre ? »).
        dit("\n   Acheminement réel des derniers messages (Google en direct) :")
        st_d, liste = appel("https://gmail.googleapis.com/gmail/v1/users/me/messages?"
                            + urllib.parse.urlencode({"maxResults": args.messages}), jeton=jeton)
        achemines = []
        if st_d == 200 and isinstance(liste, dict):
            for m in (liste.get("messages") or [])[: args.messages]:
                st_u, det = appel(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{m['id']}?"
                    + urllib.parse.urlencode(
                        [("format", "metadata"), ("metadataHeaders", "Delivered-To"),
                         ("metadataHeaders", "To")]), jeton=jeton)
                if st_u != 200 or not isinstance(det, dict):
                    continue
                h = {e["name"].lower(): e["value"]
                     for e in (det.get("payload", {}).get("headers") or [])}
                # Aucun objet, aucun extrait, aucun expéditeur : seul l'acheminement.
                dest = h.get("delivered-to") or h.get("to") or "?"
                achemines.append(dest)
                dit(f"   • {m['id'][:12]}…  Delivered-To/To : {aff(dest)}")
        rapport["n8n"]["achemines"] = achemines
        for dest in achemines:
            adr = re.findall(r"[\w.+-]+@[\w.-]+", dest)
            if adr and boite and all(a.lower() != boite.lower() for a in adr):
                anomalies.append(f"message acheminé vers {adr[0]}, pas vers {boite}")

    # ── Verdict ──────────────────────────────────────────────────────────────
    if args.json:
        json.dump(rapport, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        dit("\n" + "=" * 74)
        if not anomalies:
            dit("VERDICT — rien d'anormal relevé.")
            dit("   Le jeton appartient bien au compte annoncé, et n8n relaie Google")
            dit("   à l'identique. Si une fuite a lieu, elle n'est pas dans ce tuyau :")
            dit("   elle est dans le CHOIX du jeton, en amont de n8n.")
        else:
            dit(f"VERDICT — {len(anomalies)} anomalie(s) :")
            for a in dict.fromkeys(anomalies):
                dit(f"   • {a}")
        dit("=" * 74)
        dit(f"Empreinte à transmettre à chat.api pour corréler : {rapport['empreinte_jeton']}")
    return 2 if anomalies else 0


if __name__ == "__main__":
    sys.exit(main())
