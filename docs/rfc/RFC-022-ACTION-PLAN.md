# Plan d'Action RFC-022 : Système d'Apprentissage Culinaire

| Champ | Valeur |
|-------|--------|
| **Date création** | 2026-02-03 |
| **Durée totale estimée** | 14 semaines |
| **Équipes impliquées** | API, chatbot-core, plugin-recipes, n8n |
| **Effort total** | ~70-90 jours-homme |

---

## Vue d'ensemble des phases

```
Semaine    1   2   3   4   5   6   7   8   9  10  11  12  13  14
           ├───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┤
Phase 1    ████████████████                                      Infrastructure
Phase 2                    ████████████████                      Cours & Contenu
Phase 3                                    ████████████          Quiz
Phase 4                                            ████████      Gamification
Phase 5                                                ████████  Sessions Live
Phase 6                                                    ████  Polish
```

---

## Phase 1 : Infrastructure (Semaines 1-3)

### Objectif
Mettre en place les fondations : base de données, services Discord génériques, premier workflow n8n.

### Équipe API (P0 - Bloquant)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| Créer tables `courses`, `modules`, `lessons` | 2j | Migration SQL |
| Créer tables `quizzes`, `questions` | 1j | Migration SQL |
| Endpoints CRUD courses (8 endpoints) | 3j | API + tests |
| Endpoints modules & lessons (3 endpoints) | 1.5j | API + tests |
| Documentation OpenAPI initiale | 1j | openapi.yaml |

**Livrable Phase 1 API** : Spec OpenAPI + 14 endpoints fonctionnels

### Équipe chatbot-core (P0 - Bloquant)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `ChannelManager` - Création/gestion channels | 2-3j | Service + tests |
| `ThreadManager` - Création/gestion threads | 1-2j | Service + tests |
| `RoleManager` - Synchronisation rôles Discord | 2-3j | Service + tests |
| Tests d'intégration Discord | 1j | Suite de tests |

**Livrable Phase 1 chatbot-core** : 3 services génériques opérationnels

### Équipe n8n (P1)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| Setup structure projet (`workflows/learning/`) | 0.5j | Arborescence |
| Template webhook + JSON response | 0.5j | Template réutilisable |
| `learning-badge-check` (validation chaîne) | 1j | Workflow actif |
| Tests intégration avec API | 1j | Tests passants |

**Livrable Phase 1 n8n** : 1 workflow fonctionnel, pipeline validé

### Dépendances Phase 1

```
API (tables BD) ──────────► n8n (peut tester endpoints)
                │
                └──────────► plugin-recipes (peut développer services)

chatbot-core ─────────────► plugin-recipes (peut utiliser services Discord)
```

### Milestone Phase 1
- [ ] Tables BD créées et migrées
- [ ] 14 endpoints API documentés et testés
- [ ] ChannelManager, ThreadManager, RoleManager opérationnels
- [ ] 1 workflow n8n fonctionnel
- [ ] **Review inter-équipes** : valider contrats d'interface

---

## Phase 2 : Cours et Contenu (Semaines 4-6)

### Objectif
Permettre la création, gestion et consultation des cours.

### Équipe API (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| Tables `enrollments`, `progress` | 1j | Migration SQL |
| Endpoints enrollments (3 endpoints) | 2j | API + tests |
| Endpoints progress (3 endpoints) | 2j | API + tests |
| Intégration système crédits existant | 1j | Tests intégration |

**Livrable Phase 2 API** : 6 endpoints supplémentaires

### Équipe plugin-recipes (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `LearningService` - Orchestration cours | 3j | Service |
| Commandes `/cours créer`, `/cours modifier`, `/cours publier` | 2j | Commands |
| `CourseCardView`, `LessonView` (embeds Discord) | 2j | Views |
| Commandes `/apprendre catalogue`, `/apprendre inscrit` | 1.5j | Commands |
| Tests unitaires et intégration | 1.5j | Tests |

