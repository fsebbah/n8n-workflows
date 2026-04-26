# Guide: Traduction avec pivot anglais (EN-pivot)

Ce guide explique le nouveau système de traduction avec référence anglaise pour les équipes plugin.

**Dernière mise à jour:** 2026-04-26
**RFC:** `docs/rfc/RFC-bilingual-translations-en-pivot.md`
**PR:** #341

---

## 1. Résumé

Les traductions utilisent désormais la traduction anglaise Sefaria/Koren comme **pivot de désambiguïsation** pour améliorer la qualité des traductions vers le français (ou autre langue cible).

### Avant (HE → FR direct)
```
Hébreu → LLM → Français
```

### Après (HE + EN → FR)
```
Hébreu + Anglais (Sefaria) → LLM → Français
```

**Bénéfice** : Terminologie cohérente, noms propres standardisés, moins d'ambiguïtés.

---

## 2. Principe clé

> "Si l'hébreu est ambigu, utiliser l'anglais comme **indice de désambiguïsation**, pas comme vérité absolue."

L'anglais sert de **repère terminologique**, pas de source d'autorité. Le traducteur LLM conserve une marge d'interprétation alignée sur les conventions francophones.

---

## 3. Champs API modifiés

### 3.1 GET /webhook/torah-get-page-translations

**Nouveau champ dans chaque segment** :

```json
{
  "segments": [
    {
      "segment_id": "uuid",
      "hebrew_text": "...",
      "translation": { "text": "...", "version": 3 },
      "reference_translation": {
        "translated_text": "The English translation from Sefaria/Koren",
        "language": "en",
        "source": "sefaria",
        "is_reference": true
      }
    }
  ]
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `reference_translation` | object \| null | Traduction EN de référence (si disponible) |
| `reference_translation.translated_text` | string | Texte EN Sefaria/Koren |
| `reference_translation.language` | string | Toujours `"en"` |
| `reference_translation.source` | string | `"sefaria"` ou `"koren"` |
| `reference_translation.is_reference` | boolean | Toujours `true` |

**Note** : `reference_translation` peut être `null` si aucune traduction EN n'existe pour ce segment.

### 3.2 POST /webhook/torah-translate-page

**Aucun changement côté requête.** Le workflow extrait automatiquement `reference_translation` des segments API.

### 3.3 Réponse de traduction enrichie

La réponse de traduction inclut maintenant :

```json
{
  "success": true,
  "translation": "La traduction française...",
  "method": "en_pivot",
  "used_en_reference": true,
  "tokens": {
    "input_tokens": 450,
    "output_tokens": 380
  }
}
```

| Champ | Valeurs | Description |
|-------|---------|-------------|
| `method` | `"en_pivot"` \| `"direct"` \| `"pivot"` | Méthode de traduction utilisée |
| `used_en_reference` | boolean | `true` si EN Sefaria utilisé |

---

## 4. Comportement du workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    Torah_Translate_Simple                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  reference_translation existe ?                              │
│        │                                                     │
│        ├── OUI → Prompt EN-pivot (1 appel LLM)              │
│        │         HE + EN → target_language                   │
│        │         method: "en_pivot"                          │
│        │                                                     │
│        └── NON → Comportement précédent                      │
│                  ├── needsPivot=true → 2 appels (HE→EN→FR)  │
│                  │                     method: "pivot"       │
│                  └── needsPivot=false → 1 appel direct       │
│                                        method: "direct"      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Prompt LLM (RFC §15.4)

Quand `reference_translation` est disponible, le prompt utilisé est :

```
Translate the following Hebrew Talmudic passage to {target_language}.
Use the official Sefaria/Koren English translation as a reference
for terminology, proper nouns, and disambiguation.

## Hebrew Source
{hebrew_text}

## Reference Translation (English, Sefaria/Koren)
{reference_translation}

## Instructions
- Maintain the same meaning as the Hebrew source
- Use standard {target_language} Talmudic terminology
- Preserve proper nouns as transliterated in the English reference
- If the Hebrew is ambiguous, use the English as a disambiguation hint,
  not as ground truth

