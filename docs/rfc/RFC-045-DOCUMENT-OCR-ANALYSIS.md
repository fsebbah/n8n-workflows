# RFC-045 : Analyse Document Processing - Upload & OCR

> **Objectif** : Analyser l'existant et proposer une architecture OCR unifiée dans chatbot-core.
>
> **Date** : 2026-03-19
> **Status** : ✅ Décision prise - Option B retenue (logique Python, pas de nouveau webhook n8n)

---

## 1. Séparation des responsabilités

### 1.1 Upload/Stockage (hors scope OCR)

| Aspect | Responsable | Notes |
|--------|-------------|-------|
| **Stockage Backblaze** | Équipe API Backend | Gère buckets, credentials, URLs signées |
| **Webhook `document-store`** | n8n | Appelle l'API backend |
| **Client Python** | chatbot-core (`DocumentClient.store()`) | Appelle le webhook |

**Endpoints existants (chatbot-core)** :
```python
# chatbot_core/services/n8n/documents.py
POST /webhook/document-store      # Upload vers Backblaze/GCP/S3
GET  /webhook/document-get        # Récupérer infos document
POST /webhook/document-delete     # Supprimer document
```

**Point d'action** : Demander à l'équipe API backend les endpoints REST pour upload direct (si besoin de bypass n8n).

### 1.2 OCR/Extraction (scope de cette RFC)

| Aspect | Responsable | Notes |
|--------|-------------|-------|
| **OCR multi-provider** | chatbot-core (`services/ocr/`) | À créer/enrichir |
| **Webhooks OCR** | n8n | Existants + à améliorer |
| **Post-processing langue** | chatbot-core | RTL, Unicode, etc. |

---

## 2. Comparatif implémentations existantes

### 2.1 chatbot-core - État actuel

**Fichiers concernés** :
```
chatbot_core/
├── models/document.py                    # DocumentContext, DocumentResult, OCRThresholds
├── services/
│   ├── document_service.py               # Orchestration (jobs, credits, callbacks)
│   ├── document_mention.py               # Handler Discord attachments
│   ├── document_workflow.py              # Workflow avec intention
│   └── n8n/
│       ├── documents.py                  # DocumentClient (OCR, store, PDF)
│       └── document_processing.py        # Validate/Estimate/Process
```

**Capacités OCR actuelles** (`DocumentClient.extract_text()`) :

| Provider | Langues | Format | Notes |
|----------|---------|--------|-------|
| Mistral (Pixtral) | Multi | Images, PDF | Principal, payant |
| Mathpix | Multi | Formules LaTeX | Spécialisé math |
| Tesseract | Multi | Images | Gratuit, local |

**Webhook appelé** :
```python
POST /webhook/document-extract-text
{
    "project_id": "...",
    "file_url": "https://...",
    "provider": "mistral|mathpix|tesseract",
    "language": "fr|en|he|...",
    "options": {}
}
```

**Limitations** :
- Pas de fallback automatique entre providers
- Pas de détection automatique de langue
- Pas de post-processing RTL/Unicode
- Pas de cache des résultats

### 2.2 plugin-torah-bot/ocr - État actuel

**Fichiers concernés** :
```
plugin-torah-bot/
└── ocr/
    ├── __init__.py
    ├── client.py      # OCRClient avec fallback chain
    ├── config.py      # OCRConfig, providers, priorités
    └── models.py      # OCRResult, DetectedLanguage
```

**Capacités avancées** :

| Fonctionnalité | Implémenté | Notes |
|----------------|------------|-------|
| Multi-provider fallback | ✅ | Mistral → Google → Azure → Tesseract |
| Priorité par langue | ✅ | Hébreu → Mistral, Arabe → Google, etc. |
| Détection langue | ✅ | `DetectedLanguage` avec confidence |
| Détection nikud | ✅ | `has_nikud` pour hébreu |
| Cache Redis | ✅ | Par hash fichier + langue |
| Configuration env | ✅ | `OCRConfig.from_env()` |

**Points forts à migrer vers chatbot-core** :
1. Fallback chain intelligent
2. Sélection provider par langue
3. Modèle `DetectedLanguage` avec pourcentage
4. Cache Redis intégré

