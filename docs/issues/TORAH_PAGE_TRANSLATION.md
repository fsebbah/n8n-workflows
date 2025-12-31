# Traduction de Page Talmud - Analyse et Spécifications

> **Date:** 2025-12-31
> **Status:** En cours d'implémentation
> **Mode:** Polling (Option B)

---

## Résumé

Workflow asynchrone pour traduire une page complète du Talmud (10-20 segments) avec double LLM (Claude + GPT-4o).

---

## Architecture retenue

```
Bot Discord                              n8n
    │                                      │
    │  POST /torah-translate-page          │
    │  {traite, page}                      │
    │ ────────────────────────────────────►│
    │                                      │
    │  { job_id: "xxx" }                   │
    │ ◄────────────────────────────────────│
    │                                      │
    │      (n8n travaille en background)   │
    │                                      │
    │  GET /torah-job-status?job_id=xxx    │
    │ ────────────────────────────────────►│  (toutes les 5s)
    │  { progress: "3/12", status: "..." } │
    │ ◄────────────────────────────────────│
    │         ...                          │
    │                                      │
    │  GET /torah-job-status?job_id=xxx    │
    │ ────────────────────────────────────►│
    │  { status: "complete" }              │
    │ ◄────────────────────────────────────│
    │                                      │
    ▼ Bot met à jour Discord               │
```

---

## Scope

| Élément | Inclus | Commentaire |
|---------|--------|-------------|
| Segments texte principal | ✅ Oui | 10-20 segments/page |
| Commentaires (Rashi, etc.) | ❌ Non | Phase 2 |
| Vocalisation (nekudot) | ❌ Non | Workflow séparé existant |

---

## Équipe API

### Endpoints existants

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /api/talmud/traites` | Liste des traités | ✅ OK |
| `GET /api/talmud/traite/{traite}/pages` | Liste des pages | ✅ OK |
| `GET /api/talmud/text/{traite}/{page}` | Contenu page + segments | ✅ OK |
| `POST /api/translations/save` | Sauvegarder traduction | ✅ OK |
| `POST /api/vocalization/save` | Sauvegarder vocalisation | ✅ OK |

### Endpoints à créer

| Endpoint | Description | Priorité |
|----------|-------------|----------|
| `GET /api/talmud/page-status/{traite}/{page}` | Statut traduction page | Haute |
| `POST /api/jobs` | Créer un job | Moyenne |
| `GET /api/jobs/{job_id}` | Récupérer statut job | Moyenne |
| `PATCH /api/jobs/{job_id}` | Mettre à jour job | Moyenne |

### Format réponse page-status (à créer)

```json
GET /api/talmud/page-status/Berakhot/2a

{
  "reference": "Berakhot 2a",
  "source_text_id": "uuid",
  "has_translation": false,
  "has_vocalization": false,
  "vocalized_by": null,
  "segments": {
    "total": 14,
    "translated": 0
  },
  "commentaries": {
    "total": 135,
    "vocalized": 0,
    "translated": 0
  }
}
```

### Structure d'une page (rappel)

```json
GET /api/talmud/text/Berakhot/2a

