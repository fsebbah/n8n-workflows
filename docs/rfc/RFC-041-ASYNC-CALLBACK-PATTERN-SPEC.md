# Spécification : Pattern Callback Asynchrone pour Webhooks n8n

**Date**: 2026-03-16
**Statut**: En cours de validation
**Auteur**: Claude Code
**Référence**: RFC-040

---

## 1. Vue d'ensemble

### 1.1 Objectif

Ajouter un mode asynchrone optionnel aux webhooks n8n qui effectuent des opérations longues (>30s). Le client peut fournir un `callback_url` pour recevoir le résultat via HTTP POST au lieu d'attendre la réponse synchrone.

### 1.2 Principes

1. **Rétrocompatibilité** : Sans `callback_url`, le comportement reste synchrone (inchangé)
2. **Sécurité** : Signature HMAC-SHA256 sur les callbacks
3. **Traçabilité** : `job_id` pour corréler requête et callback
4. **Uniformité** : Même pattern pour tous les webhooks concernés

---

## 2. Spécification Technique

### 2.1 Nouveaux paramètres d'entrée

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `callback_url` | string (URL) | Non | URL où envoyer le résultat |
| `job_id` | string | Non | Identifiant de corrélation (auto-généré si absent) |

### 2.2 Réponse immédiate (mode async)

**Code HTTP**: `202 Accepted`

```json
{
  "success": true,
  "job_id": "abc123-def456",
  "status": "processing",
  "message": "Request accepted, processing started",
  "callback_url": "https://api.example.com/callback",
  "estimated_time_seconds": 120
}
```

### 2.3 Callback de succès

**Méthode**: `POST`
**Headers**:
```
Content-Type: application/json
X-N8N-Signature: sha256=<hex_signature>
X-N8N-Job-ID: <job_id>
X-N8N-Timestamp: <unix_timestamp>
X-N8N-Event: completed
```

**Body**:
```json
{
  "success": true,
  "job_id": "abc123-def456",
  "status": "completed",
  "data": { /* résultat spécifique au webhook */ },
  "meta": {
    "execution_mode": "async",
    "processing_time_ms": 45000,
    "provider": "assemblyai|google|openai|..."
  }
}
```

### 2.4 Callback d'erreur

**Headers**:
```
X-N8N-Event: error
```

**Body**:
```json
{
  "success": false,
  "job_id": "abc123-def456",
  "status": "error",
  "error": {
    "code": "TRANSCRIPTION_ERROR",
    "message": "Detailed error message"
  },
  "meta": {
    "execution_mode": "async",
    "processing_time_ms": 5000
  }
}
```

### 2.5 Signature HMAC

```javascript
const crypto = require('crypto');
const secret = process.env.N8N_WEBHOOK_SECRET;
const timestamp = Math.floor(Date.now() / 1000);
const payload = JSON.stringify(body);
const signatureData = `${timestamp}.${payload}`;
const signature = crypto.createHmac('sha256', secret)
  .update(signatureData)
  .digest('hex');
// Header: X-N8N-Signature: sha256=<signature>
```

---

## 3. Modifications par Webhook

### 3.1 MCP - Speaker Identifier

**Fichier**: `MCP-Speaker-Identifier.json`
**Endpoint**: `POST /webhook/speaker-identifier`
**Temps estimé**: ~11 minutes (transcription audio)

#### Flux actuel (synchrone)
```
Webhook → Validate → Is Base64? → Upload/Prepare → Start Transcription
  → Poll Loop (Wait 5s → Check Status) → Format Response → Respond Success
```

#### Flux modifié

```
Webhook → Validate → Has Callback URL?
  ├─[NO]→ (flux synchrone actuel inchangé)
  └─[YES]→ Store Callback Info → Is Base64? (Async) → Upload/Prepare (Async)
           → Start Transcription (Async) → Respond Immediate (202)
           → Poll Loop (Async) → Format Response (Async)
           → Prepare Callback → HMAC Signature → Callback Success/Error
```

#### Nouveaux nodes ajoutés (23 nodes)