### 2.3 Tableau comparatif

| Fonctionnalité | chatbot-core | plugin-torah | Cible |
|----------------|--------------|--------------|-------|
| **OCR basique** | ✅ | ✅ | ✅ |
| **Multi-provider** | ⚠️ Manuel | ✅ Auto | ✅ Auto |
| **Fallback chain** | ❌ | ✅ | ✅ |
| **Détection langue** | ❌ | ✅ | ✅ |
| **Priorité par langue** | ❌ | ✅ | ✅ |
| **Post-processing RTL** | ❌ | ⚠️ Partiel | ✅ |
| **Cache Redis** | ❌ | ✅ | ✅ |
| **Intégration Discord** | ✅ | ✅ | ✅ |
| **Estimation crédits** | ✅ | ❌ | ✅ |
| **Jobs/Callbacks** | ✅ | ❌ | ✅ |

---

## 3. Webhooks existants (mcp-tools-registry)

### 3.1 Webhooks OCR/Document actuels

| Webhook | Description | Provider |
|---------|-------------|----------|
| `image-ocr` | Extraction texte images | Mistral |
| `google-drive-ocr` | OCR via Google Drive | Mistral |
| `pdf-extractor` | Extraction texte embarqué PDF (sans OCR) | n8n natif |
| `pdf-ocr` | Extraction complète PDF (texte + images) ✨ | Mistral/Google/Mathpix |
| `docx-extractor` | Extraction texte Word | n8n natif |
| `mathpix` | Formules mathématiques | Mathpix |
| `document-extract-text` | OCR multi-provider | Mistral/Mathpix/Tesseract |
| `script-detector` | Détection script visuel (avant OCR) ✨ | OpenAI Vision |

### 3.2 Webhooks chatbot-core spécifiques

| Webhook | Fichier | Description |
|---------|---------|-------------|
| `documents/validate` | `document_processing.py` | Validation + détection action |
| `documents/estimate` | `document_processing.py` | Estimation crédits |
| `documents/process` | `document_processing.py` | Traitement async |
| `documents/save` | `document_processing.py` | Sauvegarde résultat |
| `jobs/user-cleanup` | `document_processing.py` | Nettoyage jobs bloqués |

---

## 4. Architecture proposée pour chatbot-core

### 4.1 Nouveau module `services/ocr/`

```
chatbot_core/
└── services/
    └── ocr/                          # NOUVEAU MODULE
        ├── __init__.py               # Exports publics
        ├── client.py                 # OCRClient unifié
        ├── config.py                 # OCRConfig, ProviderConfig
        ├── models.py                 # OCRResult, DetectedLanguage
        ├── cache.py                  # OCRCache (Redis)
        └── processors/               # Post-processing par script
            ├── __init__.py
            ├── base.py               # BaseTextProcessor
            ├── rtl.py                # RTL (hébreu, arabe, persan)
            └── normalizer.py         # Unicode NFC/NFD
```

### 4.2 Interface proposée

```python
from chatbot_core.services.ocr import OCRClient, OCRConfig

# Configuration depuis environnement
config = OCRConfig.from_env()

# Client avec cache Redis optionnel
client = OCRClient(config, redis_client=redis)

# Extraction simple
result = await client.extract_text(
    file_url="https://cdn.discord.com/...",
    language_hint="auto",    # Détection automatique
    provider="auto",         # Sélection intelligente
)

# Résultat enrichi
print(result.text)              # Texte extrait
print(result.provider_used)     # "mistral"
print(result.primary_language)  # "he"
print(result.languages)         # [DetectedLanguage("he", 0.95, 80%), ...]
print(result.has_rtl)           # True
print(result.confidence)        # 0.92
print(result.cached)            # True/False
```

### 4.3 Providers et priorités

```python
# Sélection automatique par langue
PROVIDER_PRIORITIES = {
    "he": ["mistral", "google_vision", "tesseract"],      # Hébreu
    "ar": ["google_vision", "azure", "mistral"],          # Arabe
    "fa": ["google_vision", "azure"],                     # Persan
    "zh": ["google_vision", "azure", "mistral"],          # Chinois
    "ja": ["google_vision", "azure"],                     # Japonais
    "hi": ["google_vision", "azure"],                     # Hindi
    "default": ["mistral", "google_vision", "tesseract"], # Autres
}
```

