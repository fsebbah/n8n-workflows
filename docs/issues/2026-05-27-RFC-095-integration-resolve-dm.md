# RFC-095 — Intégration `resolve-dm` dans chatbot-core

| Champ | Valeur |
|-------|--------|
| Date | 2026-05-27 |
| Maj | 2026-05-28 |
| Statut | ✅ **Décision prise — Prêt à implémenter** |
| Auteur | chatbot-core |
| Contexte | Câblage du flux DM personnalisé (RFC-095 B3) |

---

## 1. Contrat API `resolve-dm`

### Question chatbot-core

> D'après RFC-095, l'endpoint est :
> ```
> GET /api/n8n/personae/resolve-dm?user_id=D&question=Q
> Header: X-Tenant-ID: T
> ```
> Peux-tu fournir le format exact de `ResolveDmResponse` (les 3 statuts + payload) avec un exemple pour chaque statut ?

### ✅ Réponse back (complète)

**Endpoint** : `GET /api/n8n/personae/resolve-dm?user_id=<discord_user_id>&question=<Q>`
- Header : `X-Tenant-ID`
- Auth : `X-Service-Token`
- Renvoie : `200` avec `ResolveDmResponse`, discriminé par `status`

**Schéma** (livré, `dm_resolver_schemas.py`) :

```python
status: "resolved" | "out_of_scope" | "needs_clarification"
routed_specialty_id: UUID | null
routing_confidence: float | null
routing_method: "single_subject" | "llm_cheap" | null
clarification_candidates: [{specialty_id, name}] | null
decline_reason: "subject_not_enrolled" | "no_enrollment" | null
audience: {id, name, description, style_id} | null
personae: EffectivePersonaeResponse | null
```

#### Exemple `resolved` (→ dispatch LLM)

```json
{
  "status": "resolved",
  "routed_specialty_id": "aa11…",
  "routing_confidence": 0.92,
  "routing_method": "llm_cheap",
  "clarification_candidates": null,
  "decline_reason": null,
  "audience": {
    "id": "8f3a…",
    "name": "Niveau avancé bac",
    "description": "…",
    "style_id": "1b2c…"
  },
  "personae": {
    "expert_id": "ee99…",
    "specialty_id": "aa11…",
    "style_id": "1b2c…",
    "system_prompt": "…base_prompt…\n\n…context_prompt…\n\n…audience.description…\n\n…style_modifier…",
    "llm_params": {"temperature": 0.3},
    "rag_source_ids": ["rag-1"],
    "notebook_ids": ["nb-…"],
    "skill_ids": [],
    "models": {"main": "claude-opus-4-7"},
    "binding_id": null
  }
}
```

**Action** : chatbot-core dispatch le LLM avec `personae.system_prompt` + `llm_params` + `rag_source_ids` + `models`.

#### Exemple `out_of_scope` (→ décline, pas d'appel LLM)

```json
{
  "status": "out_of_scope",
  "decline_reason": "no_enrollment",
  "routed_specialty_id": null,
  "routing_confidence": null,
  "routing_method": null,
  "clarification_candidates": null,
  "audience": null,
  "personae": null
}
```

**`decline_reason`** :
- `no_enrollment` : aucune inscription
- `subject_not_enrolled` : question hors matières inscrites

> Note : une matière routée sans expert renvoie aussi `out_of_scope/subject_not_enrolled` — choix B3, pas un 404.

#### Exemple `needs_clarification` (→ demander de préciser, re-appeler)

```json
{
  "status": "needs_clarification",
  "clarification_candidates": [
    {"specialty_id": "aa11…", "name": "Maths 3ème"},
    {"specialty_id": "bb22…", "name": "Histoire 3ème"}
  ],
  "routed_specialty_id": null,
  "routing_confidence": 0.41,
  "routing_method": "llm_cheap",
  "decline_reason": null,
  "audience": null,
  "personae": null
}
```