| Node | Type | Description |
|------|------|-------------|
| Has Callback URL? | If | Vérifie `$json.body.callback_url` |
| Store Callback Info | Code | Stocke job_id, callback_url, génère job_id si absent |
| Is Base64? (Async) | If | Branche async pour type de source |
| Prepare Base64 (Async) | Code | Prépare base64 avec callback info |
| Prepare URL (Async) | Code | Prépare URL avec callback info |
| Upload to AssemblyAI (Async) | HTTP Request | Upload pour mode async |
| Merge Upload Result (Async) | Code | Merge avec callback info |
| Prepare Transcription Request (Async) | Code | Prépare requête avec callback info |
| Start Transcription (Async) | HTTP Request | Démarre transcription async |
| **Respond Immediate** | RespondToWebhook | **Répond 202 Accepted** |
| Store Transcript ID (Async) | Code | Stocke ID avec callback info |
| Poll Status (Async) | HTTP Request | Polling async |
| Is Completed? (Async) | If | Vérifie completion |
| Is Error? (Async) | If | Vérifie erreur |
| Prepare Next Poll (Async) | Code | Prépare prochain poll |
| Wait 5s (Async) | Wait | Attente entre polls |
| Format Response (Async) | Code | Formate avec execution_mode: async |
| Prepare Callback Payload | Code | Prépare body du callback |
| Compute HMAC Signature | Code | Calcule signature HMAC-SHA256 |
| **Callback Success** | HTTP Request | **POST vers callback_url** |
| Prepare Error Callback | Code | Prépare erreur pour callback |
| Compute HMAC Error | Code | HMAC pour callback erreur |
| **Callback Error** | HTTP Request | **POST erreur vers callback_url** |

#### Exemple de requête async

```bash
curl -X POST https://n8n.example.com/webhook/speaker-identifier \
  -H "Content-Type: application/json" \
  -d '{
    "data": "https://example.com/audio.mp3",
    "assemblyai_api_key": "xxx",
    "callback_url": "https://api.myapp.com/webhooks/transcription",
    "job_id": "custom-job-123",
    "options": {
      "speakers_expected": 2,
      "language": "auto"
    }
  }'
```

#### Réponse immédiate

```json
{
  "success": true,
  "job_id": "custom-job-123",
  "status": "processing",
  "message": "Transcription started, result will be sent to callback_url",
  "callback_url": "https://api.myapp.com/webhooks/transcription"
}
```

---

### 3.2 MCP Veo Video (À MODIFIER)

**Fichier**: `MCP-Veo-Video.json`
**Endpoint**: `POST /webhook/veo-video`
**Temps estimé**: ~2 minutes (génération vidéo)

#### Flux actuel (synchrone)
```
Webhook → Has required input? → Prepare Config → Optimize Prompt?
  ├─[YES]→ Optimize Prompt → Format Optimize Response → Respond Success
  └─[NO]→ Veo Video → Format Response → Respond Success
```

#### Flux modifié proposé

```
Webhook → Has required input? → Has Callback URL?
  ├─[NO]→ (flux synchrone actuel inchangé)
  └─[YES]→ Store Callback Info → Prepare Config (Async)
           → Optimize Prompt? (Async)
             ├─[YES]→ Optimize Prompt (Async) → Format Optimize (Async)
             └─[NO]→ Veo Video (Async) → Format Response (Async)
           → Respond Immediate (202)
           → Prepare Callback → HMAC → Callback Success
```

#### Nouveaux nodes à ajouter

| Node | Type | Description |
|------|------|-------------|
| Has Callback URL? | If | Vérifie callback_url |
| Store Callback Info | Code | Stocke job_id, callback_url |
| Respond Immediate | RespondToWebhook | Répond 202 |
| Prepare Callback Payload | Code | Prépare callback body |
| Compute HMAC Signature | Code | Signature HMAC |
| Callback Success | HTTP Request | POST callback |
| Callback Error | HTTP Request | POST erreur |

---

