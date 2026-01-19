# RFC-011: Mémoire Conversationnelle pour Mention Service

**Status:** Draft
**Date:** 2026-01-16
**Author:** Équipe n8n
**Version:** 2.0.0

---

## Résumé

Ajout d'une mémoire conversationnelle via Redis pour permettre au bot de se souvenir des échanges précédents avec un utilisateur. Les conversations sont identifiées par un `conversation_id` unique, permettant leur réactivation même après une longue période d'inactivité.

---

## Problème

### Problème 1 : Pas de contexte entre les messages

Actuellement, chaque mention est traitée de manière **isolée** :

```
User: @Bot Comment faire une omelette ?
Bot: Voici la recette de l'omelette... [3 œufs, sel, poivre]

User: @Bot Et si je veux la rendre plus moelleuse ?
Bot: ❌ Je ne comprends pas "la rendre plus moelleuse". De quoi parles-tu ?
```

### Problème 2 : Discord perd la mémoire rapidement

Une conversation Discord devient inactive après ~10 minutes. Avec un TTL simple (30 min), l'utilisateur ne peut pas reprendre une conversation après une pause.

**Comportement souhaité :**

```
User: @Bot Comment faire une omelette ?
Bot: Voici la recette... 🧵 [conv:abc123]

─────────── 2 heures plus tard ───────────

User: @Bot [abc123] Et si je veux la rendre plus moelleuse ?
Bot: ✅ Pour rendre ton omelette plus moelleuse, ajoute une cuillère de crème fraîche...
```

---

## Solution proposée

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          MENTION---Process-Question                              │
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Parse        │    │ Redis GET    │    │ Build LLM    │    │ Call LLM     │   │
│  │ conv_id      │───►│ Conversation │───►│ Request      │───►│ Web Search   │   │
│  └──────────────┘    └──────────────┘    │ + History    │    └──────┬───────┘   │
│                                          └──────────────┘           │           │
│                                                                     │           │
│                                                         ┌───────────▼─────────┐ │
│                                                         │ Redis SET           │ │
│                                                         │ Save messages       │ │
│                                                         │ Return conv_id      │ │
│                                                         └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Identifiant de conversation

Chaque conversation a un `conversation_id` unique :

| Champ | Format | Exemple |
|-------|--------|---------|
| `conversation_id` | nanoid (8 chars) | `abc123xy` |

**Génération :** Créé lors du premier message d'une nouvelle conversation.

**Réactivation :** L'utilisateur peut référencer un `conversation_id` pour reprendre une conversation existante.

---

## Méthodes de réactivation

| Méthode | Exemple | Détection | Avantage |
|---------|---------|-----------|----------|
| **ID dans le message** | `@Bot [abc123] suite...` | Regex `\[([a-z0-9]{6,12})\]` | Explicite, fonctionne partout |
| **Reply Discord** | Répondre au message du bot | `replied_to_bot: true` + `message_id` | Naturel, UX optimale |
| **Commande** | `/continue abc123` | Commande slash | Pour utilisateurs avancés |

### Priorité de détection

```javascript
// 1. Check reply to bot message
if (data.replied_to_bot && data.reply_message_id) {
  conv_id = await getConvIdByMessageId(data.reply_message_id);
}

// 2. Check explicit ID in message
if (!conv_id) {
  const match = data.content.match(/\[([a-z0-9]{6,12})\]/i);
  if (match) conv_id = match[1];
}

// 3. Check recent conversation (same user+channel, < 30 min)
if (!conv_id) {
  conv_id = await getRecentConversation(user_id, channel_id);
}

// 4. Create new conversation
if (!conv_id) {
  conv_id = generateNewConversationId();
}
```

---

## Stockage Redis

### Configuration

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| **Database** | `db:3` (défaut) | Isolé des autres données |
| **Configurable** | Oui | Un numéro de DB par plugin possible |
| **TTL** | 24h | Configurable par plugin |

