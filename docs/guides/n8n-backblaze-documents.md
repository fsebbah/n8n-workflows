# n8n ↔ Backblaze B2 — accès aux documents

**Audience** : équipe n8n (workflows RAG, transcription, post-traitement de documents).
**Statut back** : 🟢 RAG pipeline §1–§7 en prod — 🟡 Claude Batch Poller §8 = cible figée, RFC-094 à rédiger avant code.
**Périmètre** : lecture des binaires B2 (S3 direct), pipeline RAG (callbacks), import Anthropic → B2 pour le batch poller (cible).

---

## 0. Vue d'ensemble

```
            ┌─ user upload via front (Firebase JWT) ──────────────┐
            │   POST /api/discord/sources/{guild}/{bot}/upload    │
            │       └─ chat.api écrit le binaire sur B2           │
            │           clé = rag/{guild_id}/{bot_id}/{source_id}/{filename}
            ▼
    chat.api ─────────► (fire-and-forget) N8N_RAG_WEBHOOK_URL
                         payload : b2_file_key + callback_urls + qdrant_target
                                                    │
                                                    ▼
                                   ┌──── n8n workflow RAG ────┐
                                   │ 1. lit le fichier sur B2 │
                                   │    (S3 API direct)       │
                                   │ 2. extract + embed       │
                                   │ 3. POST progress         │
                                   │ 4. POST complete (chunks)│
                                   │    └─ chat.api écrit Qdrant
                                   │ 5. ou POST error         │
                                   └──────────────────────────┘
```

**Règle d'or** : n8n **lit** les binaires sur B2 directement. n8n ne **n'écrit jamais** dans Qdrant et n'expose **aucune** opération CRUD B2 à travers chat.api. Toute écriture passe par chat.api.

---

## 1. Lecture d'un fichier B2 (S3 API direct)

### 1.1 Format de la clé

Toute clé `b2_file_key` reçue dans un payload chat.api a la forme :

```
rag/{guild_id}/{bot_id}/{source_id}/{filename}
```

> ⚠️ Le bucket est **global** (préfixe `B2_BUCKET_PREFIX`, ex. `azy-storage`), **pas** un bucket par tenant. Le scoping logique se fait par préfixe — pas d'isolation S3 inter-tenants au niveau IAM, la séparation se fait dans la clé.

### 1.2 Credentials à provisionner côté n8n (env ops)

| Variable | Valeur attendue | Source |
|---|---|---|
| `B2_APPLICATION_KEY_ID` | Application Key ID Backblaze | partagé avec chat.api |
| `B2_APPLICATION_KEY` | Application Key Backblaze | partagé avec chat.api |
| `B2_ENDPOINT_URL` | `https://s3.<region>.backblazeb2.com` | partagé avec chat.api |
| `B2_BUCKET_PREFIX` | nom du bucket global (ex. `azy-storage`) | partagé avec chat.api |

L'API est **S3-compatible** (signature v4). Tout client S3 standard fonctionne.

### 1.3 GET object (lire le binaire)

n8n node **HTTP Request** signé S3, ou node **AWS S3** configuré sur l'endpoint Backblaze :

```http
GET https://s3.<region>.backblazeb2.com/{B2_BUCKET_PREFIX}/{b2_file_key}
Authorization: AWS4-HMAC-SHA256 Credential=...   (signature v4)
```

Ou en cURL pour test :

```bash
aws --endpoint-url "$B2_ENDPOINT_URL" \
    s3 cp "s3://$B2_BUCKET_PREFIX/$B2_FILE_KEY" ./local.pdf
```

### 1.4 HEAD object (vérifier l'existence / la taille)

```bash
aws --endpoint-url "$B2_ENDPOINT_URL" \
    s3api head-object \
      --bucket "$B2_BUCKET_PREFIX" \
      --key "$B2_FILE_KEY"
```

Retourne `ContentLength`, `ContentType`, `LastModified`, `ETag`.

### 1.5 LIST sous un préfixe (debug ops uniquement)

À utiliser uniquement pour debug, pas dans le hot path :

```bash
aws --endpoint-url "$B2_ENDPOINT_URL" \
    s3api list-objects-v2 \
      --bucket "$B2_BUCKET_PREFIX" \
      --prefix "rag/$GUILD_ID/$BOT_ID/"
```

---

## 2. Webhook entrant — chat.api → n8n

Quand un user uploade un document via la route front (`POST /api/discord/sources/{guild_id}/{bot_id}/upload`) ou soumet un lien (`POST /api/discord/sources/{guild_id}/{bot_id}/link`) ou relance (`POST /api/discord/sources/{guild_id}/{bot_id}/{source_id}/retry`), chat.api déclenche un POST vers `$N8N_RAG_WEBHOOK_URL`.

### 2.1 Headers

