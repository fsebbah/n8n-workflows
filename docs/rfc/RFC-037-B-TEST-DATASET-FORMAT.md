# RFC-037-B: Génération Automatique du Dataset de Test

**Status**: Draft v2
**Author**: MCP Team
**Date**: 2026-03-13
**Parent**: RFC-037 (Intelligent Intent Analysis)

## Résumé

Cette RFC spécifie un webhook n8n pour générer automatiquement des cas de test pour le système d'analyse d'intentions (RFC-037). Le webhook utilise un LLM (Claude ou GPT-4o-mini) pour créer des datasets de formation selon un domaine spécifié par l'utilisateur.

---

## Architecture du Webhook

```
┌─────────────────────────────────────────────────────────────────────┐
│                    dataset-generator                                 │
├─────────────────────────────────────────────────────────────────────┤
│  INPUT                                                               │
│  ├── domain: string         (domaine de formation)                  │
│  ├── categories: string[]   (simple, ambigu, multi-étape, elliptique)│
│  ├── count_per_category: int (nombre de cas par catégorie)          │
│  └── tools_focus: string[]  (outils à privilégier, optionnel)       │
├─────────────────────────────────────────────────────────────────────┤
│  ÉTAPE 1: Récupération des outils                                   │
│  └── GET mcp/tools/registry → liste des outils actifs               │
├─────────────────────────────────────────────────────────────────────┤
│  ÉTAPE 2: Génération LLM                                            │
│  └── Claude/GPT-4o-mini avec SYSTEM_PROMPT + TOOLS_LIST             │
├─────────────────────────────────────────────────────────────────────┤
│  ÉTAPE 3: Validation                                                │
│  └── Vérifier cohérence outils, entités, next_action                │
├─────────────────────────────────────────────────────────────────────┤
│  ÉTAPE 4: Formatage CSV                                             │
│  └── Générer le fichier CSV final                                   │
├─────────────────────────────────────────────────────────────────────┤
│  OUTPUT                                                              │
│  └── CSV: rfc037_test_dataset_{domain}_{timestamp}.csv              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Input du Webhook

### Endpoint
```
POST /webhook/mcp/dataset/generate
```

### Payload
```json
{
  "domain": "email et calendrier",
  "categories": ["simple", "ambigu", "multi-étape", "elliptique"],
  "count_per_category": 10,
  "tools_focus": ["mcp-gmail", "mcp-calendar", "mcp-contacts"],
  "language": "fr"
}
```

### Paramètres

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `domain` | string | Oui | Domaine de formation (ex: "shopping", "email", "recherche académique") |
| `categories` | string[] | Non | Catégories à générer (défaut: toutes) |
| `count_per_category` | int | Non | Nombre de cas par catégorie (défaut: 10) |
| `tools_focus` | string[] | Non | Outils à privilégier dans la génération |
| `language` | string | Non | Langue des demandes (défaut: "fr") |

---

## Étape 1: Récupération des Outils

Le webhook récupère la liste des outils actifs depuis le registre:

```
GET /webhook/mcp/tools/registry
```

Réponse utilisée pour construire `TOOLS_REFERENCE` dans le prompt.

---

## Étape 2: Prompt de Génération LLM

### SYSTEM_PROMPT

```
Tu es un générateur de dataset de test pour un système d'analyse d'intentions.

## Ta mission

Générer des cas de test réalistes pour le domaine: "{domain}"

Chaque cas de test doit contenir:
- Une demande utilisateur naturelle en français
- L'action attendue du système (next_action_attendu)
- Les outils qui DOIVENT être sélectionnés (outils_obligatoires)
- Les entités avec leur statut de résolution (entites_a_resoudre)
- Les champs bloquants manquants si applicable (missing_blocking)
- Une note expliquant le comportement attendu

## Catégories de test

### simple
Requêtes avec une seule intention claire où toutes les informations sont fournies.
- L'utilisateur donne explicitement toutes les données nécessaires
- Pas d'ambiguïté, pas de lookup nécessaire
- next_action_attendu = "search_tools" (toujours)

