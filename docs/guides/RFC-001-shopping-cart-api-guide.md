# Guide API - RFC-001 Shopping Cart Service

> Documentation technique pour l'equipe API - Integration n8n + Stripe

## Vue d'ensemble

Ce guide decrit les endpoints API necessaires pour implementer le `ShoppingCartService` du framework chatbot-core, avec integration Stripe pour le paiement.

---

## Architecture

```
Discord Bot                n8n Workflows              API Backend
    |                           |                          |
    |--- /panier voir --------->|                          |
    |                           |--- GET /cart ----------->|
    |                           |<-- cart items -----------|
    |<-- affichage panier ------|                          |
    |                           |                          |
    |--- /panier payer -------->|                          |
    |                           |--- POST /cart/checkout ->|
    |                           |                          |--- Stripe API
    |                           |<-- checkout_url ---------|
    |<-- lien Stripe -----------|                          |
```

---

## Decisions techniques

### Stockage panier
- **Redis** avec TTL de **7 jours**
- Cle : `cart:{user_id}`
- Fallback : PostgreSQL pour persistance longue duree

### Devise
- Un panier = une devise unique
- Conversion EUR/USD a voir plus tard
- Stripe gere le multi-devise au checkout

### Quantites
- Entieres uniquement (pas de fractions)
- `quantity: int` (min: 1, max: 99)

### Promotions/Coupons
- Geres par **Stripe** (Coupons + Promotion Codes)
- Backend applique les regles d'eligibilite

### Historique commandes
- Stocke en **base de donnees PostgreSQL**
- A definir avec l'equipe API

---

## Modeles de donnees

### CartItem

```python
@dataclass
class CartItem:
    id: str                    # UUID unique de l'item dans le panier
    product_id: str            # ID produit (Stripe price_id ou DB id)
    name: str                  # Nom affiche
    description: str | None    # Description courte (max 100 chars)
    quantity: int              # Quantite (1-99)
    unit_price: int            # Prix unitaire en centimes
    currency: str              # EUR, USD (defaut: EUR)
    image_url: str | None      # URL image miniature
    category: str | None       # Categorie pour groupement
    metadata: dict             # Donnees supplementaires
    checked: bool              # Pour liste de courses (coche = achete)
    added_at: datetime         # Date d'ajout
```

### Product (pour Product Discovery)

```python
@dataclass
class Product:
    id: str                    # UUID
    name: str                  # Nom du produit
    description: str | None    # Description
    price_cents: int           # Prix en centimes
    currency: str              # EUR, USD
    url: str | None            # URL d'achat externe
    image_url: str | None      # Image produit
    brand: str | None          # Marque
    seller: str | None         # Vendeur/site
    category: str              # ingredient | ustensile | autre
    source: str                # web_search | manual | stripe
    source_query: str | None   # Requete originale (pour cache)
    created_at: datetime
    updated_at: datetime
```

---

## Endpoints requis

### 1. Panier (Cart)

#### GET /cart/{user_id}

Recupere le panier d'un utilisateur.

**Response:**
```json
{
  "user_id": "discord_123",
  "items": [
    {
      "id": "item-uuid-1",
      "product_id": "price_xxx",
      "name": "Farine de ble 1kg",
      "description": "Farine T55",
      "quantity": 2,
      "unit_price": 189,
      "currency": "EUR",
      "image_url": "https://...",
      "category": "ingredient",
      "checked": false,
      "added_at": "2026-01-14T10:00:00Z"
    }
  ],
  "total_cents": 378,
  "currency": "EUR",
  "item_count": 1,
  "updated_at": "2026-01-14T10:00:00Z"
}
```

#### POST /cart/{user_id}/add

Ajoute un ou plusieurs items au panier.

**Request:**
```json
{
  "items": [
    {
      "product_id": "price_xxx",
      "quantity": 1
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "items_added": 1,
  "cart_total": 378
}
```

#### POST /cart/{user_id}/update

Met a jour la quantite d'un item.

**Request:**
```json
{
  "item_id": "item-uuid-1",
  "quantity": 3
}
```

#### POST /cart/{user_id}/remove

Supprime un ou plusieurs items.

**Request:**
```json
{
  "item_ids": ["item-uuid-1", "item-uuid-2"]
}
```

#### POST /cart/{user_id}/clear

Vide le panier (tout ou seulement les coches).

**Request:**
```json
{
  "only_checked": false
}
```

#### POST /cart/{user_id}/checkout

Cree une session Stripe Checkout.

**Request:**
```json
{
  "success_url": "https://discord.com/channels/...",
  "cancel_url": "https://discord.com/channels/...",
  "promotion_code": "PROMO10"
}
```

