# RFC-024 : Stratégie de Branding Discord

| Métadonnée | Valeur |
|------------|--------|
| **Numéro** | RFC-024 |
| **Titre** | Discord Branding Strategy |
| **Statut** | Draft |
| **Auteur** | Équipe chatbot-core |
| **Date** | 2026-02-04 |
| **Dépendances** | RFC-022 (Learning System), RFC-023 (Formation Management) |
| **Équipes concernées** | chatbot-core, plugin-recipes, design |

---

## 1. Résumé

Ce RFC définit la stratégie de branding et de personnalisation visuelle sur Discord pour les produits éducatifs (Azy Education, Bot Appetit). Il documente les **limitations techniques de Discord** et propose des solutions pour créer une expérience de marque cohérente malgré ces contraintes.

### 1.1 Constat principal

> **Discord n'est pas un outil de design, c'est un socle conversationnel.**

La personnalisation visuelle (fonds, couleurs par salon) est impossible. La stratégie doit donc être :

> **"Discord comme OS, Bot comme UI"**

Le bot remplace le design graphique par du contenu riche et structuré.

### 1.2 Objectifs

1. **Documenter** les limitations Discord pour éviter les attentes irréalistes
2. **Définir** les leviers de branding disponibles
3. **Standardiser** les templates de serveur pour industrialiser le déploiement
4. **Implémenter** les services chatbot-core nécessaires

---

## 2. Limitations Discord

### 2.1 Ce qui est IMPOSSIBLE ❌

| Fonctionnalité | Statut | Détail |
|----------------|--------|--------|
| Fond personnalisé par salon | ❌ | Le fond dépend du thème utilisateur (sombre/clair) |
| Couleurs par catégorie | ❌ | Pas de personnalisation visuelle des catégories |
| Image de fond par serveur | ❌ | Seule la bannière du serveur est personnalisable |
| Thème graphique global | ❌ | Contrairement à Slack, Notion ou un LMS |
| CSS personnalisé | ❌ | Pas d'injection de styles |
| Police personnalisée | ❌ | Police Discord uniquement |

### 2.2 Ce qui est POSSIBLE ✅

| Fonctionnalité | Statut | Détail |
|----------------|--------|--------|
| Templates de serveur | ✅ | Structure, salons, rôles, permissions |
| Écran d'accueil | ✅ | Guide des premiers pas (fonctionnel, pas graphique) |
| Bannière serveur | ✅ | Image en haut du serveur (Nitro Boost niveau 2) |
| Icône serveur | ✅ | Logo rond du serveur |
| Embeds colorés | ✅ | Messages riches avec couleur, titre, image |
| Emojis personnalisés | ✅ | Jusqu'à 50 emojis (250 avec Nitro) |
| Stickers personnalisés | ✅ | Avec Nitro Boost |
| Noms de salons avec emojis | ✅ | Structuration visuelle |

---

## 3. Stratégie de branding

### 3.1 Principe fondamental

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DISCORD = INFRASTRUCTURE                         │
│                                                                      │
│   Le salon reste neutre        Le CONTENU devient l'interface       │
│   (fond non personnalisable)   (embeds, boutons, messages riches)   │
│                                                                      │
│          ┌──────────────────────────────────────────────┐           │
│          │                                              │           │
│          │    📘 BIENVENUE                              │           │
│          │    ──────────────────────────────────        │           │
│          │    Bienvenue dans votre formation !          │           │
│          │                                              │           │
│          │    🎯 Votre progression : 45%                │           │
│          │    ████████████░░░░░░░░░░                    │           │
│          │                                              │           │
│          │    [Continuer le cours] [Voir mes badges]    │           │
│          │                                              │           │
│          └──────────────────────────────────────────────┘           │
│                           ▲                                          │
│                           │                                          │
│                    EMBED DU BOT                                      │
│              (couleur, structure, boutons)                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Les 4 piliers du branding Discord

```
                    ┌─────────────────────┐
                    │   BRANDING DISCORD  │
                    └──────────┬──────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  STRUCTURE  │         │   CONTENU   │         │ INTERACTION │
├─────────────┤         ├─────────────┤         ├─────────────┤
│ Templates   │         │ Embeds      │         │ Boutons     │
│ Catégories  │         │ Messages    │         │ Menus       │
│ Noms salons │         │ Images      │         │ Réactions   │
│ Emojis      │         │ Couleurs    │         │ Modals      │
└─────────────┘         └─────────────┘         └─────────────┘
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    EXPÉRIENCE DE    │
                    │       MARQUE        │
                    └─────────────────────┘
```

---

## 4. Templates de serveur

### 4.1 Concept

Discord permet de créer des **templates de serveur** qui capturent :
- Structure des catégories
- Salons (texte, vocal, forum, annonces)
- Rôles et permissions
- Salons système (règlement, annonces)

### 4.2 Templates proposés pour Azy Education

| Template | Usage | Catégories |
|----------|-------|------------|
| `azy-formation-courte` | Formations < 1 mois | Accueil, Cours, Quiz, Support |
| `azy-parcours-long` | Formations > 3 mois | + Projets, Mentorat, Alumni |
| `azy-promo-cfa` | CFA/Apprentissage | + Entreprise, Alternance |
| `azy-communaute` | Alumni, networking | Discussions, Événements, Offres |
| `azy-coaching` | Coaching 1-N | Privé, Sessions, Ressources |

### 4.3 Structure type : `azy-formation-courte`

```
📘 DÉMARRER ICI
├── #bienvenue           → Message d'accueil (embed bot)
├── #reglement           → Règles de la communauté
└── #presentez-vous      → Icebreaker

📚 COURS & CONTENUS
├── #module-1            → Premier module
├── #module-2            → Deuxième module
├── #ressources          → Documents, liens
└── 📁 forum-questions   → Forum pour Q&A

🧠 PRATIQUES & QUIZ
├── #exercices           → Exercices pratiques
├── #quiz                → Quiz interactifs (bot)
└── #corrections         → Corrections et feedback

🤖 ASSISTANT IA
├── #assistant           → Canal du bot IA
└── #aide                → Support technique

🎯 SUIVI & PROGRESSION
├── #leaderboard         → Classement XP
├── #badges              → Annonces badges
└── #certificats         → Attestations

🔊 SESSIONS LIVE
├── 🔊 salle-cours       → Vocal pour cours
├── 🔊 salle-travail     → Vocal coworking
└── 🔊 pause-cafe        → Vocal informel
```

### 4.4 Conventions de nommage

| Élément | Convention | Exemple |
|---------|------------|---------|
| Catégorie | Emoji + MAJUSCULES | `📚 COURS & CONTENUS` |
| Salon texte | kebab-case | `#module-1`, `#quiz` |
| Salon vocal | Emoji + Titre | `🔊 salle-cours` |
| Forum | Préfixe `forum-` | `📁 forum-questions` |
| Rôle promo | Formation-Année | `@Master-2024` |
| Rôle niveau | Niveau + Titre | `@Niveau-5-Sous-Chef` |

---

## 5. Branding par embeds

### 5.1 Palette de couleurs Azy Education

```python
# chatbot_core/services/branding/colors.py

class AzyColors:
    """Palette de couleurs pour les embeds Azy Education."""

    # Couleurs principales
    PRIMARY = 0x6366F1      # Indigo - Actions principales
    SECONDARY = 0x8B5CF6    # Violet - Secondaire

    # Couleurs sémantiques
    SUCCESS = 0x22C55E      # Vert - Succès, validations
    WARNING = 0xF59E0B      # Orange - Attention
    ERROR = 0xEF4444        # Rouge - Erreurs
    INFO = 0x3B82F6         # Bleu - Information

    # Couleurs gamification
    XP_GAIN = 0xFBBF24      # Or - XP gagné
    LEVEL_UP = 0xA855F7     # Violet - Level up
    BADGE_COMMON = 0x9CA3AF # Gris - Badge commun
    BADGE_RARE = 0x3B82F6   # Bleu - Badge rare
    BADGE_EPIC = 0x8B5CF6   # Violet - Badge épique
    BADGE_LEGENDARY = 0xF59E0B  # Or - Badge légendaire

    # Couleurs par module
    MODULE_1 = 0x6366F1     # Indigo
    MODULE_2 = 0x8B5CF6     # Violet
    MODULE_3 = 0xEC4899     # Rose
    MODULE_4 = 0x14B8A6     # Teal
```

