# n8n-nodes-gmail-dynamic

Custom n8n node for Gmail API with **dynamic OAuth token support** - designed for multi-tenant architectures.

## Why this node?

The native `gmailTool` node in n8n requires a static OAuth credential configured in n8n's credential store. This is **mono-user** by design - one credential per n8n instance.

**`gmailToolDynamic`** accepts the OAuth access_token as an **input parameter**, allowing:
- Multi-tenant architectures
- Tokens stored in external systems (Redis, database)
- Per-request authentication
- MCP (Model Context Protocol) integrations

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   MCP Server    │      │   n8n Webhook   │      │ gmailToolDynamic│
│                 │─────▶│                 │─────▶│                 │
│ (Redis: tokens) │      │ body.token      │      │ {{ $json.token }}│
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## Installation

### Option 1: npm (after publishing)

```bash
npm install -g n8n-nodes-gmail-dynamic
```

### Option 2: Local development

```bash
cd custom-nodes/n8n-nodes-gmail-dynamic
npm install
npm run build
npm link

# In your n8n custom directory
cd ~/.n8n
npm link n8n-nodes-gmail-dynamic

# Restart n8n
pm2 restart n8n
```

### Option 3: Docker

```dockerfile
FROM n8nio/n8n:latest
USER root
COPY ./n8n-nodes-gmail-dynamic /tmp/n8n-nodes-gmail-dynamic
RUN cd /tmp/n8n-nodes-gmail-dynamic && npm install && npm run build && npm install -g .
USER node
```

## Usage

### In n8n workflow

1. Add the **Gmail Dynamic** node
2. Set **Access Token** to an expression: `{{ $json.access_token }}`
3. Select resource and operation
4. Configure operation-specific parameters

### Example: Webhook → Gmail Search

```json
{
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "gmail-search",
        "httpMethod": "POST"
      }
    },
    {
      "name": "Gmail Dynamic",
      "type": "n8n-nodes-gmail-dynamic.gmailToolDynamic",
      "parameters": {
        "accessToken": "={{ $json.body.access_token }}",
        "resource": "message",
        "operation": "search",
        "query": "={{ $json.body.query }}",
        "maxResults": 10
      }
    }
  ]
}
```

### Calling from MCP Server

```bash
curl -X POST http://your-n8n:5678/webhook/gmail-search \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "ya29.a0AfH6SMBx...",
    "query": "from:boss@company.com is:unread"
  }'
```

## Supported Operations

### Messages
| Operation | Description | Required Parameters |
|-----------|-------------|---------------------|
| search | Search messages | query |
| get | Get message by ID | messageId |
| getMany | List messages | maxResults |
| send | Send email | to, subject, body |
| reply | Reply to email | messageId, to, body |
| delete | Trash message | messageId |
| markRead | Mark as read | messageId |
| markUnread | Mark as unread | messageId |
| addLabels | Add labels | messageId, labelIds |
| removeLabels | Remove labels | messageId, labelIds |

### Drafts
| Operation | Description | Required Parameters |
|-----------|-------------|---------------------|
| create | Create draft | to, subject, body |
| get | Get draft | draftId |
| getMany | List drafts | maxResults |
| delete | Delete draft | draftId |
| send | Send draft | draftId |

### Labels
| Operation | Description | Required Parameters |
|-----------|-------------|---------------------|
| list | List all labels | - |
| get | Get label | labelId |
| create | Create label | labelName |
| delete | Delete label | labelId |
| update | Update label | labelId, labelName |

### Threads
| Operation | Description | Required Parameters |
|-----------|-------------|---------------------|
| get | Get thread | threadId |
| getMany | List threads | maxResults |
| delete | Trash thread | threadId |
| modify | Modify labels | threadId, labelIds |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Lint
npm run lint
```

## License

MIT
