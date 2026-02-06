# RFC-030: Architecture Librairies Conversationnelles

**Statut**: Draft
**Auteur**: Équipe n8n (avec input azy.mcp)
**Date**: 2026-02-05
**Version**: 1.0.0
**Remplace**: RFC-029

---

## Résumé

Cette RFC redéfinit l'architecture conversationnelle en transformant **azy.mcp** en **librairie** plutôt qu'en service HTTP. **chatbot-core** reste une librairie Python comme il l'a toujours été. Cela simplifie l'architecture, réduit la latence, et permet une réutilisation par différents consommateurs.

---

## Motivation

### Problèmes de RFC-029

RFC-029 proposait azy.mcp comme service HTTP :

```
User → plugin → azy.mcp (HTTP) → n8n (HTTP) → LLM → retour
         │           │              │
         └───────────┴──────────────┘
              4 hops, ~1-2s latence
```

**Problèmes identifiés :**
- Latence excessive (4 network hops)
- n8n inadapté pour LLM temps réel
- Complexité opérationnelle (3 services à déployer)
- azy.mcp comme service = single point of failure

### Solution

Transformer azy.mcp en **librairie Python** importable par :
- `plugin-recipes` (Discord)
- `api-backend` (FastAPI)
- Tout futur consommateur

```
User → plugin (avec azy.mcp intégré) → LLM → retour
         │
         └── 1 hop, ~0.5s latence
```

---

## Architecture

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LIBRAIRIES                                      │
│                                                                              │
│   ┌─────────────────────────┐         ┌─────────────────────────┐           │
│   │      chatbot-core       │         │        azy.mcp          │           │
│   │      (librairie)        │         │       (librairie)       │           │
│   │                         │         │                         │           │
│   │  • Discord.py wrapper   │         │  • NLU (intentions)     │           │
│   │  • DiscordTools         │         │  • Dialog Management    │           │
│   │  • Event handlers       │         │  • NLG (réponses)       │           │
│   │  • Permissions          │         │  • Session management   │           │
│   └─────────────────────────┘         └─────────────────────────┘           │
│              │                                   │                           │
└──────────────┼───────────────────────────────────┼───────────────────────────┘
               │                                   │
               │ import                            │ import
               ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            APPLICATIONS                                      │
│                                                                              │
│   ┌─────────────────────────┐         ┌─────────────────────────┐           │
│   │    plugin-recipes       │         │     api-backend         │           │
│   │    (Discord bot)        │         │     (FastAPI)           │           │
│   │                         │         │                         │           │
│   │  from chatbot_core ...  │         │  from azy_mcp import    │           │
│   │  from azy_mcp import    │         │    ConversationManager  │           │
│   │    ConversationManager  │         │                         │           │
│   └─────────────────────────┘         └─────────────────────────┘           │
│              │                                   │                           │
└──────────────┼───────────────────────────────────┼───────────────────────────┘
               │                                   │
               │ direct call                       │ direct call
               ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SERVICES EXTERNES                                 │
│                                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│   │     LLM      │  │    Redis     │  │  PostgreSQL  │  │     n8n      │   │
│   │ (Claude API) │  │  (sessions)  │  │   (data)     │  │  (webhooks,  │   │
│   │              │  │              │  │              │  │   crons)     │   │
│   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Les 2 Librairies

### 1. chatbot-core (existant)

**Rôle** : Abstraction Discord

```python
# Ce que chatbot-core fournit
from chatbot_core import Bot, DiscordTools, MentionService
from chatbot_core.tools import DISCORD_TOOLS  # Schémas des tools

# Usage dans plugin-recipes
bot = Bot(config)
tools = DiscordTools(bot)

# Exécuter une action Discord
await tools.create_channel(guild_id="123", name="cuisine", category_id="456")
await tools.assign_role(guild_id="123", user_id="789", role_id="abc")
```

**Contenu** :
- `Bot` : Wrapper discord.py
- `DiscordTools` : Actions Discord (channels, rôles, messages)
- `MentionService` : Gestion des mentions
- `DISCORD_TOOLS` : Schémas JSON des tools disponibles

---

### 2. azy.mcp (nouveau paradigme)

**Rôle** : Intelligence conversationnelle (NLU + Dialog + NLG)

```python
# Ce que azy.mcp fournit
from azy_mcp import ConversationManager, LLMClient
from azy_mcp.nlu import IntentDetector, EntityExtractor
from azy_mcp.dialog import SessionManager, GapAnalyzer
from azy_mcp.nlg import ResponseGenerator

# Configuration
llm = LLMClient(
    provider="anthropic",
    model="claude-sonnet-4-20250514",
    api_key=os.getenv("ANTHROPIC_API_KEY")
)

session_store = RedisSessionStore(redis_url="redis://localhost:6379")

manager = ConversationManager(
    llm=llm,
    session_store=session_store,
    tools=AVAILABLE_TOOLS  # Schémas passés dynamiquement
)
```

