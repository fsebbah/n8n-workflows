# RFC-062 — Specification API par acteur

> **Source de verite** pour les equipes Frontend et chatbot-core
> **Version** : 1.0
> **Date** : 2026-04-13

---

## Partie 1 : Endpoints appeles par le Frontend

Base URL : `/api/ecommerce/admin/guilds/{guild_id}`
Auth : `Authorization: Bearer <jwt>` + RBAC admin tenant
CSRF : **exempte** sur `/api/ecommerce/admin/**`

---

### 1. Categories Discord

#### 1.1 GET — Lister

```
GET /api/ecommerce/admin/guilds/{guild_id}/discord-categories
```

**Response 200 :**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "guild_id": "1286607696153546774",
      "name": "Promotions",
      "discord_category_id": "9876543210987654321",
      "created_at": "2026-04-13T10:00:00+00:00"
    }
  ]
}
```

#### 1.2 POST — Creer

```
POST /api/ecommerce/admin/guilds/{guild_id}/discord-categories
Content-Type: application/json
```

**Request :**
```json
{
  "name": "Promotions"
}
```

**Response 201 :**
```json
{
  "success": true,
  "data": {
    "id": "uuid-1",
    "guild_id": "1286607696153546774",
    "name": "Promotions",
    "discord_category_id": "9876543210987654321",
    "created_at": "2026-04-13T10:00:00+00:00"
  }
}
```

**Erreur 400 :**
```json
{
  "success": false,
  "error": "already_exists",
  "message": "Category 'Promotions' already exists for this guild"
}
```

#### 1.3 DELETE — Supprimer

```
DELETE /api/ecommerce/admin/guilds/{guild_id}/discord-categories/{category_id}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {"category_id": "uuid-1"}
}
```

---

### 2. Groupes

#### 2.1 GET — Lister

```
GET /api/ecommerce/admin/guilds/{guild_id}/groups
```

**Response 200 :**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-group",
      "name": "Promotion 2026",
      "description": "Promo principale",
      "category_name": "Promotions",
      "discord_channel_id": "1234567890123456789",
      "discord_invite_url": "https://discord.gg/abc123",
      "students_count": 25,
      "students_verified": 18,
      "monthly_quota_per_user": 500,
      "effective_quota": 500,
      "is_custom_quota": true,
      "created_at": "2026-04-13T10:00:00+00:00"
    }
  ]
}
```

#### 2.2 POST — Creer

```
POST /api/ecommerce/admin/guilds/{guild_id}/groups
Content-Type: application/json
```

**Request :**
```json
{
  "name": "Promotion 2026",
  "description": "Groupe principal de la promo",
  "category_id": "uuid-cat",
  "personal_channel_category_id": "uuid-cat-perso",
  "channel_name_format": "eleve-{fullname}",
  "personal_channels_enabled": true,
  "profs_role_discord_id": "555555555555555555",
  "monthly_quota_per_user": 500,
  "promotion_id": null,
  "room_model_id": null
}
```

| Champ | Type | Requis | Defaut |
|-------|------|--------|--------|
| `name` | string | Oui | — |
| `description` | string | Non | null |
| `category_id` | uuid | Non | null |
| `personal_channel_category_id` | uuid | Non | null |
| `channel_name_format` | string | Non | `"eleve-{fullname}"` |
| `personal_channels_enabled` | bool | Non | true |
| `profs_role_discord_id` | string | Non | null |
| `monthly_quota_per_user` | int | Non | null (fallback guild) |
| `promotion_id` | uuid | Non | null |
| `room_model_id` | uuid | Non | null |

**Response 201 :**
```json
{
  "success": true,
  "data": {
    "id": "uuid-group",
    "guild_id": "1286607696153546774",
    "name": "Promotion 2026",
    "discord_channel_id": "1234567890123456789",
    "discord_invite_url": "https://discord.gg/abc123",
    "discord_invite_expires_at": "2026-04-20T10:00:00+00:00",
    "students_count": 0,
    "created_at": "2026-04-13T10:00:00+00:00"
  }
}
```

#### 2.3 GET — Detail (avec eleves)

