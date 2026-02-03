# Learning System API - Guide n8n Integration

> Documentation des endpoints Learning System (RFC-022) pour l'équipe n8n.
> Base URL: `/api/v1`

## Workflows n8n supportés

| Workflow | Endpoint | Status |
|----------|----------|--------|
| `learning-generate-course` | POST /courses/draft | Implémenté |
| `learning-generate-quiz` | POST /quizzes | Implémenté |
| `learning-evaluate-photo` | PUT /submissions/:id/grade | Implémenté |
| `learning-adapt-difficulty` | GET /progress/:learner | Implémenté |
| `learning-badge-check` | POST /badges/award | Implémenté |
| `learning-send-reminder` | GET /enrollments/inactive | Implémenté |
| `learning-weekly-stats` | GET /stats/weekly | Implémenté |

## Table des matières

1. [Courses](#courses)
2. [Quizzes](#quizzes)
3. [Submissions](#submissions)
4. [Enrollments](#enrollments)
5. [Progress](#progress)
6. [Learners](#learners)
7. [Stats](#stats)
8. [Leaderboards](#leaderboards)
9. [Badges](#badges)
10. [Live Sessions](#live-sessions)

---

## Courses

### POST /courses/draft

Crée un nouveau cours en mode brouillon avec ses modules et leçons.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Request Body:**
```json
{
  "title": "Cuisine Française - Les Bases",
  "description": "Apprenez les fondamentaux de la cuisine française",
  "instructor_id": "123456789012345678",
  "price_credits": 100,
  "is_free": false,
  "sponsor_id": "987654321098765432",
  "sponsor_data": {
    "name": "Chef Academy",
    "logo_url": "https://example.com/logo.png",
    "website": "https://chefacademy.com"
  },
  "thumbnail_url": "https://example.com/course-thumb.jpg",
  "language": "fr",
  "tags": ["french", "basics", "sauces"],
  "modules": [
    {
      "title": "Les Sauces Mères",
      "description": "Les 5 sauces de base",
      "order_index": 1,
      "duration_minutes": 120,
      "objectives": ["Maîtriser le roux", "Comprendre les liaisons"],
      "lessons": [
        {
          "title": "La Béchamel",
          "type": "video",
          "content": "Description détaillée de la leçon...",
          "video_url": "https://videos.example.com/bechamel.mp4",
          "duration_minutes": 15,
          "order_index": 1,
          "recipe_id": "uuid-de-la-recette"
        }
      ]
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "guild_id": "123456789012345678",
  "title": "Cuisine Française - Les Bases",
  "description": "Apprenez les fondamentaux de la cuisine française",
  "instructor_id": "123456789012345678",
  "price_credits": 100,
  "is_free": false,
  "sponsor_id": "987654321098765432",
  "sponsor_data": {
    "name": "Chef Academy",
    "logo_url": "https://example.com/logo.png"
  },
  "status": "draft",
  "thumbnail_url": "https://example.com/course-thumb.jpg",
  "language": "fr",
  "tags": ["french", "basics", "sauces"],
  "modules_count": 1,
  "total_duration_minutes": 120,
  "created_at": "2026-02-03T15:30:00Z",
  "updated_at": "2026-02-03T15:30:00Z"
}
```

---

### GET /courses

Liste les cours avec filtres optionnels.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |
| `status` | string | No | Filter: `draft`, `published`, `archived` |
| `instructor_id` | string | No | Filter par instructeur |
| `is_free` | boolean | No | Filter cours gratuits |
| `language` | string | No | Filter par langue |
| `skip` | integer | No | Pagination offset (default: 0) |
| `limit` | integer | No | Pagination limit (default: 20, max: 100) |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "guild_id": "123456789012345678",
      "title": "Cuisine Française - Les Bases",
      "description": "Apprenez les fondamentaux...",
      "instructor_id": "123456789012345678",
      "price_credits": 100,
      "is_free": false,
      "status": "published",
      "thumbnail_url": "https://example.com/thumb.jpg",
      "language": "fr",
      "tags": ["french", "basics"],
      "modules_count": 5,
      "total_duration_minutes": 480,
      "created_at": "2026-02-03T15:30:00Z",
      "updated_at": "2026-02-03T16:00:00Z"
    }
  ],
  "total": 42,
  "skip": 0,
  "limit": 20
}
```

---

### GET /courses/{course_id}

Récupère les détails complets d'un cours avec ses modules et leçons.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "guild_id": "123456789012345678",
  "title": "Cuisine Française - Les Bases",
  "description": "Apprenez les fondamentaux de la cuisine française",
  "instructor_id": "123456789012345678",
  "price_credits": 100,
  "is_free": false,
  "sponsor_id": "987654321098765432",
  "sponsor_data": {
    "name": "Chef Academy",
    "logo_url": "https://example.com/logo.png"
  },
  "status": "published",
  "thumbnail_url": "https://example.com/thumb.jpg",
  "language": "fr",
  "tags": ["french", "basics", "sauces"],
  "modules_count": 2,
  "total_duration_minutes": 240,
  "created_at": "2026-02-03T15:30:00Z",
  "updated_at": "2026-02-03T16:00:00Z",
  "modules": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "course_id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Les Sauces Mères",
      "description": "Les 5 sauces de base",
      "order_index": 1,
      "duration_minutes": 120,
      "objectives": ["Maîtriser le roux", "Comprendre les liaisons"],
      "lessons_count": 5,
      "created_at": "2026-02-03T15:30:00Z",
      "updated_at": "2026-02-03T15:30:00Z",
      "lessons": [
        {
          "id": "770e8400-e29b-41d4-a716-446655440002",
          "module_id": "660e8400-e29b-41d4-a716-446655440001",
          "title": "La Béchamel",
          "type": "video",
          "content": "Description détaillée...",
          "video_url": "https://videos.example.com/bechamel.mp4",
          "duration_minutes": 15,
          "order_index": 1,
          "recipe_id": "880e8400-e29b-41d4-a716-446655440003",
          "created_at": "2026-02-03T15:30:00Z",
          "updated_at": "2026-02-03T15:30:00Z"
        }
      ]
    }
  ]
}
```

**Error Response (404):**
```json
{
  "error": "not_found",
  "message": "Course not found"
}
```

---

### PUT /courses/{course_id}

Met à jour un cours existant.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Request Body (tous les champs optionnels):**
```json
{
  "title": "Nouveau titre",
  "description": "Nouvelle description",
  "price_credits": 150,
  "is_free": false,
  "thumbnail_url": "https://example.com/new-thumb.jpg",
  "language": "en",
  "tags": ["updated", "tags"]
}
```

**Response (200 OK):** Même structure que GET /courses/{id}

---

### POST /courses/{course_id}/publish

Publie un cours en mode brouillon.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "published",
  "published_at": "2026-02-03T16:00:00Z"
}
```

**Error Response (400):**
```json
{
  "error": "invalid_status",
  "message": "Only draft courses can be published"
}
```

---

## Quizzes

### POST /quizzes

Crée un quiz avec ses questions. Utilisé par le workflow `learning-generate-quiz`.

**Request Body:**
```json
{
  "lesson_id": "770e8400-e29b-41d4-a716-446655440002",
  "guild_id": "123456789012345678",
  "title": "Quiz: Les Sauces Mères",
  "description": "Testez vos connaissances sur les 5 sauces de base",
  "instructions": "Répondez à toutes les questions. 70% requis pour réussir.",
  "type": "standard",
  "time_limit_seconds": 600,
  "passing_score": 70,
  "questions": [
    {
      "text": "Quelle sauce est à base de roux blanc et de lait?",
      "type": "mcq",
      "options": ["Béchamel", "Velouté", "Espagnole", "Hollandaise"],
      "correct_answer": "Béchamel",
      "explanation": "La béchamel est faite avec un roux blanc et du lait.",
      "difficulty": 1,
      "order_index": 0,
      "points": 10
    },
    {
      "text": "La sauce hollandaise est émulsionnée à chaud.",
      "type": "true_false",
      "options": ["Vrai", "Faux"],
      "correct_answer": "Vrai",
      "explanation": "La hollandaise est une émulsion chaude de jaunes d'oeufs et beurre.",
      "difficulty": 2,
      "order_index": 1,
      "points": 10
    }
  ]
}
```

| Question Type | Description |
|---------------|-------------|
| `mcq` | Choix multiple (options requises) |
| `true_false` | Vrai ou Faux |
| `open` | Réponse ouverte |

**Response (201 Created):**
```json
{
  "id": "aa0e8400-e29b-41d4-a716-446655440010",
  "lesson_id": "770e8400-e29b-41d4-a716-446655440002",
  "title": "Quiz: Les Sauces Mères",
  "description": "Testez vos connaissances sur les 5 sauces de base",
  "instructions": "Répondez à toutes les questions. 70% requis pour réussir.",
  "type": "standard",
  "time_limit_seconds": 600,
  "passing_score": 70,
  "questions": [
    {
      "id": "bb0e8400-e29b-41d4-a716-446655440011",
      "quiz_id": "aa0e8400-e29b-41d4-a716-446655440010",
      "text": "Quelle sauce est à base de roux blanc et de lait?",
      "type": "mcq",
      "options": ["Béchamel", "Velouté", "Espagnole", "Hollandaise"],
      "correct_answer": "Béchamel",
      "explanation": "La béchamel est faite avec un roux blanc et du lait.",
      "difficulty": 1,
      "order_index": 0,
      "points": 10
    }
  ],
  "total_points": 20,
  "created_at": "2026-02-03T17:00:00Z",
  "updated_at": "2026-02-03T17:00:00Z"
}
```

---

## Submissions

### PUT /submissions/{submission_id}/grade

Note une soumission (photo ou texte). Utilisé par le workflow `learning-evaluate-photo`.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Request Body:**
```json
{
  "feedback": "Excellente présentation! La sauce est bien lisse et nappe correctement.",
  "grade": 85,
  "graded_by": "ai",
  "ai_evaluation": {
    "criteria": [
      {
        "name": "Texture",
        "score": 90,
        "comment": "Sauce parfaitement lisse"
      },
      {
        "name": "Couleur",
        "score": 85,
        "comment": "Belle couleur ivoire"
      },
      {
        "name": "Nappé",
        "score": 80,
        "comment": "Nappe correctement la cuillère"
      }
    ],
    "overall_comment": "Très bonne maîtrise de la technique de base."
  }
}
```

**Response (200 OK):**
```json
{
  "id": "cc0e8400-e29b-41d4-a716-446655440012",
  "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "lesson_id": "770e8400-e29b-41d4-a716-446655440002",
  "type": "photo",
  "content_url": "https://storage.example.com/submissions/sauce-bechamel.jpg",
  "content_text": null,
  "feedback": "Excellente présentation! La sauce est bien lisse et nappe correctement.",
  "grade": 85,
  "graded_by": "ai",
  "graded_at": "2026-02-03T17:30:00Z",
  "ai_evaluation": {
    "criteria": [
      {"name": "Texture", "score": 90, "comment": "Sauce parfaitement lisse"},
      {"name": "Couleur", "score": 85, "comment": "Belle couleur ivoire"},
      {"name": "Nappé", "score": 80, "comment": "Nappe correctement la cuillère"}
    ],
    "overall_comment": "Très bonne maîtrise de la technique de base."
  },
  "xp_earned": 75,
  "created_at": "2026-02-03T16:00:00Z",
  "updated_at": "2026-02-03T17:30:00Z"
}
```

**XP Earned:** 50-100 XP basé sur la note (70+ requis pour XP)

---

## Enrollments

### POST /enrollments

Inscrit un apprenant à un cours.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Request Body:**
```json
{
  "learner_discord_id": "123456789012345678",
  "course_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (201 Created):**
```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "course_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "progress_percent": 0.0,
  "enrolled_at": "2026-02-03T16:30:00Z",
  "completed_at": null,
  "last_activity_at": "2026-02-03T16:30:00Z",
  "course_title": "Cuisine Française - Les Bases"
}
```

**Error Responses:**

- Course not found (404):
```json
{
  "error": "not_found",
  "message": "Course not found"
}
```

- Already enrolled (400):
```json
{
  "error": "already_enrolled",
  "message": "Learner is already enrolled in this course"
}
```

- Insufficient credits (402):
```json
{
  "error": "insufficient_credits",
  "message": "Not enough credits to enroll",
  "required_credits": 100,
  "available_credits": 50
}
```

---

### GET /enrollments/inactive

Récupère les inscriptions inactives. Utilisé par le workflow `learning-send-reminder`.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |
| `days_threshold` | integer | No | Jours d'inactivité (default: 7, max: 90) |
| `limit` | integer | No | Max résultats (default: 100, max: 500) |

**Response (200 OK):**
```json
{
  "enrollments": [
    {
      "enrollment_id": "990e8400-e29b-41d4-a716-446655440004",
      "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
      "discord_id": "123456789012345678",
      "display_name": "ChefEnHerbe",
      "course_id": "550e8400-e29b-41d4-a716-446655440000",
      "course_title": "Cuisine Française - Les Bases",
      "enrolled_at": "2026-01-15T10:00:00Z",
      "last_activity_at": "2026-01-20T15:30:00Z",
      "days_inactive": 14,
      "progress_percent": 25.0,
      "completed_lessons": 5,
      "total_lessons": 20
    }
  ],
  "total": 15,
  "inactive_threshold_days": 7
}
```

---

### GET /enrollments/{learner_discord_id}

Récupère toutes les inscriptions d'un apprenant.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |
| `status` | string | No | Filter: `active`, `completed`, `dropped` |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "990e8400-e29b-41d4-a716-446655440004",
      "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
      "course_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "active",
      "progress_percent": 45.5,
      "enrolled_at": "2026-02-03T16:30:00Z",
      "completed_at": null,
      "last_activity_at": "2026-02-03T18:00:00Z",
      "course_title": "Cuisine Française - Les Bases"
    }
  ],
  "total": 3
}
```

---

## Progress

### POST /progress

Enregistre la progression d'une leçon. Met à jour automatiquement les XP et vérifie les level-ups.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Request Body:**
```json
{
  "learner_discord_id": "123456789012345678",
  "lesson_id": "770e8400-e29b-41d4-a716-446655440002",
  "status": "completed",
  "time_spent_seconds": 900,
  "notes": "Excellente leçon sur les sauces!"
}
```

| status | Description |
|--------|-------------|
| `not_started` | Leçon pas encore commencée |
| `in_progress` | Leçon en cours |
| `completed` | Leçon terminée (donne des XP) |

**Response (200 OK):**
```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440006",
  "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "lesson_id": "770e8400-e29b-41d4-a716-446655440002",
  "status": "completed",
  "completed_at": "2026-02-03T17:00:00Z",
  "time_spent_seconds": 900,
  "xp_earned": 25,
  "course_progress": {
    "course_id": "550e8400-e29b-41d4-a716-446655440000",
    "course_title": "Cuisine Française - Les Bases",
    "completed_lessons": 5,
    "total_lessons": 20,
    "progress_percent": 25.0
  }
}
```

**XP Rewards (RFC-022 Section 4.5):**
| Action | XP |
|--------|-----|
| Lesson completed | 25 |
| Quiz passed | 50 |
| Recipe cooked | 100 |
| Course completed | 500 |

---

### GET /progress/{learner_discord_id}

Récupère la progression détaillée d'un apprenant. Utilisé par le workflow `learning-adapt-difficulty`.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Response (200 OK):**
```json
{
  "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "discord_id": "123456789012345678",
  "guild_id": "123456789012345678",
  "xp_total": 2500,
  "level": 5,
  "level_title": "Sous-Chef",
  "courses": [
    {
      "course_id": "550e8400-e29b-41d4-a716-446655440000",
      "course_title": "Cuisine Française - Les Bases",
      "enrollment_status": "active",
      "enrolled_at": "2026-01-15T10:00:00Z",
      "completed_lessons": 12,
      "total_lessons": 20,
      "progress_percent": 60.0,
      "average_score": 82.5,
      "total_time_spent_seconds": 21600,
      "lessons": [
        {
          "lesson_id": "770e8400-e29b-41d4-a716-446655440002",
          "lesson_title": "La Béchamel",
          "module_id": "660e8400-e29b-41d4-a716-446655440001",
          "module_title": "Les Sauces Mères",
          "status": "completed",
          "score": 90,
          "attempts": 1,
          "time_spent_seconds": 1200,
          "completed_at": "2026-01-16T14:30:00Z"
        }
      ]
    }
  ],
  "quiz_stats": {
    "total_attempts": 15,
    "passed": 12,
    "failed": 3,
    "average_score": 78.5,
    "best_score": 95.0
  },
  "strengths": ["Les Sauces Mères", "Techniques de Base"],
  "weaknesses": ["Pâtisserie"]
}
```

**Utilisation pour l'adaptation de difficulté:**
- `quiz_stats.average_score` < 60 → Réduire la difficulté
- `quiz_stats.average_score` > 85 → Augmenter la difficulté
- `weaknesses` → Proposer des révisions ciblées
- `strengths` → Proposer des défis avancés

---

## Learners

### GET /learners/{discord_id}

Récupère le profil complet d'un apprenant avec stats, badges et inscriptions.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Response (200 OK):**
```json
{
  "id": "aa0e8400-e29b-41d4-a716-446655440005",
  "discord_id": "123456789012345678",
  "guild_id": "123456789012345678",
  "display_name": "ChefEnHerbe",
  "avatar_url": "https://cdn.discordapp.com/avatars/...",
  "bio": "Passionné de cuisine française",
  "preferences": {
    "dietary_restrictions": ["vegetarian"],
    "skill_level": "intermediate",
    "favorite_cuisines": ["french", "italian"]
  },
  "xp_total": 2500,
  "level": 5,
  "level_title": "Sous-Chef",
  "streak_days": 7,
  "last_activity_at": "2026-02-03T18:00:00Z",
  "created_at": "2026-01-15T10:00:00Z",
  "stats": {
    "courses_enrolled": 3,
    "courses_completed": 1,
    "lessons_completed": 45,
    "total_time_spent_hours": 12.5,
    "quizzes_passed": 8,
    "average_quiz_score": 85.5,
    "recipes_cooked": 15,
    "badges_earned": 4
  },
  "badges": [
    {
      "badge_id": "first_lesson",
      "name": "Premier Pas",
      "description": "Compléter sa première leçon",
      "icon": "foot",
      "awarded_at": "2026-01-15T11:00:00Z"
    },
    {
      "badge_id": "week_streak",
      "name": "Régulier",
      "description": "7 jours consécutifs d'activité",
      "icon": "fire",
      "awarded_at": "2026-01-22T10:00:00Z"
    }
  ],
  "recent_enrollments": [
    {
      "course_id": "550e8400-e29b-41d4-a716-446655440000",
      "course_title": "Cuisine Française - Les Bases",
      "status": "active",
      "progress_percent": 45.5,
      "enrolled_at": "2026-01-20T14:00:00Z"
    }
  ]
}
```

**Level Thresholds:**
| Level | XP Required | Title |
|-------|-------------|-------|
| 1 | 0 | Apprenti |
| 2 | 100 | Commis |
| 3 | 300 | Cuisinier |
| 4 | 600 | Chef de Partie |
| 5 | 1000 | Sous-Chef |
| 6 | 1500 | Chef |
| 7 | 2500 | Chef Exécutif |
| 8 | 4000 | Chef Étoilé |
| 9 | 6000 | Maître Chef |
| 10 | 10000 | Grand Maître |

---

## Stats

### GET /stats/weekly

Récupère les statistiques hebdomadaires. Utilisé par le workflow `learning-weekly-stats`.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |
| `top_n` | integer | No | Nombre de top learners (default: 10, max: 50) |

**Response (200 OK):**
```json
{
  "guild_id": "123456789012345678",
  "week_start": "2026-01-27T00:00:00Z",
  "week_end": "2026-02-03T00:00:00Z",
  "summary": {
    "total_learners": 150,
    "active_learners": 45,
    "new_enrollments": 12,
    "lessons_completed": 234,
    "quizzes_passed": 67
  },
  "top_learners": [
    {
      "rank": 1,
      "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
      "discord_id": "123456789012345678",
      "display_name": "ChefEnHerbe",
      "xp_earned": 850,
      "lessons_completed": 15,
      "courses_completed": 1
    },
    {
      "rank": 2,
      "learner_id": "bb0e8400-e29b-41d4-a716-446655440006",
      "discord_id": "234567890123456789",
      "display_name": "GourmetPro",
      "xp_earned": 720,
      "lessons_completed": 12,
      "courses_completed": 0
    }
  ],
  "course_stats": [
    {
      "course_id": "550e8400-e29b-41d4-a716-446655440000",
      "course_title": "Cuisine Française - Les Bases",
      "total_enrollments": 85,
      "new_enrollments_this_week": 8,
      "completions_this_week": 3,
      "average_progress": 42.5
    }
  ],
  "badges_awarded": 15,
  "total_xp_earned": 12500,
  "lessons_completed": 234,
  "quizzes_passed": 67
}
```

**Données utiles pour les rapports:**
- `summary.active_learners` / `summary.total_learners` = taux d'engagement
- `top_learners` = reconnaissance des meilleurs
- `course_stats.average_progress` = santé du cours
- `course_stats.completions_this_week` = succès

---

## Leaderboards

### GET /leaderboards/{type}

Récupère le classement pour un type donné.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `type` | string | `xp`, `streak`, `courses_completed`, `recipes_cooked` |

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |
| `period` | string | No | `daily`, `weekly`, `monthly`, `all_time` (default) |
| `limit` | integer | No | Max entries (default: 10, max: 100) |

**Response (200 OK):**
```json
{
  "type": "xp",
  "period": "weekly",
  "updated_at": "2026-02-03T00:00:00Z",
  "entries": [
    {
      "rank": 1,
      "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
      "discord_id": "123456789012345678",
      "display_name": "ChefEnHerbe",
      "avatar_url": "https://cdn.discordapp.com/avatars/...",
      "score": 850,
      "level": 5
    },
    {
      "rank": 2,
      "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
      "discord_id": "234567890123456789",
      "display_name": "GourmetPro",
      "avatar_url": "https://cdn.discordapp.com/avatars/...",
      "score": 720,
      "level": 4
    }
  ]
}
```

---

### POST /leaderboards/sync

Force la synchronisation du leaderboard (tâche admin).

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |
| `type` | string | Yes | Type de leaderboard à sync |

**Response (200 OK):**
```json
{
  "status": "synced",
  "type": "xp",
  "entries_updated": 150,
  "synced_at": "2026-02-03T16:00:00Z"
}
```

---

## Badges

### POST /badges/award

Attribue un badge à un apprenant (admin/système).

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Request Body:**
```json
{
  "learner_discord_id": "123456789012345678",
  "badge_id": "master_saucier",
  "reason": "Completed all sauce modules with 90%+ scores"
}
```

**Response (200 OK):**
```json
{
  "learner_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "badge_id": "master_saucier",
  "badge_name": "Maître Saucier",
  "badge_description": "Maîtriser toutes les sauces mères",
  "badge_icon": "trophy",
  "awarded_at": "2026-02-03T17:00:00Z",
  "total_badges": 5
}
```

**Available Default Badges:**
| ID | Name | Description |
|----|------|-------------|
| `first_lesson` | Premier Pas | Compléter sa première leçon |
| `first_course` | Diplômé | Compléter son premier cours |
| `first_recipe` | Cuisinier | Cuisiner sa première recette |
| `week_streak` | Régulier | 7 jours consécutifs d'activité |
| `month_streak` | Assidu | 30 jours consécutifs d'activité |
| `quiz_master` | Expert | 10 quiz réussis avec 100% |
| `speed_learner` | Rapide | Compléter un cours en moins de 24h |
| `helper` | Entraide | Aider 10 autres apprenants |
| `top_weekly` | Champion | Top 1 du classement hebdomadaire |
| `level_10` | Grand Maître | Atteindre le niveau 10 |

---

## Live Sessions

### GET /sessions/upcoming

Liste les sessions live à venir.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |
| `course_id` | string | No | Filter par cours |
| `limit` | integer | No | Max sessions (default: 10) |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "dd0e8400-e29b-41d4-a716-446655440008",
      "course_id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Live: Maîtriser la Hollandaise",
      "description": "Session interactive sur la sauce hollandaise",
      "instructor_id": "123456789012345678",
      "scheduled_at": "2026-02-05T18:00:00Z",
      "duration_minutes": 60,
      "max_participants": 50,
      "current_participants": 23,
      "meeting_url": null,
      "recording_url": null,
      "status": "scheduled"
    }
  ],
  "total": 5
}
```

---

### POST /sessions

Crée une nouvelle session live.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `guild_id` | string | Yes | Discord guild ID |

**Request Body:**
```json
{
  "course_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Live: Maîtriser la Hollandaise",
  "description": "Session interactive sur la sauce hollandaise",
  "instructor_id": "123456789012345678",
  "scheduled_at": "2026-02-05T18:00:00Z",
  "duration_minutes": 60,
  "max_participants": 50,
  "meeting_url": "https://meet.example.com/session123"
}
```

**Response (201 Created):** Même structure que dans GET /sessions/upcoming

---

## Notes pour l'intégration n8n

### Authentication

Tous les endpoints nécessitent le `guild_id` en query parameter pour l'isolation multi-tenant.

### Workflow Types suggérés

1. **Inscription automatique** - Trigger sur achat/cadeau de cours
2. **Notification de progression** - Webhook quand milestone atteint
3. **Attribution de badge** - Logique métier pour badges automatiques
4. **Sync leaderboard** - Cron job quotidien/hebdomadaire
5. **Rappel session live** - Notification avant session

### Codes d'erreur communs

| Code | Error | Description |
|------|-------|-------------|
| 400 | `invalid_request` | Paramètres invalides |
| 400 | `already_enrolled` | Déjà inscrit au cours |
| 400 | `invalid_status` | Transition de statut invalide |
| 402 | `insufficient_credits` | Pas assez de crédits |
| 404 | `not_found` | Ressource non trouvée |
| 409 | `conflict` | Conflit (ex: badge déjà attribué) |

### Rate Limits

- Standard: 100 req/min par guild_id
- Bulk operations: 10 req/min
