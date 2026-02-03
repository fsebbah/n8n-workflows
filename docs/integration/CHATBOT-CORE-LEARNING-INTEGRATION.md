# Guide d'Intégration - Learning System (RFC-022)

> Documentation pour l'équipe **chatbot-core** sur l'intégration avec les workflows n8n du système d'apprentissage.

## Vue d'ensemble

Le système d'apprentissage expose **5 webhooks** que le chatbot-core peut appeler, plus **2 crons** automatiques.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Discord Bot    │────▶│   n8n Webhooks  │────▶│   Backend API   │
│ (chatbot-core)  │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Webhooks Disponibles

### 1. Vérification des Badges

**Endpoint:** `POST /webhook/learning-badge-check`

Vérifie automatiquement si un apprenant a débloqué de nouveaux badges après une action.

```json
// Request
{
  "learner_discord_id": "123456789012345678",
  "guild_id": "987654321098765432",
  "trigger_event": "lesson_completed",  // ou "quiz_passed", "course_completed"
  "event_data": {
    "lesson_id": "uuid",
    "course_id": "uuid"
  }
}

// Response (succès)
{
  "success": true,
  "data": {
    "learner_discord_id": "123456789012345678",
    "badges_awarded": [
      {
        "badge_id": "uuid",
        "badge_name": "Première Leçon",
        "badge_icon": "🎯",
        "xp_bonus": 50
      }
    ],
    "total_badges": 5,
    "xp_earned": 50
  }
}
```

**Quand l'appeler:**
- Après chaque `lesson_completed`
- Après chaque `quiz_passed`
- Après chaque `course_completed`

---

### 2. Génération de Cours (IA)

**Endpoint:** `POST /webhook/learning-generate-course`

Génère un cours complet avec leçons via Claude Haiku.

```json
// Request
{
  "guild_id": "987654321098765432",
  "topic": "Les bases de la pâtisserie française",
  "difficulty": "beginner",           // beginner | intermediate | advanced
  "num_lessons": 5,                   // optionnel, défaut: 5
  "target_audience": "débutants",     // optionnel
  "language": "fr"                    // optionnel, défaut: fr
}

// Response (succès)
{
  "success": true,
  "data": {
    "course_id": "uuid",
    "title": "Les bases de la pâtisserie française",
    "description": "...",
    "lessons": [
      {
        "lesson_id": "uuid",
        "title": "Introduction aux ingrédients",
        "order": 1
      }
    ],
    "total_lessons": 5,
    "estimated_duration": "2h30"
  },
  "meta": {
    "provider": "anthropic",
    "model": "claude-3-haiku-20240307"
  }
}
```

**Temps de réponse:** 15-30 secondes (génération IA)

---

### 3. Génération de Quiz (IA)

**Endpoint:** `POST /webhook/learning-generate-quiz`

Génère un quiz pour une leçon via Claude Haiku.

```json
// Request
{
  "guild_id": "987654321098765432",
  "lesson_id": "uuid-de-la-leçon",
  "num_questions": 5,                 // optionnel, défaut: 5
  "difficulty": "medium"              // optionnel: easy | medium | hard
}

// Response (succès)
{
  "success": true,
  "data": {
    "quiz_id": "uuid",
    "lesson_id": "uuid",
    "title": "Quiz - Introduction aux ingrédients",
    "questions": [
      {
        "question_id": "uuid",
        "question": "Quel est le rôle du gluten dans la pâte?",
        "type": "multiple_choice",
        "options": ["A", "B", "C", "D"],
        "correct_answer": "B"
      }
    ],
    "total_questions": 5,
    "passing_score": 70,
    "xp_reward": 25
  }
}
```

---

### 4. Évaluation Photo (Vision IA)

**Endpoint:** `POST /webhook/learning-evaluate-photo`

Évalue une photo de plat cuisiné via Claude Sonnet (vision).

```json
// Request
{
  "submission_id": "uuid-de-la-soumission",
  "image_url": "https://cdn.discord.com/attachments/.../plat.jpg",
  "guild_id": "987654321098765432",
  "recipe_name": "Tarte aux pommes",           // optionnel
  "recipe_description": "Tarte classique...",  // optionnel
  "criteria": ["Texture", "Présentation", "Cuisson"]  // optionnel
}

// Response (succès)
{
  "success": true,
  "data": {
    "submission_id": "uuid",
    "grade": 85,
    "feedback": "Excellente présentation ! La dorure est parfaite...",
    "xp_earned": 42,
    "evaluation": {
      "criteria": [
        {"name": "Texture", "score": 90, "comment": "Pâte bien feuilletée"},
        {"name": "Présentation", "score": 85, "comment": "Disposition soignée"},
        {"name": "Cuisson", "score": 80, "comment": "Légèrement plus doré idéal"}
      ],
      "improvements": ["Surveiller la cuisson 5 min de moins"],
      "highlights": ["Excellent travail sur la pâte", "Bonne disposition des pommes"]
    }
  }
}
```

**Temps de réponse:** 10-20 secondes (analyse vision)

---

### 5. Adaptation de la Difficulté

**Endpoint:** `POST /webhook/learning-adapt-difficulty`

Calcule la difficulté recommandée pour un apprenant.

