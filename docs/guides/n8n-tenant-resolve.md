# n8n MCP Tenant Resolve — Guide d'intégration

**Audience** : équipe n8n (workflow MCP tenant-resolve), équipe MCP server (consommateurs de la sortie).
**Référence** : RFC-079 follow-up — décision contrat 2026-05-04.
**Statut back** : ✅ Endpoint livré.

---

## 1. Contrat

### Endpoint

```
GET /api/n8n/tenants/resolve
  ?guild_id=<discord_guild_snowflake>
  &user_id=<discord_user_id>           # optionnel, ignoré aujourd'hui
```

**Auth** : `X-Service-Token: <token>` (recommandé) — `X-API-Key` legacy aussi accepté.

**Pas de `X-Tenant-ID` requis** — c'est précisément ce que cet endpoint résout.

### Réponse 200 OK

```jsonc
{
  "tenant_id": "Z6F3GSWB",
  "package": {
    "code": "mid-complet",                       // null si aucun package résolu
    "source": "discord_guild_default",            // ou tenant_owner_fallback / null
    "models": {
      "chat":      "claude-sonnet-4-5",
      "chat_mini": "claude-haiku-4-5",
      "embedding": "text-embedding-3-large",
      "vision":    null,                           // package n'a pas de vision configuré
      "voice":     null,                           // pas de TTS dans ce package
      "reasoning": null                            // pas de modèle reasoning
    }
  }
}
```

### Erreurs

| Statut | `error.code` | Cas |
|---|---|---|
| 401 | (auth handler) | `X-Service-Token` manquant ou invalide |
| 404 | `unknown_guild` | `guild_id` non rattaché à un tenant (cf. `tenant_discord_servers`) |
| 500 | `internal_error` | erreur DB ou autre — voir logs back |

---

## 2. Logique de résolution (côté back, info pour debug)

```
guild_id reçu
   ↓
1. SELECT tenant_id FROM tenant_discord_servers WHERE guild_id = $1
   ├─→ 0 row → 404 unknown_guild
   └─→ tenant_id résolu
       ↓
2. resolve_effective_pref_discord(tenant_id, guild_id)
   ├─→ row dans tenant_discord_plugin_packages (mapping explicite)
   │    → package_code, source = 'discord_guild_default'
   ├─→ pas de mapping → fallback owner pref
   │    → package_code de l'owner, source = 'tenant_owner_fallback'
   └─→ pas d'owner pref non plus → package = null, source = null
       ↓
3. SELECT role, model_id FROM llm_package_models WHERE package_code = $1
   → mapping rôle interne → rôle n8n :
       default_chat   → chat
       chat_mini      → chat_mini
       embedding      → embedding
       vision         → vision
       text_to_speech → voice
       deep_research  → reasoning
   → champs absents = null
```

---

## 3. Mapping des rôles

| Rôle n8n | Rôle interne (DB) | Description |
|---|---|---|
| `chat` | `default_chat` | Modèle principal de chat |
| `chat_mini` | `chat_mini` | Variante légère pour classification, extraction |
| `embedding` | `embedding` | Embeddings pour RAG |
| `vision` | `vision` | Modèle multimodal capable d'image input |
| `voice` | `text_to_speech` | TTS uniquement aujourd'hui (cf. décision n8n 2026-05-04 — STT pourra être ajouté plus tard via voice_in/voice_out) |
| `reasoning` | `deep_research` | Modèle de raisonnement (o1, o3, …) |

→ Si un rôle n'est pas configuré dans le package, la valeur retournée est `null`. Le workflow n8n / le plugin doivent gérer ce cas (skip ou fallback applicatif).

---

## 4. user_id — accepté, ignoré

Le paramètre `user_id` est **accepté** dans la query mais **non utilisé** côté back aujourd'hui. Le package est résolu **par guild**, pas par utilisateur.

Réservé pour évolution future (override premium individuel par exemple, RFC ultérieure). Vous pouvez le passer ou l'omettre — ne change rien à la réponse.

