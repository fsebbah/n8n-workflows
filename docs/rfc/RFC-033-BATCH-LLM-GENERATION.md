# RFC-033 : Génération LLM en mode Batch

**Date:** 2026-02-12
**Statut:** Draft
**Auteur:** Équipe n8n
**Équipes concernées:** n8n, api-backend, plugin-recipes, chatbot-core

---

## 1. Résumé exécutif

### Problème

Les workflows de génération de contenu (cours, quiz) via LLM souffrent de :
- **Timeouts** : Génération de cours complet = 2-5 minutes (timeout HTTP dépassé)
- **Blocage ressources** : Le webhook reste ouvert pendant toute la génération
- **Mauvaise UX** : L'utilisateur attend sans feedback

### Solution proposée

Implémenter un système de **traitement batch asynchrone** :
1. Le webhook retourne immédiatement un `job_id`
2. La génération s'exécute en arrière-plan
3. L'utilisateur est notifié à la fin (Discord/callback)

### Bénéfices

| Aspect | Avant | Après |
|--------|-------|-------|
| Temps de réponse webhook | 2-5 min | < 1 sec |
| Feedback utilisateur | Aucun (attente) | Immédiat + notification |
| Ressources n8n | Bloquées | Libérées |
| Gestion erreurs | Timeout brutal | Retry + DLQ |

---

## 2. Architecture

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Plugin / Chatbot-core                            │
│  POST /learning-generate-course {prompt, topic, ...}                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              WORKFLOW: LEARNING-Generate-Course-Dispatcher           │
│                                                                      │
│  1. Valide les paramètres                                           │
│  2. Génère job_id unique                                            │
│  3. Stocke job dans Redis (status: pending, TTL: 1h)                │
│  4. Retourne {job_id, status: "processing", eta: "2-3 min"}        │
│  5. Trigger async → Worker workflow                                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Execute Workflow - async)
┌─────────────────────────────────────────────────────────────────────┐
│              WORKFLOW: LEARNING-Generate-Course-Worker               │
│                                                                      │
│  1. Met à jour Redis: status = "generating"                         │
│  2. Appelle Claude API (timeout 10min)                              │
│  3. Parse le résultat JSON                                          │
│  4. POST /api/courses → Sauvegarde en DB                            │
│  5. Met à jour Redis: status = "completed", result_url = "..."      │
│  6. Notifie l'utilisateur (Discord ou callback_url)                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Notification utilisateur                         │
│                                                                      │
│  Option A: Discord embed avec lien vers le cours                    │
│  Option B: POST callback_url fournie dans la requête initiale       │
│  Option C: Polling GET /job/{job_id}/status (fallback)              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Stockage Redis

**Clé:** `job:learning:{job_id}`
**TTL:** 3600 secondes (1 heure)

```json
{
  "job_id": "course_1707735600123",
  "type": "course_generation",
  "status": "pending|generating|completed|failed",
  "created_at": "2026-02-12T10:00:00Z",
  "updated_at": "2026-02-12T10:02:30Z",
  "input": {
    "topic": "cuisine écossaise",
    "level": "debutant",
    "guild_id": "1458159736775119115",
    "instructor_id": "636639897767378954"
  },
  "result": {
    "course_id": "uuid-xxx",
    "course_url": "/courses/uuid-xxx",
    "title": "Maîtriser la cuisine écossaise"
  },
  "error": null,
  "callback_url": "https://...",
  "discord_channel_id": "123456789"
}
```

### 2.3 Statuts du job

| Status | Description | Transition |
|--------|-------------|------------|
| `pending` | Job créé, en attente de traitement | → generating |
| `generating` | LLM en cours de génération | → completed / failed |
| `completed` | Cours généré et sauvegardé | Terminal |
| `failed` | Erreur (après retries) | Terminal |

---

## 3. Workflows n8n

### 3.1 Dispatcher (nouveau)

**Nom:** `LEARNING-Generate-Course-Dispatcher`
**Webhook:** `POST /learning-generate-course`
**Réponse:** Immédiate (< 1 sec)

**Nodes:**
1. Webhook (POST, responseMode: lastNode)
2. Validate Input (Code)
3. Generate Job ID (Code)
4. Store Job in Redis (Redis SET avec TTL)
5. Trigger Worker (Execute Workflow - async)
6. Respond with Job ID (Respond to Webhook)

**Payload de réponse:**
```json
{
  "success": true,
  "job_id": "course_1707735600123",
  "status": "processing",
  "message": "Génération du cours en cours...",
  "eta_seconds": 180,
  "check_status_url": "/webhook/job-status/course_1707735600123"
}
```

### 3.2 Worker (nouveau)

**Nom:** `LEARNING-Generate-Course-Worker`
**Trigger:** Execute Workflow (appelé par Dispatcher)
**Réponse:** Aucune (fire-and-forget)

**Nodes:**
1. Receive Job Data
2. Update Redis Status → "generating"
3. Call Claude API (timeout 600000ms)
4. Parse LLM Response
5. IF Success → Save Course to API
6. Update Redis → "completed" + result
7. Send Notification (Discord ou callback)
8. IF Error → Update Redis → "failed" + error

