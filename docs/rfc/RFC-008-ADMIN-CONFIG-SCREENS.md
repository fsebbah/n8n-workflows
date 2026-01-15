# RFC-008: Admin Config Screens

**Status:** Approved
**Date:** 2026-01-15
**Author:** Framework Team (chatbot-core)
**Version:** 2.0.0

---

## Résumé

Écrans d'administration pour configurer le branding et l'aide du bot via Discord (slash commands avec UI interactive). Le **framework pilote**, les **plugins proposent** leur configuration.

---

## Décisions validées

Suite aux réponses des équipes API et n8n (RFC-008b), les décisions suivantes sont actées :

| Sujet | Décision | Source |
|-------|----------|--------|
| **Table `guild_branding`** | Migration (étendre table existante RFC-003) | API |
| **Table `guild_help_config`** | Nouvelle table avec JSONB | API + n8n |
| **Namespace API** | `/api/config` (rétrocompat RFC-003 maintenue) | API |
| **Cache Redis** | Non pour v1, oui pour v2 (TTL 5min) | n8n |
| **Historique modifs** | Non pour v1 | API |
| **Validation URLs** | Côté API avec domaines whitelist | API |

### Développement en parallèle

Toutes les équipes travaillent **en parallèle**. Aucune équipe n'est bloquante.

```
        ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
        │    API      │     │    n8n      │     │ chatbot-core│
        │  (backend)  │     │ (workflows) │     │ (framework) │
        └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
               │                   │                   │
               ▼                   ▼                   ▼
        ┌─────────────────────────────────────────────────────┐
        │                    INTÉGRATION                       │
        └─────────────────────────────────────────────────────┘
                                   │
                                   ▼
                          ┌─────────────┐
                          │   Plugin    │
                          └─────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRAMEWORK (chatbot-core)                        │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ ConfigCommands  │    │ ConfigViews     │    │ ConfigService   │          │
│  │ /config branding│    │ Modals, Selects │    │ CRUD operations │          │
│  │ /config help    │    │ Buttons         │    │                 │          │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘          │
│           │                      │                      │                    │
│           └──────────────────────┼──────────────────────┘                    │
│                                  │                                           │
└──────────────────────────────────┼───────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
            ┌───────────────┐           ┌───────────────┐
            │ n8n           │           │ API           │
            │ Orchestration │           │ Persistance   │
            └───────────────┘           └───────────────┘
```

---

## Responsabilités

| Composant | Responsabilité |
|-----------|----------------|
| **chatbot-core** | Views, Modals, Commandes `/config`, ConfigService |
| **n8n** | Mapping `guild_id → project_id`, orchestration |
| **API** | Persistance branding et help config, CRUD endpoints |
| **Plugin** | Enregistrer commandes, fournir valeurs par défaut |

---

## Commandes

| Commande | Description | Permission |
|----------|-------------|------------|
| `/config branding` | Configurer l'identité visuelle | Administrator |
| `/config help` | Configurer les catégories d'aide | Administrator |

---

## 1. `/config branding` - Configuration du Branding

