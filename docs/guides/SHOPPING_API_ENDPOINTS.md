# Shopping Cart API - Endpoints Reference

Documentation complète des endpoints de l'API Shopping Cart (RFC-001).

## Table des matières

1. [Products](#1-products)
2. [Cart](#2-cart)
3. [Checkout](#3-checkout)
4. [Orders](#4-orders)
5. [Profile](#5-profile)
6. [Addresses](#6-addresses)
7. [Shipping](#7-shipping)

---

## 1. Products

### POST /api/products/search

Recherche des produits dans le cache.

**Request:**
```json
{
  "query": "chaussures running",
  "category": "sports",
  "source": "amazon",
  "limit": 20,
  "offset": 0
}
```

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "id": "uuid",
      "name": "Nike Air Max",
      "description": "Chaussures de running confortables",
      "short_description": "Running shoes",
      "price_cents": 12999,
      "currency": "EUR",
      "category": "sports",
      "subcategory": "running",
      "tags": ["nike", "running", "sport"],
      "image_url": "https://...",
      "thumbnail_url": "https://...",
      "brand": "Nike",
      "seller": "Amazon",
      "seller_url": "https://amazon.fr/...",
      "source": "amazon",
      "source_query": "chaussures running",
      "is_available": true,
      "stock_status": "in_stock",
      "price_display": "129.99 EUR",
      "created_at": "2025-01-14T10:00:00Z",
      "updated_at": "2025-01-14T10:00:00Z"
    }
  ],
  "total": 42,
  "cached": true
}
```

---

### POST /api/products/bulk-create

Création en masse de produits (Product Discovery via n8n).

**Headers:**
- `X-Project-ID`: Project identifier

**Request:**
```json
{
  "products": [
    {
      "name": "Nike Air Max",
      "description": "Description complète du produit",
      "short_description": "Description courte",
      "price_cents": 12999,
      "currency": "EUR",
      "category": "sports",
      "subcategory": "running",
      "tags": ["nike", "running"],
      "image_url": "https://...",
      "thumbnail_url": "https://...",
      "brand": "Nike",
      "seller": "Amazon",
      "seller_url": "https://amazon.fr/...",
      "source": "amazon",
      "source_query": "chaussures running",
      "source_metadata": {},
      "reasoning_data": {},
      "stripe_product_id": null,
      "stripe_price_id": null,
      "external_id": "ASIN123",
      "sku": "NIKE-AM-001"
    }
  ],
  "discovery_context": "Recherche de chaussures de sport",
  "discord_user_id": "123456789"
}
```

**Response:**
```json
{
  "success": true,
  "created": 1,
  "products": [
    {
      "id": "uuid",
      "name": "Nike Air Max",
      "...": "..."
    }
  ]
}
```

---

### GET /api/products/{product_id}

Récupère un produit par son ID.

**Response:**
```json
{
  "id": "uuid",
  "name": "Nike Air Max",
  "description": "...",
  "price_cents": 12999,
  "currency": "EUR",
  "...": "..."
}
```

---

### GET /api/products

Liste les produits avec filtres.

**Query Parameters:**
- `category` (optional): Filtrer par catégorie
- `source` (optional): Filtrer par source
- `limit` (default: 20, max: 100): Nombre de résultats
- `offset` (default: 0): Pagination

**Response:**
```json
{
  "success": true,
  "products": [...],
  "total": 100,
  "cached": true
}
```

---

## 2. Cart

### GET /api/cart/{user_id}

Récupère le panier d'un utilisateur (crée un panier vide si inexistant).

**Response:**
```json
{
  "id": "uuid",
  "discord_user_id": "123456789",
  "currency": "EUR",
  "items": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "product_snapshot": {
        "name": "Nike Air Max",
        "description": "...",
        "price_cents": 12999,
        "currency": "EUR",
        "image_url": "https://...",
        "brand": "Nike",
        "seller": "Amazon",
        "category": "sports",
        "sku": "NIKE-AM-001"
      },
      "quantity": 2,
      "unit_price_cents": 12999,
      "total_cents": 25998,
      "currency": "EUR",
      "is_checked": false,
      "added_at": "2025-01-14T10:00:00Z"
    }
  ],
  "coupon_code": null,
  "subtotal_cents": 25998,
  "discount_cents": 0,
  "total_cents": 25998,
  "total_display": "259.98 EUR",
  "item_count": 2,
  "status": "active",
  "created_at": "2025-01-14T10:00:00Z",
  "updated_at": "2025-01-14T10:00:00Z"
}
```

---

### POST /api/cart/{user_id}/items

Ajoute des articles au panier.

**Request:**
```json
{
  "items": [
    {
      "product_id": "uuid",
      "product_snapshot": {
        "name": "Nike Air Max",
        "description": "Description",
        "price_cents": 12999,
        "currency": "EUR",
        "image_url": "https://...",
        "brand": "Nike",
        "seller": "Amazon",
        "category": "sports"
      },
      "quantity": 1,
      "metadata": {}
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
    "id": "uuid",
    "...": "..."
  }
}
```

---

### PUT /api/cart/{user_id}/items/{item_id}

Met à jour la quantité d'un article (0 = supprimer).

**Request:**
```json
{
  "quantity": 3
}
```

**Response:** CartResponse

---

### DELETE /api/cart/{user_id}/items/{item_id}

Supprime un article du panier.

**Response:** CartResponse

---

### DELETE /api/cart/{user_id}

Vide le panier.

**Query Parameters:**
- `only_checked` (default: false): Ne supprimer que les articles cochés

**Response:** CartResponse

---

### POST /api/cart/{user_id}/items/{item_id}/toggle

Bascule l'état "coché" d'un article (mode liste de courses).

**Response:** CartResponse

---

### POST /api/cart/{user_id}/coupon

Applique un code promo au panier.

**Request:**
```json
{
  "code": "PROMO20"
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "discount_cents": 2000,
  "message": "Code promo appliqué: -20%"
}
```

---

### DELETE /api/cart/{user_id}/coupon

Retire le code promo du panier.

**Response:** CartResponse

---

## 3. Checkout

### POST /api/checkout/{user_id}

Crée une session Stripe Checkout à partir du panier.

**Headers:**
- `X-Project-ID` (required): Project identifier (pour la clé Stripe)

**Request:**
```json
{
  "success_url": "https://example.com/success?session_id={CHECKOUT_SESSION_ID}",
  "cancel_url": "https://example.com/cancel",
  "promotion_code": "PROMO20"
}
```

**Response:**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
  "session_id": "cs_xxx",
  "order_id": "uuid",
  "order_number": "ORD-20250114-ABC123",
  "amount_total_cents": 25998,
  "currency": "EUR",
  "expires_at": "2025-01-14T11:00:00Z"
}
```

---

### POST /api/checkout/webhook/completed

Webhook appelé par n8n quand le paiement est complété.

**Request (query params):**
- `stripe_session_id`: ID de la session Stripe
- `stripe_payment_intent_id` (optional): ID du payment intent
- `stripe_customer_id` (optional): ID client Stripe

**Response:**
```json
{
  "success": true,
  "order_id": "uuid",
  "order_number": "ORD-20250114-ABC123",
  "status": "confirmed",
  "payment_status": "paid"
}
```

---

### POST /api/checkout/webhook/expired

Webhook appelé par n8n quand la session expire.

**Request (query params):**
- `stripe_session_id`: ID de la session Stripe

**Response:**
```json
{
  "success": true,
  "order_id": "uuid",
  "order_number": "ORD-20250114-ABC123",
  "status": "cancelled"
}
```

---

## 4. Orders

### GET /api/orders/{user_id}

Liste les commandes d'un utilisateur.

**Query Parameters:**
- `limit` (default: 20, max: 100)
- `offset` (default: 0)
- `status` (optional): Filtrer par statut

**Response:**
```json
{
  "success": true,
  "orders": [
    {
      "id": "uuid",
      "order_number": "ORD-20250114-ABC123",
      "status": "confirmed",
      "payment_status": "paid",
      "total_cents": 25998,
      "total_display": "259.98 EUR",
      "currency": "EUR",
      "item_count": 2,
      "created_at": "2025-01-14T10:00:00Z"
    }
  ],
  "total": 5
}
```

---

### GET /api/orders/{user_id}/{order_id}

Détails d'une commande (par UUID ou order_number).

**Response:**
```json
{
  "id": "uuid",
  "order_number": "ORD-20250114-ABC123",
  "discord_user_id": "123456789",
  "status": "confirmed",
  "payment_status": "paid",
  "items": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "product_snapshot": {...},
      "quantity": 2,
      "unit_price_cents": 12999,
      "total_cents": 25998,
      "currency": "EUR"
    }
  ],
  "subtotal_cents": 25998,
  "discount_cents": 0,
  "tax_cents": 0,
  "shipping_cents": 499,
  "total_cents": 26497,
  "total_display": "264.97 EUR",
  "currency": "EUR",
  "promotion_code": null,
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "shipping_address": {
    "line1": "123 Rue Example",
    "city": "Paris",
    "postal_code": "75001",
    "country_code": "FR"
  },
  "paid_at": "2025-01-14T10:05:00Z",
  "created_at": "2025-01-14T10:00:00Z"
}
```

---

### POST /api/orders/{user_id}/{order_id}/cancel

Annule une commande.

**Query Parameters:**
- `reason` (optional): Raison de l'annulation

**Response:**
```json
{
  "success": true,
  "order_id": "uuid",
  "order_number": "ORD-20250114-ABC123",
  "status": "cancelled"
}
```

---

### GET /api/orders/{user_id}/{order_id}/history

Historique des changements de statut d'une commande.

**Response:**
```json
{
  "success": true,
  "order_number": "ORD-20250114-ABC123",
  "history": [
    {
      "from_status": "pending_payment",
      "to_status": "confirmed",
      "reason": "Paiement reçu",
      "performed_by": "system:stripe",
      "created_at": "2025-01-14T10:05:00Z"
    }
  ]
}
```

---

## 5. Profile

### GET /api/profile/{discord_user_id}

Récupère le profil utilisateur (crée si inexistant).

**Response:**
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "uuid",
      "discord_user_id": "123456789",
      "discord_username": "john_doe",
      "discord_avatar_url": "https://cdn.discord.com/...",
      "email": "john@example.com",
      "email_verified": true,
      "phone": "+33612345678",
      "display_name": "John Doe",
      "locale": "fr",
      "timezone": "Europe/Paris",
      "preferences": {
        "newsletter": true,
        "notifications": true
      },
      "stripe_customer_id": "cus_xxx",
      "status": "active",
      "last_seen_at": "2025-01-14T10:00:00Z",
      "created_at": "2025-01-01T10:00:00Z",
      "updated_at": "2025-01-14T10:00:00Z"
    }
  }
}
```

---

### PUT /api/profile/{discord_user_id}

Met à jour le profil utilisateur.

**Request:**
```json
{
  "discord_username": "john_doe",
  "discord_avatar_url": "https://cdn.discord.com/...",
  "email": "john@example.com",
  "phone": "+33612345678",
  "display_name": "John Doe",
  "locale": "fr",
  "timezone": "Europe/Paris",
  "preferences": {
    "newsletter": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "profile": {...}
  }
}
```

---

### POST /api/profile/{discord_user_id}/stripe

Lie un ID client Stripe au profil.

**Query Parameters:**
- `stripe_customer_id`: ID client Stripe

**Response:**
```json
{
  "success": true,
  "data": {
    "profile": {...}
  }
}
```

---

## 6. Addresses

### GET /api/addresses/{discord_user_id}

Liste les adresses de l'utilisateur.

**Query Parameters:**
- `address_type` (optional): "shipping" ou "billing"

**Response:**
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "id": "uuid",
        "address_type": "shipping",
        "is_default": true,
        "label": "Domicile",
        "full_name": "John Doe",
        "company": null,
        "phone": "+33612345678",
        "line1": "123 Rue Example",
        "line2": "Apt 4B",
        "city": "Paris",
        "state": null,
        "postal_code": "75001",
        "country_code": "FR",
        "is_validated": false,
        "created_at": "2025-01-01T10:00:00Z",
        "updated_at": "2025-01-14T10:00:00Z"
      }
    ],
    "count": 1
  }
}
```

