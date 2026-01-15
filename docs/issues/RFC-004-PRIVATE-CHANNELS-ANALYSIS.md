# RFC-004: Private Channels - Analyse d'intégration

**Status:** En cours d'analyse
**Date:** 2026-01-15
**Auteur:** Équipe n8n
**RFC Source:** [RFC-004-PRIVATE-CHANNELS.md](./RFC-004-PRIVATE-CHANNELS.md)

---

## Résumé exécutif

Ce document analyse l'intégration de RFC-004 (Private Channels Management) dans l'architecture existante. Il répond aux questions :
1. À quel moment le rattachement `user_id <-> channel_id` doit-il se faire ?
2. Quels sont les impacts pour chaque équipe ?

---

## Contexte

### Problème actuel

Le système `NotificationListener` (chatbot-core) crée des channels privés Discord mais **ne persiste pas** l'association `user_id <-> channel_id`.

**Conséquences :**
- Création de doublons si l'utilisateur déclenche plusieurs fois l'action
- Impossible de réutiliser un channel existant
- Pas de suivi d'activité des channels

### Solution RFC-004

Nouvelle table `user_private_channels` avec des endpoints API pour :
- Vérifier si un channel existe (`GET`)
- Enregistrer un nouveau channel (`POST` - upsert idempotent)
- Mettre à jour l'activité (`PATCH`)
- Désactiver un channel (`DELETE`)

---

## Architecture existante

### Service NotificationListener (Chatbot-Core)

**Fichier:** `chatbot_core/services/notification_listener.py`
**Méthode:** `_create_private_channel()` (lignes 468-580)

**Fonctionnement actuel :**
```
┌──────────┐     Redis Stream      ┌────────────────────────┐
│   n8n    │ ──────────────────►  │  NotificationListener   │
│          │  create_private_     │  _create_private_channel│
└──────────┘  channel: true       └───────────┬─────────────┘
                                              │
                                              ▼
                                       Discord API
                                    (channel créé)
                                              │
                                              ▼
                                         ❌ PERDU
                                    (pas de persistance)
```

**Configuration disponible :**
```python
listener = NotificationListener(
    bot,
    redis_url="redis://host:6379/2",
    stream_key="discord:dm:project-name",
    category_mapping={
        "premium": 123456789,
        "vip": 987654321,
    },
    plan_name_mapping={
        "premium": "chef-cuisine",
    },
    channel_name_format="{plan_name}-{username}",
)
```

---

## Contrainte architecturale

> **Tous les appels API passent par n8n.**
> Chatbot-core et les plugins ne font aucun appel direct aux endpoints API.

---

## Architecture cible

```
┌─────────────────────────────────────────────────────────────────────┐
│                              n8n                                     │
│                                                                      │
│  1. GET /api/channels/private/{user_id}                             │
│     (vérifier si channel existe)                                    │
│                    │                                                 │
│        ┌───────────┴───────────┐                                    │
│        │                       │                                    │
│      200 OK                 404 Not Found                           │
│        │                       │                                    │
│   Utiliser              2. Publier Redis Stream                     │
│   channel_id               (create_private_channel)                 │
│   existant                 + callback_url                           │
│        │                       │                                    │
│        │                       ▼                                    │
│        │            ┌─────────────────────┐                         │
│        │            │  NotificationListener│                         │
│        │            │  (crée channel)      │                         │
│        │            └──────────┬──────────┘                         │
│        │                       │                                    │
│        │            3. Callback webhook n8n                         │
│        │               avec channel_id                              │
│        │                       │                                    │
│        │            4. POST /api/channels/private                   │
│        │               (n8n enregistre)                             │
│        │                       │                                    │
│        └───────────┬───────────┘                                    │
│                    │                                                 │
│               Continuer le flow                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Réponse: À quel moment le rattachement doit-il se faire ?

Le rattachement (`POST /api/channels/private`) doit se faire **immédiatement après la création du channel Discord**, dans le workflow n8n qui reçoit le callback.

**Séquence :**
1. n8n vérifie si channel existe (`GET`)
2. Si non, n8n demande création via Redis Stream
3. NotificationListener crée le channel Discord
4. NotificationListener appelle callback n8n avec `channel_id`
5. n8n enregistre dans l'API (`POST`) ← **RATTACHEMENT ICI**
6. n8n continue le flow avec le `channel_id`

---

## Mécanisme de retour du channel_id

**Problème:** Comment n8n récupère-t-il le `channel_id` créé par NotificationListener ?

### Options analysées

| Option | Mécanisme | Complexité | Retenu |
|--------|-----------|------------|--------|
| A | Redis Stream de réponse | Moyenne | Non |
| B | Clé Redis temporaire | Simple | Non |
| **C** | **Callback webhook n8n** | **Simple** | **Oui** |
| D | Polling GET API | Non fiable | Non |

### Option retenue: Callback webhook

```
n8n                          Chatbot-Core                    n8n
 │                                │                           │
 │  Redis Stream:                 │                           │
 │  {                             │                           │
 │    create_private_channel: true│                           │
 │    callback_url: "https://..." │                           │
 │    user_id: "123"              │                           │
 │    guild_id: "456"             │                           │
 │  }  ───────────────────────────►                           │
 │                                │                           │
 │                          Créer channel                     │
 │                          Discord                           │
 │                                │                           │
 │                                │  POST callback_url        │
 │                                │  {                        │
 │                                │    channel_id: "789",     │
 │                                │    user_id: "123",        │
 │                                │    guild_id: "456"        │
 │                                │  }  ──────────────────────►
 │                                                            │
 │                                              POST /api/channels/private
 │                                              (enregistrement)
