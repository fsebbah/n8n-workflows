#!/bin/bash
# n8n API Helper Script
# Usage: ./n8n_api.sh <action> [params]

# Load configuration from .env.local
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# ⚠️ DEUX niveaux : ce script vit dans scripts/n8n/, le .env.local est à la racine.
# `5bbb9147 chore(scripts): organize scripts by category` a déplacé ce fichier de
# scripts/ vers scripts/n8n/ sans corriger le `../` — il cherchait donc
# scripts/.env.local, qui n'existe pas. Le `if [ -f ]` avale l'absence en silence,
# et l'erreur qui sortait trois lignes plus bas accusait la clé :
# « N8N_API_KEY not configured in .env.local » — faux deux fois, la clé était là et
# ce fichier n'avait pas été lu. Vérifié le 2026-11-06.
# Le pendant Python (n8n_api.py:23) fait bien `parent.parent.parent`.
ENV_FILE="$SCRIPT_DIR/../../.env.local"

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
            # ⚠️ 250 est le PLAFOND de l'API : limit=500 rend
            # 400 {\"message\":\"request/query/limit must be <= 250\"} — et le filtre
            # ci-dessous l'avalait en silence (pas de clé 'data' → boucle vide → sortie 0).
            # Défaut invisible jusqu'au 2026-11-06 parce que le contrôle de clé échouait
            # avant d'arriver ici. La ligne 158 (action search) était déjà à 250.
            n8n_api GET "/workflows?limit=250"
        fi | python3 -c "
import sys, json
data = json.load(sys.stdin)
# Une erreur d'API est un objet SANS 'data' : la dire, plutôt que de rendre une liste vide.
if 'data' not in data:
    print(f\"Erreur API n8n : {data.get('message', data)}\", file=sys.stderr)
    sys.exit(1)
for w in data['data']:
    status = '✅' if w['active'] else '❌'
    print(f\"{status} {w['id']}: {w['name']}\")
# Le parc dépasse 250 workflows : ne jamais laisser croire que la liste est entière.
# C'est le défaut de n8n-workflows#543, où 8 outils étaient invisibles sans aucun signal.
if data.get('nextCursor'):
    print(f\"\n⚠️  LISTE TRONQUÉE : {len(data['data'])} affichés, l'API a rendu un curseur.\"
          f\"\n   Pour la liste entière : python3 scripts/n8n/n8n_api.py list\", file=sys.stderr)
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

    update)
        # Update existing workflow from JSON file
        # Usage: update <workflow_id> <json_file>
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Usage: $0 update <workflow_id> <json_file>"
            exit 1
        fi
        WORKFLOW_ID="$2"
        JSON_FILE="$3"

        if [ ! -f "$JSON_FILE" ]; then
            echo "Error: File not found: $JSON_FILE"
            exit 1
        fi

        echo "📋 Updating workflow $WORKFLOW_ID..."

        # Step 1: Deactivate if active
        echo "1️⃣ Deactivating workflow..."
        n8n_api POST "/workflows/$WORKFLOW_ID/deactivate" > /dev/null 2>&1

        # Step 2: Update with PUT
        echo "2️⃣ Updating workflow content..."
        result=$(curl -s -X PUT "${N8N_API_URL}/workflows/$WORKFLOW_ID" \
            -H "X-N8N-API-KEY: $N8N_API_KEY" \
            -H "Content-Type: application/json" \
            -d @"$JSON_FILE")

        # Check if update succeeded
        updated_id=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

        if [ "$updated_id" = "$WORKFLOW_ID" ]; then
            echo "3️⃣ Reactivating workflow..."
            n8n_api POST "/workflows/$WORKFLOW_ID/activate" > /dev/null 2>&1

            # Verify final state
            n8n_api GET "/workflows/$WORKFLOW_ID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
status = '✅' if d.get('active') else '❌'
print(f\"{status} Updated workflow: {d.get('name')} (ID: {d.get('id')})\")
print(f\"   Nodes: {len(d.get('nodes', []))}\")
"
        else
            echo "❌ Update failed: $result"
            exit 1
        fi
        ;;

    *)
        echo "n8n API Helper Script"
        echo ""
        echo "Usage: $0 <action> [params]"
        echo ""
        echo "Actions:"
        echo "  list [name]             List all workflows (optional name filter)"
        echo "  get <id>                Get workflow details"
        echo "  activate <id>           Activate a workflow"
        echo "  deactivate <id>         Deactivate a workflow"
        echo "  import <file>           Import workflow from JSON file (creates new)"
        echo "  update <id> <file>      Update existing workflow from JSON file"
        echo "  search <pattern>        Search workflows by name"
        echo "  test-webhook <path>     Test a webhook endpoint"
        echo ""
        echo "Configuration:"
        echo "  N8N_API_URL: $N8N_API_URL"
        echo "  N8N_WEBHOOK_BASE_URL: $N8N_WEBHOOK_BASE_URL"
        echo "  N8N_API_KEY: ${N8N_API_KEY:0:20}..."
        ;;
esac
