# RFC-027: Architecture Conversationnelle Unifiee

**Statut**: Draft
**Auteur**: Plugin Recipes Team + Architecture Team
**Date**: 2026-02-05
**Version**: 4.0.0

## Resume

Cette RFC definit l'architecture hybride qui separe clairement :
1. **Flux evenementiels** (Redis Streams) - traites directement par les services
2. **Flux conversationnels** (NLU/Dialog/NLG) - orchestres par azy.mcp

**Principe fondamental : Chaque service a un role clair, pas de duplication.**


  ---

  ## Retour Equipe chatbot-core (2026-02-05)

  L'equipe chatbot-core a analyse la RFC-027 v3.0.0 et propose les modifications suivantes pour clarifier l'architecture hybride :

  ### Constats

  1. **Confusion des roles** : La v3.0.0 presentait chatbot-core comme un simple client MCP, alors qu'il a un role specifique
  d'infrastructure Discord
  2. **Redis Streams ignores** : L'architecture event-driven deja implementee n'etait pas mentionnee
  3. **Duplication des chemins** : Deux facons de creer des structures Discord (slash commands + events)

  ### Decisions

  | Decision | Justification |
  |----------|---------------|
  | chatbot-core = Service d'Infrastructure Discord | Role unique et clair |
  | chatbot-core ne utilise PAS MCPClient | Il expose des tools, n'initie pas de conversations |
  | FormationAdminCog a supprimer | Conflit avec l'architecture (duplication) |
  | Events passent directement (sans azy.mcp) | Pas besoin de NLU pour des actions deterministes |
  | Conversations passent par azy.mcp | NLU/Dialog/NLG necessaire |

  ### Impact sur le code existant

  - `FormationSetupService` : **Conserve** (logique metier)
  - `FormationEventSubscriber` : **Conserve** (handler events)
  - `FormationAdminCog` : **A supprimer** (remplace par menus plugin)
  - Nouveau : `MCPToolsServer` pour exposer les tools mcp-discord


---

## Architecture Globale

```
                    UTILISATEURS
                         |
         +---------------+---------------+
         |               |               |
    Slash Commands   @Bot mention    API REST
         |               |               |
         v               v               v
    +----------+    +----------+    +----------+
    |  plugin  |    |  plugin  |    |   api    |
    | (menus)  |    | (forward)|    |          |
    +----+-----+    +----+-----+    +----+-----+
         |               |               |
         |               +-------+-------+
         |                       |
         |                       v
         |              +----------------+
         |              |    azy.mcp     |
         |              | (NLU/Dialog/   |
         |              |  NLG/Tools)    |
         |              +-------+--------+
         |                      |
         |        +-------------+-------------+
         |        |             |             |
         |        v             v             v
         |   mcp-email    mcp-calendar   mcp-discord
         |                                    |
         +------------------------------------+
                          |
                          v
                  +---------------+
                  | chatbot-core  |
                  | (Discord Infra|
                  |  Service)     |
                  +-------+-------+
                          |
              +-----------+-----------+
              |                       |
              v                       v
      Discord API            Redis Streams
      (create/manage)        (events)
```

---

## Separation des Flux

### Flux Evenementiels (Direct - sans azy.mcp)

Les evenements systeme passent directement par Redis Streams sans orchestration conversationnelle :

```
API ──publish──> Redis Streams ──subscribe──> chatbot-core ──> Discord API
                     |
                     +──subscribe──> n8n (notifications, etc.)
```

**Exemples d'evenements :**
- `promotion.created` -> chatbot-core cree la structure Discord
- `enrollment.created` -> chatbot-core assigne le role
- `xp:gained` -> n8n envoie une notification

**Pourquoi pas azy.mcp ?**
- Pas d'intelligence conversationnelle necessaire
- Actions deterministes (event X -> action Y)
- Latence minimale requise
- Pas de "dialogue" avec l'utilisateur

### Flux Conversationnels (Via azy.mcp)

Les interactions utilisateur necessitant comprehension du langage naturel :

```
User: "@Bot je voudrais voir mes cours"
         |
         v
     azy.mcp (NLU: intention=VOIR_COURS)
         |
         v
     mcp-courses.list() (tool execution)
         |
         v
     azy.mcp (NLG: "Voici tes 3 cours...")
         |
         v
     plugin (format Discord embed)
```

**Exemples :**
- "@Bot montre mes cours" -> azy.mcp comprend, execute, repond
- "@Bot envoie un email a Jean" -> azy.mcp orchestre mcp-email
- "/recette carbonara" -> peut passer par azy.mcp pour enrichissement

---

## Roles et Responsabilites

### chatbot-core : Service d'Infrastructure Discord

**Responsabilite unique : Gerer l'infrastructure Discord en reaction aux evenements.**

```python
# Ce que chatbot-core fait
class FormationEventSubscriber:
    async def on_promotion_created(self, event: Event):
        """Cree structure Discord sur evenement."""
        structure = await self.setup_service.create_promotion_structure(...)
        await self.publisher.publish("promotion.setup_complete", ...)

# Ce que chatbot-core NE fait PAS
class FormationAdminCog:  # A SUPPRIMER
    @app_commands.command()
    async def sync(self, interaction):  # Non - ca c'est pour plugin+azy.mcp
        ...
```

**chatbot-core expose des MCP tools :**

