# RFC-007: Mention Service (Gestion des @Bot)

**Status:** Draft
**Date:** 2026-01-15
**Author:** Framework Team (chatbot-core)
**Version:** 0.6.27 (proposée)

---

## Résumé

Service de gestion des mentions @Bot dans les salons publics Discord, avec rate limiting intégré, délégation vers n8n pour le traitement, et support de conversations contextuelles.

---

## Problème

Actuellement, lorsqu'un utilisateur mentionne le bot (`@BotName message`) dans un salon public :

1. **Aucune gestion native** - Le framework ne gère pas les mentions @Bot
2. **Pas de rate limiting** - Risque de spam/abus
3. **Pas de contexte conversationnel** - Chaque message traité isolément
4. **Logique dupliquée** - Chaque plugin doit réimplémenter la même logique
5. **Pas de fallback** - Aucune réponse si le message ne matche aucune commande

### Cas d'usage non couverts

| Situation | Message | Comportement actuel |
|-----------|---------|---------------------|
| Question | `@Bot c'est quoi une béchamel ?` | Ignoré |
| Salutation | `@Bot bonjour !` | Ignoré |
| Mention vide | `@Bot` | Ignoré |
| Question aléatoire | `@Bot quelle heure est-il ?` | Ignoré |
| Liste ingrédients | `@Bot Appetit quelle liste d'ingrédient pour une pizza ?` | Ignoré |

> **Note:** Les interactions avec le bot se feront **uniquement** via mentions `@BotName`.
> Les slash commands (`/recette`, `/help`) restent disponibles mais la mention est le mode d'interaction principal pour les questions libres.

---

## Exemple concret

**Interaction utilisateur :**
```
User: @Bot Appetit quelle liste d'ingrédient pour une pizza ?
```

**Flow de traitement :**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ @Bot Appetit quelle liste d'ingrédient pour une pizza ?                      │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ MentionService.on_message()                                                  │
│ ├── Extraction contenu: "quelle liste d'ingrédient pour une pizza ?"        │
│ ├── Rate limit check: OK (2/5 dans la fenêtre)                              │
│ └── Typing indicator: "Bot Appetit is typing..."                            │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ POST n8n /webhook/mention                                                    │
│ {                                                                            │
│   "content": "quelle liste d'ingrédient pour une pizza ?",                  │
│   "user_id": "123456789",                                                    │
│   "guild_id": "987654321",                                                   │
│   "username": "chef_john",                                                   │
│   "display_name": "Chef John"                                                │
│ }                                                                            │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ n8n: Intent detection → "question" (confiance: 0.98)                         │
│      Router → POST /api/ai/chat                                              │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ API/LLM Response:                                                            │
│ {                                                                            │
│   "success": true,                                                           │
│   "intent": "question",                                                      │
│   "response": "Pour une pizza Margherita, il te faut :\n                    │
│                - 250g de farine\n                                            │
│                - 150ml d'eau tiède\n                                         │
│                - 7g de levure\n                                              │
│                - Sauce tomate\n                                              │
│                - Mozzarella\n                                                │
│                - Basilic frais\n\n                                           │
│                Tape /recette pizza pour la recette complète !"               │
│ }                                                                            │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Discord Reply:                                                               │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ @Chef John Pour une pizza Margherita, il te faut :                      │ │
│ │ - 250g de farine                                                        │ │
│ │ - 150ml d'eau tiède                                                     │ │
│ │ - 7g de levure                                                          │ │
│ │ - Sauce tomate                                                          │ │
│ │ - Mozzarella                                                            │ │
│ │ - Basilic frais                                                         │ │
│ │                                                                         │ │
│ │ Tape /recette pizza pour la recette complète !                          │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Solution

### Architecture

```
Discord: on_message avec @Bot
            │
            ▼
    ┌───────────────────┐
    │  MentionService   │
    │  (chatbot-core)   │
    └─────────┬─────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌─────────┐      ┌─────────────┐
│ Rate    │      │ Mention     │
│ Limiter │      │ Handler     │
│         │      │ (protocol)  │
└────┬────┘      └──────┬──────┘
     │                  │
     │    ┌─────────────┴──────────────┐
     │    │                            │
     ▼    ▼                            ▼
┌────────────────┐            ┌────────────────┐
│ Rejet (spam)   │            │ n8n Webhook    │
│ Message limite │            │ /mention       │
└────────────────┘            └───────┬────────┘
                                      │
                                      ▼
                              ┌────────────────┐
                              │ API/LLM        │
                              │ Traitement     │
                              └───────┬────────┘
                                      │
                                      ▼
                              ┌────────────────┐
                              │ Réponse        │
                              │ Discord        │
                              └────────────────┘
```

