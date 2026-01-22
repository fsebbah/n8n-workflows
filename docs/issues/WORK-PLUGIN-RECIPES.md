# Travail Équipe plugin-recipes (Bot Appetit)

**Source:** RFC-016 + RFC-017
**Date:** 2026-01-22
**Priorité globale:** 🔴 Haute (Phase 2 - Adaptation plugins)

---

## Résumé

L'équipe plugin-recipes doit migrer vers le nouveau format de réponse `response_type` + `proposed_actions` et confirmer que le flag `auto_web_search` fonctionne correctement.

---

## Actions à réaliser

| # | Action | Priorité | Dépendances |
|---|--------|----------|-------------|
| 1 | Migrer vers format `response_type` | 🔴 Haute | n8n: Action 7 |
| 2 | Confirmer `auto_web_search: false` | 🔴 Haute | n8n: Action 6 |
| 3 | Implémenter mémoire conversationnelle | 🟢 Quand pertinent | Aucune |
| 4 | Supporter OCR recettes | 🟢 Quand pertinent | Aucune |

---

## Action 1 : Migrer vers format response_type

### Contexte

Le format de réponse du workflow `llm-intention` change :

| Ancien format (DÉPRÉCIÉ) | Nouveau format (RFC-016) |
|-------------------------|--------------------------|
| `next_action: "propose_web_search"` | `response_type: "action_proposal"` |
| Champs éparpillés | Structure `proposed_actions[]` |

**IMPORTANT:** Pas de rétrocompatibilité. Migration directe requise.

### Fichiers à modifier

```
mentions.py (ou équivalent)
```

### Avant

```python
# mentions.py - ANCIEN CODE À SUPPRIMER

async def handle_llm_response(self, response: dict, message: discord.Message):
    """Handle response from llm-intention workflow."""

    # Ancien format
    next_action = response.get("next_action")
    llm_message = response.get("message", "")

    if next_action == "propose_web_search":
        # Proposer la recherche web
        view = WebSearchView(
            query=response.get("search_query"),
            message=llm_message
        )
        await message.reply(content=llm_message, view=view)

    elif next_action == "web_search":
        # Lancer directement la recherche
        await self._execute_web_search(response.get("search_query"), message)

    elif next_action == "direct_response":
        # Réponse directe
        await message.reply(content=llm_message)

    else:
        # Fallback
        await message.reply(content=llm_message or "Je n'ai pas compris.")
```

### Après

```python
# mentions.py - NOUVEAU CODE

async def handle_llm_response(self, response: dict, message: discord.Message):
    """Handle response from llm-intention workflow (RFC-016 format)."""

    response_type = response.get("response_type", "message")
    llm_message = response.get("message", "")

    if response_type == "action_proposal":
        # Proposition d'actions avec boutons
        proposed_actions = response.get("proposed_actions", [])
        requires_confirmation = response.get("requires_confirmation", True)

        if requires_confirmation and proposed_actions:
            # Afficher les boutons pour chaque action
            view = ActionProposalView(
                actions=proposed_actions,
                original_message=message
            )
            await message.reply(content=llm_message, view=view)
        elif proposed_actions:
            # Exécuter la première action automatiquement
            action = proposed_actions[0]
            await self._execute_action(action, message)
        else:
            # Pas d'actions, afficher le message
            await message.reply(content=llm_message)

    elif response_type == "message":
        # Réponse textuelle simple
        await message.reply(content=llm_message)

    elif response_type == "error":
        # Erreur
        error_msg = response.get("error", "Une erreur est survenue.")
        await message.reply(content=f"❌ {error_msg}")

    else:
        # Fallback pour types inconnus
        await message.reply(content=llm_message or "Je n'ai pas compris.")
```

### Nouveau View pour propositions d'actions

