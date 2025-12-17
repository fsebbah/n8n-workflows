#!/bin/bash
#
# Import les workflows manquants dans n8n et les active
# Usage: ./scripts/n8n/import_missing.sh [--dry-run] [--no-activate]
#
set -e

DRY_RUN=false
ACTIVATE=true
WORKFLOWS_DIR="workflows/mcp-tools"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-activate)
            ACTIVATE=false
            shift
            ;;
        *)
            echo "Usage: $0 [--dry-run] [--no-activate]"
            exit 1
            ;;
    esac
done

echo "========================================"
echo "🔍 Import des workflows manquants"
echo "========================================"
if $DRY_RUN; then
    echo "⚠️  Mode DRY-RUN - aucune modification"
fi
echo ""

# Récupérer la liste des workflows existants dans n8n
echo "📋 Récupération des workflows existants dans n8n..."

# Format de sortie: ID|Name (pipe separator)
declare -A EXISTING_MAP
while IFS='|' read -r id name; do
    if [[ -n "$name" ]]; then
        # Nettoyer le nom (trim whitespace sans xargs pour éviter les problèmes de quotes)
        clean_name="${name#"${name%%[![:space:]]*}"}"  # trim leading
        clean_name="${clean_name%"${clean_name##*[![:space:]]}"}"  # trim trailing
        if [[ -n "$clean_name" ]]; then
            EXISTING_MAP["$clean_name"]=1
        fi
    fi
done < <(n8n list:workflow 2>/dev/null)

echo "   Workflows existants: ${#EXISTING_MAP[@]}"
echo ""

# Parcourir les fichiers JSON
MISSING=()
IMPORTED=()
ACTIVATED=()
FAILED=()

echo "📂 Analyse des workflows locaux..."
for WORKFLOW_FILE in "$WORKFLOWS_DIR"/*.json; do
    if [[ ! -f "$WORKFLOW_FILE" ]]; then
        continue
    fi

    WORKFLOW_NAME=$(jq -r '.name // "Unknown"' "$WORKFLOW_FILE")
    FILENAME=$(basename "$WORKFLOW_FILE")

    # Vérifier si le workflow existe déjà
    if [[ -n "${EXISTING_MAP[$WORKFLOW_NAME]}" ]]; then
        echo "   ✓ Existe: $WORKFLOW_NAME"
    else
        echo "   ✗ Manquant: $WORKFLOW_NAME"
        MISSING+=("$WORKFLOW_FILE")
    fi
done

echo ""
echo "========================================"
echo "📊 Résumé: ${#MISSING[@]} workflow(s) à importer"
echo "========================================"

if [[ ${#MISSING[@]} -eq 0 ]]; then
    echo "✅ Tous les workflows sont déjà importés!"
    exit 0
fi

echo ""
for f in "${MISSING[@]}"; do
    echo "   - $(basename "$f")"
done
echo ""

if $DRY_RUN; then
    echo "⚠️  Mode DRY-RUN terminé"
    exit 0
fi

# Importer les workflows manquants
echo "🚀 Import des workflows..."
echo ""

for WORKFLOW_FILE in "${MISSING[@]}"; do
    WORKFLOW_NAME=$(jq -r '.name // "Unknown"' "$WORKFLOW_FILE")
    FILENAME=$(basename "$WORKFLOW_FILE")

    echo "📦 Import: $WORKFLOW_NAME"

    # Générer un UUID pour versionId
    VERSION_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")

    # Créer fichier temporaire avec les propriétés adaptées pour l'import
    # Note: active et versionId sont NOT NULL dans la DB
    TMP_FILE=$(mktemp /tmp/workflow_XXXXXX.json)
    jq --arg vid "$VERSION_ID" '
      del(.id) |
      .active = false |
      .versionId = $vid |
      del(.createdAt) |
      del(.updatedAt) |
      del(.meta) |
      del(.tags)
    ' "$WORKFLOW_FILE" > "$TMP_FILE"

    # Import via n8n CLI
    if n8n import:workflow --input="$TMP_FILE" 2>&1; then
        echo "   ✅ Importé"
        IMPORTED+=("$WORKFLOW_NAME")
    else
        echo "   ❌ Échec de l'import"
        FAILED+=("$WORKFLOW_NAME (import)")
        rm -f "$TMP_FILE"
        echo ""
        echo "❌ ERREUR: Arrêt du script"
        exit 1
    fi

    rm -f "$TMP_FILE"

    # Activer le workflow si demandé
    if $ACTIVATE; then
        echo "   🔄 Activation..."

        # Récupérer l'ID du workflow importé
        WORKFLOW_ID=$(n8n list:workflow 2>/dev/null | grep "$WORKFLOW_NAME" | grep -oP '^\s*\d+' | head -1 | xargs)

        if [[ -n "$WORKFLOW_ID" ]]; then
            # Activer via l'API REST (n8n CLI n'a pas de commande activate)
            # On utilise n8n execute pour tester, puis on active via la DB ou API

            # Méthode: modifier directement via n8n update si disponible
            # Sinon on utilise curl vers l'API locale

            if curl -s -X PATCH "http://localhost:5678/api/v1/workflows/$WORKFLOW_ID" \
                -H "Content-Type: application/json" \
                -d '{"active": true}' > /dev/null 2>&1; then
                echo "   ✅ Activé (ID: $WORKFLOW_ID)"
                ACTIVATED+=("$WORKFLOW_NAME")
            else
                # Essayer avec l'API REST interne de n8n
                if curl -s -X PATCH "http://localhost:5678/rest/workflows/$WORKFLOW_ID" \
                    -H "Content-Type: application/json" \
                    -d '{"active": true}' > /dev/null 2>&1; then
                    echo "   ✅ Activé (ID: $WORKFLOW_ID)"
                    ACTIVATED+=("$WORKFLOW_NAME")
                else
                    echo "   ⚠️  Import OK mais activation manuelle requise"
                    echo "      → Activez dans l'UI n8n: $WORKFLOW_NAME"
                fi
            fi
        else
            echo "   ⚠️  ID non trouvé, activation manuelle requise"
        fi
    fi

    echo ""
done

# Résumé final
echo "========================================"
echo "📊 RÉSUMÉ FINAL"
echo "========================================"
echo "✅ Importés:  ${#IMPORTED[@]}"
echo "🔄 Activés:   ${#ACTIVATED[@]}"
echo "❌ Échecs:    ${#FAILED[@]}"
echo ""

if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo "Workflows en échec:"
    for f in "${FAILED[@]}"; do
        echo "   - $f"
    done
    exit 1
fi

echo "✅ Terminé avec succès!"