---

## 5. Décision Webhooks : Option B retenue

### 5.1 Décision : Pas de nouveau webhook unifié

> **Revue équipe n8n (2026-03-19)** : Option B recommandée

Les webhooks existants sont **suffisants** :

| Webhook existant | Usage |
|------------------|-------|
| `document-extract-text?provider=mistral` | OCR via Mistral/Pixtral |
| `document-extract-text?provider=mathpix` | OCR formules LaTeX |
| `document-extract-text?provider=tesseract` | OCR local gratuit |
| `image-ocr` | OCR image simple |
| `google-drive-ocr` | OCR via Google Vision |
| `pdf-extractor` | Extraction texte embarqué PDF (gratuit) |
| `pdf-ocr?provider=mistral` | Extraction complète PDF (Mistral OCR) |
| `pdf-ocr?provider=google` | Extraction complète PDF (Google Vision) |
| `pdf-ocr?provider=mathpix` | Extraction PDF avec formules math (Mathpix) |
| `script-detector` | Détection script visuel avant OCR (OpenAI Vision) |

La logique d'orchestration (fallback, cache, détection langue) est implémentée dans **Python** (`chatbot_core/services/ocr/`).

### 5.2 Justification

| Critère | Webhook unifié n8n | Logique Python |
|---------|-------------------|----------------|
| **Atomicité** | ❌ Fait trop de choses | ✅ Un webhook = un provider |
| **Testabilité** | ❌ Difficile à unit-tester | ✅ pytest standard |
| **Débogage** | ❌ Logs éparpillés | ✅ Stack trace Python |
| **État (cache)** | ❌ Awkward en n8n | ✅ Redis natif |
| **Évolution** | ❌ Modifier workflow | ✅ Modifier code |
| **Code existant** | ❌ À créer | ✅ plugin-torah à migrer |

### 5.3 Architecture retenue

```
┌─────────────────────────────────────────────────────────────┐
│                    chatbot-core (Python)                    │
│                                                             │
│  OCRClient                                                  │
│  ├── detect_language()     ← logique Python                 │
│  ├── select_provider()     ← logique Python                 │
│  ├── check_cache()         ← Redis direct                   │
│  ├── extract_with_fallback()                                │
│  │   ├── try provider 1 ──────┐                             │
│  │   ├── try provider 2 ──────┼──→ webhooks n8n atomiques   │
│  │   └── try provider 3 ──────┘                             │
│  └── post_process()        ← RTL/Unicode en Python          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      n8n (webhooks atomiques)               │
│                                                             │
│  document-extract-text?provider=mistral   → Mistral API     │
│  document-extract-text?provider=mathpix   → Mathpix API     │
│  document-extract-text?provider=tesseract → Tesseract local │
│  google-drive-ocr                         → Google Vision   │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Principe : Webhooks atomiques

Les webhooks n8n doivent rester des **opérations unitaires** :

```python
# BON : Un webhook = un provider = une responsabilité
result = await n8n.call("document-extract-text", {
    "file_url": url,
    "provider": "mistral",  # Explicite
    "language": "he"
})

# La logique de fallback est dans Python, PAS dans n8n
for provider in ["mistral", "google_vision", "tesseract"]:
    try:
        result = await n8n.call("document-extract-text", {
            "file_url": url,
            "provider": provider
        })
        if result["success"]:
            break
    except OCRError:
        continue