```python
# views/action_proposal_view.py

class ActionProposalView(discord.ui.View):
    """View for displaying proposed actions as buttons."""

    def __init__(
        self,
        actions: list[dict],
        original_message: discord.Message,
        timeout: float = 300.0  # 5 minutes
    ):
        super().__init__(timeout=timeout)
        self.actions = {action["id"]: action for action in actions}
        self.original_message = original_message

        # Créer un bouton pour chaque action (max 5)
        for action in actions[:5]:
            button = discord.ui.Button(
                label=action.get("label", action["id"]),
                style=self._get_button_style(action),
                custom_id=f"action_{action['id']}"
            )
            button.callback = self._make_callback(action)
            self.add_item(button)

        # Ajouter bouton Annuler
        cancel_button = discord.ui.Button(
            label="❌ Annuler",
            style=discord.ButtonStyle.secondary,
            custom_id="action_cancel"
        )
        cancel_button.callback = self._cancel_callback
        self.add_item(cancel_button)

    def _get_button_style(self, action: dict) -> discord.ButtonStyle:
        """Determine button style based on action type."""
        action_id = action.get("id", "")
        if "search" in action_id or "web" in action_id:
            return discord.ButtonStyle.primary  # Bleu
        elif "translate" in action_id:
            return discord.ButtonStyle.success  # Vert
        else:
            return discord.ButtonStyle.secondary  # Gris

    def _make_callback(self, action: dict):
        """Create callback for action button."""
        async def callback(interaction: discord.Interaction):
            # Désactiver les boutons
            for item in self.children:
                item.disabled = True
            await interaction.response.edit_message(view=self)

            # Exécuter l'action
            await self._execute_action(action, interaction)

        return callback

    async def _execute_action(self, action: dict, interaction: discord.Interaction):
        """Execute the selected action."""
        webhook = action.get("webhook")
        params = action.get("params", {})
        estimate = action.get("estimate", {})

        # Afficher estimation si disponible
        if estimate:
            cost = estimate.get("cost_estimated_eur", 0)
            time_sec = estimate.get("time_estimated_seconds", 0)
            await interaction.followup.send(
                f"⏳ Exécution en cours... (estimé: {cost:.2f}€, ~{time_sec}s)",
                ephemeral=True
            )

        # Appeler le webhook approprié
        if webhook == "llm-web-search":
            await self._execute_web_search(params, interaction)
        # Ajouter d'autres webhooks selon besoin

    async def _execute_web_search(self, params: dict, interaction: discord.Interaction):
        """Execute web search action."""
        query = params.get("query", "")
        # ... logique de recherche web existante

    async def _cancel_callback(self, interaction: discord.Interaction):
        """Handle cancel button click."""
        await interaction.response.edit_message(
            content="Action annulée.",
            view=None
        )
```

### Structure proposed_actions

```json
{
  "response_type": "action_proposal",
  "message": "Pas de recette en base pour 'tajine végétarien'. Voulez-vous chercher sur le web ?",
  "proposed_actions": [
    {
      "id": "web_search",
      "label": "🌐 Chercher sur le web",
      "description": "Rechercher des recettes sur internet",
      "webhook": "llm-web-search",
      "params": {
        "query": "tajine végétarien recette",
        "type": "recipe"
      },
      "estimate": {
        "tokens_estimated": 2000,
        "cost_estimated_eur": 0.01,
        "time_estimated_seconds": 10
      }
    },
    {
      "id": "suggest_similar",
      "label": "📚 Recettes similaires",
      "description": "Voir des recettes similaires en base",
      "webhook": "recipe-search",
      "params": {
        "query": "tajine végétarien",
        "limit": 5
      }
    }
  ],
  "requires_confirmation": true
}
```

---

## Action 2 : Confirmer auto_web_search: false

### Contexte

Le flag `auto_web_search` contrôle si la recherche web se lance automatiquement ou propose d'abord à l'utilisateur.

### Payload actuel à vérifier

```python
# mentions.py
async def call_llm_intention(self, content: str, context: dict):
    payload = {
        "query": content,
        "context": {
            "type": "recipe",
            "auto_web_search": False,  # ← VÉRIFIÉ: Ne pas lancer auto
            **context
        }
    }
    return await self.n8n_client.call_webhook("/webhook/llm-intention", json=payload)
```

### Comportement attendu

| `auto_web_search` | Comportement |
|-------------------|--------------|
| `true` (défaut) | LLM décide de lancer la recherche automatiquement |
| `false` | LLM retourne `response_type: "action_proposal"` avec action `web_search` |

