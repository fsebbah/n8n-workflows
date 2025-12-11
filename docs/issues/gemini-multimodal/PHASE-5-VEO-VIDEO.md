# Phase 5 : n8n-nodes-veo-video

## Informations

| Champ | Valeur |
|-------|--------|
| **Priorité** | 5 (Dernière) |
| **Complexité** | ⭐⭐⭐⭐ Complexe |
| **Durée estimée** | 7-10 jours |
| **Dépendances** | Phase 1 (google-genai-core), learnings Phase 4 |
| **Bloque** | Aucune |

---

## Objectif

Créer un node n8n pour la génération de vidéos avec Veo 3 :
- Génération text-to-video
- Génération image-to-video (animation)
- Optimisation de prompts via Gemini
- Gestion des presets (corporate, social, etc.)
- Polling long-running operations via Celery

**Source Colab** : `docs/colab/veo3_video_generation.ipynb`

---

## Documentation Obligatoire

> **AVANT DE COMMENCER** : Lire attentivement ces documents.

| Document | Chemin | Pourquoi |
|----------|--------|----------|
| Guide Custom Nodes | [`docs/n8n/CUSTOM_NODE_DEVELOPMENT.md`](../../n8n/CUSTOM_NODE_DEVELOPMENT.md) | Structure, installation, erreurs courantes |
| Colab Veo 3 | [`docs/colab/veo3_video_generation.ipynb`](../../colab/veo3_video_generation.ipynb) | Logique métier, prompts, paramètres |
| Phase 1 | [PHASE-1-CORE.md](./PHASE-1-CORE.md) | PollingHelper, GcsUploader |
| Phase 4 | [PHASE-4-GEMINI-IMAGE.md](./PHASE-4-GEMINI-IMAGE.md) | Gestion binaires, GCS (patterns similaires) |

---

## Livrables

### 1. Structure du package

```
custom-nodes/n8n-nodes-veo-video/
├── package.json
├── tsconfig.json
├── nodes/
│   └── VeoVideo/
│       ├── VeoVideo.node.ts
│       ├── VeoVideo.node.json
│       ├── veo-video.svg
│       └── operations/
│           ├── generateFromText.ts
│           ├── generateFromImage.ts
│           └── optimizePrompt.ts
├── presets/
│   ├── index.ts
│   └── veo-presets.json
├── prompts/
│   └── prompt-optimization.txt
└── README.md
```

### 2. Opérations du Node

#### Operation 1: Generate from Text

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `prompt` | Description de la vidéo |
| **Input** | `preset` | Preset à appliquer |
| **Input** | `duration` | Durée: 4, 6, 8 secondes |
| **Input** | `aspectRatio` | Ratio: `16:9`, `9:16` |
| **Input** | `resolution` | Résolution: `1080p`, `720p` |
| **Input** | `generateAudio` | Générer l'audio |
| **Input** | `enhancePrompt` | Optimiser le prompt via Gemini |
| **Output** | JSON | URL de la vidéo générée |

**Format de sortie :**
```json
{
  "video": {
    "format": "mp4",
    "duration_seconds": 8,
    "resolution": "1080p",
    "aspect_ratio": "16:9",
    "has_audio": true,
    "gcs_url": "gs://bucket/videos/generated/xxx.mp4",
    "signed_url": "https://storage.googleapis.com/...",
    "expires_at": "2024-12-10T19:00:00Z"
  },
  "metadata": {
    "prompt_original": "Un robot dans une entreprise",
    "prompt_enhanced": "A cinematic, futuristic corporate tech video...",
    "preset_used": "corporate",
    "model": "veo-3.1-generate-001",
    "generation_time_seconds": 127
  }
}
```

#### Operation 2: Generate from Image

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `sourceImage` | Image de départ (binary ou URL) |
| **Input** | `animationPrompt` | Description du mouvement |
| **Input** | `duration` | Durée |
| **Input** | `generateAudio` | Générer l'audio |
| **Output** | JSON | URL de la vidéo animée |

