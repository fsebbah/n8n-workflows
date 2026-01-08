# Documentation n8n - Notification Discord après Stripe

## Contexte

Après un paiement Stripe réussi, n8n doit transmettre les informations nécessaires pour que le bot Discord puisse :
1. Envoyer un DM à l'utilisateur
2. Envoyer un message dans le canal d'origine
3. Créer une salle privée pour l'utilisateur

## Modifications requises

### 1. Workflow /subscribe (plugin)

Le plugin doit stocker des métadonnées supplémentaires lors de la création de la session Stripe :

```javascript
// Métadonnées à envoyer à Stripe lors du checkout
{
  "discord_user_id": "636639897767378954",
  "discord_username": "fsebbah",
  "discord_channel_id": "123456789012345678",  // NOUVEAU
  "discord_guild_id": "815368074995040286",    // NOUVEAU
  "project_id": "torah-fun",
  "plan_id": "premium"
}
```

### 2. Workflow STRIPE - Webhook Handler

Après "Call Credits API", ajouter un node HTTP pour notifier le bot :

```
HTTP Request
├── Method: POST
├── URL: {{ $env.TORAH_API_URL }}/api/discord/notify
├── Headers:
│   └── Authorization: Bearer {{ $env.N8N_API_KEY }}
└── Body: voir ci-dessous
```

### 3. Format du body à envoyer

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

## Champs requis

| Champ | Type | Description | Obligatoire |
|-------|------|-------------|-------------|
| `project_id` | string | ID du projet (torah-fun, bot-appetit) | ✅ |
| `user_id` | string | Discord user ID | ✅ |
| `username` | string | Discord username | ✅ |
| `guild_id` | string | Discord server ID | ✅ |
| `channel_id` | string | Canal où /subscribe a été utilisé | ✅ |
| `event` | string | Type d'événement | ✅ |
| `plan_id` | string | ID du plan souscrit | ✅ |
| `credits` | number | Crédits ajoutés | ❌ |
| `embed` | object | Embed par défaut | ❌ |
| `actions` | object | Actions à effectuer | ❌ |

## Events supportés

| Event | Description |
|-------|-------------|
| `checkout_completed` | Premier paiement réussi |
| `subscription_renewed` | Renouvellement mensuel |
| `subscription_cancelled` | Annulation |
| `payment_failed` | Échec de paiement |

## Actions disponibles

| Action | Description | Défaut |
|--------|-------------|--------|
| `send_dm` | Envoyer un DM à l'utilisateur | `true` |
| `send_channel_message` | Message dans le canal d'origine | `true` |
| `create_private_channel` | Créer une salle privée | `true` |

## Flux complet

```
Stripe Webhook
      │
      ▼
n8n reçoit l'événement
      │
      ├── Verify signature (Torah API)
      │
      ├── Set Credits (Torah API)
      │
      └── POST /api/discord/notify  ← NOUVEAU
              │
              ▼
        Torah API
              │
              └── XADD Redis discord:dm:{project_id}
                        │
                        ▼
                  Bot Discord (DMListener)
                        │
                        ├── DM
                        ├── Message canal
                        └── Salle privée
```

## Exemple Switch par event

Pour personnaliser les messages selon l'événement :

```
Switch Node (event_type)
├── checkout_completed → Embed "Bienvenue !"
├── subscription_renewed → Embed "Merci pour votre fidélité"
├── subscription_cancelled → Embed "À bientôt"
└── payment_failed → Embed "Problème de paiement"
```

## Variables disponibles dans n8n

| Variable | Source |
|----------|--------|
| `{{ $json.discord_user_id }}` | Metadata Stripe |
| `{{ $json.discord_username }}` | Metadata Stripe |
| `{{ $json.discord_channel_id }}` | Metadata Stripe |
| `{{ $json.discord_guild_id }}` | Metadata Stripe |
| `{{ $json.project_id }}` | Metadata Stripe |
| `{{ $json.plan_id }}` | Stripe price/product |
| `{{ $json.credits_per_month }}` | Config n8n |

## Checklist n8n

- [ ] Vérifier que le plugin envoie `channel_id` et `guild_id` dans metadata Stripe
- [ ] Ajouter node HTTP après "Call Credits API"
- [ ] Configurer le body avec tous les champs requis
- [ ] Tester avec un paiement Stripe de test

---

## État actuel du code n8n (PR #212)

### Ce qui a été implémenté

