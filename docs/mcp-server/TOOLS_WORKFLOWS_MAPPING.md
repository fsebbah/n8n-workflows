# Mapping Tools MCP → Workflows n8n

> **Référence** : [TOOLS_MIGRATION_LIST.md](./TOOLS_MIGRATION_LIST.md)
> **Date** : 2025-12-09

## Résumé Global

| Catégorie | Tools MCP | Workflows n8n | MCP Servers | Statut |
|-----------|-----------|---------------|-------------|--------|
| Google Gmail | 13 | 8 + 6 (tool) + 1 MCP | `Gmail_MCP_Server_3605.json` | **En cours** |
| Google Drive | 19 | 3 + ? (tool) + 1 MCP | `MCP_Drive_Server.json` | **En cours** |
| Google Calendar | 12 | 8 + ? (tool) + 1 MCP | `MCP_Calendar_Server.json` | **En cours** |
| Google Contacts | 2 | 0 + 1 MCP | `MCP_Contacts_Server.json` | **En cours** |
| Communication (IMAP) | 2 | 8 | - | **Disponible** |
| Microsoft Outlook | - | 4 | - | **Disponible** |
| LLM/AI | 6 | 8 (OpenAI) | - | **Disponible** |
| Productivity | 1 | 3 (Notion) | - | **Disponible** |
| Research | 4 | 1 (YouTube) + 13 (LinkedIn) | - | **Partiel** |
| Storage | 2 | 3 (AWS S3) | - | **Partiel** |
| Audio/Vocal | 3 | 0 | - | **À créer** |
| Documents | 7 | 0 | - | **À créer** |
| NLP Processing | 3 | 0 | - | **À créer** |
| Visual Media | 3 | 0 | - | **À créer** |

---

## Tableau Détaillé par Tool

### Google Gmail (13 tools)

| # | Tool ID | Nom | Workflow n8n | MCP Server | Statut |
|---|---------|-----|--------------|------------|--------|
| 53 | `gmail_attachment_downloader` | Attachment Downloader | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 54 | `gmail_draft_lister` | Draft Lister | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 55 | `gmail_email_manager` | Email Manager | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 56 | `gmail_email_reader` | Email Reader | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 57 | `gmail_filter_by_labels` | Filter by Labels | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 58 | `gmail_label_creator` | Label Creator | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 59 | `gmail_label_deleter` | Label Deleter | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 60 | `gmail_label_lister` | Label Lister | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 61 | `gmail_label_updater` | Label Updater | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 62 | `gmail_message_searcher_tool` | Message Searcher | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 63 | `gmail_search_advanced` | Search Advanced | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 64 | `gmail_sender_tool` | Sender | `workflows/Gmail/` | `Gmail_MCP_Server_3605.json` | ✅ MCP |
| 65 | `google_gmail_connector` | Connector | - | Token Injection | ✅ MCP |

**Workflows disponibles** : 8 dans `Gmail/` + 6 dans `Gmailtool/`

---

### Google Drive (19 tools)

| # | Tool ID | Nom | Workflow n8n | MCP Server | Statut |
|---|---------|-----|--------------|------------|--------|
| 34 | `docs_creator_tool` | Docs Creator | - | `MCP_Drive_Server.json` | ✅ MCP |
| 35 | `drive_cancel_sync` | Cancel Sync | - | - | ⏳ À créer |
| 36 | `drive_copy_file` | Copy File | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 37 | `drive_create_file` | Create File | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 38 | `drive_create_folder` | Create Folder | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 39 | `drive_delete_file` | Delete File | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 40 | `drive_download_file` | Download File | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 41 | `drive_get_file` | Get File | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 42 | `drive_get_permissions` | Get Permissions | - | `MCP_Drive_Server.json` | ✅ MCP |
| 43 | `drive_get_sync_status` | Get Sync Status | - | - | ⏳ À créer |
| 44 | `drive_list_files` | List Files | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 45 | `drive_list_folder_contents` | List Folder | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 46 | `drive_remove_permission` | Remove Permission | - | `MCP_Drive_Server.json` | ✅ MCP |
| 47 | `drive_search_files` | Search Files | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 48 | `drive_share_file` | Share File | - | `MCP_Drive_Server.json` | ✅ MCP |
| 49 | `drive_start_sync` | Start Sync | - | - | ⏳ À créer |
| 50 | `drive_update_file` | Update File | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 51 | `drive_upload_file` | Upload File | `workflows/Googledrive/` | `MCP_Drive_Server.json` | ✅ MCP |
| 52 | `google_drive_connector` | Connector | - | Token Injection | ✅ MCP |

