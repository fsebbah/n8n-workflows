# RFC-054 : RAG Sources Processing Pipeline

> **Date** : 2026-03-31
> **Statut** : DRAFT
> **Auteur** : Équipe n8n
> **Dépendances** : RFC-049 (Entity Storage), RFC-053 (Bot ID Isolation)

---

## 1. Contexte

L'API chatbot-core permet aux utilisateurs d'uploader des fichiers (PDF, DOCX, audio, vidéo) et des liens (YouTube) pour alimenter le RAG de leur bot Discord. Ces sources doivent être :

1. **Extraites** : Conversion du fichier en texte brut
2. **Chunkées** : Découpage intelligent en segments
3. **Vectorisées** : Génération d'embeddings
4. **Stockées** : Indexation dans Qdrant avec métadonnées

Ce document décrit l'architecture du pipeline de traitement n8n.

---

## 2. Outils existants

### 2.1 Extraction de contenu

| Outil | Endpoint | Input | Output | Technologie |
|-------|----------|-------|--------|-------------|
| **MCP - PDF Extractor** | `POST /webhook/pdf-extractor` | `pdf_url` ou binary | Texte extrait | pdfplumber |
| **MCP - Transcriber** | `POST /webhook/video-transcription` | `videoUrl` ou `videoBase64` | Transcription | Google Vertex AI (Gemini) |

### 2.2 Stockage vectoriel

| Outil | Endpoint | Description |
|-------|----------|-------------|
| **MCP - Entity - Save** | `POST /webhook/entity-save` | Sauvegarde entité + vectorisation Qdrant |
| **MCP - Entity - Search** | `POST /webhook/entity-search` | Recherche sémantique dans Qdrant |

### 2.3 Stockage fichiers

| Service | Usage |
|---------|-------|
| **Backblaze B2** | Stockage des fichiers uploadés par l'API |
| **Path** | `{tenant_id}/rag/{guild_id}/{bot_id}/{source_id}/{filename}` |

---

## 3. Architecture proposée

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              chatbot-core API                               │
│  Upload/Link → Stockage B2 → Crée record MongoDB → Webhook n8n             │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      n8n: RAG - Process Source                              │
│                      POST /webhook/rag-process-source                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. VALIDATION                                                              │
│     └─ Valide payload, répond 202 Accepted                                  │
│                                                                             │
│  2. EXTRACTION (selon file_type)                                            │
│     ├─ pdf      → HTTP Request → /webhook/pdf-extractor                     │
│     ├─ txt/md   → HTTP Request → B2 Download → texte brut                   │
│     ├─ docx     → HTTP Request → B2 Download → (TODO: extraction)           │
│     ├─ xlsx     → HTTP Request → B2 Download → (TODO: extraction)           │
│     ├─ pptx     → HTTP Request → B2 Download → (TODO: extraction)           │
│     ├─ mp4/mp3  → HTTP Request → /webhook/video-transcription               │
│     └─ yt       → HTTP Request → /webhook/video-transcription               │
│                                                                             │
│  3. CHUNKING                                                                │
│     └─ Découpage du texte en segments avec overlap                          │
│                                                                             │
│  4. VECTORISATION                                                           │
│     └─ Génération embeddings pour chaque chunk                              │
│                                                                             │
│  5. STOCKAGE QDRANT                                                         │
│     └─ Upsert points avec métadonnées                                       │
│                                                                             │
│  6. CALLBACKS API                                                           │
│     ├─ POST /api/discord/n8n/sources/{id}/progress (pendant traitement)     │
│     └─ POST /api/discord/n8n/sources/{id}/complete (fin)                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Payload webhook entrant

```json
{
  "action": "process",
  "source_id": "src_a1b2c3d4e5f6",
  "tenant_id": "Z6F3GSWB",
  "guild_id": "1286607696153546774",
  "bot_id": "987654321",
  "file_type": "pdf",
  "b2_file_key": "Z6F3GSWB/rag/1286.../987.../src_.../document.pdf",
  "url": null,
  "extraction_mode": null,
  "backend_api_url": "https://apidev.azy.solutions",
  "backend_service_token": "xxx"
}
```

### 3.3 Structure chunk Qdrant

```json
{
  "id": "uuid-v4",
  "vector": [0.123, -0.456, ...],
  "payload": {
    "source_id": "src_a1b2c3d4e5f6",
    "tenant_id": "Z6F3GSWB",
    "guild_id": "1286607696153546774",
    "bot_id": "987654321",
    "chunk_index": 0,
    "chunk_text": "Contenu du chunk...",
    "file_type": "pdf",
    "filename": "document.pdf",
    "page_number": 1,
    "timestamp_start": null,
    "timestamp_end": null,
    "created_at": "2026-03-31T10:00:00Z"
  }
}
```

---

## 4. Questions de design ouvertes

### 4.1 Stratégie de chunking

| Option | Description | Avantages | Inconvénients |
|--------|-------------|-----------|---------------|
| **A. Taille fixe** | Chunks de N caractères avec overlap | Simple, prévisible | Coupe au milieu des phrases |
| **B. Par paragraphes** | Split sur `\n\n`, combine jusqu'à N chars | Respecte la structure | Paragraphes trop longs/courts |
| **C. Semantic chunking** | LLM découpe par sens | Meilleure cohérence | Coût API, latence |
| **D. RecursiveCharacterTextSplitter** | LangChain-style, hiérarchique | Bon compromis | Complexité moyenne |

