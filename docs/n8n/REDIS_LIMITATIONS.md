# Gestion Redis dans n8n - Limitations et bonnes pratiques

**Date:** 2026-02-12
**Dernière mise à jour:** 2026-02-12
**Référence:** RFC-032, RFC-033

---

## 1. Résumé

Le node Redis natif de n8n a des **limitations importantes**. Ce document recense les opérations supportées, non supportées, et les solutions de contournement.

---

## 2. Opérations Redis supportées par n8n

Le node `n8n-nodes-base.redis` (version 1) supporte uniquement les opérations **clé-valeur basiques** :

| Opération | Supportée | Description |
|-----------|-----------|-------------|
| `GET` | ✅ Oui | Récupérer une valeur |
| `SET` | ✅ Oui | Définir une valeur |
| `DELETE` | ✅ Oui | Supprimer une clé |
| `INCR` | ✅ Oui | Incrémenter |
| `KEYS` | ✅ Oui | Lister les clés (pattern) |
| `PUSH` | ✅ Oui | Ajouter à une liste |
| `POP` | ✅ Oui | Retirer d'une liste |
| `PUBLISH` | ✅ Oui | Pub/Sub publish |

---

## 3. Opérations Redis NON supportées

### 3.1 Redis Streams (CRITIQUE)

| Opération | Supportée | Usage prévu |
|-----------|-----------|-------------|
| `XADD` | ❌ Non | Ajouter à un stream |
| `XREAD` | ❌ Non | Lire un stream |
| `XACK` | ❌ Non | Acknowledge un message |
| `XLEN` | ❌ Non | Longueur du stream |
| `XRANGE` | ❌ Non | Lire une plage |
| `XGROUP` | ❌ Non | Gérer les consumer groups |
| `XPENDING` | ❌ Non | Messages pending |
| `XDEL` | ❌ Non | Supprimer du stream |
| `XTRIM` | ❌ Non | Trimmer le stream |

### 3.2 Autres opérations non supportées

| Catégorie | Opérations |
|-----------|------------|
| **Hash** | HGET, HSET, HMGET, HGETALL, HDEL |
| **Set** | SADD, SREM, SMEMBERS, SISMEMBER |
| **Sorted Set** | ZADD, ZRANGE, ZRANK, ZSCORE |
| **Transactions** | MULTI, EXEC, WATCH |
| **Scripting** | EVAL, EVALSHA |

---

## 4. Problèmes rencontrés

### 4.1 Workflows cassés (RFC-032)

**Date:** 2026-02-11

**Symptôme:** 11 workflows utilisaient des opérations Redis Streams (xRead, xAdd, xAck) et étaient **non fonctionnels**.

**Cause:** Les workflows avaient été créés avec des opérations non supportées par le node Redis de n8n.

**Workflows impactés:**
- `N8N - Intent Events Consumer` (supprimé)
- `MCP - Tools Notify` (supprimé)
- `INFRA - Process-Pending-Events` (supprimé - remplacé par worker Python)
- `CHANNELS - Private-*` (corrigés → appels API Discord)
- Divers workflows d'alerting

**Solution:**
- Supprimer les workflows qui dépendent de Redis Streams
- Les remplacer par des workers backend (Python) qui ont accès natif à Redis
- Utiliser des endpoints API pour la communication n8n ↔ backend

### 4.2 Impossibilité d'importer des modules externes

**Problème:** n8n ne permet pas d'importer des bibliothèques npm externes dans les nodes Code.

**Impact:** Impossible d'utiliser `ioredis` ou autres clients Redis avancés.

**Tentatives échouées:**
```javascript
// ❌ Ne fonctionne pas dans n8n
const Redis = require('ioredis');
const redis = new Redis();
await redis.xadd('stream', '*', 'field', 'value');
```

### 4.3 Timeout sur les opérations longues

**Problème:** Les appels LLM peuvent dépasser le timeout par défaut (2 min).

**Solution:** Augmenter le timeout dans les nodes HTTP Request :
```json
{
  "options": {
    "timeout": 300000  // 5 minutes
  }
}
```

---

## 5. Patterns recommandés

### 5.1 Stockage clé-valeur simple

**Cas d'usage:** Stocker l'état d'un job, cache temporaire

```
✅ Utiliser le node Redis avec GET/SET
```

