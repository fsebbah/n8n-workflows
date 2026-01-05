# Analyse des Webhooks Stripe

**Date:** 2025-01-05
**Statut:** DRAFT
**Type:** Feature Request / Architecture

---

## 1. Contexte

Chaque projet (torah, mcp, etc.) a son propre compte Stripe avec:
- `stripe_key` (API key)
- `webhook_secret` (signature verification)

Ces secrets sont stockes dans Redis via le workflow `stripe-register-project`.

## 2. Architecture Webhook

### Endpoint propose

```
POST /webhook/stripe-webhook/{project_id}
```

Exemple:
- `https://pi6.local:5678/webhook/stripe-webhook/torah`
- `https://pi6.local:5678/webhook/stripe-webhook/mcp`

### Flow de traitement

```
1. Recevoir event Stripe
2. Extraire project_id du path
3. Lire webhook_secret depuis Redis
4. Verifier signature Stripe
5. Router vers le handler approprie selon event.type
6. Appeler API credits si necessaire
7. Logger l'event
```

---

## 3. Phases d'implementation

### Phase 1 - Credits Discord (MVP)

**Objectif:** Gerer les credits utilisateurs pour le bot Discord

| Event | Description | Action |
|-------|-------------|--------|
| `checkout.session.completed` | Nouvel abonnement | `POST /api/webhook/account/set` |
| `invoice.paid` | Paiement mensuel reussi | `POST /api/webhook/account/credit` |
| `customer.subscription.deleted` | Annulation abonnement | `POST /api/webhook/account/set` (credits=0) |
| `customer.subscription.updated` | Changement de plan | Ajuster credits selon nouveau plan |

**Metadata requises dans Stripe:**
```json
{
  "project_id": "torah",
  "discord_user_id": "123456789",
  "credits_per_month": "1000"
}
```

---

### Phase 2 - Gestion Client

**Objectif:** Suivi complet du cycle de vie client

#### Customer Events

| Event | Description | Action |
|-------|-------------|--------|
| `customer.created` | Nouveau client | Log + creer entree DB |
| `customer.updated` | Mise a jour client | Sync infos (email, name) |
| `customer.deleted` | Suppression client | Cleanup donnees locales |

#### Subscription Events

| Event | Description | Action |
|-------|-------------|--------|
| `customer.subscription.created` | Nouvel abonnement | Log |
| `customer.subscription.updated` | Modification | Sync plan/status |
| `customer.subscription.paused` | Pause | Suspendre credits |
| `customer.subscription.resumed` | Reprise | Reactiver credits |
| `customer.subscription.pending_update_applied` | Update applique | Sync |
| `customer.subscription.pending_update_expired` | Update expire | Log |
| `customer.subscription.trial_will_end` | Fin trial proche | Notifier user |

#### Invoice Events

| Event | Description | Action |
|-------|-------------|--------|
| `invoice.created` | Facture creee | Log |
| `invoice.finalized` | Facture finalisee | Generer PDF? |
| `invoice.sent` | Facture envoyee | Log |
| `invoice.paid` | Facture payee | Crediter (Phase 1) |
| `invoice.payment_failed` | Echec paiement | Notifier user Discord |
| `invoice.payment_action_required` | Action requise | Notifier user |
| `invoice.updated` | Mise a jour | Sync |
| `invoice.voided` | Facture annulee | Log |
| `invoice.marked_uncollectible` | Irrecuperable | Suspendre compte? |

---

### Phase 3 - Balance & Transactions

**Objectif:** Suivi financier et comptabilite

#### Balance Events

| Event | Description | Action |
|-------|-------------|--------|
| `balance.available` | Fonds disponibles | Dashboard admin |
| `balance_transaction.created` | Nouvelle transaction | Log comptable |
| `balance_transaction.updated` | Mise a jour | Sync |

#### Payout Events

| Event | Description | Action |
|-------|-------------|--------|
| `payout.created` | Virement initie | Log |
| `payout.paid` | Virement effectue | Notification admin |
| `payout.failed` | Echec virement | Alerte admin |
| `payout.canceled` | Virement annule | Log |

---

### Phase 4 - Catalogue Produits (Sync Local)

**Objectif:** Synchroniser le catalogue Stripe en local pour affichage rapide

#### Product Events

| Event | Description | Action |
|-------|-------------|--------|
| `product.created` | Nouveau produit | Insert table `products` |
| `product.updated` | Modification | Update table `products` |
| `product.deleted` | Suppression | Delete table `products` |

#### Price Events

| Event | Description | Action |
|-------|-------------|--------|
| `price.created` | Nouveau prix | Insert table `prices` |
| `price.updated` | Modification | Update table `prices` |
| `price.deleted` | Suppression | Delete table `prices` |

#### Plan Events (legacy)

