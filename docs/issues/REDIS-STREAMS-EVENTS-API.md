# Redis Streams Events API

> Documentation technique pour les équipes **n8n** et **chatbot-core**

## Vue d'ensemble

Le système de Formation Management utilise Redis Streams pour la communication inter-services. Ce document décrit les streams disponibles, les formats de payload, et comment publier/consommer des événements.

---

## Streams disponibles

| Stream | Description | Producteurs | Consommateurs |
|--------|-------------|-------------|---------------|
| `formation:events:stream` | Événements de formation (sessions, inscriptions) | API | chatbot-core, n8n |
| `learning:events:stream` | Événements d'apprentissage (XP, badges, progression) | API | chatbot-core, n8n |

---

## Format des événements

Tous les événements suivent le même format de base :

```json
{
  "event": "event:type",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    // Payload spécifique à l'événement
  }
}
```

### Champs communs

| Champ | Type | Description |
|-------|------|-------------|
| `event` | string | Type d'événement (format `domain:action`) |
| `guild_id` | string | ID du serveur Discord |
| `timestamp` | string | ISO 8601 UTC |
| `data` | object | Payload spécifique |

---

## Événements Formation

### `session:created`

Émis quand une nouvelle session de formation est créée.

```json
{
  "event": "session:created",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "session_id": "uuid",
    "formation_id": "uuid",
    "title": "Introduction à la cuisine",
    "instructor_id": "987654321",
    "scheduled_start": "2026-02-10T14:00:00Z",
    "scheduled_end": "2026-02-10T16:00:00Z",
    "max_participants": 20,
    "channel_id": "111222333",
    "voice_channel_id": "444555666"
  }
}
```

**Actions recommandées (chatbot-core):**
- Créer un thread dédié dans le channel
- Programmer un rappel 24h et 1h avant
- Envoyer une notification aux inscrits

**Actions recommandées (n8n):**
- Créer un événement Google Calendar
- Envoyer un email de confirmation à l'instructeur

---

### `session:started`

Émis quand une session démarre (instructeur rejoint le vocal).

```json
{
  "event": "session:started",
  "guild_id": "123456789",
  "timestamp": "2026-02-10T14:00:00Z",
  "data": {
    "session_id": "uuid",
    "formation_id": "uuid",
    "actual_start": "2026-02-10T14:02:00Z",
    "participants_count": 15
  }
}
```

**Actions recommandées (chatbot-core):**
- Notifier les inscrits que la session commence
- Mettre à jour le statut du thread

---

### `session:ended`

Émis quand une session se termine.

```json
{
  "event": "session:ended",
  "guild_id": "123456789",
  "timestamp": "2026-02-10T16:05:00Z",
  "data": {
    "session_id": "uuid",
    "formation_id": "uuid",
    "actual_end": "2026-02-10T16:05:00Z",
    "duration_minutes": 123,
    "participants_count": 12,
    "recording_url": "https://..."
  }
}
```

**Actions recommandées (chatbot-core):**
- Archiver le thread
- Envoyer un récapitulatif aux participants
- Distribuer les XP de participation

**Actions recommandées (n8n):**
- Mettre à jour le calendrier
- Envoyer un email de suivi

---

### `enrollment:created`

Émis quand un utilisateur s'inscrit à une formation.

```json
{
  "event": "enrollment:created",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T10:00:00Z",
  "data": {
    "enrollment_id": "uuid",
    "user_id": "discord_user_id",
    "formation_id": "uuid",
    "session_id": "uuid",
    "is_free": false,
    "credits_paid": 50
  }
}
```

**Actions recommandées (chatbot-core):**
- Confirmer l'inscription en DM
- Ajouter le rôle "Inscrit - [Formation]"

---

### `enrollment:cancelled`

Émis quand une inscription est annulée.

```json
{
  "event": "enrollment:cancelled",
  "guild_id": "123456789",
  "timestamp": "2026-02-06T09:00:00Z",
  "data": {
    "enrollment_id": "uuid",
    "user_id": "discord_user_id",
    "formation_id": "uuid",
    "session_id": "uuid",
    "reason": "user_request",
    "credits_refunded": 50
  }
}
```

