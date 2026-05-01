# Stratégie de couverture et stockage de l'EN-pivot

**Statut** : Draft à valider par les équipes data + n8n
**Auteur** : équipe API
**Date** : 2026-04-26
**RFC source** : [`docs/rfc/RFC-bilingual-translations-en-pivot.md`](../rfc/RFC-bilingual-translations-en-pivot.md)
**Endpoint impacté** : `GET /api/talmud/page/{traite}/{page}/segments` (déjà mergé)
**Ticket connexe** : à créer

---

## 1. Contexte

La RFC `bilingual-translations-en-pivot` a été déployée (PR #289 + #290 mergées). Le contrat fonctionne : `reference_translation` est exposé sur chaque segment, alimenté par les lignes `translations_v2.is_reference = true` filtrées sur `target_language = 'en'`.

Lors du smoke test post-merge sur prod (2026-04-26), nous avons mesuré la couverture EN-pivot par corpus :

| Corpus | Segments | EN refs | % couverture |
|---|---:|---:|---:|
| **Tanakh** | 23 206 | 23 204 | **100.0%** |
| Bavli | 39 228 | **0** | **0.0%** |
| Yerushalmi | 12 522 | 0 | 0.0% |
| Chasidut Breslov | 10 459 | 0 | 0.0% |
| Mishnah | 4 708 | 0 | 0.0% |
| Midrash | 4 228 | 0 | 0.0% |
| Second Temple | 2 416 | 0 | 0.0% |
| Shulchan Arukh | 1 923 | 0 | 0.0% |
| Kabbalah | 710 | 0 | 0.0% |
| Jewish Thought | 67 | 0 | 0.0% |
| **Total non-Tanakh** | **76 261** | **0** | **0.0%** |

**Constat** : 76% du corpus exposé par l'API n'a aujourd'hui **aucune** traduction EN-pivot. Le bénéfice qualité de la RFC (utiliser l'EN comme contexte pivot pour les prompts LLM) **ne s'applique qu'au Tanakh** en l'état.

---

## 2. Pourquoi un import bulk Sefaria ne suffira pas

L'option naturelle serait de répliquer la stratégie `import_tanakh.py` (Koren EN bulk) pour les autres corpus. Problème : la couverture EN de Sefaria est **incomplète et hétérogène** :

| Corpus | Source EN Sefaria principale | Couverture | Licence |
|---|---|---|---|
| Tanakh | Koren | 100% | CC-BY |
| Bavli | William Davidson Talmud (Steinsaltz EN) | ~95% (1 traité incomplet) | CC-BY-NC |
| Bavli | Soncino | ~30-40% (traités libres de droits) | Restrictive (non importable en bulk) |
| Yerushalmi | Various (partiels) | < 50% | Hétérogène |
| Mishnah | Various (Sefaria, Kehati EN, Mishnah Yomit) | ~80% | Mix CC + restrictive |
| Midrash, Chasidut, Second Temple, etc. | Quelques traductions ponctuelles | < 20% | Très restrictives |

**Conséquence** : même en finalisant tous les imports possibles, on aura des **trous structurels** sur Yerushalmi, Midrash, Chasidut Breslov, Kabbalah, Jewish Thought, et certains traités Bavli/Mishnah. Ces trous ne se combleront jamais via un import bulk — ils nécessiteront une production de traduction EN à la volée.

---

## 3. Proposition — production hybride de l'EN-pivot

### 3.1 Décision

Ne pas attendre une couverture complète via imports bulk. **Produire les traductions EN au fil de l'eau via l'API**, en complément des imports Sefaria là où ils existent.

### 3.2 Sources de l'EN par corpus

| Corpus | Source EN attendue | Producteur | `is_reference` |
|---|---|---|---|
| Tanakh | Sefaria/Koren (bulk déjà fait) | `scripts/sefaria/import_tanakh.py` | `true` |
| Bavli | Sefaria/W. Davidson (bulk à faire) | `scripts/sefaria/import_talmud_en.py` (à créer) | `true` |
| Mishnah | Sefaria (bulk possible où dispo) | `scripts/sefaria/import_mishnah_en.py` (à créer) | `true` |
| **Tout corpus, où Sefaria n'a pas** | **LLM via API (n8n workflow `Torah_Translate_Page`)** | **`POST /api/translations/save`** | **`false`** |
| Yerushalmi, Midrash, Chasidut, etc. | Idem (LLM via API) | n8n | `false` |

