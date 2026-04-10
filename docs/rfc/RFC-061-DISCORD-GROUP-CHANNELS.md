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

**Date** : 2026-04-10 (v2: 2026-04-10)
**Auteur** : Equipe n8n

### 13.1 Workflows a creer (liste revisee)

| Workflow | Webhook path | Description |
|----------|--------------|-------------|
| `GUILD - Category Create` | `discord/category/create` | Cree une categorie Discord |
| `GUILD - Channel Create` | `discord/channel/create` | Cree un channel + lien invitation |
| `GUILD - Channel Delete` | `discord/channel/delete` | Supprime un channel Discord (cascade) |
| `GUILD - Invite Renew` | `discord/invite/renew` | Renouvelle un lien d'invitation |
| `GUILD - Student Verify` | `discord/student/verify` | Verifie email, assigne permissions, cree channel perso |
| `GUILD - Invite Renew Cron` | (cron) | Cron quotidien pour renouveler les invites expirantes |

### 13.2 Flux detailles (mise a jour avec endpoints backend)

**1. `discord-category-create`**
```
Webhook (POST)
    │ { guild_id, name }
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
    │ { guild_id, category_id, name, topic, private, create_invite, invite_max_age }
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

**3. `discord-channel-delete`** (nouveau - requis pour cascade)
```
Webhook (POST)
    │ { channel_id }
    ▼
HTTP Request (Discord API)
    │ DELETE https://discord.com/api/v10/channels/{channel_id}
    │ Header: Authorization: Bot {BOT_TOKEN}
    ▼
Respond to Webhook
    │ { success: true }
```

**4. `discord-invite-renew`** (nouveau - requis pour cron)
```
Webhook (POST)
    │ { channel_id, max_age }
    ▼
HTTP Request (Create Invite)
    │ POST https://discord.com/api/v10/channels/{channel_id}/invites
    │ { "max_age": 604800, "max_uses": 0 }
    ▼
Respond to Webhook
    │ { success: true, invite_url: "...", invite_expires_at: "..." }
```

**5. `student-verify`** (mise a jour avec format backend section 14.10)
```
Webhook (POST) - appele par le plugin Discord
    │ { guild_id, discord_user_id, email }
    ▼
HTTP Request (Backend - lookup student)
    │ POST /api/discord/webhook/student-verify
    │ Body: { "guild_id": "...", "email": "..." }
    ▼
IF success == false?
    │ YES ──▶ Respond { success: false, error: "email_not_found" }
    │
    └─ NO (student found) ─▼
            │
            │ Response contient:
            │ - student.id, student.firstname, student.lastname
            │ - group.discord_channel_id
            │ - group.personal_channels_enabled
            │ - group.personal_channel_category_discord_id
            │ - group.profs_role_discord_id
            │ - group.channel_name (pre-formate par backend)
            ▼
            HTTP Request (Add user to group channel)
            │ PUT /channels/{group.discord_channel_id}/permissions/{discord_user_id}
            │ { "allow": "68608", "type": 1 }
            ▼
            IF group.personal_channels_enabled?
            │ YES ──▼
            │       HTTP Request (Create personal channel)
            │       POST /guilds/{guild_id}/channels
            │       {
            │         "name": "{group.channel_name}",
            │         "type": 0,
            │         "parent_id": "{group.personal_channel_category_discord_id}",
            │         "permission_overwrites": [
            │           { "id": "{guild_id}", "type": 0, "deny": "1024" },
            │           { "id": "{discord_user_id}", "type": 1, "allow": "68608" },
            │           { "id": "{group.profs_role_discord_id}", "type": 0, "allow": "68608" }
            │         ]
            │       }
            │       │
            ▼───────┘
            HTTP Request (Callback backend)
            │ POST /api/discord/webhook/student-join-callback
            │ { "student_id": "...", "discord_user_id": "...", "discord_channel_id": "..." }
            ▼
            Respond to Webhook
            │ { success: true, student: {...}, actions_performed: {...} }
```

**6. `invite-renew-cron`** (nouveau)
```
Cron Trigger (quotidien 3h00)
    ▼
HTTP Request (Backend - get expiring invites)
    │ POST /api/discord/admin/guilds/cron/renew-expiring-invites
    ▼
Loop sur chaque groupe avec invite expirante
    │
    ├─▶ HTTP Request (Discord - create new invite)
    │   POST /channels/{channel_id}/invites
    │   { "max_age": 604800, "max_uses": 0 }
    │
    └─▶ HTTP Request (Backend - update group)
        PATCH /api/ecommerce/admin/guilds/{gid}/groups/{id}
        { "discord_invite_url": "...", "discord_invite_expires_at": "..." }
```

### 13.3 Credentials necessaires

| Credential | Type | Usage | Scope |
|------------|------|-------|-------|
| `discord-bot-token` | Header Auth | `Authorization: Bot {token}` | **Global** (1 bot pour tous les tenants) |
| `backend-api` | Header Auth | Appels Backend API | Global |

**Note** : Le bot token est global car c'est le meme bot Discord qui gere tous les serveurs. Le tenant est resolu cote backend via `guild_id`.

### 13.4 Reponses aux questions Backend (section 14.12)

| Q | Question | Reponse |
|---|----------|---------|
| **Q1** | Rate limit Discord - retry + exponential backoff ? | **Oui**. n8n HTTP Request supporte nativement le retry avec backoff. Config : `retry on fail = true`, `max tries = 3`, `wait between tries = 1000ms` (double a chaque retry). Pour les erreurs 429 (rate limit), on parse le header `Retry-After` et on attend. |
| **Q2** | Redis comme queue avec debounce ? | **Non nativement**. n8n ne supporte pas Redis Subscribe (cf. docs/n8n/REDIS_LIMITATIONS.md). **Alternative** : le backend appelle un webhook n8n pour chaque item, et n8n utilise un noeud "Wait" de 1 seconde entre chaque appel Discord. Ou bien : le backend batch les items et appelle n8n une seule fois avec un array, n8n loop avec Wait. |
| **Q3** | Webhook `discord-channel-delete` existe ? | **Non, a creer**. Ajoute dans la liste section 13.1. Necessaire pour la suppression cascade des channels personnels et du channel groupe. |
| **Q4** | Bot token par tenant ou global ? | **Global**. Un seul bot Discord gere tous les serveurs de tous les tenants. Le credential `discord-bot-token` est unique dans n8n. Le tenant est resolu cote backend via `guild_id` → `public.tenant_discord_servers`. |

### 13.5 Gestion du rate limiting Discord

Discord impose des limites strictes (~50 req/sec global, ~5 req/5sec par channel).

**Strategie n8n** :

1. **Retry automatique** : HTTP Request node avec `retry on fail`, parse header `Retry-After` pour les 429.

2. **Debounce via Wait node** : Pour les operations en batch (import CSV → creation de 100 channels), le backend appelle n8n une seule fois avec la liste complete. n8n loop avec un Wait de 1 seconde entre chaque appel Discord.

3. **Pattern recommande pour import CSV** :
```
Backend                                 n8n
   │                                     │
   │ POST /discord/channels/bulk         │
   │ { "channels": [{...}, {...}, ...] } │
   │ ───────────────────────────────────>│
   │                                     │ Loop sur channels
   │                                     │   │
   │                                     │   ├─▶ Create channel (Discord)
   │                                     │   ├─▶ Wait 1 sec
   │                                     │   └─▶ Next
   │                                     │
   │ { "created": [...], "errors": [...]}│
   │ <───────────────────────────────────│
