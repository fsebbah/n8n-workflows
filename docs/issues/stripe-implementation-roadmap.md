# Stripe Implementation Roadmap

**Date:** 2026-01-02
**Status:** In Progress
**Related:** [stripe-integration.md](./stripe-integration.md)

---

## Overview

This document tracks the remaining implementation tasks for the Stripe integration with n8n as a proxy.

## Completed

- [x] Architecture design (Option D: Isolation totale)
- [x] Documentation complète (`docs/issues/stripe-integration.md`)
- [x] Scripts CLI de gestion des projets Stripe
  - [x] `init-db.sh` - Initialisation SQLite
  - [x] `manage-projects.sh` - Gestion des projets
  - [x] `validate-config.sh` - Validation de configuration
- [x] Documentation des scripts (`docs/stripe/`)

---

## Phase 1: Workflows n8n (Proxy Stripe)

### Issue #1: `subscription-checkout-create`

**Priority:** High
**Estimation:** Medium complexity

**Description:**
Create the n8n workflow that receives checkout requests from services and creates Stripe Checkout sessions.

**Tasks:**
- [ ] Create webhook trigger node (`POST /webhook/subscription-checkout-create`)
- [ ] Add SQLite node to fetch project config by `project_id`
- [ ] Add HTTP Request node to create Stripe Checkout session
- [ ] Handle conditional options (trial, coupon, promotion codes)
- [ ] Return checkout URL to caller
- [ ] Add error handling

**Input Expected:**
```json
{
  "project_id": "torah",
  "price_id": "price_xxx",
  "customer_email": "user@example.com",
  "callbacks": {
    "success": "http://n8n.local:5678/webhook/torah-sub-success",
    "renewal": "http://n8n.local:5678/webhook/torah-sub-renewal"
  },
  "urls": {
    "success": "https://...",
    "cancel": "https://..."
  },
  "metadata": { ... },
  "options": {
    "trial_days": 7,
    "coupon_code": null
  }
}
```

**Output Expected:**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/...",
  "session_id": "cs_xxx"
}
```

---

### Issue #2: `subscription-webhook-handler`

**Priority:** High
**Estimation:** High complexity

**Description:**
Create the n8n workflow that receives Stripe webhooks and routes events to the appropriate service callbacks.

**Tasks:**
- [ ] Create webhook trigger node (`POST /webhook/stripe-events`)
- [ ] Add Code node for Stripe signature verification
- [ ] Parse event type and extract metadata
- [ ] For invoice events, fetch subscription to get metadata
- [ ] Route to appropriate callback URL based on event type
- [ ] Return 200 OK to Stripe

**Events to Handle:**
| Event | Callback |
|-------|----------|
| `checkout.session.completed` | `callback_success` |
| `invoice.payment_succeeded` | `callback_renewal` |
| `invoice.payment_failed` | `callback_failure` |
| `customer.subscription.deleted` | `callback_cancel` |
| `customer.subscription.updated` | `callback_success` |

**Security:**
- Must verify Stripe signature using `STRIPE_WEBHOOK_SECRET`
- Reject requests with invalid signatures (return 400)

---

### Issue #3: `subscription-cancel`

**Priority:** Medium
**Estimation:** Low complexity

**Description:**
Create workflow to cancel a subscription (immediately or at period end).

**Tasks:**
- [ ] Create webhook trigger node (`POST /webhook/subscription-cancel`)
- [ ] Fetch project config from SQLite
- [ ] Call Stripe API to cancel subscription
- [ ] Return success/failure

**Input:**
```json
{
  "project_id": "torah",
  "stripe_subscription_id": "sub_xxx",
  "cancel_immediately": false
}
```

---

### Issue #4: `subscription-change-plan`

**Priority:** Medium
**Estimation:** Low complexity

**Description:**
Create workflow to upgrade/downgrade a subscription.

**Tasks:**
- [ ] Create webhook trigger node (`POST /webhook/subscription-change-plan`)
- [ ] Fetch project config from SQLite
- [ ] Update subscription via Stripe API
- [ ] Handle proration
- [ ] Return success/failure

**Input:**
```json
{
  "project_id": "torah",
  "stripe_subscription_id": "sub_xxx",
  "new_price_id": "price_unlimited_xxx",
  "proration_behavior": "create_prorations"
}
```

---

## Phase 2: Torah Integration

### Issue #5: Torah Database Migration

**Priority:** High
**Estimation:** Low complexity

**Description:**
Add Stripe-related columns to Torah's `subscribers` table.

**Tasks:**
- [ ] Create migration script
- [ ] Add columns: `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`
- [ ] Create `payment_history` table
- [ ] Test migration on dev environment
- [ ] Deploy to production

**SQL:**
```sql
ALTER TABLE subscribers ADD COLUMN stripe_customer_id VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN stripe_subscription_id VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN subscription_status VARCHAR(50);
ALTER TABLE subscribers ADD COLUMN current_period_end TIMESTAMP;