---

### POST /api/addresses/{discord_user_id}

Crée une nouvelle adresse.

**Request:**
```json
{
  "full_name": "John Doe",
  "line1": "123 Rue Example",
  "line2": "Apt 4B",
  "city": "Paris",
  "state": null,
  "postal_code": "75001",
  "country_code": "FR",
  "address_type": "shipping",
  "is_default": true,
  "label": "Domicile",
  "company": null,
  "phone": "+33612345678"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": {...}
  }
}
```

---

### GET /api/addresses/{discord_user_id}/default

Récupère l'adresse par défaut.

**Query Parameters:**
- `address_type` (default: "shipping")

**Response:**
```json
{
  "success": true,
  "data": {
    "address": {...}
  }
}
```

---

### GET /api/addresses/{discord_user_id}/{address_id}

Récupère une adresse spécifique.

**Response:**
```json
{
  "success": true,
  "data": {
    "address": {...}
  }
}
```

---

### PUT /api/addresses/{discord_user_id}/{address_id}

Met à jour une adresse.

**Request:**
```json
{
  "full_name": "John Doe Updated",
  "line1": "456 New Street",
  "is_default": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": {...}
  }
}
```

---

### DELETE /api/addresses/{discord_user_id}/{address_id}

Supprime une adresse.

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