### 3.3 Status Endpoint (nouveau)

**Nom:** `LEARNING-Job-Status`
**Webhook:** `GET /job-status/:job_id`

**Réponse:**
```json
{
  "job_id": "course_1707735600123",
  "status": "completed",
  "result": {
    "course_id": "uuid-xxx",
    "title": "Maîtriser la cuisine écossaise"
  }
}
```

---

## 4. Intégration avec les équipes

### 4.1 Équipe n8n (owner)

**Responsabilités:**
- Créer les 3 nouveaux workflows (Dispatcher, Worker, Status)
- Adapter les workflows existants Course/Quiz
- Tests d'intégration

**Livrables:**
- [ ] `LEARNING-Generate-Course-Dispatcher.json`
- [ ] `LEARNING-Generate-Course-Worker.json`
- [ ] `LEARNING-Generate-Quiz-Dispatcher.json`
- [ ] `LEARNING-Generate-Quiz-Worker.json`
- [ ] `LEARNING-Job-Status.json`

### 4.2 Équipe api-backend

**Responsabilités:**
- Confirmer les endpoints existants pour save course/quiz
- (Optionnel) Endpoint `GET /api/jobs/{job_id}` si besoin de persistance DB

**Questions:**
1. L'endpoint `POST /api/courses` accepte-t-il le format JSON généré ?
2. Faut-il un endpoint dédié pour les jobs ou Redis suffit ?

### 4.3 Équipe plugin-recipes

**Responsabilités:**
- Adapter l'appel au webhook (réponse asynchrone)
- Gérer le `job_id` retourné
- Implémenter le polling ou écouter la notification

**Changements requis:**
```python
# Avant (synchrone)
response = await httpx.post("/learning-generate-course", json=payload)
course = response.json()["course"]

# Après (asynchrone)
response = await httpx.post("/learning-generate-course", json=payload)
job_id = response.json()["job_id"]

# Option A: Attendre notification Discord
# Option B: Polling
while True:
    status = await httpx.get(f"/job-status/{job_id}")
    if status["status"] in ["completed", "failed"]:
        break
    await asyncio.sleep(5)
```

### 4.4 Équipe chatbot-core

**Responsabilités:**
- (Si notification Discord) Recevoir et afficher le résultat
- Gérer le message de "génération en cours"

**Questions:**
1. Quel channel Discord pour les notifications ?
2. Format du message embed souhaité ?

---

## 5. Plan d'implémentation

### Phase 1: Infrastructure (Semaine 1)

| Tâche | Équipe | Priorité |
|-------|--------|----------|
| Créer workflow Dispatcher | n8n | P0 |
| Créer workflow Worker | n8n | P0 |
| Créer workflow Status | n8n | P1 |
| Valider accès Redis depuis n8n | n8n | P0 |

### Phase 2: Intégration (Semaine 2)

| Tâche | Équipe | Priorité |
|-------|--------|----------|
| Adapter plugin-recipes | plugin-recipes | P0 |
| Configurer notification Discord | chatbot-core | P1 |
| Tests E2E | all | P0 |

### Phase 3: Migration (Semaine 3)

| Tâche | Équipe | Priorité |
|-------|--------|----------|
| Déployer en prod | n8n + infra | P0 |
| Désactiver anciens workflows | n8n | P1 |
| Monitoring & alerting | infra | P1 |

---

## 6. Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Redis indisponible | Jobs perdus | Fallback DB ou retry |
| Worker timeout | Job bloqué en "generating" | TTL + cleanup cron |
| Notification échoue | User pas informé | Polling comme fallback |
| Double processing | Cours dupliqués | Lock Redis sur job_id |

---

## 7. Métriques de succès

- **Temps de réponse webhook** < 500ms (P99)
- **Taux de complétion jobs** > 95%
- **Temps moyen de génération** < 3 min
- **Taux de notification** > 99%

---

## 8. Questions ouvertes

1. **Callback vs Discord vs Polling** - Quelle méthode de notification privilégier ?
2. **Retry policy** - Combien de retries avant de marquer "failed" ?
3. **Historique** - Garder les jobs en Redis (TTL 1h) ou persister en DB ?
4. **Rate limiting** - Limiter le nombre de jobs par guild/user ?

---

## Annexe A: Exemple de flux complet

```
1. User: "Génère un cours sur la cuisine écossaise"

2. Plugin → POST /learning-generate-course
   {
     "prompt": "...",
     "topic": "cuisine écossaise",
     "guild_id": "123",
     "callback_url": "https://plugin.example.com/callback"
   }

3. Dispatcher → Respond (< 1 sec)
   {
     "job_id": "course_xxx",
     "status": "processing"
   }

4. Plugin → User: "🔄 Génération en cours... (2-3 min)"

5. Worker → Claude API (2 min)

6. Worker → POST /api/courses (save)

7. Worker → Redis SET job:learning:course_xxx {status: completed}

8. Worker → POST callback_url OR Discord notification
   {
     "job_id": "course_xxx",
     "status": "completed",
     "course_id": "uuid-yyy",
     "title": "Maîtriser la cuisine écossaise"
   }

9. Plugin → User: "✅ Cours généré! [Voir le cours](link)"
```
