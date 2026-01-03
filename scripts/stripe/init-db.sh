#!/bin/bash
#
# init-db.sh - Initialize SQLite database for Stripe projects configuration
#
# Usage:
#   ./init-db.sh [OPTIONS]
#
# Options:
#   -p, --path PATH    Path to SQLite database (default: ../../data/stripe-config.db)
#   -f, --force        Force recreation of database (drops existing tables)
#   -h, --help         Show this help message
#
# Examples:
#   ./init-db.sh                              # Create DB with default path
#   ./init-db.sh -p /custom/path/stripe.db   # Create DB at custom path
#   ./init-db.sh --force                      # Recreate DB (WARNING: deletes data)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DB_PATH="${SCRIPT_DIR}/../../data/stripe-config.db"
DB_PATH="$DEFAULT_DB_PATH"
FORCE=false

# Functions
show_help() {
    cat << EOF
${BLUE}Stripe Config DB Initializer${NC}

${YELLOW}Usage:${NC}
  $0 [OPTIONS]

${YELLOW}Options:${NC}
  -p, --path PATH    Path to SQLite database
                     Default: $DEFAULT_DB_PATH
  -f, --force        Force recreation of database (WARNING: drops existing tables)
  -h, --help         Show this help message

${YELLOW}Examples:${NC}
  $0                              # Create DB with default path
  $0 -p /custom/path/stripe.db   # Create DB at custom path
  $0 --force                      # Recreate DB (deletes existing data!)

${YELLOW}What this script creates:${NC}
  - stripe_projects table: Stores Stripe API keys per project
  - Indexes for optimized queries

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
        -p|--path)
            DB_PATH="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Check if sqlite3 is installed
if ! command -v sqlite3 &> /dev/null; then
    log_error "sqlite3 is not installed. Please install it first."
    echo "  Ubuntu/Debian: sudo apt install sqlite3"
    echo "  MacOS: brew install sqlite3"
    exit 1
fi

# Create directory if it doesn't exist
DB_DIR=$(dirname "$DB_PATH")
if [ ! -d "$DB_DIR" ]; then
    log_info "Creating directory: $DB_DIR"
    mkdir -p "$DB_DIR"
fi

# Check if database already exists
if [ -f "$DB_PATH" ]; then
    if [ "$FORCE" = true ]; then
        log_warning "Force mode: Dropping existing tables..."
        sqlite3 "$DB_PATH" "DROP TABLE IF EXISTS stripe_projects;"
        log_success "Existing tables dropped"
    else
        log_warning "Database already exists at: $DB_PATH"
        echo -e "  Use ${YELLOW}--force${NC} to recreate (WARNING: deletes all data)"
        echo -e "  Or use ${YELLOW}manage-projects.sh${NC} to manage existing projects"
        exit 0
    fi
fi

log_info "Creating database at: $DB_PATH"

# Create tables
sqlite3 "$DB_PATH" << 'EOF'
-- Stripe Projects Configuration Table
CREATE TABLE IF NOT EXISTS stripe_projects (
    project_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    webhook_secret TEXT NOT NULL,
    prices TEXT NOT NULL DEFAULT '{}',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for active projects lookup
CREATE INDEX IF NOT EXISTS idx_stripe_projects_active
ON stripe_projects(active);

-- Trigger to update updated_at on modification
CREATE TRIGGER IF NOT EXISTS update_stripe_projects_timestamp
AFTER UPDATE ON stripe_projects
BEGIN
    UPDATE stripe_projects SET updated_at = datetime('now')
    WHERE project_id = NEW.project_id;
END;
EOF

log_success "Database created successfully!"

# Show summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Database initialized!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  ${YELLOW}Path:${NC} $DB_PATH"
echo -e "  ${YELLOW}Tables:${NC} stripe_projects"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Add a project:"
echo -e "     ${GREEN}./manage-projects.sh add -i torah -n \"Torah Bot\" -k sk_xxx -w whsec_xxx -P '{\"basic\":\"price_xxx\"}'${NC}"
echo ""
echo "  2. List projects:"
echo -e "     ${GREEN}./manage-projects.sh list${NC}"
echo ""
echo "  3. Validate configuration:"
echo -e "     ${GREEN}./validate-config.sh${NC}"
echo ""
