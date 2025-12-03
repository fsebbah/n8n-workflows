# Documentation MCP-Server : Intégration n8n

Cette documentation répond aux questions de l'équipe mcp-server concernant l'import de credentials et workflows, et l'exécution de workflows via CLI.

---

## Table des matières

1. [Format des Credentials](#1-format-des-credentials)
2. [Format des Workflows](#2-format-des-workflows)
3. [Exécution de Workflows](#3-exécution-de-workflows)
4. [Flux d'intégration complet](#4-flux-dintégration-complet)
5. [Gestion des tokens OAuth](#5-gestion-des-tokens-oauth)
6. [API REST alternative](#6-api-rest-alternative)
7. [Serveur MCP natif n8n](#7-serveur-mcp-natif-n8n)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Format des Credentials

### Structure de la table `credentials_entity`

```
Colonne              Type            Contraintes
─────────────────────────────────────────────────────
id                   varchar(36)     NOT NULL (obligatoire)
name                 varchar(128)    NOT NULL
data                 TEXT            NOT NULL (chiffré)
type                 varchar(32)     NOT NULL
createdAt            datetime        DEFAULT now
updatedAt            datetime        DEFAULT now
isManaged            BOOLEAN         DEFAULT false
isGlobal             BOOLEAN         DEFAULT false
```

### Format JSON pour `import:credentials`

```json
[
  {
    "id": "cred_abc123xyz",
    "name": "Google Calendar OAuth",
    "type": "googleCalendarOAuth2Api",
    "data": {
      "clientId": "123456789.apps.googleusercontent.com",
      "clientSecret": "GOCSPX-xxxxxxxxxxxxx",
      "accessToken": "ya29.xxxxxxxxxxxxx",
      "refreshToken": "1//xxxxxxxxxxxxx",
      "oauthTokenData": {
        "access_token": "ya29.xxxxxxxxxxxxx",
        "refresh_token": "1//xxxxxxxxxxxxx",
        "scope": "https://www.googleapis.com/auth/calendar",
        "token_type": "Bearer",
        "expiry_date": 1701619200000
      }
    }
  }
]
```

### Champs obligatoires

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string | **OBLIGATOIRE** - Identifiant unique (format libre, max 36 chars). Peut être un UUID ou un ID personnalisé comme `"google_cal_prod"` |
| `name` | string | Nom affiché dans l'UI n8n |
| `type` | string | Type de credential n8n (voir liste ci-dessous) |
| `data` | object | Données d'authentification (sera chiffré par n8n) |

### Types de credentials courants

```
googleCalendarOAuth2Api     # Google Calendar
googleSheetsOAuth2Api       # Google Sheets
googleDriveOAuth2Api        # Google Drive
gmailOAuth2Api              # Gmail
slackOAuth2Api              # Slack
notionOAuth2Api             # Notion
microsoftOAuth2Api          # Microsoft 365
githubOAuth2Api             # GitHub
```

### Commande d'import

```bash
# Import simple
n8n import:credentials --input=credentials.json

# Avec assignation à un utilisateur
n8n import:credentials --input=credentials.json --userId=629b1a6e-a241-4160-a115-50b9404b216c

# Avec assignation à un projet
n8n import:credentials --input=credentials.json --projectId=rkp1YaKKlE3ExOIx

# Import de plusieurs fichiers depuis un dossier
n8n import:credentials --separate --input=./credentials/
```

---

## 2. Format des Workflows

### Format JSON valide (exporté via `n8n export:workflow`)

```json
{
  "id": "k8uRJPsWz9hhlxPI",
  "name": "Mon Workflow",
  "description": "Description du workflow",
  "active": false,
  "nodes": [
    {
      "id": "node-uuid-1234",
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [250, 300],
      "parameters": {
        "path": "mon-webhook",
        "httpMethod": "POST"
      },
      "webhookId": "webhook-uuid-5678"
    },
    {
      "id": "node-uuid-5678",
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [500, 300],
      "parameters": {
        "url": "https://api.example.com/data",
        "method": "POST"
      },
      "credentials": {
        "httpBasicAuth": {
          "id": "cred_http_auth",
          "name": "API Auth"
        }
      }
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [
        [
          {
            "node": "HTTP Request",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "saveManualExecutions": true,
    "timezone": "Europe/Paris"
  },
  "versionId": "uuid-version-id"
}
```

### Champs obligatoires pour l'import

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| `name` | Oui | Nom du workflow |
| `nodes` | Oui | Liste des nodes |
| `connections` | Oui | Connexions entre nodes |
| `versionId` | Oui* | UUID de version (*généré si absent avec notre script) |
| `id` | Non | Sera généré automatiquement si absent |
| `active` | Non | Défaut: false |

### Référence entre workflow et credentials

Dans un node, les credentials sont référencés ainsi :

```json
{
  "credentials": {
    "googleCalendarOAuth2Api": {
      "id": "cred_google_cal",
      "name": "Google Calendar Prod"
    }
  }
}
```

L'`id` doit correspondre à un credential existant dans n8n.

### Commande d'import

```bash
# Import simple
n8n import:workflow --input=workflow.json

# Import de plusieurs fichiers
n8n import:workflow --separate --input=./workflows/
```

---

## 3. Exécution de Workflows

### Via CLI

```bash
# Exécution par ID
n8n execute --id=k8uRJPsWz9hhlxPI

# Avec données d'entrée (pour workflows avec Manual Trigger)
n8n execute --id=k8uRJPsWz9hhlxPI --rawBody='{"key": "value"}'

# Mode fichier pour données complexes
echo '{"users": [{"name": "John"}, {"name": "Jane"}]}' > /tmp/input.json
n8n execute --id=k8uRJPsWz9hhlxPI --file=/tmp/input.json
```

### Via API REST

```bash
# Avec API Key
curl -X POST "http://pi6.local:5678/api/v1/workflows/k8uRJPsWz9hhlxPI/run" \
  -H "X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"data": {"key": "value"}}'
```

### Résultat d'exécution

La CLI retourne le résultat JSON de l'exécution :

```json
{
  "data": {
    "resultData": {
      "runData": {
        "NodeName": [
          {
            "data": {
              "main": [[{"json": {"result": "success"}}]]
            }
          }
        ]
      }
    }
  },
  "mode": "cli",
  "finished": true
}
```

---

## 4. Flux d'intégration complet

### Étape 1 : Préparer les credentials

```bash
# Créer le fichier credentials.json
cat > /tmp/credentials.json << 'EOF'
[
  {
    "id": "google_calendar_prod",
    "name": "Google Calendar Production",
    "type": "googleCalendarOAuth2Api",
    "data": {
      "clientId": "YOUR_CLIENT_ID",
      "clientSecret": "YOUR_CLIENT_SECRET",
      "accessToken": "YOUR_ACCESS_TOKEN",
      "refreshToken": "YOUR_REFRESH_TOKEN"
    }
  }
]
EOF

# Importer
n8n import:credentials --input=/tmp/credentials.json --projectId=rkp1YaKKlE3ExOIx
```

### Étape 2 : Préparer le workflow

```bash
# S'assurer que le workflow référence le bon credential ID
cat > /tmp/workflow.json << 'EOF'
{
  "name": "Calendar Sync",
  "versionId": "v1-initial",
  "active": false,
  "nodes": [
    {
      "id": "trigger-1",
      "name": "Schedule",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {
        "rule": {"interval": [{"field": "hours", "hoursInterval": 1}]}
      }
    },
    {
      "id": "calendar-1",
      "name": "Google Calendar",
      "type": "n8n-nodes-base.googleCalendar",
      "typeVersion": 1,
      "position": [500, 300],
      "parameters": {
        "resource": "event",
        "operation": "getAll"
      },
      "credentials": {
        "googleCalendarOAuth2Api": {
          "id": "google_calendar_prod",
          "name": "Google Calendar Production"
        }
      }
    }
  ],
  "connections": {
    "Schedule": {
      "main": [[{"node": "Google Calendar", "type": "main", "index": 0}]]
    }
  },
  "settings": {}
}
EOF

# Importer
n8n import:workflow --input=/tmp/workflow.json
```

### Étape 3 : Exécuter

```bash
# Récupérer l'ID du workflow importé
WORKFLOW_ID=$(n8n export:workflow --all 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for wf in data:
    if wf['name'] == 'Calendar Sync':
        print(wf['id'])
        break
")

# Exécuter
n8n execute --id=$WORKFLOW_ID
```

---

## 5. Gestion des tokens OAuth

### Refresh Token automatique

n8n gère automatiquement le refresh des tokens OAuth2. Le champ `oauthTokenData` contient les métadonnées :

```json
{
  "data": {
    "accessToken": "ya29.xxx",
    "refreshToken": "1//xxx",
    "oauthTokenData": {
      "access_token": "ya29.xxx",
      "refresh_token": "1//xxx",
      "expiry_date": 1701619200000,
      "token_type": "Bearer",
      "scope": "..."
    }
  }
}
```

### Mise à jour manuelle des tokens

Via API REST :

```bash
curl -X PATCH "http://pi6.local:5678/api/v1/credentials/google_calendar_prod" \
  -H "X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "accessToken": "NEW_ACCESS_TOKEN",
      "refreshToken": "NEW_REFRESH_TOKEN"
    }
  }'
```

---

## 6. API REST alternative

Si la CLI pose problème, utiliser l'API REST :

### Endpoints disponibles

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/v1/workflows` | Liste tous les workflows |
| POST | `/api/v1/workflows` | Crée un nouveau workflow |
| GET | `/api/v1/workflows/{id}` | Récupère un workflow |
| PUT | `/api/v1/workflows/{id}` | Met à jour un workflow |
| POST | `/api/v1/workflows/{id}/run` | Exécute un workflow |
| GET | `/api/v1/credentials` | Liste les credentials |
| POST | `/api/v1/credentials` | Crée un credential |
| PATCH | `/api/v1/credentials/{id}` | Met à jour un credential |

### Exemple : Créer un workflow via API

```bash
curl -X POST "http://pi6.local:5678/api/v1/workflows" \
  -H "X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Created Workflow",
    "nodes": [...],
    "connections": {...},
    "settings": {}
  }'
```

### Clé API disponible

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY0NzgxODYxfQ.qzNk9ixI5t8xQ9L3PF9ZF-fsRgIf_YwIcx91LqcPpX0
```

---

## 7. Serveur MCP natif n8n

n8n expose un serveur MCP (Model Context Protocol) natif permettant à des agents IA (Claude, GPT, etc.) d'interagir directement avec les workflows.

### Configuration du serveur MCP

| Paramètre | Valeur |
|-----------|--------|
| **Endpoint** | `http://pi6.local:5678/mcp-server/http` |
| **Protocole** | HTTP Streamable |
| **Authentification** | Bearer Token |

### Token d'accès MCP

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImZmZGU0ZDQ3LTA2MTktNDczYi04Zjk5LWQxN2ZkOTRjODg3OCIsImlhdCI6MTc2NDgwMjY5OX0.TXlbP9s3_llh9TL2LpW9H0Oar7IcYJ1UsS0RfWTu9Hs
```

### Configuration pour Claude Desktop

Ajouter dans `~/.config/claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "supergateway",
        "--streamableHttp",
        "http://pi6.local:5678/mcp-server/http",
        "--header",
        "authorization:Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImZmZGU0ZDQ3LTA2MTktNDczYi04Zjk5LWQxN2ZkOTRjODg3OCIsImlhdCI6MTc2NDgwMjY5OX0.TXlbP9s3_llh9TL2LpW9H0Oar7IcYJ1UsS0RfWTu9Hs"
      ]
    }
  }
}
```

### Activer un workflow pour MCP

Pour qu'un workflow soit accessible via MCP, il faut l'activer dans ses settings :

1. Ouvrir le workflow dans l'UI n8n
2. Cliquer sur **Settings** (icône ⚙️)
3. Scroller vers le bas
4. Activer **"Available in MCP"**
5. Cliquer sur **Save**

![Settings MCP](settings1.png)

### Appel d'un workflow via MCP

#### Étape 1 : Lister les tools disponibles

```bash
curl -s -X POST 'http://pi6.local:5678/mcp-server/http' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImZmZGU0ZDQ3LTA2MTktNDczYi04Zjk5LWQxN2ZkOTRjODg3OCIsImlhdCI6MTc2NDgwMjY5OX0.TXlbP9s3_llh9TL2LpW9H0Oar7IcYJ1UsS0RfWTu9Hs' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

#### Étape 2 : Exécuter un workflow

```bash
curl -s -X POST 'http://pi6.local:5678/mcp-server/http' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImZmZGU0ZDQ3LTA2MTktNDczYi04Zjk5LWQxN2ZkOTRjODg3OCIsImlhdCI6MTc2NDgwMjY5OX0.TXlbP9s3_llh9TL2LpW9H0Oar7IcYJ1UsS0RfWTu9Hs' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "execute_workflow",
      "arguments": {
        "workflowId": "YBLbYZFCvBbWFjUG"
      }
    },
    "id": 2
  }'
```

### Exemple testé et validé : Workflow "Calculate the Centroid of a Set of Vectors"

| Paramètre | Valeur |
|-----------|--------|
| **ID** | `YBLbYZFCvBbWFjUG` |
| **Webhook Path** | `/centroid` |
| **Webhook Method** | `GET` |
| **MCP Tool** | `execute_workflow` |

**✅ Test MCP validé** :

```bash
curl -s -X POST 'http://pi6.local:5678/mcp-server/http' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImZmZGU0ZDQ3LTA2MTktNDczYi04Zjk5LWQxN2ZkOTRjODg3OCIsImlhdCI6MTc2NDgwMjY5OX0.TXlbP9s3_llh9TL2LpW9H0Oar7IcYJ1UsS0RfWTu9Hs' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "execute_workflow",
      "arguments": {
        "workflowId": "YBLbYZFCvBbWFjUG"
      }
    },
    "id": 2
  }'
```

**Résultat** :
```json
{
  "success": true,
  "executionId": "5",
  "result": {
    "centroid": [4, 5, 6]
  }
}
```

Le calcul est correct : le centroïde de `[[1,2,3], [4,5,6], [7,8,9]]` est bien `[4, 5, 6]` (moyenne de chaque dimension).

**Test via webhook GET (sans MCP)** :

```bash
curl "http://pi6.local:5678/webhook/centroid?vectors=%5B%5B1%2C2%2C3%5D%2C%5B4%2C5%2C6%5D%2C%5B7%2C8%2C9%5D%5D"
```

### Comparaison des méthodes d'accès

| Méthode | Endpoint | Authentification | Usage |
|---------|----------|------------------|-------|
| **API REST** | `/api/v1/workflows/{id}/run` | X-N8N-API-KEY | Programmatique |
| **Webhook** | `/webhook/{path}` | Aucune (ou custom) | Intégrations HTTP |
| **MCP** | `/mcp-server/http` | Bearer Token | Agents IA |
| **CLI** | `n8n execute --id=` | Session locale | Scripts/Cron |

### Tokens disponibles

| Type | Token | Usage |
|------|-------|-------|
| **API REST** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY0NzgxODYxfQ.qzNk9ixI5t8xQ9L3PF9ZF-fsRgIf_YwIcx91LqcPpX0` | Header `X-N8N-API-KEY` |
| **MCP** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImZmZGU0ZDQ3LTA2MTktNDczYi04Zjk5LWQxN2ZkOTRjODg3OCIsImlhdCI6MTc2NDgwMjY5OX0.TXlbP9s3_llh9TL2LpW9H0Oar7IcYJ1UsS0RfWTu9Hs` | Header `Authorization: Bearer` |

---

## 8. Troubleshooting

### Erreur: `NOT NULL constraint failed: credentials_entity.id`

**Cause** : Le champ `id` est manquant dans le JSON de credentials.

**Solution** : Ajouter un `id` unique à chaque credential :

```json
{
  "id": "mon_credential_unique_id",
  "name": "...",
  "type": "...",
  "data": {...}
}
```

### Erreur: `NOT NULL constraint failed: workflow_entity.versionId`

**Cause** : Le champ `versionId` est manquant.

**Solution** : Ajouter un `versionId` (UUID ou string unique) :

```json
{
  "versionId": "v1-2024-01-01",
  ...
}
```

### Erreur: `Could not find workflow` lors de l'import

**Cause** : Le workflow référence un ID qui n'existe pas (problème de webhook).

**Solution** : Supprimer le champ `id` du workflow pour laisser n8n en générer un nouveau.

### Erreur: Credential non trouvé lors de l'exécution

**Cause** : Le workflow référence un credential ID qui n'existe pas.

**Solution** :
1. Importer d'abord les credentials
2. Vérifier que l'`id` dans le node correspond à l'`id` du credential importé

### Vérifier les imports

```bash
# Lister les workflows importés
python3 -c "
import sqlite3
conn = sqlite3.connect('/home/fsebb/.n8n/database.sqlite')
for row in conn.execute('SELECT id, name FROM workflow_entity'):
    print(f'{row[0]}: {row[1]}')
"

# Lister les credentials importés
python3 -c "
import sqlite3
conn = sqlite3.connect('/home/fsebb/.n8n/database.sqlite')
for row in conn.execute('SELECT id, name, type FROM credentials_entity'):
    print(f'{row[0]}: {row[1]} ({row[2]})')
"
```

### Erreur: WorkflowHistoryService.getVersion lors de l'activation

**Cause** : Les workflows importés n'ont pas d'entrée dans la table `workflow_history`.

**Solution** : Créer les entrées manquantes :

```python
import sqlite3

conn = sqlite3.connect('/home/fsebb/.n8n/database.sqlite')
cursor = conn.cursor()

# Créer les entrées workflow_history manquantes
cursor.execute('''
    INSERT OR IGNORE INTO workflow_history
    (versionId, workflowId, authors, createdAt, updatedAt, nodes, connections, name, autosaved, description)
    SELECT versionId, id, 'import', createdAt, updatedAt, nodes, connections, name, 0, description
    FROM workflow_entity w
    WHERE NOT EXISTS (
        SELECT 1 FROM workflow_history h WHERE h.versionId = w.versionId
    )
''')
conn.commit()
print(f'Entrées créées: {cursor.rowcount}')
conn.close()
```

### Erreur: staticData invalide (Unexpected end of JSON input)

**Cause** : Certains workflows ont un champ `staticData` contenant `""` au lieu de `NULL`.

**Solution** :

```python
import sqlite3

conn = sqlite3.connect('/home/fsebb/.n8n/database.sqlite')
cursor = conn.cursor()
cursor.execute('UPDATE workflow_entity SET staticData = NULL WHERE staticData = ?', ('""',))
conn.commit()
print(f'Workflows corrigés: {cursor.rowcount}')
conn.close()
```

---

## Ressources

- **n8n Documentation** : https://docs.n8n.io/api/
- **API Reference** : https://docs.n8n.io/api/api-reference/
- **Credential Types** : https://docs.n8n.io/integrations/
- **MCP Protocol** : https://modelcontextprotocol.io/

---

*Document mis à jour le 2025-12-04 pour l'équipe mcp-server*
