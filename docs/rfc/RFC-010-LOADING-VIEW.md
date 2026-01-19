# RFC-010: Loading View (Progress Indicator)

**Status:** Draft
**Date:** 2026-01-16
**Author:** Plugin Team (Bot Appetit)
**Target:** chatbot-core 0.6.31+

---

## Résumé

Composant Discord réutilisable pour afficher un indicateur de progression avec timer et barre de progression pendant les opérations longues (recherche, génération LLM, traitement, etc.).

---

## Problème

Actuellement, lors d'opérations longues (recherche de recettes, génération LLM, etc.) :

1. **Feedback minimal** - Simple message "Recherche en cours..." sans évolution
2. **Pas de timer** - L'utilisateur ne sait pas depuis combien de temps il attend
3. **Pas de progression** - Aucune indication de l'avancement
4. **Code dupliqué** - Chaque plugin réimplémente son propre loading
5. **UX frustrante** - L'utilisateur ne sait pas si le bot est bloqué

### Situation actuelle

```python
# Plugin actuel - feedback minimal
loading_embed = discord.Embed(
    description="🔍 Recherche en cours...",
    color=0xE67E22,
)
loading_msg = await message.reply(embed=loading_embed)

# ... traitement long sans feedback ...

await loading_msg.edit(embed=result_embed)
```

---

## Solution

### Composant LoadingView

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Recherche en cours...                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  **Requête:** pizza margherita                                  │
│                                                                 │
│  ⏱️ **Temps écoulé:** 3.2s                                      │
│                                                                 │
│  ████████████░░░░░░░░░░░░░░░░░░  40%                           │
│                                                                 │
│  💭 *Consultation de la base de recettes...*                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Bot Appetit | Recherche intelligente                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Composants Framework (chatbot-core)

### 1. LoadingConfig

```python
@dataclass
class LoadingConfig:
    """Configuration du LoadingView."""

    # Apparence
    title: str = "Chargement en cours..."
    color: int = 0x3498DB                    # Bleu par défaut
    emoji: str = "🔄"                        # Emoji titre

    # Timer
    show_timer: bool = True                  # Afficher le temps écoulé
    timer_label: str = "Temps écoulé"

    # Progress bar
    show_progress: bool = True               # Afficher la barre
    progress_width: int = 30                 # Largeur en caractères
    progress_filled: str = "█"               # Caractère rempli
    progress_empty: str = "░"                # Caractère vide
    progress_label: str = "Progression"

    # Status
    show_status: bool = True                 # Afficher le statut
    status_label: str = "Statut"
    status_emoji: str = "💭"

    # Footer
    footer: str | None = None                # Footer personnalisé

    # Auto-update
    auto_update_interval: float = 1.0        # Intervalle mise à jour timer (secondes)

    # Timeout
    timeout_seconds: float = 120.0           # Timeout max
    timeout_message: str = "Opération expirée. Veuillez réessayer."
```

### 2. LoadingStep

```python
@dataclass
class LoadingStep:
    """Étape de progression."""

    progress: int              # Pourcentage (0-100)
    status: str                # Message de statut
    emoji: str | None = None   # Emoji optionnel pour cette étape
```

### 3. LoadingPreset

```python
class LoadingPreset(Enum):
    """Presets de progression prédéfinis."""

    # Recherche de contenu
    SEARCH = [
        LoadingStep(0, "Initialisation..."),
        LoadingStep(25, "Recherche locale..."),
        LoadingStep(50, "Recherche web..."),
        LoadingStep(75, "Traitement des résultats..."),
        LoadingStep(100, "Terminé !"),
    ]

    # Génération LLM
    LLM_GENERATION = [
        LoadingStep(0, "Préparation de la requête..."),
        LoadingStep(20, "Envoi au modèle..."),
        LoadingStep(40, "Génération en cours..."),
        LoadingStep(70, "Analyse de la réponse..."),
        LoadingStep(90, "Mise en forme..."),
        LoadingStep(100, "Génération terminée !"),
    ]

    # Traitement d'image
    IMAGE_PROCESSING = [
        LoadingStep(0, "Réception de l'image..."),
        LoadingStep(30, "Analyse en cours..."),
        LoadingStep(60, "Traitement..."),
        LoadingStep(90, "Finalisation..."),
        LoadingStep(100, "Traitement terminé !"),
    ]

    # Upload/Download
    TRANSFER = [
        LoadingStep(0, "Connexion..."),
        LoadingStep(25, "Transfert en cours..."),
        LoadingStep(75, "Vérification..."),
        LoadingStep(100, "Transfert terminé !"),
    ]

    # Générique
    GENERIC = [
        LoadingStep(0, "Démarrage..."),
        LoadingStep(50, "Traitement..."),
        LoadingStep(100, "Terminé !"),
    ]
```

