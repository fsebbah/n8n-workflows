# 🧩 Assistant productivité

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Réunir mails, agenda et contacts de tous les fournisseurs (Google, Microsoft, iCloud, IMAP, annuaire interne) en une seule vue cohérente, sécurisée côté serveur.

## Pour qui & bénéfices
- **Utilisateur** : tout son univers productivité au même endroit, sans jongler entre applications.
- **Utilisateur multi-comptes** : plusieurs adresses (ex. plusieurs Gmail) réunies dans une inbox et un carnet unifiés.
- **Organisation** : les identifiants d'accès (tokens OAuth) sont stockés, chiffrés et rafraîchis côté serveur — jamais exposés au client.

## Ce que ça permet
- **Trois domaines unifiés** : Mail, Agenda et Contacts, avec un format normalisé (identifiants internes, dates ISO) quel que soit le fournisseur.
- **Multi-fournisseurs sous une interface unique** : Google (Gmail/Calendar/People), Microsoft/Outlook, CalDAV/CardDAV (iCloud, Nextcloud), IMAP/SMTP générique (Yahoo, FastMail, serveurs perso), et un **annuaire interne natif** qui fonctionne sans aucun compte externe.
- **Vue fusionnée automatique** : sans précision de fournisseur, la plateforme agrège tous les comptes connectés (inbox multi-comptes, agenda multi-calendriers, carnet unifié).
- **Multi-compte par fournisseur** : plusieurs comptes simultanés, avec un compte « primaire ».
- **Mail** : liste paginée + filtres, recherche multi-comptes, actions en lot (lu/non-lu, étoile, archive, corbeille…), pièces jointes, statistiques.
- **Agenda** : calendriers, événements, participants, RSVP, récurrence, rappels, annulation vs suppression.
- **Contacts** : contacts, groupes, favoris, recherche par nom, appartenance à plusieurs groupes.
- **Synchronisation transparente** : plus de bouton « Synchroniser » — le rafraîchissement se fait en arrière-plan.

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **cœur du produit et source de vérité**. Détient les tables unifiées, les adaptateurs par fournisseur, le stockage/rafraîchissement/chiffrement des tokens OAuth, les permissions par organisation, la synchronisation en arrière-plan et l'API. **Le client parle toujours au back — jamais directement aux API tierces (Google, Microsoft…).**
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — non impliqué dans le chemin Mail/Agenda/Contacts unifiés ; intervient pour des workflows annexes (ex. synchronisation Google Classroom, résolution de token).
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — couche outils pour l'IA : permet à l'assistant d'agir sur des services Google (Drive, Classroom) au nom de l'utilisateur — capacité **distincte** des endpoints unifiés Mail/Agenda/Contacts.

## Prérequis / activation
- Compte authentifié + organisation ; permissions adéquates.
- Pour Google/Microsoft : autorisation OAuth préalable (le back stocke les tokens). Pour IMAP : identifiants ou OAuth selon le fournisseur.
- L'annuaire **interne** fonctionne sans aucun compte externe connecté.

## Limites connues & roadmap
- **Maturité variable par fournisseur** : Mail (Gmail + IMAP) opérationnel ; Agenda et Contacts en CRUD complet pour Google et l'interne ; **écriture CalDAV / Outlook / CardDAV encore indisponible** (en cours).
- **Pas encore de rédaction/envoi unifié** (l'envoi reste spécifique Gmail) ni de labels unifiés.
- **Drive et Classroom** ne font pas partie des endpoints unifiés (accès séparé, via la couche IA/MCP et un microservice dédié).
- Retrait des anciennes routes (legacy) programmé (fin 2026 pour Agenda & Contacts).

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Mail : `docs/guides/FRONTEND-EMAIL-UNIFIED-ENDPOINTS.md` (`/api/email-providers/*`).
- Agenda : `docs/guides/FRONTEND-CALENDAR-UNIFIED-ENDPOINTS.md` (`/api/calendar/v2/*`).
- Contacts : `docs/guides/FRONTEND-CONTACTS-UNIFIED-ENDPOINTS.md` (`/api/contacts/v2/*`).
- Comptes externes & multi-compte Google : `docs/guides/FRONTEND-EXTERNAL-ACCOUNTS-ENDPOINTS.md`, `docs/guides/google-multi-account-front-companion.md`, `docs/rfc/RFC-089-MULTI-ACCOUNT-GOOGLE-OAUTH.md`.
- Drive / Classroom (séparés) : `docs/guides/GOOGLE_CLASSROOM_MCP_API.md`, `docs/guides/FRONTEND-DRIVE-APP-FOLDER.md`, `docs/architecture/GOOGLE-SERVICES-INTEGRATION.md`.
- Conception historique multi-fournisseurs : `docs/ANALYSE_EMAIL_MULTI_FOURNISSEURS.md`.
