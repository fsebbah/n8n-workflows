# Architecture Batch Translation avec Claude Batch Poller

**Date:** 2026-05-20
**Status:** Analyse
**Composants:** Claude Batch Poller, Redis Streams, Torah Plugin

---

## Contexte

L'équipe Torah souhaite utiliser le pattern **Claude Batch Poller** existant pour la traduction de commentaires en lot. Ce document analyse la réutilisabilité du pattern et les architectures possibles.

## Pattern Claude Batch Poller - Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                    Claude Batch Poller                         │
│                                                                │
│  1. Submit Job ──► Anthropic Skills API (async)                │
│  2. Poll every 30s ──► Check status                            │
│  3. When "ended" ──► Fetch results                             │
│  4. Extract files/text ──► Publish to Redis Stream             │
│  5. Cleanup ──► Remove from pending                            │
└────────────────────────────────────────────────────────────────┘
```

**Streams Redis utilisés:**
- `llm:batches:pending` - Jobs en attente de traitement
- `llm:batches:completed` - Historique des jobs terminés
- `{redis_channel}` - Stream personnalisé pour les résultats (configurable)

---

## Options d'Architecture pour Traduction Batch

### Option A : Tout dans Claude Skills API (Simple)

Le plugin envoie tout le document dans un seul batch.

```
┌─────────────────────────────────────────────────────────────┐
│  Torah Plugin                                               │
│                                                             │
│  POST /webhook/claude/batch/submit                          │
│  {                                                          │
│    "prompt": "Traduis tous ces commentaires:\n{doc_15p}",   │
│    "metadata": {                                            │
│      "source": "torah-plugin",                              │
│      "task": "translation",                                 │
│      "document_id": "rashi-bereshit-1-5"                    │
│    },                                                       │
│    "redis_channel": "torah:translations"                    │
│  }                                                          │
│                                                             │
│  ──► Claude traite tout en un seul job                      │
│  ──► Résultat dans torah:translations                       │
└─────────────────────────────────────────────────────────────┘
```

**Avantages:**
- Simple à implémenter
- Un seul job à suivre
- Contexte unifié (cohérence terminologique)

**Inconvénients:**
- Limite de tokens (200k contexte)
- Pas de parallélisme
- Si échec = tout recommencer

---

### Option B : Parallélisation Côté Client (Recommandé)

Le plugin découpe le document et soumet plusieurs jobs en parallèle.

```
┌────────────────────────────────────────────────────────────────┐
│  Torah Plugin - Orchestrateur                                  │
│                                                                │
│  Document (15 pages) ──► Split par page/section                │
│       │                                                        │
│       ├──► Page 1  ──► POST /webhook/claude/batch/submit       │
│       │                  correlation_id: "doc-123-page-1"      │
│       ├──► Page 2  ──► POST /webhook/claude/batch/submit       │
│       │                  correlation_id: "doc-123-page-2"      │
│       │    ...                                                 │
│       └──► Page 15 ──► POST /webhook/claude/batch/submit       │
│                          correlation_id: "doc-123-page-15"     │
│                                                                │
│  Listener (torah:translations):                                │
│  - Reçoit résultats au fil de l'eau                            │
│  - Stocke avec page_number                                     │
│  - Quand 15/15 reçus → assemblage final                        │
└────────────────────────────────────────────────────────────────┘
```

**Avantages:**
- Parallélisme = temps ≈ 1 page
- Résilience (échec partiel OK)
- Pas de limite de tokens
- Réutilise le Batch Poller existant

**Inconvénients:**
- Logique d'assemblage côté plugin
- Plus de jobs à gérer (mais transparent via Redis)

---

### Option C : Workflow Dédié Translation

Créer un nouveau workflow n8n qui encapsule la logique de traduction.

```
┌────────────────────────────────────────────────────────────────┐
│  Workflow: Translation - Batch Orchestrator                    │
│                                                                │
│  Webhook: /webhook/translation/batch/submit                    │
│                                                                │
│  Input:                                                        │
│  {                                                             │
│    "document": "...",          // Texte complet                │
│    "source_lang": "he",                                        │
│    "target_lang": "fr",                                        │
│    "chunk_size": 5000,         // Caractères par chunk         │
│    "redis_channel": "torah:translations"                       │
│  }                                                             │
│                                                                │
│  Le workflow:                                                  │
│  1. Découpe le document en chunks                              │
│  2. Pour chaque chunk → appelle Claude Batch Poller            │
│  3. Agrège les résultats                                       │
│  4. Publie le document traduit complet                         │
└────────────────────────────────────────────────────────────────┘
```

**Avantages:**
- Abstraction complète pour le plugin
- Logique de découpe centralisée
- Point d'entrée unique

**Inconvénients:**
- Nouveau workflow à maintenir
- Duplique potentiellement de la logique

---

## Recommandation

**Pour la traduction de commentaires Torah → Option B**

Raisons:
1. Le Claude Batch Poller existe et fonctionne
2. La parallélisation est gérée côté plugin (flexibilité)
3. Pas de nouveau workflow à déployer/maintenir
4. Le plugin contrôle la granularité (page, section, verset)

---

## Implémentation Côté Plugin (Option B)

### 1. Soumission parallèle

```python
import asyncio
import httpx

