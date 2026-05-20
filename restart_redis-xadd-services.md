● Plusieurs options :

  # Option 1 : Supprimer l'image par nom (après avoir arrêté le container)
  docker rmi n8n-redis-xadd:latest

  # Option 2 : Rebuild avec --no-cache (force un build complet)
  docker compose -f docker-compose.redis-xadd.yml build --no-cache

  # Option 3 : Tout en une commande (stop, remove, rebuild, start)
  docker compose -f docker-compose.redis-xadd.yml down --rmi local && \
  docker compose -f docker-compose.redis-xadd.yml up -d --build

  Recommandation - Commande complète sur host2 :

  cd /storage4/n8n/services

  # Arrête le container ET supprime l'image locale
  docker compose -f docker-compose.redis-xadd.yml down --rmi local

  # Rebuild et redémarre
  docker compose -f docker-compose.redis-xadd.yml up -d --build