**Livrable Phase 2 plugin-recipes** : Gestion complète des cours

### Équipe n8n (P1)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `learning-generate-course` - Structure de base | 1j | Workflow |
| `learning-generate-course` - Prompt engineering | 2j | Prompts optimisés |
| `learning-generate-course` - Parsing LLM → API | 1j | Code node |
| Tests et ajustements | 1j | Tests passants |

**Livrable Phase 2 n8n** : Génération automatique de cours via IA

### Dépendances Phase 2

```
API (POST /courses/draft) ◄─────── n8n (learning-generate-course)
        │
        └──────────────────────────► plugin-recipes (LearningService)
```

### Milestone Phase 2
- [ ] Un formateur peut créer un cours manuellement
- [ ] Un formateur peut générer un cours via IA
- [ ] Un apprenant peut s'inscrire et voir le catalogue
- [ ] Système de crédits intégré pour cours payants
- [ ] **Demo** : création et inscription à un cours complet

---

## Phase 3 : Quiz (Semaines 7-9)

### Objectif
Implémenter le système de quiz avec évaluation IA.

### Équipe API (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| Tables `quiz_attempts`, `submissions` | 1j | Migration SQL |
| Endpoints quizzes (4 endpoints) | 2j | API + tests |
| Endpoints submissions (3 endpoints) | 2j | API + tests |
| Endpoint `GET /progress/:learner` pour n8n | 0.5j | Endpoint |

**Livrable Phase 3 API** : 7 endpoints supplémentaires

### Équipe plugin-recipes (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `QuizService` - Logique quiz | 3j | Service |
| Commandes `/quiz créer`, `/quiz lancer` | 2j | Commands |
| `QuizView`, `QuestionView` (embeds interactifs) | 3j | Views |
| Soumission photos (évaluation pratique) | 1.5j | Feature |
| Tests | 1.5j | Tests |

**Livrable Phase 3 plugin-recipes** : Quiz fonctionnels + évaluation pratique

### Équipe n8n (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `learning-generate-quiz` - Structure | 0.5j | Workflow |
| `learning-generate-quiz` - Prompts + parsing | 1.5j | Prompts |
| `learning-adapt-difficulty` - Algorithme | 1.5j | Workflow |
| `learning-evaluate-photo` - Intégration Vision | 1j | Workflow |
| `learning-evaluate-photo` - Prompt évaluation | 2j | Prompts |
| Tests bout-en-bout | 1j | Tests |

**Livrable Phase 3 n8n** : Quiz adaptatif + évaluation photo IA

### Dépendances Phase 3

```
API (GET /progress/:learner) ───► n8n (learning-adapt-difficulty)
API (PUT /submissions/:id/grade) ◄── n8n (learning-evaluate-photo)
                │
                └─────────────────► plugin-recipes (QuizService)
```

### Milestone Phase 3
- [ ] Quiz QCM fonctionnel avec timer
- [ ] Quiz adaptatif ajuste la difficulté
- [ ] Évaluation photo par IA opérationnelle
- [ ] Feedback structuré aux apprenants
- [ ] **Demo** : parcours complet leçon → quiz → évaluation

---

## Phase 4 : Gamification (Semaines 10-11)

### Objectif
Implémenter XP, niveaux, badges et classements.

### Équipe API (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| Tables `learners`, `leaderboards` | 1j | Migration SQL |
| Endpoints gamification (3 endpoints) | 1.5j | API + tests |
| `POST /leaderboards/sync` (batch depuis Redis) | 1j | Endpoint |
| `POST /badges/award` | 0.5j | Endpoint |

**Livrable Phase 4 API** : 5 endpoints supplémentaires

### Équipe chatbot-core (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `LeaderboardService` - Sorted Sets Redis | 2-3j | Service |
| `BadgeService` - Définitions YAML + attribution | 3-4j | Service |
| Sync périodique vers API | 1j | Job |
| Tests | 1j | Tests |

