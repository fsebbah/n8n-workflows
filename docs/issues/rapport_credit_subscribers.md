# Rapport complet : Gestion des crédits et utilisateurs

**Version:** 2.0
**Date:** 2026-01-09
**Equipes:** API + n8n
**Statut:** En attente de validation

---

## 1. Contexte et probleme initial

L'equipe n8n a besoin d'interroger les credits utilisateurs avec la requete suivante :

```sql
SELECT id, credits_remaining, credits_total, subscription_status, current_period_end
FROM subscribers
WHERE project_id = ? AND discord_user_id = ?
```

**Probleme identifie :** Les colonnes `subscription_status` et `current_period_end` existent mais ne sont jamais mises a jour.

---

## 2. Cartographie des tables

| Table | Statut | Utilisee par | Probleme |
|-------|--------|--------------|----------|
| `user_credits` | ACTIVE | n8n workflows | Table principale |
| `user_credit_logs` | ACTIVE | Auto-alimentee | Audit trail OK, manque metadata Stripe |
| `subscribers` | ORPHELINE | Lecture seule | Jamais mise a jour = **BUG PRODUCTION** |
| `credit_transactions` | MORTE | Rien | Jamais utilisee |
| `users` | ACTIVE | Auth systeme | Pas liee aux credits |

---

## 3. BUG EN PRODUCTION : Tables desynchronisees

```
Bot Discord                     n8n                           API
     |                           |                             |
     |  /plan ou /credits        |                             |
     |-------------------------->|                             |
     |                           |  GET /subscription/status   |
     |                           |---------------------------->|
     |                           |                             |
     |                           |      Lit table: subscribers | <-- JAMAIS MISE A JOUR
     |                           |<----------------------------|
     |                           |                             |
     |     Donnees obsoletes     |                             |
     |<--------------------------|                             |
```

**Le probleme :**

| Flux | Table ecrite | Table lue |
|------|--------------|-----------|
| Webhook Stripe -> n8n -> `/webhook/account/set` | `user_credits` | - |
| Bot `/plan` -> n8n -> `/subscription/status` | - | `subscribers` (obsolete) |

**Deux tables differentes !** Les credits sont ecrits dans `user_credits` mais lus depuis `subscribers`.

---

## 4. Flux actuel

```
Stripe Webhook -> n8n -> POST /webhook/account/set -> user_credits
                                                   -> user_credit_logs
```

**Endpoints actifs pour n8n :**

| Endpoint | Action | Table |
|----------|--------|-------|
| `GET /webhook/account` | Lire credits | `user_credits` |
| `POST /webhook/account/credit` | Ajouter credits | `user_credits` + logs |
| `POST /webhook/account/debit` | Debiter credits | `user_credits` + logs |
| `POST /webhook/account/set` | Definir credits | `user_credits` + logs |
| `GET /webhook/account/logs` | Historique | `user_credit_logs` |

---

## 5. Incoherences detectees

| Incoherence | Impact |
|-------------|--------|
| Deux systemes de credits paralleles (`subscribers.credits` vs `user_credits.credits_remaining`) | Confusion, donnees desynchronisees |
| `subscribers` n'a pas de modele SQLAlchemy | Maintenance difficile |
| `user_credits` n'a pas de FK vers `users` | Pas d'integrite referentielle |
| `subscription_status` ajoute a `user_credits` mais pas utilise par `/set` | Colonne toujours a "free" |
| Colonne `plan_id` n'existe pas dans `user_credits` | Impossible de stocker le plan |
| Pas de tracabilite Stripe dans les logs | Debug et comptabilite impossibles |
| Pas de protection contre double-credit (idempotence) | Risque financier |

---

## 6. Schema du flux complet

```
+---------------------------------------------------------------------+
|                         STRIPE                                       |
|  charge.succeeded / invoice.payment_succeeded                        |
+---------------------------+-----------------------------------------+
                            | Webhook
                            v
+---------------------------------------------------------------------+
|                          N8N                                         |
|  1. Extrait event_id, customer_id, amount, plan                      |
|  2. Appelle POST /stripe/verify/{project_id}                         |
|  3. Appelle POST /webhook/account/set  <-- MANQUE subscription_status|
|  4. Appelle POST /discord/send-dm                     plan_id        |
|                                                       current_period |
|                                                       metadata       |
+---------------------------+-----------------------------------------+
                            |
                            v
+---------------------------------------------------------------------+
|                         API                                          |
|                                                                      |
|  +------------------+    +------------------+                        |
|  |   user_credits   |    | user_credit_logs |                        |
|  | ACTIVE           |--->| ACTIVE           |                        |
|  +------------------+    +------------------+                        |
|                                                                      |
|  +------------------+    +------------------+                        |
|  |   subscribers    |    |credit_transactions|                       |
|  | ORPHELINE (BUG)  |    | MORTE             |                        |
|  | (lecture seule)  |    | (jamais utilisee) |                        |
|  +------------------+    +------------------+                        |
+---------------------------------------------------------------------+
```