```

### 13.6 Estimation revisee

| Workflow | Complexite | Effort |
|----------|------------|--------|
| `discord-category-create` | Simple | 0.25j |
| `discord-channel-create` | Moyenne | 0.5j |
| `discord-channel-delete` | Simple | 0.25j |
| `discord-invite-renew` | Simple | 0.25j |
| `student-verify` | Complexe | 0.5j |
| `invite-renew-cron` | Moyenne | 0.25j |
| Rate limit handling (patterns) | - | 0.25j |
| **Total** | | **2.25j** |

**Delta vs estimation initiale** : +0.75j (nouveaux workflows + rate limiting)

### 13.7 Dependances (mise a jour)

- [x] Backend : Format response `student-verify` (section 14.10) ✓
- [x] Backend : Endpoint callback `student-join-callback` (section 14.14) ✓
- [x] Backend : Cron endpoint `renew-expiring-invites` (section 14.4) ✓
- [ ] Credential : `discord-bot-token` a configurer dans n8n (token du bot existant)
- [ ] Backend : Endpoint bulk pour import CSV (optionnel, pour debounce)

---

## 14. Analyse backend API

> **Auteur** : Equipe Backend
> **Date** : 2026-04-10
> **Source de verite** : Cette section corrige les incoherences avec l'architecture backend existante et repond aux questions n8n.

### 14.1 Corrections obligatoires au schema de donnees

La RFC initiale utilisait un pattern incorrect pour le multi-tenant.

#### Incoherence detectee

```sql
-- RFC initiale (INCORRECT)
tenant_id UUID NOT NULL REFERENCES tenants(id)
```

**Realite du projet** :
- `tenant_id` est un **VARCHAR(100)** de forme `tenant_94GPHEDA`
- **Aucune table `tenants`** en public schema
- Les donnees metier scope par tenant vont dans les **tenant schemas**

#### Correction : tables dans les tenant schemas

Les tables `groups`, `students`, `discord_categories` et `guild_discord_settings`
vont dans chaque tenant schema (pattern existant : `user_credits`, `user_credit_batches`, `room_models`).

```sql
-- tenant_XXXX.discord_categories
CREATE TABLE discord_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    discord_category_id VARCHAR(50),  -- ID Discord natif (Snowflake)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, name)
);

-- tenant_XXXX.groups
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(50) NOT NULL,
    category_id UUID REFERENCES discord_categories(id) ON DELETE SET NULL,
    room_model_id UUID REFERENCES room_models(id) ON DELETE SET NULL,  -- optionnel
    name VARCHAR(100) NOT NULL,
    description TEXT,
    -- Discord
    discord_channel_id VARCHAR(50),
    discord_invite_url VARCHAR(255),
    discord_invite_expires_at TIMESTAMP WITH TIME ZONE,
    -- Configuration
    channel_name_format VARCHAR(100) DEFAULT 'eleve-{fullname}',
    personal_channels_enabled BOOLEAN DEFAULT true,
    personal_channel_category_id UUID REFERENCES discord_categories(id),
    -- Role profs pour acces aux channels personnels
    profs_role_discord_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, name)
);

-- tenant_XXXX.students
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    firstname VARCHAR(100),
    lastname VARCHAR(100),
    matricule VARCHAR(50),
    discord_user_id VARCHAR(50),
    discord_channel_id VARCHAR(50),
    verified_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(email)
);
CREATE INDEX idx_students_discord_user_id ON students(discord_user_id);
CREATE INDEX idx_students_email ON students(email);

-- tenant_XXXX.guild_discord_settings
CREATE TABLE guild_discord_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(50) NOT NULL UNIQUE,
    verification_enabled BOOLEAN DEFAULT false,
    verification_method VARCHAR(20) DEFAULT 'button',  -- 'button' | 'dm'
    verification_channel_id VARCHAR(50),
    welcome_enabled BOOLEAN DEFAULT true,
    welcome_title VARCHAR(100),
    welcome_message TEXT,
    welcome_color INTEGER DEFAULT 5865426,
    welcome_thumbnail_url VARCHAR(255),
    welcome_footer_text VARCHAR(100),
    verification_success_message TEXT,
    verification_error_message TEXT,
    verification_retry_message TEXT,
    verification_timeout_hours INTEGER DEFAULT 24,
    verification_reminder_hours INTEGER DEFAULT 6,
    timeout_action VARCHAR(20) DEFAULT 'remind',
    invite_max_age_seconds INTEGER DEFAULT 604800,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Changements cles** :
- Pas de `tenant_id` dans les tables (le schema EST le tenant)
- `guild_id VARCHAR(50)` (coherent avec `user_credits`, `tenant_discord_servers`)
- Discord IDs `VARCHAR(50)` (les Snowflakes peuvent atteindre 19 chiffres)
- Table renommee `tenant_discord_settings` → `guild_discord_settings` (scope par guild dans le tenant)
- Cascade delete sur `students.group_id`
- FK optionnelle `groups.room_model_id` pour integration RFC-034
- Champ `profs_role_discord_id` dans `groups` (reponse Q4 n8n)
- Flag `verification_enabled` par guild (activation granulaire)