{
  "id": "uuid",
  "reference": "Berakhot 2a",
  "text": "... texte complet ...",
  "hebrew_text": "...",
  "extra_data": {
    "versions": [{
      "text": [
        "Segment 0: מֵאֵימָתַי קוֹרִין...",
        "Segment 1: וַחֲכָמִים אוֹמְרִים...",
        "Segment 2: רַבָּן גַּמְלִיאֵל אוֹמֵר...",
        // ... 14 segments pour cette page
      ]
    }]
  },
  "commentaries": [...],
  "commentaries_count": 135
}
```

### Questions pour l'équipe API

1. **Jobs storage:** Préférez-vous créer les endpoints `/api/jobs/*` ou on utilise un fichier local côté n8n ?
2. **Sauvegarde segments:** `POST /api/translations/save` accepte-t-il un segment individuel ou faut-il un nouvel endpoint ?

---

## Équipe Bot

### Endpoints n8n à utiliser

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/webhook/torah-translate-page` | POST | Démarrer traduction |
| `/webhook/torah-job-status` | GET | Vérifier progression |

### Démarrer une traduction

```bash
POST http://pi6.local:5678/webhook/torah-translate-page
Content-Type: application/json

{
  "traite": "Berakhot",
  "page": "2a",
  "mode": "premium",
  "target_language": "fr"
}
```

**Réponse immédiate:**

```json
{
  "success": true,
  "job_id": "job_abc123",
  "status": "started",
  "traite": "Berakhot",
  "page": "2a",
  "segments_count": 14,
  "estimated_seconds": 120
}
```

### Vérifier le statut (polling toutes les 5s)

```bash
GET http://pi6.local:5678/webhook/torah-job-status?job_id=job_abc123
```

**Réponse en cours:**

```json
{
  "job_id": "job_abc123",
  "status": "in_progress",
  "traite": "Berakhot",
  "page": "2a",
  "progress": {
    "current": 5,
    "total": 14,
    "percentage": 36
  },
  "current_segment": "וַחֲכָמִים אוֹמְרִים...",
  "started_at": "2025-12-31T10:00:00Z"
}
```

**Réponse terminée:**

```json
{
  "job_id": "job_abc123",
  "status": "completed",
  "traite": "Berakhot",
  "page": "2a",
  "progress": {
    "current": 14,
    "total": 14,
    "percentage": 100
  },
  "completed_at": "2025-12-31T10:02:30Z",
  "duration_seconds": 150,
  "translations_saved": 14
}
```

**Réponse erreur:**

```json
{
  "job_id": "job_abc123",
  "status": "failed",
  "error": "Timeout on segment 8",
  "progress": {
    "current": 7,
    "total": 14,
    "percentage": 50
  }
}
```

### Statuts possibles

| Status | Description |
|--------|-------------|
| `started` | Job créé, traduction pas encore démarrée |
| `in_progress` | Traduction en cours |
| `completed` | Tous les segments traduits et sauvegardés |
| `failed` | Erreur (voir champ `error`) |

### Implémentation bot suggérée

```python
async def translate_page(traite: str, page: str):
    # 1. Démarrer le job
    response = await http_client.post(
        "http://pi6.local:5678/webhook/torah-translate-page",
        json={"traite": traite, "page": page, "mode": "premium"}
    )
    job_id = response["job_id"]

    # 2. Envoyer message Discord initial
    message = await channel.send(embed=create_progress_embed(0, response["segments_count"]))

    # 3. Polling toutes les 5 secondes
    while True:
        await asyncio.sleep(5)

        status = await http_client.get(
            f"http://pi6.local:5678/webhook/torah-job-status?job_id={job_id}"
        )

        # Mettre à jour l'embed Discord
        await message.edit(embed=create_progress_embed(
            status["progress"]["current"],
            status["progress"]["total"]
        ))

        if status["status"] == "completed":
            await message.edit(embed=create_success_embed(status))
            break
        elif status["status"] == "failed":
            await message.edit(embed=create_error_embed(status["error"]))
            break
```

### Questions pour l'équipe bot

1. **Intervalle polling:** 5 secondes OK ou préférez-vous configurable ?
2. **Timeout global:** Après combien de temps abandonner le polling ? (suggestion: 10 min)
3. **Retry:** En cas d'erreur réseau sur le polling, retry automatique ?

---

## Équipe n8n

### Workflows à créer

| Workflow | Description | Priorité |
|----------|-------------|----------|
| `torah-translate-page` | Endpoint POST, lance le job | Haute |
| `torah-translate-page-worker` | Sous-workflow background | Haute |
| `torah-job-status` | Endpoint GET statut | Haute |

### Flux de traduction par segment

```
Pour chaque segment (1 à 14):
┌─────────────────────────────────────────────────────────┐
│ 1. Claude traduit (draft)                               │
│    Prompt: "Traduis ce texte talmudique en français..." │
├─────────────────────────────────────────────────────────┤
│ 2. GPT-4o review                                        │
│    Prompt: "Vérifie et corrige cette traduction..."     │
├─────────────────────────────────────────────────────────┤
│ 3. POST /api/translations/save                          │
│    { segment_index, translation, model: "premium" }     │
├─────────────────────────────────────────────────────────┤
│ 4. Mettre à jour statut job                             │
│    { current: N, total: 14 }                            │
└─────────────────────────────────────────────────────────┘
```

### Stockage statut jobs

**Option retenue:** Fichier JSON local (simple, pas de dépendance externe)

```
/tmp/torah-jobs/
├── job_abc123.json
├── job_def456.json
└── ...
```

**Format fichier:**

```json
{
  "job_id": "job_abc123",
  "status": "in_progress",
  "traite": "Berakhot",
  "page": "2a",
  "segments_count": 14,
  "current_segment": 5,
  "started_at": "2025-12-31T10:00:00Z",
  "updated_at": "2025-12-31T10:01:15Z",
  "error": null
}
```

### Estimation temps

| Étape | Temps estimé |
|-------|--------------|
| Claude traduction | ~3s |
| GPT-4o review | ~3s |
| Sauvegarde API | ~0.5s |
| **Total/segment** | ~6-7s |
| **Page 14 segments** | ~90-100s |

---

## Comparatif Options Async

| Critère | Option A (Callback) | Option B (Polling) ✅ |
|---------|---------------------|----------------------|
| Temps réel | ✅ Oui | ❌ ~5s délai |
| Charge n8n | ✅ Faible | ⚠️ 1 req/5s par job |
| Complexité bot | ⚠️ Port à exposer | ✅ Simple |
| Complexité n8n | ✅ Simple | ⚠️ Endpoint status |
| Phase | V2 | **V1 (retenue)** |

---

## Prochaines étapes

### Phase 1 (immédiat)

- [ ] **n8n:** Créer workflow `torah-translate-page`
- [ ] **n8n:** Créer workflow `torah-job-status`
- [ ] **API:** Créer endpoint `GET /api/talmud/page-status/{traite}/{page}`
- [ ] **Bot:** Implémenter polling + mise à jour Discord

### Phase 2 (futur)

- [ ] Traduction des commentaires
- [ ] Mode callback (Option A)
- [ ] Dashboard de suivi des jobs

---

## Historique des décisions

| Date | Décision | Raison |
|------|----------|--------|
| 2025-12-31 | Polling (Option B) | Plus simple, pas de port à exposer |
| 2025-12-31 | Segments uniquement | Commentaires en phase 2 |
| 2025-12-31 | Claude + GPT (mode premium) | Double vérification qualité |
| 2025-12-31 | Fichier JSON local | Pas de dépendance Redis/DB |
