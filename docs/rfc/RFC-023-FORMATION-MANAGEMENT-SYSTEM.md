# RFC-023 : Système de Gestion des Formations

| Métadonnée | Valeur |
|------------|--------|
| **Numéro** | RFC-023 |
| **Titre** | Formation Management System |
| **Statut** | Draft |
| **Auteur** | Équipe plugin-recipes |
| **Date** | 2026-02-04 |
| **Dépendances** | RFC-022 (Learning System) |
| **Équipes concernées** | api, chatbot-core, n8n, plugin-recipes |

---

## 1. Résumé

Ce RFC définit le système de gestion des formations pour les Centres de Formation d'Apprentis (CFA) utilisant Bot Appetit. Il couvre la création automatisée de structures Discord (catégories, channels, rôles) et la gestion des entités Formation, Promotion et Matière.

### 1.1 Objectifs

1. **Automatiser** la création de structures Discord pour les formations
2. **Gérer** le cycle de vie des promotions (création, archivage)
3. **Contrôler** les accès via les rôles Discord
4. **Intégrer** avec le Learning System (RFC-022) existant

### 1.2 Contrainte principale

**Discord ne supporte pas les sous-catégories.** La hiérarchie doit être aplatie :

```
Hiérarchie souhaitée          →    Mapping Discord
─────────────────────────────────────────────────────
CFA                           →    Serveur
Formation + Promotion         →    Catégorie
Matière / Cours              →    Channel
Leçon                        →    Thread
```

---

## 2. Architecture

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Discord Server (CFA)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐                     │
│  │ 🍳 MASTER-SUD-2024 │  │ 🍳 MASTER-SUD-2025 │  ← Catégories      │
│  ├────────────────────┤  ├────────────────────┤                     │
│  │ #techniques        │  │ #techniques        │  ← Channels         │
│  │ #patisserie        │  │ #patisserie        │                     │
│  │ #evaluations       │  │ #evaluations       │                     │
│  │ 🔊 session-live    │  │ 🔊 session-live    │                     │
│  └────────────────────┘  └────────────────────┘                     │
│                                                                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
            ┌───────▼───────┐       ┌───────▼───────┐
            │  chatbot-core │       │    plugin-    │
            │   (Discord    │       │    recipes    │
            │   Services)   │       │  (Commands)   │
            └───────┬───────┘       └───────┬───────┘
                    │                       │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │         n8n           │
                    │   (Orchestration)     │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │         API           │
                    │   (Source de vérité)  │
                    └───────────────────────┘
```

### 2.2 Modèle de données

```
┌─────────────────────────────────────────────────────────────────────┐
│                           API (PostgreSQL)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐       │
│  │  Formation   │──1:N─│  Promotion   │──1:N─│   Matiere    │       │
│  ├──────────────┤      ├──────────────┤      ├──────────────┤       │
│  │ id           │      │ id           │      │ id           │       │
│  │ name         │      │ formation_id │      │ promotion_id │       │
│  │ description  │      │ year_start   │      │ name         │       │
│  │ guild_id     │      │ year_end     │      │ channel_id   │       │
│  │ created_at   │      │ category_id  │      │ order        │       │
│  └──────────────┘      │ role_id      │      │ created_at   │       │
│                        │ status       │      └──────────────┘       │
│                        └──────────────┘                              │
│                               │                                      │
│                               │1:N                                   │
│                               ▼                                      │
│                        ┌──────────────┐                              │
│                        │  Enrollment  │  (lien avec RFC-022)        │
│                        ├──────────────┤                              │
│                        │ promotion_id │                              │
│                        │ learner_id   │                              │
│                        │ status       │                              │
│                        └──────────────┘                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Responsabilités par équipe

### 3.1 Équipe API

**Base de données et logique métier**

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/formations` | GET | Liste des formations d'un guild |
| `/formations` | POST | Créer une formation |
| `/formations/{id}` | GET | Détail d'une formation |
| `/formations/{id}` | PUT | Modifier une formation |
| `/formations/{id}` | DELETE | Supprimer une formation |
| `/promotions` | GET | Liste des promotions |
| `/promotions` | POST | Créer une promotion |
| `/promotions/{id}` | PUT | Modifier (archiver) |
| `/promotions/{id}/matieres` | GET | Matières d'une promotion |
| `/matieres` | POST | Créer une matière |
| `/matieres/{id}` | PUT | Modifier une matière |

**Modèles à créer :**

```python
# api/models/formation.py

class Formation(Base):
    __tablename__ = "formations"

    id = Column(UUID, primary_key=True, default=uuid4)
    guild_id = Column(String(20), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), nullable=False)  # ex: "master-cuisine-sud"
    description = Column(Text)
    emoji = Column(String(10), default="🎓")
    created_at = Column(DateTime, default=datetime.utcnow)

    promotions = relationship("Promotion", back_populates="formation")


class Promotion(Base):
    __tablename__ = "promotions"

    id = Column(UUID, primary_key=True, default=uuid4)
    formation_id = Column(UUID, ForeignKey("formations.id"), nullable=False)
    year_start = Column(Integer, nullable=False)  # ex: 2024
    year_end = Column(Integer, nullable=False)    # ex: 2025

    # Discord IDs
    category_id = Column(String(20))  # ID catégorie Discord
    role_id = Column(String(20))      # ID rôle Discord

    status = Column(Enum(PromotionStatus), default=PromotionStatus.ACTIVE)
    created_at = Column(DateTime, default=datetime.utcnow)
    archived_at = Column(DateTime, nullable=True)

    formation = relationship("Formation", back_populates="promotions")
    matieres = relationship("Matiere", back_populates="promotion")


class Matiere(Base):
    __tablename__ = "matieres"

    id = Column(UUID, primary_key=True, default=uuid4)
    promotion_id = Column(UUID, ForeignKey("promotions.id"), nullable=False)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), nullable=False)
    channel_id = Column(String(20))  # ID channel Discord
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    promotion = relationship("Promotion", back_populates="matieres")


class PromotionStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DRAFT = "draft"
```

**Events à publier (Redis Streams) :**

```python
# Events publiés par l'API

"formation.created"     # Nouvelle formation
"promotion.created"     # Nouvelle promotion (déclenche création Discord)
"promotion.archived"    # Promotion archivée (déclenche archivage Discord)
"matiere.created"       # Nouvelle matière (déclenche création channel)
"matiere.deleted"       # Matière supprimée
```

---

### 3.2 Équipe chatbot-core

**Services Discord partagés**

| Service | Fichier | Description |
|---------|---------|-------------|
| `FormationSetupService` | `services/discord/formation_setup.py` | Création structure Discord |
| `RoleManagerService` | `services/discord/role_manager.py` | Gestion des rôles (existant) |
| `ChannelManagerService` | `services/discord/channel_manager.py` | Gestion des channels (existant) |
| `FormationEventSubscriber` | `services/gamification/formation_events.py` | Écoute events API |

**FormationSetupService :**

```python
# chatbot_core/services/discord/formation_setup.py

class FormationSetupService:
    """
    Service pour créer et gérer les structures Discord des formations.
    Utilisé par tous les plugins de formation.
    """

    def __init__(
        self,
        bot: discord.Client,
        role_manager: RoleManagerService,
        channel_manager: ChannelManagerService,
    ):
        self.bot = bot
        self.role_manager = role_manager
        self.channel_manager = channel_manager

    async def create_promotion_structure(
        self,
        guild: discord.Guild,
        formation_name: str,
        formation_emoji: str,
        year_start: int,
        year_end: int,
        matieres: list[str],
    ) -> PromotionSetupResult:
        """
        Crée la structure complète pour une promotion :
        1. Catégorie Discord
        2. Rôle de promotion
        3. Channels pour chaque matière
        4. Channel vocal session-live
        5. Configuration des permissions

        Returns:
            PromotionSetupResult avec category_id, role_id, channel_ids
        """
        # Nom de la catégorie
        category_name = f"{formation_emoji} {formation_name.upper()}-{year_start}"

        # 1. Créer la catégorie
        category = await guild.create_category(
            name=category_name,
            reason=f"Formation {formation_name} {year_start}-{year_end}",
        )

        # 2. Créer le rôle
        role = await self.role_manager.create_role(
            guild=guild,
            name=f"{formation_name}-{year_start}",
            color=discord.Color.orange(),
            mentionable=True,
        )

        # 3. Configurer permissions catégorie
        await category.set_permissions(
            guild.default_role,
            view_channel=False,
        )
        await category.set_permissions(
            role,
            view_channel=True,
            send_messages=True,
            read_message_history=True,
        )

        # 4. Créer les channels de matières
        channel_ids = {}
        for i, matiere in enumerate(matieres, 1):
            channel = await category.create_text_channel(
                name=f"{i:02d}-{matiere}",
                topic=f"Cours de {matiere} - {formation_name} {year_start}",
            )
            channel_ids[matiere] = str(channel.id)

        # 5. Channel évaluations
        eval_channel = await category.create_text_channel(
            name="evaluations",
            topic="Évaluations et quiz",
        )
        channel_ids["evaluations"] = str(eval_channel.id)

        # 6. Channel vocal
        voice_channel = await category.create_voice_channel(
            name="🔊 session-live",
        )

        return PromotionSetupResult(
            category_id=str(category.id),
            role_id=str(role.id),
            channel_ids=channel_ids,
            voice_channel_id=str(voice_channel.id),
        )

    async def archive_promotion(
        self,
        guild: discord.Guild,
        category_id: str,
        role_id: str,
    ) -> None:
        """
        Archive une promotion :
        1. Renomme la catégorie (📦 prefix)
        2. Retire les permissions d'écriture
        3. Conserve les permissions de lecture
        """
        category = guild.get_channel(int(category_id))
        role = guild.get_role(int(role_id))

        if category:
            # Renommer avec prefix archive
            new_name = f"📦 {category.name}-ARCHIVE"
            await category.edit(name=new_name)

            # Retirer écriture, garder lecture
            if role:
                await category.set_permissions(
                    role,
                    view_channel=True,
                    send_messages=False,
                    read_message_history=True,
                )


