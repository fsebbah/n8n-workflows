# RFC-004 — Private Channels API

## Authentification

Tous les endpoints requierent le header `X-Tenant-ID` pour identifier le tenant.

```
X-Tenant-ID: <tenant_id>
```

Si absent, retourne `400 Bad Request`.

---

## 1. POST `/api/channels/private?guild_id=...`

Cree un salon prive ou retourne l'existant si le triplet `(guild_id, discord_user_id, channel_type)` existe deja.

### Request

**Query parameters**

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `guild_id` | string | oui | ID du serveur Discord |

**Body (JSON)**

```json
{
  "discord_user_id": "123456789012345678",
  "channel_id": "987654321098765432",
  "channel_type": "support",
  "channel_name": "support-jean",
  "metadata": {
    "source": "n8n",
    "workflow_id": "wf_abc123"
  }
}
```

| Champ | Type | Requis | Default | Description |
|-------|------|--------|---------|-------------|
| `discord_user_id` | string (max 50) | oui | — | ID Discord de l'utilisateur |
| `channel_id` | string (max 50) | oui | — | ID du channel Discord cree |
| `channel_type` | string (max 30) | non | `"support"` | Type de channel (`support`, `order`, etc.) |
| `channel_name` | string (max 100) | non | `null` | Nom lisible du channel |
| `metadata` | object | non | `{}` | Donnees libres (JSONB) |

### Response `201 Created` (nouveau) / `201` (existant)

```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "guild_id": "111222333444555666",
    "discord_user_id": "123456789012345678",
    "channel_id": "987654321098765432",
    "channel_type": "support",
    "channel_name": "support-jean",
    "is_active": true,
    "created_at": "2026-02-11T10:30:00Z",
    "last_activity_at": null,
    "metadata": {
      "source": "n8n",
      "workflow_id": "wf_abc123"
    }
  },
  "created": true,
  "message": "Channel created"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `success` | bool | Toujours `true` |
| `data` | PrivateChannelData | Objet channel complet |
| `created` | bool | `true` si nouveau, `false` si existant retourne |
| `message` | string | `"Channel created"` ou `"Existing channel returned"` |

---

## 2. GET `/api/channels/private/{discord_user_id}?guild_id=...`

Recupere le channel actif d'un utilisateur pour un type donne.

### Request

**Path parameters**

| Param | Type | Description |
|-------|------|-------------|
| `discord_user_id` | string | ID Discord de l'utilisateur |

**Query parameters**

| Param | Type | Requis | Default | Description |
|-------|------|--------|---------|-------------|
| `guild_id` | string | oui | — | ID du serveur Discord |
| `channel_type` | string | non | `"support"` | Type de channel |

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "guild_id": "111222333444555666",
    "discord_user_id": "123456789012345678",
    "channel_id": "987654321098765432",
    "channel_type": "support",
    "channel_name": "support-jean",
    "is_active": true,
    "created_at": "2026-02-11T10:30:00Z",
    "last_activity_at": "2026-02-11T14:00:00Z",
    "metadata": {}
  },
  "created": false,
  "message": null
}
```

### Response `404 Not Found`

```json
{
  "detail": "No active support channel for user 123456789012345678"
}
```

---

## 3. GET `/api/channels/private?guild_id=...`

Liste les channels prives d'une guild avec pagination et filtres.

### Request

**Query parameters**

| Param | Type | Requis | Default | Description |
|-------|------|--------|---------|-------------|
| `guild_id` | string | oui | — | ID du serveur Discord |
| `channel_type` | string | non | `null` | Filtrer par type (`support`, `order`...) |
| `active_only` | bool | non | `true` | Ne retourner que les channels actifs |
| `skip` | int | non | `0` | Offset pour pagination (min: 0) |
| `limit` | int | non | `50` | Nombre max de resultats (min: 1, max: 100) |