**Note :** L'isolation par DB permet d'avoir des conversations séparées par plugin (ex: bot culinaire sur db:3, bot shopping sur db:4).

### Structure des clés

```
# Conversation principale
conv:{conversation_id}

# Index message_id → conversation_id (pour reply Discord)
msg:{message_id} → conversation_id

# Index user+channel → dernière conversation (pour continuité auto)
recent:{guild_id}:{user_id}:{channel_id} → conversation_id
```

### Structure de la conversation

```json
{
  "id": "abc123xy",
  "guild_id": "789",
  "user_id": "123",
  "channel_id": "456",
  "messages": [
    {
      "role": "user",
      "content": "Comment faire une omelette ?",
      "timestamp": "2026-01-16T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Voici la recette de l'omelette...",
      "message_id": "discord_msg_001",
      "timestamp": "2026-01-16T10:00:05Z"
    }
  ],
  "created_at": "2026-01-16T10:00:00Z",
  "updated_at": "2026-01-16T10:00:05Z"
}
```

### TTL et expiration

| Clé | TTL | Raison |
|-----|-----|--------|
| `conv:{id}` | 24h | Conversation complète |
| `msg:{id}` | 24h | Index reply, aligné sur conv |
| `recent:{...}` | 30 min | Continuité automatique courte |

---

## Workflow n8n : Modifications

### Nouveaux nodes dans MENTION---Process-Question

| Node | Type | Description |
|------|------|-------------|
| Parse Conversation ID | Code | Extrait conv_id du message ou reply |
| Redis Get Conversation | Redis | GET conv:{id} |
| Build Messages Array | Code | Formate historique + nouvelle question |
| Redis Save Conversation | Redis | SET conv:{id} avec nouveau message |
| Redis Set Message Index | Redis | SET msg:{message_id} → conv_id |
| Redis Set Recent | Redis | SET recent:{...} → conv_id |

### Configuration Redis dans n8n

```javascript
// Credentials Redis
{
  "host": "redis.example.com",
  "port": 6379,
  "database": 3,  // Configurable par plugin
  "password": "..."
}
```

### Code : Parse Conversation ID

```javascript
const input = $input.first().json;
const data = input.data;
let conversation_id = null;
let is_continuation = false;

// 1. Reply to bot message?
if (data.replied_to_bot && data.reply_message_id) {
  // Will be resolved by Redis lookup
  conversation_id = `lookup:${data.reply_message_id}`;
  is_continuation = true;
}

// 2. Explicit ID in message?
if (!conversation_id) {
  const match = (data.content || '').match(/\[([a-z0-9]{6,12})\]/i);
  if (match) {
    conversation_id = match[1];
    is_continuation = true;
    // Remove ID from content for cleaner LLM input
    data.content = data.content.replace(/\[[a-z0-9]{6,12}\]/i, '').trim();
  }
}

return {
  ...input,
  conversation_id,
  is_continuation,
  needs_lookup: conversation_id?.startsWith('lookup:')
};
```

### Code : Build Messages Array

```javascript
const history = $('Redis Get Conversation').first().json?.messages || [];
const newQuestion = $input.first().json.data.content;

// Limiter l'historique (tokens)
const recentHistory = history.slice(-6); // 3 échanges max

// Construire le tableau messages pour le LLM
const messages = recentHistory.map(msg => ({
  role: msg.role,
  content: msg.content
}));

// Ajouter la nouvelle question
messages.push({
  role: 'user',
  content: newQuestion
});

return {
  messages,
  history_length: recentHistory.length,
  is_continuation: recentHistory.length > 0
};
```

---

## Intégration avec LLM - Web Search

Le workflow `LLM - Web Search` doit accepter un paramètre `messages` (array) :

