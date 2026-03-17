# Webhook: llm-request-validator (RFC-044)

> Pré-validation des requêtes utilisateur et analyse de l'état émotionnel avant traitement

## Objectif

Ce webhook effectue **deux analyses en une seule passe** avant tout traitement :

### 1. Validation de la requête
- **Requêtes hors-scope** : demandes qui ne concernent pas le domaine (ex: "cours d'anglais")
- **Contradictions internes** : contraintes incompatibles (ex: "sans cuisson mais chaud")

### 2. Analyse de l'état utilisateur (User State Analysis)
- **Émotion** : stress, fatigue, motivation, frustration, plaisir
- **Urgence** : niveau de pression temporelle perçu
- **Contraintes** : temps, budget, ingrédients, équipement
- **Niveau** : débutant, intermédiaire, avancé
- **Ton préféré** : comment le bot devrait répondre (rassurant, direct, enthousiaste)

Cette analyse permet au bot d'**adapter sa réponse** au contexte émotionnel de l'utilisateur.

## Endpoint

```
POST {N8N_BASE_URL}/webhook/llm-request-validator
```

## Payload d'entrée

```json
{
  "user_request": "J'ai 15 minutes, je suis crevé, j'ai rien dans mon frigo",
  "domain": {
    "name": "cuisine",
    "description": "Tout ce qui concerne la préparation de nourriture : recettes, ingrédients, techniques culinaires, ustensiles de cuisine, régimes alimentaires, planification de repas, liste de courses",
    "bot_name": "Bot Appetit"
  }
}
```

## Payload de sortie attendu

```json
{
  "is_valid": true,
  "issue_type": null,
  "response": null,
  "user_state": {
    "emotions": ["fatigue", "stress"],
    "urgency": "high",
    "constraints": {
      "time": "short",
      "ingredients": "limited"
    },
    "user_level": "unknown",
    "tone_preference": "reassuring"
  }
}
```

### Champs de sortie

| Champ | Type | Description |
|-------|------|-------------|
| `is_valid` | boolean | `true` si la requête peut être traitée |
| `issue_type` | string \| null | `null`, `"out_of_scope"`, ou `"contradiction"` |
| `response` | string \| null | Message à afficher à l'utilisateur si invalide |
| `user_state` | object | Analyse de l'état émotionnel et contextuel de l'utilisateur |

### Structure de `user_state`

| Champ | Type | Valeurs possibles | Description |
|-------|------|-------------------|-------------|
| `emotions` | string[] | `stress`, `fatigue`, `frustration`, `motivation`, `curiosity`, `joy`, `neutral` | Émotions détectées dans la requête |
| `urgency` | string | `low`, `medium`, `high` | Niveau d'urgence perçu |
| `constraints` | object | Voir ci-dessous | Contraintes explicites ou implicites |
| `user_level` | string | `beginner`, `intermediate`, `advanced`, `unknown` | Niveau culinaire perçu |
| `tone_preference` | string | `reassuring`, `direct`, `enthusiastic`, `pedagogical`, `neutral` | Ton recommandé pour la réponse |

### Structure de `constraints`

| Champ | Type | Valeurs possibles |
|-------|------|-------------------|
| `time` | string \| null | `very_short` (<10min), `short` (10-30min), `medium` (30-60min), `long` (>1h), `null` |
| `budget` | string \| null | `low`, `medium`, `high`, `null` |
| `ingredients` | string \| null | `limited`, `specific`, `flexible`, `null` |
| `equipment` | string \| null | `minimal`, `standard`, `full`, `null` |
| `diet` | string \| null | `vegan`, `vegetarian`, `gluten_free`, `lactose_free`, `null` |
| `servings` | string \| null | `solo`, `couple`, `family`, `group`, `null` |

## Prompt système pour le LLM