Le workflow `STRIPE - Webhook Handler` a été mis à jour (PR #212 mergée) avec :

1. **Node "HTTP Request"** ajouté après "Call Credits API"
2. **Endpoint actuel** : `POST {{ $env.TORAH_API_URL }}/api/discord/send-dm`
3. **Payload actuel** :
```json
{
  "user_id": "{{ $json.discord_user_id }}",
  "event": "{{ $json.reason }}",
  "project_id": "{{ $json.project_id }}",
  "credits": {{ $json.credits_remaining }},
  "embed": {
    "title": "Bienvenue Premium !",
    "description": "{{ $json.credits_remaining }} crédits ajoutés.",
    "color": 5763719
  }
}
```

### Champs actuellement extraits des metadata Stripe

| Champ | Extrait | Transmis |
|-------|---------|----------|
| `discord_user_id` | ✅ | ✅ |
| `project_id` | ✅ | ✅ |
| `credits_per_month` | ✅ | ✅ |
| `discord_channel_id` | ❌ | ❌ |
| `discord_guild_id` | ❌ | ❌ |
| `discord_username` | ❌ | ❌ |
| `plan_id` | ❌ | ❌ |

---

## Modifications requises (Phase 2)

### Dépendance : Équipe Plugin

**n8n ne peut pas extraire des champs qui n'existent pas dans les metadata Stripe.**

Avant toute modification n8n, les plugins doivent envoyer ces champs lors de la création du checkout :
- `discord_channel_id`
- `discord_guild_id`
- `discord_username`
- `plan_id`

### Modifications n8n une fois les plugins mis à jour

#### 1. Node "Extract & Validate"

Ajouter l'extraction des nouveaux champs :
```javascript
// Champs actuels
const projectId = metadata.project_id;
const discordUserId = metadata.discord_user_id;
const creditsPerMonth = metadata.credits_per_month || "1000";

// Nouveaux champs à extraire
const discordChannelId = metadata.discord_channel_id;
const discordGuildId = metadata.discord_guild_id;
const discordUsername = metadata.discord_username;
const planId = metadata.plan_id;
```

#### 2. Node "Process Event"

Propager les nouveaux champs dans le payload :
```javascript
payload.discord_channel_id = metadata.discord_channel_id;
payload.discord_guild_id = metadata.discord_guild_id;
payload.discord_username = metadata.discord_username;
payload.plan_id = metadata.plan_id;
```

#### 3. Node "HTTP Request"

| Aspect | Actuel | Cible |
|--------|--------|-------|
| Endpoint | `/api/discord/send-dm` | `/api/discord/notify` |
| Champs | 5 | 11 |
| Actions | Non | Oui |

Nouveau body complet :
```json
{
  "project_id": "{{ $json.project_id }}",
  "user_id": "{{ $json.discord_user_id }}",
  "username": "{{ $json.discord_username }}",
  "guild_id": "{{ $json.discord_guild_id }}",
  "channel_id": "{{ $json.discord_channel_id }}",
  "event": "{{ $json.reason }}",
  "plan_id": "{{ $json.plan_id }}",
  "credits": {{ $json.credits_remaining }},
  "embed": {
    "title": "Bienvenue Premium !",
    "description": "{{ $json.credits_remaining }} crédits ajoutés.",
    "color": 5763719
  },
  "actions": {
    "send_dm": true,
    "send_channel_message": true,
    "create_private_channel": true
  }
}
```

---

## Ordre des modifications

```
┌─────────────────────────────────────────────────────────────┐
│  1. PLUGIN  │  Ajouter metadata Stripe                      │
│             │  (channel_id, guild_id, username, plan_id)    │
├─────────────┼───────────────────────────────────────────────┤
│  2. API     │  Créer endpoint /api/discord/notify           │
│             │  Implémenter XADD vers Redis                  │
├─────────────┼───────────────────────────────────────────────┤
│  3. N8N     │  Extraire nouveaux champs                     │
│             │  Modifier HTTP Request                        │
├─────────────┼───────────────────────────────────────────────┤
│  4. BOT     │  Implémenter DMListener avec XREADGROUP       │
└─────────────┴───────────────────────────────────────────────┘
```

---

## Checklist n8n

- [x] Ajouter node HTTP après "Call Credits API" (PR #212)
- [x] Configurer le body minimal (user_id, event, credits, embed)
- [ ] **ATTENDRE** : Plugin doit ajouter metadata supplémentaires
- [ ] **ATTENDRE** : API doit exposer `/api/discord/notify`
- [ ] Extraire `channel_id`, `guild_id`, `username`, `plan_id` des metadata
- [ ] Modifier endpoint vers `/api/discord/notify`
- [ ] Ajouter objet `actions` dans le body
- [ ] Tester avec un paiement Stripe de test

---

*Document créé le 2026-01-08 - Équipe chatbot-core*
*Mis à jour le 2026-01-08 - Équipe n8n (PR #212 mergée)*
