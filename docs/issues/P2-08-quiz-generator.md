# P2-08: quiz_generator_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-08 |
| **Nom** | quiz_generator_tool |
| **Priorité** | Moyenne |
| **Statut** | A implémenter |
| **Catégorie** | IA / Contenu |

## Description

Workflow n8n pour la génération automatique de quiz et QCM à partir d'un texte ou sujet. Utilise OpenAI GPT-4o avec JSON Mode strict pour garantir un format de sortie structuré.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| LLM | **OpenAI GPT-4o** | JSON Mode strict, qualité |
| Format | JSON Mode | Structure garantie |
| Fallback | Claude / Mistral | Multi-provider |

## Endpoint

```
POST /webhook/quiz-generator
Content-Type: application/json

{
  "source": "text" | "topic" | "url",
  "data": "<texte_ou_sujet_ou_url>",
  "options": {
    "num_questions": 10,
    "question_types": ["multiple_choice", "true_false", "fill_blank"],
    "difficulty": "easy" | "medium" | "hard",
    "language": "fr",
    "include_explanations": true
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "quiz": {
      "title": "Quiz sur l'Intelligence Artificielle",
      "description": "Testez vos connaissances...",
      "questions": [
        {
          "id": 1,
          "type": "multiple_choice",
          "question": "Qu'est-ce qu'un réseau de neurones ?",
          "options": [
            {"id": "A", "text": "Un type de processeur"},
            {"id": "B", "text": "Un modèle inspiré du cerveau humain"},
            {"id": "C", "text": "Un protocole réseau"},
            {"id": "D", "text": "Un langage de programmation"}
          ],
          "correct_answer": "B",
          "explanation": "Un réseau de neurones est un modèle computationnel inspiré de la structure du cerveau humain...",
          "difficulty": "easy"
        },
        {
          "id": 2,
          "type": "true_false",
          "question": "Le deep learning nécessite toujours des GPU.",
          "correct_answer": false,
          "explanation": "Bien que les GPU accélèrent le deep learning, il est possible d'entraîner des modèles sur CPU..."
        }
      ],
      "metadata": {
        "total_questions": 10,
        "difficulty_distribution": {
          "easy": 3,
          "medium": 5,
          "hard": 2
        }
      }
    }
  },
  "meta": {
    "provider": "openai",
    "model": "gpt-4o",
    "execution_mode": "online",
    "tokens_used": 1250
  }
}
```

## System Prompt

```
Tu es un expert en création de quiz éducatifs. Génère un quiz basé sur le contenu fourni.

Règles :
1. Chaque question doit être claire et non ambiguë
2. Les options de réponse doivent être plausibles
3. Les explications doivent être pédagogiques
4. Respecte la distribution de difficulté demandée
5. Réponds UNIQUEMENT en JSON valide selon le schéma fourni

Ne fais aucun commentaire hors du JSON.
```

## Definition of Done

- [ ] Endpoint `POST /webhook/quiz-generator`
- [ ] Input: texte, sujet ou URL
- [ ] Types de questions: QCM, Vrai/Faux, Texte à trous
- [ ] Niveaux de difficulté configurables
- [ ] Explications optionnelles pour chaque réponse
- [ ] JSON Mode strict activé
- [ ] Support multilingue (FR, EN)
- [ ] Tests: quiz depuis texte, depuis sujet, edge cases

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Texte source | Paragraphe d'article | Quiz cohérent |
| Sujet libre | "Histoire de France" | Questions pertinentes |
| URL | Article web | Extraction + quiz |
| Difficulté | Distribution easy/medium/hard | Respectée |
| Sans explications | include_explanations: false | Pas d'explications |
| JSON invalide | Réponse malformée | Retry automatique |

## Dépendances

- **OpenAI API** - GPT-4o avec JSON Mode
- Variables d'environnement:
  - `OPENAI_API_KEY`

## Notes d'implémentation

1. Valider le JSON retourné par l'API
2. Retry si JSON malformé (max 2 tentatives)
3. Limiter le texte source (max 10k tokens)
4. Shuffle les options de réponse
5. Générer des distracteurs plausibles
6. Cache les quiz générés (TTL 24h)

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack IA & Contenu](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-ia--contenu--phase-2-p2-04-à-p2-13)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
- [OpenAI JSON Mode](https://platform.openai.com/docs/guides/structured-outputs)
