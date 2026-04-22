# Guide n8n — API Torah v2 (corpus + translations_v2)

**Date :** 2026-04-22
**Destinataires :** équipe n8n (plugin-torah, workflows Torah_*)
**Statut :** contrat API après refacto `corpus` / `sedarim` / `source_text_segments` / `translations_v2`.

Ce document décrit les endpoints backend réels après migration. Il complète (et remplace partiellement) `TORAH_API_GUIDE.md`. Il n'y a **pas de rétrocompat** : l'ancien payload `source_text_id + segment_index` du save est rejeté en HTTP 400.

---

## 1. Changements cassants — à lire en premier

| Domaine | Ancien | Nouveau |
|---|---|---|
| Identification segment | `source_text_id` + `segment_index` | `segment_id` (UUID de `source_text_segments`) |
| Traductions page | `translations` (table plate) | `translations_v2` (clé par segment) |
| Traductions commentaire | `commentary_details.extra_data['translation']` (JSONB) | `commentary_translations` (table dédiée) |
| Traductions libres | `free_translations` | `pending_translations` (+ job de résolution trigram) |
| Segments hébreu | `source_texts.hebrew_text.split('\n')` Python | `source_text_segments` (table, source de vérité) |
| Référence ambiguë | silencieuse | HTTP 400 `AmbiguousReferenceError` ; passer `?corpus=` pour forcer |

**À faire côté n8n avant appel du save** : résoudre le `segment_id` via `GET /api/talmud/page/{traite}/{page}/segments` et récupérer `segments[].segment_id`.

---

## 2. Paramètre `?corpus=` et désambigüation

Tous les endpoints de lecture ci-dessous acceptent un paramètre optionnel `?corpus=<nom>` (nom canonique ou alias via `sefaria` / `french` / `variants`).

**Contrat :**
- `?corpus=` absent + une seule correspondance → 200 normal.
- `?corpus=` absent + plusieurs correspondances → HTTP 400 avec body `AmbiguousReferenceError` (voir §8).
- `?corpus=Bavli` → filtrage / résolution forcée.

Il n'y a **aucune valeur réservée** (pas de `?corpus=auto`).

---

## 3. Endpoints catalogue

### 3.1 GET `/api/torah/sources`

Liste des sources Torah avec leur `corpus` / `seder`.

**Query :**
| Param | Type | Description |
|---|---|---|
| `type` | string (opt) | Filtre `source_type` (talmud, kabbale, ...) |
| `active_only` | bool (default `true`) | Ne renvoyer que les sources actives |
| `corpus` | string (opt) | Filtre sur `corpus.name` ou alias |

**Réponse (extrait) :**
```json
{
  "sources": [
    {
      "canonical_name": "Berakhot",
      "hebrew_name": "ברכות",
      "source_type": "talmud",
      "corpus": "Bavli",
      "seder": "Zeraim"
    }
  ],
  "count": 42,
  "updated_at": "2026-04-22T..."
}
```

---

### 3.2 GET `/api/talmud/traites`

Liste des traités depuis le catalogue v2 (`translation_projects JOIN corpus JOIN sedarim`).

**Query :**
| Param | Type | Description |
|---|---|---|
| `corpus` | string (opt) | Filtre corpus (nom ou alias) |

**Réponse :**
```json
{
  "traites": [
    {"name": "Berakhot", "corpus": "Bavli", "seder": "Zeraim"},
    {"name": "Shabbat",  "corpus": "Bavli", "seder": "Moed"}
  ],
  "total": 42,
  "corpus_filter": "Bavli"
}
```

---

### 3.3 GET `/api/torah/sections/{source_name}`

Liste des sections d'une source complexe (Sha'ar HaHakdamot, etc.).

**Path :** `source_name` (string).
**Query :** `corpus` (opt, désambigüation).

