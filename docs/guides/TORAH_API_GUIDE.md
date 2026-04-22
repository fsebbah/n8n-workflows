# Guide des Endpoints Torah - n8n Workflows

Ce document liste les endpoints n8n utilises par les plugins Torah.

**Base URL n8n:** `http://pi6.local:5678/webhook/`
**Base URL API:** `$env.API_URL` (backend Torah)

---

## Webhooks UTILISES par plugin-torah

| Webhook | Methode | Description |
|---------|---------|-------------|
| `torah-sources` | GET | Liste des sources pour autocomplete |
| `torah-get-page-translations` | GET | Page avec segments et traductions |
| `torah-list` | GET | Liste des traites Talmud |
| `torah-translate-page` | POST | Lancer traduction de page |
| `torah-job-status` | GET | Statut job (polling) |
| `torah-router` | POST | Traduction unitaire segment |
| `torah-vocalization` | POST | Ajout des nekudot |
| `torah-list-sections` | POST | Sections d'un texte complexe |
| `torah-get-section` | POST | Recuperer une section |
| `torah-validate-text` | POST | Valider reference textuelle |

**Total: 10 webhooks actifs**

---

## Detail des endpoints utilises

---

### GET /webhook/torah-sources

Liste des sources Torah disponibles.

**Endpoints Backend:**
```
GET /api/torah/sources
```

**Response:**
```json
{
  "success": true,
  "sources": [...],
  "count": 42,
  "updated_at": "2026-04-17T12:00:00Z"
}
```

---

### GET /webhook/torah-get-page-translations

Recupere une page avec segments et traductions.

**Input (Query):**
| Param | Type | Description |
|-------|------|-------------|
| `traite` | string | Nom du traite (ex: "Berakhot") |
| `page` | string | Numero de page (ex: "2a") |
| `include_translations` | bool | Inclure traductions |
| `target_language` | string | Langue cible (ex: "fr") |

**Endpoints Backend:**
```
GET /api/talmud/page/{traite}/{page}/segments?include_translations=true&target_language={lang}
```

**Response:**
```json
{
  "success": true,
  "traite": "Berakhot",
  "page": "2a",
  "segments": [...]
}
```

---

### GET /webhook/torah-list

Liste les traites et textes disponibles.

**Endpoints Backend:**
```
GET /api/talmud/traites
GET /api/texts/projects
```

**Response:**
```json
{
  "success": true,
  "items": [...],
  "total": 12
}
```

---

### POST /webhook/torah-translate-page

Lance un job de traduction de page complete.

**Input (Body):**
```json
{
  "traite": "Berakhot",
  "page": "2a",
  "mode": "premium",
  "target_language": "fr",
  "api_key": "sk-ant-...",
  "openai_api_key": "sk-...",
  "force": false
}
```

**Endpoints Backend:**
```
GET  /api/talmud/page/{traite}/{page}/segments
GET  /api/talmud/text/{traite}/{page}
POST /api/v2/jobs
```

**Webhooks internes appeles:**
```
POST /webhook/torah-router
```

**Response:**
```json
{
  "success": true,
  "job_id": "job_abc123",
  "status": "started",
  "segments_count": 14,
  "estimated_seconds": 100
}
```

---

### GET /webhook/torah-job-status

Statut d'un job de traduction (polling).

**Input (Query):**
| Param | Type | Description |
|-------|------|-------------|
| `job_id` | string | ID du job |

**Endpoints Backend:**
```
GET /api/v2/jobs/{jobId}
```

**Webhooks internes appeles:**
```
GET /webhook/torah-result-get?job_id={jobId}
```

**Response (en cours):**
```json
{
  "job_id": "job_abc123",
  "status": "in_progress",
  "progress": { "current": 5, "total": 14 }
}
```

**Response (termine):**
```json
{
  "status": "completed",
  "translation": { "final": "..." },
  "tokens": { "claude": {...}, "gpt": {...} }
}
```

---

### POST /webhook/torah-router

Orchestrateur principal des traductions unitaires.

