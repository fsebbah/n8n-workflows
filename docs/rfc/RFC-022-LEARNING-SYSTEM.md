# RFC-022 : Système d'apprentissage culinaire

| Champ | Valeur |
|-------|--------|
| **Auteur** | Équipe plugin-recipes |
| **Statut** | Draft |
| **Date** | 2026-02-03 |
| **Composants** | plugin-recipes, chatbot-core, API, n8n |
| **Inspiration** | Document "Apprentissage Hybride : Relever le Défi de l'Engagement Numérique" (méthode SCAMPER) |

---

## 1. Résumé

Cette RFC propose l'implémentation d'un **système d'apprentissage culinaire complet** dans plugin-recipes, permettant :

- **Salles de cours** virtuelles sur Discord (channels, threads, groupes privés)
- **Système de rôles** (Formateur, Apprenant, Mentor)
- **Quiz adaptatifs** avec IA et évaluation pratique
- **Gamification** (XP, badges, classements, parcours)
- **Cours en ligne** 100% via Discord (vidéo/audio)
- **Monétisation** flexible (gratuit, payant, sponsoring)

L'objectif est de créer une expérience d'apprentissage engageante inspirée des meilleures pratiques (Duolingo, Netflix, Discord/Slack).

---

## 2. Contexte et motivation

### 2.1 Analyse du document "Apprentissage Hybride" (méthode SCAMPER)

| Principe SCAMPER | Application à plugin-recipes |
|------------------|------------------------------|
| **Substituer** | Forums gamifiés (Discord), quiz adaptatifs IA, micro-contenus, badges |
| **Combiner** | Présentiel virtuel + digital, travail individuel + collectif |
| **Adapter** | Personnalisation Netflix, gamification Duolingo, codes Discord |
| **Modifier** | Formats courts, rythme régulier, formateur animateur |
| **Proposer** | Quiz compétitifs, mentorat inversé, portfolios |
| **Éliminer** | Un seul outil (Discord), contenus ciblés, notifications limitées |
| **Réorganiser** | Problème réel avant théorie, produire avant expliquer |

### 2.2 Objectifs

1. **Engagement** : Rendre l'apprentissage culinaire motivant et interactif
2. **Flexibilité** : Permettre aux formateurs de configurer leurs cours
3. **Progression** : Suivre et valoriser les acquis des apprenants
4. **Communauté** : Favoriser l'entraide entre apprenants
5. **Monétisation** : Modèle économique viable pour les formateurs

---

## 3. Architecture fonctionnelle

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DISCORD SERVER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ #accueil-cours  │  │ #module-sauces  │  │ #module-patisserie│            │
│  │ (public)        │  │ (permanent)     │  │ (permanent)     │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Threads temporaires par session                              │           │
│  │ ├── Session: Béchamel 101 (3 fév 14h)                       │           │
│  │ ├── Session: Pâte feuilletée (4 fév 10h)                    │           │
│  │ └── Session: Accords mets-vins (5 fév 18h)                  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Channels privés par groupe                                   │           │
│  │ ├── #groupe-débutants-janvier (apprenant role)              │           │
│  │ ├── #groupe-patisserie-avancé (apprenant role)              │           │
│  │ └── #mentors-cuisine (mentor role)                          │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PLUGIN-RECIPES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  LearningService    │  QuizService      │  ProgressionService              │
│  - Gestion cours    │  - QCM            │  - XP/Niveaux                    │
│  - Sessions         │  - Adaptatif IA   │  - Badges                        │
│  - Évaluations      │  - Photos plats   │  - Classements                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌──────────┐    ┌──────────┐    ┌──────────┐
             │   n8n    │    │   API    │    │  Redis   │
             │ Workflows│    │ Database │    │  Cache   │
             └──────────┘    └──────────┘    └──────────┘
```

### 3.2 Modèle de données

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENTITÉS PRINCIPALES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐               │
│  │   Course    │       │   Module    │       │   Lesson    │               │
│  ├─────────────┤       ├─────────────┤       ├─────────────┤               │
│  │ id          │──┐    │ id          │──┐    │ id          │               │
│  │ title       │  │    │ course_id   │◄─┘    │ module_id   │◄──────────────┤
│  │ description │  │    │ title       │  │    │ title       │               │
│  │ instructor  │  │    │ order       │  │    │ type        │               │
│  │ price       │  │    │ duration    │  │    │ content     │               │
│  │ is_free     │  │    │ objectives  │  │    │ duration    │               │
│  │ sponsor_id  │  │    └─────────────┘  │    │ video_url   │               │
│  │ created_at  │  │                     │    └─────────────┘               │
│  └─────────────┘  │                     │                                   │
│                   │                     │                                   │
│  ┌─────────────┐  │    ┌─────────────┐  │    ┌─────────────┐               │
│  │   Session   │◄─┘    │    Quiz     │◄─┘    │  Question   │               │
│  ├─────────────┤       ├─────────────┤       ├─────────────┤               │
│  │ id          │       │ id          │──┐    │ id          │               │
│  │ course_id   │       │ lesson_id   │  │    │ quiz_id     │◄──────────────┤
│  │ channel_id  │       │ type        │  │    │ type        │               │
│  │ thread_id   │       │ adaptive    │  │    │ text        │               │
│  │ start_time  │       │ time_limit  │  │    │ options     │               │
│  │ end_time    │       │ passing_score│ │    │ correct     │               │
│  │ is_live     │       └─────────────┘  │    │ difficulty  │               │
│  │ recording   │                        │    │ points      │               │
│  └─────────────┘                        │    └─────────────┘               │
│                                         │                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              PROGRESSION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐               │
│  │  Learner    │       │ Enrollment  │       │  Progress   │               │
│  ├─────────────┤       ├─────────────┤       ├─────────────┤               │
│  │ discord_id  │──┐    │ id          │──┐    │ id          │               │
│  │ level       │  │    │ learner_id  │◄─┘    │ enrollment  │◄──────────────┤
│  │ xp_total    │  │    │ course_id   │       │ lesson_id   │               │
│  │ role        │  │    │ status      │       │ status      │               │
│  │ badges[]    │  │    │ enrolled_at │       │ score       │               │
│  │ streak_days │  │    │ completed_at│       │ attempts    │               │
│  │ mentor_id   │  │    └─────────────┘       │ completed_at│               │
│  └─────────────┘  │                          └─────────────┘               │
│                   │                                                         │
│  ┌─────────────┐  │    ┌─────────────┐       ┌─────────────┐               │
│  │   Badge     │  │    │  QuizAttempt│       │ Submission  │               │
│  ├─────────────┤  │    ├─────────────┤       ├─────────────┤               │
│  │ id          │  │    │ id          │       │ id          │               │
│  │ name        │  │    │ learner_id  │◄──────│ learner_id  │◄──────────────┤
│  │ description │  │    │ quiz_id     │       │ lesson_id   │               │
│  │ icon        │  │    │ score       │       │ type        │ (photo, texte)│
│  │ xp_reward   │  │    │ answers[]   │       │ content_url │               │
│  │ criteria    │  │    │ started_at  │       │ feedback    │               │
│  │ rarity      │  │    │ finished_at │       │ grade       │               │
│  └─────────────┘  │    └─────────────┘       │ graded_by   │               │
│                   │                          └─────────────┘               │
│  ┌─────────────┐  │                                                         │
│  │ Leaderboard │◄─┘                                                         │
│  ├─────────────┤                                                            │
│  │ id          │                                                            │
│  │ type        │ (global, course, weekly)                                   │
│  │ learner_id  │                                                            │
│  │ score       │                                                            │
│  │ rank        │                                                            │
│  │ period      │                                                            │
│  └─────────────┘                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Fonctionnalités détaillées

### 4.1 Salles de cours

#### Types de salles (configurables par le formateur)

| Type | Cas d'usage | Durée | Visibilité |
|------|-------------|-------|------------|
| **Channel permanent** | Module récurrent (ex: #module-sauces) | Illimitée | Public ou rôle |
| **Thread temporaire** | Session unique (ex: Atelier béchamel 3 fév) | Archivé après session | Public ou rôle |
| **Channel privé groupe** | Cohorte d'apprenants | Durée du parcours | Rôle uniquement |

#### Commandes formateur

```
/cours créer <titre> [--type=channel|thread|privé] [--durée=<minutes>]
/cours configurer <cours_id> --channel=<#channel> --role=<@role>
/cours session <cours_id> --date="2026-02-10 14:00" --durée=90
/cours archiver <session_id>
```

### 4.2 Système de rôles

#### Rôles et permissions

| Rôle | Description | Permissions |
|------|-------------|-------------|
| **Formateur** | Créateur de cours | Créer/modifier cours, évaluer, voir stats |
| **Apprenant** | Suit les cours | S'inscrire, participer, soumettre |
| **Mentor** | Apprenant avancé qui aide | Répondre questions, corriger pairs, bonus XP |
| **Admin** | Administrateur serveur | Toutes permissions + config serveur |

#### Gestion des rôles Discord

```python
# Synchronisation automatique avec les rôles Discord
class RoleManager:
    async def assign_role(self, user_id: str, role_type: LearningRole):
        """Assigne un rôle Discord basé sur le rôle d'apprentissage."""
        discord_role = self.config.role_mapping[role_type]
        await self.guild.get_member(user_id).add_roles(discord_role)

    async def promote_to_mentor(self, learner_id: str, course_id: str):
        """Promeut un apprenant en mentor pour un cours."""
        # Vérifie critères (score > 85%, cours complété, etc.)
        # Ajoute rôle mentor Discord
        # Crée entrée Mentor en base
