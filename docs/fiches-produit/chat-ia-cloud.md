# 🧩 Chat IA cloud

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Converser avec l'IA en temps réel, avec des formules de modèles adaptées à chaque rôle et à chaque budget, et une facturation à l'usage totalement maîtrisée.

## Pour qui & bénéfices
- **Utilisateur final** : une expérience de chat fluide, où la réponse s'affiche au fil de l'eau — plus d'écran figé sur les réponses longues.
- **Utilisateur** : le bon modèle est choisi automatiquement selon la tâche (texte, image, audio, vidéo, recherche) sans avoir à s'y connaître.
- **Organisation** : coûts sous contrôle, consommation traçable, aucun « trou » de facturation.
- **Décideur** : liberté de proposer plusieurs niveaux de qualité/prix (Éco, Mid, Pro, Premium) selon le profil des utilisateurs.

## Ce que ça permet
- **Discuter avec l'IA** et recevoir la réponse **en temps réel** (streaming, texte incrémental).
- **Choisir un package LLM** (une formule de modèles regroupés par tier) ; le chat utilise le modèle de chat par défaut, et bascule automatiquement sur le modèle image/audio/vidéo/recherche quand la tâche le demande.
- **Tester un modèle d'un tier supérieur ou inférieur** au coup par coup (opt-in) quand la formule le permet, avec le tier réel — donc le coût réel — affiché avant l'action.
- **Suivre ses crédits** : solde en direct, estimation du coût, refus propre si le solde est insuffisant.
- **Retrouver et rechercher** dans son historique de conversations (pagination, recherche plein-texte, résumé, relance).
- **Reprendre une réponse interrompue** après une perte de réseau ou un rechargement (reprise de session).
- **Modèles « reasoning »** (raisonnement étendu) : l'IA « réfléchit » avant de répondre — latence de réflexion assumée pour des réponses de meilleure qualité.

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **cerveau de l'orchestration**. Vérifie l'authentification, le quota et les crédits ; **réserve** les crédits au démarrage puis les **réconcilie** au décompte réel (tokens consommés) ; audite chaque appel de bout en bout ; retransmet le flux vers le front (SSE / WebSocket) ; héberge tout le **catalogue** (modèles, packages, tags de capacité) et la **résolution du modèle par rôle**. Il ne fait jamais tourner le modèle lui-même.
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — exécuteur des appels LLM chez les fournisseurs (Anthropic, OpenAI, Mistral…), accumulation et découpage du flux en paquets, gestion des retries/erreurs fournisseur, callbacks de progression.
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — relais/transport temps réel entre n8n et chat.api ; surface d'exécution des appels de chat cloud ; multimodal et évènement « reasoning » (à venir, selon faisabilité MCP).

## Prérequis / activation
- Compte authentifié (Firebase) et rattaché à une organisation.
- Un package LLM sélectionné (choix au premier login ; l'organisation peut imposer ou pré-sélectionner).
- Solde de crédits suffisant (ou quota alloué). Les modèles disponibles dépendent de la whitelist de l'organisation.

## Limites connues & roadmap
- L'**évènement « reasoning »** (affichage de la phase de réflexion des modèles type GPT-5) est une **roadmap non figée**, dépendante de la couche MCP — à formuler au conditionnel.
- La fluidité perçue repose sur un envoi **par paquets** (et non un envoi HTTP par token) : le paramétrage fin (taille de paquet, robustesse de la reprise) est encore en calibrage.
- Mode « éco/batch différé » (génération moins chère mais non temps réel) documenté séparément (RFC-072), à confirmer côté produit.

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Chat cloud : `POST /api/llm/chat/stream` (SSE, token par token), catalogue `GET /api/llm/chat/models` (pack effectif + tiers en opt-in).
- **Surface client = `POST /api/llm/chat/stream`** (SSE, montée dans `app/api.py`, mode `raw|agentic`) — c'est l'entrée chat cloud. ⚠️ Ne pas confondre avec `stream/init` : ce dernier désigne soit le **streaming des skills** (`/api/llm/skills/stream/init`, RFC-085, autre feature), soit le chemin **proposé** par RFC-086 (doc d'architecture, pas la route chat live). Archi + réservation/réconciliation crédits : `docs/rfc/RFC-086-LLM-STREAMING-ARCHITECTURE.md`, `docs/guides/llm-streaming-api.md`.
- Packages & catalogue : `docs/rfc/RFC-077-LLM-PACKAGES.md`, `docs/rfc/RFC-076-LLM-MODELS-CATALOG-REFACTOR.md`, `docs/guides/frontend-llm-packages.md`, `docs/guides/frontend-llm-capability-tags.md`.
- Préférences & config par organisation : `docs/rfc/RFC-071-USER-LLM-PREFERENCES.md`, `docs/rfc/RFC-079-TENANT-PACKAGE-CONFIGURATION.md`, `docs/guides/frontend-tenant-package-configuration.md`.
- Mode batch éco : `docs/rfc/RFC-072-BATCH-PROCESSING-API.md`.