```
GET /api/ecommerce/admin/guilds/{guild_id}/groups/{group_id}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "id": "uuid-group",
    "name": "Promotion 2026",
    "description": "...",
    "discord_channel_id": "1234567890123456789",
    "discord_invite_url": "https://discord.gg/abc123",
    "channel_name_format": "eleve-{fullname}",
    "personal_channels_enabled": true,
    "monthly_quota_per_user": 500,
    "students": [
      {
        "id": "uuid-student",
        "email": "jean.dupont@email.com",
        "firstname": "Jean",
        "lastname": "Dupont",
        "matricule": "2026001",
        "status": "verified",
        "discord_user_id": "987654321012345678",
        "discord_channel_id": "111222333444555666",
        "verified_at": "2026-04-14T09:15:00+00:00"
      },
      {
        "id": "uuid-student-2",
        "email": "marie.curie@email.com",
        "firstname": "Marie",
        "lastname": "Curie",
        "matricule": "2026002",
        "status": "pending",
        "discord_user_id": null,
        "discord_channel_id": null,
        "verified_at": null
      }
    ]
  }
}
```

#### 2.4 PATCH — Modifier

```
PATCH /api/ecommerce/admin/guilds/{guild_id}/groups/{group_id}
Content-Type: application/json
```

**Request (partial update) :**
```json
{
  "name": "Promotion 2026 Premium",
  "monthly_quota_per_user": 800
}
```

**Response 200 :** meme format que 2.3.

#### 2.5 DELETE — Supprimer (cascade)

```
DELETE /api/ecommerce/admin/guilds/{guild_id}/groups/{group_id}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "group_id": "uuid-group",
    "students_deleted": 25,
    "channels_to_delete": 26,
    "credits_invalidated": 3750
  }
}
```

---

### 3. Students (eleves)

#### 3.1 POST — Ajouter un eleve

```
POST /api/ecommerce/admin/guilds/{guild_id}/groups/{group_id}/students
Content-Type: application/json
```

**Request :**
```json
{
  "email": "jean.dupont@email.com",
  "firstname": "Jean",
  "lastname": "Dupont",
  "matricule": "2026001"
}
```

**Response 201 :**
```json
{
  "success": true,
  "data": {
    "id": "uuid-student",
    "group_id": "uuid-group",
    "email": "jean.dupont@email.com",
    "firstname": "Jean",
    "lastname": "Dupont",
    "matricule": "2026001",
    "status": "pending",
    "created_at": "2026-04-13T10:00:00+00:00"
  }
}
```

#### 3.2 POST — Import CSV (multipart)

```
POST /api/ecommerce/admin/guilds/{guild_id}/groups/{group_id}/students/bulk
Content-Type: multipart/form-data

file: [CSV binary]
```

**Format CSV attendu :**
```csv
email,firstname,lastname,matricule
jean.dupont@email.com,Jean,Dupont,2026001
marie.curie@email.com,Marie,Curie,2026002
```

**Response 200 :**
```json
{
  "success": true,
  "imported": 95,
  "total": 100,
  "errors": [
    {"line": 12, "data": {"email": "xxx"}, "error": "invalid_email", "message": "Email invalide"},
    {"line": 34, "data": {"email": "jean@..."}, "error": "already_exists", "message": "Email deja inscrit"},
    {"line": 67, "data": {"email": "maria@..."}, "error": "missing_firstname", "message": "Prenom requis"}
  ]
}
```

#### 3.3 PATCH — Modifier un eleve

```
PATCH /api/ecommerce/admin/guilds/{guild_id}/students/{student_id}
Content-Type: application/json
```

**Request :**
```json
{
  "firstname": "Jean-Pierre",
  "matricule": "2026001-BIS"
}
```

#### 3.4 DELETE — Supprimer un eleve

```
DELETE /api/ecommerce/admin/guilds/{guild_id}/students/{student_id}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "student_id": "uuid-student",
    "discord_channel_deleted": true,
    "credits_invalidated": 150
  }
}
```

#### 3.5 POST — Promouvoir en admin

```
POST /api/ecommerce/admin/guilds/{guild_id}/students/{student_id}/promote-to-admin
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "student_id": "uuid-student",
    "new_user_id": "uuid-admin-user",
    "email": "jean.dupont@email.com"
  }
}
```

---

### 4. Discord Settings (branding accueil)

#### 4.1 GET — Lire

