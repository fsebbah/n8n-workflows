# RFC-084 — Program Builder : extraction-first et parcours multi-matière

**Statut** : 📥 Proposition (v1) — analyse front, à arbitrer côté back + produit
**Date** : 2026-05-05
**Auteur** : équipe front
**Audience** : équipe back, équipe produit
**Lié** :
- RFC-080 (`expert_question_responses` — convention 1 ligne JSONB par parcours, déjà mergé)
- RFC-081 v3 (personas + bindings par canal)
- RFC-082 (rattachement programme → Discord)
- PR front #2019 / #2023 / #2025 / #2031 / #2032 / #2033 (Quick-Action « Programme à partir d'un référentiel », 3 phases, dispatch entry points, runner LLM)
- `docs/test-plans/RFC-076-077-user-testing.md` (plan de tests utilisateurs)

---

## 1. Contexte produit

### 1.1. Le scénario actuel

La Quick-Action « Programme à partir d'un référentiel » (`program-from-reference-secondary` / `-elementary` / `-higher-ed` / `-enterprise`) est livrée côté front en 3 phases (cf. `ExpertProgramBuilderView`) :

```
Phase 1 — Référentiel + volume horaire + public visé   (saisie user)
   ↓
Phase 2 — Analyse du référentiel + questions dynamiques (LLM)
   ↓
Phase 3 — Programme annuel généré, éditable             (LLM + user)
```

Phase 1 demande à l'user de saisir manuellement :
- Le contenu du référentiel (texte collé / fichier / URL)
- Le **volume horaire** (hebdo, total, cadence, durée séance)
- Le **public visé** (niveau de classe, effectif, profil)
- Le type de référentiel

Le tout **avant** que le LLM ait vu le document.

### 1.2. Limites identifiées (retour user staging 2026-05-05)

#### L1 — Saisie redondante

Un référentiel typique (programme officiel EN, fiche RNCP/RS, cahier des charges entreprise) **contient déjà** la majorité des informations qu'on demande à l'user de saisir manuellement :
- Le niveau de classe (« Programme du cycle terminal général — classe de Seconde »)
- Le volume horaire prescrit (« 3 heures hebdomadaires »)
- Le public cible (« élèves du cycle terminal général »)
- Les compétences et notions

Demander à l'user de retaper ces infos est :
- **redondant** — le LLM peut les extraire
- **erroné** — l'user transcrit avec des typos ou approximations
- **frictionnel** — long avant de voir un premier résultat

#### L2 — Pas de notion de matière

Le formulaire actuel suppose **1 référentiel = 1 matière**. Or :

| Type de référentiel | Couvre typiquement |
|---|---|
| Programme officiel EN (collège, lycée) | **Toutes** les disciplines pour un niveau (Histoire-Géo, Maths, Français, SVT, Physique-Chimie, Anglais, EPS, Arts plastiques, Philosophie…) |
| Référentiel RNCP / RS | Plusieurs **blocs de compétences** distincts |
| Cahier des charges entreprise | Plusieurs thématiques de formation (vente, management, sécurité, qualité…) |
| Programme primaire (CP-CM2) | Tous les domaines (français, maths, sciences, EMC, EPS, arts, langue…) |

Le pattern « 1 référentiel = 1 matière » est l'exception, pas la règle.

#### L3 — Pas d'anticipation pour l'user

L'utilisateur ne sait pas combien de programmes annuels il va devoir construire tant qu'il n'a pas lu lui-même le document. Il découvre le scope au fur et à mesure.

#### L4 — Pas de prévision côté back