```

---

## Confirmation équipe API

L'endpoint `POST /api/channels/private` est **idempotent (upsert)** :

| Cas | HTTP Status | Response |
|-----|-------------|----------|
| Nouveau channel | 201 Created | `{ "created": true }` |
| Channel existant | 200 OK | `{ "created": false, "message": "Channel already exists" }` |

**Comportements additionnels :**
- Réactive automatiquement un channel désactivé (`is_active = true`)
- Peut être appelé plusieurs fois sans créer de doublons

---

---

## Endpoints API - Référence rapide

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/channels/private/{user_id}?guild_id=X&channel_type=Y` | Récupérer channel existant |
| `POST` | `/api/channels/private` | Créer/mettre à jour (upsert) |
| `PATCH` | `/api/channels/private/{user_id}/activity?guild_id=X&channel_type=Y` | Mettre à jour activité |
| `DELETE` | `/api/channels/private/{user_id}?guild_id=X&channel_type=Y` | Désactiver (soft delete) |
| `GET` | `/api/channels/private/by-channel/{channel_id}` | Lookup par channel_id |
| `GET` | `/api/channels/private?guild_id=X&active_only=true` | Lister channels d'une guild |

**Header requis:** `X-Project-ID: <project_id>`

---

## Format message Redis Stream

### Demande de création (n8n → Chatbot-Core)

```json
{
  "type": "notification",
  "actions": {
    "create_private_channel": true
  },
  "discord_user_id": "123456789",
  "guild_id": "987654321",
  "channel_type": "support",
  "callback_url": "https://n8n.example.com/webhook/private-channel-callback?token=xxx",
  "metadata": {
    "request_id": "uuid-xxx",
    "triggered_by": "support_command"
  }
}
```

### Callback (Chatbot-Core → n8n)

```json
{
  "success": true,
  "channel_id": "456789123",
  "discord_user_id": "123456789",
  "guild_id": "987654321",
  "channel_type": "support",
  "channel_name": "support-john-doe"
}
```

---

## Décisions prises

### 1. Sécurisation du callback webhook

**Décision :** Pas de sécurité spécifique pour la v1.
- Tout est en local (comme les autres webhooks existants)
- À revoir si besoin d'exposition externe

---

### 2. Timeout et retry du callback

**Décision :** Si le callback échoue, la création ne se fait pas.
- Pas de retry complexe à ce stade
- L'utilisateur peut réessayer

---

### 3. Channel Discord supprimé manuellement

**Problème identifié :**
Un admin peut supprimer manuellement un channel Discord. La liaison en DB existe toujours.

```
1. Admin supprime channel Discord manuellement
   → Liaison DB existe toujours (channel_id "123")

2. User clique "Support" ou /support
   → n8n GET /api/channels/private/{user} → 200 OK, channel_id "123"

3. n8n/Chatbot essaie d'utiliser channel "123"
   → ❌ Discord Error: Unknown Channel

4. User bloqué
```

**Impacts :**
| Type | Gravité | Description |
|------|---------|-------------|
| Pollution données | Mineur | Enregistrements orphelins en DB |
| **Échec fonctionnel** | **Majeur** | User ne peut pas obtenir de support |

**Solution : Gestion d'erreur dans le flow**

Quand Discord retourne "Unknown Channel" :
1. `DELETE /api/channels/private/{user}` (supprimer liaison obsolète)
2. Créer nouveau channel Discord
3. `POST /api/channels/private` (nouvelle liaison)