### 14.2 Clarification avec RoomModel (RFC-034)

Ce sont deux concepts differents :

| Concept | Role | Scope |
|---------|------|-------|
| `room_models` (RFC-034) | Configuration visuelle + prompts d'un espace pedagogique | Independant de Discord |
| `groups` (RFC-061) | Promotion/cohorte d'eleves liee a un channel Discord | Lie a un channel Discord |

FK optionnelle `groups.room_model_id` : si rattachee, les eleves du groupe utilisent le branding/prompts de la room_model.

### 14.3 Resolution du tenant dans le flow n8n

Le backend expose `GET /api/ecommerce/admin/guilds/{guild_id}/students?email=...`. Le routeur resout le tenant via `public.tenant_discord_servers` (RFC-053) avant de chercher dans `tenant_XXXX.students`.

**Pas de contrainte cross-tenant** sur l'email : un meme email peut exister dans plusieurs tenants car les schemas sont isoles.

### 14.4 Renouvellement automatique des invites (obligatoire)

Les invites Discord expirent (`max_age` = 7 jours par defaut). Sans renouvellement, les liens deviennent inutilisables.

**Solution** : cron quotidien qui renouvelle les invites expirant dans moins de 24h.

```
POST /api/discord/admin/guilds/cron/renew-expiring-invites
```

Appele par n8n chaque nuit. Pour chaque groupe dont l'invite expire bientot :
1. Appel n8n → Discord API pour creer un nouveau lien
2. Mise a jour `groups.discord_invite_url` et `discord_invite_expires_at`

### 14.5 Suppression cascade

**Obligatoire** : supprimer un groupe doit supprimer les channels Discord associes.

```
DELETE /api/ecommerce/admin/guilds/{gid}/groups/{group_id}
```

Actions :
1. Pour chaque eleve du groupe avec `discord_channel_id` : supprimer le channel personnel via n8n
2. Supprimer le channel groupe via n8n
3. CASCADE DB : `students` supprimes automatiquement

### 14.6 Monitoring limite Discord (500 channels)

**Obligatoire** : une ecole avec 100 eleves + 5 promotions depasse la limite.

```
GET /api/discord/guilds/{gid}/channel-count
```

Response :
```json
{
  "guild_id": "...",
  "total": 423,
  "limit": 500,
  "available": 77,
  "warning": true,
  "critical": false
}
```

Le frontend doit verifier avant toute creation de groupe ou import d'eleves.

Le champ `groups.personal_channels_enabled` permet de desactiver les channels personnels pour les gros groupes (seul le channel groupe est cree).

### 14.7 Verification : bouton + modale > DM (recommandation)

Les DMs Discord peuvent etre refuses par l'utilisateur. Le flow DM casse silencieusement.

**Recommandation** : poster un bouton dans un channel public (`verification_channel_id`) qui ouvre une modale Discord demandant l'email. Plus fiable que le DM.

Le champ `guild_discord_settings.verification_method` permet de choisir :
- `button` (defaut, recommande) — bouton + modale dans un channel public
- `dm` — ancienne methode (moins fiable)

### 14.8 Rate limiting Discord (queue + debounce)

Discord impose ~50 requests/sec global et ~5 requests/5s par channel.

**Scenario a risque** : import CSV de 100 eleves → 100 creations de channels en quelques secondes → depassement.

**Solution** : queue Redis avec debounce cote n8n :
```
Backend cree 100 records pending en DB
  → Backend publie 100 messages Redis "student-channel-create-queue"
  → n8n consume avec debounce (1 message/sec)
  → Callback n8n → Backend met a jour les records
```

### 14.9 Reponses aux questions n8n (section 13.4)

| Q | Reponse |
|---|---------|
| **Q1 - Bot Token Discord** | A configurer dans n8n. Le backend n'a pas de bot token, c'est n8n qui doit le stocker dans un credential. |
| **Q2 - Endpoint student lookup** | A creer : `GET /api/ecommerce/admin/guilds/{gid}/students?email=...`. Le backend resout le tenant via `public.tenant_discord_servers`. |
| **Q3 - Personal channel category** | Retourne par le lookup student dans la response : `personal_channel_category_discord_id` lu depuis `groups.personal_channel_category_id` → `discord_categories.discord_category_id`. |
| **Q4 - Role profs** | Stocke dans `groups.profs_role_discord_id` (pas dans `guild_discord_settings` car peut varier par groupe). Retourne dans le lookup student. |
| **Q5 - Transformation tags** | Le backend applique la transformation et retourne le nom formate (ex: `channel_name: "eleve-jean-dupont"`) dans la response du lookup student. n8n utilise directement la valeur. |

### 14.10 Format de la response `student-verify` cote backend

```
POST /api/discord/webhook/student-verify
Body: { "guild_id": "...", "email": "jean.dupont@email.com" }

Response (succes) :
{
  "success": true,
  "student": {
    "id": "uuid",
    "firstname": "Jean",
    "lastname": "Dupont"
  },
  "group": {
    "id": "uuid",
    "name": "Promotion 2026",
    "discord_channel_id": "123456789",
    "personal_channels_enabled": true,
    "personal_channel_category_discord_id": "987654321",
    "profs_role_discord_id": "555555555",
    "channel_name": "eleve-jean-dupont"
  }
}

Response (echec) :
{
  "success": false,
  "error": "email_not_found"
}
```

### 14.11 Questions pour l'equipe chatbot-core

1. Existe-t-il deja un `GuildEventsMixin` avec un handler `on_member_join` ?
2. Comment gerer le multi-handler sur `on_message` sans double-traitement des DMs ?
3. Preferez-vous implementer le flow bouton+modale (recommande) ou DM (fallback) ?
4. Le mixin doit-il lire `verification_enabled` au demarrage ou a chaque event ?

### 14.12 Questions pour l'equipe n8n

1. Comment gerez-vous actuellement le rate limit Discord dans les webhooks existants ? Retry + exponential backoff ?
2. Peut-on utiliser Redis comme queue avec debounce dans un workflow n8n ?
3. Y a-t-il deja un webhook generique `discord-channel-delete` ou faut-il le creer (necessaire pour la suppression cascade) ?
4. Le credential `discord-bot-token` doit-il etre par tenant ou global ? Si par tenant, comment l'associer (via `guild_id` ?) ?

