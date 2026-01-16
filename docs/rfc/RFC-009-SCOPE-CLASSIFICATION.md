# RFC-009: Scope Classification pour Mention Service

**Status:** Draft
**Date:** 2026-01-16
**Author:** Équipe n8n
**Version:** 2.0.0

---

## Résumé

Ajout d'un système de classification de scope pour déterminer si une question utilisateur est dans le domaine du bot (in_scope) ou hors domaine (out_of_scope). Cette fonctionnalité permet à chaque plugin de définir son périmètre de compétence.

**Important:** Le workflow `LLM - Web Search` dispose déjà d'un mécanisme de vérification de contexte (`allowed_context`). Cette RFC vise à l'exploiter avec une approche flexible basée sur un prompt complet.

---

## Problème

Actuellement, quand un utilisateur pose une question à un bot via @mention :

1. Le bot ne sait pas si la question est dans son domaine
2. Il appelle systématiquement le LLM, même pour des questions hors sujet
3. La réponse peut être incohérente ("Je ne sais pas" vs "Je suis spécialisé en...")

**Exemple concret:**
- Bot Appetit (cuisine) reçoit "Quelle est la capitale de la France ?"
- Comportement actuel : Appelle le LLM → réponse aléatoire
- Comportement souhaité : Détecte hors-scope → "Je suis un assistant culinaire, je ne peux pas répondre à cette question"

---

## Solution : Approche scope_prompt

### Pourquoi scope_prompt ?

Au lieu de 2 champs séparés (`scope` + `scope_description`), on utilise un prompt complet que le plugin contrôle entièrement.

**Avantages:**
- Le plugin connaît mieux son contexte et peut inclure des nuances spécifiques
- Évolution sans changement n8n (le plugin peut améliorer son prompt)
- Gestion du refus incluse ("refuse poliment")
- Un seul champ pour la classification

### Nouveaux champs

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `scope_prompt` | TEXT | Non | Prompt complet pour la classification LLM |
| `out_of_scope_message` | TEXT | Non | Message affiché à l'utilisateur si hors-scope |

### Exemple Bot Appetit

```json
{
  "scope_prompt": "Tu es un assistant culinaire spécialisé en cuisine française et internationale. Tu peux répondre aux questions sur: les recettes, les ingrédients, les techniques de cuisine, les ustensiles, les menus et les régimes alimentaires. Si la question est hors de ce domaine, refuse poliment.",
  "out_of_scope_message": "Je suis spécialisé en cuisine ! Pose-moi des questions sur les recettes, les ingrédients ou les techniques culinaires."
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          MENTION---Process-Question                              │
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Detect       │    │ Get Branding │    │ Build LLM    │    │ Call LLM     │   │
│  │ Intent       │───►│(scope_prompt)│───►│ Request      │───►│ Web Search   │   │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘   │
│                                                                      │           │
│                                                         ┌────────────┴──────┐   │
│                                                         ▼                   ▼   │
│                                                  ┌────────────┐     ┌──────────┐│
│                                                  │ Success    │     │ Context  ││
│                                                  │ → Response │     │ Violation││
│                                                  └────────────┘     │→ out_of_ ││
│                                                                     │scope_msg ││
│                                                                     └──────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Flow détaillé

```
1. Utilisateur: "@Bot Quelle est la capitale de la France ?"

2. MENTION---Process-Question:
   ├─ Detect Intent → "question"
   │
   ├─ Get Branding (API) → récupère:
   │     - scope_prompt: "Tu es un assistant culinaire..."
   │     - out_of_scope_message: "Je suis spécialisé en cuisine..."
   │
   ├─ Build LLM Request:
   │     {
   │       query: "Quelle est la capitale de la France ?",
   │       provider: "gemini",
   │       google_api_key: "xxx",
   │       allowed_context: {
   │         description: scope_prompt,  // Prompt complet
   │         suggestion: out_of_scope_message
   │       }
   │     }
   │
   └─ Call LLM - Web Search:
        ├─ Si contexte valide → retourne réponse LLM
        └─ Si hors-scope (403) → retourne out_of_scope_message
