# RFC-048: Discord Education Architecture

**Status**: Draft v2
**Author**: Frontend Team
**Date**: 2026-03-23
**Audience**: Frontend, Backend, chatbot-core (infra Discord), azy.mcp (composant intelligence)

---

## Résumé

Architecture d'un serveur Discord orienté formation/éducation. Chaque serveur représente une promotion (ou un établissement). Les étudiants sont invités par email, associent leur compte Discord via OAuth, et reçoivent automatiquement un thread privé unique où ils interagissent avec les bots de chaque matière. Les profs ont un espace dédié par matière où les questions étudiants sont relayées par le bot.

---

## Principes fondamentaux

1. **Un thread unique par étudiant** — l'étudiant a un seul espace privé, tous bots confondus
2. **Le prof n'entre jamais dans le thread étudiant** — le bot relaie les échanges
3. **Le bot est l'intermédiaire** — il route les messages entre étudiant et prof
4. **Invitation par email** — l'étudiant n'a pas besoin d'être déjà sur le serveur
5. **Threads, pas channels** — pour rester sous la limite de 500 channels Discord

---

## Contraintes Discord

| Limite | Valeur | Impact |
|--------|--------|--------|
| Channels par serveur | 500 max | Utiliser des threads (illimités) pour le suivi individuel |
| Catégories par serveur | 250 max | Pas un problème |
| Bots | Par serveur (pas par channel) | Le bot adapte son contexte selon le channel/thread |
| Thread privé | Visibilité contrôlée par les membres ajoutés | Seuls l'étudiant + le bot voient le thread |
| Threads | Illimités, archivés après inactivité | Réactiver automatiquement si nouveau message |
| OAuth scope `guilds.join` | Permet d'ajouter un membre au serveur | Nécessaire pour l'onboarding automatique |

---

## Structure du serveur Discord

```
Serveur "BTS Optique — Promo 2026"
│
├── 📋 ADMINISTRATION
│   ├── #annonces                (readonly étudiants)
│   ├── #planning                (readonly étudiants)
│   └── #ressources              (liens, docs partagés)
│
├── 📚 COURS (1 channel par matière)
│   ├── #optique-geometrique     (bot: expert optique)
│   ├── #physique                (bot: expert physique)
│   ├── #maths                   (bot: expert maths)
│   ├── #anglais-technique       (bot: expert anglais)
│   ├── #tp-labo                 (bot: expert TP)
│   └── ...
│   │
│   └── Usage : questions publiques, entraide entre étudiants,
│       le bot répond avec le contexte de la matière.
│       Les threads de discussion dans ces channels sont publics.
│
├── 🔒 SUIVI INDIVIDUEL (1 seul channel)
│   └── #suivi-individuel
│       ├── Thread "Dupont"      (privé: Dupont + Bot)
│       ├── Thread "Martin"      (privé: Martin + Bot)
│       ├── Thread "Leroy"       (privé: Leroy + Bot)
│       └── ... (N threads, 1 channel)
│       │
│       └── Usage : espace privé de l'étudiant.
│           Il interagit avec tous les bots ici.
│           Il peut demander de l'aide à un prof via /help.
│           Le prof ne voit JAMAIS ce thread directement.
│
├── 👨‍🏫 ESPACE PROFS (1 channel par matière)
│   ├── #prof-optique            (profs optique + bot)
│   ├── #prof-maths              (profs maths + bot)
│   ├── #prof-physique           (profs physique + bot)
│   └── ...
│   │
│   └── Usage : le bot y relaie les questions des étudiants.
│       Le prof répond ici (reply Discord natif).
│       Le bot relaie la réponse dans le thread de l'étudiant.
│
├── 💬 VIE ÉTUDIANTE
│   ├── #general
│   ├── #entraide
│   └── #off-topic
│
└── Rôles Discord
    ├── @Owner (admin)
    ├── @Prof-Optique, @Prof-Maths, ...
    ├── @Étudiant-Promo-2026
    └── @Bot-MCP
```

### Budget channels

| Section | Channels | Threads |
|---------|----------|---------|
| Administration | 3 | — |
| Cours (10 matières) | 10 | publics, libres |
| Suivi individuel | 1 | 200 (un par étudiant) |
| Espace profs (10 matières) | 10 | libres |
| Vie étudiante | 3 | — |
| **Total** | **~27** | **~200+** |

Largement sous la limite de 500 channels. Peut supporter plusieurs promotions sur le même serveur si besoin.

---

## Flux d'onboarding étudiant