### 14.13 Questions pour l'equipe frontend

1. L'import CSV des eleves est-il deja implemente pour d'autres features (formations RFC-048) ? Si oui, reutiliser le composant.
2. Le warning "limite channels" doit-il etre un toast, une banniere persistante ou un modal bloquant ?
3. Comment gerer l'affichage des eleves non-verifies (pending) vs verifies dans la liste du groupe ?

### 14.14 Endpoints a creer (liste definitive)

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/ecommerce/admin/guilds/{gid}/discord-categories` | Creer categorie |
| GET | `/api/ecommerce/admin/guilds/{gid}/discord-categories` | Lister |
| DELETE | `/api/ecommerce/admin/guilds/{gid}/discord-categories/{id}` | Supprimer |
| POST | `/api/ecommerce/admin/guilds/{gid}/groups` | Creer groupe |
| GET | `/api/ecommerce/admin/guilds/{gid}/groups` | Lister |
| GET | `/api/ecommerce/admin/guilds/{gid}/groups/{id}` | Detail + eleves |
| PATCH | `/api/ecommerce/admin/guilds/{gid}/groups/{id}` | Modifier |
| DELETE | `/api/ecommerce/admin/guilds/{gid}/groups/{id}` | Supprimer + cascade |
| POST | `/api/ecommerce/admin/guilds/{gid}/groups/{id}/students` | Ajouter eleve |
| POST | `/api/ecommerce/admin/guilds/{gid}/groups/{id}/students/bulk` | Import CSV |
| GET | `/api/ecommerce/admin/guilds/{gid}/students?email=...` | Lookup pour n8n |
| PATCH | `/api/ecommerce/admin/guilds/{gid}/students/{id}` | Modifier |
| DELETE | `/api/ecommerce/admin/guilds/{gid}/students/{id}` | Supprimer |
| GET | `/api/ecommerce/admin/guilds/{gid}/discord-settings` | Config branding |
| PUT | `/api/ecommerce/admin/guilds/{gid}/discord-settings` | Modifier branding |
| GET | `/api/discord/guilds/{gid}/channel-count` | Verifier limite |
| POST | `/api/discord/webhook/student-verify` | Lookup par email (n8n) |
| POST | `/api/discord/webhook/student-join-callback` | Callback apres creation channel |
| POST | `/api/discord/admin/guilds/cron/renew-expiring-invites` | Cron invites |

### 14.15 Estimation revisee

| Equipe | Tache | RFC initiale | Revise |
|--------|-------|-------------|--------|
| Backend | Tables + modeles SQLAlchemy (tenant schemas) | 2j | 1.5j |
| Backend | Migration alembic | - | 0.5j |
| Backend | Services + endpoints CRUD (19 endpoints) | 1j | 2.5j |
| Backend | Cron renouvellement invites | - | 0.5j |
| Backend | Endpoint channel-count | - | 0.25j |
| Backend | Suppression cascade | - | 0.5j |
| Backend | Integration webhooks n8n | 1j | 0.5j |
| Frontend | UI categories + groupes | 2j | 2j |
| Frontend | UI pre-inscription + import CSV | 1j | 1.5j |
| Frontend | UI branding + verification config | 1j | 1j |
| Frontend | Warning limite channels | - | 0.25j |
| n8n | Webhooks Discord | 1.5j | 1.5j |
| n8n | Queue rate limit + cron invites | - | 0.75j |
| chatbot-core | StudentVerificationMixin + Manager | 1.5j | 2j |
| chatbot-core | Verification par bouton + modale | - | 1j |
| Plugins | Config + activation | 0.5j | 0.5j |
| Tests | E2E | 1j | 1.5j |
| **Total** | | **11.5j** | **18j** |

### 14.16 Decisions source de verite backend

| Point | Decision |
|-------|----------|
| Tables | **Tenant schemas** (pas public avec FK) |
| Types | `guild_id VARCHAR(50)`, Discord IDs `VARCHAR(50)` |
| Unicite email | Dans le tenant uniquement, pas cross-tenant |
| Suppression | Cascade obligatoire (Discord + DB) |
| Renouvellement invites | Cron quotidien obligatoire |
| Verification | **Bouton + modale** par defaut (DM en fallback) |
| Monitoring channels | Endpoint dedie + warning frontend |
| Activation | Flag `verification_enabled` par guild (pas global) |
| Integration RoomModel | FK optionnelle `groups.room_model_id` |
| Rate limiting | Queue Redis + debounce cote n8n obligatoire |
| Option chatbot-core | **Option A** (mixin) confirmee |
| Role profs | Dans `groups.profs_role_discord_id` (pas settings) |
| Transformation tags | Cote backend (retournee pre-formatee a n8n) |

### 14.17 Reponses backend aux questions frontend (section 15)

> Reponses aux questions soulevees par l'equipe frontend dans la section 15.
> Ces decisions completent la source de verite backend.

#### Q1 — Credit par guild ou par groupe ? (section 15.5.1)

**Decision : Option A — Override par groupe**

```sql
ALTER TABLE groups ADD COLUMN monthly_quota_per_user INTEGER;
-- NULL = fallback sur guild_credit_allocations.monthly_quota_per_user
```

**Logique effective** :
```python
effective_quota = group.monthly_quota_per_user or guild_allocation.monthly_quota_per_user
```

**Impact RFC-059** :
- `GuildAllocationService.renew_guild()` doit parcourir les groupes et utiliser le quota effectif
- `GuildAllocationService.get_balance()` reste inchange (lecture des batches)
- `init_member()` doit resoudre le groupe du user (via `students.group_id`) pour le quota initial

**Retrocompatible** : si pas de record dans `groups` ou `monthly_quota_per_user = NULL`, comportement actuel inchange.

**Effort supplementaire** : +0.5j backend (modifications GuildAllocationService).

#### Q2 — Users hors Discord (section 15.2)

**Decision** : `students` reste dediee aux eleves Discord. Les admins/users applicatifs vivent dans la table `users` tenant existante.

**Reponses aux 3 sous-questions :**

| Question | Reponse |
|----------|---------|
| Admin dans `students` avec role=admin ? | **Non**. Exclusivement dans `users` tenant. `students` n'a pas de sens pour un admin (pas de `group_id`, pas de verification email). |
| Promouvoir un eleve verifie au rang d'admin ? | **Oui**, via un endpoint dedie. Le record `students` reste, un nouveau record `users` est cree a partir des donnees (email, firstname, lastname). Pas de migration automatique — action explicite. |
| Un admin peut-il recevoir des credits RFC-059 ? | **Oui**, mais uniquement via attribution manuelle (`POST /credit-quota/grant`). Les batches utilisent `(guild_id, discord_user_id)` — si l'admin n'a pas de Discord, il ne peut pas recevoir de credits. Dans ce cas, l'admin utilise plutot le mode **Stripe** existant. |

**Nouvel endpoint** :
```
POST /api/ecommerce/admin/guilds/{gid}/students/{id}/promote-to-admin
```
Cree un record dans `users` a partir des donnees de `students`. Les deux records coexistent.

**UI** : deux chemins distincts confirmes.
1. `AdminManagementModal` existant → users applicatifs
2. Vue groupe/promotion → pre-inscription eleves

#### Q3 — Placement UI branding Discord (section 15.5.2)

**Decision** : **Modal depuis la vue groupes** (pas une route dediee).

Raison : le branding Discord est specifique a un guild, pas au tenant entier. L'acces naturel est depuis le dashboard guild. Un modal evite une route supplementaire dans le router Vue.

```
/dashboard/guild/:guildId/
├── Carte "Groupes Discord" → /groups
├── Carte "Branding Discord" → ouvre Modal ← nouveau
├── Carte "Credits" → /credits
└── ...
```

Le modal contient les champs de `guild_discord_settings` :
- Message de bienvenue (titre, contenu, couleur, logo)
- Methode de verification (bouton / DM)
- Timeouts et relances

#### Q4 — Migration PromotionsListView / DetailView (section 15.5.4)

**Decision** : **Conserver en parallele**, pas de migration.

**Raison** : la table `promotions` existe deja (RFC-023 Formation Management) et porte un concept **pedagogique** (lie a une `Formation`, RFC-023). C'est different du concept `groups` de RFC-061 qui est un concept **Discord** (channel, invitations, verification).

**Relation** : FK optionnelle dans `groups` :

```sql
ALTER TABLE groups ADD COLUMN promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
```

Un `group` Discord PEUT etre rattache a une `promotion` existante. Quand l'admin cree un groupe Discord, il a l'option de :
- **Nouveau groupe** : cree un groupe Discord sans lien avec une promotion pedagogique
- **Depuis une promotion** : selectionne une promotion existante, importe ses eleves dans le groupe Discord

**UI** :
- `PromotionsListView` / `PromotionDetailView` restent inchanges → gestion pedagogique (RFC-023)
- `GroupsListView` / `GroupDetailView` nouveaux → gestion Discord (RFC-061)
- Bouton dans `PromotionDetailView` : "Creer un groupe Discord" → ouvre la creation de groupe pre-remplie avec la promotion

#### Q5 — Suppression groupe : invalidation des credits (section 15.5.5)

**Decision** : la suppression d'un groupe invalide les lots de credits des eleves du groupe.

**Ajout dans la cascade** :
```python
async def delete_group(group_id):
    # 1. Invalider les credits des eleves (remettre a 0)
    students = await get_students_by_group(group_id)
    for student in students:
        if student.discord_user_id:
            await db.execute(text("""
                UPDATE user_credit_batches
                SET credits_remaining = 0
                WHERE guild_id = :gid AND discord_user_id = :uid
                  AND credits_remaining > 0
            """), {"gid": group.guild_id, "uid": student.discord_user_id})

            # Log dans user_credit_logs
            await create_log(group.guild_id, student.discord_user_id,
                             'group_deleted', returned_amount, 'group_removed')

    # 2. Supprimer channels Discord (cascade)
    # 3. Supprimer records DB (CASCADE SQL)