### Response `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "guild_id": "111222333444555666",
      "discord_user_id": "123456789012345678",
      "channel_id": "987654321098765432",
      "channel_type": "support",
      "channel_name": "support-jean",
      "is_active": true,
      "created_at": "2026-02-11T10:30:00Z",
      "last_activity_at": null,
      "metadata": {}
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "guild_id": "111222333444555666",
      "discord_user_id": "999888777666555444",
      "channel_id": "111222333444555777",
      "channel_type": "support",
      "channel_name": "support-marie",
      "is_active": true,
      "created_at": "2026-02-11T11:00:00Z",
      "last_activity_at": "2026-02-11T15:30:00Z",
      "metadata": {"source": "n8n"}
    }
  ],
  "total": 2
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `success` | bool | Toujours `true` |
| `data` | list[PrivateChannelData] | Liste des channels |
| `total` | int | Nombre total (avant pagination) |

---

## 4. GET `/api/channels/private/by-channel/{channel_id}`

Lookup inverse — retrouve l'enregistrement a partir de l'ID du channel Discord.

### Request

**Path parameters**

| Param | Type | Description |
|-------|------|-------------|
| `channel_id` | string | ID du channel Discord |

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "guild_id": "111222333444555666",
    "discord_user_id": "123456789012345678",
    "channel_id": "987654321098765432",
    "channel_type": "support",
    "channel_name": "support-jean",
    "is_active": true,
    "created_at": "2026-02-11T10:30:00Z",
    "last_activity_at": null,
    "metadata": {}
  },
  "created": false,
  "message": null
}
```

### Response `404 Not Found`

```json
{
  "detail": "No record found for channel 987654321098765432"
}
```

---

## 5. PATCH `/api/channels/private/{discord_user_id}/activity?guild_id=...`

Met a jour le timestamp `last_activity_at` du channel (pour tracker l'activite).

### Request

**Path parameters**

| Param | Type | Description |
|-------|------|-------------|
| `discord_user_id` | string | ID Discord de l'utilisateur |

**Query parameters**

| Param | Type | Requis | Default | Description |
|-------|------|--------|---------|-------------|
| `guild_id` | string | oui | — | ID du serveur Discord |
| `channel_type` | string | non | `"support"` | Type de channel |

**Body** : aucun

### Response `200 OK`

```json
{
  "success": true,
  "last_activity_at": "2026-02-11T16:45:00Z"
}
```

### Response `404 Not Found`

```json
{
  "detail": "No active support channel for user 123456789012345678"
}
```

---

## 6. DELETE `/api/channels/private/{discord_user_id}?guild_id=...`

Soft-delete — desactive le channel (`is_active = false`). Le channel reste en base pour l'historique.

### Request

**Path parameters**

| Param | Type | Description |
|-------|------|-------------|
| `discord_user_id` | string | ID Discord de l'utilisateur |

**Query parameters**

| Param | Type | Requis | Default | Description |
|-------|------|--------|---------|-------------|
| `guild_id` | string | oui | — | ID du serveur Discord |
| `channel_type` | string | non | `"support"` | Type de channel |

**Body** : aucun

### Response `200 OK`

```json
{
  "success": true,
  "message": "Channel deactivated for user 123456789012345678"
}
```

### Response `404 Not Found`

```json
{
  "detail": "No active support channel for user 123456789012345678"
}
```

---

## Codes d'erreur communs

| Code | Situation |
|------|-----------|
| `400` | Header `X-Tenant-ID` manquant |
| `404` | Channel non trouve ou inactif |
| `422` | Validation Pydantic echouee (champ manquant, format invalide) |

---

## Schema table `user_private_channels`

```
user_private_channels
├── id               UUID PK (gen_random_uuid)
├── guild_id         VARCHAR(50) NOT NULL, INDEX
├── discord_user_id  VARCHAR(50) NOT NULL, INDEX
├── channel_id       VARCHAR(50) NOT NULL, INDEX
├── channel_type     VARCHAR(30) NOT NULL DEFAULT 'support'
├── channel_name     VARCHAR(100) NULL
├── is_active        BOOLEAN NOT NULL DEFAULT TRUE
├── metadata         JSONB NOT NULL DEFAULT '{}'
├── created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
├── updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
└── last_activity_at TIMESTAMPTZ NULL

UNIQUE(guild_id, discord_user_id, channel_type)
INDEX(guild_id, discord_user_id, is_active)
```
