# Liste des Tools à Migrer vers n8n

> **Version**: 1.0
> **Date**: 2025-12-04
> **Référence**: AUDIT_TOOLS_MCP_VS_N8N.md v2.0

## Résumé

| Catégorie | À Migrer | À Garder (MCP) | À Supprimer |
|-----------|----------|----------------|-------------|
| Administration | 0 | 5 | 0 |
| Audio/Vocal | 3 | 0 | 0 |
| Communication | 2 | 0 | 0 |
| Data Analysis | 2 | 0 | 0 |
| Documents | 7 | 0 | 0 |
| General | 4 | 0 | 0 |
| Google Calendar | 12 | 0 | 0 |
| Google Contacts | 2 | 0 | 0 |
| Google Drive | 19 | 0 | 0 |
| Google Gmail | 13 | 0 | 0 |
| LLM/AI | 6 | 0 | 0 |
| NLP Processing | 3 | 0 | 0 |
| Productivity | 1 | 0 | 0 |
| Research | 4 | 0 | 1 |
| Storage | 2 | 0 | 0 |
| Transformation | 2 | 0 | 0 |
| Visual Media | 3 | 0 | 0 |
| **TOTAL** | **85** | **5** | **1** |

---

## Tools à Garder dans MCP (5)

Ces tools sont internes à la plateforme et ne nécessitent pas de migration.

| Tool ID | Nom | Catégorie | Justification |
|---------|-----|-----------|---------------|
| `invitation_analytics` | Analytics Invitations | administration | Interne plateforme |
| `user_management` | Gestion des utilisateurs | administration | Interne plateforme |
| `owner_dashboard` | Mon Organisation | administration | Interne plateforme |
| `news_editor` | News Editor | administration | Interne plateforme |
| `onboarding_manager` | Onboarding Manager | administration | Interne plateforme |

---

## Tools à Supprimer (1)

| Tool ID | Nom | Catégorie | Raison |
|---------|-----|-----------|--------|
| `youtube_search_tool` | Youtube Search | research | Doublon avec `youtube_searcher_tool` |

---

## Tools à Migrer vers n8n (85)

### Audio/Vocal (3 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 1 | `speaker_identifier_tool` | Speaker Identifier | Identification de locuteurs (diarization) | HTTP Request → Whisper/AssemblyAI |
| 2 | `text_to_speech_tool` | Text To Speech | Conversion texte vers parole | ElevenLabs / Google TTS node |
| 3 | `transcriber_tool` | Transcriber | Transcription audio vers texte | Whisper / AssemblyAI node |

### Communication (2 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 4 | `email_imap` | Compte Email | Gestion emails via IMAP/SMTP | IMAP / SMTP nodes natifs |
| 5 | `linkedin` | LinkedIn | Analyse réseau LinkedIn | LinkedIn node + HTTP Request |

### Data Analysis (2 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 6 | `csv_processor_tool` | CSV Processor | Traitement et analyse CSV | Spreadsheet File node |
| 7 | `graph_builder_tool` | Graph Builder | Construction de graphiques | QuickChart / Chart.js via HTTP |

### Documents (7 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 8 | `docx_extractor_tool` | Docx Extractor | Extraction texte/tables DOCX | HTTP → Mistral OCR / docxtemplater |
| 9 | `entity_extractor_tool` | Entity Extractor | Extraction d'entités | LLM node (OpenAI/Anthropic) |
| 10 | `get_pdf_extractor_tool` | PDF Extractor Factory | Extraction PDF | pdf-toolkit node |
| 11 | `get_pdf_layout_translator_tool` | PDF Layout Translator | Traduction avec layout | Mathpix workflow (à créer) |
| 12 | `html_extractor_tool` | HTML Extractor | Extraction HTML | HTTP Request + HTML parser |
| 13 | `metadata_extractor_tool` | Metadata Extractor | Extraction métadonnées | Custom workflow |
| 14 | `pdf_extractor_tool` | PDF Extractor | Extraction PDF | pdf-toolkit / Mistral OCR |
| 15 | `table_extractor_tool` | Table Extractor | Extraction tableaux | Mistral OCR / Mathpix |

### General (4 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 16 | `bulk_url_processor_tool` | Bulk URL Processor | Traitement URLs en masse | SplitInBatches + HTTP Request |
| 17 | `cost_calculator_tool` | Cost Calculator | Calcul des coûts | Function node + Code |
| 18 | `usage_tracker_tool` | Usage Tracker | Suivi d'utilisation | n8n execution history |
| 19 | `web_scraper_tool` | Web Scraper | Scraping web | HTTP Request + HTML Extract |

### Google Calendar (12 tools) - OAuth Token Injection