### 3.3 Sémantique `is_reference` — précision

L'option B retenue (RFC §11.2) avait défini `is_reference = true` comme marqueur **éditorial** (Sefaria/Koren, futur W. Davidson, Soncino…). Pour préserver cette sémantique, les traductions EN générées par LLM via l'API **doivent rester `is_reference = false`**.

**Conséquence sur le contrat API actuel** : `reference_translation` ne remontera **que** les EN éditoriaux (Sefaria et imports équivalents), **jamais** les EN produits par LLM. C'est cohérent avec l'intention initiale (qualité éditoriale > LLM).

→ **À arbitrer** : est-ce le bon comportement ? Voir Q-API-1 ci-dessous.

---

## 4. Workflow n8n cible (Hébreu → FR sur Bavli)

Une fois la stratégie hybride en place, le workflow `Torah_Translate_Page` se déroulera ainsi :

```
1. GET /api/talmud/page/{traite}/{page}/segments?target_language=fr&corpus=Bavli
   → segments[] avec reference_translation potentiellement null

2. Pour chaque segment SANS reference_translation :
   a. Appel LLM #1 : Hébreu → EN (production de l'EN pivot)
   b. POST /api/translations/save (mode segment, target_language='en', is_reference=false)
   c. Conserver l'EN produit en mémoire

3. Pour chaque segment :
   a. Appel LLM #2 : Hébreu + EN (pivot, soit reference_translation, soit produit en étape 2.a) → FR
   b. POST /api/translations/save (mode segment, target_language='fr', is_reference=false)

4. Re-GET /segments → vérification translated_count_by_language.fr a augmenté
```

**Coût LLM** : ~2× le nombre d'appels par rapport au workflow actuel (1 pour produire l'EN, 1 pour la traduction finale). À surveiller. Optimisation possible : un seul prompt produisant **EN + FR en sortie structurée** (function calling / output schema), puis 2 `POST /save`.

**Cache implicite** : une fois l'EN produit pour un segment, il est persisté en base. Le second utilisateur qui demandera ce segment dans une autre langue (DE, ES…) bénéficiera de l'EN-pivot existant — gratuit côté LLM.

---

## 5. Endpoint API — `POST /api/translations/save`

L'endpoint existe déjà (cf. `docs/guides/n8n-torah-api-v2.md` §5). Il faut **vérifier** qu'il accepte le champ `is_reference` au niveau de la requête, ou le forcer côté serveur à `false` pour les writes API (sécurité).

### 5.1 Question à trancher

**Q-API-1** : Le champ `is_reference` doit-il être :

| Option | Description | Avantage | Inconvénient |
|---|---|---|---|
| **A** | Toujours forcé `false` côté API (writes externes) | Sémantique éditoriale stricte préservée. Personne ne peut "promouvoir" une trad LLM en référence accidentellement | Pas de mécanisme pour upgrade une trad LLM en référence (humaine, validée) |
| **B** | Acceptable depuis l'API mais réservé à un endpoint admin spécifique | Permet workflows de validation humaine | Couche d'auth supplémentaire à concevoir |
| **C** | Acceptable depuis l'API sans restriction | Maximum de flexibilité | Sémantique éditoriale floutée, risque de pollution |

→ **Recommandation API : option A**. La promotion vers `is_reference=true` reste exclusivement gérée par les scripts d'import (DATA team). Une trad LLM peut devenir référence via un script de migration séparé (ex. `scripts/promote_validated_translations.py`) si jamais le besoin émerge.

### 5.2 Évolution potentielle du contrat (optionnel)

