# API Texts - Nouveaux Endpoints

> **Status:** En attente de déploiement sur torah.api

## Vue d'ensemble

Nouveaux endpoints pour accéder aux textes par projet (Maccabees, etc.) avec une structure chapitre/verset.

**Base URL:** `http://pi6.local:3031`

---

## Endpoints disponibles

| Endpoint | Description |
|----------|-------------|
| `GET /api/texts/projects` | Liste des projets disponibles |
| `GET /api/texts/project/{name}/texts` | Textes d'un projet |
| `GET /api/texts/{text}/chapters` | Chapitres d'un livre |
| `GET /api/texts/{text}/translation-status` | État des traductions |
| `GET /api/texts/{text}/{chapter}` | Versets d'un chapitre |
| `GET /api/texts/{text}/{chapter}/{verse}` | Un verset spécifique |

---

## Détail des endpoints

### 1. Liste des projets

```bash
GET /api/texts/projects
```

**Exemple:**
```bash
curl http://pi6.local:3031/api/texts/projects
```

**Réponse attendue:**
```json
{
  "projects": [
    "Maccabees",
    "..."
  ]
}
```

---

### 2. Textes d'un projet

```bash
GET /api/texts/project/{name}/texts
```

**Paramètres:**
- `name`: Nom du projet (ex: "Maccabees")

**Exemple:**
```bash
curl http://pi6.local:3031/api/texts/project/Maccabees/texts
```

---

### 3. Chapitres d'un livre

```bash
GET /api/texts/{text}/chapters
```

**Paramètres:**
- `text`: Nom complet du texte (URL encoded)

**Exemple:**
```bash
curl "http://pi6.local:3031/api/texts/The%20Book%20of%20Maccabees%20II/chapters"
```

**Réponse attendue:**
```json
{
  "text": "The Book of Maccabees II",
  "chapters": [1, 2, 3, 4, 5, ...]
}
```

---

### 4. État des traductions

```bash
GET /api/texts/{text}/translation-status
```

**Paramètres:**
- `text`: Nom complet du texte

**Exemple:**
```bash
curl "http://pi6.local:3031/api/texts/The%20Book%20of%20Maccabees%20II/translation-status"
```

**Réponse attendue:**
```json
{
  "text": "The Book of Maccabees II",
  "total_verses": 100,
  "translated": 25,
  "pending": 75,
  "percentage": 25
}
```

---

### 5. Versets d'un chapitre

```bash
GET /api/texts/{text}/{chapter}
```

**Paramètres:**
- `text`: Nom complet du texte
- `chapter`: Numéro du chapitre

**Exemple:**
```bash
curl "http://pi6.local:3031/api/texts/The%20Book%20of%20Maccabees%20II/1"
```

**Réponse attendue:**
```json
{
  "text": "The Book of Maccabees II",
  "chapter": 1,
  "verses": [
    {
      "verse": 1,
      "content": "...",
      "translated": false
    },
    ...
  ]
}
```

---

### 6. Verset spécifique

```bash
GET /api/texts/{text}/{chapter}/{verse}
```

**Paramètres:**
- `text`: Nom complet du texte
- `chapter`: Numéro du chapitre
- `verse`: Numéro du verset

**Exemple:**
```bash
curl "http://pi6.local:3031/api/texts/The%20Book%20of%20Maccabees%20II/1/1"
```

**Réponse attendue:**
```json
{
  "text": "The Book of Maccabees II",
  "chapter": 1,
  "verse": 1,
  "content": "...",
  "translation": null,
  "translated": false
}
```

---

## Workflow n8n à créer

### Objectif
Créer un workflow n8n pour exposer ces endpoints via webhook Discord.

### Endpoints webhook proposés

| Webhook | Fonction |
|---------|----------|
| `GET /webhook/torah-texts-projects` | Liste des projets |
| `GET /webhook/torah-texts-status?text={name}` | Statut traduction d'un texte |
| `GET /webhook/torah-texts-chapter?text={name}&chapter={n}` | Versets d'un chapitre |

### Format de réponse pour le bot

```json
{
  "success": true,
  "statistics": {
    "total_verses": 100,
    "translated": 25,
    "percentage": 25
  },
  "text": "The Book of Maccabees II",
  "chapters": [1, 2, 3, ...],
  "discord": null
}
```

---

## Notes d'implémentation

1. **URL Encoding**: Les noms de textes contiennent des espaces, utiliser `encodeURIComponent()`
2. **Gestion d'erreurs**: Retourner `success: false` avec message d'erreur si texte non trouvé
3. **Cache**: Considérer un cache pour les listes de projets/chapitres (données statiques)

---

## Priorité

- [ ] Workflow liste des projets
- [ ] Workflow statut traduction par texte
- [ ] Workflow lecture chapitre/verset
- [ ] Intégration Discord Bot

---

## Liens

- API Base: `http://pi6.local:3031`
- Workflow existant: `Torah Translation Status` (modèle)