```

### 5.5 Exception future

Si un client **non-Python** (app mobile, autre service) nécessite un OCR unifié :

→ Créer un **endpoint REST dans chatbot-core** (FastAPI) qui expose `OCRClient.extract_text()`

→ **Ne PAS** créer de workflow n8n complexe avec fallback intégré

---

## 6. Migration plugin-torah → chatbot-core

### 6.1 Étapes de migration

| Étape | Description | Effort | Équipe |
|-------|-------------|--------|--------|
| 1 | Créer `chatbot_core/services/ocr/` | M | chatbot-core |
| 2 | Migrer `OCRClient` avec fallback | M | chatbot-core |
| 3 | Migrer `OCRConfig` et `OCRResult` | S | chatbot-core |
| 4 | Ajouter `DetectedLanguage` et cache | S | chatbot-core |
| 5 | Créer processors RTL/Unicode | M | chatbot-core |
| 6 | ~~Créer webhook `document-ocr-unified`~~ | ~~L~~ | ~~n8n~~ |
| 7 | Mettre à jour `DocumentClient` | S | chatbot-core |
| 8 | Tests multi-langues | M | chatbot-core |

> **Note** : L'étape 6 est **supprimée** suite à la décision Option B (section 5).

### 6.2 Aucune modification n8n requise

Les webhooks existants restent inchangés :
- `document-extract-text` → Toujours supporté (avec param `provider`)
- `image-ocr` → Toujours supporté
- `google-drive-ocr` → Toujours supporté

**Aucun nouveau webhook n8n à créer.**

---

## 7. Résumé des décisions

| Décision | Choix | Justification |
|----------|-------|---------------|
| **Package** | chatbot-core | Infrastructure partagée |
| **Upload** | Équipe API Backend | Hors scope OCR |
| **Nouveaux webhooks n8n** | ❌ **Aucun** | Webhooks existants suffisants |
| **Logique orchestration** | Python (OCRClient) | Testable, Redis natif, code existant |
| **Cache** | Redis via chatbot-core | Déjà disponible |
| **RTL processing** | Python (chatbot-core) | Plus testable |
| **Fallback chain** | Python (OCRClient) | Complexe pour n8n |

---

## 8. Questions pour l'équipe chatbot-core

1. **Priorité providers** : Quels providers OCR activer par défaut ?
2. **Cache TTL** : Durée de cache recommandée pour les résultats OCR ?
3. **Coûts** : Intégrer l'estimation de coût dans `OCRResult` ?
4. **Langfuse** : Tracer les appels OCR avec `@observe` ?

---

## 9. Questions pour l'équipe API Backend

1. **Endpoints upload** : Quels endpoints REST pour upload direct vers Backblaze ?
2. **URLs signées** : Durée de validité des URLs signées ?
3. **Quotas** : Limites de stockage par projet ?

---

## 10. Réponses équipe n8n aux questions chatbot-core

> Questions posées le 2026-03-19 concernant la détection de langue avant OCR

### 10.1 PDF : Webhooks d'extraction

**Deux webhooks complémentaires :**

| Webhook | Fonction | Provider | Coût |
|---------|----------|----------|------|
| `pdf-extractor` | Texte embarqué uniquement | n8n natif | Gratuit |
| `pdf-ocr` | Texte + images/graphiques | Mistral OCR | Payant |

#### A. `pdf-extractor` - Extraction texte embarqué (gratuit)

```
POST /webhook/pdf-extractor
```

| Aspect | Détail |
|--------|--------|
| **Workflow** | `MCP-PDF-Extractor.json` |
| **Node utilisé** | `n8n-nodes-base.extractFromFile` |
| **Fonction** | Extrait le texte **embarqué** dans le PDF (couche texte) |
| **Limites** | ❌ Ignore les images/graphiques contenant du texte |

#### B. `pdf-ocr` - Extraction complète multi-provider ✨ NOUVEAU

```
POST /webhook/pdf-ocr
```

| Aspect | Détail |
|--------|--------|
| **Workflow** | `MCP-PDF-OCR.json` |
| **Providers** | `mistral` (défaut), `google`, `mathpix` |
| **Fonction** | Extrait **TOUT** : texte embarqué + contenu des images/graphiques |
| **Use case** | PDFs avec schémas, graphiques, captures d'écran, tableaux, formules math |

**Providers disponibles :**

| Provider | Use case | API Key requise |
|----------|----------|-----------------|
| `mistral` | Général, images, graphiques | `mistral_api_key` |
| `google` | Multi-langue, haute précision | `google_api_key` |
| `mathpix` | Formules mathématiques LaTeX | `mathpix_app_id` + `mathpix_app_key` |

**Input :**
```json
{
  "file_url": "https://example.com/document.pdf",
  "provider": "mistral",
  "mistral_api_key": "..."
}
```

**Input avec Mathpix (formules math) :**
```json
{
  "file_url": "https://example.com/math-paper.pdf",
  "provider": "mathpix",
  "mathpix_app_id": "...",
  "mathpix_app_key": "..."
}
```

**Retour :**
```json
{
  "success": true,
  "data": {
    "text": "Contenu complet (texte + OCR des images)...",
    "pages": [
      { "page": 1, "markdown": "...", "has_images": true }
    ],
    "page_count": 50
  },
  "meta": {
    "provider": "mistral",
    "model": "mistral-ocr-latest",
    "usage": { "pages_processed": 50 }
  }
}
```

**Retour Mathpix (avec formules) :**
```json
{
  "success": true,
  "data": {
    "text": "La formule $E = mc^2$ démontre...",
    "pages": [...],
    "page_count": 10,
    "has_math": true
  },
  "meta": {
    "provider": "mathpix",
    "model": "mathpix-pdf"
  }
}
```

#### Recommandation d'usage

```python
async def extract_pdf_complete(
    pdf_url: str,
    api_keys: dict,
    has_math: bool = False
) -> str:
    # Option 1: Document avec formules mathématiques → Mathpix
    if has_math:
        result = await n8n.call("pdf-ocr", {
            "file_url": pdf_url,
            "provider": "mathpix",
            "mathpix_app_id": api_keys["mathpix_app_id"],
            "mathpix_app_key": api_keys["mathpix_app_key"]
        })
        return result["data"]["text"]

    # Option 2: Stratégie économique (essayer gratuit d'abord)
    result = await n8n.call("pdf-extractor", {"file_url": pdf_url})

    if result["success"] and len(result["text"].strip()) > 100:
        return result["text"]  # PDF texte pur ✓

    # Option 3: Fallback: PDF avec images → OCR complet
    ocr_result = await n8n.call("pdf-ocr", {
        "file_url": pdf_url,
        "provider": "mistral",
        "mistral_api_key": api_keys["mistral"]
    })
    return ocr_result["data"]["text"]
