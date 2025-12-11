# Phase 3 : n8n-nodes-video-transcription

## Informations

| Champ | Valeur |
|-------|--------|
| **Priorité** | 3 |
| **Complexité** | ⭐⭐ Moyen |
| **Durée estimée** | 4-5 jours |
| **Dépendances** | Phase 1 (google-genai-core) |
| **Bloque** | Aucune (parallélisable avec Phase 2) |

---

## Objectif

Créer un node n8n pour la transcription et l'analyse multimodale de vidéos :
- Transcription audio → texte avec timestamps
- Identification des locuteurs (speaker diarization)
- Extraction OCR du texte visible à l'écran
- Analyse de scène

**Source Colab** : `docs/colab/multimodal_video_transcription.ipynb`

---

## Documentation Obligatoire

> **AVANT DE COMMENCER** : Lire attentivement ces documents.

| Document | Chemin | Pourquoi |
|----------|--------|----------|
| Guide Custom Nodes | [`docs/n8n/CUSTOM_NODE_DEVELOPMENT.md`](../../n8n/CUSTOM_NODE_DEVELOPMENT.md) | Structure, installation, erreurs courantes |
| Colab Video Transcription | [`docs/colab/multimodal_video_transcription.ipynb`](../../colab/multimodal_video_transcription.ipynb) | Logique métier, prompts, formats |
| Phase 1 | [PHASE-1-CORE.md](./PHASE-1-CORE.md) | Dépendance, comment utiliser le core |

---

## Livrables

### 1. Structure du package

```
custom-nodes/n8n-nodes-video-transcription/
├── package.json
├── tsconfig.json
├── nodes/
│   └── VideoTranscription/
│       ├── VideoTranscription.node.ts
│       ├── VideoTranscription.node.json
│       ├── video-transcription.svg
│       └── operations/
│           ├── transcribe.ts
│           ├── identifySpeakers.ts
│           ├── extractOcr.ts
│           └── analyzeScene.ts
├── prompts/
│   ├── transcription.txt
│   ├── speaker-identification.txt
│   └── ocr-extraction.txt
└── README.md
```

### 2. Opérations du Node

#### Operation 1: Transcribe

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `videoSource` | Type: `url`, `youtube`, `gcs` |
| **Input** | `videoUrl` | URL de la vidéo |
| **Input** | `language` | Langue: `auto`, `fr`, `en`, etc. |
| **Input** | `includeTimestamps` | Inclure les timestamps |
| **Output** | JSON | Transcription avec timestamps |

**Format de sortie :**
```json
{
  "transcription": {
    "full_text": "Bonjour à tous, bienvenue dans cette présentation...",
    "segments": [
      {"start": "00:00", "end": "00:05", "text": "Bonjour à tous"},
      {"start": "00:05", "end": "00:12", "text": "bienvenue dans cette présentation"}
    ]
  },
  "metadata": {
    "duration": "05:32",
    "language_detected": "fr",
    "word_count": 842
  }
}
```

#### Operation 2: Identify Speakers

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `videoSource` | Type de source |
| **Input** | `videoUrl` | URL de la vidéo |
| **Input** | `language` | Langue |
| **Output** | JSON | Transcription avec speakers identifiés |

**Format de sortie :**
```json
{
  "transcription": {
    "segments": [
      {"start": "00:00", "end": "00:15", "speaker": "Alice", "text": "Bonjour à tous"},
      {"start": "00:16", "end": "00:30", "speaker": "Bob", "text": "Merci Alice"}
    ]
  },
  "speakers": [
    {"id": "speaker_1", "name": "Alice", "speaking_time_seconds": 145},
    {"id": "speaker_2", "name": "Bob", "speaking_time_seconds": 87}
  ],
  "metadata": {
    "speaker_count": 2,
    "duration": "05:32"
  }
}
```

#### Operation 3: Extract OCR

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `videoSource` | Type de source |
| **Input** | `videoUrl` | URL de la vidéo |
| **Input** | `samplingFps` | Images par seconde à analyser (1-24) |
| **Output** | JSON | Texte visible à l'écran par timestamp |

**Format de sortie :**
```json
{
  "visual_text": [
    {"timestamp": "00:15", "text": "Présentation Q4 2024", "position": "top-center", "confidence": 0.95},
    {"timestamp": "01:30", "text": "Objectifs", "position": "center", "confidence": 0.92}
  ],
  "metadata": {
    "frames_analyzed": 332,
    "text_occurrences": 15
  }
}
```

#### Operation 4: Analyze Scene (Complet)

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `videoSource` | Type de source |
| **Input** | `videoUrl` | URL de la vidéo |
| **Input** | Tous les paramètres ci-dessus | |
| **Output** | JSON | Analyse complète (transcription + speakers + OCR) |

---

## Sources Vidéo Supportées

