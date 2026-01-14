# RFC-001 ShoppingCartService - Récap Workflows n8n

## Vue d'ensemble

Ce document récapitule tous les workflows n8n créés pour le RFC-001 ShoppingCartService.

**Pattern utilisé:** `$env.TORAH_API_URL` dans les HTTP Request nodes

---

## Phase 1 - Gestion du Panier ✅ Mergé

| Workflow | Webhook Path | Méthode API | Endpoint |
|----------|--------------|-------------|----------|
| `SHOPPING---Cart-Get` | `cart-get` | GET | `/api/cart/{discord_user_id}` |
| `SHOPPING---Cart-Add` | `cart-add` | POST | `/api/cart/{discord_user_id}/items` |
| `SHOPPING---Cart-Update` | `cart-update` | PUT | `/api/cart/{discord_user_id}/items/{item_id}` |
| `SHOPPING---Cart-Remove` | `cart-remove` | DELETE | `/api/cart/{discord_user_id}/items/{item_id}` |
| `SHOPPING---Cart-Clear` | `cart-clear` | DELETE | `/api/cart/{discord_user_id}` |
| `SHOPPING---Products-Persist` | `products-persist` | POST | `/api/products/persist` |

---

## Phase 2 - Checkout & Commandes 🔄 PR #235

| Workflow | Webhook Path | Méthode API | Endpoint |
|----------|--------------|-------------|----------|
| `SHOPPING---Cart-Checkout` | `cart-checkout` | POST | `/api/cart/{discord_user_id}/checkout` |
| `SHOPPING---Cart-Apply-Coupon` | `cart-apply-coupon` | POST | `/api/cart/{discord_user_id}/coupon` |
| `SHOPPING---Cart-Remove-Coupon` | `cart-remove-coupon` | DELETE | `/api/cart/{discord_user_id}/coupon` |
| `SHOPPING---Orders-List` | `orders-list` | GET | `/api/orders/{discord_user_id}` |
| `SHOPPING---Orders-Get` | `orders-get` | GET | `/api/orders/{discord_user_id}/{order_id}` |

---

## Phase 3 - Profil & Livraison 🔄 PR #236

### Gestion du Profil

| Workflow | Webhook Path | Méthode API | Endpoint |
|----------|--------------|-------------|----------|
| `SHOPPING---Profile-Get` | `profile-get` | GET | `/api/profile/{discord_user_id}` |
| `SHOPPING---Profile-Update` | `profile-update` | PUT | `/api/profile/{discord_user_id}` |

### Gestion des Adresses

| Workflow | Webhook Path | Méthode API | Endpoint |
|----------|--------------|-------------|----------|
| `SHOPPING---Profile-Address-Add` | `profile-address-add` | POST | `/api/addresses/{discord_user_id}` |
| `SHOPPING---Profile-Address-Update` | `profile-address-update` | PUT | `/api/addresses/{discord_user_id}/{address_id}` |
| `SHOPPING---Profile-Address-Remove` | `profile-address-remove` | DELETE | `/api/addresses/{discord_user_id}/{address_id}` |
| `SHOPPING---Profile-Address-Set-Default` | `profile-address-set-default` | POST | `/api/addresses/{discord_user_id}/{address_id}/default` |

### Gestion de la Livraison

| Workflow | Webhook Path | Méthode API | Endpoint |
|----------|--------------|-------------|----------|
| `SHOPPING---Shipping-Calculate` | `shipping-calculate` | POST | `/api/shipping/{discord_user_id}/calculate` |
| `SHOPPING---Shipping-Select` | `shipping-select` | POST | `/api/shipping/{discord_user_id}/select` |

---

## Autre Workflow

| Workflow | Webhook Path | Description |
|----------|--------------|-------------|
| `SHOPPING---Product-Discovery-WebSearch` | `product-discovery` | Recherche produits via OpenAI (n'utilise pas TORAH_API) |

---

## Structure des Workflows

Chaque workflow suit le pattern standard:

```
Webhook Trigger → Validate Input → Check Validation Error
                                         ↓ (error)      ↓ (success)
                               Format Validation Error   Call API
                                         ↓                   ↓
                                   Respond Error    Format Success Response
                                                             ↓
                                                      Respond Success
```

---

## Headers Requis

Tous les appels vers TORAH_API incluent:
- `X-Project-ID`: Identifiant du projet (extrait de `x-project-id` header)
- `Content-Type: application/json` (pour POST/PUT)

---

## Format de Réponse Standard

### Succès
```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```

### Erreur
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Description de l'erreur",
    "http_status": 400
  }
}
```

---

## Intégration chatbot-core

Pour appeler ces workflows depuis chatbot-core:

```typescript
const response = await fetch(`${N8N_WEBHOOK_URL}/webhook/cart-get?discord_user_id=${userId}`, {
  headers: {
    'X-Project-ID': projectId
  }
});
```

Pour les méthodes POST/PUT:

```typescript
const response = await fetch(`${N8N_WEBHOOK_URL}/webhook/cart-add`, {
  method: 'POST',
  headers: {
    'X-Project-ID': projectId,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    discord_user_id: userId,
    product_id: productId,
    quantity: 1
  })
});
```

---

## Tags

Tous les workflows sont taggés avec:
- `shopping`
- `rfc-001`
- Tag de catégorie: `cart`, `checkout`, `orders`, `profile`, `shipping`
