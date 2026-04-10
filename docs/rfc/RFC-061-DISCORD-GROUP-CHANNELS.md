# RFC-061 : Gestion des groupes et channels Discord

**Date** : 2026-04-10
**Auteur** : Equipe Plugins
**Statut** : Draft
**Priorite** : Haute
**Equipes concernees** : Frontend, Backend, n8n, Plugins Discord, chatbot-core (selon option)

---

## 1. Probleme

Les administrateurs veulent pouvoir :
1. Creer des groupes/promotions d'eleves depuis l'app web
2. Avoir un channel Discord prive par groupe
3. Assigner automatiquement les eleves a leurs channels quand ils rejoignent Discord
4. Creer un channel personnel pour chaque eleve

Actuellement, tout est manuel sur Discord.

---

## 2. Solution

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                         APP WEB (Frontend)                       │
├─────────────────────────────────────────────────────────────────┤
│  Admin cree:                                                     │
│  - Categorie Discord (optionnel)                                │
│  - Groupe/Promotion                                              │
│  - Pre-inscrit les eleves (email, nom, prenom)                  │
│  - Configure le branding (message bienvenue)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                           BACKEND                                │
├─────────────────────────────────────────────────────────────────┤
│  - Stocke groupes, eleves, categories en DB                     │
│  - Appelle webhooks n8n pour actions Discord                    │
│  - Recoit les callbacks (channel_id, invite_url)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                            n8n                                   │
├─────────────────────────────────────────────────────────────────┤
│  Webhooks:                                                       │
│  - discord-category-create                                       │
│  - discord-channel-create                                        │
│  - discord-channel-add-member                                    │
│  - discord-invite-create                                         │
│  - student-verify                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DISCORD (via Bot Token)                      │
├─────────────────────────────────────────────────────────────────┤
│  - Cree categories et channels                                   │
│  - Gere les permissions                                          │
│  - Genere les liens d'invitation                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          PLUGIN                                  │
├─────────────────────────────────────────────────────────────────┤
│  - Detecte on_member_join                                        │
│  - Envoie DM de verification (branding configurable)            │
│  - Ecoute reponse email                                          │
│  - Appelle webhook student-verify                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Flows detailles

### 3.1 Creation d'une categorie Discord

```
Admin (Frontend)
    │ "Creer categorie Promotions"
    ▼
POST /api/discord/categories
    │ { "name": "Promotions", "guild_id": "...", "tenant_id": "..." }
    ▼
Backend
    │ 1. Appelle n8n webhook
    ▼
n8n "discord-category-create"
    │ POST https://discord.com/api/v10/guilds/{guild_id}/channels
    │ { "name": "Promotions", "type": 4 }
    ▼
Discord cree la categorie
    │ Response: { "id": "CAT_ID", "name": "Promotions" }
    ▼
n8n retourne au backend
    │ { "success": true, "category_id": "CAT_ID" }
    ▼
Backend stocke en DB
    │ INSERT INTO discord_categories (id, guild_id, name, discord_id)
    ▼
Frontend recoit confirmation
```

### 3.2 Creation d'un groupe/promotion

```
Admin (Frontend)
    │ "Creer Promotion 2026"
    │ Selectionne categorie "Promotions"
    ▼
POST /api/groups
    │ {
    │   "name": "Promotion 2026",
    │   "guild_id": "...",
    │   "tenant_id": "...",
    │   "category_id": "uuid-category",  // Reference locale
    │   "channel_name_format": "eleve-{fullname}"
    │ }
    ▼
Backend
    │ 1. Recupere discord_category_id depuis DB
    │ 2. Appelle n8n webhook
    ▼
n8n "discord-channel-create"
    │ POST https://discord.com/api/v10/guilds/{guild_id}/channels
    │ {
    │   "name": "promotion-2026",
    │   "type": 0,
    │   "parent_id": "DISCORD_CAT_ID",
    │   "permission_overwrites": [
    │     { "id": "{guild_id}", "type": 0, "deny": "1024" }
    │   ]
    │ }
    ▼
Discord cree le channel prive
    │ Response: { "id": "CHANNEL_ID", ... }
    ▼
n8n cree aussi le lien d'invitation
    │ POST https://discord.com/api/v10/channels/{CHANNEL_ID}/invites
    │ { "max_age": 604800, "max_uses": 0 }  // 7 jours, illimite
    ▼
n8n retourne au backend
    │ {
    │   "success": true,
    │   "channel_id": "CHANNEL_ID",
    │   "invite_url": "https://discord.gg/abc123"
    │ }
    ▼
Backend stocke en DB
    │ UPDATE groups SET discord_channel_id = 'CHANNEL_ID', invite_url = '...'
    ▼
Frontend affiche le lien d'invitation
```

