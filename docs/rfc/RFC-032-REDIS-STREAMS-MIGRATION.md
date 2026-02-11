# RFC-032 : Migration des workflows Redis Streams

**Date:** 2026-02-11
**Statut:** Draft
**Auteur:** Équipe n8n
**Équipes concernées:** api-backend, chatbot-core, n8n, infra

---

## 1. Résumé exécutif

### Problème

Le node Redis natif de n8n **ne supporte pas** les opérations Redis Streams :
- `xRead` - Lecture de stream
- `xAdd` - Ajout au stream
- `xAck` - Acknowledge d'un message
- `xLen` - Longueur du stream
- `xRange` - Lecture d'une plage

Ces opérations sont présentes dans **11 workflows** qui sont actuellement **non fonctionnels**.

### Cause racine

Les fichiers JSON des workflows contiennent des nodes Redis avec des opérations non supportées. Ces workflows ont probablement été créés avec une version customisée de n8n ou importés depuis une autre source.

### Impact

| Catégorie | Workflows | Criticité |
|-----------|-----------|-----------|
| Notifications | 3 | Haute |
| Intent/Analytics | 2 | Haute |
| Channels | 2 | Moyenne |
| Alerting | 2 | Moyenne |
| Infra | 1 | Basse |
| MCP | 1 | Basse |

---

## 2. Inventaire des workflows impactés

### 2.1 Workflows utilisant Redis Streams (NON FONCTIONNELS)

| # | Workflow | Opérations | Streams utilisés | Criticité |
|---|----------|------------|------------------|-----------|
| 1 | `N8N - Intent Events Consumer` | xRead, xAck, xAdd | `intent:events`, `intent:dlq` | **Critique** |
| 2 | `ALERT - Intent DLQ Monitor` | xLen, xRange | `intent:dlq` | Haute |
| 3 | `ALERT - Anomaly Detected` | xRead, xAdd | `anomaly:events` | Haute |
| 4 | `NOTIF - Badge Earned` | xRead, xAdd | `notif:badges` | Haute |
| 5 | `NOTIF - Course Expiring` | xRead, xAdd | `notif:course-expiring` | Haute |
| 6 | `NOTIF - Level Up` | xRead, xAdd | `notif:level-up` | Haute |
| 7 | `CHANNELS - Private-Check-Or-Create` | xAdd | `channels:events` | Moyenne |
| 8 | `CHANNELS - Private-Handle-Unknown-Channel` | xAdd | `channels:events` | Moyenne |
| 9 | `COURSE - Expiration-Cron` | xAdd | `course:expiration` | Moyenne |
| 10 | `INFRA - Process-Pending-Events` | xAdd | `infra:pending` | Basse |
| 11 | `MCP - Tools Notify` | xAdd | `mcp:notifications` | Basse |

### 2.2 Workflows Redis fonctionnels (opérations standard)

| Workflow | Opérations | Status |
|----------|------------|--------|
| `CHANNELS - Private-Recovery` | get, delete, push | ✅ OK |
| `CHANNELS - Private-Register-Callback` | push | ✅ OK |
| `DISCORD - Billing Portal` | get | ✅ OK |
| `DISCORD - Get Plans` | get | ✅ OK |
| `DISCORD - Subscribe` | get | ✅ OK |
| `Stripe - Register Project` | set | ✅ OK |
| `Stripe - Subscription Change Plan` | get | ✅ OK |
| `Stripe - Subscription Checkout Create` | get | ✅ OK |
| `Stripe - Webhook Handler` | get | ✅ OK |

---

## 3. Analyse par workflow

### 3.1 N8N - Intent Events Consumer ✅ FAIT

> Voir `RFC-031-OPTION-C-DIRECT-API.md`

---

### 3.2 ALERT - Intent DLQ Monitor

**Fonction:** Surveille la Dead Letter Queue et alerte si des messages échouent.

**Opérations utilisées:**
- `xLen` : Compte le nombre de messages en DLQ
- `xRange` : Récupère un échantillon pour le diagnostic

