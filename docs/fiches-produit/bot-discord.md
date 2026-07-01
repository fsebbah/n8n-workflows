# 🧩 Bot Discord

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Transformer un serveur Discord en espace client ou pédagogique piloté par l'IA — rôles, cohortes, branding et onboarding centralisés dans l'organisation.

## Pour qui & bénéfices
- **Organisation / école** : utiliser Discord comme espace de relation client ou de formation, connecté à l'IA et aux crédits.
- **Administrateur de serveur** : gérer membres, rôles, salons et identité visuelle depuis un panneau centralisé.
- **Décideur** : sécurité forte — le jeton Discord des commandes sensibles ne quitte jamais le plugin dédié.

## Ce que ça permet
- **Unifier serveur ↔ organisation** : chaque serveur Discord est rattaché à une organisation, avec le back comme source unique (fini la duplication de données).
- **Résoudre le contexte** : retrouver l'organisation, l'utilisateur et ses rôles à partir d'un identifiant Discord ; réagir aux arrivées/départs de membres selon une politique configurable.
- **Inviter par email ou message privé Discord**, y compris **en masse**.
- **Créer des espaces privés par cohorte** : catégories et salons privés par promotion/groupe, salons personnels par élève, pré-inscription + vérification par message privé.
- **Faire cohabiter plusieurs bots sur un même serveur**, chacun avec sa propre identité et ses salons.
- **Personnaliser le branding** de façon hiérarchique (organisation > serveur > bot > groupe > salon) : nom, couleur, emoji, message de bienvenue.
- **Configurer l'onboarding** (vérification, message d'accueil) et **piloter la présence** du bot (statut, activité).
- **Attribuer crédits et quotas par rôle Discord** (voir la fiche Crédits & facturation).

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **source de vérité & orchestration**. Détient le mapping serveur↔organisation, les rôles, le branding (hiérarchie et cache), l'envoi d'invitations (y compris en lot), les permissions et la 2FA sur la configuration sensible. Il **publie une intention** de commande (via une file Redis) et **ne détient jamais le jeton du bot**.
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — automatisation/batch Discord (création de catégories/salons, invitations en lot), indexation/recherche RAG par serveur, workflows d'invitation.
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — peu central côté Discord ; à préciser par l'équipe MCP.
- **Plugin chatbot-core** : ✅ **exécuteur runtime**. Détient le jeton du bot, exécute les commandes sensibles (renommage, avatar, présence, rôles, catégories) et l'application du branding vers Discord, gère l'accueil et la vérification des membres.

## Prérequis / activation
- Bot installé sur le serveur avec les permissions Discord requises (gestion des salons/rôles).
- Plugin `chatbot-core` démarré + file Redis opérationnelle.
- Configuration sensible du bot protégée par 2FA (owner/admin/superadmin).

## Limites connues & roadmap
- **Deux modes d'actionnement coexistent** et convergent : jeton **local au plugin** (runtime, branding — récent) et jeton **global côté n8n** (création de salons/catégories, plus ancien). L'unification est **en cours**.
- Le multi-bot par serveur est spécifié mais **pas encore pleinement actif** (identifiant de bot accepté mais ignoré tant que la fonctionnalité n'est pas livrée).
- La création de bots n'est pas gérée par l'API (l'admin fournit le jeton) ; limites de débit Discord sur la présence.

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Unification serveur↔organisation & invitations : `docs/rfc/RFC-020-DISCORD-TENANT-UNIFICATION.md`.
- Gestion serveur/bot : `docs/rfc/RFC-053-DISCORD-BOT-SERVER-MANAGEMENT.md`.
- Salons de groupe/cohorte : `docs/rfc/RFC-061-DISCORD-GROUP-CHANNELS.md`, `docs/guides/rfc061-api-spec.md`.
- Multi-bot & branding : `docs/rfc/RFC-063-MULTI-BOT-PER-GUILD.md`, `docs/rfc/RFC-062-BRANDING-SCOPE-CLARIFICATION.md`.
- Runtime & présence (jeton local au plugin, file Redis) : `docs/guides/BOT-RUNTIME-AND-PRESENCE-CONTRACT.md`, `docs/guides/BOT-CONFIG-CONTRACT.md`.
- Crédits/quotas par rôle Discord : `docs/guides/frontend-guild-credit-quotas.md`, `docs/rfc/RFC-059-GUILD-CREDIT-ALLOCATION.md`.