L'analyse de RFC-080 et de l'implémentation actuelle montre :
- ✅ Le mécanisme de runner LLM avec streaming existe (PR β2.bis, via WebSocket MCP)
- ✅ Le pattern « 1 ligne JSONB par parcours » (RFC-080 §2.2) peut accueillir 1 ligne par matière
- ✅ Phase 2 = analyse + questions dynamiques (extensible)
- ❌ Aucune étape d'extraction structurée multi-matière en amont
- ❌ Aucune sélection de matières par l'user (UI Phase 1 actuelle suppose 1 matière implicite)
- ❌ Aucune orchestration multi-parcours (1 référentiel → N programmes)
- ❌ Aucun stockage côté DB d'une référence à l'analyse partagée (= si plusieurs parcours partagent la même analyse extraite, il n'y a pas de pivot pour les relier)

---

## 2. Vocabulaire

| Terme | Définition |
|---|---|
| **Référentiel** | Document fourni par l'user (texte, fichier, URL) qui cadre un domaine pédagogique ou une formation. Couvre 1 ou N **matières**. |
| **Matière** (ou **bloc de compétences** en formation pro) | Discipline pédagogique cohérente couverte par le référentiel. Exemples : « Histoire-Géographie », « Mathématiques », « Bloc 2 — Gestion des risques ». |
| **Analyse de référentiel** (**ReferenceAnalysis**) | Résultat structuré de l'extraction : type, niveau, volume, public, **liste des matières** + métadonnées par matière. **Partagée** entre les parcours du même référentiel. |
| **Parcours** (= 1 ligne `expert_question_responses`) | 1 programme annuel pour 1 matière donnée. Lié à une analyse de référentiel parent. |
| **Extraction** | Phase 0 où le LLM (ou un service d'analyse) parse le référentiel et retourne la structure JSON. |
| **Sélection de matières** | Étape UI où l'user pioche les matières du référentiel pour lesquelles il veut construire un parcours. |

---

## 3. Scénario révisé proposé

```
┌───────────────────────────────────────────────────────────────────┐
│ PHASE 0 — Upload & extraction (NOUVEAU)                            │
│  - User colle/upload/lien le référentiel                           │
│  - Bouton « Analyser ce référentiel »                              │
│  - Back / LLM extrait :                                            │
│    • Type de référentiel (programme EN / RNCP / RS / CDC interne)  │
│    • Niveau de classe / cible (2nde, CAP, master, formation pro…)  │
│    • Public implicite                                              │
│    • Volume horaire prescrit (si fourni)                           │
│    • Liste des matières / blocs de compétences couverts            │
│    • Compétences / connaissances par matière                       │
│  - Persistance d'une `ReferenceAnalysis` (cf. §4.1)                │
└───────────────────────────────────────────────────────────────────┘
                               ↓
┌───────────────────────────────────────────────────────────────────┐
│ PHASE 1 — Validation + sélection matières (NOUVEAU)                │
│  - L'user voit l'analyse extraite (preview)                        │
│  - Il peut corriger/compléter (niveau, volume, profil de classe)   │
│  - Il choisit UNE OU PLUSIEURS matières à traiter                  │
│    ☑ Histoire-Géographie                                           │
│    ☐ Mathématiques                                                 │
│    ☑ Français                                                      │
│    ☐ SVT                                                           │
└───────────────────────────────────────────────────────────────────┘
                               ↓
┌───────────────────────────────────────────────────────────────────┐
│ PHASES 2-3 — Une instance par matière (refactor de l'existant)     │
│  Pour chaque matière sélectionnée :                                │
│    Phase 2 : analyse fine + questions ciblées (logique actuelle)   │
│    Phase 3 : programme annuel généré (logique actuelle)            │
│                                                                    │
│  Affichage : tabs ou stepper horizontal entre matières             │
│  Persistance : 1 ligne JSONB `expert_question_responses` par       │
│  matière, toutes liées à la même `ReferenceAnalysis` parent.       │
└───────────────────────────────────────────────────────────────────┘
```

---

## 4. Modèle de données proposé

### 4.1. Nouvelle table `public.reference_analyses`

Pivot entre 1 référentiel uploadé et N parcours générés.

```sql
CREATE TABLE public.reference_analyses (
    id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           VARCHAR(64)    NOT NULL,
    user_id             UUID           NOT NULL,                  -- créateur (user qui a uploadé)
    expert_id           UUID           NOT NULL,                  -- expert depuis lequel l'extraction a été lancée
    quick_action_id     VARCHAR(128)   NOT NULL,                  -- ex: 'program-from-reference-secondary'

    -- Référence brute (input user)
    reference_mode      VARCHAR(16)    NOT NULL,                  -- 'text' | 'url' | 'file'
    reference_text      TEXT           NULL,
    reference_url       TEXT           NULL,
    reference_file_meta JSONB          NULL,                      -- {filename, mime, size, content_base64?}

    -- Analyse extraite (LLM ou service back)
    analysis_status     VARCHAR(16)    NOT NULL DEFAULT 'pending', -- 'pending' | 'extracting' | 'completed' | 'failed'
    extracted_data      JSONB          NULL,                      -- shape §4.2
    extraction_error    TEXT           NULL,
    extracted_at        TIMESTAMPTZ    NULL,

    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES public.users(id)   ON DELETE CASCADE,
    FOREIGN KEY (expert_id) REFERENCES public.experts(id) ON DELETE CASCADE
);

CREATE INDEX idx_reference_analyses_user
    ON public.reference_analyses(tenant_id, user_id, created_at DESC);
CREATE INDEX idx_reference_analyses_status
    ON public.reference_analyses(analysis_status)
    WHERE analysis_status IN ('pending', 'extracting');
```

### 4.2. Shape `extracted_data` JSONB

```jsonc
{
  "reference_type": "programme_officiel_en",  // 'programme_officiel_en' | 'rncp' | 'rs' | 'cdc_entreprise' | 'autre'
  "level": {
    "code": "2nde-generale",
    "label": "Seconde générale et technologique",
    "domain": "secondaire"  // 'primaire' | 'secondaire' | 'superieur' | 'professionnel' | 'continu'
  },
  "audience": {
    "implicit_label": "Élèves du cycle terminal général",
    "size_typical": null,
    "constraints": []  // ex: ['allophones', 'handicap moteur', 'décrochage scolaire']
  },
  "volume": {
    "hours_per_week": 3,
    "total_hours": 108,  // 3h × 36 semaines
    "cadence": "hebdomadaire",
    "session_minutes": 60,
    "source": "explicit_in_document"  // 'explicit_in_document' | 'inferred' | 'not_specified'
  },
  "matieres": [
    {
      "code": "histoire-geo",
      "label": "Histoire-Géographie",
      "competences": ["Comprendre les enjeux du monde contemporain", "..."],
      "notions": ["L'expansion européenne au XVIe", "..."],
      "evaluations_imposees": ["DNB", "Contrôle continu"]
    },
    {
      "code": "francais",
      "label": "Français",
      "competences": ["..."],
      "notions": ["..."],
      "evaluations_imposees": ["Bac écrit", "Bac oral"]
    }
    // …
  ],
  "raw_summary": "10-15 lignes de bilan « ce que le référentiel cadre »",
  "extraction_metadata": {
    "model_used": "claude-sonnet-4-6",
    "tokens_used": 8453,
    "extraction_duration_ms": 12300,
    "confidence_score": 0.85  // si applicable
  }
}
```

### 4.3. Lien `expert_question_responses` → `reference_analyses`

Ajout d'une colonne nullable :

```sql
ALTER TABLE public.expert_question_responses
ADD COLUMN reference_analysis_id UUID NULL
    REFERENCES public.reference_analyses(id) ON DELETE SET NULL;

ALTER TABLE public.expert_question_responses
ADD COLUMN matiere_code VARCHAR(128) NULL;  -- ex: 'histoire-geo' (référence dans extracted_data.matieres[].code)

CREATE INDEX idx_expert_responses_reference_analysis
    ON public.expert_question_responses(reference_analysis_id)
    WHERE reference_analysis_id IS NOT NULL;
```

→ Permet :
- Retrouver tous les parcours d'une même analyse de référentiel
- Afficher dans « Mes programmes » un groupe « Programme officiel 2nde — 4 matières (Histoire-Géo, Français, …) »
- Reprise de session : si l'user revient et veut ajouter une matière oubliée, le pivot `reference_analysis_id` permet de retrouver l'analyse partagée

---

## 5. Logique d'extraction côté back

3 options envisageables pour implémenter l'extraction :

### Option A — Réutiliser le runner LLM existant (RFC-080 §2.2 + PR β2.bis)

**Pattern** : le front envoie un message via WebSocket MCP avec un prompt d'extraction structurée. Le LLM retourne du JSON parseable. Le front parse et persiste via un nouvel endpoint `POST /api/reference-analyses`.

| Avantages | Inconvénients |
|---|---|
| Réutilise l'infra existante (runner, streaming, conv tagguée) | Le LLM doit retourner du JSON valide (prompt engineering soigné) |
| Streaming visible côté user (UX) | Gestion d'erreurs si JSON malformé |
| Travail back minimal (juste l'endpoint persistance) | Couplage UI ↔ extraction (si l'user ferme la page mid-extraction, ça plante) |

### Option B — Endpoint back dédié + appel LLM côté back

**Pattern** : `POST /api/reference-analyses` qui prend le document brut, le back appelle le LLM en interne (avec un prompt fixé), parse le JSON, retourne la `ReferenceAnalysis` complète.

| Avantages | Inconvénients |
|---|---|
| Contrat formel, validation Pydantic stricte | Plus de travail back (~1-2j) |
| Pré-processing possible (PDF → texte côté back) | Pas de streaming visible côté user (ou streaming via SSE/WebSocket dédié) |
| Découplé du runner chat | Coût LLM porté par le back, pas de visibilité user |

### Option C — Hybride : extraction async + polling/WebSocket

**Pattern** : `POST /api/reference-analyses` retourne immédiatement avec `analysis_status=pending`, le back lance l'extraction en async (Celery / queue), le front poll ou écoute via WebSocket l'évolution du status.

| Avantages | Inconvénients |
|---|---|
| Robuste sur les gros docs (timeout HTTP non bloquant) | Le plus de travail back (queue, statut, polling/WS) |
| Pas de blocage UI | Complexité accrue côté front (gestion polling) |
| Possible retry automatique en cas d'échec LLM | Latence utilisateur pour V1 |

### Recommandation front

**Option A pour V1** (livraison rapide, réutilise l'infra). Migration vers C en V2 si la robustesse devient un problème (gros PDF > 50 pages, échecs LLM fréquents, multi-tenant load).

Schéma Option A :

```
Front → WebSocket MCP (runner)
  → prompt d'extraction structurée envoyé au LLM
  → LLM stream : phase 1 = synthèse en texte, phase 2 = JSON dans bloc <json>...</json>
Front → POST /api/reference-analyses (avec extracted_data déjà parsé côté front)
  → back persiste la row, retourne l'id
Front → l'user voit l'analyse, sélectionne les matières
Front → POST /api/expert-responses pour CHAQUE matière sélectionnée
  → avec reference_analysis_id et matiere_code populated
```

---

## 6. Endpoints HTTP proposés

### 6.1. Création d'une analyse de référentiel

```http
POST /api/reference-analyses
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "expert_id": "uuid",
  "quick_action_id": "program-from-reference-secondary",
  "reference_mode": "text",
  "reference_text": "...",
  "reference_url": null,
  "reference_file_meta": null,
  "extracted_data": { /* shape §4.2, peut être null si Option C */ }
}
```

Réponses :
- `201` — `ReferenceAnalysis` créée. Body = entité complète avec `id`.
- `400` — validation échoue (mode incohérent, champs manquants, expert inconnu, etc.)
- `403` — pas accès à cet expert dans ce tenant
- `502` — si Option B/C et l'extraction LLM échoue

### 6.2. Lecture d'une analyse

```http
GET /api/reference-analyses/{analysis_id}
GET /api/users/me/reference-analyses?expert_id={uuid}&limit=20&offset=0
```

### 6.3. Mise à jour de l'analyse extraite (correction user)

```http
PATCH /api/reference-analyses/{analysis_id}
{
  "extracted_data": { /* user a corrigé le niveau, le volume, ou ajouté une matière manuellement */ }
}
```

### 6.4. Suppression

```http
DELETE /api/reference-analyses/{analysis_id}
```

→ Soft delete (status passe à `archived`) ; les `expert_question_responses` liés gardent leur `reference_analysis_id` mais l'analyse n'est plus listée par défaut.

### 6.5. Lecture inverse — parcours d'une analyse

```http
GET /api/reference-analyses/{analysis_id}/expert-programs
```

Retourne la liste des `expert_question_responses` qui ont `reference_analysis_id = {analysis_id}`. Utile pour la vue « Mes programmes » groupée par référentiel.

---

## 7. UX côté front (non-normatif, pour anticipation)

### 7.1. Refonte `ExpertProgramBuilderView`

```
URL : /experts/:expertId/program-builder/:slug?session_id=…
       └─ stepper 4 étapes : Référentiel → Analyse → Matières → Programmes
                              └─ phase 0   └─ extraction   └─ sélection  └─ N parcours
```

- **Phase 0 (Référentiel)** : 1 seul textarea/upload + bouton « Analyser ». Pas de saisie de niveau/volume/public.
- **Phase 1 (Analyse)** : preview de `extracted_data`, formulaire édition pour corriger.
- **Phase 2 (Matières)** : checkbox liste des `matieres[]`, bouton « Continuer avec N matières sélectionnées ».
- **Phase 3 (Programmes)** : N tabs ou stepper horizontal, 1 par matière. Pour chaque tab, le flow phase 2/3 actuel (analyse fine + questions + programme).

### 7.2. Vue « Mes programmes » groupée

Aujourd'hui `ExpertProgramSessionsView` liste à plat. Refonte :
- 1 ligne par `reference_analysis` (avec son label, niveau, date)
- Sub-lignes : 1 par matière liée, avec status (en cours / terminé / abandonné)
- Possibilité d'ajouter une matière oubliée a posteriori (rouvre le builder à la phase 2)

---

## 8. Sécurité

| Item | Décision |
|---|---|
| Isolation tenant | `tenant_id` sur `reference_analyses`, middleware enforce |
| Isolation user | `user_id` sur `reference_analyses`, un user ne voit que les siennes (sauf admin) |
| Quota volume document | Limiter le `reference_text` à ~200k caractères (≈50 pages PDF). Au-delà, refus 413. |
| Quota appels extraction | Rate-limit côté back si Option B/C — éviter le DoS LLM |
| RGPD purge user | Si user supprimé, ses `reference_analyses` partent en cascade. Les `expert_responses` liés gardent `reference_analysis_id=NULL` après ON DELETE SET NULL. |
| Audit log | Mutations PATCH/DELETE sur `reference_analyses` tracées dans `admin_audit_log` |

---

## 9. Estimations

### Côté back (Option A — V1 minimal)

| Item | Effort |
|---|---|
| Migration `reference_analyses` table + index | ~1h |
| Migration `expert_question_responses` + colonnes `reference_analysis_id` / `matiere_code` | ~30 min |
| Schemas Pydantic (`ReferenceAnalysis`, `ExtractedData` avec sous-types) | ~1.5j |
| Service `ReferenceAnalysisService` (CRUD + lien expert_responses) | ~1j |
| Endpoints CRUD §6 | ~0.5j |
| Tests unitaires + intégration | ~1j |
| Doc compagnon front (`frontend-reference-analyses.md`) | ~2h |

**Total back V1** : **~4-5 jours**

### Côté front

| Item | Effort |
|---|---|
| Refonte `ExpertProgramBuilderView` en 4 phases | ~2j |
| Composant `ReferenceAnalysisPreview` (validation user) | ~0.5j |
| Composant `MatiereSelector` (checkbox liste) | ~0.5j |
| Refonte `ExpertProgramSessionsView` groupée par analyse | ~1j |
| Tests Vitest (composables + composants) | ~1j |
| Mise à jour test plan utilisateurs (§1.10) | ~0.5j |

**Total front V1** : **~5-6 jours**

### Si Option C (extraction async)

+ ~2j back (Celery worker + WebSocket de notification de status)
+ ~1j front (gestion polling/WS)

---

## 10. Plan PR

### PR back

1. PR back A — Migration + table + service CRUD + endpoints
2. PR back B — Si Option C : worker async + notification WS

### PR front

1. PR front A — Refonte UI Program Builder en 4 phases (avec mock du back en attendant)
2. PR front B — Branchement sur le vrai back une fois PR back A déployée

---

## 11. Questions ouvertes

| # | Question | Décision proposée |
|---|---|---|
| Q1 | Option A / B / C pour l'extraction ? | **Option A pour V1** (réutilise runner LLM, livraison rapide). Migration C en V2 si robustesse insuffisante. |
| Q2 | L'analyse extraite est-elle **partagée** entre les programmes des différentes matières du même référentiel ? | **Oui**, via `reference_analyses` table pivot. Un référentiel uploadé une fois sert à N parcours. |
| Q3 | L'user peut-il ajouter une matière **a posteriori** (après avoir finalisé un premier parcours) ? | **Oui**. La sélection de matières n'est pas figée — `reference_analyses.extracted_data.matieres[]` reste accessible, l'user peut y revenir et lancer un nouveau parcours sur une matière non encore traitée. |
| Q4 | Multi-matière : génération en **parallèle** ou **séquentielle** ? | **Séquentielle pour V1** — l'user passe d'une matière à l'autre via tabs, génération à la demande. Évite les pics de coût LLM et la complexité UI. Parallèle envisageable en V2. |
| Q5 | Cas où **l'user n'a PAS de référentiel** (veut juste un programme « à blanc ») | **Hors scope V1** — flow alternatif possible mais pas prioritaire. Pour l'instant, suggérer de coller un texte court (« 30h de cours sur le marketing digital pour des étudiants de master ») qui sera l'analyse de base. |
| Q6 | Le front parse le JSON extrait par le LLM → si JSON malformé ? | Best effort + fallback : on persiste `extracted_data=null` + `analysis_status='failed'` + l'user voit un bouton « Ré-analyser » qui relance le runner. |
| Q7 | PDF / DOCX upload : décodage côté front ou back ? | **Back** si Option B/C ; **Front** si Option A (utilisation d'une lib JS comme pdf.js — limitée mais sans dépendance back). À trancher selon l'option. |
| Q8 | Limite de volume du référentiel (anti-DoS LLM) | ~200k caractères côté back (validation Pydantic), refus 413 au-delà. Ajustable selon coût LLM. |
| Q9 | Une analyse est-elle **réutilisable** par d'autres users du même tenant ? Ex: 5 enseignants de 2nde uploadent le même programme officiel — peut-on dédupliquer ? | **Non en V1** — chaque user a sa propre analyse (simplicité, pas de collision sur les corrections user). Dédup envisageable en V2 via hash du `reference_text`. |
| Q10 | Le runner LLM Option A doit-il créer une conv séparée par matière (pour le parcours), ou réutiliser la conv `[Reference Analysis]` puis splitter en `[Program Builder] {matière}` ? | À discuter — dépend de la lecture côté « Mes conversations ». Impact UX + coût |

---

## 12. Hors scope V1

- **Détection automatique** que 2 users uploadent le même référentiel — pas de dédup (cf. Q9)
- **Édition collaborative** d'une analyse de référentiel
- **Versioning** des analyses (si user corrige plusieurs fois)
- **Historique** des extractions échouées (logs uniquement)
- **Cross-tenant sharing** d'analyses
- **Templates de matières** pré-configurés (« 2nde générale = Histoire-Géo + Maths + Français + ... »)
- **Programme « à blanc »** sans référentiel (Q5)

---

## 13. Changelog

- **2026-05-05 (v1)** — proposition front initiale, suite au retour user staging sur le Program Builder existant. Identification des 3 limites majeures (saisie redondante, pas de matière, pas d'anticipation), proposition scénario extraction-first multi-matière, modèle de données `reference_analyses` + lien `expert_question_responses`, 3 options d'implémentation back avec recommandation Option A pour V1.
- **2026-05-06 (v1-back)** — annexe §B réponse back : Option A confirmée, 4 corrections SQL §4.1 (FK type, CHECK length, hash dedup-friendly), trust front sur `extracted_data` accepté avec validation Pydantic stricte, validation cohérence `matiere_code` ↔ JSONB ajoutée au service, **upload PDF/DOCX descope V1** (text + URL uniquement), 2 conversations LLM (analyse partagée + une par matière) pour économie tokens, quota `extraction_calls_per_day` ajouté, dette audit log signalée. Estimation revue à **~7.5-8j back V1** (vs 4-5j initial). Plus de blocage côté back, attente greenlight produit.

---

## Annexe A — Analyse équipe front (2026-05-05)

### A.1. Origine de cette RFC

Suite au retour user post-merge PR #2032 + #2033 (Program Builder access débloqué) lors d'un test sur dev (apidev). L'user a identifié que le scénario de saisie Phase 1 actuel ne correspond pas au cas d'usage canonique :

> « Concernant la saisie de la matière, ça ne peut se faire qu'une fois les éléments généraux du référentiel saisis. Comme Public et Contexte et autre éléments extraits. En plus il y aura forcément plusieurs matières. »

Le retour pose 3 questions concrètes :
- Comment faire extraire les informations ?
- À qui on envoie le document ?
- Est-ce prévu ?

L'analyse front qui suit y répond.

### A.2. Investigation : ce qui existe déjà côté front

Composables et composants livrés (PRs #2019 / #2023 / #2025 / #2031 / #2032 / #2033) :
- `useExpertProgramBuilder.ts` — orchestration 3 phases avec persistance RFC-080
- `useExpertChatRunner.ts` — runner LLM voie A (PR β2.bis) avec streaming MCP
- `ExpertProgramBuilderView.vue` — vue stepper 3 phases
- `ExpertProgramDiscordPicker.vue` — rattachement Discord (RFC-082)

→ **Le runner LLM (`useExpertChatRunner`) peut être réutilisé tel quel pour la phase 0 d'extraction**, en lui passant un prompt d'extraction structurée. Pas de nouveau composable nécessaire.

### A.3. Mock / preuve de concept côté front (proposition)

Pour valider l'Option A (LLM retourne du JSON) avant de tout refondre, on pourrait :

1. Créer un nouveau bouton « Pré-analyser le référentiel » dans Phase 1 actuelle
2. Au clic, lancer un appel runner avec le prompt :
   ```
   Tu es un assistant d'analyse pédagogique. Voici un référentiel.
   Retourne UNIQUEMENT du JSON valide entre balises <json>...</json>.
   Schéma : { reference_type, level, audience, volume, matieres: [{code, label}] }
   ```
3. Parser le bloc `<json>...</json>` côté front
4. Afficher le résultat en preview (sans encore le persister via un nouvel endpoint back)

Cette POC pourrait être livrée **sans toucher au back**, en quelques heures, pour valider la qualité d'extraction sur 5-10 référentiels variés (programme EN 2nde / RNCP / cahier des charges entreprise / programme primaire).

→ Si la POC réussit (JSON parseable dans 90%+ des cas), on lance la RFC complète. Sinon on bascule sur Option B/C.

### A.4. Demande d'arbitrage côté équipe back + produit

1. **Validation conceptuelle** du scénario révisé (extraction-first + multi-matière) — est-ce aligné avec la vision produit ?
2. **Choix Option A / B / C** pour l'extraction, en tenant compte de :
   - Effort back disponible
   - Robustesse exigée (POC vs production)
   - Volume attendu (combien de référentiels analysés / jour ?)
3. **Validation du modèle de données** §4 — table `reference_analyses` séparée + colonnes ajoutées sur `expert_question_responses`
4. **Réponse aux 10 questions ouvertes** §11

### A.5. Action attendue

- **Équipe produit** : valider le scénario UX révisé §3 et arbitrer Q5 (cas sans référentiel)
- **Équipe back** : trancher Q1 (Option), Q2-Q9 (modèle data + flow), Q10 (orga des conversations)
- **Équipe front** : prête à livrer une POC Option A en parallèle si validé, puis refonte complète une fois la RFC figée
- **Équipe DevOps** : vérifier l'impact coût LLM si extraction systématique sur tous les uploads (rate-limiting back nécessaire)

---

## Annexe B — Réponse équipe back (2026-05-06)

> Note back : RFC lue. Diagnostic L1-L4 valide, modèle pivot `reference_analyses` aligné avec le pattern public déjà adopté pour `expert_question_responses`. Quelques corrections + 12 décisions à acter avant d'attaquer.

### B.1. Validation conceptuelle (cf. §A.4 demande 1)

**OK sur le scénario révisé** §3 (extraction-first multi-matière) et le modèle `reference_analyses` comme pivot. Cohérent avec :

- **RFC-080** — `expert_question_responses` reste la source de vérité pour les parcours, on ajoute juste un FK pivot.
- **RFC-081** — pas de conflit, l'analyse est un input runtime utilisable par les personas.
- **RFC-082** — voir B.7 ci-dessous (point ouvert).

### B.2. Choix d'option d'extraction (Q1)

**Option A pour V1** validé. Réutilise `useExpertChatRunner` côté front. Le back **ne fait pas l'extraction lui-même** en V1 — il persiste seulement ce que le front lui envoie.

→ Implication sécurité : voir B.4.

### B.3. Corrections SQL §4.1

| # | Problème | Correction |
|---|---|---|
| **B.3.a** | `tenant_id VARCHAR(64)` référence `public.tenants.id` qui est **VARCHAR(50)** | Aligner sur `VARCHAR(50)` |
| **B.3.b** | `reference_text TEXT NULL` sans limite | Ajouter `CHECK (reference_text IS NULL OR char_length(reference_text) <= 200000)` (cf. Q8). Aussi enforcer Pydantic `Field(..., max_length=200_000)`. |
| **B.3.c** | Pas de hash du référentiel | Ajouter colonne `reference_hash VARCHAR(64) NULL` (SHA256 du `reference_text` normalisé), index B-tree. **Ne sert à rien en V1** mais évite une migration data lourde quand on activera la dedup en V2. |
| **B.3.d** | Pas de FK explicite sur `quick_action_id` | Acceptable — `quick_action_id` est un slug libre dans `expert_templates.quick_actions[].id` JSONB, pas une table relationnelle. Status quo OK. |

### B.4. Trust front sur `extracted_data` (sécurité)

§A.3 + §5 Option A : le front parse le JSON LLM côté browser et POST `extracted_data` au back. Le back **ne peut pas** vérifier la fidélité de l'extraction.

→ **Acceptable car** chaque user n'accède qu'à ses propres analyses (cf. §8 isolation user + Q9 pas de dedup) — pas de risque d'attaquer d'autres users via une analyse forgée.

→ **Mais** : Pydantic doit valider strictement la shape (`extra="forbid"`, types, longueurs, énum). Aucun champ libre sans validation. À expliciter dans la PR back.

### B.5. Cohérence `matiere_code` ↔ `extracted_data.matieres[].code`

Aucun FK SQL possible (JSONB). À enforcer côté service :

- **PATCH `/api/reference-analyses/{id}`** : avant d'écrire `extracted_data`, vérifier que les `matiere_code` actuellement utilisés par des `expert_question_responses` liés sont toujours présents dans la nouvelle liste. Sinon → 409 Conflict avec liste des codes utilisés.
- **POST `/api/expert-responses`** : si `reference_analysis_id` fourni, valider que `matiere_code` existe dans `extracted_data.matieres[].code` de l'analyse. Sinon → 400.

→ À ajouter dans le service `ReferenceAnalysisService` et le service `ExpertResponseService` existant.

### B.6. Upload PDF/DOCX (Q7) — **scope V1 à clarifier**

§4.1 prévoit `reference_file_meta JSONB` mais §6.1 ne précise pas le mécanisme d'upload. Côté chat.api il n'y a **pas de pipeline upload générique** réutilisable simplement.

→ **Recommandation back** : **scope V1 = `text` + `url` uniquement**. PDF/DOCX = V2. Le front peut faire un `pdf.js` côté browser pour extraire le texte avant POST si besoin (Option A le permet — voir §A.3). Évite ~1.5j de dev back (endpoint upload + storage Qdrant ou MinIO + parsing serveur).

→ Si l'upload back est exigé en V1, +1.5j d'effort + décision sur le storage backend.

### B.7. Rattachement Discord (RFC-082) au niveau analyse

Question implicite non posée : un user peut-il binder **toute son analyse** (avec ses N matières) à un guild/promotion/sujet en une fois, plutôt que de binder chaque parcours individuellement ?

**Recommandation back** : **non en V1**. Le binding RFC-082 reste **par parcours** (`expert_question_responses.discord_binding`). La vue groupée §7.2 affiche les bindings agrégés mais ne les édite pas en bulk.

→ Évite un nouveau modèle data. V2 envisageable si demande remontée.

### B.8. Conversations LLM (Q10) — **2 conversations**

Recommandation back : **2 conversations distinctes**.

| Conversation | Contenu | Réutilisée |
|---|---|---|
| `[Reference Analysis] {label}` | Phase 0 — extraction du référentiel | **Oui** — partagée entre les N parcours |
| `[Program Builder] {expert} — {matière}` | Phases 2-3 — analyse fine + programme | Une par matière (clonée via reset si besoin) |

**Pourquoi** : la conversation d'analyse contient le référentiel complet (potentiellement volumineux). Si on la duplique pour chaque matière, on retokenize × N. La séparation permet :

- 1 seul appel d'extraction LLM pour le référentiel (~10k tokens)
- N appels de génération de programme, **avec injection ciblée** des `matieres[code=X]` pertinents seulement (pas tout le référentiel à chaque fois)

→ Économie LLM substantielle quand le user fait 5+ matières sur un même référentiel.

→ Implication front : `useExpertChatRunner` doit pouvoir gérer plusieurs `conversation_id` distinctes pour le même `reference_analysis_id`. Pas un grand changement, juste un mapping côté composable.

### B.9. Audit log

§8 mentionne `admin_audit_log`. **Dette pré-existante connue** (cf. revues RFC-079/081/082) : la table a un CHECK constraint qui whitelist seulement les actions superadmin. Les actions `reference_analysis.*` ne seraient pas écrites en DB → silent fail.

→ Soit on étend le CHECK (PR cosmétique), soit on log dans `service_token_usage_logs` ou un logger structuré (pattern adopté RFC-082). À harmoniser au moment de la PR d'implémentation.

### B.10. Quotas LLM

§8 dit « rate-limit côté back si Option B/C ». Mais l'**Option A coûte aussi** en LLM (juste payé par le runner WebSocket). Doit être tracé dans `quota_usage` (table tenant) avec une clé `extraction_calls_per_day`.

→ Composant à ajouter au scope V1.

### B.11. Réponse aux 10 questions §11

| # | Réponse front (proposée) | Décision back |
|---|---|---|
| Q1 Option A/B/C | A pour V1 | ✅ **A confirmée** — réutilise runner existant |
| Q2 Analyse partagée | Oui via pivot | ✅ **Confirmée** — pivot `reference_analyses` |
| Q3 Ajout matière a posteriori | Oui | ✅ **Confirmé** — reprend `extracted_data.matieres[]` |
| Q4 Génération parallèle/séquentielle | Séquentielle V1 | ✅ **Séquentielle V1** — UI tabs, génération à la demande |
| Q5 Cas sans référentiel | Hors scope V1 | ✅ **Hors scope V1** — relève RFC future |
| Q6 JSON malformé | Best effort + bouton ré-analyser | ✅ **Confirmé** — `analysis_status='failed'` + UI retry |
| Q7 PDF côté front/back | Selon option | **V1 = text + URL uniquement** (cf. B.6). PDF côté front via pdf.js si urgent. PDF côté back = V2. |
| Q8 Limite volume | 200k chars | ✅ **200k chars** — CHECK SQL + Pydantic max_length |
| Q9 Dedup tenant | Non en V1 | ✅ **Non en V1** mais on persiste un `reference_hash` pour préparer V2 (cf. B.3.c) |
| Q10 Stratégie conversations | À discuter | ✅ **2 conversations** — analyse partagée + 1 par matière (cf. B.8) |

### B.12. Composants chat.api à livrer (V1 minimal)

| Composant | Effort |
|---|---|
| Migration `public.reference_analyses` (avec corrections B.3) | ~1h |
| Migration `expert_question_responses` + 2 colonnes (`reference_analysis_id`, `matiere_code`) | ~30 min |
| Pydantic schemas (`ReferenceAnalysisCreate`, `Update`, `Read`, `ExtractedData`, `ExtractedLevel`, `ExtractedMatiere`, `ExtractedVolume`, etc.) avec `extra="forbid"` partout | ~2j (riches sous-types) |
| Service `ReferenceAnalysisService` (CRUD + validation cohérence `matiere_code`) | ~1.5j |
| Endpoints §6.1 → §6.5 (5 endpoints) | ~1j |
| Extension `ExpertResponseService` pour valider `reference_analysis_id` + `matiere_code` au POST | ~0.5j |
| Compteur quota `extraction_calls_per_day` dans `quota_usage` | ~0.5j |
| Tests unitaires + intégration (cohérence, RGPD, isolation tenant/user) | ~1.5j |
| Doc compagnon front (`docs/guides/frontend-reference-analyses.md`) | ~2h |
| Update doc plan tests utilisateurs | ~30 min |

**Total back V1** : **~7.5-8 jours** (vs 4-5j proposé en §9 — l'estimation front sous-évaluait les schemas riches et la validation cross-table).

### B.13. Hors scope V1 (rappel)

- Upload PDF/DOCX côté back (V2 — cf. B.6)
- Dedup d'analyses entre users du même tenant (V2 — `reference_hash` est posé en V1 mais inactif)
- Binding RFC-082 au niveau analyse (V2 — cf. B.7)
- Extraction async (Option C) (V2 — si robustesse insuffisante avec Option A)
- Cas « sans référentiel » (Q5) (V2)
- Programme parallèle multi-matière (Q4) (V2)

### B.14. Action restante avant attaque PR

1. **Produit** : valider scénario UX révisé §3 + arbitrer Q5 (acté hors scope V1)
2. **Back + Front** : entériner les 12 décisions §B.11 + scope V1 §B.12-B.13
3. **DevOps** : valider l'impact coût avec compteur quota dédié (B.10)
4. **Front** : POC §A.3 conseillée pour valider qualité d'extraction sur 5-10 référentiels variés avant de figer le scope V1
5. Si OK → 1 PR back unique (~7.5-8j) + 1 PR front en parallèle (~5-6j)

→ Plus de blocage côté back. On attend juste le greenlight produit.
