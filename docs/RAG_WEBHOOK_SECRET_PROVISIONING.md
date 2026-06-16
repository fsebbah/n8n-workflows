# RAG Webhook Secret - Provisionnement (RFC-099)

## 🔐 Secret généré (pi6.local)

**Date** : 2026-06-12  
**Serveur** : pi6.local  
**Généré par** : Ops n8n  
**Méthode** : `openssl rand -base64 32`

```
N8N_RAG_WEBHOOK_SECRET=mxjn9dtD34LPyAD/Wxyjda3OoJ2olEonWpDZCTzeQ6A=
```

---

## 🔧 Génération pour d'autres serveurs

### Commande de génération

```bash
# Générer un nouveau secret (32 bytes, base64)
openssl rand -base64 32
```

### Processus pour un nouveau serveur

1. **Générer le secret** sur le serveur n8n :
   ```bash
   # Sur le serveur n8n (ex: host2.local)
   NEW_SECRET=$(openssl rand -base64 32)
   echo "N8N_RAG_WEBHOOK_SECRET=$NEW_SECRET"
   ```

2. **Ajouter à `.env.local`** (n8n) :
   ```bash
   # /path/to/n8n-workflows/.env.local
   N8N_RAG_WEBHOOK_SECRET=<secret_généré>
   ```

3. **Communiquer à MCP** via canal sécurisé (Signal, 1Password, etc.)

4. **MCP configure** leur `.env` avec :
   ```bash
   N8N_RAG_WEBHOOK_SECRET=<même_secret>
   N8N_RAG_WEBHOOK_URL=http://<serveur>:5678/webhook/rag-ingest
   ```

5. **Restart synchronisé** :
   ```bash
   # Sur serveur n8n
   pm2 restart n8n --update-env
   
   # Sur serveur MCP
   pm2 restart azy-mcp --update-env
   ```

### ⚠️ Important : Un secret par environnement

- **DEV (pi6.local)** : Secret A
- **STAGING (host2.local)** : Secret B (différent)
- **PRODUCTION** : Secret C (différent)

**Pourquoi ?** Isolation des environnements → une compromission DEV ne compromet pas PROD.

---

## 📋 Provisionnement

### ✅ Côté n8n (FAIT)

**Fichier** : `/storage6/pi6/n8n-workflows/.env.local`

```bash
# RAG Webhook HMAC Secret (RFC-099)
N8N_RAG_WEBHOOK_SECRET=mxjn9dtD34LPyAD/Wxyjda3OoJ2olEonWpDZCTzeQ6A=
```

**Restart requis** : `pm2 restart n8n --update-env`

---

### ⏳ Côté MCP (À FAIRE par équipe MCP)

**Fichier** : `azy.mcp/.env` (ou `.env.local`)

```bash
# Webhook HMAC Secret (shared with n8n for RFC-099 RAG ingestion)
N8N_RAG_WEBHOOK_SECRET=mxjn9dtD34LPyAD/Wxyjda3OoJ2olEonWpDZCTzeQ6A=

# Webhook URL (n8n endpoint) - À adapter selon le serveur
# Format: ${N8N_BASE_URL}/webhook/rag-ingest
N8N_RAG_WEBHOOK_URL=http://pi6.local:5678/webhook/rag-ingest
```

**Serveurs multiples** :
- `pi6.local` : `http://pi6.local:5678/webhook/rag-ingest`
- `host2.local` : `http://host2.local:5678/webhook/rag-ingest`
- Production : `https://n8n.azy.solutions/webhook/rag-ingest`

**Restart requis** : `pm2 restart azy-mcp --update-env`

---

## 🔄 Synchronisation déploiement

**Coordination requise** : Les 2 services doivent démarrer avec le même secret

**Plan de déploiement** :

1. ✅ **n8n** : Secret ajouté à `.env.local` (FAIT)
2. ⏳ **MCP** : Ajouter secret + URL dans leur `.env`
3. 🤝 **Coordination** : Restart simultané des 2 services
   ```bash
   # Sur pi6.local (n8n)
   pm2 restart n8n --update-env
   
   # Sur le serveur MCP
   pm2 restart azy-mcp --update-env
   ```

---

## 🧪 Test de validation

Après déploiement, tester la signature HMAC :

```bash
# Test depuis MCP vers n8n
curl -X POST http://pi6.local:5678/webhook/rag-ingest \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256={computed_hmac}" \
  -d '{"source_id":"test","tenant_id":"TEST",...}'

# Réponse attendue si HMAC valide : 202 Accepted
# Réponse attendue si HMAC invalide : 401 Unauthorized
```

---

## 🔒 Sécurité

- ⚠️ **Ne jamais committer ce fichier** dans Git (déjà dans `.gitignore`)
- ⚠️ **Transmettre le secret via canal sécurisé** (Signal, 1Password, etc.)
- ⚠️ **Rotation recommandée** : tous les 6 mois ou en cas de compromission
- ✅ **Secret distinct** : N'utilise AUCUN secret existant (isolation complète)

---

## 📞 Contact

**Équipe n8n** : Ops n8n  
**Équipe MCP** : À notifier sur issue #14 (azy.daily)  
**Issue de suivi** : https://github.com/fsebbah/azy.daily/issues/14