### 3.3 Pre-inscription d'un eleve

```
Admin (Frontend)
    │ Ajoute eleve a Promotion 2026
    │ { email, firstname, lastname, matricule }
    ▼
POST /api/students
    │ {
    │   "email": "jean.dupont@email.com",
    │   "firstname": "Jean",
    │   "lastname": "Dupont",
    │   "matricule": "2026001",
    │   "group_id": "uuid-group",
    │   "tenant_id": "..."
    │ }
    ▼
Backend stocke en DB
    │ INSERT INTO students (email, firstname, lastname, group_id, ...)
    │ discord_user_id = NULL (pas encore connu)
    ▼
Admin envoie email a l'eleve
    │ "Rejoins le serveur Discord: https://discord.gg/abc123"
```

### 3.4 Arrivee et verification de l'eleve

```
Eleve clique sur le lien Discord
    │
    ▼
Eleve rejoint le serveur
    │
    ▼
Plugin detecte on_member_join
    │ user_id: "987654321"
    │ guild_id: "1286607696153546774"
    │
    ▼
Plugin envoie DM (avec branding tenant)
    │ ┌─────────────────────────────────┐
    │ │ 🎓 Bienvenue sur EcoleXYZ !     │
    │ │                                  │
    │ │ Pour finaliser ton inscription, │
    │ │ reponds avec ton adresse email. │
    │ │                                  │
    │ │ [Logo ecole]                    │
    │ └─────────────────────────────────┘
    │
    ▼
Eleve repond en DM
    │ "jean.dupont@email.com"
    │
    ▼
Plugin appelle n8n "student-verify"
    │ {
    │   "email": "jean.dupont@email.com",
    │   "discord_user_id": "987654321",
    │   "guild_id": "1286607696153546774"
    │ }
    │
    ▼
n8n interroge backend
    │ GET /api/students?email=...&guild_id=...
    │
    ▼
Backend retourne l'eleve
    │ {
    │   "student_id": "uuid",
    │   "firstname": "Jean",
    │   "lastname": "Dupont",
    │   "group_id": "uuid-group",
    │   "group_channel_id": "CHANNEL_ID",
    │   "channel_name_format": "eleve-{fullname}"
    │ }
    │
    ▼
n8n execute les actions Discord:
    │
    │ 1. Ajoute eleve au channel groupe
    │    PUT /channels/{group_channel_id}/permissions/{user_id}
    │    { "allow": "68608" }  // view + send + history
    │
    │ 2. Cree channel personnel "eleve-jean-dupont"
    │    POST /guilds/{guild_id}/channels
    │    {
    │      "name": "eleve-jean-dupont",
    │      "type": 0,
    │      "parent_id": "CAT_ESPACES_ELEVES",
    │      "permission_overwrites": [
    │        { "id": "{guild_id}", "type": 0, "deny": "1024" },
    │        { "id": "{user_id}", "type": 1, "allow": "68608" },
    │        { "id": "{role_profs}", "type": 0, "allow": "68608" }
    │      ]
    │    }
    │
    │ 3. Met a jour backend
    │    PATCH /api/students/{student_id}
    │    { "discord_user_id": "987654321", "discord_channel_id": "..." }
    │
    ▼
n8n retourne succes au plugin
    │
    ▼
Plugin envoie DM de confirmation
    │ "✅ Email verifie ! Tu as maintenant acces a tes channels."
```

---

## 4. Schema de base de donnees

### 4.1 Table `discord_categories`

```sql
CREATE TABLE discord_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    guild_id VARCHAR(32) NOT NULL,

    name VARCHAR(100) NOT NULL,
    discord_category_id VARCHAR(32),  -- ID Discord de la categorie

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(tenant_id, guild_id, name)
);
```

### 4.2 Table `groups`

```sql
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    guild_id VARCHAR(32) NOT NULL,
    category_id UUID REFERENCES discord_categories(id),

    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Discord
    discord_channel_id VARCHAR(32),
    discord_invite_url VARCHAR(255),
    discord_invite_expires_at TIMESTAMP,

    -- Configuration
    channel_name_format VARCHAR(100) DEFAULT 'eleve-{fullname}',
    personal_channel_category_id UUID REFERENCES discord_categories(id),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(tenant_id, guild_id, name)
);
```

