#!/bin/bash
#
# validate-config.sh - Validate Stripe configuration and check for issues
#
# Usage:
#   ./validate-config.sh [OPTIONS]
#
# Options:
#   -d, --db PATH      Path to SQLite database
#   -v, --verbose      Show detailed output
#   -j, --json         Output as JSON
#   --check-stripe     Test connection to Stripe API (requires curl)
#   -h, --help         Show this help
#
# Examples:
#   ./validate-config.sh                  # Basic validation
#   ./validate-config.sh --verbose        # Detailed validation
#   ./validate-config.sh --check-stripe   # Also verify Stripe API keys
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DB_PATH="${SCRIPT_DIR}/../../data/stripe-config.db"
DB_PATH="$DEFAULT_DB_PATH"
VERBOSE=false
JSON_OUTPUT=false
CHECK_STRIPE=false

# Counters
ERRORS=0
WARNINGS=0
PASSED=0

# ============================================================================
# Helper Functions
# ============================================================================

show_help() {
    cat << EOF
${BLUE}${BOLD}Stripe Configuration Validator${NC}

Validates your Stripe projects configuration and identifies potential issues.

${YELLOW}Usage:${NC}
  $0 [OPTIONS]

${YELLOW}Options:${NC}
  -d, --db PATH      Path to SQLite database (default: $DEFAULT_DB_PATH)
  -v, --verbose      Show detailed output for all checks
  -j, --json         Output results as JSON
  --check-stripe     Test actual connection to Stripe API (requires curl)
  -h, --help         Show this help

${YELLOW}Examples:${NC}
  $0                      # Basic validation
  $0 --verbose            # Detailed validation with all checks
  $0 --check-stripe       # Also verify Stripe API keys work
  $0 -d /path/to/db.db    # Validate specific database

${YELLOW}Checks Performed:${NC}
  - Database existence and accessibility
  - Table structure integrity
  - Required fields populated
  - Secret key format (sk_test_* or sk_live_*)
  - Webhook secret format (whsec_*)
  - Prices JSON validity
  - At least one active project exists
  - No duplicate project IDs
  - Consistency between test/live keys

${YELLOW}Exit Codes:${NC}
  0 - All checks passed
  1 - Errors found (critical issues)
  2 - Warnings only (non-critical issues)

EOF
}

log_check() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[CHECK]${NC} $1"
    fi
}

log_pass() {
    ((PASSED++))
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
    ((WARNINGS++))
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_fail() {
    ((ERRORS++))
    echo -e "${RED}[FAIL]${NC} $1"
}

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

# ============================================================================
# Parse Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--db)
            DB_PATH="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -j|--json)
            JSON_OUTPUT=true
            shift
            ;;
        --check-stripe)
            CHECK_STRIPE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# ============================================================================
# Validation Functions
# ============================================================================

check_database_exists() {
    log_check "Database file exists"

    if [ ! -f "$DB_PATH" ]; then
        log_fail "Database not found at: $DB_PATH"
        echo "       Run './init-db.sh' to create the database"
        return 1
    fi

    log_pass "Database exists: $DB_PATH"
    return 0
}

check_database_readable() {
    log_check "Database is readable"

    if ! sqlite3 "$DB_PATH" "SELECT 1;" &>/dev/null; then
        log_fail "Cannot read database: $DB_PATH"
        return 1
    fi

    log_pass "Database is readable"
    return 0
}

check_table_exists() {
    log_check "Required tables exist"

    local tables
    tables=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='stripe_projects';")

    if [ -z "$tables" ]; then
        log_fail "Table 'stripe_projects' not found"
        echo "       Run './init-db.sh' to create the tables"
        return 1
    fi

    log_pass "Table 'stripe_projects' exists"
    return 0
}

check_table_structure() {
    log_check "Table structure is correct"

    local required_columns=("project_id" "display_name" "secret_key" "webhook_secret" "prices" "active")
    local actual_columns
    actual_columns=$(sqlite3 "$DB_PATH" "PRAGMA table_info(stripe_projects);" | cut -d'|' -f2)

    local missing=()
    for col in "${required_columns[@]}"; do
        if ! echo "$actual_columns" | grep -q "^${col}$"; then
            missing+=("$col")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_fail "Missing columns: ${missing[*]}"
        return 1
    fi

    log_pass "All required columns present"
    return 0
}

