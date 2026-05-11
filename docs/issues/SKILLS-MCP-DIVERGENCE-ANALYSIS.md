# Skills Engine — Analyse des divergences chat.api vs Azy-MCP

> **Document d'analyse** pour aligner l'implémentation V1 chat.api Skills
> Engine (PR-A + PR-B + PR-A2 mergées) avec le `backend-integration-guide.md`
> v2 fourni par l'équipe Azy-MCP.

| Métadonnée | Valeur |
|---|---|
| **Version** | 2.1.0 |
| **Date** | 2026-05-12 |
| **Auteurs** | équipe Backend chat.api, équipe n8n, équipe Azy-MCP |
| **Doc source** | `docs/guides/backend-integration-guide.md` (v2 du 2026-05-11) |
| **RFCs liées** | RFC-085 (Skills), RFC-086 (Streaming) |
| **Statut** | ✅ Aligné — 5 divergences résolues, prêt pour V1.2 |

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
| 4 | Dispatch des steps cloud n8n | **Option A : MCP expose `POST /api/llm/dispatch`** | ✅ Acté (§15.1) |
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

Specs WebSocket figées par MCP (cf. §15.2) :

| Aspect | Valeur |
|---|---|
| URL | `wss://mcp.azy.solutions/ws/llm/stream` |
| Auth | `Authorization: Bearer <MCP_SERVICE_TOKEN>` |
| Format | JSON text (pas MessagePack en V1) |
| Heartbeat | Ping/Pong 30s |
| Reconnect | Exponential backoff 1s/2s/4s/max 30s |
| TTL session | 5 min après dernier paquet |
| Messages | `subscribe` (out), `llm_chunk` (in), `llm_complete` (in), `llm_error` (in) |

Actions :
- ❌ **Supprimer** `app/api_routes/internal/llm_stream_callback_routes.py`
- ✅ **Créer** un client WebSocket persistant (worker async + reconnect logic)
  - Auth Bearer Service Token
  - À chaque init stream : envoyer frame `subscribe` avec `correlation_id` + `user_id`
  - Écouter les 3 types de frames inbound (`llm_chunk`, `llm_complete`, `llm_error`)
  - Forward vers `SkillsStreamService.handle_packet` (signature adapter — pas de `StreamCallbackPacket` pour WS, juste un dict typé Pydantic)
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
- ✅ **Routing logic** : lookup le `kind` du skill dans le catalogue chat.api, puis proxy vers le bon backend
- ✅ Pour les runs MCP : audit + billing en interception (avant/après proxy)

**Payload `/continue` figé par MCP** (cf. §15.3) :

```json
{
  "step_result": {
    "success": true,
    "content": "Réponse du LLM cloud...",
    "usage": {"input_tokens": 245, "output_tokens": 1832}
  }
}
```

- Mutex Redis pour éviter `/continue` concurrent (`409 Conflict` sinon)
- TTL run en attente : 10 min ; terminé : 1 h

**Effort estimé** : ~1-1.5j endpoints proxy + routing logic.

---

## 6. Divergence #4 — Dispatch des steps cloud ✅ RÉSOLU

### 6.1 Constat initial — contradiction dans le doc MCP

Doc MCP §1.3 étape 2 disait :

> *"chat.api doit appeler le webhook indiqué et récupérer le résultat"*

Et le produit disait :

> *"On passe toujours par azy.mcp"* — produit, 2026-05-12

→ Contradiction directe entre la doc et la directive.

### 6.2 Décision actée — Option A (cf. §15.1)

**MCP expose `POST /api/llm/dispatch`** qui wrappe l'appel n8n. chat.api
ne contacte jamais n8n directement. Cohérent avec "toujours via MCP".

| Aspect | Valeur |
|---|---|
| Endpoint MCP | `POST /api/llm/dispatch` |
| Payload | BYOT (`provider`, `api_key`, `model`, `messages`, etc.) |
| Réponse sync | Body direct pour `llm-call-messages` |
| Réponse stream | `202 Accepted` + streaming via WebSocket |
| Effort MCP | ~0.5j (LLMRouter existe déjà) |

### 6.3 Action chat.api