### 3.3 MCP - Transcriber (À MODIFIER)

**Fichier**: `MCP-Transcriber.json`
**Endpoint**: `POST /webhook/transcriber`
**Temps estimé**: ~1.5 minutes

#### Modifications similaires à MCP Veo Video

---

### 3.4 Recipes - YouTube (À MODIFIER)

**Fichier**: `Recipes-YouTube.json`
**Endpoint**: `POST /webhook/recipes-youtube`
**Temps estimé**: ~1.5 minutes (transcription YouTube + extraction LLM)

#### Modifications similaires

---

### 3.5 Document Translate Worker (À MODIFIER)

**Fichier**: `Document-Translate-Worker.json`
**Endpoint**: `POST /webhook/document-translate-worker`
**Temps estimé**: ~1.5 minutes (loop pages + LLM)

#### Spécificité
- Contient une boucle `Loop Pages` avec appels LLM
- La réponse immédiate doit inclure le nombre de pages à traiter

---

### 3.6 MCP - PDF Layout Translator (À MODIFIER)

**Fichier**: `MCP-PDF-Layout-Translator.json`
**Endpoint**: `POST /webhook/pdf-layout-translator`
**Temps estimé**: ~40s

#### Modifications similaires (priorité plus basse)

---

## 4. Variables d'environnement requises

```bash
# Secret pour signature HMAC des callbacks
N8N_WEBHOOK_SECRET=<random-secret-256-bits>
```

---

## 5. Validation côté client

### 5.1 Vérification de la signature

```python
import hmac
import hashlib
import time

def verify_callback(request, secret):
    signature = request.headers.get('X-N8N-Signature', '')
    timestamp = request.headers.get('X-N8N-Timestamp', '')
    body = request.body

    # Vérifier que le timestamp n'est pas trop ancien (5 min)
    if abs(time.time() - int(timestamp)) > 300:
        return False

    # Calculer la signature attendue
    signature_data = f"{timestamp}.{body}"
    expected = hmac.new(
        secret.encode(),
        signature_data.encode(),
        hashlib.sha256
    ).hexdigest()

    # Comparer
    return hmac.compare_digest(f"sha256={expected}", signature)
```

---

## 6. Checklist de validation

### Pour chaque webhook modifié :

- [ ] Rétrocompatibilité testée (sans callback_url)
- [ ] Réponse 202 correcte avec job_id
- [ ] Callback de succès reçu
- [ ] Callback d'erreur reçu
- [ ] Signature HMAC valide
- [ ] job_id cohérent entre requête et callback
- [ ] Timestamp présent dans les headers
- [ ] Documentation API mise à jour (sticky note)

---

## 7. Questions pour l'équipe MCP

1. **Secret partagé** : Utiliser `N8N_WEBHOOK_SECRET` ou un secret par projet ?
2. **Timeout callback** : Quelle durée max pour le POST callback ? (proposé: 30s)
3. **Retry callback** : Faut-il réessayer si le callback échoue ? Combien de fois ?
4. **Format job_id** : UUID v4 ou format personnalisé ?
5. **Rate limiting** : Limiter le nombre de jobs async simultanés par projet ?

---

## 8. Prochaines étapes

1. ✅ MCP - Speaker Identifier (modifié)
2. ⏳ MCP Veo Video (en attente validation)
3. ⏳ MCP - Transcriber
4. ⏳ Recipes - YouTube
5. ⏳ Document Translate Worker
6. ⏳ MCP - PDF Layout Translator

---

## 9. Analyse MCP Team

> **Date**: 2026-03-16
> **Auteur**: MCP Team (Claude Code)
> **Statut**: Revue pour API Backend

### 9.1 Contexte