**Solution proposée:** Option A - **API Endpoint**

Créer un endpoint API qui expose les métriques DLQ :

```
GET /api/intent/dlq/stats
```

**Response:**
```json
{
  "count": 5,
  "oldest_message_age_seconds": 3600,
  "sample": [
    { "stream_id": "...", "error": "...", "failed_at": "..." }
  ]
}
```

**Workflow modifié:**
```
Cron 15min → HTTP GET /api/intent/dlq/stats → Evaluate → Discord Alert
```

**Équipe:** api-backend

---

### 3.3 ALERT - Anomaly Detected

**Fonction:** Détecte des anomalies et les pousse dans un stream pour traitement.

**Opérations utilisées:**
- `xRead` : Lecture des anomalies
- `xAdd` : Écriture des alertes

**Solution proposée:** Option B - **Webhook Push**

Au lieu de polling Redis, l'émetteur d'anomalies appelle directement un webhook n8n.

```
Source anomalie → POST /webhook/alert-anomaly → n8n traite → Discord
```

**Équipe:** Émetteur d'anomalies (à identifier)

---

### 3.4 NOTIF - Badge Earned / Course Expiring / Level Up

**Fonction:** Consomme des streams de notifications et envoie vers Discord.

**Opérations utilisées:**
- `xRead` : Lecture des notifications
- `xAdd` : Écriture de l'historique

**Solution proposée:** Option B - **Webhook Push**

L'API backend pousse directement vers les webhooks n8n au lieu d'écrire dans Redis.

| Event | Webhook n8n |
|-------|-------------|
| Badge earned | `POST /webhook/notif-badge-earned` |
| Course expiring | `POST /webhook/notif-course-expiring` |
| Level up | `POST /webhook/notif-level-up` |

**Payload standardisé:**
```json
{
  "user_id": "123456789",
  "guild_id": "987654321",
  "event_type": "badge_earned",
  "data": {
    "badge_name": "Expert Cuisinier",
    "badge_icon": "🏆"
  },
  "timestamp": "2026-02-11T14:30:00Z"
}
```

**Équipe:** api-backend

---

### 3.5 CHANNELS - Private-Check-Or-Create / Handle-Unknown-Channel

**Fonction:** Gestion des channels privés Discord avec logging dans Redis Stream.

**Opérations utilisées:**
- `xAdd` : Logging des événements channels

**Solution proposée:** Option C - **Supprimer le logging Redis**

Le logging dans Redis Stream est probablement non-critique. Options :
1. Supprimer le node xAdd (logging désactivé)
2. Remplacer par un log API : `POST /api/channels/events`

**Équipe:** n8n (modification workflow)

---

### 3.6 COURSE - Expiration-Cron

**Fonction:** Cron qui vérifie les cours expirés et notifie.

**Opérations utilisées:**
- `xAdd` : Écriture des events d'expiration

**Solution proposée:** Option A - **API Direct**

Remplacer le xAdd par un appel API :

```
POST /api/courses/expiration-events
```

**Équipe:** api-backend

---

### 3.7 INFRA - Process-Pending-Events

**Fonction:** Traite des événements en attente et les requeue si nécessaire.

**Opérations utilisées:**
- `xAdd` : Requeue des events

**Solution proposée:** Option D - **Refactoring complet**

Ce workflow semble être une infrastructure de retry. À analyser si :
1. Toujours nécessaire avec la nouvelle architecture
2. Peut être remplacé par un mécanisme natif (retry HTTP, queue SQS/RabbitMQ)

**Équipe:** infra + architecture

---

### 3.8 MCP - Tools Notify

**Fonction:** Notifie les changements d'outils MCP.

**Opérations utilisées:**
- `xAdd` : Publication des notifications

**Solution proposée:** Option B - **Webhook ou Event interne**

Si les consommateurs sont dans n8n, utiliser un workflow interne.
Si externes, exposer un endpoint de notification.

**Équipe:** n8n

---

## 4. Matrice des solutions

