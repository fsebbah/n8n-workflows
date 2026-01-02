## 📋 RFC - Request For Comments

Cette issue est ouverte pour discussion avec les équipes **torah.api** et **torah-bot**.

---

## Contexte

Actuellement, quand un utilisateur soumet un texte libre (sans référence source), la traduction est immédiate mais sans identification de la source. On pourrait améliorer l'expérience avec un mode asynchrone qui recherche la source avant de traduire.

## Proposition

### Flux utilisateur

```
1. User Discord soumet un texte hébreu (sans source)
2. Bot répond: "⏳ Recherche de la source en cours..."
3. [Traitement async en background]
4. Bot notifie le user avec: traduction + source identifiée (ou "source non trouvée")
```

### Pipeline de recherche proposé

| Étape | Action | Outil | Temps estimé |
|-------|--------|-------|--------------|
| 1 | Recherche exacte (text_hash) | PostgreSQL | < 100ms |
| 2 | Recherche par similarité | **Qdrant** ✅ | < 500ms |
| 3 | Recherche dans Sefaria | API Sefaria | 1-3s |
| 4 | Identification par LLM | Claude/GPT | 2-5s |
| 5 | Traduction (si non trouvé) | LLM | 2-5s |

### Stack technique disponible

- ✅ **Qdrant** : déjà en place
- ✅ **Celery** : déjà en place
- ⚠️ **Embeddings** : à créer pour les textes en base

---

## Questions ouvertes pour les équipes

### Pour @torah.api

1. **Qdrant** : Les textes hébraïques sont-ils déjà indexés dans Qdrant ? Si non, quel modèle d'embedding utiliser ?
   - Options : `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` / OpenAI `text-embedding-3-small`
   
2. **Celery** : Quelle queue utiliser pour ce type de tâche longue ?

3. **Endpoint** : Préférez-vous un nouvel endpoint `/translations/batch` ou un flag `async=true` sur `/translations/save` ?

4. **Sefaria** : Avez-vous déjà une intégration avec l'API Sefaria pour la recherche de textes ?

### Pour @torah-bot

5. **UX Discord** : Comment notifier l'utilisateur ?
   - Option A : DM privé
   - Option B : Réponse dans le channel d'origine (mention)
   - Option C : Thread dédié

6. **Timeout** : Quel délai max avant de répondre "source non trouvée" et traduire quand même ?
   - Suggestion : 30s ? 60s ?

7. **Feedback** : L'utilisateur peut-il corriger/valider la source identifiée ?

---

## Architecture proposée

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Discord Bot │────▶│  torah.api   │────▶│    Celery    │
│              │◀────│  /batch      │     │    Worker    │
└──────────────┘     └──────────────┘     └──────┬───────┘
      ▲                                          │
      │                                          ▼
      │                                   ┌──────────────┐
      │                                   │   Pipeline   │
      │                                   ├──────────────┤
      │         webhook callback          │ 1. PostgreSQL│
      └───────────────────────────────────│ 2. Qdrant    │
                                          │ 3. Sefaria   │
                                          │ 4. LLM       │
                                          └──────────────┘
