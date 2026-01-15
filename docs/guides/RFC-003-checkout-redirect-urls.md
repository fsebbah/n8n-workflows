# RFC-003: Configuration des URLs de redirection Stripe Checkout

**Version:** 1.0
**Date:** 2026-01-14
**Statut:** EN ATTENTE - Reponses framework recues, attente equipe n8n
**Auteur:** Equipe Plugin Recipes

---

## 1. Contexte

Suite a l'implementation de la Phase 2 (PR #74), le bouton "Payer" est maintenant fonctionnel et utilise `CheckoutService.create_session()` pour creer une session Stripe Checkout.

```
[Commander] -> ProductDiscovery -> CartView -> [Payer] -> Stripe Checkout -> ???
```

**Question principale:** Ou rediriger l'utilisateur apres le paiement ?

---

## 2. URLs requises par Stripe

Stripe Checkout necessite 2 URLs de redirection:

| URL | Declencheur | Description |
|-----|-------------|-------------|
| `success_url` | Paiement reussi | Page affichee apres validation du paiement |
| `cancel_url` | Annulation | Page affichee si l'utilisateur annule |

---

## 3. Pages abonnements existantes (via webhook n8n)

Les pages d'abonnement sont **generees dynamiquement par n8n** via webhook (pas de pages statiques).

**Implication:** Les URLs de redirection checkout doivent pointer vers des **webhooks n8n** qui generent les pages de confirmation/annulation.

---

## 4. Options proposees

### Option A: Deep link Discord (simple)

```env
CHECKOUT_SUCCESS_URL=https://discord.com/channels/@me
CHECKOUT_CANCEL_URL=https://discord.com/channels/@me
```

**Avantages:**
- Zero developpement cote web
- L'utilisateur revient directement sur Discord

**Inconvenients:**
- Pas de confirmation visuelle du paiement
- UX basique

---

### Option B: Webhooks n8n dedies (recommande)

```env
CHECKOUT_SUCCESS_URL=https://n8n.bot-appetit.fr/webhook/cart-checkout-success?session_id={CHECKOUT_SESSION_ID}
CHECKOUT_CANCEL_URL=https://n8n.bot-appetit.fr/webhook/cart-checkout-cancel
```

**Webhook success** (genere HTML):
```
+------------------------------------------+
|     ✅ Paiement confirme !               |
|                                          |
|  Merci pour votre commande.              |
|  Montant: 8,36 EUR                       |
|                                          |
|  Vous recevrez un message sur Discord    |
|  avec les details de livraison.          |
|                                          |
|  [Retourner sur Discord]                 |
+------------------------------------------+
```

**Webhook cancel** (genere HTML):
```
+------------------------------------------+
|     ❌ Paiement annule                   |
|                                          |
|  Votre panier a ete conserve.            |
|  Vous pouvez reprendre votre commande    |
|  a tout moment sur Discord.              |
|                                          |
|  [Retourner sur Discord]                 |
+------------------------------------------+
```

**Avantages:**
- UX professionnelle
- Meme pattern que les pages abonnement existantes
- n8n peut recuperer les details via `session_id`
- Peut envoyer notification Discord dans le meme workflow

**Inconvenients:**
- Necessite creation de 2 nouveaux webhooks n8n

---

### Option C: Reutiliser webhooks abonnement existants

Adapter les webhooks d'abonnement pour gerer aussi le checkout panier:

```env
CHECKOUT_SUCCESS_URL=https://n8n.bot-appetit.fr/webhook/checkout-success?type=cart&session_id={CHECKOUT_SESSION_ID}
CHECKOUT_CANCEL_URL=https://n8n.bot-appetit.fr/webhook/checkout-cancel?type=cart
```

Le webhook detecte `type=cart` et adapte le message affiche.

**Avantages:**
- Reutilise l'existant
- Un seul webhook a maintenir

**Inconvenients:**
- Logique conditionnelle dans le webhook

---

## 5. Questions pour les equipes

### Pour equipe n8n:

1. **Webhooks existants:** Quels sont les webhooks actuels pour les pages abonnement ?
   - URL exacte du webhook success ?
   - URL exacte du webhook cancel ?
   - Peut-on les adapter ou faut-il en creer de nouveaux ?

2. **Workflow checkout panier:**
   - Creer 2 nouveaux webhooks `cart-checkout-success` et `cart-checkout-cancel` ?
   - Ou adapter les webhooks abonnement existants avec param `type=cart` ?

3. **Stripe session_id:** Le webhook peut-il recuperer les infos de la session Stripe via `{CHECKOUT_SESSION_ID}` pour afficher le montant, les produits, etc. ?