| Tool | Description | Appele par |
|------|-------------|------------|
| `mcp-discord.create_category` | Cree une categorie Discord | azy.mcp |
| `mcp-discord.create_channel` | Cree un channel | azy.mcp |
| `mcp-discord.assign_role` | Assigne un role a un membre | azy.mcp |
| `mcp-discord.send_message` | Envoie un message dans un channel | azy.mcp |
| `mcp-discord.get_guild_info` | Retourne info du serveur | azy.mcp |

**Modes d'operation :**

1. **Mode Reactif (Events)** - Ecoute Redis Streams, execute automatiquement
2. **Mode Tool (MCP)** - Expose des tools que azy.mcp peut appeler a la demande

### plugin : Interface Utilisateur Discord

**Responsabilite : Interaction directe avec les utilisateurs Discord.**

```python
# Slash commands (max 6)
/aide        -> Menu d'aide local
/recette     -> Recherche rapide
/cours       -> Menu interactif (View)
/progression -> Menu stats/badges (View)
/liste       -> Menu liste courses (View)
/admin       -> Menu admin (ephemeral, View)

# @Bot mention -> Forward a azy.mcp
@Bot [texte] -> MCPClient.process() -> format response
```

**Ce que plugin fait :**
- Affiche des menus interactifs (`discord.ui.View`)
- Forward les mentions @Bot a azy.mcp
- Formate les reponses pour Discord (embeds, boutons)

**Ce que plugin NE fait PAS :**
- Logique metier (delegue a azy.mcp ou API)
- Creation d'infrastructure (delegue a chatbot-core)

### azy.mcp : Cerveau Conversationnel

**Responsabilite : Comprendre, decider, repondre aux requetes en langage naturel.**

```
                    azy.mcp
    +------------------------------------------+
    |  NLU Layer                               |
    |  - ToolEvaluatorNode (intentions)        |
    |  - EntityExtractor (entites)             |
    +------------------------------------------+
    |  Dialog Management                       |
    |  - OrchestrationState (session)          |
    |  - GapAnalyzerNode (questions)           |
    |  - ClarificationNode (multi-turn)        |
    +------------------------------------------+
    |  NLG Layer                               |
    |  - LLMNode (generation)                  |
    |  - ResponseFormatter (multi-canal)       |
    +------------------------------------------+
    |  Tool Execution                          |
    |  - mcp-courses, mcp-email, mcp-calendar  |
    |  - mcp-discord (via chatbot-core)        |
    +------------------------------------------+
```

### api : Source de Verite

**Responsabilite : Donnees, validation, publication d'evenements.**

```python
# Quand admin cree une promotion via dashboard
@router.post("/promotions")
async def create_promotion(data: PromotionCreate):
    promotion = await promotion_service.create(data)
    # Publie evenement -> chatbot-core reagit automatiquement
    await event_publisher.publish("promotion.created", {
        "promotion_id": promotion.id,
        "formation_name": promotion.formation.name,
        ...
    })
    return promotion
```

---

## Flux Detailles

### Flux 1: Creation de Promotion (Evenementiel)

```
1. Admin utilise dashboard web
2. API cree la promotion en DB
3. API publie "promotion.created" sur Redis Streams
4. chatbot-core recoit l'evenement
5. chatbot-core cree categorie + role + channels Discord
6. chatbot-core publie "promotion.setup_complete" avec les IDs Discord
7. API met a jour la promotion avec les IDs Discord
```

Aucune intervention de azy.mcp - c'est purement evenementiel.

### Flux 2: Utilisateur Demande ses Cours (Conversationnel)

```
1. User: "@Bot montre mes cours"
2. plugin forward a azy.mcp
3. azy.mcp NLU detecte intention VOIR_COURS
4. azy.mcp appelle mcp-courses.list_user_courses(user_id)
5. azy.mcp NLG formate la reponse
6. plugin affiche en embed Discord
```

### Flux 3: Admin Synchronise Formations (Hybride)

```
1. Admin: "/admin" -> clique [Formations] -> clique [Sync]
2. plugin affiche confirmation "Synchroniser toutes les formations ?"
3. Admin clique [Confirmer]
4. plugin appelle API endpoint /admin/formations/sync
5. API verifie les promotions sans structure Discord
6. API publie "promotion.created" pour chaque manquante
7. chatbot-core recoit et cree les structures
8. plugin affiche resultat "3 formations synchronisees"
```

L'action admin passe par l'API qui declenche les evenements.

### Flux 4: Admin Demande en Langage Naturel (Full Conversationnel)

```
1. Admin: "@Bot synchronise les formations qui n'ont pas de structure Discord"
2. plugin forward a azy.mcp
3. azy.mcp NLU detecte intention SYNC_FORMATIONS, entite=orphelines
4. azy.mcp appelle mcp-discord.get_orphan_formations() (tool chatbot-core)
5. azy.mcp appelle api/formations/sync pour chaque
6. azy.mcp NLG: "J'ai synchronise 3 formations: Master Cuisine, CAP Patisserie, BTS Hotellerie"
```

---

## MCP Tools Exposes

### Par chatbot-core (mcp-discord)