```
n8n utilise channel_id existant
              │
              ▼
      Discord répond
              │
      ┌───────┴───────┐
      │               │
    OK            Unknown Channel
      │               │
 Continuer      DELETE liaison API
                      │
               Créer nouveau channel
                      │
               POST nouvelle liaison
                      │
                 Continuer
```

---

### 4. Format du channel_type dans Redis

**Question ouverte pour Chatbot-Core :**
- Le `channel_type` est-il déjà présent dans le message Redis ?
- Sinon, faut-il l'ajouter ?
- Valeurs : `support`, `order`, `onboarding`, `private`

---

### 5. Mode dégradé si API indisponible

**Contrainte :** Le channel Discord DOIT être créé quoi qu'il arrive.

**Décision : Log JSONL de secours**

```
┌─────────────────────────────────────────────────────────────────────┐
│  POST /api/channels/private                                         │
│              │                                                       │
│      ┌───────┴───────┐                                              │
│      │               │                                              │
│   201/200        5xx/timeout                                        │
│   (OK)           (API down)                                         │
│      │               │                                              │
│      │         Append to log JSONL                                  │
│      │         /var/log/n8n/pending_channels.log                    │
│      │               │                                              │
│      └───────┬───────┘                                              │
│              │                                                       │
│         Continuer                                                    │
│       (channel créé)                                                │
└─────────────────────────────────────────────────────────────────────┘
```

**Format du log (`pending_channels.log`) :**
```jsonl
{"ts":"2026-01-15T10:30:00Z","project_id":"bot-appetit","guild_id":"987","user_id":"123","channel_id":"456","type":"support","name":"support-john"}
{"ts":"2026-01-15T10:35:00Z","project_id":"bot-appetit","guild_id":"987","user_id":"789","channel_id":"012","type":"order","name":"order-jane"}
```

**Récupération :** Script externe ou workflow qui parse le log et POST vers l'API quand elle est de nouveau disponible.

---

## Diagramme de séquence complet

```
┌────────┐          ┌────────┐          ┌─────────────┐          ┌────────┐
│ Plugin │          │  n8n   │          │Chatbot-Core │          │  API   │
└───┬────┘          └───┬────┘          └──────┬──────┘          └───┬────┘
    │                   │                      │                     │
    │ Trigger event     │                      │                     │
    │──────────────────►│                      │                     │
    │                   │                      │                     │
    │                   │ GET /channels/private/{user}               │
    │                   │─────────────────────────────────────────────►
    │                   │                      │                     │
    │                   │◄────────────────────────────────────────────
    │                   │ 404 Not Found        │                     │
    │                   │                      │                     │
    │                   │ Redis: create_channel│                     │
    │                   │ + callback_url       │                     │
    │                   │─────────────────────►│                     │
    │                   │                      │                     │
    │                   │                      │ Discord API         │
    │                   │                      │ create_channel      │
    │                   │                      │─────────┐           │
    │                   │                      │         │           │
    │                   │                      │◄────────┘           │
    │                   │                      │ channel_id          │
    │                   │                      │                     │
    │                   │ POST callback_url    │                     │
    │                   │◄─────────────────────│                     │
    │                   │ { channel_id }       │                     │
    │                   │                      │                     │
    │                   │ POST /channels/private                     │
    │                   │─────────────────────────────────────────────►
    │                   │                      │                     │
    │                   │◄────────────────────────────────────────────
    │                   │ 201 Created          │                     │
    │                   │                      │                     │
    │◄──────────────────│                      │                     │
    │ channel_id        │                      │                     │
    │                   │                      │                     │
```

---

## Répartition du travail par équipe

### Équipe API ✅ TERMINÉ

| # | Tâche | Status |
|---|-------|--------|
| 1 | Table `user_private_channels` | ✅ |
| 2 | Endpoints CRUD | ✅ |
| 3 | Upsert idempotent | ✅ |

**Aucune action requise.**

---

### Équipe Chatbot-Core

| # | Tâche | Description | Effort |
|---|-------|-------------|--------|
| 1 | Lire `callback_url` du message Redis | Extraire le champ du message entrant | S |
| 2 | Lire `channel_type` du message Redis | Extraire le champ (ou défaut "support") | S |
| 3 | Ajouter méthode `_send_callback()` | Client HTTP (aiohttp) pour POST vers n8n | S |
| 4 | Appeler callback après création channel | Dans `_create_private_channel()` | S |
| 5 | Répondre à la question channel_type | Le champ existe-t-il déjà dans Redis ? | - |

**Fichier à modifier :** `chatbot_core/services/notification_listener.py`