### 4. LoadingView

```python
class LoadingView(discord.ui.View):
    """Vue avec indicateur de progression."""

    def __init__(
        self,
        config: LoadingConfig | None = None,
        query: str | None = None,
        preset: LoadingPreset | None = None,
        steps: list[LoadingStep] | None = None,
    ):
        self.config = config or LoadingConfig()
        self.query = query
        self.steps = steps or (preset.value if preset else LoadingPreset.GENERIC.value)

        self.start_time = time.time()
        self.progress = 0
        self.status = self.steps[0].status if self.steps else "Chargement..."
        self.current_step_index = 0

        self._message: discord.Message | None = None
        self._update_task: asyncio.Task | None = None
        self._cancelled = False

        super().__init__(timeout=self.config.timeout_seconds)

    @property
    def elapsed(self) -> float:
        """Temps écoulé en secondes."""
        return time.time() - self.start_time

    @property
    def elapsed_display(self) -> str:
        """Temps écoulé formaté."""
        elapsed = self.elapsed
        if elapsed < 60:
            return f"{elapsed:.1f}s"
        minutes = int(elapsed // 60)
        seconds = elapsed % 60
        return f"{minutes}m {seconds:.0f}s"

    def create_progress_bar(self) -> str:
        """Crée la barre de progression."""
        width = self.config.progress_width
        filled = int(width * self.progress / 100)
        empty = width - filled

        bar = self.config.progress_filled * filled
        bar += self.config.progress_empty * empty

        return f"{bar} {self.progress}%"

    def create_embed(self) -> discord.Embed:
        """Crée l'embed de chargement."""
        title = f"{self.config.emoji} {self.config.title}"

        embed = discord.Embed(
            title=title,
            color=self.config.color,
        )

        # Requête/Query
        if self.query:
            embed.add_field(
                name="Requête",
                value=self.query,
                inline=False,
            )

        # Timer
        if self.config.show_timer:
            embed.add_field(
                name=f"⏱️ {self.config.timer_label}",
                value=self.elapsed_display,
                inline=True,
            )

        # Progress bar
        if self.config.show_progress:
            embed.add_field(
                name=self.config.progress_label,
                value=self.create_progress_bar(),
                inline=False,
            )

        # Status
        if self.config.show_status:
            status_emoji = self.config.status_emoji
            embed.add_field(
                name=f"{status_emoji} {self.config.status_label}",
                value=f"*{self.status}*",
                inline=False,
            )

        # Footer
        if self.config.footer:
            embed.set_footer(text=self.config.footer)

        return embed

    async def start(self, message: discord.Message) -> None:
        """Démarre l'auto-update du timer."""
        self._message = message

        if self.config.show_timer and self.config.auto_update_interval > 0:
            self._update_task = asyncio.create_task(self._auto_update_loop())

    async def _auto_update_loop(self) -> None:
        """Boucle de mise à jour automatique du timer."""
        while not self._cancelled and self._message:
            await asyncio.sleep(self.config.auto_update_interval)

            if self._cancelled:
                break

            try:
                await self._message.edit(embed=self.create_embed())
            except discord.NotFound:
                break
            except discord.HTTPException:
                pass  # Ignorer les erreurs de rate limit

    async def update(
        self,
        progress: int | None = None,
        status: str | None = None,
    ) -> None:
        """Met à jour la progression."""
        if progress is not None:
            self.progress = min(max(progress, 0), 100)

        if status is not None:
            self.status = status

        if self._message:
            try:
                await self._message.edit(embed=self.create_embed())
            except discord.HTTPException:
                pass

    async def next_step(self) -> None:
        """Passe à l'étape suivante du preset."""
        if self.current_step_index < len(self.steps) - 1:
            self.current_step_index += 1
            step = self.steps[self.current_step_index]
            await self.update(progress=step.progress, status=step.status)

    async def set_step(self, index: int) -> None:
        """Définit l'étape courante par index."""
        if 0 <= index < len(self.steps):
            self.current_step_index = index
            step = self.steps[index]
            await self.update(progress=step.progress, status=step.status)

    async def complete(
        self,
        status: str = "Terminé !",
        color: int | None = 0x57F287,  # Vert succès
    ) -> None:
        """Marque comme terminé."""
        self.progress = 100
        self.status = status
        self._cancelled = True

        if self._update_task:
            self._update_task.cancel()

        if color:
            self.config.color = color

        if self._message:
            try:
                await self._message.edit(embed=self.create_embed(), view=None)
            except discord.HTTPException:
                pass

    async def error(
        self,
        message: str = "Une erreur est survenue.",
        color: int = 0xED4245,  # Rouge erreur
    ) -> None:
        """Affiche une erreur."""
        self._cancelled = True
        self.status = message
        self.config.color = color
        self.config.emoji = "❌"

        if self._update_task:
            self._update_task.cancel()

        if self._message:
            try:
                await self._message.edit(embed=self.create_embed(), view=None)
            except discord.HTTPException:
                pass

    async def cancel(self) -> None:
        """Annule le loading."""
        self._cancelled = True
        if self._update_task:
            self._update_task.cancel()

    def add_cancel_button(
        self,
        label: str = "Annuler",
        callback: Callable | None = None,
    ) -> None:
        """Ajoute un bouton d'annulation."""
        button = discord.ui.Button(
            label=label,
            style=discord.ButtonStyle.secondary,
            emoji="✖️",
        )

        async def on_cancel(interaction: discord.Interaction):
            await self.cancel()
            if callback:
                await callback(interaction)
            else:
                await interaction.response.edit_message(
                    embed=discord.Embed(
                        title="❌ Annulé",
                        description="Opération annulée.",
                        color=0x95A5A6,
                    ),
                    view=None,
                )

        button.callback = on_cancel
        self.add_item(button)
```