**Input (Body):**
```json
{
  "text": "...",
  "job_type": "unit_translation",
  "job_id": "job_xxx",
  "api_key": "sk-ant-...",
  "target_language": "fr",
  "context": { "traite": "...", "page": "..." }
}
```

**Endpoints Backend:**
```
POST  /api/v2/jobs
PATCH /api/v2/jobs/{jobId}
```

**Webhooks internes appeles:**
```
POST /webhook/torah-chunk
POST /webhook/torah-translate
POST /webhook/torah-save
POST /webhook/torah-error
```

**Response:**
```json
{
  "success": true,
  "job_id": "job_xxx",
  "translation": "..."
}
```

---

### POST /webhook/torah-vocalization

Ajoute les voyelles (nekudot) a un texte hebreu.

**Input (Body):**
```json
{
  "text": "Texte hebreu sans voyelles",
  "openai_api_key": "sk-...",
  "commentary_id": "uuid",
  "context": { "traite": "...", "page": "...", "commentator": "..." }
}
```

**Endpoints Backend:**
```
GET  /api/vocalization/search?{params}
POST /api/vocalization/save
POST /api/commentaries/nekudot
```

**Response:**
```json
{
  "success": true,
  "vocalization": {
    "original": "...",
    "vocalized": "..."
  }
}
```

---

### POST /webhook/torah-list-sections

Liste les sections d'une source complexe.

**Input (Body):**
```json
{
  "source": "Sha'ar HaHakdamot"
}
```

**Endpoints Backend:**
```
GET /api/torah/sections/{source}
```

**Response:**
```json
{
  "success": true,
  "sections": [...]
}
```

---

### POST /webhook/torah-get-section

Recupere une section specifique.

**Input (Body):**
```json
{
  "source": "Sha'ar HaHakdamot",
  "section": "Introduction",
  "number": 3
}
```

**Endpoints Backend:**
```
GET /api/torah/sections/{source}/{section}?number={number}
```

**Response:**
```json
{
  "success": true,
  "section": {...}
}
```

---

### POST /webhook/torah-validate-text

Valide et normalise les noms de textes.

**Input (Body):**
```json
{
  "query": "soukkah",
  "category": "bavli"
}
```

**Endpoints Backend:**
```
GET /api/sefaria/texts/search?{params}
```

**Response:**
```json
{
  "found": true,
  "query": "soukkah",
  "canonical": "Sukkah",
  "heTitle": "סוכה"
}
```

---

## Resume des endpoints Backend utilises

| Endpoint Backend | Methode | Utilise par |
|------------------|---------|-------------|
| `/api/torah/sources` | GET | torah-sources |
| `/api/torah/sections/{source}` | GET | torah-list-sections |
| `/api/torah/sections/{source}/{section}` | GET | torah-get-section |
| `/api/talmud/traites` | GET | torah-list |
| `/api/talmud/page/{traite}/{page}/segments` | GET | torah-get-page-translations, torah-translate-page |
| `/api/talmud/text/{traite}/{page}` | GET | torah-translate-page |
| `/api/texts/projects` | GET | torah-list |
| `/api/v2/jobs` | POST | torah-translate-page, torah-router |
| `/api/v2/jobs/{id}` | GET | torah-job-status |
| `/api/v2/jobs/{id}` | PATCH | torah-router |
| `/api/vocalization/search` | GET | torah-vocalization |
| `/api/vocalization/save` | POST | torah-vocalization |
| `/api/commentaries/nekudot` | POST | torah-vocalization |
| `/api/sefaria/texts/search` | GET | torah-validate-text |

---

## Webhooks INTERNES (appeles par torah-router)

Ces webhooks ne sont pas appeles directement par les plugins mais sont utilises en interne par `torah-router`. **Ils doivent rester actifs.**

