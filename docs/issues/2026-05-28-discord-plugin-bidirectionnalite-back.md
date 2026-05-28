# Ask back/plugin — Discord plugin bidirectionnalité (chat ↔ bot)

| Champ | Valeur |
|-------|--------|
| Date | 2026-05-28 |
| Demandeur | front (Q2 audit #198) |
| Destinataires | équipe back chat.api + équipe plugin Discord |
| Lié | #198 (audit e2e), #2150 (refonte config Discord) |
| But | **Clarifier le flux retour** : comment le bot Discord reçoit-il les réponses produites par MCP/LLM pour les republier dans le canal Discord ? |

---

## 1. Contexte / ce qu'on voit côté front

Lors de l'audit e2e #198, l'agent a noté :
> *« branding.ts : Le sync est async côté backend (plugin → Discord → webhook).
> Pas de bidirectionnalité : chat envoie au plugin via quoi ? Endpoints manquants ? »*

Côté front, on observe :
- Le **front owner/admin** discute avec MCP via WS `/ws/chat` (utilisateur authentifié dans l'app web).
- Le **plugin Discord** envoie les messages utilisateur (élève) au back via webhook/REST.
- **MAIS** : on ne voit **pas explicitement** par quel canal la réponse LLM (générée par
  MCP) **revient au plugin Discord** pour être postée dans le canal/DM Discord.

C'est probablement câblé d'une manière qu'on ne voit pas depuis le front. **D'où cet ask
de clarification**, pas d'urgence technique mais important pour la cohérence du chantier
e2e #198.

## 2. Question principale

**Comment le bot Discord reçoit-il la réponse produite par MCP/LLM ?**

Trois patterns possibles, par ordre de probabilité technique :

### Option A — WebSocket persistante plugin ↔ backend

Le plugin Discord maintient une connexion WS permanente avec le backend. Le backend
pousse les réponses LLM via cette WS, le plugin les republie dans le bon canal/DM
Discord.

- **Pour** : latence faible, fiable, déjà cohérent avec `/ws/chat` du front
- **Contre** : un peu lourd côté plugin (maintenir une connexion)

### Option B — Polling queue côté plugin

Le plugin interroge périodiquement un endpoint « j'ai des réponses à publier ? » du
backend.

- **Pour** : simple côté plugin
- **Contre** : latence + charge réseau

### Option C — Webhook reverse (backend → plugin)

Le plugin expose un endpoint HTTP, le backend POST les réponses LLM dessus.

- **Pour** : efficace, naturel pour un plugin server-side
- **Contre** : nécessite un endpoint exposé côté plugin + sécurisation

## 3. Ce qu'on a besoin de savoir

1. **Quelle option est en place aujourd'hui ?** (ou si autre chose)
2. Si **rien** n'est en place → c'est un trou archi à combler avant qu'on puisse tester
   e2e #198 sur la chaîne Discord élève.
3. Si **autre chose** (ex. un mélange A+C, queue Redis, RabbitMQ…) → schéma rapide stp
4. **Endpoints exposés côté plugin Discord** : y a-t-il un endpoint que le backend
   appelle ? Si oui, l'URL et le contrat de payload.

## 4. Impact côté front

Côté front owner/admin, **aucun changement** immédiat. Mais cette clarification :
- débloque la cartographie e2e #198 (on ne testera pas la chaîne Discord en aveugle)
- éclaire le scope de **#2150** (refonte config Discord) — si le flux retour passe par un
  endpoint exposé côté plugin, ça doit être documenté dans l'UI de config
- impacte la doc compagnon que le PO veut côté Personae (pour expliquer comment un élève
  interagit avec un personae via Discord)

## 5. Pas urgent — mais bloquant pour #198 e2e

Pas de PR front en attente sur ce sujet. Question de **cohérence et compréhension** avant
de cadrer le test e2e. À répondre quand l'équipe back/plugin a le temps.

---

## 6. Réponse n8n — 2026-05-28

### Réponse courte

**Option D — Réponse HTTP synchrone via n8n** (aucune des 3 options proposées)

Le flux est **synchrone request/response**. Le plugin fait un POST vers n8n, attend la réponse, et n8n retourne le résultat LLM dans la même requête HTTP.

### Schéma du flux actuel

```
┌─────────────┐     POST (sync)      ┌─────────┐     API calls     ┌─────────────┐
│   Plugin    │ ──────────────────▶  │   n8n   │ ───────────────▶  │  Backend    │
│   Discord   │                      │ webhook │                    │  (MCP/LLM)  │
│             │ ◀──────────────────  │         │ ◀───────────────  │             │
└─────────────┘   HTTP Response      └─────────┘     Response      └─────────────┘
                  (avec réponse LLM)

         └────────────────── même requête HTTP ──────────────────┘
```

### Preuve dans le code workflow

```json
// workflows/DISCORD_-_DM_Resolve.json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "discord/dm-resolve",
    "responseMode": "responseNode"  // ← Réponse synchrone attendue
  }
}
```

Le `responseMode: "responseNode"` signifie que n8n **attend** d'avoir traversé tout le workflow jusqu'à un node `respondToWebhook` avant de répondre au client HTTP.

### Workflows concernés

| Workflow | Endpoint | Usage |
|----------|----------|-------|
| `DISCORD_-_DM_Resolve` | `POST /webhook/discord/dm-resolve` | Résolution personae DM |
| `MENTION---On-Mention-Handler` | `POST /webhook/...` | Mentions canaux |
| `DISCORD_-_Subject_Switch` | `POST /webhook/...` | Changement matière |

### Caractéristiques

| Aspect | Détail |
|--------|--------|
| **Pattern** | Request/Response synchrone (pas de WS, pas de polling, pas de webhook reverse) |
| **Latence typique** | ~2-5s (temps orchestration + LLM) |
| **Timeout plugin** | À configurer côté plugin (recommandé : 30-60s) |
| **État** | Stateless — pas de connexion persistante à maintenir |

### Pour / Contre

| ✅ Pour | ❌ Contre |
|---------|----------|
| Simple à implémenter | Bloquant pendant la génération LLM |
| Pas d'état à gérer | Timeout si LLM lent (>30s) |
| Pas de connexion persistante | Pas de streaming (réponse complète) |
| Fiable (HTTP standard) | Retry = re-exécuter toute la requête |

### Questions en suspens

| # | Question | Pour qui |
|---|----------|----------|
| 1 | Le plugin gère-t-il le timeout correctement ? (retry, message utilisateur) | plugin |
| 2 | Faut-il du streaming pour les longues réponses ? (WS ou SSE) | back + plugin |
| 3 | Le backend MCP/LLM a-t-il un timeout interne ? | back |

### Impact sur #198 (audit e2e)

Le flux est **complet et fonctionnel** pour le cas synchrone standard. La chaîne Discord élève peut être testée :

```
Élève tape message Discord
    → Plugin POST vers n8n
        → n8n orchestre (tenant, personae, LLM)
            → Backend génère réponse
        ← n8n retourne réponse
    ← Plugin reçoit réponse HTTP
← Plugin publie message Discord
```

**Pas de trou archi** — le flux retour passe par la réponse HTTP synchrone.

---

*Réponse n8n basée sur l'analyse des workflows existants. À compléter par plugin/back si d'autres mécanismes existent (ex: streaming, notifications push).*

---

## 7. Réponse plugin — 2026-05-28

### Confirmation : **Option D — HTTP synchrone (request-response)**

✅ **Accord avec n8n** — Aucune des 3 options proposées n'est en place. Le flux est **synchrone HTTP**.

### Schéma détaillé côté plugin

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUX DM ÉLÈVE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Élève envoie DM          2. Plugin POST webhook       3. n8n route  │
│  ─────────────────────       ─────────────────────────    ────────────  │
│  Discord → Plugin            Plugin → n8n                 n8n → Backend │
│                                                                         │
│  ┌─────┐    DM      ┌───────┐   HTTP POST    ┌─────┐   API call   ┌───┐│
│  │Élève│ ─────────► │Plugin │ ──────────────►│ n8n │ ───────────► │API││
│  └─────┘            │Discord│  /dm-resolve   └─────┘  /resolve-dm └───┘│
│                     └───────┘                                           │
│                          │                                        │     │
│                          │                                        │     │
│                          │  4. Réponse LLM (même connexion HTTP)  │     │
│                          │ ◄──────────────────────────────────────┘     │
│                          │                                              │
│                          ▼                                              │
│  5. Plugin publie    ┌───────┐                                          │
│     dans Discord     │Plugin │  → Discord API → DM channel             │
│                      └───────┘                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Code plugin (implémentation actuelle)

```python
# Plugin (src/services/dm_resolve_service.py)

async def resolve(self, guild_id, user_id, question):
    # Appel HTTP bloquant (attend la réponse)
    async with session.post(
        "https://n8n.example.com/webhook/discord/dm-resolve",
        json={"guild_id": guild_id, "user_id": user_id, "question": question},
        timeout=30.0,  # Timeout 30 secondes
    ) as resp:
        data = await resp.json()  # ← Réponse LLM incluse
        return ResolveDmResponse.from_dict(data)
```

### Réponses aux questions n8n §6

| # | Question n8n | Réponse plugin |
|---|--------------|----------------|
| 1 | Le plugin gère-t-il le timeout correctement ? | ✅ Oui. Timeout 30s, fallback `out_of_scope` + message user |
| 2 | Faut-il du streaming pour longues réponses ? | ❌ Non pour l'instant. Le chunking Discord suffit (2000 chars/msg) |
| 3 | Backend MCP/LLM timeout interne ? | → Question pour backend |

### Pourquoi pas les 3 options proposées ?

| Option | Raison du non-usage |
|--------|---------------------|
| A — WebSocket | Complexité inutile : le flow DM est request-response, pas stream |
| B — Polling | Latence inacceptable pour un chat |
| C — Webhook reverse | Le plugin n'expose pas d'endpoint (client HTTP uniquement) |

### Ce que le front voit vs ce qui se passe

| Côté front | Côté plugin |
|------------|-------------|
| **L'admin** discute via WS `/ws/chat` (temps réel) | **Le plugin** fait un POST HTTP et attend |
| Connexion bidirectionnelle | Connexion unidirectionnelle (plugin → n8n → backend) |
| Le backend push les réponses | Le backend retourne dans la même requête |

### Impact e2e #198

Le flux est déjà complet et testable :
- **Endpoint exposé côté plugin** : Aucun. Le plugin est client HTTP uniquement.
- **Endpoint webhook n8n** : `POST /webhook/discord/dm-resolve`
- **Endpoint backend** : `GET /api/n8n/personae/resolve-dm`

Pour tester e2e : envoyer un DM au bot et vérifier qu'il répond. Pas de configuration réseau spéciale nécessaire côté plugin.

**→ Pas de trou archi. Le flux retour passe par la même requête HTTP (synchrone).**

---

## 8. Synthèse n8n + plugin — 2026-05-28

### Consensus

| Point | Accord |
|-------|--------|
| Pattern | ✅ HTTP synchrone (Option D) |
| Pas de WebSocket | ✅ Confirmé |
| Pas de polling | ✅ Confirmé |
| Pas de webhook reverse | ✅ Confirmé |
| Flux complet | ✅ Pas de trou archi |

### Pour le front / audit e2e #198

```
Élève tape message Discord
    → Plugin POST vers n8n (attend réponse)
        → n8n orchestre (tenant, personae, LLM)
            → Backend génère réponse
        ← n8n retourne réponse
    ← Plugin reçoit réponse HTTP
← Plugin publie message Discord
```

**Latence typique** : 2-15s selon complexité (classification + génération LLM).

**Action requise** : Aucune côté plugin/n8n. Le flux est fonctionnel.