@dataclass
class PromotionSetupResult:
    category_id: str
    role_id: str
    channel_ids: dict[str, str]
    voice_channel_id: str
```

**FormationEventSubscriber :**

```python
# chatbot_core/services/gamification/formation_events.py

class FormationEventSubscriber:
    """
    Écoute les events de l'API et déclenche les actions Discord.
    """

    def __init__(
        self,
        event_bus: EventBus,
        formation_setup: FormationSetupService,
    ):
        self.event_bus = event_bus
        self.formation_setup = formation_setup

    async def start(self):
        await self.event_bus.subscribe("formation.*", self._handle_event)
        await self.event_bus.subscribe("promotion.*", self._handle_event)
        await self.event_bus.subscribe("matiere.*", self._handle_event)

    async def _handle_event(self, event: dict):
        event_type = event.get("type")

        if event_type == "promotion.created":
            await self._on_promotion_created(event["data"])
        elif event_type == "promotion.archived":
            await self._on_promotion_archived(event["data"])
        elif event_type == "matiere.created":
            await self._on_matiere_created(event["data"])

    async def _on_promotion_created(self, data: dict):
        """Crée la structure Discord quand une promotion est créée."""
        guild = self.bot.get_guild(int(data["guild_id"]))
        if not guild:
            return

        result = await self.formation_setup.create_promotion_structure(
            guild=guild,
            formation_name=data["formation_name"],
            formation_emoji=data["formation_emoji"],
            year_start=data["year_start"],
            year_end=data["year_end"],
            matieres=data["matieres"],
        )

        # Callback vers l'API pour stocker les IDs Discord
        await self._update_promotion_discord_ids(
            promotion_id=data["promotion_id"],
            category_id=result.category_id,
            role_id=result.role_id,
            channel_ids=result.channel_ids,
        )
```

---

### 3.3 Équipe n8n

**Workflows d'orchestration**

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `formation-create-promotion` | Webhook POST | 1. Valide données → 2. Appelle API → 3. Publie event |
| `formation-archive-promotion` | Webhook POST | 1. Valide → 2. Update API → 3. Publie event archive |
| `formation-add-matiere` | Webhook POST | 1. Valide → 2. Appelle API → 3. Publie event |
| `formation-sync-enrollments` | Cron (daily) | Synchronise inscriptions promotion ↔ rôles Discord |

**Workflow : formation-create-promotion**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Webhook   │────▶│  Validate   │────▶│  API POST   │────▶│   Publish   │
│   Trigger   │     │   Input     │     │ /promotions │     │    Event    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                    │
                                                                    ▼
                                                          Redis: promotion.created
```

**Input attendu :**

```json
{
  "guild_id": "123456789",
  "formation_id": "uuid-formation",
  "year_start": 2024,
  "year_end": 2025,
  "matieres": [
    "techniques-culinaires",
    "patisserie",
    "hygiene-haccp",
    "gestion"
  ]
}
```

---

### 3.4 Équipe plugin-recipes

**Commandes Discord**

| Commande | Sous-commande | Description |
|----------|---------------|-------------|
| `/formation` | `create` | Créer une nouvelle formation |
| `/formation` | `list` | Lister les formations du serveur |
| `/formation` | `info` | Détails d'une formation |
| `/promotion` | `create` | Créer une promotion (déclenche setup Discord) |
| `/promotion` | `list` | Lister les promotions d'une formation |
| `/promotion` | `archive` | Archiver une promotion terminée |
| `/promotion` | `add-member` | Ajouter un apprenant à une promotion |
| `/matiere` | `create` | Ajouter une matière à une promotion |
| `/matiere` | `list` | Lister les matières d'une promotion |

**FormationApiClient (extension de LearningApiClient) :**

```python
# plugin-recipes/src/learning/api_client.py

class FormationApiClient(LearningApiClient):
    """
    Extension du client API pour la gestion des formations.
    """

    # =========================================================================
    # FORMATIONS
    # =========================================================================

    async def get_formations(self, guild_id: str) -> list[Formation]:
        result = await self.call_webhook(
            "formation-list",
            data={"guild_id": guild_id},
        )
        return [Formation.from_dict(f) for f in result.get("formations", [])]

    async def create_formation(
        self,
        guild_id: str,
        name: str,
        description: str,
        emoji: str = "🎓",
    ) -> Formation:
        result = await self.call_webhook(
            "formation-create",
            data={
                "guild_id": guild_id,
                "name": name,
                "description": description,
                "emoji": emoji,
            },
        )
        return Formation.from_dict(result["formation"])

    # =========================================================================
    # PROMOTIONS
    # =========================================================================

    async def create_promotion(
        self,
        guild_id: str,
        formation_id: str,
        year_start: int,
        year_end: int,
        matieres: list[str],
    ) -> Promotion:
        """
        Crée une promotion. Déclenche automatiquement :
        1. Création de la catégorie Discord
        2. Création du rôle
        3. Création des channels
        """
        result = await self.call_webhook(
            "formation-create-promotion",
            data={
                "guild_id": guild_id,
                "formation_id": formation_id,
                "year_start": year_start,
                "year_end": year_end,
                "matieres": matieres,
            },
        )
        return Promotion.from_dict(result["promotion"])

    async def archive_promotion(
        self,
        guild_id: str,
        promotion_id: str,
    ) -> Promotion:
        result = await self.call_webhook(
            "formation-archive-promotion",
            data={
                "guild_id": guild_id,
                "promotion_id": promotion_id,
            },
        )
        return Promotion.from_dict(result["promotion"])

    async def add_member_to_promotion(
        self,
        guild_id: str,
        promotion_id: str,
        user_id: str,
    ) -> dict:
        """Ajoute un membre et lui assigne le rôle Discord."""
        result = await self.call_webhook(
            "formation-add-member",
            data={
                "guild_id": guild_id,
                "promotion_id": promotion_id,
                "user_id": user_id,
            },
        )
        return result
```

---

## 4. Flux de données

### 4.1 Création d'une promotion

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Discord │     │ plugin- │     │   n8n   │     │   API   │     │  Redis  │
│  User   │     │ recipes │     │         │     │         │     │         │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │ /promotion    │               │               │               │
     │   create      │               │               │               │
     │──────────────▶│               │               │               │
     │               │               │               │               │
     │               │ POST webhook  │               │               │
     │               │──────────────▶│               │               │
     │               │               │               │               │
     │               │               │ POST          │               │
     │               │               │ /promotions   │               │
     │               │               │──────────────▶│               │
     │               │               │               │               │
     │               │               │               │ PUBLISH       │
     │               │               │               │ promotion     │
     │               │               │               │ .created      │
     │               │               │               │──────────────▶│
     │               │               │               │               │
     │               │               │               │◀──────────────│
     │               │               │◀──────────────│               │
     │               │◀──────────────│               │               │
     │◀──────────────│               │               │               │
     │               │               │               │               │
```

### 4.2 Traitement de l'event (chatbot-core)

```
┌─────────┐     ┌───────────┐     ┌───────────┐     ┌─────────┐
│  Redis  │     │ chatbot-  │     │  Discord  │     │   API   │
│         │     │   core    │     │           │     │         │
└────┬────┘     └─────┬─────┘     └─────┬─────┘     └────┬────┘
     │               │                  │                │
     │ SUBSCRIBE     │                  │                │
     │ promotion.*   │                  │                │
     │──────────────▶│                  │                │
     │               │                  │                │
     │               │ create_category  │                │
     │               │─────────────────▶│                │
     │               │                  │                │
     │               │ create_role      │                │
     │               │─────────────────▶│                │
     │               │                  │                │
     │               │ create_channels  │                │
     │               │─────────────────▶│                │
     │               │                  │                │
     │               │ set_permissions  │                │
     │               │─────────────────▶│                │
     │               │                  │                │
     │               │                  │                │
     │               │ PUT /promotions/{id}              │
     │               │ (discord_ids)    │                │
     │               │──────────────────────────────────▶│
     │               │                  │                │
