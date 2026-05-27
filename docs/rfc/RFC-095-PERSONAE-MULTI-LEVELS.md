# RFC-095 — Assistant DM par élève : inscription matières + routing contraint

> Statut : Draft v2 2026-05-24 · Owner : product · Co-auteurs : front + back
> Référence amont : RFC-081 v4.1 (personae bot) + audit Discord 2026-05-21 (`docs/issues/2026-05-21-discord-simplification-audience-personae.md`)
> Audience : back, front, plugin Discord, n8n
>
> **v2 (2026-05-24)** — Refonte complète du modèle suite à l'analyse design (cf. §13 changelog). La v1 proposait une « audience statique attachée à un groupe » résolue par appartenance. Elle s'effondrait sur le cas d'usage réel (**DM 1:1 élève↔bot, élève multi-matières**) : un élève en 3 spécialités appartenait à 3 groupes → soit 3 bots dédiés (≈15 bots/classe, ingérable), soit un chevauchement systématique d'audiences en DM. La v2 reconstruit autour de **1 assistant DM par élève + inscription aux matières + routing sémantique contraint au périmètre inscrit**.

## 1. Contexte et motivation

RFC-081 v4.1 a livré le **Personae bot** (Expert + Spécialité + Style + Brique + Modèles, scopé par Canal). Le résolveur compose un system_prompt qui décrit **qui est l'assistant**.

Manque : **à qui l'assistant s'adresse**, et surtout **comment un même élève multi-matières interagit avec l'assistant**.

### 1.1 Le cas d'usage cible (tranché 2026-05-24)

- **Canal = DM 1:1** entre l'élève et **un seul assistant**. *(Décision : pas de bot dans un salon « classe » — l'échange privé est jugé plus pertinent.)*
- L'élève suit **plusieurs matières** (ex. Première : spé Histoire + spé Maths + spé SVT, plus le tronc commun → potentiellement ~15 matières).
- **Anti-pattern rejeté** : 1 bot dédié par matière → l'élève jonglerait entre 15 DM, l'admin configurerait 15 bots/classe. Ingérable.

### 1.2 La clé du modèle : l'inscription comme périmètre

> *Mots du user (2026-05-24) : « Il faudra qu'on sache à l'avance quelles sont les matières auxquelles l'élève est enregistré. Soit il a une audience large, soit il s'inscrit à x matières, et le routing sémantique devra en tenir compte. »*

> *Précision user (2026-05-24) : « Import ENT/Pronote → à oublier. Ce sera une inscription : il faut prévoir l'enregistrement en base et passer les informations au bot — le "comment" reste à voir. »*

**Décisions actées** : l'inscription est un **acte explicite persisté en base** (table `student_subject_enrollment`, §4.2) — **pas** un import depuis un SI externe (ENT/Pronote). Reste à préciser : (a) l'acteur de l'inscription (admin ? flux dédié ?) et (b) le mécanisme de transmission du périmètre + audiences au bot au runtime (cf. §4.6 + Q5).

L'élève est **inscrit** à un ensemble de matières. Cette inscription définit son **périmètre** : l'assistant ne route les questions que **dans ce sous-ensemble**, pas dans tout le catalogue.

```
Élève Marie inscrite à :  [Histoire — avancé] · [Maths — moyen] · [SVT — débutant]
                              ↑ son périmètre (3 specialties + 3 audiences)

Question « explique le logarithme »
   → routing sémantique classe DANS {Histoire, Maths, SVT}  (3 candidats, pas 15)
   → "Maths"
   → bot      = Specialty Maths (RFC-081)
   → audience = celle de l'inscription Maths de Marie (niveau moyen)
```

## 2. Modèle conceptuel

### 2.1 Les 3 niveaux (revisités v2)

| Niveau | Question | Porté par | Statut |
|---|---|---|---|
| **1 — bot** | « Qui je suis ? » | Specialty + Style + Models (RFC-081) | ✅ livré |
| **2 — audience** | « À qui je parle, et à quel niveau ? » | `audience_personae` (catalogue) consommée **via l'inscription élève** | 📝 cette RFC |
| **3 — routing** | « De quoi me parle l'élève, là, maintenant ? » | classifieur sémantique **contraint au périmètre inscrit** | 📝 cette RFC |

