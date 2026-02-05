# RFC-021 : Externalisation des prompts et migration des services génériques

| Champ | Valeur |
|-------|--------|
| **Auteur** | Équipe chatbot-core |
| **Statut** | Draft |
| **Date** | 2026-02-02 |
| **Composants** | chatbot-core, plugin-recipes, plugin-template |

---

## 1. Résumé

Cette RFC propose une refonte architecturale pour :
1. **Séparer clairement** ce qui est générique (chatbot-core) de ce qui est métier (plugin)
2. **Externaliser les prompts** vers des fichiers YAML configurables
3. **Migrer les services génériques** de plugin-recipes vers chatbot-core
4. **Standardiser** la création de nouveaux plugins

---

## 2. Analyse de l'existant

### 2.1 Répartition actuelle chatbot-core vs plugin

#### Ce que chatbot-core fournit (générique)

| Composant | Description | Exemple d'utilisation |
|-----------|-------------|----------------------|
| **BotFactory** | Création du bot Discord | `BotFactory.create(config)` |
| **BaseConfig** | Configuration de base | Tokens, URLs n8n, Redis |
| **N8nClient** | Client HTTP pour n8n | `call_webhook("endpoint", payload)` |
| **MentionService** | Gestion des @Bot | Rate limiting, routing |
| **DocumentWorkflowService** | Analyse d'intention + auto-execution | `analyze_intent()`, `handle_intent_result()` |
| **ShoppingCartService** | Panier d'achat | Générique e-commerce |
| **CheckoutService** | Paiement (Stripe) | Générique |
| **NotificationListener** | Notifications Discord | Générique |
| **Mixins** | ErrorFormatter, Branding, Pagination | Utilitaires génériques |

#### Ce que le plugin fournit (métier)

| Composant | Exemple plugin-recipes | Autre plugin possible |
|-----------|------------------------|----------------------|
| **Models** | `Recipe`, `NutritionInfo` | `Product`, `Article` |
| **Services métier** | `AllergenService`, `DifficultyCalculator` | `PriceCalculator`, `StockService` |
| **Branding** | "Bot Appetit", scope cuisine | Autre nom, autre scope |
| **Commands** | `/recette`, `/ingredients` | `/product`, `/search` |
| **Views** | `RecipeCardView` | `ProductCardView` |

#### Zone grise (semi-générique) - À clarifier

| Composant | Dans chatbot-core ? | Dans plugin ? | Commentaire |
|-----------|---------------------|---------------|-------------|
| **Scope classification** | ✅ Logique | ✅ Prompt/config | Le LLM est dans core, le prompt est dans plugin |
| **Search (Qdrant)** | ❌ | ✅ | `entity_type` configurable par plugin |
| **Web search** | ✅ (via n8n) | ✅ (API keys) | Core appelle n8n, plugin fournit les clés |
| **Session/Memory** | ✅ | ❌ | Totalement générique |
| **conversation_memory** | ❌ (dans plugin) | - | Devrait être dans core |
| **redis_service** | ❌ (dans plugin) | - | Devrait être dans core |

### 2.2 Problèmes identifiés

1. **Prompts hardcodés** dans `mentions.py` et `branding.py`
   - Modifier un prompt nécessite de modifier le code Python
   - Pas de séparation entre logique et contenu
   - Difficile à traduire (i18n)

2. **Services dupliqués** entre plugins
   - `conversation_memory.py` copié dans chaque plugin
   - `redis_service.py` copié dans chaque plugin
   - Maintenance multiple et risque de divergence

3. **Configuration dispersée**
   - Variables d'environnement mélangées (secrets et config)
   - Constantes Python hardcodées
   - Pas de schéma de validation

4. **Couplage métier/générique**
   - Textes "Bot Appetit" et "cuisine" dans le code générique
   - Difficile de créer un plugin sans copier du code métier

---

## 3. Proposition : Services à migrer vers chatbot-core

### 3.1 Services génériques actuellement dans plugin

| Service | Actuellement | Devrait être | Raison |
|---------|--------------|--------------|--------|
| `conversation_memory.py` | plugin | **chatbot-core** | 100% générique |
| `redis_service.py` | plugin | **chatbot-core** | 100% générique |
| `search_service.py` | plugin | **chatbot-core** | Générique avec `entity_type` configurable |