```json
{
  "query": "Et si je veux la rendre plus moelleuse ?",
  "messages": [
    { "role": "user", "content": "Comment faire une omelette ?" },
    { "role": "assistant", "content": "Voici la recette..." },
    { "role": "user", "content": "Et si je veux la rendre plus moelleuse ?" }
  ],
  "provider": "gemini",
  "google_api_key": "..."
}
```

---

## Réponse du bot

Le bot doit inclure le `conversation_id` dans sa réponse pour permettre la réactivation :

```
Pour faire une omelette, il te faut 3 œufs, du sel et du poivre...

🧵 abc123xy
```

**Format configurable :**
- Discret : `🧵 abc123xy` (en fin de message)
- Explicite : `[Pour continuer cette conversation, réponds avec [abc123xy]]`
- Invisible : Stocké en metadata Discord (si supporté par le plugin)

---

## Gestion des tokens

### Limites

| Provider | Context Window | Budget historique recommandé |
|----------|---------------|------------------------------|
| Gemini 2.5 Flash | 1M tokens | ~4000 tokens |
| Claude Haiku | 200K tokens | ~4000 tokens |
| GPT-4o-mini | 128K tokens | ~4000 tokens |

### Stratégie de troncature

```javascript
function truncateHistory(messages, maxTokens = 4000) {
  const charLimit = maxTokens * 4; // ~1 token ≈ 4 chars
  let totalChars = 0;
  const truncated = [];

  // Parcourir de la fin vers le début (garder les plus récents)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgChars = messages[i].content.length;
    if (totalChars + msgChars > charLimit) break;
    truncated.unshift(messages[i]);
    totalChars += msgChars;
  }

  return truncated;
}
```

---

## Privacy et RGPD

### Données stockées

- `user_id` : identifiant Discord (pas de PII)
- `content` : messages texte uniquement
- Pas de métadonnées personnelles

### Droits utilisateur

| Droit | Implémentation |
|-------|----------------|
| Accès | Commande `/history` (optionnel) |
| Suppression | Commande `/clear` ou `/forget` |
| Portabilité | Non applicable (pas de PII) |

### Rétention

- Max 24h de rétention par défaut
- Configurable par plugin
- Pas de backup des conversations

---

## Questions pour les équipes

### Pour chatbot-core / Plugin Discord

1. **Reply detection** : Le plugin peut-il détecter quand un utilisateur répond (reply) à un message du bot ?
   - Si oui, quels champs sont disponibles ? (`replied_to_bot`, `reply_message_id`, etc.)

2. **Message ID** : Le plugin reçoit-il le `message_id` Discord du message envoyé par le bot ?
   - Nécessaire pour l'index `msg:{message_id} → conversation_id`

3. **Affichage conversation_id** : Préférence pour l'affichage du conversation_id ?
   - Option A : En fin de message `🧵 abc123`
   - Option B : Dans un embed Discord
   - Option C : Invisible (metadata seulement)

4. **Commandes slash** : Faut-il ajouter des commandes ?
   - `/clear` : Effacer l'historique de conversation
   - `/history` : Voir l'historique (optionnel)
   - `/continue <id>` : Reprendre une conversation

### Pour l'équipe API / Infrastructure

1. **Redis DB** : Confirmation d'utiliser `db:3` pour les conversations ?
   - Possibilité d'étendre : un numéro de DB par plugin ?

2. **Configuration plugin** : Comment stocker le numéro de DB Redis par plugin ?
   - Dans la config branding ?
   - Nouveau champ dans la table plugins ?

3. **Monitoring** : Faut-il des métriques sur les conversations ?
   - Nombre de conversations actives
   - Taux de réactivation
   - Durée moyenne des conversations

### Pour l'équipe n8n

1. **LLM - Web Search** : Le workflow supporte-t-il déjà un paramètre `messages` array ?
   - Si non, modification nécessaire

2. **Credentials Redis** : Existe-t-il déjà des credentials Redis configurés dans n8n ?
   - Si oui, sur quelle DB ?