```

---

## 5. Exemple d'utilisation

### 5.1 Création d'une formation Master Cuisine du Sud

```
Utilisateur : /formation create
              name:Master Cuisine du Sud
              description:Formation aux techniques de la cuisine méditerranéenne
              emoji:🍳

Bot : ✅ Formation créée !
      📝 Master Cuisine du Sud
      🆔 formation-uuid-123

      Prochaine étape : Créez une promotion avec /promotion create
```

### 5.2 Création d'une promotion 2024-2025

```
Utilisateur : /promotion create
              formation:Master Cuisine du Sud
              annee_debut:2024
              annee_fin:2025
              matieres:techniques-provencales,produits-mediterranee,patisserie-sud,oenologie

Bot : ⏳ Création de la promotion en cours...

[5 secondes plus tard]

Bot : ✅ Promotion 2024-2025 créée !

      📁 Catégorie : 🍳 MASTER-CUISINE-SUD-2024
      👥 Rôle : @Master-Cuisine-Sud-2024

      📚 Channels créés :
      • #01-techniques-provencales
      • #02-produits-mediterranee
      • #03-patisserie-sud
      • #04-oenologie
      • #evaluations
      • 🔊 session-live

      💡 Ajoutez des apprenants avec /promotion add-member
```

### 5.3 Ajout d'un apprenant

```
Utilisateur : /promotion add-member
              promotion:2024-2025
              membre:@Jean

Bot : ✅ Jean ajouté à la promotion Master Cuisine du Sud 2024-2025

      Actions effectuées :
      • Rôle @Master-Cuisine-Sud-2024 attribué
      • Accès aux channels de la promotion
      • Inscription au Learning System (RFC-022)
```

---

## 6. Gestion des rôles

### 6.1 Hiérarchie des rôles

```
Position haute (admin)
    │
    ├── @Admin-CFA
    ├── @Direction
    │
    ├── @Formateur
    │   ├── @Formateur-Cuisine
    │   ├── @Formateur-Boulangerie
    │   └── @Formateur-Patisserie
    │
    ├── @Master-Cuisine-Sud-2024
    ├── @Master-Cuisine-Sud-2025
    ├── @CAP-Boulangerie-2024
    │
    └── @Apprenant (rôle de base)
    │
Position basse (@everyone)
```

### 6.2 Permissions par catégorie

| Catégorie | @everyone | @Promo | @Formateur | @Admin |
|-----------|-----------|--------|------------|--------|
| 📢 GÉNÉRAL | Voir | Voir+Écrire | Tout | Tout |
| 🍳 MASTER-2024 | ❌ | Voir+Écrire | Tout | Tout |
| 👨‍🏫 FORMATEURS | ❌ | ❌ | Voir+Écrire | Tout |

---

## 7. Archivage

### 7.1 Processus d'archivage

```
Utilisateur : /promotion archive promotion:2024-2025

Bot : ⚠️ Êtes-vous sûr de vouloir archiver la promotion 2024-2025 ?

      Actions qui seront effectuées :
      • Renommage : 📦 MASTER-CUISINE-SUD-2024-ARCHIVE
      • Retrait des permissions d'écriture
      • Conservation de l'accès en lecture

      [Confirmer] [Annuler]

[Clic sur Confirmer]

Bot : ✅ Promotion 2024-2025 archivée

      Les anciens apprenants peuvent toujours :
      • Consulter les cours et discussions
      • Accéder aux ressources

      Ils ne peuvent plus :
      • Envoyer des messages
      • Participer aux sessions live
```

### 7.2 Politique de rétention

| Ancienneté | Action |
|------------|--------|
| 0-12 mois | Archive active (lecture seule) |
| 12-24 mois | Archive (proposer suppression) |
| > 24 mois | Suppression (après confirmation) |

---

## 8. Intégration avec RFC-022

### 8.1 Lien Promotion ↔ Course

```
RFC-023 (Formations)              RFC-022 (Learning)
┌──────────────────┐              ┌──────────────────┐
│    Promotion     │              │      Course      │
├──────────────────┤              ├──────────────────┤
│ id               │─────────────▶│ promotion_id     │
│ formation_id     │              │ id               │
│ year_start       │              │ title            │
│ matieres[]       │              │ modules[]        │
└──────────────────┘              └──────────────────┘
```

### 8.2 Inscription automatique

Quand un membre est ajouté à une promotion :
1. Rôle Discord attribué (RFC-023)
2. Enrollment créé pour chaque Course de la promotion (RFC-022)
3. Accès au Learning System activé

---

## 9. Plan d'implémentation

### Phase 1 : API (Équipe API)
- [ ] Modèles Formation, Promotion, Matiere
- [ ] Endpoints CRUD
- [ ] Events Redis

### Phase 2 : chatbot-core (Équipe chatbot-core)
- [ ] FormationSetupService
- [ ] FormationEventSubscriber
- [ ] Tests unitaires

### Phase 3 : n8n (Équipe n8n)
- [ ] Workflow formation-create-promotion
- [ ] Workflow formation-archive-promotion
- [ ] Workflow formation-add-matiere

### Phase 4 : plugin-recipes (Équipe plugin-recipes)
- [ ] FormationApiClient
- [ ] Commandes /formation, /promotion, /matiere
- [ ] Tests d'intégration

---

## 10. Questions ouvertes

1. **Multi-tenant** : Un CFA peut-il avoir plusieurs serveurs Discord ?
2. **Migration** : Comment migrer les formations existantes ?
3. **Templates** : Proposer des templates de matières par type de formation ?
4. **Quotas** : Limiter le nombre de promotions actives par formation ?

---

## 11. Références

- [RFC-022 : Learning System](./RFC-022-LEARNING-SYSTEM.md)
- [Guide Organisation Discord CFA](../guides/GUIDE-ORGANISATION-DISCORD-CFA.md)
- [Architecture Learning Service](../issues/LEARNING-SERVICE-ARCHITECTURE.md)

---

## 12. Review chatbot-core (2026-02-04)

> **Reviewer:** Équipe chatbot-core
> **Statut:** Review avec recommandations

### 12.1 Points positifs ✅

1. **Contrainte Discord bien identifiée** - L'aplatissement Formation+Promotion → Catégorie est la bonne solution
2. **Séparation des responsabilités** - Cohérente avec RFC-022 (API = vérité, chatbot-core = Discord)
3. **Flux de données clairs** - Les diagrammes de séquence sont précis
4. **Intégration RFC-022** - Le lien Promotion ↔ Course est bien pensé

### 12.2 Problèmes identifiés ⚠️

#### 12.2.1 Placement incorrect du `FormationEventSubscriber`

```
❌ Proposé:  chatbot_core/services/gamification/formation_events.py
✅ Correct:  chatbot_core/services/formation/formation_events.py
            ou
            chatbot_core/services/discord/formation_events.py
```

**Raison:** Ce n'est pas de la gamification, c'est de la gestion de structure Discord.

#### 12.2.2 Noms de services incohérents avec l'existant

| RFC-023 propose | chatbot-core exporte |
|-----------------|---------------------|
| `RoleManagerService` | `RoleManager` |
| `ChannelManagerService` | `ChannelManager` |

**Action:** Utiliser les noms existants `RoleManager` et `ChannelManager`.

#### 12.2.3 Pattern callback API problématique

Le RFC propose que chatbot-core appelle directement l'API :

```python
# ❌ Proposé (couplage fort)
await self._update_promotion_discord_ids(promotion_id, category_id, role_id, ...)
```

**Problème:** Crée une dépendance bidirectionnelle, pas cohérent avec l'architecture event-driven.

**Solution recommandée:** Publier un event Redis, l'API s'y abonne :

```python
# ✅ Event-driven (cohérent avec RFC-022)
await self.redis.publish(
    f"discord:events:{guild_id}",
    {
        "event": "discord.promotion.created",
        "timestamp": "2026-02-04T10:30:00Z",
        "guild_id": str(guild_id),
        "data": {
            "promotion_id": data["promotion_id"],
            "category_id": result.category_id,
            "role_id": result.role_id,
            "channel_ids": result.channel_ids,
            "voice_channel_id": result.voice_channel_id,
        }
    }
)
```

#### 12.2.4 Channel Redis non spécifié

RFC-022 utilise `learning:events:{guild_id}`. RFC-023 ne définit pas son channel.

**Options:**

| Option | Channel | Avantages | Inconvénients |
|--------|---------|-----------|---------------|
| A | `learning:events:{guild_id}` | Un seul subscriber | Events mixtes, couplage |
| B | `formation:events:{guild_id}` | Séparation claire | Deux subscribers |

**Recommandation:** Option B - séparation claire, un subscriber par domaine.

#### 12.2.5 Gestion d'erreurs manquante

Le service `create_promotion_structure` ne gère pas :

1. **Échec partiel** - Catégorie créée mais rôle échoué
2. **Rate limits Discord** - 50 channels/category, API rate limits
3. **Rollback** - Nettoyer les ressources créées en cas d'erreur

**Solution proposée:**

```python
async def create_promotion_structure(...) -> PromotionSetupResult:
    created_resources = []
    try:
        # 1. Catégorie
        category = await guild.create_category(...)
        created_resources.append(("category", category))

        # 2. Rôle
        role = await self.role_manager.create_role(...)
        created_resources.append(("role", role))

        # ... autres créations

        return PromotionSetupResult(...)

    except Exception as e:
        # Rollback
        await self._rollback(created_resources)
        raise FormationSetupError(f"Échec création promotion: {e}")
