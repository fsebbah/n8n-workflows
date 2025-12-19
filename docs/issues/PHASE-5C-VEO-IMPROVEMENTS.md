# Phase 5C - Améliorations Veo Video

## Contexte

Suite aux recommandations de l'équipe Gemini (voir `docs/issues/reponse_video_neo.md`), cette phase vise à améliorer le node Veo Video avec des fonctionnalités professionnelles.

## Analyse de l'état actuel

### Implémenté (Phase 5A & 5B)

- [x] `generateFromText` - Génération depuis prompt texte
- [x] `generateFromImage` - Animation d'image
- [x] `generateLongVideo` - Chaînage automatique de clips
- [x] `extendVideo` - Extension de vidéo existante
- [x] `optimizePrompt` - Amélioration du prompt via Gemini
- [x] Système de presets (corporate, social, cinematic, etc.)
- [x] Polling avec timeout 5 minutes
- [x] Documentation MCP Server

### À implémenter (Phase 5C)

| Fonctionnalité | Priorité | Complexité | Description |
|----------------|----------|------------|-------------|
| **Seed** | Haute | Faible | Reproductibilité des générations |
| **negativePrompt** | Haute | Faible | Exclure artefacts visuels |
| **fps** | Moyenne | Faible | 24fps (cinéma) ou 30fps (corporate) |
| **outputMode** | Haute | Moyenne | `base64` ou `url` (GCS) |
| **Safety Filters** | Haute | Moyenne | Retourner détail des blocages |
| **Cohérence temporelle** | Critique | Haute | Seed + last_frame pour long videos |
| **FFmpeg concat** | Haute | Haute | Assemblage sans ré-encodage |

## Nouveaux paramètres API

### Paramètres de contrôle

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `seed` | integer | auto | Fixe l'aléatoire pour reproductibilité |
| `negativePrompt` | string | null | Éléments à exclure (ex: "blurry, text, watermark") |
| `fps` | integer | 24 | Frames per second: 24 (cinéma) ou 30 (TV/corporate) |

### Paramètres de sortie

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `outputMode` | string | `base64` | `base64` (petits clips) ou `url` (GCS, recommandé >10s) |
| `gcsBucket` | string | - | Bucket GCS (requis si outputMode=url) |
| `gcsPathPrefix` | string | `veo-videos` | Préfixe du chemin dans le bucket |
| `signedUrlExpirationHours` | number | 24 | Durée de validité de l'URL signée |

## Exemple de requête enrichie

```json
{
  "operation": "generateLongVideo",
  "prompt": "A futuristic train speeding through a neon desert, long exposure light trails",
  "negativePrompt": "low resolution, text, watermark, blurry, distorted limbs",
  "seed": 42,
  "targetDuration": 25,
  "model": "veo-3.1-generate-001",
  "fps": 24,
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "outputMode": "url",
  "gcsBucket": "my-videos-bucket",
  "generateAudio": true,
  "enhancePrompt": false,
  "preset": "cinematic"
}
```

## Exemple de réponse enrichie

```json
{
  "success": true,
  "operation": "generateLongVideo",
  "video": {
    "format": "mp4",
    "durationSeconds": 24,
    "clipCount": 3,
    "clipDurations": [8, 8, 8],
    "fps": 24,
    "seedUsed": 42
  },
  "videoUrl": "https://storage.googleapis.com/my-bucket/veo-videos/video_abc123.mp4",
  "expiresAt": "2024-01-16T10:30:00.000Z",
  "model": "veo-3.1-generate-001",
  "generationTimeSeconds": 180,
  "metadata": {
    "processedAt": "2024-01-15T10:30:00.000Z",
    "processingRegion": "us-central1",
    "promptApplied": "Cinematic wide shot: A futuristic train..."
  }
}
```

## Améliorations techniques

### 1. Cohérence temporelle pour Long Videos

**Problème actuel**: En chaînant 4 clips de 8s, dérive visuelle possible (personnage change, décor évolue).

**Solution**:
```
Clip 1: generate(prompt, seed=42)
Clip 2: extend(last_frame_clip1, prompt, seed=42)
Clip 3: extend(last_frame_clip2, prompt, seed=42)
...
```

- Passer le même `seed` à tous les clips
- Utiliser l'image finale du clip N comme référence pour clip N+1
- Extraire la dernière frame avec FFmpeg: `ffmpeg -sseof -1 -i clip.mp4 -frames:v 1 last_frame.png`

