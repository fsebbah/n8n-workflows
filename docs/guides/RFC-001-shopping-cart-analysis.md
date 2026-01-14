# RFC-001 Shopping Cart - Analyse technique

> Document d'analyse pour l'issue GitHub #216
> Date: 2026-01-14
> Statut: Draft

---

## Table des matières

1. [Contexte](#1-contexte)
2. [État actuel du codebase](#2-état-actuel-du-codebase)
3. [Schéma de base de données proposé](#3-schéma-de-base-de-données-proposé)
4. [Éléments manquants pour un e-commerce simple](#4-éléments-manquants-pour-un-e-commerce-simple)
5. [Recommandations](#5-recommandations)
6. [Annexes](#6-annexes)

---

## 1. Contexte

### 1.1 Objectif du RFC

L'issue #216 décrit l'architecture technique pour implémenter un **Shopping Cart Service** avec :

- Intégration **n8n** pour l'orchestration des workflows
- Intégration **Stripe** pour les paiements
- Utilisation dans un contexte **Discord Bot** (chatbot cuisine)

### 1.2 Architecture cible

```
Discord Bot                n8n Workflows              API Backend
    │                           │                          │
    │─── /panier voir ─────────>│                          │
    │                           │─── GET /cart ───────────>│
    │                           │<── cart items ───────────│
    │<── affichage panier ──────│                          │
    │                           │                          │
    │─── /panier payer ────────>│                          │
    │                           │─── POST /cart/checkout ─>│
    │                           │                          │─── Stripe API
    │                           │<── checkout_url ─────────│
    │<── lien Stripe ───────────│                          │
```

### 1.3 Décisions techniques clés (RFC)

| Aspect | Décision |
|--------|----------|
| Stockage panier | Redis (TTL 7 jours) + PostgreSQL fallback |
| Devise | Une devise unique par panier |
| Quantités | Entières uniquement (1-99) |
| Promotions | Gérées par Stripe (Coupons + Promotion Codes) |
| Historique | PostgreSQL |

---

## 2. État actuel du codebase

### 2.1 Infrastructure existante

| Composant | Statut | Fichiers |
|-----------|--------|----------|
| Shopping List (recettes) | ✅ Existant | `api/routers/recipes/shopping.py` |
| Système de crédits | ✅ Existant | `api/routers/webhook_account.py` |
| Vérification Stripe | ✅ Existant | `api/routers/stripe_webhook.py` |
| Redis | ✅ Configuré | `host3.local:6381` (DB 0 & 2) |
| Multi-tenant | ✅ Supporté | Via `project_id` |

### 2.2 Tables existantes pertinentes

#### user_credits
```sql
-- Clé composée: (project_id, discord_user_id)
- project_id VARCHAR(50)
- discord_user_id VARCHAR(50)
- credits_remaining INTEGER
- credits_total INTEGER
- subscription_status VARCHAR(20)  -- active, canceled, past_due, free
- plan_id VARCHAR(50)
- current_period_end TIMESTAMPTZ
- discord_username VARCHAR(100)    -- Ajouté récemment
- email VARCHAR(255)               -- Ajouté récemment
- created_at, updated_at TIMESTAMPTZ
```

#### shopping_lists / shopping_list_items
```sql
-- Liste de courses pour recettes (pas e-commerce)
shopping_lists:
- id UUID
- discord_user_id VARCHAR(50) UNIQUE
- name VARCHAR(100)

shopping_list_items:
- id UUID
- shopping_list_id UUID (FK)
- name VARCHAR(255)
- quantity FLOAT
- unit VARCHAR(50)
- is_checked BOOLEAN
- recipe_id UUID (FK, nullable)
- category VARCHAR(50)
```

### 2.3 Gap Analysis

| Fonctionnalité RFC | Existant | Action |
|--------------------|----------|--------|
| `GET /cart/{user_id}` | ❌ | À créer |
| `POST /cart/{user_id}/add` | ❌ | À créer |
| `POST /cart/{user_id}/update` | ❌ | À créer |
| `POST /cart/{user_id}/remove` | ❌ | À créer |
| `POST /cart/{user_id}/clear` | 🟡 Partiel | Adapter |
| `POST /cart/{user_id}/checkout` | ❌ | À créer |
| `GET /products` | ❌ | À créer |
| `POST /products/search` | ❌ | À créer |
| `POST /products/bulk-create` | ❌ | À créer |
| Webhook `checkout.session.completed` | 🟡 Partiel | À compléter |
| Table `products` | ❌ | À créer |
| Table `orders` | ❌ | À créer |
| Panier Redis (TTL 7j) | ❌ | À implémenter |

---

## 3. Schéma de base de données proposé

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                        UTILISATEURS                              │
├─────────────────────────────────────────────────────────────────┤
│  users ◄─────────────────┐                                      │
│    │                     │                                      │
│    ├── user_credits ─────┘  (existant, ajouter FK)              │
│    │                                                            │
│    ├── user_addresses                                           │
│    │                                                            │
└────┼────────────────────────────────────────────────────────────┘
     │
┌────┼────────────────────────────────────────────────────────────┐
│    │                    CATALOGUE                                │
├────┼────────────────────────────────────────────────────────────┤
│    │                                                            │
│    │    products ◄──── product_categories                       │
│    │       │                                                    │
└────┼───────┼────────────────────────────────────────────────────┘
     │       │
┌────┼───────┼────────────────────────────────────────────────────┐
│    │       │                PANIER                               │
├────┼───────┼────────────────────────────────────────────────────┤
│    │       │                                                    │
│    └───────┼──► carts ◄──── cart_items ────►│                   │
│            │                                │                   │
│            └────────────────────────────────┘                   │
│                                                                 │
│    Redis: cart:{user_id} (source primaire, TTL 7j)              │
│    PostgreSQL: fallback et persistance                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
     │
┌────┼────────────────────────────────────────────────────────────┐
│    │                   COMMANDES                                 │
├────┼────────────────────────────────────────────────────────────┤
│    │                                                            │
│    └──► orders ◄──── order_items                                │
│            │                                                    │
│            └──── checkout_sessions                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Table `users`

Centralise l'identité utilisateur (actuellement dispersée dans `user_credits`).

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identité Discord
    discord_user_id VARCHAR(50) NOT NULL UNIQUE,
    discord_username VARCHAR(100),
    discord_avatar_url VARCHAR(500),
    discord_discriminator VARCHAR(10),

    -- Contact
    email VARCHAR(255),
    email_verified BOOLEAN DEFAULT FALSE,
    phone VARCHAR(20),

    -- Profil
    display_name VARCHAR(100),
    locale VARCHAR(10) DEFAULT 'fr',
    timezone VARCHAR(50) DEFAULT 'Europe/Paris',

    -- Préférences (extensible)
    preferences JSONB DEFAULT '{}',
    -- Ex: {"currency": "EUR", "notifications": {"email": true, "discord": true}}

    -- Stripe (lien direct)
    stripe_customer_id VARCHAR(100) UNIQUE,

    -- Statut
    status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted
    last_seen_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index
CREATE INDEX idx_users_discord ON users(discord_user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe ON users(stripe_customer_id);
CREATE INDEX idx_users_status ON users(status) WHERE status = 'active';
```

### 3.3 Table `products`

Catalogue de produits pour le Product Discovery.

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification externe
    stripe_product_id VARCHAR(100),
    stripe_price_id VARCHAR(100),
    external_id VARCHAR(255),            -- ID externe (affiliation, etc.)
    sku VARCHAR(100),                    -- Stock Keeping Unit

    -- Informations produit
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,            -- URL-friendly name
    description TEXT,
    short_description VARCHAR(200),

    -- Prix
    price_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    compare_at_price_cents INTEGER,      -- Prix barré (promo)
    cost_cents INTEGER,                  -- Coût d'achat (marge)

    -- Catégorisation
    category VARCHAR(50) NOT NULL,       -- ingredient, ustensile, livre, autre
    subcategory VARCHAR(50),
    tags JSONB DEFAULT '[]',

    -- Images
    image_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    images JSONB DEFAULT '[]',

    -- Informations vendeur
    brand VARCHAR(100),
    seller VARCHAR(100),
    seller_url VARCHAR(500),

    -- Source et cache (Product Discovery)
    source VARCHAR(50) NOT NULL,         -- web_search, manual, stripe, affiliate
    source_query VARCHAR(255),
    source_metadata JSONB DEFAULT '{}',

    -- Disponibilité
    is_available BOOLEAN DEFAULT TRUE,
    is_visible BOOLEAN DEFAULT TRUE,     -- Affiché dans le catalogue
    stock_status VARCHAR(20) DEFAULT 'in_stock',
    stock_quantity INTEGER,

    -- SEO / Recherche
    search_vector TSVECTOR,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ               -- Pour cache temporaire
);

-- Index
CREATE INDEX idx_products_stripe ON products(stripe_product_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_source ON products(source);
CREATE INDEX idx_products_source_query ON products(source_query);
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_visible ON products(is_visible, is_available)
    WHERE is_visible = TRUE AND is_available = TRUE;
```

### 3.4 Table `carts`

Fallback PostgreSQL pour le panier (source primaire = Redis).

```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Propriétaire
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    discord_user_id VARCHAR(50) NOT NULL,

    -- État
    status VARCHAR(20) DEFAULT 'active',
    -- active, merged, converted, abandoned

    -- Devise unique par panier
    currency VARCHAR(3) DEFAULT 'EUR',

    -- Totaux dénormalisés
    item_count INTEGER DEFAULT 0,
    subtotal_cents INTEGER DEFAULT 0,

    -- Métadonnées
    metadata JSONB DEFAULT '{}',

    -- Sync Redis
    redis_synced_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ
);

-- Un seul panier actif par utilisateur
CREATE UNIQUE INDEX idx_carts_active_user ON carts(discord_user_id)
    WHERE status = 'active';
CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_status ON carts(status);
```

### 3.5 Table `cart_items`

```sql
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,

    -- Snapshot produit au moment de l'ajout
    product_snapshot JSONB NOT NULL,

    -- Quantité
    quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 99),

    -- Prix snapshot
    unit_price_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- État liste de courses
    is_checked BOOLEAN DEFAULT FALSE,

    -- Métadonnées
    metadata JSONB DEFAULT '{}',
    -- Ex: {"recipe_id": "...", "added_from": "recipe_suggestion"}

    -- Audit
    added_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product ON cart_items(product_id);
```

### 3.6 Table `orders`

Commandes finalisées après checkout Stripe.

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Référence lisible
    order_number VARCHAR(20) NOT NULL UNIQUE,

    -- Client
    user_id UUID REFERENCES users(id),
    discord_user_id VARCHAR(50) NOT NULL,

    -- Stripe
    stripe_checkout_session_id VARCHAR(100) UNIQUE,
    stripe_payment_intent_id VARCHAR(100),
    stripe_customer_id VARCHAR(100),

    -- Montants
    subtotal_cents INTEGER NOT NULL,
    discount_cents INTEGER DEFAULT 0,
    tax_cents INTEGER DEFAULT 0,
    shipping_cents INTEGER DEFAULT 0,
    total_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- Promotion
    promotion_code VARCHAR(50),
    coupon_id VARCHAR(100),

    -- État
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending, payment_processing, paid, processing, shipped, delivered,
    -- cancelled, refunded

    payment_status VARCHAR(30) DEFAULT 'unpaid',
    -- unpaid, paid, partially_refunded, refunded, failed

    -- Dates clés
    paid_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    -- Notifications
    discord_notified BOOLEAN DEFAULT FALSE,
    discord_notified_at TIMESTAMPTZ,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,

    -- Métadonnées
    metadata JSONB DEFAULT '{}',

    -- Infos client snapshot
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),

    -- Notes
    customer_notes TEXT,
    internal_notes TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_discord ON orders(discord_user_id);
CREATE INDEX idx_orders_stripe_session ON orders(stripe_checkout_session_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
```

### 3.7 Table `order_items`

```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,

    -- Snapshot produit figé
    product_snapshot JSONB NOT NULL,

    -- Quantité et prix
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

### 3.8 Table `checkout_sessions`

Tracking des sessions Stripe (même abandonnées).

```sql
CREATE TABLE checkout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Liens
    cart_id UUID REFERENCES carts(id),
    order_id UUID REFERENCES orders(id),
    user_id UUID REFERENCES users(id),
    discord_user_id VARCHAR(50) NOT NULL,

    -- Stripe
    stripe_session_id VARCHAR(100) NOT NULL UNIQUE,
    stripe_session_url VARCHAR(500),

    -- État
    status VARCHAR(30) NOT NULL DEFAULT 'created',
    -- created, open, complete, expired

    -- Montants
    amount_total_cents INTEGER,
    currency VARCHAR(3),

    -- URLs
    success_url VARCHAR(500),
    cancel_url VARCHAR(500),

    -- Expiration
    expires_at TIMESTAMPTZ NOT NULL,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_checkout_stripe ON checkout_sessions(stripe_session_id);
CREATE INDEX idx_checkout_user ON checkout_sessions(discord_user_id);
CREATE INDEX idx_checkout_status ON checkout_sessions(status);
```

### 3.9 Structure Redis

```javascript
// Clé: cart:{discord_user_id}
// TTL: 604800 secondes (7 jours)

{
  "id": "cart-uuid",
  "currency": "EUR",
  "items": [
    {
      "id": "item-uuid",
      "product_id": "prod-uuid",
      "name": "Farine T55 1kg",
      "description": "Farine blanche",
      "quantity": 2,
      "unit_price_cents": 189,
      "currency": "EUR",
      "image_url": "https://...",
      "category": "ingredient",
      "is_checked": false,
      "metadata": {"recipe_id": "..."},
      "added_at": "2026-01-14T10:00:00Z"
    }
  ],
  "item_count": 1,
  "subtotal_cents": 378,
  "updated_at": "2026-01-14T10:00:00Z"
}
```

---

## 4. Éléments manquants pour un e-commerce simple

### 4.1 Tables additionnelles recommandées

#### 4.1.1 `user_addresses` - Adresses de livraison

```sql
CREATE TABLE user_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Type
    address_type VARCHAR(20) DEFAULT 'shipping', -- shipping, billing
    is_default BOOLEAN DEFAULT FALSE,

    -- Identité
    full_name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    phone VARCHAR(20),

    -- Adresse
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country_code VARCHAR(2) NOT NULL DEFAULT 'FR',

    -- Validation
    is_validated BOOLEAN DEFAULT FALSE,
    validation_source VARCHAR(50),       -- google, manual

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_addresses_user ON user_addresses(user_id);
CREATE UNIQUE INDEX idx_addresses_default ON user_addresses(user_id, address_type)
    WHERE is_default = TRUE;
```

#### 4.1.2 `product_categories` - Catégories hiérarchiques

```sql
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Hiérarchie
    parent_id UUID REFERENCES product_categories(id),

    -- Identification
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,

    -- Affichage
    image_url VARCHAR(500),
    display_order INTEGER DEFAULT 0,
    is_visible BOOLEAN DEFAULT TRUE,

    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_categories_parent ON product_categories(parent_id);
CREATE INDEX idx_categories_slug ON product_categories(slug);
```

#### 4.1.3 `inventory_movements` - Mouvements de stock

```sql
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id UUID NOT NULL REFERENCES products(id),

    -- Mouvement
    movement_type VARCHAR(30) NOT NULL,
    -- sale, return, adjustment, restock, reservation, cancellation

    quantity INTEGER NOT NULL,           -- Positif ou négatif
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,

    -- Référence
    reference_type VARCHAR(30),          -- order, return, manual
    reference_id UUID,                   -- ID de la commande, etc.

    -- Métadonnées
    reason TEXT,
    performed_by VARCHAR(100),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_inventory_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_type ON inventory_movements(movement_type);
CREATE INDEX idx_inventory_created ON inventory_movements(created_at DESC);
```

#### 4.1.4 `promotions` - Règles de promotion locales

```sql
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    code VARCHAR(50) UNIQUE,             -- Code promo (si applicable)
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Stripe (si synchronisé)
    stripe_coupon_id VARCHAR(100),
    stripe_promotion_code_id VARCHAR(100),

    -- Type de réduction
    discount_type VARCHAR(20) NOT NULL,  -- percentage, fixed_amount
    discount_value INTEGER NOT NULL,     -- % ou centimes
    currency VARCHAR(3),                 -- Pour fixed_amount

    -- Conditions
    minimum_amount_cents INTEGER,
    minimum_quantity INTEGER,
    applicable_products JSONB,           -- Liste de product_ids ou null (tous)
    applicable_categories JSONB,         -- Liste de catégories ou null

    -- Limites
    usage_limit INTEGER,                 -- Total uses
    usage_limit_per_user INTEGER,
    current_usage_count INTEGER DEFAULT 0,

    -- Validité
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_promotions_code ON promotions(code);
CREATE INDEX idx_promotions_active ON promotions(is_active, starts_at, expires_at);
```

#### 4.1.5 `order_status_history` - Historique des statuts

```sql
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

    -- Changement
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,

    -- Contexte
    reason TEXT,
    performed_by VARCHAR(100),           -- system, admin, webhook

    -- Métadonnées
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_status_history_order ON order_status_history(order_id);
CREATE INDEX idx_status_history_created ON order_status_history(created_at DESC);
```

### 4.2 Fonctionnalités manquantes

#### 4.2.1 Gestion des stocks

| Fonctionnalité | Priorité | Description |
|----------------|----------|-------------|
| Stock quantity tracking | Haute | Suivre les quantités disponibles |
| Low stock alerts | Moyenne | Notifications quand stock < seuil |
| Stock reservation | Moyenne | Réserver pendant checkout |
| Backorder handling | Basse | Commandes sur produits en rupture |

#### 4.2.2 Gestion des livraisons

| Fonctionnalité | Priorité | Description |
|----------------|----------|-------------|
| Shipping zones | Moyenne | Zones de livraison avec tarifs |
| Shipping methods | Moyenne | Méthodes (standard, express) |
| Tracking numbers | Basse | Numéros de suivi |
| Carrier integration | Basse | API transporteurs |

#### 4.2.3 Gestion des retours

| Fonctionnalité | Priorité | Description |
|----------------|----------|-------------|
| Return requests | Moyenne | Demandes de retour |
| Refund processing | Haute | Traitement remboursements |
| Return reasons | Basse | Motifs de retour |

#### 4.2.4 Analytics & Reporting

| Fonctionnalité | Priorité | Description |
|----------------|----------|-------------|
| Sales reports | Moyenne | Rapports de ventes |
| Abandoned carts | Moyenne | Analyse paniers abandonnés |
| Product performance | Basse | Performance produits |
| Customer insights | Basse | Insights clients |

### 4.3 Endpoints API manquants

#### Produits
```
GET    /products                    Liste avec filtres et pagination
GET    /products/{id}               Détail produit
GET    /products/slug/{slug}        Produit par slug
POST   /products                    Créer (admin)
PUT    /products/{id}               Modifier (admin)
DELETE /products/{id}               Supprimer (admin)
POST   /products/search             Recherche full-text
POST   /products/bulk-create        Création en masse (Product Discovery)
```

#### Panier
```
GET    /cart/{user_id}              Récupérer le panier
POST   /cart/{user_id}/items        Ajouter un/des items
PUT    /cart/{user_id}/items/{id}   Modifier quantité
DELETE /cart/{user_id}/items/{id}   Supprimer un item
DELETE /cart/{user_id}              Vider le panier
POST   /cart/{user_id}/checkout     Créer session Stripe
GET    /cart/{user_id}/summary      Résumé (totaux, promos)
POST   /cart/{user_id}/apply-promo  Appliquer code promo
```

#### Commandes
```
GET    /orders/{user_id}            Liste des commandes utilisateur
GET    /orders/{user_id}/{id}       Détail commande
GET    /orders/by-number/{number}   Commande par numéro
POST   /orders/{id}/cancel          Annuler (si possible)
```

#### Webhooks
```
POST   /webhooks/stripe             Événements Stripe
        - checkout.session.completed
        - checkout.session.expired
        - payment_intent.succeeded
        - payment_intent.payment_failed
        - charge.refunded
```

### 4.4 Services / Logique métier

| Service | Description | Priorité |
|---------|-------------|----------|
| CartService | CRUD panier, sync Redis/PG, calcul totaux | Haute |
| CheckoutService | Création session Stripe, validation panier | Haute |
| OrderService | Création commande, gestion statuts | Haute |
| ProductService | CRUD produits, recherche, cache | Haute |
| InventoryService | Gestion stocks, réservations | Moyenne |
| NotificationService | Discord, email après événements | Moyenne |
| PromotionService | Validation et application promos | Moyenne |
| ProductDiscoveryService | Web search, cache résultats | Basse |

---

## 5. Recommandations

### 5.1 Priorité d'implémentation

#### Phase 1 - MVP (Core)
1. Table `users` + migration `user_credits`
2. Table `products` + endpoints CRUD
3. Tables `carts` / `cart_items` + Redis
4. Endpoints panier complets
5. Table `orders` / `order_items`
6. Endpoint checkout + webhook Stripe

#### Phase 2 - Enrichissement
1. Table `checkout_sessions` (tracking)
2. Table `order_status_history`
3. Recherche full-text produits
4. Notifications Discord post-paiement

#### Phase 3 - Avancé
1. Tables adresses utilisateur
2. Gestion des stocks
3. Système de promotions local
4. Product Discovery (web search)

### 5.2 Points d'attention

1. **Idempotence** : Tous les webhooks Stripe doivent être idempotents (déjà le cas pour `user_credits`)

2. **Snapshots** : Toujours stocker une copie des données produit dans `cart_items` et `order_items` (les prix peuvent changer)

3. **Devise unique** : Un panier = une devise. Bloquer l'ajout de produits en devise différente.

4. **TTL Redis** : 7 jours par défaut, refresh à chaque modification

5. **Rate limiting** : Particulièrement sur Product Discovery (web search coûteux)

### 5.3 Questions ouvertes

| Question | Contexte | Impact |
|----------|----------|--------|
| Fusionner shopping_list et cart ? | Deux systèmes similaires | Architecture |
| Redis cluster ou standalone ? | Configuration infra | Ops |
| Gestion multi-devise ? | EUR/USD | Complexité |
| Notifications webhook retry ? | Échecs Discord | Fiabilité |

---

## 6. Annexes

### 6.1 Diagramme ERD simplifié

```
users
  │
  ├──< user_credits (existant)
  │
  ├──< user_addresses
  │
  ├──< carts ──< cart_items >── products
  │                                │
  │                                ├──< product_categories
  │                                │
  │                                └──< inventory_movements
  │
  └──< orders ──< order_items
          │
          ├──< order_status_history
          │
          └──< checkout_sessions
```

### 6.2 États du panier

```
                    ┌─────────────┐
                    │   active    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌─────────┐  ┌──────────┐  ┌───────────┐
        │ merged  │  │converted │  │ abandoned │
        └─────────┘  └──────────┘  └───────────┘
         (login)     (checkout)    (TTL expire)
```

### 6.3 États de la commande

```
pending ──► payment_processing ──► paid ──► processing ──► shipped ──► delivered
    │              │                 │           │
    │              │                 │           └──► returned
    │              │                 │
    │              ▼                 └──► partially_refunded ──► refunded
    │           failed
    │
    └──► cancelled
```

### 6.4 Flux checkout complet

```
1. Client: POST /cart/{user_id}/checkout
   │
2. API: Valide le panier
   │     - Items disponibles ?
   │     - Stock suffisant ?
   │     - Prix à jour ?
   │
3. API: Crée Order (status=pending)
   │
4. API: Crée Stripe Checkout Session
   │     - line_items depuis cart
   │     - metadata: {order_id, discord_user_id}
   │     - success_url, cancel_url
   │
5. API: Retourne checkout_url
   │
6. Client: Redirige vers Stripe
   │
7. Stripe: checkout.session.completed webhook
   │
8. API: Traite le webhook
   │     - Vérifie signature
   │     - Récupère order_id depuis metadata
   │     - Update Order (status=paid)
   │     - Vide le panier Redis
   │     - Notifie Discord
```

---

## Changelog

| Date | Version | Auteur | Description |
|------|---------|--------|-------------|
| 2026-01-14 | 0.1 | Claude | Analyse initiale |
| 2026-01-14 | 0.2 | Claude | Ajout schéma complet + éléments manquants |
