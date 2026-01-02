# API Traduction - Guide pour n8n

Documentation pour l'intégration n8n avec le système de traduction Torah Solutions.

---

## 1. URL de Base

```
Production : http://torah.solutions:3031
Développement : http://localhost:3031
```

---

## 2. Endpoints de Traduction

### 2.0 Rechercher une traduction existante (Cache)

**GET** `/api/translations/search`

Vérifie si une traduction existe déjà en cache/base de données.

#### Paramètres

| Paramètre | Type | Priorité | Description |
|-----------|------|----------|-------------|
| `source_text_id` | UUID | 1 (optimal) | Recherche directe par UUID |
| `commentary_id` | UUID | 1 | Recherche traduction d'un commentaire |
| `traite` | string | 2 | Nom du traité (ex: Sukkah) |
| `page` | string | 2 | Page du traité (ex: 28a) |
| `commentator` | string | 2 | Nom du commentateur (ex: Rashi) |
| `target_language` | string | **requis** | Langue cible (`fr`, `en`, `he`) |

#### Exemples

```bash
# Par UUID (recommandé)
GET /api/translations/search?source_text_id=abc-123&target_language=fr

# Par référence structurée
GET /api/translations/search?traite=Sukkah&page=28a&target_language=fr

# Avec commentateur
GET /api/translations/search?traite=Sukkah&page=28a&commentator=Rashi&target_language=fr
```

#### Réponse (trouvée)

```json
{
  "found": true,
  "translation_id": "uuid-traduction",
  "source_text_id": "uuid-source",
  "reference": "Sukkah 28a",
  "source_text": "Texte original...",
  "hebrew_text": "טקסט עברי...",
  "translated_text": "Texte traduit en français...",
  "target_language": "fr",
  "provider": "openai",
  "model": "gpt-4o",
  "quality_score": 0.95,
  "version": 1,
  "created_at": "2025-12-28T10:00:00",
  "traite": "Sukkah",
  "page": "28a"
}
```

#### Réponse (non trouvée)

```json
{
  "found": false,
  "source_text_id": null,
  "traite": "Sukkah",
  "page": "28a",
  "target_language": "fr"
}
```

#### Workflow n8n recommandé

```
1. GET /api/talmud/text/{traite}/{page}
   → Récupère source_text_id

2. GET /api/translations/search?source_text_id={uuid}&target_language=fr
   → Si found=true : utiliser translated_text
   → Si found=false : passer à l'étape 3

3. POST /api/mcp/translate (créer la traduction)
```

---

### 2.1 Traduire un texte (Endpoint principal)

**POST** `/api/translate`

Traduit un texte ou document avec choix du modèle LLM.

#### Requête

```json
{
  "type": "text",
  "text": "בְּרֵאשִׁית בָּרָא אֱלֹהִים",
  "source_language": "he",
  "target_language": "fr",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "preserve_formatting": true,
  "quality_check": true,
  "context": "Texte de la Torah, Genèse"
}
```

#### Paramètres

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `type` | string | Oui | `"text"` ou `"document"` |
| `text` | string | Oui* | Texte à traduire (si type=text) |
| `document_url` | string | Oui* | URL du document (si type=document) |
| `document_id` | string | Oui* | UUID du document en BDD |
| `source_language` | string | Oui | Code ISO langue source (`he`, `en`, `fr`) |
| `target_language` | string | Oui | Code ISO langue cible |
| `provider` | string | Non | `openai`, `claude`, `gemini`, `mistral` |
| `model` | string | Non | Modèle spécifique (voir liste ci-dessous) |
| `context` | string | Non | Contexte pour améliorer la traduction |
| `quality_check` | boolean | Non | Activer la vérification qualité |
| `glossary` | object | Non | Glossaire personnalisé `{"terme": "traduction"}` |

#### Modèles disponibles

| Provider | Modèles |
|----------|---------|
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` |
| Claude | `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307` |
| Gemini | `gemini-pro`, `gemini-pro-vision` |
| Mistral | `mistral-large-latest`, `mistral-medium-latest`, `mistral-small-latest` |

#### Réponse

```json
{
  "translation_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "type": "text",
  "translated_text": "Au commencement, Dieu créa",
  "source_language": "he",
  "target_language": "fr",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "character_count": 28,
  "token_count": 15,
  "processing_time": 1.23,
  "quality_score": 0.95
}
```

---

### 2.2 Traduire avec référence BDD (Optimisé)

**POST** `/api/mcp/translate`

Endpoint optimisé pour traduire directement depuis la base de données.

#### Requête

```json
{
  "reference": {
    "table": "source_texts",
    "uuid": "29428246-00aa-4755-b402-8e3d8ae4fd52"
  },
  "target_language": "fr",
  "translator": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "reviewer": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet"
  },
  "apply_grammalecte": true,
  "translator_prompt": "Traduire ce texte rabbinique avec fidélité",
  "reviewer_prompt": "Vérifier la cohérence terminologique"
}
```

#### Formats de référence supportés

```json
// Format 1: Table + UUID
{"table": "source_texts", "uuid": "uuid-value"}

