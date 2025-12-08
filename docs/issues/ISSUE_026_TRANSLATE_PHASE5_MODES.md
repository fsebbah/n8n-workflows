# Issue #026 - Translation MCP Phase 5: Specialized Modes

## Objectif

Implémenter les modes de traduction spécialisés : document, ui, email, technical, marketing.

**Parent:** [ISSUE_021_TRANSLATION_TOOLS_MCP.md](./ISSUE_021_TRANSLATION_TOOLS_MCP.md)
**Prérequis:** [ISSUE_025_TRANSLATE_PHASE4_REVISION.md](./ISSUE_025_TRANSLATE_PHASE4_REVISION.md)

---

## Scope Phase 5

| Inclus | Exclus |
|--------|--------|
| 5 modes spécialisés | Mémoire de traduction |
| Prompts optimisés par mode | Intégration CAT tools |
| Post-processing par mode | UI de gestion des modes |
| Batch mode-aware | Modes personnalisés |

---

## Les 5 Modes

| Mode | Température | Focus | Post-processing |
|------|-------------|-------|-----------------|
| `document` | 0.2 | Cohérence, glossaire | Vérif terminologie |
| `ui` | 0.1 | Concision, longueur | Vérif longueur max |
| `email` | 0.3 | Ton, conventions | Adaptation salutations |
| `technical` | 0.2 | Précision, code intact | Vérif code préservé |
| `marketing` | 0.5 | Impact, créativité | Alternatives fournies |

---

## Mode `document`

### Caractéristiques
- Traduction de documents longs (PDF, Word, articles)
- Glossaire persistant sur tout le document
- Cohérence terminologique stricte
- Support des sections et chapitres

### Paramètres spécifiques

```json
{
  "mode": "document",
  "options": {
    "glossary": {
      "user": "utilisateur",
      "software": "logiciel"
    },
    "preserve_structure": true,
    "enforce_terminology": true,
    "context_window": 500
  }
}
```

### Prompt système

```
You are a professional document translator. Translate the following text maintaining:

1. TERMINOLOGY CONSISTENCY: Use these terms consistently:
{glossary}

2. STRUCTURE: Preserve all formatting (headers, lists, paragraphs)

3. STYLE: Maintain a consistent formal tone throughout

4. ACCURACY: Prioritize faithful translation over creative adaptation

Previous context (for consistency):
{previous_context}

Text to translate:
{text}
```

### Post-processing
- Vérifier que tous les termes du glossaire sont utilisés
- Alerter si un terme source apparaît non traduit
- Calculer le score de cohérence terminologique

### Exemple

**Request:**
```json
{
  "operation": "translate",
  "mode": "document",
  "text": "## Chapter 1: User Interface\n\nThe software provides an intuitive user interface...",
  "target_lang": "fr",
  "options": {
    "glossary": {
      "user interface": "interface utilisateur",
      "software": "logiciel"
    }
  }
}
```

**Response:**
```json
{
  "translation": "## Chapitre 1 : Interface utilisateur\n\nLe logiciel fournit une interface utilisateur intuitive...",
  "mode": "document",
  "terminology_check": {
    "terms_applied": ["interface utilisateur", "logiciel"],
    "consistency_score": 1.0
  }
}
```

---

## Mode `ui`

### Caractéristiques
- Textes courts (boutons, labels, menus)
- Contraintes de longueur strictes
- Format clé/valeur supporté
- Cohérence entre écrans

### Paramètres spécifiques

```json
{
  "mode": "ui",
  "options": {
    "max_length": 30,
    "format": "json_kv",
    "context": "mobile_app",
    "preserve_placeholders": true
  }
}
```

### Prompt système

```
You are a UI/UX translator specializing in app and software interfaces.

Rules:
1. CONCISE: Maximum {max_length} characters per string
2. ACTION-ORIENTED: Use imperative verbs for buttons
3. CONSISTENT: Same source term = same translation
4. PLACEHOLDERS: Keep {variables} and %s unchanged
5. NO PUNCTUATION: Omit trailing periods on buttons/labels

Context: {context}

Translate these UI strings:
{text}
```

### Post-processing
- Vérifier longueur de chaque traduction
- Tronquer ou alerter si dépassement
- Vérifier placeholders préservés

