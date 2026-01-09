# Rapport complet équipe API : Gestion des crédits et utilisateurs

  ---
  1. Réponse à la question n8n : Endpoint /set

  Problème actuel: L'endpoint POST /webhook/account/set ne gère PAS subscription_status ni current_period_end.

  # Code actuel (webhook_account.py:554)
  class SetCreditsRequest(BaseModel):
      discord_user_id: str
      credits_remaining: int
      credits_total: int
      # ❌ Manque: subscription_status
      # ❌ Manque: current_period_end

  Recommandation: L'API devrait recevoir explicitement ces champs depuis n8n (pas les déduire).
  Option: A) Recevoir explicitement subscription_status
  Avantage: Contrôle total, synchronisé avec Stripe
  Inconvénient: n8n doit envoyer plus de données
  ────────────────────────────────────────
  Option: B) Déduire depuis crédits
  Avantage: Simple
  Inconvénient: Imprécis (un user peut avoir 0 crédits et rester "active")
  Verdict: Option A - n8n devrait envoyer le statut Stripe.

  ---
  2. Cartographie des tables
  ┌─────────────────────┬──────────────┬────────────────┬──────────────────────┐
  │        Table        │    Statut    │  Utilisée par  │       Problème       │
  ├─────────────────────┼──────────────┼────────────────┼──────────────────────┤
  │ user_credits        │ ✅ ACTIVE    │ n8n workflows  │ Table principale     │
  ├─────────────────────┼──────────────┼────────────────┼──────────────────────┤
  │ user_credit_logs    │ ✅ ACTIVE    │ Auto-alimentée │ Audit trail OK       │
  ├─────────────────────┼──────────────┼────────────────┼──────────────────────┤
  │ subscribers         │ ⚠️ ORPHELINE │ Lecture seule  │ Jamais mise à jour   │
  ├─────────────────────┼──────────────┼────────────────┼──────────────────────┤
  │ credit_transactions │ ❌ MORTE     │ Rien           │ Jamais utilisée      │
  ├─────────────────────┼──────────────┼────────────────┼──────────────────────┤
  │ users               │ ✅ ACTIVE    │ Auth système   │ Pas liée aux crédits │
  └─────────────────────┴──────────────┴────────────────┴──────────────────────┘
  ---
  3. Flux actuel (ce qui fonctionne)

  Stripe Webhook → n8n → POST /webhook/account/set → user_credits ✅
                                                    → user_credit_logs ✅

  Endpoints actifs pour n8n:
  ┌──────────────────────────────┬─────────────────┬─────────────────────┐
  │           Endpoint           │     Action      │        Table        │
  ├──────────────────────────────┼─────────────────┼─────────────────────┤
  │ GET /webhook/account         │ Lire crédits    │ user_credits        │
  ├──────────────────────────────┼─────────────────┼─────────────────────┤
  │ POST /webhook/account/credit │ Ajouter crédits │ user_credits + logs │
  ├──────────────────────────────┼─────────────────┼─────────────────────┤
  │ POST /webhook/account/debit  │ Débiter crédits │ user_credits + logs │
  ├──────────────────────────────┼─────────────────┼─────────────────────┤
  │ POST /webhook/account/set    │ Définir crédits │ user_credits + logs │
  ├──────────────────────────────┼─────────────────┼─────────────────────┤
  │ GET /webhook/account/logs    │ Historique      │ user_credit_logs    │
  └──────────────────────────────┴─────────────────┴─────────────────────┘
  ---
  4. Tables orphelines (problème identifié)

  Table subscribers (migration 20251229)

  -- Colonnes: id, discord_id, credits, plan, stripe_customer_id, is_active...
  -- JAMAIS mise à jour par les workflows actuels

  Endpoints qui la lisent (mais ne l'écrivent pas):
  - GET /subscription/status/{discord_user_id}
  - GET /subscription/credits/{discord_user_id}

  Problème: Cette table existe mais n8n n'écrit jamais dedans. Les données sont probablement obsolètes.

  Table credit_transactions (migration 20251229)

  -- Colonnes: id, subscriber_id, amount, type, description, metadata...
  -- JAMAIS utilisée - 0 endpoint

  ---
  5. Incohérences détectées
  Incohérence: Deux systèmes de crédits parallèles (subscribers.credits vs user_credits.credits_remaining)
  Impact: Confusion, données désynchronisées
  ────────────────────────────────────────
  Incohérence: subscribers n'a pas de modèle SQLAlchemy
  Impact: Maintenance difficile
  ────────────────────────────────────────
  Incohérence: user_credits n'a pas de FK vers users
  Impact: Pas d'intégrité référentielle
  ────────────────────────────────────────
  Incohérence: subscription_status ajouté à user_credits mais pas utilisé par /set
  Impact: Colonne toujours à "free"
  ---
  6. Schéma du flux complet

  ┌─────────────────────────────────────────────────────────────────────┐
  │                         STRIPE                                       │
  │  charge.succeeded / invoice.payment_succeeded                        │
  └─────────────────────────┬───────────────────────────────────────────┘
                            │ Webhook
                            ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                          N8N                                         │
  │  1. Extrait event_id, customer_id, amount, plan                      │
  │  2. Appelle POST /stripe/verify/{project_id}                         │
  │  3. Appelle POST /webhook/account/set  ◄── MANQUE subscription_status│
  │  4. Appelle POST /discord/send-dm                                    │
  └─────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                         API                                          │
  │                                                                      │
  │  ┌──────────────────┐    ┌──────────────────┐                       │
  │  │   user_credits   │    │ user_credit_logs │                       │
  │  │ ✅ ACTIVE        │───▶│ ✅ ACTIVE        │                       │
  │  └──────────────────┘    └──────────────────┘                       │
  │                                                                      │
  │  ┌──────────────────┐    ┌──────────────────┐                       │
  │  │   subscribers    │    │credit_transactions│                       │
  │  │ ⚠️ ORPHELINE     │    │ ❌ MORTE          │                       │
  │  │ (lecture seule)  │    │ (jamais utilisée) │                       │
  │  └──────────────────┘    └──────────────────┘                       │
  └─────────────────────────────────────────────────────────────────────┘

  ---
  7. Recommandations
  ┌────────────┬───────────────────────────────────────────────────────────────────────┬────────┐
  │  Priorité  │                                Action                                 │ Effort │
  ├────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ 🔴 Haute   │ Modifier /set pour accepter subscription_status et current_period_end │ Faible │
  ├────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ 🔴 Haute   │ Modifier n8n pour envoyer ces champs depuis Stripe                    │ Faible │
  ├────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ 🟡 Moyenne │ Déprécier/supprimer table subscribers                                 │ Moyen  │
  ├────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ 🟡 Moyenne │ Supprimer table credit_transactions                                   │ Faible │
  ├────────────┼───────────────────────────────────────────────────────────────────────┼────────┤
  │ 🟢 Basse   │ Créer FK entre user_credits et users                                  │ Moyen  │
  └────────────┴───────────────────────────────────────────────────────────────────────┴────────┘
  ---
  8. Action immédiate proposée

  Pour répondre au besoin n8n, modifier POST /webhook/account/set pour accepter:

  {
    "discord_user_id": "636639897767378954",
    "credits_remaining": 1000,
    "credits_total": 1000,
    "subscription_status": "active",        // nouveau
    "current_period_end": "2026-02-08T00:00:00Z"  // nouveau (optionnel)
  }

---
## 9. Analyse complémentaire équipe n8n

### 9.1 État actuel du workflow STRIPE - Webhook Handler

Le workflow n8n traite les événements Stripe suivants :
- `checkout.session.completed` → Nouveau paiement
- `invoice.paid` → Renouvellement
- `customer.subscription.deleted` → Annulation

#### Données extraites des metadata Stripe (node Extract & Validate)

| Champ | Extrait | Transmis à /set |
|-------|---------|-----------------|
| `discord_user_id` | ✅ | ✅ |
| `project_id` | ✅ | ✅ (header) |
| `credits_per_month` | ✅ | ✅ (comme credits_remaining/total) |
| `plan_id` | ✅ | ❌ NON TRANSMIS |
| `discord_channel_id` | ✅ | ❌ (vers send-dm seulement) |
| `discord_guild_id` | ✅ | ❌ (vers send-dm seulement) |

#### Données disponibles dans l'event Stripe (non extraites)

| Champ Stripe | Chemin | Utilité |
|--------------|--------|---------|
| `subscription` | `event.data.object.subscription` | ID subscription Stripe |
| `status` | `event.data.object.status` | complete, expired, etc. |
| `current_period_end` | Via API Stripe | Date fin période |
| `customer` | `event.data.object.customer` | ID customer Stripe |

### 9.2 Ce que n8n envoie actuellement à /set

```json
{
  "discord_user_id": "636639897767378954",
  "credits_remaining": 1000,
  "credits_total": 1000
}
```

### 9.3 Ce que n8n PEUT envoyer (après modification)

```json
{
  "discord_user_id": "636639897767378954",
  "credits_remaining": 1000,
  "credits_total": 1000,
  "plan_id": "premium",
  "subscription_status": "active",
  "stripe_subscription_id": "sub_xxx",
  "stripe_customer_id": "cus_xxx"
}
```

### 9.4 Mapping événement → statut

| Event Stripe | subscription_status | Raison |
|--------------|---------------------|--------|
| `checkout.session.completed` | `active` | Premier paiement réussi |
| `invoice.paid` | `active` | Renouvellement réussi |
| `customer.subscription.deleted` | `canceled` | Annulation |
| `invoice.payment_failed` | `past_due` | Échec paiement |

---
## 10. Plan d'action coordonné

### Phase 1 : API (priorité haute)

| # | Action | Effort | Responsable |
|---|--------|--------|-------------|
| 1.1 | Modifier `SetCreditsRequest` pour accepter `subscription_status` (optionnel) | Faible | API |
| 1.2 | Modifier `SetCreditsRequest` pour accepter `plan_id` (optionnel) | Faible | API |
| 1.3 | Modifier `/set` pour mettre à jour `subscription_status` si fourni | Faible | API |
| 1.4 | Tester endpoint avec nouveaux champs | Faible | API |

**Livrable API :**
```python
class SetCreditsRequest(BaseModel):
    discord_user_id: str
    credits_remaining: int
    credits_total: int
    subscription_status: Optional[str] = None  # nouveau
    plan_id: Optional[str] = None              # nouveau
```

### Phase 2 : n8n (après Phase 1)

| # | Action | Effort | Responsable |
|---|--------|--------|-------------|
| 2.1 | Modifier node "Process Event" pour inclure `subscription_status` | Faible | n8n |
| 2.2 | Modifier node "Process Event" pour inclure `plan_id` | Faible | n8n |
| 2.3 | Modifier node "Call Credits API" pour envoyer les nouveaux champs | Faible | n8n |
| 2.4 | Exporter workflow et créer PR | Faible | n8n |

**Livrable n8n - Body de Call Credits API :**
```json
{
  "discord_user_id": "{{ $json.discord_user_id }}",
  "credits_remaining": {{ $json.credits_remaining }},
  "credits_total": {{ $json.credits_total }},
  "subscription_status": "{{ $json.subscription_status }}",
  "plan_id": "{{ $json.plan_id }}"
}
```

### Phase 3 : Nettoyage (priorité basse)

| # | Action | Effort | Responsable |
|---|--------|--------|-------------|
| 3.1 | Migrer données `subscribers` → `user_credits` si nécessaire | Moyen | API |
| 3.2 | Déprécier endpoints utilisant `subscribers` | Moyen | API |
| 3.3 | Supprimer table `credit_transactions` | Faible | API |
| 3.4 | Supprimer table `subscribers` | Faible | API |

---
## 11. Séquence d'exécution

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1 - API                                                  │
│  Durée estimée: 1-2h                                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Modifier SetCreditsRequest (ajouter champs optionnels)      │
│  2. Modifier endpoint /set (utiliser nouveaux champs)           │
│  3. Tester avec curl                                            │
│  4. Déployer                                                    │
│  5. ✅ Notifier équipe n8n                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2 - n8n                                                  │
│  Durée estimée: 30min                                           │
├─────────────────────────────────────────────────────────────────┤
│  1. Modifier node "Process Event"                               │
│  2. Modifier node "Call Credits API"                            │
│  3. Sauvegarder workflow                                        │
│  4. Exporter et créer PR                                        │
│  5. ✅ Tester paiement Stripe                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  VALIDATION                                                     │
├─────────────────────────────────────────────────────────────────┤
│  Test end-to-end:                                               │
│  1. Paiement Stripe test                                        │
│  2. Vérifier user_credits.subscription_status = "active"        │
│  3. Vérifier /credits affiche le bon statut                     │
└─────────────────────────────────────────────────────────────────┘
```

---
## 12. Test de validation API

Une fois Phase 1 terminée, tester avec :

```bash
curl -X POST "http://pi6.local:3031/api/webhook/account/set" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah-fun" \
  -d '{
    "discord_user_id": "636639897767378954",
    "credits_remaining": 1000,
    "credits_total": 1000,
    "subscription_status": "active",
    "plan_id": "premium"
  }'