### 3.2 Nouveaux services à créer dans chatbot-core

| Service | Description | Responsabilité |
|---------|-------------|----------------|
| **PromptManager** | Gestion des prompts YAML | Charger, parser, substituer les variables |
| **ConfigLoader** | Chargement configuration YAML | Charger `plugin.yaml`, valider le schéma |
| **BrandingManager** | Gestion du branding | Couleurs, emojis, noms depuis YAML |

---

## 4. Proposition : Externalisation des prompts

### 4.1 Situation actuelle

**Prompts hardcodés dans `mentions.py`** :
```python
# mentions.py - lignes 109-127
GREETING_RESPONSES = [
    "Salut ! Je suis **Bot Appetit**, ton assistant culinaire. "
    "Tape `/help` pour voir ce que je sais faire !",
    # ...
]

SCOPE_PROMPT = """Tu es Bot Appetit, un assistant culinaire expert..."""
```

**Problèmes** :
- Modifier = éditer du code Python
- Pas d'i18n possible
- Tests difficiles

### 4.2 Nouvelle structure proposée

```
my-plugin/
├── config/
│   ├── plugin.yaml           # Configuration principale
│   ├── prompts/
│   │   ├── scope.yaml        # Définition du scope LLM
│   │   ├── intentions.yaml   # Prompts d'intention (optionnel)
│   │   └── responses.yaml    # Messages utilisateur
│   ├── branding.yaml         # Identité visuelle
│   └── i18n/                 # Traductions (optionnel)
│       ├── fr.yaml
│       └── en.yaml
├── src/
│   └── ...
├── .env.local                # SECRETS uniquement
└── main.py
```

### 4.3 Exemple `config/prompts/scope.yaml`

```yaml
# Définition du scope pour classification LLM
scope:
  # Identité du bot
  identity:
    role: "Tu es {bot_name}, un assistant culinaire expert en cuisine française et internationale."
    qualities:
      - "passionné de cuisine du monde entier"
      - "précis dans les quantités et temps de cuisson"
      - "créatif pour les substitutions d'ingrédients"
      - "patient pour expliquer les techniques"
      - "encourageant pour les débutants"
    limitations:
      - "pas un médecin ou nutritionniste certifié"
      - "pas un expert en allergies alimentaires graves"
      - "pas capable de diagnostiquer des problèmes de santé"

  # Mission
  mission: >
    Aider les utilisateurs à découvrir, créer et personnaliser des recettes
    adaptées à leurs goûts, leur niveau et leurs ingrédients disponibles.

  # Périmètre - Ce que le bot PEUT faire
  can:
    - "proposer des recettes selon les ingrédients ou envies"
    - "suggérer des alternatives d'ingrédients"
    - "expliquer des techniques culinaires"
    - "aider à planifier des repas de la semaine"
    - "convertir des unités de mesure"
    - "adapter les quantités selon le nombre de personnes"
    - "recommander des accords mets-vins basiques"
    - "donner des astuces de conservation"
    - "expliquer l'origine des plats"

  # Périmètre - Ce que le bot NE PEUT PAS faire
  cannot:
    - "donner des conseils médicaux ou nutritionnels thérapeutiques"
    - "prescrire des régimes pour maladies spécifiques"
    - "garantir l'absence d'allergènes"
    - "remplacer l'avis d'un professionnel de santé"
    - "répondre à des questions sans rapport avec la cuisine"

  # Garde-fous (sujets à refuser)
  guardrails:
    - "Conseils médicaux et nutritionnels thérapeutiques"
    - "Régimes pour maladies (diabète, insuffisance rénale, etc.)"
    - "Garanties sur les allergènes"
    - "Sujets non liés à la cuisine (politique, actualités, etc.)"

  # Message quand hors scope
  out_of_scope_message: |
    Je suis **{bot_name}**, spécialisé en cuisine !
    Pose-moi des questions sur les recettes, ingrédients ou techniques culinaires.
    Tape `/help` pour voir mes commandes.

  # Exemples few-shot (optionnel)
  examples:
    - input: "Comment faire une béchamel ?"
      output: |
        La béchamel est une sauce blanche de base ! Voici la recette:

        **Ingrédients** (pour 500ml):
        - 50g de beurre
        - 50g de farine
        - 500ml de lait
        - Sel, poivre, muscade

        **Étapes**:
        1. Faire fondre le beurre
        2. Ajouter la farine, mélanger 2 min
        3. Verser le lait progressivement en fouettant
        4. Cuire 10 min en remuant
        5. Assaisonner
```

