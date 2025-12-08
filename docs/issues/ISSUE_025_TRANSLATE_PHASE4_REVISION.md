# Issue #025 - Translation MCP Phase 4: Revision & Improvement

## Objectif

Ajouter des opérations de révision et d'amélioration itérative des traductions.

**Parent:** [ISSUE_021_TRANSLATION_TOOLS_MCP.md](./ISSUE_021_TRANSLATION_TOOLS_MCP.md)
**Prérequis:** [ISSUE_024_TRANSLATE_PHASE3_VALIDATION.md](./ISSUE_024_TRANSLATE_PHASE3_VALIDATION.md)

---

## Scope Phase 4

| Inclus | Exclus |
|--------|--------|
| Révision avec feedback | Modes spécialisés |
| Amélioration itérative | Intégration externe |
| Fusion de traductions | UI de révision |
| Glossaire dynamique | Mémoire de traduction |

---

## Nouvelles Opérations

### 1. `revise` - Réviser une traduction

Améliore une traduction existante basée sur du feedback spécifique.

**Paramètres:**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `source_text` | string | Oui | Texte original |
| `translation` | string | Oui | Traduction à réviser |
| `target_lang` | string | Oui | Langue cible |
| `feedback` | array | Non | Liste de problèmes à corriger |
| `validation_result` | object | Non | Résultat de validation (Phase 3) |
| `focus` | array | Non | Aspects à privilégier |

**Request:**
```json
{
  "resource": "revision",
  "operation": "revise",
  "source_text": "The software update includes bug fixes and performance improvements.",
  "translation": "La mise à jour du logiciel inclut des corrections de bugs et des améliorations de performances.",
  "target_lang": "fr",
  "feedback": [
    "Le terme 'bugs' devrait être traduit",
    "Phrase un peu longue"
  ],
  "focus": ["terminology", "fluency"],
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "original_translation": "La mise à jour du logiciel inclut des corrections de bugs et des améliorations de performances.",
  "revised_translation": "La mise à jour logicielle corrige des bogues et améliore les performances.",
  "changes": [
    {
      "type": "terminology",
      "original": "bugs",
      "revised": "bogues",
      "reason": "Terme français officiel"
    },
    {
      "type": "fluency",
      "original": "mise à jour du logiciel",
      "revised": "mise à jour logicielle",
      "reason": "Plus concis"
    },
    {
      "type": "fluency",
      "original": "inclut des corrections de... et des améliorations de...",
      "revised": "corrige... et améliore...",
      "reason": "Structure plus directe"
    }
  ],
  "improvement_score": 0.18,
  "feedback_addressed": [
    { "feedback": "Le terme 'bugs' devrait être traduit", "addressed": true },
    { "feedback": "Phrase un peu longue", "addressed": true }
  ]
}
```

### 2. `improve` - Amélioration itérative

Améliore une traduction par passes successives jusqu'à atteindre un seuil de qualité.

**Request:**
```json
{
  "resource": "revision",
  "operation": "improve",
  "source_text": "We need to leverage synergies to drive innovation.",
  "translation": "Nous devons exploiter les synergies pour conduire l'innovation.",
  "target_lang": "fr",
  "target_score": 0.90,
  "max_iterations": 3,
  "focus": ["fluency", "style"],
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "iterations": [
    {
      "iteration": 1,
      "translation": "Nous devons exploiter les synergies pour conduire l'innovation.",
      "score": 0.75,
      "assessment": "Traduction littérale, jargon corporate non adapté"
    },
    {
      "iteration": 2,
      "translation": "Nous devons tirer parti des synergies pour stimuler l'innovation.",
      "score": 0.85,
      "changes": [
        "exploiter → tirer parti de (moins négatif)",
        "conduire → stimuler (plus dynamique)"
      ]
    },
    {
      "iteration": 3,
      "translation": "Nous devons capitaliser sur nos synergies pour favoriser l'innovation.",
      "score": 0.91,
      "changes": [
        "tirer parti de → capitaliser sur (plus business)",
        "stimuler → favoriser (plus naturel)"
      ]
    }
  ],
  "final_translation": "Nous devons capitaliser sur nos synergies pour favoriser l'innovation.",
  "initial_score": 0.75,
  "final_score": 0.91,
  "target_reached": true,
  "total_iterations": 3
}
```

### 3. `merge` - Fusionner des traductions

Combine les meilleures parties de plusieurs traductions.