**Format de sortie :**
```json
{
  "video": {
    "format": "mp4",
    "gcs_url": "gs://...",
    "signed_url": "https://..."
  },
  "metadata": {
    "source_image": "input.png",
    "animation_type": "image_to_video"
  }
}
```

#### Operation 3: Optimize Prompt

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `prompt` | Prompt brut de l'utilisateur |
| **Input** | `preset` | Preset pour le style |
| **Output** | JSON | Prompt optimisé (sans génération vidéo) |

**Format de sortie :**
```json
{
  "prompt_original": "robot dans une entreprise",
  "prompt_optimized": "A cinematic, futuristic corporate tech video showing a humanoid robot seamlessly integrating into a modern office environment. Smooth dolly camera movements, professional lighting with subtle lens flares, 4K quality. The robot interacts naturally with human employees in a sleek, minimalist workspace.",
  "keywords_added": ["cinematic", "corporate tech", "dolly camera", "professional lighting"]
}
```

---

## Presets

### Structure des Presets

```json
// presets/veo-presets.json
{
  "corporate": {
    "name": "Corporate Video",
    "description": "Professional business videos",
    "defaults": {
      "style": "Futuriste professionnel, corporate tech",
      "camera_movement": "Travellings doux, panoramiques",
      "lens_effects": "Glow, profondeur de champ",
      "duration": 6,
      "aspect_ratio": "16:9",
      "generate_audio": true,
      "enhance_prompt": true
    },
    "prompt_prefix": "A cinematic, professional corporate video showing",
    "prompt_suffix": "High quality, 4K, professional lighting."
  },
  "social_short": {
    "name": "Social Media Short",
    "description": "Vertical videos for social media",
    "defaults": {
      "style": "Vibrant and saturated, fast-paced",
      "camera_movement": "Dynamic, quick cuts",
      "duration": 4,
      "aspect_ratio": "9:16",
      "generate_audio": true
    },
    "prompt_prefix": "A dynamic, eye-catching vertical video of",
    "prompt_suffix": "Vibrant colors, energetic pacing."
  },
  "product_demo": {
    "name": "Product Demo",
    "description": "Product showcase videos",
    "defaults": {
      "style": "Photorealistic, clean",
      "camera_movement": "Close-Up, slow rotation",
      "camera_angle": "Eye-Level to Low-Angle",
      "duration": 8,
      "aspect_ratio": "16:9"
    },
    "prompt_prefix": "A photorealistic product showcase video featuring",
    "prompt_suffix": "Clean background, studio lighting, detailed textures."
  },
  "cinematic": {
    "name": "Cinematic",
    "description": "Film-quality cinematic videos",
    "defaults": {
      "style": "Cinematic, dramatic lighting",
      "camera_movement": "Crane shot, dramatic angles",
      "lens_effects": "Anamorphic lens flare, shallow depth of field",
      "duration": 8,
      "aspect_ratio": "21:9"
    },
    "prompt_prefix": "A cinematic, film-quality video with dramatic lighting showing",
    "prompt_suffix": "Anamorphic lens, cinematic color grading, epic atmosphere."
  }
}
```

---

## Interface n8n (UI)

### Paramètres du Node

