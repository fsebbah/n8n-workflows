# Plan d'Action - Workflows de Traduction Books API

**Date:** 2026-01-04
**Statut:** Planifié
**Équipe:** n8n

---

## Contexte

Création de workflows n8n pour automatiser la traduction des textes via l'API Books (`/api/books/*`). Les workflows calculeront les tokens consommés et les transmettront à l'API pour stockage.

### Prérequis

- [ ] API Books opérationnelle (endpoints `/api/books/*`)
- [ ] Endpoint `/api/translations/save` disponible
- [ ] Endpoint `/api/translations/search` disponible
- [ ] Harmonisation `ref_format` complétée par l'équipe API

### Références

- Documentation API : `docs/issues/BOOKS_API.md`
- Endpoints traductions : `/api/translations/save`, `/api/translations/search`

---

## Phase 1 : Infrastructure de base

**Objectif:** Créer les workflows fondamentaux pour la traduction

### 1.1 Workflow - Translation Job Manager

**Fichier:** `workflows/Torah/books-translation-manager.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Déclencheur | Webhook POST `/webhook/books-translate` |
| Input | `{ project: string, text?: string, chapter?: int }` |
| Output | Job ID, statut |

**Actions:**
1. Valider les paramètres d'entrée
2. Créer un job de traduction en base
3. Déclencher le worker approprié
4. Retourner le job ID

### 1.2 Workflow - Translation Worker

**Fichier:** `workflows/Torah/books-translation-worker.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Déclencheur | Appelé par le Manager |
| Input | Job ID, texte source, référence |
| Output | Traduction + tokens utilisés |

**Actions:**
1. Récupérer le texte source via API Books
2. Vérifier si traduction existe (`/api/translations/search`)
3. Si non traduit → appeler LLM (Claude/GPT)
4. Calculer tokens (input + output)
5. Sauvegarder via `/api/translations/save`
6. Mettre à jour le statut du job

### 1.3 Workflow - Job Status

**Fichier:** `workflows/Torah/books-job-status.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Déclencheur | Webhook GET `/webhook/books-job-status` |
| Input | `job_id` |
| Output | Statut, progression, tokens utilisés |

---

## Phase 2 : Traduction par lots

**Objectif:** Permettre la traduction de chapitres/livres entiers

### 2.1 Workflow - Batch Chapter Translation

**Fichier:** `workflows/Torah/books-translate-chapter.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Input | `text_name`, `chapter` |
| Process | Récupère tous les versets, traduit en batch |
| Output | Nombre traduit, tokens totaux |

**Logique:**
```
1. GET /api/books/{text}/{chapter}?include_translation=false
2. Filtrer versets sans traduction
3. Pour chaque verset (avec gestion ref_format):
   - Si chapter_verse: référence = "Book X:Y"
   - Si chapter_only: référence = "Book X"
4. Appeler LLM avec contexte du chapitre
5. Sauvegarder chaque traduction
6. Calculer tokens totaux
```

### 2.2 Workflow - Batch Book Translation

**Fichier:** `workflows/Torah/books-translate-book.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Input | `text_name` |
| Process | Itère sur tous les chapitres |
| Output | Progression globale |

### 2.3 URL Encoding Helper

**Note:** Tous les workflows doivent encoder les noms de livres :

```javascript
// Dans chaque node Code
const encodedName = encodeURIComponent(textName);
// "The Book of Maccabees II" → "The%20Book%20of%20Maccabees%20II"
```

---

## Phase 3 : Traduction des commentaires

**Objectif:** Étendre aux commentaires (Rashi, Ibn Ezra, etc.)

### 3.1 Workflow - Commentary Translation

**Fichier:** `workflows/Torah/books-translate-commentaries.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Input | `text_name`, `chapter`, `commentator` (optionnel) |
| Process | Traduit les commentaires d'un chapitre |

**Logique:**
```
1. GET /api/books/{text}/{chapter}/commentaries?include_translation=false
2. Optionnel: filtrer par commentator
3. Pour chaque commentaire sans traduction:
   - Récupérer contexte (verset source)
   - Appeler LLM avec prompt spécialisé commentaire
   - Sauvegarder traduction
```

### 3.2 Workflow - Commentator Batch

**Fichier:** `workflows/Torah/books-translate-commentator.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Input | `text_name`, `commentator` |
| Process | Traduit tous les commentaires d'un commentateur pour un livre |

---

## Phase 4 : Monitoring et reporting

**Objectif:** Suivre la progression et les coûts

### 4.1 Workflow - Translation Progress Report

**Fichier:** `workflows/Torah/books-progress-report.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Déclencheur | Cron quotidien ou webhook |
| Output | Rapport JSON/Discord |

**Métriques:**
- Versets traduits / total par projet
- Commentaires traduits / total par commentateur
- Tokens consommés (jour/semaine/mois)
- Coût estimé

### 4.2 Workflow - Quality Alert

**Fichier:** `workflows/Torah/books-quality-alert.json`

| Fonctionnalité | Description |
|----------------|-------------|
| Déclencheur | Après chaque traduction |
| Condition | `quality_score < 0.8` |
| Action | Alerte Discord/Email |

---

## Phase 5 : Intégration Discord (optionnel)

**Objectif:** Permettre le déclenchement via bot Discord

### 5.1 Commande /translate-book

```
/translate-book <text_name> [chapter]
```

### 5.2 Commande /translation-status

```
/translation-status [project]
```

---

## Calcul des Tokens

### Formule

```javascript
// Dans le worker après appel LLM
const tokensInput = response.usage.input_tokens || response.usage.prompt_tokens;
const tokensOutput = response.usage.output_tokens || response.usage.completion_tokens;
const tokensTotal = tokensInput + tokensOutput;

// Payload pour /api/translations/save
{
  "source_text_id": "uuid",
  "translated_text": "...",
  "target_language": "fr",
  "provider": "anthropic",  // ou "openai"
  "model": "claude-3-5-sonnet",
  "tokens_input": tokensInput,
  "tokens_output": tokensOutput,
  "tokens_total": tokensTotal
}
```

### Question pour l'équipe API

L'endpoint `/api/translations/save` accepte-t-il les champs tokens ?

```json
{
  "source_text_id": "uuid",
  "translated_text": "...",
  "target_language": "fr",
  "provider": "openai",
  "model": "gpt-4o",
  "tokens_input": 150,      // Nouveau ?
  "tokens_output": 200,     // Nouveau ?
  "tokens_total": 350       // Nouveau ?
}
```

---

## Livrables par Phase

| Phase | Workflows | Priorité | Dépendances |
|-------|-----------|----------|-------------|
| 1 | Manager, Worker, Status | Haute | API Books, translations |
| 2 | Chapter batch, Book batch | Haute | Phase 1 |
| 3 | Commentary, Commentator batch | Moyenne | Phase 2 |
| 4 | Progress report, Quality alert | Basse | Phase 2 |
| 5 | Discord commands | Optionnel | Phase 1-2 |

---

## Questions ouvertes

1. **Tokens dans l'API** : L'endpoint `/api/translations/save` doit-il être modifié pour accepter les tokens ?

2. **Limites LLM** : Quelle limite de tokens par requête ? (contexte max)

3. **Priorité projets** : Quel projet traduire en premier ? (Second Temple, Breslov, Tanakh ?)

4. **Qualité** : Seuil `quality_score` pour alertes ?

---

## Changelog

| Date | Version | Description |
|------|---------|-------------|
| 2026-01-04 | 0.1.0 | Plan initial créé |