```json
// Request
{
  "learner_discord_id": "123456789012345678",
  "guild_id": "987654321098765432"
}

// Response (succès)
{
  "success": true,
  "data": {
    "learner_discord_id": "123456789012345678",
    "recommended_difficulty": "medium",  // easy | medium | hard
    "difficulty_score": 2,               // 1-3
    "reasoning": "Good progress - maintaining appropriate challenge level",
    "metrics": {
      "average_score": 78.5,
      "success_rate": 75.0,
      "total_attempts": 12,
      "current_level": 3
    },
    "focus_areas": {
      "weaknesses": ["Techniques de cuisson", "Timing"],
      "strengths": ["Présentation", "Créativité"]
    },
    "recommendations": [
      "Focus on: Techniques de cuisson, Timing",
      "Ready for advanced content in: Présentation"
    ]
  }
}
```

**Algorithme:**
| Score moyen | Taux réussite | Difficulté |
|-------------|---------------|------------|
| ≥ 90%       | ≥ 85%         | hard       |
| ≥ 75%       | ≥ 70%         | medium     |
| ≥ 60%       | ≥ 50%         | easy       |
| < 60%       | < 50%         | easy (renforcement) |

---

## Crons Automatiques

Ces workflows s'exécutent automatiquement, pas besoin de les appeler.

### 1. Rappels Quotidiens

**Schedule:** Tous les jours à 10h00

**Fonctionnement:**
1. Récupère tous les guilds actifs
2. Pour chaque guild, identifie les apprenants inactifs (7+ jours)
3. Envoie un DM personnalisé selon la progression:
   - < 25% : "Tu as commencé mais on ne t'a pas vu..."
   - 25-75% : "Tu es à X% ! Plus que quelques leçons..."
   - > 75% : "Tu es si proche de terminer !"

### 2. Rapport Hebdomadaire

**Schedule:** Chaque lundi à 9h00

**Fonctionnement:**
1. Récupère tous les guilds actifs
2. Pour chaque guild avec `learning_stats_channel_id` configuré:
   - Génère les statistiques de la semaine
   - Envoie un embed Discord avec:
     - Résumé global (apprenants, leçons, quiz)
     - Top 5 apprenants
     - Cours populaires
     - Badges et taux d'engagement

---

## Gestion des Erreurs

Toutes les réponses d'erreur suivent ce format:

```json
{
  "success": false,
  "error": {
    "code": 400,           // HTTP status code
    "message": "Description de l'erreur",
    "status": "BAD_REQUEST"
  }
}
```

**Codes d'erreur courants:**

| Code | Status | Cause |
|------|--------|-------|
| 400  | BAD_REQUEST | Paramètres manquants ou invalides |
| 401  | UNAUTHORIZED | API key invalide |
| 404  | NOT_FOUND | Ressource non trouvée |
| 500  | INTERNAL_ERROR | Erreur serveur / parsing LLM |

---

## Configuration Requise (Backend API)

Pour que les workflows fonctionnent, l'API backend doit exposer:

### Endpoints requis

```
GET  /api/v1/guilds?active=true
GET  /api/v1/progress/{discord_id}?guild_id=X
GET  /api/v1/lessons/{lesson_id}?guild_id=X
GET  /api/v1/enrollments/inactive?guild_id=X&days_threshold=7
GET  /api/v1/stats/weekly?guild_id=X&top_n=10
POST /api/v1/courses
POST /api/v1/quizzes
PUT  /api/v1/submissions/{id}/grade
POST /api/v1/badges/check
```

### Configuration par Guild

Chaque guild doit avoir dans sa config:
- `learning_stats_channel_id` : Channel Discord pour les rapports hebdomadaires

---

## Exemples d'Intégration (Python)

```python
import httpx

N8N_BASE_URL = "http://pi6.local:5678/webhook"

async def check_badges(discord_id: str, guild_id: str, event: str):
    """Vérifie les badges après une action."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_BASE_URL}/learning-badge-check",
            json={
                "learner_discord_id": discord_id,
                "guild_id": guild_id,
                "trigger_event": event
            },
            timeout=30.0
        )
        return response.json()

async def evaluate_photo(submission_id: str, image_url: str, guild_id: str):
    """Évalue une photo de plat."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_BASE_URL}/learning-evaluate-photo",
            json={
                "submission_id": submission_id,
                "image_url": image_url,
                "guild_id": guild_id
            },
            timeout=60.0  # Vision prend plus de temps
        )
        return response.json()

async def get_difficulty(discord_id: str, guild_id: str):
    """Obtient la difficulté recommandée."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_BASE_URL}/learning-adapt-difficulty",
            json={
                "learner_discord_id": discord_id,
                "guild_id": guild_id
            },
            timeout=30.0
        )
        return response.json()
```

---

## Timeouts Recommandés

| Webhook | Timeout recommandé |
|---------|-------------------|
| badge-check | 30s |
| generate-course | 60s |
| generate-quiz | 45s |
| evaluate-photo | 60s |
| adapt-difficulty | 30s |

---

## Contact

- **Workflows n8n:** Équipe DevOps
- **Backend API:** Équipe Backend
- **Intégration Discord:** Équipe chatbot-core

---

*Document généré pour RFC-022 - Learning System*
*Dernière mise à jour: 2026-02-03*
