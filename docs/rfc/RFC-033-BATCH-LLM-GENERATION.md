# RFC-033 : Génération LLM en mode Batch

**Date:** 2026-02-12
**Statut:** Approuvé (en attente implémentation)
**Auteur:** Équipe n8n
**Équipes concernées:** n8n, api-backend, plugin-recipes, chatbot-core
**Dernière mise à jour:** 2026-02-12

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

### 2.1 Vue d'ensemble (Architecture Queue simplifiée)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Plugin / Chatbot-core                            │
│  POST /learning-generate {prompt, topic, type: "course|quiz", ...}  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              WORKFLOW: LEARNING-Generate-Dispatcher (unifié)         │
│                                                                      │
│  1. Valide les paramètres (type auto-détecté si non fourni)         │
│  2. Génère job_id unique avec préfixe (course_xxx ou quiz_xxx)      │
│  3. Stocke job dans Redis (status: pending, TTL: 1h)                │
│  4. RPUSH job_id dans queue:learning                                │
│  5. Retourne {job_id, status: "pending"} immédiatement              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ (pas de trigger direct)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              WORKFLOW: LEARNING-Generate-Worker (cron 30s)           │
│                                                                      │
│  1. LPOP queue:learning → récupère job_id                           │
│  2. Si queue vide → arrêt                                           │
│  3. GET job:learning:{job_id} → récupère données complètes          │
│  4. Met à jour Redis: status = "generating"                         │
│  5. Switch sur type (course/quiz)                                   │
│  6. Appelle Claude API (timeout 5-10min)                            │
│  7. Parse le résultat JSON                                          │
│  8. POST vers API (formations ou quizzes)                           │
│  9. Met à jour Redis: status = "done"                               │
│  10. Notifie Discord                                                 │
│  11. Met à jour Redis: status = "terminate" (TTL 5min)              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Notification utilisateur                         │
│                                                                      │
│  Discord direct via bot_token fourni par le plugin                  │
│  Polling GET /job-status/{job_id} (fallback)                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Avantages de l'architecture Queue:**
- **Pas de Worker IDs** : Plus besoin de configurer des variables d'environnement
- **Résilience** : Si le Worker échoue, le job reste dans la queue
- **Scalabilité** : Plusieurs Workers peuvent consommer la même queue
- **Simplicité** : Un seul Dispatcher et un seul Worker pour tous les types

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
| `pending` | Job créé, en attente dans la queue | → generating |
| `generating` | LLM en cours de génération | → done / failed |
| `done` | Cours/Quiz généré, sauvegardé, notifié | → terminate |
| `terminate` | Job terminé (TTL 5min puis suppression) | Terminal |
| `failed` | Erreur (après retries) | Terminal |

---

## 3. Workflows n8n

### 3.1 Dispatcher (unifié)

**Nom:** `LEARNING-Generate-Dispatcher`
**Webhook:** `POST /learning-generate`
**Réponse:** Immédiate (< 1 sec)

**Nodes:**
1. Webhook (POST, responseMode: lastNode)
2. Validate Input (Code) - détecte automatiquement le type (course/quiz)
3. Store Job in Redis (SET avec TTL 1h)
4. Push to Queue (RPUSH queue:learning)
5. Respond with Job ID

**Payload de réponse:**
```json
{
  "success": true,
  "job_id": "course_1707735600123",
  "type": "course",
  "status": "pending",
  "message": "Génération du cours en cours..."
}
```

### 3.2 Worker (cron)

**Nom:** `LEARNING-Generate-Worker`
**Trigger:** Schedule (every 30 seconds)
**Réponse:** Aucune

**Nodes:**
1. Cron Trigger (30s)
2. Pop Job from Queue (LPOP queue:learning)
3. IF queue vide → arrêt
4. Get Job Data (GET job:learning:{job_id})
5. Parse Job Data
6. Update Status → "generating"
7. Switch (quiz/course)
8. Call Claude API (timeout 5-10min selon type)
9. Parse Response
10. Save to API (formations ou quizzes)
11. Update Status → "done"
12. Notify Discord
13. Update Status → "terminate" (TTL 5min)
14. IF Error → Update Status → "failed" + Notify Discord error

### 3.3 Status Endpoint

**Nom:** `LEARNING-Job-Status`
**Webhook:** `GET /job-status/:job_id`

