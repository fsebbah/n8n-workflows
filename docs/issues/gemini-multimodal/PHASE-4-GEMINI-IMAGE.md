# Phase 4 : n8n-nodes-gemini-image

## Informations

| Champ | Valeur |
|-------|--------|
| **Priorité** | 4 |
| **Complexité** | ⭐⭐⭐ Moyen+ |
| **Durée estimée** | 5-7 jours |
| **Dépendances** | Phase 1 (google-genai-core) |
| **Bloque** | Phase 5 (concepts réutilisés) |

---

## Objectif

Créer un node n8n pour la génération et manipulation d'images avec Gemini :
- Génération d'images à partir de prompts
- Extraction de personnages depuis des images
- Création de character sheets (vues multiples)
- Composition de scènes cohérentes

**Source Colab** : `docs/colab/consistent_imagery_generation.ipynb`

---

## Documentation Obligatoire

> **AVANT DE COMMENCER** : Lire attentivement ces documents.

| Document | Chemin | Pourquoi |
|----------|--------|----------|
| Guide Custom Nodes | [`docs/n8n/CUSTOM_NODE_DEVELOPMENT.md`](../../n8n/CUSTOM_NODE_DEVELOPMENT.md) | Structure, installation, erreurs courantes |
| Colab Consistent Imagery | [`docs/colab/consistent_imagery_generation.ipynb`](../../colab/consistent_imagery_generation.ipynb) | Logique métier, prompts, techniques |
| Phase 1 | [PHASE-1-CORE.md](./PHASE-1-CORE.md) | Dépendance, GcsUploader |

---

## Livrables

### 1. Structure du package

```
custom-nodes/n8n-nodes-gemini-image/
├── package.json
├── tsconfig.json
├── nodes/
│   └── GeminiImage/
│       ├── GeminiImage.node.ts
│       ├── GeminiImage.node.json
│       ├── gemini-image.svg
│       └── operations/
│           ├── generate.ts
│           ├── extractCharacter.ts
│           ├── createCharacterSheet.ts
│           └── composeScene.ts
├── prompts/
│   ├── image-generation.txt
│   ├── character-extraction.txt
│   └── scene-composition.txt
└── README.md
```

### 2. Opérations du Node

#### Operation 1: Generate

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `prompt` | Description de l'image à générer |
| **Input** | `aspectRatio` | Ratio: `1:1`, `16:9`, `9:16`, etc. |
| **Input** | `outputFormat` | Format: `png`, `webp` |
| **Output** | Binary + JSON | Image + URL GCS |

**Format de sortie :**
```json
{
  "image": {
    "format": "png",
    "width": 1024,
    "height": 1024,
    "gcs_url": "gs://bucket/images/generated/xxx.png",
    "signed_url": "https://storage.googleapis.com/...",
    "expires_at": "2024-12-10T19:00:00Z"
  },
  "metadata": {
    "prompt": "...",
    "model": "gemini-2.5-flash-image",
    "generation_time_ms": 3200
  }
}
```

#### Operation 2: Extract Character

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `sourceImage` | Image source (binary ou URL) |
| **Input** | `characterDescription` | Description du personnage à extraire |
| **Output** | Binary + JSON | Personnage isolé sur fond transparent |

**Format de sortie :**
```json
{
  "character": {
    "format": "png",
    "gcs_url": "gs://bucket/images/assets/character_xxx.png",
    "signed_url": "https://...",
    "has_transparency": true
  },
  "metadata": {
    "source_image": "original.png",
    "character_detected": true
  }
}
```

#### Operation 3: Create Character Sheet

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `sourceImage` | Image du personnage |
| **Input** | `views` | Vues à générer: `front`, `back`, `side`, `3/4` |
| **Output** | Binary[] + JSON | Multiple images (une par vue) |