> Note v2 : la v1 séparait « audience groupe » (niveau 2) et « audience user » (niveau 3). La v2 **fusionne** ces notions : l'audience est cataloguée (réutilisable), et l'**inscription** `(élève × matière → audience)` fournit l'effet « par-user » sans créer une audience par user. Le 3ᵉ niveau devient le **routing** (la dimension dynamique), pas un 3ᵉ type d'audience.

### 2.2 Composition runtime

```
À chaque message de l'élève en DM :

  1. ROUTING    question → specialty ∈ périmètre_inscrit(élève)   (ou fallback)
  2. BOT        charge Specialty + Style + Models (RFC-081)
  3. AUDIENCE   charge audience_personae de l'inscription (élève, specialty)
  4. COMPOSE    system_prompt =
                  Expert.base_prompt
                + Specialty.context_prompt
                + Style.prompt_modifier
                + "[Audience]\n" + audience.description
                + audience.style.prompt_modifier   (si style)
```

### 2.3 Pas d'entité « Personae » persistée (inchangé RFC-081 §16/§19)

Le « Personae effectif » reste une **résolution runtime**. La v2 ajoute juste 2 entrées persistées : le **catalogue audience** + l'**inscription élève**.

## 3. Niveau 1 — Personae bot (RFC-081, livré — pour mémoire)

4 entités catalogue (Expert étendu + Specialty + Style + Brique) + `channel_bindings` + résolveur + 8 perms `personae:{specialty,style,binding,brick}:{read,write}`. Entièrement livré (PR1→PR5 + hotfixes). La v2 **réutilise** Specialty/Style sans les modifier.

## 4. Niveau 2 — Audience + inscription (cette RFC)

### 4.1 Catalogue `audience_personae`

Une **audience** = une caractérisation réutilisable d'un public-cible : qui ils sont, ce qu'ils attendent, le ton qui leur convient.

Exemples :
- *« Niveau avancé — vise 16+ au bac. Vocabulaire technique attendu, démonstrations rigoureuses. Ton stimulant. »*
- *« Niveau débutant — découverte. Reformuler, multiplier les exemples concrets, vérifier la compréhension. Ton rassurant. »*

| Champ | Type | Rôle |
|---|---|---|
| `id` | UUID PK | |
| `name` | VARCHAR(255) | Nom affiché (« Niveau avancé bac », « Découverte ») |
| `description` | TEXT | Texte libre injecté au runtime |
| `style_id` | UUID nullable FK styles(id) | Réutilise le catalogue Styles RFC-081 (optionnel) — cf. Q1 |
| `is_draft` + `parent_id` | bool + UUID | Draft/Publish aligné RFC-081 §14.6 |
| `is_active` + `set_by` + `set_at` + `updated_at` | meta | Audit |

Pas de `tenant_id` (scope via search_path, cohérent RFC-081 §19.1 Q2).

### 4.2 Inscription élève `student_subject_enrollment`

L'inscription lie un **élève** à une **matière (Specialty)** avec l'**audience** qui le caractérise dans cette matière.

```sql
CREATE TABLE {schema}.student_subject_enrollment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(255) NOT NULL,             -- discord_user_id (snowflake Discord) — identité pivot élève, PAS un Firebase UID (cf. §4.2bis + RFC-095-DM-IDENTITY-RESOLUTION §11)
  specialty_id  UUID NOT NULL REFERENCES {schema}.specialties(id) ON DELETE CASCADE,
  audience_personae_id UUID NULLABLE
                  REFERENCES {schema}.audience_personae(id) ON DELETE SET NULL,
  set_by        VARCHAR(255) NULL,
  set_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, specialty_id)                   -- 1 inscription par (élève, matière)
);

CREATE INDEX ix_enrollment_user ON {schema}.student_subject_enrollment (user_id);
CREATE INDEX ix_enrollment_specialty ON {schema}.student_subject_enrollment (specialty_id);
```

Lecture :
- Le **périmètre** d'un élève = `SELECT specialty_id FROM student_subject_enrollment WHERE user_id = :uid`.
- L'**audience** pour `(élève, matière)` = la ligne correspondante.
- `audience_personae_id` nullable → si NULL, l'élève est inscrit à la matière mais sans audience spécifique → **bot seul pour cette matière** (pas de couche audience, cf. §4.4).