Exemples:
- "Envoie un email à jean@example.com pour confirmer notre réunion demain 14h"
- "Cherche des articles scientifiques sur le machine learning"

### ambigu
Requêtes où il manque des informations critiques ou où des références sont floues.
- Information manquante bloquante → next_action = "ask_user"
- Référence à chercher (prénom seul) → next_action = "resolve_entities"
- Pronom sans référent clair ("ça", "lui") → next_action = "ask_user"

Exemples:
- "Envoie ça à Marie" → contenu manquant = ask_user
- "Cherche Jean dans mes contacts" → lookup requis = resolve_entities
- "Traduis ce document" → langue cible manquante = ask_user

### multi-étape
Requêtes impliquant plusieurs actions séquentielles avec dépendances.
- Chaîne de 2-4 outils
- Si step 1 est exécutable → next_action = "search_tools"
- Si step 1 est bloqué → next_action = "ask_user"

Exemples:
- "Cherche des articles sur X, résume-les et envoie-moi par email" → 3 outils séquentiels
- "Extrais le texte de ce PDF et traduis-le en anglais" → PDF absent = ask_user

### elliptique
Requêtes référençant le contexte d'une conversation précédente.
- Utilise des pronoms anaphoriques ("le", "la", "lui", "ça")
- Le contexte est fourni entre crochets: [context: ...]
- Si référent résolu → next_action = "search_tools" ou "resolve_entities"

Exemples:
- "Résume-le [context: email de jean@x.com reçu]" → email résolu par contexte
- "Ajoute-les au panier [context: 3 produits affichés]" → produits résolus

## Règles de décision next_action

```
SI une entité a statut MISSING_BLOCKING:
    → next_action = "ask_user"
SINON SI une entité a statut USER_CONFIRMATION_REQUIRED:
    → next_action = "confirm_inference"
SINON SI une entité a statut AMBIGUOUS:
    → next_action = "disambiguate"
SINON SI une entité a statut LOOKUP_REQUIRED:
    → next_action = "resolve_entities"
SINON:
    → next_action = "search_tools"
```

## Statuts des entités