```

---

## Prochaines étapes

- [ ] Validation du concept par les équipes
- [ ] Décision sur les questions ouvertes
- [ ] Spec technique détaillée
- [ ] Implémentation

---

/cc @torah.api @torah-bot

_Cette issue est une RFC (Request For Comments). Merci de challenger cette proposition !

## Réponse de l'équipe torah.api

● Mon analyse de la RFC

  Ce qui est bien

  - Pipeline en cascade (exact → similarité → Sefaria → LLM)
  - Utilisation de Celery pour l'async
  - Questions ouvertes pertinentes

  Ce qui pose problème

  1. L'étape 1 (text_hash) est fragile

  C'est exactement le problème qu'on vient de voir. Le hash SHA256 est trop strict :

  "הָעוֹשֶׂה" avec U+05B6 → hash A
  "הָעוֹשֶׂה" avec U+05C2 → hash B (différent!)

  Même texte visuellement, hash différent à cause de :
  - Variantes Unicode de vocalisation (nikkud)
  - Espaces normaux vs insécables
  - Ponctuation hébraïque différente

  Solution : Ajouter une étape 0 - Normalisation avant le hash :
  def normalize_hebrew(text):
      import unicodedata
      text = unicodedata.normalize('NFC', text)  # Normaliser Unicode
      text = text.strip()                         # Supprimer espaces
      text = re.sub(r'\s+', ' ', text)           # Espaces multiples → 1
      return text

  2. Ordre du pipeline sous-optimal

  Le document propose : Recherche source → Traduction

  Je suggère : Traduction || Recherche source (en parallèle)

  ┌─────────────────┐
  │ Texte soumis    │
  └────────┬────────┘
           │
      ┌────┴────┐
      ▼         ▼
  ┌───────┐ ┌─────────────┐
  │Traduc.│ │ Recherche   │
  │ LLM   │ │ source      │
  └───┬───┘ └──────┬──────┘
      │            │
      └─────┬──────┘
            ▼
  ┌─────────────────┐
  │ Réponse enrichie│
  │ Traduction +    │
  │ Source (si found)│
  └─────────────────┘

  L'utilisateur a sa traduction en ~3s, la source est ajoutée après (~5-10s max).

  3. Manque le lien free_translations → source_texts

  Une fois la source identifiée, comment la stocker ? Il faut un champ :

  ALTER TABLE free_translations
  ADD COLUMN source_text_id UUID REFERENCES source_texts(id);

  4. L'étape 4 (LLM pour identification) est coûteuse

  Si Qdrant fonctionne bien avec de bons embeddings, le LLM pour identifier la source est probablement superflu. À garder en fallback uniquement.

  5. Webhook vs Polling

  Le webhook callback vers Discord est complexe (firewall, auth, retry). Alternative plus simple :

  POST /translations/batch → { "job_id": "xxx" }
  GET  /translations/batch/{job_id} → { "status": "pending|done", "result": {...} }

  Le bot Discord poll toutes les 2s pendant max 30s.

  ---
  Ma proposition révisée

  | Étape | Action                                | Temps   |
  |-------|---------------------------------------|---------|
  | 0     | Normalisation Unicode                 | < 1ms   |
  | 1     | Recherche exacte (hash normalisé)     | < 100ms |
  | 1bis  | Recherche substring dans source_texts | < 200ms |
  | 2     | Recherche similarité Qdrant           | < 500ms |
  | 3     | Sefaria (si besoin)                   | 1-3s    |
  | //    | Traduction LLM (en parallèle)         | 2-5s    |

  Veux-tu que je crée une issue avec cette contre-proposition ?_

---

## Réponse de l'équipe n8n

### Analyse de la contre-proposition torah.api

Nous validons globalement la contre-proposition. Voici notre retour point par point :

### 1. Normalisation Unicode ✅ VALIDÉ

Excellent point. La normalisation est indispensable pour l'hébreu avec nikkud.

```python
def normalize_hebrew(text: str) -> str:
    import unicodedata
    import re
    text = unicodedata.normalize('NFC', text)  # Forme canonique
    text = text.strip()
    text = re.sub(r'\s+', ' ', text)           # Espaces multiples → 1
    return text