**Workflows disponibles** : 3 dans `Googledrive/` + ? dans `Googledrivetool/`

---

### Google Calendar (12 tools)

| # | Tool ID | Nom | Workflow n8n | MCP Server | Statut |
|---|---------|-----|--------------|------------|--------|
| 20 | `bulk_calendar_creator_tool` | Bulk Creator | - | - | ⏳ À créer |
| 21 | `calendar_attendee_manager` | Attendee Manager | - | `MCP_Calendar_Server.json` | ✅ MCP |
| 22 | `calendar_checker_tool` | Checker | `workflows/Googlecalendar/` | `MCP_Calendar_Server.json` | ✅ MCP |
| 23 | `calendar_conflict_resolver` | Conflict Resolver | - | - | ⏳ À créer |
| 24 | `calendar_creator_tool` | Creator | `workflows/Googlecalendar/` | `MCP_Calendar_Server.json` | ✅ MCP |
| 25 | `calendar_event_deleter` | Event Deleter | `workflows/Googlecalendar/` | `MCP_Calendar_Server.json` | ✅ MCP |
| 26 | `calendar_event_reader` | Event Reader | `workflows/Googlecalendar/` | `MCP_Calendar_Server.json` | ✅ MCP |
| 27 | `calendar_event_searcher` | Event Searcher | `workflows/Googlecalendar/` | `MCP_Calendar_Server.json` | ✅ MCP |
| 28 | `calendar_event_updater` | Event Updater | `workflows/Googlecalendar/` | `MCP_Calendar_Server.json` | ✅ MCP |
| 29 | `calendar_freebusy_finder` | Free/Busy Finder | - | `MCP_Calendar_Server.json` | ✅ MCP |
| 30 | `calendar_list_manager` | List Manager | `workflows/Googlecalendar/` | `MCP_Calendar_Server.json` | ✅ MCP |
| 31 | `google_calendar_connector` | Connector | - | Token Injection | ✅ MCP |

**Workflows disponibles** : 8 dans `Googlecalendar/` + ? dans `Googlecalendartool/`

---

### Google Contacts (2 tools)

| # | Tool ID | Nom | Workflow n8n | MCP Server | Statut |
|---|---------|-----|--------------|------------|--------|
| 32 | `google_contacts` | Contacts | - | `MCP_Contacts_Server.json` | ✅ MCP |
| 33 | `google_contacts_connector` | Connector | - | Token Injection | ✅ MCP |

---

### Communication - IMAP/Email (2 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 4 | `email_imap` | Compte Email | `workflows/Emailreadimap/` (8 workflows) | ✅ Disponible |
| 5 | `linkedin` | LinkedIn | `workflows/Linkedin/` (13 workflows) | ✅ Disponible |

**Workflows IMAP disponibles** :
- `1050_Emailreadimap_Send.json`
- `1284_Emailreadimap_Markdown_Send.json` (AI Autoresponder)
- `1588_Emailreadimap_Markdown_Send.json`
- Et 5 autres...

**Bonus Microsoft Outlook** : 4 workflows dans `Microsoftoutlook/`

---

### LLM/AI (6 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 66 | `code_generator_tool` | Code Generator | `workflows/Openai/` | ✅ Disponible |
| 67 | `llm_summarizer_tool` | LLM Summarizer | `workflows/Openai/` | ✅ Disponible |
| 68 | `quiz_generator_tool` | Quiz Generator | `workflows/Openai/` | ✅ Disponible |
| 69 | `summarizer_tool` | Summarizer | `workflows/Openai/` | ✅ Disponible |
| 70 | `syllabus_generator_tool` | Syllabus Generator | `workflows/Openai/` | ✅ Disponible |
| 71 | `text_generator_tool` | Text Generator | `workflows/Openai/` | ✅ Disponible |

