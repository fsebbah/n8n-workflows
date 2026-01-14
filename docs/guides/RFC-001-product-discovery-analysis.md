# RFC-001: Product Discovery - Analyse et Raisonnement

**Version:** 1.0
**Date:** 2026-01-14
**Statut:** Draft
**Issue:** #230

---

## 1. Objectif

Le workflow **Product Discovery** permet de transformer une liste d'items génériques (ingrédients, ustensiles) en une liste de produits concrets à acheter, avec :
- Raisonnement intelligent basé sur le contexte
- Prix, marque, vendeur, description, photo
- 1 produit par item (pas de choix multiple)

---

## 2. Méthode de raisonnement en 4 couches

Le LLM applique un raisonnement structuré en **4 couches successives** pour chaque item.

### 2.1 Couche 1 : Désambiguïsation lexicale

**Objectif :** Identifier si le terme est trop générique (hyperonyme).

| Terme | Type | Action |
|-------|------|--------|
| "farine" | Hyperonyme | Nécessite spécialisation |
| "oeufs" | Terme précis | Pas de modification |
| "poêle" | Ambigu (cuisine/chauffage) | Utiliser le contexte |

**Règle :** Chercher une **spécialisation minimale** nécessaire à l'action demandée.

### 2.2 Couche 2 : Analyse du contexte d'usage

**Objectif :** Le contexte n'est pas décoratif, il est **déterminant**.

```
Contexte : "Pour faire des crêpes"
           ↓
Interprétation : Usage standard en cuisine française, crêpes sucrées classiques
           ↓
Impact : Oriente vers farine de blé (pas sarrasin)
```

**Règle :** Passer d'un raisonnement "objet" à un raisonnement "usage".

### 2.3 Couche 3 : Connaissances culturelles/probabilistes

**Objectif :** Appliquer une **règle de probabilité par défaut**.

| Contexte | Probabilité par défaut | Alternatives explicites |
|----------|------------------------|-------------------------|
| Crêpes (sans qualificatif) | Farine de blé | Sarrasin (si "galettes") |
| Crêpes + sans gluten | Farine de riz/sarrasin | - |
| Gâteau au chocolat | Levure chimique | Bicarbonate (rare) |

**Règle :** Les alternatives minoritaires sont **toujours précisées explicitement** par l'utilisateur.

### 2.4 Couche 4 : Principe de NON-surspécification

**Objectif :** Ne jamais être plus précis que ce que le contexte justifie.

```
Input : "farine" + contexte "crêpes"

❌ "farine bio T45 label rouge"     → Trop spécifique
❌ "farine de sarrasin"             → Contradictoire avec le contexte
✅ "farine de blé"                  → Précision minimale correcte

Variantes proposées (optionnel) :
- T45 pour crêpes fines
- T55 pour crêpes rustiques
```

**Règle :** Les variantes (T45, T55) sont proposées **en complément**, pas comme vérité unique.

---

## 3. Architecture du workflow

### 3.1 Flux séquentiel (ÉVITER)

```
Item 1 → LLM → Search → Résultat
Item 2 → LLM → Search → Résultat
...
Item 10 → LLM → Search → Résultat

⏱️ Temps : ~30-60 secondes pour 10 items
```

### 3.2 Flux parallélisé (RECOMMANDÉ)

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  10 items ──► 1 seul appel LLM (BATCH)                     │
│               Raisonnement 4 couches pour tous les items   │
│                           │                                │
│                           ▼                                │
│              ┌────────────────────────┐                    │
│              │ 10 items raffinés      │                    │
│              │ + 10 justifications    │                    │
│              │ + 10 requêtes search   │                    │
│              └───────────┬────────────┘                    │
│                          │                                 │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│    ┌─────────┐      ┌─────────┐      ┌─────────┐          │
│    │ Search  │      │ Search  │ ...  │ Search  │ PARALLÈLE│
│    │ Item 1  │      │ Item 2  │      │ Item 10 │          │
│    └────┬────┘      └────┬────┘      └────┬────┘          │
│         │                │                │                │
│         └────────────────┼────────────────┘                │
│                          ▼                                 │
│                   Agrégation finale                        │
│                                                            │
└────────────────────────────────────────────────────────────┘

