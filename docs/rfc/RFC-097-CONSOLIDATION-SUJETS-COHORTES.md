# RFC-097 — Consolidation du modèle Sujets & Cohortes

| Champ | Valeur |
|-------|--------|
| Statut | Draft |
| Version | 0.1 |
| Auteur | back (+ audits front, n8n/MCP/plugin à recueillir) |
| Date | 2026-05-27 |
| Étend / rationalise | RFC-023 (training : Formation/Promotion/Matière), RFC-061 (discord_group : Group/Room), RFC-081 (personae : Expert/Specialty/Style/Binding), RFC-095 (inscription/audience/DM), RFC-096 (pédagogique) |
| Liés | RFC-048 (canaux matière), RFC-080 (subject_id bindings) |
| Principe directeur | **Ré-ancrage, pas suppression.** Aucune entité chargée n'est supprimée ; on unifie le concept « sujet » et on rationalise les inscriptions. **Ne défait pas la V1 personae livrée.** |

---

## 1. Résumé exécutif

Trois domaines construits à des époques différentes ont produit des **notions qui se recouvrent** et embrouillent le modèle :

1. **Deux « matières »** non reliées : `Matiere` (training, RFC-023) et `Specialty` (personae, RFC-081/095).
2. **Deux « cohortes »** : `Promotion` (académique) et `Group` (Discord) — déjà reliées (`group.promotion_id`).
3. **Trois « inscriptions »** : `promotion_enrollments`, `discord_group.students`, `student_subject_enrollment`.

Plus un héritage : le **canal-par-matière** (`matiere.course_channel_id`, RFC-048) est **superseed** par le modèle actuel `RoomModel → Expert/Bot` (RFC-061/branding) — le sujet n'a plus de canal propre.

**Cible** : un **seul concept de sujet (`Specialty`)**, un **seul axe d'inscription-sujet** (cohorte → Specialties, hérité par l'élève + override), les **canaux orthogonaux** (RoomModel→Expert). `Promotion`, `Group`, `Matiere` subsistent ; `Matiere` devient un **lien `(cohorte × Specialty)`**.

Cette RFC **ne touche pas au code** ; elle fige la cible + le plan de migration + les impacts équipes avant tout câblage.

---

## 2. La base — 5 entités socles irréductibles

Tout le reste n'est que des **liens** entre ces 5 :

```
TENANT (schéma)
  └─ GUILD (serveur Discord)
        ├─ STUDENT    = discord_user_id (la personne)          [identité = RFC-095]
        ├─ EXPERT     = l'identité de l'assistant (qui parle)  [RFC-081]
        └─ SPECIALTY  = le sujet enseigné (matière+niveau+contexte+RAG) [RFC-081/#2144]
```

---

## 3. Schéma actuel (avec les doublons)

```
   TRAINING (RFC-023)              DISCORD/BRANDING (RFC-061)        PERSONAE (RFC-081/095/096)
   ───────────────────            ──────────────────────────       ────────────────────────────
   Formation                                                        Expert ──N:N── Specialty
      │1:N                         RoomModel ──► Expert + bot_id        │   (expert_specialties)   │
   Promotion ◄───────promotion_id──── Group ──► RoomModel              │                          │
      │1:N            (nullable)     │  └─► DiscordCategory          ChannelBinding (canal,expert)─┤
      ├─ Matiere ◄─group_id────────────┘     ChannelRoomMapping        →specialty,style          │
      │   • name, slug, emoji          │       (channel→room)        Style                        │
      │   • course_channel_id ⚠️legacy │                            Specialty :                   │
      │   • order_index                ├─ Student(discord_group)      • segment = MATIÈRE  ◄───────┤ DOUBLON
      │                                │   group_id, discord_user_id  • level   = NIVEAU          │  « matière »
      ├─ PromotionEnrollment           │   (= membership cohorte)     • context_prompt + RAG      │
      │   promotion_id, user_id  ◄─────┼──────────────────────────── student_subject_enrollment  │
      │   (inscription #1)             │   DOUBLON inscription #2/#3  user_id × specialty_id      │
      ├─ Teacher  subject_id─►Matiere  │                              + audience_personae_id      │
      └─ HelpRequest subject_id─►Matiere                             audience_personae (catalogue)│
                                                                     referentiels/competencies ───┘
   discord_user_mappings (public)                                    presets (catalogues RFC-096,
   tenant × discord_id → email                                               pas encore reliés)
```

