 # Sur host2 - dans le répertoire du service
  cd /storage4/n8n/services

  # Arrêter et supprimer l'image
  docker compose -f docker-compose.redis-xadd.yml down --rmi local

  # Relancer avec le bon fichier d'environnement
  docker compose -f docker-compose.redis-xadd.yml --env-file /storage4/n8n/docker/.env.local up -d --build