⏱️ Temps : ~5-10 secondes pour 10 items
```

### 3.3 Gains de performance

| Métrique | Séquentiel | Parallélisé |
|----------|------------|-------------|
| Appels LLM | 10 | **1** |
| Recherches web | 10 séquentielles | **10 en //** |
| Temps (10 items) | ~30-60s | **~5-10s** |

---

## 4. Format des données

### 4.1 Input (depuis chatbot-core)

```json
{
  "items": [
    {"item_name": "farine", "category": "ingredient"},
    {"item_name": "oeufs", "category": "ingredient"},
    {"item_name": "lait", "category": "ingredient"},
    {"item_name": "poêle", "category": "ustensile"}
  ],
  "context": "Pour faire des crêpes",
  "discord_user_id": "123456789",
  "project_id": "plugin-recipes",
  "locale": "fr-FR"
}
```

### 4.2 Output (vers chatbot-core)

```json
{
  "success": true,
  "context": "Pour faire des crêpes",
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
          {"name": "farine de blé T45", "reason": "Pour crêpes fines et légères"},
          {"name": "farine de blé T55", "reason": "Pour crêpes plus rustiques"}
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
        "url": "https://www.carrefour.fr/p/farine-...",
        "image_url": "https://cdn.carrefour.fr/farine.jpg"
      }
    },
    {
      "original_item": "oeufs",
      "refined_item": "oeufs",
      "category": "ingredient",
      "reasoning": {
        "layers": {
          "lexical": "Terme déjà suffisamment précis",
          "context": "Oeufs standard pour pâte à crêpes",
          "knowledge": "Pas de spécificité requise",
          "precision": "Pas de surspécification nécessaire"
        },
        "justification": "Terme déjà précis",
        "confidence": 0.98,
        "variants": [
          {"name": "oeufs bio", "reason": "Alternative premium"},
          {"name": "oeufs plein air", "reason": "Bien-être animal"}
        ]
      },
      "product": {
        "name": "Oeufs frais plein air x12 Matines",
        "description": "Oeufs de poules élevées en plein air",
        "price_cents": 359,
        "price_display": "3,59 €",
        "currency": "EUR",
        "brand": "Matines",
        "seller": "Leclerc",
        "url": "https://...",
        "image_url": "https://..."
      }
    },
    {
      "original_item": "lait",
      "refined_item": "lait entier",
      "category": "ingredient",
      "reasoning": {
        "layers": {
          "lexical": "Terme ambigu (entier, demi-écrémé, végétal)",
          "context": "Crêpes moelleuses = matière grasse importante",
          "knowledge": "Lait entier recommandé pour pâtisserie",
          "precision": "Demi-écrémé possible mais moins onctueux"
        },
        "justification": "Crêpes moelleuses = lait entier recommandé",
        "confidence": 0.85,
        "variants": [
          {"name": "lait demi-écrémé", "reason": "Version allégée"}
        ]
      },
      "product": {
        "name": "Lait entier Lactel 1L",
        "description": "Lait entier UHT",
        "price_cents": 119,
        "price_display": "1,19 €",
        "currency": "EUR",
        "brand": "Lactel",
        "seller": "Auchan",
        "url": "https://...",
        "image_url": "https://..."
      }
    },
    {
      "original_item": "poêle",
      "refined_item": "crêpière",
      "category": "ustensile",
      "reasoning": {
        "layers": {
          "lexical": "Terme ambigu (poêle cuisine vs chauffage)",
          "context": "Contexte crêpes = ustensile de cuisine",
          "knowledge": "Crêpes = poêle plate spécialisée (crêpière)",
          "precision": "Diamètre standard 25-28cm"
        },
        "justification": "Contexte crêpes = poêle plate spécialisée",
        "confidence": 0.90,
        "variants": [
          {"name": "poêle antiadhésive 28cm", "reason": "Alternative polyvalente"},
          {"name": "billig", "reason": "Crêpière bretonne traditionnelle"}
        ]
      },
      "product": {
        "name": "Crêpière Tefal Expertise 25cm",
        "description": "Revêtement antiadhésif Titanium",
        "price_cents": 2499,
        "price_display": "24,99 €",
        "currency": "EUR",
        "brand": "Tefal",
        "seller": "Amazon",
        "url": "https://...",
        "image_url": "https://..."
      }
    }
  ],
  "total_cents": 2766,
  "total_display": "27,66 €"
}
```

---

## 5. Prompt LLM

### 5.1 Prompt BATCH (analyse de tous les items en une fois)

```markdown
# Rôle
Tu es un assistant shopping expert en cuisine française. Tu analyses une liste d'items
pour les transformer en recommandations de produits concrets.

# Contexte de la demande
- Items à analyser : {{ items | json }}
- Contexte d'utilisation : {{ context }}
- Locale : {{ locale }}

