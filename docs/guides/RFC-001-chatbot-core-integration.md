# RFC-001: Integration chatbot-core - Product Discovery

**Version:** 1.0
**Date:** 2026-01-14
**Pour:** Equipe chatbot-core

---

## 1. Vue d'ensemble

Ce document decrit comment integrer le workflow **Product Discovery** depuis le framework `chatbot-core`.

### Architecture

```
┌─────────────────────┐
│   chatbot-core      │
│   (Discord Bot)     │
└──────────┬──────────┘
           │ HTTP POST
           ▼
┌─────────────────────┐
│   n8n Workflow      │
│   product-discovery │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   OpenAI API        │
│   (via headers)     │
└─────────────────────┘
```

---

## 2. Endpoint

### URL

```
POST {N8N_BASE_URL}/webhook/product-discovery
```

### Headers requis

| Header | Type | Requis | Description |
|--------|------|--------|-------------|
| `Content-Type` | string | ✅ | `application/json` |
| `X-Project-ID` | string | ✅ | ID du plugin appelant |
| `X-OpenAI-API-Key` | string | ✅ | Cle API OpenAI du projet |
| `Authorization` | string | ❌ | Token n8n si authentification activee |

### Body

```json
{
  "items": [
    {"item_name": "farine", "category": "ingredient"},
    {"item_name": "oeufs", "category": "ingredient"},
    {"item_name": "lait", "category": "ingredient"},
    {"item_name": "poêle", "category": "ustensile"}
  ],
  "context": "Pour faire des crêpes",
  "discord_user_id": "123456789012345678",
  "locale": "fr-FR"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `items` | array | ✅ | Liste des items a rechercher |
| `items[].item_name` | string | ✅ | Nom de l'item |
| `items[].category` | string | ✅ | `ingredient` ou `ustensile` |
| `context` | string | ✅ | Contexte d'utilisation |
| `discord_user_id` | string | ❌ | ID Discord de l'utilisateur |
| `locale` | string | ❌ | Locale (defaut: `fr-FR`) |

---

## 3. Response

### Succes (200)

```json
{
  "success": true,
  "context": "Pour faire des crêpes",
  "project_id": "plugin-recipes",
  "discord_user_id": "123456789012345678",
  "items_count": 4,
  "shopping_list": [
    {
      "original_item": "farine",
      "refined_item": "farine de blé",
      "category": "ingredient",
      "reasoning": {
        "layers": {
          "lexical": "Le terme 'farine' est un hyperonyme trop générique",
          "context": "Crêpes = usage standard en cuisine française",
          "knowledge": "Crêpes classiques = farine de blé (majoritaire)",
          "precision": "Pas d'indication pour sarrasin ou sans gluten"
        },
        "justification": "Crêpes = farine de blé standard",
        "confidence": 0.92,
        "variants": [
          {"name": "farine de blé T45", "reason": "Pour crêpes fines"},
          {"name": "farine de blé T55", "reason": "Pour crêpes rustiques"}
        ]
      },
      "product": {
        "name": "Farine de blé T45 Francine 1kg",
        "description": "Farine fluide idéale pâtisserie",
        "price_cents": 189,
        "price_display": "1,89 €",
        "currency": "EUR",
        "brand": "Francine",
        "seller": "Carrefour",
        "url": "https://www.carrefour.fr/p/...",
        "image_url": "https://cdn.carrefour.fr/..."
      }
    }
  ],
  "total_cents": 2766,
  "total_display": "27,66 €"
}
```

### Erreur (4xx/5xx)

```json
{
  "success": false,
  "error": "processing_error",
  "message": "Description de l'erreur"
}
```

| Code | error | Description |
|------|-------|-------------|
| 400 | `missing_items` | Champ `items` manquant ou vide |
| 400 | `missing_context` | Champ `context` manquant |
| 401 | `missing_api_key` | Header `X-OpenAI-API-Key` manquant |
| 500 | `processing_error` | Erreur durant le traitement |
| 502 | `openai_error` | Erreur de l'API OpenAI |

---

## 4. Implementation Python

### 4.1 Service ProductDiscoveryClient

```python
"""Product Discovery Client pour chatbot-core."""

import httpx
from dataclasses import dataclass
from typing import Optional


@dataclass
class ProductDiscoveryConfig:
    """Configuration du client Product Discovery."""

    n8n_base_url: str
    openai_api_key: str
    project_id: str
    timeout: int = 60