### Exemple

**Request:**
```json
{
  "operation": "translate",
  "mode": "ui",
  "text": {
    "btn.save": "Save changes",
    "btn.cancel": "Cancel",
    "label.welcome": "Welcome, {username}!",
    "error.required": "This field is required"
  },
  "target_lang": "fr",
  "options": {
    "max_length": 25,
    "format": "json_kv"
  }
}
```

**Response:**
```json
{
  "translation": {
    "btn.save": "Enregistrer",
    "btn.cancel": "Annuler",
    "label.welcome": "Bienvenue, {username} !",
    "error.required": "Champ requis"
  },
  "mode": "ui",
  "length_check": {
    "btn.save": { "length": 11, "max": 25, "ok": true },
    "btn.cancel": { "length": 7, "max": 25, "ok": true },
    "label.welcome": { "length": 24, "max": 25, "ok": true },
    "error.required": { "length": 12, "max": 25, "ok": true }
  },
  "placeholders_preserved": true
}
```

---

## Mode `email`

### Caractéristiques
- Détection automatique du ton
- Adaptation des salutations/signatures
- Préservation du formatage
- Gestion des conventions culturelles

### Paramètres spécifiques

```json
{
  "mode": "email",
  "options": {
    "tone": "formal",
    "adapt_greeting": true,
    "adapt_closing": true,
    "preserve_signature": true
  }
}
```

### Prompt système

```
You are an expert email translator. Translate this email preserving:

1. TONE: {tone} register (formal/informal)
2. GREETINGS: Adapt to {target_lang} conventions
   - EN "Dear Sir" → FR "Madame, Monsieur"
   - EN "Hi John" → FR "Bonjour Jean" (or keep name)
3. CLOSINGS: Adapt appropriately
   - EN "Best regards" → FR "Cordialement"
   - EN "Cheers" → FR "Bien à vous"
4. FORMATTING: Preserve line breaks, lists
5. SIGNATURE: Keep names unchanged unless instructed

Email to translate:
{text}
```

### Post-processing
- Identifier et marquer les adaptations
- Vérifier cohérence du ton
- Préserver la structure email

### Exemple

**Request:**
```json
{
  "operation": "translate",
  "mode": "email",
  "text": "Dear Mr. Johnson,\n\nThank you for your inquiry. Please find attached our proposal.\n\nBest regards,\nSarah Smith\nSales Manager",
  "target_lang": "fr",
  "options": {
    "tone": "formal",
    "adapt_greeting": true,
    "adapt_closing": true
  }
}
```

**Response:**
```json
{
  "translation": "Monsieur Johnson,\n\nNous vous remercions de votre demande. Veuillez trouver ci-joint notre proposition.\n\nCordialement,\nSarah Smith\nResponsable des ventes",
  "mode": "email",
  "adaptations": [
    { "type": "greeting", "source": "Dear Mr. Johnson", "target": "Monsieur Johnson" },
    { "type": "closing", "source": "Best regards", "target": "Cordialement" },
    { "type": "title", "source": "Sales Manager", "target": "Responsable des ventes" }
  ],
  "tone_detected": "formal",
  "tone_maintained": true
}
```

---

## Mode `technical`

### Caractéristiques
- Code et exemples non traduits
- Markdown/HTML préservé
- Terminologie technique respectée
- Liens et références maintenus

### Paramètres spécifiques

```json
{
  "mode": "technical",
  "options": {
    "preserve_code_blocks": true,
    "preserve_inline_code": true,
    "preserve_urls": true,
    "domain": "software",
    "technical_glossary": {
      "array": "tableau",
      "function": "fonction"
    }
  }
}
```

### Prompt système

```
You are a technical documentation translator.

PRESERVE EXACTLY (do not translate):
- Code blocks (```)
- Inline code (`code`)
- URLs and links
- Variable names and identifiers
- File paths
- Command examples

TRANSLATE:
- Explanatory text
- Comments (if requested)
- UI element names in text

TERMINOLOGY:
Use standard {domain} terminology for {target_lang}.
{technical_glossary}