### Écran Principal

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙️ Configuration du Branding                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  **Nom du bot**                                                 │
│  Bot Appetit                                                    │
│                                                                 │
│  **Slogan**                                                     │
│  Votre assistant culinaire Discord                              │
│                                                                 │
│  **Emoji**          **Couleur**                                 │
│  🍽️                 #E67E22 (Orange)                            │
│                     ████████                                    │
│                                                                 │
│  **Logo**                                                       │
│  https://example.com/logo.png                                   │
│                                                                 │
│  **Bannière**                                                   │
│  https://example.com/banner.png                                 │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  **Liens**                                                      │
│  🌐 Site web: https://botappetit.fr                             │
│  💬 Support: https://discord.gg/support                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [🏷️ Identité]  [🎨 Apparence]  [🔗 Liens]  [👁️ Preview]        │
└─────────────────────────────────────────────────────────────────┘
```

### Boutons d'action

| Bouton | Action |
|--------|--------|
| 🏷️ Identité | Ouvre modal pour nom, slogan, emoji |
| 🎨 Apparence | Ouvre select couleur + modal logos |
| 🔗 Liens | Ouvre modal pour URLs |
| 👁️ Preview | Affiche un aperçu du /help avec le branding |

---

### Modal: Identité (🏷️)

```
┌─────────────────────────────────────────────────────────────────┐
│  Modifier l'identité                                       [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Nom du bot                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Bot Appetit                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Max 32 caractères                                              │
│                                                                 │
│  Slogan                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Votre assistant culinaire Discord                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Max 100 caractères                                             │
│                                                                 │
│  Emoji principal                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🍽️                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Un seul emoji                                                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                        [Annuler]  [Sauvegarder] │
└─────────────────────────────────────────────────────────────────┘
```

---

### Select Menu: Couleur (🎨)

```
┌─────────────────────────────────────────────────────────────────┐
│  Choisir une couleur                                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🟠 Orange Cuisine (#E67E22)                         [v] │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 🔴 Rouge Tomate (#E74C3C)                               │   │
│  │ 🟠 Orange Cuisine (#E67E22)                        [✓]  │   │
│  │ 🟡 Jaune Citron (#F1C40F)                               │   │
│  │ 🟢 Vert Basilic (#2ECC71)                               │   │
│  │ 🔵 Bleu Ocean (#3498DB)                                 │   │
│  │ 🟣 Violet Aubergine (#9B59B6)                           │   │
│  │ ⬛ Noir Truffe (#2C3E50)                                │   │
│  │ ⚪ Personnalisé...                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

Si "Personnalisé" sélectionné:

```
┌─────────────────────────────────────────────────────────────────┐
│  Couleur personnalisée                                     [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Code hexadécimal                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ #E67E22                                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Format: #RRGGBB (ex: #FF5733)                                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                        [Annuler]  [Appliquer]   │
└─────────────────────────────────────────────────────────────────┘
```

---

### Modal: Logos (après couleur)

```
┌─────────────────────────────────────────────────────────────────┐
│  Configurer les images                                     [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  URL du logo (carré, 256x256 recommandé)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ https://example.com/logo.png                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Laissez vide pour utiliser l'avatar du bot                     │
│                                                                 │
│  URL de la bannière (1200x400 recommandé)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ https://example.com/banner.png                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Affichée dans /help et les embeds principaux                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                        [Annuler]  [Sauvegarder] │
└─────────────────────────────────────────────────────────────────┘
```

---

### Modal: Liens (🔗)

```
┌─────────────────────────────────────────────────────────────────┐
│  Configurer les liens                                      [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Site web                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ https://botappetit.fr                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Lien de support                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ https://discord.gg/support                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Version du bot                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1.0.0                                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                        [Annuler]  [Sauvegarder] │
└─────────────────────────────────────────────────────────────────┘
```

---

### Preview (👁️)

```
┌─────────────────────────────────────────────────────────────────┐
│  [BANNER IMAGE]                                                 │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
├─────────────────────────────────────────────────────────────────┤
│  🍽️ Bot Appetit                                          [IMG] │
│  Votre assistant culinaire Discord                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  **🔍 Découverte**                                              │
│  `/recette` `/suggestion` `/ingredients`                        │
│                                                                 │
│  **💾 Mes Recettes**                                            │
│  `/sauvegarder` `/mes-recettes` `/favoris`                      │
│                                                                 │
│  **🛒 Liste de courses**                                        │
│  `/liste show` `/liste add` `/liste clear`                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Bot Appetit v1.0.0 | botappetit.fr                             │
├─────────────────────────────────────────────────────────────────┤
│                    [✅ Looks good!]  [🔙 Retour]                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. `/config help` - Configuration de l'Aide

### Écran Principal - Liste des Catégories

```
┌─────────────────────────────────────────────────────────────────┐
│  📚 Configuration de l'Aide                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  **Catégories d'aide** (5)                                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 1. 🔍 Découverte                             7 commandes  │ │
│  │    Recherche et découverte de nouvelles recettes          │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │ 2. 💾 Mes Recettes                           5 commandes  │ │
│  │    Gestion de vos recettes sauvegardées                   │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │ 3. 🛒 Liste de courses                       5 commandes  │ │
│  │    Gestion de votre liste d'achats                        │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │ 4. ⏱️ Timers                                 3 commandes  │ │
│  │    Minuteries de cuisson avec notifications               │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │ 5. 👤 Compte                                 3 commandes  │ │
│  │    Gestion de votre compte et abonnement                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [➕ Ajouter]     [Sélectionner une catégorie      v]           │
├─────────────────────────────────────────────────────────────────┤
│  [🔄 Reset défaut]                              [👁️ Preview]    │
└─────────────────────────────────────────────────────────────────┘
```

### Modal: Ajouter/Modifier une Catégorie

```
┌─────────────────────────────────────────────────────────────────┐
│  Modifier la catégorie                                     [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Nom de la catégorie                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Découverte                                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Max 25 caractères                                              │
│                                                                 │
│  Emoji                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔍                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Un seul emoji                                                  │
│                                                                 │
│  Description                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Recherche et découverte de nouvelles recettes            │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Max 100 caractères                                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                        [Annuler]  [Sauvegarder] │
└─────────────────────────────────────────────────────────────────┘
```

### Modal: Ajouter/Modifier une Commande

```
┌─────────────────────────────────────────────────────────────────┐
│  Ajouter une commande                                      [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Nom de la commande                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ /recette                                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Commencer par / (ex: /macommande)                              │
│                                                                 │
│  Description                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Rechercher une recette par nom                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Courte description de la commande                              │
│                                                                 │
│  Usage                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ /recette <plat>                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Syntaxe avec paramètres                                        │
│                                                                 │
│  Exemple                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ /recette pizza margherita                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Exemple concret d'utilisation                                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                        [Annuler]  [Sauvegarder] │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Structures de données

### BrandingConfig

```python
@dataclass
class BrandingConfig:
    """Configuration du branding."""

    # Identité
    name: str                          # Nom du bot (max 32)
    tagline: str | None = None         # Slogan (max 100)
    emoji: str | None = None           # Emoji principal

    # Apparence
    primary_color: str = "#10B981"     # Couleur hex
    logo_url: str | None = None        # URL logo (256x256)
    banner_url: str | None = None      # URL bannière (1200x400)

    # Liens
    website_url: str | None = None
    support_url: str | None = None
    version: str | None = None
```

### HelpCategory

```python
@dataclass
class HelpCommand:
    """Commande dans une catégorie d'aide."""

    name: str              # /recette
    description: str       # Rechercher une recette
    usage: str | None = None      # /recette <plat>
    example: str | None = None    # /recette pizza

@dataclass
class HelpCategory:
    """Catégorie d'aide."""

    id: str                # UUID
    name: str              # Découverte (max 25)
    emoji: str             # 🔍
    description: str       # Description (max 100)
    commands: list[HelpCommand]
    order: int = 0         # Ordre d'affichage
```

### HelpConfig

```python
@dataclass
class HelpConfig:
    """Configuration complète de l'aide."""

    guild_id: str
    categories: list[HelpCategory]
    updated_at: datetime | None = None
```

---

## 4. Limites

| Élément | Limite | Raison |
|---------|--------|--------|
| Nom bot | 32 caractères | Discord limit |
| Slogan | 100 caractères | UI lisibilité |
| Emoji | 1 caractère | Simplicité |
| Catégories | 10 max | Select menu limit |
| Commandes/catégorie | 25 max | Select menu limit |
| URL logo/banner | Validé | Sécurité |

---

## 5. Validation URLs

```python
ALLOWED_IMAGE_DOMAINS = [
    "cdn.discordapp.com",
    "media.discordapp.net",
    "i.imgur.com",
    "images.unsplash.com",
    # + domaines configurés par projet
]

ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"]

def validate_image_url(url: str) -> bool:
    """Valider une URL d'image."""
    parsed = urlparse(url)

    # HTTPS obligatoire
    if parsed.scheme != "https":
        return False

    # Domaine autorisé
    if parsed.netloc not in ALLOWED_IMAGE_DOMAINS:
        return False

    # Extension autorisée
    if not any(parsed.path.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
        return False

    return True
```

---

## 6. Persistance (API)

### Endpoints requis

#### Branding

```http
# Récupérer le branding
GET /api/config/branding
Headers: X-Project-ID: bot-appetit
Query: guild_id=123456789

Response:
{
  "success": true,
  "data": {
    "name": "Bot Appetit",
    "tagline": "Votre assistant culinaire",
    "emoji": "🍽️",
    "primary_color": "#E67E22",
    "logo_url": "https://...",
    "banner_url": "https://...",
    "website_url": "https://botappetit.fr",
    "support_url": "https://discord.gg/...",
    "version": "1.0.0"
  }
}
```

```http
# Mettre à jour le branding
PUT /api/config/branding
Headers: X-Project-ID: bot-appetit
Content-Type: application/json

{
  "guild_id": "123456789",
  "name": "Bot Appetit",
  "tagline": "Votre assistant culinaire",
  "emoji": "🍽️",
  "primary_color": "#E67E22"
}

Response:
{
  "success": true,
  "message": "Branding updated"
}
```

#### Help Config

```http
# Récupérer la config help
GET /api/config/help
Headers: X-Project-ID: bot-appetit
Query: guild_id=123456789

Response:
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "uuid-1",
        "name": "Découverte",
        "emoji": "🔍",
        "description": "Recherche de recettes",
        "order": 0,
        "commands": [
          {
            "name": "/recette",
            "description": "Rechercher une recette",
            "usage": "/recette <plat>",
            "example": "/recette pizza"
          }
        ]
      }
    ]
  }
}
```

```http
# Mettre à jour la config help
PUT /api/config/help
Headers: X-Project-ID: bot-appetit
Content-Type: application/json

{
  "guild_id": "123456789",
  "categories": [...]
}
```

```http
# Reset aux valeurs par défaut
POST /api/config/help/reset
Headers: X-Project-ID: bot-appetit

{
  "guild_id": "123456789"
}
```

---

## 7. Flow n8n

### Mapping guild_id → project_id

Comme pour RFC-007, n8n maintient le mapping.

```
chatbot-core                        n8n                           API
     │                               │                             │
     │ PUT /webhook/config/branding  │                             │
     │ { guild_id, name, color... } ─┼────────────────────────────►│
     │                               │                             │
     │                               │  Mapping: guild_id →        │
     │                               │           project_id        │
     │                               │                             │
     │                               │  PUT /api/config/branding   │
     │                               │  { project_id, ... } ───────►
     │                               │                             │
     │◄──────────────────────────────┼─────────────────────────────┤
     │        { success: true }      │                             │
```

---

## 8. Responsabilités par équipe

### chatbot-core (Framework)

| Composant | Description |
|-----------|-------------|
| `ConfigCommands` | Slash commands `/config branding`, `/config help` |
| `BrandingConfigView` | View avec boutons Identité, Apparence, Liens, Preview |
| `HelpConfigView` | View avec liste catégories, boutons CRUD |
| `BrandingModals` | Modals pour identité, couleur, logos, liens |
| `HelpModals` | Modals pour catégorie, commande |
| `ConfigService` | Client HTTP vers n8n pour persist |
| `BrandingConfig` | Dataclass configuration branding |
| `HelpConfig` | Dataclass configuration help |

### n8n (Orchestration)

| Workflow | Description |
|----------|-------------|
| `CONFIG---On-Branding-Update` | Recevoir update branding, mapper, persist API |
| `CONFIG---On-Help-Update` | Recevoir update help, mapper, persist API |
| `CONFIG---Get-Branding` | Récupérer branding depuis API |
| `CONFIG---Get-Help` | Récupérer help config depuis API |

### API (Backend)

| Endpoint | Description |
|----------|-------------|
| `GET /api/config/branding` | Récupérer branding par project_id + guild_id |
| `PUT /api/config/branding` | Mettre à jour branding |
| `GET /api/config/help` | Récupérer help config |
| `PUT /api/config/help` | Mettre à jour help config |
| `POST /api/config/help/reset` | Reset help aux défauts |

### Plugin (Implémentation)

| Tâche | Description |
|-------|-------------|
| Enregistrer commandes | `setup_config_commands(bot, config)` |
| Valeurs par défaut | Fournir `HelpConfig` par défaut du plugin |
| Domaines autorisés | Liste domaines images autorisés |

---

## 9. Tables API

### Table `guild_branding`

```sql
CREATE TABLE guild_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(50) NOT NULL,
    guild_id VARCHAR(50) NOT NULL,

    -- Identité
    name VARCHAR(32) NOT NULL,
    tagline VARCHAR(100),
    emoji VARCHAR(10),

    -- Apparence
    primary_color VARCHAR(7) DEFAULT '#10B981',
    logo_url TEXT,
    banner_url TEXT,

    -- Liens
    website_url TEXT,
    support_url TEXT,
    version VARCHAR(20),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT uix_guild_branding UNIQUE(project_id, guild_id)
);
```

### Table `guild_help_config`

```sql
CREATE TABLE guild_help_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(50) NOT NULL,
    guild_id VARCHAR(50) NOT NULL,

    -- Config JSON
    categories JSONB NOT NULL DEFAULT '[]',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT uix_guild_help UNIQUE(project_id, guild_id)
);

-- Index pour queries
CREATE INDEX idx_help_config_lookup ON guild_help_config(project_id, guild_id);
```

---

## 10. Effort estimé

Toutes les équipes travaillent en parallèle. Voir §13 pour les checklists détaillées.

| Équipe | Effort total | Priorité |
|--------|--------------|----------|
| **API** | M | P0 |
| **n8n** | S (~2h) | P0 |
| **chatbot-core** | L | P0 |
| **Plugin** | S | P1 (après intégration) |

**Légende:** S = Small (< 2h), M = Medium (2-4h), L = Large (> 4h)

---

## 11. Exports proposés (chatbot-core)

```python
# chatbot_core/services/__init__.py
from chatbot_core.services.config import (
    ConfigService,
    BrandingConfig,
    HelpConfig,
    HelpCategory,
    HelpCommand,
)

# chatbot_core/discord_ui/config/__init__.py
from chatbot_core.discord_ui.config import (
    BrandingConfigView,
    HelpConfigView,
    setup_config_commands,
)
```

---

## 12. Usage Plugin

```python
from chatbot_core.services import ConfigService, BrandingConfig, HelpConfig
from chatbot_core.discord_ui.config import setup_config_commands

# Service de configuration
config_service = ConfigService(
    n8n_branding_url=os.getenv("N8N_CONFIG_BRANDING_URL"),
    n8n_help_url=os.getenv("N8N_CONFIG_HELP_URL"),
)

# Valeurs par défaut pour ce plugin
default_help = HelpConfig(
    guild_id="",  # Sera rempli dynamiquement
    categories=[
        HelpCategory(
            id="discovery",
            name="Découverte",
            emoji="🔍",
            description="Recherche de recettes",
            commands=[
                HelpCommand(
                    name="/recette",
                    description="Rechercher une recette",
                    usage="/recette <plat>",
                    example="/recette pizza",
                ),
            ],
        ),
    ],
)

# Enregistrer les commandes
setup_config_commands(
    bot=bot,
    config_service=config_service,
    default_help=default_help,
    allowed_image_domains=["cdn.discordapp.com", "i.imgur.com"],
)
```

---

## 13. Plan de travail par équipe

Toutes les équipes travaillent **en parallèle**.

---

### Équipe API

#### Migration `guild_branding` (existante)

```sql
-- Ajouter colonnes manquantes à guild_branding (RFC-003)
ALTER TABLE guild_branding
    ADD COLUMN IF NOT EXISTS tagline VARCHAR(100),
    ADD COLUMN IF NOT EXISTS emoji VARCHAR(10),
    ADD COLUMN IF NOT EXISTS banner_url TEXT,
    ADD COLUMN IF NOT EXISTS website_url TEXT,
    ADD COLUMN IF NOT EXISTS version VARCHAR(20);

-- Renommer discord_invite_url → support_url
ALTER TABLE guild_branding
    RENAME COLUMN discord_invite_url TO support_url;
```

#### Nouvelle table `guild_help_config`

```sql
CREATE TABLE guild_help_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(50) NOT NULL,
    guild_id VARCHAR(50) NOT NULL,
    categories JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uix_guild_help UNIQUE(project_id, guild_id)
);

CREATE INDEX idx_help_config_lookup ON guild_help_config(project_id, guild_id);
```

#### Checklist API

- [ ] Migration table `guild_branding` (ajout colonnes)
- [ ] Création table `guild_help_config`
- [ ] Models Pydantic (`BrandingConfigRequest`, `HelpConfigRequest`)
- [ ] Router `/api/config`
- [ ] `GET /api/config/branding` (query: guild_id, header: X-Project-ID)
- [ ] `PUT /api/config/branding`
- [ ] `GET /api/config/help`
- [ ] `PUT /api/config/help`
- [ ] `POST /api/config/help/reset`
- [ ] Validation URLs images (domaines whitelist)
- [ ] Tests unitaires

---

### Équipe n8n

#### Workflows à créer

| Workflow | Méthode | Path | Description |
|----------|---------|------|-------------|
| `CONFIG---On-Branding-Update` | PUT | `/webhook/config/branding` | Recevoir update, mapper guild→project, persist API |
| `CONFIG---Get-Branding` | GET | `/webhook/config/branding` | Récupérer branding via API |
| `CONFIG---On-Help-Update` | PUT | `/webhook/config/help` | Recevoir update help, persist API |
| `CONFIG---Get-Help` | GET | `/webhook/config/help` | Récupérer help config via API |
| `CONFIG---Help-Reset` | POST | `/webhook/config/help/reset` | Reset aux valeurs par défaut |

#### Pattern workflow (exemple Branding Update)

```
Webhook Trigger (PUT /webhook/config/branding)
    │
    ▼
Validate Input (guild_id requis)
    │
    ▼
Get Project Mapping (GET /api/branding/guild/{guild_id})
    │
    ▼
PUT API (/api/config/branding avec X-Project-ID)
    │
    ▼
Respond Success
```

#### Checklist n8n

- [ ] `CONFIG---On-Branding-Update`
- [ ] `CONFIG---Get-Branding`
- [ ] `CONFIG---On-Help-Update`
- [ ] `CONFIG---Get-Help`
- [ ] `CONFIG---Help-Reset`
- [ ] Tests avec Postman/curl

**Effort estimé:** ~2h (patterns identiques RFC-007)

---

### Équipe chatbot-core (Framework)

#### Composants à créer

| Composant | Description | Effort |
|-----------|-------------|--------|
| `BrandingConfig` | Dataclass configuration branding | S |
| `HelpConfig`, `HelpCategory`, `HelpCommand` | Dataclasses configuration aide | S |
| `ConfigService` | Client HTTP vers webhooks n8n | M |
| `BrandingConfigView` | View principale avec boutons | M |
| `BrandingIdentityModal` | Modal nom, slogan, emoji | S |
| `BrandingColorSelect` | Select menu couleurs | S |
| `BrandingCustomColorModal` | Modal couleur personnalisée | S |
| `BrandingLogosModal` | Modal URLs logo/banner | S |
| `BrandingLinksModal` | Modal URLs site/support | S |
| `BrandingPreviewView` | Aperçu du /help avec branding | S |
| `HelpConfigView` | Liste des catégories | M |
| `HelpCategoryDetailView` | Détail d'une catégorie | M |
| `HelpCategoryModal` | Modal ajout/edit catégorie | S |
| `HelpCommandModal` | Modal ajout/edit commande | S |
| `HelpCategorySelect` | Select menu catégories | S |
| `/config branding` | Slash command | S |
| `/config help` | Slash command | S |
| `setup_config_commands()` | Helper d'enregistrement pour plugins | S |

#### Checklist chatbot-core

- [ ] Dataclasses (`BrandingConfig`, `HelpConfig`, `HelpCategory`, `HelpCommand`)
- [ ] `ConfigService` (client HTTP n8n)
- [ ] Views Branding (principal, preview)
- [ ] Modals Branding (identité, couleur, logos, liens)
- [ ] Select couleur + modal custom
- [ ] Views Help (liste, détail)
- [ ] Modals Help (catégorie, commande)
- [ ] Slash commands `/config branding`, `/config help`
- [ ] `setup_config_commands()` helper
- [ ] Exports dans `__init__.py`
- [ ] Tests unitaires
- [ ] Documentation guide

---

### Équipe Plugin (Bot Appetit, Torah Bot, etc.)

#### Configuration requise

```python
from chatbot_core.services import ConfigService, HelpConfig, HelpCategory, HelpCommand
from chatbot_core.discord_ui.config import setup_config_commands

# 1. Créer le service de configuration
config_service = ConfigService(
    n8n_branding_url=os.getenv("N8N_CONFIG_BRANDING_URL"),
    n8n_help_url=os.getenv("N8N_CONFIG_HELP_URL"),
)

# 2. Définir les valeurs par défaut du plugin
default_help = HelpConfig(
    guild_id="",  # Rempli dynamiquement
    categories=[
        HelpCategory(
            id="discovery",
            name="Découverte",
            emoji="🔍",
            description="Recherche de recettes",
            commands=[
                HelpCommand(
                    name="/recette",
                    description="Rechercher une recette",
                    usage="/recette <plat>",
                    example="/recette pizza",
                ),
            ],
        ),
        # ... autres catégories
    ],
)

# 3. Enregistrer les commandes /config
setup_config_commands(
    bot=bot,
    config_service=config_service,
    default_help=default_help,
    allowed_image_domains=["cdn.discordapp.com", "i.imgur.com"],
)
```

#### Variables d'environnement

```bash
# .env du plugin
N8N_CONFIG_BRANDING_URL=https://n8n.example.com/webhook/config/branding
N8N_CONFIG_HELP_URL=https://n8n.example.com/webhook/config/help
```

#### Checklist Plugin

- [ ] Ajouter variables d'environnement n8n
- [ ] Créer `ConfigService` avec URLs
- [ ] Définir `default_help` avec catégories du plugin
- [ ] Appeler `setup_config_commands()` au démarrage
- [ ] Définir domaines images autorisés si besoin
- [ ] Tests des commandes `/config branding` et `/config help`

---

## 14. Références

- [RFC-003: Branding Multi-tenant](./RFC-003-BRANDING.md) - Branding existant
- [RFC-007: Mention Service](./RFC-007-MENTION-SERVICE.md) - Pattern n8n similaire
- [RFC-008b: Réponse API](./RFC-008b-RESPONSE-API-ADMIN-CONFIG.md) - Décisions API
- [RFC-008b: Réponse n8n](./RFC-008b-REPONSE-N8N-ADMIN-CONFIG.md) - Décisions n8n
- [Guide Mention Service](../guides/GUIDE-MENTION-SERVICE.md) - Pattern guide
