# n8n Docker Setup

Configuration Docker pour n8n avec PostgreSQL externe et custom nodes.

## Structure

```
n8n-workflows/
├── .env.local               # Variables d'environnement (non committé)
├── docker/
│   ├── docker-compose.yml   # Configuration Docker
│   ├── .env -> .env.local   # Symlink (pour extra_hosts)
│   ├── .env.local           # Copie locale des variables
│   └── README.md            # Cette documentation
├── custom-nodes/            # Custom nodes n8n (avec dist/ compilé)
└── workflows/               # Workflows JSON
```

## Prérequis

- Docker et Docker Compose installés
- Accès au serveur PostgreSQL
- Node.js et npm (pour compiler les custom nodes)

## Déploiement sur un nouveau serveur

### 1. Cloner le repo

```bash
git clone <repo-url>
cd n8n-workflows
```

### 2. Configurer l'environnement

```bash
# Copier le fichier .env.local dans docker/
cp .env.local docker/.env.local

# Créer le symlink .env (OBLIGATOIRE pour extra_hosts)
cd docker
ln -s .env.local .env
cd ..
```

> ⚠️ **IMPORTANT** : Le fichier `.env` (symlink) est nécessaire car Docker Compose
> lit les variables `${VAR}` dans `extra_hosts` AVANT de charger `env_file`.
> Sans ce symlink, `databases.local` résoudra vers `127.0.0.1` et n8n ne pourra
> pas se connecter à PostgreSQL.

**Variables CRITIQUES à configurer dans `.env.local` :**

| Variable | Description | Exemple |
|----------|-------------|---------|
| `N8N_ENCRYPTION_KEY` | Clé de chiffrement (identique sur tous les serveurs) | `abc123...` |
| `DB_POSTGRESDB_HOST` | Hostname du serveur PostgreSQL | `databases.local` |
| `DB_POSTGRESDB_PORT` | Port PostgreSQL | `5435` |
| `DB_POSTGRESDB_PASSWORD` | Mot de passe PostgreSQL | `secret` |
| `DATABASES_LOCAL_IP` | IP réelle de databases.local | `192.168.1.185` |
| `API_LOCAL_IP` | IP réelle de pi6.local | `192.168.1.182` |

### 3. Compiler les custom nodes

> ⚠️ **CRITIQUE** : Les custom nodes doivent être compilés (dossier `dist/`).
> Le dossier `dist/` n'est PAS versionné dans git !

**Option A : Compiler localement (si npm disponible)**

```bash
cd custom-nodes
for dir in n8n-nodes-*/; do
  echo "Building $dir..."
  cd "$dir"
  npm install
  npm run build
  cd ..
done
```

**Option B : Copier depuis un serveur existant (si npm non disponible)**

```bash
# Depuis le serveur source (ex: pi6)
scp -r /storage6/pi6/n8n-workflows/custom-nodes/n8n-nodes-*/dist \
  user@nouveau-serveur:/path/to/n8n-workflows/custom-nodes/
```

**Vérifier que tous les dist/ existent :**

```bash
for dir in custom-nodes/n8n-nodes-*/; do
  if [ -d "$dir/dist" ]; then
    echo "✅ $(basename $dir)"
  else
    echo "❌ $(basename $dir) - dist/ MANQUANT"
  fi
done
```

### 4. Démarrer n8n

```bash
cd docker
docker compose up -d
```

### 5. Vérifier le démarrage

```bash
# Suivre les logs
docker logs -f n8n

# Vérifier que les custom nodes sont chargés
docker logs n8n 2>&1 | grep -i "loaded\|classroom\|gmail"
```

## Format des Custom Nodes

> ⚠️ **IMPORTANT** : Les custom nodes doivent utiliser le préfixe `CUSTOM.` dans les workflows.

| Format | Statut |
|--------|--------|
| `CUSTOM.classroomToolDynamic` | ✅ Correct |
| `CUSTOM.gmailToolDynamic` | ✅ Correct |
| `n8n-nodes-classroom-dynamic.classroomToolDynamic` | ❌ Ne fonctionne PAS |