**Paramètres à définir :**
- `CHUNK_SIZE` : Taille cible (ex: 500, 1000, 1500 caractères ?)
- `CHUNK_OVERLAP` : Overlap entre chunks (ex: 100, 200 caractères ?)

**Question : Quelle option préférez-vous ?**

---

### 4.2 Organisation Qdrant

| Option | Description | Avantages | Inconvénients |
|--------|-------------|-----------|---------------|
| **A. Collection globale** | Une seule collection `rag_sources` avec filtres `tenant_id`, `guild_id`, `bot_id` | Simple à gérer | Risque isolation, perfs à l'échelle |
| **B. Collection par tenant** | `rag_sources_{tenant_id}` | Isolation données | Plus de collections à gérer |
| **C. Collection par bot** | `rag_{tenant_id}_{guild_id}_{bot_id}` | Isolation maximale | Explosion du nombre de collections |

**Question : Quelle option préférez-vous ?**

---

### 4.3 Modèle d'embeddings

| Option | Modèle | Dimensions | Coût | Performance |
|--------|--------|------------|------|-------------|
| **A. OpenAI small** | `text-embedding-3-small` | 1536 | $0.02/1M tokens | Bon |
| **B. OpenAI large** | `text-embedding-3-large` | 3072 | $0.13/1M tokens | Excellent |
| **C. Cohere** | `embed-multilingual-v3.0` | 1024 | $0.10/1M tokens | Bon multilangue |
| **D. Local** | Sentence Transformers | 384-768 | Gratuit | Variable |

**Question : Quel modèle préférez-vous ?**

---

### 4.4 Gestion des métadonnées spécifiques

| Type fichier | Métadonnées spécifiques |
|--------------|------------------------|
| PDF | `page_number`, `total_pages` |
| Audio/Video | `timestamp_start`, `timestamp_end`, `duration_seconds` |
| YouTube | `video_title`, `channel_name`, `video_id` |
| DOCX/PPTX | `section_title`, `slide_number` |

**Question : Quelles métadonnées sont prioritaires ?**

---

### 4.5 Téléchargement B2

| Option | Description |
|--------|-------------|
| **A. URL signée** | L'API génère une URL signée temporaire, n8n télécharge directement |
| **B. Proxy API** | n8n demande à l'API de streamer le fichier |
| **C. Credentials n8n** | n8n a ses propres credentials B2 |

**Question : Comment n8n accède aux fichiers B2 ?**

---

## 5. Workflows n8n

### 5.1 RAG - Process Source

**Fichier :** `workflows/RAG_-_Process_Source.json`
**Endpoint :** `POST /webhook/rag-process-source`
**Statut :** Créé, extraction en placeholder

**À implémenter :**
- [ ] Intégration MCP - PDF Extractor
- [ ] Intégration MCP - Transcriber
- [ ] Téléchargement B2 pour txt/md/docx/xlsx/pptx
- [ ] Chunking intelligent
- [ ] Vectorisation OpenAI
- [ ] Upsert Qdrant

### 5.2 RAG - Delete Source

**Fichier :** `workflows/RAG_-_Delete_Source.json`
**Endpoint :** `POST /webhook/rag-delete-source`
**Statut :** Créé, suppression en placeholder

**À implémenter :**
- [ ] Suppression Qdrant par filtre `source_id`

---

## 6. Callbacks API

### 6.1 Progress

```http
POST /api/discord/n8n/sources/{source_id}/progress
X-Service-Token: {token}
X-Tenant-ID: {tenant_id}

{
  "status": "transcription",
  "progress_percent": 45,
  "chunk_count": 0
}
```

### 6.2 Complete

```http
POST /api/discord/n8n/sources/{source_id}/complete
X-Service-Token: {token}
X-Tenant-ID: {tenant_id}

{
  "success": true,
  "chunk_count": 42
}
```

Ou en cas d'erreur :

```json
{
  "success": false,
  "error_message": "PDF extraction failed: corrupted file"
}
```

---

## 7. Estimation des coûts

### 7.1 Embeddings (OpenAI text-embedding-3-small)

| Scénario | Tokens | Coût |
|----------|--------|------|
| 1 PDF (10 pages, ~5000 mots) | ~6,500 tokens | $0.00013 |
| 1 vidéo YouTube (10 min) | ~1,500 tokens | $0.00003 |
| 100 sources/mois | ~800,000 tokens | $0.016 |
| 1000 sources/mois | ~8,000,000 tokens | $0.16 |

### 7.2 Stockage Qdrant

| Scénario | Points | Stockage estimé |
|----------|--------|-----------------|
| 1 PDF (10 pages) | ~20-50 chunks | ~100 KB |
| 100 sources | ~2,000-5,000 chunks | ~10 MB |
| 1000 sources | ~20,000-50,000 chunks | ~100 MB |

---

## 8. Prochaines étapes

1. **Décisions** : Répondre aux questions de la section 4
2. **Implémentation** : Compléter les workflows selon les décisions
3. **Tests** : Valider avec différents types de fichiers
4. **Documentation** : Mettre à jour la doc API avec les endpoints n8n

---

## 9. Références

- [RFC-049 Entity Storage Architecture](./RFC-049-ENTITY-STORAGE-ARCHITECTURE.md)
- [RFC-053 Discord Bot Server Management](./RFC-053-DISCORD-BOT-SERVER-MANAGEMENT-v3.md)
- [RAG Sources Endpoints Reference](./rag-sources-endpoints-reference.md)
- [OpenAI Embeddings Pricing](https://openai.com/pricing)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
