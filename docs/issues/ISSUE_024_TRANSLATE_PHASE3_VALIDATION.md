# Issue #024 - Translation MCP Phase 3: Validation & Scoring

## Objectif

Ajouter des opérations de validation et scoring pour évaluer la qualité des traductions.

**Parent:** [ISSUE_021_TRANSLATION_TOOLS_MCP.md](./ISSUE_021_TRANSLATION_TOOLS_MCP.md)
**Prérequis:** [ISSUE_023_TRANSLATE_PHASE2_MULTI_LLM.md](./ISSUE_023_TRANSLATE_PHASE2_MULTI_LLM.md)

---

## Scope Phase 3

| Inclus | Exclus |
|--------|--------|
| Validation qualité | Révision automatique |
| Back-translation | Amélioration itérative |
| Scoring LLM | Métriques BLEU/COMET (complexes) |
| Vérifications spécifiques | Modes spécialisés |

---

## Nouvelles Opérations

### 1. `validate` - Valider une traduction

Évalue la qualité d'une traduction sur plusieurs critères.

**Paramètres:**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `source_text` | string | Oui | Texte original |
| `translation` | string | Oui | Traduction à valider |
| `source_lang` | string | Non | Langue source |
| `target_lang` | string | Oui | Langue cible |
| `checks` | array | Non | Critères à vérifier |

**Checks disponibles:**

| Check | Description | Score |
|-------|-------------|-------|
| `accuracy` | Fidélité au sens original | 0-1 |
| `fluency` | Naturel et lisibilité | 0-1 |
| `terminology` | Cohérence des termes | 0-1 |
| `style` | Respect du ton | 0-1 |
| `grammar` | Correction grammaticale | 0-1 |
| `completeness` | Aucune omission/ajout | 0-1 |

**Request:**
```json
{
  "resource": "validation",
  "operation": "validate",
  "source_text": "The meeting is scheduled for tomorrow at 3 PM.",
  "translation": "La réunion est prévue pour demain à 15h.",
  "source_lang": "en",
  "target_lang": "fr",
  "checks": ["accuracy", "fluency", "grammar"],
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "valid": true,
  "overall_score": 0.92,
  "checks": {
    "accuracy": {
      "score": 0.95,
      "status": "pass",
      "issues": []
    },
    "fluency": {
      "score": 0.90,
      "status": "pass",
      "issues": [
        {
          "type": "minor",
          "description": "'prévue pour' pourrait être 'prévue'",
          "suggestion": "La réunion est prévue demain à 15h."
        }
      ]
    },
    "grammar": {
      "score": 0.92,
      "status": "pass",
      "issues": []
    }
  },
  "summary": "Traduction de bonne qualité avec une légère redondance"
}
```

### 2. `backTranslate` - Rétro-traduction

Traduit la traduction vers la langue source pour vérifier la fidélité.

**Request:**
```json
{
  "resource": "validation",
  "operation": "backTranslate",
  "source_text": "The early bird catches the worm.",
  "translation": "L'avenir appartient à ceux qui se lèvent tôt.",
  "source_lang": "en",
  "target_lang": "fr",
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "original": "The early bird catches the worm.",
  "translation": "L'avenir appartient à ceux qui se lèvent tôt.",
  "back_translation": "The future belongs to those who wake up early.",
  "semantic_similarity": 0.72,
  "analysis": {
    "meaning_preserved": true,
    "literal_match": false,
    "adaptation_type": "cultural_equivalent",
    "note": "Expression idiomatique adaptée culturellement"
  }
}
```

### 3. `check` - Vérifications spécifiques

Vérifie des éléments spécifiques (nombres, dates, noms propres, URLs).