```

### 10.2 Détection script visuel : webhook `script-detector`

**Réponse : ✅ OUI - Nouveau webhook multi-mode**

```
POST /webhook/script-detector
```

| Aspect | Détail |
|--------|--------|
| **Workflow** | `MCP-Script-Detector.json` |
| **Modes** | `text` (gratuit), `image` (Vision), `pdf` (Vision) |
| **Use case** | Choisir le bon provider OCR avant extraction coûteuse |

#### Mode 1: Text (GRATUIT - analyse Unicode)

```json
{
  "text": "שלום עולם Hello world"
}
```

| Aspect | Détail |
|--------|--------|
| **Provider** | Analyse Unicode locale (aucune API) |
| **Coût** | **$0** |
| **Latence** | ~10ms |

#### Mode 2: Image (OpenAI Vision)

```json
{
  "image_url": "https://example.com/document.jpg",
  "openai_api_key": "sk-..."
}
```

Ou avec base64 :
```json
{
  "image_base64": "...",
  "file_type": "jpg",
  "openai_api_key": "sk-..."
}
```

| Aspect | Détail |
|--------|--------|
| **Provider** | OpenAI Vision (gpt-4o-mini, `detail: low`) |
| **Coût** | ~$0.0001/image |
| **Latence** | ~500ms |

#### Mode 3: PDF (OpenAI Vision)

```json
{
  "file_url": "https://example.com/document.pdf",
  "openai_api_key": "sk-..."
}
```

| Aspect | Détail |
|--------|--------|
| **Provider** | OpenAI Vision (gpt-4o-mini) |
| **Coût** | ~$0.0001 |
| **Extra** | Détecte aussi `has_math` pour recommander Mathpix |

#### Réponse

```json
{
  "success": true,
  "data": {
    "primary_script": "hebrew",
    "scripts": [
      { "script": "hebrew", "confidence": 0.85, "percentage": 70 },
      { "script": "latin", "confidence": 0.95, "percentage": 30 }
    ],
    "is_rtl": true,
    "has_diacritics": true,
    "has_math": false,
    "recommended_providers": ["mistral", "google_vision", "tesseract"],
    "sample_text": "שלום עולם"
  },
  "meta": {
    "mode": "text",
    "provider": "unicode_analysis",
    "cost": 0
  }
}
```

**Scripts détectés :** hebrew, arabic, latin, cyrillic, greek, han (chinois), hiragana, katakana, hangul, thai, devanagari, tamil, bengali, gujarati, punjabi, malayalam, kannada, armenian, georgian, ethiopic, etc.

#### Usage recommandé (chatbot-core)

```python
async def smart_ocr(file_url: str, text_hint: str = None, api_keys: dict) -> str:
    # 1. Si on a déjà du texte extrait → mode gratuit
    if text_hint:
        script_result = await n8n.call("script-detector", {"text": text_hint})
    else:
        # 2. Sinon, analyser le fichier (image ou PDF)
        script_result = await n8n.call("script-detector", {
            "file_url": file_url,
            "openai_api_key": api_keys["openai"]
        })

    # 3. Choisir le provider OCR optimal
    data = script_result["data"]
    provider = data["recommended_providers"][0]

    # 4. Si formules math détectées → Mathpix
    if data.get("has_math"):
        provider = "mathpix"

    # 5. Appeler l'OCR avec le bon provider
    ocr_result = await n8n.call("pdf-ocr" if file_url.endswith('.pdf') else "image-ocr", {
        "file_url": file_url,
        "provider": provider,
        **get_provider_keys(provider, api_keys)
    })

    return ocr_result["data"]["text"]