### 4.4 Exemple `config/prompts/responses.yaml`

```yaml
# Messages utilisateur
messages:
  # Salutations (sélection aléatoire)
  greetings:
    - "Salut ! Je suis **{bot_name}**, ton assistant culinaire. Tape `/help` pour voir ce que je sais faire !"
    - "Bonjour ! Comment puis-je t'aider en cuisine aujourd'hui ?"
    - "Hello ! Prêt à cuisiner ? `/recette` pour commencer !"

  # Message d'aide
  help: |
    Je suis **{bot_name}**, ton assistant culinaire intelligent !

    **Ce que je sais faire :**
    - **Rechercher des recettes** : `/recette pizza`, `/websearch ramen`
    - **Extraire des recettes YouTube** : `/youtube tiramisu`
    - **Trouver par ingrédients** : `/ingredients poulet, citron`
    - **Suggestions aléatoires** : `/suggestion dessert`
    - **Gérer ta liste de courses** : `/liste show`, `/liste add`
    - **Programmer des timers** : `/timer 15 pâtes`
    - **Sauvegarder tes favoris** : `/sauvegarder`, `/favoris`

    Tape `/help` pour la liste complète des commandes !

  # Mention vide (@Bot sans texte)
  empty_mention: >
    Tu m'as mentionné mais tu n'as rien dit !
    Pose-moi une question culinaire ou tape `/help` pour voir mes commandes.

  # Erreurs
  errors:
    generic: "Oups, je n'ai pas pu traiter ta demande. Réessaie plus tard ou tape `/help` !"
    rate_limit: "Doucement {user_name} ! Tu m'as déjà parlé plusieurs fois. Réessaie dans {cooldown}s."
    search_failed: "Erreur lors de la recherche. Réessaie plus tard."
    no_results: "Désolé, je n'ai pas trouvé de résultat pour **{query}**."

  # Recherche web automatique
  web_search:
    searching: "🔍 Pas de recette pour **{query}** en base, je cherche sur le web..."
    found_saved: "✅ **{title}** trouvée sur le web et sauvegardée !"
    found_not_saved: "✅ **{title}** trouvée sur le web."
    not_found: "Désolé, je n'ai pas trouvé de recette pour **{query}** sur le web."
```

### 4.5 Exemple `config/branding.yaml`

```yaml
# Identité visuelle du bot
bot:
  name: "Bot Appetit"
  emoji: "👨‍🍳"
  color: "#FF6B35"  # Orange cuisine (format hex)
  description: "Assistant culinaire intelligent pour Discord"

# Emojis par catégorie
emojis:
  success: "✅"
  error: "❌"
  warning: "⚠️"
  search: "🔍"
  loading: "⏳"
  recipe: "🍽️"
  ingredient: "🥕"
  timer: "⏱️"
  favorite: "⭐"
  shopping: "🛒"
  credits: "💳"

# URLs (optionnel)
urls:
  logo: "https://example.com/logo.png"
  website: "https://example.com"
  support: "https://discord.gg/example"

# Footer des embeds Discord
footer:
  text: "{bot_name} - Ton assistant culinaire"
  icon_url: "https://example.com/icon.png"
```

### 4.6 Exemple `config/plugin.yaml`

```yaml
# Configuration principale du plugin
plugin:
  name: "recipes"
  version: "1.0.0"
  description: "Plugin de recettes de cuisine"

# Type d'entité géré
entity:
  type: "recipe"
  collection: "recipes"  # Collection Qdrant

# Fonctionnalités activées
features:
  mentions: true
  session_continue: true
  memory: true
  document_processing: false
  shopping_cart: false

# Paramètres de recherche
search:
  min_score: 0.75
  max_results: 10
  auto_fallback_web: true

# Rate limiting des mentions
rate_limit:
  enabled: true
  messages: 5
  window_seconds: 60
  cooldown_seconds: 30

# Paramètres métier
settings:
  default_language: "fr"
  default_servings: 4

# Fichiers de configuration inclus
includes:
  - prompts/scope.yaml
  - prompts/responses.yaml
  - branding.yaml
```