```

#### Commandes rôles

```
/formateur devenir               # Demande à devenir formateur
/mentor proposer @utilisateur    # Proposer un apprenant comme mentor
/apprenant stats                 # Voir ses propres statistiques
```

### 4.3 Contenu des cours

#### Sources de contenu

| Source | Description | Workflow |
|--------|-------------|----------|
| **Import formateur** | Le formateur crée hors Discord | Upload fichiers, liens YouTube |
| **Génération IA** | Le bot génère un cours | Formateur valide avant publication |
| **Recettes existantes** | Base de recettes plugin-recipes | Transformation en contenu pédagogique |

#### Workflow de création IA

```
Formateur: /cours générer "Maîtriser les sauces mères"

Bot: 📝 Je génère le cours "Maîtriser les sauces mères"...

[Génération IA via n8n → LLM]

Bot: ✅ Cours généré ! Voici la structure proposée :

📚 **Maîtriser les sauces mères**

**Module 1 : Les bases**
- Leçon 1.1 : Le roux (15 min)
- Leçon 1.2 : La béchamel (20 min)
- Quiz : Les fondamentaux

**Module 2 : Sauces brunes**
- Leçon 2.1 : L'espagnole (25 min)
- Leçon 2.2 : La demi-glace (30 min)
- Quiz : Sauces brunes

[Boutons: ✅ Valider | ✏️ Modifier | ❌ Annuler]
```

#### Types de contenus

| Type | Format | Durée recommandée |
|------|--------|-------------------|
| **Micro-leçon** | Texte + images | 3-5 min |
| **Vidéo courte** | Lien YouTube/embed | 5-10 min |
| **Démonstration live** | Discord audio/vidéo | 15-30 min |
| **Exercice pratique** | Instructions + soumission photo | Variable |

### 4.4 Système de quiz

#### Types de quiz

| Type | Description | Correction |
|------|-------------|------------|
| **QCM classique** | Questions à choix multiples | Automatique |
| **Adaptatif IA** | Difficulté ajustée selon performance | Automatique + IA |
| **Évaluation pratique** | Soumettre photo du plat réalisé | Formateur/Mentor/IA |

#### Quiz adaptatif IA

```python
class AdaptiveQuizService:
    async def get_next_question(
        self,
        learner_id: str,
        quiz_id: str,
        current_score: float
    ) -> Question:
        """
        Sélectionne la prochaine question selon le niveau actuel.

        - Si score > 80% : question plus difficile
        - Si score < 50% : question plus facile
        - Sinon : même niveau
        """
        difficulty = self._calculate_target_difficulty(current_score)
        return await self._select_question(quiz_id, difficulty, learner_id)

    async def evaluate_photo_submission(
        self,
        submission: Submission
    ) -> PhotoEvaluation:
        """
        Évalue une photo de plat via IA (vision model).

        Critères :
        - Présentation visuelle
        - Respect de la recette
        - Technique apparente
        """
        # Appel LLM vision via n8n
        result = await self.n8n_client.call_webhook(
            "learning-evaluate-photo",
            {
                "image_url": submission.content_url,
                "recipe_id": submission.recipe_id,
                "criteria": self._get_evaluation_criteria(submission.lesson_id)
            }
        )
        return PhotoEvaluation(**result)
```

#### Interface quiz Discord

```
Bot: 📝 **Quiz : Les sauces mères**
     Question 3/10 | Difficulté : ⭐⭐

     Quelle est la base de la sauce béchamel ?

     🅰️ Roux blanc + lait
     🅱️ Roux brun + fond de veau
     🅲️ Tomates + huile d'olive
     🅳️ Crème + jaunes d'œufs

     ⏱️ 30 secondes restantes

[Boutons: A | B | C | D]
```

### 4.5 Progression et gamification

#### Système XP et niveaux

| Action | XP gagnés |
|--------|-----------|
| Compléter une leçon | +10 XP |
| Réussir un quiz (>70%) | +25 XP |
| Quiz parfait (100%) | +50 XP (bonus) |
| Soumettre un plat évalué | +30 XP |
| Évaluation "Excellent" | +20 XP (bonus) |
| Streak 7 jours | +100 XP |
| Aider en tant que mentor | +15 XP |

#### Niveaux

| Niveau | XP requis | Titre |
|--------|-----------|-------|
| 1 | 0 | Commis |
| 2 | 100 | Apprenti |
| 3 | 300 | Cuisinier |
| 4 | 600 | Chef de partie |
| 5 | 1000 | Sous-chef |
| 6 | 1500 | Chef |
| 7 | 2500 | Chef exécutif |
| 8 | 4000 | Maître cuisinier |
| 9 | 6000 | Grand Chef |
| 10 | 10000 | Chef étoilé |

#### Badges

| Badge | Critère | Rareté |
|-------|---------|--------|
| 🥄 Premier pas | Compléter sa première leçon | Commun |
| 🔥 En feu | Streak de 7 jours | Commun |
| 🎯 Perfectionniste | 3 quiz parfaits consécutifs | Rare |
| 👨‍🍳 Sauce Master | Compléter le parcours sauces | Rare |
| 🏆 Top Chef | Atteindre le top 10 du classement | Épique |
| 🌟 Mentor d'or | Aider 50 apprenants | Épique |
| 💎 Légende | Compléter tous les parcours | Légendaire |

#### Classements

```
/classement [global|cours|semaine]

Bot: 🏆 **Classement de la semaine**

     🥇 @Marie_Cuisine    │ 1,250 XP │ Niveau 6
     🥈 @ChefPierre       │ 1,180 XP │ Niveau 5
     🥉 @CookingFan42     │ 1,050 XP │ Niveau 5
     4. @Vous             │   980 XP │ Niveau 5 ⬆️
     5. @PatissierPro     │   920 XP │ Niveau 4

     📊 Votre progression : +320 XP cette semaine (+2 places)
