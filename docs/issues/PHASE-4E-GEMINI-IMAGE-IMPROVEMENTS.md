# Phase 4E - Améliorations Gemini Image

## Contexte

Suite aux recommandations de l'équipe Gemini (voir `docs/issues/reponse_image_neo_banana.md`), cette phase vise à améliorer le node Gemini Image avec des fonctionnalités professionnelles et la mise à jour du modèle.

## URGENT: Migration du modèle

### Modèle actuel (à changer)
```typescript
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-native-audio-dialog';
```

### Problème
- Le modèle `gemini-2.5-flash-preview-native-audio-dialog` est un modèle **preview**
- Les modèles preview `gemini-2.0-flash-preview-image-generation` et `gemini-2.5-flash-image-preview` seront **retirés le 31 octobre 2025**
- Risque de disruption de service

### Solution
Migrer vers le modèle stable:
```typescript
const DEFAULT_MODEL = 'gemini-2.5-flash-image';  // Version stable
```

### Modèles disponibles (décembre 2025)

| Modèle | Usage | Statut |
|--------|-------|--------|
| `gemini-2.5-flash-image` | Génération d'images (recommandé) | Stable |
| `imagen-3.0-generate-002` | Génération pure Imagen 3 | Stable |
| `imagen-3.0-fast-generate-001` | Génération rapide | Stable |
| `gemini-2.5-flash-preview-*` | Preview | **Deprecation Oct 2025** |

**Sources:**
- [Gemini 2.5 Flash Image](https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/)
- [Imagen 3 Documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/3-0-generate)
- [Generate images with Gemini](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-generation)

## Analyse de l'état actuel

### Implémenté (Phase 4)

- [x] `generate` - Génération depuis prompt texte
- [x] `extractCharacter` - Extraction avec fond transparent/blanc
- [x] `createCharacterSheet` - Vues multiples (front, back, side)
- [x] `composeScene` - Composition avec images de référence
- [x] Upload GCS avec URL signée
- [x] Documentation MCP Server

### À implémenter (Phase 4E)

| Fonctionnalité | Priorité | Complexité | Description |
|----------------|----------|------------|-------------|
| **Migration modèle** | Critique | Faible | `gemini-2.5-flash-image` stable |
| **safetyFilterLevel** | Haute | Faible | Contrôle des filtres de sécurité |
| **returnBase64** | Haute | Faible | Option pour alléger réponse si GCS |
| **includeTextFeedback default** | Moyenne | Faible | Activer par défaut |
| **Inpainting (mask)** | Moyenne | Moyenne | Modifier zone spécifique |
| **Pipeline Image→Video** | Moyenne | Moyenne | Documentation Golden Path |

## Nouveaux paramètres API

### Paramètres de sécurité

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `safetyFilterLevel` | string | `block_medium` | `block_low`, `block_medium`, `block_high` |

### Paramètres de sortie

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `returnBase64` | boolean | `true` | Si `false` et `uploadToGcs=true`, n'inclut pas base64 dans la réponse |
| `includeTextFeedback` | boolean | `true` | Description textuelle de l'image générée (changement défaut) |

### Paramètres pour Inpainting (composeScene)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `mask` | string | Image mask en base64 (zones blanches = à modifier) |
| `maskMimeType` | string | Type MIME du mask (défaut: `image/png`) |

## Recommandations techniques

### 1. Distinction Gemini vs Imagen

L'équipe Gemini recommande de distinguer:
- **Gemini 2.5 Flash Image**: Comprendre/raisonner sur l'image + générer
- **Imagen 3**: Génération pure d'images (meilleure qualité pour certains cas)

**Suggestion**: Ajouter un paramètre `engine`:
```json
{
  "engine": "gemini",  // ou "imagen"
  "model": "gemini-2.5-flash-image"
}
```

### 2. Validation Alpha Channel

Pour `extractCharacter` avec `backgroundType: "transparent"`:
- Si `outputFormat: "jpeg"` → Erreur ou fallback automatique vers PNG
- JPEG ne supporte pas la transparence

```javascript
if (backgroundType === 'transparent' && outputFormat === 'jpeg') {
  // Option 1: Erreur
  throw new Error('JPEG does not support transparency. Use PNG or WebP.');
  // Option 2: Fallback
  outputFormat = 'png';
}
```