Document to translate:
{text}
```

### Post-processing
- Vérifier code blocks intacts
- Vérifier URLs préservées
- Compter éléments préservés

### Exemple

**Request:**
```json
{
  "operation": "translate",
  "mode": "technical",
  "text": "## Installation\n\nRun the following command:\n\n```bash\nnpm install translation-api\n```\n\nThen import the `translate` function:\n\n```javascript\nimport { translate } from 'translation-api';\n```\n\nSee [documentation](https://docs.example.com) for more details.",
  "target_lang": "fr",
  "options": {
    "preserve_code_blocks": true,
    "preserve_urls": true
  }
}
```

**Response:**
```json
{
  "translation": "## Installation\n\nExécutez la commande suivante :\n\n```bash\nnpm install translation-api\n```\n\nEnsuite, importez la fonction `translate` :\n\n```javascript\nimport { translate } from 'translation-api';\n```\n\nConsultez la [documentation](https://docs.example.com) pour plus de détails.",
  "mode": "technical",
  "preserved_elements": {
    "code_blocks": 2,
    "inline_code": 1,
    "urls": 1,
    "commands": ["npm install translation-api"]
  },
  "preservation_integrity": true
}
```

---

## Mode `marketing`

### Caractéristiques
- Adaptation culturelle (transcréation)
- Ton persuasif et engageant
- Alternatives créatives fournies
- Longueur flexible

### Paramètres spécifiques

```json
{
  "mode": "marketing",
  "options": {
    "brand_voice": "friendly",
    "target_audience": "young_professionals",
    "allow_adaptation": true,
    "provide_alternatives": 3
  }
}
```

### Prompt système

```
You are a marketing copywriter and transcreation specialist.

GOAL: Create compelling {target_lang} copy that resonates with {target_audience}.

APPROACH:
1. Understand the message and intent
2. Adapt for cultural relevance (not just translate)
3. Maintain brand voice: {brand_voice}
4. Preserve emotional impact
5. Wordplay/puns: find equivalent or create new

PROVIDE:
- Main translation (best option)
- {alternatives_count} alternative versions
- Explanation of adaptations

Source copy:
{text}
```

### Post-processing
- Générer alternatives
- Calculer score d'impact
- Noter les adaptations culturelles

### Exemple

**Request:**
```json
{
  "operation": "translate",
  "mode": "marketing",
  "text": "Think different. Just do it. Impossible is nothing.",
  "target_lang": "fr",
  "options": {
    "brand_voice": "bold",
    "provide_alternatives": 3
  }
}
```

**Response:**
```json
{
  "translation": "Pensez autrement. Foncez. Rien n'est impossible.",
  "mode": "marketing",
  "alternatives": [
    "Osez penser différemment. Passez à l'action. L'impossible n'existe pas.",
    "Changez de perspective. Lancez-vous. Tout est possible.",
    "Voyez les choses différemment. Agissez. Dépassez vos limites."
  ],
  "adaptations": [
    {
      "source": "Think different",
      "main": "Pensez autrement",
      "note": "Adaptation directe du slogan Apple (déjà connu en français)"
    },
    {
      "source": "Just do it",
      "main": "Foncez",
      "note": "Adaptation dynamique, plus percutante qu'une traduction littérale"
    }
  ],
  "impact_score": 0.88,
  "cultural_fit": "high"
}
```

---

## Implémentation

### Nouveau paramètre `mode`

```typescript
{
  displayName: 'Mode',
  name: 'mode',
  type: 'options',
  options: [
    { name: 'Default', value: 'default' },
    { name: 'Document', value: 'document' },
    { name: 'UI/UX', value: 'ui' },
    { name: 'Email', value: 'email' },
    { name: 'Technical', value: 'technical' },
    { name: 'Marketing', value: 'marketing' },
  ],
  default: 'default',
  description: 'Translation mode optimized for specific content types',
}
```

### Configuration par mode

```typescript
const modeConfigs: Record<string, ModeConfig> = {
  document: {
    temperature: 0.2,
    systemPrompt: DOCUMENT_PROMPT,
    postProcess: documentPostProcess,
    defaultOptions: {
      preserve_structure: true,
      enforce_terminology: true
    }
  },
  ui: {
    temperature: 0.1,
    systemPrompt: UI_PROMPT,
    postProcess: uiPostProcess,
    defaultOptions: {
      max_length: 50,
      preserve_placeholders: true
    }
  },
  email: {
    temperature: 0.3,
    systemPrompt: EMAIL_PROMPT,
    postProcess: emailPostProcess,
    defaultOptions: {
      adapt_greeting: true,
      adapt_closing: true
    }
  },
  technical: {
    temperature: 0.2,
    systemPrompt: TECHNICAL_PROMPT,
    postProcess: technicalPostProcess,
    defaultOptions: {
      preserve_code_blocks: true,
      preserve_urls: true
    }
  },
  marketing: {
    temperature: 0.5,
    systemPrompt: MARKETING_PROMPT,
    postProcess: marketingPostProcess,
    defaultOptions: {
      provide_alternatives: 3,
      allow_adaptation: true
    }
  }
};
```

### Fonction principale avec mode

```typescript
async function translateWithMode(
  text: string,
  targetLang: string,
  mode: string,
  options: ModeOptions,
  apiKey: string
): Promise<ModeTranslationResult> {
  const config = modeConfigs[mode] || modeConfigs.default;

  // Construire le prompt avec le mode
  const prompt = buildModePrompt(config.systemPrompt, text, targetLang, options);

  // Appeler le LLM avec la température du mode
  const result = await callLLM(apiKey, prompt, config.temperature);

  // Post-processing spécifique au mode
  const processed = await config.postProcess(text, result, options);

  return {
    translation: processed.translation,
    mode,
    ...processed.metadata
  };
}
```

---

## Tests

### Test document mode

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -d '{
    "operation": "translate",
    "mode": "document",
    "text": "The user must configure the software settings.",
    "target_lang": "fr",
    "options": {
      "glossary": {"user": "utilisateur", "software": "logiciel"}
    }
  }'
```