---

## Composants Framework (chatbot-core)

### 1. MentionConfig

```python
@dataclass
class MentionConfig:
    """Configuration du MentionService."""

    # Callback n8n
    callback_url: str                          # URL webhook n8n

    # Rate limiting
    rate_limit_enabled: bool = True            # Activer le rate limiting
    rate_limit_messages: int = 5               # Nombre de messages
    rate_limit_window_seconds: float = 60.0    # Par fenêtre de temps
    rate_limit_cooldown_seconds: float = 30.0  # Cooldown après limite

    # Filtrage
    enabled_guilds: list[str] | None = None    # None = tous les guilds
    allowed_channels: list[str] | None = None  # None = tous les channels
    ignored_channels: list[str] | None = None  # Channels à ignorer (ex: #bot-spam)
    ignore_bots: bool = True                   # Ignorer les bots

    # Réponses
    typing_indicator: bool = True              # Afficher "Bot is typing..."
    reply_to_message: bool = True              # Répondre au message original

    # Timeout
    timeout_seconds: float = 30.0              # Timeout pour callback n8n

    # Messages par défaut
    rate_limit_message: str | None = "Doucement ! Réessaie dans {cooldown}s."
    error_message: str | None = "Désolé, je n'ai pas pu traiter ta demande."
```

### 2. MentionContext

```python
@dataclass
class MentionContext:
    """Contexte d'une mention @Bot."""

    # Identifiants
    message_id: str
    channel_id: str
    guild_id: str
    user_id: str

    # Contenu
    content: str              # Message sans la mention
    raw_content: str          # Message complet original

    # Métadonnées
    username: str
    display_name: str
    is_reply: bool            # Le message répond-il à un autre ?
    replied_to_bot: bool      # Répond-il à un message du bot ?

    # Contexte conversationnel (optionnel)
    conversation_id: str | None = None
    previous_messages: list[dict] | None = None
```

### 3. MentionResult

```python
@dataclass
class MentionResult:
    """Résultat du traitement d'une mention."""

    success: bool
    response: str | None = None        # Texte de réponse
    embed: dict | None = None          # Embed Discord (optionnel)
    error: str | None = None

    # Métadonnées
    intent: str | None = None          # Intent détecté (greeting, question, etc.)
    confidence: float | None = None    # Score de confiance

    @classmethod
    def from_response(cls, data: dict) -> "MentionResult":
        """Créer depuis réponse n8n."""
        return cls(
            success=data.get("success", False),
            response=data.get("response"),
            embed=data.get("embed"),
            error=data.get("error"),
            intent=data.get("intent"),
            confidence=data.get("confidence"),
        )

    @classmethod
    def failure(cls, error: str) -> "MentionResult":
        """Créer un résultat d'échec."""
        return cls(success=False, error=error)
```

### 4. MentionHandler (Protocol)

```python
from typing import Protocol

class MentionHandler(Protocol):
    """Protocol pour handlers de mentions personnalisés."""

    async def handle_mention(
        self,
        context: MentionContext,
    ) -> MentionResult | None:
        """
        Traiter une mention.

        Retourne:
            - MentionResult si traité
            - None pour passer au handler suivant
        """
        ...
```

### 5. MentionService