### 5.2 Templates d'embeds

```python
# chatbot_core/services/branding/embed_templates.py

class EmbedTemplates:
    """Templates d'embeds standardisés pour le branding."""

    @staticmethod
    def welcome_embed(
        user_name: str,
        formation_name: str,
        steps: list[str],
    ) -> discord.Embed:
        """Embed de bienvenue personnalisé."""
        embed = discord.Embed(
            title=f"👋 Bienvenue {user_name} !",
            description=f"Tu as rejoint **{formation_name}**",
            color=AzyColors.PRIMARY,
        )

        # Étapes de démarrage
        steps_text = "\n".join(f"{'✅' if i == 0 else '⬜'} {step}" for i, step in enumerate(steps))
        embed.add_field(
            name="🚀 Tes premiers pas",
            value=steps_text,
            inline=False,
        )

        embed.set_footer(text="Azy Education • Ton parcours commence ici")
        return embed

    @staticmethod
    def progress_embed(
        user_name: str,
        progress_percent: int,
        xp_current: int,
        xp_next_level: int,
        level: int,
        level_title: str,
    ) -> discord.Embed:
        """Embed de progression."""
        # Barre de progression visuelle
        filled = int(progress_percent / 10)
        bar = "█" * filled + "░" * (10 - filled)

        embed = discord.Embed(
            title=f"📊 Progression de {user_name}",
            color=AzyColors.PRIMARY,
        )

        embed.add_field(
            name=f"Niveau {level} • {level_title}",
            value=f"`{bar}` {progress_percent}%\n{xp_current:,} / {xp_next_level:,} XP",
            inline=False,
        )

        return embed

    @staticmethod
    def module_embed(
        module_number: int,
        module_title: str,
        description: str,
        lessons: list[dict],
        completed: int,
    ) -> discord.Embed:
        """Embed de module de cours."""
        colors = [
            AzyColors.MODULE_1,
            AzyColors.MODULE_2,
            AzyColors.MODULE_3,
            AzyColors.MODULE_4,
        ]
        color = colors[(module_number - 1) % len(colors)]

        embed = discord.Embed(
            title=f"📘 Module {module_number} : {module_title}",
            description=description,
            color=color,
        )

        # Liste des leçons
        lessons_text = ""
        for i, lesson in enumerate(lessons, 1):
            status = "✅" if i <= completed else "⬜"
            lessons_text += f"{status} **{i}.** {lesson['title']}\n"

        embed.add_field(
            name=f"📚 Leçons ({completed}/{len(lessons)})",
            value=lessons_text or "Aucune leçon",
            inline=False,
        )

        return embed
```

### 5.3 Message d'accueil type

```python
# Exemple de message d'accueil posté par le bot

async def post_welcome_message(channel: discord.TextChannel, config: WelcomeConfig):
    """Poste le message d'accueil dans #bienvenue."""

    embed = discord.Embed(
        title="🎓 Bienvenue dans votre espace de formation !",
        description=(
            "Vous êtes sur le serveur Discord de votre formation.\n"
            "Ici, vous trouverez vos cours, exercices, et pourrez "
            "échanger avec vos formateurs et camarades."
        ),
        color=AzyColors.PRIMARY,
    )

    embed.add_field(
        name="🚀 Pour commencer",
        value=(
            "1️⃣ Lisez le #reglement\n"
            "2️⃣ Présentez-vous dans #presentez-vous\n"
            "3️⃣ Accédez à vos cours dans 📚 COURS & CONTENUS\n"
            "4️⃣ Posez vos questions à l'assistant dans #assistant"
        ),
        inline=False,
    )

    embed.add_field(
        name="🏆 Système de progression",
        value=(
            "Gagnez de l'XP en complétant des leçons et quiz.\n"
            "Débloquez des badges et montez dans le classement !"
        ),
        inline=False,
    )

    embed.set_image(url=config.banner_url)  # Image de bannière
    embed.set_footer(
        text="Azy Education",
        icon_url=config.logo_url,
    )

    # Boutons d'action
    view = WelcomeView()

    await channel.send(embed=embed, view=view)
```

---

## 6. Services chatbot-core

### 6.1 Nouveaux services à implémenter

| Service | Fichier | Description |
|---------|---------|-------------|
| `BrandingService` | `services/branding/branding_service.py` | Gestion des couleurs et templates |
| `EmbedTemplates` | `services/branding/embed_templates.py` | Templates d'embeds standardisés |
| `ServerTemplateService` | `services/branding/server_template.py` | Application des templates serveur |
| `OnboardingService` | `services/branding/onboarding.py` | Parcours d'accueil des nouveaux membres |

### 6.2 BrandingService

```python
# chatbot_core/services/branding/branding_service.py

@dataclass
class BrandingConfig:
    """Configuration de branding pour un guild."""

    # Identité
    name: str
    logo_url: str | None = None
    banner_url: str | None = None

    # Couleurs
    primary_color: int = AzyColors.PRIMARY
    secondary_color: int = AzyColors.SECONDARY
    success_color: int = AzyColors.SUCCESS
    error_color: int = AzyColors.ERROR

    # Emojis personnalisés
    emoji_success: str = "✅"
    emoji_error: str = "❌"
    emoji_warning: str = "⚠️"
    emoji_info: str = "ℹ️"
    emoji_xp: str = "⭐"
    emoji_level: str = "🎯"

    # Footer
    footer_text: str = "Azy Education"


class BrandingService:
    """
    Service de gestion du branding par guild.
    Stocke les configurations en Redis avec cache.
    """

    REDIS_KEY_PREFIX = "branding"
    CACHE_TTL = 3600  # 1 heure

    def __init__(self, redis: BaseRedisService):
        self.redis = redis
        self._cache: dict[int, BrandingConfig] = {}

    async def get_config(self, guild_id: int) -> BrandingConfig:
        """Récupère la config de branding (avec cache)."""
        if guild_id in self._cache:
            return self._cache[guild_id]

        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}"
        data = await self.redis.get(key)

        if data:
            config = BrandingConfig(**json.loads(data))
        else:
            config = BrandingConfig(name="Formation")  # Défaut

        self._cache[guild_id] = config
        return config

    async def set_config(self, guild_id: int, config: BrandingConfig) -> None:
        """Sauvegarde la config de branding."""
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}"
        await self.redis.set(key, json.dumps(asdict(config)), ex=self.CACHE_TTL)
        self._cache[guild_id] = config

    def create_embed(
        self,
        config: BrandingConfig,
        title: str,
        description: str | None = None,
        color_type: str = "primary",
    ) -> discord.Embed:
        """Crée un embed avec le branding appliqué."""
        colors = {
            "primary": config.primary_color,
            "secondary": config.secondary_color,
            "success": config.success_color,
            "error": config.error_color,
        }

        embed = discord.Embed(
            title=title,
            description=description,
            color=colors.get(color_type, config.primary_color),
        )

        embed.set_footer(
            text=config.footer_text,
            icon_url=config.logo_url,
        )

        return embed
```

### 6.3 OnboardingService

