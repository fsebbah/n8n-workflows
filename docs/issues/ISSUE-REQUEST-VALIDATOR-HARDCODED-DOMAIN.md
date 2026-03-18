# Issue: LLM-Request-Validator - Prompt hardcodé pour cuisine

> Le webhook `llm-request-validator` contient des contraintes spécifiques à la cuisine, rendant `user_state` incohérent pour d'autres domaines.

**Statut:** 🔴 À corriger
**Workflow:** `workflows/LLM-Request-Validator.json`
**Node concerné:** `Prepare LLM Request`

---

## Problème

Le prompt du validateur contient des sections hardcodées pour le domaine "cuisine" :

### 1. Exemples de contradictions (hardcodé cuisine)

```
Exemples de contradictions en cuisine :
- "sans cuisson + chaud" → chauffer = cuire, contradiction
- "vegan + viande/poisson" → incompatible par définition
- "rapide + plusieurs heures" → contradictoire
- "sans gluten + pâtes de blé classiques" → le blé contient du gluten
- "sans sucre + très sucré" → contradiction
```

### 2. Contraintes à extraire (hardcodé cuisine)

```
## Contraintes à extraire
- time : very_short (<10min), short (10-30min), medium (30-60min), long (>1h), null
- budget : low, medium, high, null
- ingredients : limited, specific, flexible, null      ← spécifique cuisine
- equipment : minimal, standard, full, null            ← spécifique cuisine
- diet : vegan, vegetarian, gluten_free, ...           ← spécifique cuisine
- servings : solo, couple, family, group, null         ← spécifique cuisine
```

### 3. Niveau utilisateur - exemples (hardcodé cuisine)

```
- beginner : "je suis nul", "je ne sais pas cuisiner", "c'est dur"
- advanced : termes techniques, recettes complexes
```

---

## Symptôme

Pour une requête sur les **échecs** :

```json
{
  "user_request": "comment jouer une sicilienne ?",
  "domain": { "name": "chess", "description": "Assistant d'échecs" }
}
```

Le LLM retourne des contraintes cuisine :

```json
{
  "user_state": {
    "constraints": {
      "time": null,
      "budget": null,
      "ingredients": null,    ← n'a pas de sens pour les échecs
      "equipment": null,       ← n'a pas de sens pour les échecs
      "diet": null,            ← n'a pas de sens pour les échecs
      "servings": null         ← n'a pas de sens pour les échecs
    }
  }
}
```

---

## Solution proposée

### Enrichir l'objet `domain` passé au webhook

```json
{
  "user_request": "je veux jouer une partie rapide",
  "domain": {
    "name": "chess",
    "description": "Assistant d'échecs pour apprendre et jouer",
    "bot_name": "ChessBot",

    "contradiction_examples": [
      "\"partie rapide + longue réflexion\" → contradictoire",
      "\"débutant + ouverture Najdorf avancée\" → niveau incompatible",
      "\"jouer sans pièces + partie complète\" → impossible"
    ],

    "constraints_schema": {
      "time_control": ["bullet", "blitz", "rapid", "classical", null],
      "rating_level": ["beginner", "intermediate", "advanced", null],
      "color_preference": ["white", "black", "random", null],
      "opening": "string or null"
    },

    "user_level_hints": {
      "beginner": ["je débute", "c'est quoi le roque", "comment bouge le cavalier"],
      "advanced": ["théorie d'ouverture", "finale de tours", "structure de pions"]
    }
  }
}
```

### Nouveaux champs `domain`

| Champ | Type | Description |
|-------|------|-------------|
| `contradiction_examples` | `string[]` | Exemples de contradictions spécifiques au domaine |
| `constraints_schema` | `object` | Schéma des contraintes à extraire (clé → valeurs possibles) |
| `user_level_hints` | `object` | Indices pour détecter le niveau utilisateur |

---

## Modification du prompt

Le node `Prepare LLM Request` devrait construire dynamiquement ces sections :

```javascript
// Contradictions - dynamique
const contradictionSection = data.domain.contradiction_examples?.length > 0
  ? `Exemples de contradictions pour ${data.domain.name} :\n${data.domain.contradiction_examples.map(e => `- ${e}`).join('\n')}`
  : `Identifie les contradictions logiques dans le contexte "${data.domain.name}"`;

// Contraintes - dynamique
const constraintsSection = data.domain.constraints_schema
  ? Object.entries(data.domain.constraints_schema)
      .map(([key, values]) => `- ${key} : ${Array.isArray(values) ? values.join(', ') : values}`)
      .join('\n')
  : `Extrais les contraintes pertinentes mentionnées par l'utilisateur`;

// Niveau utilisateur - dynamique
const userLevelSection = data.domain.user_level_hints
  ? Object.entries(data.domain.user_level_hints)
      .map(([level, hints]) => `- ${level} : ${hints.slice(0, 3).map(h => `"${h}"`).join(', ')}`)
      .join('\n')
  : `- beginner : indices de débutant\n- intermediate : requêtes standard\n- advanced : termes techniques`;
