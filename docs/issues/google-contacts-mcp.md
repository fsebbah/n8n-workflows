# Google Contacts MCP Server

## Objectif

Créer un serveur MCP pour Google Contacts (People API) permettant de gérer les contacts via n8n avec OAuth dynamique.

## Prérequis

### Backend API (authent-service)

1. **Scopes à configurer** dans `google_services_routes.py` :

| Niveau | Scopes | Permissions |
|--------|--------|-------------|
| minimal | `contacts.readonly` | Lecture seule |
| standard | `contacts.readonly` + `contacts.other.readonly` | Lecture contacts + autres |
| full | `contacts` | Lecture + écriture complète |

2. **Endpoint d'authentification** :
```
/api/services/google/connect?services=contacts&access_level=full
```

### Console Google Cloud

Ajouter le scope dans OAuth consent screen :
- `https://www.googleapis.com/auth/contacts`

## Tâches n8n-workflows

### 1. Custom Node

Créer `n8n-nodes-contacts-dynamic` basé sur `n8n-nodes-gmail-dynamic` :

```
custom-nodes/
└── n8n-nodes-contacts-dynamic/
    ├── nodes/
    │   └── ContactsToolDynamic/
    │       └── ContactsToolDynamic.node.ts
    ├── package.json
    └── tsconfig.json
```

### 2. Workflow MCP

Créer `workflows/mcp/MCP_Contacts_Server.json` avec :

**Opérations supportées :**

| Resource | Operations |
|----------|------------|
| contact | create, delete, get, getAll, update |
| contactGroup | getAll |

**Structure du workflow :**
```
Webhook → Switch Router → [Operation Nodes] → Response
```

### 3. Paramètres des opérations

#### contact/getAll
```json
{
  "access_token": "string",
  "resource": "contact",
  "operation": "getAll",
  "max_results": 100,
  "query": "string (optional)"
}
```

#### contact/get
```json
{
  "access_token": "string",
  "resource": "contact",
  "operation": "get",
  "resource_name": "people/c123456789"
}
```

#### contact/create
```json
{
  "access_token": "string",
  "resource": "contact",
  "operation": "create",
  "given_name": "string",
  "family_name": "string (optional)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "company": "string (optional)",
  "job_title": "string (optional)"
}
```

#### contact/update
```json
{
  "access_token": "string",
  "resource": "contact",
  "operation": "update",
  "resource_name": "people/c123456789",
  "given_name": "string (optional)",
  "family_name": "string (optional)",
  "email": "string (optional)",
  "phone": "string (optional)"
}
```

#### contact/delete
```json
{
  "access_token": "string",
  "resource": "contact",
  "operation": "delete",
  "resource_name": "people/c123456789"
}
```

#### contactGroup/getAll
```json
{
  "access_token": "string",
  "resource": "contactGroup",
  "operation": "getAll"
}
```

## Tests

```bash
# Lister les contacts
curl -X POST http://pi6.local:5678/webhook/mcp-contacts \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "contact",
    "operation": "getAll",
    "max_results": 10
  }'

# Créer un contact
curl -X POST http://pi6.local:5678/webhook/mcp-contacts \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "contact",
    "operation": "create",
    "given_name": "John",
    "family_name": "Doe",
    "email": "john.doe@example.com"
  }'
```

## Notes

- Google Contacts utilise la **People API** (pas l'ancienne Contacts API)
- Les identifiants de contacts sont au format `people/c123456789`
- L'API nécessite de spécifier les `personFields` pour les données à retourner

## Références

- [Google People API](https://developers.google.com/people/api/rest)
- [n8n Google Contacts Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecontacts/)