**Request:**
```json
{
  "resource": "validation",
  "operation": "check",
  "source_text": "Contact John Smith at john@example.com before January 15, 2025.",
  "translation": "Contactez Jean Dupont à john@example.com avant le 15 janvier 2025.",
  "check_types": ["proper_nouns", "emails", "dates", "numbers"],
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "overall_status": "warning",
  "checks": {
    "proper_nouns": {
      "status": "warning",
      "items": [
        {
          "source": "John Smith",
          "translation": "Jean Dupont",
          "expected": "John Smith",
          "severity": "warning",
          "message": "Nom propre traduit - vérifier si intentionnel"
        }
      ]
    },
    "emails": {
      "status": "pass",
      "items": [
        {
          "source": "john@example.com",
          "translation": "john@example.com",
          "match": true
        }
      ]
    },
    "dates": {
      "status": "pass",
      "items": [
        {
          "source": "January 15, 2025",
          "translation": "15 janvier 2025",
          "equivalent": true,
          "format_adapted": true
        }
      ]
    },
    "numbers": {
      "status": "pass",
      "items": []
    }
  },
  "issues_count": {
    "error": 0,
    "warning": 1,
    "info": 0
  }
}
```

### 4. `score` - Score de qualité

Calcule un score de qualité simplifié (sans dépendances externes).

**Request:**
```json
{
  "resource": "validation",
  "operation": "score",
  "source_text": "Machine learning is a subset of artificial intelligence.",
  "translation": "L'apprentissage automatique est un sous-ensemble de l'intelligence artificielle.",
  "reference": "L'apprentissage machine est une branche de l'intelligence artificielle.",
  "target_lang": "fr",
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "scores": {
    "semantic_similarity": 0.88,
    "reference_similarity": 0.75,
    "fluency_score": 0.92,
    "overall": 0.85
  },
  "comparison_with_reference": {
    "differences": [
      {
        "aspect": "terminology",
        "candidate": "apprentissage automatique",
        "reference": "apprentissage machine",
        "analysis": "Les deux termes sont acceptables"
      },
      {
        "aspect": "structure",
        "candidate": "sous-ensemble",
        "reference": "branche",
        "analysis": "Nuance sémantique légère"
      }
    ]
  },
  "quality_level": "good",
  "recommendation": "Traduction acceptable, proche de la référence"
}
```

---

## Prompts de Validation

### Prompt `validate`

```
You are a professional translation quality assessor. Evaluate the following translation.

Source ({source_lang}): "{source_text}"
Translation ({target_lang}): "{translation}"

Evaluate on these criteria (score 0-1):
{checks_list}

For each criterion:
1. Provide a score (0.0 to 1.0)
2. List any issues found
3. Suggest improvements if needed

Return a JSON object with this structure:
{
  "checks": {
    "criterion_name": {
      "score": 0.95,
      "issues": [{"type": "minor|major", "description": "...", "suggestion": "..."}]
    }
  },
  "overall_score": 0.90,
  "summary": "Brief assessment"
}
```

### Prompt `backTranslate`

```
Translate this {target_lang} text back to {source_lang}:

"{translation}"

Return only the translation, nothing else.
```

### Prompt Analyse sémantique

```
Compare these two texts semantically:

Original: "{original}"
Back-translation: "{back_translation}"

Return a JSON object:
{
  "semantic_similarity": 0.85,  // 0-1
  "meaning_preserved": true,
  "differences": ["list of semantic differences"],
  "analysis": "brief explanation"
}
```

### Prompt `check` (éléments spécifiques)

```
Extract and compare specific elements between source and translation:

Source: "{source_text}"
Translation: "{translation}"

Elements to check: {check_types}

For each element found, verify:
- Is it present in both?
- Is it correctly preserved/adapted?
- Any issues?

Return JSON:
{
  "proper_nouns": [{"source": "...", "translation": "...", "match": true/false}],
  "emails": [...],
  "dates": [...],
  "numbers": [...],
  "urls": [...]
}
```

---

## Implémentation

### Nouvelles propriétés du node