```

---

## Ce qui reste générique (inchangé)

Ces sections sont universelles et n'ont pas besoin d'être externalisées :

| Section | Raison |
|---------|--------|
| Émotions | Universel : stress, fatigue, motivation, curiosity, joy, neutral |
| Urgence | Universel : high, medium, low |
| Ton recommandé | Universel : reassuring, direct, enthusiastic, pedagogical, neutral |

---

## Rétrocompatibilité

| Cas | Comportement |
|-----|--------------|
| `domain.constraints_schema` absent | Prompt générique : "extrais les contraintes pertinentes" |
| `domain.contradiction_examples` absent | Prompt générique : "identifie les contradictions logiques" |
| `domain.user_level_hints` absent | Hints génériques sans exemples spécifiques |

**Aucun breaking change** - les appels existants continueront de fonctionner.

---

## Exemple complet pour cuisine (rétrocompat)

```json
{
  "user_request": "je veux un plat vegan rapide",
  "domain": {
    "name": "cuisine",
    "description": "Assistant culinaire pour trouver des recettes",
    "bot_name": "Chef Bot",

    "contradiction_examples": [
      "\"sans cuisson + chaud\" → chauffer = cuire, contradiction",
      "\"vegan + viande/poisson\" → incompatible par définition",
      "\"rapide + plusieurs heures\" → contradictoire",
      "\"sans gluten + pâtes de blé\" → le blé contient du gluten"
    ],

    "constraints_schema": {
      "time": ["very_short", "short", "medium", "long", null],
      "budget": ["low", "medium", "high", null],
      "ingredients": ["limited", "specific", "flexible", null],
      "equipment": ["minimal", "standard", "full", null],
      "diet": ["vegan", "vegetarian", "gluten_free", "lactose_free", null],
      "servings": ["solo", "couple", "family", "group", null]
    },

    "user_level_hints": {
      "beginner": ["je suis nul", "je ne sais pas cuisiner", "c'est dur"],
      "advanced": ["termes techniques", "recettes complexes", "dressage"]
    }
  }
}
```

---

## Actions requises

- [ ] Modifier `Prepare LLM Request` pour construire le prompt dynamiquement
- [ ] Mettre à jour la documentation du webhook
- [ ] Fournir des exemples de `domain` pour chess, torah, etc.
- [ ] Tester avec différents domaines

---

## Priorité

**P2** - Le webhook fonctionne mais retourne des données incohérentes pour les domaines non-cuisine.

---

## Commentaires équipe Plugin (2026-03-18)

> Revue par l'équipe plugin-chess/plugin-recipes

### ✅ Alignement confirmé

La structure `DOMAIN_CONTEXT` proposée est **déjà implémentée** dans `plugin-chess` (commit `2abbe70`) avec exactement les mêmes champs :
- `contradiction_examples`
- `constraints_schema`
- `user_level_hints`

### 💡 Suggestions d'amélioration

#### 1. Validation stricte des valeurs retournées

Le prompt devrait explicitement contraindre le LLM à n'utiliser **que** les valeurs du schéma :

```javascript
// Suggestion : ajouter "UTILISE UNIQUEMENT ces valeurs"
const constraintsSection = data.domain.constraints_schema
  ? `Contraintes à extraire (UTILISE UNIQUEMENT ces valeurs) :\n` +
    Object.entries(data.domain.constraints_schema)
      .map(([key, values]) => `- ${key} : ${Array.isArray(values) ? values.join(' | ') : values}`)
      .join('\n')
  : `...`;
```

#### 2. Limite de hints paramétrable

```javascript
// Actuellement : limite arbitraire à 3
hints.slice(0, 3).map(h => `"${h}"`).join(', ')

// Suggestion : configurable ou augmenter à 5
const MAX_HINTS = data.domain.max_hints_per_level || 5;
hints.slice(0, MAX_HINTS).map(h => `"${h}"`).join(', ')
```

#### 3. Champ additionnel suggéré : `out_of_scope_examples`

Aide le LLM à identifier les requêtes hors scope avec des exemples concrets :

```json
{
  "out_of_scope_examples": [
    "météo", "actualités", "recettes de cuisine"
  ]
}
```

#### 4. Gestion du format mixte array/string

Le code JS doit gérer les deux formats de `constraints_schema` :

```javascript
const formatValue = (v) => Array.isArray(v) ? v.join(' | ') : v;

// Utilisation
.map(([key, values]) => `- ${key} : ${formatValue(values)}`)
```

### ✅ Actions côté plugins (complétées)

| Plugin | Action | Statut |
|--------|--------|--------|
| `plugin-chess` | Enrichir `DOMAIN_CONTEXT` | ✅ Fait |
| `plugin-chess` | Auto-générer `allowed_keys` depuis `constraints_schema` | ✅ Fait |
| `plugin-recipes` | Enrichir `DOMAIN_CONTEXT` | ✅ Fait |
| `plugin-recipes` | Auto-générer `allowed_keys` depuis `constraints_schema` | ✅ Fait |

### 📎 Commits associés

- `plugin-chess`: `4b3aac5` - refactor: auto-generate allowed_keys from constraints_schema
- `plugin-chess`: `2abbe70` - fix: skip clarification when ConversationManager available (RFC-043)
- `plugin-recipes`: `6fed5bc` - feat(RFC-044): enrich DOMAIN_CONTEXT with cuisine-specific metadata