```python
class MentionService:
    """Service de gestion des mentions @Bot."""

    def __init__(
        self,
        bot: commands.Bot,
        config: MentionConfig,
        handler: MentionHandler | None = None,
    ):
        self.bot = bot
        self.config = config
        self.handler = handler or DefaultMentionHandler(config)
        self._rate_limiter = RateLimiter(
            max_requests=config.rate_limit_messages,
            window_seconds=config.rate_limit_window_seconds,
        )

    async def on_message(self, message: discord.Message) -> MentionResult | None:
        """Handler pour on_message event."""
        # 1. Vérifications préliminaires
        if not self._should_process(message):
            return None

        # 2. Extraire le contenu sans la mention
        content = self._extract_content(message)

        # 3. Vérifier rate limit
        if self._is_rate_limited(message.author.id):
            await self._send_rate_limit_response(message)
            return MentionResult.failure("rate_limited")

        # 4. Construire le contexte
        context = await self._build_context(message, content)

        # 5. Afficher typing indicator
        if self.config.typing_indicator:
            await message.channel.typing()

        # 6. Déléguer au handler
        result = await self.handler.handle_mention(context)

        # 7. Envoyer la réponse
        if result and result.success:
            await self._send_response(message, result)
        elif result and result.error and self.config.error_message:
            await self._send_error(message)

        return result

    def _should_process(self, message: discord.Message) -> bool:
        """Vérifier si le message doit être traité."""
        # Ignorer les bots
        if self.config.ignore_bots and message.author.bot:
            return False

        # Vérifier si le bot est mentionné
        if self.bot.user not in message.mentions:
            return False

        # Vérifier guild
        if self.config.enabled_guilds:
            if str(message.guild.id) not in self.config.enabled_guilds:
                return False

        # Vérifier channels ignorés
        if self.config.ignored_channels:
            if str(message.channel.id) in self.config.ignored_channels:
                return False

        # Vérifier channels autorisés
        if self.config.allowed_channels:
            if str(message.channel.id) not in self.config.allowed_channels:
                return False

        return True
```

### 6. DefaultMentionHandler

```python
class DefaultMentionHandler:
    """Handler par défaut qui délègue à n8n."""

    def __init__(self, config: MentionConfig):
        self.config = config
        self._session: aiohttp.ClientSession | None = None

    async def handle_mention(
        self,
        context: MentionContext,
    ) -> MentionResult | None:
        """Envoyer à n8n pour traitement."""
        payload = {
            "message_id": context.message_id,
            "channel_id": context.channel_id,
            "guild_id": context.guild_id,
            "user_id": context.user_id,
            "content": context.content,
            "username": context.username,
            "display_name": context.display_name,
            "is_reply": context.is_reply,
            "replied_to_bot": context.replied_to_bot,
            "conversation_id": context.conversation_id,
        }

        try:
            async with self._get_session() as session:
                async with session.post(
                    self.config.callback_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.config.timeout_seconds),
                ) as response:
                    if response.status < 300:
                        data = await response.json()
                        return MentionResult.from_response(data)
                    else:
                        return MentionResult.failure(f"HTTP {response.status}")
        except asyncio.TimeoutError:
            return MentionResult.failure("Timeout")
        except aiohttp.ClientError as e:
            return MentionResult.failure(f"Connection error: {e}")
```

### 7. RateLimiter

```python
class RateLimiter:
    """Rate limiter simple basé sur sliding window."""

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = {}  # user_id -> timestamps

    def is_limited(self, user_id: str) -> bool:
        """Vérifier si l'utilisateur est rate limited."""
        now = time.time()

        # Nettoyer les anciennes requêtes
        if user_id in self._requests:
            self._requests[user_id] = [
                ts for ts in self._requests[user_id]
                if now - ts < self.window_seconds
            ]

        # Vérifier le nombre de requêtes
        request_count = len(self._requests.get(user_id, []))
        return request_count >= self.max_requests

    def record(self, user_id: str) -> None:
        """Enregistrer une requête."""
        if user_id not in self._requests:
            self._requests[user_id] = []
        self._requests[user_id].append(time.time())

    def get_cooldown(self, user_id: str) -> float:
        """Obtenir le temps restant avant reset."""
        if user_id not in self._requests or not self._requests[user_id]:
            return 0.0

        oldest = min(self._requests[user_id])
        remaining = self.window_seconds - (time.time() - oldest)
        return max(0.0, remaining)
```

---

## Payload n8n

### Request (chatbot-core → n8n)

```json
{
  "message_id": "123456789",
  "channel_id": "987654321",
  "guild_id": "111222333",
  "user_id": "444555666",
  "content": "c'est quoi une béchamel ?",
  "username": "john_doe",
  "display_name": "John Doe",
  "is_reply": false,
  "replied_to_bot": false,
  "conversation_id": null
}
```

### Request (n8n → API) - Avec mapping multi-tenant

