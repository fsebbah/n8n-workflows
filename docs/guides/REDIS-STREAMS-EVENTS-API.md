# Redis Streams Events API

> Documentation technique pour les équipes **n8n** et **chatbot-core**

## Vue d'ensemble

Le système de Formation Management utilise Redis Streams pour la communication inter-services. Ce document décrit les streams disponibles, les formats de payload, et comment publier/consommer des événements.

---

## Streams disponibles

| Stream | Description | Producteurs | Consommateurs |
|--------|-------------|-------------|---------------|
| `formation:events:stream` | Événements de formation (promotions, matières, inscriptions) | API | chatbot-core, n8n |
| `learning:events:stream` | Événements d'apprentissage (XP, badges, progression) | API | chatbot-core, n8n |

---

## Format des événements

> **IMPORTANT**: Le champ est `event`, PAS `event_type`

Tous les événements suivent le même format de base :

```json
{
  "event": "domain.action",
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
| `event` | string | Type d'événement (format `domain.action`) |
| `guild_id` | string | ID du serveur Discord |
| `timestamp` | string | ISO 8601 UTC |
| `data` | object | Payload spécifique |

### Convention de nommage des événements

```
domain.action
```

Exemples:
- `promotion.created` (pas `formation.promotion.created`)
- `matiere.created` (pas `formation.matiere.created`)
- `enrollment.created` (pas `formation.member.added`)

---

## Événements Formation (Stream: `formation:events:stream`)

### Événements Formation (programme)

#### `formation.created`

```json
{
  "event": "formation.created",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "formation_id": "uuid",
    "name": "Master Cuisine du Sud",
    "slug": "master-cuisine-sud",
    "description": "Formation complète...",
    "emoji": "🎓"
  }
}
```

#### `formation.updated`

```json
{
  "event": "formation.updated",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "formation_id": "uuid",
    "changes": {
      "name": "Nouveau nom",
      "description": "Nouvelle description"
    }
  }
}
```

#### `formation.deleted`

```json
{
  "event": "formation.deleted",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "formation_id": "uuid"
  }
}
```

---

### Événements Promotion (cohorte annuelle)

#### `promotion.created`

Émis quand une nouvelle promotion est créée. **chatbot-core doit créer la structure Discord**.

```json
{
  "event": "promotion.created",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "promotion_id": "uuid",
    "formation_id": "uuid",
    "formation_name": "Master Cuisine du Sud",
    "year_start": 2024,
    "year_end": 2025,
    "matieres": [
      {"name": "Techniques Culinaires", "slug": "techniques-culinaires", "emoji": "🔪"},
      {"name": "Pâtisserie", "slug": "patisserie", "emoji": "🎂"},
      {"name": "Hygiène HACCP", "slug": "hygiene-haccp", "emoji": "🧼"}
    ]
  }
}
```

**Actions requises (chatbot-core):**
1. Créer la catégorie Discord: `📚 Master Cuisine 24-25`
2. Créer le rôle: `@Master Cuisine 24-25`
3. Créer le channel annonces: `#annonces`
4. Créer un channel par matière: `#techniques-culinaires`, `#patisserie`, etc.
5. **Publier `promotion.setup_complete`** avec les IDs Discord

#### `promotion.setup_complete`

Émis par **chatbot-core** après création de la structure Discord. L'API met à jour les IDs.

```json
{
  "event": "promotion.setup_complete",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:35:00Z",
  "data": {
    "promotion_id": "uuid",
    "category_id": "111222333",
    "role_id": "444555666",
    "announcement_channel_id": "777888999",
    "channel_ids": {
      "techniques-culinaires": "101010101",
      "patisserie": "202020202",
      "hygiene-haccp": "303030303"
    }
  }
}
```

#### `promotion.archived`

Émis quand une promotion est archivée (année terminée).

```json
{
  "event": "promotion.archived",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "promotion_id": "uuid",
    "reason": "year_completed"
  }
}
```

**Actions recommandées (chatbot-core):**
- Déplacer la catégorie vers "Archives"
- Retirer les permissions d'écriture
- Conserver en lecture seule

---

### Événements Matière (cours/sujet)

#### `matiere.created`

```json
{
  "event": "matiere.created",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "matiere_id": "uuid",
    "promotion_id": "uuid",
    "name": "Gestion de Restaurant",
    "slug": "gestion-restaurant",
    "emoji": "📊"
  }
}
```

**Actions requises (chatbot-core):**
- Créer le channel dans la catégorie de la promotion
- **Publier événement avec le channel_id créé**

#### `matiere.deleted`

```json
{
  "event": "matiere.deleted",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "matiere_id": "uuid",
    "promotion_id": "uuid",
    "channel_id": "101010101"
  }
}
```

**Actions (chatbot-core):**
- Archiver ou supprimer le channel

---

### Événements Inscription (enrollment)

#### `enrollment.created`

Émis quand un utilisateur est inscrit à une promotion.

```json
{
  "event": "enrollment.created",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "enrollment_id": "uuid",
    "discord_id": "user_discord_id",
    "promotion_id": "uuid",
    "promotion_name": "Master Cuisine 24-25",
    "role_id": "444555666"
  }
}
```

**Actions requises (chatbot-core):**
1. Assigner le rôle `role_id` à l'utilisateur
2. **Publier `enrollment.role_assigned`** avec le résultat

#### `enrollment.role_assigned`

Émis par **chatbot-core** après assignation du rôle.

```json
{
  "event": "enrollment.role_assigned",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:35:00Z",
  "data": {
    "enrollment_id": "uuid",
    "discord_id": "user_discord_id",
    "success": true,
    "error": null
  }
}
```

#### `enrollment.removed`

Émis quand un utilisateur quitte ou est retiré d'une promotion.