**Réponse :**
```json
{
  "source": "Sha'ar HaHakdamot",
  "corpus": "Kabbalah",
  "seder": null,
  "sections": [...]
}
```

**Erreur 400** si plusieurs corpus matchent `source_name` sans `?corpus=` (voir §8).

---

### 3.4 GET `/api/torah/sections/{source_name}/{section}`

Contenu d'une section.

**Path :** `source_name`, `section`.
**Query :** `number` (opt, int), `corpus` (opt).

**Réponse :**
```json
{
  "source": "Sha'ar HaHakdamot",
  "corpus": "Kabbalah",
  "seder": null,
  "section": { "title": "...", "content": "..." }
}
```

---

## 4. Endpoints lecture texte

### 4.1 GET `/api/talmud/text/{traite}/{page}` — NOUVEAU

Texte hébreu brut d'une page, segmenté, **sans vocalisation**. Contrat R1 validé par n8n.

**Path :** `traite` (ex `Berakhot`), `page` (ex `2a`).
**Query :** `corpus` (opt, désambigüation).

**Réponse :**
```json
{
  "traite": "Berakhot",
  "page": "2a",
  "hebrew_text": "...",
  "segments": [
    {"index": 0, "text": "..."},
    {"index": 1, "text": "..."}
  ]
}
```

**Erreurs :**
- **400** `AmbiguousReferenceError` : `(traite, page)` matche plusieurs corpus, passer `?corpus=`.
- **404** : pas de source pour cette référence.

---

### 4.2 GET `/api/talmud/page/{traite}/{page}/segments`

Page segmentée **avec traductions courantes** jointes depuis `translations_v2`.

**Path :** `traite`, `page`.
**Query :**
| Param | Type | Description |
|---|---|---|
| `include_commentaries` | bool (default `true`) | Inclure les commentaires par segment |
| `include_translations` | bool (default `true`) | Inclure la traduction courante par segment |
| `target_language` | string (default `fr`) | Langue cible (fr, en, he, ...) |
| `corpus` | string (opt) | Désambigüation (400 sinon) |

**Réponse :**
```json
{
  "traite": "Berakhot",
  "page": "2a",
  "reference": "Berakhot 2a",
  "corpus": "Bavli",
  "source_text_id": "uuid",
  "target_language": "fr",
  "segments_count": 14,
  "translated_count": 12,
  "commentaries_total": 38,
  "segments": [
    {
      "index": 0,
      "segment_id": "uuid-segment",
      "hebrew_text": "...",
      "has_translation": true,
      "translation": {
        "id": "uuid-translation",
        "text": "...",
        "target_language": "fr",
        "version": 3,
        "provider": "anthropic",
        "model": "claude-sonnet-4",
        "quality_score": 0.92,
        "job_id": "job_abc"
      },
      "commentaries": [...],
      "commentaries_count": 3
    }
  ]
}
```

`segment_id` est l'UUID à utiliser pour `POST /api/translations/save` (mode 1).

---

## 5. POST `/api/translations/save` — sauvegarde traductions (BREAKING)

Un seul endpoint, 3 modes, sélection automatique selon le payload.

### 5.1 Règles de routing

Exactement **un** des champs `segment_id`, `commentary_id`, `source_text` doit être fourni. Tout autre combinaison → HTTP 400.

Envoyer `source_text_id` ou `segment_index` → HTTP 400 explicite (payload legacy rejeté).

### 5.2 Mode 1 — traduction de segment

Cible : `translations_v2`. Pattern d'écriture : `pg_advisory_xact_lock` + `UPDATE is_current=false` + `INSERT MAX(version)+1` (transactionnel, géré par l'API).