| Solution | Description | Effort | Workflows concernés |
|----------|-------------|--------|---------------------|
| **A - API Endpoint** | Créer des endpoints REST qui remplacent les opérations Redis | Moyen | DLQ Monitor, Course Expiration |
| **B - Webhook Push** | L'émetteur pousse vers n8n au lieu d'écrire dans Redis | Faible | Anomaly, NOTIF (x3) |
| **C - Supprimer** | Retirer la fonctionnalité Redis non-critique | Très faible | CHANNELS (x2), MCP Notify |
| **D - Refactoring** | Repenser l'architecture du workflow | Élevé | INFRA Process |

---

## 5. Plan de migration par priorité

### Phase 1 - Critique (Semaine 1)

| # | Workflow | Solution | Équipe | Status |
|---|----------|----------|--------|--------|
| 1 | Intent Events Consumer | RFC-031 Option C | chatbot-core | ✅ **FAIT** |
| 2 | Intent DLQ Monitor | API /dlq/stats | api-backend | À faire |

### Phase 2 - Haute priorité (Semaine 2)

| # | Workflow | Solution | Équipe | Dépendances |
|---|----------|----------|--------|-------------|
| 3 | NOTIF - Badge Earned | Webhook push | api-backend | Aucune |
| 4 | NOTIF - Course Expiring | Webhook push | api-backend | Aucune |
| 5 | NOTIF - Level Up | Webhook push | api-backend | Aucune |
| 6 | ALERT - Anomaly Detected | Webhook push | À identifier | Aucune |

### Phase 3 - Moyenne priorité (Semaine 3)

| # | Workflow | Solution | Équipe | Dépendances |
|---|----------|----------|--------|-------------|
| 7 | CHANNELS - Check-Or-Create | Supprimer xAdd | n8n | Aucune |
| 8 | CHANNELS - Handle-Unknown | Supprimer xAdd | n8n | Aucune |
| 9 | COURSE - Expiration-Cron | API endpoint | api-backend | Aucune |

### Phase 4 - Basse priorité (Semaine 4+)

| # | Workflow | Solution | Équipe | Dépendances |
|---|----------|----------|--------|-------------|
| 10 | INFRA - Process-Pending | Refactoring | infra | Analyse requise |
| 11 | MCP - Tools Notify | Supprimer ou webhook | n8n | Aucune |

---

## 6. Spécifications API requises (api-backend)

### 6.1 GET /api/intent/dlq/stats

**But:** Remplacer xLen + xRange du workflow DLQ Monitor

**Response:**
```json
{
  "count": 5,
  "oldest_age_seconds": 3600,
  "newest_age_seconds": 60,
  "sample": [
    {
      "stream_id": "550e8400-e29b-41d4-a716-446655440000",
      "message": "Comment faire...",
      "error": "API timeout",
      "failed_at": "2026-02-11T14:00:00Z",
      "retry_count": 2
    }
  ]
}
```

**Headers:** `X-Project-ID` (optionnel, pour filtrer par tenant)

---

### 6.2 Webhooks NOTIF (api-backend → n8n)

Quand api-backend génère un événement de notification, il POST vers n8n :

| Event | Endpoint n8n | Trigger dans api-backend |
|-------|--------------|--------------------------|
| Badge earned | `POST {N8N_WEBHOOK_URL}/webhook/notif-badge-earned` | Après insertion badge |
| Course expiring | `POST {N8N_WEBHOOK_URL}/webhook/notif-course-expiring` | Cron daily |
| Level up | `POST {N8N_WEBHOOK_URL}/webhook/notif-level-up` | Après calcul XP |

**Payload standardisé:**
```json
{
  "event_id": "uuid",
  "event_type": "badge_earned",
  "user_id": "123456789",
  "guild_id": "987654321",
  "data": { },
  "timestamp": "2026-02-11T14:30:00Z"
}
```

**Config api-backend:**
```env
N8N_WEBHOOK_URL=https://n8n.example.com
N8N_WEBHOOK_SECRET=xxx  # Pour signature HMAC si nécessaire
```