---

## 7. Analyse workflow n8n

### 7.1 Etat actuel du workflow STRIPE - Webhook Handler

Le workflow n8n traite les evenements Stripe suivants :
- `checkout.session.completed` -> Nouveau paiement
- `invoice.paid` -> Renouvellement
- `customer.subscription.deleted` -> Annulation

#### Donnees extraites des metadata Stripe

| Champ | Extrait | Transmis a /set |
|-------|---------|-----------------|
| `discord_user_id` | Oui | Oui |
| `project_id` | Oui | Oui (header) |
| `credits_per_month` | Oui | Oui |
| `plan_id` | Oui | **NON TRANSMIS** |
| `current_period_end` | Non | **NON TRANSMIS** |
| `stripe_session_id` | Non | **NON TRANSMIS** |

### 7.2 Ce que n8n envoie actuellement

```json
{
  "discord_user_id": "636639897767378954",
  "credits_remaining": 1000,
  "credits_total": 1000
}
```

### 7.3 Ce que n8n DOIT envoyer (apres modification)

```json
{
  "discord_user_id": "636639897767378954",
  "credits_remaining": 1000,
  "credits_total": 1000,
  "subscription_status": "active",
  "plan_id": "premium",
  "current_period_end": "2026-02-08T00:00:00Z",
  "metadata": {
    "stripe_session_id": "cs_xxx",
    "stripe_customer_id": "cus_xxx",
    "stripe_subscription_id": "sub_xxx",
    "stripe_invoice_id": "in_xxx"
  }
}
```

### 7.4 Clarifications sur les champs

#### `current_period_end` - OBLIGATOIRE

| Type d'achat | Calcul par n8n |
|--------------|----------------|
| Abonnement mensuel | Date actuelle + 1 mois |
| Abonnement annuel | Date actuelle + 1 an |
| Achat one-time | Date actuelle + 1 an |
| Renouvellement (`invoice.paid`) | Extraire de `lines.data[0].period.end` |

**Logique n8n :**
```javascript
let currentPeriodEnd = null;

if (eventType === 'checkout.session.completed') {
  // Nouvel abonnement : +1 mois par defaut
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  currentPeriodEnd = now.toISOString();
}
else if (eventType === 'invoice.paid') {
  // Renouvellement : extraire de l'invoice
  const periodEnd = eventData.lines?.data?.[0]?.period?.end;
  if (periodEnd) {
    currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
  }
}
```

#### `metadata` - Champs obligatoires vs optionnels

| Champ | Obligatoire | Disponibilite |
|-------|-------------|---------------|
| `stripe_session_id` | Oui | Toujours (checkout) |
| `stripe_customer_id` | Oui | Toujours |
| `stripe_subscription_id` | Optionnel | Absent pour achats one-time |
| `stripe_invoice_id` | Optionnel | Absent pour checkout initial |

### 7.5 Mapping evenement -> statut

| Event Stripe | subscription_status | Raison |
|--------------|---------------------|--------|
| `checkout.session.completed` | `active` | Premier paiement reussi |
| `invoice.paid` | `active` | Renouvellement reussi |
| `customer.subscription.deleted` | `canceled` | Annulation |
| `invoice.payment_failed` | `past_due` | Echec paiement |

---

## 8. Plan d'action coordonne

### Phase 1 : Migrations DB (API - Priorite HAUTE)

| # | Action | Effort |
|---|--------|--------|
| 1.1 | Migration : Ajouter colonne `plan_id VARCHAR(50)` a `user_credits` | Faible |
| 1.2 | Migration : Ajouter colonne `metadata JSONB` a `user_credit_logs` | Faible |
| 1.3 | Creer index unique pour idempotence Stripe | Faible |

**SQL des migrations :**