```python
# chatbot_core/services/branding/onboarding.py

@dataclass
class OnboardingStep:
    """Étape du parcours d'onboarding."""
    id: str
    title: str
    description: str
    action: str  # "read_channel", "post_message", "react", "complete_profile"
    target_channel: str | None = None
    required: bool = True


@dataclass
class OnboardingConfig:
    """Configuration du parcours d'onboarding."""
    steps: list[OnboardingStep]
    welcome_channel_id: int | None = None
    completion_role_id: int | None = None  # Rôle donné après complétion
    completion_xp: int = 50  # XP gagné après complétion


class OnboardingService:
    """
    Service de gestion du parcours d'onboarding des nouveaux membres.
    """

    REDIS_KEY_PREFIX = "onboarding"

    def __init__(
        self,
        redis: BaseRedisService,
        branding: BrandingService,
    ):
        self.redis = redis
        self.branding = branding

    async def start_onboarding(
        self,
        guild_id: int,
        user_id: int,
        config: OnboardingConfig,
    ) -> None:
        """Démarre le parcours d'onboarding pour un utilisateur."""
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}:{user_id}"

        progress = {
            "started_at": datetime.utcnow().isoformat(),
            "completed_steps": [],
            "current_step": 0,
        }

        await self.redis.set(key, json.dumps(progress))

    async def complete_step(
        self,
        guild_id: int,
        user_id: int,
        step_id: str,
    ) -> bool:
        """Marque une étape comme complétée. Retourne True si onboarding terminé."""
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}:{user_id}"
        data = await self.redis.get(key)

        if not data:
            return False

        progress = json.loads(data)

        if step_id not in progress["completed_steps"]:
            progress["completed_steps"].append(step_id)
            progress["current_step"] += 1
            await self.redis.set(key, json.dumps(progress))

        # Vérifier si toutes les étapes sont complétées
        config = await self.get_config(guild_id)
        required_steps = [s.id for s in config.steps if s.required]

        return all(s in progress["completed_steps"] for s in required_steps)

    async def get_progress_embed(
        self,
        guild_id: int,
        user_id: int,
        user_name: str,
    ) -> discord.Embed:
        """Génère l'embed de progression d'onboarding."""
        branding_config = await self.branding.get_config(guild_id)
        onboarding_config = await self.get_config(guild_id)
        progress = await self.get_progress(guild_id, user_id)

        embed = self.branding.create_embed(
            branding_config,
            title=f"🚀 Bienvenue {user_name} !",
            description="Complète ces étapes pour bien démarrer.",
        )

        steps_text = ""
        for step in onboarding_config.steps:
            completed = step.id in progress.get("completed_steps", [])
            emoji = "✅" if completed else "⬜"
            steps_text += f"{emoji} **{step.title}**\n"
            if not completed:
                steps_text += f"   └ {step.description}\n"

        embed.add_field(
            name="📋 Tes étapes",
            value=steps_text,
            inline=False,
        )

        completed = len(progress.get("completed_steps", []))
        total = len(onboarding_config.steps)
        percent = int((completed / total) * 100) if total > 0 else 0

        bar = "█" * (percent // 10) + "░" * (10 - percent // 10)
        embed.add_field(
            name="📊 Progression",
            value=f"`{bar}` {percent}% ({completed}/{total})",
            inline=False,
        )

        return embed
```

---

## 7. Écran d'accueil Discord

### 7.1 Configuration recommandée

L'écran "Bienvenue" de Discord (Server Guide) est **fonctionnel, pas graphique**.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ÉCRAN D'ACCUEIL DISCORD                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Bienvenue sur [Nom Formation] !                                    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ✅ Lire le règlement                          #reglement    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ⬜ Se présenter                             #presentez-vous │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ⬜ Découvrir les cours                      #module-1       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ⬜ Poser une question à l'assistant          #assistant     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Limites

- Pas d'image personnalisée
- Pas de branding fort
- Pas de mise en page libre
- Guidage UX uniquement, pas design UI

### 7.3 Complémentarité Bot

Le bot compense les limites de l'écran d'accueil :

| Écran Discord | Bot |
|---------------|-----|
| Liste d'étapes | Embed riche avec progression |
| Texte simple | Couleurs, images, boutons |
| Statique | Interactif, personnalisé |
| Générique | Adapté au parcours utilisateur |

---

## 8. Résumé stratégique

### 8.1 Ce que nous vendons

> ❌ **Pas** "Un Discord joli"

> ✅ **Un parcours structuré, guidé, interactif, piloté par des bots**

### 8.2 Tableau récapitulatif

| Question | Réponse |
|----------|---------|
| Personnaliser le fond d'un salon | ❌ Non |
| Fond différent par catégorie | ❌ Non |
| Templates de serveur | ✅ Oui |
| Structuration pédagogique | ✅ Oui |
| Branding via bots / embeds | ✅ Oui |
| Expérience guidée type LMS | ✅ Oui (par le contenu, pas le fond) |

### 8.3 Équation de la valeur

```
Valeur Azy = Structure (Templates)
           + Contenu (Embeds riches)
           + Interaction (Boutons, menus)
           + Intelligence (Bot IA, gamification)
```

---

## 9. Plan d'implémentation

### Phase 1 : Services de base (chatbot-core v0.7.4)

- [ ] `AzyColors` - Palette de couleurs
- [ ] `BrandingConfig` - Configuration par guild
- [ ] `BrandingService` - Gestion du branding
- [ ] `EmbedTemplates` - Templates d'embeds

### Phase 2 : Onboarding (chatbot-core v0.7.5)

- [ ] `OnboardingConfig` - Configuration du parcours
- [ ] `OnboardingService` - Gestion de l'onboarding
- [ ] `OnboardingView` - UI avec boutons
- [ ] Intégration avec `MemberJoinService` (RFC-006)

### Phase 3 : Templates serveur (plugin-recipes)

- [ ] Template `azy-formation-courte`
- [ ] Template `azy-parcours-long`
- [ ] Template `azy-promo-cfa`
- [ ] Documentation création de templates

### Phase 4 : Commandes admin (plugin-recipes)

- [ ] `/branding set` - Configurer le branding
- [ ] `/branding preview` - Prévisualiser
- [ ] `/onboarding setup` - Configurer l'onboarding
- [ ] `/template apply` - Appliquer un template

---

## 10. Références