Provide the {target_language} translation:
```

---

## 6. Impact côté plugin

### 6.1 Aucune action requise

Le changement est **transparent** pour les plugins existants :
- Les requêtes restent identiques
- Le workflow gère automatiquement le pivot EN

### 6.2 Optionnel : afficher la méthode

Les plugins peuvent optionnellement afficher la méthode utilisée :

```javascript
// Exemple Discord
const methodLabel = {
  'en_pivot': '🇬🇧 Traduit avec référence Sefaria',
  'direct': '📝 Traduction directe',
  'pivot': '🔄 Traduction via pivot EN'
};

embed.setFooter({ text: methodLabel[response.method] });
```

### 6.3 Optionnel : bouton "Voir référence EN"

Phase 2 (future) : possibilité d'ajouter un bouton Discord pour afficher la traduction EN de référence.

---

## 7. Couverture des traductions EN

| Corpus | Couverture EN estimée | Source |
|--------|----------------------|--------|
| Bavli | ~85% | Sefaria (William Davidson) |
| Mishna | ~95% | Sefaria |
| Yerushalmi | ~40% | Sefaria (partiel) |
| Midrash | ~60% | Sefaria |

**Fallback** : Si `reference_translation` est `null`, le workflow utilise la traduction directe ou le pivot 2-étapes.

---

## 8. Breaking change : target_language requis

**IMPORTANT** : `target_language` est désormais **obligatoire** dans les requêtes.

```json
// ✅ Correct
{ "traite": "Berakhot", "page": "2a", "target_language": "fr" }

// ❌ Erreur HTTP 422
{ "traite": "Berakhot", "page": "2a" }
```

**Erreur retournée si absent** :
```json
{
  "error": {
    "code": "INVALID_QUERY_PARAMETER",
    "message": "target_language is required",
    "hint": "Add ?target_language=fr (or en, es, de, it)"
  }
}
```

---

## 9. Endpoints concernés

| Endpoint | Changement |
|----------|------------|
| `GET /webhook/torah-get-page-translations` | Nouveau champ `reference_translation` |
| `POST /webhook/torah-translate-page` | Utilise `reference_translation` automatiquement |
| `GET /webhook/torah-job-status` | Inchangé |
| `POST /webhook/torah-router` | Propage `reference_translation` |

---

## 10. Tests recommandés

### 10.1 Segment avec EN disponible

```bash
curl -X POST http://pi6.local:5678/webhook/torah-translate-page \
  -H "Content-Type: application/json" \
  -d '{
    "traite": "Pesachim",
    "page": "6a",
    "target_language": "fr",
    "api_key": "sk-ant-...",
    "openai_api_key": "sk-...",
    "job_type": "page_translation"
  }'
```

**Attendu** : `method: "en_pivot"`, `used_en_reference: true`

### 10.2 Segment sans EN

Tester avec un traité Yerushalmi peu couvert :

```bash
curl -X POST http://pi6.local:5678/webhook/torah-translate-page \
  -H "Content-Type: application/json" \
  -d '{
    "traite": "Shekalim",
    "page": "2a",
    "corpus": "Yerushalmi",
    "target_language": "fr",
    "api_key": "sk-ant-...",
    "openai_api_key": "sk-...",
    "job_type": "page_translation"
  }'
```

**Attendu** : `method: "direct"` ou `"pivot"`, `used_en_reference: false`

---

## 11. FAQ

### Q: La traduction EN est-elle affichée à l'utilisateur ?

**Non** (Phase 1). L'anglais est utilisé uniquement en interne par le LLM. L'utilisateur ne voit que la traduction finale en langue cible.

### Q: Que se passe-t-il si la traduction EN est incorrecte ?

Le prompt indique au LLM d'utiliser l'EN comme "hint", pas comme vérité. Le LLM peut diverger si l'hébreu est plus clair.

### Q: Les tokens consommés augmentent-ils ?

Oui, légèrement (~20% de tokens input en plus). Mais on économise le 2ème appel LLM du pivot, donc le coût total est souvent **inférieur**.

### Q: Comment savoir si un segment a une référence EN ?

Vérifier `segment.reference_translation !== null` dans la réponse de `/torah-get-page-translations`.

---

## 12. Changelog

| Date | Version | Changement |
|------|---------|------------|
| 2026-04-26 | 1.0 | Implémentation Phase 1 (PR #341) |

---

*Documentation maintenue par l'équipe n8n — Contact: @fsebbah*
