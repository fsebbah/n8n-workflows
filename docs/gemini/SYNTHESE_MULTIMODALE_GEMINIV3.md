# Synthèse : Intégration Multimodale Gemini
## Document Unifié MCP + n8n

> **Auteurs** : Équipe MCP + Équipe n8n-workflows
> **Date** : 2025-12-09
> **Version** : 3.0
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
| **Custom nodes n8n ?** | **Oui - Recommandés** | Solution propre, maintenable, réutilisable |
| **Gestion async Veo 3 ?** | Polling interne, progress streaming | UX fluide |

---

## 7. Questions et Réponses (Q&A)

### 7.1 Questions Stratégiques

#### Q1 : Priorité des domaines d'implémentation ?

| Réponse | À décider entre les équipes MCP et n8n |
|---------|----------------------------------------|

**Recommandation** : Commencer par Video Analysis (transcription) car :
- Analyse de contenu existant = moins risqué
- Coût plus faible que la génération
- Valeur immédiate pour les utilisateurs

#### Q2 : Sources vidéo supportées ?

| Source | Supporté | Notes |
|--------|----------|-------|
| **YouTube** | ✅ Oui | Pas de téléchargement, utilisation directe URL |
| **Upload fichier** | ✅ Oui | Taille max et stockage temporaire à définir avec équipe backend API |
| **Google Drive** | ✅ Oui | Si l'utilisateur a un accès au fichier |
| **Autres URLs** | ✅ Oui | A priori toutes sources sauf contraintes techniques |

#### Q3 : Langues supportées ?

| Aspect | Réponse |
|--------|---------|
| **Interface utilisateur** | Français (à ce jour) |
| **Tool Selector keywords** | Multilingue (français + autres langues à ajouter) |
| **Presets Veo 3** | Multilingue possible |
| **Knowledge Graph** | 25+ langues (capacité Gemini native) |

### 7.2 Questions Techniques

#### Q4 : Modèle d'authentification et isolation des données ?

| Aspect | Réponse |
|--------|---------|
| **Identification utilisateur** | À définir avec équipe backend |
| **Méthode d'auth** | Token MCP (comme pour les services Google existants) |
| **Isolation des données** | Oui, médias privés par utilisateur |
| **Chemins GCS** | `{user_id}/...` pour isolation |

#### Q5 : Durée des URLs signées et re-téléchargement ?

**Qu'est-ce qu'une URL signée ?**
Une URL signée est une URL temporaire qui donne accès à un fichier privé sur GCS pendant une durée limitée. Elle contient une signature cryptographique qui expire.

```
URL signée (exemple) :
https://storage.googleapis.com/bucket/video.mp4?X-Goog-Signature=...&X-Goog-Expires=...
✅ Accès autorisé pendant 24h, puis expire
```

| Aspect | Réponse |
|--------|---------|
| **Durée URLs signées** | **24 heures** |
| **Re-téléchargement** | Oui, si l'utilisateur a activé son espace de stockage |
| **Historique** | Géré côté API backend si espace stockage activé |
| **Après expiration** | L'utilisateur doit redemander une nouvelle URL (si fichier encore présent) |

#### Q6 : Stratégie de fallback en cas d'échec ?

| Aspect | Réponse |
|--------|---------|
| **Erreur sèche ?** | Non, message user-friendly selon le type d'erreur |
| **Alternative automatique ?** | Non, mais avertissement préalable sur les coûts/délais |
| **Mode d'exécution** | Batch (l'utilisateur est prévenu avant) |

**Mapping erreurs proposé** :

| Code Technique | Message User-Friendly |
|----------------|----------------------|
| `QUOTA_EXCEEDED` | "Limite de générations atteinte. Réessayez demain." |
| `CONTENT_FILTERED` | "Ce contenu ne peut pas être généré (politique de sécurité)." |
| `TIMEOUT` | "La génération a pris trop de temps. Réessayez." |
| `INVALID_INPUT` | "Le fichier fourni n'est pas supporté." |

### 7.3 Points d'Attention

#### Q7 : Coûts cachés ?

**Point critique** : Le coût réel doit inclure :
- Prompt Enhancement (Gemini) à chaque génération Veo 3
- Polling Veo 3 (12-36 appels API sur 1-3 min)
- Stockage GCS

**Action** : Calculer le coût total réel par opération type.

#### Q8 : Modération du contenu généré ?