3. **Fallback** : Comportement si Redis est indisponible ?
   - Option A : Erreur
   - Option B : Continuer sans historique

---

## Plan de travail

### Phase 1 : Infrastructure Redis

- [ ] Confirmer configuration Redis (db:3 ou configurable)
- [ ] Créer credentials Redis dans n8n
- [ ] Tester connexion depuis n8n

### Phase 2 : Workflow n8n

- [ ] Ajouter node "Parse Conversation ID"
- [ ] Ajouter nodes Redis (GET/SET)
- [ ] Modifier "Build LLM Request" pour inclure historique
- [ ] Ajouter nodes pour sauvegarder messages
- [ ] Modifier réponse pour inclure conversation_id

### Phase 3 : Plugin Discord

- [ ] Passer `reply_message_id` si reply détecté
- [ ] Passer `replied_to_bot: true` si applicable
- [ ] Stocker `bot_message_id` après envoi (pour index)
- [ ] (Optionnel) Commandes `/clear`, `/history`

### Phase 4 : LLM - Web Search

- [ ] Supporter paramètre `messages` array
- [ ] Intégrer historique dans le contexte LLM

---

## Exemple de flow complet

```
1. User: "@Bot Comment faire une omelette ?"

2. n8n:
   ├─ Parse conversation_id → null (nouvelle conv)
   ├─ Generate conv_id → "abc123xy"
   ├─ Redis GET conv:abc123xy → null
   ├─ Build LLM Request: { query: "...", messages: [] }
   ├─ Call LLM → "Voici la recette..."
   ├─ Redis SET conv:abc123xy { messages: [...] }
   ├─ Redis SET recent:guild:user:channel → "abc123xy" (TTL 30min)
   └─ Return: "Voici la recette...\n\n🧵 abc123xy"

3. Bot envoie le message (message_id: "discord_001")

4. Plugin: POST callback avec bot_message_id
   └─ n8n: Redis SET msg:discord_001 → "abc123xy"

─────────── 5 minutes plus tard ───────────

5. User: "@Bot Et les assaisonnements ?"

6. n8n:
   ├─ Parse conversation_id → null
   ├─ Redis GET recent:guild:user:channel → "abc123xy"
   ├─ Redis GET conv:abc123xy → { messages: [...] }
   ├─ Build LLM Request avec historique
   └─ LLM comprend le contexte → répond correctement

─────────── 2 heures plus tard ───────────

7. User répond (reply) au message du bot

8. Plugin détecte reply:
   POST /mention { replied_to_bot: true, reply_message_id: "discord_001", ... }

9. n8n:
   ├─ Parse conversation_id → lookup:discord_001
   ├─ Redis GET msg:discord_001 → "abc123xy"
   ├─ Redis GET conv:abc123xy → { messages: [...] }
   └─ Continue la conversation
```

---

## Références

- [RFC-007: Mention Service](./RFC-007-MENTION-SERVICE.md)
- [RFC-009: Scope Classification](./RFC-009-SCOPE-CLASSIFICATION.md)

---

---

## Réponses équipe Plugin (Bot Appetit)

> **Auteur:** Équipe Plugin
> **Date:** 2026-01-16

### Réponses aux questions

#### 1. Reply detection ✅ SUPPORTÉ

Discord.py permet de détecter les replies nativement :

```python
# Dans MentionService.on_message()
replied_to_bot = False
reply_message_id = None

if message.reference and message.reference.resolved:
    replied_message = message.reference.resolved
    replied_to_bot = replied_message.author.id == bot.user.id
    reply_message_id = str(replied_message.id)
```

**Champs disponibles :**
- `message.reference` : Référence au message parent
- `message.reference.message_id` : ID du message auquel on répond
- `message.reference.resolved` : Message complet (si en cache)

#### 2. Message ID après envoi ✅ DISPONIBLE

