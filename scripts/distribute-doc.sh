#!/bin/bash
#
# distribute-doc.sh - Distribue un document aux projets liés
#
# Usage: ./distribute-doc.sh <fichier>
# Exemple: ./distribute-doc.sh docs/rfc/RFC-031-INTENT-CLASSIFICATION-HYBRID.md
#

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_DIR="/storage6/pi6"
REMOTE_USER="fsebb"
REMOTE_HOST="pi5.local"
REMOTE_PATH="/storage5/chat.api"

# Projets cibles
PROJECTS=(
    "plugin-recipes"
    "chatbot-core"
    "azy.mcp"
)

# Vérifier qu'un fichier est fourni
if [ -z "$1" ]; then
    echo -e "${RED}Erreur: Aucun fichier spécifié${NC}"
    echo "Usage: $0 <fichier>"
    echo "Exemple: $0 docs/rfc/RFC-031-INTENT-CLASSIFICATION-HYBRID.md"
    exit 1
fi

SOURCE_FILE="$1"

# Vérifier que le fichier existe
if [ ! -f "$SOURCE_FILE" ]; then
    echo -e "${RED}Erreur: Le fichier '$SOURCE_FILE' n'existe pas${NC}"
    exit 1
fi

FILENAME=$(basename "$SOURCE_FILE")
RELATIVE_PATH=$(dirname "$SOURCE_FILE")

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Distribution de: ${YELLOW}$FILENAME${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""

# Copier vers chaque projet
for PROJECT in "${PROJECTS[@]}"; do
    TARGET_DIR="$BASE_DIR/$PROJECT/$RELATIVE_PATH"

    echo -n "→ $PROJECT... "

    # Créer le dossier cible si nécessaire
    if [ ! -d "$TARGET_DIR" ]; then
        mkdir -p "$TARGET_DIR"
        echo -n "(dossier créé) "
    fi

    # Copier le fichier
    cp "$SOURCE_FILE" "$TARGET_DIR/"

    echo -e "${GREEN}✓${NC}"
done

echo ""
echo -e "${GREEN}Copie locale terminée !${NC}"
echo ""

# Demander pour le SCP
echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
echo -e "Voulez-vous aussi copier vers ${BLUE}$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH${NC} ?"
echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
echo ""
read -p "Envoyer via SCP ? (o/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[OoYy]$ ]]; then
    REMOTE_TARGET="$REMOTE_PATH/$RELATIVE_PATH"

    echo ""
    echo -n "→ Création du dossier distant... "
    ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_TARGET" 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}(existe déjà)${NC}"

    echo -n "→ Envoi de $FILENAME... "
    if scp "$SOURCE_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_TARGET/" 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
        echo ""
        echo -e "${GREEN}Fichier envoyé avec succès !${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo -e "${RED}Erreur lors de l'envoi SCP${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${YELLOW}SCP ignoré.${NC}"
fi

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Distribution terminée !${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
