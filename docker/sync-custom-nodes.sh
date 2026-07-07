#!/bin/bash
# Synchronise les custom nodes BUILDÉS depuis host2 (source de vérité) vers llm,
# puis propose de redéployer les deux n8n.
# Usage : ./sync-custom-nodes.sh   (depuis n'importe quelle machine du parc)
set -euo pipefail

SRC_HOST=fsebb@host2.local
SRC_DIR=/storage4/n8n/custom-nodes
DST_HOST=fsebb@llm.local
DST_DIR=/storage4/n8n-workflows/custom-nodes-built

echo "→ sync ${SRC_HOST}:${SRC_DIR} → ${DST_HOST}:${DST_DIR}"
ssh -o BatchMode=yes "$SRC_HOST" "cd $(dirname $SRC_DIR) && tar czf - $(basename $SRC_DIR)" \
  | ssh -o BatchMode=yes "$DST_HOST" "mkdir -p $DST_DIR && tar xzf - -C $DST_DIR --strip-components=1"
N=$(ssh -o BatchMode=yes "$DST_HOST" "find $DST_DIR -name '*.node.js' | wc -l")
echo "✅ sync OK — $N fichiers .node.js sur llm"

read -p "Redéployer les 2 n8n maintenant ? [y/N] " -r ok
if [[ "$ok" =~ ^[yY]$ ]]; then
  echo "→ redeploy host2 (staging)…"
  ssh -o BatchMode=yes "$SRC_HOST" 'cd /storage4/n8n/docker && docker compose --env-file .env.local down && docker compose --env-file .env.local up -d --force-recreate'
  echo "→ redeploy llm (dev)…"
  ssh -o BatchMode=yes "$DST_HOST" 'cd /storage4/n8n-workflows/docker && ./deploy.sh'
  echo "✅ parc redéployé"
else
  echo "ℹ️  sync fait, redéploiement à lancer manuellement (deploy.sh / compose)"
fi
