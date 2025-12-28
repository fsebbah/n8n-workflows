# Intégration Torah Bot - Workflow Traduction

Documentation pour l'équipe **torah.bot** sur l'utilisation du workflow de traduction n8n.

---

## Endpoint

```
POST http://pi6.local:5678/webhook/torah-discord-translate
```

---

## Paramètres de la requête

### Requis

| Paramètre | Type | Description |
|-----------|------|-------------|
| `text` | string | Texte à traduire (hébreu, araméen, anglais, etc.) |
| `api_key` | string | Clé API Anthropic (Claude) |
| `openai_api_key` | string | Clé API OpenAI (GPT-4o) |

### Optionnels (recommandés pour le cache)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `source_language` | string | Langue source : `auto` (défaut - détection automatique), `he`, `en`, `fr`, `es` |
| `target_language` | string | Langue cible : `fr` (défaut), `en`, `es` |
| `source_text_id` | UUID | ID du texte source (depuis API Talmud) - **priorité 1** |
| `commentary_id` | UUID | ID du commentaire (depuis API Talmud) - **priorité 1** |
| `context.traite` | string | Nom du traité (ex: `Sukkah`) |
| `context.page` | string | Page (ex: `28a`) |
| `context.commentator` | string | Commentateur (ex: `Rashi`) |
| `discord.webhook_url` | string | URL webhook Discord pour notification |

---

## Exemple d'appel complet

```json
{
  "text": "בר ממטללא - אם ירצה דמצטער הוא",
  "api_key": "sk-ant-api03-xxx",
  "openai_api_key": "sk-xxx",
  "target_language": "fr",
  "source_text_id": "29428246-00aa-4755-b402-8e3d8ae4fd52",
  "context": {
    "traite": "Sukkah",
    "page": "28a",
    "commentator": "Rashi"
  },
  "discord": {
    "webhook_url": "https://discord.com/api/webhooks/xxx/yyy"
  }
}
```

---

## Flux du workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. CACHE CHECK (si source_text_id ou commentary_id fourni)                │
│     GET /api/translations/search?source_text_id=xxx&target_language=fr     │
│                                                                             │
│     ├── Cache HIT  → Retourne traduction en ~50ms                          │
│     │                                                                       │
│     └── Cache MISS → Continue vers étape 2                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  2. TRADUCTION (Claude Sonnet 4)                                           │
│     - Traduit le texte hébreu/araméen                                      │
│     - ~2-3 secondes                                                         │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  3. VERIFICATION (GPT-4o)                                                  │
│     - Vérifie la traduction                                                │
│     - Corrige si nécessaire                                                │
│     - Attribue un score de confiance (0.0-1.0)                             │
│     - ~2-3 secondes                                                         │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  4. SAUVEGARDE                                                             │
│     POST /api/translations                                                 │
│     - Stocke en BDD pour le cache                                          │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  5. DISCORD (optionnel)                                                    │
│     - Envoie embed si webhook_url fourni                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Format de réponse

### Succès (cache hit)

```json
{
  "success": true,
  "cached": true,
  "translation": {
    "original": "בר ממטללא - אם ירצה דמצטער הוא",
    "translated": "Celui qui est sous la couverture - s'il le désire, c'est qu'il souffre",
    "source_language": "he",
    "target_language": "fr",
    "quality_score": 0.92
  },
  "verification": {
    "approved": true,
    "confidence": 0.92,
    "issues": [],
    "notes": "Traduction depuis le cache"
  },
  "metadata": {
    "traite": "Sukkah",
    "page": "28a",
    "commentator": "Rashi",
    "source": "cache",
    "cached_at": "2025-12-28T15:30:00Z",
    "processing_time_ms": 45
  }
}
```

### Succès (nouvelle traduction)