```sql
-- Migration 1: plan_id
ALTER TABLE user_credits ADD COLUMN plan_id VARCHAR(50) DEFAULT 'free';

-- Migration 2: metadata JSONB pour tracabilite Stripe
ALTER TABLE user_credit_logs ADD COLUMN metadata JSONB DEFAULT '{}';

-- Migration 3: Index unique pour eviter double-credit
CREATE UNIQUE INDEX idx_unique_stripe_session
ON user_credit_logs ((metadata->>'stripe_session_id'))
WHERE metadata->>'stripe_session_id' IS NOT NULL;
```

### Phase 2 : Modification endpoint /set (API - Priorite HAUTE)

| # | Action | Effort |
|---|--------|--------|
| 2.1 | Modifier `SetCreditsRequest` pour accepter tous les nouveaux champs | Faible |
| 2.2 | Modifier `/set` pour MAJ `subscription_status`, `plan_id`, `current_period_end` | Faible |
| 2.3 | Modifier `/set` pour logger `metadata` dans `user_credit_logs` | Faible |
| 2.4 | Verifier idempotence (rejeter si `stripe_session_id` deja utilise) | Moyen |

**Livrable API - SetCreditsRequest :**

```python
class SetCreditsRequest(BaseModel):
    discord_user_id: str
    credits_remaining: int
    credits_total: int
    subscription_status: Optional[str] = None
    plan_id: Optional[str] = None
    current_period_end: Optional[datetime] = None
    metadata: Optional[dict] = None  # Pour tracabilite Stripe
```

### Phase 3 : Fix BUG /subscription/status (API - Priorite HAUTE)

| # | Action | Effort |
|---|--------|--------|
| 3.1 | Modifier `/subscription/status/{discord_user_id}` pour lire `user_credits` | Moyen |
| 3.2 | Ajouter parametre `project_id` (header ou query, avec defaut) | Faible |
| 3.3 | Adapter format de reponse pour retro-compatibilite | Moyen |

**Raison :** Fix immediat du bug sans attendre la migration n8n.

**Mapping reponse (retro-compatibilite) :**

| Ancien champ (subscribers) | Nouveau champ (user_credits) |
|----------------------------|------------------------------|
| `credits` | `credits_remaining` |
| `subscription_plan` | `plan_id` |
| `subscription_status` | `subscription_status` |
| `is_active` | `subscription_status == 'active'` |
| `current_period_end` | `current_period_end` |

### Phase 4 : Modification workflows (n8n - Apres Phase 2)

| # | Action | Effort |
|---|--------|--------|
| 4.1 | Modifier node "Process Event" pour extraire `subscription_status` | Faible |
| 4.2 | Modifier node "Process Event" pour extraire `plan_id` | Faible |
| 4.3 | Modifier node "Process Event" pour extraire `current_period_end` | Faible |
| 4.4 | Modifier node "Process Event" pour construire `metadata` Stripe | Faible |
| 4.5 | Modifier node "Call Credits API" pour envoyer tous les champs | Faible |

**Livrable n8n - Body de Call Credits API :**

```json
{
  "discord_user_id": "{{ $json.discord_user_id }}",
  "credits_remaining": {{ $json.credits_remaining }},
  "credits_total": {{ $json.credits_total }},
  "subscription_status": "{{ $json.subscription_status }}",
  "plan_id": "{{ $json.plan_id }}",
  "current_period_end": "{{ $json.current_period_end }}",
  "metadata": {
    "stripe_session_id": "{{ $json.stripe_session_id }}",
    "stripe_customer_id": "{{ $json.stripe_customer_id }}",
    "stripe_subscription_id": "{{ $json.stripe_subscription_id }}"
  }
}
```

### Phase 5 : Migration workflows lecture (n8n - Apres Phase 3)

| # | Action | Effort |
|---|--------|--------|
| 5.1 | Modifier workflow `DISCORD - Get Subscriber` : `/subscription/status` -> `/webhook/account` | Faible |
| 5.2 | Modifier workflow `DISCORD - Billing Portal` : meme changement | Faible |
| 5.3 | Adapter les nodes de traitement au nouveau format de reponse | Moyen |

### Phase 6 : Nettoyage (API - Priorite BASSE)

| # | Action | Effort |
|---|--------|--------|
| 6.1 | Deprecier endpoints `/subscription/status` et `/subscription/credits` | Faible |
| 6.2 | Supprimer table `credit_transactions` | Faible |
| 6.3 | Supprimer table `subscribers` (apres confirmation n8n migre) | Faible |

---