```

Puis vérifier :
```bash
curl "http://pi6.local:5678/webhook/credits-get?discord_user_id=636639897767378954&project_id=torah-fun"
```

Résultat attendu :
```json
{
  "success": true,
  "balance": {
    "subscription_status": "active",  // ← Plus "free"
    ...
  }
}
```

---
## 13. Résumé exécutif et décisions finales

### 13.1 Problèmes identifiés

| # | Problème | Impact | Criticité |
|---|----------|--------|-----------|
| 1 | `subscription_status` jamais mis à jour après paiement | Users affichés comme "free" même après paiement | 🔴 Haute |
| 2 | Deux systèmes parallèles : `user_credits` (écrit) vs `subscribers` (lu) | Données obsolètes pour commandes `/plan`, `/credits` | 🔴 Haute |
| 3 | Table `subscribers` jamais alimentée par Stripe webhook | Bug en production | 🔴 Haute |
| 4 | Table `credit_transactions` jamais utilisée | Dette technique | 🟡 Moyenne |

### 13.2 Décision architecture

**Problème central :** Les workflows n8n utilisent deux endpoints différents :

```
ÉCRITURE (Stripe webhook)          LECTURE (Bot Discord)
─────────────────────────          ─────────────────────
POST /webhook/account/set    vs    GET /subscription/status/{id}
        │                                    │
        ▼                                    ▼
   user_credits ✅                    subscribers ❌
   (à jour)                           (obsolète)
