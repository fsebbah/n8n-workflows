# MCP NotebookLM - Guide d'Intégration

> Documentation pour l'équipe MCP et transmission aux équipes Frontend

**Version** : 1.0
**Date** : 2026-04-06
**Statut** : Prototype
**RFC associée** : RFC-055

---

## Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis - Extraction des Cookies](#prérequis---extraction-des-cookies)
3. [Appels API](#appels-api)
4. [Gestion des Cookies côté Frontend](#gestion-des-cookies-côté-frontend)
5. [Codes d'erreur](#codes-derreur)
6. [FAQ](#faq)

---

## Vue d'ensemble

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐
│    Frontend     │────▶│   n8n Webhook   │────▶│  NotebookLM (Google)    │
│  (ou Discord)   │     │ mcp-notebooklm  │     │  API interne batchexec  │
└─────────────────┘     └─────────────────┘     └─────────────────────────┘
        │                       │                         │
        │   POST + cookies      │   HTTP + cookies        │
        └───────────────────────┴─────────────────────────┘
```

### Endpoint

| Environnement | URL |
|---------------|-----|
| Local | `http://pi6.local:5678/webhook/mcp-notebooklm` |
| Production | À définir |

### Opérations disponibles

| Operation | Description |
|-----------|-------------|
| `list_notebooks` | Liste tous les notebooks de l'utilisateur |
| `create_notebook` | Crée un nouveau notebook |
| `query` | Pose une question sur un notebook existant |

---

## Prérequis - Extraction des Cookies

### Pourquoi des cookies ?

L'API NotebookLM utilisée est **non-officielle** (reverse-engineering de l'interface web). Elle nécessite les cookies de session Google pour authentifier les requêtes.

### Procédure d'extraction (à faire par l'utilisateur)

#### Étape 1 : Se connecter à NotebookLM

1. Ouvrir **Google Chrome** (ou navigateur Chromium)
2. Aller sur https://notebooklm.google.com
3. Se connecter avec son compte Google
4. Vérifier qu'on voit bien ses notebooks

#### Étape 2 : Ouvrir les DevTools

1. Appuyer sur `F12` ou `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
2. Aller dans l'onglet **Application** (ou **Stockage**)
3. Dans le panneau de gauche, cliquer sur **Cookies** → **https://notebooklm.google.com**

#### Étape 3 : Copier les cookies nécessaires

Copier la **valeur** de chacun de ces cookies :

| Cookie | Description |
|--------|-------------|
| `SID` | Session ID principal |
| `HSID` | HTTP Session ID |
| `SSID` | Secure Session ID |
| `APISID` | API Session ID |
| `SAPISID` | Secure API Session ID |

#### Étape 4 : Formater la chaîne de cookies

Assembler les cookies au format suivant (une seule ligne) :

```
SID=valeur_SID; HSID=valeur_HSID; SSID=valeur_SSID; APISID=valeur_APISID; SAPISID=valeur_SAPISID
```

**Exemple :**
```
SID=g.a000abc123...; HSID=AeXYZ...; SSID=AbCdE...; APISID=XyZ123/AbC...; SAPISID=XyZ123/AbC...
```

### Durée de validité

| Aspect | Détail |
|--------|--------|
| Durée | ~1 à 2 semaines |
| Expiration | Les requêtes retournent erreur 401/403 |
| Renouvellement | Refaire la procédure d'extraction |

---

## Appels API

### Format général

```http
POST /webhook/mcp-notebooklm
Content-Type: application/json

{
  "operation": "<operation_name>",
  "cookies": "<cookie_string>",
  ...paramètres spécifiques
}
```

### 1. Lister les notebooks

**Requête :**
```json
{
  "operation": "list_notebooks",
  "cookies": "SID=xxx; HSID=xxx; SSID=xxx; APISID=xxx; SAPISID=xxx"
}
```

**Réponse succès :**
```json
{
  "success": true,
  "count": 3,
  "notebooks": [
    {
      "id": "abc123def456...",
      "title": "Mon projet IA",
      "created_at": "2026-03-15T10:30:00.000Z",
      "updated_at": "2026-04-01T14:22:00.000Z",
      "source_count": 5,
      "url": "https://notebooklm.google.com/notebook/abc123def456..."
    },
    {
      "id": "xyz789...",
      "title": "Recherche marketing",
      "created_at": "2026-02-20T08:00:00.000Z",
      "updated_at": "2026-03-28T16:45:00.000Z",
      "source_count": 12,
      "url": "https://notebooklm.google.com/notebook/xyz789..."
    }
  ]
}
```

### 2. Créer un notebook

**Requête :**
```json
{
  "operation": "create_notebook",
  "cookies": "SID=xxx; HSID=xxx; SSID=xxx; APISID=xxx; SAPISID=xxx",
  "title": "Mon nouveau notebook"
}
```

**Réponse succès :**
```json
{
  "success": true,
  "notebook": {
    "id": "new123abc...",
    "title": "Mon nouveau notebook",
    "url": "https://notebooklm.google.com/notebook/new123abc..."
  }
}
```

### 3. Poser une question (Query)

**Requête :**
```json
{
  "operation": "query",
  "cookies": "SID=xxx; HSID=xxx; SSID=xxx; APISID=xxx; SAPISID=xxx",
  "notebook_id": "abc123def456...",
  "question": "Quels sont les points clés du document ?"
}
```

**Réponse succès :**
```json
{
  "success": true,
  "response": {
    "answer": "Les points clés du document sont : 1) ..., 2) ..., 3) ...",
    "citations": [
      {
        "text": "Extrait du document source...",
        "source_id": "source_abc123"
      }
    ],
    "sources": []
  }
}
```

---

## Gestion des Cookies côté Frontend

### Option A : Stockage local (simple)

L'utilisateur entre ses cookies une fois, stockés en `localStorage` :

```javascript
// Sauvegarder les cookies
function saveCookies(cookieString) {
  localStorage.setItem('notebooklm_cookies', cookieString);
}

// Récupérer les cookies
function getCookies() {
  return localStorage.getItem('notebooklm_cookies') || '';
}

// Appel API avec cookies
async function listNotebooks() {
  const response = await fetch('http://pi6.local:5678/webhook/mcp-notebooklm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'list_notebooks',
      cookies: getCookies()
    })
  });
  return response.json();
}
```

### Option B : Formulaire de configuration

```html
<!-- Formulaire de configuration des cookies -->
<div id="notebooklm-config">
  <h3>Configuration NotebookLM</h3>
  <p>Collez vos cookies Google NotebookLM :</p>
  <textarea id="cookies-input" rows="3" placeholder="SID=xxx; HSID=xxx; ..."></textarea>
  <button onclick="saveCookies(document.getElementById('cookies-input').value)">
    Sauvegarder
  </button>
  <p id="status"></p>
