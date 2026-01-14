# RFC-001: Spécifications n8n - ShoppingCartService

**Version:** 1.0
**Date:** 2026-01-14
**Statut:** Draft pour review équipe n8n

---

## Contexte

Le framework `chatbot-core` va implémenter un système de panier d'achat générique (`ShoppingCartService`) utilisable par plusieurs plugins (recipes, shop, tickets, etc.). Ce document définit les endpoints n8n requis et les formats de données attendus.

**Architecture:**
```
Discord Bot (chatbot-core)
    ↓ HTTP calls
n8n Workflows
    ↓
Stripe / Base de données / Services externes
```

---

## 1. Gestion du Panier

### 1.1 `cart-get` - Récupérer le panier

**Méthode:** `GET`

**Paramètres:**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `discord_user_id` | string | ✅ | ID Discord de l'utilisateur |
| `project_id` | string | ✅ | ID du projet (header X-Project-ID) |

**Réponse attendue:**
```json
{
  "success": true,
  "cart": {
    "items": [
      {
        "id": "item_uuid_123",
        "product_id": "price_abc123",
        "name": "Poulet fermier",
        "description": "Poulet élevé en plein air, 1.5kg",
        "quantity": 2,
        "unit_price": 1250,
        "currency": "EUR",
        "category": "Viandes",
        "image_url": "https://example.com/poulet.jpg",
        "metadata": {
          "weight": "1.5kg",
          "origin": "France"
        }
      }
    ],
    "subtotal": 2500,
    "shipping_fee": 590,
    "discount": 0,
    "discount_code": null,
    "total": 3090,
    "currency": "EUR",
    "item_count": 2
  }
}
```

**Réponse panier vide:**
```json
{
  "success": true,
  "cart": {
    "items": [],
    "subtotal": 0,
    "shipping_fee": 0,
    "discount": 0,
    "discount_code": null,
    "total": 0,
    "currency": "EUR",
    "item_count": 0
  }
}
```

---

### 1.2 `cart-add` - Ajouter au panier

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "items": [
    {
      "product_id": "price_abc123",
      "quantity": 2
    },
    {
      "product_id": "price_def456",
      "quantity": 1
    }
  ]
}
```

**Réponse:**
```json
{
  "success": true,
  "added_count": 2,
  "cart_total": 3090,
  "item_count": 3
}
```

**Erreurs possibles:**
```json
{
  "success": false,
  "error": "product_not_found",
  "message": "Le produit price_xyz n'existe pas"
}
```

```json
{
  "success": false,
  "error": "out_of_stock",
  "message": "Stock insuffisant pour 'Poulet fermier'",
  "available": 5
}
```

---

### 1.3 `cart-update` - Modifier quantité

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "item_id": "item_uuid_123",
  "quantity": 3
}
```

> Note: `quantity: 0` supprime l'item

**Réponse:**
```json
{
  "success": true,
  "updated": true,
  "cart_total": 4340,
  "item_count": 3
}
```

---

### 1.4 `cart-remove` - Supprimer des items

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "item_ids": ["item_uuid_123", "item_uuid_456"]
}
```

**Réponse:**
```json
{
  "success": true,
  "removed_count": 2,
  "cart_total": 1500,
  "item_count": 1
}
```

---

### 1.5 `cart-clear` - Vider le panier

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789"
}
```

**Réponse:**
```json
{
  "success": true,
  "cleared_count": 3
}
```

---

## 2. Catalogue Produits

### 2.1 `products-list` - Liste des produits

**Méthode:** `GET`

**Paramètres:**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `discord_user_id` | string | ✅ | ID Discord |
| `category` | string | ❌ | Filtrer par catégorie |
| `search` | string | ❌ | Recherche textuelle |
| `limit` | int | ❌ | Limite (défaut: 25) |
| `offset` | int | ❌ | Pagination |