```

**Solution retenue :** Unifier sur `user_credits` en migrant la lecture.

### 13.3 Plan d'action final par équipe

---

## 🔴 ÉQUIPE API - Actions requises

### A1. Modifier endpoint `/webhook/account/set` (Priorité HAUTE)

Ajouter les champs optionnels :

```python
class SetCreditsRequest(BaseModel):
    discord_user_id: str
    credits_remaining: int
    credits_total: int
    subscription_status: Optional[str] = None  # AJOUTER
    plan_id: Optional[str] = None              # AJOUTER
```

Mettre à jour la colonne `subscription_status` en DB si fournie.

### A2. Modifier endpoint `/webhook/account` GET (Priorité HAUTE)

S'assurer que la réponse inclut :
- `subscription_status`
- `plan_id` (si stocké)

Format de réponse attendu par n8n :
```json
{
  "success": true,
  "credits": {
    "project_id": "torah-fun",
    "discord_user_id": "636639897767378954",
    "credits_remaining": 1000,
    "credits_total": 1000,
    "subscription_status": "active",
    "plan_id": "premium"
  }
}
```

### A3. Déprécier endpoints `subscribers` (Priorité MOYENNE)

Une fois n8n migré, marquer comme dépréciés :
- `GET /subscription/status/{discord_user_id}`
- `GET /subscription/credits/{discord_user_id}`

### A4. Nettoyage tables (Priorité BASSE)

Après validation complète :
- Supprimer table `credit_transactions` (jamais utilisée)
- Supprimer table `subscribers` (obsolète)

---

## 🔵 ÉQUIPE N8N - Actions requises

### N1. Modifier workflow `STRIPE - Webhook Handler` (Priorité HAUTE)

**Node "Process Event"** - Ajouter `subscription_status` :

```javascript
// Mapping event → status
if (eventType === 'checkout.session.completed') {
  payload.subscription_status = 'active';
}
else if (eventType === 'invoice.paid') {
  payload.subscription_status = 'active';
}
else if (eventType === 'customer.subscription.deleted') {
  payload.subscription_status = 'canceled';
}
```

**Node "Call Credits API"** - Envoyer les nouveaux champs :

```json
{
  "discord_user_id": "{{ $json.discord_user_id }}",
  "credits_remaining": {{ $json.credits_remaining }},
  "credits_total": {{ $json.credits_total }},
  "subscription_status": "{{ $json.subscription_status }}",
  "plan_id": "{{ $json.plan_id }}"
}
```

### N2. Modifier workflow `DISCORD - Get Subscriber` (Priorité HAUTE)

**Changement d'endpoint :**

| Avant | Après |
|-------|-------|
| `GET /subscription/status/{discord_user_id}` | `GET /webhook/account?project_id={pid}&discord_user_id={uid}` |

**Raison :** L'ancien endpoint lit `subscribers` (obsolète), le nouveau lit `user_credits` (à jour).

### N3. Modifier workflow `DISCORD - Billing Portal` (Priorité HAUTE)

Même changement que N2 - remplacer l'appel `/subscription/status` par `/webhook/account`.

### N4. Adapter le format de réponse (si nécessaire)

Si le format de `/webhook/account` diffère, adapter le node de traitement pour mapper :

| Ancien champ | Nouveau champ |
|--------------|---------------|
| `credits` | `credits_remaining` |
| `subscription_plan` | `plan_id` |
| `is_active` | `subscription_status == 'active'` |

---

## 📋 SÉQUENCE D'EXÉCUTION

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ÉTAPE 1 - API : Modifier /webhook/account/set                          │
│  Responsable: Équipe API                                                │
│  Livrable: Endpoint accepte subscription_status et plan_id              │
│  ✅ Notifier n8n quand terminé                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ÉTAPE 2 - N8N : Modifier STRIPE - Webhook Handler                      │
│  Responsable: Équipe n8n                                                │
│  Livrable: Workflow envoie subscription_status et plan_id               │
│  ✅ Tester avec paiement Stripe test                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ÉTAPE 3 - N8N : Migrer DISCORD - Get Subscriber                        │
│  Responsable: Équipe n8n                                                │
│  Changement: /subscription/status → /webhook/account                    │
│  ✅ Tester commandes /plan et /credits                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ÉTAPE 4 - N8N : Migrer DISCORD - Billing Portal                        │
│  Responsable: Équipe n8n                                                │
│  Même changement que étape 3                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ÉTAPE 5 - API : Déprécier /subscription/*                              │
│  Responsable: Équipe API                                                │
│  Action: Marquer endpoints comme dépréciés, puis supprimer              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ÉTAPE 6 - API : Nettoyage tables                                       │
│  Responsable: Équipe API                                                │
│  Action: Supprimer subscribers et credit_transactions                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Checklist de validation

### Après Étape 1 (API)
```bash
curl -X POST "http://pi6.local:3031/api/webhook/account/set" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah-fun" \
  -d '{"discord_user_id":"TEST123","credits_remaining":100,"credits_total":100,"subscription_status":"active","plan_id":"premium"}'
