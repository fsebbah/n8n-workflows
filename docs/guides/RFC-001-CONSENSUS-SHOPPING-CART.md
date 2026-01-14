# RFC-001: ShoppingCartService - Document de Consensus

**Version:** 2.0
**Date:** 2026-01-14
**Statut:** VALIDÉ - Prêt pour implémentation
**Participants:** Équipe API, Équipe Plugin Recipes, Équipe Framework, Équipe n8n

---

## Table des matières

1. [Objectif](#1-objectif)
2. [Architecture globale](#2-architecture-globale)
3. [Schéma de données](#3-schéma-de-données)
4. [Contrats d'interface](#4-contrats-dinterface) ← **NOUVEAU**
5. [Travail par équipe (parallélisable)](#5-travail-par-équipe-parallélisable) ← **NOUVEAU**
6. [Endpoints n8n](#6-endpoints-n8n)
7. [Services chatbot-core](#7-services-chatbot-core)
8. [Flow utilisateur](#8-flow-utilisateur)
9. [Plan de développement](#9-plan-de-développement)
10. [Décisions techniques](#10-décisions-techniques)
11. [Réponses aux questions](#11-réponses-aux-questions)
12. [Annexes](#12-annexes)
13. [Validation](#13-validation)

---

## 1. Objectif

Implémenter un système de panier d'achat complet permettant aux utilisateurs Discord de :

1. **Découvrir** des produits depuis des ingrédients génériques (ProductDiscovery ✅)
2. **Gérer** un panier d'achat (ajouter, modifier, supprimer)
3. **Payer** via Stripe Checkout
4. **Suivre** leurs commandes

### Cas d'usage principal (Plugin Recipes)

```
/recette crêpes → [🛒 Courses] → Liste ingrédients
                                      ↓
                               [🛍️ Commander]
                                      ↓
                         ProductDiscovery (transformation)
                                      ↓
                         "farine" → "Farine T45 1kg" (1,89€)
                                      ↓
                              CartView (panier)
                                      ↓
                              [💳 Payer 8,36€]
                                      ↓
                            Stripe Checkout
                                      ↓
                         Confirmation commande
```

---

## 2. Architecture globale

```
┌─────────────────────────────────────────────────────────────────────┐
│                           DISCORD                                    │
│                                                                      │
│   Plugin Recipes                    Autres Plugins                   │
│   ┌──────────────┐                 ┌──────────────┐                 │
│   │ /recette     │                 │ /shop        │                 │
│   │ /liste-cours │                 │ /boutique    │                 │
│   └──────┬───────┘                 └──────┬───────┘                 │
│          │                                │                          │
└──────────┼────────────────────────────────┼──────────────────────────┘
           │                                │
           ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        CHATBOT-CORE                                  │
│                                                                      │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│   │ ProductDiscover │  │ ShoppingCart    │  │ Checkout        │    │
│   │ Client ✅       │  │ Service         │  │ Service         │    │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘    │
│            │                    │                    │              │
│   ┌────────┴────────┐  ┌───────┴────────┐  ┌───────┴────────┐     │
│   │ UserProfile     │  │ Order          │  │ Shipping       │     │
│   │ Service         │  │ Service        │  │ Service        │     │
│   └────────┬────────┘  └────────┬───────┘  └────────┬───────┘     │
│            │                    │                    │              │
└────────────┼────────────────────┼────────────────────┼──────────────┘
             │                    │                    │
             ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            N8N                                       │
│                                                                      │
│   product-discovery ✅    cart-*           checkout-*                │
│   products-persist        orders-*         shipping-*                │
│                           profile-*                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
             │                    │                    │
             ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            API                                       │
│                                                                      │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐        │
│   │   Redis     │      │ PostgreSQL  │      │   Stripe    │        │
│   │  (panier)   │      │  (persist)  │      │ (paiement)  │        │
│   └─────────────┘      └─────────────┘      └─────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Schéma de données

### 3.1 Tables PostgreSQL

#### `products` - Cache des produits découverts

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    stripe_price_id VARCHAR(100),
    external_id VARCHAR(255),

    -- Informations produit
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Prix
    price_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',

    -- Catégorisation
    category VARCHAR(50) NOT NULL,  -- ingredient, ustensile

    -- Images
    image_url VARCHAR(500),

    -- Vendeur
    brand VARCHAR(100),
    seller VARCHAR(100),
    seller_url VARCHAR(500),

    -- Source (ProductDiscovery)
    source VARCHAR(50) NOT NULL,  -- web_search, manual, stripe
    source_query VARCHAR(255),

    -- Disponibilité
    is_available BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ  -- Cache expiration
);

CREATE INDEX idx_products_source_query ON products(source_query);
CREATE INDEX idx_products_category ON products(category);
```

#### `carts` - Paniers (fallback PostgreSQL)

```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Propriétaire
    discord_user_id VARCHAR(50) NOT NULL,

    -- État
    status VARCHAR(20) DEFAULT 'active',  -- active, converted, abandoned

    -- Devise
    currency VARCHAR(3) DEFAULT 'EUR',

    -- Totaux
    item_count INTEGER DEFAULT 0,
    subtotal_cents INTEGER DEFAULT 0,

    -- Sync Redis
    redis_synced_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_carts_active_user ON carts(discord_user_id)
    WHERE status = 'active';
```

#### `cart_items` - Items du panier

```sql
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,

    -- Snapshot produit (immutable)
    product_snapshot JSONB NOT NULL,

    -- Quantité
    quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 99),

    -- Prix au moment de l'ajout
    unit_price_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- Audit
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
```

#### `orders` - Commandes finalisées

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Référence
    order_number VARCHAR(20) NOT NULL UNIQUE,

    -- Client
    discord_user_id VARCHAR(50) NOT NULL,

    -- Stripe
    stripe_checkout_session_id VARCHAR(100) UNIQUE,
    stripe_payment_intent_id VARCHAR(100),

    -- Montants
    subtotal_cents INTEGER NOT NULL,
    discount_cents INTEGER DEFAULT 0,
    shipping_cents INTEGER DEFAULT 0,
    total_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- Promotion
    coupon_code VARCHAR(50),

    -- État (simplifié)
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending, paid, completed, cancelled, refunded

    -- Dates
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Notifications
    discord_notified BOOLEAN DEFAULT FALSE,

    -- Contact client
    customer_email VARCHAR(255),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_discord ON orders(discord_user_id);
CREATE INDEX idx_orders_status ON orders(status);
```

#### `order_items` - Items des commandes

```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,

    -- Snapshot figé
    product_snapshot JSONB NOT NULL,

    -- Quantité et prix
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
```

#### `user_addresses` - Adresses de livraison (Phase 3)

```sql
CREATE TABLE user_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    discord_user_id VARCHAR(50) NOT NULL,

    -- Type
    is_default BOOLEAN DEFAULT FALSE,
    label VARCHAR(50),  -- "Domicile", "Bureau"

    -- Identité
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),

    -- Adresse
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country_code VARCHAR(2) DEFAULT 'FR',

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_addresses_user ON user_addresses(discord_user_id);
```

### 3.2 Structure Redis - Panier actif

```
Clé: cart:{discord_user_id}
TTL: 86400 secondes (24h), refresh à chaque modification
```

```json
{
  "id": "cart-uuid-123",
  "discord_user_id": "123456789",
  "currency": "EUR",
  "items": [
    {
      "id": "item-uuid-456",
      "product_id": "prod-uuid-789",
      "product_snapshot": {
        "name": "Farine de blé T45 Francine 1kg",
        "description": "Farine fluide idéale pâtisserie",
        "price_cents": 189,
        "currency": "EUR",
        "image_url": "https://...",
        "brand": "Francine",
        "seller": "Carrefour"
      },
      "quantity": 1,
      "unit_price_cents": 189,
      "added_at": "2026-01-14T10:00:00Z"
    }
  ],
  "coupon": null,
  "subtotal_cents": 189,
  "discount_cents": 0,
  "total_cents": 189,
  "item_count": 1,
  "created_at": "2026-01-14T10:00:00Z",
  "updated_at": "2026-01-14T10:00:00Z"
}
```

### 3.3 Tables NON retenues

| Table proposée API | Raison du rejet |
|--------------------|-----------------|
| `users` | `user_credits` existe déjà, enrichir si besoin |
| `inventory_movements` | Pas de gestion de stock (produits externes) |
| `product_categories` | Enum simple suffit (ingredient, ustensile) |
| `promotions` | Stripe Coupons gère les promotions |
| `checkout_sessions` | Reporter à une phase ultérieure (debug) |
| `order_status_history` | Reporter à une phase ultérieure (audit) |

---

## 4. Contrats d'interface

> **Section critique** - Définit les interfaces entre équipes pour permettre le travail en parallèle.

### 4.1 Authentification n8n → API

| Paramètre | Valeur | Notes |
|-----------|--------|-------|
| **Méthode** | Header `X-Project-ID` | Pas de Bearer token |
| **Raison** | Cohérent avec webhooks existants | n8n sur réseau local |
| **Alternative** | API Key Redis si besoin de sécuriser | À discuter si nécessaire |

```python
# Pattern à suivre (existant dans webhook_account.py)
@router.post("/products/search")
async def search_products(
    request: ProductSearchRequest,
    project_id: str = Header(None, alias="X-Project-ID"),
):
    ...
```

### 4.2 Rate Limiting

| Limite | Valeur | Clé Redis |
|--------|--------|-----------|
| Max produits/requête | **50** | - |
| Max requêtes/min/projet | **10** | `ratelimit:products:bulk:{project_id}` |
| Max requêtes/min/global | **100** | `ratelimit:products:bulk:global` |

### 4.3 Format de réponse standardisé

#### Succès
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-14T10:00:00Z"
  }
}
```

#### Erreur
```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Le produit demandé n'existe pas",
    "http_status": 404,
    "details": {
      "product_id": "xxx"
    }
  }
}
```

### 4.4 Codes d'erreur standardisés

| Code | HTTP | Description | Équipe responsable |
|------|------|-------------|-------------------|
| `PRODUCT_NOT_FOUND` | 404 | Produit inexistant | API |
| `CART_EMPTY` | 400 | Panier vide au checkout | API |
| `CART_NOT_FOUND` | 404 | Panier inexistant | API |
| `INSUFFICIENT_STOCK` | 400 | Stock insuffisant | API |
| `INVALID_QUANTITY` | 400 | Quantité hors limites (1-99) | API |
| `CURRENCY_MISMATCH` | 400 | Devise différente du panier | API |
| `STRIPE_ERROR` | 502 | Erreur API Stripe | n8n |
| `RATE_LIMITED` | 429 | Trop de requêtes | API |
| `DISCOVERY_TIMEOUT` | 504 | Product Discovery timeout | n8n |
| `OPENAI_ERROR` | 502 | Erreur OpenAI | n8n |

### 4.5 Environnement

| Env | URL | Usage |
|-----|-----|-------|
| **Local/Dev** | `http://host3.local` | Développement + Tests |
| **Staging** | À définir | Intégration (si nécessaire) |
| **Production** | À définir | Live |

---

## 5. Travail par équipe (parallélisable)

> **Chaque équipe peut commencer immédiatement** en suivant les contrats définis ci-dessus.

### 5.1 Vue d'ensemble Phase 1

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1 - TRAVAIL PARALLÈLE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   API                    n8n                   Framework        Plugin      │
│   ────                   ───                   ─────────        ──────      │
│                                                                             │
│   ┌─────────────┐       ┌─────────────┐       ┌──────────┐                 │
│   │ Migrations  │       │ product-    │       │ models.  │                 │
│   │ DB tables   │       │ discovery   │       │ py       │                 │
│   │             │       │ (✅ FAIT)   │       │          │                 │
│   └──────┬──────┘       └─────────────┘       └────┬─────┘                 │
│          │                                         │                        │
│   ┌──────▼──────┐       ┌─────────────┐       ┌────▼─────┐                 │
│   │ POST        │◄─────►│ products-   │◄─────►│ Shopping │                 │
│   │ /products/* │       │ persist     │       │ CartSvc  │                 │
│   └──────┬──────┘       └──────┬──────┘       └────┬─────┘                 │
│          │                     │                   │                        │
│   ┌──────▼──────┐       ┌──────▼──────┐       ┌────▼─────┐    ┌─────────┐ │
│   │ GET/POST    │◄─────►│ cart-*      │◄─────►│ N8n      │◄───│ UI      │ │
│   │ /cart/*     │       │ workflows   │       │ Client   │    │ Discord │ │
│   └─────────────┘       └─────────────┘       └──────────┘    └─────────┘ │
│                                                                             │
│   ◄──────────────── CONTRATS D'INTERFACE (Section 4) ──────────────────►   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Équipe API - Tâches Phase 1

| # | Tâche | Dépendance | Livrable |
|---|-------|------------|----------|
| A1 | **Migrations DB** | - | Tables `products`, `carts`, `cart_items` |
| A2 | `POST /products/search` | A1 | Endpoint recherche cache produits |
| A3 | `POST /products/bulk-create` | A1 | Endpoint création batch produits |
| A4 | `GET /cart/{user_id}` | A1 | Endpoint lecture panier Redis |
| A5 | `POST /cart/{user_id}/items` | A1, A4 | Endpoint ajout items |
| A6 | `DELETE /cart/{user_id}/items/{id}` | A4 | Endpoint suppression item |

**Ordre recommandé:** A1 → A2 → A3 → A4 → A5 → A6

**Fichiers à créer/modifier:**
```
api/
├── alembic/versions/
│   └── xxx_add_shopping_cart_tables.py  # Migration
├── models/
│   ├── product.py
│   ├── cart.py
│   └── cart_item.py
├── schemas/
│   ├── product.py
│   └── cart.py
├── routers/
│   ├── products.py
│   └── cart.py
└── services/
    ├── product_service.py
    └── cart_service.py
```

### 5.3 Équipe n8n - Tâches Phase 1

| # | Tâche | Dépendance | Livrable |
|---|-------|------------|----------|
| N1 | ~~Product Discovery~~ | - | ✅ **FAIT** (PR #231) |
| N2 | `products-persist` workflow | - | Workflow persistance produits |
| N3 | `cart-get` workflow | - | Workflow lecture panier |
| N4 | `cart-add` workflow | N3 | Workflow ajout items |
| N5 | `cart-update` workflow | N3 | Workflow modification quantité |
| N6 | `cart-remove` workflow | N3 | Workflow suppression items |
| N7 | `cart-clear` workflow | N3 | Workflow vidage panier |

**Ordre recommandé:** N2 // N3 → N4, N5, N6, N7 (N2 et N3 en parallèle)

**Fichiers à créer:**
```
workflows/
├── SHOPPING---Product-Discovery-WebSearch.json  # ✅ FAIT
├── SHOPPING---Products-Persist.json
├── SHOPPING---Cart-Get.json
├── SHOPPING---Cart-Add.json
├── SHOPPING---Cart-Update.json
├── SHOPPING---Cart-Remove.json
└── SHOPPING---Cart-Clear.json
```

### 5.4 Équipe Framework - Tâches Phase 1

| # | Tâche | Dépendance | Livrable |
|---|-------|------------|----------|
| F1 | `models.py` | - | Dataclasses `Cart`, `CartItem`, etc. |
| F2 | `N8nClient` extension | F1 | Méthodes pour nouveaux endpoints |
| F3 | `ShoppingCartService` | F1, F2 | Service panier complet |
| F4 | `MockCartService` | F3 | Mock pour tests plugins |
| F5 | Tests unitaires | F3, F4 | Couverture services |

**Ordre recommandé:** F1 → F2 → F3 → F4 // F5

**Fichiers à créer:**
```
chatbot_core/
├── services/
│   └── shopping/
│       ├── __init__.py
│       ├── models.py           # F1
│       ├── cart.py             # F3
│       └── exceptions.py
├── clients/
│   └── n8n_client.py           # F2 (extension)
└── testing/
    └── mocks/
        └── cart_mock.py        # F4
```

### 5.5 Équipe Plugin Recipes - Tâches Phase 1

| # | Tâche | Dépendance | Livrable |
|---|-------|------------|----------|
| P1 | Bouton "🛍️ Commander" | F3 | Handler dans RecipeView |
| P2 | `CartView` UI | F3 | Vue panier Discord |
| P3 | Intégration ProductDiscovery | F3 | Appel depuis liste courses |
| P4 | Tests intégration | P1-P3 | Tests E2E |

**Peut commencer après:** F3 (ShoppingCartService disponible)

**Fichiers à modifier:**
```
plugin-recipes/
├── views/
│   ├── recipe_view.py          # P1
│   └── cart_view.py            # P2 (nouveau)
├── services/
│   └── shopping_integration.py # P3
└── tests/
    └── test_shopping.py        # P4
```

### 5.6 Points de synchronisation

```
                    SEMAINE 1                    SEMAINE 2
                    ─────────                    ─────────

API:    [A1─────][A2──][A3──]     [A4─────][A5──][A6]
                       │                   │
                       ▼                   ▼
n8n:    [N1✅][N2─────][N3────]   [N4][N5][N6][N7]
                       │                   │
                       ▼                   ▼
Fwk:    [F1────][F2───][F3─────]  [F4────][F5────]
                              │           │
                              ▼           ▼
Plugin:                       │    [P1][P2][P3][P4]
                              │           │
                              ▼           ▼
                         ┌────────────────────────┐
                         │   SYNC POINT: TEST     │
                         │   INTÉGRATION COMPLET  │
                         └────────────────────────┘
```

### 5.7 Matrice des dépendances inter-équipes

| Producteur | Consommateur | Interface | Bloquant ? |
|------------|--------------|-----------|------------|
| API | n8n | `POST /products/*` | Non (n8n peut mocker) |
| API | n8n | `GET/POST /cart/*` | Non (n8n peut mocker) |
| n8n | Framework | Endpoints webhooks | Non (Framework peut mocker) |
| Framework | Plugin | `ShoppingCartService` | **Oui** |
| n8n | Framework | Product Discovery | Non (✅ déjà fait) |

**Conclusion:** Seul le plugin est bloqué par le Framework. Les autres équipes peuvent travailler en parallèle.

---

## 6. Endpoints n8n

### 6.1 Phase 1: Panier

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `cart-get` | GET | Récupérer le panier utilisateur |
| `cart-add` | POST | Ajouter des produits au panier |
| `cart-update` | POST | Modifier la quantité d'un item |
| `cart-remove` | POST | Supprimer des items |
| `cart-clear` | POST | Vider le panier |
| `products-persist` | POST | Persister les produits découverts en DB |

#### `cart-get`

**Request:**
```
GET /webhook/cart-get?discord_user_id=123456789
Headers: X-Project-ID: plugin-recipes
```

**Response:**
```json
{
  "success": true,
  "cart": {
    "id": "cart-uuid",
    "items": [...],
    "subtotal_cents": 836,
    "discount_cents": 0,
    "total_cents": 836,
    "total_display": "8,36 €",
    "item_count": 4,
    "currency": "EUR",
    "coupon": null
  }
}
```

#### `cart-add`

**Request:**
```json
POST /webhook/cart-add
Headers: X-Project-ID: plugin-recipes

{
  "discord_user_id": "123456789",
  "items": [
    {
      "product_id": "prod-uuid",
      "product_snapshot": {
        "name": "Farine T45 Francine 1kg",
        "price_cents": 189,
        "currency": "EUR",
        "image_url": "...",
        "brand": "Francine",
        "seller": "Carrefour"
      },
      "quantity": 1
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "added_count": 1,
  "cart": {
    "total_cents": 189,
    "item_count": 1
  }
}
```

#### `products-persist`

Persiste les produits découverts par ProductDiscovery en base.

**Request:**
```json
POST /webhook/products-persist
Headers: X-Project-ID: plugin-recipes

{
  "products": [
    {
      "name": "Farine T45 Francine 1kg",
      "description": "Farine fluide",
      "price_cents": 189,
      "currency": "EUR",
      "category": "ingredient",
      "image_url": "...",
      "brand": "Francine",
      "seller": "Carrefour",
      "seller_url": "https://...",
      "source": "web_search",
      "source_query": "farine"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "id": "prod-uuid-generated",
      "name": "Farine T45 Francine 1kg",
      "created": true
    }
  ]
}
```

### 6.2 Phase 2: Checkout + Commandes

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `cart-checkout` | POST | Créer session Stripe Checkout |
| `cart-apply-coupon` | POST | Appliquer un code promo |
| `cart-remove-coupon` | POST | Retirer le code promo |
| `orders-list` | GET | Liste des commandes utilisateur |
| `orders-get` | GET | Détails d'une commande |

#### `cart-checkout`

**Request:**
```json
POST /webhook/cart-checkout

{
  "discord_user_id": "123456789",
  "success_url": "https://discord.com/channels/guild/channel",
  "cancel_url": "https://discord.com/channels/guild/channel",
  "customer_email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "checkout": {
    "url": "https://checkout.stripe.com/c/pay/cs_...",
    "session_id": "cs_live_...",
    "expires_at": "2026-01-14T11:00:00Z"
  },
  "order": {
    "id": "order-uuid",
    "order_number": "CMD-2026-0001",
    "total_cents": 836,
    "total_display": "8,36 €"
  }
}
```

#### `orders-list`

**Request:**
```
GET /webhook/orders-list?discord_user_id=123&limit=10&offset=0
```

**Response:**
```json
{
  "success": true,
  "orders": [
    {
      "id": "order-uuid",
      "order_number": "CMD-2026-0001",
      "status": "paid",
      "total_cents": 836,
      "total_display": "8,36 €",
      "item_count": 4,
      "created_at": "2026-01-14T10:30:00Z"
    }
  ],
  "total_count": 1,
  "has_more": false
}
```

### 6.3 Phase 3: Profil + Livraison

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `profile-get` | GET | Récupérer profil utilisateur |
| `profile-update` | POST | Mettre à jour le profil |
| `profile-address-add` | POST | Ajouter une adresse |
| `profile-address-update` | POST | Modifier une adresse |
| `profile-address-remove` | POST | Supprimer une adresse |
| `profile-address-set-default` | POST | Définir adresse par défaut |
| `shipping-calculate` | POST | Calculer options de livraison |
| `shipping-select` | POST | Sélectionner une option |

---

## 7. Services chatbot-core

### 7.1 Phase 1: Modèles + Cart

#### `chatbot_core/services/shopping/models.py`

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class ProductSnapshot:
    """Snapshot d'un produit (immutable dans le panier)."""
    name: str
    description: str | None
    price_cents: int
    currency: str
    image_url: str | None
    brand: str | None
    seller: str | None

@dataclass
class CartItem:
    """Item dans le panier."""
    id: str
    product_id: str
    product_snapshot: ProductSnapshot
    quantity: int
    unit_price_cents: int
    added_at: str

@dataclass
class Coupon:
    """Coupon appliqué au panier."""
    code: str
    type: str  # percentage, fixed_amount
    value: int
    description: str

@dataclass
class Cart:
    """Panier utilisateur."""
    id: str
    discord_user_id: str
    currency: str
    items: list[CartItem]
    coupon: Coupon | None
    subtotal_cents: int
    discount_cents: int
    total_cents: int
    total_display: str
    item_count: int
    created_at: str
    updated_at: str

@dataclass
class CartAddResult:
    """Résultat d'ajout au panier."""
    success: bool
    added_count: int
    cart_total: int
    item_count: int
    error: str | None = None

@dataclass
class Order:
    """Commande finalisée."""
    id: str
    order_number: str
    discord_user_id: str
    status: str
    items: list[CartItem]
    subtotal_cents: int
    discount_cents: int
    shipping_cents: int
    total_cents: int
    total_display: str
    currency: str
    coupon_code: str | None
    customer_email: str | None
    paid_at: str | None
    created_at: str

@dataclass
class CheckoutSession:
    """Session Stripe Checkout."""
    url: str
    session_id: str
    expires_at: str
    order_id: str
    order_number: str
    total_cents: int
    total_display: str

@dataclass
class CouponResult:
    """Résultat d'application de coupon."""
    success: bool
    coupon: Coupon | None
    discount_cents: int
    new_total_cents: int
    error: str | None = None
```

#### `chatbot_core/services/shopping/cart.py`

```python
class ShoppingCartService:
    """Service de gestion du panier d'achat."""

    def __init__(self, n8n_client: N8nClient):
        self.n8n = n8n_client

    async def get(self, user_id: str) -> Cart:
        """Récupère le panier de l'utilisateur."""
        pass

    async def add(
        self,
        user_id: str,
        products: list[Product],
        quantities: list[int] | None = None,
    ) -> CartAddResult:
        """
        Ajoute des produits au panier.

        Args:
            user_id: ID Discord
            products: Produits à ajouter (depuis ProductDiscovery)
            quantities: Quantités (défaut: 1 pour chaque)
        """
        pass

    async def add_from_discovery(
        self,
        user_id: str,
        discovery_result: ShoppingListResult,
    ) -> CartAddResult:
        """
        Raccourci pour ajouter les résultats de ProductDiscovery.

        Persiste les produits en DB puis les ajoute au panier.
        """
        pass

    async def update_quantity(
        self,
        user_id: str,
        item_id: str,
        quantity: int,
    ) -> Cart:
        """Modifie la quantité d'un item (0 = suppression)."""
        pass

    async def remove(
        self,
        user_id: str,
        item_ids: list[str],
    ) -> Cart:
        """Supprime des items du panier."""
        pass

    async def clear(self, user_id: str) -> bool:
        """Vide le panier."""
        pass

    async def is_empty(self, user_id: str) -> bool:
        """Vérifie si le panier est vide."""
        pass
```

### 7.2 Phase 2: Checkout + Orders

#### `chatbot_core/services/shopping/checkout.py`

```python
class CheckoutService:
    """Service de checkout Stripe."""

    def __init__(self, n8n_client: N8nClient):
        self.n8n = n8n_client

    async def create_session(
        self,
        user_id: str,
        success_url: str,
        cancel_url: str,
        customer_email: str | None = None,
    ) -> CheckoutSession:
        """
        Crée une session Stripe Checkout depuis le panier.

        Returns:
            CheckoutSession avec URL de paiement
        """
        pass

    async def apply_coupon(
        self,
        user_id: str,
        code: str,
    ) -> CouponResult:
        """Applique un code promo au panier."""
        pass

    async def remove_coupon(self, user_id: str) -> bool:
        """Retire le code promo du panier."""
        pass
```

#### `chatbot_core/services/shopping/orders.py`

```python
class OrderService:
    """Service de gestion des commandes."""

    def __init__(self, n8n_client: N8nClient):
        self.n8n = n8n_client

    async def list(
        self,
        user_id: str,
        status: str | None = None,
        limit: int = 10,
        offset: int = 0,
    ) -> tuple[list[Order], int, bool]:
        """
        Liste les commandes d'un utilisateur.

        Returns:
            (orders, total_count, has_more)
        """
        pass

    async def get(
        self,
        user_id: str,
        order_id: str,
    ) -> Order | None:
        """Récupère les détails d'une commande."""
        pass

    async def get_by_number(
        self,
        user_id: str,
        order_number: str,
    ) -> Order | None:
        """Récupère une commande par son numéro."""
        pass
```

### 7.3 Phase 3: Profil + Shipping

#### `chatbot_core/services/shopping/profile.py`

```python
@dataclass
class UserAddress:
    id: str
    label: str | None
    full_name: str
    phone: str | None
    line1: str
    line2: str | None
    city: str
    postal_code: str
    country_code: str
    is_default: bool

@dataclass
class UserProfile:
    discord_user_id: str
    email: str | None
    phone: str | None
    default_address_id: str | None
    addresses: list[UserAddress]

class UserProfileService:
    """Service de gestion du profil utilisateur."""

    async def get(self, user_id: str) -> UserProfile:
        """Récupère le profil utilisateur."""
        pass

    async def update(
        self,
        user_id: str,
        email: str | None = None,
        phone: str | None = None,
    ) -> UserProfile:
        """Met à jour le profil."""
        pass

    async def add_address(
        self,
        user_id: str,
        address: dict,
        set_as_default: bool = False,
    ) -> str:
        """Ajoute une adresse, retourne l'ID."""
        pass

    async def update_address(
        self,
        user_id: str,
        address_id: str,
        address: dict,
    ) -> bool:
        """Met à jour une adresse."""
        pass

    async def remove_address(
        self,
        user_id: str,
        address_id: str,
    ) -> bool:
        """Supprime une adresse."""
        pass

    async def set_default_address(
        self,
        user_id: str,
        address_id: str,
    ) -> bool:
        """Définit l'adresse par défaut."""
        pass
```

#### `chatbot_core/services/shopping/shipping.py`

```python
@dataclass
class ShippingOption:
    id: str
    name: str
    description: str
    price_cents: int
    currency: str
    estimated_days: str
    carrier: str | None

class ShippingService:
    """Service de calcul des frais de livraison."""

    async def calculate(
        self,
        user_id: str,
        address_id: str,
    ) -> list[ShippingOption]:
        """Calcule les options de livraison disponibles."""
        pass

    async def select(
        self,
        user_id: str,
        option_id: str,
        address_id: str,
    ) -> ShippingOption:
        """Sélectionne une option de livraison."""
        pass
```

---

## 8. Flow utilisateur

### 8.1 Flow complet (Plugin Recipes)

```python
# === ÉTAPE 1: Liste de courses → Commander ===

@discord.ui.button(label="🛍️ Commander", style=discord.ButtonStyle.success)
async def on_commander(self, interaction: discord.Interaction, button):
    await interaction.response.defer(thinking=True)
    user_id = str(interaction.user.id)

    # 1. Récupérer la liste de courses
    shopping_items = await self.shopping_list_service.get(user_id)

    # 2. Convertir en DiscoveryItems
    discovery_items = [
        DiscoveryItem(
            item_name=self.parse_item_name(item),  # "250g farine" → "farine"
            category="ingredient"
        )
        for item in shopping_items
    ]

    # 3. Appeler ProductDiscovery
    result = await self.discovery_client.discover(
        items=discovery_items,
        context=f"Pour faire {self.recipe.title}",
        discord_user_id=user_id,
    )

    if not result.success:
        await interaction.followup.send(f"❌ {result.error}", ephemeral=True)
        return

    # 4. Ajouter au panier (persiste produits + ajoute au cart)
    cart_result = await self.cart_service.add_from_discovery(user_id, result)

    if not cart_result.success:
        await interaction.followup.send(f"❌ {cart_result.error}", ephemeral=True)
        return

    # 5. Récupérer le panier complet
    cart = await self.cart_service.get(user_id)

    # 6. Afficher CartView
    embed = self.create_cart_embed(cart)
    view = CartView(cart, self.cart_service, self.checkout_service)
    await interaction.followup.send(embed=embed, view=view)


# === ÉTAPE 2: Panier → Payer ===

@discord.ui.button(label="💳 Payer", style=discord.ButtonStyle.success)
async def on_payer(self, interaction: discord.Interaction, button):
    await interaction.response.defer(ephemeral=True)
    user_id = str(interaction.user.id)

    # 1. Créer session Stripe
    checkout = await self.checkout_service.create_session(
        user_id=user_id,
        success_url=f"https://discord.com/channels/{interaction.guild_id}/{interaction.channel_id}",
        cancel_url=f"https://discord.com/channels/{interaction.guild_id}/{interaction.channel_id}",
        customer_email=None,  # Stripe demandera
    )

    # 2. Afficher bouton de paiement
    view = discord.ui.View()
    view.add_item(discord.ui.Button(
        label=f"Payer {checkout.total_display}",
        emoji="💳",
        url=checkout.url,
        style=discord.ButtonStyle.link,
    ))

    await interaction.followup.send(
        f"🔗 Commande **#{checkout.order_number}** créée!\n"
        f"Cliquez ci-dessous pour finaliser le paiement:",
        view=view,
        ephemeral=True,
    )


# === ÉTAPE 3: Post-paiement (NotificationListener) ===

@notification_listener.on_event("order_completed")
async def handle_order_completed(msg: NotificationMessage):
    """Appelé par n8n après paiement Stripe réussi."""

    user = await bot.fetch_user(int(msg.user_id))

    embed = discord.Embed(
        title="✅ Paiement confirmé!",
        description=f"Merci pour votre commande **#{msg.data['order_number']}**",
        color=discord.Color.green(),
    )
    embed.add_field(name="Montant", value=msg.data['total_display'], inline=True)
    embed.add_field(name="Articles", value=str(msg.data['item_count']), inline=True)

    await user.send(embed=embed)
```

### 8.2 Diagramme de séquence

```
User          Plugin              Framework           n8n              API
 │              │                    │                 │                │
 │─[Commander]─▶│                    │                 │                │
 │              │                    │                 │                │
 │              │──get_list()───────▶│ (Redis plugin)  │                │
 │              │◀─────[items]───────│                 │                │
 │              │                    │                 │                │
 │              │──discover()───────▶│                 │                │
 │              │                    │──product-disc──▶│                │
 │              │                    │                 │──OpenAI───────▶│
 │              │                    │◀───[products]───│                │
 │              │◀──[ShoppingList]───│                 │                │
 │              │                    │                 │                │
 │              │──add_from_disc()──▶│                 │                │
 │              │                    │──prod-persist──▶│                │
 │              │                    │                 │──INSERT prod──▶│
 │              │                    │──cart-add──────▶│                │
 │              │                    │                 │──Redis SET────▶│
 │              │◀────[cart]─────────│                 │                │
 │              │                    │                 │                │
 │◀─[CartView]──│                    │                 │                │
 │              │                    │                 │                │
 │──[Payer]────▶│                    │                 │                │
 │              │──create_session()─▶│                 │                │
 │              │                    │──cart-checkout─▶│                │
 │              │                    │                 │──Stripe API───▶│
 │              │                    │                 │──INSERT order─▶│
 │              │◀──[checkout_url]───│                 │                │
 │              │                    │                 │                │
 │◀─[Link]──────│                    │                 │                │
 │              │                    │                 │                │
 │══[Stripe]═══════════════════════════════════════════════════════════│
 │              │                    │                 │                │
 │              │                    │◀─webhook─────────│◀──Stripe─────│
 │              │                    │  order_completed │                │
 │              │                    │                 │──UPDATE order─▶│
 │              │                    │                 │──Redis DEL────▶│
 │◀─[DM Notif]──│◀───notification────│                 │                │
 │              │                    │                 │                │
```

---

## 9. Plan de développement

### Phase 1: Modèles + Panier (v0.7.0 - v0.7.2)

| Version | Contenu | Équipe | Dépendance |
|---------|---------|--------|------------|
| 0.7.0 | Modèles de données (`models.py`) | Framework | - |
| 0.7.1 | `ShoppingCartService` | Framework | 0.7.0 |
| 0.7.1 | Endpoints `cart-*` | n8n | - |
| 0.7.1 | Tables `carts`, `cart_items` | API | - |
| 0.7.2 | `products-persist` endpoint | n8n + API | - |
| 0.7.2 | Table `products` | API | - |

**Livrable Phase 1:** Plugin peut ajouter des produits au panier et voir le panier.

### Phase 2: Checkout + Commandes (v0.7.3 - v0.7.5)

| Version | Contenu | Équipe | Dépendance |
|---------|---------|--------|------------|
| 0.7.3 | `CheckoutService` | Framework | 0.7.1 |
| 0.7.3 | Endpoint `cart-checkout` | n8n | Stripe |
| 0.7.3 | Table `orders`, `order_items` | API | - |
| 0.7.4 | `OrderService` | Framework | 0.7.3 |
| 0.7.4 | Endpoints `orders-*` | n8n | - |
| 0.7.5 | Coupons (`apply/remove`) | Framework + n8n | Stripe |

**Livrable Phase 2:** Plugin peut payer et voir l'historique des commandes.

### Phase 3: Profil + Livraison (v0.7.6 - v0.7.8)

| Version | Contenu | Équipe | Dépendance |
|---------|---------|--------|------------|
| 0.7.6 | `UserProfileService` | Framework | - |
| 0.7.6 | Endpoints `profile-*` | n8n | - |
| 0.7.6 | Table `user_addresses` | API | - |
| 0.7.7 | `ShippingService` | Framework | 0.7.6 |
| 0.7.7 | Endpoints `shipping-*` | n8n | - |
| 0.7.8 | Vues Discord génériques | Framework | 0.7.1-0.7.7 |

**Livrable Phase 3:** Plugin peut gérer les adresses et la livraison.

### Calendrier suggéré

```
Semaine 1-2: Phase 1 (Panier)
  - Framework: models.py + ShoppingCartService
  - API: Tables products, carts, cart_items + Redis
  - n8n: Workflows cart-*, products-persist

Semaine 3-4: Phase 2 (Checkout)
  - Framework: CheckoutService + OrderService
  - API: Tables orders, order_items + Stripe integration
  - n8n: Workflows cart-checkout, orders-*

Semaine 5-6: Phase 3 (Profil)
  - Framework: UserProfileService + ShippingService
  - API: Table user_addresses
  - n8n: Workflows profile-*, shipping-*
```

---

## 10. Décisions techniques

| # | Sujet | Décision | Justification |
|---|-------|----------|---------------|
| 1 | **TTL Redis panier** | 24h (refresh à chaque modif) | Évite les prix obsolètes |
| 2 | **Table users** | Non - enrichir `user_credits` | Évite migration risquée |
| 3 | **Produits découverts** | Persister en DB | Permet référence FK dans cart |
| 4 | **Livraison MVP** | Phase 3 | Pas critique pour plugin-recipes |
| 5 | **Multi-devise** | EUR uniquement (MVP) | Simplification |
| 6 | **Quantités** | 1-99 entières | Standard e-commerce |
| 7 | **Promotions** | Stripe Coupons uniquement | Pas de duplication |
| 8 | **Statuts commande** | Simplifiés (5) | pending, paid, completed, cancelled, refunded |
| 9 | **Snapshot produit** | JSONB immutable | Prix figé au moment de l'ajout |
| 10 | **Gestion stock** | Non | Produits externes (web search) |

---

## 11. Réponses aux questions

### 11.1 Questions n8n → API (réponses API)

| # | Question | Décision |
|---|----------|----------|
| Q1 | Timeline Phase 1 | A1→A2→A3→A4→A5→A6 (voir section 5.2) |
| Q2 | Auth n8n → API | Header `X-Project-ID` uniquement (pas Bearer) |
| Q3 | Rate limiting | 50 prod/req, 10 req/min/projet (voir section 4.2) |
| Q4 | Environnement test | Local (`host3.local`) |
| Q5 | Format erreurs | `{success, error: {code, message, http_status, details}}` |

### 11.2 ProductDiscoveryClient (Q1-Q5)

| # | Question | Réponse |
|---|----------|---------|
| Q1 | Format items (quantités) | **Plugin parse** - Extraire le nom sans quantité |
| Q2 | Gestion quantités | **n8n adapte** - "3 oeufs" → boîte de 6 |
| Q3 | Cache résultats | **Non** - Prévu phase ultérieure côté n8n |
| Q4 | Timeout/retry | **60s timeout** - Retry côté plugin si besoin |
| Q5 | Coût OpenAI | **~$0.01-0.05/requête** |

### 11.3 ShoppingCartService (Q6-Q9)

| # | Question | Réponse |
|---|----------|---------|
| Q6 | Status RFC-001 | **Phase 1: v0.7.1** |
| Q7 | Format CartItem | **`add_from_discovery()`** fait la conversion |
| Q8 | Webhook post-paiement | **NotificationListener** event `order_completed` |
| Q9 | Erreurs Stripe | **`format_error_for_user()`** existe dans `chatbot_core.services.errors` |

### 11.4 Intégration (Q10-Q11)

| # | Question | Réponse |
|---|----------|---------|
| Q10 | Plugin référence | **plugin-recipes** sera le premier |
| Q11 | MockClient | **À créer** dans `chatbot_core.testing` (Phase 1) |

---

## 12. Annexes

### 12.A Notifications post-paiement

Event Redis Stream pour `NotificationListener`:

```json
{
  "user_id": "123456789",
  "username": "JeanD",
  "email": "user@example.com",
  "guild_id": "guild_123",
  "channel_id": "channel_456",
  "project_id": "plugin-recipes",
  "event": "order_completed",
  "data": {
    "order_id": "order-uuid",
    "order_number": "CMD-2026-0001",
    "total_cents": 836,
    "total_display": "8,36 €",
    "item_count": 4,
    "currency": "EUR"
  },
  "actions": {
    "send_dm": true,
    "send_channel_message": false
  }
}
```

### 12.B Codes d'erreur

| Code | HTTP | Description |
|------|------|-------------|
| `cart_empty` | 400 | Panier vide |
| `cart_not_found` | 404 | Panier non trouvé |
| `product_not_found` | 404 | Produit non trouvé |
| `invalid_quantity` | 400 | Quantité invalide (< 1 ou > 99) |
| `invalid_coupon` | 400 | Code promo invalide |
| `coupon_expired` | 400 | Code promo expiré |
| `checkout_failed` | 500 | Erreur création session Stripe |
| `order_not_found` | 404 | Commande non trouvée |

### 12.C Exports chatbot-core prévus

```python
from chatbot_core import (
    # Phase 1
    ShoppingCartService,
    Cart,
    CartItem,
    CartAddResult,
    ProductSnapshot,

    # Phase 2
    CheckoutService,
    CheckoutSession,
    OrderService,
    Order,
    CouponResult,

    # Phase 3
    UserProfileService,
    UserProfile,
    UserAddress,
    ShippingService,
    ShippingOption,
)
```

---

## 13. Validation

| Équipe | Validé | Date | Commentaires |
|--------|--------|------|--------------|
| Framework | ⬜ | | |
| **API** | ✅ | 2026-01-14 | Auth X-Project-ID, rate limits définis, format erreurs standardisé |
| Plugin Recipes | ⬜ | | |
| **n8n** | ✅ | 2026-01-14 | Product Discovery PR #231 prêt, endpoints alignés |

---

**Document généré le:** 2026-01-14
**Prochaine révision:** Après validation des équipes