**Request:**
```json
{
  "resource": "revision",
  "operation": "merge",
  "source_text": "Our mission is to empower businesses through cutting-edge technology and exceptional customer service.",
  "translations": [
    {
      "id": "openai",
      "text": "Notre mission est de donner du pouvoir aux entreprises grâce à une technologie de pointe et un service client exceptionnel."
    },
    {
      "id": "anthropic",
      "text": "Notre mission est d'accompagner les entreprises grâce à des technologies innovantes et un service client d'excellence."
    },
    {
      "id": "human",
      "text": "Notre mission : permettre aux entreprises de se développer grâce à la technologie et un service client hors pair."
    }
  ],
  "target_lang": "fr",
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "merged_translation": "Notre mission est d'accompagner les entreprises grâce à des technologies de pointe et un service client d'excellence.",
  "composition": {
    "segments": [
      {
        "text": "Notre mission est d'accompagner les entreprises",
        "source": "anthropic",
        "reason": "'accompagner' plus naturel que 'donner du pouvoir'"
      },
      {
        "text": "grâce à des technologies de pointe",
        "source": "openai",
        "reason": "'de pointe' plus courant que 'innovantes'"
      },
      {
        "text": "et un service client d'excellence",
        "source": "anthropic",
        "reason": "'d'excellence' plus élégant"
      }
    ]
  },
  "quality_score": 0.94,
  "sources_used": ["anthropic", "openai"]
}
```

### 4. `applyGlossary` - Appliquer un glossaire

Révise une traduction en appliquant un glossaire de termes.

**Request:**
```json
{
  "resource": "revision",
  "operation": "applyGlossary",
  "translation": "Le software doit être updaté pour fixer les bugs.",
  "target_lang": "fr",
  "glossary": {
    "software": "logiciel",
    "update": "mettre à jour",
    "bug": "bogue",
    "fix": "corriger"
  },
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "original": "Le software doit être updaté pour fixer les bugs.",
  "revised": "Le logiciel doit être mis à jour pour corriger les bogues.",
  "applied_terms": [
    { "source": "software", "target": "logiciel", "applied": true },
    { "source": "updaté", "target": "mis à jour", "applied": true },
    { "source": "fixer", "target": "corriger", "applied": true },
    { "source": "bugs", "target": "bogues", "applied": true }
  ],
  "glossary_coverage": 1.0
}
```

---

## Algorithmes

### Amélioration Itérative

```typescript
async function improveTranslation(
  sourceText: string,
  translation: string,
  targetLang: string,
  targetScore: number,
  maxIterations: number,
  focus: string[],
  apiKey: string
): Promise<ImprovementResult> {
  const iterations: Iteration[] = [];
  let currentTranslation = translation;
  let currentScore = await scoreTranslation(sourceText, currentTranslation, apiKey);

  iterations.push({
    iteration: 0,
    translation: currentTranslation,
    score: currentScore,
    changes: []
  });

  for (let i = 1; i <= maxIterations && currentScore < targetScore; i++) {
    // Obtenir feedback sur la traduction actuelle
    const feedback = await getImprovementFeedback(
      sourceText,
      currentTranslation,
      targetLang,
      focus,
      apiKey
    );

    // Réviser basé sur le feedback
    const revised = await reviseWithFeedback(
      sourceText,
      currentTranslation,
      targetLang,
      feedback,
      apiKey
    );

    // Scorer la nouvelle version
    const newScore = await scoreTranslation(sourceText, revised.translation, apiKey);

    // Ne garder que si amélioration
    if (newScore > currentScore) {
      currentTranslation = revised.translation;
      currentScore = newScore;

      iterations.push({
        iteration: i,
        translation: currentTranslation,
        score: currentScore,
        changes: revised.changes
      });
    } else {
      // Pas d'amélioration, arrêter
      break;
    }
  }

  return {
    iterations,
    final_translation: currentTranslation,
    initial_score: iterations[0].score,
    final_score: currentScore,
    target_reached: currentScore >= targetScore,
    total_iterations: iterations.length - 1
  };
}
```

### Fusion de Traductions