async def submit_translation_batch(pages: list[str], doc_id: str):
    """Soumet chaque page en parallèle au Batch Poller"""

    async with httpx.AsyncClient() as client:
        tasks = []
        for i, page_text in enumerate(pages):
            payload = {
                "prompt": f"""Tu es un traducteur expert hébreu-français spécialisé
dans les textes rabbiniques. Traduis ce commentaire en français,
en préservant la structure et les termes techniques hébraïques
entre parenthèses quand nécessaire.

Texte à traduire:
{page_text}""",
                "metadata": {
                    "source": "torah-plugin",
                    "task": "translation",
                    "document_id": doc_id,
                    "page_number": i + 1,
                    "total_pages": len(pages),
                    "source_lang": "he",
                    "target_lang": "fr"
                },
                "redis_channel": "torah:translations"
            }
            tasks.append(
                client.post(
                    "http://host2.local:5678/webhook/claude/batch/submit",
                    json=payload,
                    timeout=30.0
                )
            )

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        results = []
        for i, resp in enumerate(responses):
            if isinstance(resp, Exception):
                results.append({"page": i+1, "error": str(resp)})
            else:
                results.append({"page": i+1, "batch_id": resp.json().get("batch_id")})

        return results
```

### 2. Listener Redis pour assemblage

```python
import redis.asyncio as redis
import json

async def listen_and_assemble(doc_id: str, expected_pages: int):
    """Écoute les résultats et assemble le document traduit"""

    r = redis.Redis(host='host3.local', port=6381, db=5)

    # Créer consumer group
    try:
        await r.xgroup_create("torah:translations", "assembler", mkstream=True)
    except:
        pass

    results = {}

    while len(results) < expected_pages:
        messages = await r.xreadgroup(
            groupname="assembler",
            consumername="assembler-1",
            streams={"torah:translations": ">"},
            count=10,
            block=10000
        )

        for stream, msgs in messages:
            for msg_id, data in msgs:
                # Parser les données
                metadata = json.loads(data.get(b"metadata", b"{}"))

                # Vérifier que c'est notre document
                if metadata.get("document_id") != doc_id:
                    continue

                page_num = metadata.get("page_number")
                content = json.loads(data.get(b"content", b"[]"))

                # Extraire le texte traduit
                translated_text = ""
                for block in content:
                    if block.get("type") == "text":
                        translated_text += block.get("text", "")

                results[page_num] = translated_text
                print(f"[{doc_id}] Page {page_num}/{expected_pages} reçue")

                # ACK le message
                await r.xack("torah:translations", "assembler", msg_id)

    # Assembler le document final
    final_doc = "\n\n---\n\n".join(
        results[i] for i in sorted(results.keys())
    )

    return final_doc
```

---

## Estimation de Performance

| Scénario | Pages | Temps estimé (Option A) | Temps estimé (Option B) |
|----------|-------|-------------------------|-------------------------|
| Petit doc | 5 | ~2-3 min | ~1-2 min |
| Moyen doc | 15 | ~8-10 min | ~2-3 min |
| Grand doc | 50 | ~25-30 min | ~3-5 min |

*Note: Option B bénéficie du parallélisme, le temps est dominé par la page la plus longue.*

---

## Prochaines Étapes

1. [ ] Plugin Torah implémente la soumission parallèle
2. [ ] Plugin Torah implémente le listener/assembleur
3. [ ] Tester avec un document de 15 pages
4. [ ] Ajuster le chunking si nécessaire (taille optimale)
5. [ ] Optionnel: créer workflow dédié si pattern réutilisé souvent

---

## Références

- [Claude Batch Poller Integration Guide](../guides/claude-batch-poller-integration.md)
- Workflow: `Claude - Batch Poller` (ID: r2BqdEshQyzrRO1X sur host2.local)
- Redis: host3.local:6381, DB 5
