# Reponse aux questions de l'equipe Chatbot-Core

**Date:** 2026-01-09
**De:** Equipe n8n
**Pour:** Equipe Chatbot-Core

---

## 1. Endpoints manquants

> Les workflows discord-get-credits, discord-get-balance, discord-get-transactions sont-ils actifs ?

**Reponse: OUI, tous actifs et prets a l'emploi.**

| Workflow | Endpoint | Statut | Pret |
|----------|----------|--------|------|
| DISCORD - Get Credits | `GET /webhook/discord-get-credits` | ACTIF | OUI |
| DISCORD - Get Balance | `GET /webhook/discord-get-balance` | ACTIF | OUI |
| DISCORD - Get Transactions | `GET /webhook/discord-get-transactions` | ACTIF | OUI |

**Parametres communs:**
```
?project_id=xxx&discord_user_id=xxx
```

---

## 2. subscribe vs subscription-checkout-create

> Quelle est la difference d'usage ?

**Il existe 2 workflows distincts avec des usages differents:**

### Option A: `discord-subscribe` (RECOMMANDE)

```
POST /webhook/discord-subscribe
```

**Usage:** Pour le bot Discord - Interface simplifiee

**Body:**
```json
{
  "project_id": "torah-fun",
  "discord_user_id": "123456789",
  "plan_id": "price_xxx",
  "customer_email": "user@example.com"
}
```

**Caracteristiques:**
- Valide que `plan_id` commence par `price_`
- `customer_email` optionnel (pre-remplit le checkout)
- Retourne directement `checkout_url`
- Pas de callbacks complexes

### Option B: `subscription-checkout-create` (LEGACY)

```
POST /webhook/subscription-checkout-create
```

**Usage:** Ancien workflow avec callbacks - **A DEPRECIER**

**Caracteristiques:**
- Plus complexe
- Callbacks configures separement
- Moins maintenu

**RECOMMANDATION: Utiliser `discord-subscribe` pour toutes les nouvelles implementations.**

---

## 3. customer_email vs discord_username

> Le workflow accepte-t-il les deux ?

**Reponse:** Le workflow `discord-subscribe` accepte:

| Parametre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `project_id` | string | OUI | ID du projet |
| `discord_user_id` | string | OUI | ID Discord |
| `plan_id` | string | OUI | ID prix Stripe (price_xxx) |
| `customer_email` | string | NON | Email pour pre-remplir checkout |

**Note:** `discord_username` n'est PAS utilise dans ce workflow. Il est utilise dans d'autres workflows pour l'affichage.

**Correction dans le code bot:**
```python
# CORRECT
body = {
    "project_id": project_id,
    "discord_user_id": discord_user_id,
    "plan_id": plan_id,
    "customer_email": customer_email  # Optionnel
}

# PAS BESOIN de discord_username ici
```

---

## 4. Endpoints non documentes

> Les workflows suivants existent-ils cote n8n ?

| Endpoint demande | Existe | Nom workflow n8n | Webhook path |
|------------------|--------|------------------|--------------|
| `discord-registry` | OUI | DISCORD - Registry | `GET /webhook/discord-registry` |
| `subscription-change-plan` | OUI | Stripe - Subscription Change Plan | `POST /webhook/subscription-change-plan` |
| `subscription-cancel` | OUI | Torah - Subscription Cancel | `POST /webhook/torah-sub-cancel` |
| `stripe-register-project` | OUI | STRIPE - Register Project | `POST /webhook/stripe-register-project` |

### 4.1 discord-registry

```http
GET /webhook/discord-registry?project_id=xxx
```

**Usage:** Recuperer la configuration d'un projet enregistre.

### 4.2 subscription-change-plan

```http
POST /webhook/subscription-change-plan
Content-Type: application/json

{
  "project_id": "torah-fun",
  "discord_user_id": "123456789",
  "new_plan_id": "price_xxx"
}
```

**Usage:** Changer le plan d'un abonnement existant.

### 4.3 subscription-cancel (torah-sub-cancel)

```http
POST /webhook/torah-sub-cancel
Content-Type: application/json

{
  "project_id": "torah-fun",
  "discord_user_id": "123456789"
}
```

**Usage:** Annuler un abonnement.