---

## 5. Nouvelle architecture proposée

### 5.1 chatbot-core (après migration)

```
chatbot-core/
├── services/
│   ├── prompt_manager.py        # ✅ NOUVEAU - Gestion prompts YAML
│   ├── config_loader.py         # ✅ NOUVEAU - Chargement config YAML
│   ├── branding_manager.py      # ✅ NOUVEAU - Gestion branding
│   ├── conversation_memory.py   # ✅ MIGRER depuis plugin
│   ├── redis_service.py         # ✅ MIGRER depuis plugin
│   ├── search_service.py        # ✅ MIGRER depuis plugin
│   ├── mention/                 # Existant
│   ├── document_workflow.py     # Existant
│   └── ...
└── core/
    ├── config.py                # BaseConfig existant
    └── ...
```

### 5.2 plugin-recipes (après refactoring)

```
plugin-recipes/
├── config/
│   ├── plugin.yaml              # ✅ Configuration principale
│   ├── prompts/
│   │   ├── scope.yaml           # ✅ Scope LLM externalisé
│   │   └── responses.yaml       # ✅ Messages externalisés
│   └── branding.yaml            # ✅ Branding externalisé
├── src/
│   ├── __init__.py              # Plugin class (utilise PromptManager)
│   ├── config.py                # Charge plugin.yaml + .env.local
│   ├── mentions.py              # Utilise PromptManager (plus de hardcode)
│   ├── services/
│   │   ├── allergen_service.py      # ❌ Reste (métier)
│   │   ├── difficulty_calculator.py # ❌ Reste (métier)
│   │   └── recipe_image_handler.py  # ❌ Reste (métier)
│   ├── commands/                # Commandes métier
│   ├── views/                   # Vues métier
│   └── models.py                # Modèles métier
├── .env.local                   # SECRETS uniquement
└── main.py
```

### 5.3 Ce qui reste dans le plugin (métier spécifique)

| Fichier | Raison |
|---------|--------|
| `models.py` | Entités métier (Recipe, NutritionInfo) |
| `services/allergen_service.py` | Logique métier allergènes |
| `services/difficulty_calculator.py` | Logique métier difficulté |
| `services/recipe_image_handler.py` | OCR spécifique recettes |
| `services/shopping_list.py` | Liste de courses (métier) |
| `commands/*.py` | Slash commands métier |
| `views/*.py` | Vues Discord métier |
| `config/prompts/*.yaml` | Contenu métier (textes cuisine) |
| `config/branding.yaml` | Identité du bot |

---

## 6. API chatbot-core proposée

### 6.1 PromptManager

```python
# chatbot_core/services/prompt_manager.py

from pathlib import Path
from typing import Any
import yaml
import random

class PromptManager:
    """Gestionnaire de prompts depuis fichiers YAML."""

    def __init__(self, config_dir: Path, language: str = "fr"):
        """
        Initialise le gestionnaire.

        Args:
            config_dir: Répertoire contenant les fichiers YAML
            language: Langue pour i18n (défaut: fr)
        """
        self.config_dir = config_dir
        self.language = language
        self._prompts: dict[str, Any] = {}
        self._branding: dict[str, Any] = {}
        self._scope: dict[str, Any] = {}

    def load(self) -> None:
        """Charge tous les fichiers de configuration."""
        self._load_branding()
        self._load_scope()
        self._load_responses()

    def get_scope_prompt(self) -> str:
        """
        Génère le prompt de scope complet pour le LLM.

        Returns:
            Prompt système formaté
        """
        ...

    def get_scope_config(self) -> "ScopeConfig":
        """
        Retourne la configuration de scope structurée.

        Returns:
            ScopeConfig compatible avec MentionService
        """
        ...

    def get_message(self, key: str, **kwargs) -> str:
        """
        Récupère un message avec substitution de variables.

        Args:
            key: Clé du message (ex: "messages.empty_mention")
            **kwargs: Variables à substituer (bot_name, user_name, etc.)

        Returns:
            Message formaté

        Example:
            >>> pm.get_message("errors.rate_limit", user_name="John", cooldown=30)
            "Doucement John ! Réessaie dans 30s."
        """
        ...

    def get_random_message(self, key: str, **kwargs) -> str:
        """
        Récupère un message aléatoire depuis une liste.

        Args:
            key: Clé de la liste (ex: "messages.greetings")
            **kwargs: Variables à substituer

        Returns:
            Un message aléatoire de la liste, formaté
        """
        messages = self._get_nested(key)
        if isinstance(messages, list):
            template = random.choice(messages)
        else:
            template = messages
        return template.format(**kwargs)

    def get_branding(self) -> "BrandingConfig":
        """
        Retourne la configuration de branding.

        Returns:
            BrandingConfig avec name, emoji, color, etc.
        """
        ...

    def get_bot_name(self) -> str:
        """Raccourci pour obtenir le nom du bot."""
        return self._branding.get("bot", {}).get("name", "Bot")

    def _get_nested(self, key: str) -> Any:
        """Récupère une valeur imbriquée par clé pointée (ex: 'messages.errors.generic')."""
        ...

    def _load_branding(self) -> None:
        """Charge branding.yaml."""
        ...

    def _load_scope(self) -> None:
        """Charge prompts/scope.yaml."""
        ...

    def _load_responses(self) -> None:
        """Charge prompts/responses.yaml."""
        ...
```

