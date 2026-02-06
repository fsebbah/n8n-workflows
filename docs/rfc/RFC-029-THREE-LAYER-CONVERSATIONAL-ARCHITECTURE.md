# RFC-029: Architecture Conversationnelle 3 Couches

**Statut**: Draft
**Auteur**: azy.mcp Team
**Date**: 2026-02-05
**Version**: 1.0.0

---

## Resume

Cette RFC definit l'implementation des 3 couches conversationnelles dans azy.mcp :

1. **NLU (Natural Language Understanding)** - Les "oreilles"
2. **Dialog Management** - La "memoire"
3. **NLG (Natural Language Generation)** - La "voix"

azy.mcp devient le **cerveau conversationnel central** qui orchestre les interactions entre les differents clients et services.

---

## Motivation

### Probleme actuel

Les interactions actuelles sont lineaires et sans memoire :

```
User: "Cree une formation"
Bot: "Quel nom ?"
User: "Master Cuisine"
Bot: "?" (contexte perdu)
```

### Solution

Une architecture conversationnelle qui :
- Comprend les intentions (NLU)
- Maintient le contexte multi-tour (Dialog)
- Genere des reponses naturelles (NLG)

---

## Architecture Globale

```
                                    CLIENTS
                    ┌────────────────────────────────────┐
                    │                                    │
              ┌─────┴─────┐                        ┌─────┴─────┐
              │  Discord  │                        │    API    │
              │(chatbot-  │                        │  Backend  │
              │  core)    │                        │ (FastAPI) │
              └─────┬─────┘                        └─────┬─────┘
                    │                                    │
                    │ POST /process                      │ POST /process
                    │ (MentionContext)                   │ (MCPRequest)
                    │                                    │
                    └──────────────┬─────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            azy.mcp                                    │
│                    (Cerveau Conversationnel)                          │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                     1. NLU (Oreilles)                           │ │
│  │  ┌─────────────────┐     ┌──────────────┐     ┌──────────────┐ │ │
│  │  │ToolEvaluatorNode│────▶│ N8nLLMClient │────▶│   n8n        │ │ │
│  │  │                 │◀────│              │◀────│ (LLM webhook)│ │ │
│  │  └─────────────────┘     └──────────────┘     └──────────────┘ │ │
│  │           │                                                     │ │
│  │           ▼                                                     │ │
│  │  ┌─────────────────┐     ┌──────────────────────────────────┐  │ │
│  │  │ EntityExtractor │     │ Tool Registry (from chatbot-core)│  │ │
│  │  └─────────────────┘     └──────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                   │                                   │
│                                   ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                  2. Dialog Management (Memoire)                 │ │
│  │  ┌───────────────────┐   ┌─────────────────┐                   │ │
│  │  │OrchestrationState │   │ GapAnalyzerNode │                   │ │
│  │  │ - session_id      │   │ "Donnees        │                   │ │
│  │  │ - conversation[]  │   │  manquantes?"   │                   │ │
│  │  │ - resolved_data{} │   └────────┬────────┘                   │ │
│  │  │ - current_phase   │            │                            │ │
│  │  └───────────────────┘            ▼                            │ │
│  │                         ┌─────────────────────┐                │ │
│  │                         │ ClarificationNode   │                │ │
│  │                         │ "Quelle date ?"     │                │ │
│  │                         └─────────────────────┘                │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                   │                                   │
│                                   ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                      3. NLG (Voix)                              │ │
│  │  ┌──────────────────┐      ┌──────────────┐                    │ │
│  │  │ResponseFormatter │      │ N8nLLMClient │                    │ │
│  │  │ - Discord format │      │ (generation) │───▶ n8n ───▶ LLM   │ │
│  │  │ - API format     │      └──────────────┘                    │ │
│  │  └──────────────────┘                                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└───────────────────────────────────┬───────────────────────────────────┘
                                    │
                                    ▼
                              MCPResponse
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
             MentionResult                    JSON Response
             (→ Discord)                      (→ API Backend)
```

---

## Flux de donnees

### Clients → azy.mcp

| Client | Appelle | Format |
|--------|---------|--------|
| chatbot-core (Discord) | POST /process | MentionContext → MCPRequest |
| API Backend | POST /process | MCPRequest |

