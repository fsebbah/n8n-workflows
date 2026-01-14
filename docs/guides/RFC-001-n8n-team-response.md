# RFC-001 Shopping Cart - Réponse équipe n8n

> Document de réponse à l'analyse technique de l'équipe API
> Date: 2026-01-14
> Version: 1.1 (aligné sur Consensus)
> De: Équipe n8n/workflows
> Pour: Équipe API, Framework, Plugin Recipes

---

## 1. Synthèse

Nous avons analysé le document `RFC-001-shopping-cart-analysis.md` et validons l'architecture proposée. Ce document apporte nos recommandations et répond aux questions ouvertes.

### Statut côté n8n

| Élément | Statut | Notes |
|---------|--------|-------|
| Product Discovery workflow | ✅ Prêt | PR #231 mergée |
| Documentation intégration | ✅ Prête | `docs/guides/RFC-001-chatbot-core-integration.md` |
| Workflows panier | ⏳ En attente | Dépend des endpoints API |
| Workflow Stripe webhook | ⏳ En attente | Dépend des endpoints API |

---

## 2. Réponse aux questions ouvertes

### 2.1 Fusionner `shopping_list` et `cart` ?

**Notre recommandation : Option C - Conversion via Product Discovery**

#### Analyse des options

| Option | Description | Verdict |
|--------|-------------|---------|
| A - Séparés | Deux systèmes indépendants | ❌ Duplication, UX confuse |
| B - Fusion | Un seul système hybride | ❌ Trop complexe |
| **C - Conversion** | Shopping List → Product Discovery → Cart | ✅ Recommandé |

#### Pourquoi Option C ?

1. **Workflow Product Discovery déjà prêt** - Transforme texte en produits réels
2. **UX naturelle et progressive** :
   ```
   Recette → Liste de courses (texte) → Produits (prix) → Paiement
   ```
3. **Pas de migration** - `shopping_list` existante reste intacte
4. **Séparation claire des responsabilités** :
   - `shopping_list` = Liste textuelle gratuite (cochable)
   - `cart` = Panier e-commerce avec prix (payable)

#### Flux utilisateur proposé

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. RECETTE                                                             │
│     User consulte une recette de crêpes                                 │
│                                                                         │
│  2. SHOPPING LIST (texte libre)                                         │
│     User clique "Ajouter à ma liste de courses"                         │
│     → Items ajoutés : farine, oeufs, lait, beurre                       │
│     → User peut cocher ce qu'il a déjà                                  │
│                                                                         │
│  3. PRODUCT DISCOVERY (transformation)                                  │
│     User clique "🔍 Trouver les produits"                               │
│     → Workflow n8n analyse avec raisonnement 4 couches                  │
│     → Retourne des produits réels avec prix                             │
│                                                                         │
│  4. CART (e-commerce)                                                   │
│     User voit les produits proposés                                     │
│     → Farine Francine 1kg ........... 1,89€                             │
│     → Oeufs Matines x12 ............. 3,59€                             │
│     → Lait Lactel 1L ................ 1,19€                             │
│     User peut modifier/supprimer                                        │
│                                                                         │
│  5. CHECKOUT                                                            │
│     User clique "💳 Payer 6,67€"                                        │
│     → Redirection Stripe                                                │
│     → Webhook confirme paiement                                         │
│     → Notification Discord                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Schéma de données

```
shopping_lists                          carts
  │                                       │
  └──< shopping_list_items               └──< cart_items
         │                                      │
         │ (texte libre)                        │ (product_id)
         │ - name: "farine"                     │ - product_id: UUID
         │ - quantity: 0.5                      │ - quantity: 1
         │ - unit: "kg"                         │ - unit_price_cents: 189
         │ - is_checked: false                  │ - product_snapshot: {...}
         │ - recipe_id: UUID                    │
         │                                      │
         │                                      │
         └──────── Product Discovery ───────────┘
                   (workflow n8n)
```

#### Endpoints concernés