**Livrable Phase 4 chatbot-core** : 2 services gamification génériques

### Équipe plugin-recipes (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `ProgressionService` - XP, niveaux | 2j | Service |
| Configuration badges culinaires (YAML) | 1j | Config |
| Commandes `/apprendre progression`, `/apprendre badges` | 1.5j | Commands |
| Commande `/apprendre classement` | 1j | Command |
| `ProgressView`, `LeaderboardView` | 1.5j | Views |

**Livrable Phase 4 plugin-recipes** : Gamification complète

### Équipe n8n (P1)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `learning-badge-check` - Logique complète | 2j | Workflow |
| Intégration ProgressionService | 1j | Tests |

**Livrable Phase 4 n8n** : Attribution automatique des badges

### Dépendances Phase 4

```
chatbot-core (LeaderboardService) ───► API (POST /leaderboards/sync)
chatbot-core (BadgeService) ─────────► API (POST /badges/award)
        │
        └────────────────────────────► plugin-recipes (ProgressionService)
```

### Milestone Phase 4
- [ ] XP gagnés à chaque action
- [ ] Niveaux avec titres culinaires
- [ ] Badges attribués automatiquement
- [ ] Classements global, par cours, hebdomadaire
- [ ] **Demo** : progression complète avec badges

---

## Phase 5 : Sessions Live et Monétisation (Semaines 12-13)

### Objectif
Permettre les cours en direct et finaliser la monétisation.

### Équipe API (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| Table `sessions` | 0.5j | Migration SQL |
| Endpoints sessions (4 endpoints) | 2j | API + tests |
| `GET /enrollments/inactive` pour rappels | 0.5j | Endpoint |
| `GET /stats/weekly` pour rapports | 1j | Endpoint |

**Livrable Phase 5 API** : 6 endpoints supplémentaires

### Équipe chatbot-core (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `VoiceSessionManager` - Channels vocaux | 3-5j | Service |
| Gestion participants | 1j | Feature |
| Tests | 1j | Tests |

**Livrable Phase 5 chatbot-core** : Gestion sessions audio/vidéo

### Équipe plugin-recipes (P0)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| Commande `/cours session` | 1.5j | Command |
| Intégration VoiceSessionManager | 1j | Integration |
| Gestion sponsoring (affichage) | 1j | Feature |

**Livrable Phase 5 plugin-recipes** : Cours live opérationnels

### Équipe n8n (P1)

| Tâche | Effort | Livrable |
|-------|--------|----------|
| `learning-send-reminder` - Query inactifs | 0.5j | Workflow |
| `learning-send-reminder` - Messages Discord | 1j | Workflow |
| `learning-weekly-stats` - Agrégation | 1j | Workflow |
| `learning-weekly-stats` - Rapport Discord | 1.5j | Workflow |

**Livrable Phase 5 n8n** : Rappels automatiques + stats hebdo

### Milestone Phase 5
- [ ] Formateur peut planifier une session live
- [ ] Apprenants rejoignent le channel vocal
- [ ] Rappels envoyés aux inactifs
- [ ] Stats hebdomadaires générées
- [ ] **Demo** : session live complète

---

## Phase 6 : Polish et Release (Semaine 14)

### Objectif
Finaliser, documenter, tester, corriger.

### Toutes les équipes

| Tâche | Effort | Responsable |
|-------|--------|-------------|
| Documentation utilisateur | 2j | plugin-recipes |
| Documentation technique | 1j | Toutes |
| Tests de charge | 1j | API + n8n |
| Optimisation prompts IA | 2j | n8n |
| Bug fixes | 2j | Toutes |
| Gestion erreurs et retry | 1j | n8n |
| Review sécurité | 1j | API |
| Déploiement staging | 0.5j | DevOps |
| Tests UAT avec beta-testeurs | 2j | Toutes |
| Déploiement production | 0.5j | DevOps |

