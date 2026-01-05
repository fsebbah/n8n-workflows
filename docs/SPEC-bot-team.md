# Specifications pour l'equipe Bot

**Date:** 2025-01-05
**Statut:** FINAL v2
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

**URLs des services:**
- **n8n:** `http://pi6.local:5678`
- **API:** `http://pi6.local:3031`

---

## 2. Decisions techniques

| Sujet | Decision | Justification |
|-------|----------|---------------|
| **Stockage secrets** | Redis | Cle jamais en transit HTTP |
| **Format Redis** | JSON via GET/SET | Node natif n8n ne supporte pas HGET/HSET |
| **Credits** | PostgreSQL via API | Gere par equipe API |
| **Source de verite** | Stripe API | Pas de duplication |

---

## 3. Endpoints disponibles

### 3.1 Endpoints n8n (pi6.local:5678)

| Endpoint | Methode | Description | Statut |
|----------|---------|-------------|--------|
| `/webhook/stripe-register-project` | POST | Enregistre secrets Stripe dans Redis | OK |
| `/webhook/discord-get-plans` | GET | Liste les plans Stripe | OK |
| `/webhook/discord-subscribe` | POST | Cree une session checkout | A creer |

### 3.2 Endpoints API (pi6.local:3031)

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/api/webhook/account` | GET | Recupere les credits d'un utilisateur |
| `/api/webhook/account/debit` | POST | Debite des credits |
| `/api/webhook/account/credit` | POST | Credite des credits |
| `/api/webhook/account/set` | POST | Definit les credits (admin) |

---

## 4. Ce que le Bot/Plugin doit faire

### 4.1 Au demarrage du plugin

```python
N8N_URL = "http://pi6.local:5678"

# Enregistrer les secrets dans Redis via n8n
await http_client.post(f"{N8N_URL}/webhook/stripe-register-project", json={
    "project_id": "torah",
    "stripe_key": os.getenv("STRIPE_SECRET_KEY"),
    "webhook_secret": os.getenv("STRIPE_WEBHOOK_SECRET"),
    "display_name": "Torah App"
})
```

### 4.2 Commandes Discord

| Commande | Service | Endpoint | Header | Body/Params |
|----------|---------|----------|--------|-------------|
| `/plans` | n8n | `GET /webhook/discord-get-plans` | `X-Project-ID: torah` | `?project_id=torah` |
| `/credits` | API | `GET /api/webhook/account` | `X-Project-ID: torah` | `?project_id=torah&discord_user_id=123` |
| `/subscribe` | n8n | `POST /webhook/discord-subscribe` | `X-Project-ID: torah` | `{discord_user_id, plan_id}` |

### 4.3 Consommation de credits

```python
API_URL = "http://pi6.local:3031"

# 1. Verifier credits disponibles
response = await http_client.get(
    f"{API_URL}/api/webhook/account",
    headers={"X-Project-ID": project_id},
    params={"project_id": project_id, "discord_user_id": user_id}
)
data = response.json()
credits = data.get("credits", {}).get("credits_remaining", 0)

# 2. Si credits > 0, effectuer l'action
if credits > 0:
    result = await do_action(...)

    # 3. Debiter les credits
    await http_client.post(
        f"{API_URL}/api/webhook/account/debit",
        headers={"X-Project-ID": project_id},
        json={
            "discord_user_id": user_id,
            "amount": 1,
            "reason": "translation"
        }
    )
else:
    # Afficher message "credits epuises"
    await send_message("Vous n'avez plus de credits. Utilisez /subscribe")
```

---

## 5. Format des requetes

### 5.1 Enregistrement projet (demarrage)

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
{"success": true, "message": "Project registered successfully"}
```

### 5.2 Recuperer les plans

```http
GET /webhook/discord-get-plans?project_id=torah HTTP/1.1
Host: pi6.local:5678
X-Project-ID: torah
```

**Note:** Plus besoin de passer `stripe_key` - n8n le lit depuis Redis.

### 5.3 Recuperer les credits

```http
GET /api/webhook/account?project_id=torah&discord_user_id=123456789 HTTP/1.1
Host: pi6.local:3031
X-Project-ID: torah
```

---

## 6. Configuration .env du plugin

```env
# Identifiant projet (unique)
PROJECT_ID=torah

# Discord
DISCORD_TOKEN=xxx
DISCORD_GUILD_ID=xxx

# Stripe (source de verite)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Services
N8N_BASE_URL=http://pi6.local:5678
API_BASE_URL=http://pi6.local:3031

# Redis (optionnel - si acces direct necessaire)
REDIS_HOST=host3.local
REDIS_PORT=6381
REDIS_DB=2
```

---

## 7. Responsabilites

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

## 8. Gestion des erreurs

| Erreur | Code | Action Bot |
|--------|------|------------|
| Projet non enregistre | 404 | Re-appeler `/stripe-register-project` |
| Credits insuffisants | 402 | Afficher message "credits epuises" |
| Stripe erreur | 500 | Afficher message "erreur paiement" |
| Redis indisponible | 503 | Retry avec backoff |

---

## 9. Questions resolues

| Question | Reponse |
|----------|---------|
| Ou stocker stripe_key? | Redis (via n8n) |
| Cle en transit? | NON - juste X-Project-ID |
| Qui gere les credits? | Equipe API (PostgreSQL) |
| Format Redis? | JSON (GET/SET) car HGET/HSET pas supporte nativement |
| URL API credits? | `http://pi6.local:3031/api/webhook/account/*` |

---

## 10. Contact

- **n8n/workflows:** @claude (ce repo)
- **API/PostgreSQL:** Equipe API (voir SPEC-api-team.md)