```
Prof/Owner                  App Web                     Backend                   Discord
    │                          │                           │                         │
    │  1. Crée la promo        │                           │                         │
    │  "BTS Optique 2026"      │                           │                         │
    │  + liste emails étudiants│                           │                         │
    │ ────────────────────────>│                           │                         │
    │                          │  2. POST /api/promos      │                         │
    │                          │  { name, guild_id,        │                         │
    │                          │    students: [emails] }   │                         │
    │                          │ ────────────────────────>│                         │
    │                          │                           │  3. Envoie emails       │
    │                          │                           │     d'invitation        │
    │                          │                           │                         │
    │                          │                           │                         │
Étudiant                    App Web                     Backend                   Discord
    │                          │                           │                         │
    │  4. Reçoit email         │                           │                         │
    │  "Rejoignez votre promo" │                           │                         │
    │  Clique le lien          │                           │                         │
    │ ────────────────────────>│                           │                         │
    │                          │                           │                         │
    │  5. Crée son compte      │                           │                         │
    │  (Firebase Auth)         │                           │                         │
    │ ────────────────────────>│                           │                         │
    │                          │                           │                         │
    │  6. "Connecte ton        │                           │                         │
    │   Discord"               │                           │                         │
    │  → OAuth Discord         │                           │                         │
    │  (scope: identify +      │                           │                         │
    │   guilds.join)           │                           │                         │
    │ ────────────────────────>│                           │                         │
    │                          │  7. Reçoit discord_id,    │                         │
    │                          │  username, avatar         │                         │
    │                          │ ────────────────────────>│                         │
    │                          │                           │                         │
    │                          │                           │  8. Bot API :           │
    │                          │                           │  PUT /guilds/{id}/      │
    │                          │                           │    members/{user_id}    │
    │                          │                           │  → Ajoute au serveur    │
    │                          │                           │ ───────────────────────>│
    │                          │                           │                         │
    │                          │                           │  9. Assigne rôle        │
    │                          │                           │  @Étudiant-Promo-2026   │
    │                          │                           │ ───────────────────────>│
    │                          │                           │                         │
    │                          │                           │  10. Crée thread privé  │
    │                          │                           │  dans #suivi-individuel │
    │                          │                           │  Ajoute: étudiant + bot │
    │                          │                           │ ───────────────────────>│
    │                          │                           │                         │
    │                          │                           │  11. Stocke mapping     │
    │                          │                           │  user_id ↔ thread_id    │
    │                          │                           │  ↔ promo_id             │
    │                          │                           │                         │
    │  12. "Bienvenue !        │                           │                         │
    │   Ton espace Discord     │                           │                         │
    │   est prêt."             │                           │                         │
    │<────────────────────────│                           │                         │
```

---

## Flux de messagerie : étudiant ↔ bot ↔ prof

### Cas 1 : L'étudiant pose une question au bot (autonome)

```
Thread "Dupont"                        Bot MCP
    │                                     │
    │  "Explique la loi de Snell"         │
    │ ──────────────────────────────────>│
    │                                     │  Détecte: matière=optique
    │                                     │  Charge expert optique
    │                                     │  Génère réponse via LLM
    │  "La loi de Snell-Descartes       │
    │   relie les angles d'incidence..." │
    │<──────────────────────────────────│
```

Le bot détecte la matière par analyse sémantique ou par commande explicite (`/matiere optique`).

### Cas 2 : L'étudiant demande un prof (`/help`)

```
Thread "Dupont"              Bot MCP                    #prof-optique
    │                           │                           │
    │  /help "Je comprends      │                           │
    │   pas l'exercice 3        │                           │
    │   sur les lentilles"      │                           │
    │ ────────────────────────>│                           │
    │                           │  Détecte: matière=optique │
    │                           │  Prof assigné: M. Durand  │
    │  "📩 Question transmise   │                           │
    │   à M. Durand"            │                           │
    │<────────────────────────│                           │
    │                           │  📩 Embed:               │
    │                           │  "Dupont a une question   │
    │                           │   en optique"             │
    │                           │  > Je comprends pas       │
    │                           │  > l'exercice 3 sur les   │
    │                           │  > lentilles              │
    │                           │  [Répondre]               │
    │                           │ ────────────────────────>│
    │                           │                           │
    │                           │                    Prof:  │
    │                           │  "Pour l'exercice 3,      │
    │                           │   commence par identifier │
    │                           │   le type de lentille..." │
    │                           │<────────────────────────│
    │                           │                           │
    │  💬 Réponse de M. Durand: │                           │
    │  "Pour l'exercice 3..."   │                           │
    │<────────────────────────│                           │
```

### Cas 3 : L'étudiant switch de matière

```
Thread "Dupont"                        Bot MCP
    │                                     │
    │  /matiere maths                     │
    │ ──────────────────────────────────>│
    │                                     │  Switch expert → maths
    │  "🔄 Contexte: Mathématiques       │
    │   (Prof: Mme Martin)"              │
    │<──────────────────────────────────│
    │                                     │
    │  "Comment résoudre une intégrale   │
    │   par parties ?"                    │
    │ ──────────────────────────────────>│
    │                                     │  Expert maths répond
    │  "L'intégration par parties..."    │
    │<──────────────────────────────────│
```

Alternative à `/matiere` : le bot auto-détecte la matière par le contenu du message (NLP). La commande explicite est un fallback si l'auto-détection échoue.

---

## Commandes slash du bot

| Commande | Qui | Où | Action |
|----------|-----|----|--------|
| `/help "question"` | Étudiant | Thread privé | Relaie la question au prof de la matière détectée |
| `/matiere <nom>` | Étudiant | Thread privé | Switch le contexte expert du bot |
| `/matieres` | Étudiant | Thread privé | Liste les matières disponibles avec les profs |
| `/recap` | Étudiant | Thread privé | Résumé de son avancement (notes, exercices, questions) |
| `/questions` | Prof | Channel prof | Liste les questions en attente de réponse |
| `/stats` | Prof | Channel prof | Stats de sa matière (questions, temps de réponse) |
| `/broadcast "message"` | Prof | Channel prof | Envoie un message à tous les threads étudiants (pour sa matière) |

