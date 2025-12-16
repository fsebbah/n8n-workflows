# DOC-09: entity_extractor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | DOC-09 (Tool #9) |
| **Nom** | entity_extractor_tool |
| **Priorité** | Moyenne |
| **Statut** | A implémenter |
| **Catégorie** | Documents / NLP |

## Description

Workflow n8n pour l'extraction d'entités nommées (NER) depuis du texte. Utilise OpenAI GPT-4o pour une extraction flexible avec support de types d'entités personnalisés.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| NER principal | **OpenAI GPT-4o** | Flexible, multilingue, types custom |
| Alternative | **Anthropic Claude** | Qualité comparable |
| Fallback local | **spaCy** (si déployé) | Open source, rapide |

## Endpoint

```
POST /webhook/entity-extractor
Content-Type: application/json

{
  "text": "Apple Inc. a été fondée par Steve Jobs à Cupertino en 1976...",
  "options": {
    "entity_types": ["PERSON", "ORGANIZATION", "LOCATION", "DATE", "MONEY", "PRODUCT", "EVENT"],
    "language": "fr" | "en" | "auto",
    "include_context": true,
    "confidence_threshold": 0.7,
    "deduplicate": true
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "entities": [
      {
        "text": "Apple Inc.",
        "type": "ORGANIZATION",
        "confidence": 0.98,
        "start_offset": 0,
        "end_offset": 10,
        "context": "Apple Inc. a été fondée par..."
      },
      {
        "text": "Steve Jobs",
        "type": "PERSON",
        "confidence": 0.99,
        "start_offset": 28,
        "end_offset": 38,
        "context": "...fondée par Steve Jobs à Cupertino..."
      },
      {
        "text": "Cupertino",
        "type": "LOCATION",
        "confidence": 0.95,
        "start_offset": 41,
        "end_offset": 50,
        "context": "...Steve Jobs à Cupertino en 1976..."
      },
      {
        "text": "1976",
        "type": "DATE",
        "confidence": 0.99,
        "start_offset": 54,
        "end_offset": 58,
        "normalized": "1976-01-01"
      }
    ],
    "summary": {
      "total_entities": 4,
      "by_type": {
        "ORGANIZATION": 1,
        "PERSON": 1,
        "LOCATION": 1,
        "DATE": 1
      }
    },
    "text_length": 150,
    "language_detected": "fr"
  },
  "meta": {
    "provider": "openai",
    "model": "gpt-4o",
    "execution_mode": "online",
    "tokens_used": 450
  }
}
```

## Types d'entités supportés

| Type | Description | Exemples |
|------|-------------|----------|
| `PERSON` | Personnes | Steve Jobs, Marie Curie |
| `ORGANIZATION` | Organisations, entreprises | Apple, UNESCO, Google |
| `LOCATION` | Lieux, adresses | Paris, Silicon Valley |
| `DATE` | Dates, périodes | 1976, janvier 2024 |
| `TIME` | Heures | 14h30, midi |
| `MONEY` | Montants | 100€, $1 million |
| `PERCENT` | Pourcentages | 25%, 0.5% |
| `PRODUCT` | Produits | iPhone, Tesla Model 3 |
| `EVENT` | Événements | WWDC, JO 2024 |
| `WORK_OF_ART` | Oeuvres | Mona Lisa, Harry Potter |
| `LAW` | Lois, réglementations | RGPD, Article 13 |
| `LANGUAGE` | Langues | Français, Python |
| `CUSTOM` | Types personnalisés | (défini par l'utilisateur) |

## System Prompt

```
Tu es un expert en extraction d'entités nommées (NER).
Analyse le texte fourni et extrais toutes les entités des types demandés.

Pour chaque entité, fournis:
- Le texte exact tel qu'il apparaît
- Le type d'entité
- Un score de confiance (0-1)
- La position dans le texte (start_offset, end_offset)

Règles:
1. Extrais UNIQUEMENT les types demandés
2. Ne devine pas - si incertain, baisse le score de confiance
3. Pour les dates, normalise au format ISO si possible
4. Déduplique les entités identiques
5. Réponds UNIQUEMENT en JSON valide

Format de sortie:
{
  "entities": [
    {"text": "...", "type": "...", "confidence": 0.95, "start_offset": 0, "end_offset": 10}
  ]
}
```

## Definition of Done

- [ ] Endpoint `POST /webhook/entity-extractor`
- [ ] Support types standard (PERSON, ORG, LOC, DATE, etc.)
- [ ] Support types personnalisés
- [ ] Score de confiance par entité
- [ ] Positions dans le texte (offsets)
- [ ] Contexte autour de l'entité (optionnel)
- [ ] Déduplication des entités
- [ ] Normalisation dates/montants
- [ ] Tests: texte FR, texte EN, types custom

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Texte FR | Article de presse français | Entités FR extraites |
| Texte EN | Article anglais | Entités EN extraites |
| Types limités | Seulement PERSON, ORG | Pas d'autres types |
| Type custom | Type "SKILL" personnalisé | Skills extraits |
| Texte long | > 5000 caractères | Toutes entités |
| Sans entités | Texte générique | Array vide |
| Faible confiance | Texte ambigu | Scores bas |

## Dépendances

- **OpenAI API** - GPT-4o avec JSON Mode
- Variables d'environnement:
  - `OPENAI_API_KEY`

## Notes d'implémentation

1. Chunker les textes longs (> 4000 tokens)
2. Fusionner les résultats des chunks
3. Déduplication fuzzy (Levenshtein > 0.9)
4. Cache les résultats (TTL 1h)
5. Fallback Claude si OpenAI indisponible

## Références

- [TOOLS_MIGRATION_LIST.md](../mcp-server/TOOLS_MIGRATION_LIST.md)
- [OpenAI JSON Mode](https://platform.openai.com/docs/guides/structured-outputs)
