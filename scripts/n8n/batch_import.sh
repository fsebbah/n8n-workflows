#!/bin/bash
#
# Batch import and activate n8n workflows
# Usage: ./batch_import.sh [--dry-run] [--pattern <pattern>]
#
# Options:
#   --dry-run       Show what would be done without executing
#   --pattern       Filter workflows by pattern (e.g., "MCP-Games")
#   --untracked     Only import untracked files (git status ??)
#   --modified      Only import modified files (git status M)
#   --all           Import all .json files in workflows/
#

# Don't use set -e, we handle errors manually

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKFLOWS_DIR="$REPO_ROOT/workflows"
N8N_API="python3 $SCRIPT_DIR/n8n_api.py"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Options
DRY_RUN=false
PATTERN=""
MODE="untracked"  # default: only untracked files

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --pattern)
            PATTERN="$2"
            shift 2
            ;;
        --untracked)
            MODE="untracked"
            shift
            ;;
        --modified)
            MODE="modified"
            shift
            ;;
        --all)
            MODE="all"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--pattern <pattern>] [--untracked|--modified|--all]"
            echo ""
            echo "Options:"
            echo "  --dry-run       Show what would be done without executing"
            echo "  --pattern       Filter workflows by pattern (e.g., 'MCP-Games')"
            echo "  --untracked     Only import untracked files (git status ??)"
            echo "  --modified      Only import modified files (git status M)"
            echo "  --all           Import all .json files in workflows/"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  n8n Workflow Batch Import & Activate${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get list of workflows to import
cd "$REPO_ROOT"

declare -a WORKFLOWS

if [[ "$MODE" == "untracked" ]]; then
    echo -e "${YELLOW}Mode: Untracked files only${NC}"
    while IFS= read -r line; do
        status="${line:0:2}"
        file="${line:3}"
        if [[ "$status" == "??" && "$file" == workflows/*.json ]]; then
            WORKFLOWS+=("$file")
        fi
    done < <(git status --porcelain workflows/)
elif [[ "$MODE" == "modified" ]]; then
    echo -e "${YELLOW}Mode: Modified files only${NC}"
    while IFS= read -r line; do
        status="${line:0:2}"
        file="${line:3}"
        if [[ "$status" == " M" || "$status" == "M " ]] && [[ "$file" == workflows/*.json ]]; then
            WORKFLOWS+=("$file")
        fi
    done < <(git status --porcelain workflows/)
elif [[ "$MODE" == "all" ]]; then
    echo -e "${YELLOW}Mode: All workflow files${NC}"
    for f in "$WORKFLOWS_DIR"/*.json; do
        [[ -f "$f" ]] && WORKFLOWS+=("workflows/$(basename "$f")")
    done
fi

# Apply pattern filter
if [[ -n "$PATTERN" ]]; then
    echo -e "${YELLOW}Pattern filter: $PATTERN${NC}"
    FILTERED=()
    for w in "${WORKFLOWS[@]}"; do
        if [[ "$w" == *"$PATTERN"* ]]; then
            FILTERED+=("$w")
        fi
    done
    WORKFLOWS=("${FILTERED[@]}")
fi

echo ""
echo -e "${BLUE}Workflows to import: ${#WORKFLOWS[@]}${NC}"
echo ""

if [[ ${#WORKFLOWS[@]} -eq 0 ]]; then
    echo -e "${YELLOW}No workflows to import.${NC}"
    exit 0
fi

# List workflows
for w in "${WORKFLOWS[@]}"; do
    echo "  - $w"
done
echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}[DRY RUN] Would import and activate the above workflows${NC}"
    exit 0
fi

# Confirm
read -p "Proceed with import and activation? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""

# Import and activate each workflow
SUCCESS=0
FAILED=0

for workflow_file in "${WORKFLOWS[@]}"; do
    workflow_name=$(basename "$workflow_file" .json)
    echo -e "${BLUE}----------------------------------------${NC}"
    echo -e "${BLUE}Importing: $workflow_name${NC}"

    # Import workflow and capture output
    output=$($N8N_API import "$REPO_ROOT/$workflow_file" 2>&1) || true
    echo "$output"

    # Extract workflow ID from output using sed (portable)
    # Looking for pattern: "(ID: <id>)"
    workflow_id=$(echo "$output" | sed -n 's/.*ID: \([a-zA-Z0-9]*\).*/\1/p' | head -1)

    if [[ -z "$workflow_id" ]]; then
        echo -e "${RED}Failed to get workflow ID for $workflow_name${NC}"
        FAILED=$((FAILED + 1))
        continue
    fi

    echo -e "${GREEN}Workflow ID: $workflow_id${NC}"

    # Activate workflow
    echo -e "${BLUE}Activating workflow $workflow_id...${NC}"
    activate_output=$($N8N_API activate "$workflow_id" 2>&1) || true

    if echo "$activate_output" | grep -q "is now ACTIVE"; then
        echo -e "${GREEN}Activated: $workflow_name${NC}"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "$activate_output"
        echo -e "${YELLOW}Warning: Activation may have failed for $workflow_name${NC}"
        SUCCESS=$((SUCCESS + 1))  # Still count as success since import worked
    fi

    echo ""
done

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Success: $SUCCESS${NC}"
if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}Failed: $FAILED${NC}"
fi
echo -e "${BLUE}========================================${NC}"
