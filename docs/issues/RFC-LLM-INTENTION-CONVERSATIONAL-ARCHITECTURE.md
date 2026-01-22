# RFC: Architecture Conversationnelle LLM-Intention

**Date**: 2026-01-22
**Statut**: Draft
**Auteurs**: Équipe n8n + Plugin Torah

---

## Contexte

L'architecture actuelle utilise plusieurs workflows séparés pour différentes tâches (traduction, OCR, résumé, etc.). Le besoin est de créer un **point d'entrée unique** (LLM-Intention) qui gère le dialogue avec les utilisateurs jusqu'à la validation d'une action concrète.

## Objectif

Transformer `MCP-LLM-Intention` en point d'entrée central du dialogue bot avec :
1. **Mode conversation** : Questions/réponses avec mémoire
2. **Mode action** : Redirection vers webhook spécifique après validation utilisateur

---

## Proposition initiale

```
User → LLM-Intention (conversation avec mémoire)
         ↓
    [Dialogue jusqu'à action validée]
         ↓
    User clique "Traduire" → Webhook document-translate-worker
```

### Points forts

| Aspect | Avantage |
|--------|----------|
| **Point d'entrée unique** | Simplifie l'architecture côté plugin - un seul endpoint |
| **Mémoire conversationnelle** | Meilleure UX - le bot comprend le contexte |
| **Validation explicite** | Pas d'actions lancées par erreur |
| **Contrôle utilisateur** | L'utilisateur décide quand agir |

### Challenges identifiés

| Challenge | Question à résoudre |
|-----------|---------------------|
| **Où stocker la mémoire ?** | Redis ? n8n staticData ? Côté plugin ? |
| **Isolation multi-users** | Clé = `{user_id}:{channel_id}` ? |
| **TTL session** | Durée de conservation du contexte ? |
| **Coût LLM** | Chaque échange = appel Claude |
| **Taille du contexte** | Historique qui grossit → tokens qui explosent |
| **Latence** | Temps de réponse acceptable ? |

---

## Contre-proposition : Architecture hybride

### Principe

- **Plugin** gère la mémoire conversationnelle
- **LLM-Intention** reste stateless, reçoit l'historique à chaque appel
- **Plugin** affiche les boutons d'action et exécute les webhooks

### Diagramme

```
┌─────────────────────────────────────────────────────────┐
│                        PLUGIN                           │
│  - Gère la mémoire conversationnelle (historique)       │
│  - Envoie l'historique à chaque appel                   │
│  - Affiche les boutons d'action                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   LLM-INTENTION                         │
│  Input: { query, history[], context, user }             │
│                                                         │
│  Output:                                                │
│  {                                                      │
│    "response_type": "message" | "action_proposal",      │
│    "message": "Vous voulez traduire ce PDF ?",          │
│    "proposed_actions": [                                │
│      { "id": "translate", "label": "Traduire",          │
│        "webhook": "document-translate-worker",          │
│        "params": { ... } }                              │
│    ]                                                    │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
   response_type:                    response_type:
   "message"                         "action_proposal"
         │                                 │
         ▼                                 ▼
   Plugin affiche                    Plugin affiche
   le message                        boutons d'action
                                           │
                                           ▼ (user clique)
                                    Plugin appelle
                                    le webhook directement
```

### Avantages

1. **Mémoire côté plugin** → n8n reste stateless (plus simple, scalable)
2. **Plugin contrôle le flow** → peut gérer timeout, reset, etc.
3. **Actions pré-formatées** → LLM propose, user valide, plugin exécute
4. **Pas de session n8n** → meilleure scalabilité

---

## Contrat d'API proposé

### Request

