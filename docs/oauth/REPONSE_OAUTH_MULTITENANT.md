# Réponse : OAuth Multi-Tenant dans n8n

**Date:** 2025-12-04
**De:** Équipe n8n-workflows
**Pour:** Équipe MCP Server
**Objet:** Peut-on passer un token OAuth dynamiquement à n8n pour chaque requête ?

---

## Réponse courte

**Non, pas nativement.** n8n ne supporte pas l'injection dynamique de tokens OAuth dans les credentials au runtime.

> "The credential fields are resolved before your workflow execution context exists,
> so dynamic data from previous nodes isn't available."

**Mais** il existe des solutions de contournement éprouvées en production. Le pattern clé : **external OAuth service + n8n HTTP requests**.

---

## Le problème expliqué

### Système MCP actuel (ce que vous faites)
```
User A ──▶ OAuth Token A ──▶ Redis ──▶ API Gmail
User B ──▶ OAuth Token B ──▶ Redis ──▶ API Gmail
User C ──▶ OAuth Token C ──▶ Redis ──▶ API Gmail

✅ Token passé dynamiquement à chaque requête
```

### Système n8n natif (comment n8n fonctionne)
```
User A ──▶ Credential "Gmail-UserA" ──▶ n8n DB ──▶ API Gmail
User B ──▶ Credential "Gmail-UserB" ──▶ n8n DB ──▶ API Gmail
User C ──▶ Credential "Gmail-UserC" ──▶ n8n DB ──▶ API Gmail

❌ 1 credential statique par utilisateur
❌ Les credentials sont résolus AVANT l'exécution du workflow
```

### Pourquoi ça ne marche pas nativement

> "The credential fields are resolved before your workflow execution context exists,
> so dynamic data from previous nodes isn't available."
> — [n8n Community](https://community.n8n.io/t/possible-to-do-multi-tenant-workflows-that-can-reference-credentials-dynamically/62218)

---

## Solutions éprouvées en production

L'architecture validée suit ce pattern :

```
User Frontend → OAuth Service → Third-party APIs
       ↓              ↓               ↓
n8n Workflows  ←  Token API  ←  Secure Storage
```

### Option 1: Votre Backend MCP + Redis (✅ Recommandée pour vous)

**Principe:** Conserver votre architecture existante (Redis) et exposer une API pour n8n.

**Vous avez déjà :**
- Gestion OAuth dans votre backend
- Tokens stockés dans Redis
- Refresh automatique

**Il suffit d'ajouter :** Un endpoint REST que n8n appellera.

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Webhook    │───▶│  HTTP Request   │───▶│  HTTP Request   │
│ (user_id)   │    │ GET token from  │    │ Gmail API       │
│             │    │ Redis/Backend   │    │ + Bearer token  │
└─────────────┘    └─────────────────┘    └─────────────────┘
```

**Workflow n8n:**
```json
{
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "gmail-read",
        "httpMethod": "POST"
      }
    },
    {
      "name": "Get Token from MCP Backend",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://votre-backend.com/api/oauth/token",
        "method": "POST",
        "body": {
          "user_id": "={{ $json.user_id }}"
        }
      }
    },
    {
      "name": "Call Gmail API",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        "method": "GET",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $json.access_token }}"
            }
          ]
        }
      }
    }
  ]
}
```

**Avantages:**
- ✅ Compatible avec votre architecture Redis existante
- ✅ Token dynamique par requête
- ✅ Gestion refresh token côté backend

**Inconvénients:**
- ❌ Pas d'utilisation des nodes natifs (Gmail, Google Sheets, etc.)
- ❌ Plus de code à maintenir

---

### Option 2: n8n comme orchestrateur simple

**Principe:** n8n déclenche votre backend MCP qui gère l'OAuth.

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  n8n        │───▶│  MCP Backend    │───▶│  Gmail API      │
│  Webhook    │    │  (gère OAuth)   │    │                 │
└─────────────┘    └─────────────────┘    └─────────────────┘
```

**Avantages:**
- ✅ Votre code OAuth existant reste inchangé
- ✅ n8n = simple déclencheur/orchestrateur

**Inconvénients:**
- ❌ n8n ne fait que du "pass-through"

---

### Option 3: Un credential par utilisateur (❌ Non scalable)

**Principe:** Créer un credential n8n pour chaque utilisateur.

```
Credential "Gmail-User1" → Workflow dédié User1
Credential "Gmail-User2" → Workflow dédié User2
...
```

**Inconvénients:**
- ❌ Ne scale pas (100 users = 100 credentials + 100 workflows)
- ❌ Maintenance impossible
- ❌ OAuth dance à refaire manuellement pour chaque user

---

### Option 4: External Secrets (💰 Enterprise)