```python
# Après envoi de la réponse
sent_message = await message.reply(response_text)
bot_message_id = str(sent_message.id)

# Peut être renvoyé via callback à n8n
await self._send_message_id_callback(conversation_id, bot_message_id)
```

**Note :** Nécessite un endpoint callback côté n8n pour recevoir le `bot_message_id`.

#### 3. Affichage conversation_id → **Option A recommandée**

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **A. `🧵 abc123`** ✅ | Discret, copiable, mobile-friendly | Visible dans le message |
| B. Embed | Séparé du contenu | Plus lourd visuellement |
| C. Invisible | UX propre | Pas de moyen de reprendre manuellement |

**Recommandation :** Option A avec format configurable :

```python
# Format par défaut
CONV_ID_FORMAT = "\n\n🧵 {conv_id}"

# Configurable via MentionConfig
conversation_id_format: str = "\n\n🧵 {conv_id}"
conversation_id_visible: bool = True
```

#### 4. Commandes slash

| Commande | Priorité | Implémentation | Notes |
|----------|----------|----------------|-------|
| `/effacer` | **P0** | ✅ Existe déjà | Étendre pour effacer conversations |
| `/continuer <id>` | **P1** | À créer | Reprendre une conversation |
| `/historique` | **P3** | Optionnel | Afficher les dernières conversations |

**Code proposé pour `/continuer` :**

```python
@bot.tree.command(name="continuer", description="Reprendre une conversation")
@app_commands.describe(conv_id="ID de conversation (ex: abc123xy)")
async def continuer_slash(interaction: discord.Interaction, conv_id: str):
    # Valider le format
    if not re.match(r'^[a-z0-9]{6,12}$', conv_id, re.IGNORECASE):
        await interaction.response.send_message(
            "❌ ID de conversation invalide. Format attendu: `abc123xy`",
            ephemeral=True
        )
        return

    # Stocker comme conversation active pour ce user/channel
    await redis_service.set(
        f"active_conv:{interaction.guild_id}:{interaction.user.id}:{interaction.channel_id}",
        conv_id,
        ttl=1800  # 30 min
    )

    await interaction.response.send_message(
        f"✅ Conversation `{conv_id}` réactivée. Tes prochains @Bot continueront cette conversation.",
        ephemeral=True
    )
```

---

### Modifications MentionService proposées

#### Nouveau payload vers n8n

```python
# mentions.py - Payload enrichi
payload = {
    # Existant
    "content": content,
    "user_id": str(message.author.id),
    "username": message.author.display_name,
    "guild_id": str(message.guild.id),
    "channel_id": str(message.channel.id),

    # NOUVEAU - RFC-011
    "replied_to_bot": replied_to_bot,
    "reply_message_id": reply_message_id,
    "message_id": str(message.id),  # ID du message utilisateur
}
```

#### Callback pour bot_message_id

**Option 1 : Callback séparé (recommandé)**

```python
async def _handle_response(self, message, response, conversation_id):
    # Envoyer la réponse
    sent_message = await message.reply(response)

    # Informer n8n du message_id
    if conversation_id and self.config.message_callback_url:
        await self._n8n_client.call_webhook(
            self.config.message_callback_url,
            data={
                "conversation_id": conversation_id,
                "bot_message_id": str(sent_message.id),
            }
        )
```

**Option 2 : Inclus dans la réponse n8n**

n8n renvoie `conversation_id` dans la réponse, le plugin l'extrait et stocke le mapping localement :

```python
# Réponse n8n
{
    "response": "Voici la recette...\n\n🧵 abc123xy",
    "conversation_id": "abc123xy"
}

# Plugin extrait et stocke
await redis_service.set(
    f"msg:{sent_message.id}",
    response_data["conversation_id"],
    ttl=86400
)
```

**Recommandation :** Option 2 pour simplicité (pas de callback supplémentaire).

---

### Impact sur MentionConfig