```
GET /api/ecommerce/admin/guilds/{guild_id}/discord-settings
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "guild_id": "1286607696153546774",
    "verification_enabled": true,
    "verification_method": "button",
    "verification_channel_id": "222333444555666",
    "welcome_enabled": true,
    "welcome_title": "Bienvenue sur EcoleXYZ !",
    "welcome_message": "Pour finaliser ton inscription...",
    "welcome_color": 5865426,
    "welcome_thumbnail_url": "https://cdn.ecole.xyz/logo.png",
    "welcome_footer_text": "Equipe EcoleXYZ",
    "verification_success_message": "Email verifie !",
    "verification_error_message": "Email non reconnu.",
    "verification_timeout_hours": 24,
    "verification_reminder_hours": 6,
    "timeout_action": "remind",
    "invite_max_age_seconds": 604800
  }
}
```

#### 4.2 PUT — Modifier

```
PUT /api/ecommerce/admin/guilds/{guild_id}/discord-settings
Content-Type: application/json
```

**Request (complet) :**
```json
{
  "verification_enabled": true,
  "verification_method": "button",
  "verification_channel_id": "222333444555666",
  "welcome_enabled": true,
  "welcome_title": "Bienvenue !",
  "welcome_message": "...",
  "welcome_color": 5865426,
  "welcome_thumbnail_url": "https://...",
  "welcome_footer_text": "...",
  "verification_success_message": "...",
  "verification_error_message": "...",
  "verification_timeout_hours": 24,
  "verification_reminder_hours": 6,
  "timeout_action": "remind",
  "invite_max_age_seconds": 604800
}
```

---

### 5. Branding overview (vue consolidee)

#### 5.1 GET — Lecture consolidee

```
GET /api/ecommerce/admin/guilds/{guild_id}/branding-overview
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "guild": {
      "guild_id": "1286607696153546774",
      "guild_name": "EcoleXYZ",
      "guild_icon_url": "https://cdn.discordapp.com/icons/.../abc123.png",
      "member_count": 125,
      "last_synced_at": "2026-04-13T10:00:00+00:00"
    },
    "discord_settings": {
      "verification_enabled": true,
      "verification_method": "button",
      "welcome_enabled": true,
      "welcome_title": "Bienvenue !"
    },
    "bot": {
      "name": "Chef Cuisine",
      "color": 5865426
    }
  }
}
```

#### 5.2 PATCH — Modifier identite serveur

```
PATCH /api/ecommerce/admin/guilds/{guild_id}/discord-identity
Content-Type: application/json
```

**Request :**
```json
{
  "name": "EcoleXYZ - Serveur Principal",
  "icon_url": "https://cdn.example.com/new-logo.png"
}
```

**Debounce frontend** : attendre 30 secondes entre deux appels (rate limit Discord).

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "guild_id": "1286607696153546774",
    "name": "EcoleXYZ - Serveur Principal",
    "icon_url": "https://cdn.discordapp.com/icons/.../new-hash.png"
  }
}
```

**Erreur 403 (permission Discord) :**
```json
{
  "success": false,
  "error": "missing_permission",
  "message": "Le bot n'a pas la permission MANAGE_GUILD"
}
```

---

### 6. Monitoring Discord

#### 6.1 GET — Nombre de channels

```
GET /api/discord/guilds/{guild_id}/channel-count
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "guild_id": "1286607696153546774",
    "total": 423,
    "limit": 500,
    "available": 77,
    "warning": true,
    "critical": false
  }
}
```

#### 6.2 GET — Liste des roles Discord

```
GET /api/discord/guilds/{guild_id}/roles
```

**Response 200 :**
```json
{
  "success": true,
  "data": [
    {"id": "111222333", "name": "@everyone", "color": 0, "position": 0},
    {"id": "444555666", "name": "Professeurs", "color": 3447003, "position": 5},
    {"id": "777888999", "name": "Admin", "color": 15158332, "position": 10}
  ]
}
```

---

### 7. Codes d'erreur (frontend)

| HTTP | Code | Message | Action UI |
|------|------|---------|-----------|
| 400 | `already_exists` | Nom/email deja utilise | Afficher erreur inline |
| 400 | `invalid_email` | Format email invalide | Validation champ |
| 400 | `missing_firstname` | Prenom requis | Validation formulaire |
| 400 | `channel_limit_reached` | 500 channels atteint | Bloquer creation |
| 403 | `missing_permission` | Bot sans MANAGE_GUILD | Message admin |
| 404 | `not_found` | Resource introuvable | Refresh liste |
| 500 | `discord_timeout` | Plugin n'a pas repondu en 30s | "Reessayez" |
| 500 | `n8n_unavailable` | n8n injoignable | "Service temporairement indisponible" |

---

---

## Partie 2 : Endpoints REST pour commandes Discord (appeles par n8n)

n8n ne peut pas piloter Redis Streams nativement. Le backend expose des
endpoints REST qui wrappent le `DiscordCommandService` (Redis → plugin).

Base URL : `/api/discord/commands`
Auth : `X-Service-Token: <service_token>` (scope `discord:write`)

### Endpoint generique

```
POST /api/discord/commands/{action}
Header: X-Service-Token: <token>
Content-Type: application/json
```

`{action}` correspond aux commandes Redis de la Partie 3.

### create_channel (utilise par student-verify)

```
POST /api/discord/commands/create-channel
```

**Request :**
```json
{
  "guild_id": "1286607696153546774",
  "name": "eleve-jean-dupont",
  "parent_id": "9876543210987654321",
  "topic": "Channel personnel Jean Dupont",
  "private": true,
  "permission_overwrites": [
    {"id": "1286607696153546774", "type": 0, "deny": "1024"},
    {"id": "987654321012345678", "type": 1, "allow": "68608"},
    {"id": "555555555555555555", "type": 0, "allow": "68608"}
  ]
}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "channel_id": "111222333444555666"
  }
}
```

### delete_channel

```
POST /api/discord/commands/delete-channel
```

**Request :**
```json
{
  "guild_id": "1286607696153546774",
  "channel_id": "111222333444555666"
}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

