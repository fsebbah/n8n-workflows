# Notification Discord DM après Stripe

## Contexte

Après un paiement Stripe réussi, l'utilisateur doit recevoir un DM Discord de confirmation avec ses crédits.

## Architecture actuelle

```
STRIPE Webhook
      │
      ▼
n8n "STRIPE - Webhook Handler"
      │
      ├── Verify signature (Torah API)
      ├── Set Credits (Torah API) ✓
      │
      └── Notifier l'utilisateur ❌ MANQUANT
```

## Problème

L'endpoint `/api/discord/send-dm` existe dans Torah API mais :
1. Il ne peut pas envoyer de DM directement (pas de token Discord)
2. Le bot Discord a le token mais n'est pas notifié

## Solution proposée : Redis Streams

> **Note:** Redis Streams (au lieu de Pub/Sub) pour la persistance des messages.
> Si le bot est temporairement down, les messages ne sont pas perdus.

### Flux

```
n8n ──POST──► Torah API ──XADD──► Redis Stream "discord:dm"
                                           │
                                           ▼
                                    Bot Discord (XREADGROUP)
                                           │
                                           ▼
                                    user.send(embed)
```

### Avantages

| Aspect | Bénéfice |
|--------|----------|
| Découplage | API et Bot restent indépendants |
| Performance | Async, non-bloquant |
| Persistance | Messages conservés si bot down (contrairement à Pub/Sub) |
| Replay | Peut relire l'historique si nécessaire |
| Consumer Groups | Plusieurs bots peuvent se partager la charge |
| Simplicité | Pas de token Discord dans l'API |

### Redis Streams vs Pub/Sub

| Aspect | Pub/Sub | Streams |
|--------|---------|---------|
| Persistance | ❌ Perdu si pas de listener | ✅ Persisté |
| Replay | ❌ Impossible | ✅ Historique disponible |
| Consumer groups | ❌ | ✅ Partage de charge |
| Fiabilité | ⚠️ Fire-and-forget | ✅ ACK après traitement |

## Configuration Redis

**Serveur:** `host3.local:6381`
**Version:** Redis 8.4.0 (Streams supporté depuis 5.0)

## Implémentation

### 1. Torah API - XADD (à modifier)

**Endpoint:** `POST /api/discord/send-dm`

```python
# Nouveau: Redis Streams avec XADD
import json

await redis.xadd("discord:dm", {
    "user_id": "636639897767378954",
    "event": "checkout_completed",
    "embed": json.dumps({
        "title": "Bienvenue Premium !",
        "description": "1000 crédits ajoutés à votre compte.",
        "color": 5763719
    })
})
```

### 2. Bot Discord - Consumer Group (à créer dans framework)

```python
# Initialisation du consumer group (une seule fois)
await redis.xgroup_create("discord:dm", "discord-bot", id="0", mkstream=True)

# Tâche background dans le bot
async def dm_listener():
    while True:
        # Lire les nouveaux messages
        messages = await redis.xreadgroup(
            groupname="discord-bot",
            consumername="bot-1",
            streams={"discord:dm": ">"},
            count=10,
            block=5000
        )

        for stream, entries in messages:
            for entry_id, data in entries:
                user = await bot.fetch_user(int(data["user_id"]))
                embed = discord.Embed(**json.loads(data["embed"]))
                await user.send(embed=embed)

                # ACK le message (le marquer comme traité)
                await redis.xack("discord:dm", "discord-bot", entry_id)
```

### 3. n8n - Workflow (à modifier par équipe n8n)

Ajouter un node HTTP après "Call Credits API" :

```
HTTP Request
├── Method: POST
├── URL: {{ $env.TORAH_API_URL }}/api/discord/send-dm
├── Headers:
│   └── Content-Type: application/json
└── Body:
    {
      "user_id": "{{ $json.discord_user_id }}",
      "event": "{{ $json.reason }}",
      "project_id": "{{ $json.project_id }}",
      "credits": {{ $json.credits_remaining }},
      "embed": {
        "title": "Bienvenue dans Torah Premium !",
        "description": "**{{ $json.credits_remaining }}** crédits ont été ajoutés.",
        "color": 5763719,
        "footer": { "text": "Merci pour votre soutien !" }
      }
    }
```

**Variables disponibles dans n8n :**
- `$json.discord_user_id` ✓
- `$json.project_id` ✓
- `$json.credits_remaining` ✓
- `$json.reason` (checkout_completed, renewal, subscription_deleted)

## Format du message Redis Stream

```json
{
  "user_id": "636639897767378954",
  "event": "checkout_completed",
  "project_id": "torah-fun",
  "credits": 1000,
  "embed": "{\"title\": \"Bienvenue Premium !\", \"description\": \"1000 crédits ajoutés.\", \"color\": 5763719}"
}
```

## Events supportés

| Event | Titre | Description |
|-------|-------|-------------|
| `checkout_completed` | Bienvenue Premium ! | X crédits ajoutés |
| `renewal` | Renouvellement | X crédits ajoutés |
| `subscription_deleted` | Abonnement annulé | Actif jusqu'au JJ/MM |
| `payment_failed` | Paiement échoué | Veuillez mettre à jour... |

## Scalabilité

- **200 users simultanés ?** Pas de problème
  - Redis Streams = queue persistante async
  - Bot traite ~50 DM/sec (limite Discord)
  - Consumer group = plusieurs instances peuvent se partager
  - Messages non perdus si bot restart

## Actions requises

| Équipe | Action | Priorité |
|--------|--------|----------|
| **chatbot-core** | Créer DMListener avec XREADGROUP | Haute |
| **chatbot.api** | Modifier `/api/discord/send-dm` pour XADD | Haute |
| **n8n** | Ajouter node HTTP dans workflow Stripe | Haute |
| **plugin-torah** | Activer le listener au démarrage | Moyenne |

## Réponses aux questions (équipe n8n)

1. **Le workflow peut-il être modifié ?** → Oui, on ajoute un node HTTP après "Call Credits API"
2. **Variables disponibles ?** → Oui : `discord_user_id`, `credits_remaining`, `reason`, `project_id`
3. **Templates par event ?** → Oui, possible via Switch node selon `reason`

---

*Document mis à jour le 2026-01-08 - Équipes chatbot-core & n8n*
