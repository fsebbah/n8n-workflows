# Issue #022 - Translation MCP Phase 1: Core Node

## Objectif

Créer le custom node `n8n-nodes-translate-dynamic` avec les opérations de base : `translate` et `detect`.

**Parent:** [ISSUE_021_TRANSLATION_TOOLS_MCP.md](./ISSUE_021_TRANSLATION_TOOLS_MCP.md)

---

## Scope Phase 1

| Inclus | Exclus |
|--------|--------|
| Traduction simple (1 LLM) | Multi-LLM |
| Détection de langue | Validation/scoring |
| OpenAI uniquement | Anthropic, Mistral |
| Mode par défaut | Modes spécialisés |

---

## Structure du Node

```
custom-nodes/
└── n8n-nodes-translate-dynamic/
    ├── package.json
    ├── tsconfig.json
    └── nodes/
        └── TranslateToolDynamic/
            ├── TranslateToolDynamic.node.ts
            └── translate.svg
```

---

## Opérations

### 1. `translate` - Traduire un texte

**Paramètres:**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `text` | string | Oui | Texte à traduire |
| `source_lang` | string | Non | Langue source (auto si omis) |
| `target_lang` | string | Oui | Langue cible (ISO 639-1) |
| `tone` | options | Non | formal, informal, neutral |
| `preserve_formatting` | boolean | Non | Conserver formatage (défaut: true) |

**Request:**
```json
{
  "resource": "translation",
  "operation": "translate",
  "text": "Hello, how are you?",
  "target_lang": "fr",
  "tone": "formal"
}
```

**Response:**
```json
{
  "source": {
    "text": "Hello, how are you?",
    "lang": "en",
    "detected": true
  },
  "translation": {
    "text": "Bonjour, comment allez-vous ?",
    "lang": "fr",
    "model": "gpt-4o-mini",
    "tokens_used": 45,
    "processing_time_ms": 380
  }
}
```

### 2. `detect` - Détecter la langue

**Paramètres:**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `text` | string | Oui | Texte à analyser |

**Request:**
```json
{
  "resource": "translation",
  "operation": "detect",
  "text": "Bonjour, comment ça va ?"
}
```

**Response:**
```json
{
  "detected_lang": "fr",
  "confidence": 0.98,
  "language_name": "French"
}
```

---

## Implémentation

### package.json

```json
{
  "name": "n8n-nodes-translate-dynamic",
  "version": "1.0.0",
  "description": "Translation node with dynamic API key support",
  "main": "dist/nodes/TranslateToolDynamic/TranslateToolDynamic.node.js",
  "n8n": {
    "n8nNodesApiVersion": 1,
    "nodes": [
      "dist/nodes/TranslateToolDynamic/TranslateToolDynamic.node.js"
    ]
  },
  "scripts": {
    "build": "tsc && npm run copy-assets",
    "copy-assets": "cp -r nodes/TranslateToolDynamic/*.svg dist/nodes/TranslateToolDynamic/ 2>/dev/null || true"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "~5.3.0"
  },
  "peerDependencies": {
    "n8n-workflow": "*"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "ES2022",
    "lib": ["ES2022"],
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": ".",
    "noEmit": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["nodes/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### TranslateToolDynamic.node.ts (structure)

```typescript
import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IHttpRequestOptions,
} from 'n8n-workflow';

export class TranslateToolDynamic implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Translate Tool Dynamic',
    name: 'translateToolDynamic',
    icon: 'file:translate.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["operation"] }}',
    description: 'Multi-LLM Translation with dynamic API keys',
    defaults: { name: 'Translate Dynamic' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [],
    properties: [
      // API Key
      {
        displayName: 'OpenAI API Key',
        name: 'apiKey',
        type: 'string',
        typeOptions: { password: true },
        required: true,
        default: '',
      },
      // Operation
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          { name: 'Translate', value: 'translate' },
          { name: 'Detect Language', value: 'detect' },
        ],
        default: 'translate',
      },
      // Text
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        required: true,
        default: '',
        typeOptions: { rows: 4 },
      },
      // Target Language (translate only)
      {
        displayName: 'Target Language',
        name: 'targetLang',
        type: 'options',
        displayOptions: { show: { operation: ['translate'] } },
        options: [
          { name: 'French', value: 'fr' },
          { name: 'English', value: 'en' },
          { name: 'Spanish', value: 'es' },
          { name: 'German', value: 'de' },
          { name: 'Italian', value: 'it' },
          { name: 'Portuguese', value: 'pt' },
          { name: 'Chinese', value: 'zh' },
          { name: 'Japanese', value: 'ja' },
          { name: 'Korean', value: 'ko' },
          { name: 'Arabic', value: 'ar' },
          { name: 'Hebrew', value: 'he' },
          { name: 'Russian', value: 'ru' },
        ],
        default: 'fr',
      },
      // Source Language (optional)
      {
        displayName: 'Source Language',
        name: 'sourceLang',
        type: 'string',
        displayOptions: { show: { operation: ['translate'] } },
        default: '',
        description: 'Leave empty for auto-detection',
      },
      // Tone
      {
        displayName: 'Tone',
        name: 'tone',
        type: 'options',
        displayOptions: { show: { operation: ['translate'] } },
        options: [
          { name: 'Neutral', value: 'neutral' },
          { name: 'Formal', value: 'formal' },
          { name: 'Informal', value: 'informal' },
        ],
        default: 'neutral',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const apiKey = this.getNodeParameter('apiKey', i) as string;
      const operation = this.getNodeParameter('operation', i) as string;
      const text = this.getNodeParameter('text', i) as string;

      if (operation === 'translate') {
        // Translation logic
        const targetLang = this.getNodeParameter('targetLang', i) as string;
        const sourceLang = this.getNodeParameter('sourceLang', i, '') as string;
        const tone = this.getNodeParameter('tone', i, 'neutral') as string;

        const result = await this.translateText(apiKey, text, targetLang, sourceLang, tone);
        returnData.push({ json: result });

      } else if (operation === 'detect') {
        // Detection logic
        const result = await this.detectLanguage(apiKey, text);
        returnData.push({ json: result });
      }
    }

    return [returnData];
  }

  // Helper methods defined inline in execute()
}
```

---

## Prompts OpenAI

### Prompt Traduction

```
You are a professional translator. Translate the following text from {source_lang} to {target_lang}.

