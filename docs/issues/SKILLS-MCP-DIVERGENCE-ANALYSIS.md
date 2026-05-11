# Skills Engine — Analyse des divergences chat.api vs Azy-MCP

> **Document d'analyse** pour aligner l'implémentation V1 chat.api Skills
> Engine (PR-A + PR-B + PR-A2 mergées) avec le `backend-integration-guide.md`
> v2 fourni par l'équipe Azy-MCP.

| Métadonnée | Valeur |
|---|---|
| **Version** | 1.0.0 |
| **Date** | 2026-05-12 |
| **Auteur** | équipe Backend chat.api |
| **Doc source** | `docs/guides/backend-integration-guide.md` (578 lignes, v2 du 2026-05-11) |
| **RFCs liées** | RFC-085 (Skills), RFC-086 (Streaming) |
| **Statut** | 🟡 Analyse — 5 divergences identifiées, 4 actées par produit, 1 à trancher |

---

## 1. Contexte

L'équipe Azy-MCP a livré `docs/guides/backend-integration-guide.md` (v2) qui
décrit comment chat.api doit consommer ses endpoints REST + WebSocket. Cette
doc a été publiée **après** la livraison du V1 chat.api Skills Engine
(PRs #2357, #2358, #2359, #2360 toutes mergées sur develop). 5 points de
divergence ont été identifiés entre l'implémentation chat.api existante et
ce que la doc MCP propose.

Cet inventaire sert de **base de discussion inter-équipes** pour décider de
la suite (V1.2 alignement, ou alternative).

---

## 2. Décisions actées (résumé)

| # | Sujet | Décision produit | Statut |
|---|---|---|---|
| 1 | Streaming transport chat.api ↔ MCP | **WebSocket** (vs HTTP callback actuel) | ✅ Acté |
| 2 | Catalogue skills | **2 catalogues complémentaires** : registry tenant chat.api (PR-B) + filesystem MCP | ✅ Acté |
| 3 | Pause/reprise hybride | **2 patterns coexistent** selon le type de skill | ✅ Acté |
| 4 | Dispatch des steps cloud n8n | **Toujours via Azy-MCP** (jamais chat.api → n8n direct) | ⚠️ À résoudre côté MCP |
| 5 | Headers d'identification | Ajouter les `X-*` headers requis par MCP | ✅ Acté (mineur) |

---

## 3. Divergence #1 — Streaming transport

### 3.1 Constat

| Aspect | Doc MCP §2.4 | Code chat.api actuel (PR-A2) |
|---|---|---|
| Transport chat.api ↔ MCP | **WebSocket bidirectionnel** | HTTP callback `POST /api/internal/llm/stream-callback` |
| Réception paquets n8n | MCP reçoit (`/api/llm/callback` côté MCP) puis push WS | chat.api reçoit directement |
| Format messages | `llm_chunk` / `llm_complete` / `llm_error` WS frames | `StreamCallbackPacket` JSON body |

### 3.2 Décision actée

> *"Il me semble que dès le départ on parle de streaming"* — produit, 2026-05-12

Le **WebSocket** est l'architecture cible. La RFC-086 le mentionne dès §3.1
mais l'implémentation chat.api V1 a opté pour un HTTP callback (pattern
mcp_callback_routes.py existant) par simplification — c'était une erreur
de lecture de la spec.

### 3.3 Action chat.api

- ❌ **Supprimer** `app/api_routes/internal/llm_stream_callback_routes.py`
- ✅ **Créer** un client WebSocket vers Azy-MCP qui :
  - Se connecte à `wss://mcp.azy.solutions/api/internal/skills-ws` (URL à confirmer)
  - Écoute les frames `llm_chunk`, `llm_complete`, `llm_error`
  - Forward vers `SkillsStreamService.handle_packet` (le service reste utilisable, adapter la signature)
- ✅ **Conserver** le SSE endpoint vers le front (contrat browser inchangé)
- ✅ **Conserver** `SkillsStreamService` à 80% (init flow + audit + reconcile inchangés ; seul le `handle_packet` change de source)

**Effort estimé** : ~2-3j refonte transport.

---

## 4. Divergence #2 — Catalogue skills

### 4.1 Constat

| Aspect | Doc MCP §1.1 | Code chat.api actuel (PR-B) |
|---|---|---|
| Source | `GET /api/skills?path=/app/skills` filesystem MCP | Tables `public.skills` + tenant `user_skills` |
| Sémantique | Skills physiquement déployés sur azy.mcp | Registre multi-tenant avec permissions/ownership |

