# Synthèse : Intégration Multimodale Gemini
## Document Unifié MCP + n8n

> **Auteurs** : Équipe MCP + Équipe n8n-workflows
> **Date** : 2025-12-09
> **Version** : 1.0
> **Sources** :
> - `integration-multimodale-mcp-analysis.md` (Équipe MCP, v1.1)
> - `COLAB_TO_N8N_ANALYSIS.md` (Équipe n8n-workflows)

---

## Table des Matières

1. [Résumé Exécutif](#1-résumé-exécutif)
2. [Architecture Unifiée](#2-architecture-unifiée)
3. [Les 4 Domaines Multimodaux](#3-les-4-domaines-multimodaux)
4. [Spécifications Techniques](#4-spécifications-techniques)
5. [Plan d'Implémentation Consolidé](#5-plan-dimplémentation-consolidé)
6. [Questions Résolues](#6-questions-résolues)
7. [Questions Ouvertes](#7-questions-ouvertes)
8. [Annexes](#8-annexes)

---

## 1. Résumé Exécutif

### 1.1 Objectif

Intégrer les capacités multimodales de Google AI (Gemini, Veo 3) dans la plateforme MCP via n8n comme couche d'exécution backend.

### 1.2 Contrainte Architecturale Fondamentale

> **L'utilisateur n'aura JAMAIS accès direct à n8n.**

- L'utilisateur interagit uniquement via le MCP Server (Chat, API, protocole MCP)
- n8n est une couche d'exécution **invisible** et **interne**
- Les workflows n8n sont des détails d'implémentation

### 1.3 Les 4 Domaines

| Domaine | Cas d'usage principal | API Google |
|---------|----------------------|------------|
| **Video Analysis** | Transcription, identification speakers | Gemini 2.5 Flash |
| **Video Generation** | Création vidéos text/image-to-video | Veo 3.1 |
| **Image Generation** | Création images cohérentes | Gemini 2.5 Flash Image |
| **Knowledge Graph** | Extraction entités/relations | Gemini 2.5 Flash |

### 1.4 Décisions Clés Validées

| Décision | Choix |
|----------|-------|
| Point d'entrée utilisateur | MCP Server uniquement |
| Rôle de n8n | Backend d'exécution invisible |
| Gestion des presets | Côté MCP (fichiers JSON) |
| Prompt Builder | Logique Python dans wrappers MCP |
| Stockage médias | Google Cloud Storage (URLs signées) |

---

## 2. Architecture Unifiée

### 2.1 Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INTERFACE UTILISATEUR                              │
│                  (Chat, API REST, WebSocket, Protocole MCP)                  │
│                                                                              │
│   Exemples de requêtes :                                                     │
│   • "Transcris cette vidéo YouTube"                                         │
│   • "Génère une vidéo corporate de 8 secondes"                              │
│   • "Extrais les personnages de ce document"                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MCP SERVER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ CONVERSATION HANDLER                                                 │    │
│  │ • Streaming responses                                                │    │
│  │ • Lazy tool execution                                                │    │
│  │ • Progress feedback ("Génération en cours... 30%")                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ TOOL SELECTOR (Hybride 4 étapes)                                     │    │
│  │ 1. Règles keywords (< 10ms)                                          │    │
│  │ 2. NER spaCy                                                         │    │
│  │ 3. Embeddings sémantiques                                            │    │
│  │ 4. Filtrage permissions                                              │    │
│  │                                                                       │    │
│  │ Domaines existants : contacts, calendar, drive, gmail, notion, ...   │    │
│  │ NOUVEAUX : video_analysis, video_generation, image_generation,       │    │
│  │            knowledge_graph                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ TOOL WRAPPERS (Python)                                               │    │
│  │                                                                       │    │
│  │ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐         │    │
│  │ │VideoAnalysisTool│ │VideoGenTool     │ │ImageGenTool     │         │    │
│  │ │• transcribe     │ │• generate_text  │ │• generate       │         │    │
│  │ │• identify_speak │ │• generate_image │ │• extract_char   │         │    │
│  │ │• extract_ocr    │ │• optimize_prompt│ │• compose_scene  │         │    │
│  │ └─────────────────┘ └─────────────────┘ └─────────────────┘         │    │
│  │                                                                       │    │
│  │ ┌─────────────────┐ ┌─────────────────────────────────────┐         │    │
│  │ │KnowledgeGraphTool│ │ PRESETS (JSON)                      │         │    │
│  │ │• extract_entities│ │ • corporate_video                   │         │    │
│  │ │• extract_rels   │ │ • social_short                       │         │    │
│  │ │• build_graph    │ │ • product_demo                       │         │    │
│  │ └─────────────────┘ └─────────────────────────────────────┘         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP POST (async, invisible)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        N8N (Backend d'Exécution)                             │
│                      ⚠️ INVISIBLE POUR L'UTILISATEUR                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WEBHOOKS INTERNES (jamais exposés)                                         │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │ /webhook/video-analyze                                              │     │
│  │   → HTTP Request (Gemini API) → Parse JSON → Return transcripts    │     │
│  ├────────────────────────────────────────────────────────────────────┤     │
│  │ /webhook/video-generate                                             │     │
│  │   → HTTP Request (Veo 3 API) → Poll status → Upload GCS → URL      │     │
│  ├────────────────────────────────────────────────────────────────────┤     │
│  │ /webhook/image-generate                                             │     │
│  │   → HTTP Request (Gemini Image) → Upload GCS → URLs                │     │
│  ├────────────────────────────────────────────────────────────────────┤     │
│  │ /webhook/knowledge-extract                                          │     │
│  │   → HTTP Request (Gemini) → Parse entities → JSON graph            │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  CUSTOM NODES (optionnel, simplification interne)                           │
│  └── n8n-nodes-google-genai-core (si besoin)                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GOOGLE CLOUD APIs                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Vertex AI (Gemini 2.5 Flash, Gemini 2.5 Flash Image)                     │
│  • Veo 3.1 API (video generation)                                           │
│  • Google Cloud Storage (stockage médias)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Flux de Données Type

```
UTILISATEUR: "Génère une vidéo corporate de 8 secondes montrant un robot"
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. MCP Server reçoit la requête                                  │
│ 2. Tool Selector détecte: domain="video_generation"             │
│    • keyword match: "génère", "vidéo", "8 secondes"             │
│ 3. VideoGenerationTool sélectionné                              │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Wrapper applique le preset "corporate"                        │
│    • style: "Futuriste professionnel, corporate tech"           │
│    • camera: "Travellings doux"                                  │
│    • duration: 8 (overridé par utilisateur)                     │
│ 5. Prompt Builder enrichit la requête                           │
│ 6. Validation des paramètres                                     │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Appel webhook n8n: POST /webhook/video-generate              │
│    Payload: {                                                    │
│      "operation": "generate_from_text",                         │
│      "prompt": "A cinematic corporate tech video...",           │
│      "config": { "duration": 8, "aspect_ratio": "16:9", ... }   │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. n8n exécute le workflow:                                      │
│    • POST Veo 3.1 API → operation_id                            │
│    • Poll /operations/{id} toutes les 5s                        │
│    • status=DONE → Download video                               │
│    • Upload to GCS → Signed URL                                 │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. MCP Server reçoit la réponse                                  │
│ 10. Streaming du résultat à l'utilisateur                       │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
UTILISATEUR: Reçoit l'URL de la vidéo générée
             "Voici votre vidéo: https://storage.googleapis.com/..."
```

---

## 3. Les 4 Domaines Multimodaux

### 3.1 Video Analysis (Transcription Multimodale)

**Source Colab** : `multimodal_video_transcription.ipynb`

#### Capacités

| Fonctionnalité | Description |
|----------------|-------------|
| **Transcription** | Audio → Texte avec timestamps (MM:SS) |
| **Speaker Diarization** | Identification des locuteurs |
| **OCR Visuel** | Extraction du texte affiché à l'écran |
| **Analyse Scène** | Détection de personnes, objets |

#### Opérations MCP

```python
class VideoAnalysisTool(N8NTool):
    domain = "video_analysis"
    operations = [
        "transcribe",           # Transcription basique
        "identify_speakers",    # Transcription + diarization
        "extract_text_ocr",     # OCR du texte visible
        "analyze_scene"         # Analyse complète
    ]
```

#### Format de Sortie

```json
{
  "transcripts": [
    {"start": "00:15", "end": "00:22", "speaker": "Alice", "text": "Bonjour à tous"},
    {"start": "00:23", "end": "00:30", "speaker": "Bob", "text": "Merci Alice"}
  ],
  "speakers": [
    {"id": "speaker_1", "name": "Alice", "speaking_time": 45},
    {"id": "speaker_2", "name": "Bob", "speaking_time": 32}
  ],
  "visual_text": [
    {"timestamp": "00:15", "text": "Présentation Q4 2024", "position": "top-center"}
  ]
}
```

#### Keywords Tool Selector

```python
"video_analysis": [
    r"\b(transcri|sous-titr|speaker|intervenants?|vidéo|youtube|mp4)\b",
    r"\b(analyser?\s+vidéo|qui\s+parle|extraire\s+audio)\b",
]
```

---

### 3.2 Video Generation (Veo 3)

**Source Colab** : `veo3_video_generation.ipynb`

#### Capacités

| Fonctionnalité | Description |
|----------------|-------------|
| **Text-to-Video** | Prompt → Vidéo HD avec audio |
| **Image-to-Video** | Image statique → Animation |
| **Audio intégré** | Dialogue et effets sonores générés |
| **Prompt Enhancement** | Optimisation automatique via Gemini |

#### Opérations MCP

```python
class VideoGenerationTool(N8NTool):
    domain = "video_generation"
    operations = [
        "generate_from_text",   # Prompt → Vidéo
        "generate_from_image",  # Image + Prompt → Vidéo
        "optimize_prompt"       # Amélioration du prompt via Gemini
    ]
```

#### Paramètres Disponibles

| Paramètre | Type | Valeurs | Default |
|-----------|------|---------|---------|
| `prompt` | string | - | required |
| `preset` | enum | corporate, social_short, product_demo, cinematic | corporate |
| `duration` | int | 4, 6, 8 | 6 |
| `aspect_ratio` | string | 16:9, 9:16 | 16:9 |
| `resolution` | string | 1080p, 720p | 1080p |
| `generate_audio` | bool | true/false | true |
| `enhance_prompt` | bool | true/false | true |
| `model` | string | veo-3.1-generate-001, veo-3.1-fast-generate-001 | veo-3.1-generate-001 |

#### Presets Intégrés

```json
{
  "corporate": {
    "style": "Futuriste professionnel, corporate tech",
    "camera_movement": "Travellings doux, panoramiques",
    "lens_effects": "Glow, profondeur de champ",
    "duration": 6,
    "aspect_ratio": "16:9"
  },
  "social_short": {
    "style": "Vibrant and saturated, fast-paced",
    "duration": 4,
    "aspect_ratio": "9:16"
  },
  "product_demo": {
    "style": "Photorealistic, clean",
    "camera_angle": "Close-Up",
    "duration": 8
  }
}
```

#### Keywords Tool Selector

```python
"video_generation": [
    r"\b(génér|créer?|produi)\w*\s+(vidéo|clip|animation)\b",
    r"\b(veo|text-to-video|animer?\s+image)\b",
]
```

---

### 3.3 Image Generation (Nano Banana)

**Source Colab** : `consistent_imagery_generation.ipynb`

#### Capacités

| Fonctionnalité | Description |
|----------------|-------------|
| **Génération** | Prompt → Image |
| **Extraction** | Isoler un personnage d'une image |
| **Character Sheet** | Créer vues front/back d'un personnage |
| **Scènes Cohérentes** | Générer plusieurs scènes avec le même personnage |

#### Opérations MCP

```python
class ImageGenerationTool(N8NTool):
    domain = "image_generation"
    operations = [
        "generate",                # Prompt → Image
        "extract_character",       # Image → Personnage isolé
        "create_character_sheet",  # Image → Vues multiples
        "compose_scene"            # References + Prompt → Scène
    ]
```

#### Paramètres Disponibles

| Paramètre | Type | Valeurs | Default |
|-----------|------|---------|---------|
| `prompt` | string | - | required |
| `source_images` | array[binary] | 0-4 images | [] |
| `aspect_ratio` | string | 1:1, 16:9, 9:16, 2:3, 3:2, etc. | 16:9 |
| `output_format` | string | png, webp | png |

#### Keywords Tool Selector

```python
"image_generation": [
    r"\b(génér|créer?)\w*\s+(image|illustration|visuel)\b",
    r"\b(personnage|character\s+sheet|séquence\s+visuelle)\b",
]
```

---

### 3.4 Knowledge Graph (Extraction)

**Source Colab** : `knowledge_graph_generation.ipynb`

#### Capacités

| Fonctionnalité | Description |
|----------------|-------------|
| **Extraction Entités** | Identifier personnages, lieux, organisations |
| **Extraction Relations** | Déterminer les liens entre entités |
| **Construction Graphe** | Créer un graphe NetworkX |
| **Visualisation** | Générer une image du graphe |

#### Opérations MCP

```python
class KnowledgeGraphTool(N8NTool):
    domain = "knowledge_graph"
    operations = [
        "extract_entities",       # Texte → Liste entités
        "extract_relationships",  # Texte → Relations
        "build_graph",           # Texte → Graphe complet
        "visualize"              # Graphe → Image
    ]
```

#### Format de Sortie

```json
{
  "entities": [
    {"id": 0, "name": "Jean Valjean", "type": "character"},
    {"id": 1, "name": "Cosette", "type": "character"},
    {"id": 2, "name": "Paris", "type": "location"}
  ],
  "relationships": [
    {"source": 0, "target": 1, "links": ["father_of", "protector_of"]},
    {"source": 0, "target": 2, "links": ["lives_in"]}
  ]
}
```

#### Keywords Tool Selector

```python
"knowledge_graph": [
    r"\b(graphe|knowledge\s+graph|entités?|relations?)\b",
    r"\b(extraire\s+personnages?|réseau\s+social|communautés?)\b",
]
```

---

## 4. Spécifications Techniques

### 4.1 Authentification

| Service | Méthode | Configuration |
|---------|---------|---------------|
| Gemini API | Service Account Vertex AI | `VERTEX_PROJECT_ID`, `VERTEX_LOCATION` |
| Veo 3 | Service Account Vertex AI | Même credentials |
| GCS | Service Account | Rôle `Storage Admin` |

### 4.2 Variables d'Environnement

```bash
# Google Cloud
VERTEX_PROJECT_ID=your-project-id
VERTEX_LOCATION=us-central1
GCS_BUCKET_NAME=media-generated

# API Keys (alternative)
GEMINI_API_KEY=your-api-key

# Timeouts
N8N_WEBHOOK_TIMEOUT_VIDEO=300      # 5 minutes pour Veo 3
N8N_WEBHOOK_TIMEOUT_DEFAULT=120    # 2 minutes standard
```

### 4.3 Gestion des Opérations Longues (Veo 3)

Veo 3 prend 1-3 minutes pour générer une vidéo. Stratégie :

```
1. MCP → n8n: POST /webhook/video-generate
2. n8n → Veo API: POST /generate → operation_id
3. n8n: Polling GET /operations/{id} toutes les 5s
4. Quand status=DONE:
   - Download vidéo
   - Upload vers GCS
   - Générer URL signée
5. n8n → MCP: Retourner URL
6. MCP → Utilisateur: "Voici votre vidéo: [URL]"

Pendant ce temps, MCP peut streamer des messages de progression :
"Génération en cours... 30%"
"Génération en cours... 60%"
"Finalisation..."
```

### 4.4 Stockage des Médias (GCS)

```
gs://media-generated/
├── videos/
│   ├── generated/
│   │   └── {user_id}/{timestamp}_{request_id}.mp4
│   └── analyzed/
│       └── {user_id}/{video_id}_metadata.json
├── images/
│   ├── generated/
│   │   └── {user_id}/{timestamp}_{request_id}.png
│   └── assets/
│       └── {user_id}/character_sheets/
└── graphs/
    └── json/
        └── {user_id}/{document_id}_graph.json
```

**Politique de rétention** : À définir (suggestion : 30 jours par défaut)

### 4.5 Coûts Estimés

| Service | Coût | Usage |
|---------|------|-------|
| Gemini 2.5 Flash | ~$0.075/1M tokens input | Transcription, extraction |
| Gemini 2.0 Flash | ~$0.05/1M tokens | Alternative économique |
| Gemini Flash Image | ~$0.02/image | Génération images |
| Veo 3.1 | ~$0.20/vidéo 8s | Génération vidéos |
| GCS Storage | ~$0.02/GB/mois | Stockage |

---

## 5. Plan d'Implémentation Consolidé

### Phase 1 : Infrastructure (1 semaine)

| Tâche | Responsable | Statut |
|-------|-------------|--------|
| Configurer Service Account Vertex AI | DevOps | ⬜ |
| Créer bucket GCS `media-generated` | DevOps | ⬜ |
| Valider connectivité MCP ↔ n8n ↔ APIs Google | MCP + n8n | ⬜ |
| Définir variables d'environnement | DevOps | ⬜ |

### Phase 2 : Tool Wrappers MCP (2 semaines)

| Tâche | Responsable | Statut |
|-------|-------------|--------|
| Implémenter `VideoAnalysisTool` | MCP | ⬜ |
| Implémenter `VideoGenerationTool` | MCP | ⬜ |
| Implémenter `ImageGenerationTool` | MCP | ⬜ |
| Implémenter `KnowledgeGraphTool` | MCP | ⬜ |
| Créer fichiers presets JSON | MCP | ⬜ |
| Implémenter Prompt Builder | MCP | ⬜ |
| Mettre à jour `ToolRegistry` | MCP | ⬜ |

### Phase 3 : Tool Selector (1 semaine)

| Tâche | Responsable | Statut |
|-------|-------------|--------|
| Ajouter keywords pour 4 domaines | MCP | ⬜ |
| Générer embeddings descriptions | MCP | ⬜ |
| Tests sélection hybride | MCP | ⬜ |

### Phase 4 : Workflows n8n (2 semaines)

| Tâche | Responsable | Statut |
|-------|-------------|--------|
| Créer workflow `video-analyze` | n8n | ⬜ |
| Créer workflow `video-generate` (avec polling) | n8n | ⬜ |
| Créer workflow `image-generate` | n8n | ⬜ |
| Créer workflow `knowledge-extract` | n8n | ⬜ |
| Tests intégration webhooks | n8n | ⬜ |

### Phase 5 : Tests et Documentation (1 semaine)

| Tâche | Responsable | Statut |
|-------|-------------|--------|
| Tests unitaires wrappers | MCP | ⬜ |
| Tests end-to-end | MCP + n8n | ⬜ |
| Documentation API | MCP | ⬜ |
| Exemples de prompts | MCP | ⬜ |

### Timeline Totale : ~7 semaines

```
Semaine 1        : Phase 1 (Infrastructure)
Semaines 2-3     : Phase 2 (Wrappers MCP)
Semaine 4        : Phase 3 (Tool Selector)
Semaines 5-6     : Phase 4 (Workflows n8n)
Semaine 7        : Phase 5 (Tests & Doc)
```

---

## 6. Questions Résolues

| Question | Décision | Justification |
|----------|----------|---------------|
| **Accès utilisateur à n8n ?** | Non | Simplicité UX, sécurité |
| **Où sont les presets ?** | MCP (JSON) | Cohérent avec architecture MCP-first |
| **Où est le Prompt Builder ?** | Wrapper MCP Python | Logique métier dans MCP |
| **Format de sortie médias ?** | URLs signées GCS | Pas de transfert binaire via MCP |
| **Custom nodes n8n ?** | Optionnels | Simplification interne, pas exposés |
| **Gestion async Veo 3 ?** | Polling interne, progress streaming | UX fluide |

---

## 7. Questions Ouvertes

### 7.1 À Décider

| Question | Options | Impact |
|----------|---------|--------|
| **Rétention médias GCS** | 7j / 30j / 90j / illimité | Coûts, conformité |
| **Quotas par utilisateur** | Aucun / X générations/jour | Coûts, fair use |
| **Confirmation pour Veo 3** | Toujours / Si coût > X | UX, prévention erreurs |
| **Formats vidéo sortie** | MP4 uniquement / MP4+WebM | Compatibilité |

### 7.2 Questions Techniques

1. **Streaming progress** : Comment informer l'utilisateur pendant les 1-3 minutes de génération Veo 3 ?
   - Option A : Messages périodiques ("30%... 60%...")
   - Option B : Indicateur générique ("Génération en cours...")

2. **Erreurs user-friendly** : Mapping des erreurs techniques ?
   - `QUOTA_EXCEEDED` → "Vous avez atteint votre limite de générations aujourd'hui"
   - `CONTENT_FILTERED` → "Le contenu demandé ne peut pas être généré"

3. **Multi-step workflows** : Chaîner des opérations ?
   - Ex : "Génère une vidéo, puis transcris-la, puis extrais un graphe"
   - Solution : Orchestrateur LangGraph existant

### 7.3 Questions Business

1. **Facturation** : Les coûts API sont-ils refacturés aux utilisateurs ?
2. **Audit** : Faut-il logger toutes les générations pour compliance ?
3. **Modération** : Faut-il valider le contenu généré avant de le retourner ?

---

## 8. Annexes

### 8.1 Structure des Fichiers

```
# MCP Server
src/mcp_server/
├── tools/n8n/
│   ├── base.py                  # existant
│   ├── registry.py              # ajouter 4 tools
│   ├── video_analysis.py        # NOUVEAU
│   ├── video_generation.py      # NOUVEAU
│   ├── image_generation.py      # NOUVEAU
│   └── knowledge_graph.py       # NOUVEAU
├── tool_selector/
│   └── rules.py                 # ajouter keywords
├── config/
│   └── presets/
│       ├── veo-presets.json
│       ├── image-presets.json
│       └── graph-presets.json
└── utils/
    └── prompt_builder.py        # NOUVEAU

# n8n Workflows
workflows/mcp/
├── video-analyze-workflow.json
├── video-generate-workflow.json
├── image-generate-workflow.json
└── knowledge-extract-workflow.json

# Custom Nodes (optionnel)
custom-nodes/
└── n8n-nodes-google-genai-core/  # si nécessaire
```

### 8.2 Références

#### Documents Source

- `docs/gemini/integration-multimodale-mcp-analysis.md` - Analyse équipe MCP
- `docs/gemini/COLAB_TO_N8N_ANALYSIS.md` - Analyse équipe n8n
- `docs/colab/*.ipynb` - Notebooks Google originaux

#### Documentation Externe

- [Google Gen AI SDK](https://pypi.org/project/google-genai)
- [Veo 3 Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/video/veo)
- [Gemini API](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models)
- [n8n Creating Nodes](https://docs.n8n.io/integrations/creating-nodes/)

### 8.3 Glossaire

| Terme | Définition |
|-------|------------|
| **MCP** | Model Context Protocol - Serveur d'orchestration des outils |
| **Tool Selector** | Module de routing NLP qui sélectionne le bon outil |
| **Tool Wrapper** | Classe Python qui encapsule l'appel à un webhook n8n |
| **Preset** | Configuration prédéfinie pour un type de génération |
| **Veo 3** | Modèle Google de génération vidéo |
| **Nano Banana** | Surnom de Gemini 2.5 Flash Image |
| **Diarization** | Identification des locuteurs dans un audio |

---

## Changelog

| Date | Version | Modification |
|------|---------|--------------|
| 2025-12-09 | 1.0 | Création - Synthèse des analyses MCP et n8n |

---

*Document de synthèse créé à partir des analyses des équipes MCP et n8n-workflows.*
*Architecture validée : MCP-First avec n8n comme backend d'exécution invisible.*
