# Intégration Multimodale Gemini via MCP - Analyse et Proposition

**Auteur** : MCP
**Date** : 2025-12-09
**Version** : 1.1

---

## Contexte

Cette analyse examine comment intégrer les capacités multimodales des notebooks Colab (vidéo, image, texte, graphes de connaissances) avec l'infrastructure MCP existante.

### Contrainte Architecturale Clé

> **L'utilisateur n'aura pas directement accès à n8n.**

n8n est une **couche d'exécution backend invisible**. L'utilisateur interagit uniquement via le MCP Server (API, conversations, protocole MCP). Les workflows n8n sont des implémentations internes que l'utilisateur ne voit jamais.

### Question Initiale

> "Dans docs/colab/, tu as des colab sur pas mal de sujets liés à la vidéo, l'image, le texte, etc... On cherche au niveau du mcp project à voir comment on pourrait interagir avec des nodes n8n qui permettront de répondre à ces questions."

---

## 1. Analyse des Notebooks Colab

### 1.1 Vue d'Ensemble

| Notebook | Domaine | Taille | APIs Principales |
|----------|---------|--------|------------------|
| `knowledge_graph_generation.ipynb` | Texte | 347 KB | Gemini 2.5 Flash, NetworkX |
| `multimodal_video_transcription.ipynb` | Vidéo | 193 KB | Gemini 2.5/2.0 Flash, YouTube API |
| `veo3_video_generation.ipynb` | Génération | 37.9 KB | Veo 3.1, Gemini |
| `consistent_imagery_generation.ipynb` | Image | 25.8 MB | Gemini 2.5 Flash Image |

### 1.2 Détail par Notebook

#### Knowledge Graph Generation

**Objectif** : Extraction de graphes de connaissances à partir de documents texte.

**Technologies** :
- Google Gemini 2.5 Flash (optimisé pour rapidité et coût)
- Google Cloud Vertex AI
- NetworkX (construction de graphes, détection de communautés Louvain)
- Matplotlib/PIL (visualisation et animation)

**Fonctionnalités** :
- Extraction de personnages et relations de textes littéraires
- Support de 25+ langues (français, anglais, allemand, espagnol, grec, russe, hébreu, chinois, japonais, etc.)
- Sortie JSON structurée avec métadonnées
- Création de graphes interactifs avec détection de communautés
- Génération d'animations visualisant les réseaux

**Flux de données** :
```
Document Texte → Gemini 2.5 Flash → Extraction Entités/Relations → Graphe NetworkX → Visualisation
```

#### Multimodal Video Transcription

**Objectif** : Analyse multimodale de vidéos pour transcription et identification des intervenants.

**Technologies** :
- Gemini 2.5 Flash / 2.0 Flash
- Google Cloud Storage (sources vidéo)
- YouTube API
- Pydantic (schémas structurés)
- FFmpeg (traitement vidéo)

**Fonctionnalités** :
- Analyse simultanée audio + frames visuels
- Transcription avec timestamps précis (format MM:SS)
- Identification et nommage des speakers (voice fingerprinting)
- Extraction OCR du texte à l'écran
- Détection de présence et positionnement des personnes
- Segmentation vidéo (analyse de plages temporelles)
- Échantillonnage configurable (1-24 FPS)
- Optimisation tokens via résolution média

**Structure de sortie** :
```json
{
  "task1_transcripts": [{"start": "timestamp", "text": "dialogue", "voice": "speaker_id"}],
  "task2_speakers": [{"voice": "speaker_id", "name": "speaker_name"}]
}
```

#### Veo 3 Video Generation

**Objectif** : Génération de vidéos haute qualité à partir de prompts texte/image.

**Technologies** :
- Veo 3.1 Generate (`veo-3.1-generate-001`)
- Veo 3.1 Fast Generate (variante optimisée latence)
- Gemini 2.5 Flash (optimisation de prompts)
- Google Cloud Storage (stockage vidéos)