Si vous voyez l'erreur `Unrecognized node type: n8n-nodes-xxx.nodeName`,
le workflow JSON utilise le mauvais format.

## Commandes utiles

```bash
# Démarrer
cd docker && docker compose up -d

# Arrêter
docker compose down

# Logs en temps réel
docker logs -f n8n

# Redémarrer (après modification custom nodes)
docker compose restart

# Recreate complet (après modification docker-compose.yml)
docker compose down && docker compose up -d

# Entrer dans le container
docker exec -it n8n sh

# Vérifier les custom nodes dans le container
docker exec n8n ls -la /home/node/.n8n/nodes/

# Mise à jour n8n
docker compose pull && docker compose up -d
```

## Architecture des fichiers .env

```
┌─────────────────────────────────────────────────────────────┐
│ docker-compose.yml                                          │
├─────────────────────────────────────────────────────────────┤
│ extra_hosts:                                                │
│   - "databases.local:${DATABASES_LOCAL_IP:-127.0.0.1}"     │
│         ▲                                                   │
│         │ Lu depuis .env (symlink) AVANT le lancement      │
│                                                             │
│ env_file:                                                   │
│   - .env.local                                              │
│         ▲                                                   │
│         │ Chargé DANS le container au runtime              │
└─────────────────────────────────────────────────────────────┘

docker/
├── .env -> .env.local    # Symlink pour ${VAR} dans docker-compose
└── .env.local            # Variables pour le container
```

## Volumes

| Volume | Chemin container | Description |
|--------|------------------|-------------|
| `n8n_data` | `/home/node/.n8n` | Données persistantes n8n |
| `../custom-nodes` | `/home/node/.n8n/nodes` | Custom nodes (avec dist/) |
| `../workflows` | `/home/node/workflows` | Workflows JSON (lecture seule) |

## Troubleshooting

### Erreur "There was an error initializing DB"

**Cause** : n8n ne peut pas se connecter à PostgreSQL.

```bash
# Vérifier que .env existe et pointe vers .env.local
ls -la docker/.env

# Vérifier DATABASES_LOCAL_IP
grep DATABASES_LOCAL_IP docker/.env.local

# Tester la connectivité depuis le container
docker exec n8n ping -c 3 databases.local
docker exec n8n nc -zv databases.local 5435
```

### Erreur "Unrecognized node type: CUSTOM.xxxDynamic"

**Cause** : Le custom node n'est pas compilé ou pas monté.

```bash
# Vérifier que dist/ existe
ls custom-nodes/n8n-nodes-xxx-dynamic/dist/

# Vérifier le montage dans le container
docker exec n8n ls -la /home/node/.n8n/nodes/n8n-nodes-xxx-dynamic/dist/

# Si dist/ manque, compiler ou copier (voir section 3)
```

### Erreur "Unrecognized node type: n8n-nodes-xxx.nodeName"

**Cause** : Le workflow JSON utilise le mauvais format de type.

```bash
# Corriger le format dans le fichier JSON
sed -i 's/n8n-nodes-xxx-dynamic\.xxxToolDynamic/CUSTOM.xxxToolDynamic/g' \
  workflows/MonWorkflow.json
```

### Credentials ne se décryptent pas

**Cause** : `N8N_ENCRYPTION_KEY` différente de l'ancien serveur.

```bash
# Vérifier la clé
grep N8N_ENCRYPTION_KEY docker/.env.local
```

### Custom nodes non détectés après mise à jour

```bash
# Forcer le rechargement
docker compose down && docker compose up -d

# Vérifier les logs de chargement
docker logs n8n 2>&1 | grep -i "loaded"
```

## Synchronisation entre serveurs

Pour synchroniser les custom nodes compilés entre serveurs :

```bash
# Depuis le serveur source
rsync -avz --include='*/' --include='dist/**' --exclude='*' \
  custom-nodes/ user@destination:/path/to/custom-nodes/
```

## Accès

- **Interface n8n** : http://host:5678
- **Webhooks** : http://host:5678/webhook/xxx
- **Health check** : http://host:5678/healthz