```

### 4.6 Parcours d'apprentissage

#### Parcours par spécialité

```
┌─────────────────────────────────────────────────────────────┐
│                    PARCOURS DISPONIBLES                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🍳 Bases culinaires          🥧 Pâtisserie                 │
│  ├── Module 1: Coupes         ├── Module 1: Pâtes           │
│  ├── Module 2: Cuissons       ├── Module 2: Crèmes          │
│  ├── Module 3: Sauces         ├── Module 3: Biscuits        │
│  └── Module 4: Assaisonnement └── Module 4: Montage         │
│                                                             │
│  🌍 Cuisines du monde         🥗 Cuisine healthy            │
│  ├── Module 1: Française      ├── Module 1: Équilibre       │
│  ├── Module 2: Italienne      ├── Module 2: Substitutions   │
│  ├── Module 3: Asiatique      ├── Module 3: Cuisson douce   │
│  └── Module 4: Moyen-Orient   └── Module 4: Meal prep       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Recommandations personnalisées (type Netflix)

```python
class RecommendationService:
    async def get_recommendations(self, learner_id: str) -> list[Course]:
        """
        Recommande des cours basés sur :
        - Parcours en cours
        - Historique de complétion
        - Préférences (tags des recettes consultées)
        - Niveau actuel
        - Cours populaires similaires
        """
        learner = await self.get_learner(learner_id)

        # Cours pour continuer le parcours
        in_progress = await self._get_in_progress_courses(learner)

        # Cours recommandés par similarité
        similar = await self._get_similar_courses(learner.completed_courses)

        # Cours populaires du niveau
        popular = await self._get_popular_for_level(learner.level)

        return self._merge_and_rank(in_progress, similar, popular)
```

### 4.7 Monétisation

#### Modèles de tarification

| Modèle | Description | Implémentation |
|--------|-------------|----------------|
| **Gratuit** | Cours d'introduction, contenus de base | `course.is_free = True` |
| **Payant (crédits)** | Utilise le système de crédits existant | `course.credit_cost = 5` |
| **Abonnement** | Accès illimité mensuel | Via Stripe subscriptions |
| **Sponsorisé** | Sponsor finance, gratuit pour l'apprenant | `course.sponsor_id = "ustensiles-pro"` |

#### Flux de paiement

```
Apprenant: /cours s'inscrire "Pâtisserie avancée"

Bot: 📚 **Pâtisserie avancée** par @ChefMarie

     💰 Prix : 10 crédits
     ⏱️ Durée : 4 modules, ~8h
     ⭐ Note : 4.8/5 (127 avis)

     Votre solde : 15 crédits

     [Boutons: ✅ S'inscrire (10 crédits) | ℹ️ Détails]

[Clic sur S'inscrire]

Bot: ✅ Inscription confirmée !
     10 crédits débités. Solde : 5 crédits

     Accès au channel #patisserie-avancee activé
     Commencez par le Module 1 : /cours commencer
```

#### Sponsoring

```yaml
# Exemple de cours sponsorisé
course:
  id: "sauces-meres-2026"
  title: "Maîtriser les sauces mères"
  is_free: true
  sponsor:
    id: "ustensiles-pro"
    name: "Ustensiles Pro"
    logo_url: "https://..."
    message: "Ce cours vous est offert par Ustensiles Pro"
    cta:
      text: "Découvrir nos casseroles"
      url: "https://ustensiles-pro.com/casseroles"
```

---

## 5. Répartition des responsabilités

### 5.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         RÉPARTITION PAR ÉQUIPE                               │
├────────────────┬────────────────┬────────────────┬───────────────────────────┤
│    n8n         │     API        │  chatbot-core  │     plugin-recipes        │
├────────────────┼────────────────┼────────────────┼───────────────────────────┤
│ Workflows      │ Base données   │ Services       │ Implémentation            │
│ Orchestration  │ REST API       │ Discord        │ spécifique cuisine        │
│ Intégrations   │ Logique métier │ génériques     │                           │
├────────────────┼────────────────┼────────────────┼───────────────────────────┤
│ - Génération   │ - Tables cours │ - RoleManager  │ - LearningService         │
│   cours IA     │ - Tables quiz  │   (générique)  │ - QuizService             │
│ - Évaluation   │ - Tables       │ - Channel      │ - ProgressionService      │
│   photos IA    │   progression  │   Manager      │ - RecommendationService   │
│ - Notifications│ - CRUD         │ - Thread       │ - Commandes /cours        │
│ - Rappels      │   endpoints    │   Manager      │ - Commandes /quiz         │
│ - Stats export │ - Stats/       │ - Session      │ - Views (embeds, boutons) │
│                │   analytics    │   audio/video  │ - Logique badges cuisine  │
└────────────────┴────────────────┴────────────────┴───────────────────────────┘
```

### 5.2 Équipe n8n

#### Workflows à créer

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `learning-generate-course` | Webhook | Génère structure de cours via LLM |
| `learning-generate-quiz` | Webhook | Génère questions de quiz via LLM |
| `learning-evaluate-photo` | Webhook | Évalue photo de plat via LLM vision |
| `learning-adapt-difficulty` | Webhook | Calcule prochaine difficulté |
| `learning-send-reminder` | Cron | Envoie rappels aux apprenants inactifs |
| `learning-weekly-stats` | Cron | Génère et envoie stats hebdomadaires |
| `learning-badge-check` | Webhook | Vérifie et attribue badges |

#### Exemple workflow génération cours

```json
{
  "name": "learning-generate-course",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "learning-generate-course",
        "httpMethod": "POST"
      }
    },
    {
      "name": "Generate Structure",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api.anthropic.com/v1/messages",
        "method": "POST",
        "body": {
          "model": "claude-3-haiku-20240307",
          "messages": [
            {
              "role": "user",
              "content": "Génère la structure d'un cours de cuisine sur: {{ $json.topic }}"
            }
          ]
        }
      }
    },
    {
      "name": "Parse Response",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Parse la réponse LLM en structure cours"
      }
    },
    {
      "name": "Save to API",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "{{ $env.API_BASE_URL }}/courses/draft",
        "method": "POST"
      }
    }
  ]
}
```

### 5.3 Équipe API

#### Endpoints à créer

```yaml
# Courses
POST   /api/v1/courses                    # Créer un cours
GET    /api/v1/courses                    # Lister les cours
GET    /api/v1/courses/:id                # Détail d'un cours
PUT    /api/v1/courses/:id                # Modifier un cours
DELETE /api/v1/courses/:id                # Supprimer un cours
POST   /api/v1/courses/:id/publish        # Publier un cours
GET    /api/v1/courses/:id/stats          # Statistiques du cours

# Modules & Lessons
POST   /api/v1/courses/:id/modules        # Ajouter un module
GET    /api/v1/modules/:id/lessons        # Lister les leçons
POST   /api/v1/modules/:id/lessons        # Ajouter une leçon

# Enrollments
POST   /api/v1/enrollments                # S'inscrire à un cours
GET    /api/v1/enrollments/:learner_id    # Inscriptions d'un apprenant
DELETE /api/v1/enrollments/:id            # Se désinscrire

# Progress
POST   /api/v1/progress                   # Enregistrer une progression
GET    /api/v1/progress/:learner_id       # Progression d'un apprenant
GET    /api/v1/progress/:learner_id/:course_id  # Progression sur un cours

# Quizzes
POST   /api/v1/quizzes                    # Créer un quiz
GET    /api/v1/quizzes/:id                # Détail d'un quiz
POST   /api/v1/quizzes/:id/attempts       # Soumettre une tentative
GET    /api/v1/quizzes/:id/attempts/:learner_id  # Tentatives d'un apprenant

# Submissions (évaluations pratiques)
POST   /api/v1/submissions                # Soumettre un travail
GET    /api/v1/submissions/:id            # Détail d'une soumission
PUT    /api/v1/submissions/:id/grade      # Noter une soumission

# Gamification
GET    /api/v1/learners/:id               # Profil apprenant (XP, niveau, badges)
GET    /api/v1/leaderboards/:type         # Classement (global, course, weekly)
POST   /api/v1/badges/check/:learner_id   # Vérifier badges à attribuer