**Payload :**
```json
{
  "segment_id": "uuid-segment",
  "translated_text": "...",
  "target_language": "fr",
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "quality_score": 0.92,
  "confidence_score": 0.95,
  "job_id": "job_abc",
  "request_id": "discord_...",
  "llm_usage": [
    {"model": "claude-sonnet-4", "provider": "anthropic", "input_tokens": 250, "output_tokens": 80, "total_tokens": 330}
  ],
  "status": "approved",
  "notes": null,
  "issues": [],
  "extra_data": {}
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Translation saved into translations_v2.",
  "mode": "segment",
  "translation_id": "uuid-new",
  "segment_id": "uuid-segment",
  "target_language": "fr",
  "version": 4,
  "status": "approved",
  "created_at": "2026-04-22T..."
}
```

### 5.3 Mode 2 — traduction de commentaire

Cible : `commentary_translations`. Même pattern d'écriture.

**Payload :**
```json
{
  "commentary_id": "uuid-commentary",
  "translated_text": "...",
  "target_language": "fr",
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "quality_score": 0.9,
  "job_id": "job_xyz"
}
```

**Réponse :**
```json
{
  "success": true,
  "mode": "commentary",
  "translation_id": "uuid-new",
  "commentary_id": "uuid-commentary",
  "target_language": "fr",
  "version": 2,
  "created_at": "..."
}
```

### 5.4 Mode 3 — traduction pending (source non résolue)

Cible : `pending_translations`. Indexé par `text_hash = SHA256(source_text)`.

**Payload :**
```json
{
  "source_text": "...",
  "translated_text": "...",
  "target_language": "fr",
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "status": "pending",
  "claude_translation": "...",
  "gpt_translation": "...",
  "job_id": "job_foo",
  "request_id": "discord_..."
}
```

**Réponse :**
```json
{
  "success": true,
  "mode": "pending",
  "translation_id": "uuid-pending",
  "text_hash": "sha256...",
  "target_language": "fr",
  "existed": false
}
```

`existed=true` indique que le `text_hash` existait déjà (idempotence) — l'ID retourné est celui du row existant, aucune nouvelle ligne créée.

---

## 6. Vocalization (nekudot)

### 6.1 GET `/api/vocalization/search`

Recherche un texte vocalisé déjà en base.

**Query (au moins une méthode) :**
| Param | Type | Description |
|---|---|---|
| `segment_id` | uuid (opt) | UUID de `source_text_segments` |
| `source_text_id` | uuid (opt) | + `segment_index` pour résoudre le segment |
| `segment_index` | int (opt) | Index 0-based dans le source_text |
| `commentary_id` | uuid (opt) | UUID de `commentary_details` |
| `traite` + `page` | string (opt) | Fallback référence structurée |
| `commentator` | string (opt) | Pour restreindre aux commentaires |

**Réponse :**
```json
{
  "found": true,
  "source_text_id": "uuid",
  "segment_id": "uuid-segment",
  "segment_index": 3,
  "original_text": "...",
  "vocalized_text": "בְּרֵאשִׁית בָּרָא אֱלֹהִים",
  "vocalized_by": "llm:gpt-4o",
  "vocalized_at": "2026-04-22T...",
  "traite": "Sukkah",
  "page": "28a"
}
```

Note : au niveau page (sans `segment_index`), `found=true` uniquement si **tous** les segments sont vocalisés.

### 6.2 POST `/api/vocalization/save`

Sauvegarde un texte vocalisé. Priorité : `segment_id` > (`source_text_id` + `segment_index`) > `commentary_id`.

**Payload :**
```json
{
  "segment_id": "uuid-segment",
  "vocalized_text": "בְּרֵאשִׁית בָּרָא אֱלֹהִים",
  "vocalized_by": "llm:gpt-4o"
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Vocalization saved on source_text_segments.",
  "segment_id": "uuid-segment",
  "vocalized_at": "..."
}
```

L'écriture directe sur `source_texts.vocalized_text` est supprimée (colonne page-level reconstruite automatiquement par trigger DB).

### 6.3 POST `/api/commentaries/nekudot` — NOUVEAU

