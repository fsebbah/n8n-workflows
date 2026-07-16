# Migration Torah — `API_URL` → `TORAH_API_URL`

> Workflows torah/books/document : bascule du main backend (llm2) vers torah.api (host2).

## Topologie

| Machine | Service | Variable |
|---|---|---|
| **host2**:3031 | torah.api | `TORAH_API_URL` |
| **llm2**:3301 | api backend | `API_URL` (hors périmètre) |
| **llm**:5678 | n8n | `N8N_WEBHOOK_URL` = localhost |

## Règle
- `$env.API_URL` + `/api/…` → `$env.TORAH_API_URL`
- `$env.API_URL` + `/webhook/…` → `$env.N8N_WEBHOOK_URL` 🔴

## Périmètre : **34 webhooks, 67 nodes** (66 → TORAH_API_URL, 1 → N8N_WEBHOOK_URL 🔴)

### `Books Commentary Worker` — `/books-commentary-worker`

| Node | Avant | Après |
|---|---|---|
| Set In Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Update Error | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Save Translation | `{{$env.API_URL}}/api/translations/save` | `{{$env.TORAH_API_URL}}/api/translations/save` |
| Update Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `Books Job Status` — `/books-job-status`

| Node | Avant | Après |
|---|---|---|
| Fetch Job Status | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `Books Translate Commentaries` — `/books-translate-commentaries`

| Node | Avant | Après |
|---|---|---|
| Fetch Commentaries | `{{$env.API_URL}}/api/books/{{ $json.encodedTextName}}/{{ $json.chapter}}/commentaries?incl` | `{{$env.TORAH_API_URL}}/api/books/{{ $json.encodedTextName}}/{{ $json.chapter}}/commentarie` |
| Create Job (API) | `{{$env.API_URL}}/api/jobs` | `{{$env.TORAH_API_URL}}/api/jobs` |

### `Books Translation Manager` — `/books-translate`

| Node | Avant | Après |
|---|---|---|
| Fetch Chapter | `{{$env.API_URL}}/api/books/{{ $json.encodedTextName}}/{{ $json.chapter}}?include_translati` | `{{$env.TORAH_API_URL}}/api/books/{{ $json.encodedTextName}}/{{ $json.chapter}}?include_tra` |
| Create Job (API) | `{{$env.API_URL}}/api/v2/jobs` | `{{$env.TORAH_API_URL}}/api/v2/jobs` |

### `Books Translation Worker` — `/books-translation-worker`

| Node | Avant | Après |
|---|---|---|
| Set In Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Update Error | `{{$env.API_URL}}/api/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/jobs/{{ $json.jobId}}` |
| Save Translation | `{{$env.API_URL}}/api/translations/save` | `{{$env.TORAH_API_URL}}/api/translations/save` |
| Update Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `Document Cancel` — `/document-cancel`

| Node | Avant | Après |
|---|---|---|
| Get Job Status | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| PATCH Cancelled | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `Document Translate Worker` — `/document-translate-worker`

| Node | Avant | Après |
|---|---|---|
| Create Job (API) | `{{$env.API_URL}}/api/v2/jobs` | `{{$env.TORAH_API_URL}}/api/v2/jobs` |
| Set Processing | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Update After Extraction | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Mark Complete | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Update Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `MCP-Document-Callback` — `/document-callback`

| Node | Avant | Après |
|---|---|---|
| Update Job Status | `{{$env.API_URL}}/api/document-jobs/{{ $json.data.job_id}}/{{ $json.data.success ? 'complet` | `{{$env.TORAH_API_URL}}/api/document-jobs/{{ $json.data.job_id}}/{{ $json.data.success ? 'c` |

### `MCP - PDF Layout Translator` — `/pdf-layout-translator`

| Node | Avant | Après |
|---|---|---|
| Create Job | `{{$env.API_URL}}/api/v2/jobs` | `{{$env.TORAH_API_URL}}/api/v2/jobs` |
| Update Job Error | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Update Job Success | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `TORAH---Document-Callback` — `/torah-document-callback`