> **Important:** n8n est responsable du mapping `guild_id → project_id` avant d'appeler l'API.
> Ce mapping existe déjà pour RFC-006 (Member Join Credits).

```json
{
  "project_id": "bot-appetit",
  "content": "c'est quoi une béchamel ?",
  "user_id": "444555666",
  "username": "john_doe",
  "display_name": "John Doe",
  "guild_id": "111222333",
  "channel_id": "987654321"
}
```

| Champ | Source | Responsable |
|-------|--------|-------------|
| `project_id` | Mapping `guild_id → project_id` | n8n |
| `guild_id` | Payload chatbot-core | chatbot-core |
| `content` | Message extrait | chatbot-core |
| `user_id` | Discord member ID | chatbot-core |

### Response (n8n → chatbot-core)

```json
{
  "success": true,
  "response": "La béchamel est une sauce blanche de base...",
  "intent": "question",
  "confidence": 0.95,
  "embed": null
}
```

### Réponses avec embed (optionnel)

```json
{
  "success": true,
  "response": null,
  "embed": {
    "title": "Sauce Béchamel",
    "description": "La béchamel est une sauce...",
    "color": 16753920,
    "fields": [
      {"name": "Ingrédients", "value": "- 50g beurre\n- 50g farine\n- 500ml lait"},
      {"name": "Temps", "value": "15 minutes"}
    ],
    "footer": {"text": "Recette classique"}
  },
  "intent": "question"
}
```

---

## Responsabilités par équipe

### 1. chatbot-core (Framework)

| Composant | Responsabilité |
|-----------|----------------|
| `MentionService` | Écouter on_message, filtrer mentions, rate limit |
| `MentionHandler` | Protocol pour handler personnalisé |
| `DefaultMentionHandler` | Déléguer à n8n via webhook |
| `RateLimiter` | Rate limiting en mémoire |
| `MentionConfig` | Configuration (rate limit, channels, etc.) |

### 2. n8n (Orchestration)

| Workflow | Responsabilité |
|----------|----------------|
| `MENTION---On-Mention-Handler` | Recevoir webhook, **mapper guild_id → project_id**, router vers traitement |
| `MENTION---Process-Question` | Détecter intent, appeler API/LLM avec `project_id` |
| `MENTION---Format-Response` | Formatter réponse Discord |

> **Multi-tenant:** n8n maintient le mapping `guild_id → project_id` (réutilisé depuis RFC-006).
> L'API reçoit toujours un `project_id` et ne connaît pas les `guild_id` Discord.

### 3. API (Backend)

| Endpoint | Responsabilité |
|----------|----------------|
| `POST /api/ai/chat` | Traitement LLM (question → réponse) |
| `POST /api/mention/log` | Logger les mentions (analytics) |
| `GET /api/mention/context/{user_id}` | Récupérer contexte conversation |

### 4. Plugin (Implémentation)

| Tâche | Responsabilité |
|-------|----------------|
| Configurer `MentionService` | Instancier avec config projet |
| Handler personnalisé (optionnel) | Logique métier spécifique |
| Variables d'environnement | `N8N_MENTION_WEBHOOK_URL` |

---

## Flow complet

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. User: @BotAppetit c'est quoi une béchamel ?                               │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Discord Event: on_message                                                 │
│    → MentionService.on_message()                                             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                          ┌──────────┴──────────┐
                          │ Rate limit check    │
                          └──────────┬──────────┘
                                     │
               ┌─────────────────────┼─────────────────────┐
               │ Limited             │ OK                  │
               ▼                     ▼                     │
     ┌─────────────────┐   ┌─────────────────┐            │
     │ "Doucement !    │   │ Build context   │            │
     │  Réessaie..."   │   │ → MentionContext│            │
     └─────────────────┘   └────────┬────────┘            │
                                    │                     │
                                    ▼                     │
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. POST n8n /webhook/mention                                                 │
│    payload: { content, user_id, guild_id, ... }                              │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. n8n: MENTION---On-Mention-Handler                                         │
│    - Détecter intent (question, greeting, empty, unknown)                    │
│    - Router vers traitement approprié                                        │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │ intent: question         │ intent: greeting         │
          ▼                          ▼                          │