### 2. Assemblage FFmpeg (sans ré-encodage)

**Workflow**:
1. Sauvegarder chaque clip: `/tmp/clip_1.mp4`, `/tmp/clip_2.mp4`, etc.
2. Créer fichier liste `inputs.txt`:
   ```
   file '/tmp/clip_1.mp4'
   file '/tmp/clip_2.mp4'
   file '/tmp/clip_3.mp4'
   ```
3. Concaténer:
   ```bash
   ffmpeg -f concat -safe 0 -i /tmp/inputs.txt -c copy /tmp/final_video.mp4
   ```
4. Nettoyer:
   ```bash
   rm /tmp/clip_*.mp4 /tmp/inputs.txt
   ```

**Avantages**:
- `-c copy`: Copie sans ré-encodage = instantané + qualité préservée
- Fonctionne si tous les clips ont même résolution/fps/codec (garanti avec Veo)

**Note audio**: Micro-coupures possibles entre clips. Pour V1, acceptable. V2 pourrait ajouter crossfade audio.

### 3. Gestion des Safety Filters

**Erreurs à capturer**:
- `SAFETY_REASON_VULGARITY`
- `SAFETY_REASON_VIOLENCE`
- `SAFETY_REASON_SEXUAL`
- `SAFETY_REASON_DANGEROUS`

**Réponse enrichie**:
```json
{
  "success": false,
  "error": {
    "code": "SAFETY_BLOCKED",
    "reason": "SAFETY_REASON_VIOLENCE",
    "message": "Le prompt a été bloqué par les filtres de sécurité Google",
    "suggestion": "Reformulez le prompt pour éviter les éléments violents"
  }
}
```

### 4. Progress Feedback (Polling)

Améliorer le callback `onClipComplete` pour exposer le statut:

```typescript
onClipComplete: (clipNumber: number, totalClips: number, currentDuration: number) => {
  // Émettre un event ou log
  console.log(`Generating clip ${clipNumber}/${totalClips} (${currentDuration}s completed)`);
}
```

## Plan d'implémentation

### Étape 1: Paramètres simples (1h)
- [ ] Ajouter `seed` à VeoVideoOptions
- [ ] Ajouter `negativePrompt` à VeoVideoOptions
- [ ] Ajouter `fps` à VeoVideoOptions
- [ ] Mettre à jour VeoVideo.node.ts

### Étape 2: Output GCS (2h)
- [ ] Ajouter `outputMode`, `gcsBucket`, `gcsPathPrefix`
- [ ] Implémenter upload GCS dans VeoVideoClient
- [ ] Générer URL signée
- [ ] Mettre à jour format de réponse

### Étape 3: Cohérence Long Videos (3h)
- [ ] Extraire last_frame avec FFmpeg
- [ ] Passer seed + last_frame aux clips suivants
- [ ] Tester cohérence sur 30s

### Étape 4: FFmpeg Concat (2h)
- [ ] Implémenter sauvegarde clips temporaires
- [ ] Créer fichier inputs.txt
- [ ] Exécuter FFmpeg concat
- [ ] Nettoyer fichiers temp
- [ ] Retourner vidéo finale

### Étape 5: Safety Filters (1h)
- [ ] Parser erreurs API Vertex
- [ ] Retourner détail du blocage
- [ ] Ajouter suggestions de reformulation

### Étape 6: Documentation (1h)
- [ ] Mettre à jour docs/n8n/veo-video-mcp-server.md
- [ ] Ajouter exemples avec nouveaux paramètres

## Dépendances

- **FFmpeg**: Doit être installé sur le serveur n8n
  ```bash
  sudo apt-get install ffmpeg
  ```
- **Google Cloud Storage**: API activée + credentials avec droits d'écriture

## Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| FFmpeg non installé | Fallback sur base64 sans concat |
| GCS non configuré | Fallback sur base64 |
| Timeout sur long videos | Augmenter timeout polling à 10min |
| Dérive visuelle malgré seed | Documenter limitation, suggérer clips plus courts |

## Références

- [Réponse équipe Gemini](./reponse_video_neo.md)
- [Documentation Veo API](https://cloud.google.com/vertex-ai/docs/generative-ai/video/overview)
- [FFmpeg concat documentation](https://trac.ffmpeg.org/wiki/Concatenate)
