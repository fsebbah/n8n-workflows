# Spec n8n : Webhook Lichess OAuth Callback

**Date:** 2026-03-13
**Priorité:** Haute
**Équipe:** n8n

---

## Objectif

Créer un webhook qui reçoit le callback OAuth de Lichess et affiche une page de confirmation à l'utilisateur.

---

## Endpoint

| Paramètre | Valeur |
|-----------|--------|
| **URL** | `https://lichess.azy.solutions/webhook/lichess-webhook` |
| **Méthode** | `GET` |
| **Content-Type réponse** | `text/html` |

---

## Flow complet

```
1. Utilisateur tape /lichess connect sur Discord
2. Bot génère URL: https://lichess.org/oauth?client_id=...&redirect_uri=...&state=...
3. Utilisateur clique et autorise sur Lichess
4. Lichess redirige vers: https://lichess.azy.solutions/webhook/lichess-webhook?code=xxx&state=yyy
5. n8n reçoit la requête et affiche la page de confirmation
6. Utilisateur ferme la page et retourne sur Discord
```

---

## Entrée (Query Parameters)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `code` | string | Code d'autorisation Lichess |
| `state` | string | État OAuth (contient user_id encodé) |

Exemple de requête reçue :
```
GET /webhook/lichess-webhook?code=lip_abc123xyz&state=eyJ1c2VyX2lkIjoiMTIzNDU2Nzg5In0
```

---

## Sortie (Page HTML)

Le webhook doit retourner cette page HTML :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lichess - Connexion réussie</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
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
      max-width: 500px;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 16px;
    }
    p {
      color: rgba(255,255,255,0.8);
      line-height: 1.6;
      margin-bottom: 12px;
    }
    .url-box {
      background: rgba(0,0,0,0.3);
      padding: 12px;
      border-radius: 8px;
      margin: 16px 0;
      word-break: break-all;
      font-family: monospace;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }
    .copy-btn {
      display: inline-block;
      margin-top: 12px;
      padding: 10px 20px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .copy-btn:hover {
      background: #45a049;
    }
    .instructions {
      background: rgba(88, 101, 242, 0.2);
      padding: 16px;
      border-radius: 8px;
      margin-top: 20px;
      text-align: left;
    }
    .instructions ol {
      margin-left: 20px;
      color: rgba(255,255,255,0.9);
    }
    .instructions li {
      margin: 8px 0;
    }
    code {
      background: rgba(0,0,0,0.3);
      padding: 2px 6px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>Autorisation Lichess réussie !</h1>
    <p>Dernière étape : copie l'URL ci-dessous et colle-la sur Discord.</p>

    <div class="url-box" id="urlBox">{{ $json.query.fullUrl }}</div>
    <button class="copy-btn" onclick="copyUrl()">📋 Copier l'URL</button>

    <div class="instructions">
      <strong>Instructions :</strong>
      <ol>
        <li>Clique sur "Copier l'URL"</li>
        <li>Retourne sur Discord</li>
        <li>Tape <code>/lichess callback</code></li>
        <li>Colle l'URL dans le champ</li>
      </ol>
    </div>
  </div>

  <script>
    // Récupérer l'URL complète
    const fullUrl = window.location.href;
    document.getElementById('urlBox').textContent = fullUrl;

    function copyUrl() {
      navigator.clipboard.writeText(fullUrl).then(() => {
        document.querySelector('.copy-btn').textContent = '✅ Copié !';
        setTimeout(() => {
          document.querySelector('.copy-btn').textContent = '📋 Copier l\'URL';
        }, 2000);
      });
    }
  </script>
</body>
</html>
```

---

## Action backend (Phase 2 - optionnel)

Pour une intégration complète, le webhook devrait aussi :

1. Décoder le `state` pour récupérer le `user_id`
2. Appeler le backend pour échanger le `code` contre un token
3. Stocker le token OAuth

**Endpoint backend à appeler :**
```
POST /api/n8n/oauth/lichess/callback
Headers:
  X-Tenant-ID: chess_plugin
Body:
{
  "code": "lip_abc123xyz",
  "state": "eyJ1c2VyX2lkIjoiMTIzNDU2Nzg5In0"
}
```

Mais pour la v1, on peut juste afficher la page de confirmation.

---

## Gestion d'erreur

Si `code` ou `state` est manquant, afficher :

```html
<div class="container">
  <div class="icon">❌</div>
  <h1>Erreur de connexion</h1>
  <p>La connexion Lichess a échoué.</p>
  <p>Retourne sur Discord et réessaie /lichess connect</p>
</div>
```

---

## Test

1. Accéder directement à l'URL avec des params de test :
   ```
   https://lichess.azy.solutions/webhook/lichess-webhook?code=test123&state=test456
   ```
2. Vérifier que la page HTML s'affiche correctement

---

## Questions

- [ ] Le domaine `lichess.azy.solutions` est-il configuré pour pointer vers n8n ? => Oui
- [ ] Faut-il un certificat SSL pour ce sous-domaine ? => Il va ête mis en place donc l'adresse sera https

Voir ce qui avait été fait pour STRIPE