```typescript
properties: [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    options: [
      { name: 'Generate from Text', value: 'generateFromText' },
      { name: 'Generate from Image', value: 'generateFromImage' },
      { name: 'Optimize Prompt Only', value: 'optimizePrompt' },
    ],
    default: 'generateFromText',
  },
  {
    displayName: 'Prompt',
    name: 'prompt',
    type: 'string',
    typeOptions: { rows: 4 },
    required: true,
    description: 'Description of the video to generate',
  },
  {
    displayName: 'Preset',
    name: 'preset',
    type: 'options',
    options: [
      { name: 'Corporate Video', value: 'corporate' },
      { name: 'Social Media Short', value: 'social_short' },
      { name: 'Product Demo', value: 'product_demo' },
      { name: 'Cinematic', value: 'cinematic' },
      { name: 'Custom (No Preset)', value: 'custom' },
    ],
    default: 'corporate',
  },
  {
    displayName: 'Source Image',
    name: 'sourceImage',
    type: 'string',
    description: 'Image to animate (binary or URL)',
    displayOptions: { show: { operation: ['generateFromImage'] } },
  },
  {
    displayName: 'Duration (seconds)',
    name: 'duration',
    type: 'options',
    options: [
      { name: '4 seconds', value: 4 },
      { name: '6 seconds', value: 6 },
      { name: '8 seconds', value: 8 },
    ],
    default: 6,
    displayOptions: { show: { operation: ['generateFromText', 'generateFromImage'] } },
  },
  {
    displayName: 'Aspect Ratio',
    name: 'aspectRatio',
    type: 'options',
    options: [
      { name: '16:9 (Landscape)', value: '16:9' },
      { name: '9:16 (Portrait/Mobile)', value: '9:16' },
    ],
    default: '16:9',
    displayOptions: { show: { operation: ['generateFromText', 'generateFromImage'] } },
  },
  {
    displayName: 'Resolution',
    name: 'resolution',
    type: 'options',
    options: [
      { name: '1080p (Full HD)', value: '1080p' },
      { name: '720p (HD)', value: '720p' },
    ],
    default: '1080p',
    displayOptions: { show: { operation: ['generateFromText', 'generateFromImage'] } },
  },
  {
    displayName: 'Generate Audio',
    name: 'generateAudio',
    type: 'boolean',
    default: true,
    description: 'Generate dialogue and sound effects',
    displayOptions: { show: { operation: ['generateFromText', 'generateFromImage'] } },
  },
  {
    displayName: 'Enhance Prompt',
    name: 'enhancePrompt',
    type: 'boolean',
    default: true,
    description: 'Use Gemini to optimize the prompt before generation',
    displayOptions: { show: { operation: ['generateFromText'] } },
  },
  {
    displayName: 'Model',
    name: 'model',
    type: 'options',
    options: [
      { name: 'Veo 3.1 (Quality)', value: 'veo-3.1-generate-001' },
      { name: 'Veo 3.1 Fast', value: 'veo-3.1-fast-generate-001' },
    ],
    default: 'veo-3.1-generate-001',
    displayOptions: { show: { operation: ['generateFromText', 'generateFromImage'] } },
  },
]
```

---

## Gestion du Polling (Long-Running Operations) avec Celery

### Architecture avec Celery (Backend existant)

> **INFO** : Le Backend utilise Celery pour les opérations longues.
> Le polling utilise `AsyncResult` pour récupérer l'état des tâches.

### Flux de Génération

```
1. Client → MCP : Requête génération vidéo
2. MCP → Backend : POST /api/v1/video/generate
3. Backend : Crée tâche Celery → retourne task_id
4. Client : Polling GET /api/v1/operations/{task_id}/status
   └── Ou : WebSocket pour progression temps réel
5. Celery Task :
   └── Appelle n8n webhook → POST Veo 3 API
   └── Poll Veo 3 operations/{id}
   └── Upload GCS → URL signée
   └── update_state(PROGRESS, meta={"progress": X})
6. Quand Celery status = SUCCESS
   └── Retourner l'URL de la vidéo
```

### Endpoint Fallback Polling

```
GET /api/v1/operations/{task_id}/status
```

**Mapping statuts Celery → Client** :

| Celery | Client | Description |
|--------|--------|-------------|
| `PENDING` | `pending` | Tâche en attente |
| `STARTED` | `processing` | En cours d'exécution |
| `PROGRESS` | `processing` | En cours avec % progression |
| `SUCCESS` | `completed` | Terminé avec succès |
| `FAILURE` | `failed` | Échec |
| `RETRY` | `processing` | Retry en cours |

**Réponse** :

