#!/bin/bash
# =============================================================================
# MCP Stripe Integration - Database Migration Script
# =============================================================================
# This script runs the SQL migration for MCP Stripe integration.
#
# Usage:
#   ./migrate-stripe.sh [--host HOST] [--port PORT] [--user USER] [--db DB]
#
# Environment variables (alternative to flags):
#   MCP_DB_HOST     PostgreSQL host (default: localhost)
#   MCP_DB_PORT     PostgreSQL port (default: 5432)
#   MCP_DB_USER     PostgreSQL user (default: mcp)
#   MCP_DB_NAME     PostgreSQL database (default: mcp)
#   MCP_DB_PASSWORD PostgreSQL password (will prompt if not set)
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/migrate-stripe-columns.sql"

# Default values
DB_HOST="${MCP_DB_HOST:-localhost}"
DB_PORT="${MCP_DB_PORT:-5432}"
DB_USER="${MCP_DB_USER:-mcp}"
DB_NAME="${MCP_DB_NAME:-mcp}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            DB_HOST="$2"
            shift 2
            ;;
        --port)
            DB_PORT="$2"
            shift 2
            ;;
        --user)
            DB_USER="$2"
            shift 2
            ;;
        --db)
            DB_NAME="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--host HOST] [--port PORT] [--user USER] [--db DB]"
            echo ""
            echo "Options:"
            echo "  --host    PostgreSQL host (default: localhost)"
            echo "  --port    PostgreSQL port (default: 5432)"
            echo "  --user    PostgreSQL user (default: mcp)"
            echo "  --db      PostgreSQL database (default: mcp)"
            echo ""
            echo "Environment variables:"
            echo "  MCP_DB_HOST, MCP_DB_PORT, MCP_DB_USER, MCP_DB_NAME, MCP_DB_PASSWORD"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Check SQL file exists
if [[ ! -f "$SQL_FILE" ]]; then
    echo -e "${RED}Error: SQL file not found: $SQL_FILE${NC}"
    exit 1
fi

# Check psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql command not found. Please install PostgreSQL client.${NC}"
    exit 1
fi

echo -e "${YELLOW}=== MCP Stripe Integration Migration ===${NC}"
echo ""
echo "Database configuration:"
echo "  Host:     $DB_HOST"
echo "  Port:     $DB_PORT"
echo "  User:     $DB_USER"
echo "  Database: $DB_NAME"
echo ""

# Confirm
read -p "Proceed with migration? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Migration cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Running migration...${NC}"

# Run migration
if [[ -n "$MCP_DB_PASSWORD" ]]; then
    PGPASSWORD="$MCP_DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_FILE"
else
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_FILE"
fi

echo ""
echo -e "${GREEN}Migration completed successfully!${NC}"
echo ""
echo "Tables created/updated:"
echo "  - mcp_users (main user table with Stripe fields)"
echo "  - mcp_api_usage (API usage tracking)"
echo "  - mcp_payment_history (payment events)"
echo "  - mcp_api_keys (multiple API keys per user)"
echo ""
echo "Views created:"
echo "  - mcp_user_summary (user subscription overview)"
echo ""
echo "Functions created:"
echo "  - generate_mcp_api_key() (generate new API keys)"
echo "  - update_mcp_updated_at() (auto-update timestamps)"