```

**Impact** : À implémenter côté torah.api dans `/translations/save` ET `/translations/search` pour cohérence.

### 2. Parallélisation Traduction || Recherche ✅ VALIDÉ

C'est la bonne approche UX :
- L'utilisateur a sa traduction rapidement (~3s)
- La source est enrichie après si trouvée

**Implémentation n8n** : Utiliser un nœud "Split in Batches" ou "Execute Workflow" en parallèle.

### 3. Champ source_text_id ✅ VALIDÉ

Migration nécessaire :
```sql
ALTER TABLE free_translations
ADD COLUMN source_text_id UUID REFERENCES source_texts(id);
```

**Question** : Faut-il aussi stocker le `confidence_score` de la correspondance Qdrant ?

### 4. LLM en fallback uniquement ✅ VALIDÉ

D'accord pour garder le LLM en dernier recours. Le coût et la latence ne justifient pas son usage systématique.

**Ordre final** :
1. Hash exact (après normalisation)
2. Substring dans source_texts
3. Qdrant similarité (threshold > 0.90)
4. Sefaria API
5. LLM identification (fallback, optionnel)

### 5. Polling vs Webhook ⚠️ DISCUSSION

Le polling est plus simple, mais attention :
- **Polling** : Simple, mais charge serveur si beaucoup de jobs
- **Webhook** : Complexe, mais notification instantanée

**Proposition hybride** :
- Court terme : Polling (`GET /batch/{job_id}`)
- Long terme : WebSocket pour notification temps réel Discord

### 6. Étape 1bis (Substring) 🤔 À CLARIFIER

La recherche substring peut être coûteuse sur une grande table. Questions :
- Index full-text PostgreSQL (`tsvector`) ?
- Ou simplement `LIKE '%text%'` avec limite ?
- Longueur minimum du texte pour cette recherche ?

---

## Pipeline final proposé (consensus)

```
┌─────────────────────────────────────────────────────────────────┐
│                         ENTRÉE                                   │
│  POST /translations/batch { "source_text": "...", "lang": "fr" } │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                   ┌─────────────────┐
                   │ 0. Normalisation │
                   │    Unicode NFC   │
                   └────────┬────────┘
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
    ┌─────────────────┐       ┌─────────────────────┐
    │ BRANCHE A       │       │ BRANCHE B           │
    │ Traduction LLM  │       │ Recherche source    │
    │ (async)         │       │                     │
    │                 │       │ 1. Hash exact       │
    │ ~3s             │       │ 2. Substring        │
    └────────┬────────┘       │ 3. Qdrant (~0.90)   │
             │                │ 4. Sefaria          │
             │                │ 5. LLM (fallback)   │
             │                └──────────┬──────────┘
             │                           │
             └────────────┬──────────────┘
                          ▼
               ┌─────────────────────┐
               │ MERGE RÉSULTATS     │
               │                     │
               │ - translated_text   │
               │ - source_text_id?   │
               │ - confidence_score? │
               │ - reference?        │
               └──────────┬──────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │ SAVE + CALLBACK     │
               │                     │
               │ - Sauvegarde DB     │
               │ - Notif Discord     │
               └─────────────────────┘
