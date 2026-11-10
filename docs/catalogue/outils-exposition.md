# Outils n8n — proposition d'exposition

> Document pour **azy.daily#642**. Généré par `scripts/catalogue/generer_doc_exposition.py`, régénérable.

**237 outils** publiés au catalogue `mcp/tools/registry`. Trafic cumulé sur **41 relevés quotidiens**.

## Ce que ce document fait, et ne fait pas

La colonne **exposition** est une **proposition**, classée par un signal observable, et chaque ligne porte le fait qui l'a produite. **Une équipe peut contester une classe entière en une phrase** — c'est le but. Les cas réellement ambigus sont marqués `À TRANCHER` plutôt que rangés d'autorité.

⚠️ **Ce document ne parle pas de sécurité.** Décider de ne pas exposer un outil le retire des propositions faites à un agent ; **ça ne l'empêche pas d'être déclenché** par quiconque atteint le port. Mesuré :

```
authentification sur le nœud Webhook     236 / 237 sans aucune
vérification d'une signature entrante    1  (youtube-extract, et c'est tout)
identité lue dans le corps, NON vérifiée 117 / 237  (user_id, guild_id, tenant_id)
```

Les deux questions — *que proposer* et *qui peut déclencher* — sont distinctes. Ce document ne traite que la première.

## Proposition, en un coup d'œil

| exposition | n |
|---|---:|
| **OUI** | 169 |
| **À TRANCHER** | 2 |
| **NON** | 66 |

### Détail des `NON`

| classe | n | pourquoi |
|---|---:|---|
| plomberie | 24 | appelé par Torah Router |
| brique technique | 11 | composant interne, jamais choisi par un agent |
| configuration | 8 | lit ou écrit de la configuration |
| notification émise | 7 | le système émet, personne n'appelle |
| callback entrant | 5 | un service externe nous appelle |
| administration | 4 | provisionne ou configure la plateforme |
| cron / sync | 4 | déclenché par une horloge |
| oauth / redirect | 3 | redirection de navigateur, pas un outil |

## Ce qu'il faut savoir avant de se positionner