---

## Événements Learning

### `xp:gained`

Émis quand un apprenant gagne des XP.

```json
{
  "event": "xp:gained",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "learner_id": "uuid",
    "discord_id": "user_discord_id",
    "xp_earned": 25,
    "xp_total": 1250,
    "source": "lesson_complete",
    "source_id": "lesson_uuid",
    "level": 5,
    "level_changed": false
  }
}
```

---

### `level:up`

Émis quand un apprenant monte de niveau.

```json
{
  "event": "level:up",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "learner_id": "uuid",
    "discord_id": "user_discord_id",
    "old_level": 4,
    "new_level": 5,
    "new_title": "Commis",
    "xp_total": 1250
  }
}
```

**Actions recommandées (chatbot-core):**
- Annoncer le level up dans le channel progression
- Mettre à jour le rôle Discord
- Envoyer les félicitations en DM

---

### `badge:earned`

Émis quand un apprenant obtient un badge.

```json
{
  "event": "badge:earned",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "learner_id": "uuid",
    "discord_id": "user_discord_id",
    "badge_id": "first_lesson",
    "badge_name_key": "badge.first_lesson.name",
    "badge_icon": "🎓",
    "badge_rarity": "common",
    "xp_reward": 25,
    "total_badges": 3
  }
}
```

**Actions recommandées (chatbot-core):**
- Annoncer le badge dans le channel achievements
- Envoyer un embed célébration en DM

---

### `course:completed`

Émis quand un apprenant termine un cours.

```json
{
  "event": "course:completed",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "learner_id": "uuid",
    "discord_id": "user_discord_id",
    "course_id": "uuid",
    "course_title": "Les bases de la pâtisserie",
    "completion_time_days": 14,
    "final_score": 85.5,
    "xp_earned": 500
  }
}
```

---

### `streak:milestone`

Émis quand un apprenant atteint un palier de streak.

```json
{
  "event": "streak:milestone",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "learner_id": "uuid",
    "discord_id": "user_discord_id",
    "streak_days": 7,
    "milestone": "week_streak",
    "xp_bonus": 150
  }
}
```

---

## Guide d'intégration

### Pour chatbot-core (Consumer)

#### 1. Configuration du Consumer Group

```python
from redis.asyncio import Redis
from api.services.events import RedisStreamSubscriber

redis = Redis.from_url("redis://localhost:6379")

subscriber = RedisStreamSubscriber(
    redis=redis,
    group_name="chatbot-core",  # Nom unique du consumer group
    consumer_name=f"instance-{os.getpid()}",  # Unique par instance
    streams=["formation:events:stream", "learning:events:stream"]
)

# Créer le consumer group (idempotent)
await subscriber.setup()
```

#### 2. Consommation des événements

```python
async def handle_event(event: dict) -> None:
    """Handler pour tous les événements."""
    event_type = event.get("event")
    guild_id = event.get("guild_id")
    data = event.get("data", {})

    match event_type:
        case "session:created":
            await handle_session_created(guild_id, data)
        case "level:up":
            await handle_level_up(guild_id, data)
        case "badge:earned":
            await handle_badge_earned(guild_id, data)
        case _:
            logger.debug(f"Unhandled event: {event_type}")

# Démarrer la consommation (bloquant)
await subscriber.consume(handle_event)
```

#### 3. Gestion des erreurs

- Si le handler lève une exception, le message **n'est pas ACK**
- Le message sera retenté automatiquement après 60 secondes d'idle
- Après plusieurs échecs, il est déplacé vers la Dead Letter Queue

```python
async def handle_event(event: dict) -> None:
    try:
        # Traitement...
        pass
    except TemporaryError:
        # Re-raise pour retry automatique
        raise
    except PermanentError as e:
        # Logger et ne pas re-raise (message sera ACK)
        logger.error(f"Permanent error: {e}")
```

---

### Pour n8n (Consumer via HTTP ou Redis)

#### Option 1: Webhook HTTP (recommandé)