### 6.2 ConfigLoader

```python
# chatbot_core/core/config_loader.py

from pathlib import Path
from typing import Any
import yaml

class ConfigLoader:
    """Chargeur de configuration YAML avec validation."""

    @classmethod
    def load_plugin_config(cls, config_dir: Path) -> dict[str, Any]:
        """
        Charge la configuration complète d'un plugin.

        Args:
            config_dir: Répertoire config/

        Returns:
            Configuration fusionnée (plugin.yaml + includes)
        """
        ...

    @classmethod
    def load_yaml(cls, file_path: Path) -> dict[str, Any]:
        """Charge un fichier YAML."""
        with open(file_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    @classmethod
    def merge_configs(cls, base: dict, overlay: dict) -> dict:
        """Fusionne deux configurations (overlay écrase base)."""
        ...

    @classmethod
    def validate_schema(cls, config: dict, schema_name: str) -> list[str]:
        """
        Valide une configuration contre un schéma.

        Returns:
            Liste des erreurs (vide si valide)
        """
        ...
```

### 6.3 Utilisation dans le plugin

```python
# plugin/src/__init__.py

from pathlib import Path
from chatbot_core.services import PromptManager

class MyPlugin(Plugin):
    def __init__(self, bot, config, n8n_client):
        # Charger la configuration YAML
        config_dir = Path(__file__).parent.parent / "config"
        self.prompts = PromptManager(config_dir)
        self.prompts.load()

        # Utiliser le branding
        branding = self.prompts.get_branding()
        self.BOT_NAME = branding.name
        self.BOT_COLOR = branding.color
        self.BOT_EMOJI = branding.emoji


# plugin/src/mentions.py

class PluginMentionHandler:
    def __init__(self, config, n8n_handler, prompt_manager: PromptManager):
        self.prompts = prompt_manager

    async def handle_mention(self, context, message):
        content = context.content.strip().lower()

        # Mention vide - utilise le YAML
        if not content:
            return MentionResult(
                success=True,
                response=self.prompts.get_message("messages.empty_mention"),
                intent="empty",
            )

        # Salutation - sélection aléatoire depuis le YAML
        if self._is_greeting(content):
            return MentionResult(
                success=True,
                response=self.prompts.get_random_message(
                    "messages.greetings",
                    bot_name=self.prompts.get_bot_name(),
                ),
                intent="greeting",
            )

        # Aide
        if self._is_help_request(content):
            return MentionResult(
                success=True,
                response=self.prompts.get_message(
                    "messages.help",
                    bot_name=self.prompts.get_bot_name(),
                ),
                intent="help",
            )
```

---

## 7. Impact sur les variables d'environnement

### 7.1 Ce qui RESTE dans `.env.local` (secrets)

```bash
# =============================================================================
# SECRETS - Ne jamais commiter, ne jamais mettre dans YAML
# =============================================================================

# Discord
DISCORD_TOKEN=xxx

# n8n
N8N_API_KEY=xxx

# APIs LLM
GOOGLE_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
OPENAI_API_KEY=xxx
MISTRAL_API_KEY=xxx

# Redis (si mot de passe)
REDIS_URL=redis://:password@host:6379/0

# Qdrant (si auth)
QDRANT_API_KEY=xxx

# Stripe (si paiement)
STRIPE_SECRET_KEY=xxx
```