```
# Shopping List (existant - pas de modification)
GET    /shopping-list/{user_id}
POST   /shopping-list/{user_id}/items
DELETE /shopping-list/{user_id}/items/{id}
PUT    /shopping-list/{user_id}/items/{id}/check

# Product Discovery (nouveau - n8n webhook)
POST   /webhook/product-discovery
       Input: items[] + context
       Output: shopping_list[] avec produits + prix

# Cart (nouveau)
POST   /cart/{user_id}/from-discovery
       Input: shopping_list[] (output du Product Discovery)
       Action: Crée les cart_items avec product_id
```

---

### 2.2 Redis cluster ou standalone ?

**Notre recommandation : Standalone pour le MVP**

| Critère | Standalone | Cluster |
|---------|------------|---------|
| Complexité | Simple | Élevée |
| Coût | Bas | Élevé |
| Haute dispo | Non | Oui |
| Cas d'usage | < 10k users | > 100k users |

Pour le MVP avec un bot Discord, standalone suffit largement. Migration vers cluster possible plus tard si besoin.

**Configuration recommandée (alignée sur consensus) :**
```
Redis standalone
  - DB 0: Sessions / cache général
  - DB 2: Paniers (cart:{user_id})
  - TTL: 86400 secondes (24h) ← Consensus
  - Refresh TTL à chaque modification
```

> ⚠️ **Note:** TTL réduit de 7j à 24h (décision consensus) pour éviter les prix obsolètes.

---

### 2.3 Gestion multi-devise ?

**Notre recommandation : EUR uniquement pour le MVP**

Raisons :
1. Cible principale : utilisateurs francophones
2. Stripe gère la conversion automatiquement côté checkout
3. Complexité évitée : un panier = une devise

**Pour plus tard :**
- Ajouter `currency` dans `user.preferences`
- Créer des `Price` Stripe par devise
- Laisser Stripe afficher la bonne devise au checkout

---

### 2.4 Notifications webhook retry ?

**Notre recommandation : Queue Redis + retry exponentiel**

```
┌─────────────────┐
│ Stripe Webhook  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ n8n Workflow    │
│ - Valide        │
│ - Update Order  │
│ - Queue notif   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Redis Queue     │
│ discord:dm      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────┐
│ NotificationJob │────▶│ Discord API │
│ (retry x3)      │     └─────────────┘
└─────────────────┘
         │
         │ Si échec après 3 retries
         ▼
┌─────────────────┐
│ Log + Alerte    │
│ (monitoring)    │
└─────────────────┘
```

**Retry policy :**
- Attempt 1 : immédiat
- Attempt 2 : +30 secondes
- Attempt 3 : +2 minutes
- Après : log erreur, alerte admin

---

## 3. Validation du schéma de données

### 3.1 Tables validées ✅ (selon Consensus)

| Table | Validation | Commentaires |
|-------|------------|--------------|
| `products` | ✅ OK | Champs `source`, `source_query` essentiels pour cache |
| `carts` | ✅ OK | `redis_synced_at` utile |
| `cart_items` | ✅ OK | `product_snapshot` critique |
| `orders` | ✅ OK | `order_number` lisible important |
| `order_items` | ✅ OK | |
| `user_addresses` | ✅ OK | Phase 3 - Livraison |

### 3.1b Tables NON retenues (Consensus)

| Table proposée | Raison rejet |
|----------------|--------------|
| ~~`users`~~ | Enrichir `user_credits` existant |
| ~~`checkout_sessions`~~ | Reporter phase ultérieure |
| ~~`inventory_movements`~~ | Pas de stock (produits externes) |

### 3.2 Suggestions d'ajouts

#### Table `products`

```sql
-- Ajouter pour le Product Discovery
reasoning_data JSONB DEFAULT '{}',
-- Stocke le raisonnement 4 couches pour debug/amélioration
-- Ex: {"layers": {...}, "justification": "...", "confidence": 0.92}
```

#### Table `cart_items`

```sql
-- Ajouter pour traçabilité
discovery_session_id UUID,
-- Lien vers la session Product Discovery qui a créé cet item
```

