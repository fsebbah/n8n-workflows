# Documentation API - Notification Discord après Stripe

**Date:** 2026-01-08
**Version:** 1.0
**Statut:** Spécification

---

## Contexte

Après un paiement Stripe réussi, n8n appelle l'API Torah pour notifier le bot Discord. L'API doit :
1. Valider la requête
2. Publier un message dans Redis Streams
3. Le bot Discord consomme ces messages pour envoyer DM, messages canal, et créer des salles privées

---

## Architecture

```
n8n                        API Torah                    Redis                    Bot Discord
────                       ─────────                    ─────                    ───────────
  │                            │                          │                          │
  │  POST /api/discord/notify  │                          │                          │
  │───────────────────────────▶│                          │                          │
  │                            │                          │                          │
  │                            │  XADD discord:dm:{pid}   │                          │
  │                            │─────────────────────────▶│                          │
  │                            │                          │                          │
  │         200 OK             │                          │                          │
  │◀───────────────────────────│                          │                          │
  │                            │                          │                          │
  │                            │                          │  XREADGROUP              │
  │                            │                          │◀─────────────────────────│
  │                            │                          │                          │
  │                            │                          │  Message data            │
  │                            │                          │─────────────────────────▶│
  │                            │                          │                          │
  │                            │                          │                     Send DM
  │                            │                          │                     Send Channel
  │                            │                          │                     Create Room
```

---

## Endpoint à créer

### `POST /api/discord/notify`

#### Headers requis

| Header | Valeur | Description |
|--------|--------|-------------|
| `Authorization` | `Bearer {API_KEY}` | Clé API n8n |
| `Content-Type` | `application/json` | Type de contenu |

#### Body de la requête

```json
{
  "project_id": "torah-fun",
  "user_id": "636639897767378954",
  "username": "fsebbah",
  "guild_id": "815368074995040286",
  "channel_id": "123456789012345678",
  "event": "checkout_completed",
  "plan_id": "premium",
  "credits": 1000,
  "embed": {
    "title": "Bienvenue Premium !",
    "description": "1000 crédits ajoutés.",
    "color": 5763719
  },
  "actions": {
    "send_dm": true,
    "send_channel_message": true,
    "create_private_channel": true
  }
}
```

#### Champs

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `project_id` | string | ✅ | ID du projet (torah-fun, bot-appetit) |
| `user_id` | string | ✅ | Discord user ID |
| `username` | string | ❌ | Discord username (pour logs) |
| `guild_id` | string | ✅ | Discord server ID |
| `channel_id` | string | ✅ | Canal où /subscribe a été utilisé |
| `event` | string | ✅ | Type d'événement Stripe |
| `plan_id` | string | ❌ | ID du plan souscrit |
| `credits` | number | ❌ | Crédits ajoutés |
| `embed` | object | ❌ | Embed Discord par défaut |
| `actions` | object | ❌ | Actions à effectuer (défaut: tout à true) |

#### Events supportés

| Event | Description |
|-------|-------------|
| `checkout_completed` | Premier paiement réussi |
| `renewal` | Renouvellement mensuel |
| `subscription_deleted` | Annulation |
| `payment_failed` | Échec de paiement |

#### Réponses

**Succès (200)**
```json
{
  "success": true,
  "message_id": "1704672000000-0",
  "stream": "discord:dm:torah-fun"
}
```

**Erreur validation (400)**
```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Missing required field: user_id"
  }
}
```

**Erreur auth (401)**
```json
{
  "success": false,
  "error": {
    "code": 401,
    "message": "Invalid API key"
  }
}
```

**Erreur serveur (500)**
```json
{
  "success": false,
  "error": {
    "code": 500,
    "message": "Redis connection failed"
  }
}
```

---

## Implémentation Redis

### Configuration Redis

| Paramètre | Valeur |
|-----------|--------|
| Host | `host3.local` |
| Port | `6381` |
| Database | `0` (queue DM) |
| Version | `8.4.0` |

### Pattern de stream

Un stream par projet pour permettre la scalabilité :

```
discord:dm:{project_id}
```

Exemples :
- `discord:dm:torah-fun`
- `discord:dm:bot-appetit`
- `discord:dm:recipes`

### Commande XADD

```python
import redis
import json
import time

def notify_discord(data: dict) -> str:
    r = redis.Redis(host='host3.local', port=6381, db=0)

    stream_key = f"discord:dm:{data['project_id']}"

    message = {
        'user_id': data['user_id'],
        'username': data.get('username', ''),
        'guild_id': data['guild_id'],
        'channel_id': data['channel_id'],
        'event': data['event'],
        'plan_id': data.get('plan_id', ''),
        'credits': str(data.get('credits', 0)),
        'embed': json.dumps(data.get('embed', {})),
        'actions': json.dumps(data.get('actions', {
            'send_dm': True,
            'send_channel_message': True,
            'create_private_channel': True
        })),
        'timestamp': str(int(time.time()))
    }

    message_id = r.xadd(stream_key, message)
    return message_id
```