| Node | Avant | Après |
|---|---|---|
| Update Job Status | `{{$env.API_URL}}/api/document-jobs/{{ $json.data.job_id}}/{{ $json.data.success ? 'complet` | `{{$env.TORAH_API_URL}}/api/document-jobs/{{ $json.data.job_id}}/{{ $json.data.success ? 'c` |

### `TORAH - Get Chapter` — `/torah-get-chapter`

| Node | Avant | Après |
|---|---|---|
| Get Chapter from API | `=  {{ $env.API_URL}}/api/torah/chapters/{{ encodeURIComponent($json.source)}}/{{ $json.cha` | `=  {{ $env.TORAH_API_URL}}/api/torah/chapters/{{ encodeURIComponent($json.source)}}/{{ $js` |

### `TORAH - List Sections` — `/torah-list-sections`

| Node | Avant | Après |
|---|---|---|
| Get Sections from API | `{{$env.API_URL}}/api/torah/sections/{{ encodeURIComponent($json.source)}}` | `{{$env.TORAH_API_URL}}/api/torah/sections/{{ encodeURIComponent($json.source)}}` |

### `TORAH - Sources` — `/torah-sources`

| Node | Avant | Après |
|---|---|---|
| Get Sources from API | `{{$env.API_URL}}/api/torah/sources` | `{{$env.TORAH_API_URL}}/api/torah/sources` |

### `Torah Batch Translation with Commentaries` — `/torah-batch-translate`

| Node | Avant | Après |
|---|---|---|
| API - Fetch Source Texts | `{{$env.API_URL}}/api/source-texts?book{{$json.params.book}}&limit=100` | `{{$env.TORAH_API_URL}}/api/source-texts?book{{$json.params.book}}&limit=100` |
| API - Translate Text | `{{ $env.API_URL}}/api/translate-with-comments` | `{{ $env.TORAH_API_URL}}/api/translate-with-comments` |

### `Torah Corpus` — `/torah-corpus`

| Node | Avant | Après |
|---|---|---|
| Get Corpus (API) | `{{$env.API_URL}}/api/corpus` | `{{$env.TORAH_API_URL}}/api/corpus` |

### `Torah Corpus Sedarim` — `/torah-corpus-sedarim`

| Node | Avant | Après |
|---|---|---|
| Get Sedarim (API) | `{{$env.API_URL}}/api/corpus/{{ encodeURIComponent($json.corpus)}}/sedarim` | `{{$env.TORAH_API_URL}}/api/corpus/{{ encodeURIComponent($json.corpus)}}/sedarim` |

### `Torah Corpus Traites` — `/torah-corpus-traites`

| Node | Avant | Après |
|---|---|---|
| Get Traites (API) | `{{$env.API_URL}}/api/corpus/{{ encodeURIComponent($json.corpus)}}/sedarim/{{ encodeURIComp` | `{{$env.TORAH_API_URL}}/api/corpus/{{ encodeURIComponent($json.corpus)}}/sedarim/{{ encodeU` |

### `Torah Discord Bot - Commentary Search` — `/torah-discord-message`

| Node | Avant | Après |
|---|---|---|
| API - Get Talmud Text | `{{$env.API_URL}}/api/talmud/text/{{ $json.intent.traite}}/{{ $json.intent.page}}` | `{{$env.TORAH_API_URL}}/api/talmud/text/{{ $json.intent.traite}}/{{ $json.intent.page}}` |

### `Torah Discord Translation Pivot` — `/torah-discord-translate-pivot`

| Node | Avant | Après |
|---|---|---|
| Save to Cache | `{{$env.API_URL}}/api/translations/save` | `{{$env.TORAH_API_URL}}/api/translations/save` |

### `Torah Discord Translation v2 (Unified)` — `/torah-discord-translate`