### 5. Helper Functions

```python
async def with_loading(
    interaction: discord.Interaction,
    coroutine: Coroutine,
    config: LoadingConfig | None = None,
    query: str | None = None,
    preset: LoadingPreset | None = None,
    ephemeral: bool = False,
) -> tuple[Any, LoadingView]:
    """
    Exécute une coroutine avec un indicateur de chargement.

    Usage:
        result, loading = await with_loading(
            interaction,
            fetch_recipe("pizza"),
            query="pizza",
            preset=LoadingPreset.SEARCH,
        )
    """
    loading = LoadingView(config=config, query=query, preset=preset)

    # Envoyer le message initial
    await interaction.response.send_message(
        embed=loading.create_embed(),
        view=loading,
        ephemeral=ephemeral,
    )
    message = await interaction.original_response()
    await loading.start(message)

    try:
        # Exécuter la coroutine
        result = await coroutine

        # Marquer comme terminé
        await loading.complete()

        return result, loading

    except Exception as e:
        await loading.error(str(e))
        raise


def create_loading_embed(
    title: str = "Chargement...",
    query: str | None = None,
    progress: int = 0,
    status: str = "Initialisation...",
    elapsed: float = 0,
    color: int = 0x3498DB,
    footer: str | None = None,
) -> discord.Embed:
    """
    Crée un embed de chargement simple (sans view).

    Pour les cas où on n'a pas besoin de la vue complète.
    """
    embed = discord.Embed(title=f"🔄 {title}", color=color)

    if query:
        embed.add_field(name="Requête", value=query, inline=False)

    embed.add_field(name="⏱️ Temps", value=f"{elapsed:.1f}s", inline=True)

    # Progress bar
    width = 25
    filled = int(width * progress / 100)
    bar = "█" * filled + "░" * (width - filled)
    embed.add_field(name="Progression", value=f"{bar} {progress}%", inline=False)

    embed.add_field(name="💭 Statut", value=f"*{status}*", inline=False)

    if footer:
        embed.set_footer(text=footer)

    return embed
```

---

## Usage Plugin

### Exemple basique

```python
from chatbot_core.discord_ui import LoadingView, LoadingConfig

@bot.tree.command(name="recette")
async def recette(interaction: discord.Interaction, plat: str):
    # Créer le loading
    config = LoadingConfig(
        title="Recherche de recette",
        emoji="🔍",
        color=0xE67E22,
        footer="Bot Appetit | Recherche intelligente",
    )
    loading = LoadingView(config=config, query=plat)

    # Envoyer le message
    await interaction.response.send_message(embed=loading.create_embed(), view=loading)
    message = await interaction.original_response()
    await loading.start(message)

    try:
        # Étape 1
        await loading.update(progress=25, status="Recherche locale...")
        local_results = await search_local(plat)

        # Étape 2
        await loading.update(progress=50, status="Recherche web...")
        web_results = await search_web(plat)

        # Étape 3
        await loading.update(progress=75, status="Génération de la recette...")
        recipe = await generate_recipe(plat, local_results, web_results)

        # Terminé
        await loading.complete("Recette trouvée !")

        # Afficher le résultat
        await message.edit(embed=create_recipe_embed(recipe), view=RecipeView(recipe))

    except Exception as e:
        await loading.error(f"Erreur: {e}")
```

