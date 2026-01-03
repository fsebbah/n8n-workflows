#!/bin/bash
#
# migrate-stripe.sh - Apply Stripe migration to Torah PostgreSQL database
#
# Usage:
#   ./migrate-stripe.sh [OPTIONS]
#
# Options:
#   -h, --host HOST      PostgreSQL host (default: localhost)
#   -p, --port PORT      PostgreSQL port (default: 5432)
#   -U, --user USER      PostgreSQL user (default: postgres)
#   -d, --dbname DB      Database name (required)
#   -W, --password       Prompt for password
#   --dry-run            Show SQL without executing
#   --help               Show this help message
#
# Examples:
#   ./migrate-stripe.sh -d torah_db
#   ./migrate-stripe.sh -h pi6.local -U torah -d torah_db -W
#   ./migrate-stripe.sh -d torah_db --dry-run
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/migrate-stripe-columns.sql"
PG_HOST="localhost"
PG_PORT="5432"
PG_USER="postgres"
PG_DBNAME=""
PROMPT_PASSWORD=false
DRY_RUN=false

# Functions
show_help() {
    cat << EOF
${BLUE}Torah Stripe Migration Script${NC}

Applies Stripe-related database migrations to the Torah PostgreSQL database.

${YELLOW}Usage:${NC}
  $0 [OPTIONS]

${YELLOW}Options:${NC}
  -h, --host HOST      PostgreSQL host (default: localhost)
  -p, --port PORT      PostgreSQL port (default: 5432)
  -U, --user USER      PostgreSQL user (default: postgres)
  -d, --dbname DB      Database name (required)
  -W, --password       Prompt for password
  --dry-run            Show SQL without executing
  --help               Show this help message

${YELLOW}Examples:${NC}
  $0 -d torah_db
  $0 -h pi6.local -U torah -d torah_db -W
  $0 -d torah_db --dry-run

${YELLOW}What this migration does:${NC}
  1. Adds columns to 'subscribers' table:
     - stripe_customer_id
     - stripe_subscription_id
     - subscription_status
     - subscription_plan
     - current_period_end

  2. Creates 'payment_history' table for tracking payments

${YELLOW}Prerequisites:${NC}
  - PostgreSQL client (psql) installed
  - 'subscribers' table must exist
  - Backup your database before running!

EOF
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--host)
            PG_HOST="$2"
            shift 2
            ;;
        -p|--port)
            PG_PORT="$2"
            shift 2
            ;;
        -U|--user)
            PG_USER="$2"
            shift 2
            ;;
        -d|--dbname)
            PG_DBNAME="$2"
            shift 2
            ;;
        -W|--password)
            PROMPT_PASSWORD=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$PG_DBNAME" ]; then
    log_error "Database name is required. Use -d or --dbname"
    echo "Use --help for usage information"
    exit 1
fi

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    log_error "psql is not installed. Please install PostgreSQL client."
    exit 1
fi

# Check if SQL file exists
if [ ! -f "$SQL_FILE" ]; then
    log_error "SQL file not found: $SQL_FILE"
    exit 1
fi

# Build connection string
PSQL_CMD="psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DBNAME"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Torah Stripe Migration${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  ${YELLOW}Host:${NC}     $PG_HOST"
echo -e "  ${YELLOW}Port:${NC}     $PG_PORT"
echo -e "  ${YELLOW}User:${NC}     $PG_USER"
echo -e "  ${YELLOW}Database:${NC} $PG_DBNAME"
echo -e "  ${YELLOW}Dry Run:${NC}  $DRY_RUN"
echo ""

if [ "$DRY_RUN" = true ]; then
    log_info "Dry run mode - showing SQL without executing:"
    echo ""
    echo -e "${YELLOW}--- SQL Content ---${NC}"
    cat "$SQL_FILE"
    echo -e "${YELLOW}--- End SQL ---${NC}"
    echo ""
    log_info "No changes were made to the database."
    exit 0
fi

# Confirm before proceeding
echo -e "${YELLOW}WARNING:${NC} This will modify your database."
read -p "Have you backed up your database? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    log_warning "Aborted. Please backup your database first."
    exit 0
fi

# Execute migration
log_info "Applying migration..."

if [ "$PROMPT_PASSWORD" = true ]; then
    $PSQL_CMD -f "$SQL_FILE"
else
    PGPASSWORD="${PGPASSWORD:-}" $PSQL_CMD -f "$SQL_FILE"
fi

if [ $? -eq 0 ]; then
    echo ""
    log_success "Migration completed successfully!"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Configure Stripe Dashboard with products and prices"
    echo "  2. Add Torah project to Stripe config:"
    echo -e "     ${GREEN}./scripts/stripe/manage-projects.sh add -i torah ...${NC}"
    echo "  3. Import Torah callback workflows to n8n"
    echo "  4. Update Discord bot with /subscribe command"
else
    log_error "Migration failed!"
    exit 1
fi
