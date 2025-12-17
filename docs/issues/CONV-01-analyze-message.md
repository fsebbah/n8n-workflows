# CONV-01: analyze_message_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | CONV-01 |
| **Nom** | analyze_message_tool |
| **Priorité** | HAUTE |
| **Statut** | Implémenté |
| **Catégorie** | Conversational Analysis |

## Description

Outil unifié d'analyse conversationnelle. Combine Google Cloud NLP et OpenAI GPT-4o-mini en appels parallèles pour analyser un message utilisateur et extraire :

- **Sentiment** (Google Cloud NLP) - état émotionnel
- **Entities** (Google Cloud NLP) - entités nommées
- **Intent** (OpenAI) - intention utilisateur
- **Priority** (OpenAI) - niveau d'urgence
- **Language** (OpenAI) - langue détectée

## Architecture

```
POST /webhook/analyze-message
         │
         ├──► Google Cloud NLP ──┐  ~50ms
         │    ├── analyzeSentiment
         │    └── analyzeEntities
         │                       │
         └──► OpenAI GPT-4o-mini ├──► Merge ──► Résultat
              ├── intent         │  ~200ms
              ├── priority       │
              └── language ──────┘

Latence totale = max(50ms, 200ms) = ~200ms
```

## Endpoint

```
POST /webhook/analyze-message
Content-Type: application/json

{
  "text": "Je suis frustré, envoie vite un email à Guy !",
  "options": {
    "sentiment": true,
    "intent": true,
    "entities": true,
    "priority": true,
    "language": true
  }
}
```

## Response

```json
{
  "success": true,
  "text": "Je suis frustré, envoie vite un email à Guy !",
  "analysis": {
    "sentiment": {
      "sentiment": "negative",
      "score": -0.6,
      "magnitude": 0.8,
      "confidence": 0.9
    },
    "intent": {
      "intent": "action_request",
      "sub_intent": "send_email",
      "confidence": 0.95,
      "requires_confirmation": true
    },
    "entities": [
      {"type": "PERSON", "value": "Guy", "salience": 0.8}
    ],
    "priority": {
      "priority": "high",
      "score": 0.75,
      "indicators": ["vite", "frustré"]
    },
    "language": {
      "language": "fr",
      "confidence": 0.99
    }
  },
  "meta": {
    "providers": {
      "sentiment": "google-cloud-nlp",
      "entities": "google-cloud-nlp",
      "intent": "openai-gpt4o-mini",
      "priority": "openai-gpt4o-mini",
      "language": "openai-gpt4o-mini"
    },
    "processing_time_ms": 205
  }
}
```

## Providers

| Analyse | Provider | Latence | Coût |
|---------|----------|---------|------|
| Sentiment | Google Cloud NLP | ~50ms | Gratuit < 5k/mois |
| Entities | Google Cloud NLP | ~50ms | Gratuit < 5k/mois |
| Intent | OpenAI GPT-4o-mini | ~200ms | ~$0.15/1k req |
| Priority | OpenAI GPT-4o-mini | ~200ms | (inclus) |
| Language | OpenAI GPT-4o-mini | ~200ms | (inclus) |

## Intent Types

| Intent | Description | Exemple |
|--------|-------------|---------|
| `action_request` | Demande d'exécution | "Envoie un email" |
| `question` | Demande d'information | "Quel est mon prochain RDV ?" |
| `feedback` | Retour utilisateur | "Merci, c'était parfait" |
| `complaint` | Plainte/problème | "Ça ne marche pas" |
| `clarification` | Réponse à une question | "Son email est guy@test.com" |
| `greeting` | Salutation | "Bonjour" |
| `cancel` | Annulation | "Non, laisse tomber" |

## Priority Levels

| Niveau | Score | Indicateurs |
|--------|-------|-------------|
| `critical` | 0.9-1.0 | URGENT, maintenant, immédiatement |
| `high` | 0.7-0.9 | aujourd'hui, vite, dès que possible |
| `medium` | 0.4-0.7 | cette semaine, bientôt |
| `low` | 0.0-0.4 | quand tu peux, à l'occasion |

## Dépendances

### Requis
- **Google Cloud NLP API**
  - Credentials OAuth2 configurés dans n8n
  - API Natural Language activée
- **OpenAI API**
  - `OPENAI_API_KEY`

### Configuration n8n
1. Créer credentials "Google Cloud NLP" (OAuth2)
2. Créer credentials "OpenAI API"
3. Activer le workflow

## Tarification estimée

| Volume | Google NLP | OpenAI | Total |
|--------|------------|--------|-------|
| 1,000/mois | $0 (gratuit) | ~$0.15 | ~$0.15 |
| 5,000/mois | $0 (gratuit) | ~$0.75 | ~$0.75 |
| 10,000/mois | ~$10 | ~$1.50 | ~$11.50 |
| 50,000/mois | ~$90 | ~$7.50 | ~$97.50 |

## Definition of Done

- [x] Endpoint `POST /webhook/analyze-message`
- [x] Appels parallèles Google NLP + OpenAI
- [x] Sentiment analysis (Google)
- [x] Entity extraction (Google)
- [x] Intent classification (OpenAI)
- [x] Priority scoring (OpenAI)
- [x] Language detection (OpenAI)
- [x] Options pour activer/désactiver chaque analyse
- [x] Fallback gracieux si un provider échoue
- [ ] Tests: message FR, message EN, message urgent

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Message positif | "Merci beaucoup !" | sentiment: positive |
| Message négatif | "Je suis frustré" | sentiment: negative |
| Action request | "Envoie un email" | intent: action_request |
| Question | "Quel est le statut ?" | intent: question |
| Urgent | "URGENT !" | priority: critical |
| Entités | "RDV avec Guy demain" | entities: PERSON, DATE |

## Références

- [CONVERSATIONAL_ANALYSIS_TOOLS_REQUEST.md](../n8n/CONVERSATIONAL_ANALYSIS_TOOLS_REQUEST.md)
- [Google Cloud NLP API](https://cloud.google.com/natural-language/docs)
- [OpenAI Chat API](https://platform.openai.com/docs/api-reference/chat)