```

**Note** : les credits invalides ne retournent **pas** dans le pool commun (c'est une suppression, pas un depart de membre). Ils sont simplement remis a 0.

#### Q6 — Import CSV : UX resolution erreurs (section 15.5.6)

**Endpoint backend** :
```
POST /api/ecommerce/admin/guilds/{gid}/groups/{id}/students/bulk
Content-Type: multipart/form-data
Body: file (CSV)
```

**Response structuree** :
```json
{
  "success": true,
  "imported": 95,
  "total": 100,
  "errors": [
    {"line": 12, "data": {"email": "xxx", "firstname": "Jean"}, "error": "invalid_email", "message": "Email manquant ou invalide"},
    {"line": 34, "data": {"email": "jean@example.com"}, "error": "already_exists", "message": "Email deja pre-inscrit dans ce tenant"},
    {"line": 67, "data": {"email": "maria@test.com"}, "error": "missing_firstname", "message": "Prenom requis"}
  ]
}
```

**Codes d'erreur standardises** :
| Code | Description |
|------|-------------|
| `invalid_email` | Format email invalide |
| `missing_firstname` | Prenom manquant |
| `missing_lastname` | Nom manquant |
| `already_exists` | Email deja dans la DB |
| `group_not_found` | group_id invalide |

**UX front** :
1. Upload du CSV → loader
2. Response affichee dans un tableau : lignes importees (vert) + erreurs (rouge)
3. L'admin corrige le CSV et re-importe (seules les lignes en erreur)

**Composant reutilisable** : si deja cree pour d'autres features (ex: formations), reutiliser. Sinon, creer `CsvImportDialog.vue` generique.

### 14.18 Ajouts au schema (synthese suite aux decisions 14.17)

```sql
-- Credit par groupe (Q1)
ALTER TABLE groups ADD COLUMN monthly_quota_per_user INTEGER;

-- Lien optionnel avec Promotion RFC-023 (Q4)
ALTER TABLE groups ADD COLUMN promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
```

### 14.19 Endpoints ajoutes (synthese suite aux decisions 14.17)

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/ecommerce/admin/guilds/{gid}/students/{id}/promote-to-admin` | Promouvoir un eleve en admin |
| POST | `/api/ecommerce/admin/guilds/{gid}/groups/{id}/import-promotion/{promotion_id}` | Importer les eleves d'une promotion RFC-023 dans un groupe Discord |

### 14.20 Impact sur l'estimation