# Recommendations
GET    /api/v1/recommendations/:learner_id  # Cours recommandés

# Sessions (cours live)
POST   /api/v1/sessions                   # Créer une session
GET    /api/v1/sessions/upcoming          # Sessions à venir
PUT    /api/v1/sessions/:id/start         # Démarrer une session
PUT    /api/v1/sessions/:id/end           # Terminer une session
```

#### Schéma base de données

```sql
-- Cours
CREATE TABLE courses (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructor_id VARCHAR(50) NOT NULL,  -- Discord ID
    price_credits INTEGER DEFAULT 0,
    is_free BOOLEAN DEFAULT false,
    sponsor_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'draft',  -- draft, published, archived
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Modules
CREATE TABLE modules (
    id UUID PRIMARY KEY,
    course_id UUID REFERENCES courses(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL,
    duration_minutes INTEGER,
    objectives JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Leçons
CREATE TABLE lessons (
    id UUID PRIMARY KEY,
    module_id UUID REFERENCES modules(id),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL,  -- text, video, live, exercise
    content TEXT,
    video_url VARCHAR(500),
    duration_minutes INTEGER,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Quiz
CREATE TABLE quizzes (
    id UUID PRIMARY KEY,
    lesson_id UUID REFERENCES lessons(id),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) DEFAULT 'standard',  -- standard, adaptive
    time_limit_seconds INTEGER,
    passing_score INTEGER DEFAULT 70,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Questions
CREATE TABLE questions (
    id UUID PRIMARY KEY,
    quiz_id UUID REFERENCES quizzes(id),
    type VARCHAR(20) NOT NULL,  -- mcq, true_false, photo
    text TEXT NOT NULL,
    options JSONB,  -- Pour QCM
    correct_answer VARCHAR(50),
    difficulty INTEGER DEFAULT 1,  -- 1-5
    points INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Apprenants
CREATE TABLE learners (
    discord_id VARCHAR(50) PRIMARY KEY,
    level INTEGER DEFAULT 1,
    xp_total INTEGER DEFAULT 0,
    role VARCHAR(20) DEFAULT 'learner',  -- learner, mentor, instructor
    badges JSONB DEFAULT '[]',
    streak_days INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP,
    mentor_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inscriptions
CREATE TABLE enrollments (
    id UUID PRIMARY KEY,
    learner_id VARCHAR(50) REFERENCES learners(discord_id),
    course_id UUID REFERENCES courses(id),
    status VARCHAR(20) DEFAULT 'active',  -- active, completed, dropped
    enrolled_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    UNIQUE(learner_id, course_id)
);

-- Progression
CREATE TABLE progress (
    id UUID PRIMARY KEY,
    enrollment_id UUID REFERENCES enrollments(id),
    lesson_id UUID REFERENCES lessons(id),
    status VARCHAR(20) DEFAULT 'not_started',  -- not_started, in_progress, completed
    score INTEGER,
    attempts INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(enrollment_id, lesson_id)
);

-- Tentatives quiz
CREATE TABLE quiz_attempts (
    id UUID PRIMARY KEY,
    learner_id VARCHAR(50) REFERENCES learners(discord_id),
    quiz_id UUID REFERENCES quizzes(id),
    score INTEGER,
    answers JSONB,
    started_at TIMESTAMP DEFAULT NOW(),
    finished_at TIMESTAMP
);

-- Soumissions (évaluations pratiques)
CREATE TABLE submissions (
    id UUID PRIMARY KEY,
    learner_id VARCHAR(50) REFERENCES learners(discord_id),
    lesson_id UUID REFERENCES lessons(id),
    type VARCHAR(20) NOT NULL,  -- photo, text
    content_url VARCHAR(500),
    feedback TEXT,
    grade INTEGER,  -- 0-100
    graded_by VARCHAR(50),  -- Discord ID ou 'ai'
    submitted_at TIMESTAMP DEFAULT NOW(),
    graded_at TIMESTAMP
);

-- Sessions live
CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    course_id UUID REFERENCES courses(id),
    channel_id VARCHAR(50),
    thread_id VARCHAR(50),
    title VARCHAR(255),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    is_live BOOLEAN DEFAULT false,
    recording_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Classements
CREATE TABLE leaderboards (
    id UUID PRIMARY KEY,
    type VARCHAR(20) NOT NULL,  -- global, course, weekly
    learner_id VARCHAR(50) REFERENCES learners(discord_id),
    score INTEGER NOT NULL,
    rank INTEGER,
    period VARCHAR(20),  -- 2026-W05, 2026-02, all-time
    course_id UUID REFERENCES courses(id),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(type, learner_id, period, course_id)
);

-- Index
CREATE INDEX idx_enrollments_learner ON enrollments(learner_id);
CREATE INDEX idx_progress_enrollment ON progress(enrollment_id);
CREATE INDEX idx_quiz_attempts_learner ON quiz_attempts(learner_id);
CREATE INDEX idx_leaderboards_type_period ON leaderboards(type, period);
```

### 5.4 Équipe chatbot-core

#### Services génériques à créer

| Service | Description | Réutilisable par |
|---------|-------------|------------------|
| `ChannelManager` | Création/gestion channels Discord | Tous plugins |
| `ThreadManager` | Création/gestion threads Discord | Tous plugins |
| `RoleManager` | Synchronisation rôles Discord | Tous plugins |
| `VoiceSessionManager` | Gestion sessions audio/vidéo | Tous plugins |
| `LeaderboardService` | Classements génériques | Tous plugins |
| `BadgeService` | Système de badges générique | Tous plugins |

#### Interface ChannelManager

```python
# chatbot_core/services/channel_manager.py

class ChannelManager:
    """Gestionnaire de channels Discord."""

    async def create_course_channel(
        self,
        guild_id: int,
        name: str,
        category_id: int | None = None,
        role_ids: list[int] | None = None,
        topic: str | None = None
    ) -> discord.TextChannel:
        """
        Crée un channel pour un cours.

        Args:
            guild_id: ID du serveur
            name: Nom du channel (sera slugifié)
            category_id: Catégorie parente (optionnel)
            role_ids: Rôles ayant accès (optionnel, public si vide)
            topic: Description du channel

        Returns:
            Channel créé
        """
        ...

    async def create_session_thread(
        self,
        channel_id: int,
        name: str,
        auto_archive_duration: int = 1440  # 24h
    ) -> discord.Thread:
        """Crée un thread pour une session de cours."""
        ...

    async def archive_thread(self, thread_id: int) -> None:
        """Archive un thread après une session."""
        ...

    async def set_channel_permissions(
        self,
        channel_id: int,
        role_id: int,
        permissions: discord.PermissionOverwrite
    ) -> None:
        """Configure les permissions d'un channel."""
        ...
```

#### Interface VoiceSessionManager

```python
# chatbot_core/services/voice_session_manager.py

class VoiceSessionManager:
    """Gestionnaire de sessions audio/vidéo Discord."""

    async def create_voice_channel(
        self,
        guild_id: int,
        name: str,
        category_id: int | None = None,
        user_limit: int | None = None
    ) -> discord.VoiceChannel:
        """Crée un channel vocal pour un cours live."""
        ...

    async def start_session(
        self,
        channel_id: int,
        instructor_id: int
    ) -> VoiceSession:
        """Démarre une session live."""
        ...

    async def end_session(
        self,
        session_id: str,
        save_recording: bool = False
    ) -> None:
        """Termine une session live."""
        ...

    async def get_participants(
        self,
        channel_id: int
    ) -> list[discord.Member]:
        """Liste les participants actuels."""
        ...
```

### 5.5 Équipe plugin-recipes

#### Services spécifiques à créer

| Service | Description |
|---------|-------------|
| `LearningService` | Orchestration des cours cuisine |
| `QuizService` | Logique quiz culinaires |
| `ProgressionService` | XP, niveaux, badges cuisine |
| `RecommendationService` | Recommandations personnalisées |
| `CourseContentService` | Transformation recettes → contenu |

#### Commandes à implémenter

```python
# Commandes Formateur
/cours créer <titre> [--type] [--prix]     # Créer un cours
/cours modifier <id>                        # Modifier un cours
/cours publier <id>                         # Publier un cours
/cours stats <id>                           # Statistiques
/cours session <id> --date --durée          # Planifier session live

# Commandes Quiz
/quiz créer <lesson_id>                     # Créer un quiz
/quiz générer <lesson_id> --questions=10    # Générer quiz IA
/quiz lancer <quiz_id>                      # Lancer un quiz en live

# Commandes Apprenant
/apprendre                                  # Menu principal
/apprendre catalogue                        # Voir les cours disponibles
/apprendre inscrit                          # Mes inscriptions
/apprendre continuer                        # Reprendre où j'en étais
/apprendre progression                      # Ma progression
/apprendre badges                           # Mes badges
/apprendre classement                       # Voir le classement

# Commandes Mentor
/mentor dashboard                           # Tableau de bord mentor
/mentor évaluer <submission_id>             # Évaluer une soumission
/mentor aider                               # Voir questions en attente
```

#### Structure des fichiers

```
plugin-recipes/
├── src/
│   ├── learning/
│   │   ├── __init__.py
│   │   ├── service.py              # LearningService
│   │   ├── quiz_service.py         # QuizService
│   │   ├── progression_service.py  # ProgressionService
│   │   ├── recommendation_service.py
│   │   ├── course_content_service.py
│   │   └── models.py               # Course, Module, Lesson, Quiz, etc.
│   │
│   ├── commands/
│   │   ├── learning_commands.py    # /apprendre, /cours
│   │   ├── quiz_commands.py        # /quiz
│   │   └── mentor_commands.py      # /mentor
│   │
│   └── views/
│       ├── course_views.py         # CourseCardView, LessonView
│       ├── quiz_views.py           # QuizView, QuestionView
│       └── progression_views.py    # ProgressView, LeaderboardView
│
├── config/
│   ├── learning.yaml               # Configuration apprentissage
│   └── badges.yaml                 # Définition des badges cuisine
```

---

## 6. Interfaces utilisateur

### 6.1 Menu principal apprentissage

```
/apprendre

Bot: 📚 **Bienvenue dans l'École de Cuisine !**

     👤 **Votre profil**
     Niveau 5 (Sous-chef) │ 1,250 XP │ 🔥 Streak: 12 jours

     📊 **Progression**
     ├── Bases culinaires: ████████░░ 80%
     ├── Pâtisserie: ██████░░░░ 60%
     └── Cuisines du monde: ████░░░░░░ 40%

     🎯 **Recommandé pour vous**
     1. Continuer "Les sauces brunes" (Module 2)
     2. Nouveau: "Accords mets-vins" ⭐ 4.9
     3. Populaire: "Pâtes fraîches maison"

[Boutons: 📖 Continuer | 📚 Catalogue | 🏆 Classement | ⚙️ Profil]
```

### 6.2 Vue d'un cours

```
Bot: 📚 **Maîtriser les sauces mères**
     par @ChefMarie │ ⭐ 4.8 (127 avis)

     📝 Apprenez les 5 sauces mères de la cuisine française
     et leurs dérivées pour sublimer tous vos plats.

     📋 **Contenu**
     ├── Module 1: Les bases (4 leçons) ✅
     ├── Module 2: Sauces blanches (3 leçons) 🔄
     ├── Module 3: Sauces brunes (3 leçons) 🔒
     └── Module 4: Sauces émulsionnées (4 leçons) 🔒

     ⏱️ Durée: ~4h │ 🎓 14 leçons │ 📝 4 quiz

     💰 **Gratuit** (offert par Ustensiles Pro)

[Boutons: ▶️ Continuer Module 2 | 📋 Voir détails | ⭐ Avis]
```

### 6.3 Interface quiz

```
Bot: 📝 **Quiz: Les sauces blanches**
     Question 3/8 │ ⭐⭐ Moyen │ +15 XP

     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

     Quelle matière grasse utilise-t-on
     traditionnellement pour un roux blanc ?

     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Boutons en grille 2x2:]
     🅰️ Beurre          │ 🅱️ Huile d'olive
     🅲️ Margarine       │ 🅳️ Saindoux

     ⏱️ 25 secondes
```

### 6.4 Résultat quiz

```
Bot: 🎉 **Quiz terminé !**

     📊 **Votre score: 85%** (17/20 points)
     ⭐ Excellent ! Vous maîtrisez les sauces blanches.

     ✅ Bonnes réponses: 6/8
     ❌ Erreurs: 2
     ⏱️ Temps: 3min 42s

     💡 **À revoir:**
     • La température idéale du roux
     • Les proportions beurre/farine

     🎁 **Récompenses**
     +50 XP │ 🏅 Badge "Sauce Blanche" débloqué !

[Boutons: 📖 Revoir les erreurs | ▶️ Leçon suivante | 🏠 Menu]
```

### 6.5 Évaluation pratique

```
Bot: 👨‍🍳 **Exercice pratique: La béchamel**

     📋 **Instructions:**
     1. Réalisez une béchamel selon la recette apprise
     2. Prenez une photo de votre sauce
     3. Envoyez-la ici pour évaluation

     🎯 **Critères d'évaluation:**
     • Texture lisse (pas de grumeaux)
     • Consistance nappante
     • Couleur blanche/crème

     ⏱️ Vous avez 48h pour soumettre

[Bouton: 📷 Soumettre ma photo]

--- Après soumission ---

Bot: ✅ **Photo reçue !**

     🤖 **Évaluation automatique (IA):**

     ├── Texture: ⭐⭐⭐⭐⭐ Excellente
     ├── Couleur: ⭐⭐⭐⭐☆ Très bien
     └── Présentation: ⭐⭐⭐⭐⭐ Parfaite

     📝 **Commentaire:**
     "Belle béchamel ! La texture est parfaitement lisse
     et la consistance nappante. Légèrement plus claire
     que l'idéal, peut-être un peu moins de cuisson."

     🎁 **Score: 92/100** │ +45 XP

[Boutons: 👨‍🏫 Demander avis formateur | ▶️ Continuer]
```

---

## 7. Plan d'implémentation

### Phase 1 : Infrastructure (2-3 semaines)

| Équipe | Tâches | Priorité |
|--------|--------|----------|
| **API** | Créer tables BD (courses, modules, lessons, quizzes) | P0 |
| **API** | Endpoints CRUD cours et modules | P0 |
| **chatbot-core** | ChannelManager, ThreadManager | P0 |
| **chatbot-core** | RoleManager | P0 |
| **n8n** | Workflow génération cours IA | P1 |

### Phase 2 : Cours et contenu (2-3 semaines)

| Équipe | Tâches | Priorité |
|--------|--------|----------|
| **plugin-recipes** | LearningService | P0 |
| **plugin-recipes** | Commandes /cours (créer, modifier, publier) | P0 |
| **plugin-recipes** | Views cours (CourseCardView, LessonView) | P0 |
| **API** | Endpoints inscriptions et progression | P0 |
| **n8n** | Workflow transformation recettes → contenu | P1 |

### Phase 3 : Quiz (2 semaines)

| Équipe | Tâches | Priorité |
|--------|--------|----------|
| **plugin-recipes** | QuizService | P0 |
| **plugin-recipes** | Commandes /quiz | P0 |
| **plugin-recipes** | Views quiz (QuizView, QuestionView) | P0 |
| **API** | Endpoints quiz et tentatives | P0 |
| **n8n** | Workflow quiz adaptatif IA | P1 |
| **n8n** | Workflow évaluation photo IA | P1 |

### Phase 4 : Gamification (2 semaines)

| Équipe | Tâches | Priorité |
|--------|--------|----------|
| **plugin-recipes** | ProgressionService (XP, niveaux) | P0 |
| **plugin-recipes** | Système de badges cuisine | P0 |
| **chatbot-core** | LeaderboardService (générique) | P0 |
| **API** | Endpoints gamification | P0 |
| **n8n** | Workflow attribution badges | P1 |

### Phase 5 : Sessions live et monétisation (2 semaines)

| Équipe | Tâches | Priorité |
|--------|--------|----------|
| **chatbot-core** | VoiceSessionManager | P0 |
| **plugin-recipes** | Gestion sessions live | P0 |
| **API** | Endpoints sessions et paiements | P0 |
| **n8n** | Workflows rappels et notifications | P1 |

### Phase 6 : Recommandations et polish (1-2 semaines)

| Équipe | Tâches | Priorité |
|--------|--------|----------|
| **plugin-recipes** | RecommendationService | P1 |
| **n8n** | Workflow stats hebdomadaires | P2 |
| **Tous** | Tests, documentation, bug fixes | P0 |

---

## 8. Métriques de succès

### KPIs Engagement

- [ ] Taux de complétion des cours > 60%
- [ ] Taux de rétention à 7 jours > 70%
- [ ] Nombre de quiz passés par apprenant/semaine > 3
- [ ] Temps moyen par session > 15 minutes

### KPIs Technique

- [ ] Latence réponse quiz < 500ms
- [ ] Évaluation photo IA < 10s
- [ ] Disponibilité 99.5%
- [ ] 0 régression sur fonctionnalités existantes

### KPIs Business

- [ ] Conversion gratuit → payant > 15%
- [ ] Revenus cours/mois (objectif à définir)
- [ ] NPS apprenants > 50

---

## 9. Risques et mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Complexité trop élevée | Retard livraison | Haute | MVP minimal, itérations |
| Évaluation IA inexacte | Frustration utilisateurs | Moyenne | Validation humaine optionnelle |
| Faible adoption | ROI négatif | Moyenne | Beta testeurs, feedback early |
| Charge serveur Discord | Rate limits | Faible | Caching, batching |
| Coûts LLM élevés | Dépassement budget | Moyenne | Quotas, modèles économiques |

---

## 10. Questions ouvertes — Réponses

| Question | Décision | Notes |
|----------|----------|-------|
| **Intégration calendrier** : Synchroniser avec Google Calendar ? | ✅ Oui | Connexion au service prévue + service d'envoi d'email |
| **Certificats** : Générer des certificats PDF de complétion ? | 🟡 Souhaité | Mise en œuvre à définir (génération PDF côté n8n ?) |
| **Mobile** : Interface spécifique mobile Discord ? | ❌ Non pertinent | Discord gère nativement le responsive mobile |
| **Multi-langue** : Cours en plusieurs langues ? | ✅ Must have | Utiliser `TranslationService` existant |
| **Marketplace** : Permettre à des formateurs externes de vendre leurs cours ? | 🟡 À considérer | Pour une phase ultérieure |

---

## 11. Analyse architecturale chatbot-core

### 11.1 État des lieux

Services génériques chatbot-core :

| Service prévu | Statut | Dépendances existantes |
|---------------|--------|------------------------|
| `ChannelManager` | ✅ Implémenté | `FrameworkBot`, `discord.py` |
| `ThreadManager` | ✅ Implémenté | `ChannelManager` (optionnel) |
| `RoleManager` | ✅ Implémenté | `FrameworkBot`, `RedisService` |
| `LeaderboardService` | ✅ Implémenté | `RedisService`, `N8nClient` |
| `BadgeService` | ✅ Implémenté | `RedisService`, `N8nClient`, `PromptManager` |
| `VoiceSessionManager` | ✅ Implémenté | `ChannelManager` |
| `EventBus` | ✅ Implémenté | - |
| `I18nService` | ✅ Implémenté | `RedisService` |
| `Protocols` | ✅ Implémenté | - |

**Infrastructure réutilisable :**
- `DiscordAdapter` : messages, interactions, embeds, pagination
- `RedisConnectionManager` / `BaseRedisService` : caching
- `N8nClient` : communication workflows
- `PromptManager` (RFC-021) : configuration YAML externalisée
- `TranslationService` : internationalisation

### 11.2 Architecture des services Discord

```
┌─────────────────────────────────────────────────────────────────┐
│                     chatbot_core/services/                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  discord/                        gamification/                  │
│  ├── ChannelManager              ├── LeaderboardService         │
│  │   ├── create_channel()        │   ├── update_score()         │
│  │   ├── create_private_channel()│   ├── get_rank()             │
│  │   ├── delete_channel()        │   ├── get_top()              │
│  │   ├── set_permissions()       │   └── persist_to_api()       │
│  │   └── get_or_create_category()│                              │
│  │                               └── BadgeService               │
│  ├── ThreadManager                   ├── load_definitions()     │
│  │   ├── create_thread()             ├── award_badge()          │
│  │   ├── archive_thread()            ├── has_badge()            │
│  │   ├── add_member_to_thread()      ├── get_user_badges()      │
│  │   └── get_active_threads()        └── check_criteria()       │
│  │                                                              │
│  ├── RoleManager                                                │
│  │   ├── configure_role_mapping()                               │
│  │   ├── assign_role()                                          │
│  │   ├── remove_role()                                          │
│  │   ├── has_role()                                             │
│  │   └── sync_roles_from_external()                             │
│  │                                                              │
│  └── VoiceSessionManager                                        │
│      ├── create_voice_channel()                                 │
│      ├── start_session()                                        │
│      ├── end_session()                                          │
│      ├── get_participants()                                     │
│      └── move_member()                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 11.3 Stratégie de stockage

| Service | Cache Redis | Persistance API (via n8n) |
|---------|-------------|---------------------------|
| `ChannelManager` | Non (Discord est la source) | Non |
| `ThreadManager` | Non (Discord est la source) | Non |
| `RoleManager` | Oui (mapping rôles) | Oui (sync bidirectionnelle) |
| `LeaderboardService` | Oui (Sorted Sets) | Oui (périodique) |
| `BadgeService` | Oui (Hash par user) | Oui (à l'attribution) |
| `VoiceSessionManager` | Oui (sessions actives) | Oui (historique) |

### 11.4 Gestion des rate limits Discord

Les opérations de création/modification sont soumises à des rate limits stricts :

| Opération | Limite |
|-----------|--------|
| Créer un channel | 10 / 10s / guild |
| Modifier permissions | 10 / 10s / channel |
| Assigner un rôle | 10 / 10s / guild |

**Stratégie de mitigation :**
1. Queue interne avec backoff exponentiel
2. Batch des opérations quand possible
3. Cache des états pour éviter les appels inutiles

### 11.5 Multi-tenancy

Tous les services DOIVENT supporter plusieurs guilds Discord :
- `guild_id` obligatoire dans toutes les méthodes publiques
- Isolation des données par guild dans Redis (préfixe de clé)
- Configuration de mapping rôles par guild

### 11.6 Internationalisation

Pour supporter le multi-langue (must have) :
- Noms de badges = clés de traduction (`badge.sauce_master.name`)
- Messages système via `TranslationService`
- Définitions YAML avec `name_key` au lieu de `name` en dur

### 11.7 Ordre d'implémentation et dépendances

```
Phase 1 - Infrastructure Discord (semaine 1-2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ChannelManager ──────┐
                     ├──► ThreadManager
RoleManager ─────────┘

Phase 2 - Gamification (semaine 2-3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LeaderboardService ──► BadgeService
                       (utilise LeaderboardService pour XP reward)

Phase 3 - Sessions live (semaine 3-4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ChannelManager ──► VoiceSessionManager
```

### 11.8 Estimation d'effort

| Service | Effort | Priorité | Bloquant pour |
|---------|--------|----------|---------------|
| ChannelManager | 2-3 jours | P0 | ThreadManager, VoiceSessionManager |
| ThreadManager | 1-2 jours | P0 | Sessions temporaires |
| RoleManager | 2-3 jours | P0 | Système de rôles plugin-recipes |
| LeaderboardService | 2-3 jours | P0 | Classements, BadgeService |
| BadgeService | 3-4 jours | P0 | Gamification plugin-recipes |
| VoiceSessionManager | 3-5 jours | P1 | Cours live |
| Tests + Docs | 3-4 jours | P0 | Release |

**Total chatbot-core : 16-24 jours**

### 11.9 Fichier d'implémentation

Voir [WORK-RFC022-CHATBOT-CORE-SERVICES.md](../issues/WORK-RFC022-CHATBOT-CORE-SERVICES.md) pour les spécifications de code détaillées.

---

## 12. Analyse implémentation n8n

### 12.1 Workflows à livrer

| Workflow | Type | Complexité | Description |
|----------|------|------------|-------------|
| `learning-generate-course` | Webhook | Haute | Génère structure de cours via LLM |
| `learning-generate-quiz` | Webhook | Moyenne | Génère questions de quiz via LLM |
| `learning-evaluate-photo` | Webhook | Haute | Évalue photo de plat via LLM Vision |
| `learning-adapt-difficulty` | Webhook | Moyenne | Calcule prochaine difficulté quiz |
| `learning-badge-check` | Webhook | Faible | Vérifie et attribue badges |
| `learning-send-reminder` | Cron | Faible | Envoie rappels aux apprenants inactifs |
| `learning-weekly-stats` | Cron | Moyenne | Génère et envoie stats hebdomadaires |

### 12.2 Planning par phase

#### Phase 1 - Infrastructure (Semaines 1-2)
*En parallèle de l'API qui crée les tables*

| Tâche | Estimation |
|-------|------------|
| Setup structure projet (dossier workflows, conventions) | 0.5j |
| Créer templates de base (webhook + réponse JSON) | 0.5j |
| `learning-badge-check` (le plus simple, pour valider la chaîne) | 1j |
| Tests intégration avec API | 1j |

**Livrable** : 1 workflow fonctionnel, pipeline validé

#### Phase 2 - Génération de contenu (Semaines 3-5)

| Tâche | Estimation |
|-------|------------|
| `learning-generate-course` - Structure de base | 1j |
| `learning-generate-course` - Prompt engineering | 2j |
| `learning-generate-course` - Parsing réponse LLM → format API | 1j |
| `learning-generate-course` - Tests et ajustements | 1j |
| `learning-generate-quiz` - Structure | 0.5j |
| `learning-generate-quiz` - Prompt + parsing | 1.5j |
| `learning-generate-quiz` - Tests | 1j |

**Livrable** : Génération cours + quiz via IA

#### Phase 3 - Quiz et évaluation (Semaines 6-8)

| Tâche | Estimation |
|-------|------------|
| `learning-adapt-difficulty` - Logique algorithme | 1j |
| `learning-adapt-difficulty` - Intégration API | 0.5j |
| `learning-evaluate-photo` - Intégration LLM Vision | 1j |
| `learning-evaluate-photo` - Prompt évaluation culinaire | 2j |
| `learning-evaluate-photo` - Scoring et feedback structuré | 1j |
| Tests bout-en-bout quiz adaptatif | 1j |

**Livrable** : Quiz adaptatif + évaluation photo IA

#### Phase 4 - Gamification (Semaines 9-10)

| Tâche | Estimation |
|-------|------------|
| `learning-badge-check` - Logique complète tous badges | 2j |
| Intégration avec ProgressionService | 1j |
| Tests attribution badges | 0.5j |

**Livrable** : Système de badges complet

#### Phase 5 - Notifications (Semaines 11-12)

| Tâche | Estimation |
|-------|------------|
| `learning-send-reminder` - Query inactifs | 0.5j |
| `learning-send-reminder` - Messages Discord personnalisés | 1j |
| `learning-send-reminder` - Configuration fréquence/règles | 0.5j |
| `learning-weekly-stats` - Agrégation données | 1j |
| `learning-weekly-stats` - Génération rapport (embed Discord) | 1j |
| `learning-weekly-stats` - Envoi aux formateurs | 0.5j |

**Livrable** : Rappels automatiques + stats hebdo

#### Phase 6 - Polish (Semaines 13-14)

| Tâche | Estimation |
|-------|------------|
| Documentation workflows | 1j |
| Optimisation prompts IA | 2j |
| Gestion erreurs et retry | 1j |
| Tests charge | 1j |
| Bug fixes | 2j |

### 12.3 Résumé estimation

| Métrique | Valeur |
|----------|--------|
| **Durée totale** | 14 semaines |
| **Workflows livrés** | 7 |
| **Effort estimé** | 35-40 jours-homme |
| **Ressources** | 1-2 devs |

### 12.4 Dépendances critiques

```
┌─────────────────────────────────────────────────────────────────┐
│                    DÉPENDANCES N8N                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  API (bloquant)                    chatbot-core (non bloquant)  │
│  ━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  POST /courses/draft ──────► learning-generate-course           │
│  POST /quizzes ────────────► learning-generate-quiz             │
│  POST /submissions/:id/grade ► learning-evaluate-photo          │
│  GET /progress/:learner ───► learning-adapt-difficulty          │
│  POST /badges/award ───────► learning-badge-check               │
│  GET /enrollments/inactive ► learning-send-reminder             │
│  GET /stats/weekly ────────► learning-weekly-stats              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 12.5 Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Qualité réponses LLM | Cours/quiz incohérents | Itérations prompts, exemples few-shot, validation humaine |
| Latence évaluation photo | UX dégradée | Timeout adapté, file d'attente, feedback "en cours" |
| Dépendance API en retard | Blocage développement | Mocker les endpoints pour avancer |
| Coûts LLM imprévus | Dépassement budget | Monitoring usage, alertes quotas, modèles économiques |
| Prompts non maintenables | Dette technique | Externaliser dans fichiers YAML (RFC-021) |

### 12.6 Structure des workflows

```
workflows/
├── learning/
│   ├── learning-generate-course.json
│   ├── learning-generate-quiz.json
│   ├── learning-evaluate-photo.json
│   ├── learning-adapt-difficulty.json
│   ├── learning-badge-check.json
│   ├── learning-send-reminder.json
│   └── learning-weekly-stats.json
│
├── prompts/
│   ├── course-generation.yaml      # Prompt génération cours
│   ├── quiz-generation.yaml        # Prompt génération quiz
│   ├── photo-evaluation.yaml       # Prompt évaluation photo
│   └── feedback-templates.yaml     # Templates messages
│
└── tests/
    └── learning/
        ├── test-generate-course.json
        ├── test-evaluate-photo.json
        └── fixtures/
            ├── sample-course-request.json
            └── sample-photo-submission.json
```

### 12.7 Spécifications techniques par workflow

#### `learning-generate-course`

```
Trigger: POST /webhook/learning-generate-course
Input: { topic: string, level: string, duration_hours: number, instructor_id: string }
Output: { course: Course, modules: Module[], lessons: Lesson[] }

Étapes:
1. Webhook receive
2. Build prompt (topic, level, constraints)
3. Call LLM (Claude Haiku)
4. Parse JSON response
5. Validate structure
6. POST to API /courses/draft
7. Return created course
```

#### `learning-evaluate-photo`

```
Trigger: POST /webhook/learning-evaluate-photo
Input: { submission_id: string, image_url: string, recipe_id: string, criteria: string[] }
Output: { score: number, feedback: string, details: { criterion: string, score: number }[] }

Étapes:
1. Webhook receive
2. Fetch recipe reference (for comparison)
3. Build evaluation prompt with criteria
4. Call LLM Vision (Claude with image)
5. Parse structured evaluation
6. PUT to API /submissions/:id/grade
7. Return evaluation
```

#### `learning-send-reminder`

```
Trigger: Cron (daily 10:00)
Input: none
Output: { sent: number, errors: string[] }

Étapes:
1. GET /enrollments?inactive_days=7
2. Filter by notification preferences
3. For each learner:
   a. Build personalized message
   b. Send Discord DM via webhook
4. Log results
```

---

## 13. Analyse implémentation API

### 13.1 Périmètre

| Domaine | Endpoints | Complexité | Notes |
|---------|-----------|------------|-------|
| Courses | 8 endpoints | Moyenne | CRUD + publish + stats |
| Modules & Lessons | 3 endpoints | Faible | CRUD basique |
| Enrollments | 3 endpoints | Faible | Intégration système crédits existant |
| Progress | 3 endpoints | Moyenne | Upserts fréquents |
| Quizzes | 4 endpoints | Moyenne | Coordination n8n pour adaptatif |
| Submissions | 3 endpoints | Moyenne | Réception évaluations IA depuis n8n |
| Gamification | 3 endpoints | Faible | Persistance depuis chatbot-core |
| Recommendations | 1 endpoint | Faible | Données brutes uniquement (logique dans plugin-recipes) |
| Sessions | 4 endpoints | Moyenne | Gestion sessions live |
| **Total** | **~32 endpoints** | | |

### 13.2 Schéma base de données — Ajustements recommandés

#### Multi-tenancy

Ajouter `guild_id` sur les tables principales (conformément à §11.5) :

```sql
-- Ajout sur courses
ALTER TABLE courses ADD COLUMN guild_id VARCHAR(50) NOT NULL;
CREATE INDEX idx_courses_guild ON courses(guild_id);

-- Ajout sur enrollments
ALTER TABLE enrollments ADD COLUMN guild_id VARCHAR(50) NOT NULL;
CREATE INDEX idx_enrollments_guild ON enrollments(guild_id);

-- Ajout sur leaderboards
ALTER TABLE leaderboards ADD COLUMN guild_id VARCHAR(50) NOT NULL;
CREATE INDEX idx_leaderboards_guild ON leaderboards(guild_id);
```

#### Table learners — Recommandation

Préférer un UUID interne avec index unique sur `discord_id` pour plus de flexibilité :

```sql
CREATE TABLE learners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id VARCHAR(50) NOT NULL,
    guild_id VARCHAR(50) NOT NULL,
    level INTEGER DEFAULT 1,
    xp_total INTEGER DEFAULT 0,
    role VARCHAR(20) DEFAULT 'learner',
    badges JSONB DEFAULT '[]',
    streak_days INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP,
    mentor_id UUID REFERENCES learners(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(discord_id, guild_id)
);
```

### 13.3 Intégration avec les autres équipes

#### Flux de données

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUX API                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  n8n → API (écriture)                                                   │
│  ━━━━━━━━━━━━━━━━━━━━                                                   │
│  POST /courses/draft ◄──────── learning-generate-course                 │
│  PUT /submissions/:id/grade ◄─ learning-evaluate-photo                  │
│  POST /badges/award ◄───────── learning-badge-check                     │
│                                                                         │
│  API → n8n (lecture)                                                    │
│  ━━━━━━━━━━━━━━━━━━━━                                                   │
│  GET /enrollments?inactive_days=7 ──► learning-send-reminder            │
│  GET /stats/weekly ─────────────────► learning-weekly-stats             │
│  GET /progress/:learner ────────────► learning-adapt-difficulty         │
│                                                                         │
│  chatbot-core → API (persistance)                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                       │
│  LeaderboardService.persist_to_api() ──► POST /leaderboards/sync        │
│  BadgeService.award_badge() ───────────► POST /badges/award             │
│                                                                         │
│  plugin-recipes → API (CRUD)                                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                            │
│  Toutes les commandes /cours, /quiz, /apprendre                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Contrats d'interface prioritaires

| Endpoint | Consommateur | JSON Schema requis |
|----------|--------------|-------------------|
| `POST /courses/draft` | n8n | Oui (structure cours générée) |
| `PUT /submissions/:id/grade` | n8n | Oui (évaluation IA) |
| `POST /leaderboards/sync` | chatbot-core | Oui (batch scores) |

### 13.4 Points techniques

#### Système de crédits

Utiliser le système existant — pas de nouveau développement. L'inscription à un cours payant :
1. Vérifie le solde via endpoint crédits existant
2. Débite les crédits
3. Crée l'enrollment

#### Sponsors

Pas de table dédiée — le champ `sponsor_id` est une référence externe simple. Si besoin d'un CRUD sponsors, à planifier en phase ultérieure (Marketplace §10).

#### Classements temps réel vs persistance

| Donnée | Source de vérité | Persistance API |
|--------|------------------|-----------------|
| Score temps réel | Redis (Sorted Sets via chatbot-core) | Non |
| Classement historique | API | Oui (sync périodique) |
| Badges attribués | Redis (cache) + API (persistance) | À l'attribution |

### 13.5 Planning par phase

| Phase | Tâches API | Durée | Bloque |
|-------|------------|-------|--------|
| **Phase 1** | Tables `courses`, `modules`, `lessons` + CRUD | 2 sem | plugin-recipes |
| **Phase 2** | Tables `enrollments`, `progress` + endpoints | 2 sem | n8n rappels |
| **Phase 3** | Tables `quizzes`, `questions`, `quiz_attempts` + endpoints | 2 sem | n8n adaptatif |
| **Phase 4** | Tables `learners`, `leaderboards` + endpoints gamification | 1.5 sem | chatbot-core sync |
| **Phase 5** | Tables `sessions`, `submissions` + endpoints | 2 sem | Cours live |
| **Phase 6** | Tests, docs OpenAPI, optimisations | 1.5 sem | Release |
| **Total** | | **11 semaines** | |

### 13.6 Endpoints additionnels identifiés

Endpoints non listés en §5.3 mais nécessaires :

```yaml
# Sync depuis chatbot-core
POST   /api/v1/leaderboards/sync          # Batch sync scores depuis Redis
POST   /api/v1/badges/award               # Persister attribution badge

# Support multi-guild
GET    /api/v1/guilds/:guild_id/courses   # Cours par serveur
GET    /api/v1/guilds/:guild_id/learners  # Apprenants par serveur

# Stats pour n8n
GET    /api/v1/stats/weekly               # Données pour rapport hebdo
GET    /api/v1/enrollments/inactive       # Apprenants inactifs (rappels)
```

### 13.7 Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Charge upserts `progress` | Performance BD | Index composites, batch updates |
| Sync Redis ↔ API désynchronisée | Données incohérentes | Reconciliation périodique, logs |
| Contrats n8n non respectés | Erreurs silencieuses | Validation JSON Schema stricte |
| Multi-guild mal isolé | Fuite de données | Tests d'isolation, review code |

### 13.8 Checklist pré-implémentation

- [ ] Valider schéma BD avec équipe chatbot-core (champs `guild_id`)
- [ ] Définir JSON Schemas pour endpoints n8n
- [ ] Documenter intégration système crédits existant
- [ ] Créer spec OpenAPI avant implémentation
- [ ] Planifier migration si tables existantes impactées

---

## 14. Références

- Document source : "Apprentissage Hybride : Relever le Défi de l'Engagement Numérique"
- [RFC-021 : Prompt Externalization](./RFC-021-prompt-externalization.md)
- [RFC-011 : LLM Memory](./RFC-011-LLM-MEMORY.md)
- [Discord.py Documentation](https://discordpy.readthedocs.io/)
- [Duolingo Design Principles](https://design.duolingo.com/)

---

*Analyse API ajoutée le 2026-02-03 par équipe API back.*
