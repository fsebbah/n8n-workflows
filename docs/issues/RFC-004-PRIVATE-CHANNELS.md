# RFC-004: Private Channels Management

**Status:** Draft
**Date:** 2026-01-15
**Author:** API Team

---

## Résumé

Système de gestion des salons privés Discord permettant de stocker et récupérer l'association `user_id <-> channel_id` pour éviter la création de doublons et permettre la réutilisation des salons existants.

---

## Problème

Actuellement, lorsqu'un utilisateur déclenche une action nécessitant un salon privé (support, commande, etc.), le système ne sait pas si un salon existe déjà pour cet utilisateur. Cela peut entraîner :

1. **Création de doublons** - Plusieurs salons pour le même utilisateur
2. **Perte de contexte** - Historique dispersé entre plusieurs salons
3. **Pollution du serveur** - Accumulation de salons inutilisés
4. **Impossibilité de reprendre** - Pas de moyen de retrouver le salon d'un utilisateur

---

## Solution

### 1. Nouvelle table `user_private_channels`

```sql
CREATE TABLE user_private_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(50) NOT NULL,
    guild_id VARCHAR(50) NOT NULL,
    discord_user_id VARCHAR(50) NOT NULL,
    channel_id VARCHAR(50) NOT NULL,
    channel_type VARCHAR(30) NOT NULL DEFAULT 'support',
    channel_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',

    CONSTRAINT uix_user_channel UNIQUE(project_id, guild_id, discord_user_id, channel_type)
);

CREATE INDEX idx_private_channels_lookup
    ON user_private_channels(project_id, guild_id, discord_user_id, is_active);

CREATE INDEX idx_private_channels_channel
    ON user_private_channels(channel_id);
```

### 2. Types de channels supportés

| Type | Description | Cas d'usage |
|------|-------------|-------------|
| `support` | Salon support/ticket | Demandes d'aide |
| `order` | Salon commandes | Suivi de commande e-commerce |
| `onboarding` | Salon onboarding | Accueil nouveaux membres |
| `private` | Salon privé générique | Autre usage |

### 3. Endpoints API

#### 3.1 Créer/Enregistrer un channel

```
POST /api/channels/private
Headers: X-Project-ID: <project_id>
```

**Request:**
```json
{
  "guild_id": "987654321",
  "discord_user_id": "123456789",
  "channel_id": "456789123",
  "channel_type": "support",
  "channel_name": "support-john-doe",
  "metadata": {
    "created_by": "bot",
    "category_id": "111222333"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-xxx",
    "guild_id": "987654321",
    "discord_user_id": "123456789",
    "channel_id": "456789123",
    "channel_type": "support",
    "channel_name": "support-john-doe",
    "is_active": true,
    "created_at": "2026-01-15T10:00:00Z"
  },
  "created": true
}
```

