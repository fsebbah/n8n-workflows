# RFC-031: Refactoring Torah Translation Pipeline

## Contexte

Le workflow `Torah-Translate-Worker-v2` souffre de problèmes architecturaux avec ses boucles imbriquées (Loop Segments + Loop Chunks). Le `splitInBatches` accumule les items entre les itérations, causant :
- Mélange de données entre segments
- `originalSegmentIndex` incorrect
- Progress qui ne se met pas à jour (toujours 1/N)
- Status "processing" jamais passé à "completed"

## Problème identifié

Quand Loop Chunks termine et retourne à Loop Segments pour le segment suivant, il garde les items accumulés du segment précédent. Cela cause :
1. Recombine Chunks reçoit des items mélangés
2. `isLastSegment` n'est jamais `true`
3. Le job reste en "processing"

## Solution : Architecture Pipeline

Séparer les responsabilités en workers indépendants orchestrés par un Router.

### Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                            APPELANTS                                  │
│              (Discord, PDF, API, MCP, etc.)                          │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     TORAH ROUTER                                      │
│  Endpoint: POST /webhook/torah-router                                 │
│                                                                       │
│  - Analyse le payload                                                 │
│  - Répond immédiatement avec {received: true, job_id}                │
│  - Orchestre les workers en background                                │
│  - Met à jour le progress après chaque segment                        │
│  - Collecte les erreurs via Error Handler                            │
│  - Marque le job "completed" ou "completed_with_errors"              │
└──────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  CHUNK WORKER   │  │TRANSLATE WORKER │  │  SAVE WORKER    │
│  /torah-chunk   │  │ /torah-translate│  │  /torah-save    │
│                 │  │                 │  │                 │
│ Découpe texte   │  │ Traduit segment │  │ Sauvegarde en   │
│ long en chunks  │  │ (pivot/direct)  │  │ DB via API      │
│                 │  │ Sans sauvegarde │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ ERROR HANDLER   │
                    │ /torah-error    │
                    │                 │
                    │ Collecte les    │
                    │ erreurs par job │
                    └─────────────────┘
```

### Workflows

| Workflow | Endpoint | Responsabilité |
|----------|----------|----------------|
| **Torah Router** | `/webhook/torah-router` | Dispatcher + Orchestrateur |
| **Torah Chunk Worker** | `/webhook/torah-chunk` | Découpe texte > 10K chars |
| **Torah Translate Worker** | `/webhook/torah-translate` | Traduit (sans save) |
| **Torah Save Worker** | `/webhook/torah-save` | Sauvegarde en DB |
| **Torah Error Handler** | `/webhook/torah-error` | Collecte erreurs |

## Cas d'usage

### Cas 1 : Texte long (document 15 pages)

```
Router reçoit {text: "...", source_text_id: "doc-123", job_id: "xxx"}
  │
  ├─ Détecte : texte > 10K chars
  │
  ├─ Chunk Worker : découpe en 5 segments
  │   └─ Retourne segments[]
  │
  ├─ Pour chaque segment (i = 1 à 5) :
  │   ├─ Translate Worker : traduit segment[i]
  │   │   └─ Retourne {translation: "..."}
  │   └─ Update Progress {current: i, total: 5}
  │
  ├─ Combine les traductions
  │
  ├─ Save Worker : sauvegarde 1 enregistrement
  │   └─ {source_text_id: "doc-123", translation: combiné}
  │
  └─ Update Job {status: "completed"}
```

### Cas 2 : Batch de commentaires

```
Router reçoit {segments: [{commentary_id: "c1", text: "..."}, ...], job_id: "xxx"}
  │
  ├─ Détecte : batch de commentaires
  │
  ├─ Vérifie : aucun segment > 10K (sinon erreur)
  │
  ├─ Pour chaque segment (i = 1 à N) :
  │   ├─ Translate Worker : traduit segment[i]
  │   │   └─ Retourne {translation: "..."} ou ERREUR
  │   │
  │   ├─ Si ERREUR :
  │   │   └─ Error Handler : enregistre l'erreur
  │   │
  │   ├─ Si OK :
  │   │   └─ Save Worker : sauvegarde
  │   │       └─ {commentary_id: segment.commentary_id, translation}
  │   │
  │   └─ Update Progress {current: i, total: N}
  │
  └─ Update Job {status: "completed" ou "completed_with_errors"}
```

### Cas 3 : Texte court unique

```
Router reçoit {text: "...", source_text_id: "st-456", job_id: "xxx"}
  │
  ├─ Détecte : texte court < 10K
  │
  ├─ Translate Worker : traduit
  │   └─ Retourne {translation: "..."}
  │
  ├─ Save Worker : sauvegarde
  │   └─ {source_text_id: "st-456", translation}
  │
  └─ Update Job {status: "completed"}