**ATTENTION:** Le path est `torah-sub-cancel`, pas `subscription-cancel`.

### 4.4 stripe-register-project

```http
POST /webhook/stripe-register-project
Content-Type: application/json

{
  "project_id": "torah-fun",
  "stripe_key": "sk_live_xxx",
  "display_name": "Torah Fun"
}
```

**Usage:** Enregistrer un nouveau projet avec sa cle Stripe dans Redis.

---

## 5. Callbacks

> Les callbacks discord-sub-success, discord-sub-renewal, discord-sub-failure, discord-sub-cancel sont-ils configures ?

**Reponse:** Ces workflows existent avec des noms DIFFERENTS:

| Callback attendu | Workflow n8n | Webhook path | Statut |
|------------------|--------------|--------------|--------|
| `discord-sub-success` | Torah - Subscription Success | `POST /webhook/torah-sub-success` | ACTIF |
| `discord-sub-renewal` | Torah - Subscription Renewal | `POST /webhook/torah-sub-renewal` | ACTIF |
| `discord-sub-failure` | Torah - Subscription Payment Failure | (internal) | ACTIF |
| `discord-sub-cancel` | Torah - Subscription Cancel | `POST /webhook/torah-sub-cancel` | ACTIF |

**IMPORTANT:** Ces callbacks sont appeles par le workflow `STRIPE - Webhook Handler` apres un evenement Stripe, PAS directement par le bot.

**Architecture des callbacks:**

```
Stripe Event (checkout.session.completed)
     |
     v
STRIPE - Webhook Handler (n8n)
     |
     | Traite l'evenement
     | Met a jour les credits via API
     |
     v
Torah - Subscription Success (n8n)
     |
     | Envoie DM Discord
     | Notifie dans le channel
     v
Utilisateur Discord recoit confirmation
```

**Le bot n'a PAS besoin d'appeler ces callbacks directement.**

---

## 6. Resume: Mapping des endpoints

### Endpoints que le bot DOIT appeler:

| Action | Methode | Endpoint |
|--------|---------|----------|
| Infos utilisateur | GET | `/webhook/discord-get-subscriber` |
| Credits seulement | GET | `/webhook/discord-get-credits` |
| Solde | GET | `/webhook/discord-get-balance` |
| Historique | GET | `/webhook/discord-get-transactions` |
| Liste plans | GET | `/webhook/discord-get-plans` |
| Souscrire | POST | `/webhook/discord-subscribe` |
| Gerer abonnement | POST | `/webhook/discord-billing-portal` |
| Changer plan | POST | `/webhook/subscription-change-plan` |
| Annuler | POST | `/webhook/torah-sub-cancel` |
| Config projet | GET | `/webhook/discord-registry` |

### Endpoints que le bot NE DOIT PAS appeler:

| Endpoint | Raison |
|----------|--------|
| `/webhook/torah-sub-success` | Appele par Stripe webhook |
| `/webhook/torah-sub-renewal` | Appele par Stripe webhook |
| `/webhook/subscription-checkout-create` | Legacy, utiliser discord-subscribe |
| `/webhook/stripe-webhook` | Appele par Stripe directement |

---

## 7. Endpoints DEPRECIES / A NE PAS UTILISER

| Endpoint | Statut | Remplacant |
|----------|--------|------------|
| `subscription-checkout-create` | DEPRECIE | `discord-subscribe` |
| `account` | N'EXISTE PAS | `discord-get-subscriber` |

**ERREUR ACTUELLE:**
```
The requested webhook "GET account" is not registered.
```

**SOLUTION:** Remplacer l'appel a `/webhook/account` par `/webhook/discord-get-subscriber`

---

## 8. Actions requises cote bot

1. **Corriger l'appel `/webhook/account`** → utiliser `/webhook/discord-get-subscriber`
2. **Utiliser `discord-subscribe`** au lieu de `subscription-checkout-create`
3. **Utiliser `torah-sub-cancel`** pour les annulations (pas `subscription-cancel`)
4. **Ne pas appeler les callbacks** (torah-sub-success, etc.) - ils sont automatiques

---

## 9. Questions?

Contactez l'equipe n8n pour toute clarification.

---

*Document genere le 2026-01-09*