| Réponse | **OUI - Point très important** |
|---------|--------------------------------|

**Actions requises** :
- Activer les filtres Google natifs (`person_generation: dont_allow` si nécessaire)
- Ajouter une couche de modération côté MCP
- Définir une politique de contenu acceptable

#### Q9 : Déduplication / cache ?

| Aspect | Réponse |
|--------|---------|
| **Duplication détectée ?** | Non automatiquement |
| **Coût doublé ?** | Oui, facturé à l'utilisateur |
| **Avertissement ?** | Oui, possibilité d'avertir l'utilisateur |
| **Cache recommandé ?** | À évaluer (complexité vs économies) |

### 7.4 Suggestions d'Amélioration

#### Q10 : Preview avant génération Veo 3 ?

| Aspect | Réponse | Clarification |
|--------|---------|---------------|
| **Thumbnail preview rapide ?** | À investiguer | Veo 3 ne semble pas proposer de mode preview natif |
| **Confirmation utilisateur ?** | Optionnel | Permet d'éviter les erreurs de prompt coûteuses |

**Clarification sur la confirmation** : Utile pour :
- Valider le prompt enrichi avant génération
- Confirmer les paramètres (durée, style, etc.)
- Éviter les générations accidentelles (coût ~$0.20/vidéo)

#### Q11 : Batch processing ?

| Réponse | **Oui, optimiser le batch** |
|---------|----------------------------|

**Stratégie recommandée** :
- Paralléliser les appels indépendants
- Regrouper les uploads GCS
- Progress feedback global ("3/5 images générées...")

#### Q12 : Historique utilisateur ?

| Fonctionnalité | Réponse |
|----------------|---------|
| **Voir générations passées** | Oui, côté API backend |
| **Régénérer avec mêmes paramètres** | Oui, si historique activé |
| **Supprimer ses médias** | Oui |
| **Condition** | Espace de stockage activé par l'utilisateur |

### 7.5 Questions Résolues (Compléments)

#### Rétention médias GCS

**Qu'est-ce que la rétention ?**
C'est la durée pendant laquelle les fichiers générés sont conservés sur GCS avant suppression automatique.

| Type d'utilisateur | Rétention | Justification |
|--------------------|-----------|---------------|
| **Sans espace stockage** | **7 jours** | Fichiers temporaires, l'utilisateur doit télécharger rapidement |
| **Avec espace stockage** | Selon son forfait | Fichiers persistants, gérés par l'API backend |

#### Quotas et Protection Anti-Abus

| Aspect | Décision |
|--------|----------|
| **Quota artificiel** | Non - facturation directe à l'utilisateur |
| **Plafond de sécurité backend** | Non nécessaire |
| **Protection anti-double-clic** | **Oui - côté Frontend** |
| **Surveillance logs** | Oui - pour détecter les bugs/abus |

**Responsabilités** :

| Scénario | Responsable | Action |
|----------|-------------|--------|
| Bug backend qui génère N fois | Nous | Surveillance logs, remboursement |
| Utilisateur clique 10 fois | Frontend | Empêcher les clics multiples (debounce, disable button) |
| Script malveillant | Nous | Rate limiting API, détection d'anomalies |

**Recommandations Frontend** :
- Désactiver le bouton après clic jusqu'à réponse
- Afficher un loader/spinner pendant la génération
- Confirmation avant opérations coûteuses (Veo 3)

### 7.6 Questions Backend Résolues (2025-12-09)

#### Q13 : Transmission User/Tenant ID

| Aspect | Réponse |
|--------|---------|
| **Méthode** | Headers HTTP `X-User-ID` / `X-Tenant-ID` |
| **Qui extrait ?** | MCP décode le JWT et transmet les headers |
| **Pourquoi ?** | Backend n'a pas besoin de logique JWT, simplifie les tests |

```
MCP Server:
1. Reçoit JWT utilisateur
2. Décode et valide
3. Extrait user_id, tenant_id
4. Transmet aux requêtes backend via headers:
   X-User-ID: user_abc123
   X-Tenant-ID: tenant_xyz789
```

#### Q14 : Upload - Qui gère ?

| Aspect | Réponse |
|--------|---------|
| **Responsable** | MCP Server |
| **Flux** | Client → MCP → GCS (streaming) |
| **Backend reçoit** | Uniquement les metadata (path GCS, user_id, mime_type) |