### 4.3 Table `students`

```sql
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    group_id UUID NOT NULL REFERENCES groups(id),

    -- Identite
    email VARCHAR(255) NOT NULL,
    firstname VARCHAR(100),
    lastname VARCHAR(100),
    matricule VARCHAR(50),

    -- Discord (rempli apres verification)
    discord_user_id VARCHAR(32),
    discord_channel_id VARCHAR(32),  -- Channel personnel
    verified_at TIMESTAMP,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, verified, expired

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(tenant_id, email)
);
```

### 4.4 Table `tenant_discord_settings` (Branding)

```sql
CREATE TABLE tenant_discord_settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
    guild_id VARCHAR(32) NOT NULL,

    -- Branding DM bienvenue
    welcome_enabled BOOLEAN DEFAULT true,
    welcome_title VARCHAR(100) DEFAULT 'Bienvenue !',
    welcome_message TEXT DEFAULT 'Pour finaliser ton inscription, reponds avec ton adresse email.',
    welcome_color INTEGER DEFAULT 5865426,
    welcome_thumbnail_url VARCHAR(255),
    welcome_footer_text VARCHAR(100) DEFAULT 'Reponds directement a ce message',

    -- Messages verification
    verification_success_message TEXT DEFAULT '✅ Email verifie ! Tu as maintenant acces a tes channels.',
    verification_error_message TEXT DEFAULT '❌ Email non reconnu. Verifie et reessaie.',
    verification_retry_message TEXT DEFAULT '🔄 Reessaie avec ton email exact.',

    -- Timeout et relances
    verification_timeout_hours INTEGER DEFAULT 24,
    verification_reminder_hours INTEGER DEFAULT 6,
    timeout_action VARCHAR(20) DEFAULT 'remind',  -- remind, kick, none

    -- Invite links
    invite_max_age_seconds INTEGER DEFAULT 604800,  -- 7 jours

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. Configuration du branding

### 5.1 Ou configurer ?

Le branding se configure dans **Settings > Discord** du tenant (app web).

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings > Discord                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Message de bienvenue                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Titre: [Bienvenue sur EcoleXYZ !              ]         │    │
│  │                                                          │    │
│  │ Message:                                                 │    │
│  │ [Pour finaliser ton inscription, reponds avec ton      ] │    │
│  │ [adresse email.                                        ] │    │
│  │                                                          │    │
│  │ Couleur: [#5865F2] ████                                  │    │
│  │                                                          │    │
│  │ Logo: [Telecharger image]                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Verification                                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Timeout: [24] heures                                     │    │
│  │ Relance apres: [6] heures                                │    │
│  │ Action si timeout: [○ Relancer ○ Expulser ○ Rien]       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [Sauvegarder]                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Rendu Discord (embed)

```json
{
  "embeds": [{
    "title": "🎓 Bienvenue sur EcoleXYZ !",
    "description": "Pour finaliser ton inscription, reponds avec ton adresse email.",
    "color": 5793266,
    "thumbnail": {
      "url": "https://cdn.ecole.xyz/logo.png"
    },
    "footer": {
      "text": "Reponds directement a ce message"
    }
  }]
}
```

---

## 6. API Discord - Reference

### 6.1 Creer une categorie

```
POST https://discord.com/api/v10/guilds/{guild_id}/channels
Authorization: Bot {BOT_TOKEN}

{
  "name": "Promotions",
  "type": 4
}
```

### 6.2 Creer un channel

```
POST https://discord.com/api/v10/guilds/{guild_id}/channels
Authorization: Bot {BOT_TOKEN}

{
  "name": "promotion-2026",
  "type": 0,
  "parent_id": "CATEGORY_ID",
  "topic": "Espace de la promotion 2026",
  "permission_overwrites": [
    {
      "id": "{guild_id}",
      "type": 0,
      "deny": "1024"
    }
  ]
}
```

### 6.3 Ajouter un membre a un channel prive

```
PUT https://discord.com/api/v10/channels/{channel_id}/permissions/{user_id}
Authorization: Bot {BOT_TOKEN}

{
  "allow": "68608",
  "type": 1
}
```

### 6.4 Creer un lien d'invitation

```
POST https://discord.com/api/v10/channels/{channel_id}/invites
Authorization: Bot {BOT_TOKEN}

