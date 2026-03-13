# Spec n8n : Workflow OAuth Lichess (Complet)

**Date:** 2026-03-13
**Priorité:** Haute
**Équipe:** n8n

---

## Objectif

Créer un workflow n8n qui finalise automatiquement l'authentification OAuth Lichess :
1. Reçoit le callback de Lichess
2. Échange le code contre un token
3. Stocke le token dans Redis
4. Redirige l'utilisateur vers Discord

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Discord   │────▶│  Plugin Bot │────▶│    Redis    │
│ /lichess    │     │ start_flow  │     │ oauth:flow  │
│  connect    │     │             │     │   :{state}  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
      ┌────────────────────────────────────────┘
      ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Lichess   │────▶│     n8n     │────▶│    Redis    │
│  Callback   │     │  Workflow   │     │oauth:token  │
│?code&state  │     │             │     │  :lichess   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                           │                   │
                           ▼                   │
                    ┌─────────────┐            │
                    │   Discord   │◀───────────┘
                    │  Redirect   │
                    └─────────────┘
```

---

## Endpoint

| Paramètre | Valeur |
|-----------|--------|
| **URL** | `https://lichess.azy.solutions/webhook/lichess-oauth-callback` |
| **Méthode** | `GET` |
| **Content-Type** | `text/html` |

---

## Workflow n8n

### Node 1: Webhook Trigger

```json
{
  "name": "Lichess OAuth Callback",
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "httpMethod": "GET",
    "path": "lichess-oauth-callback",
    "responseMode": "responseNode"
  }
}
```

**Input Query Parameters:**
- `code` : Code d'autorisation Lichess
- `state` : État pour retrouver les données du flow

---

### Node 2: Validate Parameters (Function)