### 3.3 Structure Redis validée ✅

La structure proposée est compatible avec notre workflow :

```javascript
// cart:{discord_user_id}
{
  "id": "cart-uuid",
  "currency": "EUR",
  "items": [
    {
      "id": "item-uuid",
      "product_id": "prod-uuid",        // Lien DB
      "name": "Farine T55 1kg",
      "quantity": 2,
      "unit_price_cents": 189,
      "image_url": "https://...",
      "is_checked": false,
      "metadata": {
        "recipe_id": "...",
        "discovery_session_id": "..."   // Ajout suggéré
      }
    }
  ],
  "subtotal_cents": 378,
  "updated_at": "2026-01-14T10:00:00Z"
}
```

---

## 4. Endpoints API attendus par n8n

### 4.1 Priorité Haute (MVP)

| Endpoint | Méthode | Usage n8n |
|----------|---------|-----------|
| `POST /products/search` | POST | Vérifier cache avant web search |
| `POST /products/bulk-create` | POST | Sauvegarder produits découverts |
| `GET /cart/{user_id}` | GET | Afficher panier Discord |
| `POST /cart/{user_id}/items` | POST | Ajouter depuis Product Discovery |
| `POST /cart/{user_id}/checkout` | POST | Créer session Stripe |
| `POST /webhooks/stripe` | POST | Recevoir événements Stripe |

### 4.2 Priorité Moyenne

| Endpoint | Méthode | Usage n8n |
|----------|---------|-----------|
| `PUT /cart/{user_id}/items/{id}` | PUT | Modifier quantité |
| `DELETE /cart/{user_id}/items/{id}` | DELETE | Supprimer item |
| `DELETE /cart/{user_id}` | DELETE | Vider panier |
| `GET /orders/{user_id}` | GET | Historique commandes |

### 4.3 Format attendu pour `POST /products/search`

**Request :**
```json
{
  "query": "farine de blé",
  "category": "ingredient",
  "source": "web_search",
  "limit": 5
}
```

**Response :**
```json
{
  "success": true,
  "products": [
    {
      "id": "uuid",
      "name": "Farine T45 Francine 1kg",
      "price_cents": 189,
      "image_url": "https://...",
      "source": "web_search",
      "source_query": "farine de blé"
    }
  ],
  "total": 1,
  "cached": true
}
```

### 4.4 Format attendu pour `POST /products/bulk-create`

**Request :**
```json
{
  "products": [
    {
      "name": "Farine T45 Francine 1kg",
      "description": "Farine fluide idéale pâtisserie",
      "price_cents": 189,
      "currency": "EUR",
      "brand": "Francine",
      "seller": "Carrefour",
      "url": "https://...",
      "image_url": "https://...",
      "category": "ingredient",
      "source": "web_search",
      "source_query": "farine de blé",
      "reasoning_data": {
        "layers": {...},
        "justification": "Crêpes = farine de blé standard",
        "confidence": 0.92
      }
    }
  ],
  "discovery_context": "Pour faire des crêpes",
  "discord_user_id": "123456789"
}
```

**Response :**
```json
{
  "success": true,
  "created": 1,
  "products": [
    {
      "id": "uuid-created",
      "name": "Farine T45 Francine 1kg",
      "price_cents": 189
    }
  ]
}
```

---

## 5. Workflows n8n prévus

### 5.1 Déjà créés

| Workflow | Fichier | Statut |
|----------|---------|--------|
| Product Discovery | `SHOPPING---Product-Discovery-WebSearch.json` | ✅ PR #231 |

### 5.2 À créer - Phase 1 (Panier)

| Endpoint n8n | Description | Dépendance |
|--------------|-------------|------------|
| `cart-get` | Récupérer panier utilisateur | Redis |
| `cart-add` | Ajouter produits au panier | Redis |
| `cart-update` | Modifier quantité item | Redis |
| `cart-remove` | Supprimer items | Redis |
| `cart-clear` | Vider panier | Redis |
| `products-persist` | Persister produits en DB | PostgreSQL |

