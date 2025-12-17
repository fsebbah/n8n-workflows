# Demande d'outils d'analyse conversationnelle pour n8n

**Date**: 2025-12-17
**Issue liée**: #422 - LangGraph Checkpointing
**Auteur**: Équipe MCP Server

## Contexte

Lorsqu'un utilisateur envoie un message **sans contexte expert**, le MCP Server doit analyser le message pour :

1. Comprendre l'intention de l'utilisateur
2. Adapter le ton de la réponse
3. Extraire les entités mentionnées
4. Prioriser les actions

Actuellement, ces analyses sont faites uniquement par le LLM, ce qui peut être :

- Lent (appel LLM complet)
- Coûteux (tokens)
- Incohérent (pas de structure)

## Outils demandés

### 1. Sentiment Analyzer (Priorité: HAUTE)

**Objectif**: Détecter l'état émotionnel de l'utilisateur

**Input**:
```json
{
  "text": "Je suis frustré, ça fait 3 fois que je demande !",
  "language": "fr"
}
```

**Output**:
```json
{
  "sentiment": "negative",
  "score": -0.8,
  "emotions": {
    "frustration": 0.9,
    "anger": 0.3,
    "sadness": 0.1
  },
  "confidence": 0.92
}
```

**Cas d'usage**:

- Adapter le ton de la réponse (empathie si frustré)
- Prioriser les demandes urgentes
- Alerter si escalade nécessaire

**Outils externes existants**:

| Service | Avantages | Inconvénients |
|---------|-----------|---------------|
| AWS Comprehend | Multilingue, fiable | Coût par requête |
| Google Cloud NLP | Très précis | Coût |
| Azure Text Analytics | Multilingue | Coût |
| Hugging Face (cardiffnlp/twitter-roberta-base-sentiment) | Gratuit, auto-hébergeable | Moins précis |
| spaCy + TextBlob | Gratuit, local | Anglais principalement |

---

### 2. Intent Classifier (Priorité: HAUTE)

**Objectif**: Classifier l'intention de l'utilisateur

**Input**:
```json
{
  "text": "Envoie un email à Guy pour confirmer le RDV",
  "language": "fr"
}
```

**Output**:
```json
{
  "intent": "action_request",
  "sub_intent": "send_email",
  "confidence": 0.95,
  "requires_confirmation": true,
  "detected_actions": ["send_email", "schedule_meeting"]
}
```

**Intents suggérés**:

| Intent | Description | Exemple |
|--------|-------------|---------|
| `action_request` | Demande d'exécution | "Envoie un email" |
| `question` | Demande d'information | "Quel est mon prochain RDV ?" |
| `feedback` | Retour utilisateur | "Merci, c'était parfait" |
| `complaint` | Plainte/problème | "Ça ne marche pas" |
| `clarification` | Réponse à une question | "Son email est <guy@test.com>" |
| `greeting` | Salutation | "Bonjour" |
| `cancel` | Annulation | "Non, laisse tomber" |

**Outils externes existants**:

| Service | Avantages | Inconvénients |
|---------|-----------|---------------|
| Dialogflow (Google) | Très puissant, NLU complet | Complexe à configurer |
| Amazon Lex | Intégration AWS | Coût |
| Rasa NLU | Open source, auto-hébergeable | Nécessite entraînement |
| Wit.ai (Meta) | Gratuit, facile | Moins précis |
| Hugging Face Zero-Shot | Flexible, gratuit | Performance variable |

---

### 3. Entity Extractor (Priorité: MOYENNE)

**Note**: Un outil `entity_extractor_tool` existe déjà dans le MCP Server, mais une version n8n centralisée serait utile.

**Objectif**: Extraire les entités nommées du message

**Input**:
```json
{
  "text": "Envoie un email à Guy Martin demain à 14h au café de la Paix",
  "language": "fr"
}
```

**Output**:
```json
{
  "entities": [
    {"type": "PERSON", "value": "Guy Martin", "start": 19, "end": 29},
    {"type": "DATE", "value": "demain", "normalized": "2025-12-18", "start": 30, "end": 36},
    {"type": "TIME", "value": "14h", "normalized": "14:00", "start": 39, "end": 42},
    {"type": "LOCATION", "value": "café de la Paix", "start": 46, "end": 61}
  ]
}
```

**Types d'entités suggérés**:

- `PERSON` - Noms de personnes
- `EMAIL` - Adresses email
- `PHONE` - Numéros de téléphone
- `DATE` - Dates (avec normalisation)
- `TIME` - Heures (avec normalisation)
- `LOCATION` - Lieux
- `ORGANIZATION` - Entreprises
- `MONEY` - Montants

**Outils externes existants**:

| Service | Avantages | Inconvénients |
|---------|-----------|---------------|
| spaCy | Gratuit, rapide, multilingue | Installation locale |
| AWS Comprehend | API simple | Coût |
| Google Cloud NLP | Très précis | Coût |
| Duckling (Meta) | Excellent pour dates/heures | Limité aux types temporels |
| dateparser (Python) | Excellent pour dates | Dates uniquement |

