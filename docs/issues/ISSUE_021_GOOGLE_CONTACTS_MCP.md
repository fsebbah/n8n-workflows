# Issue #21: Google Contacts MCP Server

## Objectif

Créer un serveur MCP pour Google Contacts permettant la gestion des contacts via l'API Google People.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   MCP Client    │────▶│  n8n Workflow    │────▶│  Google People API  │
│  (Claude, etc)  │     │  /mcp-contacts   │     │                     │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ ContactsDynamic  │
                        │   Custom Node    │
                        └──────────────────┘
```

## API Google People

**Base URL:** `https://people.googleapis.com/v1`

### Scopes requis
- `https://www.googleapis.com/auth/contacts` - Lecture/écriture contacts
- `https://www.googleapis.com/auth/contacts.readonly` - Lecture seule
- `https://www.googleapis.com/auth/contacts.other.readonly` - Autres contacts

## Opérations à implémenter

### Resource: Contact

| Opération | Méthode | Endpoint | Description |
|-----------|---------|----------|-------------|
| `create` | POST | `/people:createContact` | Créer un contact |
| `get` | GET | `/people/{resourceName}` | Obtenir un contact |
| `getAll` | GET | `/people/me/connections` | Lister tous les contacts |
| `update` | PATCH | `/people/{resourceName}:updateContact` | Mettre à jour un contact |
| `delete` | DELETE | `/people/{resourceName}:deleteContact` | Supprimer un contact |
| `search` | GET | `/people:searchContacts` | Rechercher des contacts |
| `batchCreate` | POST | `/people:batchCreateContacts` | Créer plusieurs contacts |
| `batchUpdate` | POST | `/people:batchUpdateContacts` | Mettre à jour plusieurs contacts |
| `batchDelete` | POST | `/people:batchDeleteContacts` | Supprimer plusieurs contacts |

### Resource: Contact Group

| Opération | Méthode | Endpoint | Description |
|-----------|---------|----------|-------------|
| `create` | POST | `/contactGroups` | Créer un groupe |
| `get` | GET | `/contactGroups/{resourceName}` | Obtenir un groupe |
| `getAll` | GET | `/contactGroups` | Lister tous les groupes |
| `update` | PUT | `/contactGroups/{resourceName}` | Mettre à jour un groupe |
| `delete` | DELETE | `/contactGroups/{resourceName}` | Supprimer un groupe |
| `addMembers` | POST | `/contactGroups/{resourceName}/members:modify` | Ajouter des membres |
| `removeMembers` | POST | `/contactGroups/{resourceName}/members:modify` | Retirer des membres |

### Resource: Other Contacts

| Opération | Méthode | Endpoint | Description |
|-----------|---------|----------|-------------|
| `list` | GET | `/otherContacts` | Lister les autres contacts |
| `search` | GET | `/otherContacts:search` | Rechercher dans autres contacts |
| `copyToMyContacts` | POST | `/otherContacts/{resourceName}:copyOtherContactToMyContactsGroup` | Copier vers mes contacts |

## Structure d'un Contact

```json
{
  "resourceName": "people/c123456789",
  "etag": "%EgUBAi43...",
  "names": [
    {
      "displayName": "John Doe",
      "familyName": "Doe",
      "givenName": "John",
      "middleName": ""
    }
  ],
  "emailAddresses": [
    {
      "value": "john.doe@example.com",
      "type": "work"
    }
  ],
  "phoneNumbers": [
    {
      "value": "+33612345678",
      "type": "mobile"
    }
  ],
  "addresses": [
    {
      "streetAddress": "123 Main St",
      "city": "Paris",
      "postalCode": "75001",
      "country": "France",
      "type": "home"
    }
  ],
  "organizations": [
    {
      "name": "Company Inc",
      "title": "Developer",
      "department": "Engineering"
    }
  ],
  "birthdays": [
    {
      "date": {
        "year": 1990,
        "month": 5,
        "day": 15
      }
    }
  ],
  "urls": [
    {
      "value": "https://linkedin.com/in/johndoe",
      "type": "profile"
    }
  ],
  "biographies": [
    {
      "value": "Software developer",
      "contentType": "TEXT_PLAIN"
    }
  ],
  "memberships": [
    {
      "contactGroupMembership": {
        "contactGroupResourceName": "contactGroups/myContacts"
      }
    }
  ]
}
```

