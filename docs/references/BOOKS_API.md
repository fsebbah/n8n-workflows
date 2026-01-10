# API Books - Documentation Complète

Documentation complète des endpoints `/api/books` pour l'accès aux livres (hors Talmud).

---

## 1. URL de Base

```
Production : http://torah.solutions:3031
Développement : http://localhost:3031
```

---

## 2. Vue d'ensemble

L'API Books permet d'accéder aux livres (Tanakh, Breslov, Second Temple, etc.) et leurs commentaires. Pour le Talmud, utilisez `/api/talmud`.

### Deux formats de référence supportés

| Format | Exemple | Description |
|--------|---------|-------------|
| `chapitre:verset` | `Genesis 1:1`, `The Book of Maccabees II 1:1` | Format standard avec verset |
| `chapitre seul` | `Chayei Moharan 107`, `Sippurei Maasiyot 1` | Format sans verset |

L'API détecte automatiquement le format utilisé.

---

## 3. Endpoints - Projets et Livres

### 3.1 Lister les projets

**GET** `/api/books/projects`

Retourne tous les projets de type livre (exclut automatiquement le Talmud).

#### Réponse

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Second Temple",
      "sefaria_ref": "Second Temple",
      "text_type": "book_verse",
      "source_language": "he",
      "target_language": "fr",
      "status": "active",
      "texts_count": 660,
      "translations_count": 45
    },
    {
      "id": "uuid",
      "name": "Breslov",
      "sefaria_ref": "Breslov",
      "text_type": "book_chapter",
      "source_language": "he",
      "target_language": "fr",
      "status": "active",
      "texts_count": 1200,
      "translations_count": 300
    }
  ],
  "total": 2
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique du projet |
| `name` | string | Nom du projet |
| `sefaria_ref` | string | Référence Sefaria |
| `text_type` | string | `book_verse` ou `book_chapter` |
| `source_language` | string | Langue source (he) |
| `target_language` | string | Langue cible (fr) |
| `texts_count` | integer | Nombre de textes sources |
| `translations_count` | integer | Nombre de traductions |

---

### 3.2 État global des traductions

**GET** `/api/books/translation-status`

Statistiques de traduction pour tous les projets de type livre.