---

## 7. Modifications workflows n8n

### 7.1 Workflows à modifier (supprimer nodes xAdd)

```bash
# Fichiers à éditer
workflows/CHANNELS-Private-Check-Or-Create.json
workflows/CHANNELS-Private-Handle-Unknown-Channel.json
workflows/MCP-Tools-Notify.json
```

**Action:** Supprimer les nodes Redis avec opération `xAdd` ou les remplacer par des nodes HTTP Request vers une API de logging.

### 7.2 Workflows à transformer en webhooks

Les workflows suivants doivent changer leur trigger de "Schedule + Redis xRead" vers "Webhook" :

| Workflow | Ancien trigger | Nouveau trigger |
|----------|----------------|-----------------|
| NOTIF - Badge Earned | Schedule + xRead | Webhook |
| NOTIF - Course Expiring | Schedule + xRead | Webhook |
| NOTIF - Level Up | Schedule + xRead | Webhook |
| ALERT - Anomaly Detected | Schedule + xRead | Webhook |

### 7.3 Workflows à transformer en HTTP Request

| Workflow | Node à modifier | Nouveau node |
|----------|-----------------|--------------|
| ALERT - Intent DLQ Monitor | Redis xLen/xRange | HTTP GET /api/intent/dlq/stats |

---

## 8. Checklist de migration

### api-backend

- [ ] `GET /api/intent/dlq/stats` - endpoint DLQ monitoring
- [ ] Webhook `POST /webhook/notif-badge-earned` - intégration
- [ ] Webhook `POST /webhook/notif-course-expiring` - intégration
- [ ] Webhook `POST /webhook/notif-level-up` - intégration
- [ ] Config `N8N_WEBHOOK_URL` dans .env

### chatbot-core

- [x] RFC-031 Option C - appel direct API intent/events/batch ✅

### n8n

- [ ] Modifier `ALERT - Intent DLQ Monitor` : xLen/xRange → HTTP GET
- [ ] Modifier `NOTIF - Badge Earned` : Schedule+xRead → Webhook
- [ ] Modifier `NOTIF - Course Expiring` : Schedule+xRead → Webhook
- [ ] Modifier `NOTIF - Level Up` : Schedule+xRead → Webhook
- [ ] Modifier `ALERT - Anomaly Detected` : Schedule+xRead → Webhook
- [ ] Supprimer nodes xAdd dans `CHANNELS-Private-Check-Or-Create`
- [ ] Supprimer nodes xAdd dans `CHANNELS-Private-Handle-Unknown-Channel`
- [ ] Désactiver `N8N - Intent Events Consumer`
- [ ] Évaluer `INFRA - Process-Pending-Events`
- [ ] Évaluer `MCP - Tools Notify`

### infra

- [ ] Analyser si Redis Streams est encore nécessaire après migration
- [ ] Planifier suppression des streams obsolètes

---

## 9. Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Perte de messages pendant migration | Moyen | Migration workflow par workflow, tests en staging |
| Latence accrue (webhook vs polling) | Faible | Les webhooks sont généralement plus rapides |
| Charge API accrue | Faible | Les volumes sont faibles (<1000 events/jour) |
| Rollback difficile | Moyen | Garder les anciens workflows désactivés pendant 2 semaines |

---

## 10. Contacts

| Équipe | Responsabilité | Contact |
|--------|----------------|---------|
| api-backend | Endpoints API, webhooks sortants | - |
| chatbot-core | Client HTTP intent events | - |
| n8n | Modification workflows | - |
| infra | Redis, monitoring | - |

---

## 11. Revue api-backend (2026-02-11)

> Remarques ajoutées après audit du code api-backend existant.

### 11.1 Synthèse par workflow