**Contenu** :

| Module | Classe | Responsabilité |
|--------|--------|----------------|
| `azy_mcp` | `ConversationManager` | Orchestrateur principal |
| `azy_mcp.llm` | `LLMClient` | Appels LLM (Claude, OpenAI, etc.) |
| `azy_mcp.nlu` | `IntentDetector` | Détection d'intentions |
| `azy_mcp.nlu` | `EntityExtractor` | Extraction d'entités |
| `azy_mcp.dialog` | `SessionManager` | Gestion sessions multi-tour |
| `azy_mcp.dialog` | `GapAnalyzer` | Détection données manquantes |
| `azy_mcp.nlg` | `ResponseGenerator` | Génération réponses naturelles |

---

## Usage par les Applications

### plugin-recipes (Discord)

```python
# plugin_recipes/bot.py
from chatbot_core import Bot, DiscordTools, DISCORD_TOOLS
from azy_mcp import ConversationManager, LLMClient
from azy_mcp.session import RedisSessionStore

class RecipesBot:
    def __init__(self):
        # Discord
        self.bot = Bot(config)
        self.discord_tools = DiscordTools(self.bot)

        # Conversationnel
        self.conversation = ConversationManager(
            llm=LLMClient(provider="anthropic", api_key=API_KEY),
            session_store=RedisSessionStore(REDIS_URL),
            tools=[
                *DISCORD_TOOLS,           # Tools Discord
                *FORMATION_TOOLS,         # Tools métier
            ]
        )

    async def on_mention(self, message):
        """Quand le bot est mentionné."""
        # 1. Obtenir la décision conversationnelle
        result = await self.conversation.process(
            message=message.content,
            session_id=f"{message.guild.id}:{message.author.id}",
            context={
                "guild_id": str(message.guild.id),
                "user_id": str(message.author.id),
                "channel_id": str(message.channel.id),
            }
        )

        # 2. Exécuter l'action si nécessaire
        if result.action:
            if result.action.tool.startswith("mcp-discord."):
                # Action Discord → exécuter localement
                await self.discord_tools.execute(
                    result.action.tool,
                    result.action.params
                )
            elif result.action.tool.startswith("mcp-formations."):
                # Action métier → appeler API
                await self.api_client.execute(
                    result.action.tool,
                    result.action.params
                )

        # 3. Répondre à l'utilisateur
        await message.reply(result.response)
```

### api-backend (FastAPI)

```python
# api_backend/routers/chat.py
from fastapi import APIRouter, Depends
from azy_mcp import ConversationManager, LLMClient
from azy_mcp.session import RedisSessionStore

router = APIRouter()

# Conversation manager partagé
conversation = ConversationManager(
    llm=LLMClient(provider="anthropic", api_key=API_KEY),
    session_store=RedisSessionStore(REDIS_URL),
    tools=FORMATION_TOOLS  # Seulement tools métier, pas Discord
)

@router.post("/api/chat")
async def chat(request: ChatRequest, user: User = Depends(get_current_user)):
    """Endpoint conversationnel pour le web."""

    result = await conversation.process(
        message=request.message,
        session_id=f"web:{user.id}",
        context={"user_id": user.id, "channel": "web"}
    )

    # Exécuter l'action si nécessaire
    if result.action:
        action_result = await execute_action(result.action)
        result.action_result = action_result

    return ChatResponse(
        response=result.response,
        action=result.action,
        session_id=result.session_id
    )

@router.post("/api/formations")
async def create_formation(data: FormationCreate):
    """CRUD classique - pas de conversation."""
    return await formation_service.create(data)
```

---

## Flux de Données

### Discord : Conversation complète

```
User: "@bot crée un channel cuisine"
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                    plugin-recipes                        │
│                                                          │
│  1. on_mention() reçoit le message                      │
│              │                                           │
│              ▼                                           │
│  2. conversation.process(message, session_id, context)  │
│              │                                           │
│              │  ┌─────────────────────────────────┐     │
│              └─▶│         azy.mcp (lib)           │     │
│                 │                                 │     │
│                 │  NLU: intent=CREATE_CHANNEL    │     │
│                 │  Dialog: params complets?      │──────────▶ LLM (Claude)
│                 │  NLG: "Je crée #cuisine"       │◀──────────
│                 │                                 │     │
│                 │  return Decision(              │     │
│                 │    tool="mcp-discord.create",  │     │
│                 │    params={name:"cuisine"},    │     │
│                 │    response="Je crée..."       │     │
│                 │  )                             │     │
│                 └─────────────────────────────────┘     │
│              │                                           │
│              ▼                                           │
│  3. discord_tools.execute("create_channel", params)     │
│              │                                           │
│              ▼                                           │
│  4. message.reply("Je crée #cuisine")                   │
└─────────────────────────────────────────────────────────┘
              │
              ▼
User: voit "#cuisine" créé + message de confirmation
```