```

### 10.3 OCR providers : Retour des langues détectées ?

**Réponse : ⚠️ PARTIEL - Dépend du provider**

Analyse des workflows n8n existants :

| Provider | Webhook | Retourne langue ? | Détails |
|----------|---------|-------------------|---------|
| **Mistral OCR** | `image-ocr`, `google-drive-ocr` | ❌ Non | Retourne `text`, `pages`, `usage_info` uniquement |
| **Mathpix** | `mathpix` | ❌ Non | Spécialisé formules, pas de détection langue |
| **Tesseract** | `document-extract-text?provider=tesseract` | ⚠️ Optionnel | Via `-l` param, mais ne retourne pas la langue détectée |
| **Google Vision** | (non exposé directement) | ✅ Oui | L'API retourne `detectedLanguages` mais pas exposé dans nos webhooks |

**Structure Mistral OCR (réponse actuelle)** :
```json
{
  "success": true,
  "data": {
    "text": "...",
    "pages": [{ "markdown": "..." }]
  },
  "meta": {
    "provider": "mistral",
    "usage": { "pages_processed": 1 }
  }
  // ❌ PAS de champ "detected_languages"
}
```

**Recommandation** :

La détection de langue doit se faire **côté Python** après réception du texte OCR :

```python
from langdetect import detect_langs

async def extract_with_language_detection(file_url: str) -> OCRResult:
    # 1. Appeler webhook OCR (Mistral)
    result = await n8n.call("image-ocr", {"image_url": file_url})

    # 2. Détecter les langues depuis le texte (gratuit, instant)
    if result["success"] and result["data"]["text"]:
        detected = detect_langs(result["data"]["text"])
        languages = [
            DetectedLanguage(lang.lang, lang.prob)
            for lang in detected
        ]

    return OCRResult(
        text=result["data"]["text"],
        provider_used="mistral",
        languages=languages,  # Ajouté côté Python
        primary_language=languages[0].code if languages else None
    )
```

**Pourquoi pas dans n8n ?**
- `langdetect` est une lib Python, pas JS
- Logique métier appartient au code applicatif
- Permet de cacher les résultats de détection

---

## 11. Historique des décisions

| Date | Décision | Participants |
|------|----------|--------------|
| 2026-03-19 | Option B retenue : logique Python, webhooks atomiques n8n | équipe n8n, équipe chatbot-core |
| 2026-03-19 | Réponses questions détection langue (section 10) | équipe n8n |
| 2026-03-19 | Création webhook `pdf-ocr` pour extraction complète (texte + images) | équipe n8n |
| 2026-03-19 | Création webhook `script-detector` pour détection visuelle de script | équipe n8n |

---

*Document mis à jour le 2026-03-19*
*Décision validée - Prêt pour implémentation par équipe chatbot-core*
*Section 10 ajoutée : Réponses aux questions chatbot-core sur détection langue*
