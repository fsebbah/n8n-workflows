# Custom Node: Gmail Tool Dynamic

## Objectif

Créer un custom node n8n qui accepte l'OAuth access_token comme **paramètre d'entrée** (et non comme credential statique), permettant une architecture **multi-tenant** où chaque utilisateur a son propre token stocké dans Redis.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   MCP Server    │      │   n8n Webhook   │      │ gmailToolDynamic│
│                 │─────▶│                 │─────▶│                 │
│ (Redis: tokens) │      │ body.token      │      │ {{ $json.token }}│
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## Différence avec le node Gmail natif

| Aspect | Gmail natif | gmailToolDynamic |
|--------|-------------|------------------|
| Credential | Statique (gmailOAuth2) | Dynamique (paramètre) |
| Multi-tenant | ❌ Non | ✅ Oui |
| Token source | n8n credentials store | Input data / expression |
| Configuration | UI n8n | Via webhook body |

## Structure du projet

```
n8n-nodes-gmail-dynamic/
├── nodes/
│   └── GmailToolDynamic/
│       ├── GmailToolDynamic.node.ts
│       ├── GmailToolDynamic.node.json
│       └── gmail.svg
├── credentials/
│   └── (vide - pas de credentials)
├── package.json
├── tsconfig.json
└── README.md
```

## Définition du Node

### package.json

```json
{
  "name": "n8n-nodes-gmail-dynamic",
  "version": "1.0.0",
  "description": "Gmail node with dynamic OAuth token support for multi-tenant architectures",
  "keywords": [
    "n8n-community-node-package",
    "n8n",
    "gmail",
    "oauth",
    "multi-tenant"
  ],
  "license": "MIT",
  "main": "dist/nodes/GmailToolDynamic/GmailToolDynamic.node.js",
  "n8n": {
    "n8nNodesApiVersion": 1,
    "nodes": [
      "dist/nodes/GmailToolDynamic/GmailToolDynamic.node.js"
    ]
  },
  "scripts": {
    "build": "tsc && cp nodes/**/*.json dist/nodes/ && cp nodes/**/*.svg dist/nodes/",
    "dev": "tsc --watch",
    "lint": "eslint nodes --ext .ts",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "n8n-workflow": "^1.0.0",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "n8n-workflow": "*"
  }
}
```

### GmailToolDynamic.node.ts