| Header | Valeur |
|---|---|
| `Content-Type` | `application/json` |
| `X-Webhook-Signature` | `sha256=<hexdigest>` — HMAC-SHA256(body, `$N8N_RAG_WEBHOOK_SECRET`) |

> Le secret HMAC est partagé entre chat.api et n8n via `N8N_RAG_WEBHOOK_SECRET`. n8n **doit** vérifier la signature avant de traiter le payload.

### 2.2 Body (RFC-093 §4.1)

```jsonc
{
  "source_id":  "9c2a4f50-...",
  "tenant_id":  "Z6F3GSWB",
  "guild_id":   "1234567890",
  "bot_id":     "9876543210",
  "file_type":  "pdf",                  // ou txt|md|docx|xlsx|pptx|mp4|mp3|yt
  "extraction_method": null,            // ou "subtitles" / "whisper" / "metadata" pour yt
  "b2_file_key": "rag/1234567890/9876543210/9c2a4f50-.../rapport.pdf",
  "url": null,                          // non-null pour file_type='yt' uniquement
  "callback_urls": {
    "progress": "https://api.../api/n8n/rag-sources/9c2a4f50-.../progress",
    "complete": "https://api.../api/n8n/rag-sources/9c2a4f50-.../complete",
    "error":    "https://api.../api/n8n/rag-sources/9c2a4f50-.../error"
  },
  "qdrant_target": {
    "collection": "tenant_Z6F3GSWB_default",
    "vector_size": 1536,
    "distance":    "Cosine"
  }
}
```

### 2.3 Retry côté chat.api

chat.api retry 3 fois en exponentiel `1s / 4s / 16s` sur :
- erreur réseau / timeout (10s)
- 5xx

Sur 4xx, **pas de retry** — la `rag_source` passe à `status='error'`. Renvoyer un 4xx explicite si payload invalide, un 2xx sinon (même si traitement asynchrone).

---

## 3. Callbacks sortants — n8n → chat.api

Auth commune : **`X-Service-Token: <token>`** (token de service n8n émis par chat.api via `ServiceTokenManager`, scope = un tenant). Si le token est absent ou invalide → 401.

> ℹ️ Le `tenant_id` est dérivé du token côté chat.api — n'envoie **pas** de header `X-Tenant-ID` sur les callbacks.

### 3.1 `POST /api/n8n/rag-sources/{source_id}/progress`

Avancement intermédiaire (transcription, embedding, etc.).

```jsonc
// body
{
  "progress_percent": 42,                       // 0..100
  "status": "transcription",                    // pending | transcription | embedding | indexing
  "message": "extracted 12/30 chunks"           // optionnel, max 500 chars
}
```

| Réponse | Cas |
|---|---|
| `200 { "success": true }` | mise à jour OK |
| `404 source_not_found` | `source_id` inconnu |
| `422` | `status` hors enum, `progress_percent` hors [0..100] |

### 3.2 `POST /api/n8n/rag-sources/{source_id}/complete`

**Le seul moment où n8n livre les chunks + vecteurs.** chat.api fait l'upsert Qdrant côté serveur — n8n ne touche **pas** Qdrant directement.

```jsonc
// body
{
  "chunks": [
    {
      "chunk_id": "ch-0",
      "vector":   [0.012, -0.43, ...],          // length = qdrant_target.vector_size (1536)
      "text":     "contenu du chunk",
      "metadata": { "page": 1, "section": "intro" }   // optionnel
    },
    { "chunk_id": "ch-1", "vector": [...], "text": "...", "metadata": {} }
  ],
  "chunk_count":      2,                         // doit == len(chunks)
  "duration_seconds": 47                         // optionnel
}
```

**Validations server-side** :
- `chunk_count` ≡ `len(chunks)` (sinon 422)
- tous les vecteurs partagent la même dimension (sinon 422)
- `chunks` non vide (sinon 422)
- dimension du vecteur doit matcher `qdrant_target.vector_size` côté collection (sinon 503 `qdrant_unreachable` après tentative)

**Réponses** :

| Statut | Cas |
|---|---|
| `200 { "success": true, "upserted": <int> }` | Qdrant upsert OK + source flippée à `indexed` |
| `404 source_not_found` | `source_id` inconnu |
| `409 already_indexed` | la source est déjà `status='indexed'` (n8n a double-fire — ignorer côté n8n) |
| `503 qdrant_unreachable` | Qdrant down — chat.api a flippé la source à `error`, n8n doit échouer le run |
| `422` | validation Pydantic (cf. ci-dessus) |

### 3.3 `POST /api/n8n/rag-sources/{source_id}/error`

Pipeline n8n en échec non récupérable.

