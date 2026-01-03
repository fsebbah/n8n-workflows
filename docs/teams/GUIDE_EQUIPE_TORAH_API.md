# Guide Équipe Torah API - Intégration Stripe

**Date:** 2026-01-03
**Version:** 1.0
**Projet:** torah.solutions.api

---

## 1. Vue d'ensemble

### 1.1 Architecture décidée

Conformément à la section 9 de `docs/issues/stripe-integration.md` :

> **"L'API Torah n'a pas besoin d'être modifiée pour Stripe. Toute la logique paiement passe par n8n."**

L'architecture Stripe pour Torah est :
- **n8n** = Proxy Stripe (gère les appels API Stripe)
- **n8n** = Webhook handler (reçoit les événements Stripe)
- **n8n** = Callbacks vers PostgreSQL (met à jour la base `subscribers`)
- **Torah API** = Lecture seule des données Stripe (crédits, statut)

```
Discord Bot                    n8n                         Torah API
───────────                    ───                         ─────────
     │                          │                             │
     │  1. /subscribe           │                             │
     │─────────────────────────▶│                             │
     │                          │  (Stripe Checkout)          │
     │                          │                             │
     │  2. User pays            │                             │
     │                          │                             │
     │                          │  3. Webhook + DB update     │
     │                          │────────────────────────────▶│
     │                          │                             │ (PostgreSQL)
     │  4. User uses /translate │                             │
     │─────────────────────────▶│                             │
     │                          │  5. Check credits           │
     │                          │────────────────────────────▶│
     │                          │                             │
```

### 1.2 Ce que l'équipe API doit faire

| Tâche | Priorité | Description |
|-------|----------|-------------|
| Rien pour Stripe | - | n8n gère tout |
| Endpoint GET credits | Optionnel | Exposer les crédits d'un utilisateur |
| Endpoint GET subscription | Optionnel | Exposer le statut d'abonnement |

---

## 2. Migration Base de Données

La migration a déjà été préparée et est gérée par n8n directement sur PostgreSQL.

**Fichier:** `scripts/torah/migrate-stripe-columns.sql`

**Colonnes ajoutées à `subscribers`:**
```sql
ALTER TABLE subscribers ADD COLUMN stripe_customer_id VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN stripe_subscription_id VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN subscription_status VARCHAR(50) DEFAULT 'free';
ALTER TABLE subscribers ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'free';
ALTER TABLE subscribers ADD COLUMN current_period_end TIMESTAMP;
```

**Note:** La table `subscribers` est différente de `users`. Elle est utilisée par le bot Discord.

---

## 3. Endpoints Optionnels

Si l'équipe souhaite exposer les données Stripe via l'API (optionnel) :

### 3.1 GET /api/subscription/status

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.service import get_db

router = APIRouter(prefix="/api/subscription", tags=["subscription"])

@router.get("/status/{discord_user_id}")
async def get_subscription_status(
    discord_user_id: str,
    db: Session = Depends(get_db)
):
    """Récupère le statut d'abonnement d'un utilisateur Discord."""
    result = db.execute(
        """
        SELECT discord_user_id, credits, subscription_status,
               subscription_plan, current_period_end
        FROM subscribers
        WHERE discord_user_id = :user_id
        """,
        {"user_id": discord_user_id}
    ).fetchone()

    if not result:
        raise HTTPException(404, "User not found")

    return {
        "discord_user_id": result.discord_user_id,
        "credits": result.credits,
        "subscription_status": result.subscription_status,
        "subscription_plan": result.subscription_plan,
        "current_period_end": result.current_period_end
    }
```

### 3.2 POST /api/discord/send-dm

Cet endpoint est **requis** par les workflows n8n pour envoyer des DM Discord.

```python
@router.post("/discord/send-dm")
async def send_discord_dm(
    user_id: str,
    embed: dict,
    # Auth via TORAH_API_KEY
):
    """Envoie un DM Discord à un utilisateur."""
    # Implémentation existante ou à créer
    pass
```

**Variables d'environnement requises dans n8n:**
```
TORAH_API_URL=http://pi6.local:3031
TORAH_API_KEY=xxx
```

---

## 4. Ce qui ne change PAS

| Composant | Statut |
|-----------|--------|
| Modèle `User` (users) | Inchangé |
| Authentification JWT | Inchangée |
| Endpoints existants | Inchangés |
| SQLAlchemy ORM | Inchangé |

---

## 5. Relation avec les autres tables

```
┌─────────────────────────────────────────────────────────────┐
│                     Base de données Torah                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐        ┌──────────────────────┐        │
│  │     users       │        │    subscribers        │        │
│  │ (Torah API)     │        │ (Discord Bot)         │        │
│  ├─────────────────┤        ├──────────────────────┤        │
│  │ id (UUID)       │        │ id (SERIAL)           │        │
│  │ username        │        │ discord_user_id ←────┼── Stripe│
│  │ email           │        │ credits               │        │
│  │ api_key         │        │ stripe_customer_id    │        │
│  │ is_active       │        │ stripe_subscription_id│        │
│  │ is_admin        │        │ subscription_status   │        │
│  └─────────────────┘        │ subscription_plan     │        │
│                             │ current_period_end    │        │
│                             └──────────────────────┘        │
│                                                              │
│  ┌──────────────────────┐                                   │
│  │   payment_history    │                                   │
│  │ (Nouveau - Stripe)   │                                   │
│  ├──────────────────────┤                                   │
│  │ discord_user_id      │                                   │
│  │ stripe_payment_id    │                                   │
│  │ amount_cents         │                                   │
│  │ status               │                                   │
│  │ plan                 │                                   │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Checklist

- [ ] Migration `subscribers` exécutée (par n8n ou DBA)
- [ ] Endpoint `/api/discord/send-dm` disponible
- [ ] Variables `TORAH_API_URL` et `TORAH_API_KEY` configurées dans n8n
- [ ] (Optionnel) Endpoint GET subscription status

---

## 7. Questions fréquentes

**Q: Dois-je modifier le modèle User SQLAlchemy ?**
A: Non. Stripe utilise la table `subscribers`, pas `users`.

**Q: Dois-je implémenter l'authentification API Key ?**
A: Non pour Stripe. Le modèle User a déjà un champ `api_key` si besoin.

**Q: Qui met à jour les crédits ?**
A: n8n, via les callbacks `torah-sub-success` et `torah-sub-renewal`.

**Q: Où sont les workflows Stripe ?**
A: `workflows/Stripe/` et `workflows/Torah/`

---

## 8. Support

**Fichiers de référence:**
- Architecture : `docs/issues/stripe-integration.md` (section 9)
- Migration : `scripts/torah/migrate-stripe-columns.sql`
- Workflows : `workflows/Torah/torah-sub-*.json`
- Guide Bot : `docs/teams/GUIDE_EQUIPE_BOT.md`
