#!/bin/bash
#
# manage-projects.sh - Manage Stripe project configurations
#
# Usage:
#   ./manage-projects.sh <COMMAND> [OPTIONS]
#
# Commands:
#   add       Add a new Stripe project
#   list      List all projects
#   get       Get details of a specific project
#   update    Update an existing project
#   remove    Deactivate a project (soft delete)
#   delete    Permanently delete a project
#
# Run './manage-projects.sh <COMMAND> --help' for command-specific options.
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

# ============================================================================
# Helper Functions
# ============================================================================

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

check_db_exists() {
    if [ ! -f "$DB_PATH" ]; then
        log_error "Database not found at: $DB_PATH"
        echo -e "  Run ${GREEN}./init-db.sh${NC} first to create the database."
        exit 1
    fi
}

validate_project_id() {
    local id="$1"
    if [[ ! "$id" =~ ^[a-z0-9_-]+$ ]]; then
        log_error "Invalid project_id: '$id'"
        echo "  Project ID must contain only lowercase letters, numbers, underscores, and hyphens."
        exit 1
    fi
}

validate_secret_key() {
    local key="$1"
    if [[ ! "$key" =~ ^sk_(test|live)_ ]]; then
        log_warning "Secret key doesn't match expected format (sk_test_* or sk_live_*)"
        read -p "Continue anyway? [y/N]: " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

validate_webhook_secret() {
    local secret="$1"
    if [[ ! "$secret" =~ ^whsec_ ]]; then
        log_warning "Webhook secret doesn't match expected format (whsec_*)"
        read -p "Continue anyway? [y/N]: " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

validate_json() {
    local json="$1"
    if ! echo "$json" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
        log_error "Invalid JSON format for prices"
        echo "  Example: '{\"basic\": \"price_xxx\", \"premium\": \"price_yyy\"}'"
        exit 1
    fi
}

mask_secret() {
    local secret="$1"
    local len=${#secret}
    if [ $len -gt 12 ]; then
        echo "${secret:0:7}...${secret: -4}"
    else
        echo "***"
    fi
}

# ============================================================================
# Command: add
# ============================================================================

show_add_help() {
    cat << EOF
${BLUE}Add a new Stripe project${NC}

${YELLOW}Usage:${NC}
  $0 add [OPTIONS]

${YELLOW}Required Options:${NC}
  -i, --id ID              Project identifier (lowercase, no spaces)
  -n, --name NAME          Display name for the project
  -k, --key KEY            Stripe secret key (sk_test_* or sk_live_*)
  -w, --webhook SECRET     Stripe webhook secret (whsec_*)

${YELLOW}Optional:${NC}
  -P, --prices JSON        Prices mapping as JSON (default: '{}')
  -d, --db PATH            Path to database (default: $DEFAULT_DB_PATH)
  -h, --help               Show this help

${YELLOW}Examples:${NC}
  # Add Torah project
  $0 add -i torah -n "Torah Bot" -k sk_live_xxx -w whsec_xxx \\
    -P '{"basic": "price_basic_xxx", "premium": "price_premium_xxx"}'

  # Add MCP project
  $0 add -i mcp -n "MCP Tools" -k sk_live_yyy -w whsec_yyy \\
    -P '{"pro": "price_pro_xxx"}'

  # Add with test keys
  $0 add -i myproject -n "My Project" \\
    -k sk_test_abc123 -w whsec_test_xyz789 \\
    -P '{"starter": "price_starter"}'

EOF
}

cmd_add() {
    local project_id=""
    local display_name=""
    local secret_key=""
    local webhook_secret=""
    local prices="{}"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -i|--id)
                project_id="$2"
                shift 2
                ;;
            -n|--name)
                display_name="$2"
                shift 2
                ;;
            -k|--key)
                secret_key="$2"
                shift 2
                ;;
            -w|--webhook)
                webhook_secret="$2"
                shift 2
                ;;
            -P|--prices)
                prices="$2"
                shift 2
                ;;
            -d|--db)
                DB_PATH="$2"
                shift 2
                ;;
            -h|--help)
                show_add_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use '$0 add --help' for usage information"
                exit 1
                ;;
        esac
    done

    # Validate required fields
    if [ -z "$project_id" ]; then
        log_error "Missing required option: -i/--id"
        show_add_help
        exit 1
    fi
    if [ -z "$display_name" ]; then
        log_error "Missing required option: -n/--name"
        show_add_help
        exit 1
    fi
    if [ -z "$secret_key" ]; then
        log_error "Missing required option: -k/--key"
        show_add_help
        exit 1
    fi
    if [ -z "$webhook_secret" ]; then
        log_error "Missing required option: -w/--webhook"
        show_add_help
        exit 1
    fi

    check_db_exists
    validate_project_id "$project_id"
    validate_secret_key "$secret_key"
    validate_webhook_secret "$webhook_secret"
    validate_json "$prices"

    # Check if project already exists
    local existing
    existing=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE project_id = '$project_id';")
    if [ -n "$existing" ]; then
        log_error "Project '$project_id' already exists"
        echo "  Use 'update' command to modify or 'delete' to remove first."
        exit 1
    fi

    # Insert into database
    sqlite3 "$DB_PATH" "INSERT INTO stripe_projects (project_id, display_name, secret_key, webhook_secret, prices) VALUES ('$project_id', '$display_name', '$secret_key', '$webhook_secret', '$prices');"

    log_success "Project '$project_id' added successfully!"
    echo ""
    echo -e "  ${YELLOW}Project ID:${NC}     $project_id"
    echo -e "  ${YELLOW}Display Name:${NC}   $display_name"
    echo -e "  ${YELLOW}Secret Key:${NC}     $(mask_secret "$secret_key")"
    echo -e "  ${YELLOW}Webhook Secret:${NC} $(mask_secret "$webhook_secret")"
    echo -e "  ${YELLOW}Prices:${NC}         $prices"
}

