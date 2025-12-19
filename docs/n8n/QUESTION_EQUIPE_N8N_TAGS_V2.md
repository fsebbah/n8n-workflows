# Question pour l'équipe n8n - Intégration Tags v2

**Date**: 2024-12-18
**Contexte**: Suite aux retours de 2 experts sur notre proposition de tags pour le tool registry

---

## Résumé de la demande

Nous souhaitons enrichir la réponse de l'endpoint `/webhook/mcp-registry` avec des métadonnées supplémentaires pour permettre :
1. **Filtrage intelligent** des outils selon l'intention utilisateur
2. **Sécurité** : empêcher l'exposition d'outils internes à l'utilisateur final
3. **Affichage frontend** : labels courts et descriptions claires

---

## Champs demandés par outil

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `label` | string | Oui | Nom court pour affichage (ex: "Gmail", "Google Drive") |
| `description` | string | Oui | Description fonctionnelle (sans nom de vendor) |
| `tags` | string[] | Oui | Liste de tags pour filtrage |
| `scope` | enum | Oui | `"user"` \| `"agent"` \| `"system"` |

---

## Nouveau champ `scope` (critique)

Ce champ détermine qui peut voir/utiliser l'outil :

| Valeur | Signification | Exemple d'outils |
|--------|---------------|------------------|
| `user` | Visible et proposable à l'utilisateur | Gmail, Google Drive, PDF Extractor |
| `agent` | Utilisable par l'orchestrateur uniquement | Tokenizer, Text Embedder |
| `system` | Outil interne, jamais exposé | Vector Store, Echo Test, Cost Calculator |

**Question** : Pouvez-vous ajouter ce champ dans les workflows n8n ?

---

## Liste des tags à supporter

### Tags Principaux (15)

```
storage, email, calendar, contacts, document, search,
ai-text, ai-image, ai-audio, ai-code, analytics,
social, data, education, utility
```

### Tags Secondaires (27)

```
google, cloud, communication, planning, extraction, transformation,
web, math, translation, academic, news, video, media, generation,
summarization, classification, detection, embeddings, ocr,
visualization, synthesis, identification, nlp, feedback, cost,
professional, batch, test, infra
```

**Question** : Est-ce que le stockage d'un array de tags est possible dans n8n ?

---

## Exemple de réponse attendue

```json
{
  "tools": {
    "mcp-gmail": {
      "name": "MCP - Gmail Server (All-in-One)",
      "label": "Gmail",
      "description": "Envoi et gestion d'emails via Gmail",
      "tags": ["email", "google", "communication"],
      "scope": "user",
      "webhook_url": "http://pi6.local:5678/webhook/mcp-gmail",
      "active": true,
      "parameters": { ... }
    },
    "vector-store": {
      "name": "Vector Store",
      "label": "Vector Store",
      "description": "Stockage et recherche vectorielle",
      "tags": ["utility", "embeddings", "search", "infra"],
      "scope": "system",
      "webhook_url": "http://pi6.local:5678/webhook/vector-store",
      "active": true,
      "parameters": { ... }
    },
    "tokenizer": {
      "name": "Tokenizer",
      "label": "Tokenizer",
      "description": "Comptage de tokens pour LLM",
      "tags": ["ai-text", "utility", "infra"],
      "scope": "agent",
      "webhook_url": "http://pi6.local:5678/webhook/tokenizer",
      "active": true,
      "parameters": { ... }
    }
  }
}
```

---

## Questions pour l'équipe n8n

### 1. Faisabilité technique

- [ ] Pouvez-vous ajouter le champ `label` (string) ?
- [ ] Pouvez-vous ajouter le champ `description` (string) ?
- [ ] Pouvez-vous ajouter le champ `tags` (array de strings) ?
- [ ] Pouvez-vous ajouter le champ `scope` (enum: user/agent/system) ?

### 2. Stockage des métadonnées

**Option A** : Stockage dans les variables du workflow n8n
**Option B** : Fichier de configuration externe (JSON/YAML)
**Option C** : Base de données partagée

Quelle option préférez-vous ?

### 3. Maintenance

Qui sera responsable de maintenir la liste des tags et scopes ?
- [ ] Équipe n8n (vous)
- [ ] Équipe MCP (nous)
- [ ] Fichier partagé éditable par les deux équipes

### 4. Timeline

Pouvez-vous estimer le temps nécessaire pour implémenter ces changements ?

---

## Tableau récapitulatif des outils et leurs métadonnées

Nous avons préparé la liste complète dans `docs/n8n/tool-registry-tags.md`.

Voici un extrait avec les nouveaux champs :

| Tool ID | Label | Scope | Tags |
|---------|-------|-------|------|
| `mcp-gmail` | Gmail | user | email, google, communication |
| `email-imap` | Email IMAP | user | email, communication |
| `mcp-calendar` | Google Calendar | user | calendar, google, planning |
| `mcp-contacts` | Google Contacts | user | contacts, google, communication |
| `mcp-drive` | Google Drive | user | storage, google, cloud, document |
| `pdf-extractor` | PDF Extractor | user | document, extraction |
| `mathpix` | Mathpix | user | document, extraction, math, ocr |
| `text-generator` | Text Generator | user | ai-text, generation |
| `summarizer` | Summarizer | user | ai-text, summarization |
| `tokenizer` | Tokenizer | agent | ai-text, utility, infra |
| `text-embedder` | Text Embedder | agent | ai-text, embeddings, infra |
| `vector-store` | Vector Store | system | utility, embeddings, search, infra |
| `cost-calculator` | Cost Calculator | system | analytics, cost, infra |
| `mcp-test-echo` | Echo Test | system | utility, test, infra |

---

## Prochaines étapes

1. **Équipe n8n** : Répondre aux questions ci-dessus
2. **Équipe MCP** : Adapter le code de filtrage selon vos réponses
3. **Test commun** : Valider l'intégration sur un environnement de dev

Merci de votre retour !
