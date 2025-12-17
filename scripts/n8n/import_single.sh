#!/bin/bash
#
# Import un seul workflow dans n8n
# Usage: ./scripts/n8n/import_single.sh <fichier.json>
#

if [ -z "$1" ]; then
    echo "Usage: $0 <workflow.json>"
    echo "Exemple: $0 workflows/mcp-tools/speaker_identifier_tool.json"
    exit 1
fi

WORKFLOW_FILE="$1"

if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "❌ Fichier non trouvé: $WORKFLOW_FILE"
    exit 1
fi

WORKFLOW_NAME=$(jq -r '.name // "Unknown"' "$WORKFLOW_FILE")

echo "📦 Import du workflow: $WORKFLOW_NAME"
echo "📄 Fichier: $WORKFLOW_FILE"
echo ""

# Créer fichier temporaire avec les propriétés minimales pour l'API
TMP_FILE=$(mktemp /tmp/workflow_XXXXXX.json)
jq '
  del(.id) |
  del(.active) |
  del(.versionId) |
  del(.createdAt) |
  del(.updatedAt) |
  del(.meta) |
  del(.tags) |
  del(.triggerCount) |
  del(.staticData)
' "$WORKFLOW_FILE" > "$TMP_FILE"

# Import via API Python (gère correctement le versionId)
echo "📤 Import via API..."
if python3 scripts/n8n/n8n_api.py import "$TMP_FILE"; then
    echo ""
    echo "✅ Workflow importé avec succès: $WORKFLOW_NAME"
    rm -f "$TMP_FILE"
else
    echo ""
    echo "⚠️  API failed, trying CLI fallback..."

    # Fallback: CLI avec UUID généré
    VERSION_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)
    jq --arg vid "$VERSION_ID" '
      del(.id) |
      .active = false |
      .versionId = $vid |
      del(.createdAt) |
      del(.updatedAt) |
      del(.meta) |
      del(.tags)
    ' "$WORKFLOW_FILE" > "$TMP_FILE"

    if n8n import:workflow --input="$TMP_FILE"; then
        echo ""
        echo "✅ Workflow importé via CLI: $WORKFLOW_NAME"
    else
        echo ""
        echo "❌ Échec de l'import"
        rm -f "$TMP_FILE"
        exit 1
    fi
    rm -f "$TMP_FILE"
fi