**Workflows disponibles** : 8 dans `Openai/`

---

### Productivity (1 tool)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 75 | `notion` | Notion | `workflows/Notion/` (3 workflows) | ✅ Disponible |

---

### Research (4 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 76 | `academic_searcher_tool` | Academic Searcher | - | ⏳ À créer |
| 77 | `google_searcher_tool` | Google Searcher | - | ⏳ À créer |
| 78 | `news_searcher_tool` | News Searcher | - | ⏳ À créer |
| 79 | `youtube_searcher_tool` | Youtube Searcher | `workflows/Youtube/` (1 workflow) | ✅ Disponible |

---

### Storage (2 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 80 | `bulk_cloud_uploader_tool` | Bulk Cloud Uploader | `workflows/Awss3/` (3 workflows) | ⚠️ Partiel |
| 81 | `vector_store_tool` | Vector Store | - | ⏳ À créer |

---

### Audio/Vocal (3 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 1 | `speaker_identifier_tool` | Speaker Identifier | - | ⏳ À créer |
| 2 | `text_to_speech_tool` | Text To Speech | - | ⏳ À créer |
| 3 | `transcriber_tool` | Transcriber | - | ⏳ À créer |

---

### Data Analysis (2 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 6 | `csv_processor_tool` | CSV Processor | - | ⏳ À créer |
| 7 | `graph_builder_tool` | Graph Builder | - | ⏳ À créer |

---

### Documents (7 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 8 | `docx_extractor_tool` | Docx Extractor | - | ⏳ À créer |
| 9 | `entity_extractor_tool` | Entity Extractor | - | ⏳ À créer |
| 10 | `get_pdf_extractor_tool` | PDF Extractor Factory | - | ⏳ À créer |
| 11 | `get_pdf_layout_translator_tool` | PDF Layout Translator | - | ⏳ À créer (Mathpix) |
| 12 | `html_extractor_tool` | HTML Extractor | - | ⏳ À créer |
| 13 | `metadata_extractor_tool` | Metadata Extractor | - | ⏳ À créer |
| 14 | `pdf_extractor_tool` | PDF Extractor | - | ⏳ À créer |

---

### NLP Processing (3 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 72 | `language_detector_tool` | Language Detector | - | ⏳ À créer |
| 73 | `text_classifier_tool` | Text Classifier | - | ⏳ À créer |
| 74 | `tokenizer_tool` | Tokenizer | - | ⏳ À créer |

---

### Visual Media (3 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 84 | `get_image_ocr_tool` | Image OCR | - | ⏳ À créer |
| 85 | `image_embedder_tool` | Image Embedder | - | ⏳ À créer |
| 86 | `image_generator_tool` | Image Generator | - | ⏳ À créer |

---

### General (4 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 16 | `bulk_url_processor_tool` | Bulk URL Processor | - | ⏳ À créer |
| 17 | `cost_calculator_tool` | Cost Calculator | - | ⏳ À créer |
| 18 | `usage_tracker_tool` | Usage Tracker | - | ⏳ À créer |
| 19 | `web_scraper_tool` | Web Scraper | - | ⏳ À créer |

---

### Transformation (2 tools)

| # | Tool ID | Nom | Workflow n8n | Statut |
|---|---------|-----|--------------|--------|
| 82 | `json_transformer_tool` | JSON Transformer | - | ⏳ À créer |
| 83 | `text_embedder_tool` | Text Embedder | - | ⏳ À créer |

---

## Statistiques

### Par statut

| Statut | Nombre | % |
|--------|--------|---|
| ✅ MCP Server créé | 46 | 54% |
| ✅ Workflow disponible | 15 | 18% |
| ⚠️ Partiel | 2 | 2% |
| ⏳ À créer | 22 | 26% |
| **TOTAL** | **85** | 100% |