```

#### 12.2.6 Protocols manquants

Pas de `FormationSetupServiceProtocol` défini pour le mocking dans les tests des plugins.

### 12.3 Architecture révisée proposée

```
chatbot_core/services/
├── discord/
│   ├── channel_manager.py      # existant (RFC-022)
│   ├── role_manager.py         # existant (RFC-022)
│   └── formation_setup.py      # NOUVEAU (RFC-023)
│
├── formation/                   # NOUVEAU package (RFC-023)
│   ├── __init__.py
│   ├── formation_event_subscriber.py
│   ├── formation_handlers.py
│   └── protocols.py            # FormationSetupServiceProtocol
│
└── gamification/               # existant (RFC-022 - inchangé)
    ├── leaderboard_display_service.py
    ├── badge_notification_service.py
    ├── learning_event_subscriber.py
    └── learning_handlers.py
```

### 12.4 Events Redis proposés

#### Events API → chatbot-core (channel: `formation:events:{guild_id}`)

```python
# Création promotion
{
    "event": "formation.promotion.created",
    "timestamp": "2026-02-04T10:30:00Z",
    "guild_id": "123456789",
    "data": {
        "promotion_id": "uuid",
        "formation_id": "uuid",
        "formation_name": "Master Cuisine du Sud",
        "formation_emoji": "🍳",
        "year_start": 2024,
        "year_end": 2025,
        "matieres": ["techniques", "patisserie", "hygiene"]
    }
}

# Archivage promotion
{
    "event": "formation.promotion.archived",
    "timestamp": "2026-02-04T10:30:00Z",
    "guild_id": "123456789",
    "data": {
        "promotion_id": "uuid",
        "category_id": "123456789",
        "role_id": "987654321"
    }
}

# Ajout matière
{
    "event": "formation.matiere.created",
    "timestamp": "2026-02-04T10:30:00Z",
    "guild_id": "123456789",
    "data": {
        "matiere_id": "uuid",
        "promotion_id": "uuid",
        "category_id": "123456789",
        "name": "oenologie",
        "order": 5
    }
}
```

#### Events chatbot-core → API (channel: `discord:events:{guild_id}`)

```python
# Structure Discord créée
{
    "event": "discord.promotion.created",
    "timestamp": "2026-02-04T10:30:05Z",
    "guild_id": "123456789",
    "data": {
        "promotion_id": "uuid",
        "category_id": "111111111",
        "role_id": "222222222",
        "channel_ids": {
            "techniques": "333333333",
            "patisserie": "444444444",
            "evaluations": "555555555"
        },
        "voice_channel_id": "666666666"
    }
}
```

### 12.5 Questions pour l'équipe plugin-recipes

1. **Subscriber partagé ou séparé ?**
   - Réutiliser `LearningEventSubscriber` avec support multi-channel ?
   - Créer `FormationEventSubscriber` séparé ?

2. **Injection du bot**
   - `FormationSetupService` a besoin du bot pour `guild.create_category()`
   - Comment est-il injecté dans le plugin ?

3. **Templates de matières** (Question 10.3)
   - Ces templates devraient-ils être dans chatbot-core (partagé) ou plugin-recipes (spécifique) ?

4. **Limite matières par promotion ?**
   - Discord limite à 50 channels par catégorie
   - Faut-il valider côté chatbot-core ou API ?

### 12.6 Impact chatbot-core

| Version | Composants à créer |
|---------|-------------------|
| **v0.7.3** | `FormationSetupService` |
| | `FormationEventSubscriber` |
| | `FormationHandlers` + `setup_formation_handlers()` |
| | `FormationSetupServiceProtocol` |
| | Package `chatbot_core.services.formation` |

### 12.7 Verdict

**RFC-023 est acceptable** avec les ajustements suivants :

1. ✅ Corriger le placement de `FormationEventSubscriber` → package `formation/`
2. ✅ Aligner les noms de services (`RoleManager`, `ChannelManager`)
3. ✅ Remplacer le callback API par un event Redis `discord.promotion.created`
4. ✅ Définir le channel Redis `formation:events:{guild_id}`
5. ✅ Ajouter gestion d'erreurs avec rollback
6. ✅ Ajouter les protocols pour testing

**En attente:** Réponses de l'équipe plugin-recipes aux questions 12.5.

---

## 13. Réponses plugin-recipes (2026-02-04)

> **Équipe:** plugin-recipes
> **En réponse à:** Section 12.5

### 13.1 Subscriber partagé ou séparé ?

**Recommandation:** `FormationEventSubscriber` **séparé**.

**Justification:**
- Séparation des domaines (SRP) - Formation ≠ Gamification
- Channels Redis distincts (`formation:events` vs `learning:events`)
- Handlers différents avec logiques métier distinctes
- Facilite le debugging et monitoring par domaine
- Plugins peuvent activer l'un sans l'autre

```python
# Dans plugin __init__.py
await self._setup_learning_subscriber()    # Optionnel
await self._setup_formation_subscriber()   # Optionnel
```

### 13.2 Injection du bot

Le bot est déjà disponible dans le plugin via `self.bot`. Le service sera injecté ainsi :

```python
# Dans plugin-recipes/src/__init__.py

async def _setup_formation_subscriber(self) -> None:
    """Configure le Formation Event Subscriber (RFC-023)."""
    if not FORMATION_EVENTS_AVAILABLE:
        return

    # FormationSetupService reçoit bot + Redis + RoleManager + ChannelManager
    self._formation_setup = FormationSetupService(
        bot=self.bot,
        redis=self._redis,
        role_manager=self._role_manager,
        channel_manager=self._channel_manager,
    )

    # Subscriber et handlers
    self._formation_event_bus = EventBus()
    self._formation_subscriber = FormationEventSubscriber(
        redis=self._redis,
        event_bus=self._formation_event_bus,
    )

    self._formation_handlers = FormationHandlers(
        event_bus=self._formation_event_bus,
        formation_setup=self._formation_setup,
    )
    self._formation_handlers.register_all()

    await self._formation_subscriber.start_pattern()
```

### 13.3 Templates de matières

**Recommandation:** Templates dans **plugin-recipes** (spécifique au domaine culinaire).

**Raison:**
- Les matières sont spécifiques au domaine (cuisine, boulangerie, pâtisserie)
- Autre plugin (ex: plugin-musique) aurait des templates différents
- chatbot-core fournit le **mécanisme**, le plugin fournit le **contenu**

```yaml
# plugin-recipes/config/formations/templates.yaml
templates:
  master-cuisine:
    emoji: "🍳"
    matieres:
      - nom: "techniques-culinaires"
        emoji: "🔪"
        ordre: 1
      - nom: "patisserie"
        emoji: "🍰"
        ordre: 2
      - nom: "hygiene-haccp"
        emoji: "🧼"
        ordre: 3
      - nom: "evaluations"
        emoji: "📝"
        ordre: 99

  cap-boulangerie:
    emoji: "🥖"
    matieres:
      - nom: "pains-tradition"
        emoji: "🍞"
        ordre: 1
      - nom: "viennoiseries"
        emoji: "🥐"
        ordre: 2
```

### 13.4 Limite matières par promotion

**Recommandation:** Validation dans **l'API** (source de vérité) avec message d'erreur clair.

**Raison:**
- L'API connaît déjà le nombre de matières de la promotion
- Validation en amont évite de créer des ressources Discord inutiles
- chatbot-core peut aussi vérifier en défense (`< 50 channels` avant création)

```python
# API - lors de l'ajout d'une matière
MAX_MATIERES_PER_PROMOTION = 45  # Marge pour channels système

if len(promotion.matieres) >= MAX_MATIERES_PER_PROMOTION:
    raise ValidationError(
        f"Limite de {MAX_MATIERES_PER_PROMOTION} matières par promotion atteinte. "
        "Discord limite à 50 channels par catégorie."
    )