# ============================================================================
# Command: list
# ============================================================================

show_list_help() {
    cat << EOF
${BLUE}List all Stripe projects${NC}

${YELLOW}Usage:${NC}
  $0 list [OPTIONS]

${YELLOW}Options:${NC}
  -a, --all        Include inactive projects
  -j, --json       Output as JSON
  -d, --db PATH    Path to database (default: $DEFAULT_DB_PATH)
  -h, --help       Show this help

${YELLOW}Examples:${NC}
  $0 list              # List active projects
  $0 list --all        # Include inactive projects
  $0 list --json       # Output as JSON

EOF
}

cmd_list() {
    local show_all=false
    local json_output=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--all)
                show_all=true
                shift
                ;;
            -j|--json)
                json_output=true
                shift
                ;;
            -d|--db)
                DB_PATH="$2"
                shift 2
                ;;
            -h|--help)
                show_list_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    check_db_exists

    local where_clause="WHERE active = 1"
    if [ "$show_all" = true ]; then
        where_clause=""
    fi

    if [ "$json_output" = true ]; then
        sqlite3 -json "$DB_PATH" "SELECT project_id, display_name, prices, active, created_at, updated_at FROM stripe_projects $where_clause ORDER BY created_at;"
    else
        echo ""
        echo -e "${BLUE}Stripe Projects${NC}"
        echo -e "${BLUE}===============${NC}"
        echo ""

        local count
        count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM stripe_projects $where_clause;")

        if [ "$count" -eq 0 ]; then
            log_warning "No projects found"
            echo "  Use '$0 add' to add a new project."
            return
        fi

        sqlite3 -header -column "$DB_PATH" "SELECT
            project_id AS 'ID',
            display_name AS 'Name',
            CASE WHEN active = 1 THEN 'Yes' ELSE 'No' END AS 'Active',
            SUBSTR(secret_key, 1, 10) || '...' AS 'Key (masked)',
            created_at AS 'Created'
        FROM stripe_projects $where_clause ORDER BY created_at;"

        echo ""
        echo -e "  ${CYAN}Total: $count project(s)${NC}"
    fi
}