### POST /api/addresses/{discord_user_id}/{address_id}/default

Définit une adresse comme défaut.

**Response:**
```json
{
  "success": true,
  "data": {
    "address": {...}
  }
}
```

---

## 7. Shipping

### GET /api/shipping/options

Liste toutes les options de livraison disponibles.

**Response:**
```json
{
  "success": true,
  "data": {
    "options": [
      {
        "id": "standard",
        "name": "Livraison Standard",
        "description": "Livraison en 5-7 jours ouvrés",
        "price_cents": 499,
        "currency": "EUR",
        "estimated_days_min": 5,
        "estimated_days_max": 7,
        "carrier": "La Poste",
        "price_display": "4.99 EUR",
        "estimated_delivery": "5-7 jours"
      },
      {
        "id": "express",
        "name": "Livraison Express",
        "description": "Livraison en 2-3 jours ouvrés",
        "price_cents": 999,
        "currency": "EUR",
        "estimated_days_min": 2,
        "estimated_days_max": 3,
        "carrier": "Chronopost",
        "price_display": "9.99 EUR",
        "estimated_delivery": "2-3 jours"
      },
      {
        "id": "relay",
        "name": "Point Relais",
        "description": "Livraison en point relais sous 3-5 jours",
        "price_cents": 399,
        "currency": "EUR",
        "estimated_days_min": 3,
        "estimated_days_max": 5,
        "carrier": "Mondial Relay",
        "price_display": "3.99 EUR",
        "estimated_delivery": "3-5 jours"
      },
      {
        "id": "free",
        "name": "Livraison Gratuite",
        "description": "Livraison gratuite en 7-10 jours ouvrés",
        "price_cents": 0,
        "currency": "EUR",
        "estimated_days_min": 7,
        "estimated_days_max": 10,
        "carrier": "La Poste",
        "min_order_cents": 5000,
        "price_display": "0.00 EUR",
        "estimated_delivery": "7-10 jours"
      }
    ]
  }
}
```