```json
{
  "success": true,
  "cached": false,
  "translation": {
    "original": "בר ממטללא - אם ירצה דמצטער הוא",
    "translated": "Celui qui est sous la couverture - s'il le désire, c'est qu'il souffre",
    "source_language": "he",
    "target_language": "fr",
    "quality_score": 0.95
  },
  "verification": {
    "approved": true,
    "confidence": 0.95,
    "issues": [],
    "notes": "Traduction fidèle au contexte talmudique"
  },
  "alternatives": null,
  "metadata": {
    "traite": "Sukkah",
    "page": "28a",
    "commentator": "Rashi",
    "source_text_id": "29428246-00aa-4755-b402-8e3d8ae4fd52",
    "models_used": ["claude-sonnet-4-20250514", "gpt-4o"],
    "source": "generated",
    "processing_time_ms": 5230,
    "tokens": {
      "claude": {"input_tokens": 150, "output_tokens": 80},
      "gpt4o": {"prompt_tokens": 200, "completion_tokens": 100}
    }
  }
}
```

### Succès avec désaccord (2 versions)

Si GPT-4o corrige significativement Claude (`confidence < 0.6`), les deux versions sont retournées :

```json
{
  "success": true,
  "cached": false,
  "translation": {
    "translated": "Version corrigée par GPT-4o...",
    "quality_score": 0.55
  },
  "verification": {
    "approved": false,
    "confidence": 0.55,
    "issues": ["Terme mal traduit", "Contexte non respecté"]
  },
  "alternatives": {
    "claude_translation": "Version originale Claude...",
    "gpt4o_translation": "Version corrigée GPT-4o..."
  }
}
```

### Erreur

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Le champ \"text\" est requis",
    "status": "BAD_REQUEST"
  }
}
```

---

## Intégration recommandée dans torah.bot

### 1. Récupérer le texte avec l'UUID

```python
# Appel API Talmud
response = requests.get(f"http://localhost:3031/api/talmud/text/Sukkah/28a")
data = response.json()

# Extraire l'UUID pour le cache
source_text_id = data["id"]
commentaries = data["commentaries"]  # [{id, commentator, text, ...}]
```

### 2. Appeler le workflow de traduction

```python
def translate_text(text, source_text_id=None, commentary_id=None, context=None):
    payload = {
        "text": text,
        "api_key": os.getenv("ANTHROPIC_API_KEY"),
        "openai_api_key": os.getenv("OPENAI_API_KEY"),
        "target_language": "fr",
    }

    # Ajouter UUID si disponible (optimise le cache)
    if source_text_id:
        payload["source_text_id"] = source_text_id
    if commentary_id:
        payload["commentary_id"] = commentary_id
    if context:
        payload["context"] = context

    response = requests.post(
        "http://pi6.local:5678/webhook/torah-discord-translate",
        json=payload
    )
    return response.json()
```

### 3. Exemple complet

```python
# Utilisateur demande "Sukkah 28a"
talmud = get_talmud_text("Sukkah", "28a")

# Utilisateur sélectionne Rashi
rashi = next(c for c in talmud["commentaries"] if c["commentator"] == "Rashi")

# Utilisateur sélectionne une phrase
phrase = "בר ממטללא - אם ירצה דמצטער הוא"

# Traduction avec tous les UUIDs pour le cache
result = translate_text(
    text=phrase,
    commentary_id=rashi["id"],
    context={
        "traite": "Sukkah",
        "page": "28a",
        "commentator": "Rashi"
    }
)

if result["success"]:
    if result["cached"]:
        print(f"📦 Cache ({result['metadata']['processing_time_ms']}ms)")
    else:
        print(f"✨ Nouvelle traduction ({result['metadata']['processing_time_ms']}ms)")

    print(f"Traduction: {result['translation']['translated']}")
    print(f"Score: {result['translation']['quality_score']*100:.0f}%")
```

---

## Temps de réponse attendus

| Scénario | Temps |
|----------|-------|
| Cache hit | ~50-100ms |
| Cache miss (traduction complète) | ~5-8 secondes |

---

## Codes d'erreur

| Code | Signification |
|------|---------------|
| 200 | Succès |
| 400 | Paramètres manquants ou invalides |
| 401 | Clé API invalide (Claude ou OpenAI) |
| 500 | Erreur serveur |

---

## Contact

- **Workflow n8n** : `torah-discord-translate` (ID: à confirmer après import)
- **API Torah** : `http://localhost:3031`
- **Documentation API** : `docs/issues/N8N_TRANSLATION_API.md`

---

*Dernière mise à jour : 28 décembre 2025*