// Format 2: Table + ID
{"table": "commentary_details", "id": "uuid-value"}

// Format 3: Texte personnalisé
{"type": "custom_text", "id": "Le texte à traduire"}

// Format 4: Legacy
{"type": "database", "table": "source_texts", "id": "uuid-value"}
```

#### Réponse

```json
{
  "success": true,
  "translation": "Texte traduit...",
  "revision": "Texte révisé...",
  "metadata": {
    "processing_time": 2.45,
    "translator_model": "gpt-4o",
    "reviewer_model": "claude-3-5-sonnet",
    "grammalecte_applied": true
  }
}
```

---

### 2.3 Statut d'une traduction

**GET** `/api/translate/{translation_id}/status`

Vérifie le statut d'une traduction asynchrone.

#### Réponse

```json
{
  "translation_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 45.5,
  "current_step": "Traduction en cours",
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `pending` | En attente de traitement |
| `processing` | Traduction en cours |
| `completed` | Terminé avec succès |
| `failed` | Échec de la traduction |

---

### 2.4 Annuler une traduction

**POST** `/api/translate/{translation_id}/cancel`

---

### 2.5 Télécharger un document traduit

**GET** `/api/translate/{translation_id}/download`

Retourne le fichier traduit (PDF, DOCX, etc.)

---

## 3. Structure des Données en Base

### Tables PostgreSQL

#### `translation_projects` - Projets de traduction

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | VARCHAR(255) | Nom du projet |
| `sefaria_ref` | VARCHAR(255) | Référence Sefaria |
| `source_language` | VARCHAR(10) | Langue source (défaut: `he`) |
| `target_language` | VARCHAR(10) | Langue cible (défaut: `fr`) |
| `status` | VARCHAR(50) | `draft`, `in_progress`, `completed` |
| `created_by` | UUID | FK vers users |
| `extra_data` | JSON | Métadonnées additionnelles |
| `created_at` | TIMESTAMP | Date de création |
| `updated_at` | TIMESTAMP | Date de modification |

#### `source_texts` - Textes sources

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `project_id` | UUID | FK vers translation_projects |
| `reference` | VARCHAR(255) | Référence du texte |
| `text` | TEXT | Texte source |
| `hebrew_text` | TEXT | Texte hébreu original |
| `position` | INTEGER | Position dans le projet |
| `extra_data` | JSON | Métadonnées |

#### `translations` - Traductions (versionnées)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `source_text_id` | UUID | FK vers source_texts |
| `version` | INTEGER | Numéro de version |
| `translated_text` | TEXT | **Texte traduit** |
| `provider` | VARCHAR(50) | Provider LLM utilisé |
| `model` | VARCHAR(100) | Modèle utilisé |
| `quality_score` | FLOAT | Score qualité (0-1) |
| `confidence_score` | FLOAT | Score de confiance |
| `is_current` | BOOLEAN | Version courante |
| `input_tokens` | INTEGER | Tokens consommés (entrée) |
| `output_tokens` | INTEGER | Tokens consommés (sortie) |
| `cost_estimate` | FLOAT | Coût estimé |
| `extra_data` | JSON | Métadonnées |

#### `corrections` - Corrections

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `translation_id` | UUID | FK vers translations |
| `original_text` | TEXT | Texte original |
| `corrected_text` | TEXT | Texte corrigé |
| `correction_reason` | TEXT | Raison de la correction |
| `correction_type` | VARCHAR(50) | `manual`, `automatic`, `llm_suggested` |

#### `commentaries` - Commentaires

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `source_text_id` | UUID | FK vers source_texts |
| `reference` | VARCHAR(255) | Référence |
| `text` | TEXT | Texte du commentaire |
| `hebrew_text` | TEXT | Texte hébreu |
| `category` | VARCHAR(100) | Catégorie (Rachi, Tosafot...) |
| `author` | VARCHAR(255) | Auteur |

---

## 4. Requêtes SQL Utiles

### Récupérer une traduction par texte source

```sql
SELECT
    t.id,
    t.translated_text,
    t.version,
    t.provider,
    t.model,
    t.quality_score,
    t.created_at
FROM translations t
JOIN source_texts st ON t.source_text_id = st.id
WHERE st.text ILIKE '%recherche%'
  AND t.is_current = true
ORDER BY t.created_at DESC;
```

### Récupérer toutes les traductions d'un projet

```sql
SELECT
    st.reference,
    st.text as source_text,
    st.hebrew_text,
    t.translated_text,
    t.provider,
    t.model,
    t.quality_score
FROM translation_projects tp
JOIN source_texts st ON st.project_id = tp.id
LEFT JOIN translations t ON t.source_text_id = st.id AND t.is_current = true
WHERE tp.id = 'project-uuid'
ORDER BY st.position;
```

### Vérifier si une traduction existe

```sql
SELECT EXISTS(
    SELECT 1
    FROM translations t
    JOIN source_texts st ON t.source_text_id = st.id
    WHERE st.text = 'texte original'
      AND t.is_current = true
) as translation_exists;
```

---

## 5. Exemples d'Intégration n8n

### Workflow 1: Traduire un texte simple

```json
{
  "nodes": [
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3031/api/translate",
        "body": {
          "type": "text",
          "text": "{{ $json.hebrew_text }}",
          "source_language": "he",
          "target_language": "fr",
          "provider": "openai",
          "model": "gpt-4o-mini"
        }
      }
    }
  ]
}
```

### Workflow 2: Traduire depuis la BDD

```json
{
  "nodes": [
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3031/api/mcp/translate",
        "body": {
          "reference": {
            "table": "source_texts",
            "uuid": "{{ $json.source_text_id }}"
          },
          "target_language": "fr",
          "translator": {
            "provider": "openai",
            "model": "gpt-4o"
          },
          "reviewer": {
            "provider": "anthropic",
            "model": "claude-3-5-sonnet"
          }
        }
      }
    }
  ]
}
```

### Workflow 3: Vérifier le statut

```json
{
  "nodes": [
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "GET",
        "url": "http://localhost:3031/api/translate/{{ $json.translation_id }}/status"
      }
    },
    {
      "name": "IF",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "{{ $json.status }}",
              "value2": "completed"
            }
          ]
        }
      }
    }
  ]
}
```

---

## 6. Authentification

L'API nécessite une authentification. Ajouter le header :

```
Authorization: Bearer <token>
```

Pour obtenir un token, contacter l'administrateur.

---

## 7. Codes d'Erreur

| Code | Description |
|------|-------------|
| 400 | Requête invalide (paramètres manquants) |
| 401 | Non authentifié |
| 403 | Non autorisé |
| 404 | Ressource non trouvée |
| 429 | Rate limit dépassé |
| 500 | Erreur serveur |

---

## 8. Contact

- **API Documentation Swagger** : http://localhost:3031/api/docs
- **Repository** : torah.solutions.api
- **Support** : équipe backend

---

## 9. Endpoints de Vocalisation (Nekudot)

Ces endpoints permettent de gérer les textes hébreux avec voyelles (nekudot/ניקוד).

### 9.1 Rechercher un texte vocalisé

**GET** `/api/vocalization/search`

Vérifie si un texte vocalisé existe en base de données.

#### Paramètres

| Paramètre | Type | Priorité | Description |
|-----------|------|----------|-------------|
| `source_text_id` | UUID | 1 (optimal) | Recherche directe par UUID |
| `commentary_id` | UUID | 1 | Recherche vocalisation d'un commentaire |
| `traite` | string | 2 | Nom du traité (ex: Sukkah) |
| `page` | string | 2 | Page du traité (ex: 28a) |
| `commentator` | string | 2 | Nom du commentateur (ex: Rashi) |

#### Exemples

```bash
# Par UUID (recommandé)
GET /api/vocalization/search?source_text_id=abc-123

# Par référence structurée
GET /api/vocalization/search?traite=Sukkah&page=28a

# Avec commentateur
GET /api/vocalization/search?traite=Sukkah&page=28a&commentator=Rashi
```

#### Réponse (trouvée)

```json
{
  "found": true,
  "source_text_id": "uuid-source",
  "reference": "Sukkah 28a",
  "original_text": "בראשית ברא אלהים",
  "hebrew_text": "טקסט עברי...",
  "vocalized_text": "בְּרֵאשִׁית בָּרָא אֱלֹהִים",
  "vocalized_by": "llm:gpt-4o",
  "vocalized_at": "2025-12-28T10:00:00",
  "traite": "Sukkah",
  "page": "28a"
}
```

#### Réponse (non trouvée)

```json
{
  "found": false,
  "source_text_id": null,
  "traite": "Sukkah",
  "page": "28a"
}
```

---

### 9.2 Sauvegarder un texte vocalisé

**POST** `/api/vocalization/save`

Sauvegarde un texte avec nekudot après vocalisation par LLM.

#### Requête

```json
{
  "source_text_id": "29428246-00aa-4755-b402-8e3d8ae4fd52",
  "vocalized_text": "בְּרֵאשִׁית בָּרָא אֱלֹהִים",
  "vocalized_by": "llm:gpt-4o"
}
```

#### Paramètres

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `source_text_id` | UUID | Oui* | UUID du texte source |
| `commentary_id` | UUID | Oui* | UUID du commentaire (alternatif) |
| `vocalized_text` | string | Oui | Texte avec nekudot |
| `vocalized_by` | string | Oui | Source de vocalisation |

*Fournir soit `source_text_id` soit `commentary_id`

#### Valeurs pour `vocalized_by`

| Valeur | Description |
|--------|-------------|
| `llm:gpt-4o` | Vocalisé par GPT-4o |
| `llm:claude-3-5-sonnet` | Vocalisé par Claude |
| `llm:gemini-pro` | Vocalisé par Gemini |
| `manual` | Vocalisation manuelle |
| `sefaria` | Importé de Sefaria |

#### Réponse

```json
{
  "success": true,
  "message": "Vocalisation sauvegardée",
  "source_text_id": "29428246-00aa-4755-b402-8e3d8ae4fd52",
  "vocalized_at": "2025-12-28T23:45:00"
}
```

---

### 9.3 Workflow n8n recommandé pour la vocalisation

```
1. GET /api/talmud/text/{traite}/{page}
   → Récupère source_text_id et hebrew_text

2. GET /api/vocalization/search?source_text_id={uuid}
   → Si found=true : utiliser vocalized_text
   → Si found=false : passer à l'étape 3

3. Appeler le LLM (OpenAI/Claude) pour vocaliser le texte
   → Prompt: "Ajoute les nekudot (voyelles hébraïques) à ce texte: {hebrew_text}"

4. POST /api/vocalization/save
   → Sauvegarder le résultat pour le cache
```

#### Exemple de workflow n8n

```json
{
  "nodes": [
    {
      "name": "Récupérer texte",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "GET",
        "url": "http://torah.solutions:3031/api/talmud/text/Sukkah/28a"
      }
    },
    {
      "name": "Chercher vocalisation existante",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "GET",
        "url": "http://torah.solutions:3031/api/vocalization/search?source_text_id={{ $json.source_text_id }}"
      }
    },
    {
      "name": "IF vocalisation existe",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "boolean": [{"value1": "{{ $json.found }}", "value2": true}]
        }
      }
    },
    {
      "name": "Appeler OpenAI pour vocaliser",
      "type": "n8n-nodes-base.openAi",
      "parameters": {
        "model": "gpt-4o",
        "prompt": "Ajoute les nekudot (voyelles hébraïques) à ce texte. Retourne uniquement le texte vocalisé, sans explication:\n\n{{ $json.hebrew_text }}"
      }
    },
    {
      "name": "Sauvegarder vocalisation",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://torah.solutions:3031/api/vocalization/save",
        "body": {
          "source_text_id": "{{ $json.source_text_id }}",
          "vocalized_text": "{{ $json.choices[0].message.content }}",
          "vocalized_by": "llm:gpt-4o"
        }
      }
    }
  ]
}
```

---

## 10. Colonnes de base de données pour la vocalisation

Les colonnes suivantes ont été ajoutées aux tables `source_texts` et `commentary_details` :

| Colonne | Type | Description |
|---------|------|-------------|
| `vocalized_text` | TEXT | Texte avec nekudot |
| `vocalized_at` | TIMESTAMP | Date de vocalisation |
| `vocalized_by` | VARCHAR(100) | Source (ex: llm:gpt-4o) |

### Requêtes SQL utiles

```sql
-- Compter les textes vocalisés vs non vocalisés
SELECT
    COUNT(*) FILTER (WHERE vocalized_text IS NOT NULL) as with_nekudot,
    COUNT(*) FILTER (WHERE vocalized_text IS NULL) as without_nekudot
FROM source_texts;

-- Récupérer les textes non vocalisés d'un traité
SELECT id, reference, hebrew_text
FROM source_texts
WHERE reference LIKE 'Sukkah%'
  AND vocalized_text IS NULL
ORDER BY reference;
```

---

*Dernière mise à jour : 28 décembre 2025*