```

### 13.5 Résumé des décisions

| Question | Décision | Responsable |
|----------|----------|-------------|
| Subscriber | Séparé (`FormationEventSubscriber`) | chatbot-core |
| Injection bot | Via plugin `__init__.py` | plugin-recipes |
| Templates matières | Fichier YAML dans plugin | plugin-recipes |
| Validation limite | API + défense chatbot-core | API + chatbot-core |

### 13.6 Impact plugin-recipes

Composants à créer dans plugin-recipes (après chatbot-core v0.7.3) :

| Fichier | Description |
|---------|-------------|
| `config/formations/templates.yaml` | Templates matières par formation |
| `src/formation/__init__.py` | Package formation |
| `src/formation/template_loader.py` | Chargement templates YAML |
| `src/commands/formation_commands.py` | Commandes `/formation` |
| Mise à jour `src/__init__.py` | Setup formation subscriber |

---

*Document créé le 2026-02-04*
*Statut : Draft - Réponses plugin-recipes fournies, prêt pour implémentation*

---

## 14. Review technique (2026-02-05)

> **Reviewer:** Claude Code
> **Statut:** Review avec points critiques

### 14.1 Problèmes critiques 🔴

#### 14.1.1 ~~Single Point of Failure sur Redis~~ ✅ RÉSOLU

> **Décision (2026-02-05) :** Redis Streams adopté au lieu de Pub/Sub.

**Architecture Redis Streams :**
- ✅ Persistence native (events stockés sur disque)
- ✅ Consumer groups (multi-instance safe)
- ✅ Acknowledgement explicite (`XACK`)
- ✅ Dead Letter Queue via `XPENDING` + `XCLAIM`
- ✅ Replay possible après crash

```
API → Redis Stream (persisté) → chatbot-core (peut être down)
                                      ↓
                              Redémarre → reprend où il en était
```

**Version Redis requise :** 5.0+ (actuel : 8.4.0 ✅)

#### 14.1.2 Absence d'idempotence

Si un event `promotion.created` est reçu deux fois (reconnexion, retry réseau), le code actuel :
- Crée deux catégories Discord identiques
- Crée deux rôles avec le même nom
- `create_promotion_structure` ne vérifie pas si la structure existe déjà

**Recommandation :**
```python
async def create_promotion_structure(...) -> PromotionSetupResult:
    # Vérifier si déjà créé (idempotence)
    existing = await self._find_existing_category(guild, promotion_id)
    if existing:
        logger.info(f"Structure déjà créée pour {promotion_id}, skip")
        return existing
    # ... création
```

#### 14.1.3 Désynchronisation API ↔ Discord

L'API est "source de vérité" mais Discord a son propre état. Scénarios non traités :
- Un admin supprime manuellement un channel Discord
- Un admin renomme une catégorie
- Discord rate-limit empêche la création de channels

**Recommandation :** Ajouter un workflow de réconciliation :
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Cron      │────▶│  Compare    │────▶│   Repair    │
│  (daily)    │     │  API/Discord│     │  or Alert   │
└─────────────┘     └─────────────┘     └─────────────┘
```

#### 14.1.4 Rollback incomplet (section 12.2.5)

Le rollback proposé ne gère pas :
- Échec du rollback lui-même (catégorie créée, rôle échoué, suppression catégorie échouée)
- Timeouts Discord pendant le rollback
- État "zombie" : ressources Discord créées mais promotion non enregistrée en DB

**Recommandation :** Adopter un pattern Saga avec compensation :
```python
class PromotionCreationSaga:
    async def execute(self):
        try:
            self.category = await self._create_category()
            self.role = await self._create_role()
            self.channels = await self._create_channels()
            await self._notify_success()
        except Exception as e:
            await self._compensate()
            raise

    async def _compensate(self):
        """Compensation en ordre inverse, avec retry."""
        for resource in reversed(self.created_resources):
            for attempt in range(3):
                try:
                    await self._delete_resource(resource)
                    break
                except Exception:
                    await asyncio.sleep(2 ** attempt)
```

### 14.2 Points d'attention 🟠

#### 14.2.1 Rate limits Discord non quantifiés

Voir **Annexe A : Rate Limits Discord** pour les détails complets.

**Impact sur ce RFC :**
- Création de catégorie : ~5 / 5 sec (même bucket que channels)
- Création de rôle : ~10 / 10 sec
- Création de channels : ~5 / 5 sec

**Recommandation :** Ajouter un worker rate-limited :
```python
class DiscordRateLimitedWorker:
    def __init__(self):
        self.limiter = Bottleneck(min_time=250)  # 4 req/sec max

    async def create_channel(self, ...):
        async with self.limiter:
            return await guild.create_text_channel(...)
```

#### 14.2.2 Tests E2E absents

4 équipes, 4 systèmes (plugin → n8n → API → chatbot-core), mais :
- Comment tester le flux complet ?
- Environnement de test avec Discord réel ou mock ?
- Pas de contrat d'interface formalisé (OpenAPI, JSON Schema pour les events)

**Recommandation :** Définir des schemas JSON pour les events :
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "event": {"const": "formation.promotion.created"},
    "timestamp": {"type": "string", "format": "date-time"},
    "guild_id": {"type": "string"},
    "data": {
      "type": "object",
      "required": ["promotion_id", "formation_id", "year_start", "year_end"],
      "properties": {
        "promotion_id": {"type": "string", "format": "uuid"},
        "formation_id": {"type": "string", "format": "uuid"},
        "year_start": {"type": "integer"},
        "year_end": {"type": "integer"},
        "matieres": {"type": "array", "items": {"type": "string"}}
      }
    }
  },
  "required": ["event", "timestamp", "guild_id", "data"]
}
```

#### 14.2.3 Migration non résolue (Question 10.2)

Comment migrer les formations existantes créées manuellement sur Discord ?

**Recommandation :** Créer un outil CLI de réconciliation :
```bash
# Importer une structure existante
python manage.py import_formation \
  --guild-id 123456789 \
  --category-id 987654321 \
  --formation-name "Master Cuisine" \
  --year 2024
```

#### 14.2.4 Archivage sans stratégie de nettoyage automatique

Politique de rétention (section 7.2) mentionne "> 24 mois → Suppression" mais :
- Qui confirme ? Workflow non défini
- Cron + notification admin manquant

**Recommandation :** Workflow n8n `formation-cleanup-old-archives` :
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Cron      │────▶│  Find old   │────▶│  Notify     │────▶│  Wait for   │
│  (monthly)  │     │  archives   │     │  admins     │     │  approval   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 14.3 Recommandations d'implémentation

| Priorité | Action | Équipe |
|----------|--------|--------|
| 🔴 P0 | Implémenter Redis Streams (consumer groups) | chatbot-core |
| 🔴 P0 | Implémenter idempotence des handlers | chatbot-core |
| 🔴 P0 | Implémenter Saga avec compensation | chatbot-core |
| 🟠 P1 | Worker rate-limited pour Discord | chatbot-core |
| 🟠 P1 | JSON Schema pour les events | API + chatbot-core |
| 🟠 P1 | Workflow de réconciliation | n8n |
| 🟡 P2 | Outil CLI d'import | API |
| 🟡 P2 | Workflow cleanup archives | n8n |

### 14.4 Questions en suspens

1. **Multi-instance chatbot-core** : Si plusieurs pods écoutent Redis, comment éviter le traitement dupliqué ? (Consumer groups ?)
2. **Timeout des events** : Combien de temps un event peut-il rester en queue avant d'être considéré comme périmé ?
3. **Monitoring** : Quelles métriques exposer ? (temps de création, taux d'échec, désynchronisations)

---

## Annexe A : Rate Limits Discord

> ⚠️ **CRITIQUE** : Ces limites doivent être respectées sous peine de suspension du bot.

### A.1 Vue d'ensemble

Discord applique des limites strictes pour protéger son infrastructure :
- **Global** : 50 requêtes/seconde/bot/token
- **Par route** : Variable selon l'endpoint
- **Bucket system** : Certaines routes partagent la même limite

### A.2 Limites par type d'action

| Action | Limite approx. | Bucket |
|--------|---------------|--------|
| Création salon (text/voice/category) | ~5 / 5 sec | `channels` |
| Création rôle | ~10 / 10 sec | `roles` |
| Attribution rôle à membre | ~10 / 10 sec | `members` |
| Envoi message | ~5 / 5 sec / canal | `messages:{channel_id}` |
| Webhooks | ~30 / min | `webhooks` |
| Modification permissions | ~10 / 10 sec | `permissions` |

### A.3 Headers de Rate Limit

Chaque réponse API Discord contient :

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Nombre max de requêtes |
| `X-RateLimit-Remaining` | Requêtes restantes |
| `X-RateLimit-Reset` | Timestamp de reset (epoch) |
| `X-RateLimit-Bucket` | ID du bucket |
| `Retry-After` | Délai à attendre si 429 |

### A.4 Impact sur la création de promotion

Une promotion typique nécessite :
- 1 catégorie
- 1 rôle
- 4-10 channels texte
- 1 channel vocal
- 1-2 modifications de permissions par channel

**Estimation** : ~15-20 requêtes API

**Temps minimum safe** : ~10-15 secondes par promotion

**Création de 10 promotions simultanées** : ❌ Impossible sans throttling

### A.5 Ordres de grandeur safe

| Action | Rate safe (sans 429) |
|--------|---------------------|
| Création salon | 1 / sec |
| Création rôle | 1 / sec |
| Attribution rôle | 5 / sec |
| Messages canal | 1 / sec |
| Webhooks | 5 / sec |

### A.6 Architecture recommandée

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Event     │────▶│   Queue     │────▶│   Worker    │────▶│   Discord   │
│  (Redis)    │     │  (BullMQ)   │     │  throttled  │     │    API      │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                                    ┌─────────────────┐
                                    │  Retry with     │
                                    │  Retry-After    │
                                    └─────────────────┘
```

