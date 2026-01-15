# RFC-007b: Réponse équipe n8n - Mention Service

**Date:** 2026-01-15
**En réponse à:** RFC-007-MENTION-SERVICE.md
**Auteur:** Équipe n8n

---

## Résumé

Analyse du RFC-007 Mention Service du point de vue de l'équipe n8n. Ce document identifie les points à clarifier avant implémentation et propose un plan de travail.

---

## Évaluation globale

| Aspect | Note | Commentaire |
|--------|------|-------------|
| Clarté architecture | ✅ Excellent | Responsabilités bien définies |
| Specs chatbot-core | ✅ Excellent | Code complet, prêt à implémenter |
| Specs n8n | ⚠️ Partiel | Manque détails sur intent detection |
| Specs API | ⚠️ Partiel | Endpoint `/api/ai/chat` non spécifié |
| Extensibilité | ✅ Excellent | Protocol pattern bien pensé |

---

## Points positifs

### 1. Architecture claire

```
Discord → MentionService → n8n → API/LLM → Response
```

La séparation des responsabilités est bien définie:
- **chatbot-core**: Rate limiting, filtrage, contexte
- **n8n**: Orchestration, routing, intent detection
- **API**: Traitement LLM, logging

### 2. Rate limiting bien conçu

Configuration flexible avec:
- Sliding window
- Cooldown configurable
- Messages personnalisables
- Prévu pour Redis (v2)

### 3. Payload bien défini

Request et Response clairement spécifiés:

```json
// Request → n8n
{
  "message_id": "123456789",
  "channel_id": "987654321",
  "guild_id": "111222333",
  "user_id": "444555666",
  "content": "c'est quoi une béchamel ?",
  "username": "john_doe",
  "display_name": "John Doe",
  "is_reply": false,
  "replied_to_bot": false,
  "conversation_id": null
}

// Response ← n8n
{
  "success": true,
  "response": "La béchamel est...",
  "intent": "question",
  "confidence": 0.95,
  "embed": null
}
```

### 4. Support embeds Discord

Possibilité de retourner des embeds riches en plus du texte simple.

---

## Points à clarifier

### 1. Intent Detection - Mécanisme non spécifié

**Problème:** Le RFC dit "Déléguer à n8n" mais ne précise pas comment détecter les intents.

**Options possibles:**

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **A. Patterns/Regex** | Simple, rapide, pas de coût | Limité, maintenance |
| **B. LLM externe** | Précis, flexible | Coût, latence |
| **C. Classification locale** | Équilibre | Complexité setup |

**Question:** Quelle approche pour v1 ?

**Proposition n8n:** Option A (patterns) pour v1, avec possibilité d'évoluer vers B.

```javascript
// Exemple patterns v1
const INTENT_PATTERNS = {
  greeting: /^(bonjour|salut|hello|hey|coucou|bonsoir)/i,
  help: /^(aide|help|commandes?|comment)/i,
  empty: /^\s*$/,
  question: /.+\?$|^(c'est quoi|qu'est-ce|comment|pourquoi|où|quand|qui|quel)/i
};
```

### 2. Endpoint `/api/ai/chat` - Non documenté

**Problème:** Le RFC mentionne `POST /api/ai/chat` mais cet endpoint n'est pas spécifié.

**Questions pour l'équipe API:**

1. Cet endpoint existe-t-il déjà ?
2. Si non, quelles sont les specs attendues ?

**Proposition de specs:**

```http
POST /api/ai/chat
Content-Type: application/json
X-Project-ID: bot-appetit

{
  "message": "c'est quoi une béchamel ?",
  "user_id": "444555666",
  "context": {
    "guild_id": "111222333",
    "channel_id": "987654321"
  }
}
```

**Response attendue:**

```json
{
  "success": true,
  "response": "La béchamel est une sauce blanche...",
  "tokens_used": 150,
  "model": "gpt-4"
}
```

### 3. Réponses prédéfinies - Où sont-elles définies ?

**Problème:** Pour les intents `greeting`, `help`, `empty`, le RFC ne précise pas où stocker les réponses.

**Options:**

| Emplacement | Avantages | Inconvénients |
|-------------|-----------|---------------|
| **n8n (hardcodé)** | Simple | Pas flexible |
| **Config API** | Centralisé | Dépendance API |
| **Variables d'env** | Flexible | Limité |

**Proposition:** Hardcodé dans n8n pour v1, configurable via API pour v2.

### 4. Références incorrectes

**Ligne 838:**
```markdown
- [RFC-005: Welcome Message System](./RFC-005-WELCOME-MESSAGE.md)
```

Ce fichier n'existe pas. On a:
- `RFC-005-USER-DATA-MODEL.md`

**Action:** Corriger la référence ou créer le RFC manquant.

### 5. Scope v1 - Quels intents implémenter ?

**Problème:** Le RFC liste 6 intents mais ne précise pas le scope v1.

| Intent | Complexité | v1 ? |
|--------|------------|------|
| `question` | Haute (LLM) | ⚠️ Dépend API |
| `greeting` | Basse | ✅ Oui |
| `help` | Basse | ✅ Oui |
| `empty` | Basse | ✅ Oui |
| `unknown` | Basse | ✅ Oui (fallback) |
| `out_of_scope` | Moyenne | ❌ v2 |

**Proposition v1:** Tous sauf `out_of_scope` et `question` simplifié (si API pas prête).

### 6. Workflows n8n - Architecture

**RFC propose 3 workflows:**
```
MENTION---On-Mention-Handler
MENTION---Process-Question
MENTION---Format-Response
```

**Proposition n8n:** Un seul workflow pour v1.