```json
{
  "event": "enrollment.removed",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "enrollment_id": "uuid",
    "discord_id": "user_discord_id",
    "promotion_id": "uuid",
    "role_id": "444555666",
    "reason": "withdrawn"
  }
}
```

**Raisons possibles:** `withdrawn`, `expelled`, `completed`

**Actions (chatbot-core):**
- Retirer le rôle de l'utilisateur

---

## Événements Learning (Stream: `learning:events:stream`)

### `xp:gained`

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

### `level:up`

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

### `badge:earned`

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

### `course:completed`

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

### `streak:milestone`

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

## Guide d'intégration chatbot-core

### Configuration du Consumer Group

```python
from redis.asyncio import Redis

redis = Redis.from_url("redis://localhost:6379")

# Consumer group name: "chatbot-core" ✅
subscriber = RedisStreamSubscriber(
    redis=redis,
    group_name="chatbot-core",
    consumer_name=f"instance-{os.getpid()}",
    streams=["formation:events:stream", "learning:events:stream"]
)

await subscriber.setup()
```

### Handler pattern

```python
async def handle_event(event: dict) -> None:
    event_type = event.get("event")  # ⚠️ "event", pas "event_type"
    guild_id = event.get("guild_id")
    data = event.get("data", {})

    match event_type:
        # Formation events
        case "promotion.created":
            await handle_promotion_created(guild_id, data)
        case "enrollment.created":
            await handle_enrollment_created(guild_id, data)

        # Learning events
        case "level:up":
            await handle_level_up(guild_id, data)
        case "badge:earned":
            await handle_badge_earned(guild_id, data)

        case _:
            logger.debug(f"Unhandled event: {event_type}")

await subscriber.consume(handle_event)
```

### Flow de création de promotion

```
┌─────────┐     ┌───────────────┐     ┌─────────────┐     ┌─────────┐
│   API   │────▶│ promotion.    │────▶│ chatbot-    │────▶│ Discord │
│         │     │ created       │     │ core        │     │ Setup   │
└─────────┘     └───────────────┘     └─────────────┘     └────┬────┘
                                                               │
     ┌─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────┐     ┌───────────────┐     ┌─────────────┐
│   API   │◀────│ promotion.    │◀────│ chatbot-    │
│ Update  │     │ setup_complete│     │ core        │
└─────────┘     └───────────────┘     └─────────────┘
```

---

## Guide d'intégration n8n

### Consumer Group

```javascript
// Consumer group: "n8n"
const consumer = {
  groupName: "n8n",
  consumerName: "workflow-1"
};
```

### Webhook alternative

Si n8n ne peut pas accéder directement à Redis:

```
POST /webhooks/n8n/events
Authorization: Bearer {N8N_WEBHOOK_TOKEN}
```

---

## Monitoring

### Consumer groups recommandés

| Service | Consumer Group | Streams |
|---------|---------------|---------|
| chatbot-core | `chatbot-core` | formation:events:stream, learning:events:stream |
| n8n | `n8n` | formation:events:stream, learning:events:stream |
| API (internal) | `api-internal` | formation:events:stream |

### Métriques

| Métrique | Description |
|----------|-------------|
| `formation_events_published_total` | Événements publiés |
| `formation_events_consumed_total` | Événements consommés |
| `formation_pending_events_count` | Événements en fallback DB |

---

## FAQ

### Pourquoi `event` et pas `event_type` ?

Pour la cohérence avec le Learning System existant qui utilise `event`.

### Pourquoi `promotion.created` et pas `formation.promotion.created` ?

Pour la simplicité. Le stream (`formation:events:stream`) indique déjà le domaine.

### Comment chatbot-core signale que le setup Discord est fait ?

En publiant `promotion.setup_complete` sur le même stream avec les IDs Discord.

---

## Questions des équipes

### Questions chatbot-core (2026-02-05)

**Q1: Est-ce que le type d'event sera `formation.promotion.created` ou `promotion.created` ?**

> **Réponse:** Le format est `promotion.created` (domaine.action).
> Le stream `formation:events:stream` indique déjà le contexte "formation".
> Cela évite la redondance `formation.promotion.created`.

**Q2: Le champ dans le payload est `event_type` ou `event` ?**

> **Réponse:** Le champ est **`event`**, pas `event_type`.
> Cela assure la cohérence avec le Learning System existant.
> ```json
> {
>   "event": "promotion.created",  // ✅ Correct
>   "event_type": "..."            // ❌ Incorrect
> }
> ```

**Q3: Quel nom de consumer group devons-nous utiliser ?**

> **Réponse:** Utilisez `chatbot-core` comme nom de consumer group.
> Chaque instance doit avoir un `consumer_name` unique (ex: `instance-{pid}`).
> ```python
> subscriber = RedisStreamSubscriber(
>     group_name="chatbot-core",           # ✅ Fixe
>     consumer_name=f"instance-{os.getpid()}"  # Variable par instance
> )
> ```

### Questions n8n (2026-02-05)

**Q1: Le stream inclut-il le guild_id dans son nom ?**

> **Réponse:** Non. Le stream est unique: `formation:events:stream`.
> Le `guild_id` est inclus dans le payload de chaque événement.
> ```json
> {
>   "event": "promotion.created",
>   "guild_id": "123456789",  // ✅ Dans le payload
>   "data": { ... }
> }
> ```
> Ne pas utiliser `formation:events:{guild_id}` ❌

**Q2: Le champ est `type` ou `event` ?**

> **Réponse:** Le champ est **`event`**.
> Ne pas utiliser `type` ou `event_type`.

---

## Support

- **Équipe API**: Questions sur les payloads et la publication
- **Équipe chatbot-core**: Questions sur la consommation et les actions Discord
- **RFC de référence**: RFC-023 (Formation Management System)
