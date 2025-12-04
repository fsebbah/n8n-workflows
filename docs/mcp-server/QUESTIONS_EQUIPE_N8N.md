# Questions de l'Équipe n8n pour l'Équipe MCP Server

**Date:** 2025-12-04
**De:** Équipe n8n-workflows
**Pour:** Équipe MCP Server

---

## Questions Techniques

### 1. Format du token OAuth

Le token est-il toujours dans le champ `access_token` du body ?

```json
{
  "access_token": "ya29.xxx",  // ← Toujours ce nom de champ ?
  "user_id": "user_123"
}
```

Ou peut-il être dans un header `Authorization` ?

**Réponse MCP Server :**
> ✅ **Oui, toujours dans le body** avec le champ `access_token`.
>
> Nous n'utiliserons PAS le header `Authorization` car :
> 1. Le header serait celui de l'API n8n (si protégée), pas celui de Google
> 2. Le body permet de passer plusieurs tokens si besoin (ex: refresh_token)
>
> Format garanti :
> ```json
> {
>   "access_token": "ya29.xxx",
>   "user_id": "user_123",
>   "tenant_id": "tenant_xxx"  // optionnel
> }
> ```

---

### 2. Gestion des erreurs token

Que doit retourner n8n si le token est invalide/expiré ?

```json
// Option A - Code HTTP 401
HTTP 401 Unauthorized
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Token invalide ou expiré"
  }
}

// Option B - Code HTTP 200 avec erreur dans body
HTTP 200 OK
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "..."
  }
}
```

Quelle option préférez-vous ?

