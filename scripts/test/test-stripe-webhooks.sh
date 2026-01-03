#!/bin/bash
# =============================================================================
# Stripe Webhooks Test Script
# =============================================================================
# Test all Stripe-related n8n workflows with mock payloads.
#
# Usage:
#   ./test-stripe-webhooks.sh [--base-url URL] [--project torah|mcp|all]
#
# Examples:
#   ./test-stripe-webhooks.sh                           # Test all on localhost
#   ./test-stripe-webhooks.sh --base-url http://pi6.local:5678
#   ./test-stripe-webhooks.sh --project torah           # Only Torah workflows
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
BASE_URL="${N8N_WEBHOOK_URL:-http://localhost:5678}"
PROJECT="all"
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --base-url)
            BASE_URL="$2"
            shift 2
            ;;
        --project)
            PROJECT="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--base-url URL] [--project torah|mcp|all] [--verbose]"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Stripe Webhooks Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Base URL: $BASE_URL"
echo "Project:  $PROJECT"
echo ""

# Test counter
PASSED=0
FAILED=0

# Helper function
test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local payload="$3"
    local expected_status="${4:-200}"

    echo -n "Testing $name... "

    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "${BASE_URL}${endpoint}" 2>/dev/null)

    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [[ "$status_code" == "$expected_status" ]]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
        ((PASSED++))
        if $VERBOSE; then
            echo "  Response: $body"
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $status_code, expected $expected_status)"
        ((FAILED++))
        echo "  Response: $body"
    fi
}

# =============================================================================
# Phase 1: Stripe Proxy Workflows
# =============================================================================
echo ""
echo -e "${YELLOW}=== Phase 1: Stripe Proxy Workflows ===${NC}"
echo ""

if [[ "$PROJECT" == "all" ]]; then
    # Test subscription-checkout-create
    test_endpoint "subscription-checkout-create" \
        "/webhook/subscription-checkout-create" \
        '{
            "project_id": "torah",
            "price_id": "price_test_123",
            "customer_email": "test@example.com",
            "callbacks": {
                "success": "http://localhost:5678/webhook/torah-sub-success",
                "renewal": "http://localhost:5678/webhook/torah-sub-renewal",
                "cancel": "http://localhost:5678/webhook/torah-sub-cancel",
                "failure": "http://localhost:5678/webhook/torah-sub-failure"
            },
            "urls": {
                "success": "https://discord.com/channels/@me",
                "cancel": "https://discord.com/channels/@me"
            },
            "metadata": {
                "discord_user_id": "123456789",
                "plan": "premium"
            }
        }'

    # Test subscription-cancel
    test_endpoint "subscription-cancel" \
        "/webhook/subscription-cancel" \
        '{
            "project_id": "torah",
            "stripe_subscription_id": "sub_test_123",
            "cancel_immediately": false
        }'

    # Test subscription-change-plan
    test_endpoint "subscription-change-plan" \
        "/webhook/subscription-change-plan" \
        '{
            "project_id": "torah",
            "stripe_subscription_id": "sub_test_123",
            "new_price_id": "price_unlimited_123",
            "proration_behavior": "create_prorations"
        }'
fi