```yaml
tools:
  mcp-discord.get_guild_info:
    description: "Retourne les infos d'un serveur Discord"
    parameters:
      guild_id: string
    returns:
      name: string
      member_count: integer
      categories: array

  mcp-discord.create_category:
    description: "Cree une categorie Discord"
    parameters:
      guild_id: string
      name: string
      position: integer (optional)
    returns:
      category_id: string

  mcp-discord.create_channel:
    description: "Cree un channel texte dans une categorie"
    parameters:
      guild_id: string
      category_id: string
      name: string
      topic: string (optional)
    returns:
      channel_id: string

  mcp-discord.create_role:
    description: "Cree un role Discord"
    parameters:
      guild_id: string
      name: string
      color: string (optional, hex)
      permissions: array (optional)
    returns:
      role_id: string

  mcp-discord.assign_role:
    description: "Assigne un role a un membre"
    parameters:
      guild_id: string
      user_id: string
      role_id: string
    returns:
      success: boolean

  mcp-discord.send_message:
    description: "Envoie un message dans un channel"
    parameters:
      channel_id: string
      content: string
      embed: object (optional)
    returns:
      message_id: string

  mcp-discord.get_orphan_promotions:
    description: "Liste les promotions sans structure Discord"
    parameters:
      guild_id: string
    returns:
      promotions: array
```

### Par API (mcp-formations)

```yaml
tools:
  mcp-formations.list:
    description: "Liste les formations"
    parameters:
      guild_id: string
      status: string (optional: active, archived, all)
    returns:
      formations: array

  mcp-formations.get_promotion:
    description: "Detail d'une promotion"
    parameters:
      promotion_id: string
    returns:
      promotion: object

  mcp-formations.sync:
    description: "Declenche la sync des formations orphelines"
    parameters:
      guild_id: string
    returns:
      synced_count: integer
      promotions: array
```

---

## Migration depuis l'Existant

### A Supprimer

| Composant | Raison |
|-----------|--------|
| `FormationAdminCog` | Remplace par menus + events |
| Slash commands admin multiples | Consolide dans `/admin` avec View |

### A Conserver

| Composant | Raison |
|-----------|--------|
| `FormationSetupService` | Logique de creation Discord |
| `FormationEventSubscriber` | Handler d'evenements |
| `RedisStreamSubscriber` | Infrastructure events |
| `ResilientEventPublisher` | Publication avec fallback |

### A Creer

| Composant | Description |
|-----------|-------------|
| `MCPToolsServer` | Expose les tools mcp-discord |
| `AdminMenuView` | Menu interactif `/admin` |

---

## Slash Commands Finales (Plugin)

```
/aide        -> Affiche l'aide (local)
/recette     -> Recherche rapide
/cours       -> Menu View (Catalogue, Mes cours, Bundles)
/progression -> Menu View (Stats, Badges, Leaderboard)
/liste       -> Menu View (Voir, Ajouter, Vider)
/admin       -> Menu View ephemeral (Cours, Formations, Branding)
```

**Total: 6 slash commands**

Le menu `/admin` :
```
┌────────────────────────────────────────────────────┐
│ ⚙️ Administration                                    │
│                                                    │
│ [📚 Cours] [🎓 Formations] [🎨 Branding]           │
└────────────────────────────────────────────────────┘

Click [Formations]:
┌────────────────────────────────────────────────────┐
│ 🎓 Gestion des Formations                          │
│                                                    │
│ [📋 Liste] [🔄 Sync] [✅ Verifier] [🔧 Reparer]    │
│                                                    │
│ [🔙 Retour]                                        │
└────────────────────────────────────────────────────┘
```

---

## Questions Resolues

### Q: Qui gere les slash commands ?

**R: plugin uniquement.** chatbot-core ne devrait pas avoir de Cogs Discord.

### Q: Qui cree les structures Discord ?

**R: chatbot-core**, declenche par events ou par MCP tools.

### Q: Comment un admin synchronise les formations ?

**R: Deux options equivalentes :**
1. Menu `/admin` -> [Formations] -> [Sync] -> API -> events -> chatbot-core
2. "@Bot sync les formations" -> azy.mcp -> API -> events -> chatbot-core

### Q: chatbot-core utilise MCPClient ?

**R: Non.** chatbot-core :
- **Ecoute** les Redis Streams events (reactif)
- **Expose** des MCP tools (serveur, pas client)

chatbot-core n'a pas besoin d'initier des conversations.

---

## Plan d'Implementation

### Phase 1: Nettoyage chatbot-core
- [ ] Supprimer `FormationAdminCog`
- [ ] Verifier que `FormationEventSubscriber` gere tous les cas
- [ ] Documenter les MCP tools a exposer

### Phase 2: MCP Tools Server
- [ ] Creer `MCPToolsServer` dans chatbot-core
- [ ] Implementer les tools `mcp-discord.*`
- [ ] Tests unitaires

### Phase 3: Plugin Menus
- [ ] Creer `AdminMenuView`
- [ ] Migrer les slash commands admin vers le menu
- [ ] Connecter aux endpoints API

### Phase 4: Integration azy.mcp
- [ ] Enregistrer les tools mcp-discord dans azy.mcp
- [ ] Tester les flux conversationnels admin

---

## Appendice: Comparaison Avant/Apres

### Avant (Confusion)

```
plugin ──slash commands──> FormationAdminCog ──direct──> Discord API
                                |
                                └──> setup_service ──> Discord API

api ──events──> chatbot-core ──> setup_service ──> Discord API
```

Probleme: Deux chemins pour creer des structures Discord.

### Apres (Clair)

```
plugin ──slash/mention──> azy.mcp ──tools──> chatbot-core ──> Discord API
                                       |
api ──events──> chatbot-core ──────────┘
```

Un seul chemin: chatbot-core est le point unique pour Discord.

---

## Resume

| Flux | Passe par azy.mcp ? | Qui execute ? |
|------|---------------------|---------------|
| Event `promotion.created` | Non | chatbot-core (direct) |
| Event `enrollment.created` | Non | chatbot-core (direct) |
| "@Bot montre mes cours" | Oui | azy.mcp -> mcp-courses |
| "@Bot sync formations" | Oui | azy.mcp -> API -> events -> chatbot-core |
| "/admin" menu click | Non | plugin -> API -> events -> chatbot-core |
| Dashboard web action | Non | API -> events -> chatbot-core |