## PersonFields (champs à récupérer)

Pour optimiser les requêtes, spécifier les champs nécessaires:

```
personFields=names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,urls,biographies,memberships,photos
```

## Custom Node: n8n-nodes-contacts-dynamic

### Structure

```
custom-nodes/
└── n8n-nodes-contacts-dynamic/
    ├── nodes/
    │   └── ContactsToolDynamic/
    │       ├── ContactsToolDynamic.node.ts
    │       └── contacts.svg
    ├── package.json
    └── tsconfig.json
```

### Paramètres du Node

| Paramètre | Type | Description |
|-----------|------|-------------|
| `accessToken` | string | Token OAuth dynamique |
| `resource` | options | contact, contactGroup, otherContact |
| `operation` | options | Dépend de la resource |
| `resourceName` | string | ID du contact (people/c123) |
| `personFields` | string | Champs à récupérer |

### Paramètres Contact Create/Update

| Paramètre | Type | Description |
|-----------|------|-------------|
| `givenName` | string | Prénom |
| `familyName` | string | Nom de famille |
| `email` | string | Email principal |
| `emailType` | options | home, work, other |
| `phone` | string | Téléphone principal |
| `phoneType` | options | mobile, home, work |
| `organization` | string | Entreprise |
| `jobTitle` | string | Poste |
| `notes` | string | Notes/biographie |

## Workflow MCP

### Endpoint
`POST /webhook/mcp-contacts`

### Routes

| Route | Operation |
|-------|-----------|
| contact/create | Créer un contact |
| contact/get | Obtenir un contact |
| contact/getAll | Lister les contacts |
| contact/update | Mettre à jour |
| contact/delete | Supprimer |
| contact/search | Rechercher |
| contactGroup/create | Créer un groupe |
| contactGroup/get | Obtenir un groupe |
| contactGroup/getAll | Lister les groupes |
| contactGroup/update | Mettre à jour |
| contactGroup/delete | Supprimer |
| contactGroup/addMembers | Ajouter membres |
| contactGroup/removeMembers | Retirer membres |

## Exemples de requêtes MCP

### Créer un contact

```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "create",
  "given_name": "John",
  "family_name": "Doe",
  "email": "john.doe@example.com",
  "email_type": "work",
  "phone": "+33612345678",
  "phone_type": "mobile",
  "organization": "Company Inc",
  "job_title": "Developer"
}
```

### Rechercher des contacts

```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "search",
  "query": "John",
  "page_size": 10
}
```

### Créer un groupe

```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "create",
  "name": "VIP Clients"
}
```

### Ajouter des membres à un groupe

```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "addMembers",
  "group_resource_name": "contactGroups/abc123",
  "resource_names": ["people/c123", "people/c456"]
}
```

## Checklist d'implémentation

### Phase 1: Custom Node
- [ ] Créer la structure du package
- [ ] Implémenter les opérations Contact (CRUD)
- [ ] Implémenter l'opération search
- [ ] Implémenter les opérations Contact Group
- [ ] Compiler et tester

### Phase 2: Workflow MCP
- [ ] Créer le workflow avec webhook
- [ ] Configurer le routeur Switch
- [ ] Ajouter tous les nodes d'opération
- [ ] Tester chaque route

### Phase 3: Documentation
- [ ] Créer GOOGLE_CONTACTS_MCP_API.md
- [ ] Documenter tous les endpoints
- [ ] Ajouter des exemples

## Références

- [Google People API Documentation](https://developers.google.com/people)
- [People API Reference](https://developers.google.com/people/api/rest)
- [PersonFields](https://developers.google.com/people/api/rest/v1/people/get#query-parameters)