### MCP Servers créés

| Fichier | Service | Tools couverts |
|---------|---------|----------------|
| `Gmail_MCP_Server_3605.json` | Gmail | 13 |
| `MCP_Drive_Server.json` | Google Drive | 16 |
| `MCP_Calendar_Server.json` | Google Calendar | 10 |
| `MCP_Contacts_Server.json` | Google Contacts | 2 |

### Workflows n8n disponibles

| Dossier | Nombre | Tools couverts |
|---------|--------|----------------|
| `workflows/Gmail/` | 8 | Gmail |
| `workflows/Gmailtool/` | 6 | Gmail |
| `workflows/Googlecalendar/` | 8 | Calendar |
| `workflows/Googledrive/` | 3 | Drive |
| `workflows/Emailreadimap/` | 8 | IMAP |
| `workflows/Microsoftoutlook/` | 4 | Outlook |
| `workflows/Openai/` | 8 | LLM/AI |
| `workflows/Notion/` | 3 | Notion |
| `workflows/Linkedin/` | 13 | LinkedIn |
| `workflows/Youtube/` | 1 | YouTube |
| `workflows/Awss3/` | 3 | S3 |
| `workflows/Slack/` | 18 | Communication |
| `workflows/mcp/` | 5 | MCP Servers |

---

## Prochaines étapes

### Priorité 1 - Compléter les MCP Servers
- [ ] Vérifier que tous les tools Gmail sont dans le MCP Server
- [ ] Vérifier que tous les tools Drive sont dans le MCP Server
- [ ] Vérifier que tous les tools Calendar sont dans le MCP Server

### Priorité 2 - Créer les workflows manquants
- [ ] Audio/Vocal (Whisper, ElevenLabs)
- [ ] Documents (PDF, DOCX extractors)
- [ ] Visual Media (OCR, Image generation)

### Priorité 3 - Workflows avancés
- [ ] PDF Layout Translator (Mathpix)
- [ ] Vector Store (Qdrant/Pinecone)
- [ ] Bulk operations

---

## Correspondances n8n pour les 22 Tools Manquants

### Audio/Vocal (3 tools)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `speaker_identifier_tool` | ❌ Aucun | HTTP Request → AssemblyAI/Whisper API | Aucun |
| `text_to_speech_tool` | ❌ Aucun | HTTP Request → ElevenLabs/Google TTS | Aucun |
| `transcriber_tool` | ❌ Aucun | HTTP Request → OpenAI Whisper API | Aucun |

**Recommandation** : Utiliser `HTTP Request` node avec APIs externes (OpenAI Whisper, ElevenLabs, AssemblyAI)

---

### Data Analysis (2 tools)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `csv_processor_tool` | ✅ **Spreadsheet File** | `Code` node pour transformations | `Converttofile/` (3) |
| `graph_builder_tool` | ❌ Aucun | HTTP Request → QuickChart.io | Aucun |

**Workflows utilisables** :
- `Converttofile/0508_Converttofile_Manual_Process_Triggered.json`
- `Converttofile/0889_Converttofile_HTTP_Create_Webhook.json`

---

### Documents (7 tools)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `docx_extractor_tool` | ✅ **Extract from File** | Code node + docxtemplater | `Extractfromfile/` (5+) |
| `entity_extractor_tool` | ✅ **OpenAI** / **Anthropic** | LLM avec prompt extraction | `Openai/` (8) |
| `get_pdf_extractor_tool` | ✅ **Extract from File** | HTTP → pdf-parse | `Extractfromfile/` (5+) |
| `get_pdf_layout_translator_tool` | ❌ Aucun | HTTP Request → Mathpix API | Aucun |
| `html_extractor_tool` | ✅ **HTML Extract** | HTTP Request + cheerio | `Http/` (176) |
| `metadata_extractor_tool` | ⚠️ Partiel | Code node | `Extractfromfile/` |
| `pdf_extractor_tool` | ✅ **Extract from File** | AWS Textract | `Awstextract/` (1) |
| `table_extractor_tool` | ⚠️ Partiel | AWS Textract / Mathpix | `Awstextract/` (1) |