CREATE TABLE payment_history (
    id SERIAL PRIMARY KEY,
    discord_user_id VARCHAR(50) NOT NULL,
    stripe_payment_id VARCHAR(255),
    amount_cents INTEGER,
    currency VARCHAR(3) DEFAULT 'eur',
    status VARCHAR(50),
    plan VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### Issue #6: Torah Callback Workflows

**Priority:** High
**Estimation:** Medium complexity

**Description:**
Create Torah-specific callback workflows.

**Tasks:**
- [ ] `torah-sub-success`: Update DB, add credits, notify Discord
- [ ] `torah-sub-renewal`: Add monthly credits, update period end
- [ ] `torah-sub-cancel`: Downgrade to free, archive private room
- [ ] `torah-sub-failure`: Notify user, handle grace period

---

### Issue #7: Discord Bot `/subscribe` Command

**Priority:** High
**Estimation:** Medium complexity

**Description:**
Modify the Discord bot to integrate with the new Stripe system.

**Tasks:**
- [ ] Update `/subscribe` command to call n8n workflow
- [ ] Create `PaymentLinkView` with Stripe Checkout button
- [ ] Add `/cancel-subscription` command
- [ ] Add `/subscription-status` command
- [ ] Handle multi-platform user identification

---

## Phase 3: MCP Integration

### Issue #8: MCP Database Setup

**Priority:** Medium
**Estimation:** Low complexity

**Description:**
Create or update MCP user tables for subscription support.

---

### Issue #9: MCP Callback Workflows

**Priority:** Medium
**Estimation:** Medium complexity

**Description:**
Create MCP-specific callback workflows.

---

## Phase 4: Production & Monitoring

### Issue #10: Stripe Dashboard Configuration

**Priority:** High
**Estimation:** Low complexity

**Tasks:**
- [ ] Create products in Stripe Dashboard
- [ ] Create prices (EUR, USD if needed)
- [ ] Configure webhook endpoint
- [ ] Note all `price_xxx` IDs
- [ ] Test with test cards

---

### Issue #11: Environment Configuration

**Priority:** High
**Estimation:** Low complexity

**Tasks:**
- [ ] Add `STRIPE_SECRET_KEY` to n8n environment
- [ ] Add `STRIPE_WEBHOOK_SECRET` to n8n environment
- [ ] Configure projects in SQLite using `manage-projects.sh`
- [ ] Validate with `validate-config.sh`

---

### Issue #12: Monitoring & Alerts

**Priority:** Medium
**Estimation:** Medium complexity

**Tasks:**
- [ ] Set up Stripe webhook monitoring
- [ ] Create n8n workflow for failed payment alerts
- [ ] Set up logging for payment events
- [ ] Create dashboard for subscription metrics

---

## Phase 5: Multi-Platform Support (Future)

### Issue #13: User Identity Mapping

**Priority:** Low (Future)
**Estimation:** High complexity

**Description:**
Implement multi-platform user identity system as described in section 9.13 of the integration document.

**Tasks:**
- [ ] Create `torah_users` table
- [ ] Create `torah_user_identities` table
- [ ] Create `link_codes` table
- [ ] Implement `/link` command on Discord
- [ ] Implement `/link` command on Telegram
- [ ] Update subscription flow to use internal user ID

---

## Priority Order

1. **Phase 1** - Core workflows (Issues #1-4)
2. **Phase 2** - Torah integration (Issues #5-7)
3. **Phase 4** - Production setup (Issues #10-11)
4. **Phase 3** - MCP integration (Issues #8-9)
5. **Phase 4** - Monitoring (Issue #12)
6. **Phase 5** - Multi-platform (Issue #13)

---

## Dependencies

```
Issue #10 (Stripe Dashboard)
    │
    ├── Issue #11 (Environment Config)
    │       │
    │       └── Issue #1 (checkout-create)
    │               │
    │               └── Issue #2 (webhook-handler)
    │                       │
    │                       ├── Issue #5 (Torah DB Migration)
    │                       │       │
    │                       │       └── Issue #6 (Torah Callbacks)
    │                       │               │
    │                       │               └── Issue #7 (Discord Bot)
    │                       │
    │                       └── Issue #3, #4 (cancel, change-plan)
    │
    └── Issue #8, #9 (MCP Integration)
```

---

## Notes

- All workflows should be tested with Stripe test keys first
- Use test cards: `4242 4242 4242 4242`
- Document any deviations from the original spec
- Update `stripe-integration.md` if architecture changes