```

## Flux de communication

```
┌─────────┐      ┌──────────────────┐      ┌─────────────┐
│ Discord │      │ Torah-Discord    │      │ Torah Router│
│ (user)  │      │ (workflow n8n)   │      │ (workflow)  │
└────┬────┘      └────────┬─────────┘      └──────┬──────┘
     │                    │                       │
     │ !translate ...     │                       │
     │───────────────────>│                       │
     │                    │                       │
     │                    │ POST /api/v2/jobs     │
     │                    │──────────────────────>│ (API backend)
     │                    │<── {job_id: "xxx"}    │
     │                    │                       │
     │                    │ POST /webhook/torah-router
     │                    │──────────────────────>│
     │                    │<── {received: true}   │ ← Réponse immédiate
     │                    │                       │
     │<── "Job créé,      │                       │
     │    ID: xxx"        │                       │
     │                    │                       │
     │                    │         ┌─────────────┴─────────────┐
     │                    │         │ Router orchestre          │
     │                    │         │ (Chunk → Translate → Save)│
     │                    │         │ Update progress...        │
     │                    │         └───────────────────────────┘
     │                    │                       │
     │ (poll job status)  │                       │
     │───────────────────>│ GET /api/v2/jobs/xxx  │
     │<── "En cours 2/5"  │                       │
     │                    │                       │
     │ (poll job status)  │                       │
     │───────────────────>│ GET /api/v2/jobs/xxx  │
     │<── "Terminé ✓"     │                       │
```

## Gestion des erreurs

### Error Handler

**Endpoint :** `POST /webhook/torah-error`

**Payload :**
```json
{
  "job_id": "xxx",
  "segment_index": 3,
  "worker": "translate",
  "error": {
    "code": "CLAUDE_TIMEOUT",
    "message": "Request timeout after 180s"
  },
  "context": {
    "text_preview": "הראשונים...",
    "char_count": 5000
  }
}
```

### Stratégie

- Si un segment échoue : **continuer** avec les autres
- Enregistrer l'erreur via Error Handler
- À la fin, marquer le job avec le status approprié :
  - `completed` : tous les segments OK
  - `completed_with_errors` : certains segments en erreur
  - `failed` : erreur critique (ex: tous les segments échoués)

### Résultat final avec erreurs

```json
{
  "job_id": "xxx",
  "status": "completed_with_errors",
  "progress": {"current": 5, "total": 5, "percentage": 100},
  "errors": [
    {"segment_index": 3, "worker": "translate", "error": "CLAUDE_TIMEOUT"}
  ],
  "successful_segments": [0, 1, 2, 4]
}
```

## Payload du Router

### Input

```json
{
  "job_id": "uuid",
  "job_type": "batch_commentaries | unit_translation | document_translation",
  "text": "...",                    // Pour texte unique
  "segments": [                     // Pour batch
    {"commentary_id": "uuid", "text": "..."},
    {"source_text_id": "uuid", "text": "..."}
  ],
  "traite": "Pesachim",
  "page": "2b",
  "section": "Introduction",        // Optionnel
  "commentator": "Rashi",           // Optionnel
  "source_language": "he",
  "target_language": "fr",
  "api_key": "sk-ant-...",
  "openai_api_key": "sk-proj-...",  // Optionnel
  "context": {},
  "metadata": {},
  "request_id": "req_xxx"
}
```

### Output immédiat

```json
{
  "received": true,
  "job_id": "xxx",
  "segments_count": 5,
  "pipeline": "chunk -> translate -> save"
}
```

## Plan d'implémentation

### Phase 1 : Router + Translate Worker simplifié

1. [ ] Créer `Torah-Router.json`
   - Webhook `/webhook/torah-router`
   - Analyse payload et décide du pipeline
   - Répond immédiatement
   - Orchestre les workers

2. [ ] Simplifier `Torah-Translate-Worker-v2.json` → `Torah-Translate-Worker.json`
   - Retirer Loop Chunks, Recombine Chunks
   - Retirer Save Translation
   - Garder uniquement la traduction (pivot ou direct)
   - Input : 1 segment
   - Output : 1 traduction

### Phase 2 : Save Worker + Error Handler

3. [ ] Créer `Torah-Save-Worker.json`
   - Webhook `/webhook/torah-save`
   - Appelle `/api/translations/save`
   - Gère les différents types d'ID (commentary_id, source_text_id)

4. [ ] Créer `Torah-Error-Handler.json`
   - Webhook `/webhook/torah-error`
   - Stocke les erreurs (Redis ou API)

### Phase 3 : Chunk Worker

5. [ ] Créer `Torah-Chunk-Worker.json`
   - Webhook `/webhook/torah-chunk`
   - Utilise Claude Smart Split
   - Input : 1 texte long
   - Output : N segments

### Phase 4 : Migration

6. [ ] Modifier `Torah-Discord-Translation-v2-Unified.json`
   - Appeler `/webhook/torah-router` au lieu de `/webhook/torah-translate-worker`

7. [ ] Modifier `MCP-PDF-Layout-Translator.json`
   - Appeler `/webhook/torah-router`

8. [ ] Archiver l'ancien workflow
   - Renommer `Torah-Translate-Worker-v2.json` → `Torah-Translate-Worker-v2-deprecated.json`

## Tests

- [ ] Test batch 3 commentaires courts
- [ ] Test texte unique court
- [ ] Test texte unique long (> 10K chars)
- [ ] Test avec erreur sur 1 segment
- [ ] Test timeout Claude
- [ ] Test progress updates

## Rollback

En cas de problème :
1. Réactiver `Torah-Translate-Worker-v2.json`
2. Modifier les appelants pour pointer vers l'ancien endpoint
3. Désactiver le Router

## Références

- Exécution problématique : http://host2.local:5678/workflow/DxfUNwlrIU4XyTAq/executions/63248
- Workflow actuel : `workflows/Torah-Translate-Worker-v2.json`
- Workflows appelants :
  - `workflows/Torah-Discord-Translation-v2-Unified.json`
  - `workflows/MCP-PDF-Layout-Translator.json`