```jsonc
// body
{
  "error_code":    "whisper_timeout",            // max 100 chars, libre
  "error_message": "Whisper API timed out after 120s",   // max 4000 chars
  "stage":         "transcription"                // optionnel, max 50 chars
}
```

| Réponse | Cas |
|---|---|
| `200 { "success": true }` | source flippée à `status='error'`, `error_message` rempli |
| `404 source_not_found` | `source_id` inconnu |

> Après un `/error`, c'est l'admin côté front (ou le user via `POST /api/discord/sources/.../retry`) qui relance — pas n8n.

---

## 4. Idempotence + ordre des callbacks

| Règle | Pourquoi |
|---|---|
| `complete` envoyé **une seule fois** | Le 2e tir renvoie `409 already_indexed` mais chat.api a déjà fait l'upsert Qdrant + flippé. Double-fire = pollution Qdrant si la dimension change entre les deux tirs. |
| `error` après `complete` est ignoré | La source est déjà `indexed`, `mark_error` ne touche que les rows en transit. |
| `progress` après `complete` est ignoré | Même raison. |
| Pas d'ordre strict sur les `progress` | chat.api stocke la dernière valeur, pas un historique. |

---

## 5. Ce que n8n **ne peut PAS** faire (à connaître)

| Opération | Statut |
|---|---|
| Upload binaire générique depuis n8n (`POST /api/n8n/files/upload` arbitraire) | ❌ Pas d'endpoint. **Exception** : `POST /api/n8n/files/import-from-anthropic` pour le cas Claude Batch Poller (§8.3). Tout autre cas nécessite un RFC. |
| `DELETE` un fichier B2 hors batch via REST chat.api | ❌ Pas d'endpoint. La suppression d'un `rag_source` côté front (`DELETE /api/discord/sources/...`) supprime B2 + Qdrant côté chat.api. **Exception** : `DELETE /api/n8n/files/{file_id}` pour les fichiers batch (§8.5). |
| Lister les fichiers d'un tenant | ❌ Pas d'endpoint. Si besoin de debug → `aws s3api list-objects-v2` côté ops. |
| Écrire dans Qdrant | ❌ Interdit. **chat.api possède Qdrant.** n8n livre les chunks via `/complete`, chat.api fait l'upsert. |
| Régénérer une URL présignée hors batch | ❌ Pas d'endpoint chat.api. n8n a les credentials S3 direct. **Exception** : `GET /api/n8n/files/{file_id}/presign` pour les fichiers batch (§8.4). |
| Écrire sur B2 hors des préfixes `rag/{guild}/{bot}/{source}/` ou `batch/{tenant}/{user_id}/{message_id}/` | ❌ Convention forte — toute autre clé serait orpheline (pas de row pour la tracker, donc invisible côté front et non purgeable). |

Si un autre cas devient nécessaire, ouvrir un RFC court avec le cas d'usage avant d'élargir l'API n8n.

---

## 6. Checklist d'intégration côté n8n

- [ ] Variables d'env B2 + `$N8N_RAG_WEBHOOK_SECRET` provisionnées dans le workflow.
- [ ] Vérification de `X-Webhook-Signature` sur le webhook entrant (HMAC-SHA256 du body brut).
- [ ] Téléchargement du `b2_file_key` via S3 API signé.
- [ ] Extraction / embedding du document (modèle choisi côté n8n).
- [ ] Émission de `progress` au moins une fois en cours de traitement (UX front).
- [ ] Émission de `complete` une seule fois en fin de pipeline avec `vector.length == qdrant_target.vector_size`.
- [ ] Émission de `error` sur exception non récupérable.
- [ ] Gestion explicite des codes `404 source_not_found` (la source a été supprimée côté front entre temps — abort run) et `409 already_indexed` (double-fire — abort silencieusement).

---

## 7. Pour aller plus loin

- Pipeline RAG complet & idempotence : `docs/rfc/RFC-093-RAG-PIPELINE-FINALIZATION.md`
- Runbook de validation E2E staging : `docs/guides/RFC-093-E2E-STAGING-VALIDATION.md`
- Autorité Qdrant / prompts (qui écrit où) : `docs/guides/RAG-AND-PROMPTS-AUTHORITY.md`
- Routes front parallèles : `app/api_routes/rag_source_routes.py` (8 endpoints front + 3 n8n callbacks)

---

## 8. Claude Batch Poller — import Anthropic → B2 (cible figée)

> 🟡 **Section "cible"** — spec figée d'un commun accord back + n8n le 2026-05-21. Pas encore implémentée. À couvrir par **RFC-094** avant le code. Ce doc est la source de vérité du contrat pour l'implémentation et la consommation côté plugin.

### 8.1 Contexte

Le workflow n8n **Claude Batch Poller** consomme l'API Anthropic Messages Batch. Quand la réponse de Claude contient des fichiers générés (DOCX, PDF, etc.), ces fichiers vivent **~1h** sur les serveurs Anthropic puis disparaissent (`GET /v1/files/{file_id}/content` → 404).

