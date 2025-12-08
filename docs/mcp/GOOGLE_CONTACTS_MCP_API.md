# Google Contacts MCP Server - API Documentation

## Overview

The Google Contacts MCP Server provides a webhook-based API to interact with Google Contacts via the People API. It supports multi-tenant authentication via dynamic OAuth tokens.

**Endpoint:** `POST /webhook/mcp-contacts`

## Authentication

All requests must include `access_token` in the request body.

```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "getAll"
}
```

**Required Scope:** `https://www.googleapis.com/auth/contacts`

## Resources

### Contact Resource

Operations on individual contacts.

---

#### `create` - Create Contact

Create a new contact.

**Request:**
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
  "job_title": "Developer",
  "notes": "Met at conference 2025"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `given_name` | string | No | First name |
| `family_name` | string | No | Last name |
| `email` | string | No | Email address |
| `email_type` | string | No | home, work, other (default: work) |
| `phone` | string | No | Phone number |
| `phone_type` | string | No | mobile, home, work, other (default: mobile) |
| `organization` | string | No | Company name |
| `job_title` | string | No | Job title |
| `notes` | string | No | Notes/biography |

---

#### `get` - Get Contact

Get a contact by resource name.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "get",
  "resource_name": "people/c123456789",
  "person_fields": "names,emailAddresses,phoneNumbers,organizations,photos"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource_name` | string | Yes | Contact ID (e.g., people/c123456789) |
| `person_fields` | string | No | Fields to return (default: names,emailAddresses,phoneNumbers,organizations,photos) |

---

#### `getAll` - Get All Contacts

List all contacts.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "getAll",
  "page_size": 100,
  "page_token": "",
  "person_fields": "names,emailAddresses,phoneNumbers"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_size` | number | No | Results per page (default: 100, max: 1000) |
| `page_token` | string | No | Token for pagination |
| `person_fields` | string | No | Fields to return |

**Response:**
```json
{
  "connections": [
    {
      "resourceName": "people/c123456789",
      "names": [{ "displayName": "John Doe", "givenName": "John", "familyName": "Doe" }],
      "emailAddresses": [{ "value": "john@example.com", "type": "work" }],
      "phoneNumbers": [{ "value": "+33612345678", "type": "mobile" }]
    }
  ],
  "totalPeople": 150,
  "nextPageToken": "abc123..."
}
```

---

#### `update` - Update Contact

Update an existing contact.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "update",
  "resource_name": "people/c123456789",
  "given_name": "John",
  "family_name": "Smith",
  "email": "john.smith@newcompany.com",
  "organization": "New Company"
}
```

---

#### `delete` - Delete Contact

Delete a contact.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "delete",
  "resource_name": "people/c123456789"
}
```

---

#### `search` - Search Contacts

Search contacts by query.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "search",
  "query": "John",
  "page_size": 30,
  "person_fields": "names,emailAddresses,phoneNumbers"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query (name, email, phone) |
| `page_size` | number | No | Results to return (default: 30) |
| `person_fields` | string | No | Fields to return |

---

### Contact Group Resource

Operations on contact groups (labels).

---

#### `create` - Create Group

Create a new contact group.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "create",
  "group_name": "VIP Clients"
}
```

---

#### `get` - Get Group

Get a contact group.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "get",
  "group_resource_name": "contactGroups/abc123"
}
```

---

#### `getAll` - Get All Groups

List all contact groups.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "getAll",
  "page_size": 100
}
```

**Response:**
```json
{
  "contactGroups": [
    {
      "resourceName": "contactGroups/abc123",
      "name": "VIP Clients",
      "memberCount": 15
    },
    {
      "resourceName": "contactGroups/myContacts",
      "name": "My Contacts",
      "memberCount": 150
    }
  ]
}
```

---

#### `update` - Update Group

Update a contact group name.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "update",
  "group_resource_name": "contactGroups/abc123",
  "group_name": "Premium Clients"
}
```

---

#### `delete` - Delete Group

Delete a contact group.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "delete",
  "group_resource_name": "contactGroups/abc123"
}
```

---

#### `addMembers` - Add Members to Group

Add contacts to a group.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "addMembers",
  "group_resource_name": "contactGroups/abc123",
  "resource_names": ["people/c123", "people/c456", "people/c789"]
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `group_resource_name` | string | Yes | Group ID |
| `resource_names` | array/string | Yes | Contact IDs to add (array or comma-separated) |

---

#### `removeMembers` - Remove Members from Group

Remove contacts from a group.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "removeMembers",
  "group_resource_name": "contactGroups/abc123",
  "resource_names": ["people/c123"]
}
```

---

## Person Fields Reference

Available fields for `person_fields` parameter:

| Field | Description |
|-------|-------------|
| `names` | Display name, given name, family name |
| `emailAddresses` | Email addresses with types |
| `phoneNumbers` | Phone numbers with types |
| `addresses` | Physical addresses |
| `organizations` | Company, title, department |
| `birthdays` | Birthday date |
| `urls` | Website URLs |
| `biographies` | Notes/biography |
| `photos` | Profile photos |
| `memberships` | Group memberships |
| `relations` | Relationships (spouse, etc.) |
| `events` | Important dates |

**Example:** `names,emailAddresses,phoneNumbers,organizations,photos`

---

## System Groups

| Resource Name | Description |
|--------------|-------------|
| `contactGroups/myContacts` | All contacts |
| `contactGroups/starred` | Starred contacts |
| `contactGroups/all` | All contacts + other contacts |
| `contactGroups/friends` | Friends |
| `contactGroups/family` | Family |
| `contactGroups/coworkers` | Coworkers |

---

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

---

## Usage Examples

### Create a business contact

```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "create",
  "given_name": "Marie",
  "family_name": "Dupont",
  "email": "marie.dupont@acme.fr",
  "email_type": "work",
  "phone": "+33145678900",
  "phone_type": "work",
  "organization": "ACME France",
  "job_title": "Directrice Commerciale",
  "notes": "Rencontrée au salon 2025 - Intéressée par notre offre Enterprise"
}
```

### Search and add to group

1. Search for contacts:
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contact",
  "operation": "search",
  "query": "ACME"
}
```

2. Add found contacts to VIP group:
```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "addMembers",
  "group_resource_name": "contactGroups/abc123",
  "resource_names": ["people/c111", "people/c222"]
}
```

### List all VIP clients

```json
{
  "access_token": "ya29.xxx...",
  "resource": "contactGroup",
  "operation": "get",
  "group_resource_name": "contactGroups/abc123"
}
```
