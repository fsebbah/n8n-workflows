#!/bin/bash
# ============================================
# Deploy script pour n8n
# ============================================
# Usage:
#   ./deploy.sh          - Restart seulement (pm2 restart n8n)
#   ./deploy.sh --build  - Rebuild complet (npm install + restart)
#   ./deploy.sh --docker - Mode Docker (docker compose)
#   ./deploy.sh --help   - Aide
#
# Ce script gère deux modes de déploiement :
# - pm2 (défaut) : n8n tourne via pm2 sur ce serveur
# - docker : n8n tourne dans un container Docker
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUSTOM_NODES_DIR="$SCRIPT_DIR/custom-nodes"
DOCKER_DIR="$SCRIPT_DIR/docker"

MODE="restart"
RUNTIME="pm2"  # pm2 ou docker

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parser les arguments
for arg in "$@"; do
    case $arg in
        --build|-b)
            MODE="build"
            ;;
        --docker|-d)
            RUNTIME="docker"
            ;;
        --help|-h)
            echo "Usage: ./deploy.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (aucun)        Restart n8n (pm2 restart)"
            echo "  --build, -b    Rebuild complet (npm install dans custom-nodes + restart)"
            echo "  --docker, -d   Mode Docker (utilise docker compose au lieu de pm2)"
            echo "  --help, -h     Afficher cette aide"
            echo ""
            echo "Exemples:"
            echo "  ./deploy.sh              # Restart simple via pm2"
            echo "  ./deploy.sh --build      # npm install + restart via pm2"
            echo "  ./deploy.sh --docker     # Restart via docker compose"
            echo "  ./deploy.sh --build -d   # npm install + restart via docker"
            echo ""
            echo "Quand utiliser --build:"
            echo "  - Ajout/mise à jour d'un custom node (package.json modifié)"
            echo "  - Après git pull avec changements dans custom-nodes/"
            exit 0
            ;;
    esac
done

echo ""
echo "============================================"
echo "       n8n Deploy Script"
echo "============================================"
echo "Mode: $MODE | Runtime: $RUNTIME"
echo "============================================"
echo ""

# ============================================
# Fonction : Restart simple
# ============================================
do_restart() {
    if [ "$RUNTIME" == "docker" ]; then
        log_info "Restart container n8n via Docker..."
        cd "$DOCKER_DIR"
        docker compose restart n8n
    else
        log_info "Restart n8n via pm2..."
        pm2 restart n8n
    fi
}

# ============================================
# Fonction : Build complet (npm install + restart)
# ============================================
do_build() {
    log_info "Build complet : npm install + restart"

    # Étape 1 : npm install dans custom-nodes
    log_info "[1/3] Installation des dépendances custom-nodes..."
    cd "$CUSTOM_NODES_DIR"

    if [ ! -f "package.json" ]; then
        log_error "package.json non trouvé dans $CUSTOM_NODES_DIR"
        exit 1
    fi

    npm install
    log_success "npm install terminé"

    # Étape 2 : Restart n8n
    log_info "[2/3] Restart n8n..."
    do_restart

    # Étape 3 : Vérification
    log_info "[3/3] Vérification..."
    sleep 3
    do_verify
}

# ============================================
# Fonction : Vérification post-deploy
# ============================================
do_verify() {
    if [ "$RUNTIME" == "docker" ]; then
        if docker ps | grep -q n8n; then
            log_success "Container n8n running"

            # Afficher les custom nodes installés
            log_info "Custom nodes installés :"
            ls -1 "$CUSTOM_NODES_DIR/node_modules" 2>/dev/null | grep -E "^n8n-nodes-|^@" | head -15

            # Logs récents
            log_info "Logs récents :"
            docker logs --tail 5 n8n 2>&1 || true
        else
            log_error "Container n8n not running!"
            docker logs --tail 20 n8n 2>&1 || true
            exit 1
        fi
    else
        # Mode pm2
        if pm2 list | grep -q "n8n.*online"; then
            log_success "n8n running via pm2"

            # Afficher les custom nodes installés
            log_info "Custom nodes installés :"
            ls -1 "$CUSTOM_NODES_DIR/node_modules" 2>/dev/null | grep -E "^n8n-nodes-|^@" | head -15

            # Logs récents
            log_info "Logs récents :"
            pm2 logs n8n --lines 5 --nostream 2>&1 || true
        else
            log_error "n8n not running via pm2!"
            pm2 logs n8n --lines 20 --nostream 2>&1 || true
            exit 1
        fi
    fi
}

# ============================================
# Exécution principale
# ============================================
case $MODE in
    "restart")
        do_restart
        sleep 2
        do_verify
        ;;
    "build")
        do_build
        ;;
esac

echo ""
log_success "Deploy terminé !"
echo "============================================"
