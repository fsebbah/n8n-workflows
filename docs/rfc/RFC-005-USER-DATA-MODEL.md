# RFC-005: User Data Model

**Status:** Reference
**Date:** 2026-01-15
**Author:** API Team

---

## Résumé

Ce document décrit l'ensemble des enregistrements créés pour un utilisateur Discord dans le système. Il sert de référence pour comprendre le modèle de données et faciliter les opérations de maintenance (nettoyage, debug, RGPD).

---

## Flow utilisateur

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PARCOURS UTILISATEUR                          │
└─────────────────────────────────────────────────────────────────────┘

Discord User
     │
     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Abonnement  │ ──► │  Shopping   │ ──► │  Commande   │
│             │     │             │     │             │
│ user_credits│     │ carts       │     │ orders      │
│ credit_tx   │     │ cart_items  │     │ order_items │
└─────────────┘     └─────────────┘     └─────────────┘
     │                    │                    │
     ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Profil    │     │   Support   │     │  Livraison  │
│             │     │             │     │             │
│ users       │     │ private_ch  │     │ addresses   │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## Tables SQL

### Vue d'ensemble

| Étape | Table | Clé utilisateur | Créé par | Description |
|-------|-------|-----------------|----------|-------------|
| **Abonnement** | `user_credits` | `discord_user_id` | Webhook Stripe | Crédits + statut abo |
| | `credit_transactions` | `subscriber_id` (FK) | Webhook Stripe | Historique crédits |
| **Profil** | `users` | `discord_user_id` | API Profile | Identité centralisée |
| | `user_addresses` | `discord_user_id` | API Addresses | Adresses livraison |
| **Shopping** | `carts` | `discord_user_id` | API Cart | Panier actif |
| | `cart_items` | `cart_id` (FK) | API Cart | Articles panier |
| **Commande** | `checkout_sessions` | `discord_user_id` | API Checkout | Session Stripe |
| | `orders` | `discord_user_id` | Webhook Stripe | Commande finalisée |
| | `order_items` | `order_id` (FK) | Webhook Stripe | Lignes commande |
| | `order_status_history` | `order_id` (FK) | API/Webhook | Audit statuts |
| **Support** | `user_private_channels` | `discord_user_id` | API Channels | Salons privés Discord |

---

### Détail des tables

#### 1. `user_credits` - Abonnement et crédits

Table principale pour la gestion des abonnements.

| Colonne | Type | Description |
|---------|------|-------------|
| `project_id` | varchar(50) | Identifiant projet (multi-tenant) |
| `discord_user_id` | varchar(50) | **Clé utilisateur** |
| `discord_username` | varchar | Username Discord |
| `email` | varchar | Email (optionnel) |
| `credits_remaining` | integer | Crédits disponibles |
| `credits_total` | integer | Total crédits reçus |
| `subscription_status` | varchar | `active`, `cancelled`, `past_due` |
| `plan_id` | varchar | ID du plan Stripe |
| `current_period_end` | timestamp | Fin de période en cours |
| `user_id` | uuid | Clé pour FK (credit_transactions) |

**Exemple:**
```json
{
  "project_id": "bot-appetit",
  "discord_user_id": "1455174904323379215",
  "discord_username": "azy0147",
  "credits_remaining": 1500,
  "credits_total": 1500,
  "subscription_status": "active",
  "plan_id": "price_1SnRv7ASFmxXUAAwbT8A4Uzt"
}
```

---

#### 2. `credit_transactions` - Historique des crédits

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `subscriber_id` | uuid | **FK → user_credits.user_id** |
| `amount` | integer | Montant (+/-) |
| `type` | varchar | `subscription`, `usage`, `bonus`, `refund` |
| `description` | text | Description transaction |
| `metadata` | jsonb | Données additionnelles |

**Exemple:**
```json
{
  "subscriber_id": "uuid-xxx",
  "amount": 1500,
  "type": "subscription",
  "description": "Monthly subscription credits - Chef Cuisine"
}
```

---

#### 3. `users` - Profil centralisé

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `discord_user_id` | varchar(50) | **Clé utilisateur** (unique) |
| `discord_username` | varchar | Username Discord |
| `discord_avatar_url` | varchar | URL avatar |
| `email` | varchar | Email vérifié |
| `email_verified` | boolean | Email confirmé |
| `stripe_customer_id` | varchar | ID client Stripe |
| `status` | varchar | `active`, `inactive`, `banned` |
| `preferences` | jsonb | Préférences utilisateur |
| `locale` | varchar | Langue (défaut: fr) |
| `timezone` | varchar | Fuseau horaire |

---

#### 4. `user_addresses` - Adresses

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `discord_user_id` | varchar(50) | **Clé utilisateur** |
| `address_type` | varchar | `shipping`, `billing` |
| `is_default` | boolean | Adresse par défaut |
| `label` | varchar | Nom (ex: "Maison") |
| `full_name` | varchar | Nom complet |
| `line1`, `line2` | varchar | Adresse |
| `city`, `postal_code` | varchar | Ville, CP |
| `country_code` | varchar | Code pays (FR, BE...) |

---

#### 5. `carts` - Paniers

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `discord_user_id` | varchar(50) | **Clé utilisateur** |
| `status` | varchar | `active`, `checked_out`, `abandoned` |
| `item_count` | integer | Nombre d'articles |
| `subtotal_cents` | integer | Sous-total en centimes |
| `currency` | varchar | Devise (EUR) |
| `coupon_code` | varchar | Code promo appliqué |
| `discount_cents` | integer | Réduction |