# ============================================================================
# Command: get
# ============================================================================

show_get_help() {
    cat << EOF
${BLUE}Get details of a specific project${NC}

${YELLOW}Usage:${NC}
  $0 get <PROJECT_ID> [OPTIONS]

${YELLOW}Options:${NC}
  -s, --show-secrets   Show full secrets (default: masked)
  -j, --json           Output as JSON
  -d, --db PATH        Path to database (default: $DEFAULT_DB_PATH)
  -h, --help           Show this help

${YELLOW}Examples:${NC}
  $0 get torah                # Get torah project (secrets masked)
  $0 get torah --show-secrets # Get with full secrets visible
  $0 get mcp --json           # Get as JSON

EOF
}

cmd_get() {
    local project_id=""
    local show_secrets=false
    local json_output=false

    # First argument is project_id
    if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
        project_id="$1"
        shift
    fi

    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--show-secrets)
                show_secrets=true
                shift
                ;;
            -j|--json)
                json_output=true
                shift
                ;;
            -d|--db)
                DB_PATH="$2"
                shift 2
                ;;
            -h|--help)
                show_get_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    if [ -z "$project_id" ]; then
        log_error "Missing project ID"
        show_get_help
        exit 1
    fi

    check_db_exists

    local result
    result=$(sqlite3 -json "$DB_PATH" "SELECT * FROM stripe_projects WHERE project_id = '$project_id';")

    if [ "$result" = "[]" ]; then
        log_error "Project '$project_id' not found"
        exit 1
    fi

    if [ "$json_output" = true ]; then
        if [ "$show_secrets" = true ]; then
            echo "$result"
        else
            echo "$result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data:
    item['secret_key'] = item['secret_key'][:10] + '...'
    item['webhook_secret'] = item['webhook_secret'][:10] + '...'
print(json.dumps(data, indent=2))
"
        fi
    else
        echo ""
        echo -e "${BLUE}Project Details: $project_id${NC}"
        echo -e "${BLUE}==============================${NC}"
        echo ""

        local row
        row=$(sqlite3 -separator '|' "$DB_PATH" "SELECT project_id, display_name, secret_key, webhook_secret, prices, active, created_at, updated_at FROM stripe_projects WHERE project_id = '$project_id';")

        IFS='|' read -r pid name skey wsec prices active created updated <<< "$row"

        echo -e "  ${YELLOW}Project ID:${NC}     $pid"
        echo -e "  ${YELLOW}Display Name:${NC}   $name"
        echo -e "  ${YELLOW}Active:${NC}         $([ "$active" = "1" ] && echo "Yes" || echo "No")"
        echo ""

        if [ "$show_secrets" = true ]; then
            echo -e "  ${YELLOW}Secret Key:${NC}     $skey"
            echo -e "  ${YELLOW}Webhook Secret:${NC} $wsec"
        else
            echo -e "  ${YELLOW}Secret Key:${NC}     $(mask_secret "$skey")"
            echo -e "  ${YELLOW}Webhook Secret:${NC} $(mask_secret "$wsec")"
            echo -e "  ${CYAN}(use --show-secrets to reveal)${NC}"
        fi

        echo ""
        echo -e "  ${YELLOW}Prices:${NC}"
        echo "$prices" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for k, v in data.items():
    print(f'    - {k}: {v}')
" 2>/dev/null || echo "    $prices"

        echo ""
        echo -e "  ${YELLOW}Created:${NC}        $created"
        echo -e "  ${YELLOW}Updated:${NC}        $updated"
    fi
}

# ============================================================================
# Command: update
# ============================================================================