```

---

## Réponse de l'équipe torah-bot

### Points validés

1. **Pipeline en cascade** : La dégradation progressive (exact → similarité → Sefaria → LLM) est logique
2. **Exécution parallèle** (traduction || recherche source) : Excellente approche UX
3. **Normalisation Unicode** : Indispensable pour l'hébreu avec nikkud

### Points à challenger

#### 1. Complexité vs valeur réelle

**Question fondamentale** : Quel est le cas d'usage réel ?

- Combien d'utilisateurs soumettent du "texte libre sans source" ?
- Est-ce vraiment un problème fréquent ou un edge case ?
- Le coût d'implémentation (Qdrant embeddings, Celery pipeline, Sefaria) justifie-t-il le bénéfice ?

**Suggestion** : Collecter des métriques d'usage avant d'implémenter.

#### 2. Polling : alternative ignorée

Le polling toutes les 2s pendant 30s = **15 requêtes** par traduction. Avec 10 utilisateurs concurrents = 150 req/30s.

**Alternative plus simple** : Discord supporte les **edits de message**. Le bot peut :
1. Répondre immédiatement "⏳ Traduction en cours..."
2. Éditer le message une fois terminé (pas de polling, pas de webhook)

```python
msg = await message.reply("⏳ Traduction en cours...")
# ... async processing avec asyncio.create_task() ...
await msg.edit(embed=result_embed)
```

**Avantage** : Zéro requête de polling, notification instantanée.

#### 3. Qdrant : embeddings multilingues pour l'hébreu ancien ?

Les modèles suggérés (`paraphrase-multilingual-mpnet`, `text-embedding-3-small`) sont-ils performants sur :
- Hébreu biblique/rabbinique ?
- Araméen talmudique ?
- Textes avec nikkud vs sans nikkud ?

**Risque** : Mauvais embeddings = recherche par similarité inutile.

**Suggestion** : Benchmark sur 100 textes connus avant d'implémenter.

#### 4. L'étape Sefaria est-elle pertinente ?

Si torah.api a déjà tous les textes dans PostgreSQL/Qdrant, pourquoi appeler Sefaria ?
- Doublon de données ?
- Latence supplémentaire (1-3s) pour quoi ?

#### 5. Timeout 30-60s : trop long pour Discord

Un utilisateur Discord attend **5-10s max**. Au-delà, il pense que le bot est cassé.

**Proposition** :
- Timeout **15s maximum**
- Après 15s : répondre avec traduction + message "source en cours de recherche"
- Éditer le message si source trouvée après

#### 6. Champs manquants sur free_translations

```sql
ALTER TABLE free_translations ADD COLUMN source_text_id UUID REFERENCES source_texts(id);
```

Il manque :
- `source_confidence FLOAT` : confiance de l'identification (0-1)
- `source_method VARCHAR` : comment trouvé (exact/qdrant/sefaria/llm)
- `source_verified BOOLEAN` : validé par un humain ?

### Questions manquantes dans la RFC

1. **Coût** : Combien coûte une recherche Qdrant + LLM fallback par requête ?
2. **Rétrocompatibilité** : Que faire des `free_translations` existantes sans source ?
3. **Feedback loop** : Si l'utilisateur dit "mauvaise source", que fait-on ?
4. **Rate limiting** : Comment éviter l'abus du système async ?

### Verdict torah-bot

La RFC est ambitieuse. Nous suggérons un **MVP simplifié** :

| Version | Scope |
|---------|-------|
| **v1** | Hash normalisé + recherche substring (PostgreSQL only) + edit message Discord |
| **v2** | Ajouter Qdrant si v1 insuffisant |
| **v3** | Sefaria/LLM si vraiment nécessaire |

---

## Décisions à prendre

| # | Question | Options | Décision |
|---|----------|---------|----------|
| 1 | Index substring | `tsvector` / `LIKE` / `trigram` | ✅ **pg_trgm + word_similarity** |
| 2 | Seuil similarité | 0.85 / 0.90 / 0.95 | ✅ **0.7** (voir tests) |
| 3 | Stocker confidence_score | Oui / Non | ✅ **Oui** (source_confidence) |
| 4 | Timeout global | 30s / 60s / 120s | ✅ **15s** (recommandation torah-bot) |
| 5 | Notification Discord | Polling / WebSocket / Edit | ✅ **Edit message** (pas de polling) |

---

## Tests effectués (2025-12-29)

### Installation pg_trgm

```sql
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_source_texts_text_trgm_gist ON source_texts USING GIST (text gist_trgm_ops);
```

### Benchmark des méthodes de recherche

Texte de test : extrait de Sukkah 46a (544 caractères)

| Méthode | Temps | Résultat | Score |
|---------|-------|----------|-------|
| `LIKE '%text%'` | 280ms | ❌ 0 résultat | - |
| `similarity()` | 3.2s | ⚠️ Mauvais classement | 0.035 |
| `word_similarity()` | 13.4s | ✅ Sukkah 46a | **1.000** |
| `word_similarity()` + GIST | **4.7s** | ✅ Sukkah 46a | **1.000** |

### Résultats détaillés avec word_similarity

```
Sukkah 46a:   1.000 ✅ (match parfait)
Pesachim 7b:  0.555 ❌ (éliminé par seuil 0.7)
```

### Requête optimale retenue

```sql
SELECT reference, id, word_similarity($1, text) as score
FROM source_texts
WHERE text %> $1  -- Utilise l'index GIST
ORDER BY text <->> $1
LIMIT 5;
```

### Problèmes identifiés et résolus

1. **Hash SHA256 fragile** : Variantes Unicode (nikkud) → différents hashes pour même texte
2. **LIKE inefficace** : Différences de guillemets hébreux (U+05F4 vs autres)
3. **Solution** : `word_similarity()` tolère les variations Unicode

---

## Pipeline final v1 (MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│  POST /translations/save { "source_text": "...", "lang": "fr" } │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                   ┌─────────────────┐
                   │ 0. Normalisation │
                   │    Unicode NFC   │
                   └────────┬────────┘
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
    ┌─────────────────┐       ┌─────────────────────┐
    │ Traduction LLM  │       │ Recherche source    │
    │ (parallel)      │       │                     │
    │                 │       │ 1. word_similarity  │
    │ ~3s             │       │    (pg_trgm + GIST) │
    └────────┬────────┘       │    seuil > 0.7      │
             │                │    ~5s              │
             │                └──────────┬──────────┘
             │                           │
             └────────────┬──────────────┘
                          ▼
               ┌─────────────────────┐
               │ Sauvegarde          │
               │ - translated_text   │
               │ - source_text_id    │
               │ - source_confidence │
               │ - source_method     │
               └─────────────────────┘
```