| # | Tool ID | Nom | Description | Workflow n8n |
|---|---------|-----|-------------|--------------|
| 20 | `bulk_calendar_creator_tool` | Bulk Calendar Creator | Création événements en masse | Loop + HTTP Request |
| 21 | `calendar_attendee_manager` | Calendar Attendee Manager | Gestion participants | HTTP Request + PATCH |
| 22 | `calendar_checker_tool` | Calendar Checker | Vérification calendrier | HTTP Request → GET events |
| 23 | `calendar_conflict_resolver` | Calendar Conflict Resolver | Résolution conflits | HTTP + Logic node |
| 24 | `calendar_creator_tool` | Calendar Creator | Création événements | HTTP Request → POST events |
| 25 | `calendar_event_deleter` | Calendar Event Deleter | Suppression événements | HTTP Request → DELETE |
| 26 | `calendar_event_reader` | Calendar Event Reader | Lecture événements | HTTP Request → GET event |
| 27 | `calendar_event_searcher` | Calendar Event Searcher | Recherche événements | HTTP Request → GET + query |
| 28 | `calendar_event_updater` | Calendar Event Updater | Mise à jour événements | HTTP Request → PUT/PATCH |
| 29 | `calendar_freebusy_finder` | Calendar Free/Busy Finder | Recherche disponibilités | HTTP Request → freebusy |
| 30 | `calendar_list_manager` | Calendar List Manager | Liste des calendriers | HTTP Request → calendarList |
| 31 | `google_calendar_connector` | Google Calendar Connector | Connexion OAuth | **Géré par MCP** (token injection) |

### Google Contacts (2 tools) - OAuth Token Injection

| # | Tool ID | Nom | Description | Workflow n8n |
|---|---------|-----|-------------|--------------|
| 32 | `google_contacts` | Google Contacts | Gestion contacts | HTTP Request → People API |
| 33 | `google_contacts_connector` | Google Contacts Connector | Connexion OAuth | **Géré par MCP** (token injection) |

### Google Drive (19 tools) - OAuth Token Injection

| # | Tool ID | Nom | Description | Workflow n8n |
|---|---------|-----|-------------|--------------|
| 34 | `docs_creator_tool` | Docs Creator | Création Google Docs | HTTP Request → Docs API |
| 35 | `drive_cancel_sync` | Drive Cancel Sync | Annulation sync | Logic node + state |
| 36 | `drive_copy_file` | Drive Copy File | Copie fichiers | HTTP Request → POST copy |
| 37 | `drive_create_file` | Drive Create File | Création fichiers | HTTP Request → POST files |
| 38 | `drive_create_folder` | Drive Create Folder | Création dossiers | HTTP Request → POST folder |
| 39 | `drive_delete_file` | Drive Delete File | Suppression fichiers | HTTP Request → DELETE |
| 40 | `drive_download_file` | Drive Download File | Téléchargement | HTTP Request → GET content |
| 41 | `drive_get_file` | Drive Get File | Info fichier | HTTP Request → GET file |
| 42 | `drive_get_permissions` | Drive Get Permissions | Permissions fichier | HTTP Request → GET permissions |
| 43 | `drive_get_sync_status` | Drive Get Sync Status | Statut sync | Logic node + state |
| 44 | `drive_list_files` | Drive List Files | Liste fichiers | HTTP Request → GET files |
| 45 | `drive_list_folder_contents` | Drive List Folder Contents | Contenu dossier | HTTP Request → GET children |
| 46 | `drive_remove_permission` | Drive Remove Permission | Retrait permission | HTTP Request → DELETE perm |
| 47 | `drive_search_files` | Drive Search Files | Recherche fichiers | HTTP Request → GET + q= |
| 48 | `drive_share_file` | Drive Share File | Partage fichier | HTTP Request → POST perm |
| 49 | `drive_start_sync` | Drive Start Sync | Démarrage sync | Workflow avec état |
| 50 | `drive_update_file` | Drive Update File | Mise à jour fichier | HTTP Request → PATCH |
| 51 | `drive_upload_file` | Drive Upload File | Upload fichier | HTTP Request → POST upload |
| 52 | `google_drive_connector` | Google Drive Connector | Connexion OAuth | **Géré par MCP** (token injection) |

### Google Gmail (13 tools) - OAuth Token Injection

| # | Tool ID | Nom | Description | Workflow n8n |
|---|---------|-----|-------------|--------------|
| 53 | `gmail_attachment_downloader` | Gmail Attachment Downloader | Téléchargement pièces jointes | HTTP Request → GET attachment |
| 54 | `gmail_draft_lister` | Gmail Draft Lister | Liste brouillons | HTTP Request → GET drafts |
| 55 | `gmail_email_manager` | Gmail Email Manager | Gestion emails | HTTP Request → POST modify |
| 56 | `gmail_email_reader` | Gmail Email Reader | Lecture email | HTTP Request → GET message |
| 57 | `gmail_filter_by_labels` | Gmail Filter by Labels | Filtrage par labels | HTTP Request → GET + labelIds |
| 58 | `gmail_label_creator` | Gmail Label Creator | Création labels | HTTP Request → POST labels |
| 59 | `gmail_label_deleter` | Gmail Label Deleter | Suppression labels | HTTP Request → DELETE label |
| 60 | `gmail_label_lister` | Gmail Label Lister | Liste labels | HTTP Request → GET labels |
| 61 | `gmail_label_updater` | Gmail Label Updater | Mise à jour labels | HTTP Request → PATCH label |
| 62 | `gmail_message_searcher_tool` | Gmail Message Searcher | Recherche messages | HTTP Request → GET + q= |
| 63 | `gmail_search_advanced` | Gmail Search Advanced | Recherche avancée | HTTP Request → GET + operators |
| 64 | `gmail_sender_tool` | Gmail Sender | Envoi emails | HTTP Request → POST send |
| 65 | `google_gmail_connector` | Google Gmail Connector | Connexion OAuth | **Géré par MCP** (token injection) |

