# n8n Docker Setup

Configuration Docker pour n8n avec PostgreSQL externe.

## Structure

```
n8n-workflows/
├── docker/
│   ├── docker-compose.yml   # Configuration Docker
│   ├── .env.example         # Template des variables (à copier en .env)
│   ├── .env                 # Variables d'environnement (non committé)
│   └── README.md            # Cette documentation
├── custom-nodes/            # Custom nodes n8n (monté dans le container)
└── workflows/               # Workflows JSON
```

## Prérequis

- Docker et Docker Compose installés
- Accès au serveur PostgreSQL `databases.local:5435`
- Base de données `n8n` créée sur PostgreSQL

## Déploiement sur un nouveau serveur

### 1. Cloner le repo

```bash
git clone <repo-url>
cd n8n-workflows/docker
```

### 2. Configurer l'environnement

```bash
# Copier le template
cp .env.example .env

# Éditer avec vos valeurs
nano .env
```

**Variables CRITIQUES à configurer :**

| Variable | Description |
|----------|-------------|
| `N8N_ENCRYPTION_KEY` | Clé de chiffrement des credentials (doit être identique sur tous les serveurs) |
| `DB_POSTGRESDB_HOST` | IP/hostname du serveur PostgreSQL |
| `DB_POSTGRESDB_PASSWORD` | Mot de passe PostgreSQL |
| `WEBHOOK_URL` | URL publique pour les webhooks |
| `DATABASES_LOCAL_IP` | IP réelle de databases.local |
| `PI6_LOCAL_IP` | IP réelle de pi6.local |

### 3. Installer les custom nodes

```bash
cd custom-nodes

# Pour chaque node custom
for dir in */; do
  cd "$dir"
  npm install
  cd ..
done
```

### 4. Démarrer n8n

```bash
docker compose up -d
```

## Migration depuis SQLite existant

Si vous migrez depuis une installation SQLite :

```bash
# 1. Sur l'ancien serveur, exporter les données
n8n export:workflow --all --output=/tmp/workflows-backup.json
n8n export:credentials --all --output=/tmp/credentials-backup.json

# 2. Copier la clé de chiffrement depuis ~/.n8n/config
cat ~/.n8n/config
# {"encryptionKey": "xxxxx"} → mettre cette valeur dans N8N_ENCRYPTION_KEY

# 3. Démarrer le container Docker
docker compose up -d

# 4. Importer les données
docker cp /tmp/workflows-backup.json n8n:/tmp/
docker cp /tmp/credentials-backup.json n8n:/tmp/
docker exec -it n8n n8n import:workflow --input=/tmp/workflows-backup.json
docker exec -it n8n n8n import:credentials --input=/tmp/credentials-backup.json
```

## Commandes utiles

```bash
# Démarrer
docker compose up -d

# Arrêter
docker compose down

# Logs
docker compose logs -f n8n

# Redémarrer
docker compose restart

# Entrer dans le container
docker exec -it n8n sh

# Mise à jour
# Éditer docker-compose.yml pour changer la version (ex: 1.123.0)
docker compose pull
docker compose up -d
```

## Accès

- **Interface n8n** : http://pi6.local:5678
- **Webhooks** : http://pi6.local:5678/webhook/xxx
- **Health check** : http://pi6.local:5678/healthz

## Custom Nodes

Les custom nodes sont dans `custom-nodes/` (à la racine du repo) :

| Node | Description |
|------|-------------|
| n8n-nodes-calendar-dynamic | Google Calendar dynamique |
| n8n-nodes-contacts-dynamic | Google Contacts dynamique |
| n8n-nodes-drive-dynamic | Google Drive dynamique |
| n8n-nodes-gemini-image | Génération d'images Gemini |
| n8n-nodes-gmail-dynamic | Gmail dynamique |
| n8n-nodes-google-genai-core | Google GenAI Core |
| n8n-nodes-knowledge-graph | Knowledge Graph |
| n8n-nodes-veo-video | Vidéo Veo |
| n8n-nodes-video-transcription | Transcription vidéo |

Après un clone, les `node_modules` ne sont pas inclus. Exécuter :

```bash
cd custom-nodes
for dir in */; do cd "$dir" && npm install && cd ..; done
```

## Volumes

| Volume | Description |
|--------|-------------|
| `n8n_data` | Données n8n (fichiers binaires, cache) |
| `../custom-nodes` | Custom nodes (depuis la racine du repo) |
| `../workflows` | Workflows JSON (lecture seule) |

## Troubleshooting

### Erreur de connexion PostgreSQL

```bash
# Tester depuis le container
docker exec -it n8n ping databases.local
docker exec -it n8n nc -zv databases.local 5435
```

### Credentials ne se décryptent pas

Vérifier que `N8N_ENCRYPTION_KEY` est identique à l'ancienne installation.

### Webhooks ne fonctionnent pas

Vérifier `WEBHOOK_URL` dans `.env` et que le port 5678 est accessible.

### Custom nodes non détectés

```bash
# Vérifier le montage
docker exec -it n8n ls -la /home/node/.n8n/nodes/

# Redémarrer
docker compose restart
```