- ✅ Remplacer `MCPClient.call_tool("llm.call_messages", ...)` par appel
  HTTP direct à `POST mcp.azy.solutions/api/llm/dispatch`
- ✅ Adapter `_build_mcp_params` pour produire le payload `LLMDispatchRequest`
  attendu côté MCP (cf. §15.1 implémentation Python)
- ✅ Service Token Bearer dans les headers

**Effort estimé** : ~0.5j (adaptation dispatch dans `SkillsLLMService` +
`SkillsStreamService.init`).

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
> Aucun fallback sur les variables d'environnement **côté Azy-MCP ou n8n**."*

→ ⚠️ **Lecture précise** : le doc interdit le fallback env **chez MCP
et n8n**, pas chez chat.api. Le « BYOT » désigne ici le **caller HTTP
(chat.api)**, pas le tenant final. **Pas de multi-tenant key management
à mettre en place.**

Cohérent avec RFC-085 §7.4.1 acquise depuis le début :

> *"Les clés Anthropic restent côté Azy (chat.api → N8N)"*

### 8.2 Décision actée (clarifiée 2026-05-12)

| Aspect | Valeur |
|---|---|
| Source `api_key` | `os.getenv("ANTHROPIC_API_KEY")` côté chat.api (clé Azy maison, partagée entre tenants) |
| Passage à MCP | Dans body payload : `api_key: <env>` |
| Table tenant `llm_provider_credentials` | ❌ **Non nécessaire** en V1 |
| Multi-tenant key management | Différé V2+ (si un jour des tenants veulent leur propre clé) |

### 8.3 Action chat.api

- ✅ Lire `os.getenv("ANTHROPIC_API_KEY")` au boot de `SkillsLLMService` /
  `SkillsStreamService` (DI via settings)
- ✅ Ajouter `api_key` dans `_build_mcp_params` et `_build_stream_params`
- ✅ Idem provider-specific : `OPENAI_API_KEY`, `MISTRAL_API_KEY` (selon
  le `provider_code` résolu)

**Effort estimé** : ~0.25j (plumbing pur, pas de DB).

---

## 9. Tâches V1.2 chat.api consolidées

Total estimé : **~5-6j** (toutes divergences résolues, prêt à coder).