**Workflows utilisables** :
- `Extractfromfile/0601_Extractfromfile_Manual_Create_Webhook.json`
- `Extractfromfile/0828_Extractfromfile_Gmail_Send_Triggered.json`
- `Awstextract/0148_Awstextract_Telegram_Automate_Triggered.json`

---

### General (4 tools)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `bulk_url_processor_tool` | ✅ **Split In Batches** + **HTTP Request** | Loop node | `Splitinbatches/`, `Http/` |
| `cost_calculator_tool` | ✅ **Code** node | Function node | `Code/` (183) |
| `usage_tracker_tool` | ✅ **n8n API** | Execution history | Interne n8n |
| `web_scraper_tool` | ✅ **HTTP Request** + **HTML Extract** | Puppeteer (custom) | `Http/` (176) |

**Workflows utilisables** :
- `Http/` - 176 workflows avec HTTP Request
- `Code/` - 183 workflows avec Code node

---

### NLP Processing (3 tools)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `language_detector_tool` | ❌ Aucun | HTTP → detectlanguage.com / OpenAI | Aucun |
| `text_classifier_tool` | ✅ **OpenAI** / **Anthropic** | LLM avec prompt classification | `Openai/` (8) |
| `tokenizer_tool` | ❌ Aucun | Code node (tiktoken) | Aucun |

**Recommandation** : Utiliser OpenAI/Anthropic pour classification, Code node pour tokenization

---

### Research (3 tools manquants)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `academic_searcher_tool` | ❌ Aucun | HTTP Request → arXiv/Semantic Scholar API | Aucun |
| `google_searcher_tool` | ❌ Aucun | HTTP Request → SerpAPI/Google Custom Search | Aucun |
| `news_searcher_tool` | ❌ Aucun | HTTP Request → NewsAPI/GNews | Aucun |

**Recommandation** : Utiliser `HTTP Request` avec APIs de recherche (SerpAPI, NewsAPI, arXiv)

---

### Storage (1 tool manquant)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `vector_store_tool` | ✅ **Pinecone** / **Qdrant** | Supabase Vector, Weaviate | Aucun spécifique |

**Nodes n8n disponibles** : Pinecone, Qdrant, Supabase, Weaviate (AI nodes)

---

### Transformation (2 tools)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `json_transformer_tool` | ✅ **Set** / **Code** | JMESPath, JSONata | `Code/` (183) |
| `text_embedder_tool` | ✅ **Embeddings OpenAI** | Cohere, HuggingFace | Aucun spécifique |

**Nodes n8n disponibles** : OpenAI Embeddings, Cohere, HuggingFace (AI nodes)

---

### Visual Media (3 tools)

| Tool MCP | Node n8n natif | Alternative | Workflows existants |
|----------|----------------|-------------|---------------------|
| `get_image_ocr_tool` | ⚠️ Partiel | HTTP → OCR.space/Mathpix/Google Vision | Aucun |
| `image_embedder_tool` | ❌ Aucun | HTTP → CLIP API / OpenAI Vision | Aucun |
| `image_generator_tool` | ✅ **OpenAI** (DALL-E) | HTTP → Stable Diffusion | `Editimage/` (2) |

**Workflows utilisables** :
- `Editimage/0575_Editimage_Manual_Update_Webhook.json`
- `Editimage/1369_Editimage_Manual_Automation_Webhook.json`

---

## Résumé des Correspondances

| Catégorie | Tools | Nodes natifs | HTTP Request | Code node |
|-----------|-------|--------------|--------------|-----------|
| Audio/Vocal | 3 | ❌ 0 | ✅ 3 | - |
| Data Analysis | 2 | ✅ 1 | ✅ 1 | - |
| Documents | 7 | ✅ 4 | ✅ 2 | ⚠️ 1 |
| General | 4 | ✅ 3 | ✅ 1 | - |
| NLP Processing | 3 | ✅ 1 | ✅ 1 | ✅ 1 |
| Research | 3 | ❌ 0 | ✅ 3 | - |
| Storage | 1 | ✅ 1 | - | - |
| Transformation | 2 | ✅ 2 | - | - |
| Visual Media | 3 | ✅ 1 | ✅ 2 | - |
| **TOTAL** | **22** | **13** | **13** | **2** |

