# RFC-018: Enrichissement Automatique des Recettes

**Status:** Draft
**Date:** 2026-01-22
**Authors:** Équipe plugin-recipes
**Target Teams:** plugin-recipes, n8n-workflows, chatbot-core
**Depends on:** RFC-016 (Document Processing Architecture)

---

## Résumé

Architecture pour enrichir automatiquement les recettes extraites (OCR ou saisie) avec :
- **Score nutritionnel** (Nutri-Score A→E)
- **Détection allergènes** (14 INCO obligatoires)
- **Score de difficulté** (1-3 toques)
- **Suggestions d'amélioration** (alléger une recette)

---

## Problème

### Situation actuelle

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTRACTION RECETTE ACTUELLE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Image ──→ OCR ──→ Parsing regex ──→ Recette basique            │
│                                                                  │
│  Données extraites :                                             │
│  ✅ Titre                                                        │
│  ✅ Ingrédients (texte brut)                                     │
│  ✅ Étapes                                                       │
│  ✅ Temps / Portions                                             │
│                                                                  │
│  Données manquantes :                                            │
│  ❌ Valeurs nutritionnelles                                      │
│  ❌ Allergènes INCO                                              │
│  ❌ Score de difficulté calculé                                  │
│  ❌ Suggestions santé                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Problèmes identifiés

| Problème | Impact |
|----------|--------|
| **Pas de nutrition** | Utilisateur ne connaît pas l'apport calorique |
| **Pas d'allergènes** | Risque sanitaire, non-conformité INCO |
| **Difficulté subjective** | "Moyen" dans le texte OCR = imprécis |
| **Pas de conseils santé** | Opportunité manquée d'engagement |

---