```
Tu es un validateur de requêtes pour {{domain.bot_name}}.

DOMAINE : {{domain.name}}
{{domain.description}}

---

# PARTIE 1 : VALIDATION

## ÉTAPE 1 - PERTINENCE
La requête concerne-t-elle ce domaine ?
- Juge si la requête a un lien direct avec {{domain.name}}
- Ne liste PAS ce qui est hors scope, déduis-le du domaine défini

## ÉTAPE 2 - COHÉRENCE (uniquement si pertinent au domaine)
Les contraintes de la requête sont-elles compatibles entre elles ?

Exemples de contradictions en cuisine :
- "sans cuisson + chaud" → chauffer = cuire, contradiction
- "vegan + viande/poisson" → incompatible par définition
- "rapide + plusieurs heures" → contradictoire
- "sans gluten + pâtes de blé classiques" → le blé contient du gluten
- "sans sucre + très sucré" → contradiction

---

# PARTIE 2 : ANALYSE DE L'ÉTAT UTILISATEUR

Analyse le message pour comprendre l'état émotionnel et contextuel de l'utilisateur.

## Émotions à détecter
- stress : pression, anxiété ("je dois", "il faut que", "j'ai pas le temps")
- fatigue : épuisement ("crevé", "fatigué", "pas envie", "flemme")
- frustration : agacement ("j'en ai marre", "rien ne marche", "encore")
- motivation : enthousiasme ("j'ai envie de", "je veux essayer", "ça me tente")
- curiosity : découverte ("c'est quoi", "comment on fait", "je me demande")
- joy : plaisir ("j'adore", "génial", "super")
- neutral : pas d'émotion particulière détectée

## Urgence
- high : contrainte temps explicite courte (<30min) ou mots d'urgence ("vite", "urgent", "tout de suite")
- medium : contrainte temps modérée ou implicite
- low : pas de pression temporelle

## Contraintes à extraire
- time : durée mentionnée ou implicite
- budget : contrainte financière ("pas cher", "économique")
- ingredients : "j'ai que", "rien dans mon frigo", "avec ce que j'ai"
- equipment : "sans four", "juste une poêle", "micro-ondes"
- diet : restrictions alimentaires mentionnées
- servings : nombre de personnes ("pour moi", "pour 4", "pour une fête")

## Niveau utilisateur
- beginner : "je suis nul", "je ne sais pas cuisiner", "c'est dur"
- intermediate : pas d'indication particulière, requêtes standard
- advanced : termes techniques, recettes complexes
- unknown : impossible à déterminer

## Ton recommandé
- reassuring : si stress, fatigue ou frustration → rassurer, simplifier
- direct : si urgence high → aller droit au but
- enthusiastic : si motivation ou joy → partager l'enthousiasme
- pedagogical : si curiosity ou beginner → expliquer
- neutral : si aucune émotion forte

---

# RÉPONSE

Réponds UNIQUEMENT en JSON valide, sans texte autour :

{
  "is_valid": true ou false,
  "issue_type": null ou "out_of_scope" ou "contradiction",
  "response": "message orienté solution si invalide, sinon null",
  "user_state": {
    "emotions": ["liste", "des", "emotions"],
    "urgency": "low" ou "medium" ou "high",
    "constraints": {
      "time": "valeur ou null",
      "budget": "valeur ou null",
      "ingredients": "valeur ou null",
      "equipment": "valeur ou null",
      "diet": "valeur ou null",
      "servings": "valeur ou null"
    },
    "user_level": "beginner" ou "intermediate" ou "advanced" ou "unknown",
    "tone_preference": "reassuring" ou "direct" ou "enthusiastic" ou "pedagogical" ou "neutral"
  }
}

IMPORTANT pour la réponse si invalide :
- Sois poli et bienveillant
- Explique brièvement le problème
- Propose des alternatives concrètes
- Pose une question pour guider l'utilisateur
```

## Exemples de comportement

### Requête valide simple
```json
// Input
{"user_request": "recette de pâtes carbonara", "domain": {...}}

// Output
{
  "is_valid": true,
  "issue_type": null,
  "response": null,
  "user_state": {
    "emotions": ["neutral"],
    "urgency": "low",
    "constraints": {
      "time": null,
      "budget": null,
      "ingredients": null,
      "equipment": null,
      "diet": null,
      "servings": null
    },
    "user_level": "unknown",
    "tone_preference": "neutral"
  }
}
```

### Utilisateur stressé et fatigué
```json
// Input
{"user_request": "J'ai 15 minutes, je suis crevé, j'ai rien dans mon frigo", "domain": {...}}

// Output
{
  "is_valid": true,
  "issue_type": null,
  "response": null,
  "user_state": {
    "emotions": ["fatigue", "stress"],
    "urgency": "high",
    "constraints": {
      "time": "very_short",
      "budget": null,
      "ingredients": "limited",
      "equipment": null,
      "diet": null,
      "servings": "solo"
    },
    "user_level": "unknown",
    "tone_preference": "reassuring"
  }
}
```

### Débutant curieux
```json
// Input
{"user_request": "Je suis nul en cuisine, c'est quoi la différence entre mijoter et braiser ?", "domain": {...}}

// Output
{
  "is_valid": true,
  "issue_type": null,
  "response": null,
  "user_state": {
    "emotions": ["curiosity"],
    "urgency": "low",
    "constraints": {
      "time": null,
      "budget": null,
      "ingredients": null,
      "equipment": null,
      "diet": null,
      "servings": null
    },
    "user_level": "beginner",
    "tone_preference": "pedagogical"
  }
}
```