---

## 5. Snippet n8n (HTTP Request node)

```yaml
Method: GET
URL: https://apidev.azy.solutions/api/n8n/tenants/resolve
Query Parameters:
  - guild_id: ={{ $json.guild_id }}
  - user_id:  ={{ $json.user_id }}     # optionnel
Authentication: Header
Header: X-Service-Token = {{ $env.N8N_SERVICE_TOKEN }}
Response Format: JSON
Continue On Fail: true                   # gérer 404 dans le node suivant
```

Workflow d'extraction des values utiles :

```
{{ $json.tenant_id }}
{{ $json.package.code }}
{{ $json.package.source }}
{{ $json.package.models.chat }}
{{ $json.package.models.chat_mini }}
// ... etc
```

---

## 6. Cas d'usage côté plugin chatbot-core

Quand un message arrive dans un guild Discord :

1. Le plugin chatbot-core lit `message.guild.id` (= guild_id Discord)
2. Il appelle (via le webhook n8n MCP tenant-resolve) → cet endpoint back
3. Il reçoit `{tenant_id, package: {code, models}}`
4. Il utilise `models.chat` pour répondre au message principal
5. Il utilise `models.chat_mini` pour les tâches secondaires (classification d'intent, extraction d'entités)
6. Il utilise `models.embedding` pour la recherche RAG le cas échéant
7. Il pioche dans `models.vision`, `models.voice`, `models.reasoning` selon les capabilities détectées

Si `package.code` est `null` (pas de package résolu, et pas de fallback owner), le plugin doit logger un warning et répondre à l'user "configuration manquante, contactez l'admin".

---

## 7. Tests à dérouler après déploiement apidev

### 7.1. Happy path

```bash
curl -H "X-Service-Token: $N8N_SERVICE_TOKEN" \
     "https://apidev.azy.solutions/api/n8n/tenants/resolve?guild_id=1458159736775119115"
```

Attendu : 200 + JSON avec `tenant_id: "Z6F3GSWB"`. Selon que le guild a une mapping configurée ou non, `package.source` sera `discord_guild_default` ou `tenant_owner_fallback`.

### 7.2. Guild inconnu

```bash
curl -H "X-Service-Token: $N8N_SERVICE_TOKEN" \
     "https://apidev.azy.solutions/api/n8n/tenants/resolve?guild_id=999999999999999"
```

Attendu : 404 `unknown_guild`.

### 7.3. Auth manquante

```bash
curl "https://apidev.azy.solutions/api/n8n/tenants/resolve?guild_id=1458159736775119115"
```

Attendu : 401.

---

## 8. Différences avec les endpoints existants

| Endpoint | Renvoie | Cas d'usage |
|---|---|---|
| `GET /api/discord/guild/{id}/tenant` | `{tenant_id, guild_name, projects}` | Legacy — résolution **tenant uniquement**, pas de package |
| `GET /api/n8n/resolve/tenant?discord_user_id=X` | `{tenant_id, guild_id, display_name}` | Résolution **par user Discord** (table `discord_user_links`) |
| **`GET /api/n8n/tenants/resolve?guild_id=X`** | `{tenant_id, package: {code, source, models}}` | **Cible RFC-079** — résolution complète guild → package + models |

Les 2 anciens endpoints sont conservés pour compat ascendante. Si vous avez besoin de tenant_id seulement, ils restent utilisables. Si vous avez besoin du package, **passez par le nouveau**.

---

## 9. Versioning du contrat

Cette réponse est versionnée par le code (Pydantic schema `N8nResolveResponse`). Si une évolution casse la rétrocompat (ex: ajout d'un rôle `voice_in`/`voice_out`), une nouvelle PR back déprécie l'ancienne shape sur 1-2 mois.

Toute modification du `N8N_ROLE_MAPPING` côté back déclenche un test de régression — pas de risque de rename silencieux.