┌─────────────────┐        ┌─────────────────┐                 │
│ POST /api/ai/   │        │ Réponse         │                 │
│ chat            │        │ prédéfinie      │                 │
│                 │        │ "Bonjour !"     │                 │
└────────┬────────┘        └────────┬────────┘                 │
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. n8n Response → chatbot-core                                               │
│    { success: true, response: "La béchamel est...", intent: "question" }     │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. MentionService._send_response()                                           │
│    → message.reply("La béchamel est...")                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Intents supportés (v1)

| Intent | Description | Traitement | Crédits |
|--------|-------------|------------|---------|
| `question` | Question sur le domaine du bot | LLM + débit crédits | Hybride (1-5) |
| `greeting` | Salutation (bonjour, salut, etc.) | Réponse prédéfinie | 0 |
| `help` | Demande d'aide | Liste commandes | 0 |
| `empty` | Mention sans contenu | Réponse guide | 0 |
| `unknown` | Non reconnu | Fallback générique | 0 |
| `out_of_scope` | Hors domaine du bot | Réponse de redirection polite | 0 |

### Exemples de détection `out_of_scope`

| Message | Intent | Réponse |
|---------|--------|---------|
| `@Bot quel temps fait-il ?` | `out_of_scope` | "Je suis spécialisé en cuisine ! Pour la météo, essaie un autre service." |
| `@Bot raconte-moi une blague` | `out_of_scope` | "Je préfère te parler de recettes ! Pose-moi une question culinaire." |
| `@Bot quelle est la capitale de la France ?` | `out_of_scope` | "Je suis Bot Appetit, ton assistant cuisine. Cette question est hors de mon domaine." |

---

## Configuration Plugin

### Variables d'environnement

```bash
# n8n webhook
N8N_MENTION_WEBHOOK_URL=http://pi6.local:5678/webhook/mention

# Rate limiting (optionnel - défauts utilisés sinon)
MENTION_RATE_LIMIT_MESSAGES=5
MENTION_RATE_LIMIT_WINDOW=60
```

### Code Plugin (bot.py)

```python
import os
from chatbot_core.services import (
    MentionConfig,
    MentionService,
)

# Configuration
mention_config = MentionConfig(
    callback_url=os.getenv("N8N_MENTION_WEBHOOK_URL", ""),

    # Rate limiting
    rate_limit_enabled=True,
    rate_limit_messages=5,
    rate_limit_window_seconds=60.0,

    # Messages personnalisés
    rate_limit_message="Doucement {name} ! Réessaie dans {cooldown}s.",
    error_message="Oups, je n'ai pas pu répondre. Réessaie !",

    # Typing indicator
    typing_indicator=True,
)

# Service
mention_service = MentionService(bot, mention_config)

# Enregistrement
@bot.event
async def on_ready():
    bot.add_listener(mention_service.on_message, "on_message")
```

### Handler personnalisé (optionnel)

```python
from chatbot_core.services import MentionHandler, MentionContext, MentionResult

class MyMentionHandler:
    """Handler personnalisé pour logique métier spécifique."""

    def __init__(self, config, n8n_handler):
        self.config = config
        self.n8n_handler = n8n_handler  # Fallback

    async def handle_mention(self, context: MentionContext) -> MentionResult | None:
        # Traitement local pour certains cas
        if context.content.lower() in ["prix", "tarif", "combien"]:
            return MentionResult(
                success=True,
                response="Consulte nos tarifs avec /prix !",
                intent="redirect",
            )

        # Déléguer au handler n8n pour le reste
        return await self.n8n_handler.handle_mention(context)

# Usage
mention_service = MentionService(
    bot=bot,
    config=mention_config,
    handler=MyMentionHandler(mention_config, DefaultMentionHandler(mention_config)),
)
```

---

## Considérations

### Rate Limiting distribué (v2)

Pour une v2 avec plusieurs instances du bot :

```python
# Utiliser Redis au lieu du rate limiter en mémoire
from chatbot_core.services.redis import RedisRateLimiter

rate_limiter = RedisRateLimiter(
    redis_url=os.getenv("REDIS_URL"),
    prefix="mention:ratelimit",
    max_requests=5,
    window_seconds=60,
)

mention_service = MentionService(
    bot=bot,
    config=mention_config,
    rate_limiter=rate_limiter,  # Injection
)
```