**Réponse:**
```json
{
  "success": true,
  "products": [
    {
      "id": "price_abc123",
      "name": "Poulet fermier",
      "description": "Poulet élevé en plein air, 1.5kg",
      "price": 1250,
      "currency": "EUR",
      "category": "Viandes",
      "image_url": "https://example.com/poulet.jpg",
      "in_stock": true,
      "stock_quantity": 50,
      "metadata": {
        "weight": "1.5kg",
        "origin": "France"
      }
    }
  ],
  "categories": ["Viandes", "Légumes", "Fruits", "Produits laitiers"],
  "total_count": 45,
  "has_more": true
}
```

---

### 2.2 `products-get` - Détails d'un produit

**Méthode:** `GET`

**Paramètres:**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `product_id` | string | ✅ | ID du produit (price_id Stripe ou DB) |

**Réponse:**
```json
{
  "success": true,
  "product": {
    "id": "price_abc123",
    "name": "Poulet fermier",
    "description": "Poulet élevé en plein air, origine France. Poids moyen 1.5kg.",
    "long_description": "Notre poulet fermier est élevé...",
    "price": 1250,
    "currency": "EUR",
    "category": "Viandes",
    "image_url": "https://example.com/poulet.jpg",
    "images": [
      "https://example.com/poulet.jpg",
      "https://example.com/poulet-2.jpg"
    ],
    "in_stock": true,
    "stock_quantity": 50,
    "metadata": {
      "weight": "1.5kg",
      "origin": "France",
      "nutrition": {...}
    }
  }
}
```

---

## 3. Profil Utilisateur

### 3.1 `profile-get` - Récupérer le profil

**Méthode:** `GET`

**Paramètres:**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `discord_user_id` | string | ✅ | ID Discord |

**Réponse:**
```json
{
  "success": true,
  "profile": {
    "discord_user_id": "123456789",
    "email": "user@example.com",
    "phone": "+33612345678",
    "default_address_id": "addr_001",
    "addresses": [
      {
        "id": "addr_001",
        "label": "Domicile",
        "full_name": "Jean Dupont",
        "street": "123 Rue de la Paix",
        "street2": "Apt 4B",
        "city": "Paris",
        "postal_code": "75001",
        "country": "FR",
        "phone": "+33612345678",
        "is_default": true
      },
      {
        "id": "addr_002",
        "label": "Bureau",
        "full_name": "Jean Dupont",
        "street": "45 Avenue des Champs",
        "street2": null,
        "city": "Paris",
        "postal_code": "75008",
        "country": "FR",
        "phone": "+33698765432",
        "is_default": false
      }
    ],
    "created_at": "2026-01-10T10:30:00Z",
    "updated_at": "2026-01-14T15:45:00Z"
  }
}
```

**Réponse profil inexistant:**
```json
{
  "success": true,
  "profile": {
    "discord_user_id": "123456789",
    "email": null,
    "phone": null,
    "default_address_id": null,
    "addresses": [],
    "created_at": null,
    "updated_at": null
  }
}
```

---

### 3.2 `profile-update` - Mettre à jour le profil

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "email": "nouveau@example.com",
  "phone": "+33612345678"
}
```

> Note: Seuls les champs fournis sont mis à jour

**Réponse:**
```json
{
  "success": true,
  "updated_fields": ["email", "phone"]
}
```

---

### 3.3 `profile-address-add` - Ajouter une adresse

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "address": {
    "label": "Domicile",
    "full_name": "Jean Dupont",
    "street": "123 Rue de la Paix",
    "street2": "Apt 4B",
    "city": "Paris",
    "postal_code": "75001",
    "country": "FR",
    "phone": "+33612345678"
  },
  "set_as_default": true
}
```

**Réponse:**
```json
{
  "success": true,
  "address_id": "addr_003",
  "is_default": true
}
```

---

### 3.4 `profile-address-update` - Modifier une adresse

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "address_id": "addr_001",
  "address": {
    "street": "456 Nouvelle Rue",
    "postal_code": "75002"
  }
}
```

**Réponse:**
```json
{
  "success": true,
  "updated": true
}
```

---

### 3.5 `profile-address-remove` - Supprimer une adresse

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "address_id": "addr_002"
}
```