---

## Modèle de données

### Tables backend

```
promotions
├── id (UUID)
├── tenant_id
├── name ("BTS Optique 2026")
├── guild_id (Discord server ID)
├── academic_year
├── created_at
└── created_by

promotion_subjects (matières)
├── id (UUID)
├── promotion_id (FK)
├── name ("Optique géométrique")
├── slug ("optique")
├── expert_id (FK → experts) — l'expert MCP associé
├── course_channel_id (Discord #optique channel ID)
├── prof_channel_id (Discord #prof-optique channel ID)
└── created_at

promotion_students
├── id (UUID)
├── promotion_id (FK)
├── user_id (FK → users, Firebase UID)
├── email
├── discord_user_id (nullable, rempli après OAuth)
├── discord_username
├── thread_id (Discord thread ID, créé à l'onboarding)
├── status ('invited' | 'registered' | 'discord_linked' | 'active')
├── invited_at
├── joined_at
└── current_subject_slug (matière active dans le thread, nullable)

promotion_teachers
├── id (UUID)
├── promotion_id (FK)
├── user_id (FK → users)
├── subject_id (FK → promotion_subjects)
├── discord_user_id
└── role ('teacher' | 'assistant')

help_requests (questions relayées)
├── id (UUID)
├── student_id (FK → promotion_students)
├── subject_id (FK → promotion_subjects)
├── question_text
├── question_message_id (Discord message ID dans le thread)
├── relay_message_id (Discord message ID dans le channel prof)
├── response_text (nullable)
├── response_message_id (nullable)
├── status ('pending' | 'answered' | 'closed')
├── asked_at
└── answered_at
```

### Mapping bot

Le bot utilise ces tables pour router les messages :

```
Message dans thread_id X
  → SELECT * FROM promotion_students WHERE thread_id = X
  → Récupère: promotion_id, user_id, current_subject_slug
  → SELECT * FROM promotion_subjects WHERE promotion_id AND slug
  → Récupère: expert_id → charge l'expert MCP
  → Le bot répond avec le bon contexte
```

```
/help dans thread_id X
  → Même lookup étudiant + matière
  → SELECT * FROM promotion_teachers WHERE subject_id AND promotion_id
  → Récupère: prof_channel_id, discord_user_id du prof
  → Bot poste dans #prof-{matière} en mentionnant le prof
  → INSERT INTO help_requests (status='pending')
```

```
Reply du prof dans #prof-{matière} (reply sur un message de help_request)
  → SELECT * FROM help_requests WHERE relay_message_id = replied_message_id
  → Récupère: student thread_id
  → Bot poste la réponse dans le thread étudiant
  → UPDATE help_requests SET status='answered', response_text=...
```

---

## Pages frontend (app web)

### 1. Gestion des promotions