**Principe: Les evenements sont directs, les conversations sont orchestrees.**

---

## Retour Equipe n8n (Claude - 2026-02-05)

### Analyse d'Impact sur les Workflows Existants

Suite a l'implementation de RFC-023 et RFC-025, j'ai cree 11 workflows n8n. Voici l'analyse d'impact avec RFC-027:

| Workflow | Verdict | Justification |
|----------|---------|---------------|
| `STRIPE-Webhook-Handler.json` | ✅ GARDER | Flux externe (Stripe), hors perimetre azy.mcp |
| `STRIPE-Handler-*.json` (3) | ✅ GARDER | Idem - webhooks Stripe = evenementiel externe |
| `SUBSCRIPTION-Reconciliation.json` | ✅ GARDER | Job planifie (cron 3h00), pas conversationnel |
| `COURSE-Expiration-Cron.json` | ✅ GARDER | Job planifie (cron 6h00), pas conversationnel |
| `INFRA-Process-Pending-Events.json` | ✅ GARDER | Infrastructure fallback DB |
| `COURSE-CRUD-Webhooks.json` | 🗑️ **SUPPRIMER** | Proxy inutile - azy.mcp appelle API directement |
| `FORMATION-Create-Promotion.json` | 🗑️ **SUPPRIMER** | L'API publie events directement |
| `FORMATION-Archive-Promotion.json` | 🗑️ **SUPPRIMER** | L'API publie events directement |
| `FORMATION-Sync.json` | 🗑️ **SUPPRIMER** | Endpoint API + events, pas besoin de n8n |

### Justification des Suppressions

**COURSE-CRUD-Webhooks** etait un proxy:
```
Plugin → n8n → API (avant)
Plugin → azy.mcp → mcp-courses → API (apres RFC-027)
```
n8n n'apporte aucune valeur ajoutee ici. azy.mcp appelle l'API directement via ses tools.

**FORMATION-*.json** sont redondants car:
```
# Avant (mes workflows)
Plugin → POST /webhook/formation-create-promotion (n8n) → API → Redis publish

# Apres RFC-027
Plugin → /admin menu → API endpoint → Redis publish (direct)
  OU
Plugin → @Bot → azy.mcp → API endpoint → Redis publish (direct)
```
L'API publie directement les events. n8n n'est plus dans le chemin.

### Role de n8n dans RFC-027

D'apres l'architecture, n8n se positionne sur:

1. **Consommateur d'events** (notifications, alertes)
```
Redis Streams ──subscribe──> n8n ──> Discord webhook / Email / etc.
```

2. **Webhooks externes** (Stripe, etc.)
```
Stripe ──webhook──> n8n ──> API + Redis events
```

3. **Jobs planifies** (reconciliation, expiration, cleanup)
```
Cron ──> n8n ──> API + Redis events
```

n8n n'est **PAS** un orchestrateur d'actions utilisateur. C'est azy.mcp.

### Workflows a Conserver (Final)

```
workflows/
├── STRIPE-Webhook-Handler.json          # Externe - Stripe
├── STRIPE-Handler-Subscription-Updated.json
├── STRIPE-Handler-Payment-Intent.json
├── STRIPE-Handler-Payment-Failed.json
├── SUBSCRIPTION-Reconciliation.json     # Cron 3h00
├── COURSE-Expiration-Cron.json          # Cron 6h00
└── INFRA-Process-Pending-Events.json    # Infra fallback
```

**7 workflows** (vs 11 avant) - suppression de 4 proxies inutiles.

### Workflows Potentiels a Creer

Si n8n doit etre consommateur d'events pour notifications:

| Workflow | Trigger | Action |
|----------|---------|--------|
| `NOTIF-Level-Up.json` | Event `level:up` | DM Discord + embed celebratoire |
| `NOTIF-Badge-Earned.json` | Event `badge:earned` | DM Discord |
| `NOTIF-Course-Expiring.json` | Event `course.access.expiring` | DM Discord rappel |
| `ALERT-Anomaly-Detected.json` | Event `reconciliation.anomaly` | Webhook admin Discord |

### Questions pour l'Equipe Architecture

1. **API publie events directement?** Confirmer que l'API implemente `ResilientEventPublisher` et publie sur Redis Streams sans passer par n8n.

2. **MCP tools n8n?** Si azy.mcp a besoin d'executer des workflows complexes (multi-etapes, orchestration), faut-il exposer des tools `mcp-n8n.execute_workflow`?

3. **Notifications Discord** - Qui envoie les DM de notification (level up, badges)?
   - Option A: chatbot-core (via event subscriber)
   - Option B: n8n (via event subscriber + Discord webhook)
   - Option C: azy.mcp (via mcp-discord.send_dm)

### Recommandation

**Supprimer maintenant:**
- `COURSE-CRUD-Webhooks.json`
- `FORMATION-Create-Promotion.json`
- `FORMATION-Archive-Promotion.json`
- `FORMATION-Sync.json`

**Attendre confirmation avant de creer** les workflows de notification.

---

*Retour ajoute par: Claude (equipe n8n) - 2026-02-05*

---

## Retour Equipe plugin-recipes (Claude - 2026-02-05)

### Analyse d'Impact sur le Code Existant

J'ai recemment implemente les issues #110, #111, #112 (RFC-023, 024, 025). Voici l'impact de RFC-027:

| Fichier | Lignes | Verdict | Justification |
|---------|--------|---------|---------------|
| `course_subscription.py` | ~500 | 🔄 **REFACTORER** | Slash commands → View menu |
| `formation_admin.py` | ~300 | 🗑️ **SUPPRIMER** | chatbot-core gere via events |
| `branding_commands.py` | ~250 | 🔄 **REFACTORER** | → Menu `/admin` |
| `CourseApiClient` | ~400 | ❓ **A CLARIFIER** | azy.mcp appelle direct ou on garde? |
| `FormationApiClient` | ~200 | 🗑️ **SUPPRIMER** | Plugin ne gere plus formations |
| `mentions.py` | ~1400 | 🔄 **REFACTORER** | Forward vers azy.mcp |
| `course_helpers.py` | ~400 | ✅ **GARDER** | Formatage embeds Discord |
| `branding_helpers.py` | ~300 | ✅ **GARDER** | Utilitaires couleurs/templates |

### Impact Detaille

#### 1. Slash Commands → Views

**Avant (mon code actuel):**
```python
# course_subscription.py
cours_group = app_commands.Group(name="cours", ...)

@cours_group.command(name="catalogue")
async def catalogue(interaction): ...

@cours_group.command(name="info")
async def info(interaction, slug: str): ...

# 6 sous-commandes
```

**Apres (RFC-027):**
```python
# commands/menus/cours_menu.py
class CoursMenuView(discord.ui.View):
    @discord.ui.button(label="Catalogue", emoji="📚")
    async def catalogue(self, interaction, button): ...

    @discord.ui.button(label="Mes cours", emoji="📖")
    async def mes_cours(self, interaction, button): ...

@app_commands.command(name="cours")
async def cours(interaction):
    view = CoursMenuView(...)
    await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
```

**Effort: 1 jour** - Transformer les handlers en callbacks de boutons.

#### 2. Formation Admin → Suppression

**Avant:**
```python
# formation_admin.py
@formation_admin_group.command(name="list")
async def list_formations(interaction): ...

@formation_admin_group.command(name="sync")
async def sync_formations(interaction): ...
```

**Apres (RFC-027):**
- Plugin n'a plus ces commandes
- `/admin` menu → [Formations] → [Sync] → appelle API endpoint
- API publie events → chatbot-core execute

**Effort: Suppression + 0.5 jour** pour le menu `/admin`.

#### 3. Mention Handler → Forward azy.mcp

**Avant (mon code):**
```python
# mentions.py - 1400 lignes de logique locale
class BotAppetitMentionHandler:
    async def handle_mention(self, context, message):
        # Detection intention locale
        if self._is_greeting(content):
            return MentionResult(response=get_greeting_response())

        # Appel n8n direct
        if self._interactive_mode:
            return await self._handle_interactive_search(context, message)
```

**Apres (RFC-027):**
```python
# mentions.py - ~50 lignes
class BotAppetitMentionHandler:
    def __init__(self, mcp_client: MCPClient):
        self.mcp_client = mcp_client

    async def handle_mention(self, context, message):
        # Forward tout a azy.mcp
        result = await self.mcp_client.process(
            message=context.content,
            user_id=context.user_id,
            guild_id=context.guild_id,
        )
        # Formatter la reponse pour Discord
        return self._format_discord_response(result)
```

**Effort: 0.5 jour** - Simplification massive, suppression de ~1300 lignes.

#### 4. API Clients - Question Ouverte

**Question:** Plugin garde-t-il ses API clients (`CourseApiClient`, etc.) ou azy.mcp appelle directement?

**Option A: Plugin garde les clients**
```
User → /cours menu → CoursMenuView → CourseApiClient.get_catalogue() → API
```
Pro: Controle local, pas de dependance azy.mcp pour les menus
Con: Duplication avec mcp-courses tools

**Option B: Plugin forward tout a azy.mcp**
```
User → /cours menu → azy.mcp → mcp-courses.list() → API
```
Pro: Single source of truth
Con: Latence +1 hop, complexite pour actions simples

**Ma recommandation: Option A pour les menus, Option B pour @Bot**

```python
# Menus: appel direct API (rapide, deterministe)
class CoursMenuView:
    async def catalogue(self, interaction, button):
        courses = await self.course_api.get_catalogue(guild_id)  # Direct
        embed = create_course_list_embed(courses)
        await interaction.response.edit_message(embed=embed)

# @Bot: forward azy.mcp (conversationnel)
class MentionHandler:
    async def handle_mention(self, context, message):
        return await self.mcp_client.process(context.content)  # azy.mcp
```

### Fichiers a Creer

```
src/commands/menus/
├── __init__.py
├── cours_menu.py       # Menu /cours avec Views
├── admin_menu.py       # Menu /admin avec sous-menus
├── liste_menu.py       # Menu /liste
└── progression_menu.py # Menu /progression

src/mcp/
├── __init__.py
└── client.py           # MCPClient pour forward a azy.mcp
```

### Fichiers a Supprimer

```
src/commands/formation_admin.py      # → events chatbot-core
src/clients/formation_api_client.py  # → plus utilise
```

### Fichiers a Refactorer

```
src/commands/course_subscription.py  # → cours_menu.py
src/commands/branding_commands.py    # → admin_menu.py (sous-menu)
src/mentions.py                      # → forward azy.mcp
```

### Questions pour les Autres Equipes

1. **MCPClient interface?** Quel est le contrat d'interface pour appeler azy.mcp depuis plugin?
   ```python
   class MCPClient:
       async def process(self, message: str, user_id: str, guild_id: str) -> MCPResult: ...
   ```

