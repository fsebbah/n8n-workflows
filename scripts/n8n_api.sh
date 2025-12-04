#!/bin/bash
# n8n API Helper Script
# Usage: ./n8n_api.sh <action> [params]

# Load configuration from .env.local
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | grep -E '^N8N_' | xargs)
fi

# Default values
N8N_API_URL="${N8N_API_URL:-http://pi6.local:5678/api/v1}"
N8N_WEBHOOK_BASE_URL="${N8N_WEBHOOK_BASE_URL:-http://pi6.local:5678/webhook}"

# Check API key
if [ -z "$N8N_API_KEY" ] || [ "$N8N_API_KEY" = "your-n8n-api-key-here" ]; then
    echo "Error: N8N_API_KEY not configured in .env.local"
    exit 1
fi

# Function to make API calls
n8n_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    local url="${N8N_API_URL}${endpoint}"

    if [ -n "$data" ]; then
        curl -s -X "$method" "$url" \
            -H "X-N8N-API-KEY: $N8N_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data"
    else
        curl -s -X "$method" "$url" \
            -H "X-N8N-API-KEY: $N8N_API_KEY"
    fi
}

# Actions
case "$1" in
    list)
        # List workflows (optional name filter)
        if [ -n "$2" ]; then
            # Filter by name
            ENCODED_NAME=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$2'))")
            n8n_api GET "/workflows?name=${ENCODED_NAME}&limit=100"
        else
            n8n_api GET "/workflows?limit=500"
        fi | python3 -c "
import sys, json
data = json.load(sys.stdin)
for w in data.get('data', []):
    status = '✅' if w['active'] else '❌'
    print(f\"{status} {w['id']}: {w['name']}\")
"
        ;;

    get)
        # Get workflow by ID
        if [ -z "$2" ]; then
            echo "Usage: $0 get <workflow_id>"
            exit 1
        fi
        n8n_api GET "/workflows/$2" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"ID: {d.get('id')}\")
print(f\"Name: {d.get('name')}\")
print(f\"Active: {d.get('active')}\")
print(f\"Nodes: {len(d.get('nodes', []))}\")
"
        ;;

    activate)
        # Activate workflow
        if [ -z "$2" ]; then
            echo "Usage: $0 activate <workflow_id>"
            exit 1
        fi
        echo "Activating workflow $2..."
        result=$(n8n_api POST "/workflows/$2/activate")
        echo "API Response: $result"
        # Check result
        n8n_api GET "/workflows/$2" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('active'):
    print(f\"✅ Workflow '{d.get('name')}' is now ACTIVE\")
else:
    print(f\"❌ Failed to activate workflow - Status: {d.get('active')}\")
"
        ;;

    deactivate)
        # Deactivate workflow
        if [ -z "$2" ]; then
            echo "Usage: $0 deactivate <workflow_id>"
            exit 1
        fi
        n8n_api POST "/workflows/$2/deactivate"
        echo "Workflow $2 deactivated"
        ;;

    test-webhook)
        # Test a webhook endpoint
        if [ -z "$2" ]; then
            echo "Usage: $0 test-webhook <path> [json_data]"
            exit 1
        fi
        local webhook_url="${N8N_WEBHOOK_BASE_URL}/$2"
        local test_data="${3:-{\"message\":\"Test from n8n_api.sh\",\"access_token\":\"test_token\",\"user_id\":\"user_123\"}}"
        echo "Testing webhook: $webhook_url"
        curl -s -X POST "$webhook_url" \
            -H "Content-Type: application/json" \
            -d "$test_data" | python3 -m json.tool 2>/dev/null || cat
        ;;

    import)
        # Import workflow from JSON file
        if [ -z "$2" ]; then
            echo "Usage: $0 import <json_file>"
            exit 1
        fi
        if [ ! -f "$2" ]; then
            echo "Error: File not found: $2"
            exit 1
        fi
        curl -s -X POST "${N8N_API_URL}/workflows" \
            -H "X-N8N-API-KEY: $N8N_API_KEY" \
            -H "Content-Type: application/json" \
            -d @"$2" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'id' in d:
    print(f\"✅ Imported workflow: {d.get('name')} (ID: {d.get('id')})\")
else:
    print(f\"❌ Import failed: {d}\")
"
        ;;

    search)
        # Search workflows by name
        if [ -z "$2" ]; then
            echo "Usage: $0 search <name_pattern>"
            exit 1
        fi
        n8n_api GET "/workflows?limit=250" | python3 -c "
import sys, json, re
pattern = '${2}'.lower()
data = json.load(sys.stdin)
found = 0
for w in data.get('data', []):
    if pattern in w['name'].lower():
        status = '✅' if w['active'] else '❌'
        print(f\"{status} {w['id']}: {w['name']}\")
        found += 1
if found == 0:
    print('No workflows found matching pattern')
"
        ;;

    *)
        echo "n8n API Helper Script"
        echo ""
        echo "Usage: $0 <action> [params]"
        echo ""
        echo "Actions:"
        echo "  list                    List all workflows"
        echo "  get <id>                Get workflow details"
        echo "  activate <id>           Activate a workflow"
        echo "  deactivate <id>         Deactivate a workflow"
        echo "  import <file>           Import workflow from JSON file"
        echo "  search <pattern>        Search workflows by name"
        echo "  test-webhook <path>     Test a webhook endpoint"
        echo ""
        echo "Configuration:"
        echo "  N8N_API_URL: $N8N_API_URL"
        echo "  N8N_WEBHOOK_BASE_URL: $N8N_WEBHOOK_BASE_URL"
        echo "  N8N_API_KEY: ${N8N_API_KEY:0:20}..."
        ;;
esac