{
  "max_age": 604800,
  "max_uses": 0,
  "temporary": false
}
```

### 6.5 Permissions (bitfield)

| Permission | Valeur | Hex |
|------------|--------|-----|
| VIEW_CHANNEL | 1024 | 0x400 |
| SEND_MESSAGES | 2048 | 0x800 |
| READ_MESSAGE_HISTORY | 65536 | 0x10000 |
| ATTACH_FILES | 32768 | 0x8000 |
| ADD_REACTIONS | 64 | 0x40 |
| USE_EXTERNAL_EMOJIS | 262144 | 0x40000 |

**Combinaison standard eleve** : `1024 + 2048 + 65536 = 68608`

---

## 7. Webhooks n8n

### 7.1 `discord-category-create`

**Payload :**
```json
{
  "action": "create_category",
  "tenant_id": "uuid",
  "guild_id": "1286607696153546774",
  "name": "Promotions"
}
```

**Response :**
```json
{
  "success": true,
  "category_id": "1234567890123456789"
}
```

### 7.2 `discord-channel-create`

**Payload :**
```json
{
  "action": "create_channel",
  "tenant_id": "uuid",
  "guild_id": "1286607696153546774",
  "category_id": "1234567890123456789",
  "name": "promotion-2026",
  "topic": "Espace promotion 2026",
  "private": true,
  "create_invite": true,
  "invite_max_age": 604800
}
```

**Response :**
```json
{
  "success": true,
  "channel_id": "9876543210987654321",
  "invite_url": "https://discord.gg/abc123",
  "invite_expires_at": "2026-04-17T10:00:00Z"
}
```

### 7.3 `student-verify`

**Payload :**
```json
{
  "action": "verify",
  "guild_id": "1286607696153546774",
  "discord_user_id": "987654321012345678",
  "email": "jean.dupont@email.com"
}
```

**Response (succes) :**
```json
{
  "success": true,
  "student": {
    "id": "uuid",
    "firstname": "Jean",
    "lastname": "Dupont",
    "group_name": "Promotion 2026"
  },
  "actions_performed": {
    "added_to_group_channel": true,
    "personal_channel_created": true,
    "personal_channel_id": "1111111111111111111"
  }
}
```

**Response (echec) :**
```json
{
  "success": false,
  "error": "email_not_found",
  "message": "Aucun eleve avec cet email"
}
```

---

## 8. Systeme de tags

### 8.1 Tags disponibles

| Tag | Description | Exemple |
|-----|-------------|---------|
| `{firstname}` | Prenom (lowercase, sans accent) | `jean` |
| `{lastname}` | Nom (lowercase, sans accent) | `dupont` |
| `{fullname}` | Prenom-Nom | `jean-dupont` |
| `{matricule}` | Numero etudiant | `2026001` |
| `{email_prefix}` | Partie avant @ | `jean.dupont` |
| `{group}` | Nom du groupe (slug) | `promotion-2026` |
| `{date}` | Date YYYYMMDD | `20260410` |

### 8.2 Transformation

Les tags sont transformes pour etre compatibles Discord :
- Lowercase
- Accents retires (é → e)
- Espaces → tirets
- Max 100 caracteres

### 8.3 Configuration par groupe

```sql
-- Dans la table groups
channel_name_format VARCHAR(100) DEFAULT 'eleve-{fullname}'
```

---

## 9. Gestion des erreurs

### 9.1 Email non trouve

```
Plugin                          n8n                         Backend
   │                              │                              │
   │ student-verify               │                              │
   │ email: "inconnu@test.com"    │                              │
   │─────────────────────────────>│                              │
   │                              │ GET /api/students?email=...  │
   │                              │─────────────────────────────>│
   │                              │                              │
   │                              │ { "found": false }           │
   │                              │<─────────────────────────────│
   │                              │                              │
   │ { "success": false,          │                              │
   │   "error": "email_not_found" │                              │
   │ }                            │                              │
   │<─────────────────────────────│                              │
   │                              │                              │
   │ DM: "❌ Email non reconnu"   │                              │
   │                              │                              │