2. **Response format?** azy.mcp retourne quoi exactement?
   ```python
   @dataclass
   class MCPResult:
       text: str                    # Message a afficher
       embed: dict | None           # Embed Discord (optionnel)
       view: discord.ui.View | None # Boutons (optionnel)?
       actions: list[Action]        # Actions executees
   ```

3. **Qui formate les embeds?**
   - Option A: azy.mcp retourne du texte brut, plugin formate en embed
   - Option B: azy.mcp retourne un embed structure, plugin l'affiche
   - **Je recommande Option A** - separation des concerns

4. **Autocomplete perdu?** Les menus Views perdent l'autocomplete Discord (ex: `/cours info pyt` → suggestions). Est-ce acceptable?

### Estimation Effort Total

| Tache | Effort |
|-------|--------|
| Creer menus Views (`/cours`, `/admin`, `/liste`, `/progression`) | 1.5 jours |
| Refactorer mentions.py → forward azy.mcp | 0.5 jour |
| Supprimer code obsolete (formation_admin, etc.) | 0.5 jour |
| Creer MCPClient wrapper | 0.5 jour |
| Tests | 1 jour |
| **Total** | **4 jours** |

### Plan de Migration

**Phase 1: Menus (sans azy.mcp)** - 2 jours
- Creer les Views menus
- Garder les API clients existants
- Plugin fonctionne standalone

**Phase 2: Integration azy.mcp** - 1 jour
- Creer MCPClient
- Refactorer mentions.py
- Tester les flux conversationnels

**Phase 3: Cleanup** - 1 jour
- Supprimer formation_admin.py
- Supprimer FormationApiClient
- Supprimer code mort dans mentions.py

### Risques Identifies

| Risque | Impact | Mitigation |
|--------|--------|------------|
| azy.mcp pas pret | Bloquant Phase 2 | Phase 1 fonctionne sans |
| Latence azy.mcp | UX degradee | Menus en direct, @Bot via azy.mcp |
| Perte autocomplete | UX power users | Accepter ou garder `/cours info <slug>` en plus |
| MCPClient interface change | Refactoring | Wrapper abstrait l'interface |

---

*Retour ajoute par: Claude (equipe plugin-recipes) - 2026-02-05*

---

## Retour Equipe API - Formation Management System (RFC-023)

### Contexte

L'equipe API a implemente les endpoints CRUD pour le Formation Management System:
- `api/routers/formation.py` - 1400+ lignes, endpoints REST complets
- `api/schemas/formation.py` - Schemas Pydantic
- Prefix: `/api/v1/formations`, `/api/v1/promotions`, `/api/v1/matieres`, `/api/v1/enrollments`

### Impact de RFC-027 sur nos endpoints

#### 1. Endpoints REST vs Tools MCP

| Endpoint actuel | Usage prevu RFC-027 |
|-----------------|---------------------|
| `POST /formations` | Tool `formation.create` via azy.mcp |
| `POST /promotions` | Tool `formation.create_promotion` via azy.mcp |
| `POST /enrollments` | Tool `formation.enroll_user` via azy.mcp |
| `GET /stats` | Tool `formation.get_stats` via azy.mcp |

**Decision**: Nos endpoints REST restent pour les appels **M2M** (machine-to-machine):
- chatbot-core callbacks (`/setup-complete`, `/role-assigned`)
- n8n workflows directs
- Tests et debug

Les interactions **humaines** passeront par azy.mcp → tools → nos endpoints.

#### 2. Flow Multi-turn vs Atomique

**Probleme identifie**: Notre `POST /promotions` attend tous les parametres d'un coup:

```python
# Actuel - atomique
POST /promotions
{
  "formation_id": "uuid",
  "year_start": 2024,
  "year_end": 2025,
  "matieres": [{"name": "Cuisine", "slug": "cuisine"}]
}
```

**RFC-027 veut un flow conversationnel**:
```
User: "Creer une promo"
Bot: "Pour quelle formation?" → [Master Cuisine] [BTS]
User: clique [Master Cuisine]
Bot: "Annee?" → input
User: "2024-2025"
Bot: "Matieres?" → [Ajouter] [Copier annee precedente]
```

**Solution proposee**: Creer un **FormationService** comme couche intermediaire:

```python
# api/services/formation/formation_service.py
class FormationService:
    """Service layer - logique metier pure, reutilisable."""

    async def create_promotion(
        self,
        formation_id: str,
        year_start: int,
        year_end: int,
        matieres: list[dict] | None = None,  # Optionnel pour multi-turn
    ) -> Promotion:
        # Logique metier
        ...

    async def add_matiere_to_promotion(
        self,
        promotion_id: str,
        matiere: dict,
    ) -> Matiere:
        # Permet d'ajouter incrementalement
        ...
```

#### 3. Publication des evenements Redis

**Question**: Qui publie les evenements `promotion.created`, `enrollment.created`, etc.?

| Option | Avantage | Inconvenient |
|--------|----------|--------------|
| **A: Endpoint publie** | Simple, actuel | Duplication si azy.mcp publie aussi |
| **B: azy.mcp publie** | Centralise | Endpoints "passifs", moins autonomes |
| **C: Service publie** | Couche unique | Refactoring necessaire |

**Recommandation**: **Option C** - Le `FormationService` publie les evenements. Ainsi:
- Endpoints REST appellent le service → evenements publies
- azy.mcp tools appellent le service → memes evenements publies
- Pas de duplication