```javascript
const code = $input.first().json.query.code;
const state = $input.first().json.query.state;

if (!code || !state) {
  return [{
    json: {
      success: false,
      error: "Paramètres manquants",
      html: `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Erreur - Lichess</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .container { text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 16px; max-width: 400px; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { margin-bottom: 16px; }
    p { color: rgba(255,255,255,0.8); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>Erreur de connexion</h1>
    <p>Paramètres invalides. Retourne sur Discord et réessaie /lichess connect</p>
  </div>
</body>
</html>
      `
    }
  }];
}

return [{
  json: {
    success: true,
    code: code,
    state: state
  }
}];
```

---

### Node 3: Redis GET Flow Data

```json
{
  "name": "Get Flow Data",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "get",
    "key": "={{ 'oauth:flow:' + $json.state }}"
  }
}
```

**Clé Redis:** `oauth:flow:{state}`

**Données attendues:**
```json
{
  "user_id": "123456789",
  "provider": "lichess",
  "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  "redirect_uri": "https://lichess.azy.solutions/webhook/lichess-oauth-callback",
  "created_at": "2024-03-13T15:00:00Z"
}
```

---

### Node 4: Check Flow Data Exists (IF)

```json
{
  "name": "Flow Data Exists?",
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "boolean": [{
        "value1": "={{ $json.data !== null && $json.data !== '' }}",
        "value2": true
      }]
    }
  }
}
```

**Si FALSE → Node Error: State Expiré**

---

### Node 5: Parse Flow Data (Function)

```javascript
const flowDataStr = $input.first().json.data;
const code = $('Validate Parameters').first().json.code;

let flowData;
try {
  flowData = JSON.parse(flowDataStr);
} catch (e) {
  throw new Error("Flow data invalide");
}

return [{
  json: {
    code: code,
    user_id: flowData.user_id,
    code_verifier: flowData.code_verifier,
    redirect_uri: flowData.redirect_uri,
    provider: flowData.provider,
    state: $('Validate Parameters').first().json.state
  }
}];
```

---

### Node 6: Exchange Code for Token (HTTP Request)

```json
{
  "name": "Lichess Token Exchange",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "https://lichess.org/api/token",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [{
        "name": "Content-Type",
        "value": "application/x-www-form-urlencoded"
      }]
    },
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        { "name": "grant_type", "value": "authorization_code" },
        { "name": "code", "value": "={{ $json.code }}" },
        { "name": "code_verifier", "value": "={{ $json.code_verifier }}" },
        { "name": "redirect_uri", "value": "={{ $json.redirect_uri }}" }
      ]
    }
  }
}
```

**Réponse Lichess attendue:**
```json
{
  "access_token": "lip_xxxxxxxxxxxxxxxx",
  "token_type": "Bearer",
  "expires_in": 5184000
}
```

---

### Node 7: Check Token Response (IF)

```json
{
  "name": "Token Received?",
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "boolean": [{
        "value1": "={{ $json.access_token !== undefined }}",
        "value2": true
      }]
    }
  }
}
```

---

### Node 8: Prepare Token Data (Function)

```javascript
const tokenResponse = $input.first().json;
const flowData = $('Parse Flow Data').first().json;

// Calculer expiration
const expiresIn = tokenResponse.expires_in || 5184000; // 60 jours par défaut
const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

return [{
  json: {
    user_id: flowData.user_id,
    state: flowData.state,
    token_data: JSON.stringify({
      access_token: tokenResponse.access_token,
      token_type: tokenResponse.token_type || "Bearer",
      expires_in: expiresIn,
      expires_at: expiresAt,
      provider: "lichess",
      created_at: new Date().toISOString()
    }),
    // TTL en secondes (expire_in - 1 heure de marge)
    ttl: Math.max(expiresIn - 3600, 86400)
  }
}];
```

---

### Node 9: Redis SET Token

```json
{
  "name": "Store Token",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "set",
    "key": "={{ 'oauth:token:lichess:' + $json.user_id }}",
    "value": "={{ $json.token_data }}",
    "expire": true,
    "ttl": "={{ $json.ttl }}"
  }
}
```

**Clé Redis:** `oauth:token:lichess:{user_id}`

---

### Node 10: Redis DEL Flow Data (Cleanup)

```json
{
  "name": "Cleanup Flow",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "delete",
    "key": "={{ 'oauth:flow:' + $('Parse Flow Data').first().json.state }}"
  }
}
```

---

### Node 11: Success Response (Respond to Webhook)

```json
{
  "name": "Success Response",
  "type": "n8n-nodes-base.respondToWebhook",
  "parameters": {
    "respondWith": "text",
    "responseBody": "={{ $json.html }}",
    "options": {
      "responseHeaders": {
        "entries": [{
          "name": "Content-Type",
          "value": "text/html; charset=utf-8"
        }]
      }
    }
  }
}
```

**HTML de succès (à générer dans un node Function avant):**

```javascript
const userId = $('Parse Flow Data').first().json.user_id;

const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lichess - Connexion réussie</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      max-width: 400px;
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { color: rgba(255,255,255,0.8); line-height: 1.6; margin-bottom: 12px; }
    .discord-link {
      display: inline-block;
      margin-top: 24px;
      padding: 12px 24px;
      background: #5865F2;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    }
    .discord-link:hover { background: #4752C4; }
    .auto-close { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>Connexion Lichess réussie !</h1>
    <p>Ton compte Lichess est maintenant lié à Discord.</p>
    <p>Tu peux utiliser <strong>/lichess profile</strong> pour voir ton profil.</p>
    <a href="https://discord.com/channels/@me" class="discord-link">
      Retourner sur Discord
    </a>
    <p class="auto-close">Cette page se fermera automatiquement...</p>
  </div>
  <script>
    // Auto-close si popup
    setTimeout(() => {
      try { window.close(); } catch(e) {}
    }, 5000);
  </script>
</body>
</html>
`;

return [{ json: { html } }];
```

---

### Node Error: State Expiré/Invalide

```javascript
const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Erreur - Lichess</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .container { text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 16px; max-width: 400px; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { margin-bottom: 16px; }
    p { color: rgba(255,255,255,0.8); line-height: 1.6; }
    a { color: #5865F2; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">⏰</div>
    <h1>Lien expiré</h1>
    <p>Ce lien de connexion a expiré (10 minutes max).</p>
    <p>Retourne sur Discord et utilise <strong>/lichess connect</strong> pour réessayer.</p>
  </div>
</body>
</html>
`;

return [{ json: { html, statusCode: 400 } }];
```

---

### Node Error: Token Exchange Failed

```javascript
const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Erreur - Lichess</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .container { text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 16px; max-width: 400px; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { margin-bottom: 16px; }
    p { color: rgba(255,255,255,0.8); line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>Erreur Lichess</h1>
    <p>Impossible de finaliser la connexion avec Lichess.</p>
    <p>Réessaie avec <strong>/lichess connect</strong> sur Discord.</p>
  </div>
</body>
</html>
`;

return [{ json: { html, statusCode: 500 } }];
```

---

## Résumé du Flow

```
┌──────────────────┐
│ Webhook Trigger  │
│ ?code=x&state=y  │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Validate Params  │──── Invalid ───▶ Error Page
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Redis GET        │
│ oauth:flow:{st}  │──── Not Found ──▶ Expired Page
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Parse Flow Data  │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ HTTP POST        │
│ lichess.org/api  │──── Failed ─────▶ Error Page
│ /token           │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Redis SET        │
│ oauth:token:...  │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Redis DEL        │
│ oauth:flow:{st}  │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Success Page     │
│ + Auto-close     │
└──────────────────┘
```

---

## Configuration requise

### Redis
- Accès au même Redis que le bot
- Prefix: `oauth:` (par défaut dans chatbot-core)

### Variables
| Variable | Valeur |
|----------|--------|
| Redis Host | `host3.local:6381` |
| Redis DB | `2` (selon .env.local) |

---

## Test

```bash
# 1. Sur Discord: /lichess connect
# 2. Cliquer sur le bouton "Se connecter à Lichess"
# 3. Autoriser sur Lichess
# 4. Vérifier la page de succès
# 5. Sur Discord: /lichess profile
```

---

## Mise à jour côté Bot

Une fois ce workflow en place, on peut supprimer la commande `/lichess callback` qui n'est plus nécessaire.

---

## Questions résolues

- ✅ Pas de JWT nécessaire (state = token aléatoire)
- ✅ Pas de secret partagé (données dans Redis)
- ✅ n8n a accès à Redis