### 7.2 Ce qui MIGRE vers YAML (non-secrets)

| Variable `.env` actuelle | Nouveau fichier YAML | Clé YAML |
|--------------------------|---------------------|----------|
| `BOT_NAME` | `branding.yaml` | `bot.name` |
| `BOT_EMOJI` | `branding.yaml` | `bot.emoji` |
| `BOT_COLOR` | `branding.yaml` | `bot.color` |
| `ENTITY_TYPE` | `plugin.yaml` | `entity.type` |
| `QDRANT_MIN_SCORE` | `plugin.yaml` | `search.min_score` |
| `MAX_SEARCH_RESULTS` | `plugin.yaml` | `search.max_results` |
| `DEFAULT_LANGUAGE` | `plugin.yaml` | `settings.default_language` |
| `SESSION_ENABLED` | `plugin.yaml` | `features.session_continue` |
| `MEMORY_ENABLED` | `plugin.yaml` | `features.memory` |
| `MENTION_RATE_LIMIT_MESSAGES` | `plugin.yaml` | `rate_limit.messages` |
| `MENTION_RATE_LIMIT_WINDOW` | `plugin.yaml` | `rate_limit.window_seconds` |

### 7.3 Ce qui peut être dans `.env.local` OU YAML (infrastructure)

```bash
# Infrastructure - selon le déploiement
# Peut être dans .env.local pour varier entre environnements
# Ou dans plugin.yaml si fixe

N8N_BASE_URL=http://localhost:5678
N8N_PROJECT_ID=bot-appetit

QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=recipes

REDIS_URL=redis://localhost:6379/0

DISCORD_GUILD_ID=123456789

ENVIRONMENT=development
```

### 7.4 Priorité de chargement

```
1. Variables d'environnement (.env.local)  ← Priorité haute (override)
2. Fichiers YAML (config/)                 ← Valeurs par défaut
3. Valeurs par défaut du code              ← Fallback
```

### 7.5 Nouveau `.env.local` minimal

```bash
# =============================================================================
# SECRETS (obligatoires)
# =============================================================================
DISCORD_TOKEN=
N8N_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=

# =============================================================================
# INFRASTRUCTURE (selon environnement)
# =============================================================================
N8N_BASE_URL=http://localhost:5678
N8N_PROJECT_ID=bot-appetit
QDRANT_HOST=localhost
REDIS_URL=redis://localhost:6379/0
DISCORD_GUILD_ID=

# =============================================================================
# OVERRIDE YAML (optionnel)
# =============================================================================
# CONFIG_DIR=./config
# LANGUAGE=fr
# ENVIRONMENT=development
```

---

## 8. Avantages de la nouvelle architecture

| Aspect | Avant | Après |
|--------|-------|-------|
| **Modifier un prompt** | Éditer le code Python, redéployer | Éditer un fichier YAML, recharger |
| **Créer un plugin** | Copier/coller du code Python | Copier template + créer fichiers YAML |
| **Traduire (i18n)** | Modifier le code, dupliquer | Ajouter `i18n/en.yaml`, `i18n/es.yaml` |
| **Tests** | Mocker les constantes Python | Charger des YAML de test |
| **Maintenance** | Services dupliqués entre plugins | Services centralisés dans core |
| **Sécurité** | Risque de secrets dans le code | Secrets isolés dans `.env.local` |
| **Onboarding** | Comprendre le code Python | Éditer des fichiers YAML lisibles |

---

## 9. Plan de migration

### Phase 1 : chatbot-core (services génériques)

| Étape | Action | Fichiers |
|-------|--------|----------|
| 1.1 | Créer `PromptManager` | `chatbot_core/services/prompt_manager.py` |
| 1.2 | Créer `ConfigLoader` | `chatbot_core/core/config_loader.py` |
| 1.3 | Créer `BrandingConfig` dataclass | `chatbot_core/core/branding.py` |
| 1.4 | Migrer `conversation_memory.py` | Depuis plugin-recipes |
| 1.5 | Migrer `redis_service.py` | Depuis plugin-recipes |
| 1.6 | Migrer `search_service.py` | Depuis plugin-recipes |
| 1.7 | Ajouter exports dans `__init__.py` | `chatbot_core/services/__init__.py` |
| 1.8 | Tests unitaires | `tests/services/test_prompt_manager.py` |
| 1.9 | Documentation | `docs/services/prompt-manager.md` |