**Response (200 OK - Already exists):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-xxx",
    "guild_id": "987654321",
    "discord_user_id": "123456789",
    "channel_id": "456789123",
    "channel_type": "support",
    "is_active": true
  },
  "created": false,
  "message": "Channel already exists"
}
```

#### 3.2 Récupérer le channel d'un utilisateur

```
GET /api/channels/private/{discord_user_id}
Headers: X-Project-ID: <project_id>
Query: guild_id=987654321&channel_type=support
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-xxx",
    "guild_id": "987654321",
    "discord_user_id": "123456789",
    "channel_id": "456789123",
    "channel_type": "support",
    "channel_name": "support-john-doe",
    "is_active": true,
    "last_activity_at": "2026-01-15T14:30:00Z",
    "metadata": {}
  }
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "CHANNEL_NOT_FOUND",
    "message": "Aucun salon privé trouvé pour cet utilisateur"
  }
}
```

#### 3.3 Lister les channels d'une guild

```
GET /api/channels/private
Headers: X-Project-ID: <project_id>
Query: guild_id=987654321&channel_type=support&active_only=true
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "discord_user_id": "123456789",
      "channel_id": "456789123",
      "channel_type": "support",
      "is_active": true
    },
    {
      "id": "uuid-2",
      "discord_user_id": "987654321",
      "channel_id": "789123456",
      "channel_type": "support",
      "is_active": true
    }
  ],
  "total": 2
}
```

#### 3.4 Mettre à jour l'activité

```
PATCH /api/channels/private/{discord_user_id}/activity
Headers: X-Project-ID: <project_id>
Query: guild_id=987654321&channel_type=support
```

**Response:**
```json
{
  "success": true,
  "last_activity_at": "2026-01-15T15:00:00Z"
}
```

#### 3.5 Désactiver un channel

```
DELETE /api/channels/private/{discord_user_id}
Headers: X-Project-ID: <project_id>
Query: guild_id=987654321&channel_type=support
```

**Response:**
```json
{
  "success": true,
  "message": "Channel marked as inactive"
}
```

> **Note:** Le DELETE ne supprime pas le salon Discord, il marque juste l'association comme inactive.

#### 3.6 Rechercher par channel_id

```
GET /api/channels/private/by-channel/{channel_id}
Headers: X-Project-ID: <project_id>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "discord_user_id": "123456789",
    "guild_id": "987654321",
    "channel_type": "support",
    "is_active": true
  }
}
```

---

## Flow d'utilisation

### Création de salon (n8n/Plugin)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Utilisateur demande support                                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. GET /api/channels/private/{user_id}?guild_id=xxx&type=support│
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ 200: Channel    │     │ 404: Not Found  │
│ exists          │     │                 │
│                 │     │ → Créer salon   │
│ → Réutiliser    │     │   Discord       │
│   channel_id    │     │                 │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                       ┌─────────────────┐
                       │ POST /api/      │
                       │ channels/private│
                       │ → Enregistrer   │
                       └─────────────────┘
```

### Réception de message dans un salon privé

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Message reçu dans channel_id                                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. GET /api/channels/private/by-channel/{channel_id}            │
│    → Récupérer discord_user_id associé                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PATCH /api/channels/private/{user_id}/activity               │
│    → Mettre à jour last_activity_at                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implémentation

### Phase 1 - API (Priorité P0)

| Tâche | Priorité | Effort |
|-------|----------|--------|
| Migration table `user_private_channels` | P0 | S |
| Model SQLAlchemy | P0 | S |
| Service `PrivateChannelService` | P0 | M |
| Router `/api/channels/private` | P0 | M |
| Tests unitaires | P0 | M |

### Phase 2 - n8n (Priorité P1)

| Tâche | Priorité |
|-------|----------|
| Workflow: vérifier channel existant avant création | P1 |
| Workflow: enregistrer nouveau channel après création | P1 |
| Workflow: lookup user par channel_id | P1 |

### Phase 3 - Plugin (Priorité P2)

| Tâche | Priorité |
|-------|----------|
| Commande `/support` : réutiliser channel existant | P2 |
| Event: cleanup channels inactifs | P2 |

---

## Considérations

### Cache Redis

Optionnel pour la v1. Si nécessaire :
```
Key: project:{project_id}:guild:{guild_id}:user:{user_id}:channel:{type}
TTL: 1 heure
```

### Nettoyage des channels inactifs

Endpoint optionnel pour lister les channels inactifs depuis X jours :
```
GET /api/channels/private/inactive?days=30&guild_id=xxx
```

### Synchronisation Discord

L'API ne vérifie pas si le channel existe encore sur Discord. C'est la responsabilité du caller (n8n/Plugin) de :
1. Vérifier si le channel Discord existe toujours
2. Appeler DELETE si le channel a été supprimé manuellement

---

## Questions ouvertes

1. **Multi-type par user ?** Un utilisateur peut-il avoir plusieurs channels actifs de types différents ? → Oui (contrainte unique inclut `channel_type`)

2. **Historique ?** Garder l'historique des channels désactivés ou supprimer ? → Garder (soft delete via `is_active`)

3. **Metadata ?** Quelles infos stocker dans metadata ? → Flexible JSONB pour cas spécifiques

---

## Références

- RFC-001: Shopping Cart (pour le pattern de service)
- RFC-003: Branding (pour le pattern multi-tenant)
