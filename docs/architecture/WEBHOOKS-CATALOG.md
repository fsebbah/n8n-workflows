# Catalogue des Webhooks Actifs n8n

> **Généré le:** 2026-05-08
> **Total:** 167 webhooks uniques dans 237 workflows actifs

Ce document catalogue tous les webhooks actifs de l'instance n8n, organisés par catégorie fonctionnelle.

---

## Vue d'ensemble

| Catégorie | Nombre | Description |
|-----------|--------|-------------|
| [MCP (Model Context Protocol)](#mcp-model-context-protocol) | 8 | Intégration services Google et outils MCP |
| [Discord](#discord) | 14 | Intégration bot Discord |
| [Stripe / Facturation](#stripe--facturation) | 11 | Paiements et abonnements |
| [E-commerce / Panier](#e-commerce--panier) | 14 | Gestion panier et commandes |
| [Documents](#documents) | 11 | Extraction et traitement de documents |
| [Éducation / Learning](#éducation--learning) | 8 | Fonctionnalités éducatives |
| [IA / LLM](#ia--llm) | 12 | Génération de contenu IA |
| [Recherche](#recherche) | 7 | Moteurs de recherche |
| [Profil / Utilisateur](#profil--utilisateur) | 11 | Gestion des profils |
| [Médias](#médias) | 8 | Images, vidéos, audio |
| [Guild (Serveurs Discord)](#guild-serveurs-discord) | 10 | Gestion des serveurs |
| [Credits](#credits) | 3 | Système de crédits |
| [Entity](#entity) | 5 | Gestion des entités |
| [Recettes](#recettes) | 5 | Cuisine et recettes |
| [Livres](#livres) | 3 | Traduction de livres |
| [Progression](#progression) | 3 | Suivi de progression |
| [Jeux](#jeux) | 5 | Jeux (Lichess) |
| [RAG](#rag) | 2 | Retrieval Augmented Generation |
| [Configuration](#configuration) | 3 | Configuration système |
| [Autres](#autres) | 24 | Webhooks divers |

---

## MCP (Model Context Protocol)

Webhooks pour l'intégration avec les services Google via le protocole MCP.

| Webhook | Description | Format |
|---------|-------------|--------|
| `mcp-gmail` | Opérations Gmail (envoi, lecture, recherche) | `POST /webhook/mcp-gmail` |
| `mcp-calendar` | Opérations Google Calendar | `POST /webhook/mcp-calendar` |
| `mcp-drive` | Opérations Google Drive | `POST /webhook/mcp-drive` |
| `mcp-contacts` | Opérations Google Contacts | `POST /webhook/mcp-contacts` |
| `mcp-classroom` | Opérations Google Classroom | `POST /webhook/mcp-classroom` |
| `mcp-google-maps` | Recherche Google Maps | `POST /webhook/mcp-google-maps` |
| `mcp-test-echo` | Test d'écho MCP | `POST /webhook/mcp-test-echo` |
| `mcp/tools/registry` | Registre des outils MCP | `POST /webhook/mcp/tools/registry` |
| `mcp/tools/notify` | Notifications MCP | `POST /webhook/mcp/tools/notify` |
| `mcp/dataset/generate` | Génération de datasets | `POST /webhook/mcp/dataset/generate` |

> **Voir aussi:** [MCP Classroom Integration](../mcp/MCP_CLASSROOM_INTEGRATION.md)

---

## Discord

Intégration avec Discord pour le bot et les interactions utilisateurs.

| Webhook | Description |
|---------|-------------|
| `discord-registry` | Registre des commandes Discord |
| `discord-billing-portal` | Portail de facturation |
| `discord-get-balance` | Solde utilisateur |
| `discord-get-credits` | Crédits utilisateur |
| `discord-get-plans` | Plans disponibles |
| `discord-get-transactions` | Historique transactions |
| `discord/student-context` | Contexte étudiant |
| `discord/student/verify` | Vérification étudiant |
| `discord/subject-detect` | Détection de sujet |
| `discord/subject-switch` | Changement de sujet |
| `discord/tenant/settings` | Paramètres tenant |
| `mention` | Mention utilisateur |
| `member-join` | Arrivée d'un membre |
| `private-channel-request` | Demande de canal privé |
| `private-channel-unknown` | Canal privé inconnu |

---

## Stripe / Facturation

Gestion des paiements et abonnements via Stripe.

| Webhook | Description |
|---------|-------------|
| `stripe-webhook` | Webhook principal Stripe |
| `stripe-register-project` | Enregistrement projet |
| `stripe-subscription-cancel` | Annulation abonnement |
| `stripe-subscription-failure` | Échec paiement |
| `stripe-subscription-renewal` | Renouvellement |
| `stripe-subscription-success` | Succès abonnement |
| `subscription-change-plan` | Changement de plan |
| `subscription-checkout-create` | Création checkout |
| `subscription-result` | Résultat abonnement |
| `orders-get` | Récupérer une commande |
| `orders-list` | Liste des commandes |

---

## E-commerce / Panier

Gestion du panier d'achat et du processus de commande.

| Webhook | Description |
|---------|-------------|
| `cart-get` | Récupérer le panier |
| `cart-add` | Ajouter au panier |
| `cart-remove` | Retirer du panier |
| `cart-update` | Mettre à jour |
| `cart-clear` | Vider le panier |
| `cart-apply-coupon` | Appliquer un coupon |
| `cart-remove-coupon` | Retirer un coupon |
| `cart-checkout` | Lancer le checkout |
| `cart-checkout-cancel` | Annuler checkout |
| `cart-checkout-success` | Succès checkout |
| `shipping-calculate` | Calcul frais de port |
| `shipping-select` | Sélection livraison |
| `product-discovery` | Découverte produits |
| `products-persist` | Persistence produits |

---

## Documents

Extraction et traitement de documents (PDF, DOCX, HTML, etc.).

| Webhook | Description |
|---------|-------------|
| `pdf-extractor` | Extraction PDF |
| `pdf-layout-translator` | Traduction layout PDF |
| `pdf-ocr` | OCR sur PDF |
| `docx-extractor` | Extraction DOCX |
| `html-extractor` | Extraction HTML |
| `document-callback` | Callback document |
| `document-cancel` | Annulation document |
| `document-structure-extract` | Extraction structure |
| `document-translate-worker` | Worker traduction |
| `documents/estimate` | Estimation document |
| `documents/save` | Sauvegarde document |
| `documents/validate` | Validation document |
| `table-extractor` | Extraction de tableaux |

---

## Éducation / Learning

Fonctionnalités éducatives et d'apprentissage.

| Webhook | Description |
|---------|-------------|
| `learning-generate` | Génération contenu éducatif |
| `learning-adapt-difficulty` | Adaptation difficulté |
| `learning-badge-check` | Vérification badges |
| `learning-evaluate-photo` | Évaluation photo |
| `quiz-generator` | Génération de quiz |
| `syllabus-generator` | Génération de syllabus |
| `expert-program-classroom-sync` | Sync programme expert |
| `academic-searcher` | Recherche académique |

---

## IA / LLM

Intégration des modèles de langage et génération de contenu IA.

| Webhook | Description |
|---------|-------------|
| `llm-request-validator` | Validation requêtes LLM |
| `llm-intention` | Détection d'intention |
| `llm-summarizer` | Résumé automatique |
| `llm-url-extractor` | Extraction d'URLs |
| `text-generator` | Génération de texte |
| `code-generator` | Génération de code |
| `chart-generator` | Génération de graphiques |
| `summarizer` | Résumé de texte |
| `text-embedder` | Embedding de texte |
| `image-embedder` | Embedding d'images |
| `analyze-message` | Analyse de message |
| `analyze-feedback` | Analyse de feedback |

---

## Recherche

Moteurs de recherche et agrégation de contenu.

| Webhook | Description |
|---------|-------------|
| `google-searcher` | Recherche Google |
| `web-search` | Recherche web générique |
| `youtube-searcher` | Recherche YouTube |
| `news-searcher` | Recherche actualités |
| `academic-searcher` | Recherche académique |
| `microsoft-learn` | Recherche Microsoft Learn |
| `web-scraper` | Scraping web |

---

## Profil / Utilisateur

Gestion des profils utilisateurs et adresses.

| Webhook | Description |
|---------|-------------|
| `profile-get` | Récupérer profil |
| `profile-update` | Mettre à jour profil |
| `profile-address-add` | Ajouter adresse |
| `profile-address-remove` | Supprimer adresse |
| `profile-address-update` | Modifier adresse |
| `profile-address-set-default` | Adresse par défaut |
| `oauth-delete` | Suppression OAuth |
| `create-free-subscriber` | Créer abonné gratuit |
| `jobs/user-cleanup` | Nettoyage utilisateur |
| `server-sync` | Synchronisation serveur |
| `tokenizer` | Tokenisation |

---

## Médias

Traitement d'images, vidéos et audio.

| Webhook | Description |
|---------|-------------|
| `image-generator` | Génération d'images |
| `image-ocr` | OCR sur images |
| `gemini-image` | Analyse image Gemini |
| `google-drive-ocr` | OCR via Google Drive |
| `video-transcription` | Transcription vidéo |
| `speaker-identifier` | Identification locuteur |
| `metadata-extractor` | Extraction métadonnées |
| `mathpix` | OCR mathématique |

---

## Guild (Serveurs Discord)

Gestion des serveurs Discord (guilds).

| Webhook | Description |
|---------|-------------|
| `guild-create-room` | Créer un salon |
| `guild-get-rooms` | Liste des salons |
| `guild-get-branding` | Branding du serveur |
| `guild-update-branding` | Modifier branding |
| `guild-get-prompts` | Prompts du serveur |
| `guild-update-prompt` | Modifier prompt |
| `guild/credits/exhausted` | Crédits épuisés |
| `guild/member/leave` | Départ d'un membre |
| `guild/register-if-needed` | Enregistrement serveur |
| `alert-anomaly-detected` | Alerte anomalie |

---

## Credits

Système de gestion des crédits utilisateurs.

| Webhook | Description |
|---------|-------------|
| `credits-check` | Vérifier solde |
| `credits-debit` | Débiter crédits |
| `credits-refund` | Rembourser crédits |

---

## Entity

Gestion des entités (commentaires, notes, actions sociales).

| Webhook | Description |
|---------|-------------|
| `entity-list` | Liste des entités |
| `entity-save` | Sauvegarder entité |
| `entity-comment` | Commenter |
| `entity-rating` | Noter |
| `entity-social-actions` | Actions sociales |
| `entity-extractor` | Extraction d'entités |

---

## Recettes

Application de recettes de cuisine.

| Webhook | Description |
|---------|-------------|
| `recipes-generate` | Génération de recettes |
| `recipes-shopping` | Liste de courses |
| `recipes-timer` | Minuteur |
| `recipes-timer-notify` | Notification minuteur |
| `recipes-youtube` | Recettes YouTube |

---

## Livres

Traduction et traitement de livres.

| Webhook | Description |
|---------|-------------|
| `books-translate` | Traduction de livre |
| `books-translation-worker` | Worker de traduction |
| `books-commentary-worker` | Worker de commentaires |

---

## Progression

Suivi de progression utilisateur.

| Webhook | Description |
|---------|-------------|
| `progress-get` | Récupérer progression |
| `progress-update` | Mettre à jour |
| `progress-delete` | Supprimer progression |

---

## Jeux

Intégration jeux (principalement échecs).

| Webhook | Description |
|---------|-------------|
| `games-list` | Liste des parties |
| `games-add` | Ajouter une partie |
| `games-analysis` | Analyse de partie |
| `games-lichess` | Intégration Lichess |
| `lichess-auth-start` | Démarrer auth Lichess |
| `lichess-oauth-callback` | Callback OAuth |
| `lichess-webhook` | Webhook Lichess |

---

## RAG

Retrieval Augmented Generation pour la base de connaissances.

| Webhook | Description |
|---------|-------------|
| `rag-process-source` | Traiter une source |
| `rag-delete-source` | Supprimer une source |
| `knowledge-graph` | Graphe de connaissances |

---

## Configuration

Configuration et paramètres système.

| Webhook | Description |
|---------|-------------|
| `config/branding` | Configuration branding |
| `config/help` | Configuration aide |
| `config/help/reset` | Reset aide |
| `plugin-config-get` | Récupérer config plugin |
| `plugin-config-update` | Modifier config plugin |

---

## Autres

Webhooks divers non catégorisés.

| Webhook | Description |
|---------|-------------|
| `Youtube` | Formulaire RSS YouTube |
| `content-analyzer` | Analyse de contenu |
| `cost-calculator` | Calcul de coûts |
| `data-lookup-enrich` | Enrichissement données |
| `json-transformer` | Transformation JSON |
| `linkedin` | Intégration LinkedIn |
| `notif-badge-earned` | Notification badge |
| `notif-course-expiring` | Notification expiration |
| `notif-level-up` | Notification level up |
| `script-detector` | Détection de script |
| `scriptorium-qc-review` | Revue QC Scriptorium |

---

## URLs des Webhooks

Tous les webhooks sont accessibles via :

```
POST http://pi6.local:5678/webhook/{webhook-path}
```

**Exemples :**
- `POST http://pi6.local:5678/webhook/mcp-gmail`
- `POST http://pi6.local:5678/webhook/discord-registry`
- `POST http://pi6.local:5678/webhook/cart-checkout`

---

## Notes

1. **Authentification** : La plupart des webhooks MCP utilisent le pattern BYOT (Bring Your Own Token) - le token OAuth est passé dans le body de la requête.

2. **Environnements** :
   - **Local (pi6)** : `http://pi6.local:5678/webhook/`
   - **Docker (host2)** : `http://host2.local:5678/webhook/`

3. **Documentation liée** :
   - [Architecture Système](./SYSTEM-ARCHITECTURE.md)
   - [MCP Classroom Integration](../mcp/MCP_CLASSROOM_INTEGRATION.md)
   - [Google Services Integration](./GOOGLE-SERVICES-INTEGRATION.md)