```python
class FormationService:
    def __init__(self, db: Session, event_publisher: ResilientEventPublisher):
        self.db = db
        self.publisher = event_publisher

    async def create_promotion(self, ...) -> Promotion:
        # 1. Logique DB
        promotion = Promotion(...)
        self.db.add(promotion)
        self.db.commit()

        # 2. Publier evenement (une seule fois, ici)
        await self.publisher.publish(
            stream_name="formation:events:stream",
            event_data={
                "event": "promotion.created",
                "guild_id": promotion.guild_id,
                "data": {...}
            }
        )

        return promotion
```

#### 4. Callbacks Machine-to-Machine

Nos endpoints de callback restent **hors azy.mcp**:

```
POST /promotions/{id}/setup-complete   # chatbot-core → API direct
POST /enrollments/{id}/role-assigned   # chatbot-core → API direct
```

**Justification**: Ces callbacks sont M2M, pas conversationnels. Passer par azy.mcp ajouterait de la latence sans valeur.

### Fichiers a Creer

```
api/services/formation/
  __init__.py
  formation_service.py      # Service layer avec publication events
  promotion_service.py      # Optionnel, si trop gros
```

### Fichiers a Refactorer

```
api/routers/formation.py    # Deleguer au FormationService
api/dependencies.py         # Ajouter get_formation_service()
```

### Questions pour azy.mcp

1. **Tools MCP pour Formation?** Faut-il creer des tools specifiques ou azy.mcp appelle nos endpoints REST?

   ```python
   # Option A: Tool appelle endpoint REST
   @tool("formation.create_promotion")
   async def create_promotion(self, ...):
       async with httpx.AsyncClient() as client:
           return await client.post(f"{API_URL}/promotions", json=data)

   # Option B: Tool appelle service directement (si meme codebase)
   @tool("formation.create_promotion")
   async def create_promotion(self, ...):
       return await formation_service.create_promotion(...)
   ```

2. **Session multi-turn?** Comment azy.mcp gere l'accumulation des reponses pour creer une promotion incrementalement?

3. **Permissions admin?** Comment azy.mcp sait que l'utilisateur a le droit de creer une formation? Verification cote azy.mcp ou cote endpoint?

### Estimation Effort

| Tache | Effort |
|-------|--------|
| Creer `FormationService` | 1 jour |
| Refactorer `formation.py` router | 0.5 jour |
| Integrer `ResilientEventPublisher` | 0.5 jour |
| Tests unitaires service | 1 jour |
| Documentation tools MCP (si necessaire) | 0.5 jour |
| **Total** | **3.5 jours** |

### Plan de Migration

**Phase 1: Service Layer** (1.5 jours)
- Creer `FormationService` avec logique extraite du router
- Integrer publication evenements dans le service
- Router delegue au service

**Phase 2: Tests** (1 jour)
- Tests unitaires du service
- Tests integration avec mock Redis

**Phase 3: Documentation Tools** (0.5 jour)
- Documenter comment azy.mcp peut appeler nos services/endpoints
- Exemples de tools MCP pour formation

**Phase 4: Coordination azy.mcp** (0.5 jour)
- Valider l'interface avec l'equipe azy.mcp
- Creer les tools si necessaire

### Risques Identifies

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Refactoring service casse les endpoints | Regression | Tests avant/apres |
| Double publication evenements | Events dupliques | Service = seul publisher |
| azy.mcp pas pret | Bloquant tools | Endpoints REST fonctionnent standalone |
| Multi-turn complexe | UX degradee | Supporter aussi creation atomique |

### Schema Architecture Finale

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERACTIONS                                 │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│   Discord       │   n8n           │   chatbot-core                  │
│   (via azy.mcp) │   (direct REST) │   (callbacks direct REST)       │
└────────┬────────┴────────┬────────┴─────────────────┬───────────────┘
         │                 │                           │
         ▼                 │                           │
┌─────────────────┐        │                           │
│    azy.mcp      │        │                           │
│  (tools MCP)    │        │                           │
└────────┬────────┘        │                           │
         │                 │                           │
         ▼                 ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    api/routers/formation.py                          │
│                    (endpoints REST)                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 api/services/formation/formation_service.py          │
│                 (logique metier + publication events)                │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │ Database │   │  Redis   │   │ chatbot-core │
        │ (models) │   │ (events) │   │ (via events) │
        └──────────┘   └──────────┘   └──────────────┘