### Web : Chat avec assistant

```
User (web): "Quelles formations sont disponibles ?"
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                    api-backend                           │
│                                                          │
│  POST /api/chat                                         │
│              │                                           │
│              ▼                                           │
│  conversation.process(message, session_id, context)     │
│              │                                           │
│              │  ┌─────────────────────────────────┐     │
│              └─▶│         azy.mcp (lib)           │     │
│                 │                                 │     │
│                 │  NLU: intent=LIST_FORMATIONS   │     │
│                 │  Dialog: pas de params requis  │──────────▶ LLM (Claude)
│                 │  NLG: "Voici les formations"   │◀──────────
│                 │                                 │     │
│                 │  return Decision(              │     │
│                 │    tool="mcp-formations.list", │     │
│                 │    response="Voici..."         │     │
│                 │  )                             │     │
│                 └─────────────────────────────────┘     │
│              │                                           │
│              ▼                                           │
│  execute_action() → query database                      │
│              │                                           │
│              ▼                                           │
│  return ChatResponse(formations=[...], response="...")  │
└─────────────────────────────────────────────────────────┘
              │
              ▼
User (web): voit la liste des formations
```

### Web : CRUD simple (pas de conversation)

```
Admin (web): Formulaire "Nouvelle Formation"
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                    api-backend                           │
│                                                          │
│  POST /api/formations                                   │
│  {name: "Master Cuisine", date: "2026-09-01"}          │
│              │                                           │
│              ▼                                           │
│  formation_service.create(data)  ← Pas d'azy.mcp !     │
│              │                                           │
│              ▼                                           │
│  Redis: publish("formation:events:stream", event)       │
│              │                                           │
│              ▼                                           │
│  return {id: "uuid", name: "Master Cuisine", ...}       │
└─────────────────────────────────────────────────────────┘
```

---

## Rôle de n8n

**n8n reste focalisé sur l'asynchrone et le background.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              n8n - DOMAINE                                   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     WEBHOOKS EXTERNES                                │   │
│   │                                                                      │   │
│   │   Stripe ──────▶ Stripe-Webhook-Handler.json ──────▶ API            │   │
│   │   GitHub ──────▶ (futur)                                            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     JOBS PLANIFIÉS                                   │   │
│   │                                                                      │   │
│   │   Cron ────────▶ SUBSCRIPTION-Reconciliation.json ──────▶ API       │   │
│   │   Cron ────────▶ COURSE-Expiration-Cron.json ──────▶ Redis          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     NOTIFICATIONS                                    │   │
│   │                                                                      │   │
│   │   Redis ───────▶ NOTIF-Level-Up.json ──────▶ Discord DM             │   │
│   │   Redis ───────▶ NOTIF-Badge-Earned.json ──────▶ Discord DM         │   │
│   │   Redis ───────▶ NOTIF-Course-Expiring.json ──────▶ Discord DM      │   │
│   │   Redis ───────▶ ALERT-Anomaly-Detected.json ──────▶ Webhook Admin  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**n8n ne fait PAS :**
- ❌ Proxy LLM temps réel
- ❌ Middleware conversationnel
- ❌ `/webhook/llm-intent` ou `/webhook/llm-generate`

---

## Comparaison RFC-029 vs RFC-030

| Aspect | RFC-029 (Service) | RFC-030 (Librairie) |
|--------|-------------------|---------------------|
| Architecture | 4 services runtime | 3 services runtime |
| Latence conversation | ~1-2s (4 hops) | ~0.5s (1 hop) |
| n8n pour LLM | Oui (inadapté) | Non |
| azy.mcp | Service HTTP | Package Python |
| chatbot-core | Package Python | Package Python (inchangé) |
| Multi-frontend | Via HTTP | Via import |
| Déploiement | 4 containers (+DB) | 3 containers (+DB) |
| Complexité | Élevée | Modérée |

### Composants runtime

**RFC-029 (4 services + DB) :**
```
1. plugin-recipes (Discord)
2. azy.mcp (HTTP service)      ← Supprimé en RFC-030
3. n8n (LLM proxy + webhooks)
4. api-backend (FastAPI)
+ Redis + PostgreSQL
```

**RFC-030 (3 services + DB) :**
```
1. plugin-recipes (Discord + azy.mcp lib)
2. api-backend (FastAPI + azy.mcp lib)
3. n8n (webhooks + crons seulement)
+ Redis + PostgreSQL
```

---

## Structure des Packages

### azy.mcp (PyPI)