### set_permissions (utilise par student-verify)

```
POST /api/discord/commands/set-permissions
```

**Request :**
```json
{
  "guild_id": "1286607696153546774",
  "channel_id": "1234567890123456789",
  "target_id": "987654321012345678",
  "target_type": "member",
  "allow": ["view_channel", "send_messages", "read_message_history"]
}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "updated": true
  }
}
```

### create_invite (utilise par invite-renew-cron)

```
POST /api/discord/commands/create-invite
```

**Request :**
```json
{
  "guild_id": "1286607696153546774",
  "channel_id": "1234567890123456789",
  "max_age": 604800,
  "max_uses": 0
}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "invite_url": "https://discord.gg/abc123",
    "invite_code": "abc123",
    "expires_at": "2026-04-20T10:00:00Z"
  }
}
```

### create_category

```
POST /api/discord/commands/create-category
```

**Request :**
```json
{
  "guild_id": "1286607696153546774",
  "name": "Promotions"
}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "category_id": "9876543210987654321"
  }
}
```

### update_guild

```
POST /api/discord/commands/update-guild
```

**Request :**
```json
{
  "guild_id": "1286607696153546774",
  "name": "EcoleXYZ - Nouveau Nom",
  "icon_url": "https://cdn.example.com/logo.png"
}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "name": "EcoleXYZ - Nouveau Nom",
    "icon_url": "https://cdn.discordapp.com/icons/.../abc.png"
  }
}
```

### get_roles

```
POST /api/discord/commands/get-roles
```

**Request :**
```json
{
  "guild_id": "1286607696153546774"
}
```

**Response 200 :**
```json
{
  "success": true,
  "data": [
    {"id": "111222333", "name": "@everyone", "color": 0, "position": 0},
    {"id": "444555666", "name": "Professeurs", "color": 3447003, "position": 5}
  ]
}
```

### get_channel_count

```
POST /api/discord/commands/get-channel-count
```

**Request :**
```json
{
  "guild_id": "1286607696153546774"
}
```

**Response 200 :**
```json
{
  "success": true,
  "data": {
    "count": 423
  }
}
```

### Erreurs

| HTTP | Erreur | Cause |
|------|--------|-------|
| 400 | `{"success": false, "error": "...", "message": "..."}` | Plugin retourne une erreur Discord |
| 403 | `{"success": false, "error": "missing_permission"}` | Bot sans la permission requise |
| 500 | `{"success": false, "error": "discord_timeout"}` | Aucun plugin n'a repondu en 30s |

### Mapping pour n8n student-verify

Le workflow `student-verify` remplace ses appels Discord API directs par
des appels a ces endpoints :

```
AVANT (n8n → Discord API directement) :
  PUT https://discord.com/api/v10/channels/{cid}/permissions/{uid}

APRES (n8n → Backend → Redis → Plugin → Discord) :
  POST https://api.example.com/api/discord/commands/set-permissions
  Body: { guild_id, channel_id, target_id, target_type, allow }
```

