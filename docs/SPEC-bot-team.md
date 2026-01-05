# Specifications pour l'equipe Bot

**Date:** 2025-01-05
**Statut:** FINAL
**Destinataire:** Equipe Bot / Framework Discord

---

## 1. Architecture finale

```
┌─────────────────────────────────────────────────────────────┐
│                   ARCHITECTURE FINALE                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  REDIS (host3.local:6381)                                   │
│  └── Secrets projet: stripe_key, webhook_secret             │
│                                                              │
│  STRIPE API                                                  │
│  └── Source de verite: customers, subscriptions, prices     │
│                                                              │
│  POSTGRESQL (gere par equipe API)                           │
│  └── Credits utilisateurs                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Decisions techniques

| Sujet | Decision | Justification |
|-------|----------|---------------|
| **Stockage secrets** | Redis | Cle jamais en transit HTTP |
| **Format Redis** | JSON via GET/SET | Node natif n8n ne supporte pas HGET/HSET |
| **Credits** | PostgreSQL via API | Gere par equipe API |
| **Source de verite** | Stripe API | Pas de duplication |

---

## 3. Ce que le Bot/Plugin doit faire

### 3.1 Au demarrage du plugin

```python
# Enregistrer les secrets dans Redis via n8n
await n8n_client.post("/webhook/stripe-register-project", json={
    "project_id": "torah",
    "stripe_key": os.getenv("STRIPE_SECRET_KEY"),
    "webhook_secret": os.getenv("STRIPE_WEBHOOK_SECRET"),
    "display_name": "Torah App"
})
```

### 3.2 Commandes Discord

| Commande | Endpoint n8n | Header | Body/Params |
|----------|--------------|--------|-------------|
| `/plans` | `GET /webhook/discord-get-plans` | `X-Project-ID: torah` | - |
| `/credits` | `GET /webhook/credits-get` | `X-Project-ID: torah` | `?discord_user_id=123` |
| `/subscribe` | `POST /webhook/discord-subscribe` | `X-Project-ID: torah` | `{discord_user_id, plan_id}` |

### 3.3 Consommation de credits

```python
# 1. Verifier credits disponibles
response = await n8n_client.get(
    "/webhook/credits-get",
    headers={"X-Project-ID": project_id},
    params={"discord_user_id": user_id}
)
credits = response.json()["credits_remaining"]

# 2. Si credits > 0, effectuer l'action
if credits > 0:
    result = await do_action(...)

    # 3. Debiter les credits
    await n8n_client.post(
        "/webhook/credits-debit",
        headers={"X-Project-ID": project_id},
        json={
            "discord_user_id": user_id,
            "amount": 1,
            "reason": "action_name"
        }
    )
```

---

## 4. Format des requetes

### 4.1 Enregistrement projet (demarrage)

```http
POST /webhook/stripe-register-project HTTP/1.1
Host: pi6.local:5678
Content-Type: application/json

{
    "project_id": "torah",
    "stripe_key": "sk_live_xxxxxxxxxxxx",
    "webhook_secret": "whsec_xxxxxxxxxxxx",
    "display_name": "Torah App"
}
```

**Reponse:**
```json
{"success": true, "message": "Project registered"}
```

### 4.2 Requetes avec X-Project-ID

```http
GET /webhook/discord-get-plans HTTP/1.1
Host: pi6.local:5678
X-Project-ID: torah
```

**Note:** Plus besoin de passer `stripe_key` - n8n le lit depuis Redis.

---

## 5. Configuration .env du plugin

```env
# Identifiant projet (unique)
PROJECT_ID=torah

# Discord
DISCORD_TOKEN=xxx
DISCORD_GUILD_ID=xxx

# Stripe (source de verite)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# n8n
N8N_BASE_URL=http://pi6.local:5678

# Redis (optionnel - si acces direct necessaire)
REDIS_HOST=host3.local
REDIS_PORT=6381
REDIS_DB=2
```

---

## 6. Responsabilites

| Composant | Responsabilite |
|-----------|----------------|
| **Plugin** | Possede les cles Stripe dans `.env` |
| **Plugin** | Appelle `/stripe-register-project` au demarrage |
| **Bot** | Envoie `X-Project-ID` dans chaque requete |
| **Bot** | Ne stocke PAS les cles Stripe en memoire |
| **n8n** | Lit les cles depuis Redis |
| **n8n** | Appelle Stripe API |
| **API** | Gere les credits (PostgreSQL) |

---

## 7. Gestion des erreurs

| Erreur | Code | Action Bot |
|--------|------|------------|
| Projet non enregistre | 404 | Re-appeler `/stripe-register-project` |
| Credits insuffisants | 402 | Afficher message "credits epuises" |
| Stripe erreur | 500 | Afficher message "erreur paiement" |
| Redis indisponible | 503 | Retry avec backoff |

---

## 8. Questions resolues

| Question | Reponse |
|----------|---------|
| Ou stocker stripe_key? | Redis (via n8n) |
| Cle en transit? | NON - juste X-Project-ID |
| Qui gere les credits? | Equipe API (PostgreSQL) |
| Format Redis? | JSON (GET/SET) car HGET/HSET pas supporte nativement |

---

## 9. Contact

- **n8n/workflows:** @claude (ce repo)
- **API/PostgreSQL:** Equipe API (voir SPEC-api-team.md)