```typescript
// Operation
{
  displayName: 'Operation',
  name: 'operation',
  type: 'options',
  options: [
    { name: 'Translate', value: 'translate' },
    { name: 'Translate Multi-LLM', value: 'translateMulti' },
    { name: 'Detect Language', value: 'detect' },
    { name: 'Validate', value: 'validate' },
    { name: 'Back-Translate', value: 'backTranslate' },
    { name: 'Check Elements', value: 'check' },
    { name: 'Score Quality', value: 'score' },
  ],
  default: 'translate',
},

// Source text (for validation)
{
  displayName: 'Source Text',
  name: 'sourceText',
  type: 'string',
  typeOptions: { rows: 4 },
  required: true,
  default: '',
  displayOptions: {
    show: { operation: ['validate', 'backTranslate', 'check', 'score'] }
  },
},

// Translation (for validation)
{
  displayName: 'Translation',
  name: 'translation',
  type: 'string',
  typeOptions: { rows: 4 },
  required: true,
  default: '',
  displayOptions: {
    show: { operation: ['validate', 'backTranslate', 'check', 'score'] }
  },
},

// Checks to perform
{
  displayName: 'Validation Checks',
  name: 'checks',
  type: 'multiOptions',
  options: [
    { name: 'Accuracy', value: 'accuracy' },
    { name: 'Fluency', value: 'fluency' },
    { name: 'Terminology', value: 'terminology' },
    { name: 'Style', value: 'style' },
    { name: 'Grammar', value: 'grammar' },
    { name: 'Completeness', value: 'completeness' },
  ],
  default: ['accuracy', 'fluency'],
  displayOptions: { show: { operation: ['validate'] } },
},

// Check types
{
  displayName: 'Check Types',
  name: 'checkTypes',
  type: 'multiOptions',
  options: [
    { name: 'Proper Nouns', value: 'proper_nouns' },
    { name: 'Numbers', value: 'numbers' },
    { name: 'Dates', value: 'dates' },
    { name: 'Emails', value: 'emails' },
    { name: 'URLs', value: 'urls' },
    { name: 'Phone Numbers', value: 'phones' },
  ],
  default: ['proper_nouns', 'numbers', 'dates'],
  displayOptions: { show: { operation: ['check'] } },
},

// Reference translation (for scoring)
{
  displayName: 'Reference Translation',
  name: 'reference',
  type: 'string',
  typeOptions: { rows: 4 },
  default: '',
  description: 'Optional reference translation for comparison',
  displayOptions: { show: { operation: ['score'] } },
}
```

---

## Tests

### Test 1: Validation complète

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "validate",
    "source_text": "Please review the attached document.",
    "translation": "Veuillez examiner le document ci-joint.",
    "source_lang": "en",
    "target_lang": "fr",
    "checks": ["accuracy", "fluency", "grammar"],
    "api_key": "sk-..."
  }'
```

### Test 2: Back-translation

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "backTranslate",
    "source_text": "It is raining cats and dogs.",
    "translation": "Il pleut des cordes.",
    "source_lang": "en",
    "target_lang": "fr",
    "api_key": "sk-..."
  }'
```

### Test 3: Vérification éléments

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "check",
    "source_text": "Call 555-1234 or email support@example.com",
    "translation": "Appelez le 555-1234 ou écrivez à support@example.com",
    "check_types": ["emails", "phones"],
    "api_key": "sk-..."
  }'
```

---

## Checklist

### Développement
- [ ] Implémenter `validate`
- [ ] Implémenter `backTranslate`
- [ ] Implémenter `check`
- [ ] Implémenter `score`
- [ ] Créer les prompts optimisés

### Tests
- [ ] Test validation avec tous les checks
- [ ] Test back-translation (expressions idiomatiques)
- [ ] Test check (tous les types d'éléments)
- [ ] Test score avec/sans référence

### Documentation
- [ ] Mettre à jour `TRANSLATE_MCP_API.md`

---

## Critères de succès

1. `validate` retourne un score cohérent
2. `backTranslate` détecte les adaptations culturelles
3. `check` identifie correctement les éléments préservés/modifiés
4. `score` fournit une évaluation utile
5. Les issues sont classées par sévérité

---

## Estimation

| Tâche | Durée estimée |
|-------|---------------|
| validate | 2h |
| backTranslate | 1h |
| check | 2h |
| score | 1h30 |
| Tests | 1h30 |
| **Total** | **~8h** |