n8n Enterprise propose [External Secrets](https://docs.n8n.io/external-secrets/) pour connecter un vault externe (HashiCorp Vault, AWS Secrets Manager).

**Mais:** Conçu pour dev/staging/prod, pas pour multi-tenant dynamique.

---

## Recommandation pour l'équipe MCP

### Architecture proposée

```
┌──────────────────────────────────────────────────────────────────┐
│                        VOTRE BACKEND MCP                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Redis     │  │   OAuth     │  │   API Endpoint          │  │
│  │   Tokens    │◀─│   Manager   │◀─│   /api/gmail/messages   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                                      ▲                  │
│         ▼                                      │                  │
│  ┌─────────────────────────────────────────────┴───────────────┐ │
│  │              Token Refresh Service                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTP Request
                              │
┌──────────────────────────────────────────────────────────────────┐
│                            n8n                                    │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Webhook    │───▶│  Call MCP API   │───▶│  Process Data   │  │
│  │  Trigger    │    │  (user_id)      │    │  & Actions      │  │
│  └─────────────┘    └─────────────────┘    └─────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Pourquoi cette approche ?

1. **Votre code OAuth reste inchangé** - Redis + refresh tokens déjà en place
2. **n8n = orchestration** - Déclenche les actions, gère le flux
3. **Scalable** - 1 workflow pour N utilisateurs
4. **Sécurisé** - Tokens jamais exposés dans n8n

---

## Exemple concret : Lire les emails Gmail

### Endpoint MCP Backend à créer

```python
# /api/gmail/messages
@app.post("/api/gmail/messages")
async def get_gmail_messages(user_id: str, max_results: int = 10):
    # 1. Récupérer token depuis Redis
    token = redis.get(f"oauth_token:{user_id}")

    # 2. Refresh si expiré
    if is_expired(token):
        token = refresh_oauth_token(user_id)

    # 3. Appeler Gmail API
    response = requests.get(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        headers={"Authorization": f"Bearer {token}"},
        params={"maxResults": max_results}
    )

    return response.json()
```

### Workflow n8n

```
Webhook (POST /gmail-read)
    │
    ▼
HTTP Request → POST https://mcp-backend.com/api/gmail/messages
    │           body: { "user_id": "{{ $json.user_id }}" }
    │
    ▼
Process emails (Code node, IF, etc.)
    │
    ▼
Actions (Slack notification, Database, etc.)
```

---

## Exemple complet : "Analyse mes emails Gmail du jour et fais un résumé"

### Scénario utilisateur

Un utilisateur dit à Claude :
> "Analyse mes emails Gmail de la journée et fais moi un résumé"

### Architecture complète du flux

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              UTILISATEUR                                         │
│                                                                                  │
│   "Analyse mes emails Gmail de la journée et fais moi un résumé"                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CLAUDE (MCP Client)                                    │
│                                                                                  │
│   1. Comprend la demande                                                        │
│   2. Identifie : besoin Gmail + user_id                                         │
│   3. Appelle l'outil MCP "analyze_gmail"                                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ MCP Protocol (tools/call)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           n8n (MCP Server)                                       │
│                                                                                  │
│   Workflow "Analyze Gmail"                                                      │
│   ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │ Webhook  │───▶│ Get Token    │───▶│ Gmail API    │───▶│ AI Summary   │     │
│   │ Trigger  │    │ from Backend │    │ (HTTP Req)   │    │ (GPT/Claude) │     │
│   └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘     │
│        │                 │                   │                   │              │
│        ▼                 ▼                   ▼                   ▼              │
│   { user_id }      { token }          [ emails ]          { résumé }           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────────────┐
│      VOTRE BACKEND MCP          │    │              GMAIL API                   │
│                                 │    │                                          │
│  GET /api/credentials/{user}/   │    │  GET /gmail/v1/users/me/messages        │
│       gmail                     │    │  Authorization: Bearer {token}           │
│                                 │    │                                          │
│  ┌─────────┐                    │    └─────────────────────────────────────────┘
│  │  Redis  │ → token OAuth      │
│  └─────────┘                    │
│                                 │
└─────────────────────────────────┘
```

### Flux détaillé étape par étape

#### Étape 1 : L'utilisateur parle à Claude
```
User: "Analyse mes emails Gmail de la journée et fais moi un résumé"
```

#### Étape 2 : Claude identifie l'outil MCP à utiliser
```json
{
  "tool": "analyze_gmail_emails",
  "arguments": {
    "user_id": "user_123",
    "date_filter": "today"
  }
}
```

#### Étape 3 : n8n reçoit la requête (Webhook)
```
POST http://pi6.local:5678/webhook/analyze-gmail
Body: { "user_id": "user_123", "date_filter": "today" }
```

#### Étape 4 : n8n récupère le token OAuth depuis votre backend
```
GET https://votre-backend-mcp.com/api/credentials/user_123/gmail

Response: {
  "access_token": "ya29.a0AfH6SMBx...",
  "expires_at": "2025-12-04T15:30:00Z"
}
```

#### Étape 5 : n8n appelle Gmail API avec le token
```
GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=after:2025/12/04

Headers:
  Authorization: Bearer ya29.a0AfH6SMBx...

Response: {
  "messages": [
    { "id": "msg_1", "threadId": "..." },
    { "id": "msg_2", "threadId": "..." }
  ]
}
```

#### Étape 6 : n8n récupère le contenu de chaque email
```
GET https://gmail.googleapis.com/gmail/v1/users/me/messages/msg_1

Response: {
  "snippet": "Bonjour, voici le rapport...",
  "payload": { "headers": [...], "body": {...} }
}
```

#### Étape 7 : n8n envoie à l'IA pour résumer
```
POST https://api.openai.com/v1/chat/completions

Body: {
  "model": "gpt-4",
  "messages": [{
    "role": "user",
    "content": "Résume ces 15 emails de façon concise:\n\n[contenu des emails]"
  }]
}

Response: {
  "choices": [{
    "message": {
      "content": "📧 Résumé de vos 15 emails du jour:\n\n1. **Projet X** - 3 emails..."
    }
  }]
}
```

#### Étape 8 : n8n retourne le résultat à Claude
```json
{
  "success": true,
  "summary": "📧 Résumé de vos 15 emails du jour:\n\n1. **Projet X** - 3 emails...",
  "email_count": 15
}
```

#### Étape 9 : Claude présente le résultat à l'utilisateur
```
Claude: "Voici le résumé de vos 15 emails Gmail reçus aujourd'hui :

📧 **Résumé de vos emails du 4 décembre :**

1. **Projet X** (3 emails) - Discussion sur le deadline reporté au 15 décembre
2. **RH** (1 email) - Rappel : congés à poser avant fin d'année
3. **Client ABC** (2 emails) - Demande de devis pour nouvelle fonctionnalité
..."
```

### Workflow n8n visuel

```
┌─────────────┐
│   Webhook   │ ← POST { user_id, date_filter }
│   Trigger   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  HTTP Request   │ → GET votre-backend/api/credentials/{user_id}/gmail
│  "Get Token"    │ ← { access_token: "ya29..." }
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  HTTP Request   │ → GET gmail.googleapis.com/messages?q=after:today
│  "List Emails"  │ ← { messages: [{id: "msg_1"}, ...] }
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Loop Over      │ Pour chaque message_id
│  Items          │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  HTTP Request   │ → GET gmail.googleapis.com/messages/{id}
│  "Get Email"    │ ← { snippet, payload, ... }
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Code Node      │ Formater les emails en texte
│  "Format"       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  OpenAI /       │ → "Résume ces emails..."
│  Claude Node    │ ← "📧 Résumé: 1. Projet X..."
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Respond to     │ → { success: true, summary: "..." }
│  Webhook        │
└─────────────────┘
```

### Ce que l'équipe MCP doit faire

| Composant | Qui le fait ? | Statut |
|-----------|---------------|--------|
| Gestion OAuth Gmail | Votre backend | ✅ Déjà fait (Redis) |
| Endpoint `/api/credentials` | Votre backend | 🔧 **À créer** |
| Workflow n8n "Analyze Gmail" | n8n | 🔧 **À créer** |
| Exposition MCP du workflow | n8n | 🔧 **À configurer** |

### Endpoint à créer côté backend MCP

```python
@app.get("/api/credentials/{user_id}/gmail")
async def get_gmail_credentials(user_id: str):
    # 1. Récupérer token depuis Redis
    token_data = redis.get(f"oauth:{user_id}:gmail")

    if not token_data:
        return {"error": "not_connected", "oauth_url": "https://..."}

    token = json.loads(token_data)

    # 2. Refresh si expiré
    if datetime.now() > token["expires_at"]:
        token = await refresh_gmail_token(user_id, token["refresh_token"])

    # 3. Retourner le token
    return {
        "access_token": token["access_token"],
        "expires_at": token["expires_at"]
    }
```

### Résumé simplifié du flux

```
USER → CLAUDE → n8n → VOTRE BACKEND (token) → GMAIL API → IA (résumé) → CLAUDE → USER
         │                    │
         │                    └── Redis (tokens OAuth)
         │
         └── MCP Protocol
```

---

## Conclusion

| Approche | Multi-tenant | Scalable | Effort | Recommandation |
|----------|--------------|----------|--------|----------------|
| HTTP Request + Backend | ✅ | ✅ | Moyen | ✅ **Recommandée** |
| n8n orchestrateur | ✅ | ✅ | Faible | ✅ Alternative |
| 1 credential/user | ❌ | ❌ | Élevé | ❌ Non |
| External Secrets | ⚠️ | ⚠️ | Faible | 💰 Enterprise only |

**Notre recommandation:** Gardez votre gestion OAuth dans le backend MCP, exposez des endpoints REST, et utilisez n8n pour l'orchestration via HTTP Request.

---

## Sources

- [n8n Community - Dynamic credentials multi-tenant](https://community.n8n.io/t/possible-to-do-multi-tenant-workflows-that-can-reference-credentials-dynamically/62218)
- [n8n Community - Dynamic credentials discussion](https://community.n8n.io/t/dynamic-credentials/42890)
- [n8n Docs - HTTP Request credentials](https://docs.n8n.io/integrations/builtin/credentials/httprequest/)
- [n8n Community - Gmail OAuth per user](https://community.n8n.io/t/how-to-dynamically-set-gmail-oauth-credentials-per-user-in-n8n-client-id-secret-access-refresh-tokens-stored-in-db/222762)
