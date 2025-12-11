#!/bin/bash
# Script pour gérer n8n en mode debug (sans PM2)
# Usage: ./n8n_debug.sh [start|stop|restart|status|logs]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/n8n-debug.log"

# Créer le dossier logs s'il n'existe pas
mkdir -p "$LOG_DIR"

export N8N_LOG_LEVEL=debug
export N8N_HOST=0.0.0.0
export N8N_PORT=5678
export N8N_RUNNERS_ENABLED=true
export N8N_PUBLIC_API_DISABLED=false
export N8N_DIAGNOSTICS_ENABLED=false
export N8N_SECURE_COOKIE=false
export WEBHOOK_URL=http://pi6.local:5678/
export N8N_CUSTOM_EXTENSIONS=/home/fsebb/n8n-workflows/custom-nodes/n8n-nodes-gmail-dynamic
# Pour plusieurs nodes: séparer par virgule ou pointer vers le dossier parent

start_n8n() {
    # Vérifier si déjà en cours
    if pgrep -f "n8n start" > /dev/null; then
        echo "n8n est déjà en cours d'exécution"
        pgrep -f "n8n start"
        return 1
    fi

    echo "=== Démarrage n8n en mode DEBUG ==="
    echo "URL: http://pi6.local:5678"
    echo "Log level: debug"
    echo "Logs: $LOG_FILE"
    echo "Ctrl+C pour arrêter"
    echo "=================================="

    # Démarrage avec logs dans fichier ET console (tee)
    n8n start 2>&1 | tee -a "$LOG_FILE"
}

stop_n8n() {
    local killed=false

    # Méthode 1: par nom de processus
    if pgrep -f "n8n start" > /dev/null; then
        echo "Arrêt de n8n (par processus)..."
        pkill -f "n8n start"
        killed=true
        sleep 2
    fi

    # Méthode 2: par port 5678
    local pid=$(lsof -t -i :5678 2>/dev/null)
    if [ -n "$pid" ]; then
        echo "Arrêt du processus sur port 5678 (PID: $pid)..."
        kill $pid 2>/dev/null
        killed=true
        sleep 2

        # Force kill si toujours actif
        if lsof -i :5678 > /dev/null 2>&1; then
            echo "Force kill..."
            kill -9 $pid 2>/dev/null
        fi
    fi

    if [ "$killed" = true ]; then
        echo "n8n arrêté"
    else
        echo "n8n n'est pas en cours d'exécution"
    fi
}

status_n8n() {
    if pgrep -f "n8n start" > /dev/null; then
        echo "n8n est en cours d'exécution"
        echo "URL: http://pi6.local:5678"
        pgrep -f "n8n start"
        return 0
    else
        echo "n8n n'est pas en cours d'exécution"
        return 1
    fi
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo "=== Logs n8n ($LOG_FILE) ==="
        tail -f "$LOG_FILE"
    else
        echo "Aucun fichier de log trouvé: $LOG_FILE"
        exit 1
    fi
}

show_logs_last() {
    local lines=${1:-50}
    if [ -f "$LOG_FILE" ]; then
        echo "=== Dernières $lines lignes ($LOG_FILE) ==="
        tail -n "$lines" "$LOG_FILE"
    else
        echo "Aucun fichier de log trouvé: $LOG_FILE"
        exit 1
    fi
}

case "$1" in
    start)
        start_n8n
        ;;
    stop)
        stop_n8n
        ;;
    restart)
        echo "=== Redémarrage n8n ==="
        stop_n8n
        sleep 2
        start_n8n
        ;;
    status)
        status_n8n
        ;;
    logs)
        show_logs
        ;;
    logs-last)
        show_logs_last "$2"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|logs-last [n]}"
        echo ""
        echo "  start      - Démarre n8n (foreground, logs visibles + fichier)"
        echo "  stop       - Arrête n8n"
        echo "  restart    - Redémarre n8n"
        echo "  status     - Affiche le statut"
        echo "  logs       - Affiche les logs en temps réel (tail -f)"
        echo "  logs-last  - Affiche les dernières N lignes (défaut: 50)"
        echo ""
        echo "Fichier de logs: $LOG_FILE"
        exit 1
        ;;
esac