L'API expose un endpoint webhook pour recevoir les événements :

```
POST /webhooks/n8n/events
Authorization: Bearer {N8N_WEBHOOK_TOKEN}
Content-Type: application/json

{
  "event": "session:created",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": { ... }
}
```

Configuration dans n8n :
1. Créer un workflow avec trigger "Webhook"
2. Configurer l'URL du webhook
3. Router selon `event` avec un Switch node

#### Option 2: Redis Direct

Si n8n a accès direct à Redis :

```javascript
// Dans un Code node n8n
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Lire les derniers messages
const messages = await redis.xread(
  'STREAMS', 'formation:events:stream', '$'
);
```

---

### Pour l'API (Publisher)

#### Publication d'événements

```python
from api.services.events import ResilientEventPublisher

publisher = ResilientEventPublisher(
    redis=redis,
    db_session_factory=get_db_session
)

# Démarrer le publisher (active le retry en background)
await publisher.start()

# Publier un événement
result = await publisher.publish(
    stream_name="formation:events:stream",
    event_data={
        "event": "session:created",
        "guild_id": guild_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {
            "session_id": str(session.id),
            "formation_id": str(session.formation_id),
            # ...
        }
    }
)

if result.success:
    logger.info(f"Event published via {result.method}: {result.message_id}")
else:
    logger.error(f"Event failed: {result.error}")
```

#### Niveaux de fallback

| Niveau | Méthode | Description |
|--------|---------|-------------|
| 1 | Redis Streams | Publication normale via `XADD` |
| 2 | Memory Queue | File d'attente en mémoire avec retry |
| 3 | PostgreSQL | Table `pending_events` pour persistance |
| 4 | Log | Dernier recours, intervention manuelle |

---

## Monitoring

### Health Check

```python
# Publisher
health = await publisher.health_check()
# {
#   "redis_healthy": True,
#   "memory_queue_size": 0,
#   "memory_queue_max": 1000,
#   "running": True
# }

# Subscriber
health = await subscriber.health_check()
# {
#   "redis_healthy": True,
#   "running": True,
#   "consumer_name": "instance-1234",
#   "group_name": "chatbot-core",
#   "lag": {"formation:events:stream": 5}
# }
```

### Métriques Prometheus

| Métrique | Type | Description |
|----------|------|-------------|
| `formation_events_published_total` | Counter | Événements publiés par type/méthode |
| `formation_events_consumed_total` | Counter | Événements consommés par type/status |
| `formation_event_processing_seconds` | Histogram | Temps de traitement |
| `formation_fallback_active` | Gauge | Fallback actif (memory_queue, db) |
| `formation_pending_events_count` | Gauge | Événements en attente dans PostgreSQL |

---

## Bonnes pratiques

### Idempotence

Les handlers doivent être idempotents (même résultat si exécutés plusieurs fois) :

```python
async def handle_badge_earned(guild_id: str, data: dict) -> None:
    badge_id = data["badge_id"]
    discord_id = data["discord_id"]

    # Vérifier si déjà traité
    if await redis.sismember(f"processed:badges:{guild_id}", f"{discord_id}:{badge_id}"):
        return

    # Traiter...
    await send_badge_notification(discord_id, badge_id)

    # Marquer comme traité (TTL 24h)
    await redis.sadd(f"processed:badges:{guild_id}", f"{discord_id}:{badge_id}")
    await redis.expire(f"processed:badges:{guild_id}", 86400)
```

### Rate Limiting Discord

Respecter les limites Discord (50 messages/seconde par guild) :

```python
from asyncio import Semaphore

discord_semaphore = Semaphore(10)  # Max 10 appels concurrents

async def send_notification(channel_id: str, content: str):
    async with discord_semaphore:
        await bot.get_channel(channel_id).send(content)
        await asyncio.sleep(0.1)  # 10 msg/sec max
```

---

## Support

- **Équipe API**: Questions sur les payloads et la publication
- **Équipe chatbot-core**: Questions sur la consommation Discord
- **RFC de référence**: RFC-023 (Formation Management System)
