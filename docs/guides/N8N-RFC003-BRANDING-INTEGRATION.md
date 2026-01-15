# N8N - Intégration RFC-003 Branding

**Status:** API Ready
**Date:** 2026-01-15
**PR:** #222 (merged)

---

## Résumé

L'API branding est disponible. Ce document décrit les endpoints et payloads pour l'intégration n8n.

---

## 1. Cart-Checkout - Stocker guild_id dans Stripe

### Modification requise
Passer `guild_id` dans les metadata Stripe lors de la création de session checkout.

### Endpoint existant
```
POST /api/checkout/{user_id}
Headers: X-Project-ID: <project_id>
```

### Request (inchangé)
```json
{
  "success_url": "https://n8n.example.com/webhook/cart-checkout-success?session_id={CHECKOUT_SESSION_ID}",
  "cancel_url": "https://n8n.example.com/webhook/cart-checkout-cancel?session_id={CHECKOUT_SESSION_ID}",
  "metadata": {
    "guild_id": "987654321"
  }
}
```

### Response (inchangé)
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_live_xxx",
  "session_id": "cs_live_xxx",
  "order_number": "ORD-20260115-0001",
  "expires_at": "2026-01-15T15:30:00Z"
}
```

> **Note:** Le `guild_id` sera automatiquement stocké dans les metadata Stripe et récupérable via `/checkout/confirm`.

---

## 2. Cart-Checkout-Success - Récupérer branding

### Nouvel endpoint
```
POST /api/checkout/confirm
Headers: X-Project-ID: <project_id>
```

### Request
```json
{
  "session_id": "cs_live_xxx"
}
```

### Response
```json
{
  "success": true,
  "order": {
    "discord_user_id": "123456789",
    "order_number": "ORD-20260115-0001",
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

### Erreurs possibles

| Code | HTTP | Description |
|------|------|-------------|
| `STRIPE_NOT_CONFIGURED` | 401 | Clé Stripe manquante pour ce projet |
| `SESSION_INVALID` | 400 | Session inexistante ou paiement non complété |

### Utilisation branding dans HTML
```html
<div style="background-color: {{ $json.branding.primary_color }}">
  <img src="{{ $json.branding.logo_url }}" alt="{{ $json.branding.name }}">
  <h1>Merci pour votre commande !</h1>
  <p>Commande: {{ $json.order.order_number }}</p>
  <p>Total: {{ $json.order.total_display }}</p>
  <a href="{{ $json.branding.discord_url }}">Rejoindre Discord</a>
</div>
```

---

## 3. Cart-Checkout-Cancel - Récupérer branding

### Endpoint
```
GET /api/branding/{project_id}/guild/{guild_id}
```

### Response
```json
{
  "success": true,
  "data": {
    "name": "Bot Appetit",
    "logo_url": "https://cdn.bot-appetit.fr/logo.png",
    "primary_color": "#10B981",
    "discord_url": "https://discord.gg/xxx"
  },
  "source": "guild"
}
```

### Fallback
Si `guild_id` n'a pas de branding configuré, retourne le branding par défaut du projet (`source: "project"`).

### Sans guild_id
```
GET /api/branding/{project_id}
```

Retourne uniquement le branding par défaut du projet.

---

## 4. Flow complet

```
┌─────────────────────────────────────────────────────────────────┐
│ Plugin Discord                                                   │
│   /cart checkout guild_id=987654321                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ n8n: Cart-Checkout                                               │
│   POST /api/checkout/{user_id}                                  │
│   metadata: { guild_id: "987654321" }                           │
│   → Stripe session créée avec guild_id dans metadata            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stripe Checkout Page                                             │
│   User complète le paiement                                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│ SUCCESS         │   │ CANCEL          │
│                 │   │                 │
│ n8n: Success    │   │ n8n: Cancel     │
│ POST /confirm   │   │ GET /branding   │
│ → order+brand   │   │ → branding      │
└─────────────────┘   └─────────────────┘
```

---

## 5. Checklist n8n

- [ ] **Cart-Checkout:** Ajouter `guild_id` dans metadata de la requête checkout
- [ ] **Cart-Checkout-Success:** Appeler `POST /checkout/confirm` au lieu de récupérer la session directement
- [ ] **Cart-Checkout-Success:** Utiliser `branding` dans le template HTML
- [ ] **Cart-Checkout-Cancel:** Appeler `GET /branding/{project_id}/guild/{guild_id}`
- [ ] **Cart-Checkout-Cancel:** Utiliser `branding` dans le template HTML

---

## Questions ?

Contacter l'équipe API si besoin de clarifications.