| # | Workflow | Verdict api-backend | Raison |
|---|----------|---------------------|--------|
| 1 | Intent Events Consumer | **FAIT** (PR #2160) | Option C validée |
| 2 | Intent DLQ Monitor | **OBSOLÈTE** | Voir §11.2 |
| 3 | ALERT - Anomaly Detected | **PRÉMATURÉ** | Pas de source d'anomalies identifiée côté api-backend |
| 4 | NOTIF - Badge Earned | **IMPOSSIBLE** | Aucun modèle de badges/gamification en base (§11.3) |
| 5 | NOTIF - Course Expiring | **PRÉMATURÉ** | Pas de mécanique d'expiration dans le domaine training (§11.3) |
| 6 | NOTIF - Level Up | **IMPOSSIBLE** | Aucun modèle XP/niveaux en base (§11.3) |
| 7 | CHANNELS - Check-Or-Create | **N/A** | Travail n8n uniquement (supprimer xAdd) |
| 8 | CHANNELS - Handle-Unknown | **N/A** | Travail n8n uniquement (supprimer xAdd) |
| 9 | COURSE - Expiration-Cron | **PRÉMATURÉ** | Dépend d'un modèle d'expiration inexistant (§11.3) |
| 10 | INFRA - Process-Pending | **DÉJÀ COUVERT** côté api-backend | Voir §11.4 |
| 11 | MCP - Tools Notify | **N/A** | Travail n8n uniquement |

**Bilan : sur 11 workflows, 1 seul est réalisable immédiatement côté api-backend (et il est fait). 3 sont du ressort exclusif de n8n. Les 7 restants dépendent de fonctionnalités qui n'existent pas encore.**

### 11.2 DLQ Monitor — Endpoint obsolète

L'endpoint `GET /api/intent/dlq/stats` demandé en §6.1 **n'a plus lieu d'être** :

- Avec RFC-031 Option C, chatbot-core appelle directement `POST /api/intent/events/batch`
- Il n'y a **plus de Redis Stream** `intent:events` donc **plus de DLQ** `intent:dlq`
- Les échecs sont gérés côté chatbot-core (retry exponentiel 3 tentatives puis abandon)

**Alternative existante :** L'endpoint `POST /api/intent/alerts` (déjà implémenté, PR #2160) permet de logger les échecs dans MongoDB. Si un monitoring est nécessaire, on peut ajouter :

```
GET /api/intent/alerts?severity=critical&period=24h
```

Cet endpoint aurait du sens, contrairement à un DLQ stats qui n'a plus de source de données.

**Recommandation :** Supprimer `GET /api/intent/dlq/stats` de la checklist et le remplacer par un endpoint de consultation des alertes si besoin.

### 11.3 Fonctionnalités inexistantes — Badges, XP, Expiration

Les workflows NOTIF (§3.4) et COURSE (§3.6) supposent l'existence de fonctionnalités qui **n'existent pas** dans api-backend :

| Fonctionnalité demandée | État dans api-backend | Modèles/tables |
|--------------------------|----------------------|----------------|
| **Badges** (badge_earned) | N'existe pas | Aucun modèle `Badge`, `UserBadge` |
| **Niveaux/XP** (level_up) | N'existe pas | Aucun modèle `UserXP`, `Level` |
| **Expiration de cours** (course_expiring) | N'existe pas | `Promotion` a des dates mais pas de mécanique d'expiration/notification |
| **Anomaly detection** (anomaly_detected) | N'existe pas | Aucun service de détection d'anomalies |

**Conséquence :** Les webhooks push `POST /webhook/notif-*` décrits en §6.2 ne peuvent pas être implémentés tant que ces domaines métier n'existent pas. Ce sont des **fonctionnalités à spécifier** avant d'être des problèmes de migration Redis Streams.

**Recommandation :** Déplacer ces 4 workflows dans une phase future, conditionnée à la création des domaines métier correspondants. La migration Redis Streams n'est pas le bon véhicule pour spécifier de nouvelles fonctionnalités.

### 11.4 INFRA - Process-Pending-Events — Déjà couvert

Ce workflow n8n a un **équivalent natif** côté api-backend :

| Composant | Fichier | Rôle |
|-----------|---------|------|
| `ResilientEventPublisher` | `app/services/training/resilient_publisher.py` | Publisher avec 4 niveaux de fallback (Redis → Mémoire → PostgreSQL → Log) |
| `PendingEvent` | `app/models/training/pending_event.py` | Table `pending_events` avec status, attempts, priority |

Le publisher gère déjà :
- **Retry en mémoire** : queue interne (max 1000 events), retry toutes les 5s, max 3 tentatives
- **Fallback PostgreSQL** : insertion dans `pending_events` si Redis ET mémoire échouent
- **Health check** : `publisher.health_check()` retourne l'état Redis + taille queue

Ce qui **manque** : un cron/worker côté api-backend pour drainer la table `pending_events` vers Redis quand celui-ci redevient disponible. Le workflow n8n `INFRA - Process-Pending-Events` jouait ce rôle mais ne peut plus (xAdd non supporté).

**Recommandation :** Créer un worker asyncio interne à api-backend (ou un endpoint cron) qui :
1. Lit les `pending_events` WHERE `status = 'pending'` ORDER BY `priority DESC, created_at ASC`
2. Tente de les publier via `redis.xadd()`
3. Met à jour le status (`processed` ou incrémente `attempts`)

Ceci est un **travail api-backend** (pas n8n), estimé à ~1 issue.

### 11.5 DISCORD - Get Transactions — Accès SQL direct

> Ajouté par équipe n8n après analyse.

Ce workflow n'utilise pas Redis Streams mais accède **directement à PostgreSQL** :

```sql
-- Tables accédées
SELECT ... FROM subscribers WHERE ...
SELECT ... FROM transactions WHERE ...
```

**Problème :** Bypass de l'API, credentials DB exposés dans n8n.

**Endpoints API nécessaires :**

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/billing/subscribers/:user_id` | Info subscriber |
| `GET` | `/api/billing/transactions?user_id=X` | Liste transactions |

**Équipe :** api-backend (1 issue)

### 11.6 Plan révisé — Ce qui est réellement faisable

#### Immédiat (api-backend)

| # | Action | Effort |
|---|--------|--------|
| 1 | ~~Intent Events Consumer~~ | **FAIT** |
| 2 | Worker `pending_events` drain (remplace INFRA workflow) | 1 issue |
| 3 | `GET /api/intent/alerts` (remplace DLQ Monitor) | 1 issue |
| 4 | Endpoints billing `/api/billing/*` (remplace SQL direct) | 1 issue |

#### Immédiat (n8n seul)

| # | Action | Effort |
|---|--------|--------|
| 4 | Supprimer xAdd dans CHANNELS workflows (x2) | Faible |
| 5 | Supprimer/adapter MCP Tools Notify | Faible |
| 6 | Désactiver Intent Events Consumer workflow | Trivial |
| 7 | Adapter DLQ Monitor → HTTP GET /api/intent/alerts | Faible |
| 8 | Adapter DISCORD - Get Transactions → HTTP GET /api/billing/* | Faible |

#### Reporté (dépend de fonctionnalités inexistantes)

| # | Workflow | Bloqué par |
|---|----------|------------|
| 8 | NOTIF - Badge Earned | Domaine gamification (badges) à créer |
| 9 | NOTIF - Level Up | Domaine gamification (XP/niveaux) à créer |
| 10 | NOTIF - Course Expiring | Mécanique d'expiration dans training à créer |
| 11 | ALERT - Anomaly Detected | Service de détection d'anomalies à créer |

---

## 12. Références

- [RFC-031 - Option C Direct API](../RFC-031-OPTION-C-DIRECT-API.md) - Migration Intent Events Consumer
- [ResilientEventPublisher](../../app/services/training/resilient_publisher.py) - Publisher 4-level fallback
- [PendingEvent model](../../app/models/training/pending_event.py) - Table de fallback PostgreSQL
- [Intent Alert endpoint](../../app/api_routes/intent_routes.py) - POST /api/intent/alerts
- [n8n Redis Node Documentation](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.redis/)
- [Redis Streams Documentation](https://redis.io/docs/latest/develop/data-types/streams/)