### azy.mcp → Services

| Service | Usage | Format |
|---------|-------|--------|
| n8n | Appels LLM (intent, generation) | HTTP webhook |
| API Backend | Donnees CRUD | REST API |
| chatbot-core tools | Actions Discord | Via client retour |

```
                    ┌─────────────┐
                    │   azy.mcp   │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │     n8n     │ │ API Backend │ │ chatbot-core│
    │  (LLM)      │ │  (Data)     │ │  (Discord)  │
    └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Web Frontend

Le frontend web ne contacte **jamais** azy.mcp directement.

```
┌──────────────┐      ┌─────────────┐      ┌─────────────┐
│ Web Frontend │─────▶│ API Backend │─────▶│   azy.mcp   │
│ (React/Vue)  │      │  (FastAPI)  │      │             │
└──────────────┘      └─────────────┘      └─────────────┘
       │                     │
       │   REST API          │  Conversationnel
       │   (CRUD)            │  (si AI needed)
       ▼                     ▼
    /api/formations      POST /process
    /api/users           (MCPRequest)
```

**Exemples de flux :**

| Action Frontend | API Backend | azy.mcp ? |
|-----------------|-------------|-----------|
| Lister formations | GET /api/formations | Non (CRUD simple) |
| Creer formation (formulaire) | POST /api/formations | Non (donnees completes) |
| Chat avec assistant | POST /api/chat | Oui (conversationnel) |
| Recherche intelligente | POST /api/search | Oui (NLU needed) |

---

## Les 3 Couches en Detail

### 1. NLU (Natural Language Understanding)

**Role** : Comprendre ce que l'utilisateur veut

**Composants** :
- `ToolEvaluatorNode` : Selection du tool approprie
- `EntityExtractor` : Extraction des entites (dates, noms, etc.)
- `N8nLLMClient` : Appels LLM via n8n

**Flux** :

```python
# Input
user_message = "Je veux creer une formation Master Cuisine pour septembre"