```

---

*Retour ajoute par: Claude (equipe API - RFC-023) - 2026-02-05*

---

# SYNTHESE ET PLAN D'ACTION

## Analyse Consolidee des Retours (4 equipes)

### Consensus

| Equipe | Position | Contribution cle | Effort estime |
|--------|----------|------------------|---------------|
| **chatbot-core** | ✅ Favorable | Clarifie le role d'infrastructure Discord, separation events/conversations | ~2 jours |
| **n8n** | ✅ Favorable | Supprime 4 workflows proxy, garde 7 | ~0.5 jour |
| **plugin-recipes** | ✅ Favorable | Refactoring menus Views, -1300 lignes mentions.py | ~4 jours |
| **API** | ✅ Favorable | Cree Service Layer avec publication events | ~3.5 jours |

**Verdict : Consensus unanime sur l'architecture hybride.**

### Principes Valides par Tous

| Principe | chatbot-core | n8n | plugin | API |
|----------|:------------:|:---:|:------:|:---:|
| Events = directs (sans azy.mcp) | ✅ | ✅ | ✅ | ✅ |
| Conversations = via azy.mcp | ✅ | ✅ | ✅ | ✅ |
| Service Layer publie les events | - | ✅ | - | ✅ |
| Plugin formate les embeds Discord | ✅ | - | ✅ | - |
| chatbot-core = point unique Discord | ✅ | ✅ | ✅ | ✅ |

### Decisions Cles

| # | Decision | Justification |
|---|----------|---------------|
| 1 | chatbot-core n'utilise PAS MCPClient | Expose des tools, n'initie pas de conversations |
| 2 | chatbot-core = seul createur Discord | Elimine la duplication des chemins |
| 3 | Events passent directement | Pas de NLU pour actions deterministes |
| 4 | FormationAdminCog supprime | Remplace par menus plugin |
| 5 | Service Layer publie events | Source unique, pas de duplication |
| 6 | Plugin garde API clients pour menus | Hybride: menus directs, @Bot via azy.mcp |

---

## Taches par Equipe

### Equipe chatbot-core

| # | Tache | Priorite | Statut |
|---|-------|----------|--------|
| 1 | Supprimer `FormationAdminCog` | P0 | ⬜ TODO |
| 2 | Verifier `FormationEventSubscriber` gere tous les cas | P0 | ⬜ TODO |
| 3 | Creer `MCPToolsServer` (expose mcp-discord.*) | P1 | ⬜ TODO |
| 4 | Implementer tools: create_category, create_channel, assign_role, send_message | P1 | ⬜ TODO |
| 5 | Tests unitaires MCPToolsServer | P2 | ⬜ TODO |

### Equipe n8n

| # | Tache | Priorite | Statut |
|---|-------|----------|--------|
| 1 | Supprimer `COURSE-CRUD-Webhooks.json` | P0 | ⬜ TODO |
| 2 | Supprimer `FORMATION-Create-Promotion.json` | P0 | ⬜ TODO |
| 3 | Supprimer `FORMATION-Archive-Promotion.json` | P0 | ⬜ TODO |
| 4 | Supprimer `FORMATION-Sync.json` | P0 | ⬜ TODO |
| 5 | (Optionnel) Creer workflows notifications (level-up, badges) | P2 | ⬜ TODO |

### Equipe plugin-recipes

| # | Tache | Priorite | Statut |
|---|-------|----------|--------|
| 1 | Creer `CoursMenuView` (menu /cours) | P0 | ⬜ TODO |
| 2 | Creer `AdminMenuView` (menu /admin) | P0 | ⬜ TODO |
| 3 | Creer `ListeMenuView` (menu /liste) | P1 | ⬜ TODO |
| 4 | Creer `ProgressionMenuView` (menu /progression) | P1 | ⬜ TODO |
| 5 | Creer `MCPClient` wrapper | P0 | ⬜ TODO |
| 6 | Refactorer `mentions.py` → forward azy.mcp | P0 | ⬜ TODO |
| 7 | Supprimer `formation_admin.py` | P1 | ⬜ TODO |
| 8 | Supprimer `FormationApiClient` | P1 | ⬜ TODO |
| 9 | Tests menus + integration | P2 | ⬜ TODO |

### Equipe API

| # | Tache | Priorite | Statut |
|---|-------|----------|--------|
| 1 | Creer `FormationService` (service layer) | P0 | ⬜ TODO |
| 2 | Integrer `ResilientEventPublisher` dans service | P0 | ⬜ TODO |
| 3 | Refactorer `formation.py` router → delegue au service | P1 | ⬜ TODO |
| 4 | Tests unitaires FormationService | P1 | ⬜ TODO |
| 5 | Documenter interface tools MCP pour formations | P2 | ⬜ TODO |

### Equipe azy.mcp

| # | Tache | Priorite | Statut |
|---|-------|----------|--------|
| 1 | Creer `ResponseFormatter` (composant manquant NLG) | P0 | ⬜ TODO |
| 2 | Exposer endpoint `/process` | P0 | ⬜ TODO |
| 3 | Enregistrer tools mcp-discord (chatbot-core) | P1 | ⬜ TODO |
| 4 | Enregistrer tools mcp-formations (API) | P1 | ⬜ TODO |
| 5 | Tests flux conversationnels E2E | P2 | ⬜ TODO |

---

## Planning Propose

```
Semaine 1 (Parallele)
├── chatbot-core: Supprimer FormationAdminCog + verifier EventSubscriber
├── n8n: Supprimer 4 workflows proxy
├── plugin: Creer Views menus (Phase 1 sans azy.mcp)
├── API: Creer FormationService
└── azy.mcp: Creer ResponseFormatter + endpoint /process

Semaine 2
├── chatbot-core: Creer MCPToolsServer
├── plugin: Creer MCPClient + refactorer mentions.py
├── azy.mcp: Enregistrer tools mcp-discord, mcp-formations
└── Tests E2E inter-equipes
```

---

## Effort Total

| Equipe | Effort |
|--------|--------|
| chatbot-core | 2 jours |
| n8n | 0.5 jour (+1 jour optionnel notifications) |
| plugin-recipes | 4 jours |
| API | 3.5 jours |
| azy.mcp | 2 jours |
| Tests E2E | 2 jours |
| **Total** | **~14 jours** (parallele: ~7 jours calendaires) |

---

## Prochaines Etapes

1. ⬜ Chaque equipe valide ses taches ci-dessus
2. ⬜ Kick-off semaine 1 (travail parallele)
3. ⬜ Point de synchro mi-semaine 1
4. ⬜ Integration semaine 2
5. ⬜ Tests E2E et validation finale

---

*Synthese ajoutee par: Architecture Team - 2026-02-05*
