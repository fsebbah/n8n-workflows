-- Torah Database Migration: Add Stripe subscription columns
-- Version: 1.0.0
-- Date: 2026-01-03
-- Description: Adds Stripe-related columns to subscribers table and creates payment_history table
--
-- Usage:
--   psql -h <host> -U <user> -d <database> -f migrate-stripe-columns.sql
--
-- Prerequisites:
--   - subscribers table must exist
--   - Backup your database before running this migration
--

-- ============================================================================
-- MIGRATION: Add Stripe columns to subscribers table
-- ============================================================================

-- Add stripe_customer_id column (Stripe customer ID, e.g., cus_xxx)
ALTER TABLE subscribers
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Add stripe_subscription_id column (Stripe subscription ID, e.g., sub_xxx)
ALTER TABLE subscribers
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);

-- Add subscription_status column (active, canceled, past_due, trialing, etc.)
ALTER TABLE subscribers
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'free';

-- Add current_period_end column (when the current billing period ends)
ALTER TABLE subscribers
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP;

-- Add subscription_plan column (free, basic, premium, unlimited)
ALTER TABLE subscribers
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'free';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscribers_stripe_customer_id
ON subscribers(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscribers_stripe_subscription_id
ON subscribers(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscribers_subscription_status
ON subscribers(subscription_status);

-- ============================================================================
-- MIGRATION: Create payment_history table
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_history (
    id SERIAL PRIMARY KEY,

    -- User identification
    discord_user_id VARCHAR(50) NOT NULL,

    -- Stripe references
    stripe_customer_id VARCHAR(255),
    stripe_payment_id VARCHAR(255),
    stripe_invoice_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),

    -- Payment details
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'eur',
    status VARCHAR(50) NOT NULL, -- succeeded, failed, refunded, pending

    -- Subscription info
    plan VARCHAR(50), -- basic, premium, unlimited
    billing_reason VARCHAR(50), -- subscription_create, subscription_cycle, subscription_update

    -- Period info
    period_start TIMESTAMP,
    period_end TIMESTAMP,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for payment_history
CREATE INDEX IF NOT EXISTS idx_payment_history_discord_user_id
ON payment_history(discord_user_id);

CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_customer_id
ON payment_history(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_subscription_id
ON payment_history(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_payment_history_status
ON payment_history(status);

CREATE INDEX IF NOT EXISTS idx_payment_history_created_at
ON payment_history(created_at);

-- Create trigger to update updated_at on modification
CREATE OR REPLACE FUNCTION update_payment_history_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_payment_history_timestamp ON payment_history;
CREATE TRIGGER trigger_update_payment_history_timestamp
    BEFORE UPDATE ON payment_history
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_history_timestamp();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show new columns in subscribers table
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'subscribers'
AND column_name IN ('stripe_customer_id', 'stripe_subscription_id', 'subscription_status', 'current_period_end', 'subscription_plan')
ORDER BY ordinal_position;

-- Show payment_history table structure
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'payment_history'
ORDER BY ordinal_position;

-- ============================================================================
-- DONE
-- ============================================================================
-- Migration completed successfully!
--
-- Next steps:
-- 1. Configure Stripe webhook to point to n8n workflow
-- 2. Add project to Stripe config DB using manage-projects.sh
-- 3. Import Torah callback workflows to n8n
-- 4. Update Discord bot to use new /subscribe command
