# n8n Docker Setup

Configuration Docker pour n8n avec PostgreSQL externe.

## Structure

```
n8n-workflows/
├── .env.local.example       # Template des variables
├── .env.local               # Variables d'environnement (non committé)
├── docker/
│   ├── docker-compose.yml   # Configuration Docker
│   └── README.md            # Cette documentation
├── custom-nodes/            # Custom nodes n8n
└── workflows/               # Workflows JSON
```

## Prérequis

- Docker et Docker Compose installés
- Accès au serveur PostgreSQL
- Fichier `.env.local` configuré à la racine du repo

## Déploiement sur un nouveau serveur

### 1. Cloner le repo

```bash
git clone <repo-url>
cd n8n-workflows
```

### 2. Configurer l'environnement

```bash
# Copier le template
cp .env.local.example .env.local

# Éditer avec vos valeurs
nano .env.local
```

**Variables CRITIQUES à configurer :**

| Variable | Description |
|----------|-------------|
| `N8N_ENCRYPTION_KEY` | Clé de chiffrement (identique sur tous les serveurs) |
| `DB_POSTGRESDB_HOST` | IP/hostname du serveur PostgreSQL |
| `DB_POSTGRESDB_PASSWORD` | Mot de passe PostgreSQL |
| `WEBHOOK_URL` | URL publique pour les webhooks |
| `DATABASES_LOCAL_IP` | IP réelle de databases.local |
| `PI6_LOCAL_IP` | IP réelle de pi6.local |
| `OPENAI_API_KEY` | Clé API OpenAI |
| `ANTHROPIC_API_KEY` | Clé API Anthropic |

### 3. Installer les custom nodes

```bash
cd custom-nodes
for dir in */; do cd "$dir" && npm install && cd ..; done
cd ..
```

### 4. Démarrer n8n

```bash
cd docker
docker compose up -d
```

## Commandes utiles

```bash
# Démarrer
cd docker && docker compose up -d

# Arrêter
docker compose down

# Logs
docker compose logs -f n8n

# Redémarrer
docker compose restart

# Entrer dans le container
docker exec -it n8n sh

# Mise à jour (éditer la version dans docker-compose.yml)
docker compose pull && docker compose up -d
```

## Accès

- **Interface n8n** : http://pi6.local:5678
- **Webhooks** : http://pi6.local:5678/webhook/xxx
- **Health check** : http://pi6.local:5678/healthz

## Custom Nodes

Les custom nodes sont dans `custom-nodes/` (racine du repo).

Après un clone, exécuter :

```bash
cd custom-nodes
for dir in */; do cd "$dir" && npm install && cd ..; done
```

## Volumes

| Volume | Description |
|--------|-------------|
| `n8n_data` | Données n8n (fichiers binaires, cache) |
| `../custom-nodes` | Custom nodes |
| `../workflows` | Workflows JSON (lecture seule) |

## Troubleshooting

### Erreur de connexion PostgreSQL

```bash
docker exec -it n8n ping databases.local
docker exec -it n8n nc -zv databases.local 5435
```

### Credentials ne se décryptent pas

Vérifier que `N8N_ENCRYPTION_KEY` dans `.env.local` est identique à l'ancien serveur.

### Custom nodes non détectés

```bash
docker exec -it n8n ls -la /home/node/.n8n/nodes/
docker compose restart
```