# =============================================================================
# Phase 2: Torah Callback Workflows
# =============================================================================
if [[ "$PROJECT" == "all" || "$PROJECT" == "torah" ]]; then
    echo ""
    echo -e "${YELLOW}=== Phase 2: Torah Callback Workflows ===${NC}"
    echo ""

    # Test torah-sub-success
    test_endpoint "torah-sub-success" \
        "/webhook/torah-sub-success" \
        '{
            "event_type": "checkout.session.completed",
            "event_id": "evt_test_success_123",
            "data": {
                "customer_id": "cus_test_123",
                "customer_email": "torah-test@example.com",
                "subscription_id": "sub_test_123",
                "amount_total": 999,
                "currency": "eur",
                "metadata": {
                    "discord_user_id": "123456789012345678",
                    "plan": "premium"
                }
            }
        }'

    # Test torah-sub-renewal
    test_endpoint "torah-sub-renewal" \
        "/webhook/torah-sub-renewal" \
        '{
            "event_type": "invoice.payment_succeeded",
            "event_id": "evt_test_renewal_123",
            "data": {
                "customer_id": "cus_test_123",
                "subscription_id": "sub_test_123",
                "invoice_id": "in_test_123",
                "amount_paid": 999,
                "currency": "eur",
                "period_start": 1704067200,
                "period_end": 1706745600,
                "billing_reason": "subscription_cycle"
            }
        }'

    # Test torah-sub-cancel
    test_endpoint "torah-sub-cancel" \
        "/webhook/torah-sub-cancel" \
        '{
            "event_type": "customer.subscription.deleted",
            "event_id": "evt_test_cancel_123",
            "data": {
                "customer_id": "cus_test_123",
                "subscription_id": "sub_test_123",
                "canceled_at": 1704067200
            }
        }'

    # Test torah-sub-failure
    test_endpoint "torah-sub-failure" \
        "/webhook/torah-sub-failure" \
        '{
            "event_type": "invoice.payment_failed",
            "event_id": "evt_test_failure_123",
            "data": {
                "customer_id": "cus_test_123",
                "subscription_id": "sub_test_123",
                "invoice_id": "in_test_123",
                "amount_due": 999,
                "currency": "eur",
                "attempt_count": 1
            }
        }'
fi

# =============================================================================
# Phase 3: MCP Callback Workflows
# =============================================================================
if [[ "$PROJECT" == "all" || "$PROJECT" == "mcp" ]]; then
    echo ""
    echo -e "${YELLOW}=== Phase 3: MCP Callback Workflows ===${NC}"
    echo ""

    # Test mcp-sub-success
    test_endpoint "mcp-sub-success" \
        "/webhook/mcp-sub-success" \
        '{
            "event_type": "checkout.session.completed",
            "event_id": "evt_test_mcp_success_123",
            "data": {
                "customer_id": "cus_mcp_test_123",
                "customer_email": "mcp-test@example.com",
                "subscription_id": "sub_mcp_test_123",
                "amount_total": 499,
                "currency": "eur",
                "metadata": {
                    "plan": "basic",
                    "name": "Test User",
                    "company": "Test Company"
                }
            }
        }'

    # Test mcp-sub-renewal
    test_endpoint "mcp-sub-renewal" \
        "/webhook/mcp-sub-renewal" \
        '{
            "event_type": "invoice.payment_succeeded",
            "event_id": "evt_test_mcp_renewal_123",
            "data": {
                "customer_id": "cus_mcp_test_123",
                "subscription_id": "sub_mcp_test_123",
                "invoice_id": "in_mcp_test_123",
                "amount_paid": 499,
                "currency": "eur",
                "period_start": 1704067200,
                "period_end": 1706745600
            }
        }'

    # Test mcp-sub-cancel
    test_endpoint "mcp-sub-cancel" \
        "/webhook/mcp-sub-cancel" \
        '{
            "event_type": "customer.subscription.deleted",
            "event_id": "evt_test_mcp_cancel_123",
            "data": {
                "customer_id": "cus_mcp_test_123",
                "subscription_id": "sub_mcp_test_123"
            }
        }'

    # Test mcp-sub-failure
    test_endpoint "mcp-sub-failure" \
        "/webhook/mcp-sub-failure" \
        '{
            "event_type": "invoice.payment_failed",
            "event_id": "evt_test_mcp_failure_123",
            "data": {
                "customer_id": "cus_mcp_test_123",
                "subscription_id": "sub_mcp_test_123",
                "invoice_id": "in_mcp_test_123",
                "amount_due": 499,
                "currency": "eur",
                "attempt_count": 2
            }
        }'
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Check the output above.${NC}"
    exit 1
fi