### A.7 Implémentation recommandée

```python
import asyncio
from dataclasses import dataclass
from typing import Callable, Any

@dataclass
class RateLimitBucket:
    remaining: int = 5
    reset_at: float = 0

class DiscordRateLimiter:
    """Rate limiter respectant les buckets Discord."""

    def __init__(self):
        self.buckets: dict[str, RateLimitBucket] = {}
        self.global_remaining = 50
        self.global_reset_at = 0

    async def execute(
        self,
        bucket_key: str,
        func: Callable[..., Any],
        *args,
        **kwargs,
    ) -> Any:
        """Exécute une fonction en respectant les rate limits."""
        # Attendre si global limit atteint
        await self._wait_for_global()

        # Attendre si bucket limit atteint
        await self._wait_for_bucket(bucket_key)

        try:
            response = await func(*args, **kwargs)
            self._update_from_response(bucket_key, response)
            return response
        except discord.HTTPException as e:
            if e.status == 429:
                retry_after = e.retry_after or 5
                await asyncio.sleep(retry_after)
                return await self.execute(bucket_key, func, *args, **kwargs)
            raise

    async def _wait_for_global(self):
        if self.global_remaining <= 0:
            wait_time = self.global_reset_at - time.time()
            if wait_time > 0:
                await asyncio.sleep(wait_time)

    async def _wait_for_bucket(self, bucket_key: str):
        bucket = self.buckets.get(bucket_key)
        if bucket and bucket.remaining <= 0:
            wait_time = bucket.reset_at - time.time()
            if wait_time > 0:
                await asyncio.sleep(wait_time)
```

### A.8 Sanctions en cas d'abus

| Niveau | Conséquence |
|--------|-------------|
| 1 | 429 temporaires (quelques secondes) |
| 2 | Shadow throttling (limites réduites) |
| 3 | Blocage endpoint spécifique |
| 4 | Bot suspendu temporairement |
| 5 | Token révoqué définitivement |

> ⚠️ **Discord est très strict.** Un bot qui ignore les rate limits peut être banni.

---

## Annexe B : Checklist pré-implémentation

- [ ] Redis Streams consumer groups implémentés
- [ ] Idempotence des handlers d'events vérifiée
- [ ] Rate limiter Discord implémenté
- [ ] JSON Schema des events défini et validé
- [ ] Tests unitaires pour chaque service
- [ ] Tests d'intégration avec mock Discord
- [ ] Workflow de réconciliation planifié
- [ ] Métriques et alerting définis
- [ ] Documentation des procédures de rollback

---

## 15. Réponse plugin-recipes à la review technique (2026-02-05)

> **Équipe:** plugin-recipes
> **En réponse à:** Section 14

### 15.1 Points acceptés ✅

| Point | Section | Commentaire |
|-------|---------|-------------|
| SPOF Redis | 14.1.1 | ✅ **Résolu** - Redis Streams adopté (persistence + replay) |
| Idempotence | 14.1.2 | Accepté - Critique, à implémenter en priorité |
| Désynchronisation | 14.1.3 | Accepté - Réconciliation nécessaire |
| Rollback Saga | 14.1.4 | Accepté - Meilleure approche que try/except simple |
| Rate limits | 14.2.1 | Accepté - Annexe A excellente, à intégrer dans chatbot-core |
| JSON Schema | 14.2.2 | Accepté - Contrats d'interface essentiels |

### 15.2 Contre-propositions

#### 15.2.1 ✅ Redis Streams adopté

> **Décision actée (2026-02-05) :** Redis Streams remplace Pub/Sub. Pas besoin de pattern Outbox.

**Justification :**
- Redis 8.4.0 déjà installé (Streams disponible depuis 5.0)
- Pas de table `pending_events` en DB nécessaire
- Consumer groups natifs (pas de traitement dupliqué)
- Replay possible si consumer crash
- Dead Letter via `XPENDING` + `XCLAIM`

**Implémentation de référence :**

```python
# chatbot_core/services/events/stream_subscriber.py

class RedisStreamSubscriber:
    """Subscriber Redis Streams avec consumer groups."""

    STREAM_KEY = "formation:events:stream"
    GROUP_NAME = "chatbot-core"
    BLOCK_MS = 5000  # Attente max entre lectures

    def __init__(self, redis: Redis, consumer_id: str):
        self.redis = redis
        self.consumer_id = consumer_id  # ex: f"pod-{os.getpid()}"

    async def setup(self) -> None:
        """Crée le consumer group si inexistant."""
        try:
            await self.redis.xgroup_create(
                self.STREAM_KEY,
                self.GROUP_NAME,
                id="0",  # Lire depuis le début
                mkstream=True,
            )
        except ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise  # Group existe déjà, OK

    async def consume(self, handler: Callable[[dict], Awaitable[None]]) -> None:
        """Consomme les events avec acknowledgement."""
        while True:
            events = await self.redis.xreadgroup(
                groupname=self.GROUP_NAME,
                consumername=self.consumer_id,
                streams={self.STREAM_KEY: ">"},
                count=10,
                block=self.BLOCK_MS,
            )

            for stream, messages in events:
                for msg_id, data in messages:
                    try:
                        event = json.loads(data[b"event"])
                        await handler(event)
                        await self.redis.xack(self.STREAM_KEY, self.GROUP_NAME, msg_id)
                    except Exception as e:
                        logger.error(f"Event {msg_id} failed: {e}")
                        # Pas d'ACK → sera retry via XPENDING

    async def claim_pending(self, min_idle_ms: int = 60000) -> None:
        """Réclame les events abandonnés (DLQ interne)."""
        pending = await self.redis.xpending_range(
            self.STREAM_KEY,
            self.GROUP_NAME,
            min="-",
            max="+",
            count=100,
        )
        for entry in pending:
            if entry["time_since_delivered"] > min_idle_ms:
                await self.redis.xclaim(
                    self.STREAM_KEY,
                    self.GROUP_NAME,
                    self.consumer_id,
                    min_idle_time=min_idle_ms,
                    message_ids=[entry["message_id"]],
                )
```

**Publication côté API :**

```python
# api/services/event_publisher.py

class StreamEventPublisher:
    """Publie les events dans Redis Streams."""

    STREAM_KEY = "formation:events:stream"
    MAX_LEN = 10000  # Garde les 10k derniers events

    async def publish(self, event_type: str, guild_id: str, data: dict) -> str:
        """Publie un event et retourne son ID."""
        event = {
            "event": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "guild_id": guild_id,
            "data": data,
        }
        msg_id = await self.redis.xadd(
            self.STREAM_KEY,
            {"event": json.dumps(event)},
            maxlen=self.MAX_LEN,
            approximate=True,
        )
        return msg_id
```

#### 15.2.2 Réconciliation on-demand vs daily cron

Le workflow de réconciliation quotidien est lourd pour un problème rare.

**Contre-proposition :** Réconciliation manuelle via commande admin :

```
/formation sync --promotion <id>     # Sync une promotion
/formation sync --guild              # Sync tout le guild
/formation check                     # Affiche les désynchronisations sans corriger
```

**Avantages :**
- Contrôle humain
- Pas de cron à maintenir
- Logs explicites pour debug

**Le cron peut être ajouté en v2** si le besoin se confirme.

#### 15.2.3 Migration formations existantes (14.2.3)

L'outil CLI proposé est bon, mais devrait être un workflow n8n pour rester cohérent :

```
POST /webhook/formation-import
{
    "guild_id": "123456789",
    "category_id": "987654321",
    "formation_name": "Master Cuisine",
    "year_start": 2024,
    "year_end": 2025
}
```

**Avantage :** Réutilise l'infra existante, pas de CLI supplémentaire.

### 15.3 Réponses aux questions 14.4

| Question | Réponse plugin-recipes |
|----------|------------------------|
| **14.4.1 Multi-instance** | Redis Streams consumer groups (voir 15.2.1) |
| **14.4.2 Timeout events** | 24h max, ensuite DLQ avec alerte admin |
| **14.4.3 Monitoring** | Métriques Prometheus exposées par plugin (voir 15.4) |

### 15.4 Proposition monitoring

Plugin-recipes exposera des métriques Prometheus :