```

### 9.2 Timeout verification

```
+0h    : Eleve rejoint, DM envoye
+6h    : Pas de reponse → DM relance
+24h   : Toujours pas → Action configuree (remind/kick/none)
```

---

## 10. Decision architecturale : Ou placer la logique de verification ?

La verification des eleves (on_member_join → DM → verification email) peut etre implementee de deux facons.

### 10.1 Option A : Dans chatbot-core (recommandee)

**Principe** : chatbot-core fournit un mixin/service reutilisable. Les plugins activent la feature via configuration.

```python
# chatbot-core/mixins/student_verification.py
class StudentVerificationMixin:
    """Mixin pour verification des nouveaux membres (RFC-061)."""

    _verification_enabled: bool = False
    _verification_manager: "StudentVerificationManager | None" = None

    def setup_student_verification(
        self,
        n8n_client: "N8nClient",
        enabled: bool = True,
    ) -> None:
        """Active la verification des nouveaux membres."""
        self._verification_enabled = enabled
        self._verification_manager = StudentVerificationManager(self, n8n_client)
        logger.info("[StudentVerificationMixin] Verification enabled")

    async def on_member_join(self, member: "discord.Member") -> None:
        """Handler appele quand un membre rejoint le serveur."""
        if not self._verification_enabled or not self._verification_manager:
            return

        # Recupere le branding du tenant
        settings = await self._verification_manager.get_tenant_settings(member.guild.id)

        # Envoie le DM de bienvenue
        await self._verification_manager.send_welcome_dm(member, settings)

        # Ecoute la reponse (email)
        # ...
```

```python
# chatbot-core/services/student_verification_manager.py
class StudentVerificationManager:
    """Manager pour la verification des eleves (RFC-061)."""

    async def get_tenant_settings(self, guild_id: str) -> dict:
        """Recupere les settings de branding du tenant."""
        return await self.n8n.call_webhook("tenant-settings", {"guild_id": guild_id})

    async def send_welcome_dm(self, member: "discord.Member", settings: dict) -> None:
        """Envoie le DM de bienvenue avec branding."""
        embed = discord.Embed(
            title=settings.get("welcome_title", "Bienvenue !"),
            description=settings.get("welcome_message", "Entre ton email :"),
            color=settings.get("welcome_color", 5865426),
        )
        if settings.get("welcome_thumbnail_url"):
            embed.set_thumbnail(url=settings["welcome_thumbnail_url"])

        await member.send(embed=embed)

    async def verify_email(self, guild_id: str, user_id: str, email: str) -> dict:
        """Verifie l'email aupres du backend via n8n."""
        return await self.n8n.call_webhook("student-verify", {
            "guild_id": guild_id,
            "discord_user_id": user_id,
            "email": email,
        })
```

```python
# Dans le plugin (main.py) - utilisation simple
from chatbot_core.mixins.student_verification import StudentVerificationMixin

# Dans on_ready, apres tenant resolution
if config.student_verification_enabled:
    bot.setup_student_verification(n8n_client, enabled=True)
    logger.info("RFC-061: Student verification enabled")
```

**Avantages** :
- Code partage entre tous les plugins
- Coherent avec le pattern existant (GuildEventsMixin, ServerSyncManager)
- Maintenance centralisee
- Plugins n'ont qu'a activer via config

**Inconvenients** :
- Necessite release chatbot-core
- Couplage avec chatbot-core

---

### 10.2 Option B : Dans chaque plugin

**Principe** : Chaque plugin implemente sa propre logique de verification.

```python
# Dans main.py de chaque plugin

# Variable globale pour le manager
verification_manager: StudentVerificationManager | None = None

@bot.event
async def on_member_join(member):
    """Verification des nouveaux membres (RFC-061)."""
    if not verification_manager:
        return

    try:
        # Recuperer les settings de branding
        settings = await n8n_client.call_webhook(
            "tenant-settings",
            {"guild_id": str(member.guild.id)}
        )

        # Construire et envoyer le DM
        embed = discord.Embed(
            title=settings.get("welcome_title", "Bienvenue !"),
            description=settings.get("welcome_message", "Entre ton email :"),
            color=settings.get("welcome_color", 5865426),
        )
        if settings.get("welcome_thumbnail_url"):
            embed.set_thumbnail(url=settings["welcome_thumbnail_url"])

        await member.send(embed=embed)
        logger.info(f"RFC-061: DM envoye a {member.name}")

    except Exception as e:
        logger.error(f"RFC-061: Erreur on_member_join: {e}")