```python
@dataclass
class MentionConfig:
    # ... existant ...

    # RFC-011 - Mémoire conversationnelle
    memory_enabled: bool = True
    conversation_id_visible: bool = True
    conversation_id_format: str = "\n\n🧵 {conv_id}"
    memory_redis_db: int = 3  # DB séparée pour conversations
```

---

### Estimation effort côté Plugin

| Tâche | Effort | Dépendance |
|-------|--------|------------|
| Ajouter détection reply | S | - |
| Enrichir payload n8n | S | - |
| Extraire `conversation_id` de la réponse | S | n8n |
| Stocker mapping `msg:{id}` → `conv_id` | S | Redis |
| Commande `/continuer` | M | - |
| Commande `/effacer` étendue | S | Existant |
| Tests | M | - |

**Total : ~2 jours**

---

### Questions pour l'équipe n8n

1. **Format réponse** : n8n peut-il inclure `conversation_id` dans la réponse JSON ?
   ```json
   {
     "response": "Texte de la réponse...",
     "conversation_id": "abc123xy"
   }
   ```

2. **Callback ou extraction** : Préférez-vous un callback séparé pour `bot_message_id` ou que le plugin gère le mapping localement ?

3. **Redis partagé** : Le plugin utilise déjà Redis (`db:2`). Utiliser `db:3` pour les conversations ou tout centraliser ?

---

### Risques identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Redis down | Perte mémoire | Graceful degradation (continuer sans historique) |
| Conversation expirée | UX dégradée | Message clair "Conversation expirée, nouvelle créée" |
| Spam conversations | Surcharge Redis | Rate limiting existant + TTL court |
| ID collision | Rare | nanoid 8 chars = 2.8 trillion combinaisons |

---

### Prêt pour implémentation

✅ L'équipe plugin est prête à implémenter la Phase 3 dès que :
1. L'équipe n8n confirme le format de réponse (avec `conversation_id`)
2. L'équipe infra confirme Redis `db:3`

---

## Réponses équipe API / Infrastructure

> **Auteur:** Équipe API
> **Date:** 2026-01-16

### Réponses aux questions

#### 1. Redis DB → ✅ Confirmé `db:3`

Configuration Redis actuelle :

| DB | Usage | TTL |
|----|-------|-----|
| `db:0` | Cache général n8n | Variable |
| `db:2` | Branding + Cart + Sessions | Variable |
| `db:3` | **Conversations (RFC-011)** ✅ | 24h |

**Recommandation :** Garder `db:3` pour les conversations. Isolation claire des données.

#### 2. Configuration par plugin → **Option B recommandée**

| Option | Implémentation | Avantages | Inconvénients |
|--------|----------------|-----------|---------------|
| A. Champ dans `guild_branding` | `memory_redis_db: int` | Simple, existe déjà | Mélange config branding et infra |
| **B. Valeur fixe `db:3`** ✅ | Pas de config | Simplicité, standard | Moins flexible |
| C. Nouvelle table `plugin_config` | Nouvelle migration | Très flexible | Over-engineering |

**Recommandation :** Option B - Valeur fixe `db:3` pour tous les plugins.

**Justification :**
- Pas de besoin identifié pour isoler les conversations par plugin
- Les conversations sont déjà isolées par `guild_id` + `user_id`
- Simplification de l'architecture (une seule DB à monitorer)
- Évite la complexité de configuration par plugin

**Évolution future (si nécessaire) :**
```python
# guild_branding - Ajout optionnel v2
memory_redis_db = Column(Integer, nullable=True, default=3)
```

#### 3. Monitoring → **P2 (différé)**

| Métrique | Utilité | Implémentation | Priorité |
|----------|---------|----------------|----------|
| Conversations actives | Capacity planning | Redis `DBSIZE` | P2 |
| Taux réactivation | UX metric | Log n8n | P3 |
| Durée moyenne | Analytics | Calcul sur TTL | P3 |
| Mémoire Redis | Infra | `INFO memory` | P2 |