**Justification:**
- Moins de complexité
- Pas de dépendances inter-workflows
- Plus facile à débugger
- Peut être splitté en v2 si nécessaire

---

## Plan de travail n8n

### Workflow: `MENTION---Handler`

```
┌─────────────────┐
│ Webhook Trigger │  POST /mention
│                 │  Body: MentionContext payload
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Input  │  Vérifier champs requis
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Detect Intent   │  Patterns/Regex v1
│                 │  → greeting, help, empty, question, unknown
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Switch Intent   │
└────────┬────────┘
         │
    ┌────┼────┬────────┬──────────┐
    │    │    │        │          │
    ▼    ▼    ▼        ▼          ▼
greeting help empty question  unknown
    │    │    │        │          │
    ▼    ▼    ▼        ▼          ▼
┌────────────────────────────────────┐
│ Format Response (MentionResult)    │
└────────────────┬───────────────────┘
                 │
                 ▼
┌─────────────────┐
│ Respond Webhook │  200 OK
└─────────────────┘
```

### Nodes détaillés

| Node | Type | Description |
|------|------|-------------|
| Webhook Trigger | Webhook | `POST /mention` |
| Validate Input | Code | Valider payload |
| Detect Intent | Code | Patterns matching |
| Switch Intent | Switch | Router par intent |
| Handle Greeting | Set | Réponse "Bonjour !" |
| Handle Help | Set | Liste commandes |
| Handle Empty | Set | Guide d'utilisation |
| Handle Question | HTTP Request | `POST /api/ai/chat` |
| Handle Unknown | Set | Fallback générique |
| Format Response | Code | Construire MentionResult |
| Respond | Respond Webhook | Retourner résultat |

### Réponses prédéfinies v1

```javascript
const RESPONSES = {
  greeting: {
    response: "Bonjour ! Comment puis-je t'aider ? Pose-moi une question ou tape /help pour voir les commandes disponibles.",
    intent: "greeting",
    confidence: 1.0
  },
  help: {
    response: "Voici ce que je peux faire :\n" +
              "• Réponds à tes questions culinaires\n" +
              "• `/recette [nom]` - Chercher une recette\n" +
              "• `/liste` - Voir ta liste de courses\n" +
              "• `/panier` - Gérer ton panier",
    intent: "help",
    confidence: 1.0
  },
  empty: {
    response: "Tu m'as mentionné mais sans message ! Pose-moi une question ou tape /help.",
    intent: "empty",
    confidence: 1.0
  },
  unknown: {
    response: "Je n'ai pas bien compris ta demande. Peux-tu reformuler ou taper /help ?",
    intent: "unknown",
    confidence: 0.5
  }
};
```

---

## Dépendances

### Bloquant pour n8n

| Dépendance | Équipe | Status | Impact |
|------------|--------|--------|--------|
| `POST /api/ai/chat` | API | ❓ À confirmer | Intent `question` |
| Specs réponses | Tous | ❓ À valider | Contenu réponses |

### Non bloquant

| Item | Équipe | Note |
|------|--------|------|
| MentionService | chatbot-core | Peut avancer en parallèle |
| Config plugin | Plugin | Après chatbot-core |

---

## Questions pour les équipes

### Équipe API

1. **L'endpoint `POST /api/ai/chat` existe-t-il ?**
   - Si oui, quelles sont les specs ?
   - Si non, qui l'implémente et quand ?

2. **Faut-il logger les mentions ?**
   - `POST /api/mention/log` est-il prioritaire pour v1 ?

### Équipe chatbot-core

1. **Intent detection côté framework ?**
   - Le RFC dit "déléguer à n8n" - confirmé ?
   - Ou préférez-vous une pré-classification locale ?

2. **Typing indicator timing ?**
   - Activer avant ou après le rate limit check ?

### Équipe Plugin

1. **Réponses personnalisées ?**
   - Le plugin doit-il pouvoir override les réponses par défaut ?
   - Si oui, via config ou handler custom ?

---

## Proposition de planning

```
Semaine 1:
├── [API] Confirmer/créer POST /api/ai/chat
├── [chatbot-core] Implémenter MentionService (sans LLM)
└── [n8n] Créer workflow MENTION---Handler (patterns only)

Semaine 2:
├── [API] Endpoint prêt
├── [n8n] Intégrer POST /api/ai/chat
└── [chatbot-core] Tests intégration

Semaine 3:
├── [Plugin] Configuration MentionService
├── [Tous] Tests end-to-end
└── [Tous] Documentation
```

---

## Checklist avant implémentation

### n8n

- [ ] Confirmation specs `/api/ai/chat`
- [ ] Validation patterns intent detection
- [ ] Accord sur réponses prédéfinies
- [ ] Clarification scope v1 (avec/sans LLM)

### API

- [ ] Specs `POST /api/ai/chat`
- [ ] Décision sur `POST /api/mention/log` (v1 ou v2?)

### chatbot-core

- [ ] Confirmation: intent detection = n8n only
- [ ] Review code MentionService

---

## Conclusion

Le RFC-007 est bien structuré mais nécessite des clarifications sur:

1. **Mécanisme intent detection** → Proposition: patterns v1
2. **Endpoint `/api/ai/chat`** → À spécifier par équipe API
3. **Réponses prédéfinies** → À valider par tous
4. **Scope v1** → Proposition: tous intents sauf `out_of_scope`

**Prêt à démarrer** dès que les dépendances API sont clarifiées.

---

## Historique

| Date | Auteur | Modification |
|------|--------|--------------|
| 2026-01-15 | Équipe n8n | Création du document de réponse |