Requirements:
- Maintain the original meaning and nuance
- Use {tone} tone
- Preserve any formatting (markdown, HTML tags, etc.)
- Do not add explanations, only return the translation

Text to translate:
{text}
```

### Prompt Détection

```
Detect the language of the following text. Return only a JSON object with:
- "lang": ISO 639-1 code
- "confidence": number between 0 and 1
- "language_name": full name in English

Text:
{text}
```

---

## Workflow MCP (Phase 1)

```json
{
  "name": "MCP - Translation Server (Phase 1)",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "mcp-translate",
        "httpMethod": "POST",
        "responseMode": "responseNode"
      }
    },
    {
      "name": "Router",
      "type": "n8n-nodes-base.switch",
      "parameters": {
        "rules": [
          { "output": "translate", "conditions": "operation == 'translate'" },
          { "output": "detect", "conditions": "operation == 'detect'" }
        ]
      }
    },
    {
      "name": "Translate",
      "type": "n8n-nodes-translate-dynamic.translateToolDynamic",
      "parameters": {
        "apiKey": "={{ $json.body.api_key }}",
        "operation": "translate",
        "text": "={{ $json.body.text }}",
        "targetLang": "={{ $json.body.target_lang }}",
        "sourceLang": "={{ $json.body.source_lang || '' }}",
        "tone": "={{ $json.body.tone || 'neutral' }}"
      }
    },
    {
      "name": "Detect",
      "type": "n8n-nodes-translate-dynamic.translateToolDynamic",
      "parameters": {
        "apiKey": "={{ $json.body.api_key }}",
        "operation": "detect",
        "text": "={{ $json.body.text }}"
      }
    },
    {
      "name": "Response",
      "type": "n8n-nodes-base.respondToWebhook",
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($input.all().map(i => i.json)) }}"
      }
    }
  ]
}
```

---

## Tests

### Test 1: Traduction simple

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-...",
    "operation": "translate",
    "text": "Hello, how are you today?",
    "target_lang": "fr",
    "tone": "formal"
  }'
```

**Attendu:**
```json
{
  "translation": "Bonjour, comment allez-vous aujourd'hui ?",
  "source_lang": "en",
  "target_lang": "fr"
}
```

### Test 2: Détection de langue

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-...",
    "operation": "detect",
    "text": "Guten Tag, wie geht es Ihnen?"
  }'
```

**Attendu:**
```json
{
  "detected_lang": "de",
  "confidence": 0.99,
  "language_name": "German"
}
```

---

## Checklist

### Développement
- [ ] Créer la structure du node
- [ ] Implémenter `translate`
- [ ] Implémenter `detect`
- [ ] Ajouter l'icône SVG
- [ ] Build sans erreur

### Déploiement
- [ ] Copier dans `~/.n8n/nodes/`
- [ ] Ajouter dans `package.json`
- [ ] `npm install`
- [ ] Redémarrer n8n
- [ ] Vérifier chargement dans les logs

### Workflow
- [ ] Créer `MCP_Translate_Server.json`
- [ ] Importer dans n8n
- [ ] Activer le workflow
- [ ] Tester les 2 opérations

### Documentation
- [ ] Créer `docs/mcp/TRANSLATE_MCP_API.md`

---

## Critères de succès

1. Le node compile et se charge dans n8n
2. `translate` fonctionne avec OpenAI
3. `detect` retourne la langue correcte
4. Le workflow MCP répond aux requêtes
5. Documentation API créée

---

## Estimation

| Tâche | Durée estimée |
|-------|---------------|
| Structure node | 30 min |
| Implémentation translate | 1h |
| Implémentation detect | 30 min |
| Workflow MCP | 30 min |
| Tests | 30 min |
| Documentation | 30 min |
| **Total** | **~3h30** |

---

## Dépendances

- Clé API OpenAI disponible
- n8n fonctionnel sur pi6.local
- Aucune dépendance sur les autres phases