**Response:**
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
  "session_id": "cs_xxx",
  "expires_at": "2026-01-14T11:00:00Z"
}
```

---

### 2. Produits (Products)

#### GET /products

Liste les produits disponibles.

**Query params:**
- `category`: ingredient | ustensile
- `query`: recherche texte
- `limit`: max resultats (defaut: 20)
- `offset`: pagination

**Response:**
```json
{
  "items": [...],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

#### GET /products/{product_id}

Details d'un produit.

#### POST /products/search

Recherche produits en base (pour cache Product Discovery).

**Request:**
```json
{
  "query": "farine",
  "category": "ingredient",
  "limit": 10
}
```

**Response:**
```json
{
  "products": [...],
  "count": 3,
  "cached": true
}
```

#### POST /products/bulk-create

Cree plusieurs produits (apres web search).

**Request:**
```json
{
  "products": [
    {
      "name": "Farine de ble T55 1kg",
      "description": "Farine blanche pour patisserie",
      "price_cents": 189,
      "currency": "EUR",
      "url": "https://...",
      "image_url": "https://...",
      "brand": "Francine",
      "seller": "Carrefour",
      "category": "ingredient"
    }
  ],
  "source": "web_search",
  "original_query": "farine"
}
```

---

### 3. Webhooks Stripe

#### POST /webhooks/stripe

Recoit les evenements Stripe.

**Evenements a gerer:**
- `checkout.session.completed` → Vider le panier, enregistrer commande
- `payment_intent.succeeded` → Confirmer paiement
- `payment_intent.payment_failed` → Notifier echec

---

## Product Discovery - Regles de raisonnement LLM

### IMPORTANT : Ne pas sur-specifier

Le LLM ne doit **PAS** modifier l'item_name fourni par l'utilisateur.

**Exemple INCORRECT:**
```
Input:  {"item_name": "farine", "context": "Pour faire des crepes"}
Output: {"item_name": "farine de ble T45"}  // NON !
```

**Exemple CORRECT:**
```
Input:  {"item_name": "farine", "context": "Pour faire des crepes"}
Output: {"item_name": "farine"}  // OUI - on garde l'item original
```

### Role du contexte

Le `context` sert a :
1. **Valider** la pertinence de l'item
2. **Filtrer** les resultats de recherche
3. **Prioriser** certains produits (ex: farine T45 avant T150 pour crepes)

Le `context` ne sert **PAS** a :
- Renommer l'item
- Ajouter des specifications non demandees
- Deviner ce que l'utilisateur "voulait vraiment dire"

### Schema de recherche

```
item_name (input)
     |
     v
Recherche en base : "farine"
     |
     +-- Resultats trouves ? --> Retourner tels quels
     |
     +-- Aucun resultat --> Web Search
                               |
                               v
                          Recherche : "farine acheter prix"
                          (pas "farine de ble T45 acheter")
```

---

## Integration Stripe

### Produits dans Stripe

Stripe = **moteur de paiement**, pas catalogue.

| Element | Ou le gerer |
|---------|-------------|
| Nom produit | Stripe (Product) |
| Prix, devise | Stripe (Price) |
| Categories | Backend (DB) |
| Stock | Backend (DB) |
| Images riches | Backend (DB) |
| Panier | Backend (Redis) |

### Multi-devise

- Stripe gere la conversion automatiquement
- Un Price peut avoir plusieurs devises
- Le backend ne calcule pas les taux

### Coupons

```
Coupon Stripe (regle)
     |
     v
Promotion Code (ce que l'utilisateur saisit)
     |
     v
Checkout Session (applique automatiquement)
```

---

## Exemple de flux complet

### 1. Utilisateur demande des ingredients pour crepes

```
Discord: /recette crepes
Bot: Voici la recette ! Voulez-vous ajouter les ingredients au panier ?
```

### 2. Product Discovery

```json
// Requete n8n -> API
POST /products/search
{
  "query": "farine",
  "category": "ingredient",
  "limit": 3
}

// Reponse (si cache existe)
{
  "products": [...],
  "cached": true
}

// Sinon : n8n fait web search, puis :
POST /products/bulk-create
{
  "products": [...],
  "source": "web_search",
  "original_query": "farine"
}
```

### 3. Utilisateur choisit un produit

```json
POST /cart/{user_id}/add
{
  "items": [{"product_id": "prod_xxx", "quantity": 1}]
}
```

### 4. Checkout

```json
POST /cart/{user_id}/checkout
{
  "success_url": "...",
  "cancel_url": "..."
}

// Reponse
{
  "checkout_url": "https://checkout.stripe.com/..."
}
```

### 5. Webhook post-paiement

```json
// Stripe -> API
POST /webhooks/stripe
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "metadata": {"discord_user_id": "123"}
    }
  }
}

// API actions:
// 1. Vider le panier Redis
// 2. Enregistrer la commande en DB
// 3. Notifier le bot Discord
```

---

## Questions ouvertes pour l'equipe API

1. **Schema DB commandes** : Quelle structure pour `orders` table ?
2. **Cache Redis** : Configuration cluster ou standalone ?
3. **Rate limiting** : Limites sur Product Discovery (web search coute cher) ?
4. **Webhook retries** : Gestion des echecs de notification Discord ?

---

## Changelog

| Date | Version | Description |
|------|---------|-------------|
| 2026-01-14 | 0.1 | Draft initial |