4. **Notification Discord:** Apres paiement reussi, le webhook doit-il aussi :
   - Publier sur le stream Redis (`discord:dm:bot-appetit`) ?
   - Quel event type ? `cart_checkout_completed` ?

### Pour equipe framework:

1. **CheckoutService:** La methode `create_session()` remplace-t-elle automatiquement `{CHECKOUT_SESSION_ID}` dans les URLs ?

2. **NotificationListener:** Faut-il ajouter un handler pour l'event `cart_checkout_completed` dans le plugin ?

---

## 6. Reponses equipe framework

> **Question 1 - `{CHECKOUT_SESSION_ID}`:**
> Stripe gere ca automatiquement. Quand vous passez une URL avec `{CHECKOUT_SESSION_ID}`, Stripe la remplace par l'ID reel de la session lors de la redirection. Aucun changement cote framework necessaire.

> **Question 2 - Handler `cart_checkout_completed`:**
> Le plugin peut enregistrer un handler via le pattern `NotificationListener.on_event()`:
> ```python
> @listener.on_event("cart_checkout_completed")
> async def handle_checkout_completed(event_data):
>     # Traiter la confirmation de paiement
>     pass
> ```

**Statut:** ✅ Reponses recues - En attente equipe n8n

---

## 7. Analyse commande /subscribe (reference)

La commande `/subscribe` pour les abonnements est **fournie par le framework** (`chatbot-core`), pas par le plugin.

**Pattern utilise:**
1. Framework expose `/subscribe` slash command
2. Commande declenche un webhook n8n qui genere une page HTML dynamique
3. Utilisateur complete le paiement sur Stripe
4. Stripe webhook notifie n8n
5. n8n publie sur Redis stream
6. `NotificationListener` du plugin traite l'evenement

**Implication:** Les pages checkout panier doivent suivre le meme pattern - n8n cree des webhooks qui generent des pages HTML dynamiques.

---

## 8. Implementation cote plugin (deja fait)

Le plugin est pret a recevoir les URLs via variables d'environnement:

```python
# src/config.py
checkout_success_url: str = ""
checkout_cancel_url: str = ""

# Chargement
checkout_success_url=os.getenv("CHECKOUT_SUCCESS_URL", ""),
checkout_cancel_url=os.getenv("CHECKOUT_CANCEL_URL", ""),
```

```python
# src/services/cart_integration.py
async def create_checkout(self, user_id: str) -> dict:
    session = await self.checkout_service.create_session(
        discord_user_id=user_id,
        success_url=self.config.checkout_success_url,
        cancel_url=self.config.checkout_cancel_url,
    )
    return {"checkout_url": session.checkout_url, ...}
```

---

## 9. Flow complet apres validation

```
                                    DISCORD
                                       |
User: /recette crepes                  |
       |                               |
       v                               |
   RecipeCard                          |
   [Ajouter aux courses]               |
       |                               |
       v                               |
   ShoppingListView                    |
   [Commander]                         |
       |                               |
       v                               |
   ProductDiscovery (n8n)              |
       |                               |
       v                               |
   CartView                            |
   [Payer 8,36 EUR]                    |
       |                               |
       v                               |
   CheckoutLinkView                    |
   [Payer maintenant] ─────────────────┼──────> stripe.com/checkout/xxx
                                       |              |
                                       |         [Payer]
                                       |              |
                                       |              v
                                       |        Stripe Webhook
                                       |              |
                                       |              v
                                       |        n8n workflow
                                       |              |
                                       |              v
                                       |        Redis Stream
                                       |              |
                      <────────────────┼──────────────┘
                 NotificationListener  |
                      |                |
                      v                |
                 DM: "Commande confirmee!"
```

---

## 10. Decision requise

Merci de valider:

- [ ] **Option choisie:** A / B / C
- [ ] **URLs exactes** a configurer
- [ ] **Event type** pour notification Discord post-paiement
- [ ] **Responsable** creation pages web (si Option B)

---

## 11. Timeline

| Etape | Responsable | Statut |
|-------|-------------|--------|
| Implementation CheckoutService | Framework | ✅ Done (v0.6.16) |
| Integration plugin | Plugin Recipes | ✅ Done (PR #74) |
| Questions framework | Framework | ✅ Repondu |
| Configuration URLs | n8n / Infra | ⏳ En attente |
| Webhooks checkout (Option B) | n8n | ⏳ En attente |
| Tests E2E | Plugin Recipes | ⏳ Bloque par URLs |

---

**En attente de retour de l'equipe n8n.**