## Solution : Pipeline d'enrichissement

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                      PIPELINE ENRICHISSEMENT                     │
└─────────────────────────────────────────────────────────────────┘

  Image/Texte
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  ÉTAPE 1 : Extraction structurée                                 │
│  ───────────────────────────────────────────────────────────────│
│  Webhook: document-structure-extract                             │
│  Input: texte OCR + schema recette                               │
│  Output: JSON structuré (title, ingredients[], steps[])          │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  ÉTAPE 2 : Enrichissement parallèle                              │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  nutrition-  │  │  allergen-   │  │  difficulty- │           │
│  │  calculate   │  │  detect      │  │  score       │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         ▼                 ▼                 ▼                    │
│    Nutri-Score      Allergènes INCO    Toques (1-3)             │
│    + macros         + traces           + explication            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  ÉTAPE 3 : Suggestions (optionnel)                               │
│  ───────────────────────────────────────────────────────────────│
│  Webhook: recipe-improve                                         │
│  Input: recette + Nutri-Score                                    │
│  Output: suggestions pour améliorer le score                     │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  RECETTE ENRICHIE                                                │
│  ───────────────────────────────────────────────────────────────│
│  {                                                               │
│    "title": "Poulet au curry",                                   │
│    "ingredients": [...],                                         │
│    "steps": [...],                                               │
│    "nutrition": { "nutri_score": "D", "calories": 536, ... },   │
│    "allergens": { "confirmed": ["lait"], "traces": [...] },     │
│    "difficulty": { "toques": 2, "level": "Moyen" },             │
│    "improvements": ["Remplacer beurre par huile d'olive", ...]  │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Contrats d'API

### 1. Document-Structure-Extract (générique)

**Endpoint:** `POST /webhook/document-structure-extract`

**Responsabilité:** n8n (workflow générique, réutilisable par tous les plugins)

#### Request

```json
{
  "text": "# POULET AU CURRY\n\n1. Laver les blancs...",
  "schema": {
    "type": "recipe",
    "fields": {
      "title": "string",
      "description": "string (optional)",
      "servings": "integer",
      "prep_time": "integer (minutes)",
      "cook_time": "integer (minutes)",
      "difficulty": "string (Facile|Moyen|Difficile)",
      "ingredients": [{
        "name": "string",
        "quantity": "number|null",
        "unit": "string",
        "notes": "string (optional)"
      }],
      "steps": [{
        "number": "integer",
        "description": "string"
      }],
      "tips": ["string"]
    }
  },
  "context": {
    "type": "recipe",
    "language": "fr"
  }
}
```

#### Response

```json
{
  "success": true,
  "extracted": {
    "title": "Poulet au curry",
    "servings": 4,
    "prep_time": 25,
    "cook_time": 37,
    "difficulty": "Moyen",
    "ingredients": [
      {"name": "blancs de poulet", "quantity": 650, "unit": "g"},
      {"name": "lait de coco", "quantity": 400, "unit": "ml"},
      {"name": "beurre", "quantity": 1, "unit": "c.s."}
    ],
    "steps": [
      {"number": 1, "description": "Laver les blancs de poulet..."},
      {"number": 2, "description": "Retirer le panier vapeur..."}
    ],
    "tips": ["Servir avec du riz"]
  },
  "confidence": 0.92,
  "missing_fields": ["description"]
}
```

#### Autres schemas supportés (exemples)

| Type | Usage |
|------|-------|
| `recipe` | Recettes de cuisine |
| `menu` | Menus de restaurant |
| `shopping_list` | Listes de courses |
| `nutrition_label` | Étiquettes nutritionnelles |
| `invoice` | Factures (hors plugin-recipes) |
| `cv` | CV (hors plugin-recipes) |

---

### 2. Nutrition-Calculate

**Endpoint:** `POST /webhook/nutrition-calculate`

**Responsabilité:** n8n (appelle CIQUAL/OpenFoodFacts)

#### Request

```json
{
  "ingredients": [
    {"name": "blancs de poulet", "quantity": 650, "unit": "g"},
    {"name": "lait de coco", "quantity": 400, "unit": "ml"},
    {"name": "beurre", "quantity": 15, "unit": "g"},
    {"name": "huile végétale", "quantity": 45, "unit": "ml"},
    {"name": "curry en poudre", "quantity": 9, "unit": "g"}
  ],
  "servings": 4,
  "options": {
    "data_source": "ciqual",
    "calculate_nutri_score": true,
    "language": "fr"
  }
}
```

#### Response

```json
{
  "success": true,
  "per_serving": {
    "energy_kcal": 536,
    "energy_kj": 2244,
    "protein_g": 38,
    "carbs_g": 12,
    "carbs_sugar_g": 3,
    "fat_g": 37,
    "fat_saturated_g": 18,
    "fiber_g": 3,
    "sodium_mg": 480,
    "salt_g": 1.2
  },
  "total_recipe": {
    "energy_kcal": 2144,
    "protein_g": 152
  },
  "nutri_score": {
    "letter": "D",
    "value": 12,
    "negative_points": {
      "energy": 4,
      "sugar": 1,
      "saturated_fat": 8,
      "sodium": 4
    },
    "positive_points": {
      "fiber": 1,
      "protein": 5,
      "fruit_veg": 0
    }
  },
  "data_quality": {
    "matched_ingredients": 5,
    "estimated_ingredients": 0,
    "missing_ingredients": 0,
    "confidence": 0.95
  },
  "sources": {
    "blancs de poulet": "ciqual:36006",
    "lait de coco": "ciqual:19051"
  }
}
```

---

### 3. Allergen-Detect

**Endpoint:** `POST /webhook/allergen-detect`

**Responsabilité:** À déterminer (plugin local OU n8n)

#### Request

```json
{
  "ingredients": [
    "blancs de poulet",
    "lait de coco",
    "beurre",
    "bouillon de légumes",
    "curry en poudre",
    "pousses de bambou en bocal"
  ],
  "options": {
    "check_traces": true,
    "language": "fr",
    "regulation": "inco_eu"
  }
}
```

#### Response

```json
{
  "success": true,
  "allergens": {
    "confirmed": [
      {
        "type": "lait",
        "label": "Lait",
        "icon": "🥛",
        "sources": ["beurre"]
      }
    ],
    "possible_traces": [
      {
        "type": "celeri",
        "label": "Céleri",
        "sources": ["bouillon de légumes", "curry en poudre"],
        "reason": "Selon fabricant"
      },
      {
        "type": "moutarde",
        "label": "Moutarde",
        "sources": ["curry en poudre"],
        "reason": "Selon fabricant"
      },
      {
        "type": "gluten",
        "label": "Gluten",
        "sources": ["bouillon de légumes"],
        "reason": "Selon fabricant"
      },
      {
        "type": "soja",
        "label": "Soja",
        "sources": ["bouillon de légumes"],
        "reason": "Selon fabricant"
      },
      {
        "type": "sulfites",
        "label": "Sulfites",
        "sources": ["pousses de bambou en bocal"],
        "reason": "Conservateurs possibles"
      }
    ],
    "warnings": [
      "Ce plat contient de la noix de coco (non allergène INCO mais risque individuel possible)"
    ]
  },
  "display": {
    "short": "Allergènes : Lait | Traces possibles : Céleri, moutarde, gluten, soja, sulfites",
    "html": "<strong>Allergènes :</strong> 🥛 Lait<br><em>Traces possibles :</em> Céleri, moutarde, gluten, soja, sulfites"
  },
  "inco_compliant": true
}
```

---

### 4. Difficulty-Score

**Endpoint:** `POST /webhook/difficulty-score` OU calcul local

**Responsabilité:** À déterminer (règles simples = local, analyse complexe = LLM)

#### Request

```json
{
  "recipe": {
    "prep_time": 25,
    "cook_time": 37,
    "total_time": 62,
    "steps_count": 6,
    "steps": [
      "Laver les blancs de poulet...",
      "Retirer le panier vapeur...",
      "Éplucher les carottes..."
    ],
    "equipment": ["Thermomix", "panier vapeur"]
  },
  "options": {
    "method": "heuristic"
  }
}
```

#### Response

```json
{
  "success": true,
  "difficulty": {
    "level": "Moyen",
    "toques": 2,
    "score": 45,
    "factors": {
      "time": {"value": 62, "points": 15, "max": 30},
      "steps": {"value": 6, "points": 12, "max": 25},
      "techniques": {"value": 2, "points": 10, "max": 25},
      "equipment": {"value": 1, "points": 8, "max": 20}
    },
    "detected_techniques": ["cuisson vapeur", "hachage", "sauce"],
    "special_equipment": ["Thermomix"],
    "explanation": "Difficulté moyenne : temps de préparation conséquent (1h), techniques de base, équipement spécialisé (Thermomix)"
  }
}
```

#### Barème difficulté

| Toques | Niveau | Score | Critères |
|--------|--------|-------|----------|
| ⭐ | Facile | 0-30 | < 30 min, < 5 étapes, techniques basiques |
| ⭐⭐ | Moyen | 31-60 | 30-60 min, 5-10 étapes, quelques techniques |
| ⭐⭐⭐ | Difficile | 61-100 | > 60 min, > 10 étapes, techniques avancées |

---

### 5. Recipe-Improve (suggestions)

**Endpoint:** `POST /webhook/recipe-improve`

**Responsabilité:** n8n (appel LLM)

#### Request

```json
{
  "recipe": {
    "title": "Poulet au curry",
    "ingredients": [...],
    "nutrition": {
      "nutri_score": "D",
      "fat_saturated_g": 18
    }
  },
  "goal": "improve_nutri_score",
  "target_score": "C",
  "constraints": {
    "keep_taste": true,
    "max_ingredient_changes": 3
  }
}
```

#### Response

```json
{
  "success": true,
  "suggestions": [
    {
      "type": "substitute",
      "original": "beurre",
      "replacement": "huile d'olive",
      "impact": "Réduit graisses saturées de 40%",
      "nutri_score_gain": "+3 points"
    },
    {
      "type": "substitute",
      "original": "lait de coco entier",
      "replacement": "lait de coco allégé (ou 50% lait végétal)",
      "impact": "Réduit graisses saturées de 25%",
      "nutri_score_gain": "+2 points"
    },
    {
      "type": "add",
      "ingredient": "200g de légumes verts (brocolis, pois mange-tout)",
      "impact": "Augmente fibres et vitamines",
      "nutri_score_gain": "+2 points fibres, +1 point fruits/légumes"
    },
    {
      "type": "serve_with",
      "suggestion": "Riz complet au lieu de riz blanc",
      "impact": "Augmente fibres de l'accompagnement"
    }
  ],
  "projected_score": {
    "current": "D",
    "after_all_changes": "B",
    "after_easy_changes": "C"
  }
}
```

---

## Modèles de données

### Extension de Recipe (src/models.py)

```python
@dataclass
class NutriScore:
    """Score Nutri-Score officiel."""
    letter: str           # A, B, C, D, E
    value: int            # -15 à +40
    negative_points: int  # 0-40
    positive_points: int  # 0-15
    calculation_date: str
    data_source: str      # "ciqual", "openfoodfacts", "estimated"
    confidence: float     # 0.0-1.0


class AllergenType(Enum):
    """14 allergènes INCO obligatoires UE."""
    GLUTEN = "gluten"
    CRUSTACEANS = "crustaces"
    EGGS = "oeufs"
    FISH = "poisson"
    PEANUTS = "arachides"
    SOY = "soja"
    MILK = "lait"
    NUTS = "fruits_a_coque"
    CELERY = "celeri"
    MUSTARD = "moutarde"
    SESAME = "sesame"
    SULFITES = "sulfites"
    LUPIN = "lupin"
    MOLLUSCS = "mollusques"


@dataclass
class AllergenInfo:
    """Informations allergènes conformes INCO."""
    confirmed: list[AllergenType]
    possible_traces: list[AllergenType]
    sources: dict[str, list[str]]  # ingredient -> allergènes
    warnings: list[str]
    inco_compliant: bool = True


@dataclass
class DifficultyScore:
    """Score de difficulté détaillé."""
    level: str         # Facile, Moyen, Difficile
    toques: int        # 1, 2, 3
    score: int         # 0-100
    explanation: str
    detected_techniques: list[str]
    special_equipment: list[str]
```

---

## Répartition des responsabilités

| Composant | Responsabilité | Équipe |
|-----------|----------------|--------|
| `document-structure-extract` | Extraction LLM générique (tous schemas) | **n8n** |
| `nutrition-calculate` | Calcul nutrition + Nutri-Score | **n8n** |
| `allergen-detect` | Détection allergènes INCO | **plugin OU n8n** |
| `difficulty-score` | Calcul difficulté | **plugin (local)** |
| `recipe-improve` | Suggestions LLM | **n8n** |
| Base allergènes JSON | 14 allergènes + mapping | **chatbot-core OU plugin** |
| Base CIQUAL/OpenFoodFacts | Données nutritionnelles | **n8n (API externe)** |
| Modèles de données | `NutriScore`, `AllergenInfo`, etc. | **plugin-recipes** |

---

## Questions ouvertes

### Pour l'équipe n8n

1. **Document-Structure-Extract**
   - Ce workflow existe-t-il déjà ?
   - Peut-il être générique (schema en paramètre) ?
   - Quel LLM utiliser (Claude, GPT, Mistral) ?

2. **Nutrition-Calculate**
   - Quelle source de données privilégier ?
   - CIQUAL (officiel FR) vs OpenFoodFacts (communautaire)
   - Gestion des ingrédients non trouvés ?

3. **Coûts**
   - Faut-il facturer l'enrichissement ?
   - Combien de crédits par recette enrichie ?

### Pour l'équipe chatbot-core

4. **Base allergènes**
   - Doit-elle être dans chatbot-core (réutilisable) ?
   - Ou spécifique à chaque plugin ?
   - Format : JSON statique ou API ?

5. **Calcul local vs n8n**
   - Le calcul de difficulté peut être local (règles simples)
   - La détection allergènes peut être locale (mapping JSON)
   - Avantage : pas d'appel réseau, gratuit
   - Inconvénient : maintenance du mapping

### Pour l'équipe plugin-recipes

6. **Enrichissement automatique ou à la demande ?**
   - Option A : Toujours enrichir après extraction OCR
   - Option B : Bouton "Analyser nutrition / allergènes"
   - Option C : Configurable par utilisateur

7. **Affichage Discord**
   - Tout dans un seul embed ?
   - Ou plusieurs messages / onglets ?

---

## Annexe A : Calcul Nutri-Score

### Formule officielle

```
Score final = Points négatifs (A) - Points positifs (C)

Points négatifs (0-40) :
- Énergie (kJ) : 0-10 points
- Sucres (g) : 0-10 points
- Graisses saturées (g) : 0-10 points
- Sodium (mg) : 0-10 points

Points positifs (0-15) :
- Fibres (g) : 0-5 points
- Protéines (g) : 0-5 points
- Fruits/légumes/noix (%) : 0-5 points
```

### Conversion score → lettre

| Score | Lettre | Couleur |
|-------|--------|---------|
| -15 à -1 | A | 🟢 Vert foncé |
| 0 à 2 | B | 🟢 Vert clair |
| 3 à 10 | C | 🟡 Jaune |
| 11 à 18 | D | 🟠 Orange |
| 19 à 40 | E | 🔴 Rouge |

---

## Annexe B : 14 Allergènes INCO

| # | Allergène | Exemples d'ingrédients |
|---|-----------|------------------------|
| 1 | Gluten | Blé, seigle, orge, avoine, épeautre |
| 2 | Crustacés | Crevettes, homard, crabe |
| 3 | Œufs | Œuf, mayonnaise, meringue |
| 4 | Poisson | Saumon, thon, anchois |
| 5 | Arachides | Cacahuètes, huile d'arachide |
| 6 | Soja | Tofu, sauce soja, lécithine |
| 7 | Lait | Lait, beurre, crème, fromage |
| 8 | Fruits à coque | Amandes, noisettes, noix, cajou |
| 9 | Céleri | Céleri branche, céleri-rave |
| 10 | Moutarde | Moutarde, graines de moutarde |
| 11 | Sésame | Graines de sésame, tahini |
| 12 | Sulfites | Vin, fruits secs, conserves |
| 13 | Lupin | Farine de lupin |
| 14 | Mollusques | Moules, huîtres, calamars |

### ⚠️ Pièges courants

| Ingrédient | Allergène ? | Note |
|------------|-------------|------|
| Lait de coco | ❌ Non | Pas un lait animal |
| Noix de coco | ❌ Non | Pas un fruit à coque INCO |
| Beurre de cacao | ❌ Non | Pas de lait |
| Huile de sésame | ✅ Oui | Sésame |
| Bouillon cube | ⚠️ Traces | Céleri, gluten, soja possibles |

---

## Annexe C : Exemple complet de sortie

### Recette : Poulet au curry

```json
{
  "title": "Poulet au curry",
  "servings": 4,
  "prep_time": 25,
  "cook_time": 37,
  "ingredients": [
    {"name": "blancs de poulet", "quantity": 650, "unit": "g"},
    {"name": "lait de coco", "quantity": 400, "unit": "ml"},
    {"name": "beurre", "quantity": 15, "unit": "g"},
    {"name": "curry en poudre", "quantity": 9, "unit": "g"}
  ],
  "steps": ["..."],

  "nutrition": {
    "per_serving": {
      "energy_kcal": 536,
      "protein_g": 38,
      "carbs_g": 12,
      "fat_g": 37,
      "fat_saturated_g": 18,
      "fiber_g": 3,
      "salt_g": 1.2
    },
    "nutri_score": {
      "letter": "D",
      "value": 12
    }
  },

  "allergens": {
    "confirmed": ["lait"],
    "possible_traces": ["celeri", "moutarde", "gluten", "soja", "sulfites"],
    "warnings": ["Contient noix de coco"]
  },

  "difficulty": {
    "toques": 2,
    "level": "Moyen",
    "explanation": "1h de préparation, 6 étapes, équipement Thermomix"
  },

  "improvements": [
    "Remplacer beurre par huile d'olive → D → C",
    "Ajouter 200g légumes verts → +2 points fibres",
    "Lait de coco allégé → réduire graisses saturées"
  ]
}
```

---

## Analyse n8n : Généralisation des workflows

> **Auteur:** Équipe n8n
> **Date:** 2026-01-22

### Vue d'ensemble

L'analyse des workflows proposés révèle que plusieurs peuvent être **généralisés** pour être réutilisés par d'autres plugins (torah, futurs plugins).

### Classification : Générique vs Spécifique

| Workflow proposé | Générique ? | Pattern abstrait | Réutilisation |
|------------------|-------------|------------------|---------------|
| `document-structure-extract` | ✅ 100% | Text + Schema → JSON | Recettes, factures, CV, contrats, textes talmudiques |
| `allergen-detect` | ✅ 90% | Items + Ruleset → Catégories | Allergènes, tags, thèmes, classifications |
| `nutrition-calculate` | ⚠️ 50% | Items + DB → Enrichissement | Pattern générique, formule Nutri-Score spécifique |
| `difficulty-score` | ❌ Spécifique | - | Logique toques = métier cuisine |
| `recipe-improve` | ⚠️ 50% | Data + Goal → Suggestions LLM | Pattern générique, critères spécifiques |

### Proposition : 4 workflows génériques

#### 1. Document-Structure-Extractor (priorité haute)

**Pattern:** Extraction structurée via LLM avec schema flexible.

```
POST /webhook/document-structure-extract
{
  "text": "...",
  "schema": { ... },      // Défini par l'appelant
  "context": {
    "type": "recipe|invoice|cv|contract|menu|talmud_commentary",
    "language": "fr|en|he"
  }
}
```

**Cas d'usage multi-plugins:**
- **plugin-recipes:** Recettes OCR → JSON structuré
- **plugin-torah:** Commentaires talmudiques → structure (source, commentateur, références)
- **Futur:** Factures, CV, menus restaurant

#### 2. Category-Detect (remplace allergen-detect)

**Pattern:** Détection de catégories dans une liste d'items via ruleset.

```
POST /webhook/category-detect
{
  "items": ["beurre", "curry", "poulet"],
  "ruleset": "allergens_inco|cuisine_tags|torah_topics",
  "options": { "include_possible": true }
}
```

**Rulesets disponibles:**
| Ruleset | Usage | Source |
|---------|-------|--------|
| `allergens_inco` | 14 allergènes UE | JSON statique |
| `cuisine_tags` | Tags cuisine (asiatique, végétarien...) | LLM |
| `torah_topics` | Thèmes talmudiques | JSON statique |

#### 3. Data-Lookup-Enrich (généralise nutrition-calculate)

**Pattern:** Enrichir des items avec des données externes.

```
POST /webhook/data-lookup-enrich
{
  "items": [
    {"name": "poulet", "quantity": 650, "unit": "g"}
  ],
  "source": "ciqual|openfoodfacts|custom_api",
  "fields": ["energy_kcal", "protein_g"],
  "aggregate": { "method": "sum", "divide_by": 4 }
}
```

**Note:** Le calcul Nutri-Score reste un **post-processing spécifique** après l'enrichissement générique.

#### 4. Improvement-Suggest (généralise recipe-improve)

**Pattern:** Suggestions d'amélioration via LLM.

```
POST /webhook/improvement-suggest
{
  "data": { ... },
  "goal": "improve_nutri_score|reduce_complexity|enhance_clarity",
  "constraints": { "max_changes": 3 }
}
```

### Architecture générique proposée

```
┌─────────────────────────────────────────────────────────────────┐
│                 GENERIC DOCUMENT ENRICHMENT PIPELINE            │
└─────────────────────────────────────────────────────────────────┘

  Document (OCR/Text)
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  ÉTAPE 1: document-structure-extract                          │
│  ─────────────────────────────────────────────────────────────│
│  Input: text + schema (flexible)                              │
│  Output: JSON structuré                                       │
│  LLM: Claude (structured output)                              │
└──────────────────────────────────────────────────────────────┘
       │
       ├─────────────────┬─────────────────┬─────────────────┐
       ▼                 ▼                 ▼                 ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ data-lookup │  │ category-   │  │ improvement │  │ SPÉCIFIQUE  │
│ enrich      │  │ detect      │  │ suggest     │  │ (plugin)    │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
       │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼
  Données           Catégories       Suggestions      Calculs
  enrichies         détectées        LLM              métier
  (nutrition,       (allergènes,                      (Nutri-Score,
   prix...)          tags...)                          toques...)
```

### Répartition des responsabilités (mise à jour)

| Composant | Type | Responsabilité |
|-----------|------|----------------|
| `document-structure-extract` | **Générique** | n8n |
| `data-lookup-enrich` | **Générique** | n8n |
| `category-detect` | **Générique** | n8n |
| `improvement-suggest` | **Générique** | n8n |
| Calcul Nutri-Score | Spécifique | plugin-recipes (local) |
| Calcul difficulté toques | Spécifique | plugin-recipes (local) |
| Rulesets JSON (allergènes, tags) | Données | chatbot-core ou n8n |

### Avantages de cette approche

1. **Réutilisation** - Un workflow pour tous les plugins
2. **Maintenance** - Un seul endroit à mettre à jour
3. **Coûts** - Facturation unifiée via RFC-017
4. **Évolutivité** - Nouveaux schemas sans nouveau code

### Questions résolues

| Question RFC-018 | Réponse |
|------------------|---------|
| Document-Structure-Extract existe-t-il ? | Non, **à créer** (priorité haute) |
| Peut-il être générique ? | **Oui**, schema en paramètre |
| Quel LLM ? | **Claude** (meilleur pour structured output) |
| Allergen-detect local ou n8n ? | **n8n** via `category-detect` générique |

---

## Prochaines étapes

1. **Validation RFC** par les équipes n8n et chatbot-core
2. **Décision** sur répartition des responsabilités
3. **Implémentation** par ordre de priorité :
   - ~~Base allergènes JSON (rapide, local)~~ → Ruleset pour `category-detect`
   - Modèles de données (plugin-recipes)
   - **Workflows génériques n8n** (document-structure-extract en premier)
   - Webhooks spécifiques (Nutri-Score, toques)

---

## Réponse équipe API Torah

> **Auteur:** Équipe API Torah
> **Date:** 2026-01-22

### Verdict : Aucun nouveau développement requis

L'équipe API a analysé le RFC-018 et confirme que **tous les besoins sont déjà couverts** par l'implémentation RFC-016/RFC-017.

### Endpoints disponibles pour l'enrichissement

| Besoin RFC-018 | Endpoint existant | Status |
|----------------|-------------------|--------|
| Jobs async pour enrichissement | `POST /api/v2/jobs` | ✅ Prêt |
| Progress tracking (étapes enrichissement) | `PATCH /api/v2/jobs/{id}` + `progress` | ✅ Prêt |
| Credits/tokens tracking | `PATCH /api/v2/jobs/{id}` + `credits` | ✅ Prêt |
| Débit crédits après enrichissement | `POST /api/subscription/credits/{user}/debit` | ✅ Prêt |
| Refund si échec enrichissement | `POST /api/subscription/credits/{user}/refund` | ✅ Prêt |
| State transitions (pending→processing→completed) | Validation automatique | ✅ Prêt |
| Timestamps (completed_at, failed_at) | Auto-set par l'API | ✅ Prêt |

### Rulesets JSON : Hors scope API

**Décision :** Les rulesets (`allergens_inco`, `cuisine_tags`, etc.) ne passent **pas** par l'API Torah.

**Raisons :**
1. **Données statiques** — JSON qui ne change pas à chaque requête
2. **Pas de logique métier** — Simple lookup, pas de calcul côté API
3. **Latence inutile** — Appel API pour lire un fichier JSON = overhead évitable
4. **Responsabilité plugin/n8n** — Chaque composant embarque ses propres rulesets

**Recommandation :** Les rulesets restent dans :
- **n8n** pour le workflow `category-detect`
- **ou** fichier JSON embarqué dans le plugin pour calcul local

### Exemple d'intégration : Enrichissement recette

```
1. Plugin crée job enrichissement
   POST /api/v2/jobs
   { "job_type": "recipe_enrichment", "input": { "recipe_id": "..." } }

2. n8n démarre traitement
   PATCH /api/v2/jobs/{id}
   { "status": "processing" }

3. n8n met à jour progression (nutrition)
   PATCH /api/v2/jobs/{id}
   { "progress": { "current": 1, "total": 4, "percentage": 25, "step": "nutrition" } }

4. n8n met à jour progression (allergènes)
   PATCH /api/v2/jobs/{id}
   { "progress": { "current": 2, "total": 4, "percentage": 50, "step": "allergens" } }

5. n8n termine et débite crédits
   PATCH /api/v2/jobs/{id}
   { "status": "completed", "output": { "enriched_recipe": {...} } }

   POST /api/subscription/credits/{user}/debit
   { "amount": 15, "job_id": "...", "reason": "recipe_enrichment" }
```

### Documentation

Voir `docs/n8n/JOB-LIFECYCLE-CREDITS-API.md` pour les détails des payloads.

---

## Réponse équipe chatbot-core

> **Auteur:** Équipe chatbot-core
> **Date:** 2026-01-22

### Verdict : Aucun nouveau développement requis

L'équipe chatbot-core a analysé le RFC-018 et confirme que **l'infrastructure existante couvre tous les besoins**.

### Services disponibles (chatbot-core v0.6.57)

| Besoin RFC-018 | Service chatbot-core | Status |
|----------------|---------------------|--------|
| Création/gestion jobs enrichissement | `JobsAPIClient` | ✅ Prêt |
| Progress tracking (étapes enrichissement) | `JobsAPIClient.update_job()` | ✅ Prêt |
| Workflow conversationnel (intention → action) | `DocumentWorkflowService` | ✅ Prêt |
| Gestion crédits (get/debit/credit) | `CreditsClient` | ✅ Prêt |
| Polling avec annulation | `PollingService` + `cancel_job()` | ✅ Prêt |

### Répartition confirmée

| Composant | chatbot-core ? | Responsable |
|-----------|----------------|-------------|
| Workflows génériques (document-structure-extract, etc.) | ❌ Non | n8n |
| Calculs métier (Nutri-Score, toques) | ❌ Non | plugin-recipes |
| Rulesets JSON (allergènes, tags) | ❌ Non | n8n ou plugin |
| Infrastructure jobs/crédits | ✅ Déjà fait | chatbot-core |

### Documentation

Pour intégrer l'enrichissement dans un plugin, voir :
- `docs/guides/GUIDE-DOCUMENT-WORKFLOW.md` — Guide complet d'utilisation

### Exemple d'utilisation pour enrichissement

```python
from chatbot_core.services import (
    DocumentWorkflowService,
    DocumentWorkflowConfig,
)

# Le plugin utilise DocumentWorkflowService pour :
# 1. Analyser l'intention (enrichir une recette)
# 2. Proposer l'action avec estimation de coût
# 3. Exécuter après confirmation utilisateur
# 4. Gérer les crédits automatiquement

service = DocumentWorkflowService(
    DocumentWorkflowConfig(
        api_url="http://api.torah:3031",
        n8n_base_url="http://n8n:5678",
        project_id="plugin-recipes",
    )
)

# L'intention "enrichis cette recette" déclenchera
# les workflows n8n génériques (document-structure-extract, etc.)
intent = await service.analyze_intent(
    query="enrichis cette recette avec nutrition et allergènes",
    context={"recipe_id": "...", "recipe_data": {...}},
    user={"id": "123", "name": "User"},
)
```

---

# 📋 SYNTHÈSE FINALE

**Date:** 2026-01-22
**Status:** ✅ Validé par toutes les équipes

---

## 1. Travail par équipe

### 🟠 Équipe n8n

| Action | Priorité | Complexité | Status |
|--------|----------|------------|--------|
| Créer `document-structure-extract` | 🔴 Haute | Moyenne | 📋 À faire |
| Créer `category-detect` (générique) | 🔴 Haute | Faible | 📋 À faire |
| Créer `data-lookup-enrich` | 🟡 Moyenne | Moyenne | 📋 À faire |
| Créer `improvement-suggest` | 🟢 Basse | Moyenne | 📋 Backlog |
| Fournir ruleset `allergens_inco` JSON | 🔴 Haute | Faible | 📋 À faire |
| Intégrer CIQUAL/OpenFoodFacts | 🟡 Moyenne | Élevée | 📋 À planifier |

**Livrables n8n :**
- 4 workflows génériques réutilisables
- Ruleset JSON des 14 allergènes INCO
- Documentation des payloads

---

### 🔵 Équipe API Torah

| Action | Priorité | Status |
|--------|----------|--------|
| Aucun nouveau développement | - | ✅ Déjà couvert |

**Infrastructure existante utilisée :**
- `POST /api/v2/jobs` — Création jobs enrichissement
- `PATCH /api/v2/jobs/{id}` — Progress tracking
- `POST /api/subscription/credits/{user}/debit` — Facturation
- `POST /api/subscription/credits/{user}/refund` — Remboursement

---

### 🟢 Équipe chatbot-core

| Action | Priorité | Status |
|--------|----------|--------|
| Aucun nouveau développement | - | ✅ Déjà couvert |

**Services existants utilisés :**
- `JobsAPIClient` — Gestion jobs
- `CreditsClient` — Gestion crédits
- `DocumentWorkflowService` — Orchestration
- `PollingService` — Suivi progression

---

### 🟣 Équipe plugin-recipes

| Action | Priorité | Complexité | Status |
|--------|----------|------------|--------|
| Ajouter modèles `NutriScore`, `AllergenInfo`, `DifficultyScore` | 🔴 Haute | Faible | 📋 À faire |
| Implémenter calcul Nutri-Score (local) | 🟡 Moyenne | Moyenne | 📋 À faire |
| Implémenter calcul difficulté/toques (local) | 🟡 Moyenne | Faible | 📋 À faire |
| Intégrer enrichissement dans OCR flow | 🟡 Moyenne | Moyenne | 📋 À faire |
| Créer UI Discord pour affichage enrichi | 🟡 Moyenne | Moyenne | 📋 À faire |
| Supprimer parsing regex local (remplacé par LLM) | 🟢 Basse | Faible | 📋 Après n8n |

**Livrables plugin-recipes :**
- Modèles de données enrichis
- Calculs métier locaux (Nutri-Score, toques)
- Intégration avec workflows n8n génériques
- Affichage Discord des données enrichies

---

## 2. Points d'entente ✅

| Sujet | Décision | Consensus |
|-------|----------|-----------|
| **Extraction LLM** | `document-structure-extract` générique avec schema en paramètre | ✅ Toutes équipes |
| **LLM utilisé** | Claude (meilleur pour structured output) | ✅ n8n |
| **Allergènes** | Via `category-detect` générique + ruleset JSON | ✅ n8n + plugin |
| **Calculs métier** | Locaux dans plugin (Nutri-Score, toques) | ✅ Toutes équipes |
| **Rulesets JSON** | Embarqués dans n8n ou plugin (pas API) | ✅ API + n8n |
| **Jobs/Crédits** | Infrastructure existante RFC-016/017 | ✅ Toutes équipes |
| **Pas de nouveau dev** | API Torah et chatbot-core déjà prêts | ✅ API + core |

---

## 3. Points d'attention ⚠️

| Point | Risque | Mitigation |
|-------|--------|------------|
| **Coût LLM** | Extraction LLM = ~0.01-0.05€/recette | Facturer via crédits (RFC-017) |
| **Latence** | 4 appels séquentiels = 5-10s | Paralléliser où possible |
| **Qualité CIQUAL** | Ingrédients non trouvés | Fallback OpenFoodFacts + estimation |
| **Hallucination LLM** | JSON mal formé ou données inventées | Validation schema + confidence score |
| **Mise à jour allergènes** | Règlement INCO peut évoluer | Ruleset JSON versionné |
| **Parsing regex actuel** | Code legacy à maintenir temporairement | Supprimer après validation LLM |

---

## 4. Points en suspens ❓

| # | Question | Équipe concernée | Décision attendue |
|---|----------|------------------|-------------------|
| 1 | **Enrichissement auto ou à la demande ?** | plugin-recipes | Option A (auto après OCR) ou Option B (bouton) ? |
| 2 | **Coût crédits par enrichissement ?** | Product Owner | Combien facturer ? (suggestion: 5-10 crédits) |
| 3 | **Affichage Discord** | plugin-recipes | Un embed ou plusieurs onglets ? |
| 4 | **Source nutrition prioritaire** | n8n | CIQUAL (officiel) ou OpenFoodFacts (plus complet) ? |
| 5 | **Stockage ruleset allergènes** | n8n | Dans le workflow ou fichier externe ? |

---

## 5. Ordre d'implémentation recommandé

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1 : Fondations (1-2 semaines)                            │
│  ───────────────────────────────────────────────────────────────│
│  1. [n8n] Créer document-structure-extract                      │
│  2. [n8n] Créer category-detect + ruleset allergens_inco        │
│  3. [plugin] Ajouter modèles NutriScore, AllergenInfo           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2 : Enrichissement nutrition (2-3 semaines)              │
│  ───────────────────────────────────────────────────────────────│
│  1. [n8n] Créer data-lookup-enrich + intégration CIQUAL         │
│  2. [plugin] Implémenter calcul Nutri-Score local               │
│  3. [plugin] Intégrer dans flow OCR                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3 : Finalisation (1-2 semaines)                          │
│  ───────────────────────────────────────────────────────────────│
│  1. [plugin] Implémenter calcul difficulté/toques               │
│  2. [plugin] Créer UI Discord enrichie                          │
│  3. [n8n] Créer improvement-suggest (optionnel)                 │
│  4. [plugin] Supprimer parsing regex legacy                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Métriques de succès

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Recettes enrichies | 100% des OCR | Logs plugin |
| Précision Nutri-Score | >90% vs calcul manuel | Tests unitaires |
| Allergènes détectés | 100% INCO confirmés | Tests unitaires |
| Temps enrichissement | <10s total | Monitoring |
| Satisfaction utilisateur | >4/5 | Feedback Discord |

---

## Voir aussi

- **RFC-016**: Document Processing Architecture
- **RFC-017**: Job Lifecycle & Credits
- **Règlement INCO (UE) n°1169/2011**: Allergènes obligatoires
- **Nutri-Score officiel**: https://www.santepubliquefrance.fr/nutri-score