show_update_help() {
    cat << EOF
${BLUE}Update an existing Stripe project${NC}

${YELLOW}Usage:${NC}
  $0 update <PROJECT_ID> [OPTIONS]

${YELLOW}Options:${NC}
  -n, --name NAME          Update display name
  -k, --key KEY            Update secret key
  -w, --webhook SECRET     Update webhook secret
  -P, --prices JSON        Update prices mapping
  -a, --activate           Activate the project
  -d, --db PATH            Path to database
  -h, --help               Show this help

${YELLOW}Examples:${NC}
  # Update display name
  $0 update torah -n "Torah Bot Production"

  # Update secret key (rotate)
  $0 update torah -k sk_live_new_xxx

  # Update prices
  $0 update torah -P '{"basic": "price_new_basic", "premium": "price_new_premium"}'

  # Reactivate a disabled project
  $0 update torah --activate

EOF
}

cmd_update() {
    local project_id=""
    local display_name=""
    local secret_key=""
    local webhook_secret=""
    local prices=""
    local activate=false

    # First argument is project_id
    if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
        project_id="$1"
        shift
    fi

    while [[ $# -gt 0 ]]; do
        case $1 in
            -n|--name)
                display_name="$2"
                shift 2
                ;;
            -k|--key)
                secret_key="$2"
                shift 2
                ;;
            -w|--webhook)
                webhook_secret="$2"
                shift 2
                ;;
            -P|--prices)
                prices="$2"
                shift 2
                ;;
            -a|--activate)
                activate=true
                shift
                ;;
            -d|--db)
                DB_PATH="$2"
                shift 2
                ;;
            -h|--help)
                show_update_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    if [ -z "$project_id" ]; then
        log_error "Missing project ID"
        show_update_help
        exit 1
    fi

    check_db_exists

    # Check if project exists
    local existing
    existing=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE project_id = '$project_id';")
    if [ -z "$existing" ]; then
        log_error "Project '$project_id' not found"
        exit 1
    fi

    # Build update query
    local updates=()

    if [ -n "$display_name" ]; then
        updates+=("display_name = '$display_name'")
    fi
    if [ -n "$secret_key" ]; then
        validate_secret_key "$secret_key"
        updates+=("secret_key = '$secret_key'")
    fi
    if [ -n "$webhook_secret" ]; then
        validate_webhook_secret "$webhook_secret"
        updates+=("webhook_secret = '$webhook_secret'")
    fi
    if [ -n "$prices" ]; then
        validate_json "$prices"
        updates+=("prices = '$prices'")
    fi
    if [ "$activate" = true ]; then
        updates+=("active = 1")
    fi

    if [ ${#updates[@]} -eq 0 ]; then
        log_warning "No updates specified"
        show_update_help
        exit 1
    fi

    local update_sql
    update_sql=$(IFS=', '; echo "${updates[*]}")

    sqlite3 "$DB_PATH" "UPDATE stripe_projects SET $update_sql WHERE project_id = '$project_id';"

    log_success "Project '$project_id' updated successfully!"
}

# ============================================================================
# Command: remove (soft delete)
# ============================================================================

show_remove_help() {
    cat << EOF
${BLUE}Deactivate a Stripe project (soft delete)${NC}

${YELLOW}Usage:${NC}
  $0 remove <PROJECT_ID> [OPTIONS]

${YELLOW}Options:${NC}
  -d, --db PATH    Path to database
  -h, --help       Show this help

${YELLOW}Examples:${NC}
  $0 remove torah    # Deactivate torah project

${YELLOW}Note:${NC}
  This performs a soft delete (sets active = 0).
  Use '$0 update <PROJECT_ID> --activate' to reactivate.
  Use '$0 delete <PROJECT_ID>' to permanently remove.

EOF
}

cmd_remove() {
    local project_id=""

    if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
        project_id="$1"
        shift
    fi

    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--db)
                DB_PATH="$2"
                shift 2
                ;;
            -h|--help)
                show_remove_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    if [ -z "$project_id" ]; then
        log_error "Missing project ID"
        show_remove_help
        exit 1
    fi

    check_db_exists

    local existing
    existing=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE project_id = '$project_id';")
    if [ -z "$existing" ]; then
        log_error "Project '$project_id' not found"
        exit 1
    fi

    sqlite3 "$DB_PATH" "UPDATE stripe_projects SET active = 0 WHERE project_id = '$project_id';"

    log_success "Project '$project_id' deactivated"
    echo "  To reactivate: $0 update $project_id --activate"
    echo "  To delete permanently: $0 delete $project_id"
}