### Avec preset

```python
from chatbot_core.discord_ui import LoadingView, LoadingPreset

@bot.tree.command(name="generer")
async def generer(interaction: discord.Interaction, prompt: str):
    loading = LoadingView(
        query=prompt,
        preset=LoadingPreset.LLM_GENERATION,
    )

    await interaction.response.send_message(embed=loading.create_embed(), view=loading)
    message = await interaction.original_response()
    await loading.start(message)

    # Progression automatique par étapes
    await loading.next_step()  # 20% - Envoi au modèle...
    response = await call_llm(prompt)

    await loading.next_step()  # 40% - Génération en cours...
    await loading.next_step()  # 70% - Analyse...

    result = parse_response(response)

    await loading.next_step()  # 90% - Mise en forme...
    embed = format_result(result)

    await loading.complete()   # 100% - Terminé !
    await message.edit(embed=embed, view=None)
```

### Avec helper function

```python
from chatbot_core.discord_ui import with_loading, LoadingPreset

@bot.tree.command(name="rechercher")
async def rechercher(interaction: discord.Interaction, query: str):
    # Une seule ligne pour tout gérer
    result, loading = await with_loading(
        interaction,
        search_service.search(query),
        query=query,
        preset=LoadingPreset.SEARCH,
    )

    # Afficher le résultat
    message = await interaction.original_response()
    await message.edit(embed=create_result_embed(result))
```

### Avec bouton annuler

```python
loading = LoadingView(query="recherche longue")
loading.add_cancel_button(label="Annuler la recherche")

await interaction.response.send_message(embed=loading.create_embed(), view=loading)
```

---

## Animations

### Spinner animé

Pour les opérations indéterminées (sans progression connue) :

```python
class SpinnerConfig(LoadingConfig):
    """Config avec spinner animé."""

    show_progress: bool = False  # Pas de barre
    spinner_frames: list[str] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    # ou: ["🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛"]
```

### Pulsing dots

```python
PULSING_DOTS = ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"]
BOUNCING_BAR = ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[ ===]", "[  ==]", "[   =]", "[    ]"]
```

---

## Exports proposés

```python
# chatbot_core/discord_ui/__init__.py
from chatbot_core.discord_ui.loading import (
    LoadingView,
    LoadingConfig,
    LoadingStep,
    LoadingPreset,
    with_loading,
    create_loading_embed,
)
```

---

## Implémentation

### Phase 1 - Core (P0)

| Tâche | Effort |
|-------|--------|
| `LoadingConfig` dataclass | S |
| `LoadingStep` dataclass | S |
| `LoadingPreset` enum | S |
| `LoadingView` classe principale | M |
| Méthodes update/complete/error | S |
| Auto-update timer | M |
| Tests unitaires | M |

### Phase 2 - Helpers (P1)

| Tâche | Effort |
|-------|--------|
| `with_loading()` helper | S |
| `create_loading_embed()` helper | S |
| Bouton annuler | S |
| Documentation | S |

### Phase 3 - Animations (P1)

| Tâche | Effort |
|-------|--------|
| SpinnerView (indéterminé) | S |
| Animations alternatives | S |

---

## Considérations

### Rate Limits Discord

- Mise à jour max toutes les 1 seconde (configurable)
- Éviter les édits trop fréquents
- Catch les erreurs HTTP 429

### Performance

- Utiliser `asyncio.Task` pour l'auto-update
- Annuler proprement les tasks
- Pas de memory leak sur les références

### UX

- Couleur change au succès (vert) / erreur (rouge)
- Message clair à chaque étape
- Timer visible pour rassurer l'utilisateur

---

## Questions pour l'équipe

1. **Intégrer avec MentionService ?** - Le `DefaultMentionHandler` pourrait utiliser `LoadingView` pendant le traitement n8n pour montrer la progression à l'utilisateur.

2. **Priorité ?** - Ce RFC améliore l'UX mais n'est pas bloquant pour les fonctionnalités actuelles. P1 ou P2 ?

---

## Références

- [RFC-007: Mention Service](./RFC-007-MENTION-SERVICE.md) - Pattern async
- [RFC-008: Admin Config](./RFC-008-ADMIN-CONFIG-SCREENS.md) - Pattern views
- Discord.py Views documentation