**Fonctionnalités** :
- Génération text-to-video avec prompt engineering avancé
- Génération image-to-video (animation d'images statiques)
- Génération de dialogue et audio intégrée
- Optimisation automatique de prompts via Gemini
- Ratios d'aspect multiples : 16:9, 9:16, 21:9, etc.
- Résolutions : 1080p, 720p
- Durées : 4, 6, 8 secondes
- Contrôles de génération de personnes

**Paramètres de prompt** :
- Sujet (qui/quoi)
- Action (mouvements, interactions)
- Scène (où/quand)
- Angles caméra (Eye-Level, Low-Angle, High-Angle, Bird's-Eye, etc.)
- Mouvements caméra (Pan, Tilt, Dolly, Zoom, Crane, Drone, etc.)
- Effets de lentille (Bokeh, Lens Flare, Shallow Depth of Field, etc.)
- Style visuel (Photorealistic, Cinematic, Vintage, Anime, etc.)
- Audio (effets sonores et dialogues)

#### Consistent Imagery Generation (Nano Banana)

**Objectif** : Génération de séquences d'images cohérentes avec préservation des personnages.

**Technologies** :
- Gemini 2.5 Flash Image ("Nano Banana")
- Google Cloud Vertex AI
- PIL/Pillow (traitement d'images, métadonnées PNG)
- NetworkX (graphe de dépendances des assets)

**Fonctionnalités** :
- Extraction et raffinement de personnages depuis archives
- Génération de character sheets (vues front/back)
- Création de compositions de scènes cohérentes
- Transformations spatiales 3D d'objets 2D
- Génération relative aux personnages
- Prompting orienté composition (approche directeur artistique)
- Tracking des dépendances comme graphe dirigé
- Métadonnées PNG pour provenance complète

**Formats de sortie** :
- Ratios : 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
- Résolution base : 1024×1024
- Formats : WEBP, PNG, GIF animé

---

## 2. Analyse de l'Architecture MCP Existante

### 2.1 Structure du Projet

```
src/mcp_server/
├── api/                    # Endpoints REST
├── tools/                  # Implémentations d'outils (50+)
│   └── n8n/               # Wrappers n8n (Phase 2)
├── orchestrator/           # Moteur d'orchestration LangGraph
├── tool_selector/          # Module de sélection (Phase 1)
├── n8n/                    # Intégration n8n core
├── conversation/           # Streaming + lazy execution
├── protocol.py             # Protocole MCP
└── server.py               # Serveur principal
```

### 2.2 Intégration n8n Existante

#### Module Core (`/src/mcp_server/n8n/`)

**Composants** :
- `config.py` : Configuration via variables d'environnement
- `client.py` : Client webhook avec injection OAuth
- `oauth_manager.py` : Récupération tokens OAuth depuis Redis
- `workflow_manager.py` : CRUD workflows n8n
- `health_checker.py` : Vérifications de santé
- `prerequisite_validator.py` : Validation prérequis

**Caractéristiques** :
- Client HTTP asynchrone (`httpx.AsyncClient`)
- Injection automatique de tokens OAuth
- Retry logic avec exponential backoff (0-10 retries)
- Timeouts configurables (webhook: 120s, API: 30s, health: 5s)
- Codes d'erreur structurés (TIMEOUT, UNAVAILABLE, INVALID_OAUTH, etc.)

#### Tool Wrappers (`/src/mcp_server/tools/n8n/`)

**Outils existants** :
| Domaine | Opérations |
|---------|------------|
| contacts | search, get, create, update, delete, list |
| calendar | search, create, update, delete, list |
| drive | search, get, create, update, delete, list |
| gmail | search, get, create, send, update, delete |

**Classes principales** :
```python
class N8NTool(ABC):
    """Classe de base pour tous les outils n8n"""
    async def call(self, operation, params, access_token, ...) -> N8NToolResult

class N8NToolResult:
    success: bool
    data: Any
    error_code: str | None
    is_recoverable: bool  # Pour retry logic

class ToolRegistry:
    """Registre central avec lazy initialization"""
    TOOL_CLASSES = {"contacts": ContactsTool, "calendar": CalendarTool, ...}
```

### 2.3 Tool Selector (Phase 1)

**Stratégie hybride en 4 étapes** :

1. **Règles par mots-clés** (déterministe, rapide)
2. **Détection NER** (spaCy, modèle français)
3. **Embeddings sémantiques** (si < 2 domaines trouvés)
4. **Filtrage par permissions** (basé sur scopes tenant)

**Domaines existants** :
- calendar, contacts, gmail, drive
- maps, notion, audio, llm, research, documents

**Performance** : < 10ms matching keywords, < 50ms avec embeddings

### 2.4 Orchestrator LangGraph

**Capacités** :
- Conversion JSON config → outils LangChain
- Exécution batch de tous les steps
- Support outils natifs et délégués (via callback backend)
- Métriques et tracking d'exécution

---

## 3. Proposition d'Intégration

### 3.1 Architecture Cible

```
┌─────────────────────────────────────────────────────────────────┐
│                     INTERFACE UTILISATEUR                        │
│         (Chat, API REST, WebSocket, Protocole MCP)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server                                │
├─────────────────────────────────────────────────────────────────┤
│  Conversation Handler (streaming, lazy tool execution)           │
│                              │                                   │
│  Tool Selector ──────────────┼───────────────────────────────── │
│  ├── contacts, calendar, drive, gmail (existants)               │
│  ├── video_analysis      ← Transcription multimodale            │
│  ├── video_generation    ← Veo 3 génération                     │
│  ├── image_generation    ← Imagery cohérente                    │
│  └── knowledge_graph     ← Extraction de graphes                │
│                              │                                   │
│  N8N Tool Wrappers ──────────┘                                   │
│  (VideoAnalysisTool, VideoGenerationTool, etc.)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (invisible pour l'utilisateur)
┌─────────────────────────────────────────────────────────────────┐
│                  N8N (Backend d'exécution)                       │
├─────────────────────────────────────────────────────────────────┤
│  Webhooks internes (jamais exposés à l'utilisateur)             │
│  ├── /webhook/video-analyze     → Gemini API                    │
│  ├── /webhook/video-generate    → Veo 3.1 API                   │
│  ├── /webhook/image-generate    → Gemini Flash Image            │
│  └── /webhook/knowledge-extract → Gemini API                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Google Cloud APIs                             │
│         (Vertex AI, Gemini, Veo 3, Cloud Storage)               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Flux Utilisateur Type

L'utilisateur ne sait pas que n8n existe. Voici le parcours :

```
Utilisateur: "Transcris cette vidéo YouTube et identifie les intervenants"
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. MCP Server reçoit la requête                                  │
│ 2. Tool Selector détecte le domaine "video_analysis"            │
│ 3. VideoAnalysisTool.call("transcribe", {url: "..."})           │
│ 4. Appel webhook n8n interne (invisible)                        │
│ 5. n8n exécute le workflow Gemini                               │
│ 6. Résultat retourné au MCP Server                              │
│ 7. MCP Server formate et stream la réponse                      │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
Utilisateur: Reçoit la transcription avec speakers identifiés
```

### 3.3 Nouveaux Tool Wrappers

#### VideoAnalysisTool

```python
class VideoAnalysisTool(N8NTool):
    domain = "video_analysis"
    operations = ["transcribe", "identify_speakers", "extract_text_ocr", "analyze_scene"]
```

**Cas d'usage** :
- "Transcris cette vidéo YouTube"
- "Qui sont les intervenants dans cette vidéo ?"
- "Extrais le texte affiché à l'écran"

#### VideoGenerationTool

```python
class VideoGenerationTool(N8NTool):
    domain = "video_generation"
    operations = ["generate_from_text", "generate_from_image", "optimize_prompt"]
```

**Cas d'usage** :
- "Génère une vidéo d'un chat jouant au piano"
- "Anime cette image statique"
- "Crée un clip de 8 secondes style cinématique"

#### ImageGenerationTool

```python
class ImageGenerationTool(N8NTool):
    domain = "image_generation"
    operations = ["generate", "extract_character", "create_character_sheet", "compose_scene"]
```

**Cas d'usage** :
- "Extrais ce personnage de l'image"
- "Crée une fiche personnage (vue de face/dos)"
- "Génère une séquence de 5 scènes cohérentes"

#### KnowledgeGraphTool

```python
class KnowledgeGraphTool(N8NTool):
    domain = "knowledge_graph"
    operations = ["extract_entities", "extract_relationships", "build_graph", "visualize"]
```

**Cas d'usage** :
- "Extrais les personnages et leurs relations de ce texte"
- "Construis un graphe de connaissances de ce document"
- "Visualise les communautés dans ce réseau"

### 3.4 Mise à Jour Tool Selector

#### Nouveaux Keywords (`rules.py`)

```python
DOMAIN_RULES = {
    # ... existants ...

    "video_analysis": [
        r"\b(transcri|sous-titr|speaker|intervenants?|vidéo|youtube|mp4)\b",
        r"\b(analyser?\s+vidéo|qui\s+parle|extraire\s+audio)\b",
    ],
    "video_generation": [
        r"\b(génér|créer?|produi)\w*\s+(vidéo|clip|animation)\b",
        r"\b(veo|text-to-video|animer?\s+image)\b",
    ],
    "image_generation": [
        r"\b(génér|créer?)\w*\s+(image|illustration|visuel)\b",
        r"\b(personnage|character\s+sheet|séquence\s+visuelle)\b",
    ],
    "knowledge_graph": [
        r"\b(graphe|knowledge\s+graph|entités?|relations?)\b",
        r"\b(extraire\s+personnages?|réseau\s+social|communautés?)\b",
    ],
}
```

### 3.5 Workflows N8N (Backend Interne)

> **Note** : Ces workflows sont des détails d'implémentation internes. L'utilisateur n'y a jamais accès.

| Webhook Interne | Implémentation n8n | Retour au MCP |
|-----------------|-------------------|---------------|
| `/webhook/video-analyze` | HTTP Request (Gemini API) → Parse JSON | JSON structuré (transcripts, speakers) |
| `/webhook/video-generate` | HTTP Request (Veo 3 API) → Poll → Upload GCS | URL signée de la vidéo |
| `/webhook/image-generate` | HTTP Request (Gemini Image) → Upload GCS | URLs signées des images |
| `/webhook/knowledge-extract` | HTTP Request (Gemini) → Parse Entities | JSON du graphe (nodes, edges) |

---

## 4. Considérations Techniques

### 4.1 Authentification

| Service | Méthode |
|---------|---------|
| Gemini API | API Key ou OAuth Vertex AI |
| Veo 3 | Vertex AI Service Account |
| GCS | Service Account avec rôle Storage Admin |

### 4.2 Configuration Recommandée

```python
# Variables d'environnement
GEMINI_API_KEY=<key>
VERTEX_PROJECT_ID=<project>
VERTEX_LOCATION=us-central1
GCS_BUCKET_NAME=<bucket>

# Timeouts spécifiques (génération vidéo = opération longue)
N8N_WEBHOOK_TIMEOUT_VIDEO=300  # 5 minutes
N8N_WEBHOOK_TIMEOUT_DEFAULT=120
```

### 4.3 Gestion des Opérations Longues

Veo 3 utilise des **long-running operations**. Stratégie recommandée :

```
1. POST /generate → Retourne operation_id
2. Polling GET /operations/{id} toutes les 5s
3. Quand status=DONE → Récupérer URL vidéo
4. Retourner URL au client
```

### 4.4 Optimisation des Coûts

| Modèle | Coût Approximatif | Usage Recommandé |
|--------|-------------------|------------------|
| Gemini 2.5 Flash | ~$0.075/1M tokens input | Transcription, extraction |
| Gemini 2.0 Flash | ~$0.05/1M tokens | Alternative économique |
| Veo 3.1 | Plus élevé | Génération vidéo uniquement |
| Gemini Flash Image | Modéré | Génération d'images |

### 4.5 Stockage des Médias

**Recommandation** : Google Cloud Storage

```
gs://bucket-name/
├── videos/
│   ├── generated/    # Vidéos générées par Veo
│   └── analyzed/     # Métadonnées d'analyse
├── images/
│   ├── generated/    # Images générées
│   └── assets/       # Character sheets, extractions
└── graphs/
    └── json/         # Graphes de connaissances exportés
```

---

## 5. Structure des Fichiers Proposée

```
src/mcp_server/tools/n8n/
├── base.py                  # existant
├── registry.py              # existant (ajouter 4 nouveaux tools)
├── errors.py                # existant
├── contacts.py              # existant
├── calendar.py              # existant
├── drive.py                 # existant
├── gmail.py                 # existant
├── video_analysis.py        # NOUVEAU
├── video_generation.py      # NOUVEAU
├── image_generation.py      # NOUVEAU
└── knowledge_graph.py       # NOUVEAU
```

---

## 6. Plan d'Implémentation

### Phase 1 : Infrastructure (Prérequis)

- [ ] Configurer les clés API Gemini et Vertex AI
- [ ] Créer le bucket GCS pour les médias
- [ ] Valider la connectivité n8n ↔ APIs Google

### Phase 2 : Wrappers MCP

- [ ] Implémenter `VideoAnalysisTool`
- [ ] Implémenter `VideoGenerationTool`
- [ ] Implémenter `ImageGenerationTool`
- [ ] Implémenter `KnowledgeGraphTool`
- [ ] Mettre à jour `ToolRegistry`

### Phase 3 : Tool Selector

- [ ] Ajouter les règles keywords pour les 4 nouveaux domaines
- [ ] Générer les embeddings pour les descriptions d'outils
- [ ] Tester la sélection hybride

### Phase 4 : Workflows n8n

- [ ] Créer workflow `video-analyze`
- [ ] Créer workflow `video-generate`
- [ ] Créer workflow `image-generate`
- [ ] Créer workflow `knowledge-extract`

### Phase 5 : Tests et Documentation

- [ ] Tests unitaires pour chaque wrapper
- [ ] Tests d'intégration end-to-end
- [ ] Documentation des APIs

---

## 7. Avantages de cette Architecture

1. **Cohérence** : Même pattern que les wrappers existants (contacts, calendar, drive, gmail)
2. **Scalabilité** : Le Tool Selector gère déjà 2500+ outils
3. **Lazy Loading** : Les outils sont chargés à la demande
4. **Async Native** : Toutes les opérations sont asynchrones
5. **Error Recovery** : Retry logic avec exponential backoff déjà en place
6. **Extensibilité** : Facile d'ajouter de nouveaux domaines

---

## 8. Prochaines Étapes

1. Valider cette proposition avec l'équipe
2. Prioriser les domaines (suggestion : commencer par `video_analysis` car le plus demandé)
3. Configurer l'environnement de développement avec les APIs Google
4. Implémenter et tester progressivement

---

## 9. Comparaison avec l'Analyse Équipe n8n

L'équipe n8n a produit un document parallèle (`COLAB_TO_N8N_ANALYSIS.md`). Voici la comparaison :

### 9.1 Points Communs

| Aspect | Analyse MCP | Analyse n8n |
|--------|-------------|-------------|
| **4 domaines identifiés** | ✅ | ✅ |
| **APIs Google** | Gemini, Veo 3, Vertex AI | Gemini, Veo 3, Vertex AI |
| **Opérations** | transcribe, generate, extract | transcribe, diarize, generate |
| **Outputs structurés** | JSON Pydantic | JSON Pydantic |
| **Stockage** | Google Cloud Storage | Google Cloud Storage |

### 9.2 Différences Clés

| Aspect | Analyse MCP | Analyse n8n |
|--------|-------------|-------------|
| **Approche** | n8n = backend invisible | Nodes n8n natifs exposés |
| **Architecture** | Wrappers dans `src/mcp_server/tools/n8n/` | Packages npm séparés (`n8n-nodes-*`) |
| **Accès utilisateur** | Via MCP Server uniquement | Directement dans n8n |
| **Tool Selector** | Intégration hybride (keywords + embeddings) | Non mentionné |
| **UX utilisateur** | Conversation naturelle | 4 modes (Simple, Builder, Advanced, Raw JSON) |
| **Presets** | Non détaillé | Système de presets JSON |

### 9.3 Implications de la Contrainte "n8n Invisible"

L'analyse de l'équipe n8n propose des **nodes n8n natifs** avec une UX riche (4 modes, presets, etc.). Cette approche n'est **pas applicable** car :

1. **L'utilisateur n'accède pas à n8n** → Les 4 modes (Simple/Builder/Advanced/Raw JSON) sont inutiles
2. **Les presets n8n** → Doivent être gérés côté MCP, pas dans les nodes
3. **Les workflows templates** → L'utilisateur ne crée pas de workflows, il pose des questions

### 9.4 Ce Qu'il Faut Retenir de l'Analyse n8n

Malgré la différence d'approche, certains éléments sont récupérables :

| Élément n8n | Adaptation MCP |
|-------------|----------------|
| **Presets (corporate_video, social_short, etc.)** | Intégrer comme paramètres par défaut dans les wrappers MCP |
| **Prompt Builder (keywords → optimized prompt)** | Implémenter dans `VideoGenerationTool.optimize_prompt()` |
| **Gestion async/polling Veo 3** | Implémenter le polling dans le wrapper, transparent pour l'utilisateur |
| **Cas d'usage workflows** | Transformer en exemples de prompts utilisateur |

### 9.5 Questions Ouvertes du Document n8n - Réponses MCP

| Question n8n | Réponse dans le contexte MCP |
|--------------|------------------------------|
| **Presets : hardcodés ou JSON externe ?** | JSON externe chargé par les wrappers MCP |
| **Prompt Builder intégré ?** | Oui, dans le wrapper comme opération `optimize_prompt` |
| **Stockage outputs : Binary ou GCS ?** | GCS avec URLs signées retournées à l'utilisateur |
| **Async/Polling ?** | Polling interne, l'utilisateur attend le résultat (streaming progress possible) |
| **Gestion erreurs ?** | Retry automatique + messages d'erreur user-friendly |
| **Rate limiting ?** | Géré par le MCP Server, pas par l'utilisateur |

---

## 10. Réflexion Personnelle

### 10.1 Avantages de l'Architecture "n8n Invisible"

1. **Simplicité UX** : L'utilisateur parle naturellement, pas besoin de comprendre n8n
2. **Abstraction** : On peut changer l'implémentation backend sans impact utilisateur
3. **Sécurité** : Les credentials et workflows ne sont jamais exposés
4. **Cohérence** : Même pattern que les outils existants (contacts, calendar, etc.)

### 10.2 Points d'Attention

1. **Feedback utilisateur** : Comment informer l'utilisateur de la progression d'une génération vidéo (1-3 min) ?
   - Suggestion : Streaming de messages de progression ("Génération en cours... 30%")

2. **Gestion des erreurs** : Les erreurs n8n/API doivent être traduites en messages compréhensibles
   - Suggestion : Mapping d'erreurs techniques → messages user-friendly

3. **Coûts** : L'utilisateur doit-il être informé du coût estimé avant une génération ?
   - Suggestion : Confirmation optionnelle pour les opérations coûteuses (Veo 3)

### 10.3 Questions à Clarifier

1. **Quotas** : Y a-t-il des limites par utilisateur/tenant pour les générations ?
2. **Persistence** : Combien de temps les médias générés sont-ils conservés sur GCS ?
3. **Formats** : L'utilisateur peut-il choisir le format de sortie (MP4, WebM, etc.) ?
4. **Multi-step** : Peut-on chaîner des opérations (ex: générer vidéo → transcrire → extraire graphe) ?

---

*Document généré dans le cadre de l'analyse d'intégration MCP pour les capacités multimodales Gemini.*
*Mis à jour avec la contrainte "n8n invisible" et la comparaison avec l'analyse équipe n8n.*
