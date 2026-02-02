# RFC-019: Catalogue des Webhooks n8n

> Documentation exhaustive de tous les webhooks actifs dans l'instance n8n.

## Métadonnées

| Propriété | Valeur |
|-----------|--------|
| **Total Webhooks** | 157 |
| **Catégories** | 9 |
| **Généré le** | 2026-01-23 |
| **Source** | SQLite n8n database |

---

## Table des Matières

- [MCP Server (59)](#mcp-server)
- [AI/LLM (2)](#ai-llm)
- [Document Processing (6)](#document-processing)
- [Translation (13)](#translation)
- [Recipe & Nutrition (5)](#recipe--nutrition)
- [Data Analysis (1)](#data-analysis)
- [Search & Lookup (3)](#search--lookup)
- [Credits & Billing (7)](#credits--billing)
- [General (61)](#general)

---

## Résumé par Catégorie

| Catégorie | Nombre | Description |
|-----------|--------|-------------|
| MCP Server | 59 | Serveurs MCP pour intégration avec Claude/LLM |
| AI/LLM | 2 | Workflows utilisant des modèles de langage |
| Document Processing | 6 | Traitement de documents (PDF, extraction) |
| Translation | 13 | Services de traduction multilingue |
| Recipe & Nutrition | 5 | Gestion de recettes et données nutritionnelles |
| Data Analysis | 1 | Analyse et classification de données |
| Search & Lookup | 3 | Recherche et enrichissement de données |
| Credits & Billing | 7 | Gestion des crédits et facturation |
| General | 61 | Autres workflows |

---

## MCP Server

*59 webhook(s)*

### `POST /webhook/academic-searcher`

**Workflow:** MCP - Academic Searcher (ID: dwclCArbcxpUNOL4)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/academic-searcher

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.semanticscholar.org/graph/v1/paper/search

---

### `POST /webhook/analyze-feedback`

**Workflow:** MCP - Feedback Analyzer (ID: 9HKS632YxiHgek7p)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/analyze-feedback

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/chat/completions

---

### `POST /webhook/analyze-message`

**Workflow:** MCP - Analyze Message (ID: aZ3DBPdr9qCCMYL2)

#### Description Fonctionnelle

Workflow: MCP - Analyze Message

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 13
- **Chain:** `webhook → if → respondToWebhook → code → httpRequest → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** =https://language.googleapis.com/v1/documents:analyzeEntities?key={dynamic}, =https://language.googleapis.com/v1/documents:analyzeSentiment?key={dynamic}, https://api.openai.com/v1/chat/completions

---

### `POST /webhook/bulk-url-processor`

**Workflow:** MCP - Bulk URL Processor (ID: yRhm2W8Y7x5452Gg)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/bulk-url-processor

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → if → respondToWebhook → splitInBatches → code → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `GET /webhook/centroid`

**Workflow:** MCP - Centroid Calculator (ID: YBLbYZFCvBbWFjUG)

#### Description Fonctionnelle

📌 **Description:**

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 4
- **Chain:** `webhook → set → code → respondToWebhook`

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: firstIncomingItem

#### Variables et Dépendances

- **Env Vars:** `WEBHOOK_URL`

---

### `POST /webhook/chart-generator`

**Workflow:** MCP - Chart Generator (ID: OxBlSMpOZqJVLdrn)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/chart-generator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → if → respondToWebhook → code → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://quickchart.io/chart

---

### `POST /webhook/code-generator`

**Workflow:** MCP - Code Generator (ID: 3dAX5G5VNZVIUlcw)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/code-generator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → openAi → set → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** openAiApi: OpenAI account

---

### `POST /webhook/cost-calculator`

**Workflow:** MCP - Cost Calculator (ID: sUkUNxu36VISWzke)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/cost-calculator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 5
- **Chain:** `webhook → if → respondToWebhook → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/csv-processor`

**Workflow:** MCP - CSV Processor (ID: VW7DqZcclwqtuqyT)

#### Description Fonctionnelle

Workflow: MCP - CSV Processor

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → if → respondToWebhook → if → code → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/documents/estimate`

**Workflow:** MCP - Documents Estimate (ID: 6T0xLTZnCo750HEf)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/documents/estimate

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 3
- **Chain:** `webhook → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

---

### `POST /webhook/documents/process`

**Workflow:** MCP - Documents Process (ID: 6Wqi2P0HIE9EDtmI)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/documents/process

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → code → respondToWebhook → code → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `N8N_WEBHOOK_BASE_URL`
- **External APIs:** http://localhost:5678

---

### `POST /webhook/documents/save`

**Workflow:** MCP - Documents Save (ID: rXxo6q8W8edGCgoV)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/documents/save

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → if → respondToWebhook → set → if → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart

---

### `POST /webhook/documents/validate`

**Workflow:** MCP - Documents Validate (ID: UzGcjCJp3jTHLwSC)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/documents/validate

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 3
- **Chain:** `webhook → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

---

### `POST /webhook/docx-extractor`

**Workflow:** MCP - DOCX Extractor (ID: cqaSoP1kK5rAKNDp)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/docx-extractor

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/email-imap`

**Workflow:** MCP - Email IMAP (ID: virECiQyCyP7LFgT)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/email-imap

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 5
- **Chain:** `webhook → if → respondToWebhook → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/entity-extractor`

**Workflow:** MCP - Entity Extractor (ID: EbVqWJ2yaGKNaGpT)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/entity-extractor

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → if → respondToWebhook → openAi → set → set` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** openAiApi: OpenAI account

---

### `POST /webhook/gemini-image`

**Workflow:** MCP Gemini Image (ID: De6a7Mdnj7z9hTlP)

#### Description Fonctionnelle

Workflow: MCP Gemini Image

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → if → stopAndError → code → n8n-nodes-gemini-image.geminiImage → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** googleVertexAiApi: Google Vertex AI account

---

### `POST /webhook/google-drive-ocr`

**Workflow:** MCP - Google Drive OCR (ID: syDUdlVjTrV9QqPI)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/google-drive-ocr

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 12
- **Chain:** `webhook → if → respondToWebhook → if → httpRequest → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** =https://www.googleapis.com/drive/v3/files, =https://www.googleapis.com/drive/v3/files/{dynamic}, =https://www.googleapis.com/drive/v3/files/{dynamic}?alt=media ...

---

### `POST /webhook/google-searcher`

**Workflow:** MCP - Google Searcher (ID: 6WtKoi2pkRShkVT7)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/google-searcher

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → set → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** serpApi: SerpAPI
- **External APIs:** https://serpapi.com/search

---

### `POST /webhook/html-extractor`

**Workflow:** MCP - HTML Extractor (ID: soWXv3QQYzjNiN35)

#### Description Fonctionnelle

Workflow: MCP - HTML Extractor

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → if → respondToWebhook → if → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/image-embedder`

**Workflow:** MCP - Image Embedder (ID: HGu8rrdZeX4unms2)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/image-embedder

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → if → respondToWebhook → httpRequest → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/chat/completions, https://api.openai.com/v1/embeddings

---

### `POST /webhook/image-generator`

**Workflow:** MCP - Image Generator (ID: jXnW0TwAF98ZJ7vq)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/image-generator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/images/generations

---

### `POST /webhook/image-ocr`

**Workflow:** MCP - Image OCR (ID: yJO9eAWF92oaDd6x)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/image-ocr

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **External APIs:** https://api.mistral.ai/v1/ocr

---

### `POST /webhook/json-transformer`

**Workflow:** MCP - JSON Transformer (ID: n2t7kKIYePjcI7pl)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/json-transformer

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 5
- **Chain:** `webhook → if → respondToWebhook → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/knowledge-graph`

**Workflow:** MCP - Knowledge Graph (ID: e7YS4pgDKrxmvurW)

#### Description Fonctionnelle

Workflow: MCP - Knowledge Graph

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → if → if → if → readBinaryFile → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** googleVertexAiApi: Google Vertex AI account

---

### `POST /webhook/language-detector`

**Workflow:** MCP - Language Detector (ID: bggGYdqahk01bt0B)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/language-detector

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/chat/completions

---

### `POST /webhook/linkedin`

**Workflow:** MCP - LinkedIn (ID: cLxDiCFSOTiaMUYn)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/linkedin

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 8
- **Chain:** `webhook → switch → linkedIn → linkedIn → respondToWebhook → set` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** linkedInOAuth2Api: LinkedIn account

---

### `POST /webhook/llm-intention`

**Workflow:** MCP - LLM Intention (ID: tA1bPSUvjbZzYajG)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/llm-intention

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 12
- **Chain:** `webhook → code → if → respondToWebhook → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `N8N_WEBHOOK_BASE_URL`
- **External APIs:** http://localhost:5678, https://api.anthropic.com/v1/messages

---

### `POST /webhook/llm-summarizer`

**Workflow:** MCP - LLM Summarizer (ID: cf4qppzmHzEYasfU)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/llm-summarizer

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → if → respondToWebhook → switch → openAi → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** anthropicApi: Anthropic account, mistralCloudApi: Mistral account, openAiApi: OpenAI account
- **External APIs:** https://api.anthropic.com/v1/messages, https://api.mistral.ai/v1/chat/completions

---

### `POST /webhook/mathpix`

**Workflow:** MCP - Mathpix (ID: o6hfceJb86t0k52C)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/mathpix

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.mathpix.com/v3/text

---

### `POST /webhook/mcp-calendar`

**Workflow:** MCP - Google Calendar Server (ID: u6pSGRx05aNgK0fv)

#### Description Fonctionnelle

Open the Calendar MCP Server node to obtain the webhook URL.

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → switch → respondToWebhook → n8n-nodes-calendar-dynamic.calendarToolDynamic → n8n-nodes-calendar-dynamic.calendarToolDynamic → n8n-nodes-calendar-dynamic.calendarToolDynamic` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/mcp-contacts`

**Workflow:** MCP - Google Contacts Server (ID: A1mWo3qs0572wSp0)

#### Description Fonctionnelle

Workflow: MCP - Google Contacts Server

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 16
- **Chain:** `webhook → switch → respondToWebhook → n8n-nodes-contacts-dynamic.contactsToolDynamic → n8n-nodes-contacts-dynamic.contactsToolDynamic → n8n-nodes-contacts-dynamic.contactsToolDynamic` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/mcp-drive`

**Workflow:** MCP - Google Drive Server (ID: jRaOth5nYWI8Gl9q)

#### Description Fonctionnelle

Workflow: MCP - Google Drive Server

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 15
- **Chain:** `webhook → switch → n8n-nodes-drive-dynamic.driveToolDynamic → n8n-nodes-drive-dynamic.driveToolDynamic → n8n-nodes-drive-dynamic.driveToolDynamic → n8n-nodes-drive-dynamic.driveToolDynamic` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

---

### `POST /webhook/mcp-gmail`

**Workflow:** MCP - Gmail Server (All-in-One) (ID: Jz4ji4p0QStwstN0)

#### Description Fonctionnelle

Open the Gmail MCP Server node to obtain the SSE server URL.

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 25
- **Chain:** `n8n-nodes-gmail-dynamic.gmailToolDynamic → n8n-nodes-gmail-dynamic.gmailToolDynamic → n8n-nodes-gmail-dynamic.gmailToolDynamic → n8n-nodes-gmail-dynamic.gmailToolDynamic → n8n-nodes-gmail-dynamic.gmailToolDynamic → n8n-nodes-gmail-dynamic.gmailToolDynamic` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/mcp-google-maps`

**Workflow:** MCP - Google Maps (ID: 2yybqbrzqWOsVfdL)

#### Description Fonctionnelle

**Endpoint:** POST `/webhook/mcp-google-maps`

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 13
- **Chain:** `webhook → switch → httpRequest → httpRequest → httpRequest → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **External APIs:** =https://airquality.googleapis.com/v1/currentConditions:lookup?key={dynamic}, https://maps.googleapis.com/maps/api/directions/json, https://maps.googleapis.com/maps/api/geocode/json ...

---

### `GET /webhook/mcp-registry`

**Workflow:** MCP - Registry (ID: dz4sQltaKjQPv0wv)

#### Description Fonctionnelle

Workflow: MCP - Registry

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 4
- **Chain:** `webhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** httpHeaderAuth: Header Auth account
- **External APIs:** http://pi6.local:5678/api/v1/workflows?active=true&limit=250

---

### `POST /webhook/mcp-test-echo`

**Workflow:** MCP - Test - Echo (ID: OqrQ7uxgS1VmbYaz)

#### Description Fonctionnelle

Workflow: MCP - Test - Echo

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 3
- **Chain:** `webhook → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

---

### `POST /webhook/metadata-extractor`

**Workflow:** MCP - Metadata Extractor (ID: 9gwVgyGpeWE6s9Oo)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/metadata-extractor

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → if → respondToWebhook → if → httpRequest → set` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/news-searcher`

**Workflow:** MCP - News Searcher (ID: 1UDizjOfHcBbPPRP)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/news-searcher

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://gnews.io/api/v4/search

---

### `POST /webhook/pdf-extractor`

**Workflow:** MCP - PDF Extractor (ID: gvIIi5YgVOcFwKZZ)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/pdf-extractor

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → switch → httpRequest → extractFromFile → extractFromFile → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/pdf-layout-translator`

**Workflow:** MCP - PDF Layout Translator (ID: P4K8eUBaspgYvpmp)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/pdf-layout-translator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 16
- **Chain:** `webhook → code → if → httpRequest → code → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_URL`
- **External APIs:** http://localhost:5678, https://api.mistral.ai/v1/chat/completions

---

### `POST /webhook/qdrant-save`

**Workflow:** MCP Qdrant - Save (ID: deFTjJpRp8ulaj3H)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-save

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 14
- **Chain:** `webhook → code → if → respondToWebhook → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** https://api.openai.com/v1/embeddings

---

### `POST /webhook/qdrant-search`

**Workflow:** MCP - Qdrant - Search (ID: H57j1dGyBNtnMrLf)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-search

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 8
- **Chain:** `webhook → code → if → respondToWebhook → httpRequest → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/embeddings

---

### `POST /webhook/qdrant-similar`

**Workflow:** MCP - qdrant - Similar (ID: y2WP91jjAvV3zIus)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-similar

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 13
- **Chain:** `webhook → code → if → respondToWebhook → if → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/embeddings

---

### `POST /webhook/quiz-generator`

**Workflow:** MCP - Quiz Generator (ID: SUlOgPqXDRlXPkpN)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/quiz-generator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/chat/completions

---

### `POST /webhook/speaker-identifier`

**Workflow:** MCP - Speaker Identifier (ID: zp2f63S20SLgs22o)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/speaker-identifier

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 19
- **Chain:** `webhook → if → respondToWebhook → if → code → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** =https://api.assemblyai.com/v2/transcript/{dynamic}, https://api.assemblyai.com/v2/transcript, https://api.assemblyai.com/v2/upload

---

### `POST /webhook/summarizer`

**Workflow:** MCP - Summarizer (ID: XNRFE2ch7KZDoRT1)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/summarizer

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 8
- **Chain:** `webhook → if → respondToWebhook → langchain.lmChatAnthropic → set → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** anthropicApi: Anthropic account
- **External APIs:** https://api.anthropic.com/v1/messages

---

### `POST /webhook/syllabus-generator`

**Workflow:** MCP - Syllabus Generator (ID: gUxqJkQubu3NGPOB)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/syllabus-generator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/chat/completions

---

### `POST /webhook/table-extractor`

**Workflow:** MCP - Table Extractor (ID: lciEMHKOrajRVIJm)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/table-extractor

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.mistral.ai/v1/chat/completions

---

### `POST /webhook/text-classifier`

**Workflow:** MCP - Text Classifier (ID: QNkWJLmi2fmJ77hG)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/text-classifier

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → if → respondToWebhook → switch → openAi → openAi` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** openAiApi: OpenAI account

---

### `POST /webhook/text-embedder`

**Workflow:** MCP - Text Embedder (ID: N3FpKoAubDMFrYRS)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/text-embedder

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/embeddings

---

### `POST /webhook/text-generator`

**Workflow:** MCP - Text Generator (ID: RipM3vFw09xhPtXR)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/text-generator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → openAi → set → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** openAiApi: OpenAI account

---

### `POST /webhook/text-to-speech`

**Workflow:** MCP - Text to Speech (ID: ygMdwJrg8sl5L0pG)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/text-to-speech

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → openAi → set → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** openAiApi: OpenAI account

---

### `POST /webhook/tokenizer`

**Workflow:** MCP - Tokenizer (ID: hKjyL9mPtl8H8N0C)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/tokenizer

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 5
- **Chain:** `webhook → if → respondToWebhook → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/vector-store`

**Workflow:** MCP - Vector Store (ID: zOwekZmlRQbfEoZD)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/vector-store

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → switch → httpRequest → httpRequest → httpRequest → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `QDRANT_API_KEY, QDRANT_URL`
- **External APIs:** http://localhost:6333

---

### `POST /webhook/veo-video`

**Workflow:** MCP Veo Video (ID: JiMpHGhpcdQOmwpS)

#### Description Fonctionnelle

Workflow: MCP Veo Video

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → if → stopAndError → code → if → n8n-nodes-veo-video.veoVideo` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** googleVertexAiApi: Google Vertex AI account

---

### `POST /webhook/video-transcription`

**Workflow:** MCP - Transcriber (ID: prG9VSsc5cxACJFj)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/video-transcription

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → if → stopAndError → code → n8n-nodes-video-transcription.videoTranscription → set` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** googleVertexAiApi: Google Vertex AI account

---

### `POST /webhook/web-scraper`

**Workflow:** MCP - Web Scraper (ID: A2L4SZvj4JcfcZQJ)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/web-scraper

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/youtube-searcher`

**Workflow:** MCP - YouTube Searcher (ID: MdqUUKNDXz9gIXB6)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/youtube-searcher

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → if → respondToWebhook → httpRequest → set → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Credentials:** googleApi: Google API
- **External APIs:** https://www.googleapis.com/youtube/v3/search

---

## AI/LLM

*2 webhook(s)*

### `POST /webhook/llm-web-search`

**Workflow:** LLM - Web Search (ID: Zq5SGUcoFvXndkLO)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-web-search

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 27
- **Chain:** `webhook → code → if → respondToWebhook → switch → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** =https://generativelanguage.googleapis.com/v1beta/models/{dynamic}:generateContent?key={dynamic}, https://api.anthropic.com/v1/messages, https://api.mistral.ai/v1/agents ...

---

### `POST /webhook/stripe-subscription-failure`

**Workflow:** Stripe - Subscription Payment Failure (ID: E7HQ6IRdTt2EivKE)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-sub-failure

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → code → if → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_KEY, API_URL`
- **External APIs:** {dynamic}/api/payments/log, {dynamic}/api/subscriptions/status

---

## Document Processing

*6 webhook(s)*

### `POST /webhook/books-commentary-worker`

**Workflow:** Books Commentary Worker (ID: 0RdGDIG8uQCpzQDN)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/books-commentary-worker

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 19
- **Chain:** `webhook → code → respondToWebhook → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** https://api.anthropic.com/v1/messages, https://api.openai.com/v1/chat/completions

---

### `GET /webhook/books-job-status`

**Workflow:** Books Job Status (ID: xSwPuIY9Lp9IoqPj)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/books-job-status

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → code → if → httpRequest → code → respondToWebhook` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/document-cancel`

**Workflow:** Document Cancel (ID: 3sduhqVBeBj5Ahiz)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/document-cancel

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/document-structure-extract`

**Workflow:** Document Structure Extract (ID: KMNE2BVahFJcDycQ)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/document-structure-extract

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 8
- **Chain:** `webhook → code → if → respondToWebhook → code → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.anthropic.com/v1/messages

---

### `POST /webhook/torah-document-callback`

**Workflow:** TORAH---Document-Callback (ID: LOiDsPw8oftAaXcd)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-document-callback

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 12
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, DISCORD_TOKEN`
- **External APIs:** =https://discord.com/api/v10/channels/{dynamic}/messages

---

### `POST /webhook/torah-generate-pdf`

**Workflow:** Torah PDF Generation (ID: cW9urJ4EVCKUTQFu)

#### Description Fonctionnelle

Workflow: Torah PDF Generation

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 18
- **Chain:** `webhook → code → if → httpRequest → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL, DISCORD_TOKEN, DISCORD_URL_CHANNEL`
- **External APIs:** https://discord.com/api/webhooks/14{dynamic}{dynamic}/messages, {dynamic}/api/pdf/generate, {dynamic}{dynamic}/messages

---

## Translation

*13 webhook(s)*

### `POST /webhook/books-translate`

**Workflow:** Books Translation Manager (ID: rzgpYqJjXnEpHinc)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/books-translate

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 16
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_URL`
- **External APIs:** http://localhost:5678

---

### `POST /webhook/books-translate-commentaries`

**Workflow:** Books Translate Commentaries (ID: yiuP2LfWBlP4RwuD)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/books-translate-commentaries

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 16
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_URL`
- **External APIs:** http://localhost:5678

---

### `POST /webhook/books-translation-worker`

**Workflow:** Books Translation Worker (ID: tJVkml6mqrP9lJN6)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/books-translation-worker

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 19
- **Chain:** `webhook → code → respondToWebhook → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** https://api.anthropic.com/v1/messages, https://api.openai.com/v1/chat/completions

---

### `POST /webhook/document-translate-worker`

**Workflow:** Document Translate Worker (ID: hiKW1yiXQJ1oki8F)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/document-translate-worker

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 27
- **Chain:** `webhook → code → if → respondToWebhook → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_URL`
- **External APIs:** http://localhost:5678, https://api.anthropic.com/v1/messages

---

### `POST /webhook/torah-batch-translate`

**Workflow:** Torah Batch Translation with Commentaries (ID: P8RPgMY3vdc6mRso)

#### Description Fonctionnelle

Workflow: Torah Batch Translation with Commentaries

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 18
- **Chain:** `webhook → code → if → httpRequest → code → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL, DISCORD_TOKEN, DISCORD_URL_CHANNEL`
- **External APIs:** https://discord.com/api/webhooks/1454872701331177606/0qZXNfqF45UU9epTnYbXJMd3nCWtUwfMU1p_E6sTQbnP7Ik-jzxW1Duq2jjHuMHPDC6o, {dynamic}/api/translate-with-comments, {dynamic}{dynamic}/messages

---

### `POST /webhook/torah-discord-translate`

**Workflow:** Torah Discord Translation v2 (Unified) (ID: euZAb9a3EuC9rfIj)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-discord-translate

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 19
- **Chain:** `webhook → code → if → if → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_URL`
- **External APIs:** http://localhost:5678

---

### `POST /webhook/torah-discord-translate-pivot`

**Workflow:** Torah Discord Translation Pivot (ID: wln6S8QuWQ5MfWrK)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-discord-translate-pivot

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 24
- **Chain:** `webhook → code → if → if → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** https://api.anthropic.com/v1/messages, https://api.openai.com/v1/chat/completions

---

### `GET /webhook/torah-get-page-translations`

**Workflow:** Torah Get Page Translations (ID: zFL7ujX3TlCM4PAO)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/torah-get-page-translations

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → code → if → httpRequest → code → respondToWebhook` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/torah-translate`

**Workflow:** Torah Translation Orchestrator (ID: BfCCrla2uLW2ZtDo)

#### Description Fonctionnelle

Workflow: Torah Translation Orchestrator

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 13
- **Chain:** `webhook → if → httpRequest → httpRequest → code → splitInBatches` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL, DISCORD_TOKEN, DISCORD_URL_CHANNEL`
- **External APIs:** {dynamic}/api/translate-with-comments, {dynamic}{dynamic}/messages

---

### `POST /webhook/torah-translate-page`

**Workflow:** Torah Translate Page (ID: jCDI1KPDjJ6wsizI)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-translate-page

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 20
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_URL`
- **External APIs:** http://localhost:5678

---

### `POST /webhook/torah-translate-page-worker`

**Workflow:** Torah Translate Page Worker (ID: P0mu8wW6IawH4bVR)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-translate-page-worker

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 19
- **Chain:** `webhook → code → respondToWebhook → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** =  {dynamic}/api/v2/jobs/{dynamic}, https://api.anthropic.com/v1/messages, https://api.openai.com/v1/chat/completions

---

### `POST /webhook/torah-translate-worker`

**Workflow:** Torah Translate Worker (ID: WzLGpoVFVhwbw0za)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-translate-worker

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 24
- **Chain:** `webhook → code → respondToWebhook → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_URL`
- **External APIs:** http://localhost:5678, https://api.anthropic.com/v1/messages, https://api.openai.com/v1/chat/completions

---

### `GET /webhook/torah-translation-status`

**Workflow:** Torah Translation Status (ID: 2uFfsvu6V723B2sR)

#### Description Fonctionnelle

**Endpoints:**

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → httpRequest → httpRequest → code` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

## Recipe & Nutrition

*5 webhook(s)*

### `POST /webhook/recipes-generate`

**Workflow:** Recipes - Generate (ID: 4Fr7QmrUlZiLZetb)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-generate

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → respondToWebhook → switch → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.anthropic.com/v1/messages, https://api.openai.com/v1/chat/completions

---

### `POST /webhook/recipes-shopping`

**Workflow:** Recipes - Shopping (ID: fdXCLN5VxdnR0UKD)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-shopping

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 13
- **Chain:** `webhook → code → if → respondToWebhook → switch → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/recipes-timer`

**Workflow:** Recipes - Timer (ID: JcY4uCJQzUW1uoYZ)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-timer

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → respondToWebhook → switch → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/recipes-timer-notify`

**Workflow:** Recipes - Timer Notify (ID: N1AppZjcKgxKIsSy)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-timer-notify

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 8
- **Chain:** `webhook → code → if → respondToWebhook → httpRequest → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** =https://discord.com/api/v10/channels/{dynamic}/messages, https://discord.com/api/v10/users/@me/channels

---

### `POST /webhook/recipes-youtube`

**Workflow:** Recipes - YouTube (ID: gavgTlj4wpbYh5KD)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-youtube

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 12
- **Chain:** `webhook → code → if → respondToWebhook → httpRequest → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.anthropic.com/v1/messages, https://www.googleapis.com/youtube/v3/search

---

## Data Analysis

*1 webhook(s)*

### `POST /webhook/category-detect`

**Workflow:** Category Detect (ID: C8CkEr3RjjRQnAnD)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/category-detect

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → respondToWebhook → switch → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **External APIs:** https://api.anthropic.com/v1/messages

---

## Search & Lookup

*3 webhook(s)*

### `POST /webhook/data-lookup-enrich`

**Workflow:** Data Lookup Enrich (ID: eOo7TVs5SHmO9jCq)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/data-lookup-enrich

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → respondToWebhook → switch → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

---

### `POST /webhook/product-discovery`

**Workflow:** SHOPPING---Product-Discovery-WebSearch (ID: 39uw0mdSU5IPTJys)

#### Description Fonctionnelle

```

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 11
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **External APIs:** https://api.openai.com/v1/chat/completions

---

### `POST /webhook/torah-discord-message`

**Workflow:** Torah Discord Bot - Commentary Search (ID: mzLAkw5JjiQtRKxs)

#### Description Fonctionnelle

Workflow: Torah Discord Bot - Commentary Search

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → code → if → httpRequest → code → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL, DISCORD_TOKEN, DISCORD_URL_CHANNEL`
- **External APIs:** {dynamic}{dynamic}/messages

---

## Credits & Billing

*7 webhook(s)*

### `POST /webhook/credits-check`

**Workflow:** Credits Check (ID: rLt5So45xNTGlH08)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/credits-check

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → code → if → httpRequest → code → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/credits-debit`

**Workflow:** Credits Debit (ID: PnB5uC9xHUqtW4w1)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/credits-debit

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → code → if → httpRequest → code → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/credits-get`

**Workflow:** Credits - Get (ID: WTOhHSowNO3mtPy5)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/credits-get

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → httpRequest → httpRequest → merge` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/credits-refund`

**Workflow:** Credits Refund (ID: krRZTexJpGaMonnk)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/credits-refund

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → code → if → httpRequest → code → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/discord-billing-portal`

**Workflow:** DISCORD - Billing Portal (ID: 1L2jXhpWIVlmFxZf)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/discord-billing-portal

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 15
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, STRIPE_WEBHOOK_URL`
- **Credentials:** redis: Redis account
- **External APIs:** https://api.stripe.com/v1/billing_portal/sessions

---

### `GET /webhook/discord-get-credits`

**Workflow:** DISCORD - Get Credits (ID: dyAeNC2poJxRdj7o)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/discord-get-credits

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** {dynamic}/api/webhook/account

---

### `POST /webhook/member-join`

**Workflow:** MEMBERS---On-Join-Grant-Credits (ID: wrwXHZ4rB2kYStqS)

#### Description Fonctionnelle

Workflow: MEMBERS---On-Join-Grant-Credits

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 11
- **Chain:** `webhook → code → if → httpRequest → if → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

## General

*61 webhook(s)*

### `POST /webhook/K60xx8kGU2DWcBKE/webhook%20trigger/subscription-change-plan`

**Workflow:** Stripe - Subscription Change Plan (ID: K60xx8kGU2DWcBKE)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/subscription-change-plan

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 15
- **Chain:** `webhook → code → if → redis → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** redis: Redis account
- **External APIs:** =https://api.stripe.com/v1/subscriptions/{dynamic}

---

### `GET /webhook/Youtube`

**Workflow:** [n8n] YouTube Channel Advanced RSS Feeds Generator (ID: CE8xbCzaqPjOrJuh)

#### Description Fonctionnelle

**``Yes, As you heard``** This Workflow using `3rd party` APIs & Solutions to get the job done. **``no need to setup anything``.**

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 19
- **Chain:** `formTrigger → httpRequest → set → set → set → set` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: text

#### Variables et Dépendances

- **Env Vars:** `BASE_URL`
- **External APIs:** {dynamic}

---

### `POST /webhook/Youtube`

**Workflow:** [n8n] YouTube Channel Advanced RSS Feeds Generator (ID: CE8xbCzaqPjOrJuh)

#### Description Fonctionnelle

**``Yes, As you heard``** This Workflow using `3rd party` APIs & Solutions to get the job done. **``no need to setup anything``.**

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 19
- **Chain:** `formTrigger → httpRequest → set → set → set → set` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: text

#### Variables et Dépendances

- **Env Vars:** `BASE_URL`
- **External APIs:** {dynamic}

---

### `POST /webhook/cart-add`

**Workflow:** SHOPPING---Cart-Add (ID: uVSdoFhm0XxZC4vb)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Add

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/cart-apply-coupon`

**Workflow:** SHOPPING---Cart-Apply-Coupon (ID: JUJdUtVV0Fs0tFRu)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Apply-Coupon

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/cart-checkout`

**Workflow:** SHOPPING---Cart-Checkout (ID: pdwD4Hq228LXWGw1)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Checkout

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/cart-checkout-cancel`

**Workflow:** SHOPPING---Cart-Checkout-Cancel (ID: Oo6R9vWpegFPDco3)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Checkout-Cancel

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 7
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: text

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/cart-checkout-success`

**Workflow:** SHOPPING---Cart-Checkout-Success (ID: sS9OQsfHNfoELLeo)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Checkout-Success

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 10
- **Chain:** `webhook → code → if → httpRequest → if → httpRequest` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: text

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/cart-clear`

**Workflow:** SHOPPING---Cart-Clear (ID: alxFIDfHaBJJVl1l)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Clear

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/cart-get`

**Workflow:** SHOPPING---Cart-Get (ID: YP5OBXvvWEuuhcBV)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Get

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/cart-remove`

**Workflow:** SHOPPING---Cart-Remove (ID: E5QjFcZ63eTJ9Sgu)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Remove

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/cart-remove-coupon`

**Workflow:** SHOPPING---Cart-Remove-Coupon (ID: 9S9xY5Q7oOSfSG45)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Remove-Coupon

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/cart-update`

**Workflow:** SHOPPING---Cart-Update (ID: thMAVXKe1Ri1U6Py)

#### Description Fonctionnelle

Workflow: SHOPPING---Cart-Update

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/config/branding`

**Workflow:** CONFIG---Get-Branding (ID: sZ6WmmLDWcFOspfT)

#### Description Fonctionnelle

**Webhook:** GET /config/branding

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → httpRequest → if → httpRequest` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `PUT /webhook/config/branding`

**Workflow:** CONFIG---On-Branding-Update (ID: dA8U2my3MeDRyUbJ)

#### Description Fonctionnelle

**Webhook:** PUT /config/branding

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → httpRequest → if → httpRequest` ...

#### Input / Output

- **Input:** `PUT` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/config/help`

**Workflow:** CONFIG---Get-Help (ID: IJ88AQsxKgFJSqy8)

#### Description Fonctionnelle

**Webhook:** GET /config/help

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → httpRequest → if → httpRequest` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `PUT /webhook/config/help`

**Workflow:** CONFIG---On-Help-Update (ID: UGKOJIYWKP2XtkMQ)

#### Description Fonctionnelle

**Webhook:** PUT /config/help

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → httpRequest → if → httpRequest` ...

#### Input / Output

- **Input:** `PUT` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/config/help/reset`

**Workflow:** CONFIG---Help-Reset (ID: SQiIBsvGmb4MQJxj)

#### Description Fonctionnelle

**Webhook:** POST /config/help/reset

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → httpRequest → if → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/discord-get-balance`

**Workflow:** DISCORD - Get Balance (ID: 8Dfa9785xAstVZfw)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/discord-get-balance

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/discord-get-plans`

**Workflow:** DISCORD - Get Plans (ID: 10ptENKEPSpsRtBX)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/discord-get-plans

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → redis → code → if` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** redis: Redis account
- **External APIs:** https://api.stripe.com/v1/products?active=true&limit=100&expand[]=data.default_price

---

### `GET /webhook/discord-get-subscriber`

**Workflow:** DISCORD - Get Subscriber (ID: 7zWT0LWlxRBBhUkl)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/discord-get-subscriber

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 9
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/discord-get-transactions`

**Workflow:** DISCORD - Get Transactions (ID: 4QcMY4OlgnOfzRyX)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/discord-get-transactions

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 13
- **Chain:** `webhook → code → if → postgres → code → if` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** postgres: PostgreSQL Subscribers

---

### `GET /webhook/discord-registry`

**Workflow:** DISCORD - Registry (ID: arEmH7jyo8Z9B6wl)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/discord-registry

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 4
- **Chain:** `webhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** httpHeaderAuth: Header Auth account
- **External APIs:** http://pi6.local:5678/api/v1/workflows?active=true&limit=250

---

### `POST /webhook/discord-subscribe`

**Workflow:** DISCORD - Subscribe (ID: z3ptm83NqfKA1Qed)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/discord-subscribe

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → redis → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `STRIPE_WEBHOOK_URL`
- **Credentials:** redis: Redis account
- **External APIs:** https://api.stripe.com/v1/checkout/sessions

---

### `POST /webhook/entity-list`

**Workflow:** Entitity - List (ID: gzJ4nuRvVvoD0dGe)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/recipes-list

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → respondToWebhook → switch → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** =
  {dynamic}/api/entities/{dynamic}/user/{{ $('Validate
  Input').first().json.user_id }}?limit={dynamic}&offset={{ $('Validate
  Input').first().json.offset }}

---

### `POST /webhook/entity-social-actions`

**Workflow:** ENTITIES - Social Actions (ID: r3IriZ4hmS6PACNz)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/entity-social-actions

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 19
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/f6b3bbf7-b6e9-4ade-add4-12004d70b61c`

**Workflow:** 🎦💌Advanced YouTube RSS Feed Buddy for Your Favorite Channels (ID: cw7qdfz5YdbTu9Jr)

#### Description Fonctionnelle

{{ $env.WEBHOOK_URL }}

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 29
- **Chain:** `formTrigger → set → set → code → httpRequest → set` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Depends on workflow

#### Variables et Dépendances

- **Env Vars:** `API_BASE_URL, BASE_URL, TELEGRAM_CHAT_ID, WEBHOOK_URL`
- **Credentials:** gmailOAuth2: Gmail account, openAiApi: OpenAi account, telegramApi: Telegram account
- **External APIs:** {dynamic}

---

### `POST /webhook/f6b3bbf7-b6e9-4ade-add4-12004d70b61c`

**Workflow:** 🎦💌Advanced YouTube RSS Feed Buddy for Your Favorite Channels (ID: cw7qdfz5YdbTu9Jr)

#### Description Fonctionnelle

{{ $env.WEBHOOK_URL }}

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 29
- **Chain:** `formTrigger → set → set → code → httpRequest → set` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Depends on workflow

#### Variables et Dépendances

- **Env Vars:** `API_BASE_URL, BASE_URL, TELEGRAM_CHAT_ID, WEBHOOK_URL`
- **Credentials:** gmailOAuth2: Gmail account, openAiApi: OpenAi account, telegramApi: Telegram account
- **External APIs:** {dynamic}

---

### `POST /webhook/guild/register-if-needed`

**Workflow:** GUILD---On-Startup-Register (ID: ltWjzJmmYr6EhyD7)

#### Description Fonctionnelle

**Webhook:** POST /guild/register-if-needed

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → httpRequest → if → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/jobs/user-cleanup`

**Workflow:** JOBS---User-Cleanup (ID: uIJynqZpM2V18xst)

#### Description Fonctionnelle

Workflow: JOBS---User-Cleanup

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 17
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/mention`

**Workflow:** MENTION---On-Mention-Handler (ID: 1WxkLm9muiKKJ1zc)

#### Description Fonctionnelle

**Webhook:** POST /mention

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → httpRequest → if → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/orders-get`

**Workflow:** SHOPPING---Orders-Get (ID: YLnKRUWvGNsC49X1)

#### Description Fonctionnelle

Workflow: SHOPPING---Orders-Get

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/orders-list`

**Workflow:** SHOPPING---Orders-List (ID: CPIg8MzZLoAhUKSf)

#### Description Fonctionnelle

Workflow: SHOPPING---Orders-List

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/private-channel-callback`

**Workflow:** CHANNELS---Private-Register-Callback (ID: TwmCjwkEaml2lXQt)

#### Description Fonctionnelle

Workflow: CHANNELS---Private-Register-Callback

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 12
- **Chain:** `webhook → code → if → httpRequest → if → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/private-channel-request`

**Workflow:** CHANNELS---Private-Check-Or-Create (ID: T3YzHk3G0bu56Kfz)

#### Description Fonctionnelle

Workflow: CHANNELS---Private-Check-Or-Create

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 13
- **Chain:** `webhook → code → if → httpRequest → if → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_BASE_URL`
- **Credentials:** redis: Redis

---

### `POST /webhook/private-channel-unknown`

**Workflow:** CHANNELS---Private-Handle-Unknown-Channel (ID: X4ofmCCIZRQSiMzV)

#### Description Fonctionnelle

Workflow: CHANNELS---Private-Handle-Unknown-Channel

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 11
- **Chain:** `webhook → code → if → httpRequest → code → redis` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_BASE_URL`
- **Credentials:** redis: Redis

---

### `POST /webhook/products-persist`

**Workflow:** SHOPPING---Products-Persist (ID: Mazho6siX1xcKVH4)

#### Description Fonctionnelle

Workflow: SHOPPING---Products-Persist

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/profile-address-add`

**Workflow:** SHOPPING---Profile-Address-Add (ID: TO6MG9c6XmHsBVDr)

#### Description Fonctionnelle

Workflow: SHOPPING---Profile-Address-Add

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/profile-address-remove`

**Workflow:** SHOPPING---Profile-Address-Remove (ID: qFPXinxCApRhfvvQ)

#### Description Fonctionnelle

Workflow: SHOPPING---Profile-Address-Remove

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/profile-address-set-default`

**Workflow:** SHOPPING---Profile-Address-Set-Default (ID: 8cCr85WuYv8unzk7)

#### Description Fonctionnelle

Workflow: SHOPPING---Profile-Address-Set-Default

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/profile-address-update`

**Workflow:** SHOPPING---Profile-Address-Update (ID: s79at0XClbLfm82W)

#### Description Fonctionnelle

Workflow: SHOPPING---Profile-Address-Update

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/profile-get`

**Workflow:** SHOPPING---Profile-Get (ID: x904eRnalOSHiy1e)

#### Description Fonctionnelle

Workflow: SHOPPING---Profile-Get

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/profile-update`

**Workflow:** SHOPPING---Profile-Update (ID: 8Va4CkiA6rpYmTW2)

#### Description Fonctionnelle

Workflow: SHOPPING---Profile-Update

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/q36nyuiWrZ0ktCoA/webhook%20trigger/subscription-checkout-create`

**Workflow:** Stripe - Subscription Checkout Create (ID: q36nyuiWrZ0ktCoA)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/subscription-checkout-create

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → redis → code → if` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** redis: Redis account
- **External APIs:** https://api.stripe.com/v1/checkout/sessions

---

### `POST /webhook/shipping-calculate`

**Workflow:** SHOPPING---Shipping-Calculate (ID: fCEfOxFRZt9Fz97A)

#### Description Fonctionnelle

Workflow: SHOPPING---Shipping-Calculate

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/shipping-select`

**Workflow:** SHOPPING---Shipping-Select (ID: YL8WbufqHc5fGuSd)

#### Description Fonctionnelle

Workflow: SHOPPING---Shipping-Select

#### Description Technique

- **Response Mode:** `onReceived`
- **Nodes:** 8
- **Chain:** `webhook → code → if → httpRequest → code → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/stripe-register-project`

**Workflow:** Stripe - Register Project (ID: 2UH1itSxHgJQhF4e)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/stripe-register-project

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → code → if → redis → code → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** redis: Redis account

---

### `POST /webhook/stripe-subscription-cancel`

**Workflow:** Stripe - Subscription Cancel (ID: vNj31jT1I0oya3HE)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-sub-cancel

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → code → if → httpRequest` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_KEY, API_URL`

---

### `POST /webhook/stripe-subscription-renewal`

**Workflow:** Stripe - Subscription Renewal (ID: dGqqwaoSshiFNUiN)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-sub-renewal

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 14
- **Chain:** `webhook → code → if → code → if → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** {dynamic}/api/subscribers/by-subscription/{stripe_subscription_id}, {dynamic}/api/subscribers/{id}/credits

---

### `POST /webhook/stripe-subscription-success`

**Workflow:** Stripe - Subscription Success (ID: RUFeJAp570Z1YMhj)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-sub-success

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 10
- **Chain:** `webhook → code → if → code → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_KEY, API_URL, _API_URL`
- **External APIs:** {dynamic}/api/payments/log, {dynamic}/api/subscriptions/activate

---

### `POST /webhook/stripe-webhook`

**Workflow:** Stripe - Webhook Handler (ID: B1mlPTX5z3uVFUG6)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/stripe-webhook

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 15
- **Chain:** `webhook → code → if → httpRequest → if → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **Credentials:** redis: Redis account
- **External APIs:** = https://api.stripe.com/v1/checkout/sessions/{dynamic}?expand[]=line_items.data.price, =https://api.stripe.com/v1/subscriptions/{dynamic}?expand[]=items.data.price

---

### `GET /webhook/subscription-result`

**Workflow:** Stripe - Subscription Result (ID: peHuqHt4lX6qMvdf)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/subscription-result

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 4
- **Chain:** `webhook → code → code → respondToWebhook`

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: text

---

### `GET /webhook/torah-job-status`

**Workflow:** Torah Job Status (ID: 0wrnsac6uL4uWZwD)

#### Description Fonctionnelle

**Endpoint:** GET /webhook/torah-job-status

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 11
- **Chain:** `webhook → code → if → httpRequest → code → if` ...

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL, N8N_WEBHOOK_URL`
- **External APIs:** http://localhost:5678

---

### `GET /webhook/torah-list`

**Workflow:** Torah List (ID: jzhTRsZs9268zxaW)

#### Description Fonctionnelle

**Endpoint:**

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → httpRequest → httpRequest → merge → code → respondToWebhook`

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `GET /webhook/torah-registry`

**Workflow:** Torah - Registry (ID: LO1vnAueSD669pcd)

#### Description Fonctionnelle

Workflow: Torah - Registry

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 4
- **Chain:** `webhook → httpRequest → code → respondToWebhook`

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Credentials:** httpHeaderAuth: Header Auth account
- **External APIs:** http://pi6.local:5678/api/v1/workflows?active=true&limit=250

---

### `GET /webhook/torah-result-get`

**Workflow:** Torah Result Store (ID: klXRyrZ0gcYLzDt6)

#### Description Fonctionnelle

**Internal workflow for storing/retrieving

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → webhook → code → code → respondToWebhook → respondToWebhook`

#### Input / Output

- **Input:** `GET` JSON body
- **Output:** Format: json

---

### `POST /webhook/torah-result-store`

**Workflow:** Torah Result Store (ID: klXRyrZ0gcYLzDt6)

#### Description Fonctionnelle

**Internal workflow for storing/retrieving

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 6
- **Chain:** `webhook → webhook → code → code → respondToWebhook → respondToWebhook`

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

---

### `POST /webhook/torah-review-action`

**Workflow:** Torah Review and Validation (ID: Q8AVO0u6trXceUGC)

#### Description Fonctionnelle

Workflow: Torah Review and Validation

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 14
- **Chain:** `webhook → webhook → code → httpRequest → httpRequest → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL, DISCORD_TOKEN, DISCORD_URL_CHANNEL`
- **External APIs:** {dynamic}{dynamic}/messages

---

### `POST /webhook/torah-submit-review`

**Workflow:** Torah Review and Validation (ID: Q8AVO0u6trXceUGC)

#### Description Fonctionnelle

Workflow: Torah Review and Validation

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 14
- **Chain:** `webhook → webhook → code → httpRequest → httpRequest → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** JSON { success, data/error }

#### Variables et Dépendances

- **Env Vars:** `API_URL, DISCORD_TOKEN, DISCORD_URL_CHANNEL`
- **External APIs:** {dynamic}{dynamic}/messages

---

### `POST /webhook/torah-validate-text`

**Workflow:** Torah Validate Text (ID: X89Y430u5cwutSi0)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-validate-text

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 7
- **Chain:** `webhook → code → if → httpRequest → code → respondToWebhook` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`

---

### `POST /webhook/torah-vocalization`

**Workflow:** Torah Vocalization (Nekudot) (ID: 7hWKg1eHA1RNeIgj)

#### Description Fonctionnelle

**Endpoint:** POST /webhook/torah-vocalization

#### Description Technique

- **Response Mode:** `responseNode`
- **Nodes:** 31
- **Chain:** `webhook → code → if → if → httpRequest → code` ...

#### Input / Output

- **Input:** `POST` JSON body
- **Output:** Format: json

#### Variables et Dépendances

- **Env Vars:** `API_URL`
- **External APIs:** https://api.openai.com/v1/chat/completions, {dynamic}/api/vocalization/save

---

## Annexe A: Table de Référence Rapide

| Path | Method | Workflow | Category |
|------|--------|----------|----------|
| `K60xx8kGU2DWcBKE/webhook%20trigger/subscription-change-plan` | POST | Stripe - Subscription Change Plan | General |
| `Youtube` | GET | [n8n] YouTube Channel Advanced RSS Feeds... | General |
| `Youtube` | POST | [n8n] YouTube Channel Advanced RSS Feeds... | General |
| `academic-searcher` | POST | MCP - Academic Searcher | MCP Server |
| `analyze-feedback` | POST | MCP - Feedback Analyzer | MCP Server |
| `analyze-message` | POST | MCP - Analyze Message | MCP Server |
| `books-commentary-worker` | POST | Books Commentary Worker | Document Processing |
| `books-job-status` | GET | Books Job Status | Document Processing |
| `books-translate` | POST | Books Translation Manager | Translation |
| `books-translate-commentaries` | POST | Books Translate Commentaries | Translation |
| `books-translation-worker` | POST | Books Translation Worker | Translation |
| `bulk-url-processor` | POST | MCP - Bulk URL Processor | MCP Server |
| `cart-add` | POST | SHOPPING---Cart-Add | General |
| `cart-apply-coupon` | POST | SHOPPING---Cart-Apply-Coupon | General |
| `cart-checkout` | POST | SHOPPING---Cart-Checkout | General |
| `cart-checkout-cancel` | GET | SHOPPING---Cart-Checkout-Cancel | General |
| `cart-checkout-success` | GET | SHOPPING---Cart-Checkout-Success | General |
| `cart-clear` | POST | SHOPPING---Cart-Clear | General |
| `cart-get` | GET | SHOPPING---Cart-Get | General |
| `cart-remove` | POST | SHOPPING---Cart-Remove | General |
| `cart-remove-coupon` | POST | SHOPPING---Cart-Remove-Coupon | General |
| `cart-update` | POST | SHOPPING---Cart-Update | General |
| `category-detect` | POST | Category Detect | Data Analysis |
| `centroid` | GET | MCP - Centroid Calculator | MCP Server |
| `chart-generator` | POST | MCP - Chart Generator | MCP Server |
| `code-generator` | POST | MCP - Code Generator | MCP Server |
| `config/branding` | GET | CONFIG---Get-Branding | General |
| `config/branding` | PUT | CONFIG---On-Branding-Update | General |
| `config/help` | GET | CONFIG---Get-Help | General |
| `config/help` | PUT | CONFIG---On-Help-Update | General |
| `config/help/reset` | POST | CONFIG---Help-Reset | General |
| `cost-calculator` | POST | MCP - Cost Calculator | MCP Server |
| `credits-check` | POST | Credits Check | Credits & Billing |
| `credits-debit` | POST | Credits Debit | Credits & Billing |
| `credits-get` | GET | Credits - Get | Credits & Billing |
| `credits-refund` | POST | Credits Refund | Credits & Billing |
| `csv-processor` | POST | MCP - CSV Processor | MCP Server |
| `data-lookup-enrich` | POST | Data Lookup Enrich | Search & Lookup |
| `discord-billing-portal` | POST | DISCORD - Billing Portal | Credits & Billing |
| `discord-get-balance` | GET | DISCORD - Get Balance | General |
| `discord-get-credits` | GET | DISCORD - Get Credits | Credits & Billing |
| `discord-get-plans` | GET | DISCORD - Get Plans | General |
| `discord-get-subscriber` | GET | DISCORD - Get Subscriber | General |
| `discord-get-transactions` | GET | DISCORD - Get Transactions | General |
| `discord-registry` | GET | DISCORD - Registry | General |
| `discord-subscribe` | POST | DISCORD - Subscribe | General |
| `document-cancel` | POST | Document Cancel | Document Processing |
| `document-structure-extract` | POST | Document Structure Extract | Document Processing |
| `document-translate-worker` | POST | Document Translate Worker | Translation |
| `documents/estimate` | POST | MCP - Documents Estimate | MCP Server |
| `documents/process` | POST | MCP - Documents Process | MCP Server |
| `documents/save` | POST | MCP - Documents Save | MCP Server |
| `documents/validate` | POST | MCP - Documents Validate | MCP Server |
| `docx-extractor` | POST | MCP - DOCX Extractor | MCP Server |
| `email-imap` | POST | MCP - Email IMAP | MCP Server |
| `entity-extractor` | POST | MCP - Entity Extractor | MCP Server |
| `entity-list` | POST | Entitity - List | General |
| `entity-social-actions` | POST | ENTITIES - Social Actions | General |
| `f6b3bbf7-b6e9-4ade-add4-12004d70b61c` | GET | 🎦💌Advanced YouTube RSS Feed Buddy for Yo... | General |
| `f6b3bbf7-b6e9-4ade-add4-12004d70b61c` | POST | 🎦💌Advanced YouTube RSS Feed Buddy for Yo... | General |
| `gemini-image` | POST | MCP Gemini Image | MCP Server |
| `google-drive-ocr` | POST | MCP - Google Drive OCR | MCP Server |
| `google-searcher` | POST | MCP - Google Searcher | MCP Server |
| `guild/register-if-needed` | POST | GUILD---On-Startup-Register | General |
| `html-extractor` | POST | MCP - HTML Extractor | MCP Server |
| `image-embedder` | POST | MCP - Image Embedder | MCP Server |
| `image-generator` | POST | MCP - Image Generator | MCP Server |
| `image-ocr` | POST | MCP - Image OCR | MCP Server |
| `jobs/user-cleanup` | POST | JOBS---User-Cleanup | General |
| `json-transformer` | POST | MCP - JSON Transformer | MCP Server |
| `knowledge-graph` | POST | MCP - Knowledge Graph | MCP Server |
| `language-detector` | POST | MCP - Language Detector | MCP Server |
| `linkedin` | POST | MCP - LinkedIn | MCP Server |
| `llm-intention` | POST | MCP - LLM Intention | MCP Server |
| `llm-summarizer` | POST | MCP - LLM Summarizer | MCP Server |
| `llm-web-search` | POST | LLM - Web Search | AI/LLM |
| `mathpix` | POST | MCP - Mathpix | MCP Server |
| `mcp-calendar` | POST | MCP - Google Calendar Server | MCP Server |
| `mcp-contacts` | POST | MCP - Google Contacts Server | MCP Server |
| `mcp-drive` | POST | MCP - Google Drive Server | MCP Server |
| `mcp-gmail` | POST | MCP - Gmail Server (All-in-One) | MCP Server |
| `mcp-google-maps` | POST | MCP - Google Maps | MCP Server |
| `mcp-registry` | GET | MCP - Registry | MCP Server |
| `mcp-test-echo` | POST | MCP - Test - Echo | MCP Server |
| `member-join` | POST | MEMBERS---On-Join-Grant-Credits | Credits & Billing |
| `mention` | POST | MENTION---On-Mention-Handler | General |
| `metadata-extractor` | POST | MCP - Metadata Extractor | MCP Server |
| `news-searcher` | POST | MCP - News Searcher | MCP Server |
| `orders-get` | GET | SHOPPING---Orders-Get | General |
| `orders-list` | GET | SHOPPING---Orders-List | General |
| `pdf-extractor` | POST | MCP - PDF Extractor | MCP Server |
| `pdf-layout-translator` | POST | MCP - PDF Layout Translator | MCP Server |
| `private-channel-callback` | POST | CHANNELS---Private-Register-Callback | General |
| `private-channel-request` | POST | CHANNELS---Private-Check-Or-Create | General |
| `private-channel-unknown` | POST | CHANNELS---Private-Handle-Unknown-Channe... | General |
| `product-discovery` | POST | SHOPPING---Product-Discovery-WebSearch | Search & Lookup |
| `products-persist` | POST | SHOPPING---Products-Persist | General |
| `profile-address-add` | POST | SHOPPING---Profile-Address-Add | General |
| `profile-address-remove` | POST | SHOPPING---Profile-Address-Remove | General |
| `profile-address-set-default` | POST | SHOPPING---Profile-Address-Set-Default | General |
| `profile-address-update` | POST | SHOPPING---Profile-Address-Update | General |
| `profile-get` | GET | SHOPPING---Profile-Get | General |
| `profile-update` | POST | SHOPPING---Profile-Update | General |
| `q36nyuiWrZ0ktCoA/webhook%20trigger/subscription-checkout-create` | POST | Stripe - Subscription Checkout Create | General |
| `qdrant-save` | POST | MCP Qdrant - Save | MCP Server |
| `qdrant-search` | POST | MCP - Qdrant - Search | MCP Server |
| `qdrant-similar` | POST | MCP - qdrant - Similar | MCP Server |
| `quiz-generator` | POST | MCP - Quiz Generator | MCP Server |
| `recipes-generate` | POST | Recipes - Generate | Recipe & Nutrition |
| `recipes-shopping` | POST | Recipes - Shopping | Recipe & Nutrition |
| `recipes-timer` | POST | Recipes - Timer | Recipe & Nutrition |
| `recipes-timer-notify` | POST | Recipes - Timer Notify | Recipe & Nutrition |
| `recipes-youtube` | POST | Recipes - YouTube | Recipe & Nutrition |
| `shipping-calculate` | POST | SHOPPING---Shipping-Calculate | General |
| `shipping-select` | POST | SHOPPING---Shipping-Select | General |
| `speaker-identifier` | POST | MCP - Speaker Identifier | MCP Server |
| `stripe-register-project` | POST | Stripe - Register Project | General |
| `stripe-subscription-cancel` | POST | Stripe - Subscription Cancel | General |
| `stripe-subscription-failure` | POST | Stripe - Subscription Payment Failure | AI/LLM |
| `stripe-subscription-renewal` | POST | Stripe - Subscription Renewal | General |
| `stripe-subscription-success` | POST | Stripe - Subscription Success | General |
| `stripe-webhook` | POST | Stripe - Webhook Handler | General |
| `subscription-result` | GET | Stripe - Subscription Result | General |
| `summarizer` | POST | MCP - Summarizer | MCP Server |
| `syllabus-generator` | POST | MCP - Syllabus Generator | MCP Server |
| `table-extractor` | POST | MCP - Table Extractor | MCP Server |
| `text-classifier` | POST | MCP - Text Classifier | MCP Server |
| `text-embedder` | POST | MCP - Text Embedder | MCP Server |
| `text-generator` | POST | MCP - Text Generator | MCP Server |
| `text-to-speech` | POST | MCP - Text to Speech | MCP Server |
| `tokenizer` | POST | MCP - Tokenizer | MCP Server |
| `torah-batch-translate` | POST | Torah Batch Translation with Commentarie... | Translation |
| `torah-discord-message` | POST | Torah Discord Bot - Commentary Search | Search & Lookup |
| `torah-discord-translate` | POST | Torah Discord Translation v2 (Unified) | Translation |
| `torah-discord-translate-pivot` | POST | Torah Discord Translation Pivot | Translation |
| `torah-document-callback` | POST | TORAH---Document-Callback | Document Processing |
| `torah-generate-pdf` | POST | Torah PDF Generation | Document Processing |
| `torah-get-page-translations` | GET | Torah Get Page Translations | Translation |
| `torah-job-status` | GET | Torah Job Status | General |
| `torah-list` | GET | Torah List | General |
| `torah-registry` | GET | Torah - Registry | General |
| `torah-result-get` | GET | Torah Result Store | General |
| `torah-result-store` | POST | Torah Result Store | General |
| `torah-review-action` | POST | Torah Review and Validation | General |
| `torah-submit-review` | POST | Torah Review and Validation | General |
| `torah-translate` | POST | Torah Translation Orchestrator | Translation |
| `torah-translate-page` | POST | Torah Translate Page | Translation |
| `torah-translate-page-worker` | POST | Torah Translate Page Worker | Translation |
| `torah-translate-worker` | POST | Torah Translate Worker | Translation |
| `torah-translation-status` | GET | Torah Translation Status | Translation |
| `torah-validate-text` | POST | Torah Validate Text | General |
| `torah-vocalization` | POST | Torah Vocalization (Nekudot) | General |
| `vector-store` | POST | MCP - Vector Store | MCP Server |
| `veo-video` | POST | MCP Veo Video | MCP Server |
| `video-transcription` | POST | MCP - Transcriber | MCP Server |
| `web-scraper` | POST | MCP - Web Scraper | MCP Server |
| `youtube-searcher` | POST | MCP - YouTube Searcher | MCP Server |

## Annexe B: Variables d'Environnement

| Variable | Usage |
|----------|-------|
| `API_BASE_URL` | 2 workflow(s) |
| `API_KEY` | 3 workflow(s) |
| `API_URL` | 75 workflow(s) |
| `BASE_URL` | 4 workflow(s) |
| `DISCORD_TOKEN` | 7 workflow(s) |
| `DISCORD_URL_CHANNEL` | 6 workflow(s) |
| `N8N_WEBHOOK_BASE_URL` | 4 workflow(s) |
| `N8N_WEBHOOK_URL` | 8 workflow(s) |
| `QDRANT_API_KEY` | 1 workflow(s) |
| `QDRANT_URL` | 1 workflow(s) |
| `STRIPE_WEBHOOK_URL` | 2 workflow(s) |
| `TELEGRAM_CHAT_ID` | 2 workflow(s) |
| `WEBHOOK_URL` | 3 workflow(s) |
| `_API_URL` | 1 workflow(s) |

## Annexe C: Credentials Utilisés

| Credential | Type |
|------------|------|
| anthropicApi: Anthropic account | - |
| gmailOAuth2: Gmail account | - |
| googleApi: Google API | - |
| googleVertexAiApi: Google Vertex AI account | - |
| httpHeaderAuth: Header Auth account | - |
| linkedInOAuth2Api: LinkedIn account | - |
| mistralCloudApi: Mistral account | - |
| openAiApi: OpenAI account | - |
| openAiApi: OpenAi account | - |
| postgres: PostgreSQL Subscribers | - |
| redis: Redis | - |
| redis: Redis account | - |
| serpApi: SerpAPI | - |
| telegramApi: Telegram account | - |
