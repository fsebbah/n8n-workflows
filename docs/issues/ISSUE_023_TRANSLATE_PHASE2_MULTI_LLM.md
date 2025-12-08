# Issue #023 - Translation MCP Phase 2: Multi-LLM & Consensus

## Objectif

Étendre le node de traduction pour supporter plusieurs LLM (OpenAI, Anthropic, Mistral) et générer un consensus entre les traductions.

**Parent:** [ISSUE_021_TRANSLATION_TOOLS_MCP.md](./ISSUE_021_TRANSLATION_TOOLS_MCP.md)
**Prérequis:** [ISSUE_022_TRANSLATE_PHASE1_CORE.md](./ISSUE_022_TRANSLATE_PHASE1_CORE.md)

---

## Scope Phase 2

| Inclus | Exclus |
|--------|--------|
| Support Anthropic | Validation/scoring |
| Support Mistral | Révision |
| Traduction multi-modèles | Modes spécialisés |
| Consensus automatique | Back-translation |
| Comparaison basique | Métriques BLEU/COMET |

---

## Nouvelles Opérations

### 1. `translateMulti` - Traduction multi-LLM

Traduit avec plusieurs modèles et génère un consensus.

**Paramètres additionnels:**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `models` | array | Non | LLM à utiliser (défaut: ["openai"]) |
| `anthropic_api_key` | string | Si anthropic | Clé API Anthropic |
| `mistral_api_key` | string | Si mistral | Clé API Mistral |
| `consensus_strategy` | options | Non | vote, weighted, best_score |

**Request:**
```json
{
  "resource": "translation",
  "operation": "translateMulti",
  "text": "The quick brown fox jumps over the lazy dog.",
  "target_lang": "fr",
  "models": ["openai", "anthropic", "mistral"],
  "api_keys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "mistral": "..."
  },
  "consensus_strategy": "weighted"
}
```

**Response:**
```json
{
  "source": {
    "text": "The quick brown fox jumps over the lazy dog.",
    "lang": "en"
  },
  "translations": [
    {
      "model": "openai",
      "model_version": "gpt-4o-mini",
      "text": "Le renard brun rapide saute par-dessus le chien paresseux.",
      "processing_time_ms": 450,
      "tokens_used": 35
    },
    {
      "model": "anthropic",
      "model_version": "claude-3-5-sonnet",
      "text": "Le rapide renard brun saute par-dessus le chien paresseux.",
      "processing_time_ms": 380,
      "tokens_used": 42
    },
    {
      "model": "mistral",
      "model_version": "mistral-large",
      "text": "Le renard brun et rapide saute par-dessus le chien fainéant.",
      "processing_time_ms": 320,
      "tokens_used": 38
    }
  ],
  "consensus": {
    "text": "Le renard brun rapide saute par-dessus le chien paresseux.",
    "strategy": "weighted",
    "confidence": 0.85,
    "agreement_score": 0.78
  },
  "divergences": [
    {
      "type": "word_order",
      "segment": "renard brun rapide vs rapide renard brun",
      "models": ["openai/mistral", "anthropic"]
    },
    {
      "type": "vocabulary",
      "segment": "paresseux vs fainéant",
      "models": ["openai/anthropic", "mistral"]
    }
  ],
  "stats": {
    "total_tokens": 115,
    "total_time_ms": 1150,
    "models_used": 3
  }
}
```

### 2. `compare` - Comparer des traductions

Compare plusieurs traductions existantes.

**Request:**
```json
{
  "resource": "comparison",
  "operation": "compare",
  "source_text": "Hello world",
  "translations": [
    { "id": "t1", "text": "Bonjour le monde", "source": "human" },
    { "id": "t2", "text": "Salut monde", "source": "openai" }
  ],
  "target_lang": "fr"
}
```

**Response:**
```json
{
  "comparison": {
    "similarity_score": 0.75,
    "differences": [
      {
        "aspect": "greeting",
        "t1": "Bonjour",
        "t2": "Salut",
        "analysis": "t1 plus formel, t2 plus familier"
      },
      {
        "aspect": "article",
        "t1": "le monde",
        "t2": "monde",
        "analysis": "t1 inclut l'article défini"
      }
    ]
  },
  "recommendation": {
    "best": "t1",
    "reason": "Plus complet et naturel en français"
  }
}
```

---

## Configuration des Providers

### OpenAI

```typescript
const openaiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.3,
  maxTokens: 4096
};
```

### Anthropic

```typescript
const anthropicConfig = {
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.3,
  maxTokens: 4096,
  headers: {
    'anthropic-version': '2023-06-01'
  }
};
```

### Mistral

```typescript
const mistralConfig = {
  baseUrl: 'https://api.mistral.ai/v1',
  model: 'mistral-large-latest',
  temperature: 0.3,
  maxTokens: 4096
};
```

---

## Algorithmes de Consensus

### 1. Vote simple (`vote`)

Choisit la traduction la plus fréquente (ou la première si toutes différentes).

```typescript
function voteConsensus(translations: Translation[]): string {
  const counts = new Map<string, number>();
  for (const t of translations) {
    const normalized = normalizeText(t.text);
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
```

### 2. Vote pondéré (`weighted`)

Pondère selon la qualité historique du modèle.