# Méthode de raisonnement (4 couches)

Pour CHAQUE item, applique ces 4 couches de raisonnement :

## Couche 1 - Désambiguïsation lexicale
- Le terme est-il trop générique (hyperonyme) ?
- Nécessite-t-il une spécialisation minimale ?

## Couche 2 - Analyse du contexte d'usage
- Comment le contexte influence-t-il l'interprétation ?
- Passer d'un raisonnement "objet" à un raisonnement "usage"

## Couche 3 - Connaissances culturelles/probabilistes
- Quelle est la probabilité par défaut dans ce contexte ?
- Les alternatives minoritaires doivent être explicitement demandées

## Couche 4 - Principe de NON-surspécification
- Ne jamais être plus précis que ce que le contexte justifie
- Les variantes sont proposées EN COMPLÉMENT, pas comme vérité unique

# Règles importantes

1. **1 item = 1 produit** : Trouve UN SEUL produit par item
2. **Marques connues** : Privilégie les marques fiables et disponibles
3. **Prix raisonnables** : Pas le moins cher, pas le plus cher
4. **Justification visible** : L'utilisateur verra ton raisonnement

# Format de sortie OBLIGATOIRE

Retourne UNIQUEMENT ce JSON (pas de texte avant/après) :

```json
{
  "analysis": [
    {
      "original": "item original",
      "refined": "item raffiné",
      "category": "ingredient|ustensile",
      "reasoning": {
        "layers": {
          "lexical": "analyse couche 1",
          "context": "analyse couche 2",
          "knowledge": "analyse couche 3",
          "precision": "analyse couche 4"
        },
        "justification": "résumé court pour l'utilisateur",
        "confidence": 0.92,
        "variants": [
          {"name": "variante 1", "reason": "pourquoi"},
          {"name": "variante 2", "reason": "pourquoi"}
        ]
      },
      "search_query": "requête pour recherche web produit"
    }
  ]
}
```

# Exemples de raisonnement

## Exemple 1 : Item générique
Input: "farine" + contexte "crêpes"
- Couche 1: "farine" est un hyperonyme → spécialisation nécessaire
- Couche 2: crêpes = pâtisserie légère française
- Couche 3: crêpes classiques = farine de blé (98% des cas)
- Couche 4: "farine de blé" suffit, T45/T55 en variantes
→ refined: "farine de blé"

## Exemple 2 : Item déjà précis
Input: "levure chimique" + contexte "gâteau"
- Couche 1: terme déjà spécifique
- Couche 2: usage standard en pâtisserie
- Couche 3: pas d'alternative courante
- Couche 4: pas de surspécification
→ refined: "levure chimique" (inchangé)

## Exemple 3 : Item ambigu
Input: "poêle" + contexte "crêpes"
- Couche 1: ambigu (cuisine vs chauffage)
- Couche 2: contexte culinaire évident
- Couche 3: crêpes = crêpière (poêle plate)
- Couche 4: 25-28cm standard
→ refined: "crêpière"
```

### 5.2 Prompt pour recherche web (par item)

```markdown
Recherche UN produit pour : {{ refined_item }}

Critères :
- Marque connue/fiable (Francine, Tefal, Lactel, Matines, etc.)
- Prix raisonnable (milieu de gamme)
- Disponible en grande surface française ou en ligne
- Photo produit disponible

Requête suggérée : "{{ refined_item }} {{ brand_hint }} acheter prix"

