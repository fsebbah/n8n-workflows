# Stripe Implementation Roadmap

**Date:** 2026-01-03
**Status:** In Progress (Phase 1, 2 & 3 Complete)
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

## Phase 1: Workflows n8n (Proxy Stripe) ✅ COMPLETED

> **Status:** Completed (PR #174 merged)
> **Files:** `workflows/Stripe/subscription-*.json`

### Issue #1: `subscription-checkout-create` ✅

- [x] Create webhook trigger node (`POST /webhook/subscription-checkout-create`)
- [x] Add SQLite node to fetch project config by `project_id`
- [x] Add HTTP Request node to create Stripe Checkout session
- [x] Handle conditional options (trial, coupon, promotion codes)
- [x] Return checkout URL to caller
- [x] Add error handling

### Issue #2: `subscription-webhook-handler` ✅

- [x] Create webhook trigger node (`POST /webhook/stripe-events`)
- [x] Add Code node for Stripe signature verification
- [x] Parse event type and extract metadata
- [x] For invoice events, fetch subscription to get metadata
- [x] Route to appropriate callback URL based on event type
- [x] Return 200 OK to Stripe

### Issue #3: `subscription-cancel` ✅

- [x] Create webhook trigger node (`POST /webhook/subscription-cancel`)
- [x] Fetch project config from SQLite
- [x] Call Stripe API to cancel subscription
- [x] Return success/failure

### Issue #4: `subscription-change-plan` ✅

- [x] Create webhook trigger node (`POST /webhook/subscription-change-plan`)
- [x] Fetch project config from SQLite
- [x] Update subscription via Stripe API
- [x] Handle proration
- [x] Return success/failure

---

## Phase 2: Torah Integration ✅ COMPLETED

> **Status:** Completed
> **Files:**
> - `scripts/torah/migrate-stripe-columns.sql`
> - `scripts/torah/migrate-stripe.sh`
> - `workflows/Torah/torah-sub-*.json`
> - `docs/torah/discord-subscribe-integration.md`

### Issue #5: Torah Database Migration ✅

- [x] Create migration script (`scripts/torah/migrate-stripe-columns.sql`)
- [x] Add columns: `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`, `subscription_plan`
- [x] Create `payment_history` table with full tracking
- [x] Create bash wrapper (`scripts/torah/migrate-stripe.sh`)

### Issue #6: Torah Callback Workflows ✅

- [x] `torah-sub-success`: Update DB, add credits, send welcome DM
- [x] `torah-sub-renewal`: Add monthly credits, update period end, log payment
- [x] `torah-sub-cancel`: Set status canceled, plan to free, send DM
- [x] `torah-sub-failure`: Set status past_due, log failure, send warning DM

### Issue #7: Discord Bot `/subscribe` Command ✅

- [x] Documentation for `/subscribe` command with n8n integration
- [x] `SubscribeView` with Stripe Checkout button
- [x] `/cancel-subscription` command documentation
- [x] `/subscription-status` command documentation
- [x] Database helper functions
- [x] Webhook configuration documentation

---

## Phase 3: MCP Integration ✅ COMPLETED

> **Status:** Completed
> **Files:**
> - `scripts/mcp/migrate-stripe-columns.sql`
> - `scripts/mcp/migrate-stripe.sh`
> - `workflows/MCP/mcp-sub-*.json`

### Issue #8: MCP Database Setup ✅

- [x] Create PostgreSQL migration script (`scripts/mcp/migrate-stripe-columns.sql`)
- [x] Create tables: `mcp_users`, `mcp_api_usage`, `mcp_payment_history`, `mcp_api_keys`
- [x] Add Stripe columns: `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`
- [x] Add rate limiting columns: `rate_limit_per_minute`, `rate_limit_per_day`
- [x] Add credits system: `credits`, `credits_used_this_month`, `credits_reset_date`
- [x] Create API key generation function
- [x] Create bash wrapper script (`scripts/mcp/migrate-stripe.sh`)

### Issue #9: MCP Callback Workflows ✅

- [x] `mcp-sub-success`: Create user, generate API key, add credits
- [x] `mcp-sub-renewal`: Add monthly credits, reset usage counters
- [x] `mcp-sub-cancel`: Downgrade to free tier, reduce rate limits
- [x] `mcp-sub-failure`: Set status to past_due, log failure

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
