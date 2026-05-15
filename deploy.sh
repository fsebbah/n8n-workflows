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
SYNC_WORKFLOWS=false

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
        --sync|-w)
            SYNC_WORKFLOWS=true
            ;;
        --init|-i)
            MODE="init"
            ;;
        --help|-h)
            echo "Usage: ./deploy.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (aucun)          Restart n8n (pm2 restart)"
            echo "  --init, -i       Initialiser l'environnement (venv + dépendances) sans démarrer"
            echo "  --build, -b      Rebuild complet (npm install dans custom-nodes + restart)"
            echo "  --docker, -d     Mode Docker (utilise docker compose au lieu de pm2)"
            echo "  --services, -s   Déployer aussi les micro-services (Redis XADD)"
            echo "  --sync, -w       Synchroniser les workflows JSON avec n8n (via API)"
            echo "  --help, -h       Afficher cette aide"
            echo ""
            echo "Exemples:"
            echo "  ./deploy.sh                  # Restart simple via pm2"
            echo "  ./deploy.sh --init           # Première installation: créer .venv + installer deps"
            echo "  ./deploy.sh --build          # npm install + restart via pm2"
            echo "  ./deploy.sh --services       # Restart n8n + micro-services via pm2"
            echo "  ./deploy.sh --docker         # Restart via docker compose"
            echo "  ./deploy.sh --build -d       # npm install + restart via docker"
            echo "  ./deploy.sh --docker -s      # Restart n8n + services via docker"
            echo "  ./deploy.sh -d -s --build    # Build complet avec services en docker"
            echo "  ./deploy.sh --sync           # Synchroniser workflows avec n8n (via API)"
            echo "  ./deploy.sh -s --sync        # Services + sync workflows"
            echo ""
            echo "Première installation:"
            echo "  ./deploy.sh --init           # Crée .venv et installe les dépendances Python"
            echo "  ./deploy.sh --services       # Puis démarre n8n + services"
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
echo "Mode: $MODE | Runtime: $RUNTIME | Services: $DEPLOY_SERVICES | Sync: $SYNC_WORKFLOWS"
echo "============================================"
echo ""

# ============================================
# Fonction : Initialisation de l'environnement
# ============================================
do_init() {
    log_info "Initialisation de l'environnement..."

    # Créer l'environnement virtuel Python
    VENV_DIR="$SCRIPT_DIR/.venv"
    if [ ! -d "$VENV_DIR" ]; then
        log_info "[1/3] Création de l'environnement virtuel Python..."
        python3 -m venv "$VENV_DIR"
        log_success "Environnement virtuel créé: $VENV_DIR"
    else
        log_info "[1/3] Environnement virtuel existe déjà: $VENV_DIR"
    fi

    # Installer les dépendances Python pour les services
    log_info "[2/3] Installation des dépendances Python (services)..."
    "$VENV_DIR/bin/pip" install --upgrade pip -q
    if [ -f "$SERVICES_DIR/requirements.txt" ]; then
        "$VENV_DIR/bin/pip" install -q -r "$SERVICES_DIR/requirements.txt"
        log_success "Dépendances Python installées"
    else
        log_warn "Fichier requirements.txt non trouvé dans $SERVICES_DIR"
    fi

    # Installer les dépendances npm pour custom-nodes
    log_info "[3/3] Installation des dépendances npm (custom-nodes)..."
    if [ -f "$CUSTOM_NODES_DIR/package.json" ]; then
        cd "$CUSTOM_NODES_DIR"
        npm install -q
        log_success "Dépendances npm installées"
    else
        log_warn "Fichier package.json non trouvé dans $CUSTOM_NODES_DIR"
    fi

    echo ""
    log_success "Initialisation terminée !"
    log_info "Prochaine étape: ./deploy.sh --services"
}