### Phase 2 : plugin-recipes (externalisation)

| Étape | Action | Fichiers |
|-------|--------|----------|
| 2.1 | Créer structure `config/` | `config/plugin.yaml`, `config/prompts/`, `config/branding.yaml` |
| 2.2 | Extraire scope vers YAML | `config/prompts/scope.yaml` |
| 2.3 | Extraire messages vers YAML | `config/prompts/responses.yaml` |
| 2.4 | Extraire branding vers YAML | `config/branding.yaml` |
| 2.5 | Modifier `__init__.py` | Utiliser `PromptManager` |
| 2.6 | Modifier `mentions.py` | Utiliser `PromptManager` |
| 2.7 | Modifier `branding.py` | Wrapper autour de `PromptManager` |
| 2.8 | Supprimer services migrés | `services/conversation_memory.py`, etc. |
| 2.9 | Mettre à jour `.env.example` | Retirer variables migrées |
| 2.10 | Tests d'intégration | Vérifier non-régression |

### Phase 3 : plugin-template (mise à jour)

| Étape | Action | Fichiers |
|-------|--------|----------|
| 3.1 | Mettre à jour structure | `templates/plugin-template/config/` |
| 3.2 | Créer YAML exemples | `scope.yaml`, `responses.yaml`, `branding.yaml` |
| 3.3 | Mettre à jour `mentions.py` | Utiliser `PromptManager` |
| 3.4 | Mettre à jour documentation | `docs/plugins/README.md` |
| 3.5 | Tester création nouveau plugin | Workflow complet |

### Rétrocompatibilité

- Les plugins existants **continuent de fonctionner** (fallback sur constantes Python)
- Migration **progressive** possible (YAML optionnel)
- Variables d'environnement **peuvent surcharger** YAML

---

## 10. Risques et mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Erreur parsing YAML | Bot ne démarre pas | Moyenne | Validation au démarrage + messages d'erreur clairs |
| Performance (I/O fichiers) | Latence | Faible | Cache en mémoire, chargement unique au démarrage |
| Secrets dans YAML | Fuite de données | Faible | Validation que secrets restent dans `.env` |
| Régression fonctionnelle | Bugs | Moyenne | Tests de non-régression exhaustifs |
| Complexité accrue | Maintenance difficile | Moyenne | Documentation complète + exemples |
| Désynchronisation YAML/code | Bugs runtime | Moyenne | Schéma de validation + tests |

---

## 11. Métriques de succès

- [ ] Modifier un prompt sans toucher au code Python
- [ ] Créer un nouveau plugin fonctionnel en partant du template
- [ ] 0 secret dans les fichiers YAML (validation automatique)
- [ ] Tests passent à 100% après migration
- [ ] Documentation complète avec exemples
- [ ] Performance équivalente ou meilleure (benchmark)

---

## 12. Questions ouvertes

1. **Format des fichiers** : YAML vs TOML vs JSON ?
   - YAML recommandé : lisible, supporte multiline, commentaires

2. **Validation de schéma** : JSON Schema, Pydantic, ou custom ?
   - Pydantic recommandé : intégration Python native

3. **Hot reload** : Supporter le rechargement sans redémarrage ?
   - À étudier : commande `/reload-config` pour admin

4. **Versioning** : Versionner les fichiers de config ?
   - Recommandé : `plugin.yaml` contient `version: "1.0.0"`

5. **Encryption** : Chiffrer certaines valeurs sensibles non-secrets ?
   - À étudier selon les besoins

---

## 13. Références

- [RFC-009 : Scope Classification](./RFC-009-scope-classification.md)
- [RFC-016 : Conversation Memory](./RFC-016-conversation-memory.md)
- [YAML 1.2 Specification](https://yaml.org/spec/1.2.2/)
- [12-Factor App - Config](https://12factor.net/config)
- [Pydantic Documentation](https://docs.pydantic.dev/)
