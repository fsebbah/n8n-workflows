# Travail Équipe API Torah

**Source:** RFC-016 + RFC-017
**Date:** 2026-01-22
**Priorité globale:** 🔴 Haute (Phase 1 - Fondations)

---

## Résumé

L'équipe API doit adapter le modèle Job pour supporter la progression en temps réel et créer les endpoints de gestion des crédits.

---

## Actions à réaliser

| # | Action | Priorité | Complexité | Dépendances |
|---|--------|----------|------------|-------------|
| 1 | Ajouter champ `progress` au modèle Job | 🔴 Haute | Faible | Aucune |
| 2 | Créer `POST /api/credits/{user_id}/debit` | 🔴 Haute | Moyenne | Aucune |
| 3 | Créer `POST /api/credits/{user_id}/refund` | 🔴 Haute | Moyenne | Aucune |
| 4 | Valider transitions d'état | 🟡 Moyenne | Faible | Aucune |
| 5 | Auto-set timestamps | 🟡 Moyenne | Faible | Aucune |
| 6 | Supporter `credits` dans PATCH /api/v2/jobs | 🟡 Moyenne | Faible | Action 1 |

---

## Action 1 : Ajouter champ `progress` au modèle Job

### Contexte

Actuellement, la progression est stockée dans `output` de manière non structurée. Un champ dédié permet un affichage cohérent côté plugins.

### Modification requise

```python
# models/job.py ou équivalent
class Job:
    id: str
    job_type: str
    status: str  # pending, processing, completed, cancelled, failed
    progress: dict | None  # ← NOUVEAU
    output: dict | None
    error: dict | None
    created_at: datetime
    updated_at: datetime

class JobUpdateRequest:
    status: str | None
    progress: dict | None  # ← NOUVEAU
    output: dict | None
    error: dict | None
```

### Format du champ `progress`

```json
{
  "current": 5,
  "total": 15,
  "percentage": 33,
  "step": "translating"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `current` | int | Élément en cours (1-indexed) |
| `total` | int | Nombre total d'éléments |
| `percentage` | int | Pourcentage calculé (0-100) |
| `step` | string | Étape actuelle (optionnel) |

### Valeurs de `step`

| Valeur | Description |
|--------|-------------|
| `extracting` | Extraction PDF/OCR en cours |
| `translating` | Traduction en cours |
| `verifying` | Vérification GPT en cours |
| `saving` | Sauvegarde en cours |

### Endpoint concerné

```bash
PATCH /api/v2/jobs/{job_id}
Content-Type: application/json

