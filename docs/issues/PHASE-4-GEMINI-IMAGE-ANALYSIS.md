# Analyse Technique - Phase 4 : Gemini Image Workflow

> **Issue GitHub**: [#47](https://github.com/fsebb/n8n-workflows/issues/47)
> **Date**: 2024-12-19

---

## 1. Résumé Exécutif

### Objectif
Créer un **workflow n8n** (pas un custom node) pour la génération d'images avec Gemini 2.5 Flash Image ("Nano Banana").

### Architecture Cible
```
MCP Server → POST /webhook/gemini-image → n8n Workflow → Gemini API → Response
```

### Pattern utilisé
Identique aux workflows existants (`video-transcription-workflow.json`, `knowledge-graph`):
- Webhook n8n avec `responseMode: "responseNode"`
- Credentials Vertex AI gérés par n8n (pas de clé en dur)
- MCP Server passe les paramètres via le body de la requête

---

## 2. Analyse du Colab Source

### Modèle utilisé
```python
GEMINI_2_5_FLASH_IMAGE = "gemini-2.5-flash-image"
```
Alias: "Nano Banana" 🍌

### Configuration de génération
```python
RESPONSE_MODALITIES = ["IMAGE"]  # ou ["IMAGE", "TEXT"] pour feedback
ASPECT_RATIO = "16:9"  # Configurable

GENERATION_CONFIG = GenerateContentConfig(
    response_modalities=RESPONSE_MODALITIES,
    image_config=ImageConfig(aspect_ratio=ASPECT_RATIO),
)
```

### Aspect ratios supportés
| Ratio | Dimensions | Usage |
|-------|------------|-------|
| 1:1 | 1024×1024 | Avatars, icônes |
| 2:3 | 768×1152 | Portraits |
| 3:2 | 1152×768 | Paysages |
| 9:16 | 768×1344 | Mobile, Stories |
| 16:9 | 1344×768 | Bannières, vidéos |
| 21:9 | ? | Cinématique |

### Techniques clés du Colab

#### 1. Character Sheet (Extraction + Vues multiples)
```python
prompt = """
- Scene: Robot character sheet.
- Left: Front view of the extracted robot.
- Right: Back view of the extracted robot (seamless back).
- Background: Pure white.
- Text: Caption "FRONT VIEW" and "BACK VIEW".
"""
```

#### 2. Scene Composition avec références
```python
source_ids = [AssetId.ROBOT, AssetId.MOUNTAINS]  # Images de référence
prompt = """
- Image 1: Robot character sheet.
- Image 2: Previous scene.
- The robot has descended from the cliff to a gray felt valley...
"""
```

#### 3. Prompts descriptifs vs impératifs

**Descriptif** (décrit l'état final):
```
The robot is sleeping peacefully in a hammock...
```

**Impératif** (décrit les actions):
```
Remove the ice axes. Move the mountain to the left. Add a bridge...
```

---

## 3. APIs Google à Activer

### Obligatoires
| API | Console URL |
|-----|-------------|
| **Vertex AI API** | [Activer](https://console.cloud.google.com/flows/enableapi?apiid=aiplatform.googleapis.com) |
| **Cloud Storage API** | [Activer](https://console.cloud.google.com/flows/enableapi?apiid=storage-component.googleapis.com) |

### Optionnelles (si GCS)
| API | Console URL |
|-----|-------------|
| **IAM Credentials API** | [Activer](https://console.cloud.google.com/flows/enableapi?apiid=iamcredentials.googleapis.com) |

### Configuration requise
```bash
# Variables d'environnement (gérées par n8n credentials)
GOOGLE_CLOUD_PROJECT="your-project-id"
GOOGLE_CLOUD_LOCATION="global"  # Pour les modèles preview
```

---

## 4. Architecture du Workflow n8n

### Pattern confirmé (basé sur video-transcription-workflow.json)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Webhook   │────►│  Validate   │────►│   Prepare   │────►│   Gemini    │
│    POST     │     │   Input     │     │   Config    │     │   Image     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                                       │
                           ▼                                       ▼
                    ┌─────────────┐                         ┌─────────────┐
                    │   Error:    │                         │   Upload    │
                    │  No Input   │                         │    GCS      │
                    └─────────────┘                         └─────────────┘
                                                                  │
                                                                  ▼
                                                           ┌─────────────┐
                                                           │   Respond   │
                                                           │   Success   │
                                                           └─────────────┘
```

### Nodes du workflow

1. **Webhook** (`n8n-nodes-base.webhook`)
   - `path: "gemini-image"`
   - `responseMode: "responseNode"`
   - `httpMethod: "POST"`

2. **Validate Input** (`n8n-nodes-base.if`)
   - Vérifie `prompt` ou `sourceImage`

3. **Prepare Config** (`n8n-nodes-base.code`)
   - Extrait les paramètres du body
   - Prépare la configuration pour le node custom

4. **Gemini Image** (custom node ou HTTP Request)
   - Utilise credentials Vertex AI
   - Appelle l'API Gemini

5. **Upload GCS** (optionnel)
   - Upload l'image générée
   - Génère URL signée

6. **Respond Success** (`n8n-nodes-base.respondToWebhook`)

---

## 5. Gestion des Credentials

### Pattern n8n (PAS de clé en dur)

```json
{
  "credentials": {
    "googleVertexAiApi": {
      "id": "google-vertex-ai",
      "name": "Google Vertex AI account"
    }
  }
}
```

### Credentials Vertex AI dans n8n
Les credentials sont configurés dans n8n UI:
- **Type**: Google Vertex AI
- **Auth**: Service Account ou Application Default Credentials (ADC)
- **Project ID**: Configuré dans les credentials
- **Location**: `global` pour les modèles preview

### MCP Server
Le MCP Server appelle le webhook n8n sans passer de credentials.
Les credentials sont gérés entièrement par n8n.

---

## 6. Opérations à Implémenter

### 6.1 Generate Image
```json
{
  "operation": "generate",
  "prompt": "A cute robot in felt style...",
  "aspectRatio": "16:9",
  "outputFormat": "png"
}
```

### 6.2 Extract Character
```json
{
  "operation": "extractCharacter",
  "sourceImage": "<base64 ou URL>",
  "characterDescription": "the blue robot"
}
```

### 6.3 Create Character Sheet
```json
{
  "operation": "createCharacterSheet",
  "sourceImage": "<base64 ou URL>",
  "views": ["front", "back", "side"]
}
```

### 6.4 Compose Scene
```json
{
  "operation": "composeScene",
  "referenceImages": [
    {"url": "...", "role": "character"},
    {"url": "...", "role": "background"}
  ],
  "scenePrompt": "The robot walks through the forest..."
}
```

---

## 7. Écart avec l'Issue #47

### Ce que dit l'issue #47
L'issue décrit la création d'un **custom node n8n** (`n8n-nodes-gemini-image`).

### Ce qui est réellement nécessaire
Un **workflow n8n** qui:
1. Expose un webhook `/webhook/gemini-image`
2. Utilise soit:
   - Le custom node existant `GenAiClient` (Phase 1)
   - Un node HTTP Request vers l'API Gemini
3. Gère l'upload GCS si nécessaire

### Recommandation
Créer un **workflow** (comme video-transcription-workflow.json) plutôt qu'un nouveau custom node, car:
- Les briques de base existent déjà (GenAiClient, GcsUploader)
- Plus rapide à implémenter
- Plus facile à maintenir et modifier

---

## 8. Phasage d'Implémentation

### Phase A: Workflow basique (Generate)
1. Créer `workflows/gemini-image-workflow.json`
2. Webhook + Validate + HTTP Request vers Gemini
3. Retourner l'image en base64
4. Tester avec curl

### Phase B: Upload GCS
1. Ajouter node pour upload GCS
2. Générer URL signée
3. Retourner URL au lieu de base64

### Phase C: Opérations avancées
1. Ajouter Switch pour router par opération
2. Implémenter Extract Character
3. Implémenter Character Sheet
4. Implémenter Compose Scene

### Phase D: Documentation
1. Créer `docs/n8n/gemini-image-mcp-server.md`
2. Documenter tous les endpoints
3. Exemples curl

---

## 9. Format de l'API Gemini

### Endpoint Vertex AI
```
POST https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{LOCATION}/publishers/google/models/gemini-2.5-flash-image:generateContent
```

### Body de la requête
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "<base64>"
          }
        },
        {
          "text": "Extract the robot in a character sheet..."
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9"
    }
  }
}
```

### Réponse
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "<base64>"
            }
          }
        ]
      }
    }
  ]
}
```

---

## 10. Questions Résolues

| Question | Réponse |
|----------|---------|
| Custom node ou workflow? | **Workflow** (comme video-transcription) |
| Où sont les credentials? | Dans n8n (pas en dur dans le workflow) |
| Comment MCP passe les infos? | Via body du POST webhook |
| Quel modèle? | `gemini-2.5-flash-image` |
| Location? | `global` (pour preview) |

---

## 11. Prochaines Actions

1. **Créer le workflow** `workflows/gemini-image-workflow.json`
2. **Tester** avec curl
3. **Documenter** dans `docs/n8n/gemini-image-mcp-server.md`
4. **Fermer** l'issue #47

---

## Annexes

### A. Liens utiles
- [Colab Consistent Imagery](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/use-cases/media-generation/consistent_imagery_generation.ipynb)
- [Vertex AI API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference)
- [n8n Workflow Best Practices](../n8n/WORKFLOW_BEST_PRACTICES.md)

### B. Exemple de workflow existant
Voir `workflows/video-transcription-workflow.json` pour le pattern complet.