### Contexte conversationnel (v2)

Pour supporter les conversations multi-tours :

```python
@dataclass
class ConversationConfig:
    enabled: bool = False
    max_history: int = 5                    # Nombre de messages à garder
    context_ttl_minutes: int = 30           # Durée de vie du contexte
    storage: Literal["memory", "redis"] = "memory"
```

### Logging et Analytics (optionnel)

```python
# n8n peut logger vers l'API
POST /api/mention/log
{
    "guild_id": "...",
    "user_id": "...",
    "intent": "question",
    "response_time_ms": 1234,
    "success": true
}
```

---

## Implémentation

### Phase 1 - chatbot-core (Priorité P0)

| Tâche | Effort |
|-------|--------|
| `MentionConfig` dataclass | S |
| `MentionContext` dataclass | S |
| `MentionResult` dataclass | S |
| `RateLimiter` (mémoire) | M |
| `MentionService` | M |
| `DefaultMentionHandler` | M |
| Tests unitaires | M |
| Documentation guide | S |

### Phase 2 - n8n (Priorité P1)

| Workflow | Effort |
|----------|--------|
| Webhook `/mention` | S |
| Intent detection | M |
| Router par intent | M |
| Integration API/LLM | M |

### Phase 3 - API (Priorité P1)

| Endpoint | Effort |
|----------|--------|
| `POST /api/ai/chat` | M |
| `POST /api/mention/log` | S |

### Phase 4 - Plugin (Priorité P2)

| Tâche | Effort |
|-------|--------|
| Configuration | S |
| Handler personnalisé | S-M |
| Tests intégration | S |

---

## Exports proposés

```python
# chatbot_core/services/__init__.py
from chatbot_core.services.mention import (
    MentionConfig,
    MentionContext,
    MentionResult,
    MentionHandler,
    MentionService,
    DefaultMentionHandler,
    RateLimiter,
)
```

---

## Décisions validées

### 1. Intent Detection : LLM externe (Option B)

**Décision :** Utiliser un LLM (GPT/Claude) pour la classification des intents.

**Justification :**
- Précision supérieure aux patterns regex
- Flexibilité pour ajouter de nouveaux intents
- Compréhension du contexte et des nuances

**Logging obligatoire :** Toutes les demandes et réponses doivent être loggées par `discord_user_id` pour amélioration continue du système.

### 2. Consommation crédits : Hybride (Option C)

**Décision :** Modèle hybride avec base fixe + variable tokens + plafond.

| Opération | Base | Per 1k tokens | Max |
|-----------|------|---------------|-----|
| `recette` | 3 | 1.0 | 10 |
| `question` | 1 | 0.5 | 5 |
| `liste_ingredients` | 2 | 0.5 | 5 |
| `greeting` | 0 | 0.0 | 0 |
| `help` | 0 | 0.0 | 0 |
| `out_of_scope` | 0 | 0.0 | 0 |

**Formule :** `credits = min(base + (tokens / 1000) * rate, max)`

### 3. Workflows n8n : 3 workflows séparés

**Décision :** Architecture modulaire avec 3 workflows distincts.

| Workflow | Responsabilité |
|----------|----------------|
| `MENTION---On-Mention-Handler` | Recevoir webhook, mapper `guild_id → project_id`, router |
| `MENTION---Process-Question` | Appeler LLM pour intent detection + réponse |
| `MENTION---Format-Response` | Formatter réponse Discord (texte ou embed) |

### 4. Scope v1 : Tous les intents

**Décision :** Implémenter TOUS les intents dès la v1, incluant `out_of_scope`.

| Intent | Description | Traitement |
|--------|-------------|------------|
| `greeting` | Salutation | Réponse prédéfinie |
| `help` | Demande d'aide | Liste commandes |
| `empty` | Mention sans contenu | Guide utilisation |
| `question` | Question domaine | LLM + débit crédits |
| `unknown` | Non reconnu | Fallback générique |
| `out_of_scope` | Hors domaine du bot | Réponse de redirection polite |

---

## Logging des interactions (À COMPLÉTER)

> **Question pour les équipes :** Comment implémenter le logging des demandes/réponses ?

### Objectif

