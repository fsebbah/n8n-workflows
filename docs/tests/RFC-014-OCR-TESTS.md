# RFC-014 : Tests OCR Hébreu/Araméen

**Date :** 2026-01-19
**Phase :** 2.3, 2.4, 2.5
**Branche :** `feat/rfc-014-ocr-tests`

---

## Fichiers de test

| Fichier | Type | Langue | Caractéristiques |
|---------|------|--------|------------------|
| `tests/20260118_141650.jpg` | Image JPG | Hébreu/Araméen | Talmud, 2 colonnes, photo de livre |
| `tests/20260118_141658.jpg` | Image JPG | Hébreu/Araméen | Talmud, texte dense, photo de livre |
| `tests/BRNB42200C3C752_000988.pdf` | PDF 5 pages | Hébreu | "יד דוד" sur Menachot, imprimé clair |

---

## Défis OCR identifiés

### Images (JPG)
- **Éclairage** : Photos prises à la main, ombres possibles
- **Perspective** : Légère distorsion due à l'angle de prise
- **Colonnes multiples** : Mise en page talmudique (texte central + commentaires)
- **Police traditionnelle** : Caractères hébraïques classiques (Rashi, etc.)
- **Araméen mélangé** : Texte en hébreu et araméen dans la même page

### PDF
- **Qualité** : Scan de bonne qualité, texte net
- **Mise en page** : 2 colonnes, notes de bas de page
- **Nikud** : Texte avec/sans voyelles (nekudot)

---

## Configuration OCR recommandée

```json
{
  "plugin_context": {
    "ocr_thresholds": {
      "min_confidence": 0.7,
      "hebrew_min_confidence": 0.6,
      "aramaic_min_confidence": 0.5,
      "retry_on_low_confidence": true
    },
    "detected_language": "hebrew"
  }
}
```

---

## Tests à exécuter

### Test 1 : Image hébreu simple
```bash
curl -X POST http://localhost:5678/webhook/documents/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "file_url": "file:///home/fsebb/n8n-workflows/tests/20260118_141650.jpg",
    "action": "translate",
    "params": { "source_language": "hebrew" },
    "plugin_context": {
      "ocr_thresholds": {
        "hebrew_min_confidence": 0.6
      }
    }
  }'
```

### Test 2 : PDF hébreu multi-pages
```bash
curl -X POST http://localhost:5678/webhook/documents/process \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "test-pdf-hebrew-001",
    "file_url": "file:///home/fsebb/n8n-workflows/tests/BRNB42200C3C752_000988.pdf",
    "action": "translate",
    "params": {
      "target_language": "french",
      "source_language": "hebrew"
    },
    "plugin_context": {
      "api_keys": { "mistral": "YOUR_KEY" },
      "ocr_thresholds": {
        "hebrew_min_confidence": 0.6
      }
    },
    "callback_url": "http://localhost:3000/test-callback"
  }'
```

---

## Métriques à capturer

| Métrique | Description | Seuil acceptable |
|----------|-------------|------------------|
| `ocr_confidence` | Confiance OCR globale | ≥ 0.6 (hébreu), ≥ 0.5 (araméen) |
| `processing_time_ms` | Temps de traitement | < 60000ms/page |
| `tokens_used` | Tokens LLM consommés | Variable |
| `word_count` | Mots extraits | > 0 |

---

## Résultats des tests

### Test 1 : 20260118_141650.jpg (Talmud)

| Métrique | Valeur | Status |
|----------|--------|--------|
| OCR Confidence | _À remplir_ | ⏳ |
| Temps traitement | _À remplir_ | ⏳ |
| Mots extraits | _À remplir_ | ⏳ |
| Qualité texte | _À évaluer_ | ⏳ |

**Observations :**
- _À remplir après test_

### Test 2 : 20260118_141658.jpg (Talmud)

| Métrique | Valeur | Status |
|----------|--------|--------|
| OCR Confidence | _À remplir_ | ⏳ |
| Temps traitement | _À remplir_ | ⏳ |
| Mots extraits | _À remplir_ | ⏳ |
| Qualité texte | _À évaluer_ | ⏳ |

**Observations :**
- _À remplir après test_

### Test 3 : BRNB42200C3C752_000988.pdf (Yad David)

| Métrique | Valeur | Status |
|----------|--------|--------|
| OCR Confidence | _À remplir_ | ⏳ |
| Pages traitées | _À remplir_ / 5 | ⏳ |
| Temps traitement | _À remplir_ | ⏳ |
| Mots extraits | _À remplir_ | ⏳ |
| Qualité texte | _À évaluer_ | ⏳ |

**Observations :**
- _À remplir après test_

---

## Problèmes connus

| Problème | Impact | Workaround |
|----------|--------|------------|
| Colonnes Talmud | OCR peut mélanger les colonnes | Pré-traitement image |
| Rashi script | Police difficile à reconnaître | Modèle spécialisé |
| Araméen | Vocabulaire moins courant | Seuil confiance bas (0.5) |

---

## Prochaines étapes

1. [ ] Activer workflows dans n8n
2. [ ] Exécuter tests avec clé API Mistral
3. [ ] Documenter résultats
4. [ ] Ajuster seuils si nécessaire
5. [ ] Tester traduction hébreu → français

---

## Références

- [RFC-014](../rfc/RFC-014-DOCUMENT-TRANSLATION-SYNTHESIS.md)
- [MCP - Image OCR](../../workflows/MCP/MCP---Image-OCR.json)
- [MCP - PDF Layout Translator](../../workflows/MCP/MCP---PDF-Layout-Translator.json)