@bot.event
async def on_message(message):
    """Ecoute les reponses en DM pour verification."""
    # Ignorer les messages du bot
    if message.author.bot:
        return

    # Verifier si c'est un DM
    if not isinstance(message.channel, discord.DMChannel):
        return

    # Verifier si c'est un email
    email = message.content.strip()
    if "@" not in email:
        return

    try:
        # Trouver le guild (on suppose un seul guild par bot)
        guild = bot.guilds[0] if bot.guilds else None
        if not guild:
            return

        # Appeler le webhook de verification
        result = await n8n_client.call_webhook("student-verify", {
            "guild_id": str(guild.id),
            "discord_user_id": str(message.author.id),
            "email": email,
        })

        if result.get("success"):
            await message.channel.send("✅ Email verifie ! Tu as acces a tes channels.")
        else:
            await message.channel.send("❌ Email non reconnu. Reessaie.")

    except Exception as e:
        logger.error(f"RFC-061: Erreur verification: {e}")
```

**Avantages** :
- Pas de dependance chatbot-core
- Flexibilite par plugin
- Implementation immediate

**Inconvenients** :
- Code duplique dans chaque plugin
- Maintenance multiple
- Risque d'incoherence entre plugins

---

### 10.3 Comparaison

| Critere | Option A (chatbot-core) | Option B (plugins) |
|---------|-------------------------|---------------------|
| Code duplique | Non | Oui |
| Maintenance | Centralisee | Par plugin |
| Coherence | Garantie | Risque divergence |
| Flexibilite | Moyenne | Haute |
| Time-to-market | +1 release | Immediat |
| Effort chatbot-core | 1.5j | 0j |
| Effort par plugin | 0.5j (config) | 2j |

---

### 10.4 Recommandation

**Option A** est recommandee pour :
- Coherence avec l'architecture existante
- Reduction de la dette technique
- Facilite de maintenance

**Option B** peut etre choisie si :
- Besoin urgent (pas le temps d'attendre chatbot-core)
- Un seul plugin concerne
- Besoins tres specifiques par plugin

---

## 11. Estimation

### 11.1 Option A : chatbot-core (recommandee)

| Equipe | Tache | Effort |
|--------|-------|--------|
| **Backend** | Tables + endpoints CRUD | 2j |
| **Backend** | Integration webhooks n8n | 1j |
| **Frontend** | UI categories/groupes | 2j |
| **Frontend** | UI pre-inscription eleves | 1j |
| **Frontend** | UI branding Discord | 1j |
| **n8n** | Webhooks Discord | 1.5j |
| **chatbot-core** | StudentVerificationMixin | 1j |
| **chatbot-core** | StudentVerificationManager | 0.5j |
| **Plugins** | Config + activation | 0.5j |
| **Tests** | E2E | 1j |
| **Total** | | **11.5j** |

### 11.2 Option B : Par plugin

| Equipe | Tache | Effort |
|--------|-------|--------|
| **Backend** | Tables + endpoints CRUD | 2j |
| **Backend** | Integration webhooks n8n | 1j |
| **Frontend** | UI categories/groupes | 2j |
| **Frontend** | UI pre-inscription eleves | 1j |
| **Frontend** | UI branding Discord | 1j |
| **n8n** | Webhooks Discord | 1.5j |
| **Plugin** (chaque) | on_member_join + DM | 1j |
| **Plugin** (chaque) | Ecoute reponse + verification | 1j |
| **Tests** | E2E | 1j |
| **Total (1 plugin)** | | **11.5j** |
| **Total (3 plugins)** | | **15.5j** |

---

## 12. Questions ouvertes

- [ ] **Option A ou B ?** - Quelle approche choisir pour la verification ?
- [ ] Le bot a-t-il les permissions `MANAGE_CHANNELS` et `MANAGE_ROLES` sur tous les serveurs ?
- [ ] Faut-il gerer la suppression de groupes (et des channels associes) ?
- [ ] Limite de channels par serveur (500) - monitoring necessaire ?
- [ ] Gestion des roles Discord (future RFC-062 ?)

---

## 13. Analyse equipe n8n

**Date** : 2026-04-10
**Auteur** : Equipe n8n

### 13.1 Workflows a creer

| Workflow | Webhook path | Description |
|----------|--------------|-------------|
| `GUILD - Category Create` | `discord/category/create` | Cree une categorie Discord |
| `GUILD - Channel Create` | `discord/channel/create` | Cree un channel + lien invitation |
| `GUILD - Student Verify` | `student/verify` | Verifie email, assigne permissions, cree channel perso |

### 13.2 Flux detailles

**1. `discord-category-create`**
```
Webhook (POST)
    │ { tenant_id, guild_id, name }
    ▼