## 9. Idempotence : Eviter les double-credits

### Probleme

Si Stripe renvoie un webhook (retry), le meme paiement peut crediter 2x l'utilisateur.

### Solution

1. n8n envoie `metadata.stripe_session_id` dans chaque appel `/set`
2. L'API verifie si ce `stripe_session_id` existe deja dans `user_credit_logs`
3. Si oui -> rejeter avec erreur 409 Conflict
4. Index unique en DB pour garantie supplementaire

### Comportement attendu

```bash
# Premier appel
POST /webhook/account/set
{"metadata": {"stripe_session_id": "cs_123"}}
# -> 200 OK, credits ajoutes

# Deuxieme appel (retry Stripe)
POST /webhook/account/set
{"metadata": {"stripe_session_id": "cs_123"}}
# -> 409 Conflict, "Payment already processed"
```

---

## 10. Tracabilite Stripe

### Pourquoi c'est necessaire

| Cas d'usage | Sans tracabilite | Avec tracabilite |
|-------------|------------------|------------------|
| Client conteste un paiement | Impossible de prouver | Lien vers session Stripe |
| Debug webhook en erreur | Aucune trace | `stripe_session_id` dans logs |
| Reconciliation comptable | Manuel | Automatisable |
| Demande de remboursement | Recherche manuelle | Requete SQL simple |

### Donnees a stocker

```json
{
  "stripe_session_id": "cs_xxx",
  "stripe_customer_id": "cus_xxx",
  "stripe_subscription_id": "sub_xxx",
  "stripe_invoice_id": "in_xxx"
}
```

### Requete exemple (reconciliation)

```sql
SELECT * FROM user_credit_logs
WHERE metadata->>'stripe_session_id' = 'cs_xxx';
```

---

## 11. Sequence d'execution

```
+-------------------------------------------------------------------------+
|  ETAPE 1 - API : Migrations DB                                          |
|  Responsable: Equipe API                                                |
|  Actions: plan_id, metadata JSONB, index idempotence                    |
|  Notifier n8n quand termine                                             |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|  ETAPE 2 - API : Modifier /webhook/account/set                          |
|  Responsable: Equipe API                                                |
|  Livrable: Endpoint accepte tous les nouveaux champs + metadata         |
|  Notifier n8n quand termine                                             |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|  ETAPE 3 - API : Fix BUG /subscription/status                           |
|  Responsable: Equipe API                                                |
|  Action: Lire user_credits au lieu de subscribers                       |
|  Fix immediat du bug sans attendre n8n                                  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|  ETAPE 4 - N8N : Modifier STRIPE - Webhook Handler                      |
|  Responsable: Equipe n8n                                                |
|  Livrable: Workflow envoie subscription_status, plan_id,                |
|            current_period_end, metadata                                 |
|  Tester avec paiement Stripe test                                       |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|  ETAPE 5 - N8N : Migrer workflows lecture                               |
|  Responsable: Equipe n8n                                                |
|  Changement: /subscription/status -> /webhook/account                   |
|  Tester commandes /plan et /credits                                     |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|  ETAPE 6 - API : Nettoyage                                              |
|  Responsable: Equipe API                                                |
|  Action: Deprecier puis supprimer subscribers et credit_transactions    |
+-------------------------------------------------------------------------+
```

---

## 12. Resume des actions par equipe

### EQUIPE API - Actions requises

| # | Action | Priorite | Statut |
|---|--------|----------|--------|
| A1 | Migration : ajouter `plan_id` a `user_credits` | HAUTE | A faire |
| A2 | Migration : ajouter `metadata JSONB` a `user_credit_logs` | HAUTE | A faire |
| A3 | Migration : index unique idempotence | HAUTE | A faire |
| A4 | Modifier `/webhook/account/set` (nouveaux champs) | HAUTE | A faire |
| A5 | Ajouter verification idempotence dans `/set` | HAUTE | A faire |
| A6 | Fix BUG `/subscription/status` -> lire `user_credits` | HAUTE | A faire |
| A7 | Deprecier `/subscription/*` | MOYENNE | Apres Phase 5 |
| A8 | Supprimer tables `subscribers` et `credit_transactions` | BASSE | Apres validation |

### EQUIPE N8N - Actions requises

