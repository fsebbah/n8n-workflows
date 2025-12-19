# Migration Gemini Image → Imagen 3

## Résumé exécutif

Migration du node Gemini Image depuis `gemini-2.5-flash-preview-native-audio-dialog` vers **Imagen 3** pour bénéficier de fonctionnalités professionnelles (inpainting, negative prompt, seed) et éviter la dépréciation des modèles preview (octobre 2025).

**Décision**: Imagen 3 uniquement (pas d'hybride avec Imagen 4) pour simplifier l'architecture.

## Contexte

### Sources consolidées
- Feedback équipe Gemini (`reponse_image_neo_banana.md`)
- Analyse technique (`PHASE-4E-GEMINI-IMAGE-IMPROVEMENTS.md`)
- Documentation officielle Vertex AI

### Problème actuel
```typescript
// Modèle actuel - PREVIEW, sera déprécié
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-native-audio-dialog';
```

### Solution
```typescript
// Modèles Imagen 3 stables
const IMAGEN_GENERATE_MODEL = 'imagen-3.0-generate-002';
const IMAGEN_FAST_MODEL = 'imagen-3.0-fast-generate-001';
const IMAGEN_EDIT_MODEL = 'imagen-3.0-capability-001';
```

## Comparaison détaillée

### Modèles Imagen 3 disponibles

| Modèle | Usage | Quota/min | Capabilities |
|--------|-------|-----------|--------------|
| `imagen-3.0-generate-002` | Génération haute qualité | 20 | Génération, negative prompt, seed |
| `imagen-3.0-fast-generate-001` | Génération rapide | 200 | Génération (10x plus rapide) |
| `imagen-3.0-capability-001` | Édition d'images | 20 | Inpainting, outpainting, insertion/suppression |

### Mapping des opérations

| Opération actuelle | Modèle Imagen 3 | Changements requis |
|--------------------|-----------------|-------------------|
| `generate` | `imagen-3.0-generate-002` | Refonte API |
| `extractCharacter` | `imagen-3.0-capability-001` | Utiliser inpainting avec mask |
| `createCharacterSheet` | `imagen-3.0-generate-002` | Adapter le prompt |
| `composeScene` | `imagen-3.0-capability-001` | Utiliser édition multi-images |

### Nouveaux paramètres disponibles

| Paramètre | Type | Valeurs | Description |
|-----------|------|---------|-------------|
| `negativePrompt` | string | - | Éléments à exclure (nouveau!) |
| `seed` | integer | 1-2147483647 | Reproductibilité (nouveau!) |
| `sampleCount` | integer | 1-4 | Nombre d'images |
| `safetySetting` | string | `block_low_and_above`, `block_medium_and_above`, `block_only_high` | Niveau de filtrage |
| `personGeneration` | string | `allow_adult`, `dont_allow` | Génération de personnes |
| `enhancePrompt` | boolean | true/false | Amélioration automatique du prompt |
| `addWatermark` | boolean | true/false | Filigrane numérique |
| `storageUri` | string | gs://... | Upload direct vers GCS |

### Aspect Ratios supportés

| Ratio | Résolution | Usage |
|-------|------------|-------|
| `1:1` | 1024×1024 | Avatars, icônes |
| `3:4` | 896×1280 | Portraits |
| `4:3` | 1280×896 | Paysages |
| `9:16` | 768×1408 | Mobile, Stories |
| `16:9` | 1408×768 | Bannières, vidéos |

**Note**: Les ratios `2:3`, `3:2`, `21:9` de Gemini ne sont **pas supportés** par Imagen 3.

## Architecture technique

### Endpoint API Imagen 3

```
POST https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/publishers/google/models/{MODEL}:predict
```

### Structure de requête - Génération

```json
{
  "instances": [
    {
      "prompt": "A cute robot made of felt, studio lighting"
    }
  ],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "16:9",
    "negativePrompt": "blurry, low quality, text, watermark",
    "seed": 42,
    "safetySetting": "block_medium_and_above",
    "personGeneration": "allow_adult",
    "addWatermark": true,
    "outputOptions": {
      "mimeType": "image/png"
    }
  }
}
```

### Structure de requête - Édition (Inpainting)

```json
{
  "instances": [
    {
      "prompt": "Remove the background, keep only the character",
      "image": {
        "bytesBase64Encoded": "<base64_image>"
      },
      "mask": {
        "bytesBase64Encoded": "<base64_mask>"
      }
    }
  ],
  "parameters": {
    "editMode": "inpainting",
    "sampleCount": 1
  }
}
```

### Structure de réponse

```json
{
  "predictions": [
    {
      "bytesBase64Encoded": "<base64_image>",
      "mimeType": "image/png"
    }
  ]
}
```

## Recommandations de l'équipe Gemini intégrées

### 1. Pipeline créatif Image → Vidéo

```
┌─────────────────┐
│ 1. Character    │  createCharacterSheet (imagen-3.0-generate-002)
│    Sheet        │  → Personnage cohérent sous tous angles
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Compose      │  composeScene (imagen-3.0-capability-001)
│    Scene        │  → Personnage placé dans décor
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Animate      │  veo-video:generateFromImage
│    (Veo)        │  → Image s'anime naturellement
└─────────────────┘
```

### 2. Prompt optimisé Character Sheet

```
A professional character concept sheet of [DESCRIPTION],
full body views: front view, side view, and back view.
Standing in a neutral T-pose, consistent clothing and colors across all views,
clean white background, cinematic lighting, high resolution, 8k.
```

### 3. Règles de cohérence Image → Vidéo

- **Même Aspect Ratio**: Image 16:9 → Vidéo 16:9 obligatoire
- **Prompt vidéo**: Décrire uniquement le mouvement, pas le personnage
  - ❌ "Un robot bleu qui marche"
  - ✅ "The character walks forward with a mechanical gait"

### 4. Optimisation GCS

- Option `returnBase64: false` quand `uploadToGcs: true`
- Utiliser `storageUri` natif d'Imagen 3 pour upload direct

### 5. Text Feedback

- Activer `includeTextFeedback: true` par défaut
- Permet à l'IA de savoir ce qu'elle a créé

## Plan d'implémentation

### Phase A: Refonte du Client (Priorité CRITIQUE)

**Durée estimée**: 4h

**Objectifs**:
- Créer nouveau client Imagen3Client.ts
- Implémenter génération avec nouveaux paramètres
- Tests unitaires

**Fichiers**:
```
custom-nodes/n8n-nodes-gemini-image/
├── shared/
│   ├── GeminiImageClient.ts      # Garder pour rétrocompatibilité
│   └── Imagen3Client.ts          # NOUVEAU
```

**Tâches**:
- [ ] Créer `Imagen3Client.ts` avec:
  - [ ] Méthode `generate()` pour `imagen-3.0-generate-002`
  - [ ] Méthode `generateFast()` pour `imagen-3.0-fast-generate-001`
  - [ ] Méthode `edit()` pour `imagen-3.0-capability-001`
  - [ ] Support `negativePrompt`
  - [ ] Support `seed`
  - [ ] Support `safetySetting`
  - [ ] Support `storageUri` (upload GCS direct)
- [ ] Implémenter authentification Vertex AI
- [ ] Gérer les erreurs API

### Phase B: Adaptation des opérations

**Durée estimée**: 3h

**Objectifs**:
- Adapter les 4 opérations existantes
- Mapper vers les bons modèles Imagen 3

**Tâches**:

#### B1: Opération `generate`
- [ ] Utiliser `imagen-3.0-generate-002`
- [ ] Ajouter `negativePrompt` au node
- [ ] Ajouter `seed` au node
- [ ] Ajouter sélection modèle (standard/fast)

#### B2: Opération `extractCharacter`
- [ ] Utiliser `imagen-3.0-capability-001`
- [ ] Implémenter génération automatique du mask
- [ ] Mode inpainting pour extraction

#### B3: Opération `createCharacterSheet`
- [ ] Utiliser `imagen-3.0-generate-002`
- [ ] Adapter le prompt template
- [ ] Seed identique pour cohérence entre vues

#### B4: Opération `composeScene`
- [ ] Utiliser `imagen-3.0-capability-001`
- [ ] Implémenter édition multi-images
- [ ] Support du mask optionnel

### Phase C: Mise à jour du Node n8n

**Durée estimée**: 2h

**Objectifs**:
- Ajouter nouveaux paramètres UI
- Rétrocompatibilité avec config existante

**Fichiers**:
```
custom-nodes/n8n-nodes-gemini-image/
├── nodes/GeminiImage/
│   └── GeminiImage.node.ts       # Mise à jour UI
```

**Tâches**:
- [ ] Ajouter dropdown sélection modèle:
  - `imagen-3.0-generate-002` (Standard)
  - `imagen-3.0-fast-generate-001` (Fast - 10x quota)
- [ ] Ajouter champ `negativePrompt`
- [ ] Ajouter champ `seed`
- [ ] Ajouter dropdown `safetySetting`:
  - `block_low_and_above`
  - `block_medium_and_above` (défaut)
  - `block_only_high`
- [ ] Ajouter toggle `returnBase64`
- [ ] Mettre à jour aspect ratios supportés (retirer 2:3, 3:2, 21:9)
- [ ] Changer défaut `includeTextFeedback` à `true`

### Phase D: Optimisation GCS

**Durée estimée**: 1h

**Objectifs**:
- Utiliser upload GCS natif d'Imagen 3
- Option pour ne pas retourner base64

**Tâches**:
- [ ] Implémenter paramètre `storageUri`
- [ ] Ajouter option `returnBase64: false`
- [ ] Générer URL signée après upload
- [ ] Tester avec fichiers volumineux

### Phase E: Tests et Documentation

**Durée estimée**: 2h

**Objectifs**:
- Valider toutes les opérations
- Mettre à jour la documentation MCP

**Tâches**:
- [ ] Test `generate` avec tous les paramètres
- [ ] Test `extractCharacter` avec inpainting
- [ ] Test `createCharacterSheet` cohérence
- [ ] Test `composeScene` multi-images
- [ ] Test pipeline Image → Vidéo complet
- [ ] Mettre à jour `docs/n8n/gemini-image-mcp-server.md`
- [ ] Ajouter section "Migration depuis Gemini"
- [ ] Documenter nouveaux paramètres

### Phase F: Déploiement

**Durée estimée**: 1h

**Tâches**:
- [ ] Build et test local
- [ ] Copier vers ~/.n8n/nodes/
- [ ] Réimporter workflow
- [ ] Validation avec équipe MCP-server
- [ ] Commit et PR

## Résumé du découpage

| Phase | Description | Durée | Priorité |
|-------|-------------|-------|----------|
| **A** | Refonte Client Imagen3 | 4h | CRITIQUE |
| **B** | Adaptation opérations | 3h | Haute |
| **C** | Mise à jour Node UI | 2h | Haute |
| **D** | Optimisation GCS | 1h | Moyenne |
| **E** | Tests et Documentation | 2h | Haute |
| **F** | Déploiement | 1h | Haute |
| **Total** | | **13h** | |

## Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| API Imagen 3 différente | Haute | Haute | Refonte complète du client |
| Aspect ratios non supportés | Moyenne | Moyenne | Mapper vers ratios proches |
| Inpainting complexe | Moyenne | Haute | Phase B2 dédiée, tests approfondis |
| Quota limité (20/min) | Faible | Moyenne | Option modèle fast (200/min) |

## Rétrocompatibilité

### Option 1: Renommer le node (BREAKING)
- Nouveau nom: `Imagen 3` au lieu de `Gemini Image`
- Les workflows existants devront être mis à jour

### Option 2: Garder le nom (RECOMMANDÉ)
- Même nom de node `geminiImage`
- Changement de backend transparent
- Ajouter warning si anciens paramètres utilisés

## Prochaines étapes

1. ✅ Analyse et planification (ce document)
2. ⏳ Validation du plan par l'utilisateur
3. ⏳ Implémentation Phase A (Client)
4. ⏳ Implémentation Phases B-F

## Références

- [Imagen 3 Documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/3-0-generate)
- [Imagen API Reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api)
- [Generate Images](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images)
- [Feedback équipe Gemini](./reponse_image_neo_banana.md)
