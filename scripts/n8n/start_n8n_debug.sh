#!/bin/bash
# Script pour lancer n8n en mode debug (sans PM2)
# Usage: ./start_n8n_debug.sh

export N8N_LOG_LEVEL=debug
export N8N_HOST=0.0.0.0
export N8N_PORT=5678
export N8N_RUNNERS_ENABLED=true
export N8N_PUBLIC_API_DISABLED=false
export N8N_DIAGNOSTICS_ENABLED=false
export N8N_SECURE_COOKIE=false
export WEBHOOK_URL=http://pi6.local:5678/

echo "=== Démarrage n8n en mode DEBUG ==="
echo "URL: http://pi6.local:5678"
echo "Log level: debug"
echo "Ctrl+C pour arrêter"
echo "=================================="

n8n start