- **38 outils effectuent un appel réellement mutant** — jugé sur le verbe **et** un chemin de mutation, jamais sur le simple POST. *(Beaucoup de nos lectures sont en POST : compter les POST donnait 148 et c'était faux.)*
- ⚠️ **162 outils sur 237 n'ont aucune description écrite.** Leur explication ci-dessous est **déduite du code** (services appelés, étapes) et marquée *(déduite)*. Elle décrit la **mécanique**, pas l'**intention** — à relire par l'équipe qui connaît l'outil. C'est le vrai obstacle du chantier : on ne peut pas décider d'exposer un outil dont personne ne sait ce qu'il fait.
- ⚠️ **Je ne peux pas dire lesquels exigent un secret de l'appelant.** Quatre tentatives, quatre résultats faux : `subscription-checkout-create` lit sa clé Stripe dans `$json.stripe_key` (donc BYOT) et aucune détection ne l'a vu. Un examen du JSON d'un workflow ne dit pas ce qui est **vérifié**. **Question ouverte pour api :** pour chaque appel mutant, votre backend exige-t-il quelque chose ?

## Les outils proposés à l'exposition

| outil | méth. | ce qu'il fait | effets | mode | surfaces | exéc. |
|---|---|---|---|---|---|---:|
| `torah-get-page-translations` | POST | appelle /api/talmud/page/…/…/segments… ; étapes : Get Page (API) *(déduite)* | lecture seule | synchrone | chat, voice_realtime | 179 |
| `torah-job-status` | POST | appelle /api/v2/jobs/…, outil torah-result-get ; étapes : Job ID Valid?, Get Job (API), Check Job Status, Needs Result? *(déduite)* | lecture seule | synchrone | chat | 152 |
| `torah-book-commentators` | GET | appelle /api/books/…/…/commentators… ; étapes : Lire Paramètres, Paramètres Valides ?, Lister (API), Répondre *(déduite)* | lecture seule | synchrone | chat, voice_realtime | 48 |
| `pdf-ocr` | POST | Extraction de texte depuis PDF/images via OCR multi-providers | lecture seule | callback | chat, email | 45 |
| `torah-translate-page` | POST | appelle /api/talmud/page/…/…/segments…, /api/v2/jobs, outil torah-router ; étapes : Check Existing Translations, Analyze Existing, Needs Translation?, *(déduite)* | lecture seule | synchrone | chat | 9 |
| `torah-vocalization` | POST | appelle /api/v2/jobs, outil torah-vocalization-worker ; étapes : Has Items?, Create Job, Launch Worker (async), Build Error Response *(déduite)* | lecture seule | synchrone | — | 9 |
| `mcp-gmail` | POST | Serveur Gmail : lire, chercher, envoyer, classer les messages, fils et brouillons du compte Google de l'utilisateur. | lecture seule | synchrone | — | 8 |
| `discord-get-balance` | POST | appelle /api/ecommerce/webhook/account ; étapes : Call Credits API, API Success? *(déduite)* | lecture seule | synchrone | chat | 2 |
| `llm-intention` | POST | Analyse l'intention utilisateur via LLM et propose des actions appropriees. | lecture seule | synchrone | — | 2 |
| `office-extractor` | POST | appelle …, http://webs.local:9998/tika, http://webs.local:9998/unpack ; étapes : Download File, Tika Extract, Has Base64?, Decode Base64 *(déduite)* | lecture seule | synchrone | chat, email | 2 |
| `mcp-calendar` | POST | Serveur Google Agenda : lister les agendas de l'utilisateur et créer, lire, chercher, modifier ou supprimer ses événements. | lecture seule | synchrone | — | 1 |
| `academic-searcher` | POST | appelle /v1/paper/search ; étapes : Error: No Query, Semantic Scholar Search *(déduite)* | lecture seule | synchrone | — | 0 |
| `analyze-feedback` | POST | Analyse le feedback utilisateur pour extraire des insights actionnables et ajuster le comportement de l'assistant IA. | lecture seule | synchrone | — | 0 |
| `analyze-message` | POST | Analyse complète d'un message (sentiment, intentions, entités, priorité, langue) | lecture seule | synchrone | — | 0 |
| `anthropic-list-skills` | POST | Liste les Skills Anthropic disponibles (pré-construits et custom). | lecture seule | synchrone | — | 0 |
| `audio-transcription` | POST | appelle …, /v1/audio/transcriptions, /api/v1/audio/transcribe ; étapes : Requête valide ?, Répondre 400, Répondre 202, Refus avant appel ? *(déduite)* | lecture seule | callback | — | 0 |
| `books-job-status` | POST | appelle /api/v2/jobs/… ; étapes : Fetch Job Status *(déduite)* | lecture seule | synchrone | — | 0 |
| `books-translate` | POST | appelle /api/books/…/…, /api/v2/jobs, outil books-translation-worker ; étapes : Fetch Chapter, Extract Verses, Verses to Translate?, Create Job (API) *(déduite)* | lecture seule | synchrone | — | 0 |
| `books-translate-commentaries` | POST | appelle /api/books/…/…/commentaries, /api/jobs, outil books-commentary-worker ; étapes : Fetch Commentaries, Extract Commentaries, To Translate?, Crea *(déduite)* | lecture seule | synchrone | — | 0 |
| `bulk-url-processor` | POST | appelle … ; étapes : Error: No URLs, Split URLs, Prepare Batch, Fetch URLs *(déduite)* | lecture seule | synchrone | — | 0 |
| `cart-add` | POST | Ajoute des produits au panier d'un utilisateur Discord. | écrit | synchrone | — | 0 |
| `cart-apply-coupon` | POST | Applique un code de réduction au panier d'un utilisateur Discord. | lecture seule | synchrone | — | 0 |
| `cart-checkout` | POST | Crée une session de paiement Stripe pour le panier d'un utilisateur Discord. | écrit | synchrone | — | 0 |
| `cart-checkout-cancel` | POST | appelle /api/ecommerce/branding/… ; étapes : Extract Params, Has Branding Params?, Get Branding, Generate Cancel HTML With Branding *(déduite)* | lecture seule | synchrone | — | 0 |
| `cart-checkout-success` | POST | appelle /api/ecommerce/checkout/confirm, /api/discord/send-dm ; étapes : Extract Session ID, Check Error, Call API Confirm Checkout, Check API Error *(déduite)* | écrit | synchrone | — | 0 |
| `cart-clear` | POST | Vide entièrement le panier d'un utilisateur Discord. | DELETE | synchrone | — | 0 |
| `cart-get` | POST | Lit le contenu du panier d'un utilisateur Discord. | lecture seule | synchrone | — | 0 |
| `cart-remove` | POST | Retire des articles du panier d'un utilisateur Discord. | DELETE | synchrone | — | 0 |
| `cart-remove-coupon` | POST | Retire le code de réduction appliqué au panier. | DELETE | synchrone | — | 0 |
| `cart-update` | POST | Modifie la quantité d'un article du panier. | lecture seule | synchrone | — | 0 |
| `category-detect` | POST | appelle /v1/messages ; étapes : Ruleset Type?, JSON Mapping Detection, LLM Classification *(déduite)* | lecture seule | synchrone | — | 0 |
| `chart-generator` | POST | appelle https://quickchart.io/chart ; étapes : Error: No Data, Build Chart Config, Generate Chart *(déduite)* | lecture seule | synchrone | — | 0 |
| `claude-call-stream-with-skills` | POST | Streaming Claude avec Skills API - le plus complexe des 4 webhooks. | lecture seule | callback | — | 0 |
| `code-generator` | POST | aucun appel sortant ; étapes : Error: No Prompt, OpenAI Generate Code *(déduite)* | lecture seule | synchrone | — | 0 |
| `content-analyzer` | POST | Analyse le contenu image/document et retourne un plan de pipeline pour azy.mcp PipelineExecutor. | lecture seule | synchrone | — | 0 |
| `credits-check` | POST | appelle /api/ecommerce/subscription/credits/… ; étapes : Get Credits, Build Response *(déduite)* | lecture seule | synchrone | — | 0 |
| `credits-refund` | POST | appelle /api/ecommerce/subscription/credits/…/refund ; étapes : Refund Credits, Build Response *(déduite)* | écrit | synchrone | — | 0 |
| `csv-processor` | POST | appelle … ; étapes : Error Invalid Input, Is Base64?, Decode Base64, Fetch CSV URL *(déduite)* | lecture seule | synchrone | — | 0 |
| `data-lookup-enrich` | POST | aucun appel sortant ; étapes : Source Router, OpenFoodFacts Lookup, CIQUAL Lookup (Phase 2), Custom API Lookup *(déduite)* | lecture seule | synchrone | — | 0 |
| `discord-billing-portal` | POST | Cree une session Stripe Billing Portal pour gerer l'abonnement. | lecture seule | synchrone | — | 0 |
| `discord-get-credits` | POST | appelle /api/ecommerce/webhook/account ; étapes : Call Credits API, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `discord-get-plans` | GET | appelle /v1/products ; étapes : Get Stripe Config (Redis), Check Project, Project Found?, Get Stripe Products *(déduite)* | lecture seule | synchrone | — | 0 |
| `discord-get-subscriber` | POST | appelle /api/ecommerce/webhook/account ; étapes : Get Subscriber (API), Subscriber Found? *(déduite)* | lecture seule | synchrone | — | 0 |
| `discord-get-transactions` | GET | aucun appel sortant ; étapes : Get Subscriber, Check Subscriber, Subscriber Found?, Count Transactions *(déduite)* | lecture seule | synchrone | — | 0 |
| `discord-subscribe` | POST | Cree une session Stripe Checkout pour un abonnement. | écrit | synchrone | — | 0 |
| `discord/dm-resolve` | POST | Résout le personae pour un DM élève. Orchestre 2 appels API puis dispatch selon le statut. | lecture seule | synchrone | — | 0 |
| `discord/student-context` | POST | Enriches LLM prompt with student info (name, promo, exchange history) to personalize responses. Uses RedisSessionStore for session memory. | lecture seule | synchrone | — | 0 |
| `discord/student-recap` | POST | appelle /api/education/help-requests, /v1/messages ; étapes : Get Conversation History (Redis), Process History, Include Help Requests?, Fetch Help Re *(déduite)* | lecture seule | synchrone | — | 0 |
| `discord/student/verify` | POST | appelle /api/discord/webhook/student-verify, /api/discord/commands/set-permissions, /api/discord/commands/create-channel, /api/discord/webhook/student *(déduite)* | écrit | synchrone | — | 0 |
| `discord/subject-detect` | POST | appelle /v1/messages ; étapes : LLM Classify Subject *(déduite)* | lecture seule | synchrone | — | 0 |
| `discord/subject-switch` | POST | Changement de contexte matiere - When chatbot-core receives `/matiere maths`, it calls azy.mcp to reload the correct expert + RAG + session. | lecture seule | synchrone | — | 0 |
| `document-cancel` | POST | appelle /api/v2/jobs/… ; étapes : Get Job Status, Check Can Cancel, Can Cancel?, PATCH Cancelled *(déduite)* | lecture seule | synchrone | — | 0 |
| `document-job-status` | GET | appelle /api/v2/jobs/…, … ; étapes : Lire Paramètres, Paramètre Valide ?, Lire Job (API), Examiner Statut *(déduite)* | lecture seule | synchrone | — | 0 |
| `document-structure-extract` | POST | appelle /v1/messages ; étapes : Build LLM Prompt, Claude API Extract *(déduite)* | lecture seule | synchrone | — | 0 |
| `document-translate-worker` | POST | appelle /api/v2/jobs, /api/v2/jobs/…, …, /v1/messages ; étapes : Create Job (API), Prepare Response, Set Processing, Route by Type *(déduite)* | lecture seule | callback | — | 0 |
| `documents/estimate` | POST | Estime le nombre de tokens, pages et credits requis pour traiter un document. | lecture seule | synchrone | — | 0 |
| `documents/process` | POST | appelle … ; étapes : Has Callback URL?, Check Valid (Async), Check Valid (Sync), Route and Process (Async) *(déduite)* | lecture seule | callback | — | 0 |
| `documents/save` | POST | appelle /v3/files ; étapes : Error: Invalid Input, Prepare File, Has Google Auth?, Error: No Auth *(déduite)* | lecture seule | synchrone | — | 0 |
| `documents/validate` | POST | aucun appel sortant *(déduite)* | lecture seule | synchrone | — | 0 |
| `docx-extractor` | POST | Extrait le contenu textuel de fichiers DOCX avec support pour differents formats de sortie. | lecture seule | synchrone | — | 0 |
| `email-imap` | POST | ⚠️ | lecture seule | synchrone | — | 0 |
| `entity-comment` | POST | Manages comments on entities (recipes, documents, courses, etc.) stored in PostgreSQL. | lecture seule | synchrone | — | 0 |
| `entity-extractor` | POST | aucun appel sortant ; étapes : Error: No Text, OpenAI Extract Entities *(déduite)* | lecture seule | synchrone | — | 0 |
| `entity-list` | POST | appelle 
  …/api/entities/…/user/…, /api/entities/…/… ; étapes : Error: Validation, Action Switch, API: List Entities, API: Get Entity *(déduite)* | DELETE | synchrone | — | 0 |
| `entity-rating` | POST | Manages entity ratings (recipes, documents, courses, etc.) stored in PostgreSQL. | DELETE | synchrone | — | 0 |
| `entity-save` | POST | RFC-049 Entity Storage Architecture + RFC-053 bot_id isolation. Saves entities to both MongoDB (via API) AND Qdrant. Uses same UUID for entity_id and  | DELETE, écrit | synchrone | — | 0 |
| `entity-search` | POST | Recherche semantique multi-tenant dans Qdrant avec enrichissement MongoDB optionnel. RFC-049 + RFC-053 (bot_id isolation). | lecture seule | synchrone | — | 0 |
| `entity-social-actions` | POST | appelle …/…, …, …/…/favorite ; étapes : Get Entity, Check Entity, Entity Found?, Switch Action *(déduite)* | DELETE | synchrone | — | 0 |
| `games-add` | POST | appelle /api/n8n/games/add ; étapes : API Add Game *(déduite)* | écrit | synchrone | — | 0 |
| `games-analysis` | POST | appelle /api/n8n/games/analysis ; étapes : API Update Analysis *(déduite)* | lecture seule | synchrone | — | 0 |
| `games-lichess` | POST | appelle /api/n8n/games/lichess ; étapes : API Mark Lichess *(déduite)* | lecture seule | synchrone | — | 0 |
| `games-list` | POST | appelle /api/n8n/games ; étapes : API List Games *(déduite)* | lecture seule | synchrone | — | 0 |
| `gemini-image` | POST | Generateur d'images IA via Google Gemini/Vertex AI avec support multi-operations (generate, extractCharacter, createCharacterSheet, composeScene). | lecture seule | synchrone | — | 0 |
| `google-drive-ocr` | POST | appelle /v3/files, /v3/files/…, /v1/ocr ; étapes : Build Error, Route Operation, List Drive Files, Download File *(déduite)* | lecture seule | synchrone | — | 0 |
| `google-searcher` | POST | appelle https://serpapi.com/search ; étapes : Error: No Query, SerpAPI Search *(déduite)* | lecture seule | synchrone | — | 0 |
| `guild-create-room` | POST | appelle /api/guilds/…/rooms ; étapes : Create Room via API, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `guild-get-rooms` | POST | appelle /api/guilds/…/rooms ; étapes : Get Rooms from API, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `guild-update-prompt` | POST | appelle /api/guilds/…/prompts ; étapes : Update Prompt via API, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `guild/member/leave` | POST | appelle /api/ecommerce/webhook/guild-member-leave ; étapes : Extract IDs, Return Credits to Pool *(déduite)* | lecture seule | synchrone | — | 0 |
| `html-extractor` | POST | appelle … ; étapes : Error Invalid Input, Is URL?, Fetch HTML URL, Prepare URL HTML *(déduite)* | lecture seule | synchrone | — | 0 |
| `image-generator` | POST | appelle /v1/images/generations, … ; étapes : Prepare Image Request, Error: Validation, Has Callback URL?, Store Job Context *(déduite)* | lecture seule | callback | — | 0 |
| `job-status/:job_id` | GET | aucun appel sortant ; étapes : Get Job from Redis, Job Exists? *(déduite)* | lecture seule | synchrone | — | 0 |
| `json-transformer` | POST | aucun appel sortant ; étapes : Error: No Data, Transform JSON *(déduite)* | lecture seule | synchrone | — | 0 |
| `knowledge-graph` | POST | appelle … ; étapes : Has documentPath?, Has documentUrl?, Has document.data?, Read Local File *(déduite)* | lecture seule | synchrone | — | 0 |
| `language-detector` | POST | Detecte la langue d'un texte et retourne des informations detaillees. | lecture seule | synchrone | — | 0 |
| `learning-adapt-difficulty` | POST | appelle /api/v1/progress/… ; étapes : Error: Missing Params, Get Learner Progress, Calculate Difficulty *(déduite)* | lecture seule | synchrone | — | 0 |
| `learning-badge-check` | POST | appelle /api/v1/progress/…, /api/v1/badges/award ; étapes : Error: Missing Params, Get Learner Progress, Check Badge Criteria, Has New Badges? *(déduite)* | lecture seule | synchrone | — | 0 |
| `learning-evaluate-photo` | POST | appelle /v1/messages, /api/v1/submissions/…/grade ; étapes : Error: Missing Params, Evaluate Photo with Vision, Save Grade *(déduite)* | lecture seule | synchrone | — | 0 |
| `learning-generate` | POST | aucun appel sortant ; étapes : Store Job in Redis, Push to Queue *(déduite)* | lecture seule | synchrone | — | 0 |
| `lichess-webhook` | GET | Page de confirmation OAuth Lichess | lecture seule | synchrone | — | 0 |
| `linkedin` | POST | aucun appel sortant ; étapes : Route Action, Post Text, Post with Image, Error: Invalid Action *(déduite)* | lecture seule | synchrone | — | 0 |
| `llm-call-stream` | POST | Streaming LLM multi-provider avec pattern callback asynchrone. | lecture seule | callback | — | 0 |
| `llm-summarizer` | POST | Summarizes text using multiple LLM providers (Anthropic, OpenAI, Mistral). | lecture seule | synchrone | — | 0 |
| `llm-url-extractor` | POST | Extracts structured information from a URL using LLM analysis. | lecture seule | synchrone | — | 0 |
| `mathpix` | POST | OCR mathematique via Mathpix API. Convertit images de formules/equations en LaTeX, MathML, AsciiMath. | lecture seule | synchrone | — | 0 |
| `mcp-classroom` | POST | Serveur Google Classroom : cours, devoirs, copies rendues, notes, élèves, enseignants, annonces et thèmes du compte Google de l'utilisateur. | lecture seule | synchrone | — | 0 |
| `mcp-contacts` | POST | Serveur Google Contacts : lire, créer, modifier, chercher et grouper les fiches de contact du compte Google de l'utilisateur. | lecture seule | synchrone | — | 0 |
| `mcp-drive` | POST | Serveur Google Drive : lister, chercher, lire, créer, déplacer et partager les fichiers et dossiers du compte Google de l'utilisateur. | lecture seule | synchrone | — | 0 |
| `mcp-google-maps` | POST | appelle /api/geocode/json, /api/directions/json, /api/place/textsearch/json, /api/place/details/json, /v1/currentConditions:lookup ; étapes : Route Op *(déduite)* | lecture seule | synchrone | — | 0 |
| `mcp-test-echo` | POST | aucun appel sortant *(déduite)* | lecture seule | synchrone | — | 0 |
| `member-join` | POST | appelle /api/ecommerce/webhook/credits/init ; étapes : Check Validation Error, Call API Init Credits, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `mention` | POST | appelle /api/ecommerce/branding/guild/… ; étapes : Is Valid?, Get Project Mapping, Has Project?, Merge Project + Data *(déduite)* | lecture seule | synchrone | — | 0 |
| `microsoft-learn` | POST | appelle /api/mcp ; étapes : Initialize MCP Session, Init OK?, Send Initialized, Prepare Tool Call *(déduite)* | lecture seule | synchrone | — | 0 |
| `news-searcher` | POST | appelle /api/v4/search ; étapes : Error: No Query, GNews Search *(déduite)* | lecture seule | synchrone | — | 0 |
| `orders-get` | POST | appelle /api/ecommerce/orders/…/… ; étapes : Check Validation Error, Call API Get Order *(déduite)* | lecture seule | synchrone | — | 0 |
| `orders-list` | POST | appelle /api/ecommerce/orders/… ; étapes : Check Validation Error, Call API List Orders *(déduite)* | lecture seule | synchrone | — | 0 |
| `private-channel-request` | POST | Vérifie si un channel privé existe, sinon le crée via Discord API et l'enregistre dans api-backend. | poste sur Discord | synchrone | — | 0 |
| `product-discovery` | POST | appelle /v1/chat/completions ; étapes : Check Validation Error, LLM Batch Reasoning, Check Parse Error, Search Products (Parallel) *(déduite)* | lecture seule | synchrone | — | 0 |
| `products-persist` | POST | appelle /api/ecommerce/products/bulk-create ; étapes : Check Validation Error, Call API Bulk Create *(déduite)* | lecture seule | synchrone | — | 0 |
| `profile-address-add` | POST | Ajoute une adresse de livraison au profil d'un utilisateur Discord. | lecture seule | synchrone | — | 0 |
| `profile-address-remove` | POST | Supprime une adresse de livraison du profil. | DELETE | synchrone | — | 0 |
| `profile-address-set-default` | POST | Définit une adresse de livraison comme adresse par défaut. | lecture seule | synchrone | — | 0 |
| `profile-address-update` | POST | Modifie une adresse de livraison existante. | lecture seule | synchrone | — | 0 |
| `profile-get` | POST | appelle /api/ecommerce/profile/… ; étapes : Check Validation Error, Call API Get Profile *(déduite)* | lecture seule | synchrone | — | 0 |
| `profile-update` | POST | appelle /api/ecommerce/profile/… ; étapes : Check Validation Error, Call API Update Profile *(déduite)* | lecture seule | synchrone | — | 0 |
| `progress-delete` | POST | appelle /api/n8n/progress/delete ; étapes : API Delete User Data *(déduite)* | écrit | synchrone | — | 0 |
| `progress-get` | POST | appelle /api/n8n/progress, /api/user/…, /api/user/…/rating-history ; étapes : Get Progress, Needs Lichess?, Get Lichess Profile, Get Lichess Elo Histo *(déduite)* | lecture seule | synchrone | — | 0 |
| `progress-update` | POST | appelle /api/n8n/progress/sessions, /api/n8n/progress/lessons, /api/n8n/progress/badges, /api/n8n/progress/preferences, /api/n8n/progress/lichess ; ét *(déduite)* | lecture seule | synchrone | — | 0 |
| `quiz-generator` | POST | Genere des quiz educatifs a partir de texte, sujet ou URL. | lecture seule | synchrone | — | 0 |
| `rag-delete-source` | POST | Deletes RAG source chunks from Qdrant. | lecture seule | synchrone | — | 0 |
| `rag-ingest` | POST | Ingestion RAG conforme RFC-099. | lecture seule | callback | — | 0 |
| `rag-process-source` | POST | Processes RAG sources (files/links) for indexation. | lecture seule | synchrone | — | 0 |
| `recipes-generate` | POST | appelle /v1/messages, /v1/chat/completions ; étapes : Error: Validation, Switch Provider, Call Anthropic, Call OpenAI *(déduite)* | lecture seule | synchrone | — | 0 |
| `recipes-shopping` | POST | appelle /api/shopping-list/…, /api/shopping-list/…/items, /api/shopping-list/…/from-recipe/…, /api/shopping-list/item/…, /api/shopping-list/…/clear ;  *(déduite)* | DELETE | synchrone | — | 0 |
| `recipes-timer` | POST | appelle /api/recipes/timer, /api/recipes/timers/…, /api/recipes/timer/… ; étapes : Error: Validation, Action Switch, API: Create Timer, API: List Time *(déduite)* | DELETE | synchrone | — | 0 |
| `script-detector` | POST | appelle /v1/chat/completions ; étapes : Build Error, Switch Mode, Analyze Text (Unicode), OpenAI Vision (Image) *(déduite)* | lecture seule | synchrone | — | 0 |
| `scriptorium-qc-review` | POST | appelle /v1/messages, /v1/chat/completions, /v1beta/models/gemini-2.5-pro:generateContent ; étapes : Anthropic?, OpenAI?, Google?, Mistral? *(déduite)* | lecture seule | synchrone | — | 0 |
| `shipping-calculate` | POST | appelle /api/ecommerce/shipping/…/calculate ; étapes : Check Validation Error, Call API Calculate Shipping *(déduite)* | lecture seule | synchrone | — | 0 |
| `shipping-select` | POST | appelle /api/ecommerce/shipping/…/select ; étapes : Check Validation Error, Call API Select Shipping *(déduite)* | lecture seule | synchrone | — | 0 |
| `speaker-identifier` | POST | appelle /v2/upload, /v2/transcript, /v2/transcript/… ; étapes : Build Error, Is Base64?, Prepare Base64, Upload to AssemblyAI *(déduite)* | lecture seule | synchrone | — | 0 |
| `stripe-subscription-cancel` | POST | appelle /api/discord/send-dm, /api/ecommerce/branding/… ; étapes : Extract Data, Data Valid?, Check Result, User Found? *(déduite)* | lecture seule | synchrone | — | 0 |
| `stripe-subscription-failure` | POST | appelle /api/discord/send-dm, /api/subscriptions/status, /api/payments/log ; étapes : Extract Data, Data Valid?, Check Result, User Found? *(déduite)* | lecture seule | synchrone | — | 0 |
| `stripe-subscription-renewal` | POST | appelle /api/subscribers/by-subscription/…, /api/subscribers/…, /api/payments/log ; étapes : Extract Data, Data Valid?, Calculate Credits, Subscriber  *(déduite)* | lecture seule | synchrone | — | 0 |
| `stripe-subscription-success` | POST | appelle /api/discord/send-dm, /api/payments/log, /api/subscriptions/activate ; étapes : Extract Data, Data Valid?, Check Update, Send Discord DM *(déduite)* | lecture seule | synchrone | — | 0 |
| `subscription-change-plan` | POST | appelle /v1/subscriptions/… ; étapes : Get Stripe Config (Redis), Prepare Request, Project Found?, Get Subscription *(déduite)* | lecture seule | synchrone | — | 0 |
| `subscription-checkout-create` | POST | appelle /v1/checkout/sessions ; étapes : Get Stripe Config (Redis), Check Project, Project Found?, Call Stripe API *(déduite)* | écrit | synchrone | — | 0 |
| `summarizer` | POST | Summarizes text using Anthropic Claude. | lecture seule | synchrone | — | 0 |
| `syllabus-generator` | POST | Genere des syllabus educatifs complets avec modules, lecons, objectifs et evaluations. | lecture seule | synchrone | — | 0 |
| `table-extractor` | POST | appelle /v1/chat/completions, … ; étapes : Error: No Data, Has Callback URL?, Store Job Context, Mistral OCR (Async) *(déduite)* | lecture seule | callback | — | 0 |
| `text-classifier` | POST | aucun appel sortant ; étapes : Error: Missing Params, Route Classification Mode, Single Label Classification, Multi Label Classification *(déduite)* | lecture seule | synchrone | — | 0 |
| `text-generator` | POST | Generates text using OpenAI GPT models. | lecture seule | synchrone | — | 0 |
| `text-to-speech` | POST | Convert text to speech audio using OpenAI TTS API. | lecture seule | synchrone | — | 0 |
| `torah-batch-translate` | POST | appelle /api/source-texts, …/messages, /api/translate-with-comments, /api/webhooks/1454872701331177606/0qZXNfqF45UU9epTnYbXJMd3nCWtUwfMU1p_E6sTQbnP7Ik *(déduite)* | poste sur Discord | synchrone | — | 0 |
| `torah-discord-message` | POST | appelle /api/talmud/text/…/…, …/messages ; étapes : Discord Message Webhook, Extract Intent (Regex), Intent Valid?, API - Get Talmud Text *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-discord-translate` | POST | appelle /api/translations/search, /api/v2/jobs, outil torah-translate-worker ; étapes : Can Search Cache?, Search Cache, Check Cache Result, Cache Hit *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-discord-translate-pivot` | POST | appelle /v1/messages, /v1/chat/completions, /api/translations/save, … ; étapes : Needs Pivot?, Claude Step 1: To English, Extract Step 1, Step 1 OK? *(déduite)* | écrit | synchrone | — | 0 |
| `torah-generate-pdf` | POST | appelle /api/webhooks/14…/messages, /api/translations/search, /api/pdf/generate/complete, …/messages ; étapes : Generate PDF Webhook, Parameters Valid *(déduite)* | poste sur Discord | synchrone | — | 0 |
| `torah-get-chapter` | POST | appelle /api/torah/chapters/…/… ; étapes : Get Chapter from API, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-get-page` | POST | appelle /api/torah/pages/…/… ; étapes : Get Page from API, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-get-section` | POST | appelle … ; étapes : Build API URL, Get Section from API, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-index` | POST | appelle /api/torah/index ; étapes : Index to Qdrant via API, Index Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-list` | POST | appelle /api/talmud/traites, /api/projects ; étapes : Get Traites, Get Projects, Merge Results *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-list-sections` | POST | appelle /api/torah/sections/… ; étapes : Get Sections from API, API Success? *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-pdf` | POST | appelle … ; étapes : gotenberg.api, Normalize Error, Préparer catalogue, Catalogue gotenberg.api *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-search` | POST | appelle /api/torah/search ; étapes : Search in Qdrant via API, Has Results? *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-sources` | POST | Retourne la liste dynamique des sources Torah | lecture seule | synchrone | — | 0 |
| `torah-submit-review` | POST | appelle …/messages, /api/translations/…/status, outil torah-translate ; étapes : Submit for Review, Review Action, Prepare Review Data, Discord - Revi *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-tanakh-parasha-commentators` | GET | appelle /api/torah/parashiyot/…/commentators… ; étapes : Lire Paramètres, Paramètre Valide ?, Lister (API), Répondre *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-tanakh-parasha-content` | GET | appelle … ; étapes : Lire Paramètres, Paramètres Valides ?, Lire Contenu (API), Répondre *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-tanakh-parasha-get` | GET | appelle /api/torah/parashiyot/… ; étapes : Lire Paramètres, Nom Fourni ?, Lire Parasha (API), Répondre *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-tanakh-parashiot-list` | GET | appelle /api/torah/parashiyot… ; étapes : Lire Paramètres, Lister (API), Répondre *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-translate-chapter` | POST | appelle /api/torah/chapters/…/…, /v1/messages, /api/torah/translations ; étapes : Get Chapter Content, Filter Untranslated Segments, Needs Translation *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-translate-page-worker` | POST | appelle /api/v2/jobs/…, /v1/messages, /v1/chat/completions, /api/translations/save ; étapes : Set In Progress, Pass Data, Split Segments, Loop Segment *(déduite)* | écrit | synchrone | — | 0 |
| `torah-translation-status` | POST | appelle /api/talmud/traite/…/pages, /api/talmud/traites, … ; étapes : Traite Specified?, Get Traite Status, Get Global Status, Send to Discord? *(déduite)* | lecture seule | synchrone | — | 0 |
| `torah-validate-text` | POST | appelle /api/sefaria/texts/search ; étapes : Search Torah API *(déduite)* | lecture seule | synchrone | — | 0 |
| `veo-video` | POST | appelle … ; étapes : Has required input?, Error: Missing Input, Has Callback URL?, Store Callback Info *(déduite)* | lecture seule | callback | — | 0 |
| `web-search` | POST | Performs web search using multiple LLM providers with grounding. | lecture seule | synchrone | — | 0 |
| `youtube-extract` | POST | Transcrit une vidéo YouTube — fournie par URL ou trouvée par recherche — puis, facultativement, en extrait une information structurée selon une consig | lecture seule | callback | — | 0 |
| `youtube-searcher` | POST | Cherche des vidéos, chaînes ou playlists sur YouTube et rend leurs métadonnées (titre, description, chaîne, date, vignette). | lecture seule | synchrone | — | 0 |

## ⚠️ À trancher

| outil | ce qu'il fait | pourquoi c'est ambigu | exéc. |
|---|---|---|---:|
| `credits-get` | appelle /api/ecommerce/webhook/account, /api/ecommerce/webhook/account/logs, /api/ecommerce/stripe/admin/projects/… ; étapes : Ext *(déduite)* | appelle un endpoint /admin/ mais sert peut-être un utilisateur | 57 |
| `create-free-subscriber` | Crée un abonné gratuit avec crédits initiaux | provisionne un abonné : inscription utilisateur ou acte d'admin ? | 0 |

## Les outils proposés à la NON-exposition

<details><summary>Déplier la liste complète</summary>

| outil | classe | ce qu'il fait | motif | effets | exéc. |
|---|---|---|---|---|---:|
| `stripe-register-project` | administration | Enregistre les secrets Stripe d'un projet via API backend. | provisionne ou configure la plateforme | lecture seule | 107 |
| `torah-save` | plomberie | appelle /api/translations/save ; étapes : Save to API *(déduite)* | appelé par Torah Router | écrit | 96 |
| `server-sync` | cron / sync | appelle /api/discord/webhook/server-sync ; étapes : Sync to Backend, Données valides ? *(déduite)* | déclenché par une horloge | lecture seule | 90 |
| `torah-translate` | plomberie | appelle /v1/messages, outil llm-call-messages ; étapes : Needs Structured?, Claude Structured, Extract Structu *(déduite)* | appelé par Torah Review and Validation, Torah Ro | lecture seule | 48 |
| `credits-debit` | plomberie | appelle /api/ecommerce/subscription/credits/…/debit ; étapes : Debit Credits, Build Response *(déduite)* | appelé par DISCORD - Credits Debit | écrit | 36 |
| `llm-call-messages` | plomberie | Appel LLM synchrone multi-provider avec pattern BYOT (Bring Your Own Token). | appelé par Torah Translate Simple, YOUTUBE - Tra | lecture seule | 29 |
| `torah-router` | plomberie | appelle /api/v2/jobs, /api/v2/jobs/…, outil torah-chunk, outil torah-translate, outil torah-save ; étapes : Ne *(déduite)* | appelé par Torah Translate Page | lecture seule | 21 |
| `claude-call-with-skills` | plomberie | Appel Claude avec Skills API via Batch Processing. | appelé par Torah Batch Dispatcher | lecture seule | 17 |
| `torah-translate-batch` | plomberie | appelle /api/v2/jobs, outil claude-call-with-skills, /api/v2/jobs/… ; étapes : Create Job, Build Requests, Sub *(déduite)* | appelé par Torah Router | lecture seule | 17 |
| `torah-translation-callback` | plomberie | appelle /api/v2/jobs/…, /api/v10/channels/…/messages, /api/translations/save-batch, …/xadd ; étapes : Split Re *(déduite)* | appelé par Torah Batch Dispatcher | poste sur Discord, écrit | 16 |
| `mcp-tenant-resolve` | brique technique | Resolves Discord guild_id to tenant_id + package + models (RFC-079). | composant interne, jamais choisi par un agent | lecture seule | 13 |
| `torah-vocalization-worker` | plomberie | appelle /api/vocalization/search, /v1/chat/completions, /api/vocalization/save, /api/commentaries/nekudot, /ap *(déduite)* | appelé par Torah Vocalization (Nekudot) | écrit | 9 |
| `torah-result-store` | plomberie | aucun appel sortant ; étapes : POST Store, GET Retrieve, Store Result, Retrieve Result *(déduite)* | appelé par Torah Translate Worker | lecture seule | 6 |
| `plugin-config-get` | configuration | appelle /api/guilds/…/plugin-config ; étapes : Get Plugin Config from API, Success? *(déduite)* | lit ou écrit de la configuration | lecture seule | 4 |
| `text-embedder` | brique technique | Genere des embeddings de texte via l'API OpenAI pour une utilisation en RAG, recherche semantique, etc. | composant interne, jamais choisi par un agent | lecture seule | 2 |
| `tools-enricher` | brique technique | Enrichir automatiquement les metadonnees des tools n8n et les indexer dans Qdrant | composant interne, jamais choisi par un agent | lecture seule | 1 |
| `alert-anomaly-detected` | notification émise | Polls Redis Stream for reconciliation.anomaly events | le système émet, personne n'appelle | lecture seule | 0 |
| `books-commentary-worker` | plomberie | appelle /api/v2/jobs/…, /v1/messages, /v1/chat/completions, /api/translations/save, … ; étapes : Has Callback  *(déduite)* | appelé par Books Translate Commentaries | écrit | 0 |
| `books-translation-worker` | plomberie | appelle /api/v2/jobs/…, /v1/messages, /v1/chat/completions, /api/translations/save, /api/jobs/… ; étapes : Has *(déduite)* | appelé par Books Translation Manager | écrit | 0 |
| `classroom-sync-status` | cron / sync | aucun appel sortant ; étapes : Get Task Status *(déduite)* | déclenché par une horloge | lecture seule | 0 |
| `config/branding` | configuration | appelle /api/ecommerce/branding/guild/…, /api/config/branding ; étapes : Is Valid?, Get Project Mapping, Has P *(déduite)* | lit ou écrit de la configuration | lecture seule | 0 |
| `config/help` | configuration | appelle /api/ecommerce/branding/guild/…, /api/config/help ; étapes : Is Valid?, Get Project Mapping, Has Proje *(déduite)* | lit ou écrit de la configuration | lecture seule | 0 |
| `config/help/reset` | configuration | appelle /api/ecommerce/branding/guild/…, /api/config/help/reset ; étapes : Is Valid?, Get Project Mapping, Has *(déduite)* | lit ou écrit de la configuration | écrit | 0 |
| `cost-calculator` | brique technique | Calcule le cout d'utilisation des modeles LLM en USD. | composant interne, jamais choisi par un agent | lecture seule | 0 |
| `discord/tenant/settings` | administration | appelle /api/ecommerce/admin/guilds/…/discord-settings ; étapes : Get Discord Settings (Backend) *(déduite)* | provisionne ou configure la plateforme | lecture seule | 0 |
| `document-callback` | callback entrant | appelle /api/document-jobs/…/…, /api/v10/channels/…/messages ; étapes : Update Job Status, Prepare Discord Mes *(déduite)* | un service externe nous appelle | poste sur Discord | 0 |
| `document-result-store` | plomberie | aucun appel sortant ; étapes : Dépôt Valide ?, Redis SET (TTL 1h), Répondre Stocké, Répondre Refus *(déduite)* | appelé par Document Translate Worker | lecture seule | 0 |
| `expert-program-classroom-sync` | cron / sync | appelle …/mcp-classroom, … ; étapes : Check Idempotency, Idempotency Hit?, Is Conflict?, Initialize Context *(déduite)* | déclenché par une horloge | lecture seule | 0 |
| `guild-get-branding` | configuration | appelle /api/guilds/…/branding ; étapes : Get Branding from API, API Success? *(déduite)* | lit ou écrit de la configuration | lecture seule | 0 |
| `guild-get-prompts` | configuration | appelle /api/guilds/…/prompts… ; étapes : Build Query Params, Get Prompts from API, API Success? *(déduite)* | lit ou écrit de la configuration | lecture seule | 0 |
| `guild-update-branding` | configuration | appelle /api/guilds/…/branding ; étapes : Update Branding via API, API Success? *(déduite)* | lit ou écrit de la configuration | lecture seule | 0 |
| `guild/credits/exhausted` | notification émise | appelle /api/discord/users/…/dm, /api/discord/guilds/…/admin-channel ; étapes : Send DM to User, Notify Admin  *(déduite)* | le système émet, personne n'appelle | lecture seule | 0 |
| `guild/register-if-needed` | administration | appelle /api/guild/…/check, /api/guild/register ; étapes : Is Valid?, Check Guild Exists, Already Registered?, *(déduite)* | provisionne ou configure la plateforme | écrit | 0 |
| `image-embedder` | brique technique | Analyse une image via GPT-4o-mini et genere un embedding semantique | composant interne, jamais choisi par un agent | lecture seule | 0 |
| `image-ocr` | plomberie | appelle /v1/ocr ; étapes : Mistral OCR, Build Error *(déduite)* | appelé par Document Translate Worker, MCP - Docu | lecture seule | 0 |
| `jobs/user-cleanup` | cron / sync | appelle /api/admin/document-jobs/stats, /api/admin/document-jobs/cleanup, /api/ecommerce/webhook/account/credi *(déduite)* | déclenché par une horloge | lecture seule | 0 |
| `lichess-auth-callback` | callback entrant | appelle /api/token, /api/account, /api/n8n/oauth/store, /api/n8n/progress/lichess ; étapes : Exchange Token, T *(déduite)* | un service externe nous appelle | lecture seule | 0 |
| `lichess-auth-start` | oauth / redirect | appelle /api/n8n/oauth/store ; étapes : Store Pending Auth, Build Auth URL, Generate Verifier, Hash Challenge *(déduite)* | redirection de navigateur, pas un outil | lecture seule | 0 |
| `lichess-oauth-callback` | callback entrant | Workflow OAuth complet pour Lichess | un service externe nous appelle | lecture seule | 0 |
| `llm-request-validator` | brique technique | Validates user requests against a domain context using LLM (RFC-044). | composant interne, jamais choisi par un agent | lecture seule | 0 |
| `mcp/dataset/generate` | administration | Generer automatiquement des datasets de test pour l'analyse d'intentions | provisionne ou configure la plateforme | lecture seule | 0 |
| `mcp/tools/notify` | notification émise | appelle …/tools/notify ; étapes : Redis XADD Service, Response *(déduite)* | le système émet, personne n'appelle | lecture seule | 0 |
| `metadata-extractor` | brique technique | appelle … ; étapes : Error: No Data, Check Source Type, Fetch URL, Prepare HTML *(déduite)* | composant interne, jamais choisi par un agent | lecture seule | 0 |
| `notif-badge-earned` | notification émise | Polls Redis Stream for badge:earned events | le système émet, personne n'appelle | lecture seule | 0 |
| `notif-course-expiring` | notification émise | Polls Redis Stream for course.access.expiring events | le système émet, personne n'appelle | lecture seule | 0 |
| `notif-level-up` | notification émise | Polls Redis Stream for level:up events | le système émet, personne n'appelle | lecture seule | 0 |
| `oauth-delete` | oauth / redirect | appelle /api/n8n/oauth/delete ; étapes : API Delete OAuth *(déduite)* | redirection de navigateur, pas un outil | écrit | 0 |
| `oauth-get` | oauth / redirect | appelle /api/n8n/oauth ; étapes : API Get OAuth *(déduite)* | redirection de navigateur, pas un outil | lecture seule | 0 |
| `pdf-extractor` | plomberie | appelle … ; étapes : Route Input Type, Download PDF, Extract from URL PDF, Extract from Binary PDF *(déduite)* | appelé par Document Translate Worker | lecture seule | 0 |
| `pdf-layout-translator` | plomberie | appelle /api/v2/jobs, /v1/chat/completions, outil torah-translate-worker, /api/v2/jobs/… ; étapes : Create Job *(déduite)* | appelé par MCP - Documents Process | lecture seule | 0 |
| `plugin-config-update` | configuration | appelle /api/guilds/…/plugin-config ; étapes : Update Plugin Config via API, Success? *(déduite)* | lit ou écrit de la configuration | lecture seule | 0 |
| `private-channel-callback` | callback entrant | appelle /api/channels/private ; étapes : Check Validation Error, Register Channel in API, API Success?, Prepar *(déduite)* | un service externe nous appelle | lecture seule | 0 |
| `qdrant-save` | brique technique | Saves entity data with optional Qdrant vector embedding storage. | composant interne, jamais choisi par un agent | lecture seule | 0 |
| `qdrant-search` | plomberie | Recherche semantique dans Qdrant avec embeddings OpenAI. | appelé par MCP - LLM Intention | lecture seule | 0 |
| `qdrant-similar` | brique technique | appelle /v1/embeddings, …/collections/…/points/search, …/collections/…/points/… ; étapes : Error: Validation,  *(déduite)* | composant interne, jamais choisi par un agent | lecture seule | 0 |
| `recipes-timer-notify` | notification émise | appelle /api/v10/users/@me/channels, /api/v10/channels/…/messages ; étapes : Error: Validation, Create DM Chan *(déduite)* | le système émet, personne n'appelle | poste sur Discord | 0 |
| `stripe-webhook` | callback entrant | appelle /api/ecommerce/stripe/verify/…, /api/ecommerce/webhook/credits/…, /v1/subscriptions/…, /api/ecommerce/ *(déduite)* | un service externe nous appelle | lecture seule | 0 |
| `subscription-result` | plomberie | aucun appel sortant ; étapes : Generate HTML *(déduite)* | appelé par DISCORD - Billing Portal, DISCORD - S | lecture seule | 0 |
| `tokenizer` | brique technique | Estime le nombre de tokens pour un texte donne et calcule l'utilisation du contexte pour differents modeles LL | composant interne, jamais choisi par un agent | lecture seule | 0 |
| `torah-chunk` | plomberie | appelle /v1/messages ; étapes : Needs Chunking?, Prepare Split, Claude Smart Split *(déduite)* | appelé par Torah Router | lecture seule | 0 |
| `torah-document-callback` | plomberie | appelle /api/document-jobs/…/…, /api/v10/channels/…/messages ; étapes : Update Job Status, Prepare Discord Mes *(déduite)* | appelé par MCP-Document-Callback | poste sur Discord | 0 |
| `torah-error` | plomberie | aucun appel sortant ; étapes : Redis Push Error *(déduite)* | appelé par Torah Router | lecture seule | 0 |
| `torah-translate-worker` | plomberie | appelle /api/v2/jobs/…, /v1/messages, /v1/chat/completions, /api/translations/save, outil torah-result-store ; *(déduite)* | appelé par MCP - PDF Layout Translator, Torah Di | écrit | 0 |
| `vector-store` | brique technique | appelle …/collections/…/points, …/collections/…/points/search, …/collections/…/points/delete ; étapes : Route  *(déduite)* | composant interne, jamais choisi par un agent | écrit | 0 |
| `video-transcription` | plomberie | appelle /v1beta/models/…:generateContent ; étapes : Build Error, Transcribe (Gemini) *(déduite)* | appelé par YOUTUBE - Transcribe and Extract | lecture seule | 0 |
| `web-scraper` | plomberie | appelle … ; étapes : Error: No URL, Fetch Page, Extract Content *(déduite)* | appelé par MCP - LLM Intention | lecture seule | 0 |

</details>

---

— équipe n8n