```

---

## Gestion des clés API LLM

**Décision : Les clés API sont passées par le plugin (chatbot-core)**

**Payload chatbot-core → n8n:**
```json
{
  "guild_id": "123456789",
  "user_id": "987654321",
  "content": "Quelle est la capitale de la France ?",
  "llm_config": {
    "provider": "gemini",
    "google_api_key": "AIza..."
  }
}
```

---

## Données requises

### Migration SQL

```sql
ALTER TABLE guild_branding
    ADD COLUMN IF NOT EXISTS scope_prompt TEXT,
    ADD COLUMN IF NOT EXISTS out_of_scope_message TEXT;

-- Valeurs par défaut pour bot-appetit
UPDATE guild_branding
SET scope_prompt = 'Tu es un assistant culinaire spécialisé en cuisine française et internationale. Tu peux répondre aux questions sur: les recettes, les ingrédients, les techniques de cuisine, les ustensiles, les menus et les régimes alimentaires. Si la question est hors de ce domaine, refuse poliment.',
    out_of_scope_message = 'Je suis spécialisé en cuisine ! Pose-moi des questions sur les recettes, les ingrédients ou les techniques culinaires.'
WHERE project_id = 'bot-appetit';
```

---

## API : Endpoints impactés

### GET /api/branding/guild/{guild_id}

**Réponse attendue (ajout):**
```json
{
  "project_id": "bot-appetit",
  "name": "Bot Appetit",
  "primary_color": "#E67E22",
  "scope_prompt": "Tu es un assistant culinaire spécialisé...",
  "out_of_scope_message": "Je suis spécialisé en cuisine..."
}
```

### PUT /api/config/branding (RFC-008)

Permettre la mise à jour des nouveaux champs via l'écran de configuration.

---

## Réponses type

### In Scope (succès)
```json
{
  "success": true,
  "response": "Une spatule est un ustensile de cuisine plat...",
  "intent": "question",
  "confidence": 0.9
}
```

### Out of Scope
```json
{
  "success": true,
  "response": "Je suis spécialisé en cuisine ! Pose-moi des questions sur les recettes, les ingrédients ou les techniques culinaires.",
  "intent": "out_of_scope",
  "confidence": 0.8
}
```

---

## Comportement si champs absents

| scope_prompt | out_of_scope_message | Comportement |
|--------------|---------------------|--------------|
| Absent | - | Pas de classification, toutes les questions passent |
| Présent | Absent | Classification active, message générique si hors-scope |
| Présent | Présent | Classification active, message personnalisé si hors-scope |

---

## Plan de travail

### Équipe API

- [ ] Migration table `guild_branding` (ajout scope_prompt, out_of_scope_message)
- [ ] Modifier GET /api/branding/guild/{guild_id} pour retourner les nouveaux champs
- [ ] Modifier PUT /api/config/branding pour accepter les nouveaux champs
- [ ] Valeurs par défaut pour bot-appetit

### Équipe n8n

- [x] Modifier MENTION---On-Mention-Handler pour passer branding
- [x] Modifier MENTION---Process-Question pour utiliser scope_prompt
- [x] Gérer le cas CONTEXT_VIOLATION avec out_of_scope_message
- [ ] Tests

### Équipe chatbot-core

- [ ] Passer les clés API LLM dans le payload mention (`llm_config`)
- [ ] UI pour éditer scope_prompt et out_of_scope_message (optionnel v2)

---

## Références

- [RFC-007: Mention Service](./RFC-007-MENTION-SERVICE.md)
- [RFC-008: Admin Config Screens](./RFC-008-ADMIN-CONFIG-SCREENS.md)
- [LLM - Web Search Workflow](../../workflows/LLM/LLM---Web-Search.json)

---

## Historique

| Date | Version | Auteur | Modification |
|------|---------|--------|--------------|
| 2026-01-16 | 1.0.0 | Équipe n8n | Création |
| 2026-01-16 | 1.1.0 | Équipe n8n | Intégration mécanisme allowed_context existant |
| 2026-01-16 | 1.2.0 | Équipe n8n | Retrait llm_provider, champs scope optionnels |
| 2026-01-16 | 2.0.0 | Équipe n8n | Refactor: scope_prompt + out_of_scope_message |