@dataclass
class DiscoveryItem:
    """Item a rechercher."""

    item_name: str
    category: str  # "ingredient" | "ustensile"


@dataclass
class Product:
    """Produit trouve."""

    name: str
    description: str
    price_cents: int
    price_display: str
    currency: str
    brand: str
    seller: str
    url: Optional[str]
    image_url: Optional[str]


@dataclass
class ShoppingListItem:
    """Item de la liste de courses."""

    original_item: str
    refined_item: str
    category: str
    reasoning: dict
    product: Product


@dataclass
class ShoppingListResult:
    """Resultat du Product Discovery."""

    success: bool
    context: str
    items_count: int
    shopping_list: list[ShoppingListItem]
    total_cents: int
    total_display: str
    error: Optional[str] = None


class ProductDiscoveryClient:
    """Client pour appeler le workflow Product Discovery."""

    def __init__(self, config: ProductDiscoveryConfig):
        self.config = config
        self._client = httpx.AsyncClient(timeout=config.timeout)

    async def discover(
        self,
        items: list[DiscoveryItem],
        context: str,
        discord_user_id: Optional[str] = None,
        locale: str = "fr-FR",
    ) -> ShoppingListResult:
        """
        Recherche des produits pour une liste d'items.

        Args:
            items: Liste des items a rechercher
            context: Contexte d'utilisation (ex: "Pour faire des crêpes")
            discord_user_id: ID Discord de l'utilisateur
            locale: Locale (defaut: fr-FR)

        Returns:
            ShoppingListResult avec les produits trouves
        """
        url = f"{self.config.n8n_base_url}/webhook/product-discovery"

        headers = {
            "Content-Type": "application/json",
            "X-Project-ID": self.config.project_id,
            "X-OpenAI-API-Key": self.config.openai_api_key,
        }

        payload = {
            "items": [
                {"item_name": item.item_name, "category": item.category}
                for item in items
            ],
            "context": context,
            "discord_user_id": discord_user_id,
            "locale": locale,
        }

        try:
            response = await self._client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                return ShoppingListResult(
                    success=False,
                    context=context,
                    items_count=0,
                    shopping_list=[],
                    total_cents=0,
                    total_display="0,00 €",
                    error=data.get("message", "Unknown error"),
                )

            # Parser les items
            shopping_list = []
            for item_data in data.get("shopping_list", []):
                product_data = item_data.get("product", {})
                product = Product(
                    name=product_data.get("name", ""),
                    description=product_data.get("description", ""),
                    price_cents=product_data.get("price_cents", 0),
                    price_display=product_data.get("price_display", ""),
                    currency=product_data.get("currency", "EUR"),
                    brand=product_data.get("brand", ""),
                    seller=product_data.get("seller", ""),
                    url=product_data.get("url"),
                    image_url=product_data.get("image_url"),
                )

                shopping_list.append(ShoppingListItem(
                    original_item=item_data.get("original_item", ""),
                    refined_item=item_data.get("refined_item", ""),
                    category=item_data.get("category", ""),
                    reasoning=item_data.get("reasoning", {}),
                    product=product,
                ))

            return ShoppingListResult(
                success=True,
                context=data.get("context", context),
                items_count=data.get("items_count", len(shopping_list)),
                shopping_list=shopping_list,
                total_cents=data.get("total_cents", 0),
                total_display=data.get("total_display", "0,00 €"),
            )

        except httpx.HTTPStatusError as e:
            return ShoppingListResult(
                success=False,
                context=context,
                items_count=0,
                shopping_list=[],
                total_cents=0,
                total_display="0,00 €",
                error=f"HTTP {e.response.status_code}: {e.response.text}",
            )
        except Exception as e:
            return ShoppingListResult(
                success=False,
                context=context,
                items_count=0,
                shopping_list=[],
                total_cents=0,
                total_display="0,00 €",
                error=str(e),
            )

    async def close(self):
        """Ferme le client HTTP."""
        await self._client.aclose()
```

### 4.2 Exemple d'utilisation

```python
import asyncio
from product_discovery_client import (
    ProductDiscoveryClient,
    ProductDiscoveryConfig,
    DiscoveryItem,
)