| Webhook | Workflow ID | Role |
|---------|-------------|------|
| `torah-chunk` | 2FxQ4IsPqcjCG5LX | Decoupage texte long |
| `torah-translate` | 1DCxCFLegp97V6l3 | Appel LLM traduction |
| `torah-save` | yH6mS2rVeMwJm6Nj | Sauvegarde PostgreSQL |
| `torah-error` | LsHigLBCd6GvqRHg | Gestion erreurs |
| `torah-result-get` | klXRyrZ0gcYLzDt6 | Lecture resultat job |
| `torah-result-store` | klXRyrZ0gcYLzDt6 | Stockage resultat job |

---

## Webhooks NON UTILISES (a supprimer)

| Webhook | Workflow ID | Note |
|---------|-------------|------|
| `torah-batch-translate` | P8RPgMY3vdc6mRso | Batch jobs legacy |
| `torah-discord-message` | mzLAkw5JjiQtRKxs | Legacy Discord |
| `torah-discord-translate-pivot` | wln6S8QuWQ5MfWrK | Legacy Discord |
| `torah-generate-pdf` | 4Rje9T8MD2sNLPZH | Feature PDF non utilisee |
| `torah-get-chapter` | EJIgBBjrB9sygQo4 | Doublon |
| `torah-get-page` | iz5ABfz5B5wUvsSG | Doublon |
| `torah-index` | kJ6pw7dd63eznLkb | Indexation Qdrant |
| `torah-registry` | LO1vnAueSD669pcd | Registry interne |
| `torah-review-action` | Q8AVO0u6trXceUGC | Review non utilise |
| `torah-search` | Uld6qygwKxPdkJS6 | Recherche RAG |
| `torah-submit-review` | Q8AVO0u6trXceUGC | Review non utilise |
| `torah-translate-chapter` | cq0AOYi20CdMvhdc | Doublon translate-page |
| `torah-translate-page-worker` | 5Fx65mlegjBnEfJY | Worker obsolete |
| `torah-translation-status` | 2uFfsvu6V723B2sR | Stats non utilisees |

**Total: 14 webhooks a supprimer**

---

## Resume

| Categorie | Nombre |
|-----------|--------|
| Webhooks utilises (plugins) | **10** |
| Webhooks internes (torah-router) | **6** |
| Webhooks non utilises (a supprimer) | **14** |
| Endpoints backend uniques | **14** |

---

## Retour API Torah — cadrage refacto corpus / translations_v2

**Date :** 2026-04-22. Destinataires : équipe n8n.

Cette section croise les 14 endpoints backend listés ci-dessus avec
(a) leur existence réelle dans le code `api/routers/`, et
(b) leur impact sur la refacto DB `corpus` / `sedarim` / `source_text_segments` / `translations_v2` livrée par l'équipe data.

### 1. Mapping endpoint n8n → code réel

| # | Endpoint n8n | Existe côté API ? | Fichier | Impact refacto corpus/v2 |
|---|---|---|---|---|
| 1 | `GET /api/torah/sources` | Oui | `api/routers/torah.py:217` | **À refondre** — exposer `corpus` / `seder` par source + filtre `?corpus=` |
| 2 | `GET /api/torah/sections/{source}` | Oui | `api/routers/torah.py:321` | **À refondre** — résolution `source` → project via corpus (ambiguïté §4.2) |
| 3 | `GET /api/torah/sections/{source}/{section}` | Oui | `api/routers/torah.py:368` | **À refondre** — idem |
| 4 | `GET /api/talmud/traites` | Oui | `api/routers/talmud.py:60` | **À refondre** — grouper par corpus, filtre `?corpus=` |
| 5 | `GET /api/talmud/page/{traite}/{page}/segments` | Oui | `api/routers/talmud.py:655` | **CRITIQUE** — lire `source_text_segments` (au lieu du split Python sur `hebrew_text`), JOIN `translations_v2`, auto-disambigüation §4.2 |
| 6 | `GET /api/talmud/text/{traite}/{page}` | **NON** | — | **Question 1 ci-dessous** |
| 7 | `GET /api/texts/projects` | **NON** | — | **Question 2 ci-dessous** |
| 8 | `POST /api/v2/jobs` | Oui | `api/routers/unified_jobs.py:309` | **Hors scope corpus** — persiste en MongoDB, pas PostgreSQL |
| 9 | `GET /api/v2/jobs/{id}` | Oui | `api/routers/unified_jobs.py:409` | **Hors scope corpus** — MongoDB |
| 10 | `PATCH /api/v2/jobs/{id}` | Oui | `api/routers/unified_jobs.py:553` | **Hors scope corpus** — MongoDB |
| 11 | `GET /api/vocalization/search` | Oui | `api/routers/vocalization/search.py:17` | **À refondre** — lire `source_text_segments.vocalized_text` + `commentary_details.(traite/page/segment_num)` |
| 12 | `POST /api/vocalization/save` | Oui | `api/routers/vocalization/save.py:21` | **À refondre** — écrire dans `source_text_segments.vocalized_text` (nouvelle colonne §2.4) |
| 13 | `POST /api/commentaries/nekudot` | **NON** | — | **Question 3 ci-dessous** |
| 14 | `GET /api/sefaria/texts/search` | Oui | `api/routers/sefaria.py:125` | **Optionnel** — lit `sefaria_texts`, non impacté directement. Peut être enrichi pour exposer `corpus` du résultat (aide n8n à passer `?corpus=` aux appels suivants) |