#### Réponse

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Second Temple",
      "text_type": "book_verse",
      "texts_total": 1,
      "verses_total": 660,
      "verses_translated": 45,
      "progress_percent": 6.8
    }
  ],
  "summary": {
    "projects_count": 5,
    "verses_total": 15000,
    "verses_translated": 2500,
    "progress_percent": 16.7
  }
}
```

---

### 3.3 Lister les textes d'un projet

**GET** `/api/books/project/{project_name}/texts`

Liste tous les livres d'un projet avec leurs statistiques.

#### Paramètres URL

| Paramètre | Type | Description |
|-----------|------|-------------|
| `project_name` | string | Nom du projet (ex: "Second Temple", "Breslov") |

#### Exemple

```bash
GET /api/books/project/Second Temple/texts
```

#### Réponse

```json
{
  "project": "Second Temple",
  "project_id": "uuid",
  "texts": [
    {
      "name": "The Book of Maccabees II",
      "chapters": 15,
      "verses_total": 660,
      "verses_translated": 45,
      "ref_format": "chapter_verse"
    },
    {
      "name": "The Book of Jubilees",
      "chapters": 50,
      "verses_total": 2043,
      "verses_translated": 0,
      "ref_format": "chapter_verse"
    }
  ],
  "total": 2
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `ref_format` | string | `chapter_verse` ou `chapter_only` |

---

### 3.4 Lister les chapitres d'un livre

**GET** `/api/books/{text_name}/chapters`

Liste tous les chapitres d'un livre avec statistiques.

#### Paramètres URL

| Paramètre | Type | Description |
|-----------|------|-------------|
| `text_name` | string | Nom exact du livre (ex: "The Book of Maccabees II") |

#### Exemple

```bash
GET /api/books/The Book of Maccabees II/chapters
```

#### Réponse

```json
{
  "text": "The Book of Maccabees II",
  "ref_format": "chapter_verse",
  "chapters": [
    {"chapter": 1, "verses": 41, "translated": 10},
    {"chapter": 2, "verses": 35, "translated": 5},
    {"chapter": 3, "verses": 40, "translated": 0}
  ],
  "total_chapters": 15,
  "total_verses": 660,
  "total_translated": 15
}
```

---

### 3.5 État des traductions d'un livre

**GET** `/api/books/{text_name}/translation-status`

Détail des traductions chapitre par chapitre.

#### Exemple

```bash
GET /api/books/The Book of Maccabees II/translation-status
```

#### Réponse

```json
{
  "text": "The Book of Maccabees II",
  "chapters_total": 15,
  "verses_total": 660,
  "verses_translated": 45,
  "progress_percent": 6.8,
  "chapters": [
    {"chapter": 1, "verses_total": 41, "verses_translated": 10},
    {"chapter": 2, "verses_total": 35, "verses_translated": 5}
  ]
}
```

---

## 4. Endpoints - Contenu (Versets)

### 4.1 Récupérer un chapitre

**GET** `/api/books/{text_name}/{chapter}`

Retourne le contenu complet d'un chapitre avec traductions.

#### Paramètres URL

| Paramètre | Type | Description |
|-----------|------|-------------|
| `text_name` | string | Nom du livre |
| `chapter` | integer | Numéro du chapitre |

#### Paramètres Query

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `include_translation` | boolean | true | Inclure les traductions |

#### Exemple

```bash
GET /api/books/The Book of Maccabees II/1
GET /api/books/Chayei Moharan/107
```

#### Réponse (format chapitre:verset)

```json
{
  "text": "The Book of Maccabees II",
  "chapter": 1,
  "ref_format": "chapter_verse",
  "verses": [
    {
      "id": "uuid",
      "verse": 1,
      "reference": "The Book of Maccabees II 1:1",
      "hebrew_text": "...",
      "text": "...",
      "position": 1001,
      "translated": true,
      "translation": {
        "id": "uuid",
        "translated_text": "...",
        "provider": "openai",
        "model": "gpt-4o",
        "version": 1,
        "quality_score": 0.92
      }
    }
  ],
  "total": 41,
  "translated_count": 10
}
```

#### Réponse (format chapitre seul)

```json
{
  "text": "Chayei Moharan",
  "chapter": 107,
  "ref_format": "chapter_only",
  "verses": [
    {
      "id": "uuid",
      "verse": 0,
      "reference": "Chayei Moharan 107",
      "hebrew_text": "...",
      "text": "...",
      "position": 107,
      "translated": false,
      "translation": null
    }
  ],
  "total": 1,
  "translated_count": 0
}
```

---

### 4.2 Récupérer un verset

**GET** `/api/books/{text_name}/{chapter}/{verse}`

Retourne un verset spécifique avec sa traduction (format chapitre:verset uniquement).

#### Paramètres URL

| Paramètre | Type | Description |
|-----------|------|-------------|
| `text_name` | string | Nom du livre |
| `chapter` | integer | Numéro du chapitre |
| `verse` | integer | Numéro du verset |

#### Exemple

```bash
GET /api/books/The Book of Maccabees II/1/1
```

#### Réponse

```json
{
  "id": "uuid",
  "reference": "The Book of Maccabees II 1:1",
  "hebrew_text": "...",
  "text": "...",
  "position": 1001,
  "extra_data": null,
  "project_id": "uuid",
  "translation": {
    "id": "uuid",
    "translated_text": "...",
    "provider": "openai",
    "model": "gpt-4o",
    "version": 1,
    "quality_score": 0.92,
    "created_at": "2025-12-28T10:00:00"
  }
}
```

---

## 5. Endpoints - Commentaires

### 5.1 Lister les commentateurs

**GET** `/api/books/{text_name}/commentators`

Liste les commentateurs disponibles pour un livre.

#### Exemple

```bash
GET /api/books/Genesis/commentators
```

#### Réponse

```json
{
  "text": "Genesis",
  "commentators": [
    {"name": "Rashi", "count": 1533},
    {"name": "Ibn Ezra", "count": 890},
    {"name": "Ramban", "count": 756}
  ],
  "total_commentaries": 3179
}
```

---

### 5.2 Statut des traductions des commentaires

**GET** `/api/books/{text_name}/commentaries/status`

Progression des traductions par commentateur.

#### Exemple

```bash
GET /api/books/Genesis/commentaries/status
```

#### Réponse

```json
{
  "text": "Genesis",
  "commentators": [
    {
      "name": "Rashi",
      "total": 1533,
      "translated": 450,
      "progress_percent": 29.4
    },
    {
      "name": "Ibn Ezra",
      "total": 890,
      "translated": 200,
      "progress_percent": 22.5
    }
  ],
  "summary": {
    "total_commentaries": 2423,
    "total_translated": 650,
    "progress_percent": 26.8
  }
}
```

---

### 5.3 Commentaires d'un chapitre

**GET** `/api/books/{text_name}/{chapter}/commentaries`

Retourne tous les commentaires d'un chapitre.

#### Paramètres Query

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `commentator` | string | null | Filtrer par commentateur |
| `include_translation` | boolean | true | Inclure les traductions |

#### Exemples

```bash
GET /api/books/Genesis/1/commentaries
GET /api/books/Genesis/1/commentaries?commentator=Rashi
GET /api/books/Genesis/1/commentaries?include_translation=false
```

#### Réponse

```json
{
  "text": "Genesis",
  "chapter": 1,
  "commentaries": [
    {
      "id": "uuid",
      "source_text_id": "uuid",
      "commentator": "Rashi",
      "reference": "Genesis 1:1",
      "text": "...",
      "hebrew_text": "...",
      "verse": 1,
      "position": 1,
      "has_translation": true,
      "translation": {
        "id": "uuid",
        "translated_text": "...",
        "provider": "openai",
        "model": "gpt-4o"
      }
    }
  ],
  "total": 45,
  "commentators": ["Ibn Ezra", "Ramban", "Rashi"]
}
```

---

### 5.4 Commentaires d'un verset

**GET** `/api/books/{text_name}/{chapter}/{verse}/commentaries`

Commentaires d'un verset spécifique (format chapitre:verset uniquement).

#### Paramètres Query

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `commentator` | string | null | Filtrer par commentateur |
| `include_translation` | boolean | true | Inclure les traductions |

#### Exemple

```bash
GET /api/books/Genesis/1/1/commentaries
GET /api/books/Genesis/1/1/commentaries?commentator=Rashi
```

#### Réponse

```json
{
  "text": "Genesis",
  "chapter": 1,
  "verse": 1,
  "reference": "Genesis 1:1",
  "source_text_id": "uuid",
  "commentaries": [
    {
      "id": "uuid",
      "commentator": "Rashi",
      "reference": "Genesis 1:1",
      "text": "...",
      "hebrew_text": "...",
      "vocalized_text": null,
      "position": 1,
      "has_translation": true,
      "translation": {
        "id": "uuid",
        "translated_text": "...",
        "provider": "openai",
        "model": "gpt-4o",
        "version": 1,
        "quality_score": 0.92
      }
    }
  ],
  "total": 5
}
```

---

### 5.5 Détail d'un commentaire

**GET** `/api/books/commentary/{commentary_id}`

Détails complets d'un commentaire par UUID.

#### Exemple

```bash
GET /api/books/commentary/550e8400-e29b-41d4-a716-446655440000
```

#### Réponse

```json
{
  "id": "uuid",
  "source_text_id": "uuid",
  "commentator": "Rashi",
  "reference": "Genesis 1:1",
  "text": "...",
  "hebrew_text": "...",
  "vocalized_text": null,
  "segment": null,
  "sub_segment": null,
  "position": 1,
  "extra_data": null,
  "created_at": "2025-12-28T10:00:00",
  "has_translation": true,
  "translation": {
    "id": "uuid",
    "translated_text": "...",
    "provider": "openai",
    "model": "gpt-4o",
    "version": 1,
    "quality_score": 0.92
  }
}
```

---

## 6. Tableau récapitulatif des endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/books/projects` | GET | Liste des projets de type livre |
| `/api/books/translation-status` | GET | État global des traductions |
| `/api/books/project/{name}/texts` | GET | Liste des livres d'un projet |
| `/api/books/{text}/chapters` | GET | Liste des chapitres d'un livre |
| `/api/books/{text}/translation-status` | GET | État des traductions d'un livre |
| `/api/books/{text}/{chapter}` | GET | Contenu d'un chapitre |
| `/api/books/{text}/{chapter}/{verse}` | GET | Contenu d'un verset |
| `/api/books/{text}/commentators` | GET | Liste des commentateurs |
| `/api/books/{text}/commentaries/status` | GET | Progression des traductions commentaires |
| `/api/books/{text}/{chapter}/commentaries` | GET | Commentaires d'un chapitre |
| `/api/books/{text}/{chapter}/{verse}/commentaries` | GET | Commentaires d'un verset |
| `/api/books/commentary/{id}` | GET | Détail d'un commentaire |

---

## 7. Workflow de traduction

### 7.1 Traduire les versets

```
1. GET /api/books/projects
   → Récupérer la liste des projets

2. GET /api/books/project/{name}/texts
   → Récupérer la liste des livres

3. GET /api/books/{text}/chapters
   → Voir les chapitres et leur progression

4. GET /api/books/{text}/{chapter}?include_translation=false
   → Récupérer les versets à traduire

5. Pour chaque verset non traduit:
   POST /api/translations/save
   {
     "source_text_id": "{verse.id}",
     "translated_text": "...",
     "target_language": "fr",
     "provider": "openai",
     "model": "gpt-4o"
   }
```

### 7.2 Traduire les commentaires

```
1. GET /api/books/{text}/commentators
   → Liste des commentateurs disponibles

2. GET /api/books/{text}/commentaries/status
   → Progression par commentateur

3. GET /api/books/{text}/{chapter}/commentaries?commentator=Rashi
   → Récupérer les commentaires d'un chapitre

4. Pour chaque commentaire sans traduction:
   a. GET /api/translations/search?source_text_id={commentary.id}
      → Vérifier si une traduction existe

   b. POST /api/translations/save
      {
        "source_text_id": "{commentary.id}",
        "translated_text": "...",
        "target_language": "fr",
        "provider": "openai",
        "model": "gpt-4o"
      }
```

---

## 8. Codes d'erreur

| Code | Description |
|------|-------------|
| 200 | Succès |
| 404 | Livre, chapitre, verset ou commentaire non trouvé |
| 422 | Paramètres invalides (ex: UUID mal formé) |
| 500 | Erreur serveur |

---

## 9. Exemples curl

### Lister les projets

```bash
curl -s "http://torah.solutions:3031/api/books/projects" | jq
```

### Lister les livres d'un projet

```bash
curl -s "http://torah.solutions:3031/api/books/project/Second%20Temple/texts" | jq
```

### Récupérer un chapitre

```bash
curl -s "http://torah.solutions:3031/api/books/The%20Book%20of%20Maccabees%20II/1" | jq
```

### Récupérer un verset

```bash
curl -s "http://torah.solutions:3031/api/books/Genesis/1/1" | jq
```

### Récupérer les commentaires d'un verset

```bash
curl -s "http://torah.solutions:3031/api/books/Genesis/1/1/commentaries" | jq
```

### Sauvegarder une traduction

```bash
curl -X POST "http://torah.solutions:3031/api/translations/save" \
  -H "Content-Type: application/json" \
  -d '{
    "source_text_id": "uuid",
    "translated_text": "Traduction...",
    "target_language": "fr",
    "provider": "openai",
    "model": "gpt-4o"
  }' | jq
```

---

## 10. Changelog

| Date | Version | Description |
|------|---------|-------------|
| 2026-01-03 | 1.1.0 | Documentation complète de tous les endpoints |
| 2026-01-02 | 1.0.0 | Création des 5 endpoints de commentaires (PR #177) |

---

*Documentation pour PR #177 - API Books*
