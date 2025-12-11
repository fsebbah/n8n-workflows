# 🎬 Google AI Media Nodes pour n8n
## Vidéo, Image, Knowledge Graph & Transcription Multimodale

> **Auteur** : Équipe n8n-workflows
> **Date** : 2025-12-09
> **Source** : `docs/colab/`
> **Objectif** : Créer des nodes n8n basés sur les notebooks Colab Google AI (Veo 3, Gemini Image, Knowledge Graph, Video Transcription)

---

## Table des Matières

1. [Résumé des Notebooks Colab](#résumé-des-notebooks-colab)
2. [Correspondance avec les Tools MCP](#correspondance-avec-les-tools-mcp)
3. [Propositions de Nodes n8n](#propositions-de-nodes-n8n)
4. [Architecture Recommandée](#architecture-recommandée)
5. [Stratégies de Flexibilité](#stratégies-de-flexibilité)
6. [Cas d'Usage n8n](#cas-dusage-n8n)
7. [APIs et Coûts](#apis-et-coûts)
8. [Plan de Développement](#plan-de-développement)
9. [Questions Ouvertes](#questions-ouvertes)

---

## Résumé des Notebooks Colab

### 1. Veo 3 Video Generation (`veo3_video_generation.ipynb`)

**Fonctionnalité** : Génération de vidéos IA avec Google Veo 3

| Aspect | Détail |
|--------|--------|
| **Text-to-Video** | Prompt → Vidéo 4K avec audio |
| **Image-to-Video** | Image de départ → Animation |
| **Durée** | 4, 6, ou 8 secondes |
| **Ratio** | 16:9, 9:16 |
| **Audio** | Généré automatiquement (dialogue, effets) |
| **Enhancement** | Prompt optimisé par Gemini |
| **API** | Google Gen AI SDK (Vertex AI) |

**Paramètres du Prompt Builder** :
- Subject (sujet principal)
- Action (mouvements, interactions)
- Scene (lieu, moment)
- Camera Angle (Eye-Level, Low-Angle, Bird's-Eye View, etc.)
- Camera Movement (Pan, Tilt, Dolly, Zoom, etc.)
- Lens Effects (Wide-Angle, Bokeh, Lens Flare, etc.)
- Style (Photorealistic, Cinematic, Vintage, etc.)
- Temporal Elements (Slow-motion, Time-lapse, etc.)
- Sound Effects
- Dialogue

**Modèles disponibles** :
- `veo-3.1-generate-001` (qualité)
- `veo-3.1-fast-generate-001` (rapide)

---

### 2. Knowledge Graph Generation (`knowledge_graph_generation.ipynb`)

**Fonctionnalité** : Extraction de graphes de connaissances depuis des textes

| Aspect | Détail |
|--------|--------|
| **Extraction** | Personnages et relations depuis documents |
| **Output structuré** | JSON avec schema Pydantic |
| **Visualisation** | Graphes NetworkX animés |
| **Multi-langue** | Fonctionne en FR, EN, DE, ES, etc. |
| **API** | Gemini 2.5 Flash |

**Schema de sortie** :
```json
{
  "task1_characters": [
    { "id": 0, "name": "Jean Valjean" }
  ],
  "task2_relationships": [
    { "source": 0, "target": 1, "links": ["father_of", "protector_of"] }
  ]
}
```

**Configuration Gemini** :
- `temperature=0.0` (déterministe)
- `top_p=0.0`
- `seed=42` (reproductibilité)
- `response_mime_type="application/json"`
- `response_schema=TextAnalysis`

---

### 3. Consistent Imagery Generation (`consistent_imagery_generation.ipynb`)

**Fonctionnalité** : Génération d'images cohérentes avec personnages récurrents

| Aspect | Détail |
|--------|--------|
| **Extraction** | Personnage depuis image existante |
| **Character Sheet** | Vues front/back du personnage |
| **Scènes** | Génération cohérente multi-scènes |
| **Asset Graph** | Suivi des dépendances images |
| **API** | Gemini 2.5 Flash Image ("Nano Banana") |

**Workflow typique** :
1. Image archive → Extraction personnage
2. Création character sheet (front/back views)
3. Génération scènes successives avec références
4. Maintien de la cohérence visuelle

**Aspect Ratios supportés** :
- 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9

**Résolution** : 1024×1024 (1:1) ou équivalent tokens

---

### 4. Multimodal Video Transcription (`multimodal_video_transcription.ipynb`)

**Fonctionnalité** : Transcription vidéo multimodale complète

| Aspect | Détail |
|--------|--------|
| **Speech-to-Text** | Avec timestamps précis |
| **Speaker Diarization** | Identification des locuteurs |
| **OCR** | Texte visible à l'écran |
| **Attribution** | "Qui dit quoi" |
| **Context** | 1M tokens (vidéos longues) |
| **API** | Gemini 2.5 Flash/Pro |

**Avantages vs pipeline ML traditionnel** :
- Pas de modèles séparés (STT, diarization, OCR)
- Traitement unifié multimodal
- Support 100+ langues automatique
- Extraction tabulaire structurée

---

## Correspondance avec les Tools MCP

| Notebook | Tools MCP associés | Statut actuel |
|----------|-------------------|---------------|
| Veo 3 Video | `image_generator_tool` (partiel) | ⏳ Nouveau |
| Knowledge Graph | `graph_builder_tool` | ⏳ À créer |
| Consistent Imagery | `image_generator_tool` | ⏳ À créer |
| Video Transcription | `transcriber_tool`, `speaker_identifier_tool` | ⏳ À créer |

---

## Propositions de Nodes n8n

### Node Central : Google GenAI Core

```
Nom: n8n-nodes-google-genai-core
Type: Shared library + Credentials

Contenu:
- GoogleVertexAiApi credentials
- Client wrapper pour Gen AI SDK
- Helpers communs (polling, retry, etc.)
- Presets partagés
```

### Node 1 : Veo Video Generator

```
Nom: n8n-nodes-veo-video
Type: n8n-nodes-base.veoVideo

Opérations:
- textToVideo: Prompt → Vidéo
- imageToVideo: Image + Prompt → Vidéo animée

Paramètres:
- prompt: string
- model: veo-3.1-generate-001 | veo-3.1-fast-generate-001
- aspectRatio: 16:9 | 9:16
- duration: 4 | 6 | 8
- resolution: 1080p | 720p
- generateAudio: boolean
- enhancePrompt: boolean
- personGeneration: allow_adult | dont_allow
- inputImage: Binary (optionnel)
- outputGcsUri: string (optionnel)

Output:
- Binary: fichier vidéo MP4
- ou GCS URI si spécifié
```

### Node 2 : Gemini Image Generator

```
Nom: n8n-nodes-gemini-image
Type: n8n-nodes-base.geminiImage

Opérations:
- generateImage: Prompt → Image
- editImage: Image + Prompt → Image modifiée
- createCharacterSheet: Image → Character sheet multi-vues
- generateConsistentScene: References + Prompt → Scène cohérente

Paramètres:
- prompt: string
- sourceImages: Binary[] (1-4 images)
- aspectRatio: 1:1 | 16:9 | 9:16 | ...
- responseModalities: IMAGE | IMAGE,TEXT

Output:
- Binary: image PNG/WebP
- Text: feedback optionnel
```

### Node 3 : Knowledge Graph Extractor

```
Nom: n8n-nodes-knowledge-graph
Type: n8n-nodes-base.knowledgeGraph

Opérations:
- extractEntities: Document → Liste entités
- extractRelations: Document → Graphe de relations
- generateGraph: Document → Visualisation graphe

Paramètres:
- source: Text | URL | File (PDF, TXT)
- entityTypes: characters | concepts | organizations | all
- outputFormat: json | networkx | mermaid | graphviz
- language: auto | fr | en | ...

Output:
- JSON: { entities: [], relationships: [] }
- ou Image: visualisation du graphe
```

### Node 4 : Video Transcription

```
Nom: n8n-nodes-video-transcription
Type: n8n-nodes-base.videoTranscription

Opérations:
- transcribe: Vidéo → Transcription complète
- diarize: Vidéo → Transcription avec locuteurs
- extractVisualText: Vidéo → OCR des textes visibles

Paramètres:
- video: Binary | URL | GCS URI
- language: auto | fr | en | ...
- includeSpeakerNames: boolean
- includeTimestamps: boolean
- includeVisualOCR: boolean
- outputFormat: json | srt | vtt

Output:
- JSON: { segments: [{ speaker, text, start, end }] }
- ou SRT/VTT: sous-titres
```

---

## Architecture Recommandée

### Contrainte Clé : Utilisateur sans accès direct à n8n

> **Important** : L'utilisateur final n'aura PAS accès direct à l'interface n8n.
> Le point d'entrée sera toujours le **MCP Server** (via Chat, Agent IA, API).
> n8n sert de **couche d'exécution backend**.

### Architecture Retenue : MCP → Workflows n8n (Backend)

```
┌─────────────────────────────────────────────────────────────────┐
│                      UTILISATEUR                                 │
│              (Chat, Agent IA, API externe)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MCP SERVER                                 │
├─────────────────────────────────────────────────────────────────┤
│  Tool Selector (routing NLP)                                     │
│  ├── Règles keywords (déterministe, < 10ms)                     │
│  ├── NER spaCy (entités)                                        │
│  └── Embeddings sémantiques (fallback)                          │
├─────────────────────────────────────────────────────────────────┤
│  Tool Wrappers (Python)                                          │
│  ├── VideoAnalysisTool      → /webhook/video-analyze            │
│  ├── VideoGenerationTool    → /webhook/video-generate           │
│  ├── ImageGenerationTool    → /webhook/image-generate           │
│  └── KnowledgeGraphTool     → /webhook/knowledge-extract        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP POST (async)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    N8N (Backend Execution)                       │
├─────────────────────────────────────────────────────────────────┤
│  Workflows Webhook                                               │
│  ├── video-analyze-workflow     → Gemini 2.5 Flash              │
│  ├── video-generate-workflow    → Veo 3.1 API                   │
│  ├── image-generate-workflow    → Gemini Flash Image            │
│  └── knowledge-extract-workflow → Gemini + NetworkX             │
├─────────────────────────────────────────────────────────────────┤
│  Custom Nodes (optionnel, pour simplifier les workflows)         │
│  ├── n8n-nodes-google-genai-core                                │
│  └── Nodes spécialisés par domaine                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD APIs                             │
├─────────────────────────────────────────────────────────────────┤
│  Vertex AI (Gemini 2.5 Flash, Gemini Image, Veo 3.1)            │
│  Google Cloud Storage (médias générés)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Implications de cette Architecture

| Aspect | Conséquence |
|--------|-------------|
| **UI utilisateur** | Aucune UI n8n exposée - tout passe par MCP |
| **Flexibilité** | Gérée côté MCP (paramètres du tool wrapper) |
| **Presets** | Définis dans le MCP, pas dans n8n |
| **Prompt Builder** | Logique dans le wrapper Python MCP |
| **Custom Nodes** | Optionnels - simplifient les workflows internes |

### Structure des Fichiers

```
# Côté MCP Server (Python)
src/mcp_server/
├── tools/n8n/
│   ├── video_analysis.py        # Wrapper → webhook
│   ├── video_generation.py      # Wrapper → webhook
│   ├── image_generation.py      # Wrapper → webhook
│   └── knowledge_graph.py       # Wrapper → webhook
├── tool_selector/
│   └── rules.py                 # Keywords pour routing
└── config/
    └── presets/
        ├── veo-presets.json     # Presets vidéo
        └── image-presets.json   # Presets image

# Côté n8n (Workflows + Custom Nodes optionnels)
workflows/mcp/
├── video-analyze-workflow.json
├── video-generate-workflow.json
├── image-generate-workflow.json
└── knowledge-extract-workflow.json

custom-nodes/  # Optionnel - si besoin de simplifier
├── n8n-nodes-google-genai-core/
└── ...
```

**Avantages** :
- ✅ Utilisateur isolé de n8n (sécurité, simplicité)
- ✅ MCP contrôle toute la logique métier
- ✅ n8n = pure exécution (orchestration, retry, logging)
- ✅ Cohérent avec l'architecture MCP existante
- ✅ Custom nodes optionnels (simplifient mais pas obligatoires)

---

## Stratégies de Flexibilité (Côté MCP)

> **Note** : L'utilisateur n'ayant pas accès à n8n, toute la flexibilité est gérée côté **MCP Server**.
> Les workflows n8n reçoivent des paramètres structurés et exécutent.

### Interface Utilisateur via MCP (Chat/Agent)

L'utilisateur interagit en langage naturel. Le MCP interprète et structure :

```
┌─────────────────────────────────────────────────────────────────┐
│  UTILISATEUR (Chat)                                              │
│  "Génère une vidéo corporate de 8 secondes montrant un robot    │
│   qui transforme une entreprise, style futuriste violet/bleu"   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  MCP TOOL SELECTOR                                               │
│  → Détecte domaine: video_generation                            │
│  → Extrait entités: robot, entreprise, corporate, 8s, violet    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  MCP VIDEO GENERATION WRAPPER                                    │
│  → Applique preset "corporate_video"                            │
│  → Enrichit prompt avec keywords extraits                       │
│  → Construit payload structuré                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  N8N WORKFLOW (Backend)                                          │
│  Reçoit: {                                                       │
│    "prompt": "...(enrichi)...",                                 │
│    "duration": 8,                                                │
│    "aspectRatio": "16:9",                                       │
│    "style": "corporate_tech",                                   │
│    ...                                                           │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Paramètres Exposés via MCP Tool

Le wrapper MCP expose des paramètres que l'Agent peut remplir :

```python
# src/mcp_server/tools/n8n/video_generation.py

class VideoGenerationTool(N8NTool):
    domain = "video_generation"

    # Paramètres exposés à l'Agent/LLM
    parameters = {
        "prompt": {
            "type": "string",
            "required": True,
            "description": "Description de la vidéo à générer"
        },
        "preset": {
            "type": "string",
            "enum": ["corporate", "social_short", "product_demo", "cinematic", "custom"],
            "default": "corporate",
            "description": "Style prédéfini"
        },
        "duration": {
            "type": "integer",
            "enum": [4, 6, 8],
            "default": 6
        },
        "aspect_ratio": {
            "type": "string",
            "enum": ["16:9", "9:16"],
            "default": "16:9"
        },
        # Paramètres avancés (optionnels)
        "style_keywords": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Mots-clés de style additionnels"
        },
        "camera_movement": {
            "type": "string",
            "description": "Type de mouvement caméra"
        }
    }
```

### Système de Presets (Côté MCP)

Les presets sont définis dans le MCP et appliqués avant l'appel à n8n :

```json
// src/mcp_server/config/presets/veo-presets.json
{
  "corporate": {
    "name": "Corporate Video",
    "description": "Vidéos professionnelles business",
    "defaults": {
      "style": "Futuriste professionnel, corporate tech",
      "camera_movement": "Travellings doux, panoramiques",
      "lens_effects": "Glow, profondeur de champ",
      "duration": 6,
      "aspect_ratio": "16:9",
      "generate_audio": true,
      "enhance_prompt": true
    },
    "prompt_template": "A cinematic {style} video showing {subject}. {action}. Scene: {scene}. Camera: {camera_movement}."
  },
  "social_short": {
    "name": "Social Media Short",
    "defaults": {
      "duration": 4,
      "aspect_ratio": "9:16",
      "style": "Vibrant and saturated, fast-paced"
    }
  },
  "product_demo": {
    "name": "Product Demo",
    "defaults": {
      "camera_angle": "Close-Up",
      "style": "Photorealistic, clean",
      "duration": 8
    }
  }
}
```

### Prompt Builder (Logique MCP)

Le MCP assemble le prompt final à partir des éléments extraits :

```python
# src/mcp_server/tools/n8n/prompt_builder.py

class VeoPromptBuilder:
    """Construit un prompt optimisé pour Veo 3 à partir d'éléments structurés"""

    TEMPLATE = """
    {style_prefix} video showing {subject}.
    Action: {action}.
    Scene: {scene}.
    Camera: {camera_angle}, {camera_movement}.
    Lens: {lens_effects}.
    Style: {style}.
    Audio: {audio_description}.
    """

    def build(self, params: dict, preset: dict) -> str:
        # Merge preset defaults avec params utilisateur
        merged = {**preset.get("defaults", {}), **params}

        # Remplir le template
        prompt = self.TEMPLATE.format(
            style_prefix=merged.get("style_prefix", "A cinematic"),
            subject=merged.get("subject", params.get("prompt", "")),
            action=merged.get("action", ""),
            scene=merged.get("scene", ""),
            camera_angle=merged.get("camera_angle", "Eye-Level"),
            camera_movement=merged.get("camera_movement", "Static"),
            lens_effects=merged.get("lens_effects", ""),
            style=merged.get("style", ""),
            audio_description=merged.get("audio", "ambient sound")
        )

        return prompt.strip()
```

### Workflow n8n : Récepteur Simple

Le workflow n8n reçoit un payload structuré et exécute :

```json
// Payload reçu par le webhook n8n
{
  "operation": "generate_from_text",
  "prompt": "A cinematic corporate tech video showing a robot transforming a business...",
  "config": {
    "model": "veo-3.1-generate-001",
    "duration": 8,
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "generate_audio": true,
    "enhance_prompt": true,
    "person_generation": "allow_adult"
  },
  "output": {
    "gcs_bucket": "media-generated",
    "gcs_path": "videos/2024-12/video_abc123.mp4"
  },
  "metadata": {
    "request_id": "req_abc123",
    "user_id": "user_456",
    "preset_used": "corporate"
  }
}
```

### Avantages de cette Approche

| Aspect | Bénéfice |
|--------|----------|
| **Sécurité** | Utilisateur n'a jamais accès à n8n |
| **Simplicité UX** | Langage naturel → résultat |
| **Contrôle** | MCP valide et enrichit les paramètres |
| **Évolutivité** | Nouveaux presets sans modifier n8n |
| **Traçabilité** | Metadata pour audit et debugging |

---

## Cas d'Usage n8n

### 1. Workflow "Content Video Factory"

```
Trigger (Webhook)
  → Récupérer script/prompt
  → [Veo 3] Générer vidéo
  → [Video Transcription] Créer sous-titres
  → Upload vers YouTube/Drive
  → Notification Slack
```

### 2. Workflow "Brand Asset Generator"

```
Trigger (Form/Webhook)
  → Input: logo/mascotte + brief créatif
  → [Gemini Image] Créer character sheet
  → [Gemini Image] Générer X scènes
  → Assembler en storyboard PDF
  → Envoyer par email
```

### 3. Workflow "Document Intelligence"

```
Trigger (Gmail/Drive new file)
  → [Knowledge Graph] Extraire entités
  → [Knowledge Graph] Générer visualisation
  → Stocker dans Notion/Airtable
  → Notifier Slack avec résumé
```

### 4. Workflow "Video Analysis Pipeline"

```
Trigger (Drive new video)
  → [Video Transcription] Transcrire
  → [Knowledge Graph] Extraire personnes/sujets
  → Indexer dans Vector Store
  → Créer fiche résumé
```

### 5. Workflow "Automated Training Content"

```
Trigger (Notion new page)
  → Récupérer contenu formation
  → [Veo 3] Générer vidéo explicative
  → [Video Transcription] Créer sous-titres multilingues
  → Upload LMS
```

---

## APIs et Coûts

| Service | API | Coût estimé |
|---------|-----|-------------|
| Veo 3 | Vertex AI | ~$0.20/vidéo 8s |
| Gemini 2.5 Flash | Vertex AI / AI Studio | ~$0.001/1K tokens |
| Gemini 2.5 Flash Image | Vertex AI | ~$0.02/image |
| Video Analysis (Gemini) | Vertex AI | ~$0.002/minute vidéo |

**Note** : Les credentials Google Vertex AI sont déjà disponibles dans le projet.

---

## Plan de Développement

### Phase 1 : Foundation (1-2 semaines)

| Tâche | Effort | Priorité |
|-------|--------|----------|
| `n8n-nodes-google-genai-core` : Credentials + helpers | 2-3 jours | Haute |
| `n8n-nodes-veo-video` : Text-to-video basique | 3-4 jours | Haute |
| Tests unitaires Phase 1 | 1-2 jours | Haute |

### Phase 2 : Image Generation (1-2 semaines)

| Tâche | Effort | Priorité |
|-------|--------|----------|
| `n8n-nodes-gemini-image` : Generate + Edit | 3-4 jours | Haute |
| Character sheet generation | 2 jours | Moyenne |
| Consistent scene generation | 2 jours | Moyenne |

### Phase 3 : Video Analysis (1-2 semaines)

| Tâche | Effort | Priorité |
|-------|--------|----------|
| `n8n-nodes-video-transcription` : Transcription | 3-4 jours | Haute |
| Speaker diarization | 2 jours | Moyenne |
| Visual OCR | 1-2 jours | Moyenne |

### Phase 4 : Knowledge Extraction (1 semaine)

| Tâche | Effort | Priorité |
|-------|--------|----------|
| `n8n-nodes-knowledge-graph` : Entity extraction | 2-3 jours | Moyenne |
| Relation extraction | 2 jours | Moyenne |
| Graph visualization | 1-2 jours | Basse |

### Phase 5 : Polish & Templates (Continue)

| Tâche | Effort | Priorité |
|-------|--------|----------|
| Workflow templates | 2-3 jours | Moyenne |
| Documentation | 2 jours | Moyenne |
| Tests d'intégration | 2-3 jours | Haute |
| Presets library | 1-2 jours | Basse |

---

## Questions Ouvertes

### Décisions Techniques Validées

> **Réponses utilisateur** :
> - Architecture : **MCP → Workflows n8n (Backend)** ✅
> - Accès utilisateur : **Pas d'accès direct à n8n** ✅
> - Priorités : Pas d'urgence, compartimenter en phases
> - Deployment : Usage interne
> - Credentials : Déjà disponible (Google Vertex AI)

### Conséquences de l'Architecture MCP-First

| Aspect | Décision |
|--------|----------|
| **Presets** | Côté MCP (fichiers JSON dans `src/mcp_server/config/presets/`) |
| **Prompt Builder** | Côté MCP (logique Python dans les wrappers) |
| **Validation params** | Côté MCP (avant envoi à n8n) |
| **UI/UX** | Chat/Agent via MCP uniquement |

### Questions Techniques Restantes

#### 1. Stockage des Outputs
Les vidéos/images générées doivent :
- [ ] Être stockées sur GCS avec URL signée retournée ?
- [ ] Être stockées sur un autre service (S3, Azure Blob) ?
- [ ] Durée de rétention des médias ?

#### 2. Async/Polling pour Veo 3
Veo 3 prend 1-3 minutes pour générer :
- [ ] Le MCP attend la fin (blocking) ?
- [ ] Le MCP démarre et retourne un job_id, puis l'utilisateur demande le statut ?
- [ ] Notification push quand terminé (webhook vers MCP) ?

#### 3. Gestion des Erreurs
En cas d'échec de génération :
- [ ] Retry automatique côté n8n (exponential backoff) ?
- [ ] Retry côté MCP ?
- [ ] Message d'erreur structuré pour l'utilisateur ?

#### 4. Quotas et Rate Limiting
Comment gérer les quotas API Google :
- [ ] Queue côté MCP avant envoi ?
- [ ] Monitoring des quotas avec alertes ?
- [ ] Fallback vers modèle alternatif si quota atteint ?

#### 5. Sécurité et Permissions
- [ ] Quels utilisateurs peuvent accéder à video_generation ?
- [ ] Limite de génération par utilisateur/jour ?
- [ ] Audit log des générations ?

#### 6. Médias Volumineux
Les vidéos peuvent faire 50-100 MB :
- [ ] Jamais transmises via MCP, seulement URLs ?
- [ ] Streaming possible ?
- [ ] Compression automatique ?

### Questions pour l'Équipe MCP

1. **Le MCP supporte-t-il les opérations longues (3+ minutes) ?**
   - Timeout actuel des webhooks ?
   - Mécanisme de job async existant ?

2. **Comment le Tool Selector gère-t-il les nouveaux domaines ?**
   - Faut-il régénérer les embeddings ?
   - Processus d'ajout d'un nouveau domaine ?

3. **Format de réponse attendu par le MCP ?**
   - Structure JSON standard ?
   - Gestion des erreurs ?
   - Métadonnées requises ?

4. **Intégration avec l'orchestrateur LangGraph ?**
   - Les nouveaux tools seront-ils orchestrables ?
   - Support des chaînes multi-tools ?

---

## Comparaison avec l'Analyse MCP

> **Référence** : `docs/gemini/integration-multimodale-mcp-analysis.md`

### Points Communs

| Aspect | Cette Analyse | Analyse MCP |
|--------|---------------|-------------|
| **4 Domaines identifiés** | ✅ Identiques | ✅ Identiques |
| **APIs Google** | Gemini, Veo 3, Vertex AI | Gemini, Veo 3, Vertex AI |
| **Opérations par domaine** | Similaires | Similaires |
| **Stockage GCS** | Recommandé | Recommandé |
| **Polling Veo 3** | Identifié | Identifié |

### Différences et Convergence

| Aspect | Cette Analyse (initiale) | Analyse MCP | **Convergence** |
|--------|--------------------------|-------------|-----------------|
| **Focus** | Custom nodes n8n | Wrappers MCP Python | **MCP-First adopté** |
| **Point d'entrée** | UI n8n | Tool Selector MCP | **MCP uniquement** |
| **Presets** | Dans les nodes | Dans MCP | **Dans MCP** |
| **Prompt Builder** | UI n8n guidée | Non détaillé | **Logique MCP Python** |

### Synthèse : Architecture Unifiée

Les deux analyses convergent vers :

```
UTILISATEUR (Chat/Agent)
       │
       ▼
MCP SERVER
├── Tool Selector (routing NLP)
├── Tool Wrappers (Python)
│   ├── VideoAnalysisTool
│   ├── VideoGenerationTool
│   ├── ImageGenerationTool
│   └── KnowledgeGraphTool
├── Prompt Builders (logique d'enrichissement)
└── Presets (configuration réutilisable)
       │
       ▼
N8N (Backend Execution)
├── Workflows webhook (récepteurs)
└── Custom nodes (optionnel, simplification)
       │
       ▼
GOOGLE CLOUD APIs
```

### Responsabilités Clarifiées

| Couche | Responsabilité |
|--------|----------------|
| **MCP** | Routing, validation, enrichissement, presets, UX |
| **n8n** | Exécution, retry, logging, orchestration technique |
| **Google APIs** | Génération IA (Gemini, Veo) |
| **GCS** | Stockage médias |

---

## Ressources

### Documentation Google

- [Google Gen AI SDK](https://pypi.org/project/google-genai)
- [Veo 3 Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/video/veo)
- [Gemini API](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)

### Notebooks Source

- `docs/colab/veo3_video_generation.ipynb`
- `docs/colab/knowledge_graph_generation.ipynb`
- `docs/colab/consistent_imagery_generation.ipynb`
- `docs/colab/multimodal_video_transcription.ipynb`

### Documentation n8n

- [Creating Custom Nodes](https://docs.n8n.io/integrations/creating-nodes/)
- [n8n-nodes-starter](https://github.com/n8n-io/n8n-nodes-starter)

---

## Changelog

| Date | Modification |
|------|--------------|
| 2025-12-09 | Création du document - Analyse initiale |
| 2025-12-09 | **Refonte architecture** : MCP-First (utilisateur sans accès n8n) |
| 2025-12-09 | Ajout comparaison avec analyse MCP (`integration-multimodale-mcp-analysis.md`) |
| 2025-12-09 | Clarification des responsabilités MCP vs n8n |
| 2025-12-09 | Mise à jour questions ouvertes pour architecture MCP-First |