- [RFC-022 : Learning System](./RFC-022-LEARNING-SYSTEM.md)
- [RFC-023 : Formation Management](./RFC-023-FORMATION-MANAGEMENT-SYSTEM.md)
- [Système de Pagination](../issues/PAGINATION-SYSTEM.md)
- [Discord Server Templates](https://support.discord.com/hc/en-us/articles/360041033511)
- [Discord Embed Limits](https://discord.com/developers/docs/resources/channel#embed-limits)

---

*Document créé le 2026-02-04*
*Statut : Draft - En attente de review*

---

## 11. Review technique (2026-02-05)

> **Reviewer:** Claude Code
> **Statut:** Review avec points critiques

### 11.1 Problèmes critiques 🔴

#### 11.1.1 Cache mémoire sans invalidation

```python
self._cache: dict[int, BrandingConfig] = {}
```

**Problèmes :**
- Pas de TTL sur le cache mémoire (reste indéfiniment)
- Pas d'invalidation quand la config Redis change
- Multi-instance : si deux pods tournent, leurs caches divergent après un `set_config()`

**Recommandation :**
```python
from cachetools import TTLCache

class BrandingService:
    def __init__(self, redis: BaseRedisService):
        self.redis = redis
        # Cache avec TTL de 5 minutes max
        self._cache: TTLCache[int, BrandingConfig] = TTLCache(maxsize=1000, ttl=300)

    async def set_config(self, guild_id: int, config: BrandingConfig) -> None:
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}"
        await self.redis.set(key, json.dumps(asdict(config)))
        # Invalider le cache local
        self._cache.pop(guild_id, None)
        # Publier event pour invalider les autres instances
        await self.redis.publish(
            "branding:invalidate",
            json.dumps({"guild_id": guild_id})
        )
```

#### 11.1.2 Méthodes manquantes dans OnboardingService

Le code appelle des méthodes non définies :
```python
config = await self.get_config(guild_id)  # ← Non implémenté
progress = await self.get_progress(guild_id, user_id)  # ← Non implémenté
```

**Recommandation :** Compléter l'implémentation :
```python
class OnboardingService:
    REDIS_CONFIG_PREFIX = "onboarding:config"

    async def get_config(self, guild_id: int) -> OnboardingConfig:
        """Récupère la configuration d'onboarding du guild."""
        key = f"{self.REDIS_CONFIG_PREFIX}:{guild_id}"
        data = await self.redis.get(key)
        if not data:
            return self._get_default_config()
        return OnboardingConfig(**json.loads(data))

    async def get_progress(self, guild_id: int, user_id: int) -> dict:
        """Récupère la progression d'onboarding d'un utilisateur."""
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}:{user_id}"
        data = await self.redis.get(key)
        if not data:
            return {"completed_steps": [], "current_step": 0}
        return json.loads(data)

    def _get_default_config(self) -> OnboardingConfig:
        """Configuration par défaut si non définie."""
        return OnboardingConfig(
            steps=[
                OnboardingStep(
                    id="read_rules",
                    title="Lire le règlement",
                    description="Consulte #reglement",
                    action="read_channel",
                    target_channel="reglement",
                ),
                OnboardingStep(
                    id="introduce",
                    title="Se présenter",
                    description="Poste un message dans #presentez-vous",
                    action="post_message",
                    target_channel="presentez-vous",
                ),
            ]
        )
```

#### 11.1.3 Pas de protocoles pour les tests

RFC-023 (section 12.6) exige des protocols pour le mocking. RFC-024 n'en définit aucun.

**Recommandation :**
```python
# chatbot_core/services/branding/protocols.py

from typing import Protocol

class BrandingServiceProtocol(Protocol):
    async def get_config(self, guild_id: int) -> BrandingConfig: ...
    async def set_config(self, guild_id: int, config: BrandingConfig) -> None: ...
    def create_embed(
        self,
        config: BrandingConfig,
        title: str,
        description: str | None = None,
        color_type: str = "primary",
    ) -> discord.Embed: ...


class OnboardingServiceProtocol(Protocol):
    async def start_onboarding(
        self, guild_id: int, user_id: int, config: OnboardingConfig
    ) -> None: ...
    async def complete_step(
        self, guild_id: int, user_id: int, step_id: str
    ) -> bool: ...
    async def get_progress_embed(
        self, guild_id: int, user_id: int, user_name: str
    ) -> discord.Embed: ...
```

#### 11.1.4 Scope confus : RFC technique vs document marketing

La section 8 "Ce que nous vendons" mélange les audiences :
- Sections 1-7 : Technique (pour développeurs)
- Section 8 : Marketing (pour commerciaux/clients)

**Recommandation :** Séparer en deux documents :
- `RFC-024-DISCORD-BRANDING-STRATEGY.md` → Pure technique
- `docs/marketing/BRANDING-VALUE-PROPOSITION.md` → Argumentaire commercial

### 11.2 Points d'attention 🟠

#### 11.2.1 Dépendances Nitro Boost implicites

| Fonctionnalité | Prérequis | Conséquence si absent |
|----------------|-----------|----------------------|
| Bannière serveur | Nitro Boost niveau 2 | Pas de bannière |
| > 50 emojis custom | Nitro Boost niveau 1 | Limité à 50 |
| Stickers custom | Nitro Boost niveau 1 | Pas de stickers |
| Icône animée | Nitro Boost niveau 1 | Icône statique |

**Recommandation :** Ajouter une section "Mode dégradé" :
```python
class BrandingService:
    async def get_available_features(self, guild: discord.Guild) -> dict:
        """Retourne les features disponibles selon le niveau Nitro."""
        boost_level = guild.premium_tier
        return {
            "banner": boost_level >= 2,
            "custom_emojis_extended": boost_level >= 1,
            "stickers": boost_level >= 1,
            "animated_icon": boost_level >= 1,
        }
```

#### 11.2.2 Palette `AzyColors` hardcodée vs `BrandingConfig`

Incohérence : `EmbedTemplates` utilise directement `AzyColors` alors que `BrandingConfig` permet la personnalisation.

```python
# ❌ Actuel - hardcodé
color=AzyColors.PRIMARY

# ✅ Recommandé - configurable
color=config.primary_color
```

**Recommandation :** Refactorer `EmbedTemplates` pour accepter `BrandingConfig` :
```python
class EmbedTemplates:
    @staticmethod
    def welcome_embed(
        config: BrandingConfig,  # ← Ajouter en paramètre
        user_name: str,
        formation_name: str,
        steps: list[str],
    ) -> discord.Embed:
        embed = discord.Embed(
            title=f"👋 Bienvenue {user_name} !",
            description=f"Tu as rejoint **{formation_name}**",
            color=config.primary_color,  # ← Utiliser config
        )
        embed.set_footer(
            text=config.footer_text,  # ← Utiliser config
            icon_url=config.logo_url,
        )
        return embed
```

#### 11.2.3 Accessibilité non mentionnée

| Élément | Problème | Impact |
|---------|----------|--------|
| Barres `████████░░` | Illisible par lecteurs d'écran | Utilisateurs malvoyants |
| Emojis seuls (✅/⬜) | Pas d'alternative textuelle | Lecteurs d'écran |
| Couleurs seules | Daltonisme | 8% des hommes |

**Recommandation :**
```python
def progress_bar(percent: int, show_text: bool = True) -> str:
    """Barre de progression accessible."""
    filled = int(percent / 10)
    bar = "█" * filled + "░" * (10 - filled)
    if show_text:
        return f"`{bar}` {percent}%"  # Texte toujours présent
    return bar

def status_emoji(completed: bool) -> str:
    """Emoji de statut avec alternative textuelle."""
    return "✅ Fait" if completed else "⬜ À faire"
```

#### 11.2.4 Onboarding : persistence et cycle de vie

| Scénario | Comportement actuel | Problème |
|----------|---------------------|----------|
| User quitte et revient après 6 mois | Reprend l'onboarding en cours | Peut être périmé |
| User veut recommencer | Pas de reset | Bloqué |
| Admin veut voir les stats | Pas d'API | Pas de visibilité |

**Recommandation :**
```python
class OnboardingService:
    ONBOARDING_EXPIRY_DAYS = 30  # Expire après 30 jours d'inactivité

    async def reset_onboarding(self, guild_id: int, user_id: int) -> None:
        """Réinitialise l'onboarding d'un utilisateur."""
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}:{user_id}"
        await self.redis.delete(key)

    async def get_stats(self, guild_id: int) -> dict:
        """Stats d'onboarding pour les admins."""
        pattern = f"{self.REDIS_KEY_PREFIX}:{guild_id}:*"
        keys = await self.redis.keys(pattern)
        total = len(keys)
        completed = 0
        for key in keys:
            data = await self.redis.get(key)
            if data:
                progress = json.loads(data)
                if self._is_completed(progress):
                    completed += 1
        return {
            "total_started": total,
            "completed": completed,
            "completion_rate": completed / total if total > 0 else 0,
        }
```

### 11.3 Liens manquants avec RFC-023

#### 11.3.1 Onboarding ↔ Formation

Quand un membre est ajouté à une promotion (RFC-023), l'onboarding devrait démarrer automatiquement.

**Recommandation :** Event chain :
```
formation.member.added → formation:events:{guild_id}
        ↓
chatbot-core FormationEventSubscriber
        ↓
OnboardingService.start_onboarding()
```

#### 11.3.2 Branding par formation

Une formation pourrait avoir son propre branding (couleur, emoji). Non prévu actuellement.

**Recommandation :** Étendre `BrandingConfig` :
```python
@dataclass
class FormationBrandingConfig:
    """Branding spécifique à une formation (override du guild)."""
    formation_id: str
    primary_color: int | None = None  # None = utiliser guild default
    emoji: str = "🎓"
    banner_url: str | None = None
```

### 11.4 ~~Channel Redis non défini~~ ✅ RÉSOLU

> **Résolu (section 13.3.1) :** Pas de nouveau stream `branding:events`. Réutiliser les streams existants.

| Scénario | Solution |
|----------|----------|
| Config branding modifiée | Pub/Sub `branding:invalidate` (signal interne) |
| Onboarding complété | Stream `learning:events:stream` (award XP via LearningHandlers) |
| Template appliqué | Synchrone (pas d'event nécessaire) |

**Alignement avec RFC-023 :** Les events métier utilisent Redis Streams (pas Pub/Sub).

### 11.5 Recommandations d'implémentation

| Priorité | Action | Équipe |
|----------|--------|--------|
| 🔴 P0 | Implémenter invalidation du cache | chatbot-core |
| 🔴 P0 | Compléter `OnboardingService` (méthodes manquantes) | chatbot-core |
| 🔴 P0 | Ajouter protocols pour testing | chatbot-core |
| 🟠 P1 | Refactorer `EmbedTemplates` avec `BrandingConfig` | chatbot-core |
| 🟠 P1 | Ajouter lien onboarding ↔ formation | chatbot-core |
| 🟠 P1 | Documenter contraintes Nitro Boost | docs |
| 🟡 P2 | Améliorer accessibilité des embeds | chatbot-core |
| 🟡 P2 | Séparer contenu marketing | docs |

### 11.6 Questions en suspens

1. **Branding par formation ?** Une formation peut-elle override le branding du guild ?
2. **Templates versionés ?** Comment gérer les serveurs créés avec template v1 quand v2 sort ?
3. **Métriques onboarding ?** Dashboard admin pour voir les taux de complétion ?
4. **Multi-langue ?** Les textes dans `EmbedTemplates` sont en français. Support i18n prévu ?

---

## 12. Contraintes techniques Discord

> Référence croisée avec RFC-023 Annexe A pour les rate limits.

### 12.1 Limites structurelles

| Élément | Limite | Impact |
|---------|--------|--------|
| Catégories par serveur | 50 | Max 50 formations/promos visibles |
| Channels par catégorie | 50 | Max 50 matières par promo |
| Channels par serveur | 500 | Limite totale |
| Rôles par serveur | 250 | Attention si beaucoup de promos |
| Emojis custom (sans boost) | 50 | Branding limité |
| Emojis custom (boost lv1) | 100 | |
| Emojis custom (boost lv2) | 150 | |
| Emojis custom (boost lv3) | 250 | |

### 12.2 Limites de contenu

| Élément | Limite |
|---------|--------|
| Embed title | 256 caractères |
| Embed description | 4096 caractères |
| Embed field name | 256 caractères |
| Embed field value | 1024 caractères |
| Embed fields | 25 max |
| Embed footer | 2048 caractères |
| Total embed | 6000 caractères |
| Embeds par message | 10 |

### 12.3 Agent de surveillance recommandé

Pour éviter les problèmes de limites et rate limits, implémenter un agent de surveillance :

```python
class DiscordHealthMonitor:
    """Agent de surveillance des limites Discord."""

    THRESHOLDS = {
        "categories": {"warning": 40, "critical": 48},
        "channels_per_category": {"warning": 40, "critical": 48},
        "channels_total": {"warning": 400, "critical": 480},
        "roles": {"warning": 200, "critical": 240},
    }

    async def check_guild_health(self, guild: discord.Guild) -> HealthReport:
        """Vérifie les limites du guild."""
        report = HealthReport(guild_id=guild.id)

        # Catégories
        categories = len([c for c in guild.channels if isinstance(c, discord.CategoryChannel)])
        report.add_metric("categories", categories, self.THRESHOLDS["categories"])

        # Channels par catégorie
        for category in guild.categories:
            count = len(category.channels)
            if count >= self.THRESHOLDS["channels_per_category"]["warning"]:
                report.add_warning(
                    f"Catégorie '{category.name}' proche de la limite: {count}/50 channels"
                )

        # Rôles
        roles = len(guild.roles)
        report.add_metric("roles", roles, self.THRESHOLDS["roles"])

        return report

    async def run_periodic_check(self, guilds: list[discord.Guild]):
        """Check périodique avec alertes."""
        for guild in guilds:
            report = await self.check_guild_health(guild)
            if report.has_critical:
                await self._alert_critical(guild, report)
            elif report.has_warning:
                await self._alert_warning(guild, report)
```

**Workflow n8n `discord-health-monitor` :**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Cron      │────▶│  Check all  │────▶│  Filter     │────▶│  Alert      │
│  (hourly)   │     │   guilds    │     │  warnings   │     │  admins     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## Annexe A : Checklist pré-implémentation

- [ ] Cache avec TTL et invalidation implémenté
- [ ] Méthodes `get_config()` et `get_progress()` complétées
- [ ] Protocols définis pour testing
- [ ] `EmbedTemplates` refactoré avec `BrandingConfig`
- [ ] Contraintes Nitro Boost documentées
- [ ] Lien onboarding ↔ formation défini
- [x] ~~Channel Redis `branding:events`~~ → Non nécessaire, utiliser `learning:events:stream` (RFC-023)
- [ ] Tests unitaires pour chaque service
- [ ] Accessibilité des embeds vérifiée

---

## 13. Réponse plugin-recipes à la review technique (2026-02-05)

> **Équipe:** plugin-recipes
> **En réponse à:** Section 11

### 13.1 Points acceptés ✅

| Point | Section | Commentaire |
|-------|---------|-------------|
| Cache sans invalidation | 11.1.1 | Accepté - TTLCache + pub/sub invalidation |
| Méthodes manquantes | 11.1.2 | Accepté - Code à compléter avant merge |
| Protocols manquants | 11.1.3 | Accepté - Cohérent avec RFC-023 |
| Contraintes Nitro | 11.2.1 | Accepté - Documenter le mode dégradé |
| EmbedTemplates hardcodé | 11.2.2 | Accepté - Refactorer avec BrandingConfig |

### 13.2 Points reportés à v2

| Point | Section | Justification |
|-------|---------|---------------|
| Branding par formation | 11.3.2 | Complexité excessive pour v1. Un branding par guild suffit. |
| Accessibilité avancée | 11.2.3 | P2 - Améliorer progressivement |
| Templates versionnés | 11.6.2 | Besoin non confirmé, à évaluer après déploiement |

### 13.3 Contre-propositions

#### 13.3.1 Pas de nouveau stream Redis `branding:events`

> **Note :** Conformément à la décision RFC-023 (2026-02-05), les events métier utilisent **Redis Streams** (pas Pub/Sub).

La review propose `branding:events:{guild_id}`. Nous recommandons de **ne pas créer de nouveau stream**.

| Event proposé | Alternative |
|---------------|-------------|
| Config modifiée | Redis Pub/Sub `branding:invalidate` (signal interne, fire-and-forget OK) |
| Onboarding complété | Redis Stream `learning:events:stream` car XP = gamification |

**Justification :**
- Moins de consumers à maintenir
- Cohérence avec l'architecture existante (RFC-023)
- Onboarding complété → award XP → déjà géré par LearningHandlers

```python
# Event publié dans le stream learning (pas un nouveau stream)
await redis.xadd(
    "learning:events:stream",
    {"event": json.dumps({
        "event": "learning.xp.gained",
        "timestamp": "2026-02-05T10:30:00Z",
        "guild_id": "456",
        "data": {
            "user_id": "123",
            "amount": 50,
            "reason": "onboarding_completed",
        }
    })},
    maxlen=10000,
)
```

#### 13.3.2 Onboarding intégré dans MemberJoinService existant

La section 11.3.1 propose une event chain `formation.member.added → OnboardingService`.

**Contre-proposition :** Utiliser le `MemberJoinService` existant (RFC-006) :

```python
# Dans MemberJoinService (déjà existant)
async def on_member_join(self, member: discord.Member):
    # Logique existante...

    # Ajouter: démarrer onboarding si configuré
    if self.onboarding_enabled:
        await self.onboarding_service.start_onboarding(
            guild_id=member.guild.id,
            user_id=member.id,
        )
```

**Avantage :** Pas de nouvel event, réutilisation du service existant.

#### 13.3.3 Scope technique vs marketing (11.1.4)

D'accord pour séparer, mais pas dans un fichier marketing.

**Proposition :** Déplacer la section 8 vers `README.md` du repo principal ou `docs/guides/BRANDING-GUIDE.md`.

### 13.4 Réponses aux questions 11.6

| Question | Réponse plugin-recipes |
|----------|------------------------|
| **11.6.1 Branding par formation** | Non pour v1, à évaluer pour v2 |
| **11.6.2 Templates versionnés** | Non nécessaire initialement. Si besoin, migration manuelle via `/template upgrade` |
| **11.6.3 Dashboard onboarding** | Oui, commande `/onboarding stats` pour admins |
| **11.6.4 Multi-langue** | Oui, utiliser `I18nService` (déjà dans template 0.7.1) |

### 13.5 Implémentation côté plugin-recipes

#### Templates serveur (Phase 3)

Nous créerons les templates via l'API Discord :

```python
# plugin-recipes/src/commands/template_commands.py

@bot.tree.command(name="template")
async def template_command(interaction: discord.Interaction, action: str, name: str):
    """Gestion des templates serveur."""
    if action == "create":
        # Crée un template depuis la structure actuelle
        template = await interaction.guild.create_template(
            name=name,
            description=f"Template {name} créé par Azy Education"
        )
        await interaction.response.send_message(f"Template créé: {template.url}")

    elif action == "apply":
        # Applique un template (création de guild uniquement)
        # Note: Discord ne permet pas d'appliquer un template à un guild existant
        await interaction.response.send_message(
            "⚠️ Les templates Discord ne peuvent être appliqués qu'à la création d'un serveur.\n"
            "Utilisez `/formation setup` pour configurer ce serveur."
        )
```

#### Commandes admin branding (Phase 4)

```python
# /branding set
@bot.tree.command(name="branding")
@app_commands.describe(
    logo_url="URL du logo",
    primary_color="Couleur principale (hex)",
    footer_text="Texte de pied de page"
)
async def branding_set(
    interaction: discord.Interaction,
    logo_url: str | None = None,
    primary_color: str | None = None,
    footer_text: str | None = None,
):
    """Configure le branding du serveur."""
    config = await branding_service.get_config(interaction.guild_id)

    if logo_url:
        config.logo_url = logo_url
    if primary_color:
        config.primary_color = int(primary_color.lstrip("#"), 16)
    if footer_text:
        config.footer_text = footer_text

    await branding_service.set_config(interaction.guild_id, config)

    # Preview
    embed = branding_service.create_embed(config, "Aperçu du branding")
    await interaction.response.send_message(embed=embed)
```

### 13.6 Planning plugin-recipes

| Phase | Composant | Dépendance | Estimation |
|-------|-----------|------------|------------|
| **Phase 3** | Template `azy-formation-courte` | chatbot-core v0.7.4 | 1 jour |
| | Template `azy-parcours-long` | | 1 jour |
| | Template `azy-promo-cfa` | | 1 jour |
| **Phase 4** | `/branding set` | BrandingService | 0.5 jour |
| | `/branding preview` | | 0.5 jour |
| | `/onboarding setup` | OnboardingService | 1 jour |
| | `/onboarding stats` | | 0.5 jour |

**Total estimé :** 5.5 jours après chatbot-core v0.7.4

### 13.7 Checklist mise à jour (plugin-recipes)

- [ ] Créer template `azy-formation-courte`
- [ ] Créer template `azy-parcours-long`
- [ ] Créer template `azy-promo-cfa`
- [ ] Implémenter `/branding set`
- [ ] Implémenter `/branding preview`
- [ ] Implémenter `/onboarding setup`
- [ ] Implémenter `/onboarding stats`
- [ ] Intégrer I18nService pour multi-langue
- [ ] Documenter dans `docs/guides/BRANDING-GUIDE.md`

---

*Réponse plugin-recipes ajoutée le 2026-02-05*
*Alignement Redis Streams (RFC-023) le 2026-02-05*
*Review finale et compléments ajoutés le 2026-02-05*
*Statut : Draft - Prêt pour implémentation après chatbot-core v0.7.4*

---

## 14. Review finale et compléments (2026-02-05)

> **Reviewer:** Claude Code
> **Objectif:** Compléter les éléments manquants et finaliser la RFC

### 14.1 Validation des décisions actées ✅

| Décision | Statut | Commentaire |
|----------|--------|-------------|
| Pas de nouveau stream Redis | ✅ Validée | Réutilisation intelligente |
| Onboarding via MemberJoinService | ✅ Validée | Pas de nouvel event nécessaire |
| Multi-langue via I18nService | ✅ Validée | Infrastructure existante |
| Branding par formation reporté v2 | ✅ Validée | Scope raisonnable pour v1 |

### 14.2 Compléments implémentation BrandingService

#### 14.2.1 Cache avec invalidation cross-instance

```python
# chatbot_core/services/branding/branding_service.py

import asyncio
from cachetools import TTLCache
from typing import Optional

class BrandingService:
    """
    Service de gestion du branding par guild.
    Cache TTL avec invalidation cross-instance via Redis Pub/Sub.
    """

    REDIS_KEY_PREFIX = "branding"
    REDIS_INVALIDATE_CHANNEL = "branding:invalidate"
    CACHE_TTL = 300  # 5 minutes
    CACHE_MAX_SIZE = 1000

    def __init__(self, redis: BaseRedisService):
        self.redis = redis
        self._cache: TTLCache[int, BrandingConfig] = TTLCache(
            maxsize=self.CACHE_MAX_SIZE,
            ttl=self.CACHE_TTL
        )
        self._pubsub_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Démarre l'écoute des invalidations."""
        self._pubsub_task = asyncio.create_task(self._listen_invalidations())

    async def stop(self) -> None:
        """Arrête l'écoute des invalidations."""
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass

    async def _listen_invalidations(self) -> None:
        """Écoute les invalidations de cache cross-instance."""
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(self.REDIS_INVALIDATE_CHANNEL)

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    guild_id = int(data["guild_id"])
                    self._cache.pop(guild_id, None)
                    logger.debug(f"Cache invalidated for guild {guild_id}")
                except (json.JSONDecodeError, KeyError, ValueError) as e:
                    logger.warning(f"Invalid invalidation message: {e}")

    async def get_config(self, guild_id: int) -> BrandingConfig:
        """Récupère la config de branding (avec cache)."""
        # 1. Check cache local
        if guild_id in self._cache:
            return self._cache[guild_id]

        # 2. Check Redis
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}"
        data = await self.redis.get(key)

        if data:
            config = BrandingConfig(**json.loads(data))
        else:
            config = self._get_default_config()

        # 3. Populate cache
        self._cache[guild_id] = config
        return config

    async def set_config(self, guild_id: int, config: BrandingConfig) -> None:
        """Sauvegarde la config de branding avec invalidation cross-instance."""
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}"

        # 1. Sauvegarder en Redis
        await self.redis.set(key, json.dumps(asdict(config)))

        # 2. Invalider cache local
        self._cache.pop(guild_id, None)

        # 3. Notifier les autres instances
        await self.redis.publish(
            self.REDIS_INVALIDATE_CHANNEL,
            json.dumps({"guild_id": guild_id})
        )

    def _get_default_config(self) -> BrandingConfig:
        """Configuration par défaut."""
        return BrandingConfig(
            name="Formation",
            primary_color=AzyColors.PRIMARY,
            secondary_color=AzyColors.SECONDARY,
            success_color=AzyColors.SUCCESS,
            error_color=AzyColors.ERROR,
            footer_text="Azy Education",
        )

    def create_embed(
        self,
        config: BrandingConfig,
        title: str,
        description: Optional[str] = None,
        color_type: str = "primary",
    ) -> discord.Embed:
        """Crée un embed avec le branding appliqué."""
        colors = {
            "primary": config.primary_color,
            "secondary": config.secondary_color,
            "success": config.success_color,
            "error": config.error_color,
        }

        embed = discord.Embed(
            title=title,
            description=description,
            color=colors.get(color_type, config.primary_color),
        )

        embed.set_footer(
            text=config.footer_text,
            icon_url=config.logo_url,
        )

        return embed

    async def get_available_features(self, guild: discord.Guild) -> dict:
        """Retourne les features disponibles selon le niveau Nitro Boost."""
        boost_level = guild.premium_tier
        return {
            "banner": boost_level >= 2,
            "custom_emojis_extended": boost_level >= 1,
            "stickers": boost_level >= 1,
            "animated_icon": boost_level >= 1,
            "vanity_url": boost_level >= 3,
            "max_emojis": [50, 100, 150, 250][min(boost_level, 3)],
        }
```

#### 14.2.2 OnboardingService complet

```python
# chatbot_core/services/branding/onboarding.py

from dataclasses import dataclass
from typing import Optional
from datetime import datetime, timedelta

@dataclass
class OnboardingStep:
    """Étape du parcours d'onboarding."""
    id: str
    title: str
    description: str
    action: str  # "read_channel", "post_message", "react", "complete_profile"
    target_channel: Optional[str] = None
    required: bool = True


@dataclass
class OnboardingConfig:
    """Configuration du parcours d'onboarding."""
    steps: list[OnboardingStep]
    welcome_channel_id: Optional[int] = None
    completion_role_id: Optional[int] = None
    completion_xp: int = 50
    expiry_days: int = 30  # L'onboarding expire après X jours d'inactivité


class OnboardingService:
    """
    Service de gestion du parcours d'onboarding des nouveaux membres.
    """

    REDIS_KEY_PREFIX = "onboarding"
    REDIS_CONFIG_PREFIX = "onboarding:config"

    def __init__(
        self,
        redis: BaseRedisService,
        branding: BrandingService,
    ):
        self.redis = redis
        self.branding = branding

    # =========================================================================
    # CONFIG MANAGEMENT
    # =========================================================================

    async def get_config(self, guild_id: int) -> OnboardingConfig:
        """Récupère la configuration d'onboarding du guild."""
        key = f"{self.REDIS_CONFIG_PREFIX}:{guild_id}"
        data = await self.redis.get(key)

        if data:
            config_dict = json.loads(data)
            steps = [OnboardingStep(**s) for s in config_dict.pop("steps", [])]
            return OnboardingConfig(steps=steps, **config_dict)

        return self._get_default_config()

    async def set_config(self, guild_id: int, config: OnboardingConfig) -> None:
        """Sauvegarde la configuration d'onboarding."""
        key = f"{self.REDIS_CONFIG_PREFIX}:{guild_id}"
        config_dict = asdict(config)
        await self.redis.set(key, json.dumps(config_dict))

    def _get_default_config(self) -> OnboardingConfig:
        """Configuration par défaut si non définie."""
        return OnboardingConfig(
            steps=[
                OnboardingStep(
                    id="read_rules",
                    title="Lire le règlement",
                    description="Consulte #reglement pour connaître les règles",
                    action="read_channel",
                    target_channel="reglement",
                ),
                OnboardingStep(
                    id="introduce",
                    title="Se présenter",
                    description="Poste un message dans #presentez-vous",
                    action="post_message",
                    target_channel="presentez-vous",
                ),
                OnboardingStep(
                    id="first_course",
                    title="Découvrir un cours",
                    description="Accède à ton premier cours",
                    action="read_channel",
                    target_channel="module-1",
                    required=False,
                ),
            ]
        )

    # =========================================================================
    # PROGRESS TRACKING
    # =========================================================================

    async def get_progress(self, guild_id: int, user_id: int) -> dict:
        """Récupère la progression d'onboarding d'un utilisateur."""
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}:{user_id}"
        data = await self.redis.get(key)

        if not data:
            return {
                "completed_steps": [],
                "current_step": 0,
                "started_at": None,
            }

        return json.loads(data)

    async def start_onboarding(
        self,
        guild_id: int,
        user_id: int,
        config: Optional[OnboardingConfig] = None,
    ) -> None:
        """Démarre le parcours d'onboarding pour un utilisateur."""
        if config is None:
            config = await self.get_config(guild_id)

        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}:{user_id}"

        progress = {
            "started_at": datetime.utcnow().isoformat(),
            "completed_steps": [],
            "current_step": 0,
            "last_activity_at": datetime.utcnow().isoformat(),
        }

        # TTL = expiry_days de la config
        ttl = config.expiry_days * 24 * 3600
        await self.redis.set(key, json.dumps(progress), ex=ttl)

    async def complete_step(
        self,
        guild_id: int,
        user_id: int,
        step_id: str,
    ) -> bool:
        """
        Marque une étape comme complétée.
        Retourne True si l'onboarding est terminé.
        """
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}:{user_id}"
        data = await self.redis.get(key)

        if not data:
            return False

        progress = json.loads(data)

        if step_id not in progress["completed_steps"]:
            progress["completed_steps"].append(step_id)
            progress["current_step"] += 1
            progress["last_activity_at"] = datetime.utcnow().isoformat()

            # Refresh TTL
            config = await self.get_config(guild_id)
            ttl = config.expiry_days * 24 * 3600
            await self.redis.set(key, json.dumps(progress), ex=ttl)

        # Vérifier si toutes les étapes requises sont complétées
        required_steps = [s.id for s in config.steps if s.required]
        return all(s in progress["completed_steps"] for s in required_steps)

    async def reset_onboarding(self, guild_id: int, user_id: int) -> None:
        """Réinitialise l'onboarding d'un utilisateur."""
        key = f"{self.REDIS_KEY_PREFIX}:{guild_id}:{user_id}"
        await self.redis.delete(key)

    # =========================================================================
    # COMPLETION HANDLING
    # =========================================================================

    async def handle_completion(
        self,
        guild: discord.Guild,
        member: discord.Member,
        config: OnboardingConfig,
    ) -> None:
        """Gère la complétion de l'onboarding."""
        # 1. Attribuer le rôle de complétion
        if config.completion_role_id:
            role = guild.get_role(config.completion_role_id)
            if role:
                await member.add_roles(role, reason="Onboarding completed")

        # 2. Attribuer l'XP (via event Redis Streams - RFC-023)
        if config.completion_xp > 0:
            await self.redis.xadd(
                "learning:events:stream",
                {"event": json.dumps({
                    "event": "learning.xp.gained",
                    "timestamp": datetime.utcnow().isoformat(),
                    "guild_id": str(guild.id),
                    "data": {
                        "user_id": str(member.id),
                        "amount": config.completion_xp,
                        "reason": "onboarding_completed",
                    }
                })},
                maxlen=10000,
            )

        # 3. Nettoyer les données d'onboarding
        key = f"{self.REDIS_KEY_PREFIX}:{guild.id}:{member.id}"
        await self.redis.delete(key)

    # =========================================================================
    # STATS AND ADMIN
    # =========================================================================

    async def get_stats(self, guild_id: int) -> dict:
        """Stats d'onboarding pour les admins."""
        pattern = f"{self.REDIS_KEY_PREFIX}:{guild_id}:*"
        keys = await self.redis.keys(pattern)

        total = len(keys)
        completed = 0
        in_progress = 0

        config = await self.get_config(guild_id)
        required_steps = {s.id for s in config.steps if s.required}

        for key in keys:
            data = await self.redis.get(key)
            if data:
                progress = json.loads(data)
                completed_set = set(progress.get("completed_steps", []))
                if required_steps.issubset(completed_set):
                    completed += 1
                else:
                    in_progress += 1

        return {
            "total_started": total,
            "completed": completed,
            "in_progress": in_progress,
            "completion_rate": completed / total if total > 0 else 0,
        }

    # =========================================================================
    # EMBEDS
    # =========================================================================

    async def get_progress_embed(
        self,
        guild_id: int,
        user_id: int,
        user_name: str,
    ) -> discord.Embed:
        """Génère l'embed de progression d'onboarding."""
        branding_config = await self.branding.get_config(guild_id)
        onboarding_config = await self.get_config(guild_id)
        progress = await self.get_progress(guild_id, user_id)

        embed = self.branding.create_embed(
            branding_config,
            title=f"🚀 Bienvenue {user_name} !",
            description="Complète ces étapes pour bien démarrer.",
        )

        steps_text = ""
        for step in onboarding_config.steps:
            completed = step.id in progress.get("completed_steps", [])
            emoji = "✅" if completed else "⬜"
            required_marker = "" if step.required else " *(optionnel)*"
            steps_text += f"{emoji} **{step.title}**{required_marker}\n"
            if not completed:
                steps_text += f"   └ {step.description}\n"

        embed.add_field(
            name="📋 Tes étapes",
            value=steps_text or "Aucune étape configurée",
            inline=False,
        )

        # Barre de progression (accessible)
        completed_count = len(progress.get("completed_steps", []))
        total_count = len(onboarding_config.steps)
        percent = int((completed_count / total_count) * 100) if total_count > 0 else 0

        bar = "█" * (percent // 10) + "░" * (10 - percent // 10)
        embed.add_field(
            name="📊 Progression",
            value=f"`{bar}` {percent}% ({completed_count}/{total_count} étapes)",
            inline=False,
        )

        return embed
```

#### 14.2.3 Protocols pour testing

```python
# chatbot_core/services/branding/protocols.py

from typing import Protocol, Optional
import discord

class BrandingServiceProtocol(Protocol):
    """Protocol pour BrandingService - permet le mocking dans les tests."""

    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def get_config(self, guild_id: int) -> BrandingConfig: ...
    async def set_config(self, guild_id: int, config: BrandingConfig) -> None: ...
    def create_embed(
        self,
        config: BrandingConfig,
        title: str,
        description: Optional[str] = None,
        color_type: str = "primary",
    ) -> discord.Embed: ...
    async def get_available_features(self, guild: discord.Guild) -> dict: ...


class OnboardingServiceProtocol(Protocol):
    """Protocol pour OnboardingService - permet le mocking dans les tests."""

    async def get_config(self, guild_id: int) -> OnboardingConfig: ...
    async def set_config(self, guild_id: int, config: OnboardingConfig) -> None: ...
    async def get_progress(self, guild_id: int, user_id: int) -> dict: ...
    async def start_onboarding(
        self,
        guild_id: int,
        user_id: int,
        config: Optional[OnboardingConfig] = None,
    ) -> None: ...
    async def complete_step(
        self,
        guild_id: int,
        user_id: int,
        step_id: str,
    ) -> bool: ...
    async def reset_onboarding(self, guild_id: int, user_id: int) -> None: ...
    async def handle_completion(
        self,
        guild: discord.Guild,
        member: discord.Member,
        config: OnboardingConfig,
    ) -> None: ...
    async def get_stats(self, guild_id: int) -> dict: ...
    async def get_progress_embed(
        self,
        guild_id: int,
        user_id: int,
        user_name: str,
    ) -> discord.Embed: ...
```

### 14.3 EmbedTemplates refactoré avec BrandingConfig

```python
# chatbot_core/services/branding/embed_templates.py

class EmbedTemplates:
    """Templates d'embeds standardisés utilisant BrandingConfig."""

    @staticmethod
    def welcome_embed(
        config: BrandingConfig,
        user_name: str,
        formation_name: str,
        steps: list[str],
    ) -> discord.Embed:
        """Embed de bienvenue personnalisé."""
        embed = discord.Embed(
            title=f"👋 Bienvenue {user_name} !",
            description=f"Tu as rejoint **{formation_name}**",
            color=config.primary_color,
        )

        # Étapes de démarrage (accessible)
        steps_text = "\n".join(
            f"{'✅ Fait' if i == 0 else '⬜ À faire'} - {step}"
            for i, step in enumerate(steps)
        )
        embed.add_field(
            name="🚀 Tes premiers pas",
            value=steps_text,
            inline=False,
        )

        embed.set_footer(
            text=config.footer_text,
            icon_url=config.logo_url,
        )
        return embed

    @staticmethod
    def progress_embed(
        config: BrandingConfig,
        user_name: str,
        progress_percent: int,
        xp_current: int,
        xp_next_level: int,
        level: int,
        level_title: str,
    ) -> discord.Embed:
        """Embed de progression avec branding."""
        # Barre de progression visuelle et accessible
        filled = int(progress_percent / 10)
        bar = "█" * filled + "░" * (10 - filled)

        embed = discord.Embed(
            title=f"📊 Progression de {user_name}",
            color=config.primary_color,
        )

        embed.add_field(
            name=f"Niveau {level} • {level_title}",
            value=f"`{bar}` {progress_percent}% complet\n{xp_current:,} / {xp_next_level:,} XP",
            inline=False,
        )

        embed.set_footer(
            text=config.footer_text,
            icon_url=config.logo_url,
        )

        return embed

    @staticmethod
    def module_embed(
        config: BrandingConfig,
        module_number: int,
        module_title: str,
        description: str,
        lessons: list[dict],
        completed: int,
    ) -> discord.Embed:
        """Embed de module de cours avec branding."""
        # Couleurs par module (cycle)
        module_colors = [
            config.primary_color,
            config.secondary_color,
            0xEC4899,  # Rose
            0x14B8A6,  # Teal
        ]
        color = module_colors[(module_number - 1) % len(module_colors)]

        embed = discord.Embed(
            title=f"📘 Module {module_number} : {module_title}",
            description=description,
            color=color,
        )

        # Liste des leçons (accessible)
        lessons_text = ""
        for i, lesson in enumerate(lessons, 1):
            status = "✅ Terminé" if i <= completed else "⬜ À faire"
            lessons_text += f"{status} - **{i}.** {lesson['title']}\n"

        embed.add_field(
            name=f"📚 Leçons ({completed}/{len(lessons)} terminées)",
            value=lessons_text or "Aucune leçon",
            inline=False,
        )

        embed.set_footer(
            text=config.footer_text,
            icon_url=config.logo_url,
        )

        return embed

    @staticmethod
    def error_embed(
        config: BrandingConfig,
        title: str,
        message: str,
        suggestion: Optional[str] = None,
    ) -> discord.Embed:
        """Embed d'erreur standardisé."""
        embed = discord.Embed(
            title=f"❌ {title}",
            description=message,
            color=config.error_color,
        )

        if suggestion:
            embed.add_field(
                name="💡 Suggestion",
                value=suggestion,
                inline=False,
            )

        embed.set_footer(
            text=config.footer_text,
            icon_url=config.logo_url,
        )

        return embed

    @staticmethod
    def success_embed(
        config: BrandingConfig,
        title: str,
        message: str,
    ) -> discord.Embed:
        """Embed de succès standardisé."""
        embed = discord.Embed(
            title=f"✅ {title}",
            description=message,
            color=config.success_color,
        )

        embed.set_footer(
            text=config.footer_text,
            icon_url=config.logo_url,
        )

        return embed
```

### 14.4 Documentation mode dégradé Nitro Boost

```markdown
## Guide : Fonctionnalités selon niveau Nitro Boost

### Niveau 0 (pas de boost)
| Fonctionnalité | Disponible | Alternative |
|----------------|------------|-------------|
| Bannière serveur | ❌ | Utiliser image dans #bienvenue |
| Emojis custom | 50 max | Utiliser emojis Unicode |
| Stickers | ❌ | Utiliser GIFs |
| Icône animée | ❌ | Icône statique |
| Upload > 8 MB | ❌ | Compresser ou lien externe |

### Niveau 1 (2 boosts)
| Fonctionnalité | Disponible |
|----------------|------------|
| Emojis custom | 100 |
| Stickers | 15 |
| Audio haute qualité | 128 kbps |
| Upload | 8 MB |

### Niveau 2 (7 boosts)
| Fonctionnalité | Disponible |
|----------------|------------|
| **Bannière serveur** | ✅ |
| Emojis custom | 150 |
| Stickers | 30 |
| Audio haute qualité | 256 kbps |
| Upload | 50 MB |

### Niveau 3 (14 boosts)
| Fonctionnalité | Disponible |
|----------------|------------|
| Emojis custom | 250 |
| Stickers | 60 |
| Audio haute qualité | 384 kbps |
| Upload | 100 MB |
| URL vanity | ✅ |

### Recommandation pour Azy Education
- **Niveau minimum recommandé :** Niveau 2 (pour la bannière)
- **Mode dégradé :** Si < Niveau 2, utiliser une image embed dans #bienvenue
```

### 14.5 Checklist finale RFC-024

#### Services chatbot-core (P0)
- [ ] `BrandingService` avec cache TTL et invalidation cross-instance
- [ ] `OnboardingService` complet (get_config, get_progress, etc.)
- [ ] `EmbedTemplates` refactoré avec `BrandingConfig`
- [ ] Protocols pour testing
- [ ] Intégration avec `MemberJoinService` (RFC-006)

#### Plugin-recipes (P1)
- [ ] Template serveur `azy-formation-courte`
- [ ] Template serveur `azy-parcours-long`
- [ ] Template serveur `azy-promo-cfa`
- [ ] Commande `/branding set`
- [ ] Commande `/branding preview`
- [ ] Commande `/onboarding setup`
- [ ] Commande `/onboarding stats`

#### Documentation (P2)
- [ ] Guide mode dégradé Nitro Boost
- [ ] Déplacer section 8 vers `docs/guides/BRANDING-GUIDE.md`
- [ ] Exemples d'embeds pour chaque cas d'usage

### 14.6 Questions résolues

| Question initiale | Réponse |
|-------------------|---------|
| 11.6.1 Branding par formation | Reporté à v2 |
| 11.6.2 Templates versionnés | Migration manuelle si besoin |
| 11.6.3 Dashboard onboarding | Commande `/onboarding stats` |
| 11.6.4 Multi-langue | Via `I18nService` existant |

### 14.7 Statut final

```
RFC-024 : Discord Branding Strategy
────────────────────────────────────
Statut        : ✅ APPROVED - Prêt pour implémentation
Version       : 1.0
Approuvé par  : chatbot-core, plugin-recipes
Date          : 2026-02-05
Dépend de     : chatbot-core v0.7.3 (RFC-023)

Prochaines étapes :
1. chatbot-core v0.7.4 : BrandingService + OnboardingService
2. plugin-recipes : Templates serveur + commandes admin
3. Documentation : Guide branding
```