# NLU Output
{
    "intent": "CREATE_FORMATION",
    "confidence": 0.95,
    "entities": {
        "formation_name": "Master Cuisine",
        "date_hint": "septembre"
    },
    "selected_tool": "mcp-formations.create"
}
```

**Integration n8n** :

```python
class N8nLLMClient:
    """Client pour appeler les LLM via n8n webhooks."""

    def __init__(self, base_url: str = "http://n8n:5678"):
        self.base_url = base_url

    async def analyze_intent(
        self,
        message: str,
        tools: list[dict],
        context: dict | None = None
    ) -> dict:
        """Analyse l'intention via n8n → LLM."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/webhook/llm-intent",
                json={
                    "message": message,
                    "available_tools": tools,
                    "context": context,
                }
            )
            return response.json()
```

---

### 2. Dialog Management

**Role** : Maintenir le contexte et gerer le multi-tour

**Composants** :
- `OrchestrationState` : Etat de la conversation
- `GapAnalyzerNode` : Detection des donnees manquantes
- `ClarificationNode` : Generation des questions

**OrchestrationState** :

```python
@dataclass
class OrchestrationState:
    # Session
    session_id: str
    current_phase: str  # "nlu", "clarification", "execution", "response"

    # Conversation history
    conversation_history: list[dict]  # [{role, content, timestamp}]

    # Intent & Tool
    detected_intentions: list[DetectedIntention]
    selected_tool: str | None

    # Data collection (multi-turn)
    required_fields: list[str]      # ["name", "date", "capacity"]
    resolved_data: dict[str, Any]   # {"name": "Master Cuisine"}
    pending_questions: list[dict]   # Questions a poser

    # Response
    llm_response: str | None
    error: str | None
```

**Exemple multi-tour** :

```
Turn 1:
  User: "Cree une formation"
  State: {
    intent: CREATE_FORMATION,
    required_fields: ["name", "date", "capacity"],
    resolved_data: {},
    pending_questions: ["Quel nom ?", "Quelle date ?", "Capacite ?"]
  }
  Response: "Quel nom pour cette formation ?"

Turn 2:
  User: "Master Cuisine"
  State: {
    resolved_data: {"name": "Master Cuisine"},
    pending_questions: ["Quelle date ?", "Capacite ?"]
  }
  Response: "Quelle date de debut ?"

Turn 3:
  User: "1er septembre, 20 places"
  State: {
    resolved_data: {
      "name": "Master Cuisine",
      "date": "2026-09-01",
      "capacity": 20
    },
    pending_questions: []  # Complet !
  }
  Response: "Je cree la formation Master Cuisine (20 places) debutant le 1er sept."
```

---

### 3. NLG (Natural Language Generation)

**Role** : Generer des reponses naturelles et adaptees au canal

**Composants** :
- `ResponseFormatter` : Formatage par canal (Issue #578)
- `N8nLLMClient` : Generation de texte via LLM

**ResponseFormatter** :

```python
class ResponseFormatter:
    def format(self, state: OrchestrationState, channel: Channel) -> FormattedResponse:
        if state.pending_questions:
            return self._format_clarification(state, channel)
        elif state.error:
            return self._format_error(state, channel)
        else:
            return self._format_response(state, channel)
```

**Formatage par canal** :

| Canal | Format |
|-------|--------|
| Discord | Embeds, boutons, emojis |
| API | JSON structure |
| Web | Markdown, HTML-safe |

---

## Tool Registry

Les tools viennent de **chatbot-core** (installe comme dependance).

```python
# azy.mcp importe les tools depuis chatbot-core
from chatbot_core.services import N8nClient

# Ou depuis un module dedie si disponible
# from chatbot_core.tools import DISCORD_TOOLS, FORMATION_TOOLS
```

**Tools disponibles** :

| Source | Prefix | Exemples |
|--------|--------|----------|
| chatbot-core | mcp-discord.* | create_channel, assign_role, send_message |
| API Backend | mcp-formations.* | create, list, update, delete |
| API Backend | mcp-users.* | get_profile, update_preferences |

**Structure d'un tool** :

```python
TOOL_REGISTRY = {
    "mcp-discord.create_channel": {
        "name": "mcp-discord.create_channel",
        "description": "Cree un channel Discord dans une categorie",
        "parameters": {
            "type": "object",
            "properties": {
                "guild_id": {"type": "string", "description": "ID du serveur"},
                "category_id": {"type": "string", "description": "ID de la categorie"},
                "name": {"type": "string", "description": "Nom du channel"},
                "type": {"type": "string", "enum": ["text", "voice"]}
            },
            "required": ["guild_id", "category_id", "name"]
        },
        "provider": "chatbot-core"  # Qui execute le tool
    },
    "mcp-formations.create": {
        "name": "mcp-formations.create",
        "description": "Cree une nouvelle formation",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "start_date": {"type": "string", "format": "date"},
                "capacity": {"type": "integer"}
            },
            "required": ["name", "start_date"]
        },
        "provider": "api-backend"
    }
}
```

---

## Integration avec MentionService

chatbot-core configure `MentionService` pour appeler azy.mcp :

```python
# Dans plugin-recipes ou chatbot-core config
from chatbot_core.services import MentionConfig, MentionService

config = MentionConfig(
    # azy.mcp au lieu de n8n directement
    callback_url="http://azy.mcp:8000/process",

    # Autres configs
    rate_limit_enabled=True,
    typing_indicator=True,
    memory_enabled=True,
)

service = MentionService(bot, config)
```

**Adaptation du payload** :

```python
# MentionContext → MCPRequest
class MCPRequestAdapter:
    @staticmethod
    def from_mention_context(ctx: MentionContext) -> MCPRequest:
        return MCPRequest(
            message=ctx.content,
            channel="discord",
            session_id=ctx.conversation_id,
            user_id=ctx.user_id,
            conversation_history=ctx.previous_messages,
        )
```

**Adaptation de la reponse** :

```python
# MCPResponse → MentionResult
class MentionResultAdapter:
    @staticmethod
    def from_mcp_response(resp: MCPResponse) -> MentionResult:
        return MentionResult(
            success=resp.success,
            response=resp.content,
            intent=resp.detected_intentions[0] if resp.detected_intentions else None,
            confidence=resp.confidence,
            conversation_id=resp.session_id,
            # embed si response_type == "list" ou special formatting
        )
```

---

## Composants a implementer

### Existants (deja faits)

| Composant | Issue | Status |
|-----------|-------|--------|
| OrchestrationState | - | Done |
| OrchestrationGraph | - | Done |
| GapAnalyzerNode | - | Done |
| ClarificationNode | - | Done |
| ResponseFormatter | #578 | Done |
| /process endpoint | #579 | Done |

### A creer

| Composant | Description | Priorite |
|-----------|-------------|----------|
| `N8nLLMClient` | Client HTTP pour appeler n8n/LLM | P0 |
| `ToolRegistry` | Import tools depuis chatbot-core | P0 |
| `MCPRequestAdapter` | MentionContext → MCPRequest | P1 |
| `MentionResultAdapter` | MCPResponse → MentionResult | P1 |
| Workflows n8n | `/webhook/llm-intent`, `/webhook/llm-generate` | P0 |

---

## Workflows n8n requis

### 1. Intent Analysis

```
POST /webhook/llm-intent

Request:
{
  "message": "Je veux creer une formation",
  "available_tools": [...],
  "context": {...}
}

Response:
{
  "intent": "CREATE_FORMATION",
  "confidence": 0.95,
  "selected_tool": "mcp-formations.create",
  "entities": {"formation_name": null}
}
```

### 2. Response Generation

```
POST /webhook/llm-generate

Request:
{
  "context": {
    "intent": "CREATE_FORMATION",
    "resolved_data": {"name": "Master Cuisine"},
    "pending_questions": ["date"]
  },
  "tone": "friendly"
}

Response:
{
  "response": "Super ! Quelle sera la date de debut de Master Cuisine ?"
}
```

---

## Plan d'implementation

### Phase 1 : Infrastructure (Sprint 1)

| Tache | Responsable | Dependance |
|-------|-------------|------------|
| Creer `N8nLLMClient` | azy.mcp | - |
| Creer workflows n8n (intent, generate) | n8n | - |
| Importer tool registry chatbot-core | azy.mcp | chatbot-core 0.7.3 |

### Phase 2 : Integration NLU (Sprint 1)

| Tache | Responsable | Dependance |
|-------|-------------|------------|
| Integrer N8nLLMClient dans ToolEvaluatorNode | azy.mcp | Phase 1 |
| Tests unitaires NLU | azy.mcp | Phase 1 |

### Phase 3 : Integration Discord (Sprint 2)

| Tache | Responsable | Dependance |
|-------|-------------|------------|
| MCPRequestAdapter | azy.mcp | - |
| MentionResultAdapter | azy.mcp | - |
| Configurer MentionService → azy.mcp | plugin-recipes | Phase 2 |

### Phase 4 : Tests E2E (Sprint 2)

| Tache | Responsable | Dependance |
|-------|-------------|------------|
| Tests dialogue multi-tour | azy.mcp | Phase 3 |
| Tests cross-canal (Discord + API) | All | Phase 3 |

---

## Metriques de succes

| Metrique | Objectif |
|----------|----------|
| Dialogues multi-tour completes | > 80% sans erreur |
| Temps de reponse moyen | < 3s |
| Taux de clarifications utiles | > 70% repondues |
| Satisfaction utilisateur | Feedback positif |

---

## Questions ouvertes

### 1. Persistence des sessions

**Question** : Ou stocker les sessions multi-tour ?

| Option | Avantages | Inconvenients |
|--------|-----------|---------------|
| Redis | Rapide, TTL natif | Volatil |
| PostgreSQL | Persistant, queryable | Plus lent |
| Hybride | Best of both | Complexite |

**Recommandation** : Redis pour v1 (sessions courtes), PostgreSQL pour historique long terme.

### 2. Timeout des clarifications

**Question** : Combien de temps attendre une reponse utilisateur ?

**Proposition** : 5 minutes (configurable), avec message de rappel a 3 min.

### 3. Fallback si n8n indisponible

**Question** : Que faire si n8n ne repond pas ?

**Proposition** :
- Message d'erreur gracieux
- Log pour alerting
- Pas de fallback LLM direct (eviter les couts imprevus)

---

## Changelog

| Date | Version | Modification |
|------|---------|--------------|
| 2026-02-05 | 1.0.0 | Creation initiale |