**Réponse MCP Server :**
> ✅ **Option B - HTTP 200 avec erreur dans body**
>
> Raisons :
> 1. Le webhook n8n a bien fonctionné (donc pas d'erreur HTTP n8n)
> 2. L'erreur vient de l'API Google, pas de n8n
> 3. Facilite le parsing côté MCP (toujours du JSON valide)
>
> Format attendu pour les erreurs :
> ```json
> {
>   "success": false,
>   "error": {
>     "code": "TOKEN_EXPIRED",      // ou "TOKEN_INVALID", "GMAIL_API_ERROR", etc.
>     "message": "Token expiré ou révoqué",
>     "details": "..."              // optionnel, pour debug
>   }
> }
> ```
>
> Codes d'erreur suggérés :
> - `TOKEN_EXPIRED` : Token expiré
> - `TOKEN_INVALID` : Token malformé ou révoqué
> - `GMAIL_API_ERROR` : Erreur API Gmail
> - `RATE_LIMIT` : Quota dépassé
> - `WORKFLOW_ERROR` : Erreur interne n8n

---

### 3. Timeout des workflows

Quel est le timeout max côté MCP Server pour les appels webhook ?

- 30 secondes ?
- 60 secondes ?
- Plus ?

Cela impacte les workflows longs (ex: analyse de 100+ emails).

**Réponse MCP Server :**
> ✅ **60 secondes par défaut, configurable jusqu'à 600 secondes (10 min)**
>
> Configuration dans N8nClient :
> ```python
> N8N_WEBHOOK_TIMEOUT=60  # défaut
> N8N_WEBHOOK_TIMEOUT=300 # pour workflows longs
> ```
>
> **Recommandation** : Si un workflow risque de dépasser 60s (ex: 100+ emails) :
> 1. Limiter le nombre d'items traités (max 50 emails)
> 2. Ou utiliser la pagination (traiter par lots)
> 3. Ou nous prévenir pour augmenter le timeout
>
> Note : Celery a un timeout de 3600s (1h), donc côté MCP on peut monter si besoin.

---

### 4. Authentification des webhooks

Les webhooks n8n doivent-ils être protégés ? Si oui, comment ?

- Header `X-API-Key` ?
- IP whitelist ?
- Autre ?

Actuellement nos webhooks sont publics.

**Réponse MCP Server :**
> ✅ **Pour la phase de test : webhooks publics OK**
>
> Pour la production, deux options :
>
> **Option 1 (Recommandée) : Header `X-MCP-API-Key`**
> ```
> Headers envoyés par MCP :
> X-MCP-API-Key: <secret_partagé>
> X-MCP-Request-ID: <uuid>
> ```
> n8n vérifie ce header dans un node Code au début du workflow.
>
> **Option 2 : IP Whitelist**
> Autoriser uniquement les IPs des serveurs MCP.
>
> **Pour le moment** : On reste en webhooks publics pour simplifier les tests.
> On sécurisera avant la mise en production.

---

### 5. Environnement de test

Avez-vous un environnement de staging pour tester l'intégration ?

- URL MCP Server staging ?
- Tokens de test disponibles ?

Réponse apportée :
=> On fera tout en direct. Quand tout sera ok, on montera un environnement staging

---

### 6. Priorité des workflows

La liste mentionne 85 tools. Confirmez-vous cet ordre de priorité ?

| Phase | Workflows | Priorité |
|-------|-----------|----------|
| 1 | Test Echo | 🔴 Immédiat |
| 2 | Gmail (5 workflows) | 🔴 Haute |
| 3 | Drive (5 workflows) | 🟡 Moyenne |
| 4 | Calendar (5 workflows) | 🟡 Moyenne |
| 5 | Autres (70 workflows) | 🟢 Basse |

Réponse apportée :
=> Priorité est donnée au workflows google service

---

### 7. Node OpenAI/Claude pour résumé

Pour le workflow "Gmail Analyze Daily", qui fournit la clé API pour le LLM ?

- Option A : n8n a ses propres credentials OpenAI/Claude
- Option B : MCP Server envoie la clé dans le body
- Option C : Le résumé est fait côté MCP Server (n8n retourne juste les emails bruts)

Réponse apportée à compléter:
Option A semble la plus appropriée.

**Réponse MCP Server :**
> ✅ **Option A confirmée : n8n gère ses propres credentials LLM**
>
> Raisons :
> 1. n8n a déjà les nodes OpenAI/Anthropic natifs
> 2. Évite de faire transiter les clés API dans les appels
> 3. Simplifie l'architecture (n8n est autonome pour le résumé)
>
> Configuration n8n :
> - Créer credential "OpenAI" ou "Anthropic" dans n8n
> - Utiliser le node correspondant dans le workflow
>
> Le MCP Server n'enverra PAS de clé API LLM dans le body.


---

### 8. Logs et monitoring

Comment suivre les exécutions ?

- n8n expose son historique d'exécution
- Faut-il envoyer des métriques à votre système ?

**Réponse MCP Server :**
> ✅ **Pour le moment : l'historique n8n suffit**
>
> n8n conserve l'historique des exécutions, c'est suffisant pour la phase de test.
>
> Ce qu'on attend dans la réponse pour le monitoring :
> ```json
> {
>   "success": true,
>   "data": {...},
>   "execution_time_ms": 2345  // ← Temps d'exécution du workflow
> }
> ```
>
> En production, on pourra discuter de :
> - Envoi de métriques vers notre Prometheus/Grafana
> - Logs structurés avec correlation ID (`X-MCP-Request-ID`)

---

## Questions Fonctionnelles

### 9. Limite d'emails

Pour "Gmail Analyze Daily", y a-t-il une limite d'emails à traiter ?

- Max 50 ?
- Max 100 ?
- Pas de limite ?

**Réponse MCP Server :**
> ✅ **Max 50 emails par défaut**
>
> Le paramètre `max_results` sera envoyé dans le body :
> ```json
> {
>   "access_token": "ya29.xxx",
>   "date_filter": "today",
>   "max_results": 50  // ← Limite
> }
> ```
>
> Raisons :
> 1. Évite les timeouts (50 emails ≈ 10-15s de traitement)
> 2. Limite raisonnable pour un résumé quotidien
> 3. Si l'utilisateur veut plus, il peut demander "les 100 derniers emails"
>
> Note : Le LLM a aussi une limite de contexte (~128K tokens pour GPT-4)

---

### 10. Timezone

Le timezone est passé dans le body (`Europe/Paris`). Devons-nous l'utiliser pour :

- Calculer "aujourd'hui" ?
- Formater les dates dans la réponse ?
- Les deux ?

Réponse apportée à compléter :
La gestion des timzones est importante. C'est un point à creuser;

**Réponse MCP Server :**
> ✅ **Utiliser le timezone pour les deux**
>
> 1. **Calculer "aujourd'hui"** : Oui, essentiel
>    - Un utilisateur à Paris à 1h du matin veut les emails du 4 décembre (heure Paris)
>    - Pas ceux du 3 décembre (UTC)
>
> 2. **Formater les dates** : Oui, pour le confort utilisateur
>    - Afficher "Reçu à 14:30" (heure locale), pas "13:30 UTC"
>
> Format envoyé :
> ```json
> {
>   "timezone": "Europe/Paris",  // Format IANA
>   "date_filter": "today"       // ou "yesterday", "last_7_days"
> }
> ```
>
> Côté n8n, utiliser `luxon` ou `moment-timezone` pour les conversions.

---

## Informations Manquantes

### 11. URL du webhook n8n

Confirmez l'URL de base pour les webhooks :

```
http://pi6.local:5678/webhook/{service}/{action}
```

Ou autre format ?

Réponse apportée à compléter:
=> Oui ça semble correcte

**Réponse MCP Server :**
> ✅ **Confirmé : `http://pi6.local:5678/webhook/{service}/{action}`**
>
> Exemples :
> - `http://pi6.local:5678/webhook/test/echo`
> - `http://pi6.local:5678/webhook/gmail/read-email`
> - `http://pi6.local:5678/webhook/gmail/analyze-daily`
> - `http://pi6.local:5678/webhook/drive/list-files`
>
> Configuration côté MCP :
> ```python
> N8N_BASE_URL=http://pi6.local:5678
> ```
>
> Note : En production, ce sera probablement `https://n8n.azy.com`

---

### 12. Format des réponses paginées

Pour les endpoints qui retournent beaucoup de données (ex: list 100 emails),
doit-on paginer la réponse ?

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "total_pages": 5,
    "next_cursor": "xxx"
  }
}
```

Ou tout retourner d'un coup ?

**Réponse MCP Server :**
> ✅ **Pas de pagination pour le moment - Tout retourner d'un coup**
>
> Raisons :
> 1. On limite à 50 items max (cf. question 9)
> 2. Simplifie l'implémentation initiale
> 3. Le MCP Server n'a pas la logique pour gérer les cursors
>
> Format simple attendu :
> ```json
> {
>   "success": true,
>   "data": {
>     "emails": [...],  // Max 50 items
>     "count": 45
>   }
> }
> ```
>
> Si besoin de pagination plus tard, on ajoutera le support côté MCP.

---

## Prochaines Étapes (côté n8n)

Une fois ces questions clarifiées, nous commencerons par :

1. ✅ Workflow **Test Echo** - Validation communication
2. 🔜 Workflow **Gmail Analyze Daily** - Premier use case réel
3. 🔜 Documentation des inputs/outputs

---

**Merci de vos retours !**

Équipe n8n-workflows
