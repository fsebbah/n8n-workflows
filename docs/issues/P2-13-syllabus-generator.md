# P2-13: syllabus_generator_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-13 |
| **Nom** | syllabus_generator_tool |
| **Priorité** | Moyenne |
| **Statut** | A implémenter |
| **Catégorie** | IA / Education |

## Description

Workflow n8n pour la génération automatique de syllabus et programmes de cours. Utilise OpenAI GPT-4o pour créer des programmes structurés avec objectifs, modules et évaluations.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| LLM | **OpenAI GPT-4o** | JSON Mode, qualité |
| Format | JSON Mode strict | Structure garantie |
| Fallback | Claude / Mistral | Multi-provider |

## Endpoint

```
POST /webhook/syllabus-generator
Content-Type: application/json

{
  "topic": "Introduction à l'Intelligence Artificielle",
  "options": {
    "level": "beginner" | "intermediate" | "advanced",
    "duration_weeks": 12,
    "hours_per_week": 3,
    "format": "course" | "workshop" | "bootcamp",
    "language": "fr",
    "include_assessments": true,
    "include_resources": true,
    "target_audience": "Étudiants en informatique niveau L3"
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "syllabus": {
      "title": "Introduction à l'Intelligence Artificielle",
      "description": "Ce cours offre une introduction complète aux concepts fondamentaux de l'IA...",
      "objectives": [
        "Comprendre les principes fondamentaux de l'apprentissage automatique",
        "Implémenter des algorithmes de base en Python",
        "Évaluer et comparer différents modèles"
      ],
      "prerequisites": [
        "Programmation Python (niveau intermédiaire)",
        "Mathématiques (algèbre linéaire, probabilités)"
      ],
      "duration": {
        "weeks": 12,
        "hours_per_week": 3,
        "total_hours": 36
      },
      "modules": [
        {
          "id": 1,
          "title": "Introduction et historique de l'IA",
          "week": 1,
          "hours": 3,
          "topics": [
            "Histoire de l'IA",
            "Définitions et concepts clés",
            "Applications actuelles"
          ],
          "learning_outcomes": [
            "Définir ce qu'est l'intelligence artificielle",
            "Identifier les principales étapes historiques"
          ],
          "activities": [
            "Lecture: 'Artificial Intelligence: A Modern Approach' Ch.1",
            "Discussion: Éthique de l'IA"
          ]
        },
        {
          "id": 2,
          "title": "Apprentissage supervisé",
          "week": 2,
          "hours": 3,
          "topics": [...],
          "learning_outcomes": [...],
          "activities": [...]
        }
      ],
      "assessments": [
        {
          "type": "quiz",
          "title": "Quiz mi-parcours",
          "week": 6,
          "weight": 20,
          "description": "QCM sur les concepts des semaines 1-5"
        },
        {
          "type": "project",
          "title": "Projet final",
          "week": 12,
          "weight": 40,
          "description": "Développer un modèle de classification..."
        }
      ],
      "resources": {
        "required": [
          {
            "type": "book",
            "title": "Artificial Intelligence: A Modern Approach",
            "authors": ["Stuart Russell", "Peter Norvig"],
            "isbn": "978-0134610993"
          }
        ],
        "recommended": [
          {
            "type": "online_course",
            "title": "Machine Learning by Andrew Ng",
            "url": "https://www.coursera.org/learn/machine-learning"
          }
        ]
      },
      "metadata": {
        "level": "beginner",
        "format": "course",
        "target_audience": "Étudiants en informatique niveau L3",
        "generated_at": "2024-12-15T10:00:00Z"
      }
    }
  },
  "meta": {
    "provider": "openai",
    "model": "gpt-4o",
    "execution_mode": "online",
    "tokens_used": 2500
  }
}
```

## System Prompt

```
Tu es un expert en conception pédagogique et création de programmes de cours.
Génère un syllabus complet et structuré basé sur les paramètres fournis.

Règles :
1. Chaque module doit avoir des objectifs d'apprentissage mesurables (verbes d'action)
2. La progression doit être logique du simple au complexe
3. Les évaluations doivent couvrir les objectifs du cours
4. Inclure des ressources variées (livres, articles, vidéos)
5. Adapter le niveau de difficulté au public cible
6. Réponds UNIQUEMENT en JSON valide selon le schéma fourni

Format des objectifs: utiliser la taxonomie de Bloom (connaître, comprendre, appliquer, analyser, évaluer, créer)
```

## Definition of Done

- [ ] Endpoint `POST /webhook/syllabus-generator`
- [ ] Niveaux: beginner, intermediate, advanced
- [ ] Formats: course, workshop, bootcamp
- [ ] Modules avec objectifs d'apprentissage
- [ ] Évaluations optionnelles avec pondération
- [ ] Ressources requises et recommandées
- [ ] Prérequis automatiquement suggérés
- [ ] Support multilingue (FR, EN)
- [ ] JSON Mode strict activé
- [ ] Tests: cours 12 semaines, workshop 2 jours, différents niveaux

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Cours standard | 12 semaines, beginner | Syllabus complet |
| Workshop | 2 jours intensifs | Format condensé |
| Sans évaluations | include_assessments: false | Pas d'assessments |
| Niveau avancé | level: advanced | Contenu approfondi |
| Anglais | language: en | Syllabus en anglais |
| JSON invalide | Réponse malformée | Retry automatique |

## Dépendances

- **OpenAI API** - GPT-4o avec JSON Mode
- Variables d'environnement:
  - `OPENAI_API_KEY`

## Notes d'implémentation

1. Valider la cohérence durée/modules
2. Générer des objectifs SMART
3. Calculer automatiquement total_hours
4. Suggérer ressources réelles (ISBNs valides)
5. Cache les syllabus générés (TTL 7 jours)
6. Option export PDF/Word (futur)

## Taxonomie de Bloom

Utiliser ces verbes pour les objectifs d'apprentissage:

| Niveau | Verbes |
|--------|--------|
| Connaître | définir, identifier, lister, nommer |
| Comprendre | expliquer, décrire, résumer, interpréter |
| Appliquer | utiliser, implémenter, démontrer, calculer |
| Analyser | comparer, différencier, examiner, questionner |
| Évaluer | évaluer, critiquer, justifier, recommander |
| Créer | concevoir, développer, formuler, proposer |

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack IA & Contenu](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-ia--contenu--phase-2-p2-04-à-p2-13)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
- [OpenAI JSON Mode](https://platform.openai.com/docs/guides/structured-outputs)