```json
{
  "query": "Je veux traduire ce document",
  "history": [
    { "role": "user", "content": "Bonjour" },
    { "role": "assistant", "content": "Bonjour ! Comment puis-je vous aider ?" }
  ],
  "context": {
    "type": "torah",
    "auto_web_search": false,
    "attached_file": {
      "type": "pdf",
      "name": "document.pdf",
      "size": 1024,
      "url": "https://..."
    }
  },
  "user": {
    "id": "123",
    "channel_id": "456",
    "guild_id": "789"
  },
  "plugin_context": {
    "api_keys": { "anthropic": "sk-ant-..." },
    "llm_model": "claude-3-haiku-20240307"
  }
}
```

### Response - Message simple

```json
{
  "success": true,
  "response_type": "message",
  "message": "Je vois que vous avez joint un PDF. Voulez-vous le traduire ou en faire un résumé ?",
  "proposed_actions": [
    {
      "id": "translate",
      "label": "🌐 Traduire",
      "description": "Traduire le document en français",
      "webhook": "document-translate-worker",
      "params": {
        "job_type": "pdf_translation",
        "document": { "type": "pdf", "url": "..." },
        "target_language": "fr"
      }
    },
    {
      "id": "summarize",
      "label": "📝 Résumer",
      "description": "Créer un résumé du document",
      "webhook": "document-summarize-worker",
      "params": { ... }
    }
  ],
  "requires_confirmation": true
}
```

### Response - Action confirmée

Quand l'utilisateur clique sur un bouton :

```json
{
  "success": true,
  "response_type": "action_confirmed",
  "action": {
    "id": "translate",
    "webhook": "document-translate-worker",
    "params": { ... }
  },
  "message": "Lancement de la traduction..."
}
```

---

## Répartition des responsabilités

| Responsabilité | Composant |
|----------------|-----------|
| Mémoire conversationnelle | **Plugin** (chatbot-core) |
| Analyse d'intention | **LLM-Intention** (n8n) |
| Proposition d'actions | **LLM-Intention** |
| Affichage boutons | **Plugin** (Discord UI) |
| Validation utilisateur | **Plugin** |
| Exécution action | **Worker webhooks** (n8n) |

---

## Workflows workers disponibles

| Webhook | Usage | Statut |
|---------|-------|--------|
| `/webhook/document-translate-worker` | Traduction documents multi-pages | ✅ Créé |
| `/webhook/torah-translate-page` | Traduction page Torah | ✅ Existe |
| `/webhook/torah-translate-worker` | Traduction segments Torah | ✅ Existe |
| `/webhook/pdf-extractor` | Extraction texte PDF | ✅ Existe |
| `/webhook/image-ocr` | OCR images (Mistral) | ✅ Existe |
| `/webhook/document-estimate` | Estimation coût | ⚠️ À vérifier |
| `/webhook/document-cancel` | Annulation job | ❌ À créer |
| `/webhook/user-jobs` | Liste jobs utilisateur | ❌ À créer |

---

## Endpoints manquants identifiés

| Méthode | Endpoint requis | Priorité | Commentaire |
|---------|-----------------|----------|-------------|
| `estimate_cost()` | `POST /webhook/document-estimate` | Haute | Essentiel pour afficher coût avant confirmation |
| `cancel_job()` | `POST /webhook/document-cancel` | Moyenne | Utile mais rare (jobs courts) |
| `list_jobs()` | `GET /webhook/user-jobs` | Basse | Nice-to-have |

---

## Prochaines étapes

1. [ ] Valider l'architecture avec l'équipe plugin
2. [ ] Modifier `MCP-LLM-Intention` pour supporter le nouveau format
3. [ ] Ajouter le support `history[]` dans le workflow
4. [ ] Définir le format des `proposed_actions`
5. [ ] Créer les workflows manquants (`document-estimate`, `document-cancel`)
6. [ ] Implémenter côté plugin (chatbot-core)

---

## Questions ouvertes

1. **Limite d'historique** : Combien de messages garder ? (suggestion: 10 derniers)
2. **Format des boutons Discord** : Buttons vs Select Menu ?
3. **Timeout session** : Après combien de temps reset le contexte ?
4. **Multi-langue** : Messages LLM-Intention en quelle langue ?