### LLM/AI (6 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 66 | `code_generator_tool` | Code Generator | Génération de code | OpenAI / Anthropic node |
| 67 | `llm_summarizer_tool` | LLM Summarizer | Résumé par LLM | OpenAI / Anthropic node |
| 68 | `quiz_generator_tool` | Quiz Generator | Génération de quiz | OpenAI node + template |
| 69 | `summarizer_tool` | Summarizer | Résumé de texte | OpenAI / Anthropic node |
| 70 | `syllabus_generator_tool` | Syllabus Generator | Génération de syllabus | OpenAI node + template |
| 71 | `text_generator_tool` | Text Generator | Génération de texte | OpenAI / Anthropic node |

### NLP Processing (3 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 72 | `language_detector_tool` | Language Detector | Détection de langue | HTTP → languagedetect API |
| 73 | `text_classifier_tool` | Text Classifier | Classification texte | OpenAI / Anthropic node |
| 74 | `tokenizer_tool` | Tokenizer | Tokenisation | Function node (tiktoken) |

### Productivity (1 tool)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 75 | `notion` | Notion | Intégration Notion | Notion node natif |

### Research (4 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 76 | `academic_searcher_tool` | Academic Searcher | Recherche académique | HTTP → arXiv / Semantic Scholar |
| 77 | `google_searcher_tool` | Google Searcher | Recherche Google | SerpAPI / Google Search node |
| 78 | `news_searcher_tool` | News Searcher | Recherche actualités | NewsAPI / HTTP Request |
| 79 | `youtube_searcher_tool` | Youtube Searcher | Recherche YouTube | YouTube node natif |

### Storage (2 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 80 | `bulk_cloud_uploader_tool` | Bulk Cloud Uploader | Upload cloud en masse | S3 / GCS node + Loop |
| 81 | `vector_store_tool` | Vector Store | Stockage vectoriel | Pinecone / Qdrant node |

### Transformation (2 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 82 | `json_transformer_tool` | JSON Transformer | Transformation JSON | Set / Code node |
| 83 | `text_embedder_tool` | Text Embedder | Génération embeddings | OpenAI Embeddings node |

### Visual Media (3 tools)

| # | Tool ID | Nom | Description | Équivalent n8n |
|---|---------|-----|-------------|----------------|
| 84 | `get_image_ocr_tool` | Image OCR Factory | OCR image | OCR.space / Mistral Vision |
| 85 | `image_embedder_tool` | Image Embedder | Embeddings image | CLIP / OpenAI Vision |
| 86 | `image_generator_tool` | Image Generator | Génération d'images | DALL-E / Stable Diffusion node |

---

## Notes Techniques

### Token OAuth Injection

Pour tous les tools Google (Calendar, Contacts, Drive, Gmail), le workflow est :

```
MCP Server                           n8n
    │                                 │
    ├─ Récupère token OAuth (Redis)   │
    │                                 │
    ├─ Appel webhook ─────────────────┤
    │   {                             │
    │     "access_token": "...",      │
    │     "user_id": "...",           │
    │     "action": "list_files",     │
    │     "params": {...}             │
    │   }                             │
    │                                 │
    │                         ┌───────┴────────┐
    │                         │ HTTP Request   │
    │                         │ + Bearer Token │
    │                         └───────┬────────┘
    │                                 │
    │                         ┌───────┴────────┐
    │                         │ Google API     │
    │                         └───────┬────────┘
    │                                 │
    │◄──────────── Résultat ──────────┤
```

### Priorités de Migration

**Phase 1 - Quick Wins** (Nodes natifs n8n)
- Notion, LinkedIn, YouTube, IMAP/SMTP
- OpenAI, Anthropic (LLM)
- Spreadsheet, S3, Pinecone

**Phase 2 - HTTP Request Standard**
- Research tools (SerpAPI, NewsAPI, arXiv)
- Audio tools (Whisper, ElevenLabs)
- OCR tools (OCR.space, Mistral)

**Phase 3 - Google Services (Token Injection)**
- Gmail (13 tools)
- Drive (19 tools)
- Calendar (12 tools)
- Contacts (2 tools)

**Phase 4 - Workflows Complexes**
- Mathpix integration (équipe n8n)
- Workflows multi-étapes (PDF translation, bulk operations)

---

## Checklist de Migration par Tool

Pour chaque tool migré, vérifier :

- [ ] Workflow n8n créé et testé
- [ ] Webhook configuré
- [ ] Documentation mise à jour
- [ ] Tool MCP marqué comme déprécié
- [ ] Tests E2E validés
- [ ] Performance comparable ou meilleure