### Légende
- ✅ Node n8n natif disponible
- ⚠️ Solution partielle
- ❌ Nécessite HTTP Request ou custom node

---

## Nodes n8n à Créer (9 tools)

Ces tools n'ont pas d'équivalent natif n8n et nécessitent la création de **custom nodes** ou **workflows dédiés**.

### Liste des Nodes à Développer

| # | Tool MCP | Node n8n à créer | API Backend | Priorité |
|---|----------|------------------|-------------|----------|
| 1 | `speaker_identifier_tool` | **AssemblyAI** ou **Whisper Diarization** | AssemblyAI API | Moyenne |
| 2 | `text_to_speech_tool` | **ElevenLabs** | ElevenLabs API | Haute |
| 3 | `transcriber_tool` | **OpenAI Whisper** | OpenAI Audio API | Haute |
| 4 | `graph_builder_tool` | **QuickChart** | QuickChart.io API | Basse |
| 5 | `get_pdf_layout_translator_tool` | **Mathpix** | Mathpix API | Haute |
| 6 | `language_detector_tool` | **Language Detector** | detectlanguage.com / OpenAI | Basse |
| 7 | `academic_searcher_tool` | **arXiv / Semantic Scholar** | arXiv API | Moyenne |
| 8 | `google_searcher_tool` | **SerpAPI** | SerpAPI | Moyenne |
| 9 | `news_searcher_tool` | **NewsAPI** | NewsAPI.org | Moyenne |

---

### Spécifications par Node

#### 1. OpenAI Whisper Node (Transcription)

```
Nom: n8n-nodes-openai-whisper
Type: n8n-nodes-base.openaiWhisper
API: https://api.openai.com/v1/audio/transcriptions

Opérations:
- transcribe: Transcrire audio → texte
- translate: Transcrire + traduire en anglais

Paramètres:
- file: Binary (audio file)
- model: whisper-1
- language: (optionnel) code ISO
- response_format: json | text | srt | vtt
- temperature: 0-1

Credentials:
- openAiApi (existant)
```

#### 2. ElevenLabs Node (Text-to-Speech)

```
Nom: n8n-nodes-elevenlabs
Type: n8n-nodes-base.elevenLabs

Opérations:
- textToSpeech: Convertir texte → audio
- getVoices: Lister les voix disponibles
- getVoice: Détails d'une voix

Paramètres:
- text: string
- voice_id: string
- model_id: eleven_monolingual_v1 | eleven_multilingual_v2
- voice_settings: { stability, similarity_boost }

Credentials:
- elevenLabsApi: { apiKey }
```

#### 3. Mathpix Node (PDF/Image OCR)

```
Nom: n8n-nodes-mathpix
Type: n8n-nodes-base.mathpix

Opérations:
- processImage: OCR image → LaTeX/text
- processPdf: OCR PDF → structured output
- convertPdf: PDF → DOCX/HTML/MD

Paramètres:
- src: URL ou Binary
- formats: text | latex | html | data
- ocr: math | text | all

Credentials:
- mathpixApi: { app_id, app_key }
```

#### 4. SerpAPI Node (Google Search)

```
Nom: n8n-nodes-serpapi
Type: n8n-nodes-base.serpApi

Opérations:
- googleSearch: Recherche Google
- googleImages: Recherche images
- googleNews: Recherche actualités
- googleScholar: Recherche académique

Paramètres:
- q: query string
- location: (optionnel)
- num: nombre de résultats
- gl: country code
- hl: language code

Credentials:
- serpApiKey: { apiKey }
```

#### 5. NewsAPI Node