```typescript
async function mergeTranslations(
  sourceText: string,
  translations: Translation[],
  targetLang: string,
  apiKey: string
): Promise<MergeResult> {
  const prompt = `
    You are a professional editor. Given multiple translations of the same source text,
    create the best possible translation by combining the strongest elements from each.

    Source: "${sourceText}"

    Translations:
    ${translations.map((t, i) => `${i + 1}. [${t.id}] ${t.text}`).join('\n')}

    Instructions:
    1. Analyze each translation's strengths and weaknesses
    2. Create a merged translation using the best parts
    3. Ensure the result is coherent and natural

    Return JSON:
    {
      "merged_translation": "...",
      "composition": {
        "segments": [
          {"text": "...", "source": "id", "reason": "..."}
        ]
      }
    }
  `;

  const response = await callOpenAI(apiKey, prompt);
  return JSON.parse(response);
}
```

---

## Prompts

### Prompt `revise`

```
You are a professional translation editor. Revise the following translation based on the feedback provided.

Source ({source_lang}): "{source_text}"
Current translation ({target_lang}): "{translation}"

Feedback to address:
{feedback_list}

Focus areas: {focus}

Instructions:
1. Address each feedback point
2. Maintain accuracy to the source
3. Improve overall quality
4. Keep changes minimal but effective

Return JSON:
{
  "revised_translation": "...",
  "changes": [
    {"type": "...", "original": "...", "revised": "...", "reason": "..."}
  ],
  "feedback_addressed": [
    {"feedback": "...", "addressed": true/false}
  ]
}
```

### Prompt `improve` (feedback generation)

```
Analyze this translation and suggest specific improvements.

Source: "{source_text}"
Translation: "{translation}"
Target language: {target_lang}
Focus areas: {focus}

Identify:
1. Awkward phrasing
2. Terminology issues
3. Style inconsistencies
4. Grammar errors
5. Unnatural constructions

Return a list of specific, actionable feedback items.
```

### Prompt `merge`

```
Combine the best elements of these translations:

Source: "{source_text}"

{translations_with_ids}

Create an optimal merged translation by:
1. Identifying the strongest segments from each
2. Ensuring coherent flow
3. Maintaining consistent style
4. Preserving accuracy

Return the merged translation with attribution for each segment.
```

---

## Tests

### Test 1: Révision avec feedback

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "revise",
    "source_text": "Click here to download",
    "translation": "Cliquez ici pour télécharger",
    "target_lang": "fr",
    "feedback": ["Trop littéral", "Peut être plus concis"],
    "api_key": "sk-..."
  }'
```

### Test 2: Amélioration itérative

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "improve",
    "source_text": "Our team is committed to delivering excellence.",
    "translation": "Notre équipe est engagée à livrer l excellence.",
    "target_lang": "fr",
    "target_score": 0.90,
    "max_iterations": 3,
    "api_key": "sk-..."
  }'
```

### Test 3: Fusion

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "merge",
    "source_text": "Welcome to our platform",
    "translations": [
      {"id": "t1", "text": "Bienvenue sur notre plateforme"},
      {"id": "t2", "text": "Bienvenue sur notre plate-forme"}
    ],
    "target_lang": "fr",
    "api_key": "sk-..."
  }'
```

### Test 4: Application glossaire

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "applyGlossary",
    "translation": "Le user doit se logger pour accéder au dashboard.",
    "target_lang": "fr",
    "glossary": {
      "user": "utilisateur",
      "logger": "connecter",
      "dashboard": "tableau de bord"
    },
    "api_key": "sk-..."
  }'
```

---

## Checklist

### Développement
- [ ] Implémenter `revise`
- [ ] Implémenter `improve`
- [ ] Implémenter `merge`
- [ ] Implémenter `applyGlossary`
- [ ] Optimiser les prompts

### Tests
- [ ] Test révision simple
- [ ] Test révision avec validation result
- [ ] Test amélioration (atteint target)
- [ ] Test amélioration (max iterations)
- [ ] Test fusion 2 traductions
- [ ] Test fusion 3+ traductions
- [ ] Test glossaire complet
- [ ] Test glossaire partiel

### Documentation
- [ ] Mettre à jour `TRANSLATE_MCP_API.md`

---

## Critères de succès

1. `revise` adresse le feedback fourni
2. `improve` converge vers le target_score
3. `merge` produit une traduction cohérente
4. `applyGlossary` remplace correctement les termes
5. Les changements sont tracés et explicables

---

## Estimation

| Tâche | Durée estimée |
|-------|---------------|
| revise | 2h |
| improve | 3h |
| merge | 2h |
| applyGlossary | 1h |
| Tests | 2h |
| **Total** | **~10h** |