# ============================================
# Fonction : Restart simple
# ============================================
do_restart() {
    if [ "$RUNTIME" == "docker" ]; then
        log_info "Restart container n8n via Docker..."
        cd "$DOCKER_DIR"

        # Construire les options docker compose
        COMPOSE_OPTS=""
        if [ -f ".env.local" ]; then
            COMPOSE_OPTS="--env-file .env.local"
        fi

        # Down + Up avec force-recreate pour un vrai restart propre
        docker compose $COMPOSE_OPTS down
        docker compose $COMPOSE_OPTS up -d --force-recreate
    else
        log_info "Restart n8n via pm2..."
        pm2 restart n8n --update-env
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

        # Créer le réseau Docker si nécessaire
        DOCKER_NETWORK="${DOCKER_NETWORK:-n8n-network}"
        if ! docker network ls | grep -q "$DOCKER_NETWORK"; then
            log_info "Création du réseau Docker: $DOCKER_NETWORK"
            docker network create "$DOCKER_NETWORK"
        fi

        # Build et démarrage avec docker compose
        docker compose -f docker-compose.redis-xadd.yml up -d --build --remove-orphans

        # Nettoyer les anciennes images (dangling)
        log_info "Nettoyage des anciennes images Docker..."
        docker image prune -f --filter "dangling=true" 2>/dev/null || true

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
# Fonction : Synchroniser les workflows avec n8n
# ============================================
do_sync_workflows() {
    log_info "Synchronisation des workflows avec n8n..."

    # Vérifier les variables d'environnement requises
    if [ -z "$N8N_API_URL" ]; then
        # Essayer de charger depuis .env.local
        if [ -f "$SCRIPT_DIR/.env.local" ]; then
            source "$SCRIPT_DIR/.env.local"
        fi
    fi

    N8N_API_URL="${N8N_API_URL:-http://localhost:5678/api/v1}"

    if [ -z "$N8N_API_KEY" ]; then
        log_error "N8N_API_KEY non défini. Export N8N_API_KEY ou définir dans .env.local"
        return 1
    fi

    WORKFLOWS_DIR="$SCRIPT_DIR/workflows"

    # Liste des workflows critiques à synchroniser
    CRITICAL_WORKFLOWS=(
        "MCP_-_Tools_Notify.json"
        "Claude_-_Call_With_Skills.json"
        "Claude_-_Call_Stream_With_Skills.json"
        "Claude_-_Batch_Poller.json"
    )

    for wf_file in "${CRITICAL_WORKFLOWS[@]}"; do
        if [ ! -f "$WORKFLOWS_DIR/$wf_file" ]; then
            log_warn "Workflow non trouvé: $wf_file"
            continue
        fi

        # Extraire le nom du workflow depuis le JSON
        wf_name=$(python3 -c "import json; print(json.load(open('$WORKFLOWS_DIR/$wf_file'))['name'])" 2>/dev/null)

        # Chercher si le workflow existe déjà dans n8n
        log_info "Recherche du workflow: $wf_name"

        existing=$(curl -s -X GET "$N8N_API_URL/workflows" \
            -H "X-N8N-API-KEY: $N8N_API_KEY" \
            -H "Content-Type: application/json" | \
            python3 -c "import sys,json; wfs=json.load(sys.stdin).get('data',[]); matches=[w for w in wfs if w['name']=='$wf_name']; print(matches[0]['id'] if matches else '')" 2>/dev/null)

        if [ -n "$existing" ]; then
            # Workflow existe → UPDATE
            log_info "  Mise à jour du workflow $wf_name (ID: $existing)..."

            response=$(curl -s -X PUT "$N8N_API_URL/workflows/$existing" \
                -H "X-N8N-API-KEY: $N8N_API_KEY" \
                -H "Content-Type: application/json" \
                -d @"$WORKFLOWS_DIR/$wf_file")

            if echo "$response" | grep -q '"id"'; then
                log_success "  Workflow mis à jour: $wf_name"
            else
                log_error "  Échec mise à jour: $wf_name"
                echo "$response" | head -c 200
            fi
        else
            # Workflow n'existe pas → CREATE
            log_info "  Création du workflow $wf_name..."

            response=$(curl -s -X POST "$N8N_API_URL/workflows" \
                -H "X-N8N-API-KEY: $N8N_API_KEY" \
                -H "Content-Type: application/json" \
                -d @"$WORKFLOWS_DIR/$wf_file")

            if echo "$response" | grep -q '"id"'; then
                new_id=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
                log_success "  Workflow créé: $wf_name (ID: $new_id)"

                # Activer le workflow
                curl -s -X PATCH "$N8N_API_URL/workflows/$new_id" \
                    -H "X-N8N-API-KEY: $N8N_API_KEY" \
                    -H "Content-Type: application/json" \
                    -d '{"active": true}' > /dev/null
                log_info "  Workflow activé"
            else
                log_error "  Échec création: $wf_name"
                echo "$response" | head -c 200
            fi
        fi
    done

    log_success "Synchronisation terminée"
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
    "init")
        do_init
        ;;
    "restart")
        do_restart
        if [ "$DEPLOY_SERVICES" == "true" ]; then
            do_deploy_services
        fi
        if [ "$SYNC_WORKFLOWS" == "true" ]; then
            sleep 3  # Attendre que n8n soit prêt
            do_sync_workflows
        fi
        sleep 2
        do_verify
        ;;
    "build")
        do_build
        if [ "$DEPLOY_SERVICES" == "true" ]; then
            do_deploy_services
        fi
        if [ "$SYNC_WORKFLOWS" == "true" ]; then
            sleep 3
            do_sync_workflows
        fi
        ;;
esac

echo ""
log_success "Deploy terminé !"
if [ "$DEPLOY_SERVICES" == "true" ]; then
    log_info "Services: redis-xadd → http://localhost:8765"
fi
echo "============================================"