```
azy_mcp/
├── __init__.py
├── conversation.py      # ConversationManager
├── llm/
│   ├── __init__.py
│   ├── client.py        # LLMClient (abstraction)
│   ├── anthropic.py     # Claude provider
│   └── openai.py        # OpenAI provider
├── nlu/
│   ├── __init__.py
│   ├── intent.py        # IntentDetector
│   └── entities.py      # EntityExtractor
├── dialog/
│   ├── __init__.py
│   ├── session.py       # SessionManager
│   ├── state.py         # OrchestrationState
│   └── gap.py           # GapAnalyzer
├── nlg/
│   ├── __init__.py
│   └── generator.py     # ResponseGenerator
└── session/
    ├── __init__.py
    ├── base.py          # SessionStore (abstract)
    ├── redis.py         # RedisSessionStore
    └── memory.py        # InMemorySessionStore (tests)
```

### chatbot-core (PyPI)

```
chatbot_core/
├── __init__.py
├── bot.py               # Bot wrapper
├── tools/
│   ├── __init__.py
│   ├── discord.py       # DiscordTools
│   └── schemas.py       # DISCORD_TOOLS (JSON schemas)
├── services/
│   ├── __init__.py
│   └── mention.py       # MentionService
└── utils/
    └── ...
```

---

## API de ConversationManager

```python
class ConversationManager:
    """Orchestrateur conversationnel principal."""

    def __init__(
        self,
        llm: LLMClient,
        session_store: SessionStore,
        tools: list[dict],  # Schémas JSON des tools disponibles
        config: ConversationConfig | None = None
    ):
        self.llm = llm
        self.session_store = session_store
        self.tools = tools
        self.config = config or ConversationConfig()

        # Sous-composants
        self.intent_detector = IntentDetector(llm, tools)
        self.entity_extractor = EntityExtractor(llm)
        self.gap_analyzer = GapAnalyzer()
        self.response_generator = ResponseGenerator(llm)

    async def process(
        self,
        message: str,
        session_id: str,
        context: dict | None = None
    ) -> ConversationResult:
        """
        Traite un message et retourne la décision.

        Returns:
            ConversationResult avec:
            - response: str (texte à afficher)
            - action: Action | None (tool à exécuter)
            - session_id: str
            - needs_clarification: bool
        """
        # 1. Charger/créer session
        session = await self.session_store.get_or_create(session_id)
        session.add_message("user", message)

        # 2. NLU - Comprendre l'intention
        intent = await self.intent_detector.detect(
            message=message,
            context=context,
            history=session.history
        )

        # 3. Dialog - Vérifier données manquantes
        if intent.selected_tool:
            gaps = self.gap_analyzer.analyze(
                tool_schema=self.get_tool_schema(intent.selected_tool),
                extracted_entities=intent.entities,
                session_data=session.resolved_data
            )

            if gaps:
                # Données manquantes → clarification
                clarification = await self.response_generator.generate_clarification(
                    gaps=gaps,
                    context=context
                )
                session.pending_questions = gaps
                await self.session_store.save(session)

                return ConversationResult(
                    response=clarification,
                    action=None,
                    session_id=session_id,
                    needs_clarification=True
                )

        # 4. NLG - Générer réponse
        response = await self.response_generator.generate(
            intent=intent,
            context=context,
            session=session
        )

        # 5. Construire action si tool sélectionné
        action = None
        if intent.selected_tool and not gaps:
            action = Action(
                tool=intent.selected_tool,
                params={**session.resolved_data, **intent.entities}
            )

        # 6. Sauvegarder session
        session.add_message("assistant", response)
        await self.session_store.save(session)

        return ConversationResult(
            response=response,
            action=action,
            session_id=session_id,
            needs_clarification=False
        )
```

---

## Migration depuis RFC-029

### Ce qui change

| Composant | RFC-029 | RFC-030 |
|-----------|---------|---------|
| azy.mcp | Service HTTP autonome | Package Python |
| Appel LLM | Via n8n webhook | Direct (LLMClient) |
| Sessions | Dans azy.mcp service | RedisSessionStore |
| Tools | Importés de chatbot-core | Passés dynamiquement |

### Plan de migration

1. **Créer package azy_mcp** avec structure ci-dessus
2. **Intégrer dans plugin-recipes** comme dépendance
3. **Intégrer dans api-backend** pour `/api/chat`
4. **Supprimer** service HTTP azy.mcp
5. **Supprimer** workflows n8n `/webhook/llm-*`

---

## Questions résolues

| Question RFC-029 | Réponse RFC-030 |
|------------------|-----------------|
| Où stocker sessions ? | `RedisSessionStore` dans azy_mcp |
| n8n pour LLM ? | Non, `LLMClient` direct |
| Multi-frontend ? | Import de la même lib |
| Latence ? | Minimisée (pas de HTTP entre composants) |

---

## Changelog

| Date | Version | Modification |
|------|---------|--------------|
| 2026-02-05 | 1.0.0 | Création initiale |