```json
{
  "task_id": "celery_task_xxx",
  "status": "processing",
  "progress": 45,
  "result": null,
  "error": null
}
```

### Implémentation Backend (Celery)

```python
from celery.result import AsyncResult

@router.get("/api/v1/operations/{task_id}/status")
def get_task_status(task_id: str):
    result = AsyncResult(task_id)

    response = {
        "task_id": task_id,
        "status": result.status,
        "progress": None,
        "result": None,
        "error": None
    }

    if result.status == "PROGRESS":
        response["progress"] = result.info.get("progress", 0)
    elif result.status == "SUCCESS":
        response["result"] = result.result
    elif result.status == "FAILURE":
        response["error"] = str(result.result)

    return response
```

### Tâche Celery avec Progression

```python
@celery_app.task(bind=True)
def generate_video(self, prompt: str, config: dict, user_id: str):
    # 1. Enrichir le prompt (optionnel)
    self.update_state(state="PROGRESS", meta={"progress": 10, "step": "enhancing_prompt"})
    enhanced_prompt = enhance_prompt_with_gemini(prompt, config.get("preset"))

    # 2. Appeler n8n webhook
    self.update_state(state="PROGRESS", meta={"progress": 20, "step": "calling_veo"})
    operation_id = call_n8n_veo_webhook(enhanced_prompt, config)

    # 3. Polling Veo 3 (1-3 minutes)
    while True:
        veo_status = poll_veo_operation(operation_id)
        if veo_status["state"] == "DONE":
            break
        progress = 20 + (veo_status.get("progress", 0) * 0.6)  # 20-80%
        self.update_state(state="PROGRESS", meta={"progress": progress, "step": "generating"})
        time.sleep(5)

    # 4. Upload GCS + URL signée
    self.update_state(state="PROGRESS", meta={"progress": 90, "step": "uploading"})
    video_url = upload_to_gcs(veo_status["video_data"], user_id)
    signed_url = generate_signed_url(video_url)

    return {
        "video_url": video_url,
        "signed_url": signed_url,
        "expires_at": (datetime.now() + timedelta(hours=24)).isoformat()
    }
```

### Configuration Timeout

| Composant | Timeout | Configuration |
|-----------|---------|---------------|
| n8n Webhook | 300s | `N8N_WEBHOOK_TIMEOUT_VIDEO=300` |
| Celery Task | 600s | `task_time_limit=600` |
| Client Polling | Illimité | Interval 5s, géré côté client |

### Avantages Celery

- État déjà persisté (Redis/RabbitMQ)
- Pas besoin de gérer le stockage d'état manuellement
- `task_id` = `correlation_id` naturellement
- Retry automatique en cas d'erreur
- Progress feedback natif avec `update_state`

---

## Critères d'Acceptation

### Fonctionnels

- [ ] Generate from Text crée une vidéo
- [ ] Generate from Image anime une image
- [ ] Optimize Prompt retourne un prompt amélioré
- [ ] Les 4 presets fonctionnent
- [ ] Le polling Celery gère les opérations de 1-3 minutes
- [ ] L'audio est généré quand demandé
- [ ] Upload GCS + URLs signées fonctionnent
- [ ] Le timeout est respecté

### Techniques

- [ ] Le node compile sans erreur
- [ ] Le node apparaît dans l'UI n8n
- [ ] Le type JSON est `n8n-nodes-veo-video.veoVideo`
- [ ] Polling avec Celery fonctionne
- [ ] Dépendance `google-genai-core` fonctionne
- [ ] Tests unitaires (>80% coverage)

### Documentation

- [ ] README.md avec exemples
- [ ] Mise à jour de `docs/n8n/CUSTOM_NODE_DEVELOPMENT.md` (polling, timeouts, Celery)

---

## Tests à Effectuer

### Tests Unitaires