### Test à effectuer

```bash
# Test avec auto_web_search: false
curl -X POST http://localhost:5678/webhook/llm-intention \
  -H "Content-Type: application/json" \
  -d '{
    "query": "recette de pizza maison",
    "context": {
      "type": "recipe",
      "auto_web_search": false
    }
  }'
```

### Réponse attendue

```json
{
  "success": true,
  "response_type": "action_proposal",
  "message": "Je n'ai pas trouvé de recette de pizza maison dans ma base. Voulez-vous que je cherche sur le web ?",
  "proposed_actions": [
    {
      "id": "web_search",
      "label": "🌐 Chercher sur le web",
      "webhook": "llm-web-search",
      "params": { "query": "recette pizza maison" }
    }
  ],
  "requires_confirmation": true
}
```

### Si ça ne fonctionne pas

Contacter l'équipe n8n pour :
1. Vérifier que le workflow `llm-intention` / `mcp-llm-intention` vérifie le flag
2. Confirmer que la condition `if (!auto_web_search)` est implémentée

---

## Action 3 : Implémenter mémoire conversationnelle (Optionnel)

### Contexte

La mémoire conversationnelle permet des échanges multi-tours :
```
User: "Donne-moi une recette de pâtes"
Bot: "Pour combien de personnes ?"
User: "5"
Bot: "Voici une recette pour 5 personnes..."
```

### Prérequis

- Décision produit : Est-ce pertinent pour Bot Appetit ?
- L'architecture est prête côté n8n (le workflow accepte `history[]`)

### Implémentation suggérée

```python
# conversation_memory.py
from collections import defaultdict
from datetime import datetime, timedelta

class ConversationMemory:
    """Simple in-memory conversation storage."""

    def __init__(self, max_messages: int = 10, ttl_minutes: int = 30):
        self.max_messages = max_messages
        self.ttl = timedelta(minutes=ttl_minutes)
        self._storage: dict[str, list[dict]] = defaultdict(list)
        self._timestamps: dict[str, datetime] = {}

    def _get_key(self, channel_id: int, user_id: int) -> str:
        """Generate storage key."""
        return f"{channel_id}:{user_id}"

    def add_message(self, channel_id: int, user_id: int, role: str, content: str):
        """Add a message to the conversation history."""
        key = self._get_key(channel_id, user_id)

        # Check TTL
        if key in self._timestamps:
            if datetime.now() - self._timestamps[key] > self.ttl:
                self._storage[key] = []

        # Add message
        self._storage[key].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })

        # Trim to max
        if len(self._storage[key]) > self.max_messages:
            self._storage[key] = self._storage[key][-self.max_messages:]

        self._timestamps[key] = datetime.now()

    def get_history(self, channel_id: int, user_id: int) -> list[dict]:
        """Get conversation history for a user in a channel."""
        key = self._get_key(channel_id, user_id)

        # Check TTL
        if key in self._timestamps:
            if datetime.now() - self._timestamps[key] > self.ttl:
                self._storage[key] = []
                return []

        return self._storage[key].copy()

    def clear(self, channel_id: int, user_id: int):
        """Clear conversation history."""
        key = self._get_key(channel_id, user_id)
        self._storage[key] = []
```

### Utilisation dans mentions.py

```python
# mentions.py
class RecipeMentionHandler:
    def __init__(self, n8n_client, memory: ConversationMemory):
        self.n8n_client = n8n_client
        self.memory = memory

    async def handle_mention(self, message: discord.Message):
        # Récupérer l'historique
        history = self.memory.get_history(
            channel_id=message.channel.id,
            user_id=message.author.id
        )

        # Ajouter le message actuel à l'historique
        self.memory.add_message(
            channel_id=message.channel.id,
            user_id=message.author.id,
            role="user",
            content=message.content
        )

        # Appeler llm-intention avec l'historique
        response = await self.call_llm_intention(
            content=message.content,
            context={"type": "recipe", "auto_web_search": False},
            history=history  # ← NOUVEAU
        )

        # Traiter la réponse
        bot_response = await self.handle_llm_response(response, message)

        # Sauvegarder la réponse du bot
        if bot_response:
            self.memory.add_message(
                channel_id=message.channel.id,
                user_id=message.author.id,
                role="assistant",
                content=bot_response
            )

    async def call_llm_intention(self, content: str, context: dict, history: list = None):
        payload = {
            "query": content,
            "context": context,
            "history": history or []  # ← NOUVEAU
        }
        return await self.n8n_client.call_webhook("/webhook/llm-intention", json=payload)
```

