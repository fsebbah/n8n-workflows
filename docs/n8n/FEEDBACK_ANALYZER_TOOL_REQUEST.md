# Demande d'outil d'analyse de feedback pour n8n

**Date**: 2025-12-18
**Issue liée**: #422 - Feedback utilisateur
**Auteur**: Équipe MCP Server

## Contexte

Le backend va implémenter un système de feedback sur les réponses du MCP Server.
Pour ajuster le comportement du LLM en fonction des feedbacks, nous avons besoin d'analyser les commentaires utilisateurs.

**Exemple de feedback:**
```json
{
  "message_id": "uuid",
  "feedback": "negative",
  "comment": "Le message ne correspond pas à ma demande."
}
```

**Problème:** Un simple matching par mots-clés ne suffit pas pour comprendre des commentaires comme:

- "Le message ne correspond pas à ma demande"
- "Tu n'as pas compris ce que je voulais"
- "C'était parfait mais un peu lent"

## Outil demandé: Feedback Analyzer

### Webhook

`POST /webhook/analyze-feedback`

### Input

```json
{
  "comment": "Le message ne correspond pas à ma demande.",
  "feedback_type": "negative",
  "language": "fr"
}
```

Note: La clé API OpenAI sera passée via les variables d'environnement du workflow n8n.

### Output

```json
{
  "success": true,
  "analysis": {
    "category": "accuracy",
    "issue": "Réponse hors sujet ou mauvaise compréhension de la demande",
    "detected_problems": ["misunderstanding", "off_topic"],
    "user_preference": {
      "key": "comprehension",
      "value": "confirm_understanding",
      "description": "Confirmer la compréhension avant d'agir"
    },
    "suggested_action": "Reformuler la demande utilisateur pour valider la compréhension",
    "confidence": 0.85
  },
  "meta": {
    "processing_time_ms": 180,
    "model": "gpt-4o-mini"
  }
}
```

### Catégories de feedback

| Catégorie | Description | Exemples de commentaires |
|-----------|-------------|--------------------------|
| `length` | Longueur de la réponse | "Trop long", "Trop court", "Résume" |
| `accuracy` | Pertinence/Compréhension | "Pas ce que j'ai demandé", "Hors sujet" |
| `tone` | Ton de la réponse | "Trop formel", "Plus professionnel" |
| `speed` | Rapidité | "Trop lent", "Plus vite" |
| `confirmation` | Demandes de confirmation | "Arrête de demander", "Fais-le directement" |
| `detail` | Niveau de détail | "Plus de détails", "Trop technique" |
| `format` | Format de réponse | "En liste", "Plus structuré" |
| `other` | Autre | Feedback non catégorisable |

### Problèmes détectables (`detected_problems`)

```
misunderstanding     - Mauvaise compréhension de la demande
off_topic           - Réponse hors sujet
too_verbose         - Trop verbeux
too_brief           - Trop bref
wrong_tone          - Ton inapproprié
too_slow            - Temps de réponse trop long
too_many_questions  - Trop de demandes de confirmation
missing_info        - Information manquante
incorrect_info      - Information incorrecte
good_response       - Réponse satisfaisante (feedback positif)
```

### Préférences utilisateur (`user_preference`)

Structure pour stockage Redis:

```json
{
  "key": "response_length",
  "value": "short",
  "description": "Préfère des réponses courtes"
}
```

**Clés possibles:**

| Clé | Valeurs possibles |
|-----|-------------------|
| `response_length` | `short`, `medium`, `detailed` |
| `comprehension` | `confirm_understanding`, `act_directly` |
| `confirmation_level` | `always`, `sensitive_only`, `never` |
| `tone` | `formal`, `casual`, `neutral` |
| `detail_level` | `minimal`, `moderate`, `comprehensive` |
| `response_format` | `prose`, `bullet_points`, `structured` |

## Architecture suggérée