**Réponse:**
```json
{
  "job_id": "course_1707735600123",
  "type": "course",
  "status": "done",
  "result": {
    "id": "uuid-xxx",
    "title": "Maîtriser la cuisine écossaise"
  }
}
```

---

## 4. Intégration avec les équipes

### 4.1 Équipe n8n (owner)

**Responsabilités:**
- Créer les workflows unifiés (Dispatcher, Worker, Status)
- Supprimer les anciens workflows synchrones
- Tests d'intégration

**Livrables:**
- [x] `LEARNING-Generate-Dispatcher.json` (unifié course/quiz)
- [x] `LEARNING-Generate-Worker.json` (cron-based, unifié)
- [x] `LEARNING-Job-Status.json`
- [x] Suppression de `LEARNING-Generate-Course.json` (ancien)
- [x] Suppression de `LEARNING-Generate-Quiz.json` (ancien)

### 4.2 Équipe api-backend

**Responsabilités:**
- Confirmer les endpoints existants pour save course/quiz
- ~~(Optionnel) Endpoint `GET /api/jobs/{job_id}` si besoin de persistance DB~~

**Questions:**
1. L'endpoint `POST /api/courses` accepte-t-il le format JSON généré ?
2. ~~Faut-il un endpoint dédié pour les jobs ou Redis suffit ?~~

**Réponses api-backend (2026-02-12):**
1. **`POST /api/courses` n'existe pas** dans le backend actuel. Les cours sont gérés
   côté training domain (`/api/training/formations`). Le Worker n8n devra soit
   utiliser l'endpoint existant `POST /api/training/formations` (adapter le payload),
   soit sauvegarder directement en DB via SQL dans le workflow n8n.
2. **Redis suffit.** C'est du one-shot : pas besoin de persistance DB ni d'endpoint
   `GET /api/jobs/{job_id}`. Le TTL Redis de 1h est largement suffisant pour le
   polling et la notification. Pas d'historique nécessaire.

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

**Réponses plugin-recipes (2026-02-12):**

**Option retenue : Discord direct** (recommandé par chatbot-core)

Justification :
- Le plugin injecte déjà `bot_token` dans les webhooks learning (implémenté)
- Pas besoin d'infrastructure callback HTTP côté plugin
- L'utilisateur reçoit la notification directement sur Discord
- Simplicité d'implémentation : le plugin affiche juste "génération en cours"

**Implémentation prévue dans `executor.py`:**

```python
async def _execute_learning(self, tool, params, context):
    # ... construction du payload existant ...

    # Ajouter les infos pour notification Discord direct
    payload["bot_token"] = self.bot.http.token  # Déjà implémenté
    payload["discord_channel_id"] = context.get("channel_id", "")
    payload["user_id"] = context.get("user_id", "")

    # Appel webhook
    response = await self._call_webhook(tool, payload)

    # Nouvelle logique async
    if response.get("job_id"):
        # Job créé, n8n notifiera via Discord
        return {
            "success": True,
            "message": f"Génération en cours... (job: {response['job_id']})",
            "async": True
        }
    else:
        # Réponse synchrone (fallback ou ancien workflow)
        return response
```