**Les 3 doublons** : (1) sujet `Matiere`⟷`Specialty` non reliés ; (2) cohorte `Promotion`⟷`Group` (déjà reliées) ; (3) inscription ×3.

---

## 4. Cible (consolidée)

```
TENANT ▸ GUILD
  │
  ├─ Cohorte = Promotion (académique) ──1:N── Group (Discord)
  │       │                                      └─1:N─ Student (membership)
  │       └────────── inscrite à ─────────► Specialty(s)         ◄── 1 SEUL concept « sujet »
  │                                              ▲
  │   Student ──hérite cohorte + override perso──┘  (student_subject_enrollment)
  │
  ├─ Specialty = sujet (matière+niveau+contexte+RAG) ─► referentiel? + RAG + notebooks/skills
  │
  └─ Expert ×Specialty ×Style = Personae ─► ChannelBinding / RoomModel (canaux, bot)
```

**Principes** :
- **`Specialty` = LE sujet unifié** (porte déjà matière `segment` + niveau `level` + contexte + RAG depuis #2144).
- **`Matiere` → lien `(cohorte × Specialty)`** : gagne un `specialty_id`, perd son **identité-sujet parallèle** et ses **champs canal** (legacy). Reste comme structure de cursor cursus + porteur des `subject_id` (teacher/help_request).
- **Canaux orthogonaux** : `RoomModel → Expert/Bot` (un salon est branché à un Expert, **pas** à un sujet). Cohérent RFC-095 (en DM, le sujet est **résolu par routing**, pas par un canal dédié).
- **Inscription-sujet unique** : la cohorte est inscrite à des Specialties ; l'élève **hérite** (+ override perso via `student_subject_enrollment`).

---

## 5. Garder / Converger / Déprécier

| Notion | Décision | Pourquoi |
|---|---|---|
| Tenant, Guild, Student(`discord_user_id`), Expert, **Specialty** | ✅ **GARDER** (socle) | base irréductible ; Specialty = sujet unifié |
| Promotion | ✅ **GARDER** | pivot académique (enrollments, teachers, corrections) |
| Group | ✅ **GARDER** | cohorte Discord (canaux, quota, membership) |
| RoomModel + ChannelRoomMapping | ✅ **GARDER** | modèle canal **actuel** (→ Expert/Bot), orthogonal au sujet |
| audience_personae, Style, referentiels, presets, rag_sources | ✅ **GARDER** | catalogues d'enrichissement |
| **Matiere** | 🔄 **CONVERGER** → `(cohorte × Specialty)` (gagne `specialty_id`) | supprime le doublon « sujet » ; garde cursus + `subject_id` |
| 3 inscriptions | 🔄 **RATIONALISER** : *membership cohorte* (`promotion_enrollments` + `group.students`) **+** *périmètre sujets* (`student_subject_enrollment`, dérivable de cohorte→Specialties + override) | un seul concept « sujet » dessous |
| `matiere.course_channel_id`/`prof_channel_id` + création canal-par-matière (`formation_service`) | ❌ **DÉPRÉCIER** | superseed par RoomModel→Expert |
| Promotion / Group / Matiere (entités) | 🚫 **NE PAS supprimer** | ré-ancrage, pas suppression (casse forte sinon) |
| **Experts** (entité Expert **+** « Programmes Experts » #180) | ✅ **GARDER** | **tout ce qui touche aux experts reste en place** — retrait #180 **annulé** (2026-05-27) |

---

## 6. Inscription-cohorte (héritage)

Aujourd'hui : inscription **par élève × Specialty** (`student_subject_enrollment`). Cible : définir le **périmètre de Specialties au niveau cohorte** (Promotion/Group), l'élève hérite.

Option retenue : **(a) héritage au runtime** (recommandée, additive) — le périmètre d'un élève = `Specialties de sa/ses cohorte(s)` **∪** `student_subject_enrollment` (overrides perso). Pas d'explosion de lignes ; le résolveur (`resolve-dm`) calcule l'union. Alternative (b) expansion matérialisée gardée si besoin de perf/traçabilité.

Pré-requis : savoir à quelle cohorte appartient un `discord_user_id` (via `group.students` / `promotion_enrollments`). Le lien cohorte→Specialties vient de la convergence `Matiere = (cohorte × Specialty)`.

> ⚠️ **Prérequis identité (point back, 2026-05-27)** — les 3 systèmes ne clent PAS l'élève de la même façon :
> - `promotion_enrollments` → **`discord_id`** (snowflake, NOT NULL) [+ `user_id` nullable]
> - `discord_group.students` → **`email`** (UNIQUE, clé de pré-inscription) + `discord_user_id` **nullable** (rempli à la vérif Discord, RFC-067)
> - `student_subject_enrollment` → **`user_id` = `discord_user_id`**
>
> L'héritage cohorte→élève **ne fonctionne que pour un élève déjà vérifié** (ayant un `discord_user_id`). Un élève **pré-inscrit par email, pas encore arrivé sur Discord**, n'a pas de `discord_user_id` → **pas de matching** avec son périmètre de Specialties. À couvrir : mapping `email ↔ discord_user_id` posé à la vérif (RFC-067) avant que l'héritage soit fiable. Cf. Q5.

---

## 7. Plan de migration prod (séquencé, non destructif)

> `matieres` est *« la seule feature legacy réellement en prod »* (RFC-061) → prudence.

1. **Ajouter** `matieres.specialty_id` (FK → specialties, nullable) — additif, cohabitation.
2. **Backfill** : pour chaque `matiere`, créer/associer une `Specialty` (dédup : les « Histoire » de N cohortes → 1 Specialty « Histoire {niveau} » via `segment`+`level`). Script idempotent, dry-run d'abord.
3. **Repointer** les usages « sujet » sur Specialty : les inscriptions/périmètres passent par Specialty ; les `subject_id` cursus (teacher/help_request) restent sur la Matière-instance.
4. **Déprécier** les champs canal de `matiere` + le flux de création canal-par-matière (`formation_service`) — figés, plus écrits ; les canaux viennent de RoomModel.
5. **Inscription-cohorte** : exposer « cohorte → Specialties » + héritage runtime.
6. Cohabitation maintenue pendant la transition front (pas de XOR, pas de drop), comme RFC-061.

Aucune suppression de table dans cette RFC (les drops éventuels = RFC ultérieure post-transition).

---

## 8. Dépréciations exactes (à figer)

| Élément | État cible |
|---|---|
| `matiere.course_channel_id`, `matiere.prof_channel_id` | déprécié (legacy), plus alimenté ; canaux via RoomModel |
| `formation_service` création canal-par-matière (l.454/689/836+) | déprécié |
| Identité-sujet de `Matiere` (name comme « savoir ») | remplacée par `specialty_id` (la matière = une Specialty) |
| UI « canal par matière » (front) | déprécié — **exposée** : champs `course_channel_id`/`prof_channel_id` dans `GroupDetailView`+`SubjectEditorDialog` ; à retirer une fois back/plugin sevrés |
| ~~Programmes Experts #180~~ | **NON déprécié — reste en place** (retrait annulé 2026-05-27) |

---

## 9. Impact par équipe (chaque équipe se prononce — grille §9.5)

### 9.1 front (audité, fourni)
- ✅ inchangé : tout le front Personae V1 (catalogues Specialty/Style/Brique/Public cible, matrice, stepper, aide) — **c'est le socle cible**. Vues training (Promotions/Groups). RoomModel/canaux (#2150).
- 🔄 évoluer : la saisie « matière » des cohortes vit dans **`GroupDetailView.vue` (CRUD subjects)** + **`SubjectEditorDialog.vue`** + **`PromotionWizardDialog.vue`** (contrat `groups/{id}/subjects`, livré 2026-05-12). Point de convergence concret = **`SubjectEditorDialog`** gagne un **sélecteur de Specialty** (câble `matieres.specialty_id`, §7.1) ; `MatiereSelector.vue` (zone Programme Expert) à réconcilier. Nouvelle UI **« inscrire une cohorte à des Specialties »** ; `PersonaeEnrollmentsView` (par élève) devient l'**override**, plus le mode principal.
- ❌ déprécier : UI « canal par matière » — **confirmé exposée** : `course_channel_id` + `prof_channel_id` sont éditables dans le formulaire subjects de `GroupDetailView.vue` (l.62) et `SubjectEditorDialog`. Chantier front concret = **retirer ces 2 champs une fois que back/plugin ne les alimentent plus** (§7.4) ; à conserver d'ici là (cohabitation, cf. RFC-061). *(Programmes Experts #180 : retrait **annulé** — reste en place.)*
- ℹ️ Q ouverte #1 (`discord_binding.subject_id`) : **non possédée par le front**. Les seuls `subject_id` front sont dans la zone Programme Expert/Classroom (`expertProgramsDiscordApi`, `useExpertProgramDiscordBinding`, `MatiereProgramBuilder`, `ExpertProgramSessionsView`) — **conservée** (#180 annulé). Le modèle `discord_binding` n'est pas dans le front. Front **ne bloque pas** : il suivra le contrat quand back/plugin repointe `subject_id → specialty_id`.
- ✅ **Prérequis identité §6 — acquitté front (2026-05-27)** : le modèle décrit par le back est **déjà celui implémenté**. Membership cohorte = `email` UNIQUE + `discord_user_id` nullable (`types/discord-groups.ts:58/62`) ; périmètre-sujet = `user_id` = `discord_user_id` (`studentEnrollmentApi`, `types/personae.ts:231`). **Aucun rework front** ; le cas pré-inscription email-only est un sujet runtime back/plugin (mapping email↔discord_user_id à la vérif RFC-067). Sign-off ✅ maintenu. Seule **conséquence UX** (future UI « inscrire une cohorte à des Specialties », §9.1) : afficher que le périmètre hérité ne se résout que pour les **membres vérifiés** (un pré-inscrit voit ses Specialties s'activer à son arrivée Discord).

### 9.2 n8n / chatbot-core — position fournie 2026-05-27

#### Synthèse
- n8n travaille **déjà** sur l'axe Specialty via `GET /api/n8n/personae/resolve-dm` ; il ne consomme **pas** la table `matieres` directement. Le contrat `resolve-dm` **ne change pas**.
- Le seul changement est **interne** : le périmètre d'un élève pourra inclure les Specialties **héritées de sa cohorte** (§6) — additif, transparent pour n8n.

#### Réponses aux questions §9.2

| Question | Réponse n8n |
|----------|-------------|
| Lecture directe table `matieres` ? | ✅ **NON** — passe par API chat.api |
| Appel API `/subjects` ? | ⚠️ **1 workflow** (`DISCORD_-_Subject_Switch`) appelle `/promotions/{id}/subjects/{slug}` |
| `discord_binding.subject_id` | ❓ **À vérifier chatbot-core** — non trouvé dans workflows n8n |

#### Workflow impacté

**`DISCORD_-_Subject_Switch.json`** (RFC-048) utilise :
- Endpoint : `GET /api/v1/promotions/{promotion_id}/subjects/{subject_slug}`
- Champs legacy dans la réponse construite : `course_channel_id`, `prof_channel_id` (à déprécier §8)

```javascript
// Extrait du workflow - champs à retirer post-migration §7.4
subject: {
  course_channel_id: subject.course_channel_id || null,  // ❌ LEGACY
  prof_channel_id: subject.prof_channel_id || null       // ❌ LEGACY
}
```

#### Action requise

- **Post-migration §7.4** : retirer les champs `course_channel_id`/`prof_channel_id` de la réponse construite dans `Subject_Switch`
- **Pas de blocage** : le workflow continue de fonctionner pendant la cohabitation

#### Charge estimée

| Scope | Effort |
|-------|--------|
| Retrait champs legacy | **~0.5j** (modification 1 workflow) |

### 9.3 MCP / azy-mcp — **impact ~nul (positif)**
- Le RAG est scopé sur les `rag_sources` **de la Specialty** (la `Matiere` n'a pas de RAG). Unifier vers Specialty **confirme** Specialty comme **clé de scope RAG unique** — aligne RFC-096 (RAG par mode, corpus typé #2137).
- Aucun « RAG par matière » parallèle à gérer.
- À confirmer MCP : la classification routing (`resolve-dm`) reste sur les Specialties inscrites (inchangé) ; le scope RAG = `specialty_id`/`rag_source_ids`.

### 9.4 plugin Discord — position fournie 2026-05-27

#### Réponses aux tasks pressenties

| Task | Position |
|------|----------|
| Provisioning canaux via RoomModel | ✅ OK — migration faisable |
| `discord_binding.subject_id` | ✅ **NON présent dans plugin-recipes** (grep confirmé) |
| Héritage cohorte → Specialties | ✅ OK — transparent via `resolve-dm` |
| Inscription élève | ✅ OK — additif |

#### Question plugin → produit

| # | Question |
|---|----------|
| P1 | **Niveau cible élève (gamification)** — V1 ou V2 ? |
| P2 | **Échelle de niveaux** — générique (⭐) ou scolaire (mention TB) ? |

#### Charge estimée

| Scope | Effort |
|-------|--------|
| V1 sans gamification | **~1j** |
| V1 avec gamification | **~2j** |

### 9.5 Grille de sign-off

| Équipe | Position (✅/⚠️/❌) | Charge | Remarques |
|---|---|---|---|
| front | ✅ (schéma-cible validé) | — | impact front §9.1 fourni ; prérequis identité §6 acquitté (modèle déjà implémenté, aucun rework) — 2026-05-27 |
| n8n | ✅ | ~0.5j | ✅ Pas de lecture directe `matieres`. 1 workflow (`Subject_Switch`) utilise API `/subjects` avec champs legacy à retirer post-§7.4. Pas de blocage. — 2026-05-27 |
| MCP | ⏳ | | confirmer : scope RAG = `specialty_id` |
| plugin Discord | ⚠️ réserves | 1.5-2.5j | ✅ OK sur le fond. **Décisions produit requises P1-P2** (niveau cible / gamification). Détail §9.4. — 2026-05-27 |

---

## 10. Non-objectifs
- **Pas** de suppression de `Promotion`, `Group`, ni `Matiere` (entités) — ré-ancrage.
- **Pas** de modification de la V1 personae livrée (RFC-095 B1→B4) — elle est le socle.
- **Pas** de refonte des canaux (RoomModel→Expert reste, hors périmètre).
- **« Programmes Experts » (#180) reste en place** — le retrait précédemment envisagé par le front est **annulé** (décision 2026-05-27). **Tout ce qui touche aux experts** (entité `Expert` **et** Programmes Experts) est **conservé**.

## 11. Questions ouvertes

### Questions back — réponses plugin (2026-05-27)

| # | Question back | Plugin répond |
|---|---------------|---------------|
| 1 | `subject_id` : où ? | **NON** — pas dans plugin-recipes (grep confirmé) |
| 2 | Cardinalité Matiere↔Specialty | **OK** — pas d'impact plugin |
| 3 | Héritage runtime (a) vs matérialisé (b) | **OK pour (a)** — transparent via `resolve-dm` |
| 4 | Unifier membership cohorte | **OK** — pas concerné directement |
| 5 | Cohérence clé identité | **OK** — plugin utilise `discord_user_id` partout |

### Questions back — réponses n8n (2026-05-27)

| # | Question back | n8n répond |
|---|---------------|------------|
| 1 | `subject_id` : où ? | **NON dans workflows n8n** — `discord_binding.subject_id` non trouvé. À vérifier **chatbot-core** |
| 2 | Cardinalité Matiere↔Specialty | **OK** — pas d'impact n8n |
| 3 | Héritage runtime (a) vs matérialisé (b) | **OK pour (a)** — transparent via `resolve-dm` |
| 4 | Unifier membership cohorte | **OK** — pas concerné directement |
| 5 | Cohérence clé identité | **OK** — n8n utilise `discord_user_id` via API |

### Questions back — détail

1. **`subject_id` : combien de foyers et où ?** (bloque la migration §7.3)
   - Foyer **A — conservé** : « Programmes Experts » (#180) porte un **`discord_subject_id`** (`expert_program_query_service`, **chat.api**). #180 étant **gardé**, la convergence Matière→Specialty doit **préserver** ce binding (ne pas casser #180).
   - Foyer **B — à localiser** : `discord_binding.subject_id` (RFC-080) — **pas dans chat.api**, **pas dans le front** (confirmé §9.1), **pas dans les plugins** (confirmé §9.4), **pas dans les workflows n8n** (confirmé §9.2) → **MCP ou chatbot-core ?** Repointe-t-il vers `specialty_id` post-convergence ?
   → Donc « subject » a ≥ 2 foyers ; les départager est le **vrai préalable** au repointage.
2. Cardinalité `Matiere`↔`Specialty` : 1 Specialty réutilisée par N cohortes — confirmer la dédup au backfill (§7.2).
3. Héritage cohorte : runtime (a) vs matérialisé (b) — défaut (a).
4. `promotion_enrollments` vs `group.students` : faut-il aussi unifier la **membership cohorte**, ou seulement le périmètre-sujet ? (cette RFC traite le sujet ; la membership = éventuelle RFC suivante).
5. **Cohérence de la clé d'identité élève** (point back, cf. §6) : `promotion_enrollments.discord_id` vs `students.email`(+`discord_user_id` nullable) vs `student_subject_enrollment.user_id`(=`discord_user_id`). L'héritage §6 suppose un `discord_user_id` présent (élève **vérifié**) ; le cas **pré-inscription email-only** (pas encore sur Discord) n'a pas de clé commune → à couvrir (mapping email↔discord_user_id à la vérif RFC-067).

### Questions plugin → produit (ajoutées 2026-05-27)

| # | Question | Contexte |
|---|----------|----------|
| P1 | **Niveau cible élève (gamification)** | L'élève choisit son objectif ("je vise mention TB") à l'inscription. **V1 ou V2 ?** Cf. RFC-095 §6.1. |
| P2 | **Échelle de niveaux** | Générique (⭐→⭐⭐⭐⭐) ou scolaire (moyenne / mention TB) ou libre ? |

## 12. Décisions actées (2026-05-27)
- Specialty = sujet unifié ✅ (front + back).
- Matiere → `(cohorte × Specialty)`, ré-ancrage sans suppression ✅.
- Canaux orthogonaux (RoomModel→Expert), canal-par-matière déprécié ✅.
- Promotion non supprimée ✅ (correction d'une hypothèse initiale erronée).
- V1 personae intacte ✅.
- **Tout ce qui touche aux experts reste en place** ✅ — entité `Expert` (socle, jamais touchée) **ET** « Programmes Experts » (#180) : le retrait précédemment envisagé par le front est **annulé**.

---

*RFC-097 — base de consolidation. Implémentation hors périmètre de cette RFC (spec d'abord, code ensuite, après sign-off équipes).*
