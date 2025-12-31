# API Segments & Commentary Translations

Documentation pour l'équipe workflow n8n.

---

## 1. GET /api/talmud/page/{traite}/{page}/segments

Retourne une page du Talmud segmentée avec traductions et commentaires.

### Request

```
GET /api/talmud/page/Berakhot/2a/segments
GET /api/talmud/page/Berakhot/2a/segments?include_commentaries=true
```

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `traite` | string | requis | Nom du traité (ex: Berakhot, Sukkah) |
| `page` | string | requis | Page (ex: 2a, 2b, 45b) |
| `include_commentaries` | bool | true | Inclure les commentaires |

### Response

```json
{
  "traite": "Berakhot",
  "page": "2a",
  "reference": "Berakhot 2a",
  "source_text_id": "1ff67c44-afae-4942-b6cc-4aa2a1697af4",
  "segments_count": 14,
  "translated_count": 14,
  "commentaries_total": 112,
  "segments": [
    {
      "index": 0,
      "hebrew_text": "מֵאֵימָתַי קוֹרִין את שְׁמַע...",
      "translation": {
        "text": "À partir de quand lit-on le Chema le soir ?...",
        "provider": "claude+openai",
        "model": "claude-sonnet-4+gpt-4o",
        "job_id": "job_5e09cbf8adf6"
      },
      "has_translation": true,
      "commentaries": [
        {
          "id": "a1b2c3d4-...",
          "commentator": "Rashi",
          "segment": 1,
          "reference": "Rashi on Berakhot 2a:1",
          "text": "מצותן – זמן אכילתן:",
          "has_translation": true
        },
        {
          "id": "e5f6g7h8-...",
          "commentator": "Tosafot",
          "segment": 1,
          "reference": "Tosafot on Berakhot 2a:1",
          "text": "...",
          "has_translation": false
        }
      ],
      "commentaries_count": 17
    }
  ]
}
```

### Champs des commentaires

| Champ | Type | Description |
|-------|------|-------------|
| `id` | uuid | Identifiant unique (pour récupérer la traduction) |
| `commentator` | string | Nom du commentateur (Rashi, Tosafot, Steinsaltz...) |
| `segment` | int | Numéro du segment (1-based) |
| `reference` | string | Référence complète |
| `text` | string | Texte du commentaire en hébreu |
| `has_translation` | bool | `true` si une traduction française existe |

---

## 2. POST /api/commentaries/translations

Récupère les traductions de plusieurs commentaires en un seul appel.

### Request

```
POST /api/commentaries/translations
Content-Type: application/json
```

```json
{
  "ids": [
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "b2c3d4e5-f6g7-8901-bcde-f12345678901",
    "c3d4e5f6-g7h8-9012-cdef-123456789012"
  ]
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `ids` | array[uuid] | Liste des IDs de commentaires |

### Response

```json
{
  "translations": {
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890": {
      "text": "La mitsva - le moment de les manger.",
      "provider": "claude+openai",
      "model": "claude-sonnet-4+gpt-4o",
      "translated_at": "2025-12-31T10:30:00Z"
    },
    "b2c3d4e5-f6g7-8901-bcde-f12345678901": {
      "text": "Celui qui fait une soucca pour lui-même...",
      "provider": "claude+openai",
      "model": "claude-sonnet-4+gpt-4o",
      "translated_at": "2025-12-30T14:20:00Z"
    },
    "c3d4e5f6-g7h8-9012-cdef-123456789012": null
  },
  "found": 2,
  "not_found": 1
}
```

### Champs de réponse

| Champ | Type | Description |
|-------|------|-------------|
| `translations` | object | Map id → traduction (ou `null` si pas de traduction) |
| `found` | int | Nombre de traductions trouvées |
| `not_found` | int | Nombre de commentaires sans traduction |

### Champs d'une traduction

| Champ | Type | Description |
|-------|------|-------------|
| `text` | string | Texte traduit en français |
| `provider` | string | Provider LLM utilisé |
| `model` | string | Modèle utilisé |
| `translated_at` | string | Date ISO de la traduction |

---

## 3. Workflow recommandé

### Affichage initial d'une page

```
1. GET /api/talmud/page/Berakhot/2a/segments
   → Affiche les segments avec traductions
   → Liste les commentaires avec has_translation
```

### Quand l'utilisateur clique sur un segment

```
2. POST /api/commentaries/translations
   Body: { "ids": ["uuid1", "uuid2", ...] }  // IDs des commentaires du segment
   → Récupère toutes les traductions en un appel
   → Affiche les traductions disponibles
```

### Exemple complet

```javascript
// 1. Charger la page
const page = await fetch('/api/talmud/page/Berakhot/2a/segments').then(r => r.json());

// 2. Afficher les segments...

// 3. Quand l'utilisateur clique sur segment 0
const segment = page.segments[0];
const idsWithTranslation = segment.commentaries
  .filter(c => c.has_translation)
  .map(c => c.id);

if (idsWithTranslation.length > 0) {
  const translations = await fetch('/api/commentaries/translations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: idsWithTranslation })
  }).then(r => r.json());

  // 4. Afficher les traductions
}
```

---

## 4. Codes d'erreur

| Code | Description |
|------|-------------|
| 200 | Succès |
| 400 | Paramètres manquants ou invalides |
| 404 | Page ou traité non trouvé |
| 500 | Erreur serveur |

---

## 5. Notes

- Les commentaires sont triés par `segment`, puis par `commentator`
- Le champ `segment` des commentaires est 1-based (correspond à index + 1)
- Les traductions sont stockées dans `commentary_details.extra_data['translation']`
- Maximum recommandé : 50 IDs par appel batch