| # | Tâche | Effort | Specs |
|---|---|---|---|
| 1 | **WebSocket client** vers MCP (`wss://mcp.azy.solutions/ws/llm/stream`) — Service Token Bearer, heartbeat 30s ping/pong, reconnect backoff 1s/2s/4s/30s, 4 message types (`subscribe`, `llm_chunk`, `llm_complete`, `llm_error`), TTL 5min | 2-3j | §3.3 + §15.2 |
| 2 | **Adapter dispatch** : remplacer `MCPClient.call_tool("llm.call_messages")` par `POST mcp.azy.solutions/api/llm/dispatch` (Divergence #4) | 0.5j | §6.3 + §15.1 |
| 3 | **Endpoints proxy MCP runs** : `POST /api/skills/{name}/runs`, `/runs/{id}/continue` (payload `{step_result}`), `GET`, `DELETE` avec routing par `kind` du skill | 1-1.5j | §5.3 + §15.3 |
| 4 | **BYOT api_key** : lire `os.getenv("ANTHROPIC_API_KEY")` + passer dans payload MCP | 0.25j | §8 |
| 5 | **Headers X-*** : `X-User-Id`, `X-Session-Id`, `X-Msg-Id`, `X-Correlation-Id`, `X-Tenant-Id` aux dispatches | 0.25j | §7 |
| 6 | **Suppression** HTTP callback receiver `/api/internal/llm/stream-callback` (remplacé par WS client de #1) | 0.1j | §14.3 |
| 7 | **Sync filesystem MCP** (optionnel V1.2+) : worker async poll `GET /api/skills` toutes les 5 min avec ETag, sync les diffs vers `public.skills` | 0.5j | §15.4 |
| 8 | Tests refonte + mise à jour 4 docs compagnons (`skills-llm-invoke-contract.md`, `skills-llm-stream-contract.md`, `INDEX-SKILLS-FRONTEND.md`, `skills-catalog-contract.md`) | 0.5j | — |

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

~~À discuter en réunion d'alignement avant de coder V1.2~~ → **✅ Toutes résolues (cf. §15)**

1. ~~**Divergence #4**~~ → ✅ **Option A actée** : MCP expose `POST /api/llm/dispatch` (cf. §15.1)
2. ~~**WebSocket transport**~~ → ✅ **Spécifié** : `wss://mcp.azy.solutions/ws/llm/stream`, Service Token, JSON (cf. §15.2)
3. ~~**Endpoints `/runs/{id}/continue`**~~ → ✅ **Payload documenté** : enveloppe `step_result`, mutex Redis, TTL 10min (cf. §15.3)
4. ~~**Filesystem MCP**~~ → ✅ **Clarifié** : déploiement Git, poll `GET /api/skills` avec ETag (cf. §15.4)
5. ~~**BYOT api_key source**~~ → ✅ **Résolu** (cf. §8.2) : clé Azy maison côté chat.api
6. ~~**Auth chat.api → MCP**~~ → ✅ **Service Token unique** (cf. §15.5)

---

## 12. Suite immédiate

- ~~Coordination réunion archi~~ → ✅ **Alignement fait** via ce document (§14 n8n + §15 MCP)
- ~~Décision produit sur BYOT source~~ → ✅ **Résolu** (env Azy maison cf. §8.2)
- ~~Clarification dispatch n8n~~ → ✅ **Résolu** (Option A actée cf. §6 + §15.1)
- 🟡 **PR V1.2 chat.api** : ~5-6j (cf. §9) — 8 tâches consolidées, **démarrable immédiatement**
- 🟡 **PR MCP** : ~1j (cf. §15.6) — endpoint `POST /api/llm/dispatch` + WebSocket + ETag sur `GET /api/skills`
- 🟡 **Docs compagnons** : mise à jour incluse dans la tâche #8 de la PR V1.2 chat.api

→ **Prêt pour implémentation V1.2.** Les 3 équipes (chat.api, n8n, MCP) sont alignées sur l'ensemble des specs.

**Ordre de livraison recommandé** :
1. **MCP** livre `POST /api/llm/dispatch` + WS endpoint (en parallèle, ~1j)
2. **chat.api** démarre les tâches #2 (dispatch) + #4 (BYOT) + #5 (headers) — non bloquées (~1j)
3. **chat.api** continue tâche #1 (WS client) dès que MCP a déployé l'endpoint WS (~2-3j)
4. **chat.api** finalise tâches #3 (proxy runs) + #6 (cleanup) + #8 (tests + docs) (~2j)

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

Les webhooks n8n **exigent `api_key`** dans le payload — aucun fallback sur les variables d'environnement **côté n8n** :

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-...",  // ⚠️ REQUIS par n8n - validation stricte
  "messages": [...]
}
```

→ **Cohérent** avec la décision §8.2 : chat.api lit `os.getenv("ANTHROPIC_API_KEY")` et le transmet à n8n via le payload.

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
| #4 Dispatch steps cloud | ✅ Résolu | MCP appelle n8n (Option A actée) |
| #5 Headers X-* | ❌ Aucun | n8n lit `metadata` du body |

### 14.5 Recommandation n8n pour Divergence #4

**Option A recommandée** (endpoint MCP `/api/llm/dispatch`) :

Si MCP expose cet endpoint, c'est **MCP qui appellera les webhooks n8n** avec les credentials BYOT. Cela est cohérent avec :
- Le pattern "toujours via MCP"
- L'audit centralisé côté MCP
- Le fait que MCP a déjà le `callback_url` pour recevoir les paquets streaming

### 14.6 Référence documentation

Le contrat complet des webhooks n8n est disponible dans :
- [`docs/guides/skills-n8n-anthropic-contract.md`](../guides/skills-n8n-anthropic-contract.md) — v2.0.0 (BYOT pattern)

PRs n8n mergées :
- PR #349 : `llm-call-messages` + `MCP - Text Generator`
- PR #350 : `llm-call-stream` + `claude-call-with-skills` + `claude-call-stream-with-skills`

---

## 15. Réponses Azy-MCP aux questions §11

> **Réponses de l'équipe Azy-MCP** — 2026-05-12

### 15.1 Divergence #4 — Option A actée ✅

**Décision : Option A** — MCP expose `POST /api/llm/dispatch`

| Aspect | Valeur |
|--------|--------|
| Endpoint | `POST /api/llm/dispatch` |
| Responsabilité | MCP appelle les webhooks n8n, chat.api ne contacte jamais n8n directement |
| Payload | BYOT (`provider`, `api_key`, `model`, `messages`, etc.) |
| Réponse sync | Pour `llm-call-messages` : réponse directe |
| Réponse stream | Pour `llm-call-stream` : `202 Accepted` + streaming via WebSocket |

**Implémentation MCP** :

```python
@router.post("/api/llm/dispatch")
async def dispatch_llm_call(
    request: LLMDispatchRequest,
    x_user_id: str = Header(...),
    x_correlation_id: str = Header(None),
):
    """
    Dispatch LLM call to n8n webhook.

    MCP acts as proxy: chat.api → MCP → n8n → provider
    """
    route = llm_router.determine_route(
        anthropic_skills=request.anthropic_skills,
        stream=request.stream,
    )

    payload = llm_router.build_payload(
        route=route,
        provider=request.provider,
        api_key=request.api_key,  # BYOT from chat.api
        model=request.model,
        messages=request.messages,
        # ...
    )

    return await n8n_client.call_webhook(route.webhook.value, payload)
```

**Effort MCP** : ~0.5j (le `LLMRouter` existe déjà, ajouter le endpoint HTTP)

### 15.2 WebSocket transport — Spécifications

| Aspect | Valeur |
|--------|--------|
| **URL** | `wss://mcp.azy.solutions/ws/llm/stream` |
| **Auth** | Header `Authorization: Bearer <service_token>` |
| **Format frames** | JSON text (pas MessagePack en V1) |
| **Heartbeat** | Ping/Pong toutes les 30s |
| **Reconnect policy** | Exponential backoff: 1s, 2s, 4s, max 30s |
| **TTL session** | 5 minutes après dernier paquet |

**Messages WebSocket** :

```json
// Subscription (chat.api → MCP)
{"type": "subscribe", "correlation_id": "stream-abc123", "user_id": "user-456"}

// Chunk (MCP → chat.api)
{"type": "llm_chunk", "correlation_id": "stream-abc123", "chunk": "La photo...", "sequence": 3}

// Complete (MCP → chat.api)
{"type": "llm_complete", "correlation_id": "stream-abc123", "usage": {"input_tokens": 45, "output_tokens": 1234}}

// Error (MCP → chat.api)
{"type": "llm_error", "correlation_id": "stream-abc123", "error": {"type": "timeout", "message": "..."}}
```

### 15.3 Endpoint `/runs/{id}/continue` — Payload exact

```http
POST /api/skills/runs/{run_id}/continue
Content-Type: application/json
X-Correlation-Id: corr-abc123

{
  "step_result": {
    "success": true,
    "content": "Réponse du LLM cloud...",
    "usage": {
      "input_tokens": 245,
      "output_tokens": 1832
    }
  }
}
```

**Gestion concurrence** :
- Un seul `/continue` actif par `run_id` (mutex Redis)
- Erreur `409 Conflict` si appel concurrent

**TTL runs** :
- Run en attente (`needs_llm`) : 10 minutes
- Run terminé (`completed`/`failed`) : 1 heure (pour récupération)
- Nettoyage automatique via scheduler

### 15.4 Filesystem MCP — Maintenance

| Aspect | Valeur |
|--------|--------|
| **Maintenance** | Déploiement Git (CI/CD) |
| **Path par défaut** | `/app/skills` (configurable) |
| **Détection changements** | Endpoint `GET /api/skills?path=...` avec header `If-None-Match` (ETag) |
| **Webhook notification** | (V2+) MCP peut notifier chat.api via webhook quand skills changent |

**Recommandation sync chat.api** :
- Poll `GET /api/skills` toutes les 5 minutes
- Comparer avec `public.skills` et sync les différences
- Ou utiliser le webhook notification (V2+)

### 15.5 Auth chat.api → MCP

| Aspect | Valeur |
|--------|--------|
| **Méthode** | Service Token unique |
| **Header** | `Authorization: Bearer <MCP_SERVICE_TOKEN>` |
| **Rotation** | Token longue durée, rotation manuelle (V2 : rotation auto) |
| **Scope** | Full access aux endpoints `/api/skills/*` et `/api/llm/*` |

**Pas de JWT par-request en V1** — simplicité. Le Service Token identifie chat.api comme appelant de confiance.

### 15.6 Résumé des actions MCP

| Tâche | Effort | Statut |
|-------|--------|--------|
| Endpoint `POST /api/llm/dispatch` (Divergence #4) | 0.5j | 🟡 À implémenter |
| WebSocket endpoint `/ws/llm/stream` | Déjà prévu RFC-086 | ✅ En cours |
| Documentation payload `/continue` | 0.1j | ✅ Fait (ci-dessus) |
| ETag sur `GET /api/skills` | 0.25j | 🟡 À implémenter |

**Total effort MCP** : ~1j

### 15.7 Références MCP

- [RFC-085 Skills Engine](../rfc/RFC-085-SKILLS-ENGINE.md)
- [RFC-086 LLM Streaming](../rfc/RFC-086-LLM-STREAMING-ARCHITECTURE.md)
- [Backend Integration Guide v2](../guides/backend-integration-guide.md)
- [Skills Engine Guide](../guides/skills-engine-guide.md)
- [Contrat n8n LLM BYOT](../guides/skills-n8n-anthropic-contract.md)

---

## 16. Impacts Azy Agent Local

> **Analyse pour l'équipe Azy Agent Local** — 2026-05-12

### 16.1 Résumé des impacts

| Aspect | Impact | Action requise |
|--------|--------|----------------|
| **BYOT pattern** | ⚠️ Différent | L'agent local reçoit `api_key` du **front**, pas de chat.api |
| **Endpoints `/runs/*`** | ✅ Déjà implémentés | Vérifier alignement avec MCP |
| **Payload `/continue`** | ⚠️ À aligner | Adopter le format enveloppe `step_result` (cf. §15.3) |
| **WebSocket streaming** | ❌ Non concerné | Pas de streaming agent local → chat.api |
| **Auth Service Token** | ❌ Non concerné | Agent sur localhost, pas d'auth externe |

### 16.2 Architecture agent local — Front only

> ⚠️ **Important** : L'agent local communique **uniquement avec le front**, jamais avec chat.api directement.

```
┌──────────┐            ┌──────────┐  api_key   ┌─────────────┐  api_key   ┌──────────┐
│ chat.api │◀──────────▶│  Front   │ ─────────▶ │ Agent Local │ ─────────▶ │   n8n    │
│          │   SSE/WS   │          │  localhost │ :11500      │            │          │
└──────────┘            └──────────┘            └─────────────┘            └──────────┘
```

**Flow BYOT pour skills locaux** :
1. Le front récupère l'`api_key` via chat.api (ou config locale)
2. Le front envoie la requête à l'agent local avec `api_key`
3. L'agent local transmet à n8n avec `api_key`

**Pas de fallback env** : l'agent local ne doit **pas** lire `ANTHROPIC_API_KEY` depuis ses propres variables d'environnement. La clé vient toujours du front.

### 16.3 Alignement payload `/continue`

L'agent local doit accepter le même format que MCP :

```http
POST /api/skills/runs/{run_id}/continue
Content-Type: application/json

{
  "step_result": {
    "success": true,
    "content": "Réponse du LLM cloud...",
    "usage": {
      "input_tokens": 245,
      "output_tokens": 1832
    }
  }
}
```

**À vérifier** : le format actuel de l'agent local est-il compatible ?

### 16.4 Actions agent local

| Tâche | Effort | Priorité |
|-------|--------|----------|
| Vérifier support BYOT (`api_key` passthrough depuis front) | 0.25j | P1 |
| Aligner payload `/continue` avec format §15.3 | 0.25j | P1 |
| Documenter contrat endpoints `/runs/*` pour le front | 0.25j | P2 |

**Total effort agent local** : ~0.75j

### 16.5 Note importante

L'agent local **n'est pas un backend** au sens classique. Il tourne sur le poste utilisateur et communique uniquement avec le front via `localhost:11500`.

Les décisions prises pour chat.api ↔ MCP (WebSocket, Service Token, etc.) ne s'appliquent **pas** à l'agent local.