{
  "status": "processing",
  "progress": {
    "current": 5,
    "total": 15,
    "percentage": 33,
    "step": "translating"
  }
}
```

### Tests à ajouter

- [ ] PATCH avec progress valide → 200 OK
- [ ] PATCH avec progress partiel (current only) → 200 OK
- [ ] GET job retourne progress correctement
- [ ] progress est nullable (jobs sans progression)

---

## Action 2 : Créer endpoint débit crédits

### Endpoint

```
POST /api/credits/{discord_user_id}/debit
```

### Request

```json
{
  "project_id": "torah",
  "amount": 10,
  "reason": "document_translation",
  "job_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `project_id` | string | ✅ | Identifiant projet (torah, recipes) |
| `amount` | int | ✅ | Nombre de crédits à débiter |
| `reason` | string | ✅ | Raison du débit |
| `job_id` | string | ❌ | Job associé (traçabilité) |

### Response - Succès (200)

```json
{
  "success": true,
  "credits_remaining": 90,
  "credits_debited": 10,
  "transaction_id": "txn_abc123"
}
```

### Response - Crédits insuffisants (402)

```json
{
  "success": false,
  "error": "insufficient_credits",
  "credits_remaining": 5,
  "credits_requested": 10,
  "message": "Crédits insuffisants. Solde: 5, Demandé: 10"
}
```

### Response - Utilisateur non trouvé (404)

```json
{
  "success": false,
  "error": "user_not_found",
  "message": "Utilisateur non trouvé"
}
```

### Logique métier

```python
async def debit_credits(discord_user_id: str, request: DebitRequest):
    # 1. Récupérer le solde actuel
    user_credits = await get_user_credits(discord_user_id, request.project_id)

    if not user_credits:
        raise HTTPException(404, "user_not_found")

    # 2. Vérifier solde suffisant
    if user_credits.credits_remaining < request.amount:
        raise HTTPException(402, {
            "error": "insufficient_credits",
            "credits_remaining": user_credits.credits_remaining,
            "credits_requested": request.amount
        })

    # 3. Débiter
    new_balance = user_credits.credits_remaining - request.amount

    await update_user_credits(
        discord_user_id,
        request.project_id,
        credits_remaining=new_balance
    )

    # 4. Logger la transaction
    transaction = await create_transaction(
        user_id=discord_user_id,
        project_id=request.project_id,
        type="debit",
        amount=request.amount,
        reason=request.reason,
        job_id=request.job_id
    )

    return {
        "success": True,
        "credits_remaining": new_balance,
        "credits_debited": request.amount,
        "transaction_id": transaction.id
    }
```

### Table SQL suggérée (transactions)

```sql
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id VARCHAR(255) NOT NULL,
    project_id VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL,  -- 'debit', 'refund', 'purchase'
    amount INTEGER NOT NULL,
    reason VARCHAR(255),
    job_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (discord_user_id, project_id)
        REFERENCES user_credits(discord_user_id, project_id)
);
```

---

## Action 3 : Créer endpoint remboursement crédits

### Endpoint

```
POST /api/credits/{discord_user_id}/refund
```

### Request

```json
{
  "project_id": "torah",
  "amount": 5,
  "reason": "job_cancelled",
  "job_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Response - Succès (200)

```json
{
  "success": true,
  "credits_remaining": 95,
  "credits_refunded": 5,
  "transaction_id": "txn_xyz789"
}
```

### Logique métier

```python
async def refund_credits(discord_user_id: str, request: RefundRequest):
    # 1. Récupérer le solde actuel
    user_credits = await get_user_credits(discord_user_id, request.project_id)

    if not user_credits:
        raise HTTPException(404, "user_not_found")

    # 2. Créditer (pas de vérification de plafond pour les refunds)
    new_balance = user_credits.credits_remaining + request.amount

    await update_user_credits(
        discord_user_id,
        request.project_id,
        credits_remaining=new_balance
    )

    # 3. Logger la transaction
    transaction = await create_transaction(
        user_id=discord_user_id,
        project_id=request.project_id,
        type="refund",
        amount=request.amount,
        reason=request.reason,
        job_id=request.job_id
    )

    return {
        "success": True,
        "credits_remaining": new_balance,
        "credits_refunded": request.amount,
        "transaction_id": transaction.id
    }
```

---

## Action 4 : Valider transitions d'état

### Transitions valides

```python
VALID_TRANSITIONS = {
    "pending": ["processing", "cancelled"],
    "processing": ["completed", "cancelled", "failed"],
    "completed": [],  # État final
    "cancelled": [],  # État final
    "failed": [],     # État final
}
```

### Implémentation

```python
async def update_job(job_id: str, request: JobUpdateRequest):
    job = await get_job(job_id)

    if request.status and request.status != job.status:
        # Vérifier transition valide
        allowed = VALID_TRANSITIONS.get(job.status, [])
        if request.status not in allowed:
            raise HTTPException(400, {
                "error": "invalid_state_transition",
                "current_status": job.status,
                "requested_status": request.status,
                "allowed_transitions": allowed
            })

    # Continuer avec la mise à jour...
```

### Response - Transition invalide (400)

```json
{
  "error": "invalid_state_transition",
  "current_status": "completed",
  "requested_status": "cancelled",
  "allowed_transitions": [],
  "message": "Cannot transition from 'completed' to 'cancelled'"
}
```

---

## Action 5 : Auto-set timestamps

### Timestamps à gérer

| Status | Timestamp |
|--------|-----------|
| `completed` | `completed_at` |
| `cancelled` | `cancelled_at` |
| `failed` | `failed_at` |

### Implémentation

```python
async def update_job(job_id: str, request: JobUpdateRequest):
    job = await get_job(job_id)

    update_data = request.dict(exclude_unset=True)

    # Auto-set timestamp selon le status
    if request.status:
        now = datetime.utcnow()
        if request.status == "completed":
            update_data["completed_at"] = now
        elif request.status == "cancelled":
            update_data["cancelled_at"] = now
        elif request.status == "failed":
            update_data["failed_at"] = now

    # Toujours mettre à jour updated_at
    update_data["updated_at"] = datetime.utcnow()

    await db.jobs.update_one({"_id": job_id}, {"$set": update_data})
```

### Modèle Job mis à jour

```python
class Job:
    id: str
    job_type: str
    status: str
    progress: dict | None
    output: dict | None
    error: dict | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None  # ← NOUVEAU
    cancelled_at: datetime | None  # ← NOUVEAU
    failed_at: datetime | None     # ← NOUVEAU
```

---

## Action 6 : Supporter `credits` dans PATCH

### Request

```bash
PATCH /api/v2/jobs/{job_id}
Content-Type: application/json

{
  "status": "processing",
  "progress": {
    "current": 5,
    "total": 15,
    "percentage": 33
  },
  "credits": {
    "consumed": {
      "claude_tokens": { "input": 5000, "output": 2500, "total": 7500 },
      "gpt_tokens": { "input": 1000, "output": 500, "total": 1500 },
      "total_tokens": 9000,
      "cost_usd": 0.015
    }
  }
}
```

### Modèle

```python
class JobCredits:
    consumed: dict  # Tokens consommés jusqu'à présent
    estimated_total: dict | None  # Estimation totale (optionnel)

class JobUpdateRequest:
    status: str | None
    progress: dict | None
    credits: JobCredits | None  # ← NOUVEAU
    output: dict | None
    error: dict | None
```

---

## Checklist finale

### Phase 1 (Priorité haute)

- [ ] Ajouter champ `progress` au modèle Job
- [ ] Créer `POST /api/credits/{user_id}/debit`
- [ ] Créer `POST /api/credits/{user_id}/refund`
- [ ] Créer table `credit_transactions` (si nécessaire)
- [ ] Tests unitaires pour les nouveaux endpoints

### Phase 2 (Priorité moyenne)

- [ ] Valider transitions d'état dans PATCH
- [ ] Auto-set timestamps (completed_at, cancelled_at, failed_at)
- [ ] Supporter `credits` dans PATCH /api/v2/jobs
- [ ] Documentation API mise à jour

### Tests d'intégration

- [ ] Scénario complet : créer job → progress → complete
- [ ] Scénario annulation : créer job → progress → cancel
- [ ] Scénario crédits : check → debit → refund

---

## Questions en suspens

1. **Table transactions** : Existe-t-elle déjà ou à créer ?
2. **Historique crédits** : Faut-il exposer un endpoint GET /api/credits/{user_id}/history ?
3. **Plafond remboursement** : Peut-on rembourser plus que le montant débité initialement ?

---

## Contact

Pour questions sur ces spécifications :
- RFC-016 : Architecture globale
- RFC-017 : Détails job lifecycle
