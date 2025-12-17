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

# Générer un UUID valide pour versionId
NEW_VERSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")

# Créer fichier temporaire avec les modifications nécessaires
TMP_FILE=$(mktemp /tmp/workflow_XXXXXX.json)
jq --arg vid "$NEW_VERSION_ID" '
  del(.id) |
  .active = false |
  .versionId = $vid |
  del(.createdAt) |
  del(.updatedAt) |
  del(.meta)
' "$WORKFLOW_FILE" > "$TMP_FILE"

# Import via n8n CLI
if n8n import:workflow --input="$TMP_FILE"; then
    echo ""
    echo "✅ Workflow importé avec succès: $WORKFLOW_NAME"
else
    echo ""
    echo "❌ Échec de l'import"
    rm -f "$TMP_FILE"
    exit 1
fi

rm -f "$TMP_FILE"