Logger chaque interaction `@Bot` pour :
1. **Amélioration continue** - Analyser les questions mal comprises
2. **Analytics** - Statistiques d'usage par user/guild
3. **Fine-tuning futur** - Dataset pour améliorer le modèle

### Données à logger

```json
{
  "id": "uuid",
  "timestamp": "2026-01-15T14:30:00Z",
  "project_id": "bot-appetit",
  "guild_id": "111222333",
  "discord_user_id": "444555666",

  "request": {
    "content": "quelle liste d'ingrédient pour une pizza ?",
    "channel_id": "987654321",
    "message_id": "123456789"
  },

  "response": {
    "intent": "question",
    "confidence": 0.95,
    "response_text": "Pour une pizza Margherita...",
    "tokens_used": 250,
    "credits_consumed": 2,
    "response_time_ms": 1500
  },

  "metadata": {
    "model": "gpt-4",
    "success": true,
    "error": null
  }
}
```

### Options de stockage

| Option | Description | Avantages | Inconvénients |
|--------|-------------|-----------|---------------|
| **A. Table PostgreSQL** | `mention_logs` dans API | Requêtable, intégré | Volume données |
| **B. Service externe** | Elasticsearch, BigQuery | Scalable, analytics | Complexité, coût |
| **C. Fichiers JSON** | Logs rotatifs | Simple | Pas requêtable |

**Question équipe API :** Quelle option recommandez-vous ?

### Endpoint proposé

```http
POST /api/mention/log
Content-Type: application/json
X-Project-ID: bot-appetit

{
  "discord_user_id": "444555666",
  "guild_id": "111222333",
  "request_content": "quelle liste d'ingrédient pour une pizza ?",
  "response_intent": "question",
  "response_text": "Pour une pizza Margherita...",
  "tokens_used": 250,
  "credits_consumed": 2,
  "response_time_ms": 1500,
  "model": "gpt-4",
  "success": true
}
```

### Table proposée (Option A)

```sql
CREATE TABLE mention_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(50) NOT NULL,
    guild_id VARCHAR(50) NOT NULL,
    discord_user_id VARCHAR(50) NOT NULL,

    -- Request
    request_content TEXT NOT NULL,
    channel_id VARCHAR(50),
    message_id VARCHAR(50),

    -- Response
    intent VARCHAR(30) NOT NULL,
    confidence FLOAT,
    response_text TEXT,
    tokens_used INTEGER,
    credits_consumed INTEGER,
    response_time_ms INTEGER,

    -- Metadata
    model VARCHAR(50),
    success BOOLEAN DEFAULT TRUE,
    error TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Index pour analytics
    CONSTRAINT idx_mention_logs_project_user
        CREATE INDEX ON mention_logs(project_id, discord_user_id)
);

-- Index pour analytics par période
CREATE INDEX idx_mention_logs_created ON mention_logs(project_id, created_at);

-- Index pour recherche par intent
CREATE INDEX idx_mention_logs_intent ON mention_logs(project_id, intent);
```

### Qui appelle le logging ?

| Option | Appelant | Moment |
|--------|----------|--------|
| **A** | n8n | Après réponse LLM, avant retour à chatbot-core |
| **B** | API | Dans `/api/ai/chat` directement |
| **C** | chatbot-core | Après réception réponse n8n |

**Recommandation :** Option A (n8n) - centralise l'orchestration.

---

## Questions ouvertes restantes

1. **Stockage logs ?** PostgreSQL, Elasticsearch, ou autre ?
   → **En attente réponse équipe API**

2. **Rétention logs ?** Combien de temps conserver les logs ?
   → **Proposition:** 90 jours, puis archivage

3. **RGPD ?** Anonymisation des données après X jours ?
   → **Proposition:** Hasher `discord_user_id` après 30 jours

4. **Rate limit pour logging ?** Logger 100% ou échantillonner ?
   → **Proposition:** 100% pour v1 (volume faible)

---

## Références

- [RFC-004b: Welcome Service](./RFC-004b-WELCOME-SERVICE.md) - Pattern provider
- [RFC-006: Member Join Credits](./RFC-006-MEMBER-JOIN-CREDITS.md) - Pattern callback n8n
- [Guide Welcome & Member Join](../guides/GUIDE-WELCOME-MEMBER-JOIN.md) - Guide plugin (WelcomeService + MemberJoinService)