---

### POST /api/shipping/{discord_user_id}/calculate

Calcule les options de livraison disponibles pour le panier.

**Request:**
```json
{
  "address_id": "uuid",
  "cart_total_cents": 6500
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "options": [
      {
        "id": "free",
        "name": "Livraison Gratuite",
        "price_cents": 0,
        "available": true,
        "price_display": "0.00 EUR",
        "estimated_delivery": "7-10 jours",
        "carrier": "La Poste"
      },
      {
        "id": "relay",
        "name": "Point Relais",
        "price_cents": 399,
        "available": true,
        "price_display": "3.99 EUR",
        "estimated_delivery": "3-5 jours",
        "carrier": "Mondial Relay"
      },
      {
        "id": "standard",
        "name": "Livraison Standard",
        "price_cents": 499,
        "available": true,
        "price_display": "4.99 EUR",
        "estimated_delivery": "5-7 jours",
        "carrier": "La Poste"
      },
      {
        "id": "express",
        "name": "Livraison Express",
        "price_cents": 999,
        "available": true,
        "price_display": "9.99 EUR",
        "estimated_delivery": "2-3 jours",
        "carrier": "Chronopost"
      }
    ],
    "count": 4
  }
}
```

**Note:** Si le panier est < 50€, l'option "free" aura `available: false` avec un message explicatif.