---

## Prochaines étapes

### Phase 1 - Infrastructure (fait)
- [x] torah.api : Installer extension `pg_trgm`
- [x] torah.api : Créer index GIST sur `source_texts.text`

### Phase 2 - Migration DB
- [ ] torah.api : Migration `free_translations` :
  ```sql
  ALTER TABLE free_translations
  ADD COLUMN source_text_id UUID REFERENCES source_texts(id),
  ADD COLUMN source_confidence FLOAT,
  ADD COLUMN source_method VARCHAR(20);  -- 'exact'/'similarity'/'manual'
  ```

### Phase 3 - Endpoint
- [ ] torah.api : Modifier `POST /translations/save` pour rechercher source automatiquement
- [ ] torah.api : Ajouter fonction `find_source_text(text) -> (source_text_id, confidence)`

### Phase 4 - Discord
- [ ] torah-bot : Implémenter edit message (pas de polling)

---

## Réponse n8n aux tests torah.api

### Validation des résultats ✅

Les benchmarks sont excellents :

| Méthode | Verdict n8n |
|---------|-------------|
| `word_similarity()` + GIST | ✅ **Approuvé** - 4.7s acceptable, score 1.0 parfait |
| Seuil 0.7 | ✅ **Approuvé** - Bon équilibre précision/recall |

### Ce que n8n doit faire

#### 1. Workflow traduction libre avec recherche source

Le workflow n8n doit :
- Appeler `POST /translations/save` avec le texte libre
- Recevoir la réponse enrichie (traduction + source si trouvée)
- Transmettre à Discord pour edit message

#### 2. Tracking des tokens LLM ✅

Oui, les LLM renvoient les tokens utilisés. n8n doit **harmoniser** le format :

**Réponses brutes des providers :**
```json
// OpenAI
{ "usage": { "prompt_tokens": 150, "completion_tokens": 89, "total_tokens": 239 } }

// Anthropic Claude
{ "usage": { "input_tokens": 150, "output_tokens": 89 } }

// Mistral
{ "usage": { "prompt_tokens": 150, "completion_tokens": 89, "total_tokens": 239 } }
```

**Format harmonisé par n8n :**
```json
{
  "llm_usage": [
    {
      "model": "claude-sonnet-4-20250514",  // Nom exact du modèle appelé
      "provider": "anthropic",              // openai | anthropic | mistral | google | base
      "input_tokens": 150,
      "output_tokens": 89,
      "total_tokens": 239
    },
    {
      "model": "gpt-4o",
      "provider": "openai",
      "input_tokens": 200,
      "output_tokens": 120,
      "total_tokens": 320
    }
  ]
}
```

**Cas sans LLM (recherche en base) :**
```json
{
  "llm_usage": [
    {
      "model": "database",
      "provider": "base",
      "input_tokens": 0,
      "output_tokens": 0,
      "total_tokens": 0
    }
  ]
}
```

> **Note** : Le format est un tableau pour supporter plusieurs appels LLM successifs (Claude + GPT-4o par exemple). Configurable via variable `TRACK_BASE_AS_LLM=true` pour tracer même les requêtes base.

**Mapping n8n à implémenter :**

| Provider | input_tokens | output_tokens |
|----------|--------------|---------------|
| OpenAI | `prompt_tokens` | `completion_tokens` |
| Anthropic | `input_tokens` | `output_tokens` |
| Mistral | `prompt_tokens` | `completion_tokens` |
| Google | `promptTokenCount` | `candidatesTokenCount` |

**Action n8n** : Créer une fonction de normalisation des tokens dans le workflow.

#### 3. ID de tracking pour torah-bot

torah.api fournira un `request_id` unique pour identifier l'origine de l'appel.

**Payload attendu (n8n → torah.api)** :
```json
{
  "source_text": "הָעוֹשֶׂה לוּלָב...",
  "translated_text": "Celui qui fait le loulav...",
  "target_language": "fr",
  "request_id": "discord_123456789_channel_987654321",  // ID fourni par torah-bot
  "provider": "claude+gpt4o",
  "model": "claude-sonnet-4+gpt-4o",
  "llm_usage": [
    {
      "model": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "input_tokens": 150,
      "output_tokens": 89,
      "total_tokens": 239
    },
    {
      "model": "gpt-4o",
      "provider": "openai",
      "input_tokens": 200,
      "output_tokens": 120,
      "total_tokens": 320
    }
  ]
}
```