| Statut | Quand l'utiliser |
|--------|------------------|
| RESOLVED | Valeur fournie explicitement OU inférable par règle (date relative, fichier joint unique) |
| LOOKUP_REQUIRED | Prénom seul à chercher dans contacts, fichier à chercher dans Drive, lieu à chercher |
| AMBIGUOUS | Plusieurs résultats possibles pour un lookup |
| USER_CONFIRMATION_REQUIRED | Inférence risquée à confirmer |
| MISSING_BLOCKING | Information indispensable absente (heure de RDV, langue de traduction, contenu d'email) |

## Champs souvent MISSING_BLOCKING

- `target_language` - Traduction sans langue cible
- `content` - Email/message sans contenu
- `document` - Extraction/traduction sans fichier joint
- `time` / `heure` - RDV sans heure précise
- `product` - Ajout panier sans produit
- `url` - Scraping/transcription sans URL
- `query` / `topic` - Recherche sans sujet

## Format de sortie

Pour chaque cas, génère un objet JSON:

```json
{
  "id": 1,
  "categorie": "simple|ambigu|multi-étape|elliptique",
  "demande_utilisateur": "La requête en français",
  "next_action_attendu": "ask_user|confirm_inference|disambiguate|resolve_entities|search_tools",
  "outils_obligatoires": "outil1,outil2",
  "entites_a_resoudre": "type:valeur→STATUT,type:valeur→STATUT",
  "missing_blocking": "champ1|champ2",
  "notes_testeur": "Explication du comportement attendu"
}
```

## Outils disponibles

{TOOLS_REFERENCE}

## Contraintes

1. Utilise UNIQUEMENT les outils de la liste fournie
2. Les demandes doivent être naturelles et variées
3. Évite les formulations trop similaires
4. Assure la cohérence entre next_action et les statuts des entités
5. Pour "multi-étape", vérifie les dépendances entre sous-intentions
6. Pour "elliptique", inclus TOUJOURS le contexte entre crochets
```

### USER_PROMPT

```
Génère {count} cas de test pour la catégorie "{category}" dans le domaine "{domain}".

{tools_focus_instruction}

Réponds avec un tableau JSON contenant les {count} cas.
```

Où `tools_focus_instruction` est:
- Si `tools_focus` fourni: "Privilégie les outils suivants: {tools_focus}"
- Sinon: "Utilise les outils les plus pertinents pour le domaine."

---

## Étape 3: Validation

Le webhook valide chaque cas généré:

### Règles de validation

```python
def validate_case(case: dict, tools_list: list[str]) -> tuple[bool, list[str]]:
    errors = []

    # 1. Vérifier que les outils existent
    for tool in case["outils_obligatoires"].split(","):
        tool = tool.strip()
        if tool and tool not in tools_list:
            errors.append(f"Outil inconnu: {tool}")

    # 2. Vérifier cohérence next_action / entités
    entities = parse_entities(case["entites_a_resoudre"])
    missing = case.get("missing_blocking", "").split("|")

    if any(e["status"] == "MISSING_BLOCKING" for e in entities) or missing[0]:
        if case["next_action_attendu"] != "ask_user":
            errors.append("MISSING_BLOCKING présent mais next_action != ask_user")

    elif any(e["status"] == "LOOKUP_REQUIRED" for e in entities):
        if case["next_action_attendu"] not in ["resolve_entities", "search_tools"]:
            errors.append("LOOKUP_REQUIRED présent mais next_action incorrect")

    # 3. Vérifier format entités
    if case["entites_a_resoudre"]:
        for entity in case["entites_a_resoudre"].split(","):
            if "→" not in entity or ":" not in entity:
                errors.append(f"Format entité invalide: {entity}")

    # 4. Vérifier catégorie valide
    if case["categorie"] not in ["simple", "ambigu", "multi-étape", "elliptique"]:
        errors.append(f"Catégorie invalide: {case['categorie']}")

    # 5. Pour elliptique, vérifier présence contexte
    if case["categorie"] == "elliptique":
        if "[context:" not in case["demande_utilisateur"]:
            errors.append("Catégorie elliptique sans contexte [context: ...]")

    return len(errors) == 0, errors
```

### Action sur erreur

Si validation échoue:
1. Logger l'erreur
2. Soit rejeter le cas
3. Soit relancer une génération de remplacement

---

## Étape 4: Formatage CSV

### Structure CSV

```csv
id;categorie;demande_utilisateur;next_action_attendu;outils_obligatoires;entites_a_resoudre;missing_blocking;notes_testeur;result_next_action;result_tools;result_thinking_decision;result_status;langfuse_trace_url;execution_date
```

### Colonnes

| Colonne | Source | Description |
|---------|--------|-------------|
| `id` | Auto-généré | Identifiant unique séquentiel |
| `categorie` | LLM | simple, ambigu, multi-étape, elliptique |
| `demande_utilisateur` | LLM | Requête utilisateur générée |
| `next_action_attendu` | LLM | Action attendue du système |
| `outils_obligatoires` | LLM | Outils requis (séparés par `,`) |
| `entites_a_resoudre` | LLM | Entités avec statuts |
| `missing_blocking` | LLM | Champs bloquants (séparés par `\|`) |
| `notes_testeur` | LLM | Explication du comportement |
| `result_*` | Vide | Rempli lors de l'exécution des tests |
| `langfuse_trace_url` | Vide | Rempli lors de l'exécution |
| `execution_date` | Vide | Rempli lors de l'exécution |

---

## Output du Webhook

### Réponse succès

```json
{
  "success": true,
  "dataset": {
    "filename": "rfc037_test_dataset_email_20260313_143052.csv",
    "domain": "email et calendrier",
    "total_cases": 40,
    "by_category": {
      "simple": 10,
      "ambigu": 10,
      "multi-étape": 10,
      "elliptique": 10
    },
    "validation": {
      "passed": 38,
      "failed": 2,
      "errors": [
        {"id": 15, "error": "Outil inconnu: mcp-outlook"},
        {"id": 27, "error": "MISSING_BLOCKING présent mais next_action != ask_user"}
      ]
    },
    "download_url": "/files/datasets/rfc037_test_dataset_email_20260313_143052.csv"
  }
}
```

### Réponse erreur

```json
{
  "success": false,
  "error": "LLM generation failed",
  "details": "Rate limit exceeded"
}
```

---

## Référentiel des Valeurs

### next_action_attendu (6 valeurs)

| Valeur | Description |
|--------|-------------|
| `ask_user` | Clarification obligatoire (MISSING_BLOCKING) |
| `confirm_inference` | Valider inférence risquée (USER_CONFIRMATION_REQUIRED) |
| `disambiguate` | Présenter choix multiples (AMBIGUOUS) |
| `resolve_entities` | Lancer lookups (LOOKUP_REQUIRED) |
| `search_tools` | Rechercher outils Qdrant |
| `execute` | Exécuter le plan |

### Types d'entités courants

```
recipient, date, time, location, document, content, topic, query,
product, contact, file, email, url, target_language, chart_type,
volume, count, description, servings, duration, level, seuil,
données, adresse, commande, coupon_code, job_id, plan_actuel, action
```

### Statuts d'entités (6 valeurs)

```
RESOLVED, LOOKUP_REQUIRED, LOOKUP_DONE, AMBIGUOUS,
USER_CONFIRMATION_REQUIRED, MISSING_BLOCKING
```

---

## Exemples de Domaines

| Domaine | Outils typiques | Cas intéressants |
|---------|-----------------|------------------|
| "email et communication" | mcp-gmail, mcp-contacts, linkedin | Destinataires ambigus, pièces jointes |
| "shopping e-commerce" | cart-*, orders-*, profile-*, shipping-* | Produits, adresses, coupons |
| "recherche académique" | academic-searcher, llm-summarizer | Topics, résumés multi-documents |
| "gestion documentaire" | pdf-extractor, document-translate-worker | Fichiers manquants, langues |
| "apprentissage" | learning-*, quiz-generator, syllabus-* | Niveaux, évaluations |
| "calendrier et planning" | mcp-calendar, mcp-contacts | Dates, heures, participants |
| "génération de contenu" | image-generator, code-generator, text-generator | Descriptions, paramètres |

---

## Workflow n8n Suggéré

```
[Webhook Trigger]
       ↓
[HTTP Request: GET tools/registry]
       ↓
[Set: Construire TOOLS_REFERENCE]
       ↓
[Loop: Pour chaque catégorie]
       ↓
   [LLM: Claude/GPT-4o-mini]
   [Parse JSON response]
   [Validate cases]
       ↓
[Merge: Combiner tous les cas]
       ↓
[Code: Générer CSV]
       ↓
[Write File: Sauvegarder]
       ↓
[Respond: Retourner résultat]
```

---

## Tests du Webhook

### Cas de test minimal

```bash
curl -X POST http://localhost:5678/webhook/mcp/dataset/generate \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "email",
    "categories": ["simple"],
    "count_per_category": 3
  }'
```

### Cas de test complet

```bash
curl -X POST http://localhost:5678/webhook/mcp/dataset/generate \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "shopping e-commerce",
    "categories": ["simple", "ambigu", "multi-étape", "elliptique"],
    "count_per_category": 25,
    "tools_focus": ["cart-add", "cart-checkout", "orders-list", "shipping-calculate"],
    "language": "fr"
  }'
```

---

## Références

- RFC-037: Intelligent Intent Analysis
- `data/tools_index_export.csv`: Liste des outils
- `/webhook/mcp/tools/registry`: Registre des outils n8n
- `scripts/training/run_evaluation.py`: Script d'évaluation du dataset
