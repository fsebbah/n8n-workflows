#!/bin/bash
# Déploiement n8n (Docker) — usage : ./deploy.sh [--pull]
#   --pull : récupère la nouvelle image épinglée avant relance (upgrade)
# Recharge TOUJOURS .env.local (interpolation compose + env conteneur) via
# down && --env-file up -d --force-recreate — la commande de référence du projet.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env.local ] || { echo "❌ .env.local manquant dans $(pwd)"; exit 1; }

# Garde-fou : refuser une image non épinglée (latest = dérive de version
# + migration sauvage du schéma partagé — incident du 2026-07-07)
if grep -qE "image:.*n8n:(latest|\s*$)" docker-compose.yml; then
  echo "❌ image non épinglée (latest) dans docker-compose.yml — épingler une version (ex: 2.29.7)"; exit 1
fi

if [ "${1:-}" = "--pull" ]; then
  echo "→ pull de l'image épinglée…"
  docker compose --env-file .env.local pull
fi

echo "→ down…"
docker compose --env-file .env.local down

echo "→ up -d --force-recreate (env rechargé)…"
docker compose --env-file .env.local up -d --force-recreate

echo "→ attente healthz…"
for i in $(seq 1 60); do
  if curl -s -m 3 http://localhost:5678/healthz 2>/dev/null | grep -q ok; then
    echo "✅ n8n up — $(docker exec n8n n8n --version 2>/dev/null)"
    exit 0
  fi
  sleep 5
done
echo "⚠️ healthz KO après 5 min — docker compose logs n8n --tail 30 :"
docker compose --env-file .env.local logs n8n --tail 30
exit 1
