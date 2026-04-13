# RFC-062 : Clarification du périmètre de branding

**Date** : 2026-04-12
**Auteur** : Equipe Frontend
**Statut** : Draft — en attente de retours de toutes les equipes
**Priorite** : Moyenne
**Equipes concernees** : Frontend, Backend, n8n, chatbot-core (minimal)

---

## 1. Probleme

Apres la livraison de RFC-034 (branding bot) et RFC-061 (welcome DM + verification), le concept de "branding" couvre plusieurs niveaux sans frontiere claire. Cela cree de la confusion pour :
- **Les admins** : deux cartes "Branding" et "Branding Discord" dans le hub guild, difficile de savoir laquelle configure quoi
- **Les developpeurs** : deux stores (`branding.ts` pour RFC-034, `discordGroups.ts` pour RFC-061 discord settings), deux services, deux modeles — ou s'arrete l'un, ou commence l'autre ?
- **Les equipes backend/plugins** : les settings du bot (persona, messages, couleurs) et les settings du serveur (welcome DM, verification, invites) sont-ils dans la meme table ? Meme endpoint ?

---

## 2. Niveaux de branding identifies

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NIVEAU TENANT                                 │
│  (Organisation globale - ex: "EcoleXYZ")                            │
│  - Logo entreprise, couleurs corporate                               │
│  - Domaine email autorise (@ecolexyz.com)                           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     NIVEAU SERVEUR DISCORD (Guild)                   │
│  (Configuration du serveur Discord)                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐                 │
│  │ Identite serveur    │    │ Onboarding          │                 │
│  │ - Nom serveur       │    │ - Welcome DM        │                 │
│  │ - Icone serveur     │    │ - Verification      │                 │
│  │ - Banniere          │    │ - Timeout/relances  │                 │
│  └─────────────────────┘    └─────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         NIVEAU BOT                                   │
│  (Personnalite du bot dans ses reponses IA)                         │
│  - Nom du bot ("Chef Cuisine", "Prof Maths")                        │
│  - Avatar, couleur embed                                             │
│  - Ton, style de reponse                                             │
│  - Messages d'accueil conversation                                   │
│  - Messages d'erreur IA                                              │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NIVEAU GROUPE/PROMOTION                           │
│  (Configuration par cohorte d'eleves)                               │
│  - Format nom channel personnel                                      │
│  - Quota credits par eleve                                          │
│  - Role Discord profs                                                │
│  - Activation channels personnels                                    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      NIVEAU CHANNEL/ROOM                             │
│  (Configuration par channel specifique)                              │
│  - Sources RAG specifiques                                           │
│  - Prompt custom                                                     │
│  - Override couleur (optionnel)                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.1 Niveau Serveur Discord (guild)

Configuration qui s'applique **a tout le serveur**, independamment des channels ou du bot :
- Nom et icone du serveur (modifiables via App Web)
- Welcome DM envoye aux nouveaux membres (RFC-061)
- Methode de verification (button/DM, timeouts, messages succes/erreur)
- Duree de vie des invites
- Logo/couleur de l'ecole dans les embeds systeme

**Stockage** : table `guild_discord_settings` (RFC-061)
**UI** : carte "Accueil serveur" dans le hub guild

### 2.2 Niveau Bot (personnalite du bot dans ses reponses)

Configuration qui definit **comment le bot repond** dans les conversations :
- Nom, emoji, couleur du bot
- Logo, banniere
- Messages d'accueil (greetings), d'aide, d'erreur
- Identite : role, qualites, limitations, mission, scope
- Style d'embed (compact/detaille)

**Stockage** : fichiers JSON branding dans le bucket/DB (RFC-034), geres via `visual_config` + `messages_config`
**UI** : carte "Identite du bot" dans le hub guild

### 2.3 Niveau Channel / Room

Configuration qui s'applique **a un channel specifique** :
- Quel bot repond dans ce channel (si multi-bot)
- Contexte specifique au channel (RAG sources, prompts custom)
- Eventuellement : branding override par channel (couleur differente, persona differente)

**Stockage** : `rooms` table + branding par room (RFC-034, partiellement)
**UI** : `RoomsManagerView`

### 2.4 Niveau Groupe / Promotion (RFC-061)

Configuration liee a un groupe d'etudiants :
- Channel name format pour les channels personnels
- Activation des channels personnels
- Role profs Discord
- Quota de credits

**Stockage** : table `groups` (RFC-061)
**UI** : `GroupDetailView` onglet Parametres

---

## 3. Ou configurer quoi ?

### 3.1 Matrice de configuration

| Parametre | Discord | App Web | Auto (API) | Notes |
|-----------|:-------:|:-------:|:----------:|-------|
| **SERVEUR DISCORD** |||||
| Nom du serveur | ❌ | ✅ | ✅ | Via App Web uniquement |
| Icone du serveur | ❌ | ✅ | ✅ | Upload dans App Web |
| Banniere serveur | ❌ | ✅ | ✅ | Upload dans App Web |
| **ONBOARDING (RFC-061)** |||||
| Welcome DM (titre, message, logo) | ❌ | ✅ | - | App Web uniquement |
| Methode verification (bouton/DM) | ❌ | ✅ | - | App Web uniquement |
| Channel de verification | ❌ | ✅ | ✅ | Selection dans App Web |
| Timeout verification | ❌ | ✅ | - | App Web uniquement |
| Messages succes/erreur | ❌ | ✅ | - | App Web uniquement |
| **BOT (RFC-034)** |||||
| Nom du bot (persona) | ❌ | ✅ | - | App Web uniquement |
| Avatar du bot | Portal | ❌ | ✅ | Discord Developer Portal, lu auto |
| Couleur embed | ❌ | ✅ | - | App Web uniquement |
| Logo dans embeds | ❌ | ✅ | - | App Web uniquement |
| Ton/personnalite | ❌ | ✅ | - | App Web uniquement |
| **GROUPES (RFC-061)** |||||
| Creation groupe | ❌ | ✅ | ✅ | Channel cree auto via n8n |
| Format channel perso | ❌ | ✅ | - | App Web uniquement |
| Quota credits | ❌ | ✅ | - | App Web uniquement |

### 3.2 Principe directeur

**Tout se configure dans l'App Web**, sauf :
- **Avatar du bot** : Discord Developer Portal (rarement change, global)

Les donnees Discord (nom serveur, icone) sont :
1. Modifiables depuis l'App Web (via Discord API)
2. Lues automatiquement au demarrage du bot (pas de copier-coller)

---

## 4. Architecture technique

### 4.1 Flow de modification identite serveur

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│     n8n     │────▶│   Discord   │
│  App Web    │     │    API      │     │   Webhook   │     │     API     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     │                    │                    │                    │
     │ Upload icon        │ PATCH /guilds/     │ discord-guild-     │ PATCH /guilds/
     │ Change name        │   {gid}/discord-   │   update           │   {guild_id}
     │                    │   settings         │                    │
     │                    │                    │                    │
     │                    │ Stocke en DB       │                    │ Retourne
     │                    │                    │                    │ icon_url
```

### 4.2 Lecture automatique des donnees Discord

```python
# Au demarrage du bot (on_ready)
# Ces donnees sont disponibles sans appel API supplementaire

bot_avatar_url = bot.user.avatar.url      # Avatar du bot
guild_name = guild.name                    # Nom du serveur
guild_icon_url = guild.icon.url           # Icone du serveur
guild_banner_url = guild.banner.url       # Banniere du serveur
```

### 4.3 Permission requise

Le bot doit avoir la permission `MANAGE_GUILD` (0x00000020) sur le serveur pour modifier le nom et l'icone.

Cette permission est configuree a 2 niveaux :

| Niveau | Qui configure | Quand |
|--------|---------------|-------|
| OAuth2 URL | Equipe Dev | Generation du lien d'invite |
| Role serveur | Admin Discord | Apres invitation du bot |

---

## 5. Probleme critique : Authentification Discord API

### 5.1 Flow detaille

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────────┐
│ Frontend │────▶│ Backend  │────▶│   n8n    │────▶│ Discord API  │
│ App Web  │     │  API     │     │ Webhook  │     │ PATCH /guild │
└──────────┘     └──────────┘     └──────────┘     └──────────────┘
     │                │                │                   │
     │ tenant_id      │ tenant_id      │ BOT_TOKEN         │
     │ guild_id       │ guild_id       │ (stocke n8n      │
     │ name           │ name           │  OU recupere     │
     │ icon_url       │ icon_url       │  depuis DB)      │
     └────────────────┴────────────────┴───────────────────┘
```

### 5.2 Variables par etape

#### Frontend → Backend
```json
{
  "tenant_id": "uuid",
  "guild_id": "123456789",
  "name": "Mon Serveur",
  "icon_url": "https://cdn.example.com/logo.png"
}
```

#### Backend → n8n (webhook `discord-guild-update`)
```json
{
  "tenant_id": "uuid",
  "guild_id": "123456789",
  "name": "Mon Serveur",
  "icon_url": "https://cdn.example.com/logo.png"
}
```

#### n8n → Discord API
```http
PATCH https://discord.com/api/v10/guilds/{guild_id}
Authorization: Bot {BOT_TOKEN}
Content-Type: application/json

{
  "name": "Mon Serveur",
  "icon": "data:image/png;base64,iVBORw0KGgo..."
}
```

### 5.3 Variable critique : BOT_TOKEN

| Variable | Stockee ou | Passee par Frontend ? |
|----------|------------|----------------------|
| `tenant_id` | BDD | ✅ Oui |
| `guild_id` | BDD | ✅ Oui |
| `name` | Input user | ✅ Oui |
| `icon_url` | Input user | ✅ Oui |
| `BOT_TOKEN` | **?** | ❌ **JAMAIS** |

**Le BOT_TOKEN ne doit JAMAIS transiter par le Frontend ou le Backend API.**

### 5.4 Options d'architecture

#### Option A : Bot unique partage (multi-tenant)

```
┌─────────────────────────────────────────────────────┐
│                      n8n                             │
│  ┌─────────────────────────────────────────────┐    │
│  │ Credential: DISCORD_BOT_TOKEN               │    │
│  │ Valeur: "MTI4NjYwNzY5NjE1MzU0Njc3NA..."    │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  Webhook discord-guild-update:                      │
│  1. Recevoir {guild_id, name, icon_url}             │
│  2. Utiliser BOT_TOKEN depuis credentials           │
│  3. Appeler Discord API                              │
└─────────────────────────────────────────────────────┘
```

**Avantages :**
- Simple a implementer
- Un seul token a gerer

**Inconvenients :**
- Tous les tenants partagent le meme bot Discord
- Pas de personnalisation bot par tenant

#### Option B : Bot par tenant

```
┌─────────────────────────────────────────────────────┐
│                      n8n                             │
│                                                      │
│  Webhook discord-guild-update:                      │
│  1. Recevoir {tenant_id, guild_id, name, icon_url}  │
│  2. Query DB: SELECT bot_token FROM tenants         │
│               WHERE id = tenant_id                   │
│  3. Utiliser bot_token recupere                      │
│  4. Appeler Discord API                              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   Base de donnees                    │
│                                                      │
│  Table tenants:                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ id       │ name      │ bot_token (encrypted) │   │
│  │──────────│───────────│───────────────────────│   │
│  │ uuid-1   │ EcoleA    │ MTI4NjYw... (chiffre) │   │
│  │ uuid-2   │ EcoleB    │ OTg3NjU0... (chiffre) │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Avantages :**
- Chaque tenant a son propre bot
- Isolation complete
- Personnalisation avatar/nom bot par tenant

**Inconvenients :**
- Complexite accrue
- Gestion des tokens (stockage securise, rotation)
- Chaque tenant doit creer son bot dans Discord Dev Portal

### 5.5 Decision requise

| Question | Options | Impact |
|----------|---------|--------|
| Architecture bot | A (partage) / B (par tenant) | Toute l'architecture |
| Stockage token | n8n credentials / DB chiffree | Securite, maintenance |
| Qui cree le bot ? | Equipe dev / Admin tenant | Onboarding tenants |

**⚠️ Cette decision doit etre prise AVANT l'implementation de RFC-062.**

### 5.6 Recommandation

Pour la **Phase 1**, utiliser l'**Option A** (bot partage) :
- Plus rapide a implementer
- Permet de valider le flow
- Migration vers Option B possible plus tard

Pour le **long terme**, prevoir l'**Option B** (bot par tenant) :
- Meilleure isolation
- Permet aux ecoles d'avoir leur propre bot
- Necessite un processus d'onboarding tenant

---

## 6. Donnees CRUD Branding Discord

### 6.1 READ - Donnees recuperees

| Source | Donnees | Auto-recuperable |
|--------|---------|:----------------:|
| **Discord API** | `guild.name` | ✅ |
| **Discord API** | `guild.icon.url` | ✅ |
| **Discord API** | `guild.banner.url` | ✅ |
| **Discord API** | `bot.user.avatar.url` | ✅ |
| **Discord API** | `guild.channels` (liste pour selection) | ✅ |
| **Discord API** | `guild.roles` (liste pour selection) | ✅ |
| **DB** | Welcome DM settings | ✅ |
| **DB** | Verification settings | ✅ |
| **DB** | Invite settings | ✅ |

### 6.2 CREATE/UPDATE - Donnees envoyees

```yaml
# Identite serveur (via Discord API)
guild_name: string              # Nom du serveur (max 100 chars)
guild_icon: file|base64|url     # Icone (PNG/JPEG/GIF, max 8MB, min 128x128)

# Welcome DM
welcome_enabled: boolean
welcome_title: string           # Max 256 chars
welcome_message: string         # Max 4096 chars
welcome_color: integer          # Hex color (ex: 5865426)
welcome_thumbnail_url: string   # URL image (logo ecole)
welcome_footer_text: string     # Max 2048 chars

# Verification
verification_enabled: boolean
verification_method: enum       # "button" | "dm"
verification_channel_id: string # ID du channel (selection depuis liste)
verification_timeout_hours: integer
verification_reminder_hours: integer
timeout_action: enum            # "remind" | "kick" | "none"
verification_success_message: string
verification_error_message: string

# Invitations
invite_max_age_seconds: integer # 0 = permanent, 604800 = 7j
```

### 6.3 DELETE - Reset/Desactivation

| Action | Comportement |
|--------|--------------|
| Desactiver welcome DM | `welcome_enabled = false` |
| Desactiver verification | `verification_enabled = false` |
| Reset aux defauts | Endpoint `DELETE /guilds/{gid}/discord-settings` |

---

## 7. Schema de donnees

### 7.1 Table `guild_discord_settings` (mise a jour)

```sql
CREATE TABLE guild_discord_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(50) NOT NULL UNIQUE,

    -- Identite serveur (cache des valeurs Discord)
    guild_name VARCHAR(100),
    guild_icon_url VARCHAR(255),

    -- Verification
    verification_enabled BOOLEAN DEFAULT false,
    verification_method VARCHAR(20) DEFAULT 'button',  -- 'button' | 'dm'
    verification_channel_id VARCHAR(50),

    -- Welcome DM
    welcome_enabled BOOLEAN DEFAULT true,
    welcome_title VARCHAR(256),
    welcome_message TEXT,
    welcome_color INTEGER DEFAULT 5865426,
    welcome_thumbnail_url VARCHAR(255),
    welcome_footer_text VARCHAR(2048),

    -- Messages verification
    verification_success_message TEXT,
    verification_error_message TEXT,
    verification_retry_message TEXT,

    -- Timeouts
    verification_timeout_hours INTEGER DEFAULT 24,
    verification_reminder_hours INTEGER DEFAULT 6,
    timeout_action VARCHAR(20) DEFAULT 'remind',  -- 'remind' | 'kick' | 'none'

    -- Invitations
    invite_max_age_seconds INTEGER DEFAULT 604800,  -- 7 jours

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 8. Decisions

### 8.1 Questions tranchees

| Question | Decision |
|----------|----------|
| Q1 — Welcome DM = serveur ou bot ? | **Serveur**. C'est un processus d'onboarding, pas une conversation IA. |
| Q2 — Un editeur ou plusieurs ? | **Option B** — Editeur unifie avec onglets (moyen terme) |
| Q3 — Nommage des cartes | "Identite du bot" / "Accueil serveur" |
| Q4 — Fusionner endpoints ? | **Non** pour l'instant. Garder separes mais documenter. |
| Q5 — Branding per-channel ? | **Non**. Welcome DM et verification sont per-guild uniquement. |
| Q6 — Ou configurer ? | **App Web uniquement** (sauf avatar bot = Dev Portal) |

### 8.2 Principe retenu

**Tout se configure dans l'App Web.** L'admin n'a pas besoin d'aller dans Discord pour configurer le branding.

---

## 9. Equipes impactees

### 9.1 Frontend

**Scope :**
- Renommer cartes hub ("Identite du bot" / "Accueil serveur")
- Ajouter upload icon serveur + champ nom dans `DiscordSettingsModal`
- Fusionner les 2 editeurs en 1 avec onglets (moyen terme)
- Afficher preview des settings recuperes auto (icon, name)
- Refactoring stores (`branding.ts` + `discordGroups.ts` → unifie) — optionnel

### 9.2 Backend

**Scope :**
- Etendre `PATCH /guilds/{gid}/discord-settings` (name, icon)
- Appeler n8n `discord-guild-update` quand name/icon change
- Migration DB : ajouter `guild_name`, `guild_icon_url`
- Endpoint lecture settings consolides (branding + discord) — moyen terme
- Documentation OpenAPI mise a jour

### 9.3 n8n

**Scope :**
- Nouveau webhook `discord-guild-update` (name, icon)
- Gestion erreur permission `MANAGE_GUILD`
- Webhook lecture guild info (sync inverse) — optionnel

### 9.4 chatbot-core

**Scope minimal :**
- Helper pour recuperer guild icon/name au demarrage (deja disponible via discord.py)

Pas de nouveau code obligatoire. Les plugins utilisent deja :
```python
guild.name       # Nom du serveur
guild.icon.url   # URL de l'icone
bot.user.avatar.url  # Avatar du bot
```

### 9.5 Plugins Discord

**Aucun impact.** Les plugins utilisent chatbot-core qui expose ces donnees.

---

## 10. Webhooks n8n

### 10.1 `discord-guild-update` (nouveau)

**Payload :**
```json
{
  "action": "update_guild",
  "guild_id": "1286607696153546774",
  "name": "EcoleXYZ - Serveur Principal",
  "icon": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Response (succes) :**
```json
{
  "success": true,
  "guild": {
    "id": "1286607696153546774",
    "name": "EcoleXYZ - Serveur Principal",
    "icon_url": "https://cdn.discordapp.com/icons/..."
  }
}
```

**Response (erreur permission) :**
```json
{
  "success": false,
  "error": "missing_permission",
  "message": "Le bot n'a pas la permission MANAGE_GUILD"
}
```

---

## 11. Plan d'implementation

### Phase 1 — Court terme (parallelisable)

| Equipe | Tache |
|--------|-------|
| Frontend | Renommer cartes hub |
| Frontend | Ajouter upload icon + champ nom |
| Backend | Migration DB + endpoint etendu |
| n8n | Webhook `discord-guild-update` |

### Phase 2 — Moyen terme (sequentiel)

| Equipe | Tache | Dependance |
|--------|-------|------------|
| Backend | Endpoint consolide | - |
| Frontend | Editeur unifie avec onglets | Backend |

### Phase 3 — Long terme (optionnel)

| Equipe | Tache |
|--------|-------|
| Backend | Fusion endpoints branding (si demande) |
| Frontend | Refactoring stores |

---

## 12. Analyse backend API

> **Auteur** : Equipe Backend
> **Date** : 2026-04-12
> **Source de verite** : corrections et arbitrages pour l'implementation.

### 12.1 Duplication guild_name / guild_icon — a ne PAS faire

La section 7.1 propose d'ajouter `guild_name` et `guild_icon_url` dans
`guild_discord_settings`. Mais ces champs **existent deja** dans
`public.tenant_discord_servers` (RFC-053) :

```sql
-- Colonnes existantes dans public.tenant_discord_servers :
guild_name VARCHAR(100)         -- deja present
guild_icon VARCHAR(255)         -- deja present (hash Discord)
guild_description TEXT           -- deja present
member_count INTEGER             -- deja present
last_synced_at TIMESTAMPTZ       -- deja present
```

**Decision** : ne PAS dupliquer ces champs. La lecture consolidee
merge les deux tables :
- `public.tenant_discord_servers` → name, icon, member_count (donnees Discord)
- `tenant_XXXX.guild_discord_settings` → welcome, verification, invites (config admin)

Cela evite le drift entre les deux sources et simplifie la mise a jour
(le sync RFC-060 met a jour `tenant_discord_servers`, pas `guild_discord_settings`).

### 12.2 BOT_TOKEN : confirmation Option A (bot partage)

L'equipe plugin a bien identifie le probleme critique. Reponse backend :

**Option A (bot partage) = correcte pour la Phase 1.**

Cela est deja le cas dans notre architecture :
- Un seul bot Discord gere tous les serveurs/tenants
- Le bot token est dans les credentials n8n (global)
- Le tenant est resolu cote backend via `guild_id → tenant_discord_servers`
- L'equipe n8n a confirme dans RFC-061 section 13.4 Q4 : "Global — 1 bot pour tous les tenants"

**Le backend n'a PAS et ne DOIT PAS avoir le bot token.** Le flow est :
```
Backend → n8n (via httpx webhook) → Discord API (avec bot token)
```

Le backend envoie `{guild_id, name, icon_url}` a n8n. n8n utilise son
credential pour appeler Discord. Le token ne transite jamais par le backend.

**Option B (bot par tenant)** : a differer. Necessite une refonte de
l'onboarding tenant (chaque admin devrait creer un bot dans Discord Dev
Portal, ce qui est complexe pour un non-technique). Pas justifie aujourd'hui.

### 12.3 icon_url vs icon base64

La RFC mentionne deux formats pour l'icon :
- Frontend envoie une **URL** (`https://cdn.example.com/logo.png`)
- Discord API attend du **base64** (`data:image/png;base64,...`)

**Qui fait la conversion ?**

Le frontend upload l'image et obtient une URL (stockage S3/bucket).
La conversion URL → base64 doit se faire **dans n8n** (pas dans le backend) :

```
Frontend → Backend : icon_url (URL classique)
Backend → n8n : icon_url (URL)
n8n : fetch URL → encode base64 → PATCH Discord avec base64
Discord → n8n : retourne icon hash
n8n → Backend (callback) : icon_hash pour stockage
```

Le backend n'a pas a manipuler le binaire de l'image.

### 12.4 Endpoint consolide (GET)

Nouvelle proposition pour l'endpoint de lecture qui merge les deux sources :

```
GET /api/ecommerce/admin/guilds/{guild_id}/branding-overview
```

**Response :**
```json
{
  "success": true,
  "data": {
    "guild": {
      "guild_id": "1286607696153546774",
      "guild_name": "EcoleXYZ",
      "guild_icon_url": "https://cdn.discordapp.com/icons/.../abc123.png",
      "member_count": 125,
      "last_synced_at": "2026-04-12T10:00:00Z"
    },
    "discord_settings": {
      "verification_enabled": true,
      "verification_method": "button",
      "welcome_enabled": true,
      "welcome_title": "Bienvenue !",
      "welcome_color": 5865426,
      "..."
    },
    "bot": {
      "name": "Chef Cuisine",
      "color": 5865426,
      "..."
    }
  }
}
```

**Flow interne** :
1. Lire `public.tenant_discord_servers` → guild info
2. Lire `tenant_XXXX.guild_discord_settings` → discord config
3. Lire `tenant_XXXX.room_models` default → bot branding (RFC-034)
4. Merger et retourner

### 12.5 Endpoint PATCH etendu (modification name/icon)

```
PATCH /api/ecommerce/admin/guilds/{guild_id}/discord-identity
Content-Type: application/json

{
  "name": "EcoleXYZ - Nouveau Nom",
  "icon_url": "https://cdn.example.com/new-logo.png"
}
```

**Flow** :
1. Appeler n8n webhook `discord-guild-update` avec `{guild_id, name, icon_url}`
2. n8n fetch l'image, encode base64, appelle Discord
3. Discord retourne le nouveau `icon` hash
4. n8n callback au backend pour mettre a jour `tenant_discord_servers.guild_name` + `guild_icon`
5. Retourner succes au frontend

**Note** : cet endpoint est separe du `PUT /discord-settings` (qui gere welcome/verification).
Cela respecte la decision Q4 (ne pas fusionner les endpoints).

### 12.6 Questions pour l'equipe plugin-recipes

1. **MANAGE_GUILD** : le bot actuel a-t-il cette permission sur tous les
   serveurs ? Si non, il faudra l'ajouter dans le scope OAuth du bot.
   Comment verifier : dans Discord Dev Portal → OAuth2 → Bot Permissions.

2. **Rate limit sur PATCH /guilds** : Discord limite a 2 modifications de
   guild par 10 minutes. Si un admin fait 3 changements rapides, le 3eme
   echouera. Faut-il un debounce cote frontend (ex: 30 secondes entre saves) ?

3. **Avatar du bot** : la RFC dit "Discord Developer Portal uniquement".
   Est-ce que l'equipe plugin accepte ca, ou faut-il aussi pouvoir changer
   l'avatar du bot depuis l'App Web ? (Ca necessite l'endpoint
   `PATCH /users/@me` avec le bot token — plus complexe.)

### 12.7 Estimation backend

| Tache | Effort |
|-------|--------|
| `GET /branding-overview` (endpoint consolide, merge 3 sources) | 0.5j |
| `PATCH /discord-identity` (name + icon → n8n) | 0.5j |
| Callback n8n pour mise a jour `tenant_discord_servers` | 0.25j |
| **Total** | **1.25j** |

**Pas de migration DB** — les champs existent deja dans `tenant_discord_servers`.

### 12.8 Architecture Redis Streams pour les actions Discord

> **Mise a jour** suite aux retours equipe n8n (section 5) et equipe plugin-recipes.
> Le bot token reste dans le plugin. Redis Streams comme bus de commandes.

#### 12.8.1 Probleme resolu

Le bot token Discord est dans les variables d'environnement du plugin (chatbot-core).
Ni le backend, ni n8n ne doivent le stocker. Avec 100 tenants = 100 bots,
impossible de copier 100 tokens dans n8n.

#### 12.8.2 Architecture

```
Frontend → Backend → Redis Stream "discord:commands"
                          ↓
                    Plugin (ecoute, a le bot token)
                          ↓
                    Discord API (avec le token du plugin)
                          ↓
                    Redis Stream "discord:results"
                          ↓
                    Backend (lit le resultat)
```

Le bot token **ne quitte jamais le plugin**. Le backend et n8n ne le voient jamais.

#### 12.8.3 Format des messages Redis Streams

**Commande (backend → plugin)** :

Stream : `discord:commands`
```json
{
  "request_id": "uuid-123",
  "action": "update_guild",
  "guild_id": "1286607696153546774",
  "payload": {
    "name": "Nouveau nom",
    "icon_url": "https://cdn.example.com/logo.png"
  },
  "timestamp": "2026-04-12T14:30:00Z"
}
```

Actions supportees :
- `update_guild` : modifier nom/icon du serveur
- `create_category` : creer une categorie Discord
- `create_channel` : creer un channel
- `delete_channel` : supprimer un channel
- `create_invite` : creer un lien d'invitation
- `set_permissions` : modifier les permissions d'un channel

**Resultat (plugin → backend)** :

Stream : `discord:results`
```json
{
  "request_id": "uuid-123",
  "success": true,
  "guild_id": "1286607696153546774",
  "data": {
    "name": "Nouveau nom",
    "icon_url": "https://cdn.discordapp.com/icons/1286607696153546774/abc123.png"
  },
  "timestamp": "2026-04-12T14:30:01Z"
}
```

**Erreur** :
```json
{
  "request_id": "uuid-123",
  "success": false,
  "guild_id": "1286607696153546774",
  "error": "missing_permission",
  "message": "Bot lacks MANAGE_GUILD permission",
  "timestamp": "2026-04-12T14:30:01Z"
}
```

#### 12.8.4 Redis Streams vs Pub/Sub

**Redis Streams** (choix retenu) :
- Messages **persistes** — si le plugin redemarre, il retrouve les messages
- **Consumer groups** — un seul plugin par guild traite la commande
- **ACK** — le plugin confirme le traitement (pas de message perdu)
- **Historique** — on peut relire les commandes passees (debug)

**Pub/Sub** (rejete) :
- Messages volatiles — perdus si personne n'ecoute
- Pas d'ACK — pas de garantie de traitement

#### 12.8.5 Implementation cote backend

```python
# app/services/discord/command_service.py

class DiscordCommandService:
    """Publie des commandes Discord via Redis Streams.
    
    Les plugins ecoutent le stream et executent les actions
    avec leur propre bot token.
    """
    
    COMMAND_STREAM = "discord:commands"
    RESULT_STREAM = "discord:results"
    RESULT_TIMEOUT = 30  # secondes
    
    def __init__(self):
        self.redis = get_redis_client()
    
    async def send_command(
        self,
        action: str,
        guild_id: str,
        payload: dict,
    ) -> dict:
        """Publie une commande et attend le resultat.
        
        Returns:
            {"success": True, "data": {...}} ou {"success": False, "error": "..."}
        
        Raises:
            TimeoutError si pas de reponse en 30 secondes
        """
        request_id = str(uuid4())
        
        # Publier la commande
        await self.redis.xadd(self.COMMAND_STREAM, {
            "request_id": request_id,
            "action": action,
            "guild_id": guild_id,
            "payload": json.dumps(payload),
            "timestamp": datetime.utcnow().isoformat(),
        })
        
        # Attendre le resultat (poll le stream results)
        deadline = time.time() + self.RESULT_TIMEOUT
        while time.time() < deadline:
            entries = await self.redis.xread(
                {self.RESULT_STREAM: "$"},
                count=10,
                block=1000,  # 1 seconde
            )
            for stream, messages in entries:
                for msg_id, data in messages:
                    if data.get("request_id") == request_id:
                        return json.loads(data.get("data", "{}"))
        
        raise TimeoutError(f"Discord command timeout: {action} for guild {guild_id}")
    
    # Helpers
    async def update_guild(self, guild_id: str, name: str = None, icon_url: str = None) -> dict:
        payload = {}
        if name: payload["name"] = name
        if icon_url: payload["icon_url"] = icon_url
        return await self.send_command("update_guild", guild_id, payload)
    
    async def create_channel(self, guild_id: str, **kwargs) -> dict:
        return await self.send_command("create_channel", guild_id, kwargs)
    
    async def delete_channel(self, guild_id: str, channel_id: str) -> dict:
        return await self.send_command("delete_channel", guild_id, {"channel_id": channel_id})
    
    async def create_invite(self, guild_id: str, channel_id: str, max_age: int = 604800) -> dict:
        return await self.send_command("create_invite", guild_id, {
            "channel_id": channel_id, "max_age": max_age
        })
```

#### 12.8.6 Implementation cote plugin (chatbot-core)

```python
# chatbot_core/services/discord_command_listener.py

class DiscordCommandListener:
    """Ecoute les commandes Discord via Redis Streams.
    
    Le plugin qui gere le guild execute la commande et publie le resultat.
    """
    
    COMMAND_STREAM = "discord:commands"
    RESULT_STREAM = "discord:results"
    CONSUMER_GROUP = "discord-plugins"
    
    def __init__(self, bot, redis_client):
        self.bot = bot
        self.redis = redis_client
        self.consumer_name = f"plugin-{bot.user.id}" if bot.user else "plugin-unknown"
    
    async def start(self):
        """Demarre l'ecoute du stream (appele dans on_ready)."""
        # Creer le consumer group si absent
        try:
            await self.redis.xgroup_create(
                self.COMMAND_STREAM, self.CONSUMER_GROUP, id="0", mkstream=True
            )
        except Exception:
            pass  # Group exists
        
        asyncio.create_task(self._listen_loop())
    
    async def _listen_loop(self):
        while True:
            try:
                entries = await self.redis.xreadgroup(
                    self.CONSUMER_GROUP, self.consumer_name,
                    {self.COMMAND_STREAM: ">"},
                    count=1, block=5000,
                )
                
                for stream, messages in entries:
                    for msg_id, data in messages:
                        await self._handle_command(msg_id, data)
                        
            except Exception as e:
                logger.error(f"Discord command listener error: {e}")
                await asyncio.sleep(5)
    
    async def _handle_command(self, msg_id, data):
        guild_id = data.get("guild_id")
        guild = self.bot.get_guild(int(guild_id))
        
        # Ce plugin ne gere pas ce guild → ne pas ACK (un autre plugin le prendra)
        if not guild:
            return
        
        action = data.get("action")
        payload = json.loads(data.get("payload", "{}"))
        request_id = data.get("request_id")
        
        try:
            result = await self._execute(guild, action, payload)
            
            await self.redis.xadd(self.RESULT_STREAM, {
                "request_id": request_id,
                "success": "true",
                "guild_id": guild_id,
                "data": json.dumps(result),
                "timestamp": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            await self.redis.xadd(self.RESULT_STREAM, {
                "request_id": request_id,
                "success": "false",
                "guild_id": guild_id,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        # ACK — message traite
        await self.redis.xack(self.COMMAND_STREAM, self.CONSUMER_GROUP, msg_id)
    
    async def _execute(self, guild, action, payload):
        if action == "update_guild":
            kwargs = {}
            if "name" in payload:
                kwargs["name"] = payload["name"]
            if "icon_url" in payload:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(payload["icon_url"])
                    kwargs["icon"] = resp.content
            await guild.edit(**kwargs)
            return {
                "name": guild.name,
                "icon_url": str(guild.icon.url) if guild.icon else None,
            }
        
        elif action == "create_channel":
            # ... (create channel logic avec discord.py)
            pass
        
        elif action == "delete_channel":
            channel = guild.get_channel(int(payload["channel_id"]))
            if channel:
                await channel.delete()
            return {"deleted": True}
        
        elif action == "create_invite":
            channel = guild.get_channel(int(payload["channel_id"]))
            invite = await channel.create_invite(
                max_age=payload.get("max_age", 604800)
            )
            return {
                "invite_url": str(invite.url),
                "invite_code": invite.code,
            }
        
        else:
            raise ValueError(f"Unknown action: {action}")
```

#### 12.8.7 Impact sur n8n

**Les workflows n8n pour les actions Discord simples disparaissent.** Le backend communique directement avec les plugins via Redis.

| Avant (n8n) | Apres (Redis) |
|-------------|---------------|
| `discord-category-create` webhook | `DiscordCommandService.create_channel(type=4)` |
| `discord-channel-create` webhook | `DiscordCommandService.create_channel()` |
| `discord-channel-delete` webhook | `DiscordCommandService.delete_channel()` |
| `discord-invite-renew` webhook | `DiscordCommandService.create_invite()` |
| `discord-guild-update` webhook | `DiscordCommandService.update_guild()` |

**n8n conserve les flows complexes** :
- `student-verify` (orchestration multi-etapes)
- `invite-renew-cron` (cron scheduling)
- Notifications Discord (pub Redis → n8n → webhook Discord)

#### 12.8.8 Impact sur RFC-061

Les services RFC-061 (CategoryService, GroupService, StudentService) qui
appelaient n8n via httpx doivent maintenant utiliser `DiscordCommandService`.

Exemple dans `CategoryService.create_category()` :

```python
# AVANT : appel n8n
result = await httpx.post(f"{N8N_URL}/webhook/discord-category-create", json={...})

# APRES : commande Redis
from app.services.discord.command_service import DiscordCommandService
cmd = DiscordCommandService()
result = await cmd.send_command("create_category", guild_id, {"name": name})
```

### 12.9 Estimation revisee

| Tache | Effort |
|-------|--------|
| `GET /branding-overview` (endpoint consolide) | 0.5j |
| `PATCH /discord-identity` (name + icon via Redis) | 0.5j |
| `DiscordCommandService` (backend — publish + wait result) | 1j |
| Modifier services RFC-061 pour utiliser Redis au lieu de n8n | 0.5j |
| **Total backend** | **2.5j** |
| `DiscordCommandListener` (chatbot-core — listen + execute) | 1.5j |
| **Total chatbot-core** | **1.5j** |
| **Total projet** | **4j** |

### 12.10 Decisions source de verite backend (mises a jour)

| Point | Decision |
|-------|----------|
| Duplication guild_name/icon | **Non** — lire depuis `tenant_discord_servers` (public) |
| Bot token | **Reste dans le plugin** — jamais dans backend ni n8n |
| Communication backend ↔ Discord | **Redis Streams** (pas n8n pour les actions simples) |
| Format messages | JSON dans Redis Streams avec `request_id` pour correlation |
| Persistence | **Redis Streams** avec consumer groups (pas Pub/Sub) |
| Timeout commande | **30 secondes** — si pas de reponse, erreur |
| Multi-bot | Chaque plugin ecoute, seul celui qui gere le guild ACK |
| n8n | Conserve pour flows complexes (verification, crons, notifications) |
| Conversion icon URL → base64 | **Dans le plugin** (fetch URL + encode) |
| Endpoint consolide | `GET /branding-overview` merge 3 sources |
| Endpoint modification | `PATCH /discord-identity` via Redis Streams |
| Migration DB | **Aucune** |

---

## 13. Retours equipe plugin-recipes

> **Auteur** : Equipe plugin-recipes
> **Date** : 2026-04-13

### 13.1 Reponses aux questions backend (section 12.6)

| Question | Reponse |
|----------|---------|
| **Q1: MANAGE_GUILD** | ✅ Verifie OK sur bot dev (a Administrator). Pour prod : s'assurer que l'OAuth2 URL inclut `permissions=32`. Script de test disponible : `scripts/discord/test_manage_guild_permission.py` |
| **Q2: Rate limit Discord** | Recommandation : **debounce 30 secondes** cote frontend entre deux saves. Afficher un message "Modification en cours..." si l'admin clique trop vite. |
| **Q3: Avatar bot** | ✅ **Accepte "Developer Portal only"**. Changer l'avatar du bot depuis l'App Web n'est pas prioritaire. Les admins non-techniques n'ont pas besoin de cette feature. |

### 13.2 Script de test MANAGE_GUILD

Un script de test a ete cree et copie dans les 3 plugins :

```
plugin-recipes/scripts/discord/test_manage_guild_permission.py
plugin-chess/scripts/discord/test_manage_guild_permission.py
plugin-azy/scripts/discord/test_manage_guild_permission.py
```

**Usage :**
```bash
# Verifier les permissions (lecture seule)
python scripts/discord/test_manage_guild_permission.py --env .env.local

# Tester la modification du nom du serveur
python scripts/discord/test_manage_guild_permission.py --env .env.local --test-modify
```

### 13.3 Dependances

L'equipe plugin attend que chatbot-core implemente `DiscordCommandListener` avant de pouvoir integrer.

Taches parallelisables (sans attendre chatbot-core) :
- ✅ Verification permissions MANAGE_GUILD
- ✅ Reponses aux questions backend
- ⏳ Tests sur plugin-chess et plugin-azy

---

## 14. Questions equipe chatbot-core

> **Auteur** : Equipe chatbot-core
> **Date** : 2026-04-13

### 14.1 Questions d'implementation

| # | Question | Contexte |
|---|----------|----------|
| **Q1** | **Stream resultat : synchrone ou fire-and-forget ?** | Le `NotificationListener` existant ne publie pas de resultats. Pour `DiscordCommandListener`, dois-je publier sur `discord:results` de maniere synchrone (attendre le `xadd`) ou fire-and-forget ? |
| **Q2** | **Timeout sur messages non-ACK** | Si aucun plugin ne gere un `guild_id`, le message restera pending indefiniment. Faut-il un TTL ou un mecanisme de cleanup ? |
| **Q3** | **Dependance httpx** | Pour `update_guild` avec `icon_url`, je dois fetch l'image. `httpx` est-il deja une dependance de chatbot-core ? |

### 14.2 Reponses (a completer par backend/plugin)

| # | Reponse |
|---|---------|
| **Q1** | **Synchrone recommande.** Le backend attend le resultat avec un timeout de 30s (section 12.10). Si fire-and-forget, le backend ne saura pas si la commande a reussi. Utiliser `await redis.xadd(...)` et retourner apres confirmation. |
| **Q2** | **Propositions :** (a) TTL sur le stream (ex: 1 heure) — messages expires auto. (b) Consumer group avec `XCLAIM` apres timeout pour re-traiter. (c) Backend poll les pending entries et les supprime apres X minutes. **Recommandation : option (a)** avec `MAXLEN ~1000` sur le stream pour limiter la taille. |
| **Q3** | ✅ **Oui, `httpx` est deja une dependance de chatbot-core.** Verifie via `pip show chatbot-core`. |

---

## 15. Analyse equipe n8n

> **Auteur** : Equipe n8n
> **Date** : 2026-04-13
> **En reponse a** : Section 12.8 (Redis Streams architecture)

### 15.1 Impact global

**L'equipe n8n n'est PAS impliquee dans les developpements RFC-062.**

La section 12.8 introduit une architecture Redis Streams qui remplace n8n pour les
actions Discord simples. Cela reduit notre perimetre d'intervention.

### 15.2 Workflows a deprecier

Suite au deploiement de Redis Streams, les workflows suivants seront **DEPRECATED** :

| Workflow n8n | Fichier | Remplace par |
|--------------|---------|--------------|
| Category Create | `GUILD_-_Category_Create.json` | `DiscordCommandService.create_channel(type=4)` |
| Channel Create | `GUILD_-_Channel_Create.json` | `DiscordCommandService.create_channel()` |
| Channel Delete | `GUILD_-_Channel_Delete.json` | `DiscordCommandService.delete_channel()` |
| Invite Renew | `GUILD_-_Invite_Renew.json` | `DiscordCommandService.create_invite()` |

**Note** : Le webhook `discord-guild-update` prevu en section 10 **n'a pas ete cree**
car l'architecture Redis Streams le rend obsolete avant meme son implementation.

### 15.3 Workflows conserves

Les workflows suivants **restent actifs** car ils gerent des flows complexes
que Redis Streams ne peut pas remplacer :

| Workflow | Fichier | Raison |
|----------|---------|--------|
| Student Verify | `GUILD_-_Student_Verify.json` | Orchestration multi-etapes (lookup → permissions → channel → callback) |
| Invite Renew Cron | `GUILD_-_Invite_Renew_Cron.json` | Scheduling cron quotidien (Redis ne fait pas de crons) |
| Tenant Settings | `GUILD_-_Tenant_Settings.json` | Lecture de configuration (pas une action Discord) |
| On Join Grant Credits | `MEMBERS---On-Join-Grant-Credits.json` | Workflow RFC-059 (credits, hors scope Discord) |

### 15.4 Limitation technique : n8n et Redis Streams

> **Important** : Cette section documente une limitation technique qui impacte
> l'architecture et les decisions de fallback.

#### 15.4.1 Commandes Redis supportees par n8n

| Categorie | Commandes | Support n8n |
|-----------|-----------|:-----------:|
| Key-Value | GET, SET, DEL, KEYS | ✅ |
| Pub/Sub | PUBLISH | ✅ |
| Lists | LPUSH, RPUSH, LPOP, RPOP | ✅ |
| Hashes | HGET, HSET, HGETALL | ✅ |
| **Streams** | XADD, XREAD, XREADGROUP, XACK | ❌ |

#### 15.4.2 Consequence

**n8n ne peut PAS interagir avec Redis Streams.** Cela signifie :

1. n8n **ne peut pas ecouter** le stream `discord:commands`
2. n8n **ne peut pas publier** sur le stream `discord:results`
3. n8n **ne peut pas ACK** les messages traites

#### 15.4.3 Solution backend : Endpoints REST wrapper

> **Mise a jour** : L'equipe backend a fourni une solution dans `docs/guides/rfc062-api-spec.md` (Partie 2).

Le backend expose des **endpoints REST** qui wrappent le `DiscordCommandService`.
Ces endpoints permettent a n8n de declencher des commandes Discord via Redis Streams
sans avoir a interagir directement avec Redis.

**Architecture :**
```
n8n → HTTP POST → Backend REST → DiscordCommandService → Redis Streams → Plugin → Discord API
```

**Base URL :** `/api/discord/commands/{action}`
**Auth :** `X-Service-Token: <token>` (scope `discord:write`)

| Endpoint | Usage n8n |
|----------|-----------|
| `POST /api/discord/commands/create-channel` | student-verify (creation channel prive) |
| `POST /api/discord/commands/set-permissions` | student-verify (ajout permissions eleve) |
| `POST /api/discord/commands/create-invite` | invite-renew-cron (renouvellement invites) |
| `POST /api/discord/commands/delete-channel` | disponible si besoin |
| `POST /api/discord/commands/create-category` | disponible si besoin |
| `POST /api/discord/commands/update-guild` | disponible si besoin |
| `POST /api/discord/commands/get-roles` | disponible si besoin |
| `POST /api/discord/commands/get-channel-count` | disponible si besoin |

#### 15.4.4 Workflows a migrer vers les endpoints REST

Les workflows suivants doivent etre **migres** pour utiliser les nouveaux endpoints REST
au lieu d'appeler directement l'API Discord :

| Workflow | Fichier | Migration requise |
|----------|---------|-------------------|
| **Student Verify** | `GUILD_-_Student_Verify.json` | Remplacer `PUT discord.com/api/v10/channels/{cid}/permissions/{uid}` par `POST /api/discord/commands/set-permissions` |
| **Invite Renew Cron** | `GUILD_-_Invite_Renew_Cron.json` | Remplacer `POST discord.com/api/v10/channels/{cid}/invites` par `POST /api/discord/commands/create-invite` |

**Exemple de migration (invite-renew-cron) :**

```
AVANT :
  POST https://discord.com/api/v10/channels/{{ channel_id }}/invites
  Header: Authorization: Bot {{ $env.DISCORD_BOT_TOKEN }}
  Body: { "max_age": 604800, "max_uses": 0 }

APRES :
  POST {{ $env.BACKEND_URL }}/api/discord/commands/create-invite
  Header: X-Service-Token: {{ $json.data.backend_service_token }}
  Body: {
    "guild_id": "{{ guild_id }}",
    "channel_id": "{{ channel_id }}",
    "max_age": 604800,
    "max_uses": 0
  }
```

**Avantage** : Le bot token reste dans le plugin. n8n n'a plus besoin de `DISCORD_BOT_TOKEN`.

#### 15.4.5 Webhooks non-applicables (contexte historique)

Les commandes suivantes **ne sont plus un probleme** grace aux endpoints REST :

| Commande Redis | ~~Probleme~~ | Solution |
|----------------|--------------|----------|
| `create_category` | ~~n8n ne peut pas consommer `discord:commands`~~ | `POST /api/discord/commands/create-category` |
| `create_channel` | ~~idem~~ | `POST /api/discord/commands/create-channel` |
| `delete_channel` | ~~idem~~ | `POST /api/discord/commands/delete-channel` |
| `update_guild` | ~~idem~~ | `POST /api/discord/commands/update-guild` |
| `create_invite` | ~~idem~~ | `POST /api/discord/commands/create-invite` |
| `set_permissions` | ~~idem~~ | `POST /api/discord/commands/set-permissions` |
| `get_roles` | ~~idem~~ | `POST /api/discord/commands/get-roles` |
| `get_channel_count` | ~~idem~~ | `POST /api/discord/commands/get-channel-count` |

#### 15.4.6 Impact sur le fallback (Q2)

La reponse backend a Q2 ("pas de fallback automatique vers n8n") reste valide.

Avec les endpoints REST, n8n **peut** techniquement servir de fallback,
mais cela impliquerait :
1. Double maintenance (workflows n8n + Redis Streams)
2. Complexite de routing dans le backend
3. Tests supplementaires

**Recommandation** : Pas de fallback automatique. Les workflows n8n migres
vers les endpoints REST servent pour les flows **complexes** (orchestration
multi-etapes comme student-verify) — pas comme backup des actions simples.

#### 15.4.7 Impact sur les autres equipes

| Equipe | Impact |
|--------|--------|
| **Backend** | Exposer les endpoints REST `/api/discord/commands/*` (deja documente dans Partie 2) |
| **Plugin** | Aucun changement — `DiscordCommandListener` traite les commandes de la meme facon |
| **n8n** | Migrer 2 workflows vers les endpoints REST (cf. 15.4.4) |
| **Infra** | Redis reste critique, mais n8n a maintenant un chemin HTTP viable |

### 15.5 Plan de depreciation

1. **Phase 1** (immediate) : Aucune action requise — workflows existants continuent de fonctionner
2. **Phase 2** (apres deploiement Redis Streams) :
   - Ajouter tag `deprecated` aux 4 workflows
   - Desactiver les workflows dans n8n
   - Conserver les fichiers JSON pour reference historique
3. **Phase 3** (cleanup) : Supprimer les fichiers deprecated apres validation en production

### 15.6 Questions pour l'equipe backend

| # | Question | Contexte |
|---|----------|----------|
| **Q1** | **Timeline** | Quand Redis Streams sera-t-il deploye en production ? (Pour planifier la depreciation des workflows) |
| **Q2** | **Fallback** | En cas de panne Redis, y a-t-il un mecanisme de fallback vers n8n ? (Si oui, nous devons garder les workflows actifs mais inactifs) |
| **Q3** | **Monitoring** | Comment serons-nous alertes si un workflow deprecated est appele par erreur apres migration ? |

### 15.7 Estimation n8n

| Tache | Effort |
|-------|--------|
| **Migration workflows** | |
| Migration `GUILD_-_Student_Verify.json` vers endpoints REST | 0.5j |
| Migration `GUILD_-_Invite_Renew_Cron.json` vers endpoints REST | 0.5j |
| Tests integration (appels REST → Discord via plugin) | 0.5j |
| **Depreciation** | |
| Ajout tag `deprecated` aux 4 workflows simples | 0.1j |
| Desactivation dans n8n UI | 0.1j |
| Documentation mise a jour (README workflows) | 0.25j |
| **Total** | **1.95j** |

**Note** : Les workflows complexes (student-verify, invite-renew-cron) doivent etre
migres vers les endpoints REST du backend. Cela remplace les appels Discord API
directs par des appels via le backend (cf. section 15.4.4).

### 15.8 Confirmation

> **L'equipe n8n confirme** :
>
> 1. **Depreciation** : Les 4 workflows d'actions Discord simples seront deprecies
>    une fois Redis Streams deploye (Category Create, Channel Create/Delete, Invite Renew).
>
> 2. **Migration** : Les 2 workflows complexes (Student Verify, Invite Renew Cron)
>    seront migres vers les endpoints REST `/api/discord/commands/*` pour utiliser
>    l'architecture Redis Streams sans necessiter le bot token dans n8n.
>
> 3. **Inchanges** : Tenant Settings et On Join Grant Credits ne sont pas impactes.
>
> **Effort total** : 1.95 jours (migration + depreciation + documentation).

---

## 16. Reponses backend aux sections 13, 14, 15

> **Auteur** : Equipe Backend
> **Date** : 2026-04-13

### 16.1 Validation section 13 (plugin-recipes)

Toutes les reponses sont validees :
- MANAGE_GUILD : OK, `permissions=32` dans l'OAuth2 URL de production
- Debounce 30s : confirme, le backend n'ajoute pas de rate limit supplementaire
- Avatar bot Dev Portal only : confirme

### 16.2 Reponses section 14 (chatbot-core)

| Q | Reponse definitive |
|---|-------------------|
| **Q1 — Synchrone** | **Confirme synchrone.** `await redis.xadd(...)` obligatoire avant de passer au message suivant. Le backend attend le resultat avec timeout 30s. |
| **Q2 — Timeout non-ACK** | **MAXLEN ~1000** sur les deux streams (commandes + resultats). Le backend timeout a 30s et log un warning `"no plugin handled guild_id X"`. Pas de XCLAIM en Phase 1 (complexite inutile). Si aucun plugin ne gere un guild → erreur de configuration, pas un bug de stream. |
| **Q3 — httpx** | Confirme disponible dans chatbot-core. |

### 16.3 Reponses section 15 (n8n)

| Q | Reponse |
|---|---------|
| **Q1 — Timeline** | Redis Streams deploye avec RFC-062 Phase 1. Estimation : **2 semaines** apres validation RFC par toutes les equipes. Workflows n8n restent actifs pendant la transition. |
| **Q2 — Fallback Redis down** | **Non**, pas de fallback automatique vers n8n. Redis est deja critique pour toute l'infra (cache, sessions, rate limiting, notifications RFC-059). Si Redis tombe, c'est un incident infra global avec monitoring existant. Les workflows n8n restent **desactives mais pas supprimes** — reactivation manuelle en urgence possible. |
| **Q3 — Monitoring deprecated** | Ajouter un log WARNING dans chaque workflow deprecated **avant desactivation** : si le webhook est appele, logger le caller. Conserver 2 semaines de logs avant suppression definitive. |

### 16.4 Plan de transition n8n

```
Semaine 0 : Redis Streams deploye (backend + chatbot-core)
            Tests en dev/staging
Semaine 1 : Production — Redis Streams actif
            Workflows n8n toujours actifs (double-run temporaire)
            Verification : aucun appel aux webhooks n8n
Semaine 2 : Tag deprecated + desactivation workflows n8n
            Monitoring appels residuels
Semaine 4 : Suppression fichiers workflows si aucun appel residuel
```

### 16.5 Reponses complementaires n8n (migration endpoints REST)

> **Contexte** : Suite a la section 15.4, l'equipe n8n a pose des questions
> sur l'utilisation des endpoints REST `/api/discord/commands/*`.

| Q | Reponse |
|---|---------|
| **Q1 — Scope service token** | `discord:write` suffit pour les 8 commandes. Le `BACKEND_SERVICE_TOKEN` existant (scope `*` wildcard) fonctionne deja. Pas besoin de token specifique. |
| **Q2 — student-verify flow** | L'endpoint `POST /api/discord/webhook/student-verify` fait **uniquement le lookup email** (retourne student + group info). Les actions Discord sont orchestrees par n8n via les endpoints REST (voir detail ci-dessous). |
| **Q3 — Quand migrer** | Apres deploiement. Migration progressive workflow par workflow. Les workflows existants continuent de fonctionner pendant la transition. |

#### Detail Q2 — Flow student-verify orchestre par n8n

```
n8n student-verify workflow :

  1. POST /api/discord/webhook/student-verify { guild_id, email }
     → Backend retourne student + group info (lookup DB)

  2. POST /api/discord/commands/set-permissions { guild_id, channel_id, target_id, allow }
     → Backend → Redis → Plugin ajoute eleve au channel groupe

  3. POST /api/discord/commands/create-channel { guild_id, name, parent_id, ... }
     → Backend → Redis → Plugin cree channel personnel (si enabled)

  4. POST /api/discord/webhook/student-join-callback { student_id, discord_user_id, ... }
     → Backend met a jour le student en DB (verified)
```

**n8n garde le controle de l'orchestration. Le backend fait la DB et le bridge Redis.**

#### Detail Q3 — Plan de migration n8n

```
Etape 1 : Deployer le backend avec /api/discord/commands/* (cette PR)
Etape 2 : Deployer le DiscordCommandListener sur les plugins (deja fait)
Etape 3 : Tester un appel manuel : curl POST /api/discord/commands/get-roles
Etape 4 : Migrer les workflows n8n (remplacer les URLs Discord API)
Etape 5 : Supprimer le bot token des credentials n8n
```

Les workflows existants continuent de fonctionner pendant la transition
(ils appellent toujours Discord directement). Migration un workflow a la fois.

### 16.6 Validation globale

**Toutes les equipes ont valide RFC-062.** Resume des responsabilites :

| Equipe | Scope | Effort |
|--------|-------|--------|
| Backend | DiscordCommandService + endpoints consolides + REST wrapper | 2.5j |
| chatbot-core | DiscordCommandListener + execute actions | 1.5j |
| Frontend | Renommer cartes hub + champs name/icon + debounce 30s | 1.5j |
| n8n | Migration 2 workflows + deprecier 4 workflows + monitoring | 1.95j |
| Plugin-recipes | Verifier permissions + integrer apres chatbot-core | 0.5j |
| **Total** | | **7.95j** |

**Prerequis pour lancement :**
- [x] Plugin-recipes : MANAGE_GUILD verifie
- [x] chatbot-core : questions Q1-Q3 repondues
- [x] n8n : plan de depreciation + migration valide
- [x] Frontend : debounce 30s accepte
- [x] Backend : architecture Redis Streams specifiee
- [x] Backend : endpoints REST wrapper documentes (Partie 2)

**Pret pour implementation.**

---

## 17. Flows detailles par acteur

### 17.1 Ce que fait le frontend

#### Flow 1 : Creer categorie Discord

```
Admin clique "Nouvelle categorie"
    → POST /admin/guilds/{gid}/discord-categories { name }
    → Backend → Redis → plugin cree sur Discord
    → Response : { id, discord_category_id }
    → Affiche dans la liste
```

#### Flow 2 : Creer un groupe

```
Admin remplit le formulaire :
  - Nom, description
  - Categorie (dropdown peuple par GET /discord-categories)
  - Role profs (dropdown peuple par GET /discord/guilds/{gid}/roles)
  - Quota credits (radio "defaut guild" / "personnaliser")
  - Channels personnels (checkbox)
    → POST /admin/guilds/{gid}/groups { ... }
    → Backend → Redis → plugin cree channel + invite
    → Response : { id, channel_id, invite_url }
    → Affiche le lien d'invitation copiable
```

#### Flow 3 : Pre-inscrire des eleves

```
a) Manuellement :
    → Formulaire email + prenom + nom + matricule
    → POST /groups/{gid}/students

b) Import CSV :
    → Upload fichier CSV
    → POST /groups/{gid}/students/bulk (multipart)
    → Affiche resultat : X importes, Y erreurs (tableau)
```

#### Flow 4 : Eleve rejoint Discord (le frontend N'EST PAS implique)

```
Eleve clique lien invite → rejoint serveur
    → Plugin detecte on_member_join
    → Plugin poste bouton "Verifier mon email"
    → Eleve clique → modale → entre email
    → Plugin → n8n → backend → Redis → plugin
    → Eleve recoit acces channel groupe + channel perso
```

#### Flow 5 : Voir l'etat des eleves

```
Admin ouvre le detail du groupe
    → GET /groups/{id} (avec students)
    → Tableau : nom, email, status (pending/verified), discord
```

#### Flow 6 : Modifier identite serveur (RFC-062)

```
Admin ouvre "Accueil serveur"
    → GET /branding-overview (merge guild info + settings + bot branding)
    → Modifie nom / upload icon
    → PATCH /discord-identity { name, icon_url }
    → Debounce 30 secondes entre deux saves
    → Backend → Redis → plugin → Discord
```

#### Flow 7 : Configurer le branding d'accueil

```
Admin ouvre "Accueil serveur" > onglet Welcome
    → GET /discord-settings
    → Formulaire : verification, welcome DM, timeouts
    → PUT /discord-settings { ... }
```

#### Flow 8 : Verifier limite channels (avant creation)

```
Admin clique "Nouveau groupe"
    → GET /discord/guilds/{gid}/channel-count
    → warning > 400 : bandeau orange
    → critical > 450 : bandeau rouge + bouton grise
```

### 17.2 Ce que fait le plugin (via DiscordCommandListener)

Le plugin ecoute Redis Stream `discord:commands` et execute les actions
avec discord.py. Il a le bot token en memoire.

#### Commandes supportees

| Commande | Methode discord.py | Resultat publie |
|----------|-------------------|-----------------|
| `create_category` | `guild.create_category(name=)` | `{category_id}` |
| `create_channel` | `guild.create_text_channel(name=, category=, overwrites=)` | `{channel_id}` |
| `delete_channel` | `channel.delete()` | `{deleted: true}` |
| `update_guild` | `guild.edit(name=, icon=)` | `{name, icon_url}` |
| `create_invite` | `channel.create_invite(max_age=)` | `{invite_url, invite_code}` |
| `set_permissions` | `channel.set_permissions(member, view=True, send=True)` | `{updated: true}` |

#### Initialisation au demarrage

```python
class MyBot(commands.Bot):
    async def setup_hook(self):
        # Demarrer l'ecoute Redis
        self.command_listener = DiscordCommandListener(self, redis_client)
        await self.command_listener.start()
```

#### Dispatch des commandes

Quand un message arrive dans le stream :
1. Le plugin verifie s'il gere le `guild_id` (`bot.get_guild(int(guild_id))`)
2. Si oui → execute via discord.py → publie resultat → ACK
3. Si non → ne fait rien (un autre plugin prendra)

#### Verification des eleves (mixin chatbot-core)

En plus des commandes Redis, le plugin gere le flow de verification
via le `StudentVerificationMixin` :

```python
class MyBot(commands.Bot, StudentVerificationMixin):
    async def setup_hook(self):
        self.setup_student_verification(n8n_client, enabled=True)
        self.command_listener = DiscordCommandListener(self, redis_client)
        await self.command_listener.start()
```

Le mixin ecoute `on_member_join` → poste un bouton → quand l'eleve
clique, appelle n8n `student-verify` → n8n orchestre la verification.

### 17.3 Endpoint manquant : liste des roles Discord

Le dropdown "Role profs" dans le formulaire de creation de groupe
necessite la liste des roles Discord du serveur.

```
GET /api/discord/guilds/{gid}/roles
```

Meme pattern que `channel-count` : backend → Redis `get_roles` → plugin
retourne `guild.roles` → backend retourne la liste.

**Response :**
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

**A ajouter** dans `DiscordCommandService` et `DiscordCommandListener`.

---

## 18. References

- RFC-034 : Branding Server Configuration
- RFC-061 : Discord Group Channels (section 5 — Discord Settings)
- [Discord API - Modify Guild](https://discord.com/developers/docs/resources/guild#modify-guild)
- `vue-app/src/stores/branding.ts` — store RFC-034
- `vue-app/src/stores/discordGroups.ts` — store RFC-061 (discord settings)
- `vue-app/src/views/guild/BrandingEditorView.vue` — editeur RFC-034
- `vue-app/src/components/guild/DiscordSettingsModal.vue` — modale RFC-061