```python
from prometheus_client import Counter, Histogram, Gauge

# Compteurs
formation_events_received = Counter(
    "formation_events_received_total",
    "Events formation reçus",
    ["event_type", "guild_id"]
)

formation_events_processed = Counter(
    "formation_events_processed_total",
    "Events formation traités avec succès",
    ["event_type", "guild_id"]
)

formation_events_failed = Counter(
    "formation_events_failed_total",
    "Events formation en échec",
    ["event_type", "guild_id", "error_type"]
)

# Histogrammes
formation_creation_duration = Histogram(
    "formation_creation_duration_seconds",
    "Durée de création d'une structure promotion",
    buckets=[1, 2, 5, 10, 20, 30, 60]
)

# Jauges
discord_rate_limit_remaining = Gauge(
    "discord_rate_limit_remaining",
    "Requêtes Discord restantes avant rate limit",
    ["bucket"]
)
```

### 15.5 Impact sur le planning

| Priorité | Action | Équipe | Estimation |
|----------|--------|--------|------------|
| 🔴 P0 | Implémenter Redis Streams subscriber | chatbot-core | 2 jours |
| 🔴 P0 | Implémenter idempotence handlers | chatbot-core | 2 jours |
| 🔴 P0 | Implémenter Saga compensation | chatbot-core | 3 jours |
| 🟠 P1 | Rate limiter Discord | chatbot-core | 2 jours |
| 🟠 P1 | Commande `/formation sync` | plugin-recipes | 1 jour |
| 🟠 P1 | Métriques Prometheus | plugin-recipes | 1 jour |
| 🟡 P2 | Workflow import formations | n8n | 2 jours |

### 15.6 Checklist mise à jour

- [x] ~~Décision Redis Streams vs Outbox~~ → **Redis Streams adopté (2026-02-05)**
- [ ] Redis Streams subscriber + consumer groups
- [ ] Idempotence des handlers
- [ ] Saga pattern avec compensation
- [ ] Rate limiter Discord intégré
- [ ] Commande `/formation sync`
- [ ] Métriques Prometheus
- [ ] JSON Schema des events
- [ ] Tests E2E avec mock Discord

---

*Réponse plugin-recipes ajoutée le 2026-02-05*
*Décision Redis Streams actée le 2026-02-05*
*Review finale et fallback ajoutés le 2026-02-05*
*Statut : Draft - Prêt pour implémentation*

---

## 16. Review finale et solutions de secours (2026-02-05)

> **Reviewer:** Claude Code
> **Objectif:** Challenger les décisions et ajouter les fallbacks Redis Streams

### 16.1 Validation des décisions actées ✅

| Décision | Statut | Commentaire |
|----------|--------|-------------|
| Redis Streams (pas Pub/Sub) | ✅ Validée | Persistence + consumer groups = résilience |
| Subscriber séparé `FormationEventSubscriber` | ✅ Validée | SRP respecté |
| Channel `formation:events:stream` | ✅ Validée | Séparation des domaines |
| Templates matières dans plugin-recipes | ✅ Validée | Domain-specific |
| Validation limite matières API + chatbot-core | ✅ Validée | Defense in depth |

### 16.2 Solutions de secours Redis Streams

> **Contexte:** Redis Streams est le choix principal, mais des fallbacks sont nécessaires.

#### 16.2.1 Architecture de résilience

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE RÉSILIENTE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  NIVEAU 1: Redis Streams (nominal)                                  │
│  ─────────────────────────────────                                  │
│  - Consumer groups avec ACK                                         │
│  - Replay automatique via XPENDING                                  │
│  - Persistence sur disque                                           │
│                                                                      │
│  NIVEAU 2: Retry avec backoff (dégradé)                            │
│  ──────────────────────────────────────                             │
│  - Si XADD échoue → queue locale en mémoire                        │
│  - Retry toutes les 30s pendant 5 min                              │
│  - Si toujours KO → niveau 3                                       │
│                                                                      │
│  NIVEAU 3: Fallback PostgreSQL (secours)                           │
│  ─────────────────────────────────────────                          │
│  - Table `pending_events` dans la DB                               │
│  - Cron toutes les minutes pour consommer                          │
│  - Alerte admin si activé                                          │
│                                                                      │
│  NIVEAU 4: Mode manuel (urgence)                                   │
│  ────────────────────────────────                                   │
│  - Commande admin `/formation sync --force`                        │
│  - Réconciliation manuelle API ↔ Discord                           │
│  - Logs détaillés pour debug                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### 16.2.2 Implémentation du fallback PostgreSQL

```python
# api/models/pending_events.py

class PendingEvent(Base):
    """
    Fallback: events en attente si Redis Streams indisponible.
    Table utilisée uniquement en mode dégradé.
    """
    __tablename__ = "pending_events"

    id = Column(UUID, primary_key=True, default=uuid4)
    stream_name = Column(String(100), nullable=False)  # ex: formation:events:stream
    event_type = Column(String(100), nullable=False)   # ex: formation.promotion.created
    guild_id = Column(String(20), nullable=False)
    payload = Column(JSONB, nullable=False)

    # Tracking
    created_at = Column(DateTime, default=datetime.utcnow)
    attempts = Column(Integer, default=0)
    last_attempt_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    # Statut
    status = Column(
        Enum('pending', 'processing', 'completed', 'failed', name='event_status'),
        default='pending'
    )

# Index pour le cron de traitement
CREATE INDEX idx_pending_events_status ON pending_events(status, created_at);
```

```python
# chatbot_core/services/events/resilient_publisher.py

class ResilientEventPublisher:
    """
    Publie les events avec fallback automatique.

    Priorité:
    1. Redis Streams (nominal)
    2. Queue mémoire + retry (dégradé)
    3. PostgreSQL pending_events (secours)
    """

    MAX_MEMORY_QUEUE_SIZE = 1000
    RETRY_INTERVAL_SECONDS = 30
    MAX_RETRIES = 10

    def __init__(self, redis: Redis, db_session: AsyncSession):
        self.redis = redis
        self.db = db_session
        self._memory_queue: deque = deque(maxlen=self.MAX_MEMORY_QUEUE_SIZE)
        self._redis_healthy = True
        self._fallback_active = False

    async def publish(
        self,
        stream: str,
        event_type: str,
        guild_id: str,
        data: dict,
    ) -> str:
        """Publie un event avec fallback automatique."""
        event = {
            "event": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "guild_id": guild_id,
            "data": data,
        }

        # Niveau 1: Redis Streams
        if self._redis_healthy:
            try:
                msg_id = await self.redis.xadd(
                    stream,
                    {"event": json.dumps(event)},
                    maxlen=10000,
                )
                return msg_id
            except RedisError as e:
                logger.warning(f"Redis Streams unavailable: {e}")
                self._redis_healthy = False
                await self._alert_redis_down()

        # Niveau 2: Queue mémoire pour retry
        if len(self._memory_queue) < self.MAX_MEMORY_QUEUE_SIZE:
            self._memory_queue.append({
                "stream": stream,
                "event": event,
                "attempts": 0,
            })
            if not self._fallback_active:
                asyncio.create_task(self._process_memory_queue())
            return f"queued:{uuid4()}"

        # Niveau 3: Fallback PostgreSQL
        return await self._persist_to_db(stream, event_type, guild_id, event)

    async def _process_memory_queue(self):
        """Traite la queue mémoire avec retry."""
        self._fallback_active = True

        while self._memory_queue:
            # Tester si Redis est revenu
            if await self._check_redis_health():
                self._redis_healthy = True
                # Flush toute la queue vers Redis
                while self._memory_queue:
                    item = self._memory_queue.popleft()
                    try:
                        await self.redis.xadd(
                            item["stream"],
                            {"event": json.dumps(item["event"])},
                            maxlen=10000,
                        )
                    except RedisError:
                        self._memory_queue.appendleft(item)
                        break
                if not self._memory_queue:
                    await self._alert_redis_recovered()
                    self._fallback_active = False
                    return

            # Attendre avant le prochain retry
            await asyncio.sleep(self.RETRY_INTERVAL_SECONDS)

            # Vérifier les items expirés
            await self._expire_old_items()

        self._fallback_active = False

    async def _persist_to_db(
        self,
        stream: str,
        event_type: str,
        guild_id: str,
        event: dict,
    ) -> str:
        """Fallback: persiste l'event en DB."""
        pending = PendingEvent(
            stream_name=stream,
            event_type=event_type,
            guild_id=guild_id,
            payload=event,
        )
        self.db.add(pending)
        await self.db.commit()

        logger.warning(f"Event persisted to DB fallback: {pending.id}")
        return f"db:{pending.id}"

    async def _check_redis_health(self) -> bool:
        """Vérifie si Redis est disponible."""
        try:
            await self.redis.ping()
            return True
        except RedisError:
            return False

    async def _alert_redis_down(self):
        """Alerte les admins que Redis est down."""
        # Implémenter selon le système d'alerting (Slack, email, etc.)
        logger.critical("ALERT: Redis Streams unavailable, fallback activated")

    async def _alert_redis_recovered(self):
        """Alerte les admins que Redis est revenu."""
        logger.info("Redis Streams recovered, fallback deactivated")
```