</div>

<script>
async function testConnection() {
  const result = await listNotebooks();
  document.getElementById('status').textContent =
    result.success ? `✅ Connecté - ${result.count} notebooks` : `❌ Erreur: ${result.error}`;
}
</script>
```

### Option C : Variable d'environnement (backend)

Si les cookies sont partagés pour tous les utilisateurs (compte service) :

```bash
# .env.local
NOTEBOOKLM_COOKIES="SID=xxx; HSID=xxx; SSID=xxx; APISID=xxx; SAPISID=xxx"
```

Le workflow n8n utilisera `$env.NOTEBOOKLM_COOKIES` si aucun cookie n'est passé dans la requête.

---

## Codes d'erreur

### Erreurs côté n8n

| Code | Cause | Solution |
|------|-------|----------|
| 400 | Operation inconnue | Vérifier le champ `operation` |
| 500 | Erreur interne n8n | Consulter les logs n8n |

### Erreurs côté NotebookLM (dans la réponse)

| Indicateur | Cause | Solution |
|------------|-------|----------|
| `success: false` + `error: "Unauthorized"` | Cookies expirés ou invalides | Refaire l'extraction des cookies |
| `success: false` + `error: "Not found"` | `notebook_id` invalide | Vérifier l'ID du notebook |
| `success: false` + `raw_response` | Parsing échoué | Format de réponse Google modifié |

---

## FAQ

### Q: Les cookies sont-ils sécurisés ?

Les cookies transitent via HTTPS vers n8n, puis vers Google. **Ne jamais logger les cookies en clair**. En production, utiliser des credentials n8n chiffrés.

### Q: Que faire si l'API Google change ?

L'API batchexecute est non-documentée et peut changer sans préavis. Si les requêtes échouent avec des erreurs de parsing :
1. Vérifier le repo [notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) pour les mises à jour
2. Analyser les requêtes via Chrome DevTools (Network) sur notebooklm.google.com
3. Mettre à jour les RPC IDs et formats dans le workflow n8n

### Q: Peut-on automatiser le refresh des cookies ?

Oui, avec Playwright/Puppeteer :
1. Script qui se connecte à Google avec credentials stockés
2. Extrait les cookies automatiquement
3. Les stocke dans n8n credentials
4. Planifié via cron chaque semaine

Voir RFC-055 section 8 pour les détails.

### Q: Quelles sont les limites ?

| Limite | Valeur estimée |
|--------|----------------|
| Notebooks par compte | ~100 (tier gratuit) |
| Sources par notebook | ~50 |
| Requêtes par minute | Non documenté, ~10-20 recommandé |

---

## Checklist de mise en production

- [ ] Workflow `MCP - NotebookLM` importé et activé
- [ ] Cookies extraits et testés
- [ ] Variable d'env `NOTEBOOKLM_COOKIES` configurée (si mode partagé)
- [ ] Frontend : formulaire de configuration cookies implémenté
- [ ] Documentation transmise à l'équipe frontend
- [ ] Monitoring des erreurs mis en place

---

## Contact

- **Équipe MCP** : Gestion des workflows n8n
- **RFC** : docs/rfc/RFC-055-NOTEBOOKLM-INTEGRATION.md
- **Workflow** : workflows/MCP_-_NotebookLM.json