Retourne :
- name: Nom complet du produit
- description: Description courte (max 100 caractères)
- price_cents: Prix en centimes (1,89€ = 189)
- currency: "EUR"
- brand: Marque
- seller: Site/magasin
- url: Lien d'achat
- image_url: URL de l'image produit
```

---

## 6. Cas de test prévus

### 6.1 Cas standards

| Input | Contexte | Output attendu |
|-------|----------|----------------|
| farine | crêpes | farine de blé |
| oeufs | crêpes | oeufs (inchangé) |
| lait | crêpes | lait entier |
| poêle | crêpes | crêpière |
| beurre | crêpes | beurre (inchangé) |

### 6.2 Cas avec ambiguïté

| Input | Contexte | Output attendu | Justification |
|-------|----------|----------------|---------------|
| farine | galettes | farine de sarrasin | "galettes" implique Bretagne |
| farine | crêpes sans gluten | farine de riz/sarrasin | Contrainte explicite |
| poêle | - (sans contexte) | poêle (générique) | Pas assez d'info |

### 6.3 Cas avec conflit

| Input | Contexte | Comportement |
|-------|----------|--------------|
| farine de blé | crêpes sans gluten | Warning: conflit détecté |
| sarrasin | crêpes sucrées | Info: sarrasin inhabituel pour crêpes sucrées |

---

## 7. Affichage Discord

### 7.1 Embed de résultat

```
┌─────────────────────────────────────────────────────────┐
│ 🛒 Liste de courses pour "Crêpes"                       │
│ 4 articles • Total estimé : 27,66 €                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🥬 INGRÉDIENTS                                          │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🌾 farine → farine de blé                           │ │
│ │ 💭 "Crêpes = farine de blé standard"                │ │
│ │                                                     │ │
│ │ 📦 Farine T45 Francine 1kg                          │ │
│ │    1,89 € • Carrefour                               │ │
│ │                                                     │ │
│ │ 💡 Variantes : T45 (fines), T55 (rustiques)         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🥚 oeufs                                            │ │
│ │ 💭 "Terme déjà précis"                              │ │
│ │                                                     │ │
│ │ 📦 Oeufs plein air x12 Matines                      │ │
│ │    3,59 € • Leclerc                                 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ 🍳 USTENSILES                                           │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🍳 poêle → crêpière                                 │ │
│ │ 💭 "Contexte crêpes = poêle plate spécialisée"      │ │
│ │                                                     │ │
│ │ 📦 Crêpière Tefal Expertise 25cm                    │ │
│ │    24,99 € • Amazon                                 │ │
│ │                                                     │ │
│ │ 💡 Variantes : poêle 28cm, billig bretonne          │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [🛒 Tout ajouter] [✏️ Modifier] [❌ Annuler]            │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Embed de raisonnement détaillé (optionnel)

Si l'utilisateur demande plus de détails sur un item :

```
┌─────────────────────────────────────────────────────────┐
│ 🧠 Raisonnement pour "farine"                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 1️⃣ Analyse lexicale                                    │
│    "Farine" est un terme trop générique (hyperonyme)    │
│                                                         │
│ 2️⃣ Contexte d'usage                                    │
│    Crêpes = pâtisserie légère en cuisine française      │
│                                                         │
│ 3️⃣ Connaissances culturelles                           │
│    98% des crêpes classiques utilisent de la farine     │
│    de blé. Le sarrasin n'est utilisé que pour les       │
│    "galettes" (explicitement mentionné).                │
│                                                         │
│ 4️⃣ Précision                                           │
│    "Farine de blé" est la précision minimale correcte.  │
│    T45/T55 sont des variantes optionnelles.             │
│                                                         │
│ ✅ Recommandation : farine de blé                       │
│ 📊 Confiance : 92%                                      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [↩️ Retour à la liste]                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Gestion des API Keys

### 8.1 Principe

Les API keys ne sont **PAS** stockées dans le workflow n8n.
Elles sont fournies par le plugin appelant via les headers HTTP.

### 8.2 Headers attendus

| Header | Description | Exemple |
|--------|-------------|---------|
| `X-Project-ID` | ID du projet/plugin | `plugin-recipes` |
| `X-OpenAI-API-Key` | Clé API OpenAI | `sk-...` |
| `X-Search-API-Key` | Clé API recherche (optionnel) | `...` |
| `Authorization` | Token d'authentification n8n | `Bearer ...` |

### 8.3 Utilisation dans le workflow

```javascript
// Dans le node LLM
const apiKey = $input.first().headers['x-openai-api-key'];

// Configuration dynamique
{
  "credentials": {
    "openAiApi": {
      "apiKey": "={{ $headers['x-openai-api-key'] }}"
    }
  }
}
```

---

## 9. Phase actuelle : Test sans stockage

### 9.1 Ce qu'on fait
- ✅ Appel LLM batch pour raisonnement
- ✅ Recherches web parallèles
- ✅ Retour JSON structuré
- ✅ Validation du format de sortie

### 9.2 Ce qu'on ne fait PAS (pour l'instant)
- ❌ Stockage en base de données
- ❌ Cache des produits trouvés
- ❌ Gestion des erreurs de stock
- ❌ Intégration Stripe

### 9.3 Critères de validation

Le workflow est validé si :
1. Le JSON de sortie respecte le format défini
2. Le raisonnement est cohérent avec les 4 couches
3. Chaque item a exactement 1 produit
4. Les prix sont en centimes
5. Les images sont des URLs valides

---

## 10. Changelog

| Version | Date | Modifications |
|---------|------|---------------|
| 1.0 | 2026-01-14 | Version initiale |
