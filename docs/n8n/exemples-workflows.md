# Exemples Détaillés de Workflows n8n

> Documentation des structures et architectures des workflows

## Table des Matières

1. [Structure d'un Workflow n8n](#structure-dun-workflow-n8n)
2. [Anatomie d'un Node](#anatomie-dun-node)
3. [Exemple 1: Waitlist avec Vérification Email](#exemple-1-waitlist-avec-vérification-email)
4. [Exemple 2: Traitement Emails vers Google Sheets](#exemple-2-traitement-emails-vers-google-sheets)
5. [Exemple 3: Formulaire vers Slack/Email](#exemple-3-formulaire-vers-slackemail)
6. [Patterns d'Architecture](#patterns-darchitecture)

---

## Structure d'un Workflow n8n

Un fichier workflow JSON contient les éléments suivants :

```json
{
  "name": "Nom du workflow",
  "nodes": [...],           // Liste des noeuds
  "connections": {...},     // Liaisons entre noeuds
  "settings": {...},        // Configuration globale
  "meta": {...},            // Métadonnées
  "tags": [...],            // Tags de catégorisation
  "pinData": {...}          // Données épinglées pour tests
}
```

### Paramètres Globaux (settings)

| Paramètre | Description | Valeur Typique |
|-----------|-------------|----------------|
| `executionOrder` | Version d'exécution | `"v1"` |
| `saveManualExecutions` | Sauvegarder exécutions manuelles | `true` |
| `timezone` | Fuseau horaire | `"UTC"` |
| `executionTimeout` | Timeout en secondes | `3600` |
| `retryOnFail` | Réessayer en cas d'échec | `true` |
| `retryCount` | Nombre de tentatives | `3` |

---

## Anatomie d'un Node

Chaque node est un objet JSON avec cette structure :

```json
{
  "id": "uuid-unique",
  "name": "Nom Affichage",
  "type": "n8n-nodes-base.googleSheets",
  "position": [x, y],
  "parameters": {
    // Paramètres spécifiques au type de node
  },
  "credentials": {
    // Références aux credentials
  },
  "typeVersion": 4.5,
  "notes": "Description optionnelle"
}
```

### Types de Nodes Courants

| Type | Usage | Exemple |
|------|-------|---------|
| `formTrigger` | Déclencheur formulaire | Inscription waitlist |
| `gmailTrigger` | Déclencheur email | Réception commandes |
| `webhook` | Déclencheur HTTP | API externe |
| `googleSheets` | CRUD Google Sheets | Stockage données |
| `if` | Condition logique | Routage conditionnel |
| `set` | Transformation données | Nettoyage/formatage |
| `code` | JavaScript personnalisé | Logique complexe |
| `emailSend` | Envoi email | Notifications |

---

## Exemple 1: Waitlist avec Vérification Email

### Description
Workflow complet de gestion de waitlist avec :
- Formulaire d'inscription
- Génération de code de vérification
- Boucle de validation
- Stockage multi-étapes dans Google Sheets

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           WORKFLOW: WAITLIST VERIFICATION                        │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   TRIGGER    │    │  TRANSFORM   │    │   CRYPTO     │    │   STORAGE    │
│              │    │              │    │              │    │              │
│ Form Trigger │───▶│ Clean Data   │───▶│ Generate     │───▶│ Add to       │
│ (Waitlist)   │    │ (Set Node)   │    │ OTP Code     │    │ Google Sheet │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                   │
                    ┌──────────────────────────────────────────────┘
                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   NOTIFY     │    │   MERGE      │    │   WAIT       │
│              │    │              │    │              │
│ Send Email   │◀───│ Merge Node   │◀───│ Wait/Sync    │
│ (SMTP)       │    │              │    │              │
└──────┬───────┘    └──────────────┘    └──────────────┘
       │
       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   FORM 2     │    │   VALIDATE   │    │   BRANCH     │
│              │    │              │    │              │
│ Enter Code   │───▶│ Get All Data │───▶│ Is Code OK?  │
│              │    │ (Set Node)   │    │ (If Node)    │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                         ┌─────────────────────┴─────────────────────┐
                         │                                           │
                         ▼ TRUE                                      ▼ FALSE
               ┌──────────────┐                            ┌──────────────┐
               │   SUCCESS    │                            │   RETRY      │
               │              │                            │              │
               │ Save as      │                            │ Let User     │
               │ Verified     │                            │ Re-enter     │
               └──────┬───────┘                            └──────┬───────┘
                      │                                           │
                      ▼                                           │
               ┌──────────────┐                                   │
               │   FORM 3     │                                   │
               │              │                                   │
               │ Additional   │◀──────────────────────────────────┘
               │ Data Form    │        (Loop back)
               └──────┬───────┘
                      │
                      ▼
               ┌──────────────┐    ┌──────────────┐
               │   COLLECT    │    │   FINAL      │
               │              │    │              │
               │ Get All      │───▶│ Save Intent  │
               │ Steps Data   │    │ to Sheet     │
               └──────────────┘    └──────────────┘
```

### Liste des Nodes (23 nodes)

| # | Node | Type | Fonction |
|---|------|------|----------|
| 1 | Waitlist Form | `formTrigger` | Formulaire d'inscription initial |
| 2 | Clean and Standardize | `set` | Normaliser email et URL |
| 3 | Generate Random Verification Code | `crypto` | Créer code OTP 6 caractères |
| 4 | Add to Waitlist Sheet | `googleSheets` | Sauvegarder inscription initiale |
| 5 | Merge | `merge` | Synchroniser les flux |
| 6 | Send Verification Email | `emailSend` | Envoyer code par email |
| 7 | Validate with Verification Code | `form` | Formulaire saisie code |
| 8 | Get all Data from Prev Form | `set` | Récupérer données contexte |
| 9 | Is the Code correct? | `if` | Vérifier validité code |
| 10 | Let the User Reenter Code | `form` | Formulaire nouvelle tentative |
| 11 | Save as Verified | `googleSheets` | Marquer comme vérifié |
| 12 | Additional Data for Sheet | `form` | Formulaire info complémentaires |
| 13 | Every Step Data | `set` | Collecter toutes les données |
| 14 | Save Intent to List | `googleSheets` | Sauvegarder cas d'usage |
| 15-23 | Sticky Notes | `stickyNote` | Documentation inline |

### Structure Google Sheet Requise

| Firstname | Lastname | Email | Company | Verification-Code | Verified | Intended Use |
|-----------|----------|-------|---------|-------------------|----------|--------------|
| Marcel | Dupont | test@example.com | example.com | abc123 | TRUE | Testing |

### Détail du Node Google Sheets

```json
{
  "name": "Add to Waitlist Sheet",
  "type": "n8n-nodes-base.googleSheets",
  "parameters": {
    "operation": "appendOrUpdate",
    "documentId": {
      "__rl": true,
      "mode": "list",
      "value": "1ydEoVn5uY36bEVXDmfdbj3Q-OabaPIqTifrzx49PTHA"
    },
    "sheetName": {
      "__rl": true,
      "mode": "list",
      "value": "gid=0"
    },
    "columns": {
      "mappingMode": "defineBelow",
      "matchingColumns": ["Email"],
      "value": {
        "Email": "={{ $json.Email }}",
        "Firstname": "={{ $json.Firstname }}",
        "Lastname": "={{ $json.Lastname }}",
        "Company": "={{ $json['Company Website'] }}",
        "Verification-Code": "={{ $json.code }}"
      }
    }
  },
  "credentials": {
    "googleSheetsOAuth2Api": {
      "id": "7508uyvd9qA3loJG",
      "name": "Demo Creds Sheets"
    }
  }
}
```

### Opérations Google Sheets Disponibles

| Opération | Description |
|-----------|-------------|
| `append` | Ajouter une nouvelle ligne |
| `appendOrUpdate` | Ajouter ou mettre à jour si existe |
| `update` | Mettre à jour ligne existante |
| `read` | Lire des données |
| `delete` | Supprimer une ligne |
| `clear` | Effacer contenu |

---

## Exemple 2: Traitement Emails vers Google Sheets

### Description
Workflow d'automatisation qui :
- Se déclenche sur réception d'email
- Utilise l'IA pour extraire les données de commande
- Stocke les lignes de commande dans Google Sheets

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        WORKFLOW: EMAIL TO GOOGLE SHEETS (AI)                     │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   TRIGGER    │    │   FILTER     │    │   AI AGENT   │    │   PARSE      │
│              │    │              │    │              │    │              │
│ Gmail        │───▶│ Is PO?       │───▶│ Extract Data │───▶│ Structured   │
│ Trigger      │    │ (If Node)    │    │ (OpenAI)     │    │ Output       │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                           │                                       │
                           │ FALSE                                 │
                           ▼                                       │
                    ┌──────────────┐                               │
                    │   END        │                               │
                    │              │                               │
                    │ No Operation │                               │
                    └──────────────┘                               │
                                                                   │
                    ┌──────────────────────────────────────────────┘
                    ▼
┌──────────────┐    ┌──────────────┐
│   FORMAT     │    │   STORE      │
│              │    │              │
│ Format PO    │───▶│ Google       │
│ Lines (Code) │    │ Sheets       │
└──────────────┘    └──────────────┘
```

### Liste des Nodes (14 nodes)

| # | Node | Type | Fonction |
|---|------|------|----------|
| 1 | Email Received | `gmailTrigger` | Surveiller boîte Gmail |
| 2 | Is PO? | `if` | Vérifier si sujet contient "Inbound Order" |
| 3 | AI Agent | `agent` | Analyser email avec OpenAI |
| 4 | OpenAI Chat Model | `lmChatOpenAi` | Modèle GPT-4o-mini |
| 5 | Structured Output Parser | `outputParserStructured` | Parser JSON structuré |
| 6 | Format Purchase Order Lines | `code` | Transformer données pour Sheet |
| 7 | Store Purchase Order Lines | `googleSheets` | Sauvegarder dans Sheets |
| 8-14 | Sticky Notes | `stickyNote` | Documentation |

### Détail du Node Code (Transformation)

```javascript
// Format Purchase Order Lines
const {purchase_order, expected_delivery_date, lines} = $input.first().json.output;

return lines.map(line => ({
  json: {
    purchase_order,
    expected_delivery_date,
    sku: line.sku,
    quantity: line.quantity
  }
}));
```

### Structure Google Sheet Résultat

| PO_NUMBER | EXPECTED_DELIVERY DATE | SKU_ID | QUANTITY |
|-----------|------------------------|--------|----------|
| PO45231 | 2025-03-27 | HERM-SHOE-001 | 120 |
| PO45231 | 2025-03-27 | HERM-BAG-032 | 45 |

---

## Exemple 3: Formulaire vers Slack/Email

### Description
Workflow de gestion des problèmes utilisateur avec routage conditionnel selon la sévérité.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        WORKFLOW: FORM TO SLACK/EMAIL                             │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   TRIGGER    │    │   STORE      │    │   EVALUATE   │
│              │    │              │    │              │
│ Typeform    │───▶│ Google       │───▶│ Severity > 7 │
│ Trigger      │    │ Sheets       │    │ (If Node)    │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                         ┌─────────────────────┴─────────────────────┐
                         │                                           │
                         ▼ TRUE (Urgent)                             ▼ FALSE
               ┌──────────────┐                            ┌──────────────┐
               │   NOTIFY     │                            │   LOG        │
               │              │                            │              │
               │ Send to      │                            │ Archive      │
               │ Slack        │                            │ Only         │
               └──────────────┘                            └──────────────┘
                      │
                      ▼
               ┌──────────────┐
               │   ESCALATE   │
               │              │
               │ Send Email   │
               │ (Admin)      │
               └──────────────┘
```

### Liste des Nodes (5 nodes)

| # | Node | Type | Fonction |
|---|------|------|----------|
| 1 | Typeform Trigger | `typeformTrigger` | Réception formulaire |
| 2 | Google Sheets | `googleSheets` | Archiver le problème |
| 3 | If Node | `if` | Évaluer sévérité (> 7) |
| 4 | Slack | `slack` | Notifier canal #problems |
| 5 | Send Email | `emailSend` | Alerter administrateur |

### Détail du Node If (Condition)

```json
{
  "name": "If Node",
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "number": [
        {
          "value1": "={{$node[\"Google Sheets\"].data[\"Severity\"]}}",
          "value2": 7,
          "operation": "larger"
        }
      ]
    }
  }
}
```

---

## Patterns d'Architecture

### Pattern 1: Pipeline Linéaire

```
Trigger ──▶ Transform ──▶ Action ──▶ Notify
```

**Cas d'usage:** Import de données, synchronisation simple

### Pattern 2: Routage Conditionnel

```
                    ┌──▶ Action A
Trigger ──▶ If ─────┤
                    └──▶ Action B
```

**Cas d'usage:** Traitement différencié selon critères

### Pattern 3: Boucle de Validation

```
                    ┌────────────────────────┐
                    │                        │
Trigger ──▶ Form ──▶ Validate ──┬──▶ Success │
                    ▲           │            │
                    │           │ Fail       │
                    └───────────┘            │
                                             ▼
                                        Continue
```

**Cas d'usage:** Vérification OTP, validation multi-étapes

### Pattern 4: Fan-out / Fan-in

```
                    ┌──▶ API 1 ──┐
                    │            │
Trigger ──▶ Split ──┼──▶ API 2 ──┼──▶ Merge ──▶ Store
                    │            │
                    └──▶ API 3 ──┘
```

**Cas d'usage:** Appels API parallèles, agrégation

### Pattern 5: AI-Augmented

```
Trigger ──▶ AI Agent ──▶ Parser ──▶ Transform ──▶ Store
                │
                ▼
           LLM Model
```

**Cas d'usage:** Extraction intelligente, classification

---

## Connexions entre Nodes

Les connexions définissent le flux de données :

```json
{
  "connections": {
    "node-id-source": {
      "main": [
        [
          {
            "node": "node-id-destination",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### Sortie Multi-branches (If Node)

```json
{
  "connections": {
    "if-node-id": {
      "main": [
        [{"node": "true-branch", "type": "main", "index": 0}],  // index 0 = TRUE
        [{"node": "false-branch", "type": "main", "index": 0}]  // index 1 = FALSE
      ]
    }
  }
}
```

---

## Expressions et Variables

### Syntaxe des Expressions

| Expression | Description |
|------------|-------------|
| `{{ $json.field }}` | Champ du node précédent |
| `{{ $node["Name"].json.field }}` | Champ d'un node spécifique |
| `{{ $input.first().json }}` | Premier item d'entrée |
| `{{ $env.VARIABLE }}` | Variable d'environnement |
| `{{ $now }}` | Timestamp actuel |

### Exemples de Transformations

```javascript
// Normaliser email
"={{ $json.Email.trim().toLowerCase() }}"

// Nettoyer URL
"=https://{{ $json['URL'].toLowerCase().trim().replace('https://','') }}"

// Condition
"={{ $json.Severity > 7 ? 'urgent' : 'normal' }}"
```

---

## Bonnes Pratiques

1. **Documentation** : Utiliser des Sticky Notes pour expliquer la logique
2. **Nommage** : Noms de nodes explicites et descriptifs
3. **Error Handling** : Ajouter des nodes `stopAndError` pour gestion d'erreurs
4. **Modularité** : Découper workflows complexes en sous-workflows
5. **Tests** : Utiliser `pinData` pour tester avec données fixes
6. **Credentials** : Ne jamais hardcoder les credentials dans le workflow