**Objectif** : rapatrier ces fichiers sur Backblaze B2 avant expiration Anthropic, avec :

- **TTL pilotable** côté chat.api (purge cron par fichier, pas seulement par bucket).
- **Traçabilité par triplet** `(tenant_id, user_id, message_id)` pour les retrouver depuis le front Discord.
- **Idempotence** sur les retries n8n.

### 8.2 Pattern retenu — import server-to-server (C-bis)

n8n **ne télécharge pas** le binaire Anthropic. Il appelle un seul endpoint chat.api avec l'`anthropic_file_id` ; chat.api fait le GET Anthropic + le PUT B2 + persiste la row DB en un mouvement.

```
n8n                        chat.api                  Anthropic              B2
 │                           │                          │                    │
 │ POST /api/n8n/files/import-from-anthropic            │                    │
 │ { user_id, message_id, anthropic_file_id, ... }      │                    │
 │──────────────────────────►│                          │                    │
 │                           │ INSERT n8n_files (pending)                    │
 │                           │ GET /v1/files/{id}/content                    │
 │                           │─────────────────────────►│                    │
 │                           │◄─────────────────────────│ binary             │
 │                           │ put_object()                                  │
 │                           │──────────────────────────────────────────────►│
 │                           │◄──────────────────────────────────────────────│
 │                           │ UPDATE n8n_files (ready)                      │
 │◄──────────────────────────│                                               │
 │ { file_id, b2_file_key, download_url, expires_at }                        │
```

Bénéfices :

- Un seul appel HTTP côté n8n — pas de fenêtre de présignation à orchestrer.
- Pas de credential Anthropic à exposer à n8n.
- Idempotence naturelle via la clé `(tenant_id, user_id, message_id, anthropic_file_id)`.
- Audit complet côté chat.api (table `n8n_files`).

### 8.3 `POST /api/n8n/files/import-from-anthropic`

**Auth** : `X-Service-Token` (le `tenant_id` est **dérivé du token** — jamais pris du payload).

#### 8.3.1 Source des 3 keys de traçabilité

| Clé | Source | Obligatoire | Note sécurité |
|---|---|---|---|
| `tenant_id` | Dérivée du `X-Service-Token` côté chat.api | ✅ implicite | ❌ Ne **pas** l'accepter dans le payload — un token n8n du tenant A ne doit pas pouvoir écrire pour le tenant B. La vérité = le scope du token. Si le payload contient un champ `tenant_id`, il est silencieusement ignoré côté serveur. |
| `user_id` | Payload n8n | ✅ | Discord `user_id` (snowflake string, ex. `"234567890123456789"`). **Pas** un Firebase UID. Persiste la traçabilité par utilisateur Discord pour audit / RGPD / réattachement front. |
| `message_id` | Payload n8n | ✅ | Discord `message_id` (snowflake) qui a déclenché la requête au plugin. Permet au front de réattacher le fichier à la conversation Discord et au plugin de retrouver tous les fichiers d'un message via le bonus front §8.12. |

#### 8.3.2 Request — headers + body

```http
POST /api/n8n/files/import-from-anthropic HTTP/1.1
Host: api.staging.example
Content-Type: application/json
X-Service-Token: <n8n-service-token>
```

```jsonc
{
  // ─── Traçabilité — 3 keys obligatoires ──────────────────────────────
  // tenant_id : dérivé du X-Service-Token côté chat.api (NE PAS l'envoyer)
  "user_id":            "234567890123456789",   // ✅ obligatoire — Discord user_id
  "message_id":         "345678901234567890",   // ✅ obligatoire — Discord message_id

  // ─── Source Anthropic ───────────────────────────────────────────────
  "anthropic_file_id":  "file_011CbEKg7nJh...", // ✅ obligatoire
  "filename":           "pesachim_7b.docx",     // ✅ obligatoire — utilisé dans la clé B2 + Content-Disposition
  "mime_type":          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   // ✅ obligatoire
  "size_bytes":         40413,                   // ⚪ optionnel — pré-check quota serveur si fourni

  // ─── Cycle de vie B2 ────────────────────────────────────────────────
  "ttl_hours":          24,                      // ⚪ optionnel, défaut 24, max 720 (30j)

  // ─── Audit / debug (persistés dans la row n8n_files) ────────────────
  "source":             "claude-batch-poller",   // ⚪ optionnel — identifiant du workflow
  "correlation_id":     "msgbatch_011CbEKg...",  // ⚪ optionnel — Anthropic batch_id (retry / cross-link)
  "guild_id":           "1234567890",            // ⚪ optionnel — Discord guild
  "bot_id":             "9876543210"             // ⚪ optionnel — Bot Discord qui a déclenché
}
```

