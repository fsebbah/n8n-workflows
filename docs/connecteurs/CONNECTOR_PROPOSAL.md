# Guide de Création de Connecteurs n8n

**Date:** 2025-12-04
**Auteur:** Équipe n8n-workflows
**Destinataire:** Équipe MCP Server
**Statut:** Document de référence
**Version n8n:** 1.122.4

---

## Table des matières

1. [Introduction](#1-introduction)
2. [Nodes existants - État des lieux](#2-nodes-existants---état-des-lieux)
3. [Architecture d'un connecteur n8n](#3-architecture-dun-connecteur-n8n)
4. [Méthodologie de création](#4-méthodologie-de-création)
5. [Structure technique](#5-structure-technique)
6. [Patterns d'authentification](#6-patterns-dauthentification)
7. [Bonnes pratiques](#7-bonnes-pratiques)
8. [Intégration MCP](#8-intégration-mcp)
9. [Exemple complet: Mathpix](#9-exemple-complet-mathpix)
10. [Gestion du repository](#10-gestion-du-repository)
11. [Checklist de validation](#11-checklist-de-validation)
12. [Ressources](#12-ressources)

---

## 1. Introduction

### 1.1 Qu'est-ce qu'un connecteur n8n?

Un **connecteur** (ou **node**) n8n est un module qui permet d'intégrer un service externe dans les workflows d'automatisation. Il expose les fonctionnalités d'une API sous forme d'opérations visuelles.

### 1.2 Types de connecteurs

| Type | Description | Exemple |
|------|-------------|---------|
| **Trigger** | Démarre un workflow sur événement | Webhook, Cron |
| **Action** | Effectue une opération | HTTP Request, Slack |
| **Transform** | Transforme les données | Code, Set |

### 1.3 Options de création

| Option | Complexité | Maintenance | Performance |
|--------|------------|-------------|-------------|
| **Node HTTP Request** | Faible | Aucune | Standard |
| **Community Node** | Moyenne | Package npm | Optimale |
| **Core Node** | Élevée | PR n8n | Optimale |

**Recommandation:** Pour un usage interne, commencer par HTTP Request, puis migrer vers un Community Node si le besoin se confirme.

---

## 2. Nodes existants - État des lieux

Avant de créer un nouveau connecteur, vérifier ce qui existe déjà.

### 2.1 OCR (Reconnaissance optique)

| Node/Service | Type | Description | Lien |
|--------------|------|-------------|------|
| OCR.space | Intégration | OCR cloud, multi-langues | [n8n.io](https://n8n.io/integrations/ocrspace/) |
| Mistral OCR | HTTP Request | OCR très précis via API Mistral | [Workflow](https://n8n.io/workflows/3102) |
| Nanonets | HTTP Request | Extraction factures/tableaux | [Workflow](https://n8n.io/workflows/6194) |
| **Mathpix** | ❌ **À créer** | OCR mathématique (équations, LaTeX) | - |

### 2.2 Documents Office (Word, Excel, PowerPoint)

| Node | Type | Capacités | Lien |
|------|------|-----------|------|
| n8n-nodes-docxtemplater | Community | **Créer** DOCX, PPTX, XLSX depuis templates | [GitHub](https://github.com/jreyesr/n8n-nodes-docxtemplater) |
| n8n-nodes-carbonejs | Community | **Créer** DOCX, PDF, XLSX depuis templates | [GitHub](https://github.com/jreyesr/n8n-nodes-carbonejs) |
| Microsoft Excel 365 | Built-in | Lire/écrire Excel cloud (Office 365) | [Docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftexcel/) |
| Spreadsheet File | Built-in | Lire/écrire CSV, XLSX local | Built-in |

**Note:** Pas de node natif pour **lire** le contenu d'un DOCX ou PPTX.

### 2.3 PDF

| Node | Type | Capacités | Lien |
|------|------|-----------|------|
| n8n-nodes-pdf-toolkit | Community | Créer, merge, split, PDF→PNG/Text | [npm](https://www.npmjs.com/package/@custom-js/n8n-nodes-pdf-toolkit) |
| n8n-nodes-pdforge | Community | Créer PDF depuis HTML/templates | [npm](https://www.npmjs.com/package/n8n-nodes-pdforge) |
| n8n-nodes-pdfco | Community | API PDF.co complète | [npm](https://www.npmjs.com/package/n8n-nodes-pdfco) |
| CraftMyPDF | Community | Templates drag-and-drop | [Blog](https://craftmypdf.com/blog/automate-pdf-generation-with-n8n-and-craftmypdf/) |
| Gotenberg | HTTP Request | HTML→PDF (self-hosted) | [Community](https://community.n8n.io/t/create-a-pdf-with-gotenberg-and-n8n/51505) |

### 2.4 LMS et Éducation

| Node | Type | Description | Lien |
|------|------|-------------|------|
| n8n-nodes-canvas | Community | Canvas LMS (cours, users, assignments) | [npm](https://www.npmjs.com/package/n8n-nodes-canvas) |
| HTTP Request | Built-in | Via API Canvas directement | [n8n.io](https://n8n.io/integrations/canvas/) |

### 2.5 IA et LLM

| Node | Type | Description | Lien |
|------|------|-------------|------|
| Google Gemini | **Built-in** | Texte, images, audio, vidéo, documents | [Docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.googlegemini/) |
| Google Gemini Chat Model | **Built-in** | Pour agents conversationnels | [Docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatgooglegemini/) |
| OpenAI | **Built-in** | GPT-4, DALL-E, Whisper | Built-in |
| Anthropic Claude | **Built-in** | Claude 3.5 Sonnet/Opus | Built-in |

### 2.6 Récapitulatif des besoins

| Besoin | Disponible ? | Solution recommandée |
|--------|--------------|---------------------|
| OCR général | ✅ | OCR.space ou Mistral OCR |
| OCR mathématique | ❌ | **Créer node Mathpix** |
| Créer Word/Excel/PPT | ✅ | n8n-nodes-docxtemplater |
| Lire Word/PPT | ⚠️ | Pas de solution native |
| Créer PDF | ✅ | n8n-nodes-pdf-toolkit |
| Lire/extraire PDF | ✅ | pdf-toolkit ou Mistral OCR |
| Canvas LMS | ✅ | n8n-nodes-canvas |
| Google Gemini | ✅ | Node natif |

---

## 3. Architecture d'un connecteur n8n

### 3.1 Composants principaux

```
┌─────────────────────────────────────────────────────────┐
│                    Community Node                        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ Credentials │  │    Node     │  │    Actions      │ │
│  │ (Auth)      │  │ (Interface) │  │ (Opérations)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│         │                │                  │           │
│         ▼                ▼                  ▼           │
│  ┌─────────────────────────────────────────────────┐   │
│  │              n8n Workflow Engine                │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │                 API Externe                      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Flux de données

```
Input Items → Node Execute → API Call → Response → Output Items
     │              │             │          │           │
     ▼              ▼             ▼          ▼           ▼
 [données]    [paramètres]   [request]  [response]  [données]
```

---

## 4. Méthodologie de création

### 4.1 Phase 1: Analyse de l'API

**Objectif:** Comprendre l'API cible avant de coder.

**Checklist d'analyse:**

- [ ] Documentation API disponible?
- [ ] Méthode d'authentification (API Key, OAuth2, JWT)?
- [ ] Endpoints principaux et leurs méthodes HTTP?
- [ ] Formats d'entrée/sortie (JSON, XML, Form)?
- [ ] Rate limiting et quotas?
- [ ] Gestion des erreurs (codes HTTP, messages)?
- [ ] Opérations synchrones vs asynchrones?
- [ ] Régions/environnements disponibles?
- [ ] Tarification (impact sur les choix de design)?

**Template d'analyse:**

```markdown
## Analyse API: [Nom du service]

### Informations générales
- URL de base:
- Documentation:
- Version API:

### Authentification
- Type: [API Key / OAuth2 / Bearer / Basic]
- Headers requis:
- Processus d'obtention des credentials:

### Endpoints principaux
| Endpoint | Méthode | Description | Priorité |
|----------|---------|-------------|----------|
|          |         |             |          |

### Limites
- Rate limit: X req/min
- Taille max payload:
- Quotas:

### Tarification
- Modèle: [Pay-as-you-go / Subscription / Free tier]
- Coûts estimés:
```

### 3.2 Phase 2: Design du connecteur

**Objectif:** Définir l'interface utilisateur du node.

**Questions clés:**

1. **Resources:** Quels objets/entités manipuler? (ex: Image, Document, User)
2. **Operations:** Quelles actions par resource? (ex: Create, Read, Update, Delete)
3. **Parameters:** Quels champs exposer à l'utilisateur?
4. **Options:** Quels paramètres avancés optionnels?

**Principes de design:**

- **Simplicité:** Exposer seulement ce qui est utile
- **Cohérence:** Suivre les conventions n8n existantes
- **Progressivité:** Paramètres simples visibles, avancés cachés

### 3.3 Phase 3: Implémentation

**Approche recommandée:**

1. Créer le credential (authentification)
2. Créer le node avec une opération simple
3. Tester en environnement de dev
4. Ajouter les opérations restantes
5. Gérer les erreurs
6. Documenter

### 3.4 Phase 4: Tests et validation

- Tests unitaires des fonctions utilitaires
- Tests d'intégration avec l'API réelle
- Tests de cas limites (erreurs, timeouts)
- Validation UX dans l'interface n8n

---

## 5. Structure technique

### 4.1 Arborescence d'un Community Node

```
n8n-nodes-[service]/
├── package.json              # Métadonnées npm + config n8n
├── tsconfig.json             # Configuration TypeScript
├── .eslintrc.js              # Linting
├── README.md                 # Documentation
├── LICENSE                   # Licence (MIT recommandé)
│
├── credentials/
│   └── [Service]Api.credentials.ts    # Définition auth
│
├── nodes/
│   └── [Service]/
│       ├── [Service].node.ts          # Logique principale
│       ├── [Service].node.json        # Métadonnées UI (optionnel)
│       ├── [service].svg              # Icône 60x60px
│       │
│       ├── actions/                   # Opérations par resource
│       │   ├── [resource1].operation.ts
│       │   └── [resource2].operation.ts
│       │
│       └── transport/                 # Helpers API
│           └── api.ts
│
└── dist/                     # Build (généré)
```

### 4.2 package.json essentiel

```json
{
  "name": "n8n-nodes-[service]",
  "version": "0.1.0",
  "description": "n8n node for [Service]",
  "keywords": ["n8n-community-node-package"],
  "license": "MIT",
  "main": "dist/index.js",
  "n8n": {
    "n8nNodesApiVersion": 1,
    "credentials": [
      "dist/credentials/[Service]Api.credentials.js"
    ],
    "nodes": [
      "dist/nodes/[Service]/[Service].node.js"
    ]
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "eslint ."
  },
  "devDependencies": {
    "n8n-workflow": "^1.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 4.3 Structure du Node principal

```typescript
import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
} from 'n8n-workflow';

export class ServiceName implements INodeType {
  description: INodeTypeDescription = {
    // Identité
    displayName: 'Service Name',
    name: 'serviceName',
    icon: 'file:servicename.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Description du service',

    // Configuration
    defaults: {
      name: 'Service Name',
    },
    inputs: ['main'],
    outputs: ['main'],

    // Authentification
    credentials: [
      {
        name: 'serviceNameApi',
        required: true,
      },
    ],

    // Propriétés UI
    properties: [
      // Resource selector
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Image', value: 'image' },
          { name: 'Document', value: 'document' },
        ],
        default: 'image',
      },
      // Operation selector
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['image'] },
        },
        options: [
          { name: 'Process', value: 'process', action: 'Process an image' },
          { name: 'Get Result', value: 'getResult', action: 'Get processing result' },
        ],
        default: 'process',
      },
      // Paramètres spécifiques...
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        if (resource === 'image') {
          if (operation === 'process') {
            // Logique de traitement
            const result = await this.helpers.httpRequest({
              method: 'POST',
              url: 'https://api.service.com/v1/process',
              body: { /* ... */ },
            });
            returnData.push({ json: result });
          }
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: error.message } });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
```

---

## 6. Patterns d'authentification

### 5.1 API Key (Header)

```typescript
// credentials/ServiceApi.credentials.ts
import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class ServiceApi implements ICredentialType {
  name = 'serviceApi';
  displayName = 'Service API';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
  ];

  // Configuration automatique des headers
  authenticate = {
    type: 'generic',
    properties: {
      headers: {
        'X-API-Key': '={{$credentials.apiKey}}',
      },
    },
  };
}
```

### 5.2 API Key + App ID (Headers multiples)

```typescript
export class ServiceApi implements ICredentialType {
  name = 'serviceApi';
  displayName = 'Service API';

  properties: INodeProperties[] = [
    {
      displayName: 'App ID',
      name: 'appId',
      type: 'string',
      default: '',
    },
    {
      displayName: 'App Key',
      name: 'appKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
    {
      displayName: 'Region',
      name: 'region',
      type: 'options',
      options: [
        { name: 'Global', value: 'https://api.service.com' },
        { name: 'EU', value: 'https://eu.api.service.com' },
      ],
      default: 'https://api.service.com',
    },
  ];

  authenticate = {
    type: 'generic',
    properties: {
      headers: {
        'app_id': '={{$credentials.appId}}',
        'app_key': '={{$credentials.appKey}}',
      },
    },
  };
}
```

### 5.3 OAuth2

```typescript
export class ServiceOAuth2 implements ICredentialType {
  name = 'serviceOAuth2';
  displayName = 'Service OAuth2';
  extends = ['oAuth2Api'];

  properties: INodeProperties[] = [
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'authorizationCode',
    },
    {
      displayName: 'Authorization URL',
      name: 'authUrl',
      type: 'hidden',
      default: 'https://service.com/oauth/authorize',
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: 'https://service.com/oauth/token',
    },
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: 'read write',
    },
  ];
}
```

### 5.4 Bearer Token

```typescript
authenticate = {
  type: 'generic',
  properties: {
    headers: {
      'Authorization': '=Bearer {{$credentials.token}}',
    },
  },
};
```

---

## 7. Bonnes pratiques

### 6.1 Gestion des erreurs

```typescript
try {
  const response = await this.helpers.httpRequest(options);
  return response;
} catch (error) {
  // Erreurs API connues
  if (error.response?.status === 401) {
    throw new NodeApiError(this.getNode(), error, {
      message: 'Authentication failed. Check your API credentials.',
    });
  }
  if (error.response?.status === 429) {
    throw new NodeApiError(this.getNode(), error, {
      message: 'Rate limit exceeded. Please wait before retrying.',
    });
  }
  // Erreur générique
  throw new NodeApiError(this.getNode(), error);
}
```

### 6.2 Pagination

```typescript
async function getAllItems(this: IExecuteFunctions): Promise<any[]> {
  const allItems: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await this.helpers.httpRequest({
      method: 'GET',
      url: `https://api.service.com/items?page=${page}&limit=100`,
    });

    allItems.push(...response.items);
    hasMore = response.hasMore;
    page++;
  }

  return allItems;
}
```

### 6.3 Opérations asynchrones (polling)

```typescript
async function waitForResult(
  this: IExecuteFunctions,
  jobId: string,
  maxAttempts = 30,
  delayMs = 2000,
): Promise<any> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await this.helpers.httpRequest({
      method: 'GET',
      url: `https://api.service.com/jobs/${jobId}`,
    });

    if (status.state === 'completed') {
      return status.result;
    }
    if (status.state === 'failed') {
      throw new Error(`Job failed: ${status.error}`);
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('Job timed out');
}
```

### 6.4 Fichiers binaires

```typescript
// Upload depuis binary data
const binaryData = this.helpers.assertBinaryData(i, 'data');
const buffer = await this.helpers.getBinaryDataBuffer(i, 'data');

const response = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.service.com/upload',
  body: buffer,
  headers: {
    'Content-Type': binaryData.mimeType,
  },
});

// Download vers binary data
const response = await this.helpers.httpRequest({
  method: 'GET',
  url: 'https://api.service.com/download/file.pdf',
  encoding: 'arraybuffer',
});

returnData.push({
  json: { success: true },
  binary: {
    data: await this.helpers.prepareBinaryData(
      Buffer.from(response),
      'file.pdf',
      'application/pdf',
    ),
  },
});
```

---

## 8. Intégration MCP

### 7.1 Exposition automatique

Une fois le connecteur créé et utilisé dans un workflow:

1. Activer "Available in MCP" dans les settings du workflow
2. Le workflow devient un outil MCP appelable

### 7.2 Design pour MCP

**Recommandations:**

- Nommer le workflow clairement (devient le nom de l'outil)
- Utiliser des webhooks avec des paramètres bien définis
- Retourner des réponses JSON structurées
- Documenter les paramètres attendus

**Exemple de workflow MCP-ready:**

```
Webhook (POST) → [Connecteur] → Respond to Webhook
     │                               │
     ▼                               ▼
{imageUrl: "..."}              {result: {...}}
```

---

## 9. Exemple complet: Mathpix

### 8.1 Analyse de l'API Mathpix

**Service:** Mathpix - OCR spécialisé mathématiques et documents

**Documentation:** https://docs.mathpix.com/

#### Informations générales

| Élément | Valeur |
|---------|--------|
| URL de base | `https://api.mathpix.com` |
| URL EU (GDPR) | `https://eu-central-1.api.mathpix.com` |
| Version | v3 |

#### Authentification

- **Type:** API Key (double header)
- **Headers:** `app_id` + `app_key`
- **Console:** https://console.mathpix.com

#### Endpoints principaux

| Endpoint | Méthode | Description | Priorité |
|----------|---------|-------------|----------|
| `/v3/text` | POST | OCR image (texte + maths) | Haute |
| `/v3/pdf` | POST | Traitement PDF (async) | Haute |
| `/v3/batch` | POST | Traitement par lots | Moyenne |
| `/v3/converter` | POST | Conversion formats | Moyenne |
| `/v3/ocr-usage` | GET | Stats consommation | Basse |

#### Formats supportés

**Entrée:**
- Images: JPEG, PNG, TIFF, GIF, WebP, BMP
- Documents: PDF, EPUB, DOCX, PPTX, DOC, ODT

**Sortie:**
- Mathpix Markdown (MMD), LaTeX, AsciiMath, MathML, HTML
- DOCX, PPTX, PDF (via converter)

#### Limites

| Contrainte | Valeur |
|------------|--------|
| Taille max PDF | 1 GB |
| Taille max body JSON | 10 MB |
| Rate limiting | Configurable par compte |

#### Tarification

| Type | Volume | Prix |
|------|--------|------|
| Images | 0-1M | $0.002/image |
| Images | 1M+ | $0.0015/image |
| PDF | 0-1M pages | $0.005/page |
| PDF | 1M+ pages | $0.0035/page |

Setup: $19.99 (one-time) + $29 crédit offert

---

### 8.2 Design du connecteur Mathpix

#### Resources et Operations

```
Resource: Image
├── processImage      - OCR d'une image unique
└── processImageBatch - Traitement par lots

Resource: PDF
├── uploadPdf         - Soumettre un PDF
├── getPdfStatus      - Vérifier le statut
└── getPdfResult      - Récupérer le résultat

Resource: Converter
└── convert           - Convertir MMD vers autre format

Resource: Account
└── getUsage          - Statistiques d'utilisation
```

#### Paramètres proposés

**Image Processing:**

| Paramètre | Type | Description |
|-----------|------|-------------|
| inputType | options | url / binary / base64 |
| imageUrl | string | URL de l'image (si inputType=url) |
| binaryProperty | string | Propriété binary (si inputType=binary) |
| outputFormats | multiOptions | text, latex, mathml, asciimath, html |

**Options avancées:**

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| region | options | global | global / eu |
| includeLineData | boolean | false | Données par ligne |
| includeWordData | boolean | false | Données par mot |
| confidenceThreshold | number | 0 | Seuil de confiance (0-1) |

---

### 8.3 Structure du package

```
n8n-nodes-mathpix/
├── package.json
├── tsconfig.json
├── README.md
│
├── credentials/
│   └── MathpixApi.credentials.ts
│
├── nodes/
│   └── Mathpix/
│       ├── Mathpix.node.ts
│       ├── mathpix.svg
│       │
│       ├── actions/
│       │   ├── image.operation.ts
│       │   ├── pdf.operation.ts
│       │   ├── converter.operation.ts
│       │   └── account.operation.ts
│       │
│       └── transport/
│           └── mathpixApi.ts
│
└── dist/
```

---

### 8.4 Code Credential Mathpix

```typescript
// credentials/MathpixApi.credentials.ts
import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class MathpixApi implements ICredentialType {
  name = 'mathpixApi';
  displayName = 'Mathpix API';
  documentationUrl = 'https://docs.mathpix.com/';

  properties: INodeProperties[] = [
    {
      displayName: 'App ID',
      name: 'appId',
      type: 'string',
      default: '',
      required: true,
      description: 'Your Mathpix App ID from the console',
    },
    {
      displayName: 'App Key',
      name: 'appKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Your Mathpix App Key from the console',
    },
    {
      displayName: 'Region',
      name: 'region',
      type: 'options',
      options: [
        {
          name: 'Global',
          value: 'https://api.mathpix.com',
        },
        {
          name: 'EU (GDPR Compliant)',
          value: 'https://eu-central-1.api.mathpix.com',
        },
      ],
      default: 'https://api.mathpix.com',
      description: 'API region to use',
    },
  ];

  authenticate = {
    type: 'generic',
    properties: {
      headers: {
        app_id: '={{$credentials.appId}}',
        app_key: '={{$credentials.appKey}}',
      },
    },
  } as const;
}
```

---

### 8.5 Exemples d'utilisation API

#### OCR d'une image

```bash
curl -X POST https://api.mathpix.com/v3/text \
  -H "app_id: YOUR_APP_ID" \
  -H "app_key: YOUR_APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "src": "https://example.com/equation.png",
    "formats": ["latex", "text", "asciimath"],
    "data_options": {
      "include_asciimath": true
    }
  }'
```

**Réponse:**
```json
{
  "text": "E = mc²",
  "latex": "E = mc^2",
  "asciimath": "E = mc^2",
  "confidence": 0.9876,
  "confidence_rate": 0.99
}
```

#### Upload PDF

```bash
curl -X POST https://api.mathpix.com/v3/pdf \
  -H "app_id: YOUR_APP_ID" \
  -H "app_key: YOUR_APP_KEY" \
  -F "file=@document.pdf" \
  -F "options_json={\"conversion_formats\":{\"docx\":true}}"
```

**Réponse:**
```json
{
  "pdf_id": "abc123xyz",
  "status": "processing"
}
```

---

### 8.6 Workflow n8n exemple

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  Webhook    │───▶│   Mathpix    │───▶│    Set      │───▶│  Notion  │
│  (Trigger)  │    │ processImage │    │ (Format)    │    │  (Save)  │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────┘
      │                   │                   │                 │
      ▼                   ▼                   ▼                 ▼
 {imageUrl}         {latex, text}       {formatted}        {page_id}
```

**Use case:** Photo d'équation → OCR Mathpix → Sauvegarde dans Notion avec LaTeX formaté.

---

## 10. Gestion du repository

### 10.1 Configuration upstream (repo forké)

Ce repository est un fork. Pour récupérer les mises à jour de la communauté:

```bash
# Ajouter le repo original comme "upstream"
git remote add upstream https://github.com/[ORIGINAL_OWNER]/n8n-workflows.git

# Vérifier les remotes
git remote -v
# origin    git@github.com:fsebbah/n8n-workflows.git (fetch/push)
# upstream  https://github.com/[ORIGINAL_OWNER]/n8n-workflows.git (fetch/push)

# Récupérer les nouveautés upstream
git fetch upstream

# Merger dans ta branche locale
git checkout develop
git merge upstream/main

# Ou rebaser (historique plus propre)
git rebase upstream/main

# Pusher vers ton fork
git push origin develop
```

### 10.2 Mise à jour de n8n

```bash
# Via npm (installation globale)
npm update -g n8n

# Vérifier la version
n8n --version

# Via PM2 (après mise à jour npm)
pm2 restart n8n
```

**Version actuelle:** n8n 1.122.4

### 10.3 Historique des mises à jour

| Date | Version | Notes |
|------|---------|-------|
| 2025-12-04 | 1.122.4 | Mise à jour npm, warnings de dépendances résolus |

### 10.4 Workflow de contribution

```
[upstream/main] ──fetch──▶ [local/develop] ──push──▶ [origin/develop]
       │                          │                         │
       │                          ▼                         │
       │                   Modifications                    │
       │                          │                         │
       │                          ▼                         │
       └──────────────────── PR (si contribution) ◀────────┘
```

---

## 11. Checklist de validation

### Avant développement

- [ ] Documentation API analysée et comprise
- [ ] Credentials de test obtenus
- [ ] Design du node validé
- [ ] Cas d'usage prioritaires identifiés

### Pendant développement

- [ ] Credential fonctionne
- [ ] Opération principale fonctionne
- [ ] Gestion des erreurs implémentée
- [ ] Cas limites testés

### Avant release

- [ ] Toutes les opérations testées
- [ ] Code review effectué
- [ ] README documenté
- [ ] Package.json complet
- [ ] Icône SVG présente (60x60px)

### Post-release

- [ ] Installation testée sur n8n propre
- [ ] Workflow exemple créé
- [ ] Documentation utilisateur
- [ ] Exposition MCP validée

---

## 12. Ressources

### Documentation n8n

- [Creating Nodes](https://docs.n8n.io/integrations/creating-nodes/)
- [Credential Development](https://docs.n8n.io/integrations/creating-nodes/build/credentials/)
- [Node UI Elements](https://docs.n8n.io/integrations/creating-nodes/build/node-ui-elements/)

### Exemples de référence

- [n8n-nodes-starter](https://github.com/n8n-io/n8n-nodes-starter) - Template officiel
- [n8n core nodes](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes) - Nodes existants

### Outils

- [n8n Community Nodes](https://www.npmjs.com/search?q=n8n-community-node-package) - Packages existants
- [SVG Editor](https://editor.method.ac/) - Pour créer l'icône

---

## Annexe: Template de proposition

Pour proposer un nouveau connecteur, copier et compléter:

```markdown
# Proposition Connecteur: [Nom du service]

## 1. Service
- Description:
- Site:
- Documentation API:

## 2. Cas d'usage
1.
2.
3.

## 3. Authentification
- Type:
- Obtention credentials:

## 4. Endpoints prioritaires
| Endpoint | Description | Priorité |
|----------|-------------|----------|
|          |             |          |

## 5. Estimation effort
- [ ] Simple (1-2 jours)
- [ ] Moyen (3-5 jours)
- [ ] Complexe (1+ semaine)

## 6. Questions
-
```