### 4.2 Décision actée

> *"On garde ce que tu as fait"* — produit, 2026-05-12

Les 2 catalogues sont **complémentaires** :
- **Filesystem MCP** : skills **publics** server-side (ex. `progression_pedagogique` cloné depuis un git azy.mcp). Le `mcp_path` dans `public.skills` pointe vers ce filesystem.
- **Registry tenant chat.api** : permissions par package (RFC-077), ownership des skills **privés** par user, audit, quotas.

### 4.3 Action chat.api

- ✅ **Rien à changer** dans PR-B
- 🟡 **Documenter** la sémantique : chat.api est **autoritaire pour la visibilité/permissions** ; MCP est autoritaire pour le **catalogue physique server-side**.
- 🟡 (Optionnel V1.2+) : endpoint admin `POST /api/admin/skills/sync-from-mcp` qui lit `GET /api/skills?path=` sur MCP et synchronise la table `public.skills` avec les nouveaux skills déployés.

**Effort** : 0j V1.2 strict ; ~0.5j pour l'endpoint sync optionnel.

---

## 5. Divergence #3 — Pause/reprise hybride

### 5.1 Constat

| Aspect | Doc MCP §1.3 | RFC-085 §6.5.1 (acté 2026-05-11) |
|---|---|---|
| Endpoint `/runs/{id}/continue` | **côté Azy-MCP** | **côté Azy Local Agent** (`localhost:11500`) |
| Use case | Skills hybrides côté MCP filesystem | Skills hybrides locaux user (option B pause/reprise) |

### 5.2 Décision actée

> *"On aura forcément 2"* — produit, 2026-05-12

**Les 2 patterns coexistent** selon le type de skill, cohérent avec la
matrice RFC-085 §C.11 :

| Cas RFC-085 | Type | Run pilote | Endpoint `/continue` |
|---|---|---|---|
| **#3 hybride local+cloud** (skill privé user) | `user_skills` tenant | **Azy Local Agent** | `localhost:11500/api/skills/runs/{id}/continue` |
| **#4 cloud-only** (skill public filesystem MCP) | `public.skills` | **Azy-MCP** | `mcp.azy.solutions/api/skills/runs/{id}/continue` |

→ chat.api **route selon le `kind`** du skill (info native dans le catalogue tenant).

### 5.3 Action chat.api

Le front ne doit **pas** appeler directement Azy-MCP ni l'Azy Local Agent.
Tout passe par chat.api (audit + billing centralisés). Donc :