### Utilisateur motivé
```json
// Input
{"user_request": "J'ai envie de me faire plaisir ce soir, un bon petit plat pour 2 !", "domain": {...}}

// Output
{
  "is_valid": true,
  "issue_type": null,
  "response": null,
  "user_state": {
    "emotions": ["motivation", "joy"],
    "urgency": "low",
    "constraints": {
      "time": null,
      "budget": null,
      "ingredients": null,
      "equipment": null,
      "diet": null,
      "servings": "couple"
    },
    "user_level": "unknown",
    "tone_preference": "enthusiastic"
  }
}
```

### Contradiction détectée
```json
// Input
{"user_request": "recette vegan avec du poulet", "domain": {...}}

// Output
{
  "is_valid": false,
  "issue_type": "contradiction",
  "response": "Une recette vegan exclut tous les produits animaux, y compris le poulet. Tu préfères :\n• Une recette **vegan** avec du tofu ou du seitan (texture similaire)\n• Une recette **au poulet** classique",
  "user_state": {
    "emotions": ["neutral"],
    "urgency": "low",
    "constraints": {
      "time": null,
      "budget": null,
      "ingredients": null,
      "equipment": null,
      "diet": "vegan",
      "servings": null
    },
    "user_level": "unknown",
    "tone_preference": "neutral"
  }
}
```

### Hors-scope
```json
// Input
{"user_request": "donne-moi un cours d'anglais", "domain": {...}}

// Output
{
  "is_valid": false,
  "issue_type": "out_of_scope",
  "response": "Je suis Bot Appetit, spécialisé en cuisine ! Je ne peux pas t'aider pour les cours d'anglais. Par contre, si tu as une question culinaire, je suis là !",
  "user_state": {
    "emotions": ["neutral"],
    "urgency": "low",
    "constraints": {
      "time": null,
      "budget": null,
      "ingredients": null,
      "equipment": null,
      "diet": null,
      "servings": null
    },
    "user_level": "unknown",
    "tone_preference": "neutral"
  }
}
```

### Cas ambigu (valide)
```json
// Input
{"user_request": "dessert salé", "domain": {...}}

// Output
{
  "is_valid": true,
  "issue_type": null,
  "response": null,
  "user_state": {
    "emotions": ["curiosity"],
    "urgency": "low",
    "constraints": {
      "time": null,
      "budget": null,
      "ingredients": null,
      "equipment": null,
      "diet": null,
      "servings": null
    },
    "user_level": "intermediate",
    "tone_preference": "enthusiastic"
  }
}
// Note: les desserts salés existent (ex: cheesecake au chèvre) → curiosité culinaire
```

## Workflow n8n suggéré

```
[Webhook Trigger]
    → [Set Variables] (extraire user_request, domain)
    → [LLM Node] (Claude Haiku ou GPT-4o-mini - rapide et économique)
    → [Parse JSON]
    → [Respond to Webhook]
```

### Configuration LLM Node

- **Model** : `claude-3-haiku-20240307` ou `gpt-4o-mini` (rapide, économique)
- **System Prompt** : Le prompt ci-dessus
- **User Message** : `Requête à valider : "{{$json.user_request}}"`
- **Temperature** : 0 (déterministe)

## Configuration côté plugin

```bash
# .env.local
WEBHOOK_PRE_VALIDATION=llm-request-validator
```

Si vide ou non défini, la pré-validation est désactivée.

## Utilisation de `user_state` par le plugin

Le plugin transmet `user_state` à azy-mcp pour adapter la réponse :

```python
# Exemple d'utilisation dans le plugin
validation = await self._validate_request(message)

if not validation["is_valid"]:
    return validation["response"]

# Passer user_state à azy-mcp pour adapter le ton
user_state = validation.get("user_state", {})
result = await azy_mcp.process(
    message=message,
    user_state=user_state  # azy-mcp adapte sa réponse
)
```

### Adaptation de la réponse selon `user_state`

| Ton recommandé | Comportement du bot |
|----------------|---------------------|
| `reassuring` | Phrases courtes, recettes ultra-simples, encouragements ("c'est facile", "tu vas voir") |
| `direct` | Va droit au but, pas de blabla, liste d'étapes concise |
| `enthusiastic` | Partage l'enthousiasme, suggestions créatives, emojis autorisés |
| `pedagogical` | Explications détaillées, définitions, conseils pour débutants |
| `neutral` | Réponse standard, équilibrée |

## Comportement en cas d'erreur

Si le webhook :
- **Timeout** (>10s) → La requête est acceptée avec `user_state` par défaut (fail-open)
- **Erreur HTTP** → La requête est acceptée avec `user_state` par défaut (fail-open)
- **JSON invalide** → La requête est acceptée avec `user_state` par défaut (fail-open)

### `user_state` par défaut (fallback)

```json
{
  "emotions": ["neutral"],
  "urgency": "low",
  "constraints": {},
  "user_level": "unknown",
  "tone_preference": "neutral"
}
```

Cela évite de bloquer les utilisateurs si le webhook a un problème, tout en gardant un comportement cohérent.