---

#### 6. `cart_items` - Articles panier

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `cart_id` | uuid | **FK → carts.id** |
| `product_id` | uuid | Référence produit |
| `product_snapshot` | jsonb | Copie produit au moment de l'ajout |
| `quantity` | integer | Quantité |
| `unit_price_cents` | integer | Prix unitaire |

---

#### 7. `checkout_sessions` - Sessions Stripe

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `discord_user_id` | varchar(50) | **Clé utilisateur** |
| `cart_id` | uuid | FK → carts.id |
| `order_id` | uuid | FK → orders.id |
| `stripe_session_id` | varchar | ID session Stripe |
| `stripe_session_url` | varchar | URL checkout |
| `status` | varchar | `pending`, `completed`, `expired` |
| `expires_at` | timestamp | Expiration session |

---

#### 8. `orders` - Commandes

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `order_number` | varchar | Numéro unique (ORD-YYYYMMDD-XXX) |
| `discord_user_id` | varchar(50) | **Clé utilisateur** |
| `stripe_checkout_session_id` | varchar | Session Stripe |
| `stripe_payment_intent_id` | varchar | Intent paiement |
| `total_cents` | integer | Total en centimes |
| `currency` | varchar | Devise |
| `status` | varchar | `pending`, `paid`, `shipped`, `delivered`, `cancelled` |
| `payment_status` | varchar | `pending`, `paid`, `refunded` |
| `shipping_address` | jsonb | Adresse de livraison |
| `customer_email` | varchar | Email client |

---

#### 9. `order_items` - Lignes de commande

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `order_id` | uuid | **FK → orders.id** |
| `product_id` | uuid | Référence produit |
| `product_snapshot` | jsonb | Copie produit |
| `quantity` | integer | Quantité |
| `unit_price_cents` | integer | Prix unitaire |
| `total_cents` | integer | Total ligne |

---

#### 10. `order_status_history` - Historique statuts

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `order_id` | uuid | **FK → orders.id** |
| `from_status` | varchar | Statut précédent |
| `to_status` | varchar | Nouveau statut |
| `reason` | text | Raison du changement |
| `performed_by` | varchar | Qui a changé (system, admin) |

---

#### 11. `user_private_channels` - Salons privés Discord

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `project_id` | varchar(50) | Identifiant projet |
| `guild_id` | varchar(50) | ID serveur Discord |
| `discord_user_id` | varchar(50) | **Clé utilisateur** |
| `channel_id` | varchar(50) | ID channel Discord |
| `channel_type` | varchar | `support`, `order`, `onboarding`, `private` |
| `channel_name` | varchar | Nom du channel |
| `is_active` | boolean | Actif (soft delete) |
| `last_activity_at` | timestamp | Dernière activité |

---

## Clés Redis

| Pattern | Type | Description | TTL |
|---------|------|-------------|-----|
| `cart:{discord_user_id}` | JSON | Panier (cache primaire) | Session |
| `cart:{discord_user_id}:items` | Hash | Articles panier | Session |
| `collection:shopping_list:{discord_user_id}` | List | Liste courses (recipes) | Permanent |
| `user:{discord_user_id}:session` | JSON | Session utilisateur | 24h |
| `project:{project_id}:guild:{guild_id}:branding` | JSON | Cache branding | 1h |

---

## Contraintes FK et ordre de suppression

Pour supprimer toutes les données d'un utilisateur, respecter cet ordre (FK constraints):

```
1. order_items           (FK → orders)
2. order_status_history  (FK → orders)
3. cart_items            (FK → carts)
4. credit_transactions   (FK → user_credits.user_id)
5. orders
6. carts
7. checkout_sessions
8. user_addresses
9. user_private_channels
10. user_credits
11. users
12. Redis keys
```

---

## Script de nettoyage

```bash
# Voir toutes les données d'un utilisateur
python scripts/clear_user_data.py <discord_user_id> --dry-run

# Supprimer toutes les données
python scripts/clear_user_data.py <discord_user_id>
```

**Exemple:**
```bash
$ python scripts/clear_user_data.py 1455174904323379215 --dry-run

============================================================
Clear User Data: 1455174904323379215
Mode: DRY RUN (no changes)
============================================================

📦 SQL Tables:
----------------------------------------
    order_items: 0 row(s)
    order_status_history: 0 row(s)
    cart_items: 0 row(s)
    credit_transactions: 0 row(s)
    orders: 0 row(s)
    carts: 0 row(s)
    checkout_sessions: 0 row(s)
    user_addresses: 0 row(s)
    user_private_channels: 0 row(s)
  ✓ user_credits: 1 row(s)
    users: 0 row(s)

  Total SQL: 1 row(s)

🔴 Redis Keys:
----------------------------------------
  (no keys found)

============================================================
```

---

## Conformité RGPD

Pour une demande de suppression RGPD:

1. **Identifier** toutes les données avec `--dry-run`
2. **Exporter** si nécessaire (droit à la portabilité)
3. **Supprimer** avec le script
4. **Vérifier** la suppression avec `--dry-run`
5. **Documenter** l'action effectuée

---

## Références

- [RFC-001: Shopping Cart](./RFC-001-CONSENSUS-SHOPPING-CART.md)
- [RFC-003: Checkout Branding](../guides/RFC-003-checkout-branding-multi-tenant.md)
- [RFC-004: Private Channels](./RFC-004-PRIVATE-CHANNELS.md)