check_has_projects() {
    log_check "At least one project configured"

    local count
    count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM stripe_projects;")

    if [ "$count" -eq 0 ]; then
        log_fail "No projects configured"
        echo "       Run './manage-projects.sh add' to add a project"
        return 1
    fi

    log_pass "Found $count project(s)"
    return 0
}

check_has_active_projects() {
    log_check "At least one active project"

    local count
    count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM stripe_projects WHERE active = 1;")

    if [ "$count" -eq 0 ]; then
        log_warn "No active projects found"
        echo "       Use './manage-projects.sh update <id> --activate' to activate"
        return 1
    fi

    log_pass "Found $count active project(s)"
    return 0
}

check_secret_key_format() {
    log_check "Secret key format validation"

    local invalid
    invalid=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE secret_key NOT LIKE 'sk_test_%' AND secret_key NOT LIKE 'sk_live_%';")

    if [ -n "$invalid" ]; then
        log_warn "Invalid secret key format for: $invalid"
        echo "       Expected format: sk_test_* or sk_live_*"
        return 1
    fi

    log_pass "All secret keys have valid format"
    return 0
}

check_webhook_secret_format() {
    log_check "Webhook secret format validation"

    local invalid
    invalid=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE webhook_secret NOT LIKE 'whsec_%';")

    if [ -n "$invalid" ]; then
        log_warn "Invalid webhook secret format for: $invalid"
        echo "       Expected format: whsec_*"
        return 1
    fi

    log_pass "All webhook secrets have valid format"
    return 0
}

check_prices_json() {
    log_check "Prices JSON validity"

    local projects
    projects=$(sqlite3 -separator '|' "$DB_PATH" "SELECT project_id, prices FROM stripe_projects;")

    local invalid_projects=()

    while IFS='|' read -r project_id prices; do
        if ! echo "$prices" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
            invalid_projects+=("$project_id")
        fi
    done <<< "$projects"

    if [ ${#invalid_projects[@]} -gt 0 ]; then
        log_fail "Invalid JSON in prices for: ${invalid_projects[*]}"
        return 1
    fi

    log_pass "All prices are valid JSON"
    return 0
}

check_prices_not_empty() {
    log_check "Prices are defined"

    local empty
    empty=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE prices = '{}' OR prices = '' OR prices IS NULL;")

    if [ -n "$empty" ]; then
        log_warn "Empty prices for: $empty"
        echo "       Use './manage-projects.sh update <id> -P '{...}'' to add prices"
        return 1
    fi

    log_pass "All projects have prices defined"
    return 0
}

check_env_consistency() {
    log_check "Environment consistency (test vs live)"

    local test_keys
    local live_keys

    test_keys=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE active = 1 AND secret_key LIKE 'sk_test_%';")
    live_keys=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE active = 1 AND secret_key LIKE 'sk_live_%';")

    if [ -n "$test_keys" ] && [ -n "$live_keys" ]; then
        log_warn "Mixed test and live keys detected"
        echo "       Test mode: $test_keys"
        echo "       Live mode: $live_keys"
        echo "       Consider using consistent environments"
        return 1
    fi

    if [ -n "$test_keys" ]; then
        log_pass "All active projects use TEST keys"
        log_info "Projects in test mode: $test_keys"
    elif [ -n "$live_keys" ]; then
        log_pass "All active projects use LIVE keys"
    fi

    return 0
}

check_stripe_api() {
    if [ "$CHECK_STRIPE" != true ]; then
        return 0
    fi

    log_check "Stripe API connectivity"

    if ! command -v curl &> /dev/null; then
        log_warn "curl not installed, skipping API check"
        return 1
    fi

    local projects
    projects=$(sqlite3 -separator '|' "$DB_PATH" "SELECT project_id, secret_key FROM stripe_projects WHERE active = 1;")

    local failed=()

    while IFS='|' read -r project_id secret_key; do
        [ -z "$project_id" ] && continue

        local response
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -u "$secret_key:" \
            "https://api.stripe.com/v1/balance" 2>/dev/null)

        if [ "$response" = "200" ]; then
            if [ "$VERBOSE" = true ]; then
                echo -e "  ${GREEN}✓${NC} $project_id: API key valid"
            fi
        else
            failed+=("$project_id (HTTP $response)")
        fi
    done <<< "$projects"

    if [ ${#failed[@]} -gt 0 ]; then
        log_fail "Stripe API connection failed for: ${failed[*]}"
        return 1
    fi

    log_pass "All Stripe API keys are valid"
    return 0
}

check_required_fields() {
    log_check "Required fields populated"

    local missing
    missing=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE
        project_id IS NULL OR project_id = '' OR
        display_name IS NULL OR display_name = '' OR
        secret_key IS NULL OR secret_key = '' OR
        webhook_secret IS NULL OR webhook_secret = '';")

    if [ -n "$missing" ]; then
        log_fail "Missing required fields for: $missing"
        return 1
    fi

    log_pass "All required fields are populated"
    return 0
}

# ============================================================================
# Summary Functions
# ============================================================================

show_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BOLD}Validation Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}   $PASSED"
    echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
    echo -e "  ${RED}Errors:${NC}   $ERRORS"
    echo ""

    if [ $ERRORS -gt 0 ]; then
        echo -e "${RED}${BOLD}Configuration has ERRORS that must be fixed.${NC}"
        return 1
    elif [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}${BOLD}Configuration has warnings (review recommended).${NC}"
        return 2
    else
        echo -e "${GREEN}${BOLD}Configuration is valid!${NC}"
        return 0
    fi
}