**Sources de vérité** (côté back) :
- `docs/guides/RFC-095-API-CONTRACTS.md` §3.1
- `docs/guides/RFC-095-RUNTIME-DM-GUIDE.md` (guide d'intégration)

---

## 2. Qui appelle `resolve-dm` ?

### Question chatbot-core

> Le briefing dit « n8n / chatbot-core » mais je veux confirmer :
>
> | Option | Description |
> |--------|-------------|
> | A | **n8n** appelle `resolve-dm` via workflow, chatbot-core ne fait rien |
> | B | **chatbot-core** appelle `resolve-dm` directement dans le code Python |
> | C | **plugin** appelle `resolve-dm`, transmet le résultat à n8n |
>
> Quelle est l'architecture cible ?

### 🟡 Réponse back (partielle)

**Côté contrat (back)** : `resolve-dm` est service-to-service (`X-Service-Token`) — n'importe quel appelant autorisé fonctionne, le back n'impose pas qui.

**Cible documentée** (RFC-095-DM-IDENTITY-RESOLUTION §7 + guide) = **Option A** :
1. n8n orchestre le flux DM en 2 appels :
   - `GET /api/n8n/tenants/resolve?guild_id&user_id` → `{tenant_id}`
   - `resolve-dm` avec `X-Tenant-ID`
2. Puis dispatch
3. chatbot-core = le runtime LLM que n8n pilote, il n'appelle pas `resolve-dm` lui-même

**Ce que le back ne tranche pas** : le split exact n8n ↔ chatbot-core (qui fait l'appel HTTP) est une décision d'orchestration runtime, pas celle du back. Le contrat est le même dans les 3 options.

→ **À confirmer entre n8n + chatbot-core + plugin** (B est techniquement possible, mais la cible doc = A).

### ⏳ Décision chatbot-core / n8n / plugin

| Option | Pour | Contre |
|--------|------|--------|
| A (n8n) | Cible documentée, séparation claire | n8n doit gérer les 3 statuts |
| B (chatbot-core) | Logique Python, tests unitaires | Dévie de la cible doc |
| C (plugin) | Plugin a déjà le contexte Discord | Charge plugin |

**Votes** :
- plugin : ✅ **Option A** (n8n orchestre) — suit le pattern existant, plugin reste "bête"
- n8n : ✅ **Option A** (n8n orchestre) — cohérent avec architecture existante (MENTION, Subject_Switch, etc.)
- chatbot-core : ✅ **Option A** (n8n orchestre) — cohérent avec cible doc, n8n gère déjà le tenant resolve

**Décision** : ✅ **Option A unanime** (3/3 votes) — n8n orchestre le flux DM

---

## 3. Flux DM actuel

### Question chatbot-core

> Y a-t-il un workflow n8n existant pour les DM que je dois modifier, ou c'est un nouveau flux à créer ?

### 🟡 Réponse back (partielle)

**Côté back** : `resolve-dm` est un endpoint **NOUVEAU** (livré par B3, mergé) — il n'existait aucun flux DM-personae back avant. C'est donc un **nouveau flux à créer**.

**Côté n8n** : l'inventaire des workflows n8n n'est pas dans le repo back — le back ne peut pas confirmer s'il existe un workflow DM réutilisable.

Le seul workflow « voisin » signalé (réponse n8n RFC-097) est `DISCORD_-_Subject_Switch.json` (RFC-048), qui est du changement de matière, **pas** la résolution personae DM.

→ **À confirmer par l'équipe n8n** : étendre un workflow existant ou en créer un.

### ✅ Inventaire n8n (2026-05-28)

| Workflow existant | Usage actuel | Réutilisable pour DM ? |
|-------------------|--------------|------------------------|
| `MENTION---On-Mention-Handler` | Mentions canaux (RFC-007) | ⚠️ **Structure réutilisable** — pattern webhook → validate → dispatch → respond |
| `DISCORD_-_Subject_Switch` | Changement matière (RFC-048) | ❌ Non — contexte différent |
| `DISCORD_-_Student_Context` | Enrichissement prompt (M4) | ✅ **Composable** — appelable post-resolve pour enrichir contexte |
| **Workflow DM dédié** | — | ❌ **N'existe pas** — à créer |

**Conclusion** : Créer un **nouveau workflow** `DISCORD_-_DM_Resolve` (ou similaire) qui :
1. Reçoit `(guild_id, user_id, question)` du plugin
2. Appelle `GET /api/n8n/tenants/resolve` → `tenant_id`
3. Appelle `GET /api/n8n/personae/resolve-dm` avec `X-Tenant-ID`
4. Dispatch selon les 3 statuts vers chatbot-core ou retourne decline/clarification au plugin

---

## 4. Prochaines étapes

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Décider l'option d'orchestration (A/B/C) | n8n + chatbot-core + plugin | ✅ **Option A unanime** (3/3) |
| 2 | Inventorier les workflows DM existants | n8n | ✅ Aucun existant — créer nouveau |
| 3 | Créer workflow `DISCORD_-_DM_Resolve` | n8n | ⏳ Prêt à démarrer (~1.5j) |
| 4 | Mapper `personae` → LLM params (model, rag_source_ids) | chatbot-core | ⏳ Prêt à démarrer (~2j) |
| 5 | Gérer `out_of_scope` (message de décline) | plugin | ✅ Plugin formate |
| 6 | Gérer `needs_clarification` (boutons Discord) | plugin | ✅ Plugin gère (~1.5j) |

---

## 5. Questions ouvertes → équipes

### Pour n8n — ✅ Réponses (2026-05-28)

| # | Question | Réponse n8n |
|---|----------|-------------|
| 1 | **Inventaire DM** : workflow existant ? | **NON** — aucun workflow DM dédié. `MENTION` gère les canaux (RFC-007), pas les DM. Structure réutilisable mais logique différente. Voir inventaire §3. |
| 2 | **Option A** : n8n OK pour orchestrer ? | **OUI** — cohérent avec l'architecture existante. n8n orchestre déjà tous les flux Discord. Le pattern "2 appels API + dispatch 3 statuts" est standard. |

**Proposition n8n** : Créer un nouveau workflow `DISCORD_-_DM_Resolve` (ou `PERSONAE_-_DM_Handler`) qui :
1. Webhook `POST /webhook/discord/dm-resolve`
2. Appelle `GET /api/n8n/tenants/resolve?guild_id&user_id` → `tenant_id`
3. Appelle `GET /api/n8n/personae/resolve-dm` avec `X-Tenant-ID`
4. Switch sur `status` :
   - `resolved` → dispatch vers chatbot-core avec `personae`
   - `out_of_scope` → retourne `decline_reason` au plugin
   - `needs_clarification` → retourne `clarification_candidates` au plugin

**Charge estimée n8n** : **~1.5j**
- Nouveau workflow avec 2 appels API + routing 3 branches
- Tests des 3 statuts
- Documentation

### Pour plugin — ✅ Réponses (2026-05-27)

| # | Question | Réponse plugin |
|---|----------|----------------|
| 1 | **Option C** : plugin appelle `resolve-dm` ? | **NON préféré** — plugin préfère **Option A** (n8n orchestre). Le plugin envoie `(guild_id, user_id, question)` à n8n, reçoit une réponse. Pattern existant, pas de complexité ajoutée côté plugin. |
| 2 | **`needs_clarification`** : boutons Discord ? | **OUI** — plugin peut afficher des boutons via `discord.ui.View`. Format `[{specialty_id, name}]` suffit. Optionnel : ajouter `emoji` pour UX (ex: 📐 Maths, 📜 Histoire). |
| 3 | **`out_of_scope`** : qui formate le message ? | **Plugin formate** — n8n renvoie `decline_reason` brut, plugin affiche un message localisé en français avec contexte Discord (embed, lien vérification RFC-067 si `no_enrollment`). |

**Charge estimée plugin** (confirmée) :
- Rendu 3 statuts + boutons clarification : **~1.5j**
- Inclus dans estimation RFC-097 §9.4

### Pour chatbot-core — ✅ Réponses (2026-05-28)

| # | Question | Réponse chatbot-core |
|---|----------|----------------------|
| 1 | **Dispatch LLM** : comment chatbot-core reçoit les paramètres ? | Via **n8n** → `TenantResolver` → `TenantConfig`. Actuellement : `TenantConfig.models` (PackageModels) pour le modèle, `RagConfig` pour les params RAG. Le `system_prompt` vient du plugin/workflow, pas de chatbot-core. |
| 2 | **`personae.models.main`** supporté ? | **NON directement**. Actuellement : `TenantConfig.models.chat` (string). Le format `personae.models = {"main": "claude-opus-4-7"}` nécessite un mapping. |

#### Analyse de l'écart

| Paramètre resolve-dm | Équivalent chatbot-core actuel | Action requise |
|---------------------|-------------------------------|----------------|
| `personae.system_prompt` | `RagConfig.system_prompt_override` | ⚠️ À câbler — n8n doit passer le prompt |
| `personae.llm_params.temperature` | Non supporté | ⚠️ À ajouter si nécessaire |
| `personae.rag_source_ids` | `RagConfig` (filtrage via `merge_active_filter`) | ✅ Partiellement — filtrage `active=true` existe, mais pas par `source_ids` explicites |
| `personae.models.main` | `TenantConfig.models.chat` | ⚠️ À mapper — override le modèle du package |
| `personae.notebook_ids` | Non supporté | ❓ Usage à clarifier |
| `personae.skill_ids` | Non supporté | ❓ Usage à clarifier |

#### Charge estimée chatbot-core

| Scope | Effort |
|-------|--------|
| Mapping `personae.models.main` → model override | ~0.5j |
| Câblage `rag_source_ids` explicites | ~1j |
| Support `llm_params.temperature` | ~0.5j |
| **Total** | **~2j** |

---

## 6. Synthèse des votes et charges

### Votes Option orchestration

| Équipe | Vote | Commentaire |
|--------|------|-------------|
| plugin | ✅ A | Plugin reste "bête", envoie à n8n |
| chatbot-core | ✅ A | Cohérent cible doc, n8n gère tenant |
| n8n | ✅ A | Cohérent architecture existante |

**Décision finale** : ✅ **Option A unanime** (3/3) — n8n orchestre le flux DM

### Charges estimées (Option A)

| Équipe | Charge | Scope |
|--------|--------|-------|
| n8n | **~1.5j** | Nouveau workflow `DISCORD_-_DM_Resolve` : 2 appels API + dispatch 3 statuts |
| chatbot-core | ~2j | *(estimé par chatbot-core §5)* |
| plugin | ~1.5j | *(estimé par plugin §5)* |

---

## 7. Décision finale (2026-05-28)

### Architecture validée

```
┌─────────────────┐
│  Plugin Discord │
│                 │
│  on_dm_message()│
└────────┬────────┘
         │ POST /webhook/discord/dm-resolve
         │ {guild_id, user_id, question}
         ▼
┌─────────────────────────────────────────────────────────┐
│  n8n workflow "DISCORD_-_DM_Resolve"                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 1. GET /api/n8n/tenants/resolve                 │   │
│  │    ?guild_id={G}&user_id={U}                    │   │
│  │    → tenant_id                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 2. GET /api/n8n/personae/resolve-dm             │   │
│  │    ?user_id={U}&question={Q}                    │   │
│  │    Header: X-Tenant-ID: {T}                     │   │
│  │    → ResolveDmResponse                          │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 3. Switch sur status                            │   │
│  │                                                 │   │
│  │    resolved ──────────► dispatch chatbot-core   │   │
│  │                         avec personae           │   │
│  │                                                 │   │
│  │    out_of_scope ──────► retourne decline_reason │   │
│  │                         au plugin               │   │
│  │                                                 │   │
│  │    needs_clarification ► retourne candidates    │   │
│  │                         au plugin               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ chatbot-core│      │   Plugin    │      │   Plugin    │
│             │      │             │      │             │
│ LLM dispatch│      │ Embed décline│     │ Boutons     │
│ + RAG       │      │ + lien verif │     │ clarification│
└─────────────┘      └─────────────┘      └─────────────┘
```

### Charge totale : ~5j

| Équipe | Charge | Parallélisable |
|--------|--------|----------------|
| n8n | ~1.5j | ✅ Indépendant |
| chatbot-core | ~2j | ✅ Indépendant |
| plugin | ~1.5j | ⚠️ Dépend de n8n (webhook) |

---

## 8. Plan d'action parallèle

### Phase 1 — Implémentation parallèle (n8n // chatbot-core)

```
                    ┌─────────────────────────────────────┐
                    │          PHASE 1 (en //)            │
                    └─────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
    ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
    │    T1: n8n    │       │ T2: chatbot   │       │  T3: plugin   │
    │    (~1.5j)    │       │    (~2j)      │       │   (prépa)     │
    ├───────────────┤       ├───────────────┤       ├───────────────┤
    │ Workflow      │       │ Modèle        │       │ Stub réponses │
    │ DM_Resolve    │       │ PersonaeConfig│       │ 3 statuts     │
    │               │       │               │       │               │
    │ • Webhook     │       │ • Dataclass   │       │ • Mock JSON   │
    │ • 2 appels API│       │ • Mapping     │       │ • UI boutons  │
    │ • Switch 3 st │       │ • rag_source  │       │ • Embed décline│
    └───────┬───────┘       └───────┬───────┘       └───────┬───────┘
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────┐
                    │       PHASE 2 — Intégration         │
                    │            (~0.5j)                  │
                    ├─────────────────────────────────────┤
                    │ • Branchement plugin → n8n          │
                    │ • Test E2E des 3 statuts            │
                    │ • Validation prod                   │
                    └─────────────────────────────────────┘
```

### Tasks détaillées

#### T1 — n8n : Workflow `DISCORD_-_DM_Resolve` (~1.5j)

| # | Sous-task | Livrable |
|---|-----------|----------|
| T1.1 | Créer webhook `POST /webhook/discord/dm-resolve` | Endpoint actif |
| T1.2 | Appel `GET /api/n8n/tenants/resolve` | Node HTTP + extraction `tenant_id` |
| T1.3 | Appel `GET /api/n8n/personae/resolve-dm` | Node HTTP avec `X-Tenant-ID` |
| T1.4 | Switch sur `status` (3 branches) | Routing conditionnel |
| T1.5 | Branche `resolved` → dispatch chatbot-core | Appel existant + `personae` |
| T1.6 | Branches `out_of_scope` / `needs_clarification` → retour plugin | Response JSON |
| T1.7 | Tests manuels des 3 statuts | Workflow validé |

#### T2 — chatbot-core : Modèle `PersonaeConfig` (~2j)

| # | Sous-task | Livrable |
|---|-----------|----------|
| T2.1 | Créer `chatbot_core/models/personae_config.py` | Dataclass `PersonaeConfig` |
| T2.2 | Parser `EffectivePersonaeResponse` | `PersonaeConfig.from_dict()` |
| T2.3 | Mapping `models.main` → model override | Priorité sur `TenantConfig.models.chat` |
| T2.4 | Support `llm_params.temperature` | Champ optionnel |
| T2.5 | Filtrage RAG par `rag_source_ids` explicites | Extension `merge_active_filter()` |
| T2.6 | Exposer dans `__init__.py` | Export public |
| T2.7 | Tests unitaires | Coverage PersonaeConfig |

#### T3 — plugin : Préparation UI (~0.5j prépa, ~1j intégration)

| # | Sous-task | Livrable |
|---|-----------|----------|
| T3.1 | Stub réponses mock des 3 statuts | JSON de test |
| T3.2 | UI boutons clarification (`discord.ui.View`) | Composant réutilisable |
| T3.3 | Embed message décline | Template avec lien RFC-067 |
| T3.4 | Handler `on_dm_message()` → appel webhook n8n | Intégration (post T1) |
| T3.5 | Dispatch selon réponse n8n | Routing 3 branches |
| T3.6 | Tests E2E | Validation prod |

### Dépendances

```
T1 (n8n) ──────────────────────────────────┐
                                           │
T2 (chatbot-core) ─────────────────────────┼──► Intégration E2E
                                           │
T3.1-T3.3 (plugin prépa) ──────────────────┤
                                           │
T3.4-T3.6 (plugin intég) ◄─── dépend de T1 ┘
```

**T1 et T2 sont totalement indépendants** — peuvent démarrer immédiatement en //.
**T3.1-T3.3** (prépa UI) peut aussi démarrer en //.
**T3.4-T3.6** (intégration) attend que T1 soit livré.

### Jalons

| Jalon | Condition | ETA |
|-------|-----------|-----|
| J1 | T1 + T2 terminés | +2j |
| J2 | Intégration E2E validée | +2.5j |
| J3 | Déploiement prod | +3j |

---

*Document créé pour tracer les questions et réponses d'intégration RFC-095.*