async def main():
    # Configuration
    config = ProductDiscoveryConfig(
        n8n_base_url="https://n8n.example.com",
        openai_api_key="sk-...",
        project_id="plugin-recipes",
    )

    # Client
    client = ProductDiscoveryClient(config)

    try:
        # Items a rechercher
        items = [
            DiscoveryItem(item_name="farine", category="ingredient"),
            DiscoveryItem(item_name="oeufs", category="ingredient"),
            DiscoveryItem(item_name="lait", category="ingredient"),
            DiscoveryItem(item_name="poêle", category="ustensile"),
        ]

        # Recherche
        result = await client.discover(
            items=items,
            context="Pour faire des crêpes",
            discord_user_id="123456789012345678",
        )

        if result.success:
            print(f"✅ {result.items_count} produits trouvés")
            print(f"💰 Total: {result.total_display}")
            print()

            for item in result.shopping_list:
                print(f"📦 {item.original_item} → {item.refined_item}")
                print(f"   💭 {item.reasoning.get('justification', '')}")
                print(f"   🛒 {item.product.name}")
                print(f"   💵 {item.product.price_display} @ {item.product.seller}")
                print()
        else:
            print(f"❌ Erreur: {result.error}")

    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 5. Integration Discord

### 5.1 Commande /liste-courses

```python
import discord
from discord import app_commands


class ShoppingListCog(commands.Cog):
    """Cog pour la liste de courses."""

    def __init__(self, bot, discovery_client: ProductDiscoveryClient):
        self.bot = bot
        self.discovery_client = discovery_client

    @app_commands.command(name="liste-courses")
    @app_commands.describe(
        recette="Nom de la recette pour laquelle chercher les ingredients"
    )
    async def shopping_list(
        self,
        interaction: discord.Interaction,
        recette: str,
    ):
        """Genere une liste de courses pour une recette."""

        await interaction.response.defer(thinking=True)

        # Recuperer la recette et ses ingredients
        recipe = await self.get_recipe(recette)
        if not recipe:
            await interaction.followup.send(
                f"❌ Recette '{recette}' non trouvée.",
                ephemeral=True,
            )
            return

        # Convertir en items
        items = [
            DiscoveryItem(item_name=ing["name"], category="ingredient")
            for ing in recipe.ingredients
        ]

        # Ajouter les ustensiles si necessaire
        if recipe.ustensiles:
            items.extend([
                DiscoveryItem(item_name=ust, category="ustensile")
                for ust in recipe.ustensiles
            ])

        # Appeler Product Discovery
        result = await self.discovery_client.discover(
            items=items,
            context=f"Pour faire {recipe.title}",
            discord_user_id=str(interaction.user.id),
        )

        if not result.success:
            await interaction.followup.send(
                f"❌ Erreur: {result.error}",
                ephemeral=True,
            )
            return

        # Creer l'embed
        embed = self.create_shopping_embed(result, recipe.title)
        view = ShoppingListView(result, self.discovery_client)

        await interaction.followup.send(embed=embed, view=view)

    def create_shopping_embed(
        self,
        result: ShoppingListResult,
        recipe_title: str,
    ) -> discord.Embed:
        """Cree l'embed de la liste de courses."""

        embed = discord.Embed(
            title=f"🛒 Liste de courses pour \"{recipe_title}\"",
            description=f"{result.items_count} articles • Total estimé : **{result.total_display}**",
            color=discord.Color.green(),
        )

        # Grouper par categorie
        ingredients = [i for i in result.shopping_list if i.category == "ingredient"]
        ustensiles = [i for i in result.shopping_list if i.category == "ustensile"]

        # Ingredients
        if ingredients:
            lines = []
            for item in ingredients:
                lines.append(
                    f"**{item.original_item}** → {item.refined_item}\n"
                    f"└ 💭 _{item.reasoning.get('justification', '')}_\n"
                    f"└ 📦 {item.product.name} • **{item.product.price_display}**"
                )
            embed.add_field(
                name="🥬 Ingrédients",
                value="\n\n".join(lines),
                inline=False,
            )

        # Ustensiles
        if ustensiles:
            lines = []
            for item in ustensiles:
                lines.append(
                    f"**{item.original_item}** → {item.refined_item}\n"
                    f"└ 💭 _{item.reasoning.get('justification', '')}_\n"
                    f"└ 📦 {item.product.name} • **{item.product.price_display}**"
                )
            embed.add_field(
                name="🍳 Ustensiles",
                value="\n\n".join(lines),
                inline=False,
            )

        return embed


class ShoppingListView(discord.ui.View):
    """Vue interactive pour la liste de courses."""

    def __init__(self, result: ShoppingListResult, client: ProductDiscoveryClient):
        super().__init__(timeout=300)
        self.result = result
        self.client = client

    @discord.ui.button(label="🛒 Tout ajouter au panier", style=discord.ButtonStyle.success)
    async def add_all_to_cart(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button,
    ):
        """Ajoute tous les produits au panier."""
        # TODO: Implementer l'ajout au panier
        await interaction.response.send_message(
            "✅ Tous les produits ont été ajoutés au panier !",
            ephemeral=True,
        )

    @discord.ui.button(label="📋 Voir le raisonnement", style=discord.ButtonStyle.secondary)
    async def show_reasoning(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button,
    ):
        """Affiche le raisonnement detaille."""
        embed = discord.Embed(
            title="🧠 Raisonnement détaillé",
            color=discord.Color.blue(),
        )

        for item in self.result.shopping_list:
            reasoning = item.reasoning
            layers = reasoning.get("layers", {})

            text = (
                f"**1️⃣ Lexical:** {layers.get('lexical', 'N/A')}\n"
                f"**2️⃣ Contexte:** {layers.get('context', 'N/A')}\n"
                f"**3️⃣ Connaissances:** {layers.get('knowledge', 'N/A')}\n"
                f"**4️⃣ Précision:** {layers.get('precision', 'N/A')}\n"
                f"\n📊 Confiance: {reasoning.get('confidence', 0) * 100:.0f}%"
            )

            embed.add_field(
                name=f"{item.original_item} → {item.refined_item}",
                value=text,
                inline=False,
            )

        await interaction.response.send_message(embed=embed, ephemeral=True)

    @discord.ui.button(label="❌ Annuler", style=discord.ButtonStyle.danger)
    async def cancel(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button,
    ):
        """Annule la liste de courses."""
        await interaction.response.send_message(
            "🗑️ Liste de courses annulée.",
            ephemeral=True,
        )
        await interaction.message.delete()
```