| Ajout | Effort |
|-------|--------|
| Override quota par groupe (modification RFC-059) | +0.5j backend |
| Endpoint promote-to-admin | +0.25j backend |
| Endpoint import-promotion | +0.25j backend |
| Invalidation credits a la suppression | +0.25j backend |
| **Total ajoute** | **+1.25j backend** |

**Estimation totale revisee** : 18j → **19.25j** (avec toutes les decisions consolidees).

---

## 15. Analyse frontend (2026-04-10)

Cette section capture les decisions d'implementation cote frontend Vue.js, posees apres lecture croisee RFC-059 + RFC-061 et arbitrage avec le product owner.

### 15.1 Decisions produit validees

| Point | Decision | Notes |
|-------|----------|-------|
| Quota credit | Meme nombre de credits pour tous les membres d'un channel | Differenciation par role (prof vs etudiant) reportee post-V1 |
| Etudiant sans credit | Cas impossible en theorie | Pas d'etudiant dans la DB tant que l'admin n'a pas pre-inscrit son email. Quand il rejoint, soit il est reconnu (et a donc un lot de credits), soit il est rejete a la verification |
| UI gestion groupes/channels Discord | **Niveau serveur Discord** (pas dans PromotionDetailView) | A brancher dans le dashboard de guild, pas dans le flux pedagogique |
| Appels Discord/n8n depuis le front | **Interdits** | Tout passe systematiquement par le backend, meme pour les actions "Discord pure" |
| Webhook `CHANNEL_DELETE` => nettoyage DB | **Dette technique** | Pas dans V1, on accepte le drift |
| Verification par bouton vs DM | Etat de la modale stocke cote **plugin Discord** (pas en DB) | A valider avec l'equipe plugins |
| Branding DM de bienvenue | **Emplacement UI a decider** | Pur Discord, pas naturel dans le dashboard actuel. A trancher au moment de livrer la feature |

### 15.2 Nouveau besoin : utilisateurs hors Discord

Contrainte remontee par le PO :

> On doit pouvoir ajouter des users (par exemple des admins) sans qu'ils soient forcement rattaches a un serveur Discord.

Consequence sur le modele :
- La table `students` de RFC-061 reste dediee aux **eleves d'un groupe** (rattaches a un `group_id` et donc a un channel Discord).
- Les **admins / utilisateurs applicatifs** vivent dans le systeme d'utilisateurs **deja existant** de l'app (auth tenant), independamment de tout rattachement Discord.
- L'UI doit offrir **deux chemins distincts** :
  1. Creation d'un admin / user applicatif => `AdminManagementModal` existant, aucun champ Discord obligatoire
  2. Pre-inscription d'un eleve => vue groupe/promotion, email + firstname + lastname + `group_id` obligatoires, rattachement Discord differe

A clarifier avec le backend :
- [ ] Un admin doit-il avoir une ligne dans `students` marquee comme `role=admin` ou reste-t-il exclusivement dans la table `users` tenant ?
- [ ] Peut-on **promouvoir** un eleve verifie au rang d'admin (ajout cote table `users`) ? Quel flux ?
- [ ] Un admin peut-il recevoir des credits RFC-059 alors qu'il n'est dans aucun groupe ?

### 15.3 Placement UI propose

| Ecran | Role |
|-------|------|
| `/dashboard/guild/:guildId/` | Hub serveur. Ajoute une carte "Groupes Discord" qui ouvre la vue de gestion des groupes/channels (RFC-061). |
| `/dashboard/guild/:guildId/groups` (a creer) | Liste + CRUD des groupes Discord (= promotions Discord-enabled). Inclut import CSV etudiants, lien d'invitation, compteur channels Discord (GET `/discord/guilds/{gid}/channel-count`). |
| `/dashboard/guild/:guildId/groups/:groupId` (a creer) | Detail groupe : liste des etudiants avec leurs statuts (pending, invited, registered, active, ...), actions (relancer, expulser), panneau credits par groupe |
| `/dashboard/guild/:guildId/credits` (existant, transitoire) | Conserve pour la config de quota globale et la distribution du pot commun tant que l'integration par groupe n'est pas livree. |
| `PromotionsListView` / `PromotionDetailView` (existants) | **A auditer** : modele actuel pre-RFC-061, sans champs Discord. Soit a migrer vers le modele `groups` RFC-061, soit a deprecier au profit des nouvelles vues `/groups`. Decision a prendre. |
| `AdminManagementModal` (existant) | Reste le point d'entree pour la gestion des users applicatifs / admins sans rattachement Discord (cf. 15.2). Peut eventuellement recevoir une colonne "credits" plus tard. |

### 15.4 Points d'integration avec RFC-059

| Sujet | Etat spec | Action front |
|-------|-----------|--------------|
| Modele quota | RFC-059 v2 definit le quota **au niveau guild** (1 config / guild dans `guild_credit_allocations`). RFC-061 n'evoque aucun champ credit dans `groups`. | Tension avec la decision "quota = channel" du PO. **A remonter aux equipes backend/n8n** avant d'ajouter une UI quota-par-groupe cote front. |
| Service `guildCreditsApi.ts` | Aligne avec RFC-059 v2, aucun drift | Reutilisable tel quel |
| Battery mock utilisateur | `CreditsBatteryMock.vue` aujourd'hui en mode Stripe mocke | A brancher sur le solde de la **guild active** (1 solde par guild, affichage contextuel) |

### 15.5 Questions residuelles a trancher

1. **Crediter par guild ou par groupe ?** Decision metier posee par le PO = par channel, mais RFC-059 et RFC-061 ne supportent pas nativement ce modele. Option : ajouter `monthly_quota_per_user` nullable dans `groups` (override, fallback sur la config guild). Necessite modif coordonnee backend + RFC-059.
2. **Placement de l'UI branding Discord** (welcome DM, verification method) : nouvelle vue `/dashboard/guild/:guildId/discord-settings` ? Section dans le dashboard serveur ? Modale depuis la vue groupes ?
3. **Users hors Discord** : clarifier le modele DB (table `users` existante vs `students` avec role). Cf. 15.2.
4. **Migration PromotionsListView/DetailView** : a refondre en `GroupsListView/GroupDetailView` RFC-061, ou a conserver en parallele ?
5. **Suppression d'un groupe** : cascade sur le channel Discord + invalidation des lots de credits des etudiants => confirmer l'endpoint backend.
6. **Import CSV etudiants** : UX de resolution des erreurs (email deja pris, format invalide, ligne en echec) => spec front a definir.