---

### 4. Priority/Urgency Scorer (Priorité: BASSE)

**Objectif**: Évaluer l'urgence d'un message

**Input**:
```json
{
  "text": "URGENT ! Il faut envoyer ce document maintenant !",
  "language": "fr"
}
```

**Output**:
```json
{
  "priority": "critical",
  "score": 0.95,
  "indicators": ["URGENT", "maintenant"],
  "suggested_deadline": "immediate"
}
```

**Niveaux de priorité**:

| Niveau | Score | Indicateurs |
|--------|-------|-------------|
| `critical` | 0.9-1.0 | URGENT, maintenant, immédiatement |
| `high` | 0.7-0.9 | aujourd'hui, dès que possible |
| `medium` | 0.4-0.7 | cette semaine, bientôt |
| `low` | 0.0-0.4 | quand tu peux, à l'occasion |

---

### 5. Language Detector (Priorité: BASSE)

**Note**: Un outil `language_detector_tool` existe déjà, mais une version n8n serait utile pour la cohérence.

**Objectif**: Détecter la langue du message

**Input**:
```json
{
  "text": "Can you send an email to John?"
}
```

**Output**:
```json
{
  "language": "en",
  "confidence": 0.98,
  "alternatives": [
    {"language": "de", "confidence": 0.01}
  ]
}
```

---

## Architecture d'intégration proposée

```
Message entrant
      │
      ▼
┌─────────────────────────────────────┐
│     n8n Webhook: analyze-message    │
│  (appelle plusieurs sous-workflows) │
└─────────────────────────────────────┘
      │
      ├──► Sentiment Analyzer ──┐
      ├──► Intent Classifier ───┤
      ├──► Entity Extractor ────┼──► Résultat agrégé
      ├──► Priority Scorer ─────┤
      └──► Language Detector ───┘
      │
      ▼
┌─────────────────────────────────────┐
│  Réponse JSON enrichie pour MCP    │
└─────────────────────────────────────┘
```

**Webhook unifié suggéré**: `POST /webhook/analyze-message`

**Input**:
```json
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

**Output**:
```json
{
  "text": "Je suis frustré, envoie vite un email à Guy !",
  "analysis": {
    "sentiment": {
      "sentiment": "negative",
      "score": -0.6,
      "emotions": {"frustration": 0.8}
    },
    "intent": {
      "intent": "action_request",
      "sub_intent": "send_email",
      "confidence": 0.9
    },
    "entities": [
      {"type": "PERSON", "value": "Guy"}
    ],
    "priority": {
      "priority": "high",
      "score": 0.75
    },
    "language": {
      "language": "fr",
      "confidence": 0.99
    }
  },
  "processing_time_ms": 45
}
```

---

## Recommandations d'implémentation

### Option A: Services externes (rapide, coûteux)

- Utiliser AWS Comprehend ou Google Cloud NLP
- Avantage: Déploiement rapide, haute précision
- Inconvénient: Coût par requête, dépendance externe

### Option B: Modèles Hugging Face (équilibré)

- Déployer des modèles légers sur le serveur n8n
- Modèles suggérés:
  - Sentiment: `nlptown/bert-base-multilingual-uncased-sentiment`
  - Intent: `facebook/bart-large-mnli` (zero-shot)
  - NER: `Jean-Baptiste/camembert-ner` (français)
- Avantage: Gratuit, contrôle total
- Inconvénient: Ressources serveur, maintenance

### Option C: LLM léger dédié (flexible)

- Utiliser un modèle comme Mistral 7B ou Llama 3 8B
- Prompt structuré pour extraction JSON
- Avantage: Très flexible, un seul modèle
- Inconvénient: Plus lent, moins structuré

### Recommandation finale

**Option B** avec fallback vers **Option A** pour les cas critiques.

---

## Priorisation

| Outil | Priorité | Impact | Effort estimé |
|-------|----------|--------|---------------|
| Intent Classifier | HAUTE | Permet de router correctement | Moyen |
| Sentiment Analyzer | HAUTE | Améliore l'UX | Faible |
| Entity Extractor | MOYENNE | Existe déjà partiellement | Faible |
| Priority Scorer | BASSE | Nice-to-have | Faible |
| Language Detector | BASSE | Existe déjà | Très faible |

---

## Questions pour l'équipe n8n

1. Avez-vous déjà des workflows d'analyse NLP existants ?
2. Quel provider cloud est préféré (AWS/GCP/Azure) ?
3. Y a-t-il des contraintes de latence (<100ms) ?
4. Le déploiement de modèles Hugging Face est-il envisageable ?
5. Faut-il supporter d'autres langues que FR/EN ?

---

## Ressources

- [AWS Comprehend](https://aws.amazon.com/comprehend/)
- [Google Cloud Natural Language](https://cloud.google.com/natural-language)
- [Hugging Face Models](https://huggingface.co/models)
- [spaCy](https://spacy.io/)
- [Rasa NLU](https://rasa.com/docs/rasa/nlu-training-data/)