| Node | Avant | Après |
|---|---|---|
| Search Cache | `{{$env.API_URL}}/api/translations/search?{{ $json.cacheSearchParams}}` | `{{$env.TORAH_API_URL}}/api/translations/search?{{ $json.cacheSearchParams}}` |
| Create Job | `{{$env.API_URL}}/api/v2/jobs` | `{{$env.TORAH_API_URL}}/api/v2/jobs` |

### `Torah Get Page Translations` — `/torah-get-page-translations`

| Node | Avant | Après |
|---|---|---|
| Get Page (API) | `{{$env.API_URL}}/api/talmud/page/{{ encodeURIComponent($json.traite)}}/{{ encodeURICompone` | `{{$env.TORAH_API_URL}}/api/talmud/page/{{ encodeURIComponent($json.traite)}}/{{ encodeURIC` |

### `Torah Job Status` — `/torah-job-status`

| Node | Avant | Après |
|---|---|---|
| Get Job (API) | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `Torah List` — `/torah-list`

| Node | Avant | Après |
|---|---|---|
| Get Projects | `{{$env.API_URL}}/api/projects` | `{{$env.TORAH_API_URL}}/api/projects` |
| Get Traites | `{{$env.API_URL}}/api/talmud/traites` | `{{$env.TORAH_API_URL}}/api/talmud/traites` |

### `Torah PDF Generation` — `/torah-generate-pdf`

| Node | Avant | Après |
|---|---|---|
| API - Fetch Translations | `{{$env.API_URL}}/api/translations/search?book{{$('Validate PDF Parameters').first().json.p` | `{{$env.TORAH_API_URL}}/api/translations/search?book{{$('Validate PDF Parameters').first().` |
| API - Generate PDF | `{{$env.API_URL}}/api/pdf/generate/complete` | `{{$env.TORAH_API_URL}}/api/pdf/generate/complete` |

### `Torah Review and Validation` — `/torah-submit-review`

| Node | Avant | Après |
|---|---|---|
| API - Update Status | `{{$env.API_URL}}/api/translations/{{ $json.translation_id}}/status` | `{{$env.TORAH_API_URL}}/api/translations/{{ $json.translation_id}}/status` |
| 🔴 Trigger Retranslation | `{{$env.API_URL}}/webhook/torah-translate` | `{{$env.N8N_WEBHOOK_URL}}/webhook/torah-translate` |

### `Torah Router` — `/torah-router`

| Node | Avant | Après |
|---|---|---|
| Create Job | `{{$env.API_URL}}/api/v2/jobs` | `{{$env.TORAH_API_URL}}/api/v2/jobs` |
| Set Processing | `{{$env.API_URL}}/api/v2/jobs/{{ $('Parse Input').first().json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $('Parse Input').first().json.jobId}}` |
| Update Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Set Completed | `{{$env.API_URL}}/api/v2/jobs/{{ $('Calc Progress').first().json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $('Calc Progress').first().json.jobId}}` |

### `Torah Save Worker` — `/torah-save`

| Node | Avant | Après |
|---|---|---|
| Save to API | `{{$env.API_URL}}/api/translations/save` | `{{$env.TORAH_API_URL}}/api/translations/save` |

### `Torah Translate Page` — `/torah-translate-page`

| Node | Avant | Après |
|---|---|---|
| Check Existing Translations | `{{$env.API_URL}}/api/talmud/page/{{ encodeURIComponent($json.traite)}}/{{ encodeURICompone` | `{{$env.TORAH_API_URL}}/api/talmud/page/{{ encodeURIComponent($json.traite)}}/{{ encodeURIC` |
| Fetch Page Segments | `{{$env.API_URL}}/api/talmud/page/{{ encodeURIComponent($json.traite)}}/{{ encodeURICompone` | `{{$env.TORAH_API_URL}}/api/talmud/page/{{ encodeURIComponent($json.traite)}}/{{ encodeURIC` |
| Create Job (API) | `{{$env.API_URL}}/api/v2/jobs` | `{{$env.TORAH_API_URL}}/api/v2/jobs` |

