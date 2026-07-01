# 🧩 Experts & Personae

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Composer des assistants d'IA spécialisés à partir de trois briques réutilisables — un expert, une spécialité, un style — et les diffuser sur le web, Discord ou Google Classroom.

## Pour qui & bénéfices
- **Organisation / formateur** : coder un expert une fois, le décliner en N contextes sans le dupliquer.
- **Utilisateur** : un assistant cohérent, au ton et au domaine adaptés au canal où il l'utilise.
- **Décideur** : des personae réutilisables et clonables (ex. « Prof », « Formateur »), assemblées comme des Lego.

## Ce que ça permet
- **Assembler une personae à 3 axes indépendants** :
  - **Expert** : le prompt de base + les réglages d'IA par défaut (la personnalité fondatrice).
  - **Spécialité** : le domaine + le contexte + les sources RAG, notebooks et skills associés.
  - **Style** : le ton et les ajustements fins de l'IA (le style l'emporte sur les réglages par défaut).
- **Contextualiser un même expert par canal** : il répond différemment selon le serveur Discord, le web ou un cours Google Classroom — sans créer plusieurs experts.
- **Réutiliser en un clic** via des « briques » nommées (couples spécialité + style).
- **Publier proprement** : chaque catalogue (expert / spécialité / style) suit un cycle brouillon → publication (publications figées, un seul brouillon en cours).
- **Régler le multimodal par contexte** : choix des modèles pour vision, transcription, OCR, synthèse vocale, extraction PDF, formules mathématiques.
- **Assistant pédagogique par élève** : inscription aux matières → périmètre de réponse → routage sémantique du message vers le bon expert, sans multiplier les bots.
- **Cloner des personae prêtes à l'emploi** (dupliquer en brouillon puis adapter).

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **catalogues + résolveur**. Stocke experts, spécialités, styles, briques et rattachements par canal ; gère les permissions fines ; **compose la personae « effective » au moment de la requête** (concatène les prompts, fusionne les réglages, résout les sources et modèles) — sans jamais la figer. Il expose cette personae résolue aux consommateurs (n8n, bot).
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — consomme la sortie du résolveur (prompt système, modèles, identifiants de sources/notebooks/skills) et matérialise ces pointeurs pour l'appel LLM ; « n8n reste bête », il applique ce que le back a résolu.
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — impact a priori nul sur la composition ; à cadrer : l'appel LLM de classification du routage par élève pourrait transiter par MCP (le back n'a pas de client d'inférence direct).

## Prérequis / activation
- Organisation authentifiée ; permissions `personae:*` (owner/admin par défaut).
- Modèle de données en place (le modèle **v4 à 3 axes** est livré ; l'ancien modèle v3 cohabite mais est en voie de retrait — ne pas mélanger les deux).

## Limites connues & roadmap
- Le canal **MCP** pour un expert est prévu en V2 (non exposé aujourd'hui).
- Le **catalogue public partagé entre organisations** (personae cross-tenant) est hors périmètre V1 : on parle de personae **réutilisables/clonables** au sein d'une organisation, pas d'un catalogue public livré.
- L'extension pédagogique avancée (référentiel officiel, compétences, progression, scaffolding — RFC-096) est en **brouillon**, non livrée.

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Modèle v4 (3 axes, résolveur, bindings par canal) : `docs/rfc/RFC-081-EXPERT-GUILD-CONTEXT.md` (§14 autoritaire), guide `docs/guides/FRONTEND-RFC-081-V4-PERSONAE.md`.
- Multi-niveaux (inscription + audience + routage par élève) : `docs/rfc/RFC-095-PERSONAE-MULTI-LEVELS.md`.
- Extension pédagogique (DRAFT) : `docs/rfc/RFC-096-PERSONAE-PEDAGOGIQUE.md`.
- Flux experts/programmes : `docs/guides/INDEX-EXPERTS-PROGRAM-FLOW.md`, `docs/rfc/RFC-080-EXPERT-QUESTION-RESPONSES.md`.
- Résolveur consommé par n8n : `GET /api/n8n/personae/resolve` (par canal), `resolve-dm` (RFC-095).