### Test UI mode

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -d '{
    "operation": "translate",
    "mode": "ui",
    "text": {"btn.submit": "Submit", "btn.cancel": "Cancel"},
    "target_lang": "fr",
    "options": {"max_length": 15, "format": "json_kv"}
  }'
```

### Test email mode

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -d '{
    "operation": "translate",
    "mode": "email",
    "text": "Hi,\n\nThanks for reaching out!\n\nCheers,\nJohn",
    "target_lang": "fr",
    "options": {"tone": "informal"}
  }'
```

### Test technical mode

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -d '{
    "operation": "translate",
    "mode": "technical",
    "text": "Use `npm install` to install dependencies.",
    "target_lang": "fr"
  }'
```

### Test marketing mode

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -d '{
    "operation": "translate",
    "mode": "marketing",
    "text": "Unleash your potential",
    "target_lang": "fr",
    "options": {"provide_alternatives": 3}
  }'
```

---

## Checklist

### Développement
- [ ] Implémenter mode `document`
- [ ] Implémenter mode `ui`
- [ ] Implémenter mode `email`
- [ ] Implémenter mode `technical`
- [ ] Implémenter mode `marketing`
- [ ] Post-processing par mode
- [ ] Batch avec modes

### Tests
- [ ] Test document (glossaire)
- [ ] Test UI (longueur, placeholders)
- [ ] Test email (salutations)
- [ ] Test technical (code préservé)
- [ ] Test marketing (alternatives)

### Documentation
- [ ] Finaliser `TRANSLATE_MCP_API.md`

---

## Critères de succès

1. Chaque mode produit des résultats adaptés
2. Post-processing valide les contraintes
3. Metadata spécifique par mode
4. Performance acceptable (< 3s)
5. Modes combinables avec multi-LLM

---

## Estimation

| Tâche | Durée estimée |
|-------|---------------|
| Mode document | 2h |
| Mode ui | 2h |
| Mode email | 2h |
| Mode technical | 2h |
| Mode marketing | 2h |
| Post-processing | 2h |
| Tests | 2h |
| **Total** | **~14h** |

---

## Évolutions futures (hors scope)

- Modes personnalisés par utilisateur
- Mémoire de traduction (TM)
- Intégration CAT tools (SDL, MemoQ)
- Fine-tuning de modèles par domaine
