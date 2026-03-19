# Extension i18n du webhook `llm-intention`

> Ajouter `language_preference` et `source_preference` à `query_analysis`

## Webhook concerné

```
POST /webhook/llm-intention
```

## Problème

Requête utilisateur :
```
"cherche les recettes de tortillas sur des sites de cuisine espagnole. Réponds en espagnol."
```

Réponse actuelle de `query_analysis` :
```json
{
  "extracted_terms": "tortillas"
}
```

**Perdu** : "sites espagnols" et "réponds en espagnol"

---

## Modification demandée

### Nouvelle structure `query_analysis`

```json
{
  "query_analysis": {
    "original_query": "tortillas sur sites espagnols, réponds en espagnol",
    "extracted_terms": "tortillas",
    "reformulation": null,
    "spelling_corrected": false,
    "language_preference": "es",
    "source_preference": "espagnol"
  }
}
```

### Champs à ajouter/modifier

| Champ | Type | Description | Action |
|-------|------|-------------|--------|
| `language_preference` | `string \| null` | Code ISO de la langue demandée (`"es"`, `"en"`, `"de"`, etc.) | **Ajouter** |
| `source_preference` | `string \| null` | Type de cuisine/source demandé (`"espagnol"`, `"italien"`, etc.) | **Ajouter** |
| `original_query` | `string` | Requête originale de l'utilisateur (= votre champ `original` actuel) | **Renommer** `original` → `original_query` |

---

## Ajout au prompt LLM

Ajouter cette section au prompt de `llm-intention` :

```
## PRÉFÉRENCES UTILISATEUR

### language_preference
L'utilisateur demande-t-il une réponse dans une langue spécifique ?

Déclencheurs → Valeur :
- "réponds en espagnol", "en español" → "es"
- "réponds en anglais", "in English" → "en"
- "réponds en allemand", "auf Deutsch" → "de"
- "réponds en italien", "in italiano" → "it"
- Aucune indication → null

### source_preference
L'utilisateur demande-t-il des recettes d'une source/cuisine spécifique ?

Déclencheurs → Valeur :
- "sur des sites espagnols", "cuisine espagnole" → "espagnol"
- "sur des sites italiens", "recettes italiennes" → "italien"
- Aucune indication → null

IMPORTANT : Distinguer le PLAT de la SOURCE demandée.
- "tortillas espagnoles" → source_preference: null (qualifie le plat)
- "tortillas sur sites espagnols" → source_preference: "espagnol" (demande explicite)
```

---

## Exemples

### Langue + Source
```
Input:  "tortillas sur sites espagnols, réponds en espagnol"
Output: { "language_preference": "es", "source_preference": "espagnol" }
```

### Langue seule
```
Input:  "recette de pizza, respond in English"
Output: { "language_preference": "en", "source_preference": null }
```

### Aucune préférence
```
Input:  "recette de paella espagnole"
Output: { "language_preference": null, "source_preference": null }
```

---

## Rétrocompatibilité

Si les champs ne sont pas retournés, le plugin utilise ses propres détections (fallback). Pas de breaking change.