---

## Partie 3 : Commandes Redis (chatbot-core / plugin)

Stream : `discord:commands` (backend → plugin)
Stream : `discord:results` (plugin → backend)
Consumer group : `discord-plugins`

---

### 1. create_category

**Commande :**
```json
{
  "request_id": "uuid-123",
  "action": "create_category",
  "guild_id": "1286607696153546774",
  "payload": {
    "name": "Promotions"
  },
  "timestamp": "2026-04-13T10:00:00Z"
}
```

**Resultat (succes) :**
```json
{
  "request_id": "uuid-123",
  "success": "true",
  "guild_id": "1286607696153546774",
  "data": "{\"category_id\": \"9876543210987654321\"}",
  "timestamp": "2026-04-13T10:00:01Z"
}
```

**Plugin execute :** `guild.create_category(name="Promotions")`

---

### 2. create_channel

**Commande :**
```json
{
  "request_id": "uuid-234",
  "action": "create_channel",
  "guild_id": "1286607696153546774",
  "payload": {
    "name": "promotion-2026",
    "parent_id": "9876543210987654321",
    "topic": "Espace de la promotion 2026",
    "private": true,
    "permission_overwrites": [
      {"id": "1286607696153546774", "type": 0, "deny": "1024"}
    ]
  },
  "timestamp": "2026-04-13T10:00:00Z"
}
```

**Resultat :**
```json
{
  "request_id": "uuid-234",
  "success": "true",
  "guild_id": "1286607696153546774",
  "data": "{\"channel_id\": \"1234567890123456789\"}",
  "timestamp": "2026-04-13T10:00:01Z"
}
```

**Plugin execute :**
```python
overwrites = {}
for ow in payload.get("permission_overwrites", []):
    target = guild.get_role(int(ow["id"])) if ow["type"] == 0 else guild.get_member(int(ow["id"]))
    overwrites[target] = discord.PermissionOverwrite(...)

channel = await guild.create_text_channel(
    name=payload["name"],
    category=guild.get_channel(int(payload["parent_id"])),
    topic=payload.get("topic"),
    overwrites=overwrites,
)
```

---

### 3. delete_channel

**Commande :**
```json
{
  "request_id": "uuid-345",
  "action": "delete_channel",
  "guild_id": "1286607696153546774",
  "payload": {
    "channel_id": "1234567890123456789"
  },
  "timestamp": "2026-04-13T10:00:00Z"
}
```

**Resultat :**
```json
{
  "request_id": "uuid-345",
  "success": "true",
  "guild_id": "1286607696153546774",
  "data": "{\"deleted\": true}",
  "timestamp": "2026-04-13T10:00:01Z"
}
```

**Plugin execute :** `channel = guild.get_channel(int(channel_id)); await channel.delete()`

---

### 4. update_guild

**Commande :**
```json
{
  "request_id": "uuid-456",
  "action": "update_guild",
  "guild_id": "1286607696153546774",
  "payload": {
    "name": "EcoleXYZ - Nouveau Nom",
    "icon_url": "https://cdn.example.com/logo.png"
  },
  "timestamp": "2026-04-13T10:00:00Z"
}
```

**Resultat :**
```json
{
  "request_id": "uuid-456",
  "success": "true",
  "guild_id": "1286607696153546774",
  "data": "{\"name\": \"EcoleXYZ - Nouveau Nom\", \"icon_url\": \"https://cdn.discordapp.com/icons/.../abc.png\"}",
  "timestamp": "2026-04-13T10:00:02Z"
}
```

**Plugin execute :**
```python
kwargs = {}
if "name" in payload:
    kwargs["name"] = payload["name"]
if "icon_url" in payload:
    async with httpx.AsyncClient() as client:
        resp = await client.get(payload["icon_url"])
        kwargs["icon"] = resp.content
await guild.edit(**kwargs)
```

---

### 5. create_invite

**Commande :**
```json
{
  "request_id": "uuid-567",
  "action": "create_invite",
  "guild_id": "1286607696153546774",
  "payload": {
    "channel_id": "1234567890123456789",
    "max_age": 604800,
    "max_uses": 0
  },
  "timestamp": "2026-04-13T10:00:00Z"
}
```

