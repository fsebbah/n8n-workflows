-- =============================================================================
-- MCP Stripe Integration - Database Migration
-- =============================================================================
-- This migration adds Stripe subscription support to the MCP users system.
-- Run this on your PostgreSQL database for MCP.
--
-- Usage:
--   psql -h localhost -U mcp_user -d mcp_db -f migrate-stripe-columns.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: mcp_users
-- Main user table for MCP API access
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_users (
    id SERIAL PRIMARY KEY,

    -- User identification
    email VARCHAR(255) UNIQUE NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    api_key_hash VARCHAR(128),

    -- Profile
    name VARCHAR(255),
    company VARCHAR(255),

    -- Stripe integration
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    subscription_status VARCHAR(50) DEFAULT 'free',
    subscription_plan VARCHAR(50) DEFAULT 'free',
    current_period_end TIMESTAMP,

    -- Credits system
    credits INTEGER DEFAULT 100,
    credits_used_this_month INTEGER DEFAULT 0,
    credits_reset_date TIMESTAMP DEFAULT NOW() + INTERVAL '1 month',

    -- Usage limits
    rate_limit_per_minute INTEGER DEFAULT 10,
    rate_limit_per_day INTEGER DEFAULT 100,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_api_call TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mcp_users_api_key ON mcp_users(api_key);
CREATE INDEX IF NOT EXISTS idx_mcp_users_email ON mcp_users(email);
CREATE INDEX IF NOT EXISTS idx_mcp_users_stripe_customer ON mcp_users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_mcp_users_stripe_subscription ON mcp_users(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_mcp_users_subscription_status ON mcp_users(subscription_status);

-- -----------------------------------------------------------------------------
-- Table: mcp_api_usage
-- Track API usage per user per tool
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_api_usage (
    id SERIAL PRIMARY KEY,

    -- User reference
    user_id INTEGER REFERENCES mcp_users(id) ON DELETE CASCADE,
    api_key VARCHAR(64) NOT NULL,

    -- Tool information
    tool_name VARCHAR(100) NOT NULL,
    tool_endpoint VARCHAR(255),

    -- Usage metrics
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    credits_consumed INTEGER DEFAULT 1,

    -- Request details
    request_id VARCHAR(64),
    response_status INTEGER,
    response_time_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for usage queries
CREATE INDEX IF NOT EXISTS idx_mcp_usage_user ON mcp_api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_api_key ON mcp_api_usage(api_key);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_tool ON mcp_api_usage(tool_name);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_date ON mcp_api_usage(created_at);

-- -----------------------------------------------------------------------------
-- Table: mcp_payment_history
-- Track all payment events from Stripe
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_payment_history (
    id SERIAL PRIMARY KEY,

    -- User reference
    user_id INTEGER REFERENCES mcp_users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,

    -- Stripe references
    stripe_customer_id VARCHAR(255),
    stripe_payment_id VARCHAR(255),
    stripe_invoice_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),

    -- Payment details
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'eur',
    status VARCHAR(50) NOT NULL,
    plan VARCHAR(50),
    billing_reason VARCHAR(50),

    -- Period
    period_start TIMESTAMP,
    period_end TIMESTAMP,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mcp_payment_user ON mcp_payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_payment_email ON mcp_payment_history(email);
CREATE INDEX IF NOT EXISTS idx_mcp_payment_stripe_customer ON mcp_payment_history(stripe_customer_id);

-- -----------------------------------------------------------------------------
-- Table: mcp_api_keys
-- Store multiple API keys per user (for rotation/revocation)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_api_keys (
    id SERIAL PRIMARY KEY,

    -- User reference
    user_id INTEGER REFERENCES mcp_users(id) ON DELETE CASCADE,

    -- Key details
    api_key VARCHAR(64) UNIQUE NOT NULL,
    api_key_prefix VARCHAR(8) NOT NULL,
    name VARCHAR(100) DEFAULT 'Default',

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mcp_keys_user ON mcp_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_keys_key ON mcp_api_keys(api_key);

-- -----------------------------------------------------------------------------
-- Function: Update updated_at timestamp
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_mcp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_mcp_users_updated ON mcp_users;
CREATE TRIGGER trigger_mcp_users_updated
    BEFORE UPDATE ON mcp_users
    FOR EACH ROW
    EXECUTE FUNCTION update_mcp_updated_at();

DROP TRIGGER IF EXISTS trigger_mcp_payment_updated ON mcp_payment_history;
CREATE TRIGGER trigger_mcp_payment_updated
    BEFORE UPDATE ON mcp_payment_history
    FOR EACH ROW
    EXECUTE FUNCTION update_mcp_updated_at();

-- -----------------------------------------------------------------------------
-- Function: Generate API key
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_mcp_api_key()
RETURNS VARCHAR(64) AS $$
DECLARE
    key_chars VARCHAR(62) := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    result VARCHAR(64) := 'mcp_';
    i INTEGER;
BEGIN
    FOR i IN 1..56 LOOP
        result := result || substr(key_chars, floor(random() * 62 + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- View: User subscription summary
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW mcp_user_summary AS
SELECT
    u.id,
    u.email,
    u.name,
    u.subscription_plan,
    u.subscription_status,
    u.credits,
    u.credits_used_this_month,
    u.credits - u.credits_used_this_month AS credits_remaining,
    u.current_period_end,
    u.is_active,
    u.created_at,
    COUNT(DISTINCT k.id) AS api_key_count,
    COALESCE(SUM(a.credits_consumed), 0) AS total_credits_consumed
FROM mcp_users u
LEFT JOIN mcp_api_keys k ON u.id = k.user_id AND k.is_active = true
LEFT JOIN mcp_api_usage a ON u.id = a.user_id
GROUP BY u.id;

-- =============================================================================
-- Sample data for testing (optional)
-- =============================================================================
-- INSERT INTO mcp_users (email, api_key, name, subscription_plan, credits)
-- VALUES ('test@example.com', generate_mcp_api_key(), 'Test User', 'free', 100);