### 15.6 Ordre d'implementation recommande (hors blocage specs)

1. Audit + decision sur `PromotionsListView` / `PromotionDetailView` (a reecrire ou conserver ?)
2. Vues `GroupsListView` + `GroupDetailView` alignees RFC-061 (CRUD groupes, import students, lien invite, branding minimal)
3. Integration credits **au niveau groupe** une fois la question 15.5.1 tranchee
4. Wiring `CreditsBatteryMock` sur la guild active
5. Settings branding Discord (welcome DM, verification method)
6. Differenciation de credits par role (hors V1)

---

## 16. Analyse equipe chatbot-core

**Date** : 2026-04-10
**Auteur** : Equipe chatbot-core
**Statut** : Confirme Option A (mixin dans chatbot-core)

### 16.1 Reponses aux questions backend (section 14.11)

| Q | Question | Reponse |
|---|----------|---------|
| **Q1** | Existe-t-il deja un `GuildEventsMixin` avec `on_member_join` ? | **Non**. `GuildEventsMixin` gere uniquement les events serveur (`on_guild_join`, `on_guild_update`, `on_guild_remove`, `on_ready`). Il n'y a pas de handler `on_member_join`. Un **nouveau mixin** `StudentVerificationMixin` sera cree. |
| **Q2** | Multi-handler sur `on_message` sans double-traitement DMs ? | **Non necessaire si bouton+modale**. Avec le flow bouton+modale, la modale capture directement l'email — pas besoin d'ecouter `on_message`. Si fallback DM actif, utiliser un cache `pending_verifications: dict[int, str]` (user_id → guild_id) avec TTL 24h. Le handler `on_message` verifie d'abord si l'user est en attente avant de traiter. |
| **Q3** | Bouton+modale ou DM ? | **Bouton+modale** (recommande). Plus fiable : pas de probleme avec DMs fermes. Le mixin supportera les deux via config `verification_method: "button" \| "dm"`. Implementation modale avec `discord.ui.Modal`. |
| **Q4** | Lire `verification_enabled` au demarrage ou a chaque event ? | **A chaque event `on_member_join`**, avec **cache TTL 5 minutes**. Le flag peut changer dynamiquement cote admin. Pattern : `_verification_settings_cache: dict[str, tuple[dict, float]]` (guild_id → (settings, timestamp)). Invalidation apres 5 min. |

### 16.2 Ce qui existe deja

| Composant | Version | Reutilisable |
|-----------|---------|--------------|
| `GuildEventsMixin` | 0.8.57 | **Non** pour RFC-061 (pas de `on_member_join`) |
| `ServerSyncManager` | 0.8.57 | Oui comme reference pattern (cache TTL, delegation n8n) |
| `N8nClient` | 0.8.59 | **Oui** pour appels webhook `student-verify`, `tenant-settings` |
| `PluginN8nClient` | 0.8.59 | **Oui** comme base pour `StudentVerificationClient` |
| `discord.ui.Modal` | discord.py 2.0+ | **Oui** pour flow bouton+modale |

### 16.3 Architecture proposee

```
chatbot_core/
├── mixins/
│   ├── guild_events.py          (existant - RFC-053/060)
│   └── student_verification.py  (NOUVEAU - RFC-061)
├── services/
│   └── student_verification_manager.py  (NOUVEAU)
└── discord_ui/
    └── verification_views.py    (NOUVEAU - bouton + modale)
```

### 16.4 Implementation detaillee

#### 16.4.1 StudentVerificationMixin

```python
# chatbot_core/mixins/student_verification.py

class StudentVerificationMixin:
    """Mixin pour verification des nouveaux membres (RFC-061)."""

    _verification_manager: "StudentVerificationManager | None" = None
    _verification_enabled: bool = False
    _verification_settings_cache: dict[str, tuple[dict, float]] = {}
    _verification_cache_ttl: int = 300  # 5 minutes

    def setup_student_verification(
        self,
        n8n_client: "N8nClient",
        enabled: bool = True,
        cache_ttl: int = 300,
    ) -> None:
        """Active la verification des nouveaux membres."""
        self._verification_enabled = enabled
        self._verification_cache_ttl = cache_ttl
        self._verification_manager = StudentVerificationManager(self, n8n_client)
        logger.info("[StudentVerificationMixin] Verification enabled")

    async def on_member_join(self, member: "discord.Member") -> None:
        """Handler appele quand un membre rejoint le serveur."""
        if not self._verification_enabled or not self._verification_manager:
            return

        guild_id = str(member.guild.id)

        # Recupere settings avec cache TTL
        settings = await self._get_cached_settings(guild_id)

        if not settings.get("verification_enabled"):
            return

        # Dispatch selon la methode configuree
        method = settings.get("verification_method", "button")
        if method == "button":
            await self._verification_manager.post_verification_button(member, settings)
        else:
            await self._verification_manager.send_welcome_dm(member, settings)

    async def _get_cached_settings(self, guild_id: str) -> dict:
        """Recupere les settings avec cache TTL 5 min."""
        now = time.time()
        if guild_id in self._verification_settings_cache:
            cached, timestamp = self._verification_settings_cache[guild_id]
            if now - timestamp < self._verification_cache_ttl:
                return cached

        settings = await self._verification_manager.get_tenant_settings(guild_id)
        self._verification_settings_cache[guild_id] = (settings, now)
        return settings
```

#### 16.4.2 StudentVerificationManager