**Recommandation :** Différer le monitoring à une phase ultérieure. Priorité = livrer la fonctionnalité.

**Monitoring minimal (P0) :**
```bash
# Script de santé basique
redis-cli -n 3 DBSIZE  # Nombre de clés
redis-cli -n 3 INFO memory | grep used_memory_human
```

---

### Analyse architecture

#### Points positifs ✅

1. **Pas de stockage API** - Tout en Redis, pas de migration SQL
2. **TTL automatique** - Nettoyage natif, pas de cron job
3. **Isolation claire** - `db:3` dédié aux conversations
4. **Scalable** - Redis supporte facilement le volume prévu

#### Points d'attention ⚠️

| Point | Risque | Mitigation |
|-------|--------|------------|
| Redis SPOF | Perte conversations si Redis down | Graceful degradation (déjà prévu) |
| Pas de backup | Conversations non récupérables | Acceptable (TTL 24h, pas de PII critique) |
| Taille messages | Conversations longues = mémoire | Troncature côté n8n (déjà prévu) |

---

### Impact API

| Composant | Impact | Action |
|-----------|--------|--------|
| `guild_branding` | Aucun | - |
| Endpoints existants | Aucun | - |
| Redis infra | Config `db:3` | Déjà disponible |
| Monitoring | Optionnel | Script bash minimal |

**Conclusion : Aucun développement API requis pour la v1.**

---

### Questions pour l'équipe n8n

1. **Fallback Redis** : Confirmez-vous l'Option B (continuer sans historique) si Redis est down ?

2. **Cleanup ancien format** : Les clés `recent:{...}` expirent en 30min, mais si un user ne revient pas, la clé `conv:{id}` reste 24h. C'est acceptable ?

3. **Rate limiting** : Faut-il limiter le nombre de conversations par user ? (ex: max 10 conversations actives)

---

### Prêt pour déploiement

✅ L'équipe API confirme :
- Redis `db:3` disponible et configuré
- Aucun développement API requis
- Monitoring minimal possible via script bash

⏳ En attente de :
- Confirmation équipe n8n sur le fallback Redis
- Tests d'intégration workflow

---

## Réponses équipe n8n

> **Auteur:** Équipe n8n
> **Date:** 2026-01-16

### Réponses aux questions

#### 1. Format réponse → ✅ OUI

n8n inclura `conversation_id` dans la réponse JSON :

```json
{
  "success": true,
  "response": "Voici la recette de l'omelette...\n\n🧵 abc123xy",
  "conversation_id": "abc123xy",
  "intent": "question",
  "confidence": 0.9
}
```

**Modification requise :** Node "Format LLM Success" dans `MENTION---Process-Question`

#### 2. Callback vs extraction → **Option 2 (extraction par plugin)**

**Décision :** Le plugin gère le mapping localement.

**Justification :**
- Pas de callback supplémentaire = moins de latence
- Le plugin a déjà accès à Redis
- Simplicité d'implémentation

**Flow :**
```
n8n → { response: "...", conversation_id: "abc123xy" }
Plugin → extrait conversation_id
Plugin → Redis SET msg:{sent_message.id} → "abc123xy"
```

#### 3. Fallback Redis → ✅ Option B (continuer sans historique)

**Décision :** Si Redis est indisponible, le workflow continue sans historique.

**Implémentation :**
```javascript
// Dans "Redis Get Conversation"
try {
  const history = await redis.get(`conv:${conv_id}`);
  return { messages: history?.messages || [] };
} catch (e) {
  // Graceful degradation
  console.log('Redis unavailable, continuing without history');
  return { messages: [], redis_error: true };
}
```

**UX :** L'utilisateur ne verra pas de différence, mais le bot n'aura pas le contexte précédent.

#### 4. Cleanup conv:{id} 24h → ✅ Acceptable

**Analyse :**