#### 4.2bis — `user_id` = `discord_user_id` (décision 2026-05-26)

`user_id` contient le **`discord_user_id`** (snowflake Discord, chaîne) — **pas** un Firebase UID. Justification :

- C'est déjà l'identité élève **partout** sur la plateforme : ecommerce (`UserCredit` PK `(guild_id, discord_user_id)`, `orders`, `addresses`…), training (`/api/training/enrollments/user/{discord_id}`).
- Il n'existe **pas** de table `discord_students` ni de mapping fiable `discord ↔ firebase` ; exiger un compte Firebase par élève Discord est irréaliste.
- En DM, le bot a déjà `discord_user_id` → **le « pont d'identité » `discord_user_id → user_id` s'effondre** (l'identité *est* le `discord_user_id`). Seul `guild_id → tenant_id` reste à résoudre (existant : `GET /api/n8n/tenants/resolve`).
- Le `VARCHAR(255)` accueille le snowflake sans migration.

Source des élèves connus d'un tenant (pour l'UI admin) : table publique `discord_user_mappings`, listable via `GET /api/owner/students`. Détail complet : `docs/guides/RFC-095-DM-IDENTITY-RESOLUTION.md` §11.

### 4.3 Routing sémantique contraint (niveau 3)

> **Décision (2026-05-24)** : routing par **classifieur LLM cheap** (Haiku-class), pas embeddings. Justif : robustesse sur les questions ambiguës ; le périmètre étant petit (3-15 matières), le prompt de classification reste court et peu coûteux. Embeddings cosine gardés comme optimisation V2 éventuelle si volume/coût le justifie.

À chaque message, classifier la question **uniquement dans le périmètre inscrit** :

```python
async def route_subject(question: str, enrolled: list[Specialty]) -> Specialty | None:
    if not enrolled:
        return None                       # élève sans inscription → fallback large
    if len(enrolled) == 1:
        return enrolled[0]                # pas de routing nécessaire (économie d'1 appel)
    # Classification LLM cheap contrainte aux N matières inscrites (N : 3-15).
    # Prompt : "Parmi ces matières {names+descriptions}, laquelle correspond
    # à la question ? Réponds par l'id, ou 'aucune'." → parse + seuil confiance.
    return await classify_llm_cheap(question, candidates=enrolled)
```

**Bénéfices du périmètre contraint** :
- **Accuracy** ↑ — classer parmi 3-15 candidats, pas tout le catalogue.
- **Coût** ↓ — prompt court (peu de candidats) + modèle cheap.
- **Court-circuit** : 1 seule matière inscrite → pas d'appel de classification.
- **Traçable** : logger la matière retenue + la raison (debug/observabilité).

### 4.4 Comportement hors-périmètre ou ambigu

> **Décision (2026-05-24)** : l'assistant est **restreint aux matières inscrites**. Pas de notion d'« audience large » ni d'assistant généraliste de repli — une question hors inscription est **déclinée**.

| Cas | Comportement |
|---|---|
| Question **hors des matières inscrites** | **Décline** : « Cette matière n'est pas dans ton inscription. » Pas de réponse LLM sur le fond. |
| Élève **sans aucune inscription** | Décline de même (rien à router). À traiter en amont côté UX : inviter à s'inscrire. |
| Routing **peu confiant** (score < seuil) | Demander à l'élève de préciser (« Tu poses une question de Maths ou d'Histoire ? ») — choix restreint à son périmètre |
| Inscription **sans `audience_personae_id`** | Bot seul pour cette matière (pas de couche audience) — l'élève est bien inscrit, juste sans audience configurée |

### 4.5 Résolveur runtime

```python
async def resolve_personae_dm(user_id: str, question: str) -> EffectivePersonae:
    enrolled = await list_enrolled_specialties(user_id)        # périmètre
    specialty = await route_subject(question, enrolled)        # niveau 3 routing

    if specialty is None:
        # Hors périmètre / pas d'inscription → on décline, PAS de fallback
        # vers un assistant généraliste (cf. §4.4).
        return EffectivePersonae(out_of_scope=True)

    bot = await resolve_bot(specialty)                          # RFC-081 (specialty/style/models)
    enrollment = await get_enrollment(user_id, specialty.id)
    audience = (
        await load_audience(enrollment.audience_personae_id)
        if enrollment and enrollment.audience_personae_id else None
    )
    return EffectivePersonae(bot=bot, audience=audience)
```