RFC-040 (Training Dataset API) a déjà implémenté un pattern callback pour la génération de datasets. Cette implémentation est **en production** (PR #641 merged). L'équipe n8n doit s'aligner sur ce qui existe.

### 9.2 Comparaison RFC-040 vs RFC-041

| Aspect | RFC-040 (Implémenté) | RFC-041 (Proposé) | Décision |
|--------|---------------------|-------------------|----------|
| Signature format | `<hex>` | `sha256=<hex>` | **Garder RFC-040** |
| Signature data | `body` | `timestamp.body` | **Garder RFC-040** (plus simple) |
| Header signature | `X-N8N-Signature` | `X-N8N-Signature` | ✅ Identique |
| Header timestamp | Non | `X-N8N-Timestamp` | **Optionnel** - peut être ajouté |
| Header job_id | Non | `X-N8N-Job-ID` | **Non** - redondant avec body |
| Header event | Non | `X-N8N-Event` | **Non** - `success` field suffit |
| HTTP code async | `202 Accepted` | `202 Accepted` | ✅ Identique |

### 9.3 Implémentation existante (RFC-040)

**Fichiers déjà créés:**

| Fichier | Description |
|---------|-------------|
| `config/hmac_secrets.example.env` | Template secret HMAC |
| `scripts/training/test_dataset_generator.py` | Client test avec mode callback |
| `scripts/training/mock_n8n_callback.py` | Mock server n8n pour tests |
| `docs/rfc/RFC-040-TRAINING-DATASET-API.md` | Spécification complète |

**Signature HMAC implémentée:**

```python
# Vérification côté backend (RFC-040)
def verify_n8n_signature(signature: str, body: bytes, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

```javascript
// Génération côté n8n (RFC-040)
const signature = crypto.createHmac('sha256', secret)
  .update(body)
  .digest('hex');
// Header: X-N8N-Signature: <signature>
```

### 9.4 Réponses aux questions (Section 7)

| # | Question | Réponse MCP Team |
|---|----------|------------------|
| 1 | Secret partagé ou par projet ? | **Partagé** - `N8N_WEBHOOK_SECRET` unique, déjà configuré |
| 2 | Timeout callback ? | **30s** - Acceptable |
| 3 | Retry callback ? | **3 retries** avec backoff (1s, 5s, 30s) |
| 4 | Format job_id ? | **ULID** - Format `dsjob_01HQXYZ...` déjà utilisé |
| 5 | Rate limiting ? | **3 jobs simultanés** par tenant (déjà dans RFC-040) |

### 9.5 Actions requises

#### Pour l'équipe n8n (alignement sur RFC-040)

1. **Signature HMAC** - Utiliser le format simple:
   ```javascript
   // ✅ Correct (RFC-040)
   const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
   headers['X-N8N-Signature'] = signature;

   // ❌ Ne pas utiliser (RFC-041 proposé)
   // headers['X-N8N-Signature'] = `sha256=${signature}`;
   ```

2. **Headers** - Garder uniquement:
   - `Content-Type: application/json`
   - `X-N8N-Signature: <hex>`

3. **Callback body** - Format RFC-040:
   ```json
   {
     "success": true,
     "job_id": "...",
     "dataset": { ... },
     "csv_content_base64": "..."
   }
   ```

#### Pour l'équipe API Backend

1. **Endpoint callback** déjà spécifié: `POST /api/v1/training/dataset/job/{job_id}/complete`
2. **Vérification HMAC** - Code fourni dans RFC-040 section "Sécurité"
3. **Rate limiting** - 3 jobs simultanés par tenant

### 9.6 Tests disponibles

```bash
# Lancer le mock n8n (simule le callback)
python scripts/training/mock_n8n_callback.py --port 8765 --hmac-secret $N8N_WEBHOOK_SECRET

# Tester le client avec callback mode
python scripts/training/test_dataset_generator.py --callback-mode --domain shopping --hmac-secret $N8N_WEBHOOK_SECRET
```

### 9.7 Conclusion

**RFC-041 doit s'aligner sur RFC-040**, pas l'inverse. Les différences proposées (préfixe `sha256=`, timestamp dans signature, headers additionnels) ajoutent de la complexité sans bénéfice significatif.

L'implémentation RFC-040 est:
- ✅ Plus simple
- ✅ Déjà en production
- ✅ Testée avec mock server
- ✅ Documentée