HTTP Request (Discord API)
    │ POST https://discord.com/api/v10/guilds/{guild_id}/channels
    │ { "name": "...", "type": 4 }
    │ Header: Authorization: Bot {BOT_TOKEN}
    ▼
Respond to Webhook
    │ { success: true, category_id: "..." }
```

**2. `discord-channel-create`**
```
Webhook (POST)
    │ { tenant_id, guild_id, category_id, name, topic, private, create_invite, invite_max_age }
    ▼
HTTP Request (Create Channel)
    │ POST https://discord.com/api/v10/guilds/{guild_id}/channels
    │ { "name": "...", "type": 0, "parent_id": "...", "permission_overwrites": [...] }
    ▼
IF create_invite?
    │ YES ──▼
    │       HTTP Request (Create Invite)
    │       POST https://discord.com/api/v10/channels/{channel_id}/invites
    │       { "max_age": 604800, "max_uses": 0 }
    │       │
    ▼───────┘
Respond to Webhook
    │ { success: true, channel_id: "...", invite_url: "...", invite_expires_at: "..." }
```

**3. `student-verify`** (le plus complexe)
```
Webhook (POST)
    │ { guild_id, discord_user_id, email }
    ▼
HTTP Request (Backend - lookup student)
    │ GET /api/students?email={email}&guild_id={guild_id}
    ▼
IF student found?
    │
    ├─ NO ──▶ Respond { success: false, error: "email_not_found" }
    │
    └─ YES ─▼
            HTTP Request (Add to group channel)
            │ PUT /channels/{group_channel_id}/permissions/{user_id}
            │ { "allow": "68608", "type": 1 }
            ▼
            HTTP Request (Create personal channel)
            │ POST /guilds/{guild_id}/channels
            │ { "name": "eleve-{fullname}", "parent_id": "...", "permission_overwrites": [...] }
            ▼
            HTTP Request (Update backend)
            │ PATCH /api/students/{student_id}
            │ { "discord_user_id": "...", "discord_channel_id": "..." }
            ▼
            Respond to Webhook
            │ { success: true, student: {...}, actions_performed: {...} }
```

### 13.3 Credentials necessaires

| Credential | Type | Usage |
|------------|------|-------|
| `discord-bot-token` | Header Auth | Appels API Discord (`Authorization: Bot {token}`) |
| `backend-service-token` | Header Auth | Appels Backend API |

### 13.4 Questions pour Backend

1. **Bot Token Discord** : Le credential `discord-bot-token` existe-t-il deja dans n8n ? Sinon, quel token utiliser ?

2. **Endpoint student lookup** : L'endpoint `GET /api/students?email=...&guild_id=...` est-il deja implemente ?

3. **Personal channel category** : Le `personal_channel_category_id` (pour creer le channel eleve) est-il retourne par le lookup student ou doit-il etre passe dans la requete initiale ?

4. **Role profs** : Le `{role_profs}` mentionne dans les permissions du channel personnel (ligne 254) - comment le recuperer ? Est-il stocke dans `tenant_discord_settings` ?

5. **Transformation des tags** : La logique de transformation `{fullname}` → `jean-dupont` (lowercase, sans accent, tirets) doit-elle etre dans n8n ou le backend envoie-t-il deja le nom formate ?

### 13.5 Estimation

| Workflow | Complexite | Effort |
|----------|------------|--------|
| `discord-category-create` | Simple | 0.25j |
| `discord-channel-create` | Moyenne | 0.5j |
| `student-verify` | Complexe | 0.75j |
| **Total** | | **1.5j** |

### 13.6 Dependances

- [ ] Backend : Endpoint `GET /api/students?email=...&guild_id=...`
- [ ] Backend : Endpoint `PATCH /api/students/{id}`
- [ ] Credential : `discord-bot-token` configure dans n8n
- [ ] Reponse aux questions 13.4

---

## 14. References

- [Discord API - Create Channel](https://discord.com/developers/docs/resources/guild#create-guild-channel)
- [Discord API - Channel Permissions](https://discord.com/developers/docs/topics/permissions)
- [Discord API - Create Invite](https://discord.com/developers/docs/resources/invite#create-channel-invite)