| Source | Input | Notes |
|--------|-------|-------|
| **URL directe** | `https://example.com/video.mp4` | Formats: MP4, WebM, MOV |
| **YouTube** | `https://youtube.com/watch?v=xxx` | Pas de téléchargement, URL directe |
| **Google Drive** | `https://drive.google.com/file/d/xxx` | Nécessite accès |
| **GCS** | `gs://bucket/path/video.mp4` | Accès via Service Account |

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
      { name: 'Transcribe', value: 'transcribe' },
      { name: 'Identify Speakers', value: 'identifySpeakers' },
      { name: 'Extract Visual Text (OCR)', value: 'extractOcr' },
      { name: 'Full Analysis', value: 'analyzeScene' },
    ],
    default: 'transcribe',
  },
  {
    displayName: 'Video Source',
    name: 'videoSource',
    type: 'options',
    options: [
      { name: 'URL', value: 'url' },
      { name: 'YouTube', value: 'youtube' },
      { name: 'Google Drive', value: 'drive' },
      { name: 'Google Cloud Storage', value: 'gcs' },
    ],
    default: 'url',
  },
  {
    displayName: 'Video URL',
    name: 'videoUrl',
    type: 'string',
    required: true,
    description: 'URL of the video to analyze',
  },
  {
    displayName: 'Language',
    name: 'language',
    type: 'options',
    options: [
      { name: 'Auto-detect', value: 'auto' },
      { name: 'French', value: 'fr' },
      { name: 'English', value: 'en' },
      { name: 'German', value: 'de' },
      { name: 'Spanish', value: 'es' },
    ],
    default: 'auto',
  },
  {
    displayName: 'Include Timestamps',
    name: 'includeTimestamps',
    type: 'boolean',
    default: true,
  },
  {
    displayName: 'Sampling FPS',
    name: 'samplingFps',
    type: 'number',
    default: 1,
    description: 'Frames per second to analyze for OCR (1-24)',
    displayOptions: { show: { operation: ['extractOcr', 'analyzeScene'] } },
  },
]
```

---

## Critères d'Acceptation

### Fonctionnels

- [ ] Transcription basique fonctionne (URL directe)
- [ ] Transcription YouTube fonctionne
- [ ] Identification des speakers retourne les noms détectés
- [ ] OCR extrait le texte visible
- [ ] Analyse complète combine les 3 opérations
- [ ] Support multilingue (FR, EN minimum)
- [ ] Gestion des vidéos longues (chunking si nécessaire)

### Techniques

- [ ] Le node compile sans erreur
- [ ] Le node apparaît dans l'UI n8n
- [ ] Le type JSON est `n8n-nodes-video-transcription.videoTranscription`
- [ ] Dépendance `google-genai-core` fonctionne
- [ ] Tests unitaires (>80% coverage)

### Documentation

- [ ] README.md avec exemples
- [ ] Mise à jour de `docs/n8n/CUSTOM_NODE_DEVELOPMENT.md` si nouveaux problèmes

---

## Tests à Effectuer

### Tests Unitaires

```typescript
describe('VideoTranscription', () => {
  describe('transcribe', () => {
    it('should transcribe video from URL');
    it('should transcribe YouTube video');
    it('should detect language automatically');
    it('should include timestamps when requested');
  });

  describe('identifySpeakers', () => {
    it('should identify multiple speakers');
    it('should assign names from on-screen text');
    it('should calculate speaking time per speaker');
  });

  describe('extractOcr', () => {
    it('should extract text from video frames');
    it('should respect sampling FPS');
    it('should include position information');
  });
});
```

### Tests d'Intégration

- [ ] Vidéo YouTube publique (conférence, présentation)
- [ ] Vidéo MP4 directe
- [ ] Vidéo avec plusieurs speakers
- [ ] Vidéo avec texte à l'écran (slides)

---

## Risques et Mitigation

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Vidéo trop longue | Moyen | Chunking temporel (analyser par segments) |
| YouTube rate limiting | Moyen | Cache, retry avec backoff |
| Speaker non identifiable | Faible | Fallback "Speaker 1", "Speaker 2" |
| OCR imprécis | Faible | Seuil de confidence, option désactivable |

---

## Notes de Développement

### Configuration Gemini pour Vidéo

```typescript
const config = {
  model: 'gemini-2.5-flash',
  // La vidéo est passée comme contenu multimodal
};

// Optimisation tokens via résolution média
const mediaResolution = 'medium';  // low, medium, high
```

### Gestion du Contexte Long

Gemini 2.5 Flash supporte jusqu'à **1M tokens**, ce qui permet d'analyser des vidéos longues directement. Pour les vidéos très longues :

1. Estimer le nombre de tokens (frames × tokens/frame)
2. Si > 800K tokens, découper en segments de 10 minutes
3. Fusionner les résultats

### Pourquoi ce node en Phase 3 ?

1. **Analyse, pas génération** : Moins risqué, coût prévisible
2. **Introduit le multimodal** : Prépare pour les images/vidéos
3. **Pas de binaires en sortie** : JSON uniquement
4. **Valeur immédiate** : Transcription très demandée

---

## Validation Finale

Avant de passer à la Phase 4, vérifier :

- [ ] Les 4 opérations fonctionnent
- [ ] YouTube est supporté
- [ ] Le node est visible dans n8n
- [ ] Un workflow peut utiliser ce node
- [ ] La documentation est à jour

---

## Liens

- **Issue précédente** : [Phase 2 - Knowledge Graph](./PHASE-2-KNOWLEDGE-GRAPH.md)
- **Issue suivante** : [Phase 4 - Gemini Image](./PHASE-4-GEMINI-IMAGE.md)
- **Synthèse projet** : [`docs/gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md`](../../gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md)