**Réponse:**
```json
{
  "success": true,
  "removed": true
}
```

---

### 3.6 `profile-address-set-default` - Définir adresse par défaut

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "address_id": "addr_002"
}
```

**Réponse:**
```json
{
  "success": true,
  "default_address_id": "addr_002"
}
```

---

## 4. Livraison

### 4.1 `shipping-calculate` - Calculer les options de livraison

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "address_id": "addr_001"
}
```

> Note: Utilise le panier actuel de l'utilisateur pour calculer

**Réponse:**
```json
{
  "success": true,
  "shipping_options": [
    {
      "id": "shipping_standard",
      "name": "Standard",
      "description": "Livraison à domicile",
      "price": 590,
      "currency": "EUR",
      "estimated_days": "3-5 jours ouvrés",
      "carrier": "Colissimo"
    },
    {
      "id": "shipping_express",
      "name": "Express",
      "description": "Livraison express 24h",
      "price": 1290,
      "currency": "EUR",
      "estimated_days": "1 jour ouvré",
      "carrier": "Chronopost"
    },
    {
      "id": "shipping_pickup",
      "name": "Retrait en magasin",
      "description": "Retrait gratuit sous 2h",
      "price": 0,
      "currency": "EUR",
      "estimated_days": "2 heures",
      "carrier": null,
      "pickup_address": {
        "name": "Magasin Paris Centre",
        "street": "10 Rue du Commerce",
        "city": "Paris",
        "postal_code": "75015"
      }
    }
  ],
  "selected_option": null,
  "address": {
    "id": "addr_001",
    "city": "Paris",
    "postal_code": "75001",
    "country": "FR"
  }
}
```

**Erreur adresse invalide:**
```json
{
  "success": false,
  "error": "invalid_address",
  "message": "Livraison non disponible pour cette adresse"
}
```

---

### 4.2 `shipping-select` - Sélectionner une option

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "shipping_option_id": "shipping_express",
  "address_id": "addr_001"
}
```

**Réponse:**
```json
{
  "success": true,
  "selected": {
    "id": "shipping_express",
    "name": "Express",
    "price": 1290
  },
  "cart_total": 4380
}
```

---

## 5. Codes Promo / Coupons

### 5.1 `cart-apply-coupon` - Appliquer un code promo

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "coupon_code": "WELCOME10"
}
```

**Réponse succès:**
```json
{
  "success": true,
  "coupon": {
    "code": "WELCOME10",
    "type": "percentage",
    "value": 10,
    "description": "10% de réduction",
    "min_amount": 2000,
    "max_discount": 1000
  },
  "discount": 309,
  "cart_total": 2781
}
```

**Réponse erreur:**
```json
{
  "success": false,
  "error": "invalid_coupon",
  "message": "Ce code promo n'existe pas ou a expiré"
}
```

```json
{
  "success": false,
  "error": "min_amount_not_reached",
  "message": "Montant minimum de 20€ requis pour ce code",
  "min_amount": 2000,
  "current_amount": 1500
}
```

---

