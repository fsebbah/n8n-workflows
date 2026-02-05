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