**Message utilisateur immédiat** (étape 4 de l'Annexe A) :
Le plugin affiche un embed avec :
- Titre : "Génération en cours..."
- Description : "Votre cours sur **{topic}** est en cours de création."
- Footer : "Vous serez notifié quand ce sera terminé (2-3 min)"

**Pas de polling** : n8n envoie directement sur Discord via l'API avec le `bot_token`.

### 4.4 Équipe chatbot-core

**Responsabilités:**
- (Si notification Discord) Recevoir et afficher le résultat
- Gérer le message de "génération en cours"

**Questions:**
1. Quel channel Discord pour les notifications ?
2. Format du message embed souhaité ?

**Réponses chatbot-core (2026-02-12):**

**Aucun développement requis côté chatbot-core.**

Rappel architectural : chatbot-core est une **bibliothèque Python**, pas un service.
Elle ne peut pas "recevoir" de notifications.

**Recommandation pour les notifications :**

| Option | Implémentation | Équipe responsable |
|--------|----------------|-------------------|
| **callback_url** (recommandé) | Le plugin fournit une URL, n8n POST le résultat | plugin-recipes |
| **Discord direct** | n8n envoie via Discord API avec `bot_token` | n8n |
| **Polling** | Le plugin poll `/job-status/{job_id}` | plugin-recipes |

Pour l'option Discord direct, le plugin doit fournir dans la requête initiale :
```json
{
  "bot_token": "...",
  "discord_channel_id": "123456789",
  "user_id": "987654321"
}
```

Le Worker n8n peut alors envoyer directement via `POST https://discord.com/api/v10/channels/{channel_id}/messages`.

**Message "génération en cours" :** C'est le plugin qui l'affiche (étape 4 de l'Annexe A),
pas chatbot-core. Le plugin reçoit le `job_id` et affiche immédiatement un message à l'utilisateur.

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
| Adapter plugin-recipes (async + channel_id) | plugin-recipes | P0 |
| Implémenter notification Discord direct | n8n | P0 |
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

1. ~~**Callback vs Discord vs Polling** - Quelle méthode de notification privilégier ?~~
   **Résolu:** Discord direct retenu (plugin-recipes fournit `bot_token`, n8n notifie)
2. ~~**Retry policy** - Combien de retries avant de marquer "failed" ?~~
   **Proposition n8n:** 3 retries avec backoff exponentiel (30s, 60s, 120s)
3. ~~**Historique** - Garder les jobs en Redis (TTL 1h) ou persister en DB ?~~
   **Résolu:** Redis suffit, TTL 1h (api-backend)
4. ~~**Rate limiting** - Limiter le nombre de jobs par guild/user ?~~
   **Proposition n8n:** 5 jobs/heure/user max (évite abus, vérifié via Redis INCR avec TTL)

---

## 9. Résumé des décisions

| Question | Décision | Source |
|----------|----------|--------|
| Notification | Discord direct via `bot_token` | plugin-recipes + chatbot-core |
| Endpoint cours | `POST /api/training/formations` | api-backend |
| Stockage jobs | Redis TTL 1h | api-backend |
| Retry policy | 3 retries, backoff exponentiel | n8n (proposition) |
| Rate limiting | 5 jobs/h/user | n8n (proposition) |

---

## 10. Statut final

**RFC-033 : IMPLÉMENTÉ** (architecture queue simplifiée)

| Équipe | Statut | Actions |
|--------|--------|---------|
| api-backend | ✅ Validé | Aucune action requise |
| plugin-recipes | ✅ Validé | Ajouter `discord_channel_id`, `user_id` au payload |
| chatbot-core | ✅ Validé | Aucune action requise |
| n8n | ✅ Implémenté | 3 workflows créés (PR #304) |

### Changement d'architecture (2026-02-12)

L'architecture initiale (4 workflows avec Worker IDs) a été simplifiée :
- **Avant** : Dispatcher trigger Worker via Execute Workflow (nécessite Worker ID)
- **Après** : Dispatcher push dans queue Redis, Worker poll avec cron

**Avantages:**
- Pas de variables d'environnement Worker ID à configurer
- Plus résilient (job reste dans queue si Worker échoue)
- Un seul Dispatcher et Worker au lieu de 4 workflows

---

## Annexe A: Exemple de flux complet (Discord direct)

```
1. User: "Génère un cours sur la cuisine écossaise"

2. Plugin → POST /learning-generate-course
   {
     "prompt": "...",
     "topic": "cuisine écossaise",
     "guild_id": "123",
     "instructor_id": "456",
     "bot_token": "Bot xxx...",
     "discord_channel_id": "789",
     "user_id": "456"
   }

3. Dispatcher → Respond (< 1 sec)
   {
     "job_id": "course_xxx",
     "status": "processing"
   }

4. Plugin → User (embed Discord):
   "🔄 Génération en cours...
    Votre cours sur **cuisine écossaise** est en cours de création.
    Vous serez notifié quand ce sera terminé (2-3 min)"

5. Worker → Claude API (2 min)

6. Worker → POST /api/training/formations (save)

7. Worker → Redis SET job:learning:course_xxx {status: completed}

8. Worker → POST https://discord.com/api/v10/channels/{channel_id}/messages
   Headers: Authorization: Bot {bot_token}
   Body: {
     "content": "<@456>",
     "embeds": [{
       "title": "✅ Cours généré !",
       "description": "**Maîtriser la cuisine écossaise**",
       "url": "https://app.example.com/courses/uuid-yyy",
       "color": 5763719
     }]
   }

9. User voit la notification Discord avec le lien vers le cours
```