```typescript
const modelWeights = {
  'openai': 1.0,
  'anthropic': 1.1,  // Légèrement favorisé pour les nuances
  'mistral': 0.9
};

function weightedConsensus(translations: Translation[]): string {
  // Score basé sur similarité avec autres + poids du modèle
  let bestScore = 0;
  let bestTranslation = '';

  for (const t of translations) {
    const similarity = avgSimilarityWithOthers(t, translations);
    const weight = modelWeights[t.model];
    const score = similarity * weight;

    if (score > bestScore) {
      bestScore = score;
      bestTranslation = t.text;
    }
  }
  return bestTranslation;
}
```

### 3. Meilleur score (`best_score`)

Utilise un LLM pour évaluer et choisir la meilleure traduction.

```typescript
async function bestScoreConsensus(
  source: string,
  translations: Translation[],
  apiKey: string
): Promise<string> {
  const prompt = `
    Source text: "${source}"

    Translations:
    ${translations.map((t, i) => `${i + 1}. ${t.text}`).join('\n')}

    Which translation is best? Consider accuracy, fluency, and naturalness.
    Return only the number (1, 2, or 3).
  `;

  const response = await callOpenAI(apiKey, prompt);
  const index = parseInt(response) - 1;
  return translations[index].text;
}
```

---

## Implémentation Node

### Ajouts à TranslateToolDynamic.node.ts

```typescript
// Nouvelles propriétés
{
  displayName: 'Models',
  name: 'models',
  type: 'multiOptions',
  options: [
    { name: 'OpenAI (GPT-4o)', value: 'openai' },
    { name: 'Anthropic (Claude)', value: 'anthropic' },
    { name: 'Mistral', value: 'mistral' },
  ],
  default: ['openai'],
  displayOptions: { show: { operation: ['translateMulti'] } },
},
{
  displayName: 'Anthropic API Key',
  name: 'anthropicApiKey',
  type: 'string',
  typeOptions: { password: true },
  default: '',
  displayOptions: {
    show: {
      operation: ['translateMulti'],
      models: ['anthropic']
    }
  },
},
{
  displayName: 'Mistral API Key',
  name: 'mistralApiKey',
  type: 'string',
  typeOptions: { password: true },
  default: '',
  displayOptions: {
    show: {
      operation: ['translateMulti'],
      models: ['mistral']
    }
  },
},
{
  displayName: 'Consensus Strategy',
  name: 'consensusStrategy',
  type: 'options',
  options: [
    { name: 'Vote Simple', value: 'vote' },
    { name: 'Vote Pondéré', value: 'weighted' },
    { name: 'Meilleur Score (LLM)', value: 'best_score' },
  ],
  default: 'weighted',
  displayOptions: { show: { operation: ['translateMulti'] } },
}
```

### Fonction translateMulti

```typescript
async function translateMulti(
  text: string,
  targetLang: string,
  models: string[],
  apiKeys: Record<string, string>,
  consensusStrategy: string
): Promise<MultiTranslationResult> {

  // Appels parallèles à tous les modèles
  const translationPromises = models.map(model =>
    translateWithModel(text, targetLang, model, apiKeys[model])
  );

  const translations = await Promise.all(translationPromises);

  // Générer le consensus
  const consensus = await generateConsensus(
    text,
    translations,
    consensusStrategy,
    apiKeys.openai
  );

  // Détecter les divergences
  const divergences = detectDivergences(translations);

  return {
    translations,
    consensus,
    divergences,
    stats: calculateStats(translations)
  };
}
```

---

## Workflow MCP (Phase 2)

Mise à jour du workflow pour supporter `translateMulti` :

```json
{
  "name": "Route by Operation",
  "parameters": {
    "rules": [
      { "output": "translate", "condition": "operation == 'translate'" },
      { "output": "translateMulti", "condition": "operation == 'translateMulti'" },
      { "output": "detect", "condition": "operation == 'detect'" },
      { "output": "compare", "condition": "operation == 'compare'" }
    ]
  }
}
```

---

## Tests

### Test 1: Multi-LLM

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "translateMulti",
    "text": "Artificial intelligence is changing the world.",
    "target_lang": "fr",
    "models": ["openai", "anthropic"],
    "api_keys": {
      "openai": "sk-...",
      "anthropic": "sk-ant-..."
    }
  }'
```

### Test 2: Consensus

Vérifier que le consensus est cohérent quand les traductions sont similaires.

### Test 3: Divergences

Vérifier la détection des différences (vocabulaire, ordre des mots).

---

## Checklist

### Développement
- [ ] Ajouter support Anthropic API
- [ ] Ajouter support Mistral API
- [ ] Implémenter `translateMulti`
- [ ] Implémenter algorithmes de consensus
- [ ] Implémenter détection de divergences
- [ ] Implémenter `compare`

### Tests
- [ ] Test OpenAI seul
- [ ] Test Anthropic seul
- [ ] Test Mistral seul
- [ ] Test multi-LLM (2 modèles)
- [ ] Test multi-LLM (3 modèles)
- [ ] Test consensus vote
- [ ] Test consensus weighted
- [ ] Test consensus best_score

### Documentation
- [ ] Mettre à jour `TRANSLATE_MCP_API.md`

---

## Critères de succès

1. Traduction avec 2+ LLM fonctionne
2. Consensus généré automatiquement
3. Divergences détectées et listées
4. Temps de réponse < 5s pour 3 modèles
5. Fallback si un modèle échoue

---

## Estimation

| Tâche | Durée estimée |
|-------|---------------|
| Support Anthropic | 1h |
| Support Mistral | 1h |
| translateMulti | 2h |
| Algorithmes consensus | 1h30 |
| Détection divergences | 1h |
| compare | 1h |
| Tests | 1h |
| **Total** | **~8h30** |
