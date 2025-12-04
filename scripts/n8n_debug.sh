#!/bin/bash
# Script pour gérer n8n en mode debug (sans PM2)
# Usage: ./n8n_debug.sh [start|stop|restart|status]


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
    echo "Ctrl+C pour arrêter"
    echo "=================================="

    # Foreground - logs visibles
    n8n start
}

stop_n8n() {
    if pgrep -f "n8n start" > /dev/null; then
        echo "Arrêt de n8n..."
        pkill -f "n8n start"
        sleep 2

        # Force kill si toujours actif
        if pgrep -f "n8n start" > /dev/null; then
            echo "Force kill..."
            pkill -9 -f "n8n start"
        fi

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
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        echo ""
        echo "  start   - Démarre n8n (foreground, logs visibles)"
        echo "  stop    - Arrête n8n"
        echo "  restart - Redémarre n8n"
        echo "  status  - Affiche le statut"
        exit 1
        ;;
esac