```
Nom: n8n-nodes-newsapi
Type: n8n-nodes-base.newsApi

Opérations:
- everything: Recherche articles
- topHeadlines: Actualités principales
- sources: Liste des sources

Paramètres:
- q: query
- sources: (optionnel)
- from/to: date range
- language: fr | en | ...
- sortBy: relevancy | popularity | publishedAt

Credentials:
- newsApiKey: { apiKey }
```

#### 6. arXiv Node (Academic Search)

```
Nom: n8n-nodes-arxiv
Type: n8n-nodes-base.arxiv

Opérations:
- search: Recherche articles
- getArticle: Détails article

Paramètres:
- search_query: string
- start: offset
- max_results: limit
- sortBy: relevance | lastUpdatedDate | submittedDate

Credentials:
- Aucun (API publique)
```

#### 7. AssemblyAI Node (Speaker Diarization)

```
Nom: n8n-nodes-assemblyai
Type: n8n-nodes-base.assemblyAi

Opérations:
- transcribe: Transcription
- transcribeWithDiarization: Transcription + identification locuteurs

Paramètres:
- audio_url: URL du fichier
- speaker_labels: boolean
- speakers_expected: number (optionnel)
- language_code: string

Credentials:
- assemblyAiApi: { apiKey }
```

#### 8. QuickChart Node

```
Nom: n8n-nodes-quickchart
Type: n8n-nodes-base.quickChart

Opérations:
- generateChart: Créer graphique

Paramètres:
- type: bar | line | pie | doughnut | radar | ...
- data: { labels, datasets }
- options: Chart.js options
- width/height: dimensions
- format: png | webp | svg | pdf

Credentials:
- Aucun (API publique) ou quickChartApi pour version payante
```

#### 9. Language Detector Node

```
Nom: n8n-nodes-language-detector
Type: n8n-nodes-base.languageDetector

Opérations:
- detect: Détecter langue

Paramètres:
- text: string

Credentials:
- detectLanguageApi: { apiKey }

Alternative: Utiliser OpenAI avec prompt
```

---

### Plan de Développement

#### Phase 1 - Priorité Haute (3 nodes)
| Node | Effort | Documentation |
|------|--------|---------------|
| OpenAI Whisper | 2-3 jours | [docs/n8n/CUSTOM_NODE_DEVELOPMENT.md](../n8n/CUSTOM_NODE_DEVELOPMENT.md) |
| ElevenLabs | 2-3 jours | [docs/n8n/CUSTOM_NODE_DEVELOPMENT.md](../n8n/CUSTOM_NODE_DEVELOPMENT.md) |
| Mathpix | 3-4 jours | [docs/n8n/CUSTOM_NODE_DEVELOPMENT.md](../n8n/CUSTOM_NODE_DEVELOPMENT.md) |

#### Phase 2 - Priorité Moyenne (4 nodes)
| Node | Effort |
|------|--------|
| SerpAPI | 2 jours |
| NewsAPI | 1-2 jours |
| arXiv | 1-2 jours |
| AssemblyAI | 2-3 jours |

#### Phase 3 - Priorité Basse (2 nodes)
| Node | Effort |
|------|--------|
| QuickChart | 1-2 jours |
| Language Detector | 1 jour |

---

### Ressources pour le Développement

- **Guide développement** : [docs/n8n/CUSTOM_NODE_DEVELOPMENT.md](../n8n/CUSTOM_NODE_DEVELOPMENT.md)
- **Template node** : [n8n-nodes-starter](https://github.com/n8n-io/n8n-nodes-starter)
- **Documentation n8n** : [Creating Nodes](https://docs.n8n.io/integrations/creating-nodes/)

### Structure d'un Custom Node

```
n8n-nodes-<service>/
├── package.json
├── tsconfig.json
├── nodes/
│   └── <Service>/
│       ├── <Service>.node.ts      # Logique du node
│       ├── <Service>.node.json    # Metadata UI
│       └── GenericFunctions.ts    # Fonctions utilitaires
├── credentials/
│   └── <Service>Api.credentials.ts
└── README.md
```