#### 8.3.3 Response — 201 Created

```jsonc
{
  "file_id":                "f_4e9b...",          // UUID opaque chat.api — sert au presign / delete
  "tenant_id":              "Z6F3GSWB",           // dérivé du token, renvoyé pour vérification client
  "user_id":                "234567890123456789", // écho de la 3-key
  "message_id":             "345678901234567890",
  "b2_file_key":            "batch/Z6F3GSWB/234567890123456789/345678901234567890/f_4e9b_pesachim_7b.docx",
  "filename":               "pesachim_7b.docx",
  "mime_type":              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "size_bytes":             40413,
  "download_url":           "https://s3.us-west-004.backblazeb2.com/azy-storage/...?X-Amz-Signature=...",
  "download_url_expires_at": "2026-05-21T19:00:00Z",   // ~1h
  "expires_at":             "2026-05-22T18:30:00Z",    // TTL B2 (ttl_hours appliqué)
  "status":                 "ready"                    // ready | error | expired
}
```

**Idempotence** : un 2e appel avec le même triplet `(user_id, message_id, anthropic_file_id)` renvoie **200 OK** (et non 201) avec la row existante, **sans** re-puller Anthropic ni dupliquer dans B2. C'est garanti par l'index unique partiel sur `n8n_files` (§8.6).

#### 8.3.4 Errors typées

| HTTP | `error` | Cas |
|---|---|---|
| 200 | (idempotent) | Row déjà présente pour ce triplet — renvoie l'existante |
| 201 | — | Import réussi |
| 401 | (auth) | `X-Service-Token` manquant ou invalide |
| 410 | `anthropic_file_expired` | Anthropic renvoie 404 — TTL 1h dépassé, n8n a perdu la course |
| 413 | `file_too_large` | Taille > limite chat.api (à confirmer en RFC-094, cible 100 MB) |
| 422 | (validation) | Payload invalide (champs manquants ou mal formés) |
| 502 | `anthropic_unreachable` | Anthropic 5xx ou réseau — n8n peut retry |
| 503 | `b2_unreachable` | B2 5xx — la row reste en `status='pending'`, n8n peut retry |

### 8.4 `GET /api/n8n/files/{file_id}/presign`

Régénère une URL présignée de téléchargement — utile quand le `download_url_expires_at` précédent est dépassé et que le plugin redemande.

#### 8.4.1 Request

```http
GET /api/n8n/files/f_4e9b.../presign HTTP/1.1
Host: api.staging.example
X-Service-Token: <n8n-service-token>
```

| Param URL | Type | Obligatoire | Note |
|---|---|---|---|
| `file_id` | UUID | ✅ | Retourné par §8.3 ou §8.12 |

| Query param | Type | Obligatoire | Note |
|---|---|---|---|
| `valid_seconds` | int | ⚪ | Optionnel, défaut 3600, max 7200 |

#### 8.4.2 Response — 200 OK

```jsonc
{
  "file_id":       "f_4e9b...",
  "download_url":  "https://s3.../...?X-Amz-Signature=...",
  "expires_at":    "2026-05-21T20:30:00Z",       // ~1h
  "valid_seconds": 3600
}
```

#### 8.4.3 Errors typées