---

## 6. Configuration

### 6.1 Variables d'environnement

```bash
# n8n
N8N_BASE_URL=https://n8n.example.com
N8N_AUTH_TOKEN=your-n8n-token  # Si authentification activee

# OpenAI (par plugin)
OPENAI_API_KEY=sk-...

# Projet
PROJECT_ID=plugin-recipes
```

### 6.2 Configuration YAML

```yaml
# config/shopping.yaml
product_discovery:
  n8n_base_url: ${N8N_BASE_URL}
  timeout: 60
  locale: fr-FR

  # Limites
  max_items_per_request: 20

  # Retry
  retry_count: 3
  retry_delay: 1.0
```

---

## 7. Tests

### 7.1 Test unitaire

```python
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_discover_success():
    """Test Product Discovery avec succes."""

    mock_response = {
        "success": True,
        "context": "Pour faire des crêpes",
        "items_count": 1,
        "shopping_list": [
            {
                "original_item": "farine",
                "refined_item": "farine de blé",
                "category": "ingredient",
                "reasoning": {
                    "justification": "Crêpes = farine de blé standard",
                    "confidence": 0.92,
                },
                "product": {
                    "name": "Farine T45 Francine 1kg",
                    "price_cents": 189,
                    "price_display": "1,89 €",
                    "brand": "Francine",
                    "seller": "Carrefour",
                },
            }
        ],
        "total_cents": 189,
        "total_display": "1,89 €",
    }

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: mock_response,
            raise_for_status=lambda: None,
        )

        config = ProductDiscoveryConfig(
            n8n_base_url="https://test.com",
            openai_api_key="sk-test",
            project_id="test",
        )

        client = ProductDiscoveryClient(config)
        result = await client.discover(
            items=[DiscoveryItem("farine", "ingredient")],
            context="Pour faire des crêpes",
        )

        assert result.success is True
        assert result.items_count == 1
        assert result.shopping_list[0].refined_item == "farine de blé"
        assert result.total_cents == 189
```

### 7.2 Test d'integration

```bash
# Test manuel avec curl
curl -X POST https://n8n.example.com/webhook/product-discovery \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: plugin-recipes" \
  -H "X-OpenAI-API-Key: sk-..." \
  -d '{
    "items": [
      {"item_name": "farine", "category": "ingredient"},
      {"item_name": "oeufs", "category": "ingredient"}
    ],
    "context": "Pour faire des crêpes",
    "discord_user_id": "123456789"
  }'
```

---

## 8. Changelog

| Version | Date | Modifications |
|---------|------|---------------|
| 1.0 | 2026-01-14 | Version initiale |