### Structure du message dans le stream

```
XADD discord:dm:torah-fun * \
  user_id "636639897767378954" \
  username "fsebbah" \
  guild_id "815368074995040286" \
  channel_id "123456789012345678" \
  event "checkout_completed" \
  plan_id "premium" \
  credits "1000" \
  embed '{"title":"Bienvenue Premium !","description":"1000 crédits ajoutés.","color":5763719}' \
  actions '{"send_dm":true,"send_channel_message":true,"create_private_channel":true}' \
  timestamp "1704672000"
```

### Création du consumer group (à faire une seule fois)

```bash
redis-cli -h host3.local -p 6381 XGROUP CREATE discord:dm:torah-fun dm-listeners $ MKSTREAM
redis-cli -h host3.local -p 6381 XGROUP CREATE discord:dm:bot-appetit dm-listeners $ MKSTREAM
```

---

## Exemple d'implémentation (FastAPI)

```python
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import redis
import json
import time
import os

app = FastAPI()

REDIS_HOST = os.getenv('REDIS_HOST', 'host3.local')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6381))
REDIS_DB = int(os.getenv('REDIS_DM_DB', 0))
API_KEY = os.getenv('N8N_API_KEY')

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)


class Actions(BaseModel):
    send_dm: bool = True
    send_channel_message: bool = True
    create_private_channel: bool = True


class Embed(BaseModel):
    title: str
    description: str
    color: int = 5763719


class NotifyRequest(BaseModel):
    project_id: str
    user_id: str
    username: Optional[str] = None
    guild_id: str
    channel_id: str
    event: str
    plan_id: Optional[str] = None
    credits: Optional[int] = 0
    embed: Optional[Embed] = None
    actions: Optional[Actions] = Actions()


@app.post("/api/discord/notify")
async def notify_discord(
    request: NotifyRequest,
    authorization: str = Header(...)
):
    # Vérifier l'API key
    if not authorization.startswith('Bearer ') or authorization[7:] != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Construire le stream key
    stream_key = f"discord:dm:{request.project_id}"

    # Préparer le message
    message = {
        'user_id': request.user_id,
        'username': request.username or '',
        'guild_id': request.guild_id,
        'channel_id': request.channel_id,
        'event': request.event,
        'plan_id': request.plan_id or '',
        'credits': str(request.credits),
        'embed': json.dumps(request.embed.dict() if request.embed else {}),
        'actions': json.dumps(request.actions.dict()),
        'timestamp': str(int(time.time()))
    }

    try:
        # XADD vers Redis
        message_id = r.xadd(stream_key, message)

        return {
            "success": True,
            "message_id": message_id,
            "stream": stream_key
        }
    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")
```

---

## Migration depuis /api/discord/send-dm

Si l'endpoint `/api/discord/send-dm` existe déjà :

| Aspect | Ancien (`send-dm`) | Nouveau (`notify`) |
|--------|--------------------|--------------------|
| Champs | 5 | 11 |
| Actions | Non | Oui |
| Stream | `discord:dm` | `discord:dm:{project_id}` |
| Multi-projet | Non | Oui |

### Option 1 : Remplacer

Supprimer `/api/discord/send-dm` et utiliser uniquement `/api/discord/notify`.

### Option 2 : Adapter

Garder `/api/discord/send-dm` comme alias qui redirige vers `/api/discord/notify` avec des valeurs par défaut.

---

## Tests

### Test avec curl

```bash
curl -X POST http://pi6.local:3031/api/discord/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "torah-fun",
    "user_id": "636639897767378954",
    "username": "fsebbah",
    "guild_id": "815368074995040286",
    "channel_id": "123456789012345678",
    "event": "checkout_completed",
    "plan_id": "premium",
    "credits": 1000,
    "embed": {
      "title": "Test Notification",
      "description": "Ceci est un test",
      "color": 5763719
    },
    "actions": {
      "send_dm": true,
      "send_channel_message": false,
      "create_private_channel": false
    }
  }'
```

### Vérifier le stream Redis

```bash
redis-cli -h host3.local -p 6381 XRANGE discord:dm:torah-fun - + COUNT 5
```

---

## Checklist API

- [ ] Créer endpoint `POST /api/discord/notify`
- [ ] Valider les champs obligatoires
- [ ] Vérifier l'API key
- [ ] Implémenter XADD vers Redis Streams
- [ ] Pattern de stream par projet : `discord:dm:{project_id}`
- [ ] Créer les consumer groups pour chaque projet
- [ ] Retourner le message_id dans la réponse
- [ ] Logger les erreurs
- [ ] Tester avec curl
- [ ] Documenter l'API key dans les variables d'environnement

---

## Variables d'environnement requises

```env
# Redis
REDIS_HOST=host3.local
REDIS_PORT=6381
REDIS_DM_DB=0

# API Key pour n8n
N8N_API_KEY=your_api_key_here
```

---

*Document créé le 2026-01-08 - Équipe n8n*
*À destination de l'équipe API Torah*