```typescript
describe('VeoVideo', () => {
  describe('generateFromText', () => {
    it('should generate video from prompt');
    it('should apply preset defaults');
    it('should enhance prompt when requested');
    it('should poll Celery until completion');
    it('should timeout after max duration');
  });

  describe('generateFromImage', () => {
    it('should animate static image');
    it('should handle binary input');
    it('should handle URL input');
  });

  describe('optimizePrompt', () => {
    it('should enhance prompt with Gemini');
    it('should apply preset style');
  });

  describe('presets', () => {
    it('should load all presets');
    it('should apply preset prefix/suffix');
  });
});
```

### Tests d'Intégration

- [ ] Générer une vidéo simple (4s, 720p)
- [ ] Générer avec preset corporate
- [ ] Générer avec preset social_short (9:16)
- [ ] Animer une image statique
- [ ] Vérifier que l'URL signée fonctionne

---

## Risques et Mitigation

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Timeout pendant génération | Bloquant | Celery task_time_limit=600, fallback polling |
| Coût élevé ($0.20/vidéo) | Moyen | Confirmation utilisateur côté MCP |
| Quota Veo épuisé | Bloquant | Message d'erreur clair, retry |
| Qualité variable | Moyen | Prompt enhancement, presets optimisés |
| Celery task perdue | Moyen | Redis persistence, retry logic |

---

## Notes de Développement

### Configuration Veo 3

```typescript
const veoConfig = {
  model: 'veo-3.1-generate-001',
  aspectRatio: '16:9',
  durationSeconds: 6,
  resolution: '1080p',
  generateAudio: true,
  personGeneration: 'allow_adult',
};
```

### Prompt Enhancement

```typescript
const enhancePrompt = async (prompt: string, preset: Preset): Promise<string> => {
  const systemPrompt = `You are an expert video prompt engineer.
Given a basic prompt and style guidelines, create an optimized prompt for Veo 3.
Include specific details about camera angles, lighting, movement, and atmosphere.`;

  const userPrompt = `
Basic prompt: ${prompt}
Style: ${preset.style}
Camera: ${preset.camera_movement}

Create an optimized prompt (2-3 sentences max).`;

  const response = await genAiClient.generateText(systemPrompt, userPrompt);
  return response;
};
```

### Pourquoi ce node en Phase 5 ?

1. **Le plus complexe** : Combine tout (polling Celery, GCS, presets, binaires)
2. **Dépend des phases précédentes** : Réutilise PollingHelper, GcsUploader
3. **Coût élevé** : Nécessite validation du flux complet avant
4. **Opérations longues** : Gestion timeout spécifique avec Celery

---

## Points d'Attention

### Mise à jour de la documentation

> **IMPORTANT** : Cette phase introduit le polling Celery et les timeouts.
> Documenter dans `docs/n8n/CUSTOM_NODE_DEVELOPMENT.md` :
> - Configuration des timeouts n8n pour opérations longues
> - Intégration avec Celery pour le polling
> - Gestion des long-running operations
> - Erreurs courantes avec Veo 3

---

## Validation Finale

Avant de considérer le projet complet, vérifier :

- [ ] Les 3 opérations fonctionnent
- [ ] Les presets sont appliqués correctement
- [ ] Le polling Celery gère les 1-3 minutes de génération
- [ ] L'audio est généré
- [ ] GCS + URLs signées fonctionnent
- [ ] Le node est visible dans n8n
- [ ] La documentation est complète

---

## Post-Implémentation

### Après validation de tous les nodes

1. [ ] Test d'intégration complet (workflow MCP → Backend/Celery → n8n → Google APIs)
2. [ ] Documentation utilisateur (exemples de prompts)
3. [ ] Monitoring des coûts en production
4. [ ] Feedback utilisateurs pour amélioration des presets

---

## Liens

- **Issue précédente** : [Phase 4 - Gemini Image](./PHASE-4-GEMINI-IMAGE.md)
- **README du projet** : [README.md](./README.md)
- **Synthèse projet** : [`docs/gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md`](../../gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md)