`EffectivePersonae` étend la sortie RFC-081 avec un bloc `audience` optionnel.

### 4.6 Endpoints HTTP

```
# Catalogue audience (pattern aligné RFC-081 §14.9)
GET    /api/owner/audience-personae[?include_drafts=true]
GET    /api/owner/audience-personae/{id}
POST   /api/owner/audience-personae                          # → draft
PATCH  /api/owner/audience-personae/{id}
POST   /api/owner/audience-personae/{id}/duplicate-as-draft
POST   /api/owner/audience-personae/{id}/publish
DELETE /api/owner/audience-personae/{id}

# Inscription élève
GET    /api/owner/students/{user_id}/enrollments              # périmètre d'un élève
PUT    /api/owner/students/{user_id}/enrollments              # full-replace atomique
       body: [{ specialty_id, audience_personae_id? }, ...]
DELETE /api/owner/students/{user_id}/enrollments/{specialty_id}

# Inverse lookups
GET    /api/owner/audience-personae/{id}/students             # élèves utilisant cette audience
GET    /api/owner/specialties/{id}/students                   # élèves inscrits à une matière

# Runtime (n8n / chatbot-core) — résolveur DM
GET    /api/n8n/personae/resolve-dm?user_id=&question=        # route + compose
```

> Note : `resolve-dm` prend la `question` pour le routing. Alternative discutée : un endpoint qui retourne le périmètre + audiences, et le routing fait côté n8n. Cf. Q6.

### 4.7 RBAC

2 nouvelles permissions atomiques tenant-scoped :

| Permission | Couvre |
|---|---|
| `personae:audience:read` | List/get audience personae + inscriptions + inverse lookups |
| `personae:audience:write` | CRUD audience personae + PUT/DELETE inscriptions élève |

→ **10 perms total**. Bundle UI `PERSONAE_MANAGER_BUNDLE` étendu à 10. Mappées owner+admin via migration publique (modèle RFC-081 §14.7 + fix `rfc081_v4_personae_perms_fix_001`).

## 5. Routing — choix technique (à benchmarker)

| Approche | Coût/latence | Accuracy | Note |
|---|---|---|---|
| **Embeddings cosine** (question vs `Specialty.context_prompt`) | ~0 (vecteurs pré-calculés) | Bonne sur périmètre contraint | Reco par défaut V1 |
| **LLM cheap classifier** (Haiku) | 1 appel court/message | Excellente, gère l'ambiguïté | Si embeddings insuffisants |
| **Sélecteur explicite élève** (« /maths ») | 0 | Parfaite | Friction ; fallback quand routing incertain |

**Décision (2026-05-24) : LLM cheap classifier en V1** (Haiku-class), contraint au périmètre inscrit. Embeddings cosine = optimisation V2 si volume/coût le justifient. Sélecteur explicite élève = fallback UX quand la confiance du classifieur est faible.

## 6. Niveau « audience user » individuel — hors scope V1

Le besoin « chaque user a son personae perso » (prénom, préférences) est **absorbé par l'inscription** : l'audience par `(user, matière)` capture déjà la personnalisation utile. Une personnalisation fine par-user (au-delà de la matière) reste hors scope V1.

### 6.1 Extension future — le « niveau » comme dimension de l'audience (V2+)

Piste validée user (2026-05-24) : l'audience d'une inscription peut encoder un **niveau** (débutant / intermédiaire / avancé), et ce niveau pourrait être :