---

## Action 4 : Supporter OCR recettes (Optionnel)

### Contexte

Permettre aux utilisateurs d'envoyer une photo de recette et d'en extraire le texte.

### Prérequis

- Décision produit : Est-ce pertinent pour Bot Appetit ?
- Webhooks existants : `/webhook/image-ocr` (Mistral)

### Cas d'usage

1. User envoie une photo de recette manuscrite ou imprimée
2. Bot extrait le texte via OCR
3. Bot parse la recette (ingrédients, étapes)
4. Bot sauvegarde la recette en base

### Implémentation suggérée

```python
# handlers/image_handler.py
class RecipeImageHandler:
    async def handle_image(self, message: discord.Message, attachment: discord.Attachment):
        """Handle image attachment for recipe extraction."""

        # 1. Vérifier que c'est une image
        if not attachment.content_type.startswith("image/"):
            return None

        # 2. Appeler OCR
        ocr_result = await self.n8n_client.call_webhook(
            "/webhook/image-ocr",
            json={
                "image_url": attachment.url,
                "language": "fr",
                "extract_type": "recipe"
            }
        )

        if not ocr_result.get("success"):
            await message.reply("❌ Je n'ai pas pu lire cette image.")
            return

        extracted_text = ocr_result.get("text", "")

        # 3. Parser comme recette (via LLM)
        parse_result = await self.n8n_client.call_webhook(
            "/webhook/llm-intention",
            json={
                "query": f"Parse cette recette et structure-la : {extracted_text}",
                "context": {
                    "type": "recipe_parsing",
                    "source": "ocr"
                }
            }
        )

        # 4. Afficher le résultat
        # ...
```

---

## Checklist finale

### Phase 1 (Priorité haute)

- [ ] Modifier `handle_llm_response()` pour nouveau format
- [ ] Créer `ActionProposalView` pour boutons
- [ ] Tester avec réponse `response_type: "action_proposal"`
- [ ] Vérifier que `auto_web_search: false` est bien envoyé
- [ ] Tester que le workflow retourne une proposition (pas exécution auto)

### Phase 2 (Priorité moyenne)

- [ ] Documenter la migration dans le code
- [ ] Supprimer l'ancien code `next_action`
- [ ] Ajouter logs pour debug

### Phase 3 (Future - Quand pertinent)

- [ ] Implémenter `ConversationMemory`
- [ ] Ajouter `history[]` aux appels llm-intention
- [ ] Implémenter `RecipeImageHandler` pour OCR

---

## Tests à effectuer

### Test format response_type

1. Mentionner `@Bot Appetit recette de pizza`
2. Vérifier que la réponse contient des boutons
3. Cliquer sur "Chercher sur le web"
4. Vérifier que la recherche se lance

### Test auto_web_search

1. Mentionner `@Bot Appetit recette de sushi`
2. Vérifier que le bot **propose** la recherche (ne lance pas automatiquement)
3. Vérifier les boutons "Chercher" et "Annuler"

### Test annulation

1. Mentionner avec une requête
2. Cliquer sur "Annuler"
3. Vérifier que le message est mis à jour

---

## Migration - Checklist de code

### Fichiers à modifier

| Fichier | Modification |
|---------|--------------|
| `mentions.py` | Nouveau `handle_llm_response()` |
| `views/__init__.py` | Ajouter `ActionProposalView` |
| `views/action_proposal_view.py` | Créer le fichier |

### Imports à ajouter

```python
from views.action_proposal_view import ActionProposalView
```

### Ancien code à supprimer

```python
# Supprimer toute référence à :
- next_action
- "propose_web_search"
- "direct_response"
```

---

## Contact

Pour questions sur ces spécifications :
- RFC-016 : Architecture globale et format response_type
- n8n : Confirmer auto_web_search
