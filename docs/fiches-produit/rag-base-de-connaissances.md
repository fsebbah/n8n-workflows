# 🧩 RAG — Base de connaissances

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Nourrir l'IA avec vos propres documents pour qu'elle réponde à partir de **votre** savoir — dans une base de connaissances unifiée, traçable et isolée par organisation.

## Pour qui & bénéfices
- **Organisation / formateur** : l'IA cite et s'appuie sur vos référentiels, cours, procédures — pas sur des généralités.
- **Utilisateur** : des réponses fondées sur des sources identifiées, avec la source d'origine visible.
- **Décideur** : chaque corpus est cloisonné (isolation par organisation) ; les données d'une organisation ne fuitent jamais vers une autre.
- **Équipe métier** : monter un nouveau domaine de connaissances « en quelques minutes » — on choisit un type de corpus et on dépose des documents.

## Ce que ça permet
- **Déposer des documents** dans un corpus : fichiers (PDF, TXT, MD, DOCX, XLSX, PPTX, audio, vidéo) déposés **un par un**, ou **liens vidéo** (YouTube…) avec extraction des sous-titres / transcription.
- **Regrouper plusieurs documents dans un même corpus** : la base est **unifiée par corpus** — un corpus = une valeur `scope_id`, découplée de Discord (le rattachement à un serveur/bot n'est plus qu'un cas particulier).
- **Suivre l'ingestion en direct** : chaque source a un **statut** (en attente → transcription → indexée / erreur) et un pourcentage de progression.
- **Relancer** une source en erreur, **lister/filtrer** les sources (par statut, type), **supprimer** une source (purge du fichier stocké).
- **Classer les sources** par type pédagogique/métier (catalogue de types paramétrable par organisation — pas seulement scolaire).
- **Traçabilité par extrait (chunk)** : chaque passage indexé garde son origine (source, titre, corpus, catégories) → l'IA peut indiquer d'où vient l'information.
- **4 comportements de corpus (archétypes)** selon la structure du savoir, avec un **moteur unique** :
  - **Référentiel** : autorité qui fait foi (juridique, RGPD, doc produit).
  - **Cumulatif** : savoir ordonné avec prérequis (maths, langues, musique) → modes pédagogiques.
  - **Procédural** : suites d'étapes (recettes, gestes techniques).
  - **Exploratoire** : documents indépendants (veille, FAQ).

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **porte d'entrée et orchestrateur d'ingestion**. Gère le dépôt et le cycle de vie des sources et des profils de corpus, l'authentification et l'**isolation par organisation** (le corpus et l'organisation viennent d'une source fiable, jamais du contenu envoyé), le stockage des fichiers, le déclenchement du pipeline, le suivi de statut, et la requête de recherche relayée. Il **n'écrit pas** dans le moteur vectoriel.
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — moteur d'ingestion lourd : téléchargement du fichier, **OCR / extraction / transcription**, découpage en extraits, calcul des **embeddings**, et **écriture (upsert) dans Qdrant** ; renvoie les callbacks de progression/fin/erreur.
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — **retrieval** commun : transforme la question en vecteur, applique le **filtre dur par corpus** (`scope_id`) + les filtres de catégorie, et remonte les extraits pertinents. Tous les archétypes passent par les mêmes routes ; seul le profil change.

## Prérequis / activation
- Organisation authentifiée ; le corpus (`scope_id`) et l'organisation sont dérivés du contexte de la requête.
- Pipeline n8n configuré (webhook d'ingestion + secret dédié) et moteur vectoriel disponible.
- Pour l'OCR de données sensibles (ex. copies de mineurs), un **verrou de conformité (DPA)** doit être levé avant tout traitement réel.

## Limites connues & roadmap
- **Séquencement par archétype** : le **Référentiel** est livré de bout en bout en premier, le **Cumulatif** ensuite (les autres suivent).
- L'**OCR avancé** (PDF scannés / manuscrits) et le **double backend** (Qdrant côté web / on-device côté mobile & desktop) sont en cours de spécification (RFC-107, DRAFT) et soumis à décisions produit.
- Dépôt **un fichier par appel** (le « multi-documents » se fait en rattachant plusieurs sources au même corpus).
- Pas encore : partage/délégation de corpus entre utilisateurs (V2), purge RGPD des extraits déjà vectorisés, harnais d'évaluation de la pertinence — à ne pas survendre.

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Sources : `POST /api/rag/sources/upload` (fichier), `POST /api/rag/sources/link` (lien vidéo), `GET /api/rag/sources`, `GET /{id}/status`, `PATCH /{id}`, `POST /{id}/retry`, `DELETE /{id}` — contrat : `docs/rag_models/FRONTEND-RAG-SOURCES-ENDPOINTS.md`.
- Profils de corpus (4 archétypes, CRUD) : `docs/rag_models/FRONTEND-RAG-PROFILES-ENDPOINTS.md`, spec `docs/rag_models/rag-profiles-spec.md` (RFC-106), schéma + exemples `docs/rag_models/rag_profile.schema.json`.
- Socle & frontière 3 couches (n8n possède l'upsert Qdrant) : `docs/rfc/rag/RFC-106b-socle-rag-archetypes.md`, `docs/rfc/rag/RFC-106-addendum.md`, jalons `docs/rfc/rag/RFC-106b-A-jalons-rag.md`.
- Pipeline : `docs/rfc/RFC-093-RAG-PIPELINE-FINALIZATION.md` (⚠️ lire l'amendement en tête ; le corps est en partie caduc). OCR/double backend : `docs/rfc/rag/RFC-107-OCR-RAG-Azy.md` (DRAFT).
- Catalogue de types de sources : `docs/guides/rag-source-type-catalog.md`. Recherche (soft-filter relayé vers MCP) : `POST /api/rag/query`.