| Clé | TTL | Raison |
|-----|-----|--------|
| `recent:{...}` | 30 min | Continuité automatique (même user/channel) |
| `conv:{id}` | 24h | Permet réactivation manuelle via ID ou reply |

**C'est by design :**
- `recent` = "conversation active" (courte durée)
- `conv` = "conversation archivée" (accessible si l'utilisateur a l'ID)

**Pas de problème :** Les clés `conv:{id}` orphelines seront supprimées après 24h automatiquement.

#### 5. Rate limiting → ❌ Pas nécessaire pour v1

**Justification :**
- TTL 24h = auto-cleanup
- Rate limiting existant sur le webhook `/mention`
- Pas de risque identifié de spam conversations

**Évolution future (si nécessaire) :**
```javascript
// Vérifier nombre de conversations actives
const activeCount = await redis.keys(`conv:*:${user_id}:*`).length;
if (activeCount > 10) {
  // Supprimer la plus ancienne ou refuser
}
```

#### 6. LLM - Web Search `messages` array → ❌ NON SUPPORTÉ (modification requise)

**Analyse du workflow actuel :**

Le workflow `LLM - Web Search` accepte uniquement `query` (string), pas `messages` (array).

```javascript
// Actuel - Prepare Claude Body
messages: [{
  role: "user",
  content: data.query  // ← Juste la query
}]
```

**Modification requise :**

```javascript
// Nouveau - Prepare Claude Body
const messages = data.messages || [{ role: "user", content: data.query }];

// Si historique fourni, l'utiliser
body.messages = messages;
```

**Impact :** Modification des 4 nodes "Prepare X Body" (OpenAI, Claude, Gemini, Mistral)

---

### Plan de travail équipe n8n

| Tâche | Priorité | Effort | Dépendance |
|-------|----------|--------|------------|
| Créer credentials Redis (db:3) | P0 | S | - |
| Modifier LLM - Web Search pour `messages` array | P0 | M | - |
| Ajouter nodes Redis dans MENTION---Process-Question | P0 | M | Credentials |
| Générer `conversation_id` (nanoid) | P0 | S | - |
| Modifier réponse pour inclure `conversation_id` | P0 | S | - |
| Implémenter fallback Redis (graceful degradation) | P1 | S | - |
| Implémenter troncature historique | P1 | S | - |
| Tests intégration | P1 | M | Tout |

**Estimation totale :** ~3 jours

---

### Réponses aux questions des autres équipes

#### Pour le plugin (Q1, Q2, Q3)

1. ✅ Format réponse confirmé avec `conversation_id`
2. ✅ Extraction par plugin (pas de callback)
3. Redis partagé : Plugin utilise `db:2`, conversations sur `db:3` → **séparation maintenue**

#### Pour l'API (Q1, Q2, Q3)

1. ✅ Fallback = continuer sans historique
2. ✅ Cleanup acceptable (conv 24h, recent 30min)
3. ❌ Rate limiting pas nécessaire v1

---

### Prêt pour implémentation

✅ L'équipe n8n est prête à démarrer l'implémentation.

**Ordre des tâches :**
1. Modifier `LLM - Web Search` pour supporter `messages` array
2. Créer credentials Redis (db:3)
3. Modifier `MENTION---Process-Question` (nodes Redis + conversation_id)
4. Tests

---

## Historique

| Date | Version | Auteur | Modification |
|------|---------|--------|--------------|
| 2026-01-16 | 1.0.0 | Équipe n8n | Création (approche API) |
| 2026-01-16 | 2.0.0 | Équipe n8n | Refonte Redis + conversation_id |
| 2026-01-16 | 2.1.0 | Équipe Plugin | Ajout réponses et propositions plugin |
| 2026-01-16 | 2.2.0 | Équipe API | Confirmation Redis db:3, analyse architecture |
| 2026-01-16 | 2.3.0 | Équipe n8n | Réponses aux 6 questions, plan de travail |