---

### POST /api/shipping/{discord_user_id}/select

Sélectionne une option de livraison.

**Request:**
```json
{
  "shipping_option_id": "express",
  "address_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shipping": {
      "shipping_option": {
        "id": "express",
        "name": "Livraison Express",
        "price_cents": 999,
        "carrier": "Chronopost"
      },
      "shipping_cents": 999,
      "shipping_display": "9.99 EUR",
      "estimated_delivery": "2-3 jours",
      "carrier": "Chronopost",
      "cart_subtotal_cents": 25998,
      "cart_total_with_shipping_cents": 26997,
      "shipping_address": {
        "id": "uuid",
        "full_name": "John Doe",
        "line1": "123 Rue Example",
        "line2": "Apt 4B",
        "city": "Paris",
        "postal_code": "75001",
        "country_code": "FR"
      }
    }
  }
}
```

---

### GET /api/shipping/{discord_user_id}/estimate/{shipping_option_id}

Estime le délai de livraison pour une option.

**Response:**
```json
{
  "success": true,
  "data": {
    "estimate": {
      "option_id": "express",
      "option_name": "Livraison Express",
      "estimated_days_min": 2,
      "estimated_days_max": 3,
      "carrier": "Chronopost"
    }
  }
}
```

---

## Codes d'erreur

| Code | HTTP | Description |
|------|------|-------------|
| `PRODUCT_NOT_FOUND` | 404 | Produit non trouvé |
| `CART_NOT_FOUND` | 404 | Panier non trouvé |
| `CART_EMPTY` | 400 | Panier vide (checkout) |
| `ORDER_NOT_FOUND` | 404 | Commande non trouvée |
| `ORDER_ACCESS_DENIED` | 403 | Accès refusé à la commande |
| `CANNOT_CANCEL` | 400 | Commande non annulable |
| `STRIPE_NOT_CONFIGURED` | 401 | Clé Stripe non configurée |
| `STRIPE_ERROR` | 500 | Erreur Stripe |
| `CHECKOUT_ERROR` | 400 | Erreur lors du checkout |
| `RATE_LIMITED` | 400 | Limite de requêtes dépassée |
| `INVALID_SHIPPING_OPTION` | 400 | Option de livraison invalide |
| `SHIPPING_SELECTION_FAILED` | 400 | Sélection de livraison échouée |

---

## Options de livraison (MVP)

| ID | Nom | Prix | Délai | Transporteur | Condition |
|----|-----|------|-------|--------------|-----------|
| `standard` | Livraison Standard | 4.99€ | 5-7 jours | La Poste | - |
| `express` | Livraison Express | 9.99€ | 2-3 jours | Chronopost | - |
| `relay` | Point Relais | 3.99€ | 3-5 jours | Mondial Relay | - |
| `free` | Livraison Gratuite | 0€ | 7-10 jours | La Poste | Commande ≥ 50€ |

---

## Statuts de commande

| Statut | Description |
|--------|-------------|
| `pending_payment` | En attente de paiement |
| `confirmed` | Paiement confirmé |
| `processing` | En cours de traitement |
| `shipped` | Expédiée |
| `delivered` | Livrée |
| `cancelled` | Annulée |
| `refunded` | Remboursée |

## Statuts de paiement

| Statut | Description |
|--------|-------------|
| `pending` | En attente |
| `paid` | Payé |
| `failed` | Échoué |
| `refunded` | Remboursé |
| `partially_refunded` | Partiellement remboursé |