# Attendu: 200 OK
```

### Après Étape 2 (n8n - Stripe webhook)
- [ ] Faire un paiement Stripe test
- [ ] Vérifier que `subscription_status = "active"` en DB

### Après Étape 3 (n8n - Get Subscriber)
- [ ] Tester commande `/plan` sur Discord
- [ ] Vérifier que les crédits affichés sont corrects
- [ ] Vérifier que le statut affiché est "active" (pas "free")

### Après Étape 4 (n8n - Billing Portal)
- [ ] Tester accès au portail de facturation
- [ ] Vérifier que l'utilisateur est reconnu

---

## 15. Questions résolues

| Question | Réponse |
|----------|---------|
| Pourquoi `subscription_status` reste à "free" ? | Endpoint `/set` ne reçoit pas ce champ |
| Table `subscribers` orpheline ou bug ? | **BUG** - Utilisée en lecture mais jamais écrite |
| Qui appelle `/subscription/status` ? | Workflows `DISCORD - Get Subscriber` et `Billing Portal` |
| Faut-il `/webhook/account/create` ? | Non, le UPSERT de `/set` suffit |
| Garder `credit_transactions` ? | Non, jamais utilisée - supprimer |

---

*Document finalisé le 2026-01-09*
*Équipe API + Équipe n8n*
*En attente de validation équipe API*

