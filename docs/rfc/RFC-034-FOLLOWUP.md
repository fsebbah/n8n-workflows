# RFC-034 — Suivi post-merge

**Date :** 2026-02-13
**PR d'origine :** #2172 (mergée)
**Branche :** `feature/rfc-034-branding`

---

## Issues identifiees

### 1. RBAC — Protection des 18 endpoints branding [CRITICAL]

**Statut :** FAIT (PR #2173 + PR #2174)
**Priorite :** Haute

**PR #2173** — Code RBAC : `PermissionDomain.BRANDING`, `STANDARD_PERMISSIONS`, `get_default_role_permissions`, `DEFAULT_ROUTE_PERMISSIONS` middleware.

**PR #2174** — Migration DB : `branding_003` insere les permissions branding + training + ecommerce dans `{schema}.permissions` et `{schema}.role_permissions` pour tous les tenants existants. Les nouveaux tenants sont geres par `init_rbac_for_tenant()`.

Roles assignes (role_id) :
- owner (11), super_admin (5), admin (1) : toutes les permissions (admin/manage/write/read/delete)
- user (10) : read uniquement

---

### 2. PromptOverride.value — Text vers JSONB (review finding I4) [MODERATE]

**Statut :** FAIT (PR #2173)
**Priorite :** Moyenne

Migration `branding_002` : `ALTER COLUMN value TYPE jsonb USING to_jsonb(value)`. Modele, schema et service mis a jour pour supporter `str | list[str]`.

---

### 3. Integration plugin — Endpoint resolve (COMMUNICATION)

**Statut :** Communication
**Priorite :** Moyenne

Le plugin Discord doit consommer `GET /api/guilds/{guild_id}/branding/resolve?channel_id=X` pour appliquer le branding en temps reel.

**Action :** Prevenir l'equipe plugin que l'endpoint est disponible. Fournir la doc API (`docs/plans/rfc-034-api-reference.md`).

---

## Reference endpoints pour l'equipe n8n

Tous les endpoints ci-dessous sont disponibles et montes. Prefixe : `/api/guilds`.
Auth : Service Token avec scope `branding:read` ou `branding:write` selon l'operation.

---

### A. Branding (identite visuelle du bot)

#### A1. GET /api/guilds/{guild_id}/branding

Recupere le branding du guild (salle par defaut).

**Reponse :**
```json
{
  "success": true,
  "data": {
    "room_id": "uuid",
    "room_name": "string",
    "is_default": true,
    "visual_config": {
      "bot": { "name": "MonBot", "emoji": "🤖", "color": "#5865F2", "description": "..." },
      "urls": { "logo": "https://...", "banner": "https://...", "website": "https://...", "support": "https://..." },
      "footer": { "text": "...", "icon_url": "https://..." },
      "emojis": { "success": "✅", "error": "❌", "warning": "⚠️", "info": "ℹ️", "loading": "⏳" },
      "embed_style": "modern"
    },
    "messages_config": {
      "messages": {
        "greetings": ["Bonjour !", "Salut !"],
        "help": "...",
        "empty_mention": "...",
        "errors": { "generic": "..." }
      },
      "scope": {
        "identity": { "role": "...", "qualities": ["..."], "limitations": ["..."] },
        "mission": "...",
        "out_of_scope_message": "..."
      }
    },
    "created_at": "2026-02-13T...",
    "updated_at": "2026-02-13T..."
  }
}
```

#### A2. PUT /api/guilds/{guild_id}/branding

Remplace entierement le branding du guild.

**Payload :**
```json
{
  "visual_config": {
    "bot": { "name": "MonBot", "emoji": "🤖", "color": "#5865F2", "description": "..." },
    "urls": { "logo": null, "banner": null, "website": null, "support": null },
    "footer": { "text": null, "icon_url": null },
    "emojis": { "success": "✅", "error": "❌", "warning": "⚠️", "info": "ℹ️", "loading": "⏳" },
    "embed_style": "modern"
  },
  "messages_config": {
    "messages": {
      "greetings": ["Bonjour !"],
      "help": null,
      "empty_mention": null,
      "errors": { "generic": null }
    },
    "scope": {
      "identity": { "role": "assistant", "qualities": ["precis"], "limitations": ["ne repond pas hors sujet"] },
      "mission": null,
      "out_of_scope_message": null
    }
  }
}
```

**Reponse :**
```json
{ "success": true, "message": "Branding mis à jour", "data": { "room_id": "uuid" } }
```

**Champs obligatoires :** `visual_config.bot.name`, `messages_config.messages.greetings` (min 1), `messages_config.scope.identity.limitations` (min 1).

---

### B. Rooms (salles de cours)

#### B1. GET /api/guilds/{guild_id}/rooms

Liste toutes les salles du guild.

**Reponse :**
```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "id": "uuid",
        "name": "Salle principale",
        "description": "...",
        "is_default": true,
        "channel_count": 3,
        "primary_color": "#5865F2",
        "embed_style": "modern",
        "created_at": "...",
        "updated_at": "..."
      }
    ],
    "count": 1
  }
}
```

#### B2. POST /api/guilds/{guild_id}/rooms

Cree une nouvelle salle.

**Payload :**
```json
{
  "name": "Salle Maths",
  "description": "Salle dediee aux cours de maths",
  "visual_config": { "bot": { "name": "MathBot", ... }, ... },
  "messages_config": { "messages": { "greetings": ["Bienvenue en maths !"], ... }, "scope": { ... } }
}
```

**Reponse (201) :**
```json
{
  "success": true,
  "message": "Salle créée",
  "data": { "id": "uuid", "name": "Salle Maths", "description": "...", "is_default": false, "created_at": "..." }
}
```

---

### C. Prompts (personnalisation des prompts)

#### C1. GET /api/guilds/{guild_id}/prompts

Recupere tous les prompts du guild (definitions + overrides).

**Query params :**
- `category` (optionnel) — filtre par categorie
- `language` (defaut: `fr`)
- `layer` (optionnel) — `core` ou `plugin`

**Reponse :**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "identity",
        "label": "Identité du bot",
        "layer": "core",
        "fields": [
          {
            "key": "role",
            "label": "Rôle",
            "description": "...",
            "field_type": "text",
            "required": false,
            "default_value": "assistant pedagogique",
            "current_value": "assistant pedagogique",
            "is_overridden": false,
            "variables": []
          }
        ]
      }
    ]
  }
}
```

#### C2. PUT /api/guilds/{guild_id}/prompts

Met a jour un prompt specifique.

**Payload :**
```json
{
  "category": "identity",
  "key": "role",
  "value": "tuteur en mathematiques",
  "language": "fr"
}
```

`value` accepte `string` ou `list[string]` selon le `field_type` du prompt.

**Reponse :**
```json
{
  "success": true,
  "message": "Prompt mis à jour",
  "data": { "category": "identity", "key": "role", "value": "tuteur en mathematiques", "language": "fr" }
}
```

---

### Recapitulatif des webhooks n8n

| Webhook n8n | Methode | Endpoint | Scope |
|---|---|---|---|
| GUILD-Get-Branding | GET | `/api/guilds/{guild_id}/branding` | branding:read |
| GUILD-Update-Branding | PUT | `/api/guilds/{guild_id}/branding` | branding:write |
| GUILD-Get-Rooms | GET | `/api/guilds/{guild_id}/rooms` | branding:read |
| GUILD-Create-Room | POST | `/api/guilds/{guild_id}/rooms` | branding:write |
| GUILD-Get-Prompts | GET | `/api/guilds/{guild_id}/prompts` | branding:read |
| GUILD-Update-Prompt | PUT | `/api/guilds/{guild_id}/prompts` | branding:write |

**Note :** l'equipe n8n avait `/api/prompts/{guild_id}` — le bon prefixe est `/api/guilds/{guild_id}/prompts`.