```
┌─────────────────────────────────────────────┐
│         n8n Workflow: analyze-feedback      │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│              OpenAI GPT-4o-mini             │
│                                             │
│  Prompt:                                    │
│  "Analyse ce feedback utilisateur...        │
│   Catégories: length, accuracy, tone...     │
│   Retourne un JSON structuré..."            │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│           Respond to Webhook                │
│         (JSON structuré)                    │
└─────────────────────────────────────────────┘
```

## Prompt suggéré pour OpenAI

```
Tu es un analyseur de feedback utilisateur. Analyse le commentaire suivant et retourne un JSON.

Feedback type: {feedback_type}
Commentaire: "{comment}"

Catégories possibles: length, accuracy, tone, speed, confirmation, detail, format, other

Retourne UNIQUEMENT un JSON valide avec cette structure:
{
  "category": "...",
  "issue": "description courte du problème identifié",
  "detected_problems": ["problem1", "problem2"],
  "user_preference": {
    "key": "clé de préférence",
    "value": "valeur",
    "description": "explication"
  },
  "suggested_action": "comment ajuster le comportement",
  "confidence": 0.0 à 1.0
}
```

## Cas d'utilisation MCP Server

```python
# 1. Réception du feedback
feedback = {
    "feedback": "negative",
    "comment": "Le message ne correspond pas à ma demande."
}

# 2. Appel au webhook n8n
analysis = await call_n8n_analyze_feedback(feedback["comment"], feedback["feedback"])

# 3. Stockage de la préférence dans Redis
await redis.hset(
    f"user_prefs:{user_id}",
    analysis["user_preference"]["key"],
    analysis["user_preference"]["value"]
)

# 4. Utilisation dans le prochain prompt
# Si preference.key == "comprehension" et value == "confirm_understanding":
# → Ajouter au prompt: "Reformule la demande pour confirmer ta compréhension avant d'agir."
```

## Exemples de traitement

### Exemple 1: Longueur

**Input:** `"Trop long, je voulais juste une réponse simple"`
```json
{
  "category": "length",
  "issue": "Réponse trop verbeuse",
  "detected_problems": ["too_verbose"],
  "user_preference": {"key": "response_length", "value": "short"},
  "suggested_action": "Raccourcir les réponses, aller droit au but",
  "confidence": 0.95
}
```

### Exemple 2: Compréhension

**Input:** `"Le message ne correspond pas à ma demande"`
```json
{
  "category": "accuracy",
  "issue": "Mauvaise compréhension de la demande initiale",
  "detected_problems": ["misunderstanding", "off_topic"],
  "user_preference": {"key": "comprehension", "value": "confirm_understanding"},
  "suggested_action": "Reformuler la demande pour valider la compréhension",
  "confidence": 0.88
}
```

### Exemple 3: Confirmation

**Input:** `"Arrête de me demander confirmation, fais-le !"`
```json
{
  "category": "confirmation",
  "issue": "Trop de demandes de confirmation",
  "detected_problems": ["too_many_questions"],
  "user_preference": {"key": "confirmation_level", "value": "never"},
  "suggested_action": "Exécuter les actions directement sans confirmation",
  "confidence": 0.92
}
```

### Exemple 4: Feedback positif

**Input:** `"Parfait, merci beaucoup !"`
```json
{
  "category": "other",
  "issue": null,
  "detected_problems": ["good_response"],
  "user_preference": null,
  "suggested_action": "Continuer avec le même style de réponse",
  "confidence": 0.98
}
```

## Priorité

**MOYENNE** - À implémenter après que le backend ait mis en place le système de feedback.

## Questions pour l'équipe n8n

1. Le modèle GPT-4o-mini est-il disponible dans votre configuration OpenAI ?
2. Faut-il prévoir un fallback si OpenAI est indisponible ?
3. Y a-t-il une préférence pour le format de réponse ?

## Ressources

- [OpenAI GPT-4o-mini](https://platform.openai.com/docs/models/gpt-4o-mini)
- Documentation existante: `docs/n8n/CONVERSATIONAL_ANALYSIS_TOOLS_REQUEST.md`
