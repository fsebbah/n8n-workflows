#!/bin/bash
# ============================================
# Deploy script pour n8n
# ============================================
# Usage:
#   ./deploy.sh              - Restart seulement (pm2 restart n8n)
#   ./deploy.sh --build      - Rebuild complet (npm install + restart)
#   ./deploy.sh --docker     - Mode Docker (docker compose)
#   ./deploy.sh --services   - Déployer aussi les micro-services (Redis XADD)
#   ./deploy.sh --help       - Aide
#
# Ce script gère deux modes de déploiement :
# - pm2 (défaut) : n8n tourne via pm2 sur ce serveur
# - docker : n8n tourne dans un container Docker
#
# Micro-services disponibles :
# - redis-xadd : Service Redis XADD pour n8n 2.0 (remplace Execute Command)
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUSTOM_NODES_DIR="$SCRIPT_DIR/custom-nodes"
DOCKER_DIR="$SCRIPT_DIR/docker"
SERVICES_DIR="$SCRIPT_DIR/services"

MODE="restart"
RUNTIME="pm2"  # pm2 ou docker
DEPLOY_SERVICES=false

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
        --services|-s)
            DEPLOY_SERVICES=true
            ;;
        --help|-h)
            echo "Usage: ./deploy.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (aucun)          Restart n8n (pm2 restart)"
            echo "  --build, -b      Rebuild complet (npm install dans custom-nodes + restart)"
            echo "  --docker, -d     Mode Docker (utilise docker compose au lieu de pm2)"
            echo "  --services, -s   Déployer aussi les micro-services (Redis XADD)"
            echo "  --help, -h       Afficher cette aide"
            echo ""
            echo "Exemples:"
            echo "  ./deploy.sh                  # Restart simple via pm2"
            echo "  ./deploy.sh --build          # npm install + restart via pm2"
            echo "  ./deploy.sh --services       # Restart n8n + micro-services via pm2"
            echo "  ./deploy.sh --docker         # Restart via docker compose"
            echo "  ./deploy.sh --build -d       # npm install + restart via docker"
            echo "  ./deploy.sh --docker -s      # Restart n8n + services via docker"
            echo "  ./deploy.sh -d -s --build    # Build complet avec services en docker"
            echo ""
            echo "Micro-services disponibles (--services):"
            echo "  - redis-xadd : Service Redis XADD pour Redis Streams (port 8765)"
            echo "                 Requis pour workflows utilisant \$env.REDIS_XADD_SERVICE_URL"
            echo ""
            echo "Quand utiliser --build:"
            echo "  - Ajout/mise à jour d'un custom node (package.json modifié)"
            echo "  - Après git pull avec changements dans custom-nodes/"
            echo ""
            echo "Documentation: docs/n8n/REDIS_XADD_SERVICE.md"
            exit 0
            ;;
    esac
done

echo ""
echo "============================================"
echo "       n8n Deploy Script"
echo "============================================"
echo "Mode: $MODE | Runtime: $RUNTIME | Services: $DEPLOY_SERVICES"
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
# Fonction : Déployer les micro-services
# ============================================
do_deploy_services() {
    log_info "Déploiement des micro-services..."

    if [ "$RUNTIME" == "docker" ]; then
        log_info "Déploiement Redis XADD Service via Docker..."
        cd "$SERVICES_DIR"

        # Build et démarrage avec docker compose
        docker compose -f docker-compose.redis-xadd.yml up -d --build

        log_success "Redis XADD Service déployé via Docker"
    else
        log_info "Déploiement Redis XADD Service via PM2..."

        # Vérifier l'environnement virtuel Python
        VENV_DIR="$SCRIPT_DIR/.venv"
        if [ ! -d "$VENV_DIR" ]; then
            log_warn "Environnement virtuel non trouvé, création..."
            python3 -m venv "$VENV_DIR"
        fi

        # Installer les dépendances si nécessaire
        if [ "$MODE" == "build" ]; then
            log_info "Installation des dépendances Python..."
            "$VENV_DIR/bin/pip" install -q -r "$SERVICES_DIR/requirements-redis-xadd.txt"
        fi

        # Restart ou démarrer le service
        if pm2 list | grep -q "redis-xadd"; then
            log_info "Restart redis-xadd..."
            pm2 restart redis-xadd
        else
            log_info "Démarrage redis-xadd..."
            pm2 start "$SERVICES_DIR/redis_xadd_service.py" \
                --name redis-xadd \
                --interpreter "$VENV_DIR/bin/python3"
        fi

        log_success "Redis XADD Service déployé via PM2"
    fi
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

    # Vérification des services si déployés
    if [ "$DEPLOY_SERVICES" == "true" ]; then
        do_verify_services
    fi
}

# ============================================
# Fonction : Vérification des micro-services
# ============================================
do_verify_services() {
    log_info "Vérification des micro-services..."

    # Vérifier Redis XADD Service
    sleep 2
    if curl -s http://localhost:8765/health > /dev/null 2>&1; then
        log_success "Redis XADD Service: healthy"
        curl -s http://localhost:8765/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Redis: {d[\"redis_host\"]}:{d[\"redis_port\"]} DB={d[\"redis_db\"]} - connected: {d[\"redis_connected\"]}')" 2>/dev/null || true
    else
        log_warn "Redis XADD Service: not responding (port 8765)"
        if [ "$RUNTIME" == "docker" ]; then
            docker logs redis-xadd-service --tail 10 2>&1 || true
        else
            pm2 logs redis-xadd --lines 10 --nostream 2>&1 || true
        fi
    fi
}

# ============================================
# Exécution principale
# ============================================
case $MODE in
    "restart")
        do_restart
        if [ "$DEPLOY_SERVICES" == "true" ]; then
            do_deploy_services
        fi
        sleep 2
        do_verify
        ;;
    "build")
        do_build
        if [ "$DEPLOY_SERVICES" == "true" ]; then
            do_deploy_services
        fi
        ;;
esac

echo ""
log_success "Deploy terminé !"
if [ "$DEPLOY_SERVICES" == "true" ]; then
    log_info "Services: redis-xadd → http://localhost:8765"
fi
echo "============================================"