### 5.2 `cart-remove-coupon` - Retirer le code promo

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789"
}
```

**Réponse:**
```json
{
  "success": true,
  "removed_code": "WELCOME10",
  "cart_total": 3090
}
```

---

## 6. Checkout & Paiement

### 6.1 `cart-checkout` - Créer session de paiement

**Méthode:** `POST`

**Body:**
```json
{
  "discord_user_id": "123456789",
  "address_id": "addr_001",
  "shipping_option_id": "shipping_standard",
  "success_url": "https://discord.com/channels/guild_id/channel_id",
  "cancel_url": "https://discord.com/channels/guild_id/channel_id"
}
```

**Réponse:**
```json
{
  "success": true,
  "checkout": {
    "url": "https://checkout.stripe.com/c/pay/cs_live_abc123...",
    "session_id": "cs_live_abc123",
    "expires_at": "2026-01-14T17:00:00Z"
  },
  "order_preview": {
    "subtotal": 2500,
    "shipping_fee": 590,
    "discount": 0,
    "total": 3090,
    "currency": "EUR",
    "item_count": 2
  }
}
```

**Erreurs possibles:**
```json
{
  "success": false,
  "error": "address_required",
  "message": "Veuillez ajouter une adresse de livraison"
}
```

```json
{
  "success": false,
  "error": "shipping_required",
  "message": "Veuillez sélectionner une option de livraison"
}
```

```json
{
  "success": false,
  "error": "cart_empty",
  "message": "Votre panier est vide"
}
```

```json
{
  "success": false,
  "error": "stock_changed",
  "message": "Le stock de certains articles a changé",
  "items": [
    {
      "product_id": "price_abc123",
      "name": "Poulet fermier",
      "requested": 5,
      "available": 2
    }
  ]
}
```

---

## 7. Commandes & Historique

### 7.1 `orders-list` - Liste des commandes

**Méthode:** `GET`

**Paramètres:**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `discord_user_id` | string | ✅ | ID Discord |
| `status` | string | ❌ | Filtrer par statut |
| `limit` | int | ❌ | Limite (défaut: 10) |
| `offset` | int | ❌ | Pagination |

**Réponse:**
```json
{
  "success": true,
  "orders": [
    {
      "id": "order_abc123",
      "status": "shipped",
      "status_label": "Expédiée",
      "total": 3090,
      "currency": "EUR",
      "item_count": 2,
      "created_at": "2026-01-14T10:30:00Z",
      "shipped_at": "2026-01-14T14:00:00Z",
      "tracking_number": "1Z999AA10123456784",
      "tracking_url": "https://www.laposte.fr/track/1Z999AA10123456784"
    }
  ],
  "total_count": 5,
  "has_more": false
}
```

**Statuts possibles:**
| Status | Label FR | Description |
|--------|----------|-------------|
| `pending` | En attente | Paiement en cours |
| `paid` | Payée | Paiement confirmé |
| `processing` | En préparation | Commande en cours de traitement |
| `shipped` | Expédiée | Colis envoyé |
| `delivered` | Livrée | Colis reçu |
| `cancelled` | Annulée | Commande annulée |
| `refunded` | Remboursée | Commande remboursée |

---

### 7.2 `orders-get` - Détails d'une commande

**Méthode:** `GET`

**Paramètres:**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `discord_user_id` | string | ✅ | ID Discord |
| `order_id` | string | ✅ | ID de la commande |

**Réponse:**
```json
{
  "success": true,
  "order": {
    "id": "order_abc123",
    "status": "shipped",
    "status_label": "Expédiée",
    "items": [
      {
        "product_id": "price_abc123",
        "name": "Poulet fermier",
        "quantity": 2,
        "unit_price": 1250,
        "total_price": 2500
      }
    ],
    "subtotal": 2500,
    "shipping_fee": 590,
    "discount": 0,
    "discount_code": null,
    "total": 3090,
    "currency": "EUR",
    "shipping": {
      "option": "Standard",
      "carrier": "Colissimo",
      "tracking_number": "1Z999AA10123456784",
      "tracking_url": "https://www.laposte.fr/track/1Z999AA10123456784"
    },
    "address": {
      "full_name": "Jean Dupont",
      "street": "123 Rue de la Paix",
      "city": "Paris",
      "postal_code": "75001",
      "country": "FR"
    },
    "timeline": [
      {"status": "paid", "label": "Payée", "date": "2026-01-14T10:30:00Z"},
      {"status": "processing", "label": "En préparation", "date": "2026-01-14T11:00:00Z"},
      {"status": "shipped", "label": "Expédiée", "date": "2026-01-14T14:00:00Z"}
    ],
    "created_at": "2026-01-14T10:30:00Z",
    "updated_at": "2026-01-14T14:00:00Z"
  }
}
```

---

## 8. Notifications (Redis Stream)

Après paiement réussi, n8n publie sur le stream Redis `discord:dm`:

### 8.1 Event `order_completed`

```json
{
  "user_id": "123456789",
  "username": "JeanD",
  "email": "user@example.com",
  "guild_id": "guild_123",
  "channel_id": "channel_456",
  "project_id": "my-shop",
  "event": "order_completed",
  "data": {
    "order_id": "order_abc123",
    "total": 3090,
    "currency": "EUR",
    "item_count": 2,
    "shipping_method": "Standard",
    "estimated_delivery": "3-5 jours ouvrés"
  },
  "actions": {
    "send_dm": true,
    "send_channel_message": false
  }
}
```

### 8.2 Event `order_shipped`

```json
{
  "user_id": "123456789",
  "event": "order_shipped",
  "data": {
    "order_id": "order_abc123",
    "tracking_number": "1Z999AA10123456784",
    "tracking_url": "https://www.laposte.fr/track/...",
    "carrier": "Colissimo",
    "estimated_delivery": "16 janvier 2026"
  },
  "actions": {
    "send_dm": true
  }
}
```

### 8.3 Event `order_delivered`

```json
{
  "user_id": "123456789",
  "event": "order_delivered",
  "data": {
    "order_id": "order_abc123"
  },
  "actions": {
    "send_dm": true
  }
}
```

---

## 9. Récapitulatif des Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| **Panier** | | |
| `cart-get` | GET | Récupérer le panier |
| `cart-add` | POST | Ajouter au panier |
| `cart-update` | POST | Modifier quantité |
| `cart-remove` | POST | Supprimer items |
| `cart-clear` | POST | Vider le panier |
| **Produits** | | |
| `products-list` | GET | Liste des produits |
| `products-get` | GET | Détails produit |
| **Profil** | | |
| `profile-get` | GET | Récupérer profil |
| `profile-update` | POST | Mettre à jour profil |
| `profile-address-add` | POST | Ajouter adresse |
| `profile-address-update` | POST | Modifier adresse |
| `profile-address-remove` | POST | Supprimer adresse |
| `profile-address-set-default` | POST | Définir défaut |
| **Livraison** | | |
| `shipping-calculate` | POST | Calculer options |
| `shipping-select` | POST | Sélectionner option |
| **Coupons** | | |
| `cart-apply-coupon` | POST | Appliquer code |
| `cart-remove-coupon` | POST | Retirer code |
| **Checkout** | | |
| `cart-checkout` | POST | Créer session Stripe |
| **Commandes** | | |
| `orders-list` | GET | Liste commandes |
| `orders-get` | GET | Détails commande |

---

## 10. Modèles de données partagés

### Prix et montants
- Tous les prix sont en **centimes** (int)
- Exemple: 12,50€ = `1250`

### Devise
- Code ISO 4217: `EUR`, `USD`, etc.
- Une seule devise par projet/panier

### Dates
- Format ISO 8601: `2026-01-14T10:30:00Z`

### IDs
- `discord_user_id`: string (ID Discord)
- `product_id`: string (price_id Stripe ou UUID)
- `order_id`: string (préfixe `order_`)
- `address_id`: string (préfixe `addr_`)

---

## 11. Questions pour l'équipe n8n

1. **Persistence du panier**: TTL recommandé ? (suggestion: 7 jours)
2. **Limite d'adresses**: Max par utilisateur ? (suggestion: 5)
3. **Email de confirmation**: Template séparé ou inclus dans le workflow checkout ?
4. **Webhook Stripe**: Events à écouter ? (`checkout.session.completed`, `payment_intent.succeeded`, etc.)
5. **Gestion des stocks**: Réservation temporaire pendant checkout ?

---

## Changelog

| Version | Date | Modifications |
|---------|------|---------------|
| 1.0 | 2026-01-14 | Version initiale |