```
1. Client → MCP : POST /api/v1/files/upload (multipart)
2. MCP valide auth + tenant
3. MCP → GCS : Upload direct (streaming)
4. MCP → Backend : Notifie metadata
5. MCP → Client : Retourne { gcs_url, signed_url }
```

**Pourquoi MCP et pas Backend ?**
- MCP a déjà l'auth utilisateur
- Évite un double hop (Client → Backend → MCP → GCS)
- Le Backend n'a pas besoin des fichiers, juste des URLs GCS

#### Q15 : Régénération URL signée

| Aspect | Réponse |
|--------|---------|
| **Endpoint** | `GET /api/v1/files/{file_id}/signed-url` |
| **Responsable** | MCP (si MCP gère l'upload) |
| **Durée** | Nouvelle URL valide 24h |

```json
// Réponse
{
  "signed_url": "https://storage.googleapis.com/...",
  "expires_at": "2024-12-11T19:00:00Z"
}
```

**Logique** :
- Le `file_id` est stocké avec le path GCS
- Régénération instantanée (pas d'accès au fichier)
- Possibilité de rate limiting

#### Q16 : Fallback Polling (avec Celery)

| Aspect | Réponse |
|--------|---------|
| **Endpoint** | `GET /api/v1/operations/{task_id}/status` |
| **Backend** | Celery (déjà en place) |
| **Obligatoire** | OUI |

**Mapping statuts Celery → Client** :

| Celery | Client | Description |
|--------|--------|-------------|
| `PENDING` | `pending` | Tâche en attente |
| `STARTED` | `processing` | En cours d'exécution |
| `PROGRESS` | `processing` | En cours avec % progression |
| `SUCCESS` | `completed` | Terminé avec succès |
| `FAILURE` | `failed` | Échec |
| `RETRY` | `processing` | Retry en cours |

**Implémentation Backend** :

```python
from celery.result import AsyncResult

@router.get("/api/v1/operations/{task_id}/status")
def get_task_status(task_id: str):
    result = AsyncResult(task_id)

    response = {
        "task_id": task_id,
        "status": result.status,  # PENDING, STARTED, SUCCESS, FAILURE, RETRY
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

**Pour la progression (optionnel mais utile pour Veo)** :

```python
# Dans la tâche Celery
@celery_app.task(bind=True)
def generate_video(self, prompt: str, ...):
    self.update_state(state="PROGRESS", meta={"progress": 25})
    # ... appel n8n/Veo ...
    self.update_state(state="PROGRESS", meta={"progress": 75})
    # ...
    return {"video_url": "..."}
```

**Avantages Celery** :
- État déjà persisté (Redis/RabbitMQ backend)
- Pas besoin de gérer le stockage manuellement
- `task_id` = `correlation_id` naturellement

---

### 7.7 Questions Encore Ouvertes

| Question | Options | Responsable |
|----------|---------|-------------|
| **Taille max upload vidéo** | 100MB / 500MB / 1GB | Équipe backend |

### 7.8 Questions Business

| Question | Réponse |
|----------|---------|
| **Facturation** | Coûts refacturés à l'utilisateur (sa facturation) |
| **Audit** | À définir (recommandé pour compliance) |
| **Modération** | Oui, filtres Google + couche MCP |

---

## 8. Custom Nodes n8n - Stratégie d'Implémentation

### 8.1 Décision : Custom Nodes vs HTTP Request

| Critère | HTTP Request | Custom Node | Choix |
|---------|--------------|-------------|-------|
| **Rapidité de dev** | ✅ Rapide | ❌ Plus long | - |
| **Maintenabilité** | ❌ Logique dispersée | ✅ Encapsulée | ✅ Custom |
| **Réutilisabilité** | ❌ Copier/coller | ✅ Un node partout | ✅ Custom |
| **Testabilité** | ❌ Difficile | ✅ Tests unitaires | ✅ Custom |
| **Credentials** | ⚠️ Gérer manuellement | ✅ Intégré | ✅ Custom |
| **Évolution** | ⚠️ Modifier chaque workflow | ✅ Mettre à jour le node | ✅ Custom |

**Décision finale** : **Custom Nodes** pour une solution propre, maintenable et réutilisable.

### 8.2 Liste des Custom Nodes à Créer

#### Ordre de Priorité (Simple → Complexe)

| # | Node | Complexité | Dépendances | Justification |
|---|------|------------|-------------|---------------|
| 1 | **n8n-nodes-google-genai-core** | ⭐ Simple | Aucune | Base partagée (credentials, client) |
| 2 | **n8n-nodes-knowledge-graph** | ⭐⭐ Moyen | Core | API simple, pas d'async, JSON in/out |
| 3 | **n8n-nodes-video-transcription** | ⭐⭐ Moyen | Core | API simple, pas de polling long |
| 4 | **n8n-nodes-gemini-image** | ⭐⭐⭐ Moyen+ | Core | Gestion binaires, multiple outputs |
| 5 | **n8n-nodes-veo-video** | ⭐⭐⭐⭐ Complexe | Core | Polling long (1-3min), presets, GCS |

---

### 8.3 Détail par Node

#### Node 1 : n8n-nodes-google-genai-core (Priorité 1)

**Rôle** : Package partagé contenant les credentials et utilitaires communs.

```
n8n-nodes-google-genai-core/
├── package.json
├── credentials/
│   └── GoogleVertexAiApi.credentials.ts
├── shared/
│   ├── GenAiClient.ts           # Client wrapper Vertex AI
│   ├── GcsUploader.ts           # Upload vers GCS
│   ├── PollingHelper.ts         # Gestion polling async
│   └── types.ts                 # Types partagés
└── index.ts
```

**Complexité** : ⭐ Simple
- Pas de logique métier
- Configuration credentials
- Client HTTP basique

**Livrable** : Credentials fonctionnels dans n8n

---

#### Node 2 : n8n-nodes-knowledge-graph (Priorité 2)

**Rôle** : Extraction d'entités et relations depuis du texte.

```
n8n-nodes-knowledge-graph/
├── package.json
├── nodes/
│   └── KnowledgeGraph/
│       ├── KnowledgeGraph.node.ts
│       └── operations/
│           ├── extractEntities.ts
│           ├── extractRelationships.ts
│           └── buildGraph.ts
└── README.md
```

**Opérations** :
| Opération | Input | Output |
|-----------|-------|--------|
| `extract_entities` | Texte | JSON (entités) |
| `extract_relationships` | Texte | JSON (relations) |
| `build_graph` | Texte | JSON (graphe complet) |

**Complexité** : ⭐⭐ Moyen
- API Gemini simple (text → JSON)
- Pas de polling
- Pas de binaires
- Schema JSON structuré (Pydantic-like)

**Pourquoi en priorité 2** : Le plus simple des 4 domaines fonctionnels. Permet de valider l'architecture avant d'attaquer les médias.

---

#### Node 3 : n8n-nodes-video-transcription (Priorité 3)

**Rôle** : Transcription et analyse de vidéos existantes.

```
n8n-nodes-video-transcription/
├── package.json
├── nodes/
│   └── VideoTranscription/
│       ├── VideoTranscription.node.ts
│       └── operations/
│           ├── transcribe.ts
│           ├── identifySpeakers.ts
│           └── extractOcr.ts
└── README.md
```

**Opérations** :
| Opération | Input | Output |
|-----------|-------|--------|
| `transcribe` | URL vidéo | JSON (transcripts + timestamps) |
| `identify_speakers` | URL vidéo | JSON (transcripts + speakers) |
| `extract_ocr` | URL vidéo | JSON (texte visible) |

**Complexité** : ⭐⭐ Moyen
- Input URL (pas de binaire à gérer)
- API Gemini avec vidéo (multimodal)
- Réponse rapide (pas de polling long)
- Support YouTube natif

**Pourquoi en priorité 3** : Analyse de contenu existant = moins risqué que génération. Valide la gestion multimodale.

---

#### Node 4 : n8n-nodes-gemini-image (Priorité 4)

**Rôle** : Génération et manipulation d'images.

```
n8n-nodes-gemini-image/
├── package.json
├── nodes/
│   └── GeminiImage/
│       ├── GeminiImage.node.ts
│       └── operations/
│           ├── generate.ts
│           ├── extractCharacter.ts
│           ├── createCharacterSheet.ts
│           └── composeScene.ts
└── README.md
```

**Opérations** :
| Opération | Input | Output |
|-----------|-------|--------|
| `generate` | Prompt | Image (binary) + URL GCS |
| `extract_character` | Image | Image (personnage isolé) |
| `create_character_sheet` | Image | Images (front/back views) |
| `compose_scene` | Images + Prompt | Image (scène cohérente) |

**Complexité** : ⭐⭐⭐ Moyen+
- Gestion binaires (images in/out)
- Multiple outputs possibles
- Upload GCS
- Références entre images (character consistency)

**Pourquoi en priorité 4** : Introduit la gestion des binaires et GCS, préparation pour Veo.

---

#### Node 5 : n8n-nodes-veo-video (Priorité 5)

**Rôle** : Génération de vidéos avec Veo 3.

```
n8n-nodes-veo-video/
├── package.json
├── nodes/
│   └── VeoVideo/
│       ├── VeoVideo.node.ts
│       └── operations/
│           ├── generateFromText.ts
│           ├── generateFromImage.ts
│           └── optimizePrompt.ts
├── presets/
│   └── veo-presets.json
└── README.md
```

**Opérations** :
| Opération | Input | Output |
|-----------|-------|--------|
| `generate_from_text` | Prompt + Config | Vidéo (URL GCS) |
| `generate_from_image` | Image + Prompt | Vidéo (URL GCS) |
| `optimize_prompt` | Prompt brut | Prompt optimisé |

**Paramètres** :
- `prompt` (required)
- `preset` : corporate, social_short, product_demo, cinematic
- `duration` : 4, 6, 8
- `aspect_ratio` : 16:9, 9:16
- `resolution` : 1080p, 720p
- `generate_audio` : true/false
- `enhance_prompt` : true/false

**Complexité** : ⭐⭐⭐⭐ Complexe
- Polling long (1-3 minutes)
- Long-running operations API
- Presets à appliquer
- Prompt enhancement via Gemini
- Upload GCS obligatoire
- Gestion timeout

**Pourquoi en priorité 5** : Le plus complexe. Nécessite toutes les briques précédentes.

---

### 8.4 Architecture des Packages

```
custom-nodes/
├── n8n-nodes-google-genai-core/     # Priorité 1 - Base partagée
│   ├── package.json
│   ├── credentials/
│   │   └── GoogleVertexAiApi.credentials.ts
│   ├── shared/
│   │   ├── GenAiClient.ts
│   │   ├── GcsUploader.ts
│   │   ├── PollingHelper.ts
│   │   └── types.ts
│   └── index.ts
│
├── n8n-nodes-knowledge-graph/       # Priorité 2 - Simple
│   ├── package.json                 # depends: google-genai-core
│   └── nodes/KnowledgeGraph/
│
├── n8n-nodes-video-transcription/   # Priorité 3 - Moyen
│   ├── package.json                 # depends: google-genai-core
│   └── nodes/VideoTranscription/
│
├── n8n-nodes-gemini-image/          # Priorité 4 - Moyen+
│   ├── package.json                 # depends: google-genai-core
│   └── nodes/GeminiImage/
│
└── n8n-nodes-veo-video/             # Priorité 5 - Complexe
    ├── package.json                 # depends: google-genai-core
    ├── nodes/VeoVideo/
    └── presets/veo-presets.json
```

### 8.5 Dépendances entre Nodes

```
                    ┌─────────────────────────────┐
                    │  n8n-nodes-google-genai-core │
                    │  (Credentials, Client, GCS)  │
                    └──────────────┬──────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ knowledge-graph  │   │video-transcription│   │  gemini-image    │
│    (Priorité 2)  │   │   (Priorité 3)   │   │   (Priorité 4)   │
└──────────────────┘   └──────────────────┘   └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │   veo-video      │
                                              │   (Priorité 5)   │
                                              └──────────────────┘
```

### 8.6 Plan de Développement Custom Nodes

| Phase | Node | Durée estimée | Livrable |
|-------|------|---------------|----------|
| **Phase 1** | google-genai-core | 3-4 jours | Credentials + Client fonctionnels |
| **Phase 2** | knowledge-graph | 4-5 jours | Node opérationnel + tests |
| **Phase 3** | video-transcription | 4-5 jours | Node opérationnel + tests |
| **Phase 4** | gemini-image | 5-7 jours | Node opérationnel + tests |
| **Phase 5** | veo-video | 7-10 jours | Node opérationnel + tests + presets |

**Total estimé** : ~5-6 semaines

---

## 9. Annexes

### 9.1 Structure des Fichiers

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

### 9.2 Références

#### Documents Source

- `docs/gemini/integration-multimodale-mcp-analysis.md` - Analyse équipe MCP
- `docs/gemini/COLAB_TO_N8N_ANALYSIS.md` - Analyse équipe n8n
- `docs/colab/*.ipynb` - Notebooks Google originaux

#### Documentation Externe

- [Google Gen AI SDK](https://pypi.org/project/google-genai)
- [Veo 3 Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/video/veo)
- [Gemini API](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models)
- [n8n Creating Nodes](https://docs.n8n.io/integrations/creating-nodes/)

### 9.3 Glossaire

| Terme | Définition |
|-------|------------|
| **MCP** | Model Context Protocol - Serveur d'orchestration des outils |
| **Tool Selector** | Module de routing NLP qui sélectionne le bon outil |
| **Tool Wrapper** | Classe Python qui encapsule l'appel à un webhook n8n |
| **Preset** | Configuration prédéfinie pour un type de génération |
| **Veo 3** | Modèle Google de génération vidéo |
| **Nano Banana** | Surnom de Gemini 2.5 Flash Image |
| **Diarization** | Identification des locuteurs dans un audio |

### 9.4 Addon

● Deux documents de présentation ont été créés :

  ---
  Documents Créés

  1. PRESENTATION_BACKEND_API.md

  Contenu ciblé pour l'équipe Backend API :

  | Section                               | Contenu                                                |
  |---------------------------------------|--------------------------------------------------------|
  | Vos Responsabilités                   | Auth, upload, stockage, historique, facturation, logs  |
  | Ce qui N'est PAS votre responsabilité | APIs Google, Tool Selector, génération URLs signées    |
  | Points de Décision                    | Taille max upload, stockage temporaire, format user_id |
  | Flux de Données                       | Diagrammes séquentiels upload et génération            |
  | Espaces de Stockage                   | Gestion des 2 types d'utilisateurs                     |
  | Facturation                           | Modèle de coûts, ce qu'il faut tracker                 |
  | Logs/Surveillance                     | Événements à logger, alertes recommandées              |
  | Questions Bloquantes                  | 3 questions à résoudre                                 |

  2. PRESENTATION_FRONTEND.md

  Contenu ciblé pour l'équipe Frontend :

  | Section                     | Contenu                                                |
  |-----------------------------|--------------------------------------------------------|
  | Parcours Utilisateur        | Détail de chaque fonctionnalité avec maquettes ASCII   |
  | Protection Anti-Double-Clic | Pattern recommandé, criticité                          |
  | Confirmation Coûts          | Modal de confirmation pour Veo 3                       |
  | Gestion Fichiers            | Formats, tailles, validation                           |
  | Messages d'Erreur           | Tableau de traduction codes → messages user-friendly   |
  | Historique                  | Interface suggérée pour les utilisateurs avec stockage |
  | Sources Vidéo               | Les 3 options (upload, YouTube, Drive)                 |
  | Temps de Traitement         | Feedback recommandé selon l'opération                  |
  | Checklist                   | Avant/pendant/après développement                      |

  ---
  Fichiers dans docs/gemini/

  docs/gemini/
  ├── COLAB_TO_N8N_ANALYSIS.md           # Analyse équipe n8n (existant)
  ├── integration-multimodale-mcp-analysis.md  # Analyse MCP (existant)
  ├── SYNTHESE_MULTIMODALE_GEMINI.md     # Synthèse complète (existant)
  ├── PRESENTATION_BACKEND_API.md        # NOUVEAU - Pour équipe backend
  └── PRESENTATION_FRONTEND.md           # NOUVEAU - Pour équipe frontend



---

## Changelog

| Date | Version | Modification |
|------|---------|--------------|
| 2025-12-09 | 1.0 | Création - Synthèse des analyses MCP et n8n |
| 2025-12-09 | 1.1 | Ajout Q&A détaillé (§7) avec réponses validées |
| 2025-12-09 | 1.2 | Clarifications : URLs signées (24h), rétention GCS (7j), protection anti-abus frontend |
| 2025-12-09 | **3.0** | **Décision Custom Nodes** : Ajout §8 complet (stratégie, liste des 5 nodes, priorités, architecture) |
| 2025-12-09 | **3.1** | **Réponses Backend** : Ajout §7.6 (Q13-Q16) - User/Tenant headers, Upload MCP, régénération URL, polling Celery |

---

*Document de synthèse créé à partir des analyses des équipes MCP et n8n-workflows.*
*Architecture validée : MCP-First avec n8n comme backend d'exécution invisible.*
*Décision V3 : Custom Nodes pour une solution maintenable et réutilisable.*