### 2. Le chemin de sauvegarde des traductions — trou noir dans la doc

Les endpoints save historiques sont tous marqués « non utilisés » dans cette
doc :
- `POST /api/translations/save`
- `POST /api/torah/translations`
- Workflows `torah-save`, `torah-translate-chapter`, `torah-save-worker`

Le seul chemin cité pour une traduction est :

```
n8n → POST  /api/v2/jobs          (création du job, stocké en MongoDB)
n8n → GET   /api/v2/jobs/{id}     (polling)
n8n → PATCH /api/v2/jobs/{id}     (mise à jour statut)
```

Or `/api/v2/jobs` **persiste en MongoDB** (queue), pas dans
`translations_v2` (PostgreSQL). La doc ne cite aucun endpoint backend qui
écrive dans les tables PostgreSQL `translations_v2` /
`commentary_translations` / `pending_translations`.

**Question 4 ci-dessous.**

### 3. Endpoints vocalization — à refondre

Les endpoints `/api/vocalization/search` et `/api/vocalization/save`
touchent directement les colonnes `vocalized_text` qui existent désormais
sur deux tables :

- `source_text_segments.vocalized_text` (nouvelle table, §2.4 du
  hand-off DB)
- `commentary_details.vocalized_text` (table existante, enrichie des
  colonnes `traite` / `page` / `segment_num`)

Aujourd'hui le code lit/écrit sur `source_texts.vocalized_text` (table
parent). Il faut migrer vers le niveau segment.

### 4. Endpoints hors scope n8n mais dans le scope refacto

L'audit DB team (`api-endpoints-impacted-by-corpus.md`) mentionne
beaucoup d'endpoints absents de cette doc n8n (batch, indexing, search
racine, translation_v2.py…). Certains n'existent même pas dans notre
repo. **On ne les traite pas**. Scope = ce qui est dans cette doc n8n.

### 5. Questions bloquantes avant implémentation

Merci de répondre point par point directement dans cette section ou dans
un nouveau document.

**Q1 — `GET /api/talmud/text/{traite}/{page}` n'existe pas côté API.**
Deux hypothèses :
- (a) faute de frappe pour `GET /api/talmud/page/{traite}/{page}/segments`
  (qui existe et fait le travail) ?
- (b) endpoint à créer, qui renverrait le texte brut d'une page sans les
  segments ni les commentaires ?

Si (b), quel est le payload de sortie attendu (juste `hebrew_text` ? Avec
ou sans vocalisation ?).

**Q2 — `GET /api/texts/projects` n'existe pas.**
Notre endpoint équivalent est `GET /api/projects`
(`api/routers/projects.py:29`, monté dans `api/main.py:181`). Deux
options :
- (a) n8n corrige son URL vers `/api/projects` ?
- (b) on crée un alias `/api/texts/projects` qui proxy vers `/api/projects` ?