### Milestone Phase 6
- [ ] Toute la documentation à jour
- [ ] Tests de charge passés (100 utilisateurs simultanés)
- [ ] Feedback beta-testeurs intégré
- [ ] 0 bug bloquant
- [ ] **RELEASE**

---

## Récapitulatif des livrables par équipe

### API (11 semaines, ~25 jours-homme)

| Phase | Endpoints | Tables |
|-------|-----------|--------|
| Phase 1 | 14 | courses, modules, lessons, quizzes, questions |
| Phase 2 | 6 | enrollments, progress |
| Phase 3 | 7 | quiz_attempts, submissions |
| Phase 4 | 5 | learners, leaderboards |
| Phase 5 | 6 | sessions |
| **Total** | **38 endpoints** | **10 tables** |

### chatbot-core (3-4 semaines, ~16-24 jours-homme)

| Service | Effort | Priorité |
|---------|--------|----------|
| ChannelManager | 2-3j | P0 |
| ThreadManager | 1-2j | P0 |
| RoleManager | 2-3j | P0 |
| LeaderboardService | 2-3j | P0 |
| BadgeService | 3-4j | P0 |
| VoiceSessionManager | 3-5j | P1 |
| Tests + Docs | 3-4j | P0 |

### plugin-recipes (~25-30 jours-homme)

| Service/Feature | Effort |
|-----------------|--------|
| LearningService | 3j |
| QuizService | 3j |
| ProgressionService | 2j |
| Commandes (12+) | 10j |
| Views (6+) | 8j |
| Tests | 4j |

### n8n (14 semaines, ~35-40 jours-homme)

| Workflow | Phase | Effort |
|----------|-------|--------|
| learning-badge-check | 1 + 4 | 3j |
| learning-generate-course | 2 | 5j |
| learning-generate-quiz | 3 | 2j |
| learning-adapt-difficulty | 3 | 1.5j |
| learning-evaluate-photo | 3 | 4j |
| learning-send-reminder | 5 | 2j |
| learning-weekly-stats | 5 | 2.5j |
| Tests + Polish | 6 | 7j |

---

## Risques et mitigations

| Risque | Impact | Prob. | Mitigation | Owner |
|--------|--------|-------|------------|-------|
| Retard API bloque tout | Élevé | Moyenne | Mock endpoints, contrats early | API Lead |
| Qualité IA insuffisante | Moyen | Moyenne | Validation humaine, itérations | n8n Lead |
| Rate limits Discord | Moyen | Faible | Queue + backoff, caching | chatbot-core |
| Coûts LLM dépassés | Moyen | Moyenne | Quotas, monitoring, Haiku | n8n Lead |
| Adoption faible | Élevé | Moyenne | Beta testeurs, feedback early | Product |

---

## Checklist pré-lancement

### Technique
- [ ] Tous les endpoints API documentés (OpenAPI)
- [ ] JSON Schemas validés entre équipes
- [ ] Tests unitaires > 80% coverage
- [ ] Tests intégration passants
- [ ] Tests de charge validés
- [ ] Monitoring en place (logs, alertes)
- [ ] Rollback plan documenté

### Produit
- [ ] Documentation utilisateur complète
- [ ] Tutoriel premier cours
- [ ] Beta testeurs ont validé le parcours
- [ ] FAQ préparée
- [ ] Communication de lancement prête

### Sécurité
- [ ] Review permissions Discord
- [ ] Isolation multi-guild validée
- [ ] Rate limiting en place
- [ ] Pas de données sensibles dans logs

---

## Contacts

| Équipe | Lead | Canal |
|--------|------|-------|
| API | TBD | #api-team |
| chatbot-core | TBD | #chatbot-core |
| plugin-recipes | TBD | #plugin-recipes |
| n8n | TBD | #n8n-workflows |
| Product | TBD | #product |

---

*Plan d'action généré le 2026-02-03*
