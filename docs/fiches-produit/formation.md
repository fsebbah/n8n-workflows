# 🧩 Formation

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Piloter formations, promotions et matières de bout en bout — de la structure des cohortes à la génération de programmes, jusqu'à la correction de copies assistée sous contrôle humain.

## Pour qui & bénéfices
- **Organisme de formation / école** : structurer son offre (formations → promotions → matières) et inscrire ses apprenants.
- **Formateur / professeur** : générer des programmes à partir d'un référentiel, et corriger des copies plus vite — sans jamais perdre la main.
- **Décideur** : outiller la pédagogie de bout en bout, avec traçabilité et conformité (pseudonymisation).

## Ce que ça permet
- **Structurer une offre de formation** : Formations → Promotions (cohortes annuelles) → Matières → Inscriptions des apprenants, rattachées à un espace (serveur Discord).
- **Décrire richement les matières** (nom, emoji, canal Discord associé, ordre), archiver les promotions.
- **Construire des programmes par matière (extraction-first)** : à partir d'un référentiel (texte ou URL), l'IA en extrait une structure éditable, puis génère un programme expert par matière sélectionnée.
- **Rattacher un programme à plusieurs canaux en parallèle** : Discord (promotion/matière) **et** Google Classroom (cours).
- **Corriger des copies avec l'aide de l'IA** : un pipeline pédagogique (extraction du barème → lecture de la copie → découpe des réponses → comparaison → note → feedback) qui produit une évaluation **auditable, contestable et corrigeable par le professeur**.
- **Générer des jeux de données de test** pour l'analyse d'intentions (datasets d'entraînement).

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **entités & orchestration**. Détient l'API de formation (formations, promotions, matières, inscriptions), stocke les analyses de référentiel et les programmes générés, applique les quotas, assure la **pseudonymisation RGPD** des auteurs, orchestre les jobs de génération et enregistre le catalogue des skills de correction. Il ne fait jamais tourner les modèles lui-même.
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — génération LLM (datasets, extraction/génération de programme, synchronisation Google Classroom) et callbacks signés vers le back.
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — héberge et exécute les skills de correction de copies (cloud) et les opérations de synchronisation Classroom.
- **Humain (professeur)** : ✅ **validation finale des notes et corrections** — non automatisable par conception.

## Prérequis / activation
- Organisation authentifiée ; espace (serveur) rattaché.
- Pour Google Classroom : domaine éducation + autorisation OAuth adéquate.
- Pour la correction de copies : skills de correction déployés (côté MCP) puis enregistrés dans le catalogue.

## Limites connues & roadmap
- Référentiels acceptés en **texte ou URL** (upload PDF/DOCX à venir).
- Génération multi-matière **séquentielle** aujourd'hui (parallèle prévu).
- Chaînage automatique des skills de correction **à venir** (aujourd'hui chaque skill est lançable seul) ; la lecture de copie (vision) ne fonctionne pas en mode « éco ».
- Synchronisation Classroom limitée en volume (traitement asynchrone à venir).

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Structure de formation : API `/api/training/*` (formations/promotions/matières/inscriptions), port des matières `docs/rfc/RFC-061-subjects-port.md` + admin e-commerce ; guide `docs/guides/training-matieres-front-companion.md`.
- Program builder multi-matière : `docs/rfc/RFC-084-PROGRAM-BUILDER-MULTI-MATIERE-EXTRACTION.md`, `docs/rfc/RFC-080-EXPERT-QUESTION-RESPONSES.md`, Classroom `docs/rfc/RFC-083-MCP-GOOGLE-CLASSROOM-SERVER.md` ; flux `docs/guides/INDEX-EXPERTS-PROGRAM-FLOW.md`.
- Correction de copies (6 skills, validation humaine) : `docs/rfc/RFC-101-EDUSCOL-EXTRACTION-SKILL.md`, `docs/skills/INSTRUCTIONS-SKILLS-CORRECTION-COPIES.md`.
- Datasets de test : `docs/rfc/RFC-040-TRAINING-DATASET-APIV2.md`. Conformité PII : `docs/rfc/RFC-073-BATCH-PII-COMPLIANCE.md`.
- ⚠️ Note rédacteurs : le plan interne parle de « RFC-023 (Phase 1a) » pour ce domaine, mais **aucune RFC-023 n'existe dans `docs/rfc/`** ; le domaine Formation est réparti sur RFC-061/084/099-101/040. Numérotation à trancher avant publication.