```
/admin/promotions
┌─────────────────────────────────────────────────────┐
│ Mes promotions                        [+ Nouvelle]  │
│                                                      │
│ ┌──────────────────────────────────────────────────┐│
│ │ 📚 BTS Optique 2026                              ││
│ │ Serveur: Mon Serveur ✅  │ 25/30 étudiants       ││
│ │ 10 matières  │  3 profs                           ││
│ │ [Gérer]                                           ││
│ └──────────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────────┐│
│ │ 📚 BTS Optique 2025 (archivée)                   ││
│ │ Serveur: Ancien Serveur  │ 28 étudiants          ││
│ │ [Voir]                                            ││
│ └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 2. Détail d'une promotion

```
/admin/promotions/{id}
┌─────────────────────────────────────────────────────┐
│ BTS Optique 2026                                     │
│ Serveur Discord: Mon Serveur ✅                      │
│                                                      │
│ ┌─ Onglets ──────────────────────────────────────┐  │
│ │ [Étudiants]  [Matières]  [Profs]  [Stats]      │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ ── Étudiants (25/30) ────────────────────────────   │
│ ┌────────────────────────────────────────────────┐  │
│ │ Email              │ Discord       │ Statut    │  │
│ │ dupont@email.fr    │ @Dupont#1234  │ ✅ actif  │  │
│ │ martin@email.fr    │ @Martin#5678  │ ✅ actif  │  │
│ │ leroy@email.fr     │ ⏳ en attente │ [Relancer]│  │
│ │ durand@email.fr    │ ❌ pas lié    │ [Relancer]│  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ [+ Inviter par email]  [+ Importer CSV]              │
└─────────────────────────────────────────────────────┘
```

### 3. Configuration des matières

```
/admin/promotions/{id}/subjects
┌─────────────────────────────────────────────────────┐
│ Matières — BTS Optique 2026                          │
│                                                      │
│ ┌──────────────────────────────────────────────────┐│
│ │ 🔬 Optique géométrique                           ││
│ │ Expert MCP: [Optique Expert ▼]                    ││
│ │ Prof: M. Durand (@Durand#9999)                    ││
│ │ Channel cours: #optique-geometrique               ││
│ │ Channel prof: #prof-optique                       ││
│ │ [Modifier]                                        ││
│ └──────────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────────┐│
│ │ 📐 Mathématiques                                  ││
│ │ Expert MCP: [Maths Expert ▼]                      ││
│ │ Prof: Mme Martin                                  ││
│ │ [Modifier]                                        ││
│ └──────────────────────────────────────────────────┘│
│                                                      │
│ [+ Ajouter une matière]                              │
│ → Crée automatiquement #matière + #prof-matière     │
└─────────────────────────────────────────────────────┘
```

---

## Endpoints API nécessaires

### Promotions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/promotions` | Créer une promotion (+ lien guild Discord) |
| GET | `/api/v1/promotions` | Lister les promotions du tenant |
| GET | `/api/v1/promotions/{id}` | Détails d'une promotion |
| PUT | `/api/v1/promotions/{id}` | Modifier une promotion |
| DELETE | `/api/v1/promotions/{id}` | Archiver une promotion |

### Étudiants

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/promotions/{id}/students/invite` | Inviter des étudiants par email |
| GET | `/api/v1/promotions/{id}/students` | Lister les étudiants |
| POST | `/api/v1/promotions/{id}/students/{sid}/link-discord` | Associer Discord (après OAuth) |
| POST | `/api/v1/promotions/{id}/students/{sid}/resend-invite` | Relancer l'invitation |
| DELETE | `/api/v1/promotions/{id}/students/{sid}` | Retirer un étudiant |

### Matières

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/promotions/{id}/subjects` | Ajouter une matière (crée les channels Discord) |
| GET | `/api/v1/promotions/{id}/subjects` | Lister les matières |
| PUT | `/api/v1/promotions/{id}/subjects/{sid}` | Modifier (changer expert, prof) |
| DELETE | `/api/v1/promotions/{id}/subjects/{sid}` | Supprimer (archive les channels) |

### Profs

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/promotions/{id}/teachers` | Ajouter un prof à une matière |
| GET | `/api/v1/promotions/{id}/teachers` | Lister les profs |
| DELETE | `/api/v1/promotions/{id}/teachers/{tid}` | Retirer un prof |

### Help requests

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/promotions/{id}/help-requests` | Lister les demandes d'aide (filtrable par matière, statut) |
| GET | `/api/v1/promotions/{id}/help-requests/stats` | Stats : temps moyen de réponse, questions en attente |

---

## Répartition par équipe

---

### Équipe Frontend

**Responsabilité** : interfaces d'administration (promos, étudiants, matières, profs) + onboarding étudiant + dashboard prof.

#### Phase 1 — Administration des promotions

| Tâche | Composants/Fichiers | Dépendance |
|-------|---------------------|------------|
| F1. Page liste promotions | `views/admin/PromotionsListView.vue` | API: GET /promotions |
| F2. Page détail promotion (onglets) | `views/admin/PromotionDetailView.vue` | API: GET /promotions/{id} |
| F3. Formulaire création promotion | `components/promotions/PromotionForm.vue` | API: POST /promotions |
| F4. Sélecteur serveur Discord | `components/promotions/GuildSelector.vue` — liste les guilds du bot | API: GET /discord/guilds |
| F5. Routes admin | `router/routes/admin.ts` — `/admin/promotions`, `/admin/promotions/{id}` | — |

#### Phase 2 — Gestion des étudiants

| Tâche | Composants/Fichiers | Dépendance |
|-------|---------------------|------------|
| F6. Onglet étudiants (liste + statuts) | `components/promotions/StudentsList.vue` | API: GET /promotions/{id}/students |
| F7. Modal invitation par email | `components/promotions/InviteStudentsModal.vue` | API: POST .../students/invite |
| F8. Import CSV étudiants | `components/promotions/ImportStudentsCsv.vue` | API: POST .../students/invite (batch) |
| F9. Bouton relancer invitation | inline dans StudentsList | API: POST .../students/{sid}/resend-invite |
| F10. Page onboarding étudiant | `views/onboarding/StudentOnboardingView.vue` — création compte + OAuth Discord | API: POST .../students/{sid}/link-discord |
| F11. Composant OAuth Discord | `components/auth/DiscordOAuthButton.vue` — lance le flux OAuth, récupère discord_id | Backend OAuth callback |

#### Phase 3 — Gestion des matières et profs

| Tâche | Composants/Fichiers | Dépendance |
|-------|---------------------|------------|
| F12. Onglet matières | `components/promotions/SubjectsList.vue` | API: GET .../subjects |
| F13. Formulaire ajout matière + sélection expert MCP | `components/promotions/SubjectForm.vue` | API: POST .../subjects + experts store |
| F14. Onglet profs | `components/promotions/TeachersList.vue` | API: GET .../teachers |
| F15. Affectation prof ↔ matière | `components/promotions/AssignTeacherModal.vue` | API: POST .../teachers |

#### Phase 4 — Dashboard prof + stats

| Tâche | Composants/Fichiers | Dépendance |
|-------|---------------------|------------|
| F16. Dashboard prof : questions en attente | `views/teacher/HelpRequestsDashboard.vue` | API: GET .../help-requests |
| F17. Composant question avec bouton répondre | `components/teacher/HelpRequestCard.vue` | API + WS notif |
| F18. Stats promotion | `components/promotions/PromotionStats.vue` | API: GET .../help-requests/stats |
| F19. Notification dans l'app web quand un étudiant pose une question | `composables/useHelpRequestNotifier.ts` | WS ou polling |

#### Services/composables frontend

| Fichier | Description |
|---------|-------------|
| `services/promotionApi.ts` | Wrapper HTTP pour tous les endpoints promotions/students/subjects/teachers |
| `composables/usePromotionStore.ts` | Store Pinia : promotions, étudiants, matières |
| `composables/useDiscordOAuth.ts` | Gestion du flux OAuth Discord (redirect, callback, stockage token) |
| `composables/useHelpRequestNotifier.ts` | Polling/WS des help requests pour notifier le prof |

---

### Équipe Backend (API)

**Responsabilité** : modèle de données, endpoints REST, envoi d'emails, OAuth Discord callback, coordination avec le bot.

#### Phase 1 — Modèle de données et CRUD

| Tâche | Fichiers | Dépendance |
|-------|----------|------------|
| B1. Modèles SQLAlchemy | `models/promotion.py` — Promotion, PromotionStudent, PromotionSubject, PromotionTeacher, HelpRequest | — |
| B2. Migration Alembic | `alembic/versions/xxx_create_promotion_tables.py` | B1 |
| B3. Service PromotionService | `services/promotion_service.py` — CRUD promos, étudiants, matières, profs | B1 |
| B4. Endpoints promotions | `routers/v1/promotions.py` — POST/GET/PUT/DELETE promotions | B3 |
| B5. Endpoints étudiants | `routers/v1/promotion_students.py` — invite, list, link-discord, resend | B3 |
| B6. Endpoints matières | `routers/v1/promotion_subjects.py` — CRUD matières | B3 |
| B7. Endpoints profs | `routers/v1/promotion_teachers.py` — assign/list/remove | B3 |

#### Phase 2 — Onboarding et Discord

| Tâche | Fichiers | Dépendance |
|-------|----------|------------|
| B8. Envoi email d'invitation | `services/email_service.py` — template "Rejoignez votre promo" | B5 |
| B9. OAuth Discord callback | `routers/v1/discord_oauth.py` — reçoit le code OAuth, échange contre token, récupère discord_id | Discord API |
| B10. Endpoint link-discord | `routers/v1/promotion_students.py` — associe discord_id, déclenche le provisioning Discord | B9 |
| B11. Coordination avec le bot | Appel interne (HTTP ou queue Redis) vers le bot pour : ajouter membre au serveur, créer thread, assigner rôle | Bot API |
| B12. Endpoint GET /discord/guilds | `routers/v1/discord.py` — liste les guilds où le bot est installé (pour le sélecteur front) | Bot API |

#### Phase 3 — Help requests

| Tâche | Fichiers | Dépendance |
|-------|----------|------------|
| B13. Endpoints help-requests | `routers/v1/help_requests.py` — list (filtrable), stats | B1 |
| B14. Webhook réception réponse prof | `routers/v1/help_requests.py` — le bot POST quand un prof répond, met à jour le statut | Bot |
| B15. WS notification | `utils/websocket/manager.py` — notifier le prof dans l'app web quand un /help arrive | WS existant |

#### Données clés gérées par le backend

```
promotion
├── id, tenant_id, name, guild_id, academic_year, status
│
├── promotion_students[]
│   ├── email, user_id, discord_user_id, thread_id, status
│   └── status lifecycle: invited → registered → discord_linked → active
│
├── promotion_subjects[]
│   ├── name, slug, expert_id, course_channel_id, prof_channel_id
│   └── Chaque matière = 1 expert MCP + 2 channels Discord
│
├── promotion_teachers[]
│   ├── user_id, subject_id, discord_user_id, role
│   └── Un prof peut enseigner plusieurs matières
│
└── help_requests[]
    ├── student_id, subject_id, question_text, response_text, status
    └── status lifecycle: pending → answered → closed
```

---

### Équipe azy.mcp (composant)

> **Important** : il s'agit du **composant azy.mcp** embarqué dans chaque plugin bot, PAS de l'API azy.mcp. Le composant est la couche intelligence conversationnelle (NLU, tool selection, NLG, sessions). Voir RFC-051 pour la séparation azy.mcp vs chatbot-core.

**Responsabilité** : comprendre l'intention de l'étudiant, choisir le bon contexte expert/RAG selon la matière, générer des réponses, maintenir la mémoire de conversation.

#### Tâches

| Tâche | Description | Dépendance |
|-------|-------------|------------|
| M1. Résolution expert par thread | Quand `chatbot-core` transmet un message venant d'un thread étudiant, le composant azy.mcp résout : thread_id → étudiant → matière courante → expert_id/RAG. Utilise la table `promotion_students.current_subject_slug` + `promotion_subjects.expert_id` | Backend DB |
| M2. Résolution expert par channel cours | Quand un message arrive dans `#optique` (transmis par chatbot-core), le composant charge l'expert optique + son RAG. Mapping : channel_id → `promotion_subjects.course_channel_id` → expert_id | Backend DB |
| M3. Changement de contexte matière | Quand chatbot-core reçoit `/matiere maths`, il appelle le composant azy.mcp pour recharger le bon expert + RAG + session. Le composant met à jour `current_subject_slug` via l'API backend | Backend API |
| M4. Contexte étudiant dans le prompt | Le composant enrichit le prompt LLM avec les infos de l'étudiant (nom, promo, historique des échanges) pour personnaliser les réponses. Utilise `RedisSessionStore` pour la mémoire de session | RedisSessionStore |
| M5. Auto-détection matière (Phase 4) | Le pipeline NLU du composant classifie la matière à partir du contenu du message, sans commande `/matiere`. Fallback sur la dernière matière utilisée (`current_subject_slug`) | LLM classification |
| M6. Génération résumé `/recap` | Quand chatbot-core reçoit `/recap`, il appelle le composant azy.mcp qui génère un résumé de l'historique de l'étudiant (questions posées, matières, aide demandée) via le LLM | RedisSessionStore |

#### Flux de traitement (composant azy.mcp)

```
chatbot-core transmet le message au composant azy.mcp :

process_and_execute(
  message="explique la réfraction",
  context={
    "thread_id": "123",
    "user_id": "456",
    "guild_id": "789",
    "subject_slug": "optique",     ← résolu par chatbot-core
    "student_name": "Dupont"       ← résolu par chatbot-core
  }
)
    ↓
ConversationManager (pipeline NLU → Dialog → NLG)
    ↓
ToolSearcher → RAG optique (Qdrant)
    ↓
LLMClient → génère la réponse avec le contexte étudiant
    ↓
RedisSessionStore → sauvegarde la conversation
    ↓
Retourne Action + Response → chatbot-core affiche l'embed Discord
```

#### Ce que le composant azy.mcp NE fait PAS

- ❌ Gérer les événements Discord (c'est chatbot-core)
- ❌ Créer des channels/threads/rôles (c'est chatbot-core)
- ❌ Afficher des embeds ou boutons Discord (c'est chatbot-core)
- ❌ Relayer les messages `/help` vers le prof (c'est chatbot-core)
- ❌ Gérer les crédits/billing (c'est chatbot-core)

---

### Équipe chatbot-core (infra Discord) + Plugin Bot

> **chatbot-core** est la couche infrastructure Discord. Le **plugin bot** utilise chatbot-core pour les interactions Discord et le composant azy.mcp pour l'intelligence. Voir RFC-051.

**Responsabilité** : événements Discord, commandes slash, création de resources (channels, threads, rôles), relai de messages prof ↔ étudiant, UI Discord (embeds, boutons).

#### Phase 1 — Provisioning Discord (chatbot-core)

| Tâche | Description | API Discord utilisée | Trigger |
|-------|-------------|---------------------|---------|
| D1. Ajouter un membre au serveur | Quand un étudiant lie son Discord, le bot l'ajoute au guild | `PUT /guilds/{guild_id}/members/{user_id}` (nécessite OAuth `guilds.join`) | Backend → Bot (après link-discord) |
| D2. Assigner un rôle | Assigne `@Étudiant-Promo-2026` au membre | `PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id}` | Backend → Bot |
| D3. Créer le thread privé | Crée un thread dans `#suivi-individuel`, ajoute l'étudiant + le bot | `POST /channels/{channel_id}/threads` + `PUT /channels/{thread_id}/thread-members/{user_id}` | Backend → Bot |
| D4. Créer les channels matière | Quand une matière est ajoutée, crée `#cours-{slug}` + `#prof-{slug}` avec les bonnes permissions | `POST /guilds/{guild_id}/channels` | Backend → Bot |
| D5. Configurer les permissions | `#prof-{slug}` : visible uniquement par les profs de cette matière + bot. `#cours-{slug}` : visible par tous les étudiants de la promo + bot | `PUT /channels/{channel_id}/permissions/{overwrite_id}` | Avec D4 |
| D6. Créer les rôles | `@Étudiant-Promo-2026`, `@Prof-Optique`, etc. | `POST /guilds/{guild_id}/roles` | Backend → Bot (à la création de la promo) |

#### Phase 2 — Commandes slash (chatbot-core)

| Tâche | Commande | Qui | Où | Fait par | Action |
|-------|----------|-----|----|----------|--------|
| D7. `/help "question"` | `/help` | Étudiant | Thread privé | **chatbot-core** | Poste un embed dans `#prof-{matière}` avec la question et un bouton "Répondre". Insère dans `help_requests` via API backend. Pas besoin d'azy.mcp. |
| D8. `/matiere <nom>` | `/matiere` | Étudiant | Thread privé | **chatbot-core** → **azy.mcp** | chatbot-core reçoit la commande, appelle azy.mcp pour recharger le contexte expert |
| D9. `/matieres` | `/matieres` | Étudiant | Thread privé | **chatbot-core** | Liste les matières via API backend, affiche un embed. Pas besoin d'azy.mcp. |
| D10. `/questions` | `/questions` | Prof | Channel prof | **chatbot-core** | Liste les help_requests `pending` via API backend, affiche embed. |
| D11. `/broadcast "msg"` | `/broadcast` | Prof | Channel prof | **chatbot-core** | Poste le message dans tous les threads étudiants via API backend. |
| D12. `/recap` | `/recap` | Étudiant | Thread privé | **chatbot-core** → **azy.mcp** | chatbot-core reçoit la commande, appelle azy.mcp qui génère le résumé via LLM |
| D13. `/stats` | `/stats` | Prof | Channel prof | **chatbot-core** | Stats via API backend, affiche embed. |

#### Phase 3 — Relai de messages (chatbot-core)

| Tâche | Description | Fait par | Flux |
|-------|-------------|----------|------|
| D14. Relai question → prof | Quand `/help` est exécuté, chatbot-core crée un embed riche dans `#prof-{matière}` avec : nom étudiant, matière, question, bouton "Répondre" | **chatbot-core** | Thread étudiant → `#prof-{matière}` |
| D15. Relai réponse → étudiant | Quand le prof reply sur l'embed, chatbot-core détecte le reply, récupère le `help_request`, poste la réponse dans le thread de l'étudiant | **chatbot-core** | `#prof-{matière}` → Thread étudiant |
| D16. Notification prof | Quand un `/help` arrive, chatbot-core mentionne le prof dans le channel prof | **chatbot-core** | Bot → Discord mention |
| D17. Routing message normal → IA | Quand l'étudiant écrit dans son thread (sans `/help`), chatbot-core transmet au composant azy.mcp pour réponse IA | **chatbot-core** → **azy.mcp** | Thread → chatbot-core → azy.mcp → chatbot-core → Thread |

#### Flux complet : message étudiant (D17)

```
Discord                 chatbot-core                Plugin               azy.mcp (composant)
───────                 ────────────                ──────               ───────────────────
   │                        │                         │                        │
   │  @bot-optique          │                         │                        │
   │  "explique la          │                         │                        │
   │   réfraction"          │                         │                        │
   ├───────────────────────►│                         │                        │
   │                        │  MentionService         │                        │
   │                        │  détecte @bot-optique   │                        │
   │                        │  crée MentionContext     │                        │
   │                        │  { thread_id, user_id,  │                        │
   │                        │    guild_id }            │                        │
   │                        ├────────────────────────►│                        │
   │                        │                         │  Enrichit context :    │
   │                        │                         │  subject="optique"     │
   │                        │                         │  student="Dupont"      │
   │                        │                         │                        │
   │                        │                         │  process_and_execute() │
   │                        │                         ├───────────────────────►│
   │                        │                         │                        │
   │                        │                         │    NLU: intention      │
   │                        │                         │    ToolSearcher: RAG   │
   │                        │                         │    LLM: réponse        │
   │                        │                         │    Session: sauvegarde │
   │                        │                         │                        │
   │                        │                         │  Action + Response     │
   │                        │                         │◄───────────────────────┤
   │                        │                         │                        │
   │                        │  MentionResult          │                        │
   │                        │◄────────────────────────┤                        │
   │                        │                         │                        │
   │  Embed Discord         │  BrandingService        │                        │
   │  (réponse formatée)    │  format + envoi         │                        │
   │◄───────────────────────┤                         │                        │
```

#### Flux complet : `/help` (D7 + D14-D16)

```
Discord                 chatbot-core                      Backend API
───────                 ────────────                      ───────────
   │                        │                                 │
   │  /help "lentilles"     │                                 │
   ├───────────────────────►│                                 │
   │                        │                                 │
   │                        │  Résout: thread → étudiant      │
   │                        │  → matière → prof               │
   │                        │                                 │
   │                        │  POST /help-requests            │
   │                        │  { student, subject, question } │
   │                        ├────────────────────────────────►│
   │                        │                                 │
   │                        │  ← help_request_id              │
   │                        │◄────────────────────────────────┤
   │                        │                                 │
   │  Thread étudiant :     │                                 │
   │  "📩 Transmis à        │                                 │
   │   M. Durand"           │                                 │
   │◄───────────────────────┤                                 │
   │                        │                                 │
   │  #prof-optique :       │                                 │
   │  Embed "Dupont a une   │                                 │
   │  question" @Durand     │                                 │
   │◄───────────────────────┤                                 │
   │                        │                                 │
   │                        │                                 │
   │  Prof reply :          │                                 │
   │  "Pour les lentilles..."│                                │
   ├───────────────────────►│                                 │
   │                        │  PATCH /help-requests/{id}      │
   │                        │  { response_text }              │
   │                        ├────────────────────────────────►│
   │                        │                                 │
   │  Thread étudiant :     │                                 │
   │  "💬 M. Durand :       │                                 │
   │   Pour les lentilles..."│                                │
   │◄───────────────────────┤                                 │
```

> **Note** : le flux `/help` ne passe PAS par azy.mcp. C'est du pur relai de messages, géré entièrement par chatbot-core.

#### API interne Bot ↔ Backend

Le backend communique avec le bot via des appels HTTP internes (ou une queue Redis) :

| Endpoint Bot | Méthode | Payload | Quand |
|-------------|---------|---------|-------|
| `/bot/guild/{guild_id}/member/add` | POST | `{ discord_user_id, role_ids }` | Étudiant lie son Discord |
| `/bot/guild/{guild_id}/thread/create` | POST | `{ channel_id, name, member_ids }` | Étudiant lie son Discord |
| `/bot/guild/{guild_id}/channels/create` | POST | `{ name, category_id, permissions }` | Ajout d'une matière |
| `/bot/guild/{guild_id}/roles/create` | POST | `{ name, color, permissions }` | Création promo ou matière |

Ou inversement, le bot (chatbot-core) appelle le backend :

| Endpoint Backend | Méthode | Payload | Quand |
|-----------------|---------|---------|-------|
| `POST /api/v1/promotions/{id}/help-requests` | POST | `{ student_discord_id, subject_slug, question, message_id }` | Étudiant fait `/help` |
| `PATCH /api/v1/help-requests/{id}/answer` | PATCH | `{ response_text, prof_discord_id, message_id }` | Prof reply dans le channel prof |
| `PATCH /api/v1/promotions/{id}/students/{sid}/subject` | PATCH | `{ subject_slug }` | Étudiant fait `/matiere` |

---

## Séquence d'implémentation inter-équipes

### Phase 1 — Fondations (semaines 1-2)

```
Backend                    Frontend                   chatbot-core          azy.mcp composant
   │                          │                           │                        │
   │ B1-B7: Modèles +        │                           │                        │
   │ migration + CRUD API     │                           │                        │
   │ ────────────────────>    │                           │                        │
   │                          │ F1-F5: Pages admin        │                        │
   │                          │ promotions (CRUD)         │                        │
   │                          │                           │                        │
   │ B8: Envoi emails         │                           │                        │
   │ B12: GET /discord/guilds │                           │                        │
   │                          │ F4: GuildSelector         │                        │
   │                          │ F6-F9: Gestion            │                        │
   │                          │ étudiants                 │                        │
```

### Phase 2 — Intégration Discord (semaines 3-4)

```
Backend                    Frontend                   chatbot-core          azy.mcp composant
   │                          │                           │                        │
   │ B9-B10: OAuth Discord    │                           │                        │
   │ callback + link          │                           │                        │
   │ ────────────────────>    │                           │                        │
   │                          │ F10-F11: Onboarding       │                        │
   │                          │ étudiant + OAuth btn      │                        │
   │                          │                           │                        │
   │ B11: Coordination        │                           │                        │
   │ backend → bot            │                           │ D1-D6: Provisioning    │
   │ ─────────────────────────────────────────────────>│ (channels, threads,    │
   │                          │                           │  rôles, membres)       │
   │                          │                           │                        │
   │                          │ F12-F15: Matières         │                        │ M1-M2: Résolution
   │                          │ + profs UI                │ D17: Routing message   │ expert par thread
   │                          │                           │ normal → azy.mcp       │ et channel
   │                          │                           │ ───────────────────────>│
```

### Phase 3 — Relai prof (semaines 5-6)

```
Backend                    Frontend                   chatbot-core          azy.mcp composant
   │                          │                           │                        │
   │ B13-B15: Help requests   │                           │ D7: /help command      │
   │ endpoints + WS notif     │                           │ D14-D16: Relai prof    │
   │                          │                           │ (pur chatbot-core,     │
   │                          │                           │  pas d'azy.mcp)        │
   │                          │                           │                        │
   │                          │ F16-F19: Dashboard        │                        │
   │                          │ prof + notifs web         │                        │
   │                          │                           │                        │ M3: Switch /matiere
   │                          │                           │ D8-D10: Commandes      │ (recharge contexte)
   │                          │                           │ /matiere /matieres     │
   │                          │                           │ /questions             │
```

### Phase 4 — UX avancée (semaines 7-8)

```
Backend                    Frontend                   chatbot-core          azy.mcp composant
   │                          │                           │                        │
   │                          │ F18: Stats promo          │ D11: /broadcast        │ M4: Contexte étudiant
   │                          │                           │ D13: /stats            │ M5: Auto-détection
   │                          │                           │                        │ matière (NLP)
   │                          │                           │ D12: /recap            │ M6: Génération résumé
   │                          │                           │ ───────────────────────>│ (via LLM)
```

---

## Questions ouvertes

1. **Un serveur = une promo ou une école ?** Si une école, plusieurs promos cohabitent avec des rôles différents. Le budget channels augmente mais reste viable (~27 × N promos).

2. **Multi-promo pour un étudiant** : un redoublant a-t-il 2 threads (un par promo) ou le même thread est réutilisé ?

3. **Archivage** : en fin d'année, archive-t-on les threads + channels ou crée-t-on un nouveau serveur ?

4. **Le bot MCP est-il le même que celui du chat web ?** Même backend, même experts, juste un client Discord au lieu du client web ?

5. **Notifications** : quand le prof répond, l'étudiant reçoit-il aussi une notif dans l'app web (en plus de Discord) ?

6. **Communication Backend ↔ Bot** : HTTP direct (le bot expose une API interne) ou queue Redis (pub/sub) ? Redis est plus résilient mais plus complexe.

7. **Permissions Discord** : qui crée la structure initiale du serveur (catégories, `#suivi-individuel`) ? Le bot au moment de la création de la promo, ou c'est un setup manuel ?

---

## Références

- Discord API : [Threads](https://discord.com/developers/docs/resources/channel#start-thread-without-message)
- Discord API : [Add Guild Member](https://discord.com/developers/docs/resources/guild#add-guild-member) (nécessite OAuth `guilds.join`)
- Discord API : [Slash Commands](https://discord.com/developers/docs/interactions/application-commands)
- RFC-047 : Social Config (textes personnalisables par guild)
- RFC-040 : Training Dataset (génération de datasets pour les cours)
- RFC-051 : azy.mcp vs chatbot-core — Responsabilités (séparation intelligence vs infrastructure)