**Pseudo-code :**
```python
async def _create_private_channel(self, message_data: dict, ...):
    # Code existant: créer le channel Discord
    channel = await guild.create_text_channel(...)

    # NOUVEAU: Callback vers n8n
    callback_url = message_data.get('callback_url')
    if callback_url:
        await self._send_callback(callback_url, {
            'channel_id': str(channel.id),
            'discord_user_id': str(user.id),
            'guild_id': str(guild.id),
            'channel_type': message_data.get('channel_type', 'support'),
            'channel_name': channel.name
        })

    return channel
```

---

### Équipe n8n

| # | Workflow | Description | Effort |
|---|----------|-------------|--------|
| 1 | `CHANNELS---Private-Check-Or-Create` | GET API, si 404 → publier Redis Stream | M |
| 2 | `CHANNELS---Private-Register-Callback` | Recevoir callback, POST vers API | S |
| 3 | `CHANNELS---Private-Handle-Unknown-Channel` | Si Discord "Unknown Channel" → DELETE API + recréer | M |
| 4 | `CHANNELS---Private-Recovery` | Lire JSONL, retry POST vers API (CRON optionnel) | S |

**Détail des workflows :**

#### Workflow 1: Check-Or-Create
```
Trigger (appelé par autre workflow)
    │
    ▼
GET /api/channels/private/{user_id}?guild_id=X&channel_type=Y
    │
┌───┴───┐
│       │
200    404
│       │
│   Publish Redis Stream
│   {
│     create_private_channel: true,
│     callback_url: "https://n8n.../webhook/private-channel-callback",
│     discord_user_id, guild_id, channel_type
│   }
│       │
│   Attendre callback (ou respond "pending")
│       │
└───┬───┘
    │
Respond avec channel_id
```

#### Workflow 2: Register-Callback
```
Webhook Trigger (POST /private-channel-callback)
    │
    ▼
POST /api/channels/private
Body: { guild_id, discord_user_id, channel_id, channel_type, channel_name }
    │
┌───┴───┐
│       │
201/200  5xx (API down)
│       │
│   Append to /var/log/n8n/pending_channels.log
│       │
└───┬───┘
    │
Respond 200 OK
```

#### Workflow 3: Handle-Unknown-Channel
```
(Intégré dans le flow principal qui utilise le channel)

Utiliser channel_id
    │
    ▼
Discord répond
    │
┌───┴───┐
│       │
OK   "Unknown Channel"
│       │
│   DELETE /api/channels/private/{user}
│       │
│   Publish Redis Stream (créer nouveau)
│       │
│   POST /api/channels/private (nouvelle liaison)
│       │
└───┬───┘
    │
Continuer
```

#### Workflow 4: Recovery (optionnel, CRON)
```
Schedule Trigger (toutes les 5 min)
    │
    ▼
Lire /var/log/n8n/pending_channels.log
    │
    ▼
Pour chaque ligne:
  POST /api/channels/private
    │
┌───┴───┐
│       │
OK    Échec
│       │
Supprimer   Garder pour retry
de la ligne
```

---

### Équipe Plugin

**Aucune action requise.**

Les plugins dépendent de chatbot-core (NotificationListener) qui gère la communication avec n8n. La modification est transparente pour les plugins.

| # | Tâche | Description | Phase |
|---|-------|-------------|-------|
| 1 | Commande cleanup (optionnel) | `/admin channels cleanup` pour nettoyer inactifs | P3 |

Cette tâche est optionnelle et non bloquante.

---

## Checklist d'implémentation

### Phase 1 : Core (Bloquant)

- [ ] **Chatbot-Core:** Ajouter support `callback_url` dans `_create_private_channel()`
- [ ] **Chatbot-Core:** Répondre - `channel_type` existe-t-il déjà dans Redis ?
- [ ] **n8n:** Créer workflow `CHANNELS---Private-Check-Or-Create`
- [ ] **n8n:** Créer workflow `CHANNELS---Private-Register-Callback`

### Phase 2 : Robustesse

- [ ] **n8n:** Ajouter gestion erreur "Unknown Channel" (DELETE + recréer)
- [ ] **n8n:** Implémenter mode dégradé (log JSONL)
- [ ] **n8n:** Créer workflow recovery JSONL (optionnel)

### Phase 3 : Optionnel

- [ ] **Plugin:** Commande admin `/admin channels cleanup` (optionnel)
- [ ] **n8n:** Workflow CRON de nettoyage des channels inactifs (optionnel)

---

## Références

- [RFC-004-PRIVATE-CHANNELS.md](./RFC-004-PRIVATE-CHANNELS.md) - Spécification originale
- [RFC-001: Shopping Cart](../guides/) - Pattern de service
- [RFC-003: Branding](../guides/RFC-003-checkout-branding-multi-tenant.md) - Pattern multi-tenant