**Q3 — `POST /api/commentaries/nekudot` n'existe pas.**
Deux lectures possibles :
- (a) un alias vers `POST /api/vocalization/save` avec un
  `commentary_id` obligatoire ?
- (b) un endpoint dédié avec un contrat spécifique aux commentaires (ex :
  batch mode RFC-011 cité dans la doc n8n précédente `POST /webhook/torah-vocalization`
  section « Mode Batch ») ?

Préciser le payload in / out attendu.

**Q4 — Chemin d'écriture des traductions en PostgreSQL.**
Une fois un job `torah_page` / `torah_unit` / `torah_commentary`
complété côté n8n, comment la traduction atterrit-elle dans
`translations_v2` / `commentary_translations` / `pending_translations` ?
Trois hypothèses :
- (a) un worker interne côté API consomme la queue MongoDB
  (`/api/v2/jobs`) et écrit en PostgreSQL
- (b) n8n continue d'appeler `POST /api/translations/save` en fin de
  chaîne (oubli dans la doc)
- (c) n8n écrit directement via un futur endpoint à créer (à nommer)

Si (c), nous créons l'endpoint ; contrat souhaité côté n8n ?

**Q5 — Rétrocompat.**
Confirmation que le cassage est net sur tous les endpoints refondus :
- pas de fallback si `?corpus=` absent et ambiguïté → HTTP 400 avec
  `AmbiguousReferenceError` (§4.2 hand-off DB)
- `GET /api/torah/sources` et `GET /api/talmud/traites` retournent
  désormais les colonnes `corpus` / `seder` dans chaque item (clients
  n8n doivent accepter ces nouveaux champs)

### 6. Plan d'implémentation proposé (sous réserve des réponses ci-dessus)

- **Lot A** (seul, bloque le reste) : modèles SQLAlchemy côté API
  (`Corpus`, `Seder`, `SourceTextSegment`, `TranslationV2`,
  `CommentaryTranslation`, `PendingTranslation`) + extensions
  `TranslationProject` et `CommentaryDetail` + helper
  `corpus_resolver` (auto-disambigüation).
- **Lot B** (parallélisable) : refacto lectures corpus-aware
  (endpoints 1, 2, 3, 4, 5).
- **Lot C** (parallélisable) : refacto vocalization (endpoints 11, 12).
- **Lot D** (conditionnel Q1-Q3) : création des endpoints absents si
  confirmés.
- **Lot E** (conditionnel Q4) : chemin d'écriture des traductions.
- **Lot F** : documentation finale n8n (markdown + OpenAPI/Swagger).

Aucun test ne sera lancé par les subagents. Aucune migration Alembic
ne sera touchée côté API.

---

## Réponses équipe n8n — 2026-04-22

### R1 — `GET /api/talmud/text/{traite}/{page}`

**Réponse : (b) endpoint à créer.**

Le workflow `Torah_Translate_Page` appelle deux endpoints distincts :
```
1. GET /api/talmud/page/{traite}/{page}/segments  → "Check Existing Translations"
2. GET /api/talmud/text/{traite}/{page}           → "Fetch Page Segments"
```

L'endpoint (2) est utilisé pour récupérer le texte brut de la page avant traduction.

**Payload de sortie attendu :**
```json
{
  "traite": "Berakhot",
  "page": "2a",
  "hebrew_text": "...",
  "segments": [
    { "index": 0, "text": "..." },
    { "index": 1, "text": "..." }
  ]
}
```

Avec ou sans vocalisation : **sans** (la vocalisation est gérée séparément via `torah-vocalization`).

---

### R2 — `GET /api/texts/projects`

**Réponse : (a) n8n corrige son URL.**

Le workflow `Torah_List` sera modifié pour appeler `/api/projects` au lieu de `/api/texts/projects`.

