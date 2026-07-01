# 🗓️👥 Calendrier & Contacts multi-provider — état d'implémentation par connecteur

> **Statut** : état des lieux back au 2026-07-01 · complément « implémentation/roadmap » de la fiche produit `assistant-productivite.md`.
> **Objet** : dire précisément **ce qui est vendable aujourd'hui** vs **ce qui est prévu** (par connecteur), et **ce qui bloque** l'écriture CalDAV/CardDAV.

## 1. Contexte

Les domaines **Calendrier** et **Contacts** sont refondus en **multi-provider** (sur le modèle `unified_emails`) : une API unifiée (`/api/calendar/v2/*`, `/api/contacts/v2/*`) au-dessus de plusieurs connecteurs. Le tenant/utilisateur voit ses données agrégées, chaque élément gardant sa source.

- **RFC** : `docs/rfc/RFC-102-CALENDAR-EXTERNAL-SUBSCRIPTION.md` (« Calendrier interne + synchro calendriers externes Apple/Google/Outlook », **Draft v0.1**, non tranchée).
- **Issues** : [#2471](https://github.com/fsebbah/chat.api/issues/2471) (Calendar multi-provider, **OPEN**) · [#2472](https://github.com/fsebbah/chat.api/issues/2472) (Contacts multi-provider, **OPEN**).

## 2. Matrice par connecteur (réalité du code)

| Connecteur | Calendrier (#2471) | Contacts (#2472) | Détail |
|---|---|---|---|
| **Google** (Calendar / People) | ✅ lecture **+ écriture** | ✅ lecture **+ écriture** | Fonctionnel (OAuth multi-compte RFC-089). |
| **Interne** (Azy) | ✅ lecture **+ écriture** | ✅ lecture **+ écriture** | Adaptateur interne complet. |
| **CalDAV** (iCloud, Nextcloud…) | 🟡 **squelette** | — *(protocole calendrier only)* | `app/services/calendar/adapters/caldav.py` : **lecture** déléguée au store interne, **écritures → `NotImplementedError`**. |
| **CardDAV** | — *(protocole contacts only)* | 🟡 **squelette** | `app/services/contacts/adapters/carddav.py` : **lecture** vide/None, **écritures → `NotImplementedError` (HTTP 501)**. |
| **Outlook** (Microsoft Graph) | 🟡 squelette | 🟡 squelette | Adaptateurs présents, non fonctionnels en écriture. |

**Légende** : ✅ fonctionnel · 🟡 squelette (lecture-seule / stub, écritures non implémentées).

> ⚠️ **Correction d'une idée reçue** : côté **back**, **CalDAV n'est PAS « absent »** — c'est un **squelette au même niveau que CardDAV** (fichier adaptateur présent, lecture stub, écritures `NotImplementedError`). La distinction « CalDAV absent vs CardDAV prévu » vient d'une vue **front** (pas d'UI/type CalDAV côté client, alors que CardDAV a UI + type). Au back, les deux connecteurs sont identiques.

## 3. Ce qui est « vendable » aujourd'hui vs « prévu »

- ✅ **Disponible (read + write)** : **Google** et **calendrier/annuaire interne Azy** — pour Calendrier **et** Contacts.
- 🟡 **Prévu (annoncé mais non fonctionnel)** : **CalDAV** (iCloud/Nextcloud), **CardDAV**, **Outlook** — lecture-seule / stub, **écritures indisponibles** (renvoient une erreur).

Pour une fiche produit : ne présenter **CalDAV / CardDAV / Outlook** que comme **« à venir »**, pas comme actifs.

## 4. Ce qui manque + ce qui bloque

Le code documente lui-même le report :
- **CalDAV** → écritures différées à **PR-8b** : *« python-caldav + `caldav_accounts` credentials store »* (store de credentials + client CalDAV réel). Non commencée.
- **CardDAV** → sync vCard différée à une **PR future**. Non commencée.
- **Outlook** → adaptateur écriture (Microsoft Graph) à compléter.

**Point de décision bloquant** : la mise en œuvre de la **synchro externe** (CalDAV bidirectionnel, abonnement iCal, ou push) est **gatée par RFC-102**, qui propose **3 architectures candidates non tranchées**. Tant que le PO n'a pas arbitré, on reste au **squelette lecture-seule** pour ces connecteurs.

## 5. Références

- RFC : `docs/rfc/RFC-102-CALENDAR-EXTERNAL-SUBSCRIPTION.md`
- Issues : `#2471` (Calendar), `#2472` (Contacts)
- Adaptateurs : `app/services/calendar/adapters/{caldav,outlook}.py`, `app/services/contacts/adapters/{carddav,outlook}.py`
- Contrats front : `docs/guides/FRONTEND-CALENDAR-UNIFIED-ENDPOINTS.md`, `docs/guides/FRONTEND-EMAIL-UNIFIED-ENDPOINTS.md`
- Fiche produit associée : `assistant-productivite.md` (ce dossier)