**Resultat :**
```json
{
  "request_id": "uuid-567",
  "success": "true",
  "guild_id": "1286607696153546774",
  "data": "{\"invite_url\": \"https://discord.gg/abc123\", \"invite_code\": \"abc123\", \"expires_at\": \"2026-04-20T10:00:00Z\"}",
  "timestamp": "2026-04-13T10:00:01Z"
}
```

**Plugin execute :**
```python
channel = guild.get_channel(int(payload["channel_id"]))
invite = await channel.create_invite(
    max_age=payload.get("max_age", 604800),
    max_uses=payload.get("max_uses", 0),
)
```

---

### 6. set_permissions

**Commande :**
```json
{
  "request_id": "uuid-678",
  "action": "set_permissions",
  "guild_id": "1286607696153546774",
  "payload": {
    "channel_id": "1234567890123456789",
    "target_id": "987654321012345678",
    "target_type": "member",
    "allow": ["view_channel", "send_messages", "read_message_history"]
  },
  "timestamp": "2026-04-13T10:00:00Z"
}
```

**Resultat :**
```json
{
  "request_id": "uuid-678",
  "success": "true",
  "guild_id": "1286607696153546774",
  "data": "{\"updated\": true}",
  "timestamp": "2026-04-13T10:00:01Z"
}
```

**Plugin execute :**
```python
channel = guild.get_channel(int(payload["channel_id"]))
if payload["target_type"] == "member":
    target = guild.get_member(int(payload["target_id"]))
else:
    target = guild.get_role(int(payload["target_id"]))

perms = discord.PermissionOverwrite()
for perm_name in payload["allow"]:
    setattr(perms, perm_name, True)

await channel.set_permissions(target, overwrite=perms)
```

---

### 7. get_roles

**Commande :**
```json
{
  "request_id": "uuid-789",
  "action": "get_roles",
  "guild_id": "1286607696153546774",
  "payload": {},
  "timestamp": "2026-04-13T10:00:00Z"
}
```

**Resultat :**
```json
{
  "request_id": "uuid-789",
  "success": "true",
  "guild_id": "1286607696153546774",
  "data": "[{\"id\": \"111222333\", \"name\": \"@everyone\", \"color\": 0, \"position\": 0}, {\"id\": \"444555666\", \"name\": \"Professeurs\", \"color\": 3447003, \"position\": 5}]",
  "timestamp": "2026-04-13T10:00:01Z"
}
```

**Plugin execute :**
```python
roles = [
    {"id": str(r.id), "name": r.name, "color": r.color.value, "position": r.position}
    for r in guild.roles
    if not r.is_bot_managed()
]
```

---

### 8. get_channel_count

**Commande :**
```json
{
  "request_id": "uuid-890",
  "action": "get_channel_count",
  "guild_id": "1286607696153546774",
  "payload": {},
  "timestamp": "2026-04-13T10:00:00Z"
}
```

**Resultat :**
```json
{
  "request_id": "uuid-890",
  "success": "true",
  "guild_id": "1286607696153546774",
  "data": "{\"count\": 423}",
  "timestamp": "2026-04-13T10:00:01Z"
}
```

**Plugin execute :** `count = len(guild.channels)`

---

### 9. Erreurs communes (toutes commandes)

```json
{
  "request_id": "uuid-xxx",
  "success": "false",
  "guild_id": "1286607696153546774",
  "error": "missing_permission",
  "message": "Bot lacks MANAGE_GUILD permission on this server",
  "timestamp": "2026-04-13T10:00:01Z"
}
```

| Code erreur | Description |
|-------------|-------------|
| `missing_permission` | Bot n'a pas la permission requise |
| `guild_not_found` | Plugin ne gere pas ce guild_id |
| `channel_not_found` | Channel introuvable |
| `role_not_found` | Role introuvable |
| `discord_api_error` | Erreur Discord API (details dans message) |
| `rate_limited` | Discord rate limit (retry apres X ms) |

---

### 10. Notes techniques

- Tous les champs `data` sont des **strings JSON** (Redis Streams ne supporte que les strings)
- Le `success` est aussi un string (`"true"` / `"false"`)
- Le plugin doit **ACK** le message apres traitement : `redis.xack(stream, group, msg_id)`
- Si le plugin ne gere pas le `guild_id` → **ne pas ACK** (un autre plugin le prendra)
- Timeout backend : **30 secondes** — si pas de reponse, erreur `discord_timeout`
- MAXLEN : **~1000** sur les deux streams (commandes + resultats)
