# Google Calendar MCP Server

## Objectif

Créer un serveur MCP pour Google Calendar permettant de gérer les événements via n8n avec OAuth dynamique.

## Prérequis

### Backend API (authent-service)

1. **Scopes à configurer** dans `google_services_routes.py` :

| Niveau | Scopes | Permissions |
|--------|--------|-------------|
| minimal | `calendar.readonly` | Lecture seule |
| standard | `calendar.readonly` + `calendar.events.readonly` | Lecture événements |
| full | `calendar` | Lecture + écriture complète |

2. **Endpoint d'authentification** :
```
/api/services/google/connect?services=calendar&access_level=full
```

### Console Google Cloud

Ajouter le scope dans OAuth consent screen :
- `https://www.googleapis.com/auth/calendar`

## Tâches n8n-workflows

### 1. Custom Node

Créer `n8n-nodes-calendar-dynamic` basé sur `n8n-nodes-gmail-dynamic` :

```
custom-nodes/
└── n8n-nodes-calendar-dynamic/
    ├── nodes/
    │   └── CalendarToolDynamic/
    │       └── CalendarToolDynamic.node.ts
    ├── package.json
    └── tsconfig.json
```

### 2. Workflow MCP

Créer `workflows/mcp/MCP_Calendar_Server.json` avec :

**Opérations supportées :**

| Resource | Operations |
|----------|------------|
| event | create, delete, get, getAll, update |
| calendar | getAll |

**Structure du workflow :**
```
Webhook → Switch Router → [Operation Nodes] → Response
```

### 3. Paramètres des opérations

#### event/create
```json
{
  "access_token": "string",
  "resource": "event",
  "operation": "create",
  "calendar_id": "primary",
  "summary": "string",
  "start": "ISO datetime",
  "end": "ISO datetime",
  "description": "string (optional)",
  "location": "string (optional)",
  "attendees": ["email1", "email2"] (optional)
}
```

#### event/getAll
```json
{
  "access_token": "string",
  "resource": "event",
  "operation": "getAll",
  "calendar_id": "primary",
  "time_min": "ISO datetime (optional)",
  "time_max": "ISO datetime (optional)",
  "max_results": 10
}
```

#### event/get
```json
{
  "access_token": "string",
  "resource": "event",
  "operation": "get",
  "calendar_id": "primary",
  "event_id": "string"
}
```

#### event/update
```json
{
  "access_token": "string",
  "resource": "event",
  "operation": "update",
  "calendar_id": "primary",
  "event_id": "string",
  "summary": "string (optional)",
  "start": "ISO datetime (optional)",
  "end": "ISO datetime (optional)"
}
```

#### event/delete
```json
{
  "access_token": "string",
  "resource": "event",
  "operation": "delete",
  "calendar_id": "primary",
  "event_id": "string"
}
```

#### calendar/getAll
```json
{
  "access_token": "string",
  "resource": "calendar",
  "operation": "getAll"
}
```

## Tests

```bash
# Lister les calendriers
curl -X POST http://pi6.local:5678/webhook/mcp-calendar \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "calendar",
    "operation": "getAll"
  }'

# Créer un événement
curl -X POST http://pi6.local:5678/webhook/mcp-calendar \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "event",
    "operation": "create",
    "calendar_id": "primary",
    "summary": "Test Event",
    "start": "2025-12-06T10:00:00Z",
    "end": "2025-12-06T11:00:00Z"
  }'
```

## Références

- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [n8n Google Calendar Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/)