**Exemple - Stocker un job:**
```javascript
// Node Redis - SET
Key: job:learning:{{ $json.job_id }}
Value: {{ JSON.stringify({ status: 'pending', created_at: new Date().toISOString() }) }}
TTL: 3600
```

### 5.2 Communication événementielle

**Cas d'usage:** Publier des événements, consumer des streams

```
❌ N'utilise PAS Redis Streams depuis n8n
✅ Utilise des endpoints API backend
```

**Pattern recommandé:**
```
n8n → POST /api/events/publish → Backend → Redis Streams
```

### 5.3 Opérations avancées (Hash, Sets, etc.)

**Cas d'usage:** Stocker des structures complexes

```
❌ N'utilise PAS les opérations Hash/Set directement
✅ Sérialise en JSON et utilise GET/SET
✅ OU expose un endpoint API backend
```

**Exemple - Simuler HSET:**
```javascript
// Au lieu de HSET user:123 name "John" age 30
// Utilise SET avec JSON:
Key: user:123
Value: {"name": "John", "age": 30}
```

---

## 6. Architecture recommandée

```
┌─────────────────────────────────────────────────────────────┐
│                          n8n                                 │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Redis Node  │    │ HTTP Request│    │ HTTP Request│     │
│  │ GET/SET     │    │ POST /api   │    │ POST /api   │     │
│  │ (simple)    │    │ (events)    │    │ (streams)   │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────────────────────────────┐
│     Redis       │  │              API Backend                 │
│  (clé-valeur)   │  │                                          │
│                 │  │  ┌─────────────┐    ┌─────────────┐     │
│  job:xxx        │  │  │ Event       │    │ Stream      │     │
│  cache:xxx      │  │  │ Publisher   │    │ Consumer    │     │
│                 │  │  └──────┬──────┘    └──────┬──────┘     │
└─────────────────┘  │         │                  │            │
                     │         ▼                  ▼            │
                     │  ┌─────────────────────────────────┐    │
                     │  │     Redis (full access)          │    │
                     │  │  - Streams (XADD, XREAD, ...)    │    │
                     │  │  - Hash, Sets, Sorted Sets       │    │
                     │  │  - Pub/Sub                       │    │
                     │  └─────────────────────────────────┘    │
                     └─────────────────────────────────────────┘
```

---

## 7. Checklist avant d'utiliser Redis dans n8n

- [ ] L'opération est-elle GET, SET, DELETE, INCR, KEYS, PUSH, POP ou PUBLISH ?
  - ✅ Oui → Utilise le node Redis
  - ❌ Non → Utilise un endpoint API backend

- [ ] As-tu besoin de Redis Streams ?
  - ✅ Oui → **Obligatoirement** via API backend
  - ❌ Non → Continue

- [ ] As-tu besoin de structures complexes (Hash, Set, Sorted Set) ?
  - ✅ Oui → Sérialise en JSON ou utilise API backend
  - ❌ Non → Utilise GET/SET simple

- [ ] Le TTL est-il défini ?
  - ✅ Oui → Bien
  - ❌ Non → Ajoute un TTL pour éviter l'accumulation

---

## 8. Solution: Redis XADD Micro-Service

Depuis **mai 2026**, une solution officielle est disponible pour utiliser Redis Streams depuis n8n :

### Le micro-service Redis XADD

Un micro-service FastAPI (`services/redis_xadd_service.py`) permet à n8n d'exécuter `XADD` via HTTP Request :

```
n8n HTTP Request → Redis XADD Service (port 8765) → Redis Streams
```

**Avantages :**
- Compatible n8n 2.0 (pas besoin d'Execute Command)
- Supporte XADD avec MAXLEN
- Endpoint dédié `/tools/notify` pour MCP
- Déployable avec PM2 ou Docker

**Documentation complète :** [REDIS_XADD_SERVICE.md](./REDIS_XADD_SERVICE.md)

---

## 9. Références

- [REDIS_XADD_SERVICE.md](./REDIS_XADD_SERVICE.md) - Documentation du micro-service
- [RFC-032: Migration Redis Streams](../rfc/RFC-032-REDIS-STREAMS-MIGRATION.md)
- [RFC-033: Batch LLM Generation](../rfc/RFC-033-BATCH-LLM-GENERATION.md)
- [RFC-089/RFC-090: Skills API Architecture](../rfc/)
- [n8n Redis Node Documentation](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.redis/)
