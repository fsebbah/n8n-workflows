# RFC-003: Checkout Branding Multi-Tenant

**Date:** 2026-01-14
**Status:** En attente validation
**Équipes concernées:** API, Framework, Plugin Recipes, n8n

---

## Résumé

Implémentation d'un système de branding personnalisable pour les pages de checkout Stripe, permettant à chaque serveur Discord de personnaliser l'apparence des pages de confirmation/annulation de paiement.

---

## Contexte

Actuellement, les URLs de redirection Stripe (success/cancel) doivent être configurées manuellement par chaque plugin. Cette approche pose plusieurs problèmes:
- Configuration dupliquée
- Pas de personnalisation par serveur Discord
- Incohérence avec le pattern des abonnements (URLs en dur dans n8n)

---

## Architecture proposée

### Vue d'ensemble

```
Discord (Admin)          Plugin              API                 Redis              n8n
      │                    │                  │                    │                 │
      │  /config branding  │                  │                    │                 │
      ├───────────────────►│                  │                    │                 │
      │                    │  POST /branding  │                    │                 │
      │                    ├─────────────────►│                    │                 │
      │                    │                  │  INSERT/UPDATE     │                 │
      │                    │                  │  guild_branding    │                 │
      │                    │                  │        │           │                 │
      │                    │                  │        │  Cache    │                 │
      │                    │                  │        ├──────────►│                 │
      │                    │                  │        │           │                 │
      │                    │◄─────────────────│        │           │                 │
      │◄───────────────────│  OK              │        │           │                 │
      │                    │                  │        │           │                 │
      │        [Checkout]  │                  │        │           │                 │
      │                    │                  │        │           │  GET branding   │
      │                    │                  │        │◄──────────┤                 │
      │                    │                  │        ├──────────►│                 │
      │                    │                  │        │           │  Page HTML      │
      │                    │                  │        │           │  personnalisée  │
```

### Hiérarchie de configuration

```
project:{project_id}              ← Défaut (équipe technique)
    │
    └── guild:{guild_id}          ← Override (admin serveur Discord)
```

### Flow de résolution du branding

```
n8n reçoit requête avec project_id + guild_id
    │
    ▼
Redis GET project:{project_id}:guild:{guild_id}:branding
    │
    ├── Existe? → Utiliser branding personnalisé
    │
    └── N'existe pas? → Redis GET project:{project_id}:branding
                            → Utiliser branding par défaut
```

---

## Structure des données

### Structure Redis

```
# Config par défaut du projet (équipe technique)
project:{project_id}
├── stripe_key          # Clé Stripe du projet
├── branding
│   ├── name            # "Bot Appetit"
│   ├── logo_url        # "https://cdn.bot-appetit.fr/logo.png"
│   ├── primary_color   # "#10B981"
│   └── discord_url     # "https://discord.gg/xxx"
└── urls
    ├── checkout_success  # "/webhook/cart-checkout-success"
    └── checkout_cancel   # "/webhook/cart-checkout-cancel"

# Override par serveur Discord (admin)
project:{project_id}:guild:{guild_id}:branding
├── name
├── logo_url
├── primary_color
└── discord_url
```