### 5.3 À créer - Phase 2 (Checkout)

| Endpoint n8n | Description | Dépendance |
|--------------|-------------|------------|
| `cart-checkout` | Créer session Stripe | Stripe API |
| `cart-apply-coupon` | Appliquer code promo | Stripe Coupons |
| `cart-remove-coupon` | Retirer code promo | Redis |
| `orders-list` | Liste commandes utilisateur | PostgreSQL |
| `orders-get` | Détails d'une commande | PostgreSQL |

### 5.4 À créer - Phase 3 (Profil + Livraison)

| Endpoint n8n | Description | Dépendance |
|--------------|-------------|------------|
| `profile-get` | Récupérer profil utilisateur | PostgreSQL |
| `profile-update` | Mettre à jour profil | PostgreSQL |
| `profile-address-*` | Gestion adresses | PostgreSQL |
| `shipping-calculate` | Calculer options livraison | API externe |
| `shipping-select` | Sélectionner option | PostgreSQL |

---

## 6. Planning proposé

### Phase 1 - MVP (semaine 1-2)

```
API                                 n8n
 │                                   │
 ├── POST /products/search           │
 ├── POST /products/bulk-create      │
 │                                   │
 │   ─────── Intégration ────────►   ├── Mise à jour Product Discovery
 │                                   │   (ajout cache API)
 │                                   │
 ├── GET /cart/{user_id}             │
 ├── POST /cart/{user_id}/items      │
 │                                   │
 │   ─────── Intégration ────────►   ├── SHOPPING---Cart-Get
 │                                   ├── SHOPPING---Cart-Add
 │                                   │
 ├── POST /cart/{user_id}/checkout   │
 │                                   │
 │   ─────── Intégration ────────►   ├── SHOPPING---Cart-Checkout
 │                                   │
 ├── POST /webhooks/stripe           │
 │                                   │
 │   ─────── Intégration ────────►   ├── SHOPPING---Stripe-Webhook
 │                                   │
```

### Phase 2 - Enrichissement (semaine 3)

- Notifications Discord post-paiement
- Historique commandes
- Gestion erreurs et retry

### Phase 3 - Optimisation (semaine 4+)

- Cache Product Discovery
- Analytics paniers abandonnés
- Multi-devise (si besoin)

---

## 7. Questions pour l'équipe API

1. **Timeline Phase 1** : Quand les endpoints MVP seront-ils disponibles ?

2. **Authentification n8n → API** : Token statique ou OAuth ?

3. **Rate limiting** : Quelle limite sur `POST /products/bulk-create` ?

4. **Environnement de test** : URL de staging pour intégration ?

5. **Format erreurs** : Structure JSON des erreurs API ?
   ```json
   {
     "success": false,
     "error_code": "PRODUCT_NOT_FOUND",
     "message": "...",
     "details": {}
   }
   ```

---

## 8. Contacts

| Rôle | Contact |
|------|---------|
| Équipe n8n | @fsebbah |
| Équipe API | ? |
| Équipe chatbot-core | ? |

---

## Changelog

| Date | Version | Description |
|------|---------|-------------|
| 2026-01-14 | 1.0 | Réponse initiale |
| 2026-01-14 | 1.1 | Alignement sur document Consensus |

---

## 9. Validation n8n pour Consensus

### ✅ Équipe n8n valide le document Consensus

| Élément Consensus | Validation | Notes |
|-------------------|------------|-------|
| Architecture globale | ✅ | Flow chatbot-core → n8n → API validé |
| Schéma PostgreSQL | ✅ | Tables alignées avec nos besoins |
| Structure Redis 24h | ✅ | Accepté (était 7j initialement) |
| Endpoints Phase 1 | ✅ | `cart-*`, `products-persist` |
| Endpoints Phase 2 | ✅ | `checkout-*`, `orders-*` |
| Endpoints Phase 3 | ✅ | `profile-*`, `shipping-*` |
| Plan versioning | ✅ | 0.7.0 → 0.7.8 |

### Prêt à cocher la case n8n dans le Consensus ☑️