Si l'option A est retenue, les payloads `POST /api/translations/save` n'évoluent **pas**. Le serveur ignore tout `is_reference` envoyé par le client (silently set à `false` à l'INSERT).

Si l'option C est retenue, ajouter le champ optionnel :

```json
POST /api/translations/save
{
  "mode": "segment",
  "segment_id": "...",
  "target_language": "en",
  "translated_text": "...",
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "is_reference": false  // optional, default false
}
```

---

## 6. Demandes pour l'équipe DATA

### Q-DATA-1 — Import Sefaria EN W. Davidson Talmud (Bavli)

Faisable ? Selon quelle priorité ? Couvre ~95% du Bavli (39 228 segments → ~37 000 attendus).

- **Si oui** : à scripter sur le modèle `import_tanakh.py`. Provider `'Sefaria'`, model `'WilliamDavidson'`, `is_reference=true`.
- **Si non / pas court terme** : Bavli reste sur la stratégie LLM-via-API exclusive jusqu'à futur arbitrage.

### Q-DATA-2 — Import Sefaria EN Mishnah (CC où dispo)

Idem. Couverture estimée à ~80% via Sefaria. Provider `'Sefaria'`, model `'Mishnah-CC'` ou similaire à définir.

### Q-DATA-3 — Forcer `is_reference = false` sur les writes API

Confirmer la stratégie option A §5.1. Implémentation concrète :

```python
# api/routers/translations/save.py (à modifier si nécessaire)
def save_segment_translation(request):
    # Ignorer is_reference du client — toujours false pour les writes API.
    is_reference = False  # Réservé aux scripts d'import DATA.
    ...
```

Confirmation DATA souhaitée car ça verrouille le contrôle de la sémantique éditoriale côté DATA exclusivement.

### Q-DATA-4 — CHECK constraint pour `is_reference`

Faut-il une `CHECK` SQL pour empêcher un client direct (psql admin) de mettre `is_reference=true` accidentellement ? Probablement non (cf. RFC §14.2 / §14.3.2 : déjà refusé). À reconfirmer si la décision change.

### Q-DATA-5 — Métriques de couverture EN à exposer

Pour piloter le rattrapage, est-il possible d'exposer une vue ou matérialisation simple type :

```sql
CREATE OR REPLACE VIEW v_en_pivot_coverage AS
SELECT
    c.name AS corpus,
    COUNT(DISTINCT sts.id) AS segments_total,
    COUNT(DISTINCT t.segment_id) FILTER (
        WHERE t.is_reference = true AND t.target_language = 'en'
    ) AS segments_with_en_ref_editorial,
    COUNT(DISTINCT t.segment_id) FILTER (
        WHERE t.is_reference = false AND t.target_language = 'en' AND t.is_current = true
    ) AS segments_with_en_llm,
    COUNT(DISTINCT sts.id) - COUNT(DISTINCT t.segment_id) FILTER (
        WHERE t.target_language = 'en' AND t.is_current = true
    ) AS segments_without_any_en
FROM corpus c
JOIN translation_projects tp ON tp.corpus_id = c.id
JOIN source_texts st         ON st.project_id = tp.id
JOIN source_text_segments sts ON sts.source_text_id = st.id
LEFT JOIN translations_v2 t  ON t.segment_id = sts.id
GROUP BY c.name;
```

→ Permet à n8n et nous-mêmes de monitorer le rattrapage de couverture sans réécrire la query à chaque fois.

---

## 7. Demandes pour l'équipe n8n

### Q-N8N-1 — Adoption du workflow §4 (production EN à la volée)

OK pour passer d'un workflow `Hébreu → FR direct` à un workflow `Hébreu → EN puis Hébreu+EN → FR` sur les corpus sans EN éditorial ?

Impact estimé :
- ~+30-40% temps de traduction (1 appel LLM additionnel par segment)
- ~+50-70% coût LLM par segment (production EN supplémentaire)
- Cache implicite après premier passage (cf. §4) atténue le coût sur les ré-appels

### Q-N8N-2 — Production EN structurée (optimisation)

Possibilité d'utiliser un seul appel LLM avec output structuré (Anthropic tool use, OpenAI function calling) pour produire **EN + FR** simultanément ? Coût ~ identique à un seul appel direct, gain qualité (EN cohérent avec FR), gain temps (1 round-trip au lieu de 2).

Impact côté API : 2 `POST /api/translations/save` séquentiels au lieu d'un seul. Aucun changement de contrat.

### Q-N8N-3 — Convention de provider/model pour l'EN LLM

Si l'option A (§5.1) est retenue, l'EN produit par n8n aura :
- `provider = 'anthropic'` (ou 'openai', 'claude+openai' pour les workflows multi-provider)
- `model = 'claude-sonnet-4'` (ou la version utilisée)
- `is_reference = false`

OK pour cette convention ? Doit être lisible et stable pour pouvoir distinguer ultérieurement les EN éditoriaux (Sefaria/Koren) des EN LLM (Anthropic, OpenAI…).

---

## 8. Plan de déploiement proposé

| # | Action | Owner | Pré-requis | Effort |
|---|---|---|---|---|
| 1 | Validation de cette doc + arbitrages Q-DATA-* / Q-N8N-* | DATA, n8n, API | Cette doc | — |
| 2 | Patch `POST /api/translations/save` pour forcer `is_reference=false` (option A) | API | Q-DATA-3 résolue | 1h |
| 3 | Vue `v_en_pivot_coverage` (Q-DATA-5) | DATA | Décision | 30 min |
| 4 | Adaptation workflow n8n `Torah_Translate_Page` pour production EN à la volée | n8n | §4 + Q-N8N-1 résolue | 1 jour |
| 5 | Import `import_talmud_en.py` (Bavli W. Davidson) | DATA | Q-DATA-1 résolue | 1-2 jours |
| 6 | Import `import_mishnah_en.py` (Mishnah CC) | DATA | Q-DATA-2 résolue | 1 jour |
| 7 | Reporting périodique sur la couverture (Grafana/dashboard) | À discuter | Vue §3 | — |

**Aucune des étapes n'est bloquante pour les autres** — peuvent paralléliser.

---

## 9. Out of scope

- **Traductions multi-langue (FR + DE + ES + …) simultanées** — refusé en RFC §3 décision #1.
- **Promotion automatique d'une trad LLM en `is_reference=true`** — non, reste manuelle / scriptée.
- **Génération offline (batch script tournant la nuit)** — non envisagé : coût LLM + obsolescence rapide.
- **Endpoint dédié `POST /api/talmud/translate-segment` server-side** — RFC §13.9 backlog, post stabilisation actuelle.

---

## 10. Annexes

### 10.1 Vue couverture (snapshot 2026-04-26)

```sql
SELECT
    c.name AS corpus,
    COUNT(DISTINCT sts.id) AS segments_total,
    COUNT(DISTINCT t.segment_id) FILTER (
        WHERE t.is_reference = true AND t.target_language = 'en'
    ) AS segments_with_en_ref,
    ROUND(100.0 * COUNT(DISTINCT t.segment_id) FILTER (
        WHERE t.is_reference = true AND t.target_language = 'en'
    ) / NULLIF(COUNT(DISTINCT sts.id), 0), 1) AS pct
FROM corpus c
JOIN translation_projects tp ON tp.corpus_id = c.id
JOIN source_texts st         ON st.project_id = tp.id
JOIN source_text_segments sts ON sts.source_text_id = st.id
LEFT JOIN translations_v2 t  ON t.segment_id = sts.id
GROUP BY c.name
ORDER BY segments_total DESC;
```

### 10.2 Glossaire

- **EN-pivot** : traduction anglaise utilisée comme contexte de référence dans un prompt LLM produisant une traduction vers une autre langue (FR, DE, …). Améliore la qualité notamment sur la terminologie, les noms propres, les passages obscurs.
- **EN éditorial** (`is_reference=true`) : traduction EN provenant d'une source publiée et révisée (Koren, W. Davidson, Soncino…). Stable, fiable, importée en bulk depuis Sefaria.
- **EN LLM** (`is_reference=false`) : traduction EN générée par un modèle (Claude, GPT…) via un workflow API. Variable, peut être ré-traduite, mais utilisable comme pivot faute de mieux.