```python
# chatbot_core/services/student_verification_manager.py

class StudentVerificationManager:
    """Manager pour la verification des eleves (RFC-061)."""

    def __init__(self, bot: "commands.Bot", n8n_client: "N8nClient"):
        self.bot = bot
        self.n8n = n8n_client
        self._pending_verifications: dict[int, str] = {}  # user_id → guild_id

    async def get_tenant_settings(self, guild_id: str) -> dict:
        """Recupere les settings de branding du tenant via n8n."""
        try:
            return await self.n8n.call_webhook(
                "tenant-settings",
                data={"guild_id": guild_id},
            )
        except Exception as e:
            logger.error(f"[StudentVerificationManager] Failed to get settings: {e}")
            return {}

    async def post_verification_button(
        self, member: "discord.Member", settings: dict
    ) -> None:
        """Poste un bouton de verification dans le channel dedie."""
        channel_id = settings.get("verification_channel_id")
        if not channel_id:
            logger.warning(f"[StudentVerificationManager] No verification channel for {member.guild.id}")
            return

        channel = member.guild.get_channel(int(channel_id))
        if not channel:
            return

        view = VerificationButtonView(self, member, settings)
        embed = self._build_welcome_embed(settings, member)
        await channel.send(embed=embed, view=view)

    async def send_welcome_dm(
        self, member: "discord.Member", settings: dict
    ) -> None:
        """Envoie le DM de bienvenue avec branding (fallback)."""
        try:
            embed = self._build_welcome_embed(settings, member)
            await member.send(embed=embed)
            self._pending_verifications[member.id] = str(member.guild.id)
        except discord.Forbidden:
            logger.warning(f"[StudentVerificationManager] Cannot DM {member}")

    async def verify_email(
        self, guild_id: str, user_id: str, email: str
    ) -> dict:
        """Verifie l'email aupres du backend via n8n."""
        return await self.n8n.call_webhook(
            "student-verify",
            data={
                "guild_id": guild_id,
                "discord_user_id": user_id,
                "email": email,
            },
        )

    def _build_welcome_embed(self, settings: dict, member: "discord.Member") -> "discord.Embed":
        """Construit l'embed de bienvenue avec branding tenant."""
        embed = discord.Embed(
            title=settings.get("welcome_title", "Bienvenue !"),
            description=settings.get("welcome_message", "Pour finaliser ton inscription, entre ton email."),
            color=settings.get("welcome_color", 5865426),
        )
        if settings.get("welcome_thumbnail_url"):
            embed.set_thumbnail(url=settings["welcome_thumbnail_url"])
        if settings.get("welcome_footer_text"):
            embed.set_footer(text=settings["welcome_footer_text"])
        return embed
```

#### 16.4.3 Verification Views (bouton + modale)

```python
# chatbot_core/discord_ui/verification_views.py

class EmailVerificationModal(discord.ui.Modal, title="Verification"):
    """Modale pour saisir l'email de verification."""

    email = discord.ui.TextInput(
        label="Adresse email",
        placeholder="prenom.nom@email.com",
        required=True,
        max_length=255,
    )

    def __init__(self, manager: "StudentVerificationManager", guild_id: str, settings: dict):
        super().__init__()
        self.manager = manager
        self.guild_id = guild_id
        self.settings = settings

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)

        result = await self.manager.verify_email(
            self.guild_id,
            str(interaction.user.id),
            self.email.value.strip(),
        )

        if result.get("success"):
            msg = self.settings.get("verification_success_message", "✅ Email verifie !")
            await interaction.followup.send(msg, ephemeral=True)
        else:
            msg = self.settings.get("verification_error_message", "❌ Email non reconnu.")
            await interaction.followup.send(msg, ephemeral=True)


class VerificationButtonView(discord.ui.View):
    """View avec bouton qui ouvre la modale de verification."""

    def __init__(
        self,
        manager: "StudentVerificationManager",
        member: "discord.Member",
        settings: dict,
    ):
        super().__init__(timeout=None)  # Persistent
        self.manager = manager
        self.member = member
        self.settings = settings
        self.guild_id = str(member.guild.id)

    @discord.ui.button(label="Verifier mon email", style=discord.ButtonStyle.primary, emoji="✉️")
    async def verify_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        modal = EmailVerificationModal(self.manager, self.guild_id, self.settings)
        await interaction.response.send_modal(modal)
```

### 16.5 Utilisation dans un plugin

```python
# Dans le plugin main.py

from chatbot_core.mixins import GuildEventsMixin, StudentVerificationMixin
from chatbot_core import N8nClient

class MyBot(commands.Bot, GuildEventsMixin, StudentVerificationMixin):
    async def setup_hook(self):
        # Setup existant RFC-053/060
        self.setup_guild_events(sync_manager, startup_sync=True)

        # Setup RFC-061 (nouveau)
        if config.student_verification_enabled:
            self.setup_student_verification(
                n8n_client,
                enabled=True,
                cache_ttl=300,  # 5 min
            )
```

### 16.6 Estimation

| Tache | Effort |
|-------|--------|
| `StudentVerificationMixin` | 0.5j |
| `StudentVerificationManager` | 0.5j |
| `VerificationButtonView` + `EmailVerificationModal` | 0.5j |
| `on_message` handler (fallback DM) | 0.25j |
| Tests unitaires | 0.5j |
| Documentation | 0.25j |
| **Total chatbot-core** | **2.5j** |

### 16.7 Dependances

- [ ] Backend : Endpoint `GET /api/ecommerce/admin/guilds/{gid}/discord-settings` pour recuperer `verification_enabled`, `verification_method`, `verification_channel_id`
- [ ] n8n : Webhook `tenant-settings` qui interroge le backend et retourne les settings branding
- [ ] n8n : Webhook `student-verify` deja specifie (section 7.3)

### 16.8 Questions resolues

| Point | Decision |
|-------|----------|
| Nouveau mixin ou extension GuildEventsMixin ? | **Nouveau mixin** `StudentVerificationMixin` (separation des concerns) |
| View persistante ou ephemere ? | **Persistante** (`timeout=None`) pour que le bouton reste actif apres restart bot |
| Cache settings | TTL 5 min, invalidation automatique |
| Support multi-guild | Oui, cache par `guild_id` |
| Fallback si bouton echoue | DM automatique si `verification_channel_id` non configure |

---

## 17. References

- [Discord API - Create Channel](https://discord.com/developers/docs/resources/guild#create-guild-channel)
- [Discord API - Channel Permissions](https://discord.com/developers/docs/topics/permissions)
- [Discord API - Create Invite](https://discord.com/developers/docs/resources/invite#create-channel-invite)
- [Discord.py Modal](https://discordpy.readthedocs.io/en/stable/interactions/api.html#modal)
- [RFC-053 Server Sync](./RFC-053-SERVER-SYNC-ISOLATION.md)
- [RFC-060 Guild Info Sync](./RFC-060-GUILD-INFO-SYNC.md)