**Action n8n :** Modifier `Torah_List.json` pour utiliser `GET /api/projects`.

---

### R3 — `POST /api/commentaries/nekudot`

**Réponse : (b) endpoint dédié batch.**

Le workflow `Torah_Vocalization_Nekudot` appelle cet endpoint pour vérifier en batch si des commentaires ont déjà des nekudot.

**Payload in :**
```json
{
  "ids": ["commentary_uuid_1", "commentary_uuid_2", ...]
}
```

**Payload out attendu :**
```json
{
  "results": [
    { "id": "commentary_uuid_1", "has_nekudot": true, "vocalized_text": "..." },
    { "id": "commentary_uuid_2", "has_nekudot": false, "vocalized_text": null }
  ]
}
```

C'est un check batch, pas une sauvegarde. La sauvegarde passe par `POST /api/vocalization/save`.

---

### R4 — Chemin d'écriture des traductions

**Réponse : (b) n8n appelle `POST /api/translations/save`.**

La chaîne complète :
```
torah-translate-page
  └→ POST /api/v2/jobs (création job MongoDB)
  └→ POST /webhook/torah-router (async)
       └→ POST /webhook/torah-translate (LLM)
       └→ POST /webhook/torah-save
            └→ POST /api/translations/save ← ÉCRITURE PostgreSQL
       └→ PATCH /api/v2/jobs/{id} (update statut)
```

**Payload envoyé à `/api/translations/save` :**
```json
{
  "job_id": "uuid",
  "source_text_id": "uuid",
  "commentary_id": "uuid | null",
  "segment_index": 0,
  "translated_text": "...",
  "target_language": "fr",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet",
  "tokens": { "input": 100, "output": 150 },
  "metadata": { ... }
}
```

#### Inventaire complet des endpoints de sauvegarde

| Endpoint | Workflows | Statut |
|----------|-----------|--------|
| `POST /api/translations/save` | Torah_Save_Worker, Torah_Translate_Page_Worker, Torah_Discord_Translation_Pivot | **ACTIF** - principal |
| `POST /api/torah/translations` | TORAH_-_Translate_Chapter | Non utilisé |
| `POST /api/translate-with-comments` | Torah_Batch_Translation_with_Commentaries, Torah_Translation_Orchestrator | Non utilisé |
| `POST /api/vocalization/save` | Torah_Vocalization_Nekudot | **ACTIF** - vocalisation |

**Question pour l'équipe API :**
- `POST /api/translations/save` écrit-il dans `translations_v2` / `commentary_translations` / `pending_translations` ?
- `POST /api/vocalization/save` écrit-il dans `source_text_segments.vocalized_text` ?

Si ces endpoints n'existent pas ou écrivent ailleurs, c'est le "trou noir" identifié. Merci de confirmer ou d'indiquer le mapping réel.

**Note :** Les workflows `torah-save`, `torah-translate` sont marqués "non utilisés" car ils ne sont pas appelés directement par les plugins, mais ils sont appelés **en interne** par `torah-router`. Ils doivent rester actifs.

---

### R5 — Rétrocompat

**Confirmé.** Côté n8n :
- Les workflows accepteront les nouveaux champs `corpus` / `seder` dans les réponses.
- Si l'API retourne HTTP 400 `AmbiguousReferenceError`, le workflow propagera l'erreur au client Discord avec un message explicatif demandant de préciser le corpus.

**Action n8n :** Ajouter la gestion du paramètre `?corpus=` dans les appels où c'est nécessaire (endpoints 1-5, 11-12).

---

### Correction doc — Webhooks internes

Les webhooks suivants sont marqués "non utilisés" mais sont en fait **appelés en interne par `torah-router`** :
- `torah-chunk` — découpage texte long
- `torah-translate` — appel LLM
- `torah-save` — sauvegarde PostgreSQL
- `torah-error` — gestion erreurs

**Ils doivent rester actifs.** Mettre à jour la section "Webhooks NON UTILISÉS" pour les retirer.

---

*Mis a jour le 2026-04-22*