show_json_summary() {
    local status="ok"
    if [ $ERRORS -gt 0 ]; then
        status="error"
    elif [ $WARNINGS -gt 0 ]; then
        status="warning"
    fi

    cat << EOF
{
  "status": "$status",
  "passed": $PASSED,
  "warnings": $WARNINGS,
  "errors": $ERRORS,
  "database": "$DB_PATH"
}
EOF
}

show_project_summary() {
    echo ""
    echo -e "${BLUE}Projects Overview${NC}"
    echo -e "${BLUE}==================${NC}"
    echo ""

    sqlite3 -header -column "$DB_PATH" "SELECT
        project_id AS 'ID',
        display_name AS 'Name',
        CASE
            WHEN secret_key LIKE 'sk_test_%' THEN 'TEST'
            WHEN secret_key LIKE 'sk_live_%' THEN 'LIVE'
            ELSE 'UNKNOWN'
        END AS 'Mode',
        CASE WHEN active = 1 THEN 'Yes' ELSE 'No' END AS 'Active',
        (SELECT COUNT(*) FROM json_each(prices)) AS 'Prices'
    FROM stripe_projects
    ORDER BY active DESC, project_id;" 2>/dev/null || \
    sqlite3 -header -column "$DB_PATH" "SELECT
        project_id AS 'ID',
        display_name AS 'Name',
        CASE WHEN active = 1 THEN 'Yes' ELSE 'No' END AS 'Active'
    FROM stripe_projects
    ORDER BY active DESC, project_id;"

    echo ""
}

# ============================================================================
# Main
# ============================================================================

if [ "$JSON_OUTPUT" != true ]; then
    echo ""
    echo -e "${BLUE}${BOLD}Stripe Configuration Validator${NC}"
    echo -e "${BLUE}===============================${NC}"
    echo ""
    echo -e "Database: ${CYAN}$DB_PATH${NC}"
    echo ""
fi

# Run all checks
check_database_exists || true
check_database_readable || exit 1
check_table_exists || exit 1
check_table_structure || true
check_has_projects || true
check_has_active_projects || true
check_required_fields || true
check_secret_key_format || true
check_webhook_secret_format || true
check_prices_json || true
check_prices_not_empty || true
check_env_consistency || true
check_stripe_api || true

# Show results
if [ "$JSON_OUTPUT" = true ]; then
    show_json_summary
else
    if [ "$VERBOSE" = true ] && [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        show_project_summary
    fi
    show_summary
fi

# Exit with appropriate code
if [ $ERRORS -gt 0 ]; then
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    exit 2
else
    exit 0
fi
