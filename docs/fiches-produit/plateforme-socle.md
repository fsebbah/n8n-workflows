# 🧩 Plateforme socle

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Le socle transverse qui rend tout le reste possible : multi-organisation isolé, application mobile utilisable hors-ligne, temps réel, sécurité et audit.

## Pour qui & bénéfices
- **Organisation** : ses données sont cloisonnées au niveau de la base — invisibles des autres organisations.
- **Utilisateur mobile** : une application rapide, utilisable sans réseau, cohérente entre appareils.
- **Décideur / sécurité** : double authentification pour les actions sensibles, journal d'audit, sauvegarde par organisation.

## Ce que ça permet
- **Multi-organisation à isolation forte** : un espace de données isolé par organisation (schéma dédié), bascule d'une organisation à l'autre via un simple en-tête (`X-Tenant-ID`). Sauvegarde/restauration et performances par organisation.
- **Synchronisation mobile hors-ligne d'abord** :
  - travail hors-ligne puis **remontée par lots idempotente** (résolution de conflit « dernier écrit gagne ») ;
  - **récupération des changements** depuis le dernier point de synchronisation (delta + suppressions) ;
  - **instantané initial** (archive signée) au premier lancement ;
  - **recherche** plein-texte (puis sémantique) ;
  - **profil agrégé** ramenant identité + réglages + package effectif + crédits **en un seul appel** au démarrage.
- **Temps réel (WebSocket)** : un canal serveur→client sécurisé qui pousse les changements de données (`tenant.changed` → déclenche une synchronisation sans interrogation répétée) et des événements métier (`bug_report.triaged`). Le streaming des réponses IA passe par un canal dédié.
- **Sécurité & audit** : **double authentification (2FA) par email** pour les actions sensibles (owner/admin/superadmin), gestion des super-admins, garde-fous (dernier super-admin, anti-auto-révocation), **journal d'audit** et notifications.
- **Signalement de bugs** intégré, avec triage et suivi en temps réel.

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **tout le socle**. Isolation multi-schéma, endpoints de synchronisation, distribution des événements temps réel (via Redis), génération des instantanés, indexation pour la recherche, permissions, middleware de 2FA et d'audit.
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — automatisations annexes ; non impliqué dans le chemin de synchronisation mobile.
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — couche outils pour l'IA (streaming du chat) ; hors du périmètre synchronisation/2FA.

## Prérequis / activation
- Authentification (Firebase) + en-têtes d'organisation et d'appareil ; permissions de synchronisation.
- Pour la 2FA : envoi d'emails configuré et clé de sécurité en production.
- Dépendances d'infrastructure : Redis (idempotence, temps réel, sessions), stockage d'objets (instantanés), moteur de recherche sémantique.

## Limites connues & roadmap
- **Pas de canal temps réel dédié au solde de crédits** : le solde passe par l'API (inclus dans le profil agrégé) et l'information de quota est **embarquée dans le flux IA** — à ne pas présenter comme un événement autonome.
- Synchronisation mobile en montée en charge : certaines entités (extraits de documents, messages de chat) ne sont pas encore synchronisées (phase ultérieure) ; les conversations sont synchronisées comme conteneur.
- Résolution de conflit = « dernier écrit gagne » (résolution manuelle prévue en V2) ; le temps réel n'offre pas de garantie d'ordre/livraison (repli par nouvelle synchronisation).
- Recherche sémantique hybride et instantané asynchrone prévus en phases ultérieures.

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Multi-tenant : `docs/architecture/architecture-postgresql-multi-tenant.md`.
- Synchronisation mobile : `docs/rfc/RFC102-sync_architecture.md`, `docs/mob/MOBILE-SYNC-ENDPOINTS.md`, profil agrégé `docs/mob/MOBILE-SYNC-PROFILE.md`.
- Temps réel : `docs/mob/MOBILE-WS-EVENTS.md`, `docs/architecture/websocket-endpoints.md`.
- Sécurité / 2FA / audit : `docs/rfc/RFC-075-SUPERADMIN-2FA-AND-MANAGEMENT.md`, `docs/guides/FRONTEND-SUPERADMIN-2FA-ENDPOINTS.md`, `docs/guides/FRONTEND-ADMIN-AUDIT-LOG.md`.
- Authentification : `docs/mob/MOBILE-AUTH-FIREBASE.md`.
- Signalement de bugs : `docs/issues/2026-06-01-bug-report-back-spec.md`.