```typescript
import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  NodeApiError,
  JsonObject,
} from 'n8n-workflow';

export class GmailToolDynamic implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Gmail Tool Dynamic',
    name: 'gmailToolDynamic',
    icon: 'file:gmail.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["operation"] }}',
    description: 'Gmail API with dynamic OAuth token from input',
    defaults: {
      name: 'Gmail Dynamic',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [], // PAS de credentials statiques
    properties: [
      // === ACCESS TOKEN (DYNAMIQUE) ===
      {
        displayName: 'Access Token',
        name: 'accessToken',
        type: 'string',
        typeOptions: {
          password: true,
        },
        required: true,
        default: '',
        placeholder: '{{ $json.access_token }}',
        description: 'OAuth 2.0 access token. Use expression to get from webhook body.',
      },
      // === RESOURCE ===
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Message', value: 'message' },
          { name: 'Draft', value: 'draft' },
          { name: 'Label', value: 'label' },
          { name: 'Thread', value: 'thread' },
        ],
        default: 'message',
      },
      // === OPERATIONS: MESSAGE ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['message'] },
        },
        options: [
          { name: 'Search', value: 'search', description: 'Search messages' },
          { name: 'Get', value: 'get', description: 'Get a message by ID' },
          { name: 'Send', value: 'send', description: 'Send an email' },
          { name: 'Reply', value: 'reply', description: 'Reply to an email' },
          { name: 'Delete', value: 'delete', description: 'Delete a message' },
          { name: 'Mark Read', value: 'markRead', description: 'Mark as read' },
          { name: 'Mark Unread', value: 'markUnread', description: 'Mark as unread' },
        ],
        default: 'search',
      },
      // === OPERATIONS: LABEL ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['label'] },
        },
        options: [
          { name: 'List', value: 'list', description: 'List all labels' },
          { name: 'Create', value: 'create', description: 'Create a label' },
          { name: 'Delete', value: 'delete', description: 'Delete a label' },
        ],
        default: 'list',
      },
      // === PARAMETERS: SEARCH ===
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['message'], operation: ['search'] },
        },
        default: '',
        placeholder: 'from:sender@example.com is:unread',
        description: 'Gmail search query syntax',
      },
      {
        displayName: 'Max Results',
        name: 'maxResults',
        type: 'number',
        displayOptions: {
          show: { resource: ['message'], operation: ['search'] },
        },
        default: 10,
        description: 'Maximum number of messages to return',
      },
      // === PARAMETERS: GET ===
      {
        displayName: 'Message ID',
        name: 'messageId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['message'], operation: ['get', 'delete', 'markRead', 'markUnread', 'reply'] },
        },
        default: '',
        description: 'The ID of the message',
      },
      // === PARAMETERS: SEND / REPLY ===
      {
        displayName: 'To',
        name: 'to',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['message'], operation: ['send', 'reply'] },
        },
        default: '',
        placeholder: 'recipient@example.com',
      },
      {
        displayName: 'Subject',
        name: 'subject',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['message'], operation: ['send'] },
        },
        default: '',
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        typeOptions: { rows: 5 },
        required: true,
        displayOptions: {
          show: { resource: ['message'], operation: ['send', 'reply'] },
        },
        default: '',
      },
      // === PARAMETERS: LABEL ===
      {
        displayName: 'Label Name',
        name: 'labelName',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['label'], operation: ['create'] },
        },
        default: '',
      },
      {
        displayName: 'Label ID',
        name: 'labelId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['label'], operation: ['delete'] },
        },
        default: '',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        // Récupérer le token dynamique (expression évaluée automatiquement)
        const accessToken = this.getNodeParameter('accessToken', itemIndex) as string;
        const resource = this.getNodeParameter('resource', itemIndex) as string;
        const operation = this.getNodeParameter('operation', itemIndex) as string;

        if (!accessToken) {
          throw new Error('Access token is required');
        }

        let result: any;

        // === MESSAGE OPERATIONS ===
        if (resource === 'message') {
          if (operation === 'search') {
            result = await this.searchMessages(accessToken, itemIndex);
          } else if (operation === 'get') {
            result = await this.getMessage(accessToken, itemIndex);
          } else if (operation === 'send') {
            result = await this.sendMessage(accessToken, itemIndex);
          } else if (operation === 'reply') {
            result = await this.replyToMessage(accessToken, itemIndex);
          } else if (operation === 'delete') {
            result = await this.deleteMessage(accessToken, itemIndex);
          } else if (operation === 'markRead') {
            result = await this.modifyMessage(accessToken, itemIndex, { removeLabelIds: ['UNREAD'] });
          } else if (operation === 'markUnread') {
            result = await this.modifyMessage(accessToken, itemIndex, { addLabelIds: ['UNREAD'] });
          }
        }
        // === LABEL OPERATIONS ===
        else if (resource === 'label') {
          if (operation === 'list') {
            result = await this.listLabels(accessToken);
          } else if (operation === 'create') {
            result = await this.createLabel(accessToken, itemIndex);
          } else if (operation === 'delete') {
            result = await this.deleteLabel(accessToken, itemIndex);
          }
        }

        returnData.push({
          json: result,
          pairedItem: itemIndex,
        });

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: itemIndex,
          });
        } else {
          throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
        }
      }
    }

    return [returnData];
  }

  // === HELPER METHODS ===

  private async gmailRequest(
    accessToken: string,
    method: string,
    endpoint: string,
    body?: any,
    qs?: any,
  ) {
    const options: any = {
      method,
      url: `https://www.googleapis.com/gmail/v1/users/me${endpoint}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) options.body = body;
    if (qs) options.qs = qs;

    return this.helpers.httpRequest(options);
  }

  // === MESSAGE OPERATIONS ===

  private async searchMessages(accessToken: string, itemIndex: number) {
    const query = this.getNodeParameter('query', itemIndex) as string;
    const maxResults = this.getNodeParameter('maxResults', itemIndex) as number;

    const response = await this.gmailRequest(accessToken, 'GET', '/messages', undefined, {
      q: query,
      maxResults,
    });

    // Récupérer les détails de chaque message
    const messages = response.messages || [];
    const detailedMessages = [];

    for (const msg of messages.slice(0, maxResults)) {
      const detail = await this.gmailRequest(accessToken, 'GET', `/messages/${msg.id}`);
      detailedMessages.push(detail);
    }

    return {
      messages: detailedMessages,
      resultSizeEstimate: response.resultSizeEstimate,
    };
  }

  private async getMessage(accessToken: string, itemIndex: number) {
    const messageId = this.getNodeParameter('messageId', itemIndex) as string;
    return this.gmailRequest(accessToken, 'GET', `/messages/${messageId}`);
  }

  private async sendMessage(accessToken: string, itemIndex: number) {
    const to = this.getNodeParameter('to', itemIndex) as string;
    const subject = this.getNodeParameter('subject', itemIndex) as string;
    const body = this.getNodeParameter('body', itemIndex) as string;

    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return this.gmailRequest(accessToken, 'POST', '/messages/send', { raw: encodedEmail });
  }

  private async replyToMessage(accessToken: string, itemIndex: number) {
    const messageId = this.getNodeParameter('messageId', itemIndex) as string;
    const to = this.getNodeParameter('to', itemIndex) as string;
    const body = this.getNodeParameter('body', itemIndex) as string;

    // Get original message for thread ID and subject
    const original = await this.gmailRequest(accessToken, 'GET', `/messages/${messageId}`);
    const threadId = original.threadId;

    // Extract subject from headers
    const subjectHeader = original.payload?.headers?.find((h: any) => h.name === 'Subject');
    const subject = subjectHeader ? `Re: ${subjectHeader.value}` : 'Re:';

    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return this.gmailRequest(accessToken, 'POST', '/messages/send', {
      raw: encodedEmail,
      threadId,
    });
  }

  private async deleteMessage(accessToken: string, itemIndex: number) {
    const messageId = this.getNodeParameter('messageId', itemIndex) as string;
    await this.gmailRequest(accessToken, 'DELETE', `/messages/${messageId}`);
    return { success: true, messageId };
  }

  private async modifyMessage(accessToken: string, itemIndex: number, modifications: any) {
    const messageId = this.getNodeParameter('messageId', itemIndex) as string;
    return this.gmailRequest(accessToken, 'POST', `/messages/${messageId}/modify`, modifications);
  }

  // === LABEL OPERATIONS ===

  private async listLabels(accessToken: string) {
    return this.gmailRequest(accessToken, 'GET', '/labels');
  }

  private async createLabel(accessToken: string, itemIndex: number) {
    const labelName = this.getNodeParameter('labelName', itemIndex) as string;
    return this.gmailRequest(accessToken, 'POST', '/labels', {
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    });
  }

  private async deleteLabel(accessToken: string, itemIndex: number) {
    const labelId = this.getNodeParameter('labelId', itemIndex) as string;
    await this.gmailRequest(accessToken, 'DELETE', `/labels/${labelId}`);
    return { success: true, labelId };
  }
}
```

## Installation

### Option 1 : Installation locale (développement)

```bash
# Cloner ou créer le projet
cd /home/fsebb/n8n-workflows
mkdir -p custom-nodes/n8n-nodes-gmail-dynamic
cd custom-nodes/n8n-nodes-gmail-dynamic

