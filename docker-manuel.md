● Non, pas à chaque fois. Voici quand utiliser chaque commande :
  Situation: Changement de .env.local uniquement
  Commande: docker compose --env-file .env.local up -d
  ────────────────────────────────────────
  Situation: Changement de docker-compose.yml
  Commande: docker compose --env-file .env.local up -d --force-recreate
  ────────────────────────────────────────
  Situation: Changement de Dockerfile ou custom-nodes
  Commande: docker compose --env-file .env.local up --build -d
  ────────────────────────────────────────
  Situation: Problèmes de cache / fresh start
  Commande: docker builder prune --all -f && docker compose --env-file .env.local up --build -d
  Usage courant :
  # Simple restart après modif .env.local
  docker compose --env-file .env.local up -d

  # Si ça ne prend pas en compte les changements
  docker compose --env-file .env.local up -d --force-recreate

  Le prune --all est rarement nécessaire - il supprime tout le cache de build et ralentit les builds suivants.