### `Torah Translate Page Worker` — `/torah-translate-page-worker`

| Node | Avant | Après |
|---|---|---|
| Set In Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $('Parse Input').first().json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $('Parse Input').first().json.jobId}}` |
| Update Error (API) | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Save Translation | `{{$env.API_URL}}/api/translations/save` | `{{$env.TORAH_API_URL}}/api/translations/save` |
| Update Progress (API) | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `Torah Translate Worker` — `/torah-translate-worker`

| Node | Avant | Après |
|---|---|---|
| Set In Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |
| Save Translation | `{{$env.API_URL}}/api/translations/save` | `{{$env.TORAH_API_URL}}/api/translations/save` |
| Update Progress | `{{$env.API_URL}}/api/v2/jobs/{{ $json.jobId}}` | `{{$env.TORAH_API_URL}}/api/v2/jobs/{{ $json.jobId}}` |

### `Torah Translation Orchestrator` — `/torah-translate-batch`

| Node | Avant | Après |
|---|---|---|
| API - Translate with Comments | `{{ $env.API_URL}}/api/translate-with-comments` | `{{ $env.TORAH_API_URL}}/api/translate-with-comments` |

### `Torah Translation Status` — `/torah-translation-status`

| Node | Avant | Après |
|---|---|---|
| Get Global Status | `{{$env.API_URL}}/api/talmud/traites` | `{{$env.TORAH_API_URL}}/api/talmud/traites` |
| Get Traite Status | `{{$env.API_URL}}/api/talmud/traite/{{ $json.traite}}/pages` | `{{$env.TORAH_API_URL}}/api/talmud/traite/{{ $json.traite}}/pages` |

### `Torah Validate Text` — `/torah-validate-text`

| Node | Avant | Après |
|---|---|---|
| Search Torah API | `{{$env.API_URL}}/api/sefaria/texts/search?{{ $json.searchParams}}` | `{{$env.TORAH_API_URL}}/api/sefaria/texts/search?{{ $json.searchParams}}` |

### `Torah Vocalization (Nekudot)` — `/torah-vocalization`

| Node | Avant | Après |
|---|---|---|
| Check Nekudot API | `{{$env.API_URL}}/api/commentaries/nekudot` | `{{$env.TORAH_API_URL}}/api/commentaries/nekudot` |
| Search Cache | `{{$env.API_URL}}/api/vocalization/search?{{ $json.cacheSearchParams}}` | `{{$env.TORAH_API_URL}}/api/vocalization/search?{{ $json.cacheSearchParams}}` |
| Save to Cache | `{{ $env.API_URL}}/api/vocalization/save` | `{{ $env.TORAH_API_URL}}/api/vocalization/save` |

## Réimport (stems)
```
Books_Commentary_Worker
Books_Job_Status
Books_Translate_Commentaries
Books_Translation_Manager
Books_Translation_Worker
Document_Cancel
Document_Translate_Worker
MCP-Document-Callback
MCP_-_PDF_Layout_Translator
TORAH---Document-Callback
TORAH_-_Get_Chapter
TORAH_-_List_Sections
TORAH_-_Sources
Torah_Batch_Translation_with_Commentaries
Torah_Corpus
Torah_Corpus_Sedarim
Torah_Corpus_Traites
Torah_Discord_Bot_-_Commentary_Search
Torah_Discord_Translation_Pivot
Torah_Discord_Translation_v2_(Unified)
Torah_Get_Page_Translations
Torah_Job_Status
Torah_List
Torah_PDF_Generation
Torah_Review_and_Validation
Torah_Router
Torah_Save_Worker
Torah_Translate_Page
Torah_Translate_Page_Worker
Torah_Translate_Worker
Torah_Translation_Orchestrator
Torah_Translation_Status
Torah_Validate_Text
Torah_Vocalization_(Nekudot)
```