| HTTP | `error` | Cas |
|---|---|---|
| 200 | — | URL régénérée |
| 401 | (auth) | `X-Service-Token` manquant ou invalide |
| 404 | `file_not_found` | `file_id` inconnu ou hors scope tenant (404 — pas de side-channel sur l'existence cross-tenant) |
| 410 | `file_expired` | `expires_at` B2 du fichier est dépassé — déjà purgé |

### 8.5 `DELETE /api/n8n/files/{file_id}`

Suppression anticipée (avant `expires_at`). Idempotent — supprime à la fois le binaire B2 et flippe `deleted_at` sur la row.

#### 8.5.1 Request

```http
DELETE /api/n8n/files/f_4e9b... HTTP/1.1
Host: api.staging.example
X-Service-Token: <n8n-service-token>
```

| Param URL | Type | Obligatoire | Note |
|---|---|---|---|
| `file_id` | UUID | ✅ | Retourné par §8.3 ou §8.12 |

#### 8.5.2 Response

Aucun body.

#### 8.5.3 Errors typées

| HTTP | `error` | Cas |
|---|---|---|
| 204 | — | Supprimé (ou déjà supprimé — idempotent) |
| 401 | (auth) | `X-Service-Token` manquant ou invalide |
| 404 | `file_not_found` | `file_id` inconnu ou hors scope tenant |

### 8.6 Clé B2 et table `n8n_files`

**Clé B2** (figée) :

```
batch/{tenant_id}/{user_id}/{message_id}/{file_id}_{filename}
```

Exemple :
```
batch/Z6F3GSWB/234567890123456789/345678901234567890/f_4e9b_pesachim_7b.docx
```

Justification :
- `tenant_id` en tête = isolation logique cohérente avec `rag/...`.
- `user_id` puis `message_id` = lecture ops triviale (`aws s3 ls .../{tenant}/{user_id}/`).
- `file_id` (UUID) en préfixe = unicité même si plusieurs fichiers ont le même nom dans un même batch.
- `filename` conservé en suffixe lisible pour un Content-Disposition propre.

**Table** (schéma tenant — vit dans chaque schema `tenant_*`) :

```sql
CREATE TABLE n8n_files (
    file_id            UUID PRIMARY KEY,
    user_id            VARCHAR NOT NULL,
    message_id         VARCHAR NOT NULL,
    anthropic_file_id  VARCHAR,
    b2_file_key        TEXT NOT NULL,
    filename           VARCHAR NOT NULL,
    mime_type          VARCHAR NOT NULL,
    size_bytes         BIGINT,
    status             VARCHAR NOT NULL,           -- pending | ready | error | expired | deleted
    source             VARCHAR,
    correlation_id     VARCHAR,
    guild_id           VARCHAR,
    bot_id             VARCHAR,
    created_at         TIMESTAMPTZ NOT NULL,
    confirmed_at       TIMESTAMPTZ,
    expires_at         TIMESTAMPTZ NOT NULL,
    deleted_at         TIMESTAMPTZ,
    error_message      TEXT
);

CREATE INDEX ix_n8n_files_user_message
  ON n8n_files (user_id, message_id);

CREATE UNIQUE INDEX ix_n8n_files_idempotency
  ON n8n_files (user_id, message_id, anthropic_file_id)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_n8n_files_expires
  ON n8n_files (expires_at) WHERE deleted_at IS NULL;
```

L'index unique partiel garantit l'**idempotence** : un retry n8n sur le même triplet ne crée pas de doublon, on renvoie la row existante.

### 8.7 Ce que le plugin doit fournir à n8n (soumission batch)

> ℹ️ Cette section clarifie le contrat **plugin → n8n** (webhook de soumission), distinct du contrat **n8n → chat.api** (§8.3).

#### 8.7.1 Les 3 clés de traçabilité

| Champ | Type | Obligatoire | Description | Qui l'utilise |
|-------|------|-------------|-------------|---------------|
| `tenant_id` | string | ✅ | Identifiant tenant (ex: `"Z6F3GSWB"`) | n8n sélectionne le bon `X-Service-Token` |
| `user_id` | string | ✅ | Discord user snowflake (ex: `"234567890123456789"`) | Transmis à chat.api pour traçabilité |
| `message_id` | string | ✅ | Discord message snowflake (ex: `"345678901234567890"`) | Transmis à chat.api pour traçabilité |

**Pourquoi `tenant_id` côté plugin alors qu'il est implicite côté chat.api ?**

```
Plugin ──► n8n ──► chat.api
           │         │
           │         └─ tenant_id dérivé du X-Service-Token (implicite)
           │
           └─ tenant_id nécessaire pour CHOISIR quel X-Service-Token utiliser
              (chaque tenant a son propre token de service)
```

Le workflow n8n gère potentiellement plusieurs tenants. Sans le `tenant_id` du plugin, il ne saurait pas quel token utiliser pour appeler chat.api.

#### 8.7.2 Payload de soumission au webhook n8n

```jsonc
POST /webhook/claude/batch/submit
Content-Type: application/json

{
  // ─── Prompt Claude ────────────────────────────────────────────────
  "prompt": "Exporte le Talmud Pesachim 7b en format DOCX avec...",

  // ─── Les 3 clés de traçabilité (OBLIGATOIRES) ─────────────────────
  "tenant_id":   "Z6F3GSWB",              // Pour sélection du token n8n
  "user_id":     "234567890123456789",    // Discord user snowflake
  "message_id":  "345678901234567890",    // Discord message snowflake

  // ─── Optionnels — audit / debug ───────────────────────────────────
  "metadata": {
    "source":         "torah-plugin",      // Identifiant du plugin
    "correlation_id": "export-pesachim-7b", // ID de suivi custom
    "guild_id":       "1234567890",        // Discord guild (optionnel)
    "bot_id":         "9876543210"         // Bot Discord (optionnel)
  },

  // ─── Configuration du résultat ────────────────────────────────────
  "redis_channel": "torah:batch:results",  // Stream Redis pour la réponse
  "ttl_hours":     24                      // TTL du fichier sur B2 (optionnel, défaut 24)
}
```

#### 8.7.3 Validation côté n8n

Le workflow **Claude Batch Poller** valide à la réception :

| Champ | Validation | Erreur si manquant |
|-------|------------|-------------------|
| `tenant_id` | Non vide, token correspondant existe | `400 missing_tenant_id` |
| `user_id` | Non vide, format snowflake | `400 invalid_user_id` |
| `message_id` | Non vide, format snowflake | `400 invalid_message_id` |
| `prompt` | Non vide | `400 missing_prompt` |

Si la validation échoue, le workflow répond immédiatement avec l'erreur — pas de job créé.

#### 8.7.4 Configuration n8n — mapping `tenant_id` → `X-Service-Token`

Le workflow **Claude Batch Poller** utilise des variables d'environnement pour mapper chaque `tenant_id` vers son token de service.

**Convention de nommage :**
```
SERVICE_TOKEN_{TENANT_ID}
```

**Exemple de configuration n8n (.env) :**
```bash
# ─── Tokens de service par tenant ──────────────────────────────────
SERVICE_TOKEN_Z6F3GSWB=sk-srv-xxxx...   # Tenant Torah Plugin
SERVICE_TOKEN_ABCD1234=sk-srv-yyyy...   # Tenant Autre Plugin
SERVICE_TOKEN_TEST0001=sk-srv-zzzz...   # Tenant Dev/Test

# ─── URL de base chat.api ──────────────────────────────────────────
CHAT_API_BASE_URL=https://api.staging.example.com
```

**Comportement du workflow :**

| Situation | Comportement |
|-----------|--------------|
| Token trouvé | Appel normal à `/api/n8n/files/import-from-anthropic` |
| Token non trouvé | Skip import B2, log warning, fichiers Anthropic non persistés |
| `tenant_id` manquant | Skip import B2, `_b2_import.reason = 'missing_traceability_keys'` |

**Code dans le nœud "Import Files to B2" :**
```javascript
// Get service token for tenant
const serviceToken = $env[`SERVICE_TOKEN_${tenant_id}`];
if (!serviceToken) {
  return { ...input, _b2_import: { status: 'skipped', reason: 'no_service_token' } };
}
```

> ⚠️ **Sécurité** : Les tokens de service sont des secrets. Utiliser les secrets n8n en production, pas des variables d'environnement en clair.

---

### 8.8 Notification Redis enrichie vers le plugin

En fin de workflow, n8n publie sur le stream Redis du plugin :

```jsonc
{
  "success":      true,
  "batch_id":     "msgbatch_011CbEKg...",
  "correlation_id": "export-123",

  // Traçabilité (les 3 keys, plus la session Anthropic)
  "user_id":      "234567890123456789",
  "message_id":   "345678901234567890",

  // Contenu textuel (inchangé)
  "content":      [{ "type": "text", "text": "..." }],

  // Fichiers persistés sur B2
  "files": [
    {
      "file_id":      "f_4e9b...",
      "filename":     "pesachim_7b.docx",
      "mime_type":    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size_bytes":   40413,
      "b2_file_key":  "batch/Z6F3GSWB/234567890123456789/345678901234567890/f_4e9b_pesachim_7b.docx",
      "download_url": "https://s3.../...?X-Amz-Signature=...",
      "download_url_expires_at": "2026-05-21T19:00:00Z",
      "b2_expires_at": "2026-05-22T18:30:00Z"
    }
  ],
  "has_files":    true,

  "metadata":     { "source": "claude-batch-poller", "..." : "..." }
}
```

⚠️ Le plugin ne doit **pas** persister `download_url` au-delà de `download_url_expires_at`. Pour un nouvel accès au-delà, il appelle `GET /api/n8n/files/{file_id}/presign` (§8.4).

### 8.9 Purge automatique

Un cron côté chat.api tourne toutes les heures :

```sql
SELECT file_id, b2_file_key
FROM n8n_files
WHERE expires_at < NOW()
  AND deleted_at IS NULL
LIMIT 500;
```

Pour chaque row :
1. `delete_object()` côté B2.
2. `UPDATE n8n_files SET status='expired', deleted_at=NOW()`.

**Filet de sécurité** : lifecycle policy B2 sur le préfixe `batch/` à 30 jours, au cas où le cron tombe en panne.

### 8.10 Considérations sécurité

- `tenant_id` toujours dérivé du `X-Service-Token` — un token n8n d'un tenant A ne peut pas créer une row pour un tenant B.
- Tous les endpoints `/api/n8n/files/*` vérifient que `file_id` appartient au tenant du token (404 sinon — pas de side-channel).
- `download_url` toujours présigné court (1h) — pas de lien permanent qui fuiterait dans les logs ou dans Redis.
- `anthropic_file_id` conservé en clair (utile à l'idempotence + audit) — ce n'est pas un secret côté Anthropic.
- Taille max par fichier : cible 100 MB (à confirmer en RFC-094) — protège la mémoire chat.api d'un payload malformé.

### 8.11 Limitation acceptée — bande passante chat.api

Le pattern C-bis fait que chat.api **avale** la bande passante du fichier (download Anthropic + upload B2). C'est connu et **assumé** :

- **Pour les DOCX ~50 KB générés par Claude Skills** : impact négligeable (< 100 ms ajouté au chemin critique).
- **Pour des PDF de plusieurs centaines de MB** : ça deviendrait un sujet (RAM côté chat.api, latence).

**Décision (2026-05-21)** : on accepte la limitation parce que :
- Les fichiers produits par les workflows Anthropic batch actuels sont compacts (typiquement < 1 MB).
- Il n'y a pas de meilleure alternative aujourd'hui — l'option presigned PUT (C original) ouvre une fenêtre de fragilité (n8n entre le GET Anthropic et le PUT B2, perte possible si le présigné expire) et expose des credentials Anthropic à n8n.
- Si un jour on découvre un cas avec des fichiers volumineux, on bascule alors vers un mode streaming (chat.api `httpx.stream` → boto3 `upload_fileobj`) **sans changer le contrat REST**. Le changement reste interne à l'implémentation.

À revisiter dans RFC-094 §X si l'observabilité prod montre des fichiers > 20 MB ou une latence p95 du endpoint > 3s.

### 8.12 Bonus front — `GET /api/files/by-message/{message_id}`

Pas un endpoint n8n, mais conséquence directe de la table `n8n_files` (§8.6) : le front (Firebase JWT user-bound) peut récupérer tous les fichiers attachés à un message Discord.

#### 8.12.1 Request

```http
GET /api/files/by-message/345678901234567890 HTTP/1.1
Host: api.staging.example
Authorization: Bearer <firebase-jwt>
X-Tenant-ID: Z6F3GSWB
```

| Param URL | Type | Obligatoire | Note |
|---|---|---|---|
| `message_id` | str (Discord snowflake) | ✅ | |

| Query param | Type | Obligatoire | Note |
|---|---|---|---|
| `user_id` | str | ⚪ | Filtre additionnel — par défaut le user du JWT |
| `include_deleted` | bool | ⚪ | Défaut `false` — réservé aux owners pour audit |

#### 8.12.2 Response — 200 OK

```jsonc
{
  "message_id": "345678901234567890",
  "user_id":    "234567890123456789",
  "files": [
    {
      "file_id":      "f_4e9b...",
      "filename":     "pesachim_7b.docx",
      "mime_type":    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size_bytes":   40413,
      "download_url": "https://s3.../...?X-Amz-Signature=...",
      "download_url_expires_at": "2026-05-21T19:00:00Z",
      "expires_at":   "2026-05-22T18:30:00Z",
      "status":       "ready",
      "created_at":   "2026-05-21T18:30:00Z",
      "source":       "claude-batch-poller"
    }
  ]
}
```

L'index `ix_n8n_files_user_message (user_id, message_id)` rend cette requête triviale (lookup O(log n)).

> ℹ️ Cet endpoint sera spec'd plus en détail dans RFC-094 §5 (volet front) — listé ici pour montrer le payoff de la traçabilité.

---

## 9. Statut + prochaines étapes

| Étape | Statut |
|---|---|
| Doc compagnon RAG (§1–§7) | 🟢 En prod |
| Spec §8 — Claude Batch Poller (cible C-bis) | 🟡 Spec figée, RFC-094 à rédiger |
| Migration tenant — table `n8n_files` | ⏳ chat.api |
| Endpoint `POST /api/n8n/files/import-from-anthropic` | ⏳ chat.api |
| Endpoint `GET /api/n8n/files/{file_id}/presign` | ⏳ chat.api |
| Endpoint `DELETE /api/n8n/files/{file_id}` | ⏳ chat.api |
| Cron purge expirés (toutes les heures) | ⏳ chat.api |
| Lifecycle policy B2 `batch/` 30j (filet sécurité) | ⏳ ops |
| Modif workflow Claude Batch Poller pour appeler l'endpoint | ⏳ équipe n8n |
| Notif Redis enrichie (`files[]`) | ⏳ équipe n8n |
| Consommation `files[]` + presign côté front | ⏳ équipe plugin |
| Endpoint front `GET /api/files/by-message/{message_id}` (§8.12) | ⏳ chat.api |

**Critère de bascule prod** : RFC-094 mergé, table + 3 endpoints + cron live sur staging, run E2E "plugin soumet batch → Claude génère DOCX → n8n import → plugin télécharge via download_url" validé.

---

— Maintenu par l'équipe back chat.api. Toute évolution du contrat (nouveau champ, nouveau callback, changement de signature) passe par un RFC + mise à jour de ce doc dans la même PR.