### Table SQL `guild_branding`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | PK |
| `project_id` | VARCHAR(50) | FK vers projects |
| `guild_id` | VARCHAR(50) | ID serveur Discord |
| `name` | VARCHAR(100) | Nom affiché |
| `logo_url` | VARCHAR(500) | URL du logo |
| `primary_color` | VARCHAR(7) | Couleur hex (#10B981) |
| `discord_invite_url` | VARCHAR(200) | Lien d'invitation |
| `created_at` | TIMESTAMP | Date création |
| `updated_at` | TIMESTAMP | Date modification |

**Index unique:** `(project_id, guild_id)`

---

## Endpoints API requis

### 1. GET /api/branding/{project_id}

Récupère le branding par défaut du projet.

**Response:**
```json
{
  "success": true,
  "branding": {
    "name": "Bot Appetit",
    "logo_url": "https://cdn.bot-appetit.fr/logo.png",
    "primary_color": "#10B981",
    "discord_url": "https://discord.gg/xxx"
  }
}
```

### 2. GET /api/branding/{project_id}/guild/{guild_id}

Récupère le branding d'un serveur (avec fallback sur défaut projet).

**Response:**
```json
{
  "success": true,
  "branding": {
    "name": "Ma Boutique",
    "logo_url": "https://example.com/logo.png",
    "primary_color": "#FF5733",
    "discord_url": "https://discord.gg/yyy"
  },
  "is_custom": true
}
```

### 3. PUT /api/branding/{project_id}/guild/{guild_id}

Met à jour le branding d'un serveur (admin only).

**Request:**
```json
{
  "name": "Ma Boutique",
  "logo_url": "https://example.com/logo.png",
  "primary_color": "#FF5733",
  "discord_invite_url": "https://discord.gg/yyy"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Branding mis à jour"
}
```

### 4. DELETE /api/branding/{project_id}/guild/{guild_id}

Réinitialise le branding d'un serveur (retour au défaut projet).

**Response:**
```json
{
  "success": true,
  "message": "Branding réinitialisé"
}
```

### 5. POST /api/checkout/confirm (existant - à modifier)

Ajouter le retour du branding dans la réponse.

**Request:**
```json
{
  "session_id": "cs_live_xxx"
}
```

**Response (mise à jour):**
```json
{
  "success": true,
  "order": {
    "discord_user_id": "123456789",
    "order_number": "ORD-20250114-ABC123",
    "total_display": "8,36 EUR",
    "item_count": 3,
    "guild_id": "987654321"
  },
  "branding": {
    "name": "Bot Appetit",
    "logo_url": "https://cdn.bot-appetit.fr/logo.png",
    "primary_color": "#10B981",
    "discord_url": "https://discord.gg/xxx"
  }
}
```

---

## Workflows n8n à modifier

### 1. SHOPPING---Cart-Checkout

**Modifications:**
- Lire config projet depuis Redis (`project:{project_id}`)
- Utiliser URLs par défaut si non fournies
- Passer `guild_id` dans metadata Stripe

### 2. SHOPPING---Cart-Checkout-Success

**Modifications:**
- Appeler `/api/checkout/confirm` qui retourne branding
- Générer page HTML avec branding dynamique (logo, couleur, nom)
- Envoyer DM Discord avec branding

### 3. SHOPPING---Cart-Checkout-Cancel

**Modifications:**
- Lire branding depuis Redis/API
- Générer page HTML avec branding dynamique

---

## Commande Discord `/config branding`

### Affichage initial

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ Configuration du bot                                    │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  **Serveur:** Mon Serveur Discord                           │
│                                                             │
│  🎨 **Branding actuel**                                     │
│  Nom: Bot Appetit                                           │
│  Logo: https://cdn.bot-appetit.fr/logo.png                  │
│  Couleur: #10B981                                           │
│  Lien Discord: https://discord.gg/xxx                       │
│                                                             │
│  [✏️ Modifier] [🔄 Réinitialiser] [❌ Fermer]               │
└─────────────────────────────────────────────────────────────┘
```

### Modal de modification

```
┌─────────────────────────────────────────────────────────────┐
│  ✏️ Personnaliser le branding                         [X]   │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Nom affiché                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Bot Appetit                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  URL du logo                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ https://cdn.bot-appetit.fr/logo.png                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Couleur principale (hex)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ #10B981                                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Lien d'invitation Discord                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ https://discord.gg/xxx                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                    [✓ Enregistrer]          │
└─────────────────────────────────────────────────────────────┘
```

---

## Répartition du travail

### Équipe API

| Tâche | Priorité | Description |
|-------|----------|-------------|
| Table `guild_branding` | P0 | Créer table + migration |
| Cache Redis branding | P0 | Sync DB → Redis sur update |
| `GET /api/branding/{project_id}` | P0 | Branding défaut projet |
| `GET /api/branding/{project_id}/guild/{guild_id}` | P0 | Branding avec fallback |
| `PUT /api/branding/{project_id}/guild/{guild_id}` | P0 | Sauvegarder branding |
| `DELETE /api/branding/{project_id}/guild/{guild_id}` | P1 | Reset branding |
| Modifier `/api/checkout/confirm` | P0 | Retourner branding + guild_id |

### Équipe Framework (Chatbot Core)

| Tâche | Priorité | Description |
|-------|----------|-------------|
| `BrandingService` | P1 | Client API pour branding (optionnel) |
| Passer `guild_id` au checkout | P0 | Inclure guild_id dans les requêtes cart |

### Équipe Plugin Recipes

| Tâche | Priorité | Description |
|-------|----------|-------------|
| Commande `/config branding` | P1 | UI Discord pour modifier branding |
| Supprimer config URLs | P2 | Retirer `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL` |

### Équipe n8n

| Tâche | Priorité | Description |
|-------|----------|-------------|
| Modifier `Cart-Checkout` | P0 | Lire URLs depuis Redis, passer guild_id |
| Modifier `Cart-Checkout-Success` | P0 | Page HTML avec branding dynamique |
| Modifier `Cart-Checkout-Cancel` | P0 | Page HTML avec branding dynamique |

---

## Ordre d'implémentation

```
Phase 1 - API (prérequis)
├── Table guild_branding
├── Endpoints branding CRUD
├── Cache Redis
└── Modifier /api/checkout/confirm

Phase 2 - Framework + n8n (parallèle)
├── Framework: passer guild_id dans requêtes
└── n8n: workflows avec branding dynamique

Phase 3 - Plugin (après Phase 1)
└── Commande /config branding
```

---

## Décisions techniques

| Question | Décision |
|----------|----------|
| **Validation logo_url** | Format URL valide uniquement (pas de check image) |
| **Taille logo** | Pas de contrainte côté API, CSS `max-width: 120px` côté HTML |
| **Format couleur** | Hex uniquement: `/^#[0-9A-Fa-f]{6}$/` |
| **Droits admin** | Rôle `Administrator` ou permission `Manage Server` |

## Source du guild_id

Le `guild_id` est passé par le plugin lors de la création du checkout:

```
Plugin → n8n (POST /cart-checkout)
    Body: { discord_user_id, guild_id }
              ↓
n8n → Stripe (Create session)
    metadata: { guild_id, project_id }
              ↓
Stripe → n8n (Redirect /checkout-success?session_id=xxx)
              ↓
n8n → API (POST /api/checkout/confirm)
    → API récupère metadata depuis Stripe session
    → Retourne guild_id + branding résolu
```

---

## Annexes

### Exemple page HTML checkout-success avec branding

```html
<div class="card">
  <img src="${branding.logo_url}" alt="${branding.name}" style="max-width: 120px;">
  <h1 style="color: ${branding.primary_color}">Paiement confirmé !</h1>
  <p>Merci pour votre commande sur <strong>${branding.name}</strong>.</p>
  <div class="order-info">
    <div class="order-row">
      <span>Commande</span>
      <span>${order.order_number}</span>
    </div>
    <div class="order-row">
      <span>Total</span>
      <span>${order.total_display}</span>
    </div>
  </div>
  <a href="${branding.discord_url}" class="btn" style="background: ${branding.primary_color}">
    Retourner sur Discord
  </a>
</div>
```

---

**Document généré le 2026-01-14 par l'équipe n8n**