| Event | Description | Action |
|-------|-------------|--------|
| `plan.created` | Nouveau plan | Insert table `plans` |
| `plan.updated` | Modification | Update table `plans` |
| `plan.deleted` | Suppression | Delete table `plans` |

**Schema PostgreSQL propose:**

```sql
CREATE TABLE stripe_products (
    id VARCHAR(50) PRIMARY KEY,  -- prod_xxx
    project_id VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    description TEXT,
    active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stripe_prices (
    id VARCHAR(50) PRIMARY KEY,  -- price_xxx
    project_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) REFERENCES stripe_products(id),
    currency VARCHAR(3),
    unit_amount INTEGER,  -- en centimes
    recurring_interval VARCHAR(20),  -- month, year
    recurring_interval_count INTEGER,
    active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Phase 5 - Payment Methods

**Objectif:** Gestion des moyens de paiement

| Event | Description | Action |
|-------|-------------|--------|
| `payment_method.attached` | Carte ajoutee | Log |
| `payment_method.detached` | Carte retiree | Log |
| `payment_method.updated` | Mise a jour | Sync |
| `payment_method.automatically_updated` | MAJ auto (expiration) | Notifier user |

---

### Phase 6 - Promotions & Coupons

**Objectif:** Gestion des codes promo

| Event | Description | Action |
|-------|-------------|--------|
| `coupon.created` | Nouveau coupon | Sync table `coupons` |
| `coupon.updated` | Modification | Update |
| `coupon.deleted` | Suppression | Delete |
| `promotion_code.created` | Nouveau code promo | Sync table `promo_codes` |
| `promotion_code.updated` | Modification | Update |

---

### Phase 7 - Account (Stripe Connect V2)

**Objectif:** Gestion multi-compte Stripe Connect

| Event | Description | Action |
|-------|-------------|--------|
| `account.created` | Nouveau compte connecte | Setup initial |
| `account.updated` | Mise a jour compte | Sync status |
| `account.application.authorized` | App autorisee | Activer integration |
| `account.application.deauthorized` | App desautorisee | Desactiver |
| `account.external_account.created` | Compte bancaire ajoute | Log |
| `account.external_account.deleted` | Compte bancaire retire | Log |

---

## 4. Priorisation recommandee

| Phase | Priorite | Effort | Valeur |
|-------|----------|--------|--------|
| Phase 1 - Credits | HAUTE | Faible | HAUTE |
| Phase 2 - Gestion Client | MOYENNE | Moyen | HAUTE |
| Phase 3 - Balance | BASSE | Faible | MOYENNE |
| Phase 4 - Catalogue | MOYENNE | Moyen | MOYENNE |
| Phase 5 - Payment Methods | BASSE | Faible | BASSE |
| Phase 6 - Promotions | BASSE | Faible | MOYENNE |
| Phase 7 - Account | FUTURE | Eleve | HAUTE (si multi-tenant) |

---

## 5. Implementation technique

### Workflow n8n propose

```
stripe-webhook-handler.json

Nodes:
1. Webhook Trigger (POST /{project_id})
2. Get Webhook Secret (Redis)
3. Verify Signature (Code node)
4. Switch (event.type)
   ├── checkout.session.completed → Handle Checkout
   ├── invoice.paid → Handle Invoice Paid
   ├── customer.subscription.* → Handle Subscription
   ├── product.* → Handle Product
   └── default → Log Unknown Event
5. Call API (credits, sync, etc.)
6. Respond 200 OK
```

### Securite

- Toujours verifier la signature Stripe
- Logger tous les events (audit)
- Retourner 200 rapidement (Stripe timeout = 20s)
- Traitement async si necessaire

### Idempotence

Stripe peut renvoyer le meme event plusieurs fois. Gerer avec:
```sql
CREATE TABLE stripe_events (
    event_id VARCHAR(50) PRIMARY KEY,  -- evt_xxx
    project_id VARCHAR(50),
    event_type VARCHAR(100),
    processed_at TIMESTAMP,
    payload JSONB
);
```

---

## 6. Configuration Stripe Dashboard

Pour chaque projet:

1. Aller sur **Stripe Dashboard → Developers → Webhooks**
2. Cliquer **Add endpoint**
3. URL: `https://votre-domaine.com/webhook/stripe-webhook/{project_id}`
4. Selectionner les events selon la phase implementee
5. Copier le **Signing secret** (`whsec_xxx`)
6. Enregistrer via `/webhook/stripe-register-project`

---

## 7. Questions ouvertes

- [ ] Faut-il une table locale `stripe_customers` pour le mapping discord_user_id ↔ stripe_customer_id ?
- [ ] Notifications Discord: DM ou channel specifique ?
- [ ] Retry policy pour les appels API echoues ?
- [ ] Dashboard admin pour voir les events ?

---

## 8. References

- [Stripe Webhook Events](https://stripe.com/docs/api/events/types)
- [Stripe Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Stripe Signature Verification](https://stripe.com/docs/webhooks/signatures)
