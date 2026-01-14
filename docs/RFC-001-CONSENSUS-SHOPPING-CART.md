# RFC-001: ShoppingCartService - Document de Consensus

**Version:** 2.0
**Date:** 2026-01-14
**Statut:** VALIDE - Pret pour implementation
**Participants:** Equipe API, Equipe Plugin Recipes, Equipe Framework, Equipe n8n

---

## Table des matieres

1. [Objectif](#1-objectif)
2. [Architecture globale](#2-architecture-globale)
3. [Schema de donnees](#3-schema-de-donnees)
4. [Contrats d'interface](#4-contrats-dinterface)
5. [Travail par equipe (parallelisable)](#5-travail-par-equipe-parallelisable)
6. [Endpoints n8n](#6-endpoints-n8n)
7. [Services chatbot-core](#7-services-chatbot-core)
8. [Flow utilisateur](#8-flow-utilisateur)
9. [Plan de developpement](#9-plan-de-developpement)
10. [Decisions techniques](#10-decisions-techniques)
11. [Reponses aux questions](#11-reponses-aux-questions)
12. [Annexes](#12-annexes)
13. [Validation](#13-validation)

---

## 1. Objectif

Implementer un systeme de panier d'achat complet permettant aux utilisateurs Discord de :

1. **Decouvrir** des produits depuis des ingredients generiques (ProductDiscovery)
2. **Gerer** un panier d'achat (ajouter, modifier, supprimer)
3. **Payer** via Stripe Checkout
4. **Suivre** leurs commandes

### Cas d'usage principal (Plugin Recipes)

```
/recette crepes -> [Cart Courses] -> Liste ingredients
                                      |
                               [Commander]
                                      |
                         ProductDiscovery (transformation)
                                      |
                         "farine" -> "Farine T45 1kg" (1,89EUR)
                                      |
                              CartView (panier)
                                      |
                              [Payer 8,36EUR]
                                      |
                            Stripe Checkout
                                      |
                         Confirmation commande
```

---

## 2. Architecture globale

```
+---------------------------------------------------------------------+
|                           DISCORD                                    |
|                                                                      |
|   Plugin Recipes                    Autres Plugins                   |
|   +--------------+                 +--------------+                  |
|   | /recette     |                 | /shop        |                  |
|   | /liste-cours |                 | /boutique    |                  |
|   +------+-------+                 +------+-------+                  |
|          |                                |                          |
+----------+--------------------------------+---------------------------+
           |                                |
           v                                v
+---------------------------------------------------------------------+
|                        CHATBOT-CORE                                  |
|                                                                      |
|   +-----------------+  +-----------------+  +-----------------+      |
|   | ProductDiscover |  | ShoppingCart    |  | Checkout        |      |
|   | Client          |  | Service         |  | Service         |      |
|   +--------+--------+  +--------+--------+  +--------+--------+      |
|            |                    |                    |               |
|   +--------+--------+  +--------+--------+  +--------+--------+      |
|   | UserProfile     |  | Order          |  | Shipping        |      |
|   | Service         |  | Service        |  | Service         |      |
|   +--------+--------+  +--------+--------+  +--------+--------+      |
|            |                    |                    |               |
+------------+--------------------+--------------------+---------------+
             |                    |                    |
             v                    v                    v
+---------------------------------------------------------------------+
|                            N8N                                       |
|                                                                      |
|   product-discovery       cart-*           checkout-*                |
|   products-persist        orders-*         shipping-*                |
|                           profile-*                                  |
|                                                                      |
+---------------------------------------------------------------------+
             |                    |                    |
             v                    v                    v
+---------------------------------------------------------------------+
|                            API                                       |
|                                                                      |
|   +-------------+      +-------------+      +-------------+          |
|   |   Redis     |      | PostgreSQL  |      |   Stripe    |          |
|   |  (panier)   |      |  (persist)  |      | (paiement)  |          |
|   +-------------+      +-------------+      +-------------+          |
|                                                                      |
+---------------------------------------------------------------------+
```

---

## 3. Schema de donnees

### 3.1 Tables PostgreSQL

#### `products` - Cache des produits decouverts

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_price_id VARCHAR(100),
    external_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    category VARCHAR(50) NOT NULL,
    image_url VARCHAR(500),
    brand VARCHAR(100),
    seller VARCHAR(100),
    seller_url VARCHAR(500),
    source VARCHAR(50) NOT NULL,
    source_query VARCHAR(255),
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_products_source_query ON products(source_query);
CREATE INDEX idx_products_category ON products(category);
```

#### `carts` - Paniers (fallback PostgreSQL)

```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    currency VARCHAR(3) DEFAULT 'EUR',
    item_count INTEGER DEFAULT 0,
    subtotal_cents INTEGER DEFAULT 0,
    redis_synced_at TIMESTAMPTZ,
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
    product_snapshot JSONB NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 99),
    unit_price_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
```

#### `orders` - Commandes finalisees

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(20) NOT NULL UNIQUE,
    discord_user_id VARCHAR(50) NOT NULL,
    stripe_checkout_session_id VARCHAR(100) UNIQUE,
    stripe_payment_intent_id VARCHAR(100),
    subtotal_cents INTEGER NOT NULL,
    discount_cents INTEGER DEFAULT 0,
    shipping_cents INTEGER DEFAULT 0,
    total_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,
    coupon_code VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    discord_notified BOOLEAN DEFAULT FALSE,
    customer_email VARCHAR(255),
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
    product_snapshot JSONB NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
```

#### `user_addresses` - Adresses de livraison (Phase 3)

```sql
CREATE TABLE user_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    label VARCHAR(50),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country_code VARCHAR(2) DEFAULT 'FR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_addresses_user ON user_addresses(discord_user_id);
```

### 3.2 Structure Redis - Panier actif

```
Cle: cart:{discord_user_id}
TTL: 86400 secondes (24h), refresh a chaque modification
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
        "name": "Farine de ble T45 Francine 1kg",
        "description": "Farine fluide ideale patisserie",
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

| Table proposee API | Raison du rejet |
|--------------------|-----------------|
| `users` | `user_credits` existe deja, enrichir si besoin |
| `inventory_movements` | Pas de gestion de stock (produits externes) |
| `product_categories` | Enum simple suffit (ingredient, ustensile) |
| `promotions` | Stripe Coupons gere les promotions |
| `checkout_sessions` | Reporter a une phase ulterieure (debug) |
| `order_status_history` | Reporter a une phase ulterieure (audit) |

---

## 4. Contrats d'interface

> **Section critique** - Definit les interfaces entre equipes pour permettre le travail en parallele.

### 4.1 Authentification n8n -> API

| Parametre | Valeur | Notes |
|-----------|--------|-------|
| **Methode** | Header `X-Project-ID` | Pas de Bearer token |
| **Raison** | Coherent avec webhooks existants | n8n sur reseau local |
| **Alternative** | API Key Redis si besoin de securiser | A discuter si necessaire |

```python
# Pattern a suivre (existant dans webhook_account.py)
@router.post("/products/search")
async def search_products(
    request: ProductSearchRequest,
    project_id: str = Header(None, alias="X-Project-ID"),
):
    ...
```

### 4.2 Rate Limiting

| Limite | Valeur | Cle Redis |
|--------|--------|-----------|
| Max produits/requete | **50** | - |
| Max requetes/min/projet | **10** | `ratelimit:products:bulk:{project_id}` |
| Max requetes/min/global | **100** | `ratelimit:products:bulk:global` |

### 4.3 Format de reponse standardise

#### Succes
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
    "message": "Le produit demande n'existe pas",
    "http_status": 404,
    "details": {
      "product_id": "xxx"
    }
  }
}
```

### 4.4 Codes d'erreur standardises

| Code | HTTP | Description | Equipe responsable |
|------|------|-------------|-------------------|
| `PRODUCT_NOT_FOUND` | 404 | Produit inexistant | API |
| `CART_EMPTY` | 400 | Panier vide au checkout | API |
| `CART_NOT_FOUND` | 404 | Panier inexistant | API |
| `INSUFFICIENT_STOCK` | 400 | Stock insuffisant | API |
| `INVALID_QUANTITY` | 400 | Quantite hors limites (1-99) | API |
| `CURRENCY_MISMATCH` | 400 | Devise differente du panier | API |
| `STRIPE_ERROR` | 502 | Erreur API Stripe | n8n |
| `RATE_LIMITED` | 429 | Trop de requetes | API |
| `DISCOVERY_TIMEOUT` | 504 | Product Discovery timeout | n8n |
| `OPENAI_ERROR` | 502 | Erreur OpenAI | n8n |

### 4.5 Environnement

| Env | URL | Usage |
|-----|-----|-------|
| **Local/Dev** | `http://host3.local` | Developpement + Tests |
| **Staging** | A definir | Integration (si necessaire) |
| **Production** | A definir | Live |

---

## 5. Travail par equipe (parallelisable)

> **Chaque equipe peut commencer immediatement** en suivant les contrats definis ci-dessus.

### 5.1 Vue d'ensemble Phase 1

```
+-----------------------------------------------------------------------------+
|                         PHASE 1 - TRAVAIL PARALLELE                         |
+-----------------------------------------------------------------------------+
|                                                                             |
|   API                    n8n                   Framework        Plugin      |
|   ----                   ---                   ---------        ------      |
|                                                                             |
|   +-------------+       +-------------+       +----------+                  |
|   | Migrations  |       | product-    |       | models.  |                  |
|   | DB tables   |       | discovery   |       | py       |                  |
|   |             |       | (FAIT)      |       |          |                  |
|   +------+------+       +-------------+       +----+-----+                  |
|          |                                        |                         |
|   +------v------+       +-------------+       +---v------+                  |
|   | POST        |<----->| products-   |<----->| Shopping |                  |
|   | /products/* |       | persist     |       | CartSvc  |                  |
|   +------+------+       +------+------+       +----+-----+                  |
|          |                     |                   |                         |
|   +------v------+       +------v------+       +----v-----+    +---------+  |
|   | GET/POST    |<----->| cart-*      |<----->| N8n      |<---| UI      |  |
|   | /cart/*     |       | workflows   |       | Client   |    | Discord |  |
|   +-------------+       +-------------+       +----------+    +---------+  |
|                                                                             |
|   <---------------- CONTRATS D'INTERFACE (Section 4) ------------------>   |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### 5.2 Equipe API - Taches Phase 1

| # | Tache | Dependance | Livrable |
|---|-------|------------|----------|
| A1 | **Migrations DB** | - | Tables `products`, `carts`, `cart_items` |
| A2 | `POST /products/search` | A1 | Endpoint recherche cache produits |
| A3 | `POST /products/bulk-create` | A1 | Endpoint creation batch produits |
| A4 | `GET /cart/{user_id}` | A1 | Endpoint lecture panier Redis |
| A5 | `POST /cart/{user_id}/items` | A1, A4 | Endpoint ajout items |
| A6 | `DELETE /cart/{user_id}/items/{id}` | A4 | Endpoint suppression item |

**Ordre recommande:** A1 -> A2 -> A3 -> A4 -> A5 -> A6

**Fichiers a creer/modifier:**
```
api/
+-- alembic/versions/
|   +-- xxx_add_shopping_cart_tables.py  # Migration
+-- models/
|   +-- product.py
|   +-- cart.py
|   +-- cart_item.py
+-- schemas/
|   +-- product.py
|   +-- cart.py
+-- routers/
|   +-- products.py
|   +-- cart.py
+-- services/
    +-- product_service.py
    +-- cart_service.py
```

### 5.3 Equipe n8n - Taches Phase 1

| # | Tache | Dependance | Livrable |
|---|-------|------------|----------|
| N1 | ~~Product Discovery~~ | - | **FAIT** (PR #231) |
| N2 | `products-persist` workflow | - | Workflow persistance produits |
| N3 | `cart-get` workflow | - | Workflow lecture panier |
| N4 | `cart-add` workflow | N3 | Workflow ajout items |
| N5 | `cart-update` workflow | N3 | Workflow modification quantite |
| N6 | `cart-remove` workflow | N3 | Workflow suppression items |
| N7 | `cart-clear` workflow | N3 | Workflow vidage panier |

**Ordre recommande:** N2 // N3 -> N4, N5, N6, N7 (N2 et N3 en parallele)

**Fichiers a creer:**
```
workflows/
+-- SHOPPING---Product-Discovery-WebSearch.json  # FAIT
+-- SHOPPING---Products-Persist.json
+-- SHOPPING---Cart-Get.json
+-- SHOPPING---Cart-Add.json
+-- SHOPPING---Cart-Update.json
+-- SHOPPING---Cart-Remove.json
+-- SHOPPING---Cart-Clear.json
```

### 5.4 Equipe Framework - Taches Phase 1

| # | Tache | Dependance | Livrable |
|---|-------|------------|----------|
| F1 | `models.py` | - | Dataclasses `Cart`, `CartItem`, etc. |
| F2 | `N8nClient` extension | F1 | Methodes pour nouveaux endpoints |
| F3 | `ShoppingCartService` | F1, F2 | Service panier complet |
| F4 | `MockCartService` | F3 | Mock pour tests plugins |
| F5 | Tests unitaires | F3, F4 | Couverture services |

**Ordre recommande:** F1 -> F2 -> F3 -> F4 // F5

**Fichiers a creer:**
```
chatbot_core/
+-- services/
|   +-- shopping/
|       +-- __init__.py
|       +-- models.py           # F1
|       +-- cart.py             # F3
|       +-- exceptions.py
+-- clients/
|   +-- n8n_client.py           # F2 (extension)
+-- testing/
    +-- mocks/
        +-- cart_mock.py        # F4
```

### 5.5 Equipe Plugin Recipes - Taches Phase 1

| # | Tache | Dependance | Livrable |
|---|-------|------------|----------|
| P1 | Bouton "Commander" | F3 | Handler dans RecipeView |
| P2 | `CartView` UI | F3 | Vue panier Discord |
| P3 | Integration ProductDiscovery | F3 | Appel depuis liste courses |
| P4 | Tests integration | P1-P3 | Tests E2E |

**Peut commencer apres:** F3 (ShoppingCartService disponible)

**Fichiers a modifier:**
```
plugin-recipes/
+-- views/
|   +-- recipe_view.py          # P1
|   +-- cart_view.py            # P2 (nouveau)
+-- services/
|   +-- shopping_integration.py # P3
+-- tests/
    +-- test_shopping.py        # P4
```

### 5.6 Points de synchronisation

```
                    SEMAINE 1                    SEMAINE 2
                    ---------                    ---------

API:    [A1-----][A2--][A3--]     [A4-----][A5--][A6]
                       |                   |
                       v                   v
n8n:    [N1 OK][N2-----][N3----]   [N4][N5][N6][N7]
                       |                   |
                       v                   v
Fwk:    [F1----][F2---][F3-----]  [F4----][F5----]
                              |           |
                              v           v
Plugin:                       |    [P1][P2][P3][P4]
                              |           |
                              v           v
                         +------------------------+
                         |   SYNC POINT: TEST     |
                         |   INTEGRATION COMPLET  |
                         +------------------------+
```

### 5.7 Matrice des dependances inter-equipes

| Producteur | Consommateur | Interface | Bloquant ? |
|------------|--------------|-----------|------------|
| API | n8n | `POST /products/*` | Non (n8n peut mocker) |
| API | n8n | `GET/POST /cart/*` | Non (n8n peut mocker) |
| n8n | Framework | Endpoints webhooks | Non (Framework peut mocker) |
| Framework | Plugin | `ShoppingCartService` | **Oui** |
| n8n | Framework | Product Discovery | Non (deja fait) |

**Conclusion:** Seul le plugin est bloque par le Framework. Les autres equipes peuvent travailler en parallele.

---

## 6. Endpoints n8n

### 6.1 Phase 1: Panier

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `cart-get` | GET | Recuperer le panier utilisateur |
| `cart-add` | POST | Ajouter des produits au panier |
| `cart-update` | POST | Modifier la quantite d'un item |
| `cart-remove` | POST | Supprimer des items |
| `cart-clear` | POST | Vider le panier |
| `products-persist` | POST | Persister les produits decouverts en DB |

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
    "total_display": "8,36 EUR",
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

Persiste les produits decouverts par ProductDiscovery en base.

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

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `cart-checkout` | POST | Creer session Stripe Checkout |
| `cart-apply-coupon` | POST | Appliquer un code promo |
| `cart-remove-coupon` | POST | Retirer le code promo |
| `orders-list` | GET | Liste des commandes utilisateur |
| `orders-get` | GET | Details d'une commande |

### 6.3 Phase 3: Profil + Livraison

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `profile-get` | GET | Recuperer profil utilisateur |
| `profile-update` | POST | Mettre a jour le profil |
| `profile-address-add` | POST | Ajouter une adresse |
| `profile-address-update` | POST | Modifier une adresse |
| `profile-address-remove` | POST | Supprimer une adresse |
| `profile-address-set-default` | POST | Definir adresse par defaut |
| `shipping-calculate` | POST | Calculer options de livraison |
| `shipping-select` | POST | Selectionner une option |

---

## 7. Services chatbot-core

### 7.1 Phase 1: Modeles + Cart

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
class Cart:
    """Panier utilisateur."""
    id: str
    discord_user_id: str
    currency: str
    items: list[CartItem]
    coupon: dict | None
    subtotal_cents: int
    discount_cents: int
    total_cents: int
    total_display: str
    item_count: int
    created_at: str
    updated_at: str

@dataclass
class CartAddResult:
    """Resultat d'ajout au panier."""
    success: bool
    added_count: int
    cart_total: int
    item_count: int
    error: str | None = None

@dataclass
class Order:
    """Commande finalisee."""
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
```

#### `chatbot_core/services/shopping/cart.py`

```python
class ShoppingCartService:
    """Service de gestion du panier d'achat."""

    def __init__(self, n8n_client: N8nClient):
        self.n8n = n8n_client

    async def get(self, user_id: str) -> Cart:
        """Recupere le panier de l'utilisateur."""
        pass

    async def add(
        self,
        user_id: str,
        products: list[Product],
        quantities: list[int] | None = None,
    ) -> CartAddResult:
        """Ajoute des produits au panier."""
        pass

    async def add_from_discovery(
        self,
        user_id: str,
        discovery_result: ShoppingListResult,
    ) -> CartAddResult:
        """Raccourci pour ajouter les resultats de ProductDiscovery."""
        pass

    async def update_quantity(
        self,
        user_id: str,
        item_id: str,
        quantity: int,
    ) -> Cart:
        """Modifie la quantite d'un item (0 = suppression)."""
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
        """Verifie si le panier est vide."""
        pass
```

---

## 8. Flow utilisateur

### 8.1 Diagramme de sequence

```
User          Plugin              Framework           n8n              API
 |              |                    |                 |                |
 |-[Commander]->|                    |                 |                |
 |              |                    |                 |                |
 |              |--get_list()------->| (Redis plugin)  |                |
 |              |<-----[items]-------|                 |                |
 |              |                    |                 |                |
 |              |--discover()------->|                 |                |
 |              |                    |--product-disc-->|                |
 |              |                    |                 |--OpenAI------->|
 |              |                    |<---[products]---|                |
 |              |<--[ShoppingList]---|                 |                |
 |              |                    |                 |                |
 |              |--add_from_disc()-->|                 |                |
 |              |                    |--prod-persist-->|                |
 |              |                    |                 |--INSERT prod-->|
 |              |                    |--cart-add------>|                |
 |              |                    |                 |--Redis SET---->|
 |              |<----[cart]---------|                 |                |
 |              |                    |                 |                |
 |<-[CartView]--|                    |                 |                |
 |              |                    |                 |                |
 |--[Payer]--->|                    |                 |                |
 |              |--create_session()-->|                 |                |
 |              |                    |--cart-checkout->|                |
 |              |                    |                 |--Stripe API--->|
 |              |                    |                 |--INSERT order->|
 |              |<--[checkout_url]---|                 |                |
 |              |                    |                 |                |
 |<-[Link]------|                    |                 |                |
 |              |                    |                 |                |
 |==[Stripe]================================================================|
 |              |                    |                 |                |
 |              |                    |<-webhook---------|<--Stripe------|
 |              |                    |  order_completed |                |
 |              |                    |                 |--UPDATE order->|
 |              |                    |                 |--Redis DEL---->|
 |<-[DM Notif]--|<---notification----|                 |                |
 |              |                    |                 |                |
```

---

## 9. Plan de developpement

### Phase 1: Modeles + Panier (v0.7.0 - v0.7.2)

| Version | Contenu | Equipe | Dependance |
|---------|---------|--------|------------|
| 0.7.0 | Modeles de donnees (`models.py`) | Framework | - |
| 0.7.1 | `ShoppingCartService` | Framework | 0.7.0 |
| 0.7.1 | Endpoints `cart-*` | n8n | - |
| 0.7.1 | Tables `carts`, `cart_items` | API | - |
| 0.7.2 | `products-persist` endpoint | n8n + API | - |
| 0.7.2 | Table `products` | API | - |

**Livrable Phase 1:** Plugin peut ajouter des produits au panier et voir le panier.

### Phase 2: Checkout + Commandes (v0.7.3 - v0.7.5)

| Version | Contenu | Equipe | Dependance |
|---------|---------|--------|------------|
| 0.7.3 | `CheckoutService` | Framework | 0.7.1 |
| 0.7.3 | Endpoint `cart-checkout` | n8n | Stripe |
| 0.7.3 | Table `orders`, `order_items` | API | - |
| 0.7.4 | `OrderService` | Framework | 0.7.3 |
| 0.7.4 | Endpoints `orders-*` | n8n | - |
| 0.7.5 | Coupons (`apply/remove`) | Framework + n8n | Stripe |

**Livrable Phase 2:** Plugin peut payer et voir l'historique des commandes.

### Phase 3: Profil + Livraison (v0.7.6 - v0.7.8)

| Version | Contenu | Equipe | Dependance |
|---------|---------|--------|------------|
| 0.7.6 | `UserProfileService` | Framework | - |
| 0.7.6 | Endpoints `profile-*` | n8n | - |
| 0.7.6 | Table `user_addresses` | API | - |
| 0.7.7 | `ShippingService` | Framework | 0.7.6 |
| 0.7.7 | Endpoints `shipping-*` | n8n | - |
| 0.7.8 | Vues Discord generiques | Framework | 0.7.1-0.7.7 |

**Livrable Phase 3:** Plugin peut gerer les adresses et la livraison.

---

## 10. Decisions techniques

| # | Sujet | Decision | Justification |
|---|-------|----------|---------------|
| 1 | **TTL Redis panier** | 24h (refresh a chaque modif) | Evite les prix obsoletes |
| 2 | **Table users** | Non - enrichir `user_credits` | Evite migration risquee |
| 3 | **Produits decouverts** | Persister en DB | Permet reference FK dans cart |
| 4 | **Livraison MVP** | Phase 3 | Pas critique pour plugin-recipes |
| 5 | **Multi-devise** | EUR uniquement (MVP) | Simplification |
| 6 | **Quantites** | 1-99 entieres | Standard e-commerce |
| 7 | **Promotions** | Stripe Coupons uniquement | Pas de duplication |
| 8 | **Statuts commande** | Simplifies (5) | pending, paid, completed, cancelled, refunded |
| 9 | **Snapshot produit** | JSONB immutable | Prix fige au moment de l'ajout |
| 10 | **Gestion stock** | Non | Produits externes (web search) |
| 11 | **Auth n8n->API** | Header X-Project-ID | Coherent avec existant |
| 12 | **Rate limiting** | 50 prod/req, 10 req/min | Protection API |

---

## 11. Reponses aux questions

### 11.1 Questions n8n -> API (reponses API)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Timeline Phase 1 | A1->A2->A3->A4->A5->A6 (voir section 5.2) |
| Q2 | Auth n8n -> API | Header `X-Project-ID` uniquement (pas Bearer) |
| Q3 | Rate limiting | 50 prod/req, 10 req/min/projet (voir section 4.2) |
| Q4 | Environnement test | Local (`host3.local`) |
| Q5 | Format erreurs | `{success, error: {code, message, http_status, details}}` |

### 11.2 ProductDiscoveryClient (Q1-Q5)

| # | Question | Reponse |
|---|----------|---------|
| Q1 | Format items (quantites) | **Plugin parse** - Extraire le nom sans quantite |
| Q2 | Gestion quantites | **n8n adapte** - "3 oeufs" -> boite de 6 |
| Q3 | Cache resultats | **Non** - Prevu phase ulterieure cote n8n |
| Q4 | Timeout/retry | **60s timeout** - Retry cote plugin si besoin |
| Q5 | Cout OpenAI | **~$0.01-0.05/requete** |

### 11.3 ShoppingCartService (Q6-Q9)

| # | Question | Reponse |
|---|----------|---------|
| Q6 | Status RFC-001 | **Phase 1: v0.7.1** |
| Q7 | Format CartItem | **`add_from_discovery()`** fait la conversion |
| Q8 | Webhook post-paiement | **NotificationListener** event `order_completed` |
| Q9 | Erreurs Stripe | **`format_error_for_user()`** existe dans `chatbot_core.services.errors` |

### 11.4 Integration (Q10-Q11)

| # | Question | Reponse |
|---|----------|---------|
| Q10 | Plugin reference | **plugin-recipes** sera le premier |
| Q11 | MockClient | **A creer** dans `chatbot_core.testing` (Phase 1) |

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
    "total_display": "8,36 EUR",
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
| `CART_EMPTY` | 400 | Panier vide |
| `CART_NOT_FOUND` | 404 | Panier non trouve |
| `PRODUCT_NOT_FOUND` | 404 | Produit non trouve |
| `INVALID_QUANTITY` | 400 | Quantite invalide (< 1 ou > 99) |
| `INVALID_COUPON` | 400 | Code promo invalide |
| `COUPON_EXPIRED` | 400 | Code promo expire |
| `CHECKOUT_FAILED` | 500 | Erreur creation session Stripe |
| `ORDER_NOT_FOUND` | 404 | Commande non trouvee |

### 12.C Exports chatbot-core prevus

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

| Equipe | Valide | Date | Commentaires |
|--------|--------|------|--------------|
| Framework | - | | |
| **API** | OK | 2026-01-14 | Auth X-Project-ID, rate limits definis, format erreurs standardise |
| Plugin Recipes | - | | |
| **n8n** | OK | 2026-01-14 | Product Discovery PR #231 pret, endpoints alignes |

---

**Document genere le:** 2026-01-14
**Prochaine revision:** Apres validation des equipes Framework et Plugin