- **Déclaré par l'élève** lui-même à l'inscription (« je me sens avancé en Maths »).
- **Déterminé par un quiz** de positionnement à l'entrée dans une matière.
- **Tracé dans le temps** pour suivre la **progression souhaitée** (l'élève vise un niveau cible ; l'audience évolue à mesure qu'il progresse).

Implications schéma (à concevoir en V2) : `student_subject_enrollment` pourrait porter un `level` (enum/int) + un `target_level`, et l'audience injectée serait modulée par ce niveau (ex. même Specialty Maths, mais consignes adaptées débutant vs avancé). Le quiz + le tracking de progression sont une **feature à part entière** (hors RFC-095 V1) mais le modèle de données est compatible : ajouter des colonnes nullables à `student_subject_enrollment` sans casse.

**V1 ne modélise PAS le niveau** : l'inscription = `(élève, matière, audience?)`, 1 ligne par couple. Le niveau, le quiz et la progression sont notés ici comme cap produit, pas comme livrable V1.

## 7. Cohabitation et migration

### 7.1 Pas d'impact RFC-081

Le niveau 1 (bot) est inchangé. Les bindings canal existants continuent. La v2 ajoute un **chemin DM** parallèle.

### 7.2 Migration alembic tenant (additive)

- `CREATE TABLE audience_personae` (cf. §4.1)
- `CREATE TABLE student_subject_enrollment` (cf. §4.2)
- UNIQUE partial `audience_personae(name) WHERE is_draft = FALSE`
- Migration publique : 2 perms `personae:audience:*` → owner+admin (pattern search_path-aware, cf. `rfc081_v4_personae_perms_fix_001` — **ne pas refaire le bug `"{schema}".roles`**).

⚠️ **Vérif pré-FK cross-tenant** (leçon du fix RBAC #2415) : confirmer que `specialties` existe + type PK cohérent sur tous les tenants avant de poser les FK `student_subject_enrollment.specialty_id`.

## 8. Plan d'implémentation — découpage PR (back)

4 PRs séquentielles (B2 dépend de B1, B3 de B1+B2, B4 de B3). Chaque PR
livre code **+ tests** (pas de PR « tests » séparée — tests dans chaque PR).

### Leçons RFC-081 à respecter impérativement (toutes PRs)

- **Migrations RBAC search_path-aware** : utiliser le pattern de
  `rfc081_v4_personae_perms_fix_001` (`SET search_path TO "{schema}", public`
  + refs non-qualifiées). **NE PAS** refaire `"{schema}".roles` (les roles
  sont en `public`, les perms+role_permissions en tenant — cf. fix #2415).
- **Types FK cohérents** : vérifier le type PK réel avant de poser une FK
  (leçon `rag_source_id` VARCHAR vs UUID). `specialties.id` = UUID,
  `audience_personae.id` = UUID → OK. `user_id` = VARCHAR (**`discord_user_id`**,
  pas de FK vers users — cf. §4.2bis).
- **Tables tenant vs public** : `audience_personae` + `student_subject_enrollment`
  sont **per-tenant** (comme specialties). Vérifier que `specialties` existe
  bien dans le schéma cible avant la FK.
- **Pydantic `extra="forbid"`** partout + perms 3-segments (validateur OK
  depuis #2414).
- **Idempotence migrations** : `NOT EXISTS` / `IF NOT EXISTS` + skip public
  pour les tables tenant.

### PR B1 — Catalogue `audience_personae` (~1j)

| Livrable | Détail |
|---|---|
| Migration tenant | `audience_personae` (UUID PK, name, description, style_id? FK styles ON DELETE SET NULL, is_draft+parent_id, is_active, set_by/set_at/updated_at) + UNIQUE partial `name WHERE NOT is_draft` + index parent_id |
| Migration publique RBAC | 2 perms `personae:audience:{read,write}` → owner+admin, **pattern search_path-aware** |
| RBAC code | `PermissionDomain.PERSONAE_AUDIENCE` + 2 entries `STANDARD_PERMISSIONS` |
| Model | `AudiencePersonae` (mirror `Specialty`/`Style`) |
| Schemas | `AudienceCreateRequest`/`UpdateRequest`/`Response`/`ListResponse` (extra=forbid) |
| Service | `AudiencePersonaeService` — CRUD + Draft/Publish (mirror `SpecialtyService` : create_draft, update_draft, duplicate_as_draft, publish_draft, delete_draft + exceptions typées) |
| Routes | `/api/owner/audience-personae` — 7 routes (list/get/create/update/duplicate-as-draft/publish/delete) + register `app/api.py` |
| Tests | service (CRUD+draft/publish) + routes (happy/error + RBAC bypass + extra=forbid 422) |
| Dépendances | **aucune** (catalogue standalone) — peut démarrer immédiatement |

### PR B2 — Inscription `student_subject_enrollment` (~0.8j)

| Livrable | Détail |
|---|---|
| Migration tenant | `student_subject_enrollment` (UUID PK, user_id VARCHAR, specialty_id FK CASCADE, audience_personae_id? FK SET NULL, UNIQUE(user_id,specialty_id), index user+specialty) |
| Model | `StudentSubjectEnrollment` |
| Schemas | `EnrollmentItem`, `EnrollmentSetRequest` (list), `EnrollmentListResponse` (extra=forbid) |
| Service | `EnrollmentService` — list_for_student, set_enrollments (full-replace atomique diff add/remove), delete_one, inverse (students_for_audience, students_for_specialty) |
| Routes | `GET/PUT/DELETE /api/owner/students/{user_id}/enrollments` + 2 inverse lookups |
| RBAC | réutilise `personae:audience:{read,write}` |
| Tests | service (set diff, inverse) + routes |
| Dépendances | **B1** (FK `audience_personae_id`) |

### PR B3 — Routing + résolveur DM (~1.2j)

| Livrable | Détail |
|---|---|
| Settings | env vars : modèle classifieur cheap (`PERSONAE_ROUTER_MODEL`, défaut Haiku-class), seuil de confiance |
| Routing | `route_subject(question, enrolled)` — court-circuit si 1 matière ; sinon classifieur **LLM cheap** contraint au périmètre + parse + seuil |
| Helpers | `list_enrolled_specialties(user_id)`, `get_enrollment(user_id, specialty_id)` |
| Résolveur | `resolve_personae_dm(user_id, question)` → compose bot (RFC-081) + audience (inscription) ; fallbacks (no enrollment / hors-scope / faible confiance) |
| Endpoint | `GET /api/n8n/personae/resolve-dm?user_id=&question=` (X-Service-Token, search_path scopé — pattern RFC-094 `_get_n8n_db`) |
| Schémas | étendre `EffectivePersonaeResponse` avec bloc `audience` + `routed_specialty_id` + `routing_confidence` |
| Tests | routing (LLM mocké : haute/basse confiance, hors-scope) + résolveur + endpoint (happy + fallbacks) |
| Dépendances | **B1 + B2 + RFC-081** (specialty/style resolver) |

### PR B4 — Doc compagnon + smoke E2E (~0.7j)

| Livrable | Détail |
|---|---|
| Doc front | §14 « Audience personae + inscription » dans `FRONTEND-RFC-081-V4-PERSONAE.md` (endpoints catalogue + inscription + RBAC 10 perms) |
| Doc n8n | contrat `resolve-dm` (params, réponse, fallbacks) pour chatbot-core |
| Smoke E2E | golden path DM multi-matières sous `INTEGRATION=1` (inscrire élève 3 matières → resolve-dm sur 2 questions de matières ≠ → vérifier routing + audience correcte) |
| Dépendances | **B3** |

**Total back : ~3.7j**, séquentiel B1→B2→B3→B4.

### Front (hors périmètre back, ~3j à affiner)

Catalogue audience (vue `/admin/personae/audiences` + `AudiencePersonaeFormDialog`) + UI inscription élève (dépend de Q2 — flux Discord élève vs admin) + carte hub. **B1 front peut démarrer dès B1 back mergé.**

### Ordre de merge recommandé

```
B1 (catalogue)  ─→ B2 (inscription)  ─→ B3 (routing+resolve-dm)  ─→ B4 (doc+E2E)
   front B1 ────────────────────────────────────────────────────→ front intégrations
```

B1 back + front B1 peuvent démarrer en parallèle immédiatement (ne dépendent pas de Q2). B3 attend la confirmation du contrat `resolve-dm` avec n8n. Le flux d'inscription Discord (Q2) ne bloque que le front, pas le back B1/B2.

## 9. Questions ouvertes (à arbitrer avant code)

| # | Question | Arbitre |
|---|---|---|
| ~~1~~ | ✅ **Tranché (2026-05-24, front+back alignés)** : `style_id` **réutilise le catalogue Styles RFC-081** (cohérence, pas de catalogue en double). FK `styles(id) ON DELETE SET NULL`. | back |
| 2 | Inscription = acte explicite en base (~~ENT/Pronote abandonné~~). **Direction actée (2026-05-24)** : **double voie** — auto-inscription élève côté **Discord** + inscription manuelle **admin**. Reste à détailler les 2 flux UX. | produit |
| ~~2bis~~ | ✅ **Tranché (2026-05-24)** : routing + composition **côté back** via `resolve-dm` (prend la `question`, renvoie le prompt composé). n8n reste bête. Cohérent pattern `/api/n8n/personae/resolve`. | back |
| ~~3~~ | ✅ **Tranché (2026-05-24, front+back alignés)** : `/api/owner/audience-personae` (cohérent `/personae-bricks`). | back |
| ~~4~~ | ✅ **Clos (2026-05-24)** : non-question. L'inscription = 1 ligne par `(élève, matière)` (UNIQUE), pas de notion de « niveau » en V1. Le « niveau » (déclaré / quiz / progression) est une **extension future** notée §6.1, hors V1. |
| ~~5~~ | ✅ **Tranché (2026-05-24)** : **LLM cheap** (Haiku-class) contraint au périmètre inscrit. Embeddings = optimisation V2 éventuelle. | back |
| ~~6~~ | ✅ **Tranché** = Q2bis : routing côté back (`resolve-dm`). | back |
| **5bis** | ⏳ **L'appel LLM de classification du routing passe-t-il par MCP** (cohérent « tout LLM via MCP », chat.api n'a pas de client d'inférence direct) ou par un mini-client cheap dédié dans chat.api ? | back + **MCP** |
| ~~7~~ | ✅ **Clos (2026-05-24)** : **pas** d'« audience large ». L'assistant est restreint aux matières inscrites ; une question hors périmètre est **déclinée** (§4.4). Aucune entité par défaut à créer. |

## 9bis. Impacts équipes — chaque équipe doit se prononcer

> Cette section liste l'impact pressenti par le back sur chaque équipe. **Chaque équipe renseigne sa colonne « Position »** (✅ OK / ⚠️ réserves / ❌ bloquant) + charge estimée + remarques, avant le démarrage de la PR B3 (runtime). Tant qu'une ligne est ⏳, l'intégration runtime n'est pas figée.

### 9bis.1 — n8n / chatbot-core

| Item | Détail | Position | Charge | Remarques |
|---|---|---|---|---|
| Câblage `resolve-dm` | Nouveau `GET /api/n8n/personae/resolve-dm?user_id=&question=` à appeler pour le flux DM élève (en plus de `/resolve` RFC-081 par canal). | ⏳ à évaluer | | |
| Gestion `out_of_scope` | Si réponse `out_of_scope=true` → afficher le message de décline (matière hors inscription). | ⏳ à évaluer | | |
| Gestion faible confiance | Si le back renvoie une demande de précision (« Maths ou Histoire ? ») → la relayer à l'élève. | ⏳ à évaluer | | |
| Auth service-to-service | Réutilise `X-Service-Token` + `X-Tenant-ID` (pattern existant). | ⏳ à évaluer | | |

### 9bis.2 — plugin Discord

| Item | Détail | Position | Charge | Remarques |
|---|---|---|---|---|
| UX inscription élève | **Nouveau** : permettre à l'élève de s'inscrire à ses matières (commande slash ? menu select ? réaction ?). Q2 « double voie », volet Discord. | ⏳ à évaluer | | |
| Flux DM 1:1 | Router les messages DM élève↔bot vers le pipeline resolve-dm. | ⏳ à évaluer | | |
| UX décline / précision | Afficher le message hors-scope ; si demande de précision, potentiellement des boutons Discord. | ⏳ à évaluer | | |

### 9bis.3 — MCP

| Item | Détail | Position | Charge | Remarques |
|---|---|---|---|---|
| Appel LLM de classification (Q5bis) | Le routing `resolve-dm` doit classer la question via un LLM cheap. chat.api **n'a pas de client d'inférence direct** → l'appel transiterait par MCP (`MCPHTTPDispatch`). À cadrer : modèle utilisé, quota, audit. | ⏳ à évaluer | | |
| Alternative client direct | Donner à chat.api un mini-client cheap dédié (contourne MCP, casse le principe « tout LLM via MCP »). | ⏳ à évaluer | | |
| Skills / notebooks | Résolveur renvoie `skill_ids`/`notebook_ids` (RFC-081, déjà existant) — additif, **a priori pas d'impact MCP**. À confirmer. | ⏳ à évaluer | | |

### 9bis.4 — front (rappel)

| Item | Détail | Position | Charge | Remarques |
|---|---|---|---|---|
| UI catalogue audience | CRUD `/api/owner/audience-personae` (Draft/Publish, mirror Specialty/Style). | ⏳ à évaluer | | |
| UI inscription (admin) | Gérer les inscriptions élève×matière côté owner (`/api/owner/students/{user_id}/enrollments`). | ⏳ à évaluer | | |

> Les contrats d'endpoints (params, payload in/out, codes d'erreur) sont produits en **PR B0** (doc-first, cf. plan d'action `docs/issues/2026-05-24-rfc-095-plan-action-back.md`) **avant** tout code, pour que chaque équipe se prononce sur une base figée.

## 10. Hors scope V1

- Personnalisation fine par-user au-delà de la matière (§6).
- Templates d'audience cross-tenant prédéfinis (« Niveau bac », « Découverte »).
- Audience analytics (conversations par matière/niveau).
- Routing multi-tours (mémoire du sujet courant dans la conversation pour éviter de reclasser chaque message) — optimisation V2.

## 11. Schéma récapitulatif

```
                       ┌─────────────────────────────┐
   Catalogue (owner)   │ audience_personae            │  ← réutilisable tenant-wide
                       │  (name, description, style?)  │
                       └──────────────┬──────────────┘
                                      │ référencée par
                       ┌──────────────┴──────────────┐
   Inscription élève   │ student_subject_enrollment   │
                       │  (user_id, specialty_id,      │
                       │   audience_personae_id?)      │
                       └──────────────┬──────────────┘
                                      │ périmètre + audience
   Runtime DM 1:1                     ▼
   élève ──question──► route_subject(question, périmètre) ──► specialty
                                      │
                                      ├─► bot      = RFC-081 resolve(specialty)
                                      └─► audience = enrollment(user, specialty).audience
                                      ▼
                              system_prompt composé
```

## 12. Changelog

- **2026-05-26 (v2.5)** — Ajout §9bis « Impacts équipes » (n8n / plugin Discord / MCP / front), chaque équipe doit renseigner sa position avant B3. Ajout Q5bis (chemin de l'appel LLM de classification : via MCP ou client direct ?). Plan d'action : ajout d'une **PR B0 doc-first** (contrats endpoints + payloads in/out) en tête de séquence.
- **2026-05-24 (v2.4)** — Q4 + Q7 clos. Q4 : pas de « niveau » en V1 (mon erreur de framing) — 1 ligne par (élève, matière) ; le niveau (déclaré/quiz/progression) devient une **extension future §6.1**. Q7 : pas d'« audience large » — hors-périmètre = décline (§4.4). Résolveur §4.5 corrigé (`out_of_scope` au lieu de `broad_default`). **Toutes les questions ouvertes sont désormais tranchées** — spec prête à coder.
- **2026-05-24 (v2.3)** — Q1 (style_id réutilise catalogue Styles) + Q3 (naming `/api/owner/audience-personae`) tranchées, front+back alignés. §5 reco routing corrigée (LLM cheap, plus « embeddings d'abord »).
- **2026-05-24 (v2.2)** — Décisions tranchées : routing = **LLM cheap** contraint au périmètre (Q5) ; routing + composition **côté back** via `resolve-dm` (Q2bis/Q6) ; inscription **double voie Discord élève + admin** (Q2, flux UX à détailler).
- **2026-05-24 (v2.1)** — Précision inscription : import ENT/Pronote abandonné, l'inscription est un acte explicite persisté en base. Reste ouvert : l'acteur de l'inscription (Q2) + le mécanisme de transmission au bot (Q2bis/Q6).
- **2026-05-24 (v2)** — Refonte autour de « DM 1:1 + inscription matières + routing contraint ». Abandon du modèle v1 « audience statique par groupe » qui ne tenait pas sur le cas DM multi-matières (chevauchement systématique / explosion du nombre de bots). Fusion des anciens niveaux 2/3 : l'audience est cataloguée + consommée via l'inscription ; le « niveau 3 » devient le routing dynamique.
- **2026-05-21 (v1)** — Draft initial 3 niveaux (bot / audience groupe / audience user), suite à l'audit Discord.