### 3. Optimisation GCS

Quand `uploadToGcs: true` et `returnBase64: false`:
```json
{
  "success": true,
  "image": {
    "mimeType": "image/png",
    "format": "png"
    // PAS de base64 - allège la réponse de plusieurs Mo
  },
  "gcs": {
    "bucket": "my-bucket",
    "signedUrl": "https://storage.googleapis.com/..."
  }
}
```

### 4. Text Feedback par défaut

Changer le défaut pour que l'IA sache ce qu'elle a créé:
```typescript
// Avant
includeTextFeedback: false

// Après
includeTextFeedback: true
```

## Pipeline créatif Image → Vidéo

### Golden Path documenté

```
┌─────────────────┐
│ 1. Character    │  createCharacterSheet
│    Sheet        │  → Personnage cohérent sous tous angles
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Compose      │  composeScene
│    Scene        │  → Personnage placé dans décor
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Animate      │  veo-video:generateFromImage
│    (Veo)        │  → Image s'anime naturellement
└─────────────────┘
```

### Règles de cohérence

1. **Même Aspect Ratio**: Si image en `16:9`, vidéo DOIT rester en `16:9`
2. **Prompt vidéo**: Décrire uniquement le **mouvement**, pas le personnage
   - ❌ "Un robot bleu qui marche" (Veo recrée un robot)
   - ✅ "The character walks forward with a mechanical gait, camera tracking"

### Prompt optimisé pour Character Sheet

```
A professional character concept sheet of [DESCRIPTION],
full body views: front view, side view, and back view.
Standing in a neutral T-pose, consistent clothing and colors across all views,
clean white background, cinematic lighting, high resolution, 8k.
```

## Plan d'implémentation

### Étape 1: Migration modèle (URGENT - 30min)
- [ ] Changer `DEFAULT_MODEL` vers `gemini-2.5-flash-image`
- [ ] Mettre à jour les options de modèle dans le node
- [ ] Tester génération avec nouveau modèle

### Étape 2: Paramètres simples (1h)
- [ ] Ajouter `safetyFilterLevel` à GeminiImageOptions
- [ ] Ajouter `returnBase64` option
- [ ] Changer défaut `includeTextFeedback` à `true`
- [ ] Mettre à jour GeminiImage.node.ts

### Étape 3: Validation Alpha Channel (30min)
- [ ] Ajouter validation dans `extractCharacter`
- [ ] Fallback ou erreur si JPEG + transparent

### Étape 4: Optimisation GCS (1h)
- [ ] Implémenter `returnBase64: false`
- [ ] Modifier format réponse
- [ ] Tester avec gros fichiers

### Étape 5: Inpainting / Mask (2h)
- [ ] Ajouter paramètre `mask` à composeScene
- [ ] Implémenter logique inpainting
- [ ] Documenter usage

### Étape 6: Documentation (1h)
- [ ] Mettre à jour docs/n8n/gemini-image-mcp-server.md
- [ ] Ajouter section "Pipeline Image→Video"
- [ ] Documenter nouveaux paramètres

## Fichiers à modifier

```
custom-nodes/n8n-nodes-gemini-image/
├── shared/
│   └── GeminiImageClient.ts      # Migration modèle, nouveaux params
├── nodes/GeminiImage/
│   └── GeminiImage.node.ts       # Options UI
docs/n8n/
└── gemini-image-mcp-server.md    # Documentation
```

## Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| Modèle stable non disponible dans région | Fallback sur preview avec warning |
| Breaking change API modèle | Tester avant déploiement |
| Imagen 3 nécessite setup différent | Phase future, documenter limitation |

## Questions pour l'équipe

1. **File d'attente**: Comment gérer les générations simultanées MCP ?
   - Réponse suggérée: n8n gère nativement via workers

2. **Custom Node vs Node standard**: Nous utilisons un Custom Node pour les fonctions avancées (character sheet, compose scene)

## Références

- [Réponse équipe Gemini](./reponse_image_neo_banana.md)
- [Documentation Gemini Image](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-generation)
- [Imagen 3](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/3-0-generate)
- [Release Notes Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/release-notes)