# Initialiser et builder
npm install
npm run build

# Lier au n8n local
npm link
cd ~/.n8n
npm link n8n-nodes-gmail-dynamic

# Redémarrer n8n
pm2 restart n8n
```

### Option 2 : Installation via Docker

```dockerfile
FROM n8nio/n8n:latest
USER root
RUN cd /tmp && \
    git clone https://github.com/fsebbah/n8n-nodes-gmail-dynamic.git && \
    cd n8n-nodes-gmail-dynamic && \
    npm install && npm run build && \
    npm install -g .
USER node
```

### Option 3 : Publication npm puis installation GUI

```bash
# Publier sur npm
npm publish

# Dans n8n: Settings > Community Nodes > Install
# Chercher: n8n-nodes-gmail-dynamic
```

## Utilisation dans un Workflow

### Exemple de workflow MCP

```json
{
  "name": "MCP - Gmail - Dynamic Token",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "mcp-gmail-dynamic",
        "httpMethod": "POST",
        "responseMode": "responseNode"
      },
      "webhookId": "mcp-gmail-dynamic",
      "position": [250, 300]
    },
    {
      "name": "Gmail Dynamic",
      "type": "n8n-nodes-gmail-dynamic.gmailToolDynamic",
      "parameters": {
        "accessToken": "={{ $json.body.access_token }}",
        "resource": "message",
        "operation": "={{ $json.body.operation }}",
        "query": "={{ $json.body.query }}"
      },
      "position": [470, 300]
    },
    {
      "name": "Response",
      "type": "n8n-nodes-base.respondToWebhook",
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}"
      },
      "position": [690, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{"node": "Gmail Dynamic", "type": "main", "index": 0}]]
    },
    "Gmail Dynamic": {
      "main": [[{"node": "Response", "type": "main", "index": 0}]]
    }
  }
}
```

### Appel depuis MCP Server

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-gmail-dynamic \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "ya29.a0AfH6SMBx...",
    "operation": "search",
    "query": "from:boss@company.com is:unread"
  }'
```

## Opérations supportées

### Messages
| Operation | Paramètres requis |
|-----------|-------------------|
| search | query, maxResults (opt) |
| get | messageId |
| send | to, subject, body |
| reply | messageId, to, body |
| delete | messageId |
| markRead | messageId |
| markUnread | messageId |

### Labels
| Operation | Paramètres requis |
|-----------|-------------------|
| list | - |
| create | labelName |
| delete | labelId |

## Prochaines étapes

1. [ ] Créer le projet dans `custom-nodes/`
2. [ ] Implémenter le node TypeScript complet
3. [ ] Tester localement
4. [ ] Créer le workflow MCP avec le custom node
5. [ ] Documenter l'API pour le MCP Server
6. [ ] Publier sur npm (optionnel)

## Références

- [n8n Custom Node Development](https://docs.n8n.io/integrations/creating-nodes/overview/)
- [Gmail API Reference](https://developers.google.com/gmail/api/reference/rest)
- [n8n-nodes-starter](https://github.com/n8n-io/n8n-nodes-starter)