**Format de sortie :**
```json
{
  "character_sheet": {
    "views": [
      {"view": "front", "gcs_url": "gs://...", "signed_url": "https://..."},
      {"view": "back", "gcs_url": "gs://...", "signed_url": "https://..."},
      {"view": "side", "gcs_url": "gs://...", "signed_url": "https://..."}
    ]
  },
  "metadata": {
    "source_image": "character.png",
    "views_generated": 3
  }
}
```

#### Operation 4: Compose Scene

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `referenceImages` | Images de référence (personnages, objets) |
| **Input** | `scenePrompt` | Description de la scène |
| **Input** | `aspectRatio` | Ratio de l'image finale |
| **Output** | Binary + JSON | Scène composée |

---

## Aspect Ratios Supportés

| Ratio | Dimensions | Usage |
|-------|------------|-------|
| `1:1` | 1024×1024 | Icônes, avatars |
| `16:9` | 1024×576 | Paysages, bannières |
| `9:16` | 576×1024 | Mobile, stories |
| `2:3` | 683×1024 | Portraits |
| `3:2` | 1024×683 | Photos standard |
| `4:3` | 1024×768 | Présentations |
| `21:9` | 1024×439 | Cinématique |

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
      { name: 'Generate Image', value: 'generate' },
      { name: 'Extract Character', value: 'extractCharacter' },
      { name: 'Create Character Sheet', value: 'createCharacterSheet' },
      { name: 'Compose Scene', value: 'composeScene' },
    ],
    default: 'generate',
  },
  {
    displayName: 'Prompt',
    name: 'prompt',
    type: 'string',
    typeOptions: { rows: 4 },
    required: true,
    displayOptions: { show: { operation: ['generate'] } },
  },
  {
    displayName: 'Source Image',
    name: 'sourceImage',
    type: 'string',
    description: 'Binary data from previous node or URL',
    displayOptions: { show: { operation: ['extractCharacter', 'createCharacterSheet'] } },
  },
  {
    displayName: 'Aspect Ratio',
    name: 'aspectRatio',
    type: 'options',
    options: [
      { name: '1:1 (Square)', value: '1:1' },
      { name: '16:9 (Landscape)', value: '16:9' },
      { name: '9:16 (Portrait)', value: '9:16' },
      { name: '2:3 (Portrait Photo)', value: '2:3' },
      { name: '3:2 (Landscape Photo)', value: '3:2' },
      { name: '4:3 (Presentation)', value: '4:3' },
      { name: '21:9 (Cinematic)', value: '21:9' },
    ],
    default: '1:1',
    displayOptions: { show: { operation: ['generate', 'composeScene'] } },
  },
  {
    displayName: 'Output Format',
    name: 'outputFormat',
    type: 'options',
    options: [
      { name: 'PNG', value: 'png' },
      { name: 'WebP', value: 'webp' },
    ],
    default: 'png',
  },
  {
    displayName: 'Views',
    name: 'views',
    type: 'multiOptions',
    options: [
      { name: 'Front', value: 'front' },
      { name: 'Back', value: 'back' },
      { name: 'Left Side', value: 'left' },
      { name: 'Right Side', value: 'right' },
      { name: '3/4 View', value: 'three_quarter' },
    ],
    default: ['front', 'back'],
    displayOptions: { show: { operation: ['createCharacterSheet'] } },
  },
]
```

---

## Gestion des Binaires dans n8n

### Input : Recevoir une image

```typescript
// Depuis un node précédent (ex: HTTP Request, Read Binary File)
const binaryData = this.helpers.getBinaryDataBuffer(itemIndex, 'data');
const mimeType = items[itemIndex].binary.data.mimeType;
```

### Output : Retourner une image

```typescript
// Retourner l'image comme binary + metadata
const newItem: INodeExecutionData = {
  json: {
    gcs_url: 'gs://...',
    signed_url: 'https://...',
    format: 'png',
  },
  binary: {
    data: await this.helpers.prepareBinaryData(imageBuffer, 'image.png', 'image/png'),
  },
};
```

---

## Critères d'Acceptation

### Fonctionnels

- [ ] Generate crée une image à partir d'un prompt
- [ ] Extract Character isole un personnage
- [ ] Create Character Sheet génère les vues multiples
- [ ] Compose Scene crée une scène avec références
- [ ] Tous les aspect ratios sont supportés
- [ ] Upload GCS fonctionne
- [ ] URLs signées (24h) sont générées

### Techniques

- [ ] Le node compile sans erreur
- [ ] Le node apparaît dans l'UI n8n
- [ ] Le type JSON est `n8n-nodes-gemini-image.geminiImage`
- [ ] Gestion binaires in/out fonctionne
- [ ] Dépendance `google-genai-core` fonctionne
- [ ] Tests unitaires (>80% coverage)

### Documentation

- [ ] README.md avec exemples
- [ ] Mise à jour de `docs/n8n/CUSTOM_NODE_DEVELOPMENT.md` (gestion binaires, GCS)

---

## Tests à Effectuer

### Tests Unitaires

```typescript
describe('GeminiImage', () => {
  describe('generate', () => {
    it('should generate image from prompt');
    it('should respect aspect ratio');
    it('should upload to GCS');
    it('should return signed URL');
  });

  describe('extractCharacter', () => {
    it('should extract character from image');
    it('should handle image with no clear character');
  });

  describe('createCharacterSheet', () => {
    it('should generate all requested views');
    it('should maintain character consistency');
  });

  describe('composeScene', () => {
    it('should compose scene with references');
    it('should handle multiple reference images');
  });
});
```

### Tests d'Intégration

- [ ] Générer une image simple (logo, icône)
- [ ] Extraire un personnage d'une photo
- [ ] Créer un character sheet complet
- [ ] Composer une scène avec 2+ références

---

## Risques et Mitigation

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Incohérence entre vues | Moyen | Prompts précis, seed fixe |
| Images de mauvaise qualité | Moyen | Validation qualité, option régénération |
| Upload GCS lent | Faible | Compression, progress callback |
| Limite taille image | Moyen | Redimensionnement automatique |

---

## Notes de Développement

### Configuration Gemini Image

```typescript
const config = {
  model: 'gemini-2.5-flash-image',
  responseModalities: ['IMAGE'],
};
```

### Consistency entre Images

Le Colab utilise des techniques pour maintenir la cohérence :
1. **Reference images** : Passer les images précédentes comme contexte
2. **Character description** : Inclure une description textuelle du personnage
3. **Seed** : Utiliser un seed fixe pour la reproductibilité

### Pourquoi ce node en Phase 4 ?

1. **Introduit les binaires** : Input/output d'images
2. **Introduit GCS** : Upload et URLs signées
3. **Prépare Veo** : Mêmes concepts (binaires, GCS, génération)
4. **Complexité moyenne** : Pas de polling long

---

## Points d'Attention

### Mise à jour de la documentation

> **IMPORTANT** : Cette phase introduit la gestion des binaires et GCS.
> Documenter dans `docs/n8n/CUSTOM_NODE_DEVELOPMENT.md` :
> - Comment gérer les binary data en input
> - Comment retourner des binary data en output
> - Comment utiliser GcsUploader
> - Erreurs courantes avec les images

---

## Validation Finale

Avant de passer à la Phase 5, vérifier :

- [ ] Les 4 opérations fonctionnent
- [ ] Les binaires sont gérés correctement
- [ ] GCS upload + signed URLs fonctionnent
- [ ] Le node est visible dans n8n
- [ ] La documentation est mise à jour avec les learnings

---

## Liens

- **Issue précédente** : [Phase 3 - Video Transcription](./PHASE-3-VIDEO-TRANSCRIPTION.md)
- **Issue suivante** : [Phase 5 - Veo Video](./PHASE-5-VEO-VIDEO.md)
- **Synthèse projet** : [`docs/gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md`](../../gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md)