Vérification batch : pour chaque `commentary_id`, indique s'il est déjà vocalisé. **Pas de sauvegarde**.

**Payload :**
```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Réponse :**
```json
{
  "results": [
    {"id": "uuid-1", "has_nekudot": true,  "vocalized_text": "..."},
    {"id": "uuid-2", "has_nekudot": false, "vocalized_text": null},
    {"id": "uuid-3", "has_nekudot": false, "vocalized_text": null}
  ]
}
```

Les IDs absents de la base sont renvoyés avec `has_nekudot=false`.

---

## 7. GET `/api/sefaria/texts/search`

Inchangé. Utilisé pour normaliser un nom de texte (`soukkah` → `Sukkah`).

**Query :** `query` (string), `category` (opt), `fuzzy` (bool).

**Réponse :**
```json
{
  "found": true,
  "canonical_name": "Sukkah",
  "sefaria_ref": "Sukkah",
  "hebrew_name": "סוכה",
  "match_type": "fuzzy",
  "confidence": 0.91
}
```

---

## 8. Gestion d'erreur — `AmbiguousReferenceError`

Renvoyée en HTTP 400 par tous les endpoints qui prennent `?corpus=` quand la référence matche plusieurs corpus sans disambigüation.

**Body :**
```json
{
  "detail": {
    "error": "ambiguous_reference",
    "message": "Reference 'Berakhot 2a' matches multiple corpus",
    "matches": [
      {"corpus": "Bavli",   "project_id": "uuid-project-1"},
      {"corpus": "Mishnah", "project_id": "uuid-project-2"}
    ],
    "hint": "Add ?corpus=<Bavli|Mishnah> to disambiguate"
  }
}
```

**À faire côté n8n :**
- Intercepter le 400 avec `detail.error === "ambiguous_reference"`.
- Lire `detail.matches[].corpus` pour proposer un choix au client (Discord, interface).
- Relancer la requête avec `?corpus=<nom choisi>`.

---

## 9. Récap des endpoints utilisés par n8n

| Endpoint backend | État après refacto |
|---|---|
| `GET /api/torah/sources` | corpus-aware, filtre `?corpus=` |
| `GET /api/torah/sections/{source}` | corpus-aware, 400 si ambigu |
| `GET /api/torah/sections/{source}/{section}` | corpus-aware, 400 si ambigu |
| `GET /api/talmud/traites` | groupé par corpus, filtre `?corpus=` |
| `GET /api/talmud/page/{traite}/{page}/segments` | lit `source_text_segments` + JOIN `translations_v2`, 400 si ambigu |
| `GET /api/talmud/text/{traite}/{page}` | **nouveau** — texte brut segmenté (R1) |
| `POST /api/translations/save` | **breaking** — 3 modes (`segment_id`, `commentary_id`, `source_text`) |
| `GET /api/vocalization/search` | supporte `segment_id` / `segment_index` |
| `POST /api/vocalization/save` | écrit dans `source_text_segments` |
| `POST /api/commentaries/nekudot` | **nouveau** — batch check |
| `GET /api/sefaria/texts/search` | inchangé |

Endpoints MongoDB (jobs) inchangés : `POST /api/v2/jobs`, `GET /api/v2/jobs/{id}`, `PATCH /api/v2/jobs/{id}`.

---

## 10. OpenAPI / Swagger

Le schéma OpenAPI complet (machine-readable) est généré automatiquement par FastAPI :

- **Swagger UI** : `GET /docs`
- **ReDoc** : `GET /redoc`
- **OpenAPI JSON** : `GET /openapi.json`

Toutes les réponses, paramètres et modèles Pydantic décrits ici sont reflétés dans l'OpenAPI.

---

*Rédigé le 2026-04-22 par l'équipe API Torah. Basé sur `docs/guides/translations-v2-handoff-to-api.md` (contrat DB gelé) et `docs/guides/TORAH_API_GUIDE.md` (inventaire n8n).*