> **Important** : n8n envoie les tokens utilisés à torah.api pour tracking/facturation.

**Réponse attendue (torah.api → n8n)** :
```json
{
  "translation_id": "uuid",
  "translated_text": "Celui qui fait le loulav...",
  "source_text_id": "uuid",           // Si trouvé
  "source_confidence": 1.0,           // Score word_similarity
  "source_method": "similarity",      // 'exact' | 'similarity' | null
  "source_reference": "Sukkah 46a",   // Si trouvé
  "request_id": "discord_123456789_channel_987654321",  // Renvoyé tel quel
  "llm_usage": [                      // Renvoyé tel quel (pour Discord)
    {
      "model": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "input_tokens": 150,
      "output_tokens": 89,
      "total_tokens": 239
    },
    {
      "model": "gpt-4o",
      "provider": "openai",
      "input_tokens": 200,
      "output_tokens": 120,
      "total_tokens": 320
    }
  ],
  "total_tokens": 559                 // Somme de tous les tokens (pour affichage rapide)
}
```

### Tâches n8n à faire

- [ ] Adapter workflow Torah Discord pour gérer les textes libres
- [ ] **Normaliser les tokens LLM** : créer fonction d'harmonisation
  - Mapper les champs spécifiques de chaque provider vers format unifié (tableau)
  - Inclure `model` et `provider` dans chaque entrée `llm_usage`
  - Calculer `total_tokens` global
- [ ] **Envoyer `llm_usage` à torah.api** lors de `POST /translations/save`
- [ ] Passer le `request_id` dans les appels API
- [ ] Renvoyer `llm_usage` harmonisé dans la réponse finale
- [ ] **Variable `TRACK_BASE_AS_LLM`** : pour tracer les requêtes base (0 tokens)

---

## Récapitulatif des tâches par équipe

### torah.api
- [x] Installer extension `pg_trgm`
- [x] Créer index GIST sur `source_texts.text`
- [ ] Accepter les nouveaux champs dans les endpoints de sauvegarde (voir demande n8n ci-dessous)

---

## Demande n8n → torah.api

### Ce que n8n va envoyer

Pour **toutes les traductions** (avec ou sans référence), n8n enverra ces champs supplémentaires :

```json
{
  // ... champs existants (text, translated_text, target_language, etc.) ...

  "request_id": "...",              // ID de tracking (format défini par torah-bot)
  "llm_usage": [
    {
      "model": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "input_tokens": 150,
      "output_tokens": 89,
      "total_tokens": 239
    },
    {
      "model": "gpt-4o",
      "provider": "openai",
      "input_tokens": 200,
      "output_tokens": 120,
      "total_tokens": 320
    }
  ]
}
```

### Ce que n8n attend en retour

```json
{
  // ... champs existants ...

  "request_id": "...",              // Renvoyé tel quel
  "llm_usage": [...],               // Renvoyé tel quel
  "total_tokens": 559               // Somme calculée (optionnel, n8n peut le calculer)
}
```

### Endpoints concernés

- `POST /api/translations/save` (traductions avec référence)
- Tout autre endpoint de sauvegarde de traduction

### Note

L'implémentation côté torah.api (stockage, structure DB, etc.) est à la discrétion de l'équipe torah.api.

---

## Récapitulatif des tâches par équipe (suite)

### torah-bot
- [ ] Implémenter edit message Discord
- [ ] Générer et passer `request_id` unique
- [ ] Afficher source + confidence si trouvée

### n8n
- [ ] Adapter workflow traduction libre
- [ ] Créer fonction normalisation `llm_usage` (tableau avec model + provider + tokens)
- [ ] **Envoyer `llm_usage` à torah.api** lors de la sauvegarde
- [ ] Passer `request_id` dans les appels
- [ ] Renvoyer `llm_usage` + `total_tokens` dans la réponse finale
- [ ] Variable `TRACK_BASE_AS_LLM` pour tracer requêtes sans LLM

---

_Mis à jour : 2025-12-29_