- ✅ **Créer** des endpoints proxy chat.api :
  - `POST /api/skills/{name}/runs` → route vers MCP (cas #4) ou Local Agent via front (cas #3 inchangé)
  - `POST /api/skills/runs/{id}/continue` → idem
  - `GET /api/skills/runs/{id}` → idem
  - `DELETE /api/skills/runs/{id}` → idem
- 🟡 **Routing logic** : lookup le `kind` du skill dans le catalogue chat.api, puis proxy vers le bon backend
- 🟡 Pour les runs MCP : audit + billing en interception (avant/après proxy)

**Effort estimé** : ~1-1.5j endpoints proxy + routing logic.

> ⚠️ **À clarifier avec MCP team** : MCP a-t-il besoin que chat.api proxifie
> ou peut-il accepter des appels directs du front avec un token de
> délégation ? Pour l'instant on assume proxy = source unique audit.

---

## 6. Divergence #4 — Dispatch des steps cloud (À TRANCHER)

### 6.1 Constat — contradiction dans le doc MCP

Doc MCP §1.3 étape 2 dit :

> *"chat.api doit appeler le webhook indiqué et récupérer le résultat"*

Et tu dis :

> *"On passe toujours par azy.mcp"* — produit, 2026-05-12

→ **Contradiction directe**. Le doc actuel suggère que chat.api appelle
n8n directement quand MCP retourne un `pending_request`. La directive
produit dit que non.

### 6.2 Alternatives à arbitrer

| Option | Description | Impact chat.api | Impact MCP |
|---|---|---|---|
| **A — Endpoint MCP `POST /api/llm/dispatch`** | MCP livre un endpoint qui wrappe l'appel n8n. chat.api appelle MCP qui appelle n8n. Cohérent avec "toujours via MCP". | Léger : nouvel appel HTTP | Nouveau endpoint à livrer |
| **B — chat.api appelle n8n directement** | Suit le doc actuel §1.3 étape 2. Plus simple chat.api, viole "toujours via MCP". | Implémenter un client n8n direct (BYOT + service token n8n) | Aucun |
| **C — MCP gère le dispatch en interne dans `/continue`** | chat.api passe juste le résultat LLM à MCP, MCP a déjà appelé n8n en interne. | Plus simple : chat.api ne dispatche jamais | Plus complexe MCP : il doit appeler n8n et attendre |

### 6.3 Recommandation back

**Option A** semble la plus propre :
- Respecte "toujours via MCP" (audit + billing centralisé MCP-side aussi)
- chat.api reste simple : il sait juste appeler MCP
- Pas de duplication client n8n côté chat.api
- Cohérent avec le pattern Service Token n8n (MCP a déjà les credentials)

### 6.4 Action chat.api

- ⏸ **Bloqué sur clarification MCP team**. Pas de code chat.api possible tant que l'API contract n'est pas fixé.

---

## 7. Divergence #5 — Headers d'identification

### 7.1 Constat

Doc MCP §3.1 demande :

| Header | Requis | Description |
|---|---|---|
| `X-User-Id` | ✅ | ID utilisateur (pour forward WebSocket) |
| `X-Session-Id` | ⚠️ | ID session chat (recommandé) |
| `X-Msg-Id` | ⚠️ | ID message (pour corrélation) |
| `X-Correlation-Id` | ⚠️ | ID de corrélation (tracing) |
| `X-Tenant-Id` | ⚠️ | ID tenant (multi-tenant) |

Mon code chat.api passe ces infos **dans le body `metadata: {...}`** (cohérent avec n8n contract §1.2 mais pas avec les attentes MCP).

### 7.2 Décision actée

Ajouter les headers côté chat.api en plus du body (compatibilité ascendante).
**Pas un breaking change** pour MCP — c'est juste une duplication, MCP
peut continuer à lire le body ou switch sur headers selon ses préférences.

### 7.3 Action chat.api

- ✅ Modifier `_build_mcp_params` / dispatch helpers pour passer les `X-*` headers via `MCPClient.call_tool(headers=...)` (vérifier signature)
- ✅ Conserver le `metadata` dans le body (pas de régression)

**Effort estimé** : ~0.25j.

---

## 8. Tâche transverse — BYOT (Bring Your Own Token)

### 8.1 Constat

Doc MCP v2 introduit le **pattern BYOT** (§Pattern BYOT) :

> *"chat.api fournit la clé API du provider LLM dans chaque requête.
> Aucun fallback sur les variables d'environnement côté Azy-MCP ou n8n."*

Implication : `api_key` **doit être présent** dans tous les payloads
`/api/llm/skills/invoke`, `/api/llm/stream/init`, `POST /webhook/llm-call-*`.

### 8.2 Question ouverte — source de l'`api_key`

Mon code actuel **ne fournit pas** `api_key` (j'avais noté que Azy-MCP
résolvait en interposition). Mais le doc v2 dit le contraire : c'est
**chat.api** qui doit fournir la clé.

**Question** : d'où chat.api lit-il l'`api_key` du tenant ?

| Option | Description | Effort |
|---|---|---|
| **Table existante** | Si déjà présente (ex. `tenant_llm_credentials`) — à investiguer | 0.25j coordination |
| **Clé Azy unique partagée** | Via `ANTHROPIC_API_KEY` env. Pas vraiment BYOT mais simple. | 0.25j |
| **Nouvelle table tenant** | Créer `llm_provider_credentials` avec chiffrement at-rest + UI admin pour saisie | ~1.5j |

→ **À trancher avec produit** : est-ce que chaque tenant doit fournir
ses propres clés Anthropic/OpenAI (vrai BYOT) ou Azy met sa clé maison
partagée (cas commun) ?

### 8.3 Action chat.api

- ⏸ Tranche produit + back (~30 min)
- ✅ Selon le choix : ajouter `api_key` dans `_build_mcp_params` et
  `_build_stream_params` (chat.api existant)

---

## 9. Tâches V1.2 chat.api consolidées

Total estimé : **~4.5j** (hors résolution Divergence #4).

| Tâche | Effort | Bloquée par |
|---|---|---|
| Refonte transport streaming HTTP→WS (Divergence #1) | 2-3j | — |
| Endpoints proxy MCP runs `POST /api/skills/{name}/runs` etc. (Divergence #3) | 1-1.5j | — |
| Ajout `X-*` headers dans les dispatches (Divergence #5) | 0.25j | — |
| Intégration BYOT `api_key` (Tâche transverse §8) | 0.25-1.5j selon option | Décision produit |
| Endpoint sync filesystem MCP `POST /api/admin/skills/sync-from-mcp` (optionnel) | 0.5j | — |
| Tests refonte + doc compagnon update | 0.5j | — |

---

## 10. Ce qui reste valide (pas d'action requise)

PR livrées qui restent **100% valides** post-analyse :

| Composant | Source | Statut |
|---|---|---|
| Catalogue tenant `public.skills` + `user_skills` | PR-B | ✅ Conservé (décision produit Divergence #2) |
| 4 garde-fous Redis (cooldown + concurrent + daily exec + daily tokens) | PR-A §C.6 | ✅ Aucun changement |
| Pattern reserve/reconcile billing (RFC-072) | PR-A | ✅ Aucun changement |
| Audit `llm_call_audit` avec `source='skill'` + metadata JSONB | PR-A Phase 1.5 | ✅ Aucun changement |
| 9 codes erreur typés | PR-A Phase 6 | ✅ Aucun changement |
| Schémas Pydantic discriminator (mode messages/with_skills) | PR-A Phase 1 | ✅ Aucun changement |
| Service `SkillsLLMService` (sync dispatch) | PR-A Phase 2.2 | ✅ Aucun changement |
| Service `SkillsStreamService` (orchestration init + handle_packet) | PR-A2 Phase A2.2 | ✅ Conservé à 80% — adapter `handle_packet` à la source WS |
| SSE endpoint front (`GET /stream/{id}` + `/resume`) | PR-A2 Phase A2.4 + A2.5 | ✅ **Contrat browser inchangé** |
| Modèles SQLAlchemy + migrations | PR-A + PR-B | ✅ Aucun changement |

→ **>80% du code chat.api livré reste utilisable.** Les divergences impactent
principalement la **couche transport** (HTTP→WS) et le **routing** (proxy MCP).

---

## 11. Questions à remonter à l'équipe Azy-MCP

À discuter en réunion d'alignement avant de coder V1.2 :

1. **Divergence #4** : Quelle option (A/B/C de §6.2) ? Endpoint MCP `/api/llm/dispatch` souhaité ?
2. **WebSocket transport** : URL exacte (`wss://...`), authent (Service Token ? mTLS ?), format des frames (texte JSON simple ou MessagePack ?), retry/reconnect policy
3. **Endpoints `/runs/{id}/continue` côté MCP** : payload exact attendu pour `/continue` (juste le `result` string ou enveloppe ?), gestion concurrent runs/user, TTL
4. **Filesystem MCP `GET /api/skills?path=`** : qui maintient le filesystem (déploiement git ? upload admin ?), comment chat.api détecte les changements pour la synchro registry tenant
5. **BYOT api_key source** : convention Azy globale ou registry tenant à créer ? Si tenant : qui code la UI admin de saisie ?
6. **Auth des endpoints MCP côté chat.api** : Service Token unique chat.api → MCP ou délégation par-request (signed JWT) ?

---

## 12. Suite immédiate

- ⏸ **Coordination réunion archi** Backend + MCP + Local Agent pour acter les 6 questions §11
- ⏸ **Décision produit** sur BYOT source (Tâche §8)
- ⏸ Mise à jour des 3 docs compagnons (`skills-llm-invoke-contract.md`, `skills-llm-stream-contract.md`, `INDEX-SKILLS-FRONTEND.md`) une fois l'alignement fait
- ⏸ Ouverture de la PR V1.2 d'alignement (~4.5j de scope cumulé)

→ En attendant, **le V1 mergé sur develop reste fonctionnel** pour les
flows actuels (l'incompatibilité réelle apparaîtra à la première
intégration end-to-end avec MCP, qui est elle-même en cours côté MCP).

---

## 13. Références

- [Doc Azy-MCP v2](../guides/backend-integration-guide.md) — source de l'analyse
- [RFC-085 Skills Engine](../rfc/RFC-085-SKILLS-ENGINE.md) — §C.11 matrice V1/V2, §6.5.1 option B pause/reprise
- [RFC-086 LLM Streaming Architecture](../rfc/RFC-086-LLM-STREAMING-ARCHITECTURE.md)
- [Skills LLM invoke contract](../guides/skills-llm-invoke-contract.md) (PR-A)
- [Skills catalog contract](../guides/skills-catalog-contract.md) (PR-B)
- [Skills LLM stream contract](../guides/skills-llm-stream-contract.md) (PR-A2)
- [INDEX-SKILLS-FRONTEND](../guides/INDEX-SKILLS-FRONTEND.md) — point d'entrée front
- PRs V1 mergées : #2357 (PR-A), #2358 (PR-B), #2359 (PR-A2), #2360 (doc)
- [Contrat webhooks n8n LLM BYOT](../guides/skills-n8n-anthropic-contract.md) — v2.0.0

---

## 14. Alignement n8n webhooks (équipe n8n)

> **Analyse réalisée par l'équipe n8n** — 2026-05-12

### 14.1 Statut des webhooks n8n

Les 4 webhooks LLM sont **implémentés et déployés** selon le pattern BYOT v2.0.0 :

| Webhook | Provider | Workflow ID | Status |
|---------|----------|-------------|--------|
| `llm-call-messages` | Multi (anthropic, openai, mistral) | `V9aXcWyCd4omNDmA` | ✅ Actif |
| `llm-call-stream` | Multi | `jJe59jAy85SStBzT` | ✅ Actif |
| `claude-call-with-skills` | Anthropic only | `lC0x41BDaZjUuule` | ✅ Actif |
| `claude-call-stream-with-skills` | Anthropic only | `szbTydjALpuq3oqj` | ✅ Actif |

### 14.2 Conformité BYOT

Tous les webhooks **exigent `api_key`** dans le payload — aucun fallback sur les variables d'environnement :

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-...",  // ⚠️ REQUIS - validation stricte
  "messages": [...]
}
```

→ **Conforme** à la directive BYOT §8 du présent document.

### 14.3 Architecture streaming n8n → MCP → chat.api

Concernant la **Divergence #1** (WebSocket vs HTTP callback) :

```
┌──────────────┐  HTTP callback    ┌──────────┐  WebSocket    ┌──────────┐
│ n8n webhooks │ ────────────────▶ │ Azy-MCP  │ ────────────▶ │ chat.api │
│ (streaming)  │  POST callback_url│          │  llm_chunk    │          │
└──────────────┘                   └──────────┘  llm_complete  └──────────┘
```

**Justification technique** :
- n8n **ne supporte pas** le streaming SSE/WebSocket natif dans les Code nodes
- Le pattern **HTTP callback** est donc le seul viable côté n8n
- MCP agit comme **bridge** : reçoit les callbacks HTTP et forward en WebSocket

→ **Les webhooks n8n restent valides.** La conversion HTTP→WS est la responsabilité de MCP.

### 14.4 Impact des divergences sur n8n

| Divergence | Impact n8n | Action requise |
|------------|------------|----------------|
| #1 Streaming transport | ❌ Aucun | MCP convertit HTTP→WS |
| #2 Catalogue skills | ❌ Aucun | Géré par chat.api/MCP |
| #3 Pause/reprise | ❌ Aucun | Routing géré par chat.api |
| #4 Dispatch steps cloud | ⚠️ À clarifier | Qui appelle n8n : chat.api ou MCP ? |
| #5 Headers X-* | ❌ Aucun | n8n lit `metadata` du body |

### 14.5 Question ouverte pour l'équipe MCP

**Concernant Divergence #4** (§6) — Option A recommandée :

Si MCP expose `POST /api/llm/dispatch`, c'est **MCP qui appellera les webhooks n8n** avec les credentials BYOT. Cela est cohérent avec :
- Le pattern "toujours via MCP"
- L'audit centralisé côté MCP
- Le fait que MCP a déjà le `callback_url` pour recevoir les paquets streaming

→ **Recommandation n8n** : Option A (endpoint MCP `/api/llm/dispatch`)

### 14.6 Référence documentation

Le contrat complet des webhooks n8n est disponible dans :
- [`docs/guides/skills-n8n-anthropic-contract.md`](../guides/skills-n8n-anthropic-contract.md) — v2.0.0 (BYOT pattern)

PRs n8n mergées :
- PR #349 : `llm-call-messages` + `MCP - Text Generator`
- PR #350 : `llm-call-stream` + `claude-call-with-skills` + `claude-call-stream-with-skills`