# ============================================================================
# Command: delete (hard delete)
# ============================================================================

show_delete_help() {
    cat << EOF
${BLUE}Permanently delete a Stripe project${NC}

${YELLOW}Usage:${NC}
  $0 delete <PROJECT_ID> [OPTIONS]

${YELLOW}Options:${NC}
  -f, --force      Skip confirmation prompt
  -d, --db PATH    Path to database
  -h, --help       Show this help

${YELLOW}Examples:${NC}
  $0 delete torah           # Delete with confirmation
  $0 delete torah --force   # Delete without confirmation

${RED}WARNING:${NC} This action cannot be undone!

EOF
}

cmd_delete() {
    local project_id=""
    local force=false

    if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
        project_id="$1"
        shift
    fi

    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                force=true
                shift
                ;;
            -d|--db)
                DB_PATH="$2"
                shift 2
                ;;
            -h|--help)
                show_delete_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    if [ -z "$project_id" ]; then
        log_error "Missing project ID"
        show_delete_help
        exit 1
    fi

    check_db_exists

    local existing
    existing=$(sqlite3 "$DB_PATH" "SELECT project_id FROM stripe_projects WHERE project_id = '$project_id';")
    if [ -z "$existing" ]; then
        log_error "Project '$project_id' not found"
        exit 1
    fi

    if [ "$force" != true ]; then
        echo -e "${RED}WARNING: This will permanently delete project '$project_id'${NC}"
        read -p "Type the project ID to confirm: " confirm
        if [ "$confirm" != "$project_id" ]; then
            log_error "Confirmation failed. Aborting."
            exit 1
        fi
    fi

    sqlite3 "$DB_PATH" "DELETE FROM stripe_projects WHERE project_id = '$project_id';"

    log_success "Project '$project_id' permanently deleted"
}

# ============================================================================
# Main Help
# ============================================================================

show_main_help() {
    cat << EOF
${BLUE}${BOLD}Stripe Projects Manager${NC}

Manage Stripe API configurations for multiple projects without restarting n8n.

${YELLOW}Usage:${NC}
  $0 <COMMAND> [OPTIONS]

${YELLOW}Commands:${NC}
  add       Add a new Stripe project
  list      List all projects
  get       Get details of a specific project
  update    Update an existing project
  remove    Deactivate a project (soft delete)
  delete    Permanently delete a project

${YELLOW}Global Options:${NC}
  -d, --db PATH    Path to SQLite database (default: $DEFAULT_DB_PATH)
  -h, --help       Show help for a command

${YELLOW}Examples:${NC}
  # Initialize database (run once)
  ./init-db.sh

  # Add a new project
  $0 add -i torah -n "Torah Bot" -k sk_live_xxx -w whsec_xxx \\
    -P '{"basic": "price_xxx", "premium": "price_yyy"}'

  # List all projects
  $0 list

  # Get project details
  $0 get torah
  $0 get torah --show-secrets

  # Update a project
  $0 update torah -k sk_live_new_xxx

  # Deactivate a project
  $0 remove torah

  # Validate configuration
  ./validate-config.sh

${YELLOW}More Information:${NC}
  Run '$0 <COMMAND> --help' for detailed help on each command.

EOF
}

# ============================================================================
# Main
# ============================================================================

# No arguments - show help
if [ $# -eq 0 ]; then
    show_main_help
    exit 0
fi

# Parse command
COMMAND="$1"
shift

case "$COMMAND" in
    add)
        cmd_add "$@"
        ;;
    list)
        cmd_list "$@"
        ;;
    get)
        cmd_get "$@"
        ;;
    update)
        cmd_update "$@"
        ;;
    remove)
        cmd_remove "$@"
        ;;
    delete)
        cmd_delete "$@"
        ;;
    -h|--help|help)
        show_main_help
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        echo "Use '$0 --help' for usage information"
        exit 1
        ;;
esac
