#!/bin/bash
# Script pour gérer n8n en mode debug (sans PM2)
# Usage: ./n8n_debug.sh [start|stop|restart|status]

PID_FILE="/tmp/n8n_debug.pid"
LOG_FILE="/tmp/n8n_debug.log"

export N8N_LOG_LEVEL=debug
export N8N_HOST=0.0.0.0
export N8N_PORT=5678
export N8N_RUNNERS_ENABLED=true
export N8N_PUBLIC_API_DISABLED=false
export N8N_DIAGNOSTICS_ENABLED=false
export N8N_SECURE_COOKIE=false
export WEBHOOK_URL=http://pi6.local:5678/

start_n8n() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "n8n est déjà en cours d'exécution (PID: $PID)"
            return 1
        fi
    fi

    echo "=== Démarrage n8n en mode DEBUG ==="
    echo "URL: http://pi6.local:5678"
    echo "Log level: debug"
    echo "Log file: $LOG_FILE"
    echo "=================================="

    nohup n8n start > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"

    sleep 2
    if ps -p $(cat "$PID_FILE") > /dev/null 2>&1; then
        echo "n8n démarré avec succès (PID: $(cat $PID_FILE))"
    else
        echo "Erreur au démarrage. Voir $LOG_FILE"
        rm -f "$PID_FILE"
        return 1
    fi
}

stop_n8n() {
    if [ ! -f "$PID_FILE" ]; then
        echo "n8n n'est pas en cours d'exécution (pas de PID file)"
        # Tenter de tuer par nom de processus
        pkill -f "n8n start" 2>/dev/null && echo "Processus n8n tué"
        return 0
    fi

    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Arrêt de n8n (PID: $PID)..."
        kill "$PID"
        sleep 2

        # Force kill si toujours actif
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Force kill..."
            kill -9 "$PID"
        fi

        echo "n8n arrêté"
    else
        echo "Le processus $PID n'existe plus"
    fi

    rm -f "$PID_FILE"
}

status_n8n() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "n8n est en cours d'exécution (PID: $PID)"
            echo "URL: http://pi6.local:5678"
            return 0
        else
            echo "n8n n'est pas en cours d'exécution (PID file obsolète)"
            rm -f "$PID_FILE"
            return 1
        fi
    else
        # Vérifier si un processus n8n tourne quand même
        if pgrep -f "n8n start" > /dev/null; then
            echo "n8n semble tourner mais sans PID file"
            pgrep -f "n8n start"
            return 0
        fi
        echo "n8n n'est pas en cours d'exécution"
        return 1
    fi
}

logs_n8n() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo "Pas de fichier log trouvé: $LOG_FILE"
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
        logs_n8n
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "  start   - Démarre n8n en background"
        echo "  stop    - Arrête n8n"
        echo "  restart - Redémarre n8n"
        echo "  status  - Affiche le statut"
        echo "  logs    - Affiche les logs (tail -f)"
        exit 1
        ;;
esac