#### 16.2.3 Cron de traitement du fallback DB

```python
# n8n workflow: process-pending-events (cron: every minute)

async def process_pending_events():
    """
    Traite les events en fallback DB.
    Exécuté par cron toutes les minutes.
    """
    # Vérifier d'abord si Redis est disponible
    try:
        await redis.ping()
    except RedisError:
        logger.warning("Redis still unavailable, skipping pending events processing")
        return

    # Récupérer les events en attente
    pending = await db.query("""
        SELECT * FROM pending_events
        WHERE status = 'pending'
        AND attempts < 10
        ORDER BY created_at ASC
        LIMIT 100
    """)

    for event in pending:
        try:
            # Marquer comme en cours
            await db.execute(
                "UPDATE pending_events SET status = 'processing', last_attempt_at = NOW() WHERE id = $1",
                event.id
            )

            # Publier vers Redis Streams
            await redis.xadd(
                event.stream_name,
                {"event": json.dumps(event.payload)},
                maxlen=10000,
            )

            # Marquer comme complété
            await db.execute(
                "UPDATE pending_events SET status = 'completed' WHERE id = $1",
                event.id
            )
            logger.info(f"Pending event {event.id} successfully published to Redis")

        except Exception as e:
            # Incrémenter les tentatives
            await db.execute("""
                UPDATE pending_events
                SET status = 'pending',
                    attempts = attempts + 1,
                    error_message = $2
                WHERE id = $1
            """, event.id, str(e))

    # Marquer les events avec trop de tentatives comme failed
    await db.execute("""
        UPDATE pending_events
        SET status = 'failed'
        WHERE status = 'pending' AND attempts >= 10
    """)

    # Alerter si des events sont en échec définitif
    failed_count = await db.fetchval(
        "SELECT COUNT(*) FROM pending_events WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour'"
    )
    if failed_count > 0:
        await alert_admin(f"⚠️ {failed_count} events en échec définitif dans pending_events")
```

#### 16.2.4 Commande admin de réconciliation

```python
# plugin-recipes/src/commands/formation_admin_commands.py

@bot.tree.command(name="formation-admin")
@app_commands.describe(action="Action admin")
@app_commands.choices(action=[
    app_commands.Choice(name="Sync", value="sync"),
    app_commands.Choice(name="Check", value="check"),
    app_commands.Choice(name="Repair", value="repair"),
])
@app_commands.checks.has_permissions(administrator=True)
async def formation_admin(
    interaction: discord.Interaction,
    action: str,
    force: bool = False,
):
    """Commandes admin pour la gestion des formations."""

    if action == "check":
        # Vérifie les désynchronisations sans corriger
        report = await check_formation_sync(interaction.guild)
        embed = discord.Embed(
            title="🔍 Rapport de synchronisation",
            color=0x3B82F6 if report.is_synced else 0xF59E0B,
        )
        embed.add_field(
            name="Promotions",
            value=f"✅ Sync: {report.synced_promotions}\n⚠️ Désync: {report.desynced_promotions}",
        )
        embed.add_field(
            name="Rôles",
            value=f"✅ OK: {report.valid_roles}\n❌ Manquants: {report.missing_roles}",
        )
        embed.add_field(
            name="Channels",
            value=f"✅ OK: {report.valid_channels}\n❌ Manquants: {report.missing_channels}",
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)

    elif action == "sync":
        # Synchronise API → Discord
        if not force:
            # Confirmation requise
            view = ConfirmSyncView()
            await interaction.response.send_message(
                "⚠️ Cette action va synchroniser toutes les formations.\n"
                "Utilisez `force:True` pour exécuter sans confirmation.",
                view=view,
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True)
        result = await sync_formations(interaction.guild)
        await interaction.followup.send(
            f"✅ Synchronisation terminée\n"
            f"- Promotions créées: {result.created}\n"
            f"- Rôles réparés: {result.roles_fixed}\n"
            f"- Channels réparés: {result.channels_fixed}"
        )

    elif action == "repair":
        # Répare les éléments manquants
        await interaction.response.defer(ephemeral=True)
        result = await repair_formation_structure(interaction.guild)
        await interaction.followup.send(
            f"🔧 Réparation terminée\n"
            f"- Rôles créés: {result.roles_created}\n"
            f"- Channels créés: {result.channels_created}\n"
            f"- Permissions corrigées: {result.permissions_fixed}"
        )


async def check_formation_sync(guild: discord.Guild) -> SyncReport:
    """Vérifie la synchronisation API ↔ Discord."""
    # Récupérer les promotions depuis l'API
    api_promotions = await api.get_promotions(guild.id)

    report = SyncReport()

    for promo in api_promotions:
        # Vérifier la catégorie Discord
        category = guild.get_channel(int(promo.category_id)) if promo.category_id else None
        if not category:
            report.desynced_promotions += 1
            report.missing_channels += 1
            continue

        # Vérifier le rôle
        role = guild.get_role(int(promo.role_id)) if promo.role_id else None
        if not role:
            report.missing_roles += 1
        else:
            report.valid_roles += 1

        # Vérifier les channels des matières
        for matiere in promo.matieres:
            channel = guild.get_channel(int(matiere.channel_id)) if matiere.channel_id else None
            if not channel:
                report.missing_channels += 1
            else:
                report.valid_channels += 1

        report.synced_promotions += 1

    report.is_synced = (report.missing_roles == 0 and report.missing_channels == 0)
    return report
```

### 16.3 Checklist finale RFC-023

#### Infrastructure critique (P0)
- [ ] `ResilientEventPublisher` implémenté
- [ ] Table `pending_events` créée
- [ ] Cron `process-pending-events` configuré
- [ ] `RedisStreamSubscriber` avec consumer groups
- [ ] Idempotence des handlers (vérification promotion existante)
- [ ] Saga pattern avec rollback pour création structure

#### Fonctionnel (P1)
- [ ] `FormationSetupService` complet
- [ ] `FormationEventSubscriber` avec tous les handlers
- [ ] Rate limiter Discord intégré
- [ ] Commande `/formation-admin sync`
- [ ] Commande `/formation-admin check`
- [ ] Commande `/formation-admin repair`

#### Qualité (P2)
- [ ] JSON Schema des events défini
- [ ] Tests unitaires services
- [ ] Tests intégration avec mock Discord
- [ ] Documentation des procédures de fallback

### 16.4 Métriques de monitoring recommandées

```python
# Métriques Prometheus à exposer

from prometheus_client import Counter, Gauge, Histogram

# Compteurs events
formation_events_published = Counter(
    "formation_events_published_total",
    "Events formation publiés",
    ["event_type", "publish_method"]  # method: redis, memory_queue, db_fallback
)

formation_events_processed = Counter(
    "formation_events_processed_total",
    "Events formation traités",
    ["event_type", "status"]  # status: success, failed
)

# Jauge fallback
formation_fallback_active = Gauge(
    "formation_fallback_active",
    "Indique si le fallback est actif",
    ["fallback_type"]  # type: memory_queue, db
)

formation_pending_events_count = Gauge(
    "formation_pending_events_count",
    "Nombre d'events en attente dans le fallback DB"
)

# Histogramme latence
formation_structure_creation_duration = Histogram(
    "formation_structure_creation_duration_seconds",
    "Durée de création d'une structure promotion",
    buckets=[1, 2, 5, 10, 20, 30, 60, 120]
)

# Alertes recommandées
ALERTS = {
    "formation_fallback_active == 1": "WARNING: Formation event fallback activated",
    "formation_pending_events_count > 100": "CRITICAL: Too many pending formation events",
    "rate(formation_events_processed{status='failed'}[5m]) > 0.1": "WARNING: High failure rate",
}
```

### 16.5 Questions résolues

| Question initiale | Réponse |
|-------------------|---------|
| 10.1 Multi-tenant (plusieurs serveurs/CFA) | Oui, `guild_id` sur toutes les tables |
| 10.2 Migration formations existantes | Via commande `/formation-admin sync` |
| 10.3 Templates de matières | Dans plugin-recipes (YAML) |
| 10.4 Quotas promotions | 45 max par formation (limite Discord 50 - marge) |
| 14.4.1 Multi-instance | Consumer groups Redis Streams |
| 14.4.2 Timeout events | 24h max, puis DLQ |
| 14.4.3 Monitoring | Métriques Prometheus (section 16.4) |

### 16.6 Statut final

```
RFC-023 : Formation Management System
─────────────────────────────────────
Statut        : ✅ APPROVED - Prêt pour implémentation
Version       : 1.0
Approuvé par  : chatbot-core, plugin-recipes, API, n8n
Date          : 2026-02-05

Prochaines étapes :
1. API : Tables Formation/Promotion/Matiere + pending_events
2. chatbot-core : ResilientEventPublisher + FormationSetupService
3. n8n : Workflows formation-* + process-pending-events
4. plugin-recipes : FormationApiClient + commandes
```