| # | Action | Priorite | Statut |
|---|--------|----------|--------|
| N1 | Modifier workflow Stripe : extraire `subscription_status` | HAUTE | Apres A4 |
| N2 | Modifier workflow Stripe : extraire `plan_id` | HAUTE | Apres A4 |
| N3 | Modifier workflow Stripe : extraire `current_period_end` | HAUTE | Apres A4 |
| N4 | Modifier workflow Stripe : construire `metadata` | HAUTE | Apres A4 |
| N5 | Modifier workflow Stripe : envoyer tous les champs a `/set` | HAUTE | Apres A4 |
| N6 | Migrer `DISCORD - Get Subscriber` vers `/webhook/account` | MOYENNE | Apres A6 |
| N7 | Migrer `DISCORD - Billing Portal` vers `/webhook/account` | MOYENNE | Apres A6 |

---

## 13. Tests de validation

### Apres Etape 2 (API - /set modifie)

```bash
curl -X POST "http://localhost:3031/api/webhook/account/set" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah-fun" \
  -d '{
    "discord_user_id": "TEST123",
    "credits_remaining": 100,
    "credits_total": 100,
    "subscription_status": "active",
    "plan_id": "premium",
    "current_period_end": "2026-02-08T00:00:00Z",
    "metadata": {
      "stripe_session_id": "cs_test_123",
      "stripe_customer_id": "cus_test_456"
    }
  }'
# Attendu: 200 OK
```

### Test idempotence (meme appel 2x)

```bash
# Deuxieme appel avec meme stripe_session_id
curl -X POST "http://localhost:3031/api/webhook/account/set" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah-fun" \
  -d '{
    "discord_user_id": "TEST123",
    "credits_remaining": 100,
    "credits_total": 100,
    "metadata": {"stripe_session_id": "cs_test_123"}
  }'
# Attendu: 409 Conflict
```

### Apres Etape 3 (API - Fix /subscription/status)

```bash
curl "http://localhost:3031/api/subscription/status/TEST123?project_id=torah-fun"
# Attendu: Donnees depuis user_credits (pas subscribers)
```

### Apres Etape 4 (n8n - Stripe webhook modifie)

- [ ] Faire un paiement Stripe test
- [ ] Verifier que `subscription_status = "active"` en DB
- [ ] Verifier que `plan_id` est renseigne en DB
- [ ] Verifier que `metadata` contient les IDs Stripe dans `user_credit_logs`

### Apres Etape 5 (n8n - Workflows lecture migres)

- [ ] Tester commande `/plan` sur Discord
- [ ] Verifier que les credits affiches sont corrects
- [ ] Verifier que le statut affiche est "active" (pas "free")

---

## 14. Questions resolues

| Question | Reponse |
|----------|---------|
| Pourquoi `subscription_status` reste a "free" ? | Endpoint `/set` ne recoit pas ce champ |
| Table `subscribers` orpheline ou bug ? | **BUG** - Utilisee en lecture mais jamais ecrite |
| Qui appelle `/subscription/status` ? | Workflows `DISCORD - Get Subscriber` et `Billing Portal` |
| Faut-il `/webhook/account/create` ? | Non, le UPSERT de `/set` suffit |
| Garder `credit_transactions` ? | Non, jamais utilisee - supprimer |
| Un abonnement Stripe = un projet ? | Oui, confirme |
| Achats one-time (sans subscription) ? | Oui, avec `current_period_end` = date + 1 an |
| Besoin tracabilite Stripe ? | Oui, pour debug et comptabilite |
| Comment eviter double-credit ? | Index unique sur `stripe_session_id` + verif API |
| Colonne `plan_id` existe ? | Non, migration a creer |
| `current_period_end` optionnel ? | **Non**, toujours calcule (abonnement +1 mois, one-time +1 an) |
| `stripe_invoice_id` optionnel ? | **Oui**, absent pour checkout initial |

---

## 15. Decisions d'architecture

| Decision | Choix | Raison |
|----------|-------|--------|
| Table principale credits | `user_credits` | Multi-projet, deja utilisee par n8n |
| Table audit | `user_credit_logs` | Enrichir avec `metadata JSONB` |
| Statut subscription | Explicite depuis n8n | Pas de deduction, synchronise avec Stripe |
| Idempotence | Index unique + verification API | Double protection |
| Fix bug lecture | Modifier endpoint existant | Fix immediat sans attendre migration n8n |
| Colonne plan_id | Ajouter via migration | Necessaire pour stocker le plan |

---

*Document finalise le 2026-01-09*
*Equipe API + Equipe n8n*
*Version 2.0 - Corrections appliquees*
