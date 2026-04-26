# RFC — Exposer la traduction anglaise comme pivot sur l'endpoint segments

**Statut** : Draft à valider par les équipes data + n8n
**Auteur** : équipe API
**Date** : 2026-04-26
**Endpoint concerné** : `GET /api/talmud/page/{traite}/{page}/segments`
**Issue tracker** : à créer après validation

---

## 1. Contexte et motivation

### 1.1 Constat sur la base actuelle

Après audit de la base `translations_v2` et `commentary_translations`, on observe une asymétrie de couverture :

| Source | Anglais (en) | Français (fr) |
|---|---|---|
| `translations_v2` (segments hébreu) | **23 204** rows (provider `Sefaria`, modèle `Koren`) | **21** rows (provider `anthropic`) |
| `commentary_translations` (commentaires) | **0** | **11** rows (`claude-sonnet-4`) |

Les traductions anglaises proviennent **d'imports tiers (Sefaria/Koren)** et constituent une **source de référence éditoriale**, pas le résultat d'un travail de traduction interne. Elles couvrent quasi-intégralement le corpus hébreu déjà importé.

### 1.2 Comportement actuel de l'endpoint

```
GET /api/talmud/page/Pesachim/6a/segments?target_language=fr&corpus=Bavli
```

Le SQL filtre strictement sur la langue demandée :

```sql
LEFT JOIN translations_v2 t2
       ON t2.segment_id      = sts.id
      AND t2.target_language = $2   -- une seule langue
```

→ Si on demande `fr`, on **ignore les 23 204 traductions EN existantes**. Le client (Discord/n8n) n'a aucune visibilité sur la traduction anglaise pourtant disponible.

### 1.3 Conséquence pour la qualité des traductions

Quand n8n appelle un LLM pour traduire de l'**hébreu vers le français**, il part aujourd'hui du seul texte hébreu. Or :

- L'EN Sefaria/Koren fournit la **terminologie standard** (translittérations attestées, noms propres, registres halakhiques).
- L'EN désambiguïse les **passages obscurs** que le LLM aurait du mal à interpréter sur le seul hébreu.
- Cela aligne la traduction sur le canon académique anglo-saxon (Soncino, Koren, ArtScroll).

→ **Le workflow de traduction doit utiliser l'EN comme texte-pivot** : Hébreu + EN → langue cible.

---

## 2. Proposition de contrat API

### 2.1 Paramètres

| Paramètre | Type | Requis | Défaut | Description |
|---|---|---|---|---|
| `target_language` | string | **OUI** (breaking change) | — | Langue cible de la traduction utilisateur. **Une seule langue.** ISO 639-1 (`fr`, `de`, `es`...). Hors `en` qui est exposé séparément. |
| `corpus` | string | Conditionnel | — | Désambigüation de corpus. Inchangé. |
| `include_commentaries` | boolean | non | `true` | Inchangé. |
| `include_translations` | boolean | non | `true` | Inchangé. |

**Validation stricte sur `target_language`** :
- Absent → **HTTP 422** (Pydantic validation).
- Plusieurs valeurs (ex. `fr,en`) → **HTTP 400** avec `{"error": {"code": "INVALID_TARGET_LANGUAGE", "message": "target_language must be a single ISO 639-1 code"}}`.
- Vide ou non-ISO → **HTTP 400**.

### 2.2 Réponse — nouveau champ `reference_translation`

L'EN Sefaria, quand il existe, est exposé via un champ dédié au niveau de chaque segment :

```json
{
  "traite": "Pesachim",
  "page": "6a",
  "reference": "Pesachim 6a",
  "corpus": "Bavli",
  "source_text_id": "...",
  "target_language": "fr",
  "segments_count": 12,
  "translated_count": 0,
  "translated_count_by_language": {"fr": 0, "en": 12},
  "commentaries_total": 95,
  "segments": [
    {
      "index": 1,
      "segment_id": "...",
      "hebrew_text": "...",
      "has_translation": false,

      "reference_translation": {
        "id": "...",
        "translated_text": "And as for the king of Egypt, he removed him at Jerusalem...",
        "target_language": "en",
        "version": 1,
        "is_current": true,
        "provider": "Sefaria",
        "model": "Koren",
        "quality_score": null,
        "job_id": null,
        "created_at": "2026-..."
      },

      "translation": null,

      "translations": [
        {
          "id": "...",
          "translated_text": "...",
          "target_language": "en",
          "version": 1,
          "is_current": true,
          "provider": "Sefaria",
          "model": "Koren"
        }
      ],

      "commentaries": [...]
    }
  ]
}
```

### 2.3 Sémantique des champs

| Champ | Sémantique | Quand vide |
|---|---|---|
| `reference_translation` | Traduction EN courante (`is_current=true`, `target_language='en'`). **Source éditoriale de référence** — à utiliser comme texte-pivot. | `null` si aucune traduction EN n'existe pour ce segment. |
| `translation` | Traduction courante dans la langue demandée par l'utilisateur (`target_language` du query string). | `null` si la langue demandée n'a pas encore de traduction courante. |
| `translations[]` | Toutes les versions de toutes les langues (`en` + langue demandée), triées par version DESC puis par langue. Permet l'historique de versioning. | Tableau vide. |
| `has_translation` | Booléen : `true` ssi `translation` (langue demandée) est non-null. **Inchangé sémantiquement.** | `false`. |
| `translated_count` | Nombre de segments traduits dans la langue demandée. **Sémantique inchangée.** | `0`. |
| `translated_count_by_language` | **Nouveau, additif** : dict `{lang: count}` couvrant `en` + langue demandée. | `{}`. |

### 2.4 Idem côté commentaires

Même structure appliquée à chaque commentaire (sous condition que le bug `extra_data.translation` soit corrigé d'abord — cf. §4).

```json
{
  "id": "...",
  "commentator": "Rashi",
  "segment": 3,
  "hebrew_text": "...",
  "reference_translation": null,
  "translation": {
    "translated_text": "...",
    "target_language": "fr",
    "provider": "anthropic",
    "model": "claude-sonnet-4"
  },
  "translations": [...]
}
```

---

## 3. Décisions arbitrées

| # | Question | Décision | Motivation |
|---|---|---|---|
| 1 | Format multi-langues dans l'URL | **Refusé** — `target_language` accepte **une seule** langue | Simplicité, contrat strict, anti-DoS implicite |
| 2 | `target_language` obligatoire | **Oui** | Plus de magic default `fr` ; le client doit déclarer son intention |
| 3 | EN comme pivot de référence | **Oui**, via champ dédié `reference_translation` | Sémantique explicite, distincte de la langue utilisateur |
| 4 | `translated_count` casse-t-il ? | **Non** — sémantique inchangée + nouveau dict additif `translated_count_by_language` | Aucun breaking change pour clients existants |
| 5 | Limite max de langues | N/A — une seule langue acceptée | Décision #1 supprime la question |

---

## 4. Bug latent à corriger en pré-requis (équipe API)

Le code `talmud.py:471-534` lit `commentary_details.extra_data->'translation'`, qui est **vide pour les 426 976 lignes** (jamais peuplé par le pipeline d'import). Les vraies traductions de commentaires sont dans la table dédiée **`commentary_translations`** (FK `commentary_detail_id`).

**Conséquence actuelle** : `has_translation: false` retourné systématiquement pour tous les commentaires, alors que 11 commentaires FR existent en base (Pesachim 6a).

**Action API (PR séparée, préalable)** : refactorer la query commentaires pour LEFT JOIN `commentary_translations` au lieu de lire `extra_data`.

---

## 5. Impact par équipe

### 5.1 Équipe DATA

**Aucun changement de schéma DB requis.** Tables `translations_v2` et `commentary_translations` sont déjà adaptées (champ `target_language` existant, plusieurs langues coexistent par segment).

**Demandes / questions ouvertes** :

- **Q-DATA-1** : Confirmer que `translations_v2.provider='Sefaria', model='Koren'` est bien la convention pour les traductions EN de référence. Si oui, on s'appuie dessus comme marqueur sémantique éditorial. Sinon, faut-il un nouveau champ ?
- **Q-DATA-2** : Y aura-t-il un import similaire pour les **commentaires** depuis Sefaria EN (Soncino, William Davidson Talmud) à court/moyen terme ? Ça déterminerait si `reference_translation` côté commentaires sera vide longtemps ou pas.
- **Q-DATA-3** : Faut-il un **index** dédié `(segment_id, target_language)` sur `translations_v2` pour accélérer le filtre multi-langues ? À mesurer côté DBA.
- **Q-DATA-4** : Politique de versioning : si une nouvelle traduction EN est importée (ex. mise à jour Koren), on archive la précédente avec `is_current=false` ? Convention déjà en place ou à définir ?

### 5.2 Équipe n8n

**Breaking change** : `target_language` devient obligatoire. Workflow `Torah_Translate_Page` à vérifier.

**Évolution attendue du workflow LLM** (recommandation forte mais non-bloquante) :

> Avant d'appeler le LLM pour traduire **Hébreu → langue cible**, lire `segments[].reference_translation.translated_text` (EN Sefaria/Koren) et l'inclure dans le prompt comme contexte de référence.
>
> **Format prompt suggéré** :
> ```
> Translate the following Hebrew Talmudic passage to {target_language}.
> Use the official Sefaria/Koren English translation as a reference for terminology and proper nouns.
>
> Hebrew: {hebrew_text}
> Reference (English, Sefaria): {reference_translation.translated_text}
>
> Provide the {target_language} translation:
> ```

**Demandes / questions ouvertes** :

- **Q-N8N-1** : Confirmer que `target_language=fr` est bien envoyé par tous vos workflows actuels (pas de fallback sur le default API qu'on s'apprête à supprimer).
- **Q-N8N-2** : Êtes-vous OK pour intégrer l'EN comme contexte de prompt ? Quel est l'impact sur le coût LLM (tokens additionnels) ? Tolérable ?
- **Q-N8N-3** : Affichage Discord — voulez-vous exposer la traduction EN dans l'embed final (mode "bilingue"), ou la garder uniquement comme input pipeline interne ? Ça impacte la limite des 4 096 caractères Discord.
- **Q-N8N-4** : Y a-t-il un endpoint que vous appelez aujourd'hui sans passer `target_language` ? Si oui, lequel et avec quel default attendu ?

### 5.3 Équipe API (nous)

**Travaux** :

1. **PR-1 (préalable)** : refactor du code commentaires → JOIN `commentary_translations`.
   - Bugfix isolé. Aucun changement de contrat externe.
   - Estimé : 1 demi-journée + revue.

2. **PR-2 (cette RFC)** : implémentation du contrat bilingue.
   - Modif SQL pour récupérer EN + langue demandée.
   - Validation Pydantic sur `target_language` (required, single value).
   - Construction de `reference_translation`, `translation`, `translations[]`.
   - Calcul de `translated_count_by_language`.
   - Mise à jour doc `docs/guides/n8n-torah-api-v2.md` §4.2.
   - Estimé : 1 jour + revue.

3. **Tests** :
   - Scénarios `scripts/test-scenarios-data.json` mis à jour pour vérifier `reference_translation.translated_text` non-null sur Pesachim 6a, Berakhot 2a, etc.
   - Cas d'erreur : `target_language` absent → 422 ; `target_language=fr,en` → 400.

---

## 6. Plan de déploiement

| Étape | Action | Owner | Pré-requis |
|---|---|---|---|
| 1 | Validation RFC par data + n8n | Data, n8n | Cette RFC |
| 2 | Réponses aux questions Q-DATA-* et Q-N8N-* | Data, n8n | Étape 1 |
| 3 | PR-1 : bugfix commentary_translations | API | — |
| 4 | Merge + redéploiement PR-1 | API + ops | Étape 3 |
| 5 | PR-2 : implémentation contrat bilingue | API | Étape 2 et 4 |
| 6 | Tests d'intégration | API | Étape 5 |
| 7 | Adaptation workflow n8n (`target_language` requis + prompt EN-pivot) | n8n | Étape 5 mergée |
| 8 | Communication aux clients Discord (si UI exposée) | n8n | Étape 7 |

**Pas de feature flag prévu** : changement strictement additif côté réponse (sauf le passage en `required` de `target_language`, traité comme un breaking change documenté).

---

## 7. Cas particuliers et exemples

### 7.1 Segment EN existe, FR demandé pas encore traduit

```http
GET /api/talmud/page/Pesachim/6a/segments?target_language=fr&corpus=Bavli
```

```json
{
  "segments": [{
    "index": 1,
    "hebrew_text": "וירשם פרעה...",
    "reference_translation": {"translated_text": "And Pharaoh removed him...", "target_language": "en"},
    "translation": null,
    "has_translation": false
  }]
}
```

→ n8n peut alors **lancer un job de traduction** en utilisant l'EN comme pivot.

### 7.2 Segment EN existe, FR aussi traduit

```json
{
  "segments": [{
    "reference_translation": {"translated_text": "...", "target_language": "en"},
    "translation": {"translated_text": "Et Pharaon le déposa...", "target_language": "fr"},
    "has_translation": true,
    "translations": [
      {"target_language": "fr", "version": 2, "is_current": true},
      {"target_language": "fr", "version": 1, "is_current": false},
      {"target_language": "en", "version": 1, "is_current": true}
    ]
  }]
}
```

### 7.3 Segment ni EN ni FR (rare, hors corpus Sefaria)

```json
{
  "segments": [{
    "reference_translation": null,
    "translation": null,
    "has_translation": false,
    "translations": []
  }]
}
```

→ n8n traduit Hébreu → FR direct (cas dégradé, pas d'EN-pivot disponible).

### 7.4 Cas d'erreur — `target_language` absent

```http
GET /api/talmud/page/Pesachim/6a/segments?corpus=Bavli
```

```json
{
  "detail": [{
    "type": "missing",
    "loc": ["query", "target_language"],
    "msg": "Field required"
  }]
}
```
→ HTTP 422.

### 7.5 Cas d'erreur — plusieurs langues

```http
GET /api/talmud/page/Pesachim/6a/segments?target_language=fr,en&corpus=Bavli
```

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TARGET_LANGUAGE",
    "message": "target_language must be a single ISO 639-1 code (got 'fr,en')",
    "path": "/api/talmud/page/Pesachim/6a/segments"
  }
}
```
→ HTTP 400.

---

## 8. Out of scope (volontairement)

- **Multi-langues simultanées** (FR + DE + ES par appel) : refusé, contrat strict.
- **Pivot autre que EN** (pivot via DE pour traduire DE→FR, etc.) : non envisagé tant que la couverture multi-langues côté EN reste massivement supérieure.
- **Refactor de l'endpoint `/api/talmud/text/{traite}/{page}`** : ne renvoie que le hébreu, pas concerné.
- **Endpoint commentaires individuel `/api/talmud/commentary/{id}`** : à harmoniser dans une PR ultérieure si besoin.

---

## 9. Annexes

### 9.1 Vérifications base effectuées le 2026-04-26

```sql
-- Couverture segments
SELECT target_language, COUNT(*) FROM translations_v2 GROUP BY 1;
-- en: 23 204 | fr: 21

-- Couverture commentaires
SELECT target_language, COUNT(*) FROM commentary_translations GROUP BY 1;
-- fr: 11 | en: 0

-- État dead code extra_data
SELECT COUNT(*) FROM commentary_details
WHERE (extra_data::jsonb) ? 'translation';
-- 0 sur 426 976 lignes
```

### 9.2 Glossaire

- **Pivot translation** : traduction intermédiaire utilisée comme contexte/source pour produire une traduction finale dans une autre langue. Pratique standard en traduction automatique pour les paires de langues à faible ressource.
- **Reference translation** : traduction de référence éditoriale (ici Sefaria/Koren), distincte d'une traduction "utilisateur" générée à la demande.

---

## 10. Réponse équipe DATA — 2026-04-26

### 10.1 Validation globale

**RFC validée sur le principe.** Aucun changement de schéma bloquant côté DB. Couverture observée confirmée (vérifs §9.1 reproduites par DATA, mêmes résultats : 23 204 EN / 21 FR `translations_v2` ; 11 FR / 0 EN `commentary_translations` ; 0 / 426 976 lignes avec `extra_data->'translation'`).

Le bug latent §4 (lecture de `extra_data->'translation'` au lieu de `commentary_translations`) avait déjà été signalé dans `docs/guides/response-to-api-residuals.md`. ✅ La PR-1 est bien le pré-requis nécessaire.

### 10.2 Réponses aux questions Q-DATA-*

#### Q-DATA-1 — Convention `provider='Sefaria', model='Koren'` pour l'EN de référence

**✅ Confirmé en l'état.** Le script `scripts/sefaria/import_tanakh.py` (l. 416-470, fonction `insert_koren_translations`) insère systématiquement avec ces deux valeurs. C'est aujourd'hui la convention de fait pour les **23 204 traductions EN du Tanakh**.

**⚠️ Recommandation forte** : ne **pas** s'appuyer sur du string-matching `provider='Sefaria' AND model='Koren'` côté API pour identifier "la traduction de référence". Deux options possibles :

| Option | Avantage | Inconvénient |
|---|---|---|
| **(A)** Documenter la convention dans le RFC + sticker la propriété sémantique sur `(provider, model)` | Aucune migration | Fragile : un futur import (William Davidson, Soncino…) en EN casserait le marqueur |
| **(B)** Ajouter une colonne `is_reference BOOLEAN NOT NULL DEFAULT false` sur `translations_v2` + `commentary_translations` | Sémantique explicite, future-proof, indexable | Migration + backfill (1 UPDATE simple) |

**Position DATA** : préférence pour **(B)**. Migration triviale (`ALTER TABLE … ADD COLUMN is_reference … ; UPDATE … SET is_reference=true WHERE provider='Sefaria' AND model='Koren';`). On évite de coupler le contrat API à des conventions de strings de provider. Décision à arbitrer conjointement.

#### Q-DATA-2 — Import similaire EN pour les commentaires

**Pas planifié à court terme.** Aujourd'hui : `commentary_translations` EN = 0 sur 426 976 commentaires.

Sources EN existantes côté Sefaria pour commentaires :
- **William Davidson Talmud** (CC-BY-NC) — couvre l'intégralité du Bavli, équivalent Steinsaltz EN. Source la plus complète.
- **Soncino Talmud** — partiel, licence plus restrictive.
- **Mishnah Yomit** (CC) — pour la Mishna.

Implications pour la RFC :
- **Court terme** : `reference_translation` côté commentaires sera **`null` partout** (sauf les 0 lignes EN existantes). Le contrat API doit gérer ce cas (déjà prévu §7.3, OK).
- **Moyen terme** : DATA propose d'ouvrir un ticket d'inventaire "import commentaires EN Sefaria" (similaire à `import_tanakh.py`), à prioriser après merge PR-2.

→ **Pas bloquant pour la RFC.** Le champ `reference_translation` sur les commentaires sera simplement majoritairement `null` jusqu'à l'import EN.

#### Q-DATA-3 — Index dédié `(segment_id, target_language)` sur `translations_v2`

**État actuel** des index sur `translations_v2` (à vérifier par DATA + DBA avec `EXPLAIN ANALYZE` sur la query API cible une fois PR-2 ouverte) :

```sql
-- À exécuter pour mesure
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM translations_v2
 WHERE segment_id = ANY($1::uuid[]) AND target_language IN ('en', 'fr');
```

**Position DATA** : ne pas créer l'index proactivement. Le filtre `target_language IN ('en', $2)` sur ~23 k rows par page (Pesachim 6a = 17 segments × 2 langues max) est dérisoire. À ré-évaluer **uniquement si** mesures montrent un seq scan coûteux après merge PR-2.

→ **Décision : différer**, mesurer après-coup.

#### Q-DATA-4 — Politique de versioning EN

Schéma actuel `translations_v2` et `commentary_translations` supportent déjà nativement le versioning :
- `version INTEGER NOT NULL DEFAULT 1`
- `is_current BOOLEAN NOT NULL DEFAULT true`
- Index `idx_ct_cd_lang_cur (commentary_detail_id, target_language, is_current)` côté commentaires

**Convention proposée par DATA** :

> Lors d'un nouvel import EN (ex. mise à jour Koren, ou bascule vers une autre édition Sefaria) :
> 1. `UPDATE translations_v2 SET is_current = false WHERE segment_id = ? AND target_language = 'en';`
> 2. `INSERT … VALUES (…, version = MAX(version)+1, is_current = true);`
> 3. Idempotence : si `translated_text` strictement identique → no-op (skip insert).

À implémenter côté script `import_tanakh.py` lors du prochain refresh EN. **Pas urgent** (premier refresh estimé H2 2026 au plus tôt, Sefaria publie rarement). À documenter dans `docs/guides/tanakh-import-design.md` quand la décision sera arbitrée.

→ **Décision : convention validée**, implémentation côté script à la prochaine itération d'import.

### 10.3 Points additionnels DATA → API

1. **Cas Joshua 21:36-37** (Tanakh) : 2 versets apocryphes Massora, `hebrew_text='—'`, **pas de Koren EN** (Sefaria ne les fournit sur aucune version). Côté API, `reference_translation` sera `null` pour ces 2 segments — comportement conforme §7.3 du RFC. Pas d'action.

2. **Cas range refs commentaires** (`Rosh on Shabbat 6:21-8:1`) : 0 ligne `traite IS NULL` restante après backfill du 26/04. Tous les 426 976 commentaires sont désormais filtrables par `(traite, page, segment_num)`. ✅ Compatible avec la query bilingue de PR-2.

3. **Couverture FR existante** (21 segments + 11 commentaires) provient des 22 v1 migrés en `pending_translations` puis résolus. Status `pending` pour 22 d'entre eux (cf. table `pending_translations`). À ne pas confondre avec `translations_v2` côté pivot — l'API doit bien lire `translations_v2.translated_text`, pas `pending_translations`.

4. **Recommandation contrat erreur** §7.5 : préférer `INVALID_QUERY_PARAMETER` (cohérent avec d'autres erreurs Pydantic du projet) plutôt que `INVALID_TARGET_LANGUAGE` spécifique. À discuter.

### 10.4 Décisions à arbitrer conjointement

| # | Sujet | Owner décision | Délai souhaité |
|---|---|---|---|
| D-1 | Adopter colonne `is_reference` (option B Q-DATA-1) ou rester sur convention provider/model (option A) | DATA + API | Avant ouverture PR-2 |
| D-2 | Inventaire et priorisation import commentaires EN Sefaria (W. Davidson) | DATA + Produit | Backlog post-PR-2 |
| D-3 | Code erreur §7.5 — `INVALID_TARGET_LANGUAGE` vs `INVALID_QUERY_PARAMETER` | API | À l'implémentation PR-2 |
| D-4 | Convention versioning EN (§Q-DATA-4) à documenter dans `tanakh-import-design.md` | DATA | Au prochain refresh import EN |

### 10.5 Validation déploiement

DATA est **OK pour merger PR-1 et PR-2** dans l'ordre proposé §6, **sous réserve** de l'arbitrage D-1 (`is_reference`) avant PR-2. Si option B retenue, DATA livre la migration `20260427_add_is_reference.py` en pré-requis (estimé : 1h).

**Aucun blocage côté schéma actuel** pour démarrer PR-1 dès maintenant.

— DATA, 2026-04-26

---

## 11. Réponse équipe API — 2026-04-26

### 11.1 Synthèse

Retour DATA pris en compte. RFC validée sur le principe, plan §6 inchangé. 4 décisions à arbitrer ; positions API ci-dessous.

### 11.2 Positions API sur les décisions D-*

#### D-1 — Colonne `is_reference` vs convention provider/model

**Position API : option B retenue (`is_reference BOOLEAN`).**

Comparatif :

| | Option A (strings) | Option B (`is_reference`) |
|---|---|---|
| Migration | 0 | 1 ALTER + 1 UPDATE (~1h DATA) |
| Robustesse | Fragile : un futur import (William Davidson, Soncino…) en EN casserait le marqueur | Future-proof |
| Filtre côté API | `WHERE provider='Sefaria' AND model='Koren'` | `WHERE is_reference = true` |
| Sémantique | Couple le contrat API à des conventions de strings d'imports | Marqueur explicite "traduction de référence éditoriale" |

Le marqueur sémantique recherché n'est pas "qui a traduit" mais **"est-ce une référence éditoriale"**. La colonne dédiée exprime exactement cette intention et nous protège contre les évolutions d'imports (W. Davidson, Soncino, ArtScroll).

→ **Demande à DATA** : livrer la migration `20260427_add_is_reference.py` en pré-requis de PR-2 :

```sql
ALTER TABLE translations_v2          ADD COLUMN is_reference BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE commentary_translations  ADD COLUMN is_reference BOOLEAN NOT NULL DEFAULT false;

UPDATE translations_v2
   SET is_reference = true
 WHERE provider = 'Sefaria' AND model = 'Koren';

-- Index optionnel à mesurer si besoin (cf. D-Q3) :
-- CREATE INDEX idx_t2_segment_lang_ref
--   ON translations_v2 (segment_id, target_language) WHERE is_reference = true;
```

Idempotence du backfill : `WHERE provider='Sefaria' AND model='Koren'` couvre les 23 204 lignes EN existantes. Vérification post-migration attendue : `SELECT COUNT(*) FROM translations_v2 WHERE is_reference = true; -- attendu : 23 204`.

#### D-2 — Import EN commentaires (W. Davidson Talmud)

**Position API : OK, post-PR-2, non bloquant.**

Le contrat de PR-2 gère déjà le cas `reference_translation = null` côté commentaires (cf. §7.3). Quand l'import EN sera livré (ticket DATA à ouvrir post-PR-2), le champ se peuplera **automatiquement** sans modification API. Pas de coupling.

#### D-3 — Code d'erreur §7.5

**Position API : `INVALID_QUERY_PARAMETER` retenu.**

Cohérence avec la convention projet (autres erreurs Pydantic). Le détail spécifique passe dans le `message` :

```json
{
  "success": false,
  "error": {
    "code": "INVALID_QUERY_PARAMETER",
    "message": "target_language must be a single ISO 639-1 code (got 'fr,en')",
    "path": "/api/talmud/page/Pesachim/6a/segments",
    "field": "target_language"
  }
}
```

→ Le §7.5 du présent RFC est mis à jour implicitement : remplacer `INVALID_TARGET_LANGUAGE` par `INVALID_QUERY_PARAMETER` lors de l'implémentation PR-2. Cas `target_language` absent → reste HTTP 422 (Pydantic standard, inchangé).

#### D-4 — Convention versioning EN

**Position API : OK, à documenter par DATA dans `tanakh-import-design.md` au prochain refresh import EN.**

Côté API, la query bilingue PR-2 lit déjà `WHERE is_current = true`, donc transparente au versioning. Aucune modification API requise.

### 11.3 Points additionnels DATA pris en compte

| # | Point DATA | Action API |
|---|---|---|
| 1 | Joshua 21:36-37 sans EN (apocryphes) | Aucune — `reference_translation=null` déjà prévu §7.3 |
| 2 | Range refs commentaires : 0 ligne `traite IS NULL` après backfill 26/04 | Aucune — query PR-2 utilisera `commentary_detail_id` directement (FK) |
| 3 | ⚠️ Ne pas lire `pending_translations` (22 lignes) | **Confirmé** : PR-2 lit exclusivement `translations_v2.translated_text` et `commentary_translations.translated_text`. À tester explicitement (cas où `pending_translations` existe pour un segment mais pas `translations_v2` → `translation: null` attendu, pas de fallback) |
| 4 | Code erreur `INVALID_QUERY_PARAMETER` | Adopté (cf. D-3 ci-dessus) |

### 11.4 Plan d'exécution révisé

| Étape | Action | Owner | Statut | Pré-requis |
|---|---|---|---|---|
| 1 | Validation RFC | DATA, n8n | ✅ DATA validé / ⏳ n8n en attente | — |
| 2 | Arbitrage final D-1 (option B) | API + DATA | ⏳ à confirmer par lead | RFC §11 |
| 3 | **PR-1 — bugfix `commentary_translations`** | API | 🟢 **peut démarrer immédiatement** | — |
| 4 | Migration `20260427_add_is_reference.py` | DATA | ⏳ après confirmation D-1 | Étape 2 |
| 5 | Merge + redéploiement PR-1 | API + ops | ⏳ | Étape 3 |
| 6 | **PR-2 — contrat bilingue** | API | 🔒 bloquée | Étapes 4 + 5 |
| 7 | Tests d'intégration PR-2 | API | ⏳ | Étape 6 |
| 8 | Adaptation workflow n8n (`target_language` requis + EN-pivot) | n8n | ⏳ | Étape 6 mergée |
| 9 | Communication clients Discord (si UI bilingue) | n8n | ⏳ | Étape 8 |

### 11.5 Demandes ouvertes

- **À DATA** : confirmation finale option B + livraison de la migration `20260427_add_is_reference.py`. ETA souhaitée : avant ouverture PR-2 côté API.
- **À n8n** : retour sur les 4 questions Q-N8N-* (§5.2). Bloquant pour étape 8 uniquement, pas pour PR-1 ni PR-2 côté API.
- **À PRODUIT** : décision sur D-2 (priorisation import commentaires EN W. Davidson, post-PR-2).

### 11.6 Décisions verrouillées (récap)

| # | Décision | Statut |
|---|---|---|
| 1 | `target_language` accepte une seule langue | ✅ verrouillé |
| 2 | `target_language` obligatoire (HTTP 422 si absent) | ✅ verrouillé |
| 3 | EN exposé via champ dédié `reference_translation` | ✅ verrouillé |
| 4 | `translated_count` inchangé + ajout `translated_count_by_language` | ✅ verrouillé |
| 5 | Pas de limite langues (mono-langue) | ✅ verrouillé |
| D-1 | Colonne `is_reference` (option B) | 🟡 proposé — attente confirmation conjointe |
| D-2 | Import EN commentaires (W. Davidson) post-PR-2 | ✅ verrouillé |
| D-3 | Code erreur `INVALID_QUERY_PARAMETER` | ✅ verrouillé |
| D-4 | Convention versioning EN au prochain refresh | ✅ verrouillé |

— API, 2026-04-26

---

## 12. Réponse équipe n8n — 2026-04-26

### 12.1 Validation globale

**RFC validée.** Les décisions D-1 à D-4 sont acceptées. Le plan §11.4 est compatible avec notre roadmap.

### 12.2 Réponses aux questions Q-N8N-*

#### Q-N8N-1 — `target_language=fr` envoyé par tous les workflows ?

**✅ Confirmé.** Vérification effectuée sur les workflows actifs :

| Workflow | Envoie `target_language` | Valeur |
|---|---|---|
| `Torah_Translate_Page.json` | ✅ Oui | `$json.targetLanguage` (default `fr`) |
| `Torah_Get_Page_Translations.json` | ✅ Oui | Query param dynamique |
| `Torah_Router.json` | ✅ Oui | Propagé depuis l'appelant |

**Aucun workflow n'utilise le default API** — le breaking change (HTTP 422 si absent) ne nous impacte pas.

#### Q-N8N-2 — Intégrer l'EN comme contexte de prompt ?

**✅ OK, recommandé.**

| Aspect | Impact |
|---|---|
| **Qualité** | Amélioration significative (terminologie, noms propres, passages obscurs) |
| **Tokens** | +200-400 tokens/segment (EN ~1.5x longueur hébreu) |
| **Coût** | ~+30% par traduction (tolérable vs gain qualité) |

**Implémentation prévue** : modifier le prompt dans `Torah_Translate_Simple` pour inclure `reference_translation.translated_text` quand disponible.

#### Q-N8N-3 — Affichage EN dans Discord (bilingue) ?

**Proposition : interne uniquement (phase 1).**

| Option | Avantage | Inconvénient |
|---|---|---|
| Bilingue affiché | Transparence, vérification utilisateur | Limite 4096 chars Discord, embed surchargé |
| Interne seulement | UX épurée, pas de breaking change UI | Moins de transparence |

→ **Phase 1** : EN utilisé comme pivot interne, non affiché.
→ **Phase 2** (optionnel, post-feedback) : ajouter bouton "Voir référence EN" sur demande.

#### Q-N8N-4 — Endpoints appelés sans `target_language` ?

**⚠️ Un cas identifié :**

`Torah_Get_Page_Translations.json` peut appeler `/segments` avec `include_translations=false` (mode lecture hébreu seul). Dans ce cas, `target_language` était parfois omis.

**Action requise** : toujours envoyer `target_language` même si `include_translations=false`. Fix trivial, inclus dans la Phase 1.

### 12.3 Planning de développement n8n

#### Phase 0 — Pré-requis (bloqué sur API)

Attendre merge PR-1 (bugfix `commentary_translations`) + PR-2 (contrat bilingue) + migration DATA (`is_reference`).

#### Phase 1 — Adaptation obligatoire

| # | Tâche | Workflow | Effort |
|---|---|---|---|
| 1.1 | Ajouter `target_language` obligatoire partout | `Torah_Get_Page_Translations` | 0.5h |
| 1.2 | Extraire `reference_translation` dans Extract Segments | `Torah_Translate_Page` | 1h |
| 1.3 | Propager `reference_translation` au Router | `Torah_Router` | 1h |
| 1.4 | Modifier prompt LLM avec EN-pivot | `Torah_Translate_Simple` | 2h |
| 1.5 | Gérer cas `reference_translation=null` (fallback hébreu seul) | `Torah_Translate_Simple` | 0.5h |
| 1.6 | Tests E2E (Pesachim 6a, Berakhot 2a) | Tous | 2h |

**Total Phase 1 : ~7h**

#### Phase 2 — Optimisations (optionnel, post-feedback)

| # | Tâche | Effort |
|---|---|---|
| 2.1 | Ajouter `translated_count_by_language` dans les réponses Discord | 1h |
| 2.2 | Bouton "Voir référence EN" (embed Discord) | 3h |
| 2.3 | Métriques : comparer qualité traductions avec/sans pivot EN | 2h |

#### Dépendances

```
API PR-1 (bugfix) ──┐
                    ├──► API PR-2 (bilingue) ──► n8n Phase 1 ──► n8n Phase 2
DATA migration ─────┘
```

#### Timeline estimée

| Étape | Owner | ETA |
|---|---|---|
| PR-1 + PR-2 mergées | API | J+3 |
| Migration `is_reference` | DATA | J+1 |
| **n8n Phase 1** | n8n | **J+4 à J+5** |
| n8n Phase 2 | n8n | J+7 (si priorisé) |

### 12.4 Décisions verrouillées côté n8n

| # | Décision | Statut |
|---|---|---|
| 1 | EN utilisé comme pivot interne (pas d'affichage bilingue phase 1) | ✅ verrouillé |
| 2 | `target_language` toujours envoyé (même si `include_translations=false`) | ✅ verrouillé |
| 3 | Prompt LLM enrichi avec `reference_translation.translated_text` | ✅ verrouillé |
| 4 | Fallback gracieux si `reference_translation=null` | ✅ verrouillé |

### 12.5 Format prompt LLM proposé

```
Translate the following Hebrew Talmudic passage to {target_language}.
Use the official Sefaria/Koren English translation as a reference for terminology, proper nouns, and disambiguation.

## Hebrew Source
{hebrew_text}

## Reference Translation (English, Sefaria/Koren)
{reference_translation.translated_text}

## Instructions
- Maintain the same meaning as both the Hebrew and English reference
- Use standard French Talmudic terminology
- Preserve proper nouns as transliterated in the English reference
- If the Hebrew is ambiguous, follow the English interpretation

Provide the {target_language} translation:
```

**Cas `reference_translation=null`** : le bloc "Reference Translation" est omis, et l'instruction devient "Translate directly from Hebrew".

### 12.6 Validation déploiement

n8n est **OK pour démarrer Phase 1** dès que PR-2 (API) est mergée et déployée. Aucun blocage côté n8n.

— n8n, 2026-04-26

---

## 13. Inventaire endpoints — payloads in / out

Section ajoutée à la demande de n8n pour disposer d'un contrat exhaustif. Les endpoints sont regroupés par vague d'impact (PR-1 / PR-2 / hors scope). Pour chaque endpoint impacté : exemple de requête + réponse avant et après.

**Légende statut** :
- 🔧 **Modifié PR-1** — bugfix `commentary_translations` (lecture de la table dédiée au lieu de `extra_data` mort). Aucun changement de **forme** de la réponse, mais les champs `has_translation` et `translation` cessent d'être systématiquement `false`/`null`.
- 🆕 **Modifié PR-2** — contrat bilingue : ajout `reference_translation`, `translated_count_by_language`, `target_language` requis.
- ⛔ **Hors scope** — non modifié par cette RFC.

---

### 13.1 `GET /api/talmud/page/{traite}/{page}/segments` 🔧 PR-1 + 🆕 PR-2

Endpoint principal de la RFC. **Affecté par les deux PR.**

#### Paramètres

| Paramètre | Type | Requis | Default | Notes |
|---|---|---|---|---|
| `traite` | path | ✅ | — | Nom traité (`Pesachim`, `Berakhot`...) |
| `page` | path | ✅ | — | Numéro de daf (`6a`, `2b`...) |
| `target_language` | query | ✅ après PR-2 | ~~`fr`~~ | ISO 639-1, **mono-langue**. Avant PR-2 : default `fr`. Après : HTTP 422 si absent |
| `corpus` | query | conditionnel | — | Requis si ambigu (`Bavli`, `Mishnah`) |
| `include_commentaries` | query | non | `true` | Inchangé |
| `include_translations` | query | non | `true` | Inchangé |

#### Exemple requête

```http
GET /api/talmud/page/Pesachim/6a/segments?target_language=fr&corpus=Bavli HTTP/1.1
Host: api.torah.solutions
```

#### Réponse — avant PR-1 (état actuel, bugué)

```json
{
  "traite": "Pesachim",
  "page": "6a",
  "reference": "Pesachim 6a",
  "corpus": "Bavli",
  "source_text_id": "...",
  "target_language": "fr",
  "segments_count": 12,
  "translated_count": 0,
  "commentaries_total": 95,
  "segments": [
    {
      "index": 1,
      "segment_id": "...",
      "hebrew_text": "...",
      "translation": null,
      "translations": [],
      "has_translation": false,
      "commentaries": [
        {
          "id": "5435ec1c-...",
          "commentator": "Rashi",
          "segment": 1,
          "text": "...",
          "hebrew_text": "...",
          "has_translation": false,    // ❌ BUG: toujours false (lit extra_data mort)
          "has_nekudot": true
        }
      ],
      "commentaries_count": 8
    }
  ]
}
```

#### Réponse — après PR-1 (bugfix commentary_translations)

Forme identique, mais `has_translation` et le bloc `translation` sont désormais véridiques pour les commentaires :

```json
{
  "...": "[shape inchangée]",
  "segments": [
    {
      "commentaries": [
        {
          "id": "5435ec1c-...",
          "commentator": "Rashi",
          "has_translation": true,    // ✅ corrigé
          "translation": {            // ✅ peuplé depuis commentary_translations
            "text": "Gemara : On aurait pu penser que...",
            "target_language": "fr",
            "provider": "anthropic",
            "model": "claude-sonnet-4",
            "quality_score": null
          }
        }
      ]
    }
  ]
}
```

#### Réponse — après PR-2 (contrat bilingue)

Nouveaux champs en **gras** :

```json
{
  "traite": "Pesachim",
  "page": "6a",
  "reference": "Pesachim 6a",
  "corpus": "Bavli",
  "source_text_id": "...",
  "target_language": "fr",
  "segments_count": 12,
  "translated_count": 0,
  "translated_count_by_language": {"fr": 0, "en": 12},   // 🆕
  "commentaries_total": 95,
  "segments": [
    {
      "index": 1,
      "segment_id": "...",
      "hebrew_text": "...",
      "reference_translation": {                          // 🆕
        "id": "...",
        "translated_text": "And Rava said...",
        "target_language": "en",
        "version": 1,
        "is_current": true,
        "is_reference": true,
        "provider": "Sefaria",
        "model": "Koren",
        "quality_score": null,
        "job_id": null,
        "created_at": "2026-..."
      },
      "translation": null,
      "translations": [
        {
          "id": "...",
          "translated_text": "And Rava said...",
          "target_language": "en",
          "version": 1,
          "is_current": true,
          "is_reference": true,
          "provider": "Sefaria",
          "model": "Koren"
        }
      ],
      "has_translation": false,
      "commentaries": [
        {
          "id": "5435ec1c-...",
          "commentator": "Rashi",
          "reference_translation": null,                    // 🆕 (null tant qu'import EN W. Davidson pas livré, cf. D-2)
          "translation": {
            "text": "Gemara : On aurait pu penser que...",
            "target_language": "fr",
            "provider": "anthropic",
            "model": "claude-sonnet-4"
          },
          "translations": [...]
        }
      ]
    }
  ]
}
```

#### Codes HTTP

| Code | Cas |
|---|---|
| 200 | OK |
| 400 | `AmbiguousReferenceError` (corpus manquant si ambigu) — inchangé |
| 400 | `INVALID_QUERY_PARAMETER` — 🆕 PR-2 si `target_language` contient une virgule ou n'est pas ISO 639-1 |
| 404 | `(traite, page)` introuvable — inchangé |
| 422 | 🆕 PR-2 si `target_language` absent (Pydantic standard) |

---

### 13.2 `GET /api/talmud/segment/{traite}/{page}/{segment}/commentaries` 🔧 PR-1

Endpoint utilisé par n8n pour drill-down sur un segment précis (audit qualité). **Même bug que §13.1**, corrigé dans PR-1.

#### Paramètres

| Paramètre | Type | Requis | Notes |
|---|---|---|---|
| `traite` | path | ✅ | |
| `page` | path | ✅ | |
| `segment` | path | ✅ | Index segment (1-based) |
| `commentator` | query | non | Filtre ILIKE (`Rashi`, `Tosafot`...) |

#### Exemple requête

```http
GET /api/talmud/segment/Pesachim/6a/3/commentaries?commentator=Rashi HTTP/1.1
```

#### Réponse — avant PR-1

Les champs `has_translation` et `translation` issus du dead-code `extra_data->'translation'` sont systématiquement vides.

```json
{
  "traite": "Pesachim", "page": "6a", "segment": 3, "commentator": "Rashi",
  "commentaries": [
    {
      "id": "...", "commentator": "Rashi", "reference": "Rashi on Pesachim 6a:3",
      "has_translation": false,        // ❌ BUG
      "has_vocalization": true,
      "translation": null              // ❌ BUG (clé absente)
    }
  ],
  "stats": {"total": 6, "translated": 0, "vocalized": 6}
}
```

#### Réponse — après PR-1

```json
{
  "...": "[shape inchangée]",
  "commentaries": [
    {
      "id": "...", "commentator": "Rashi",
      "has_translation": true,        // ✅
      "translation": {                // ✅
        "text_preview": "Selon Rashi, l'expression désigne...",
        "target_language": "fr",
        "provider": "anthropic",
        "model": "claude-sonnet-4"
      }
    }
  ],
  "stats": {"total": 6, "translated": 4, "vocalized": 6}
}
```

**Note** : pas de `reference_translation` ajouté ici en PR-2 (endpoint préview, n8n ne s'en sert pas pour traduire — utiliser §13.1 pour le pivot).

---

### 13.3 `POST /api/talmud/commentaries/translations` 🔧 PR-1

Endpoint batch pour récupérer les traductions de plusieurs commentaires par UUIDs. **Même bug**, corrigé dans PR-1.

#### Requête

```http
POST /api/talmud/commentaries/translations HTTP/1.1
Content-Type: application/json

{
  "ids": [
    "5435ec1c-d801-4a44-adf9-57d7d303703d",
    "d47abe26-1b83-454d-b58b-8a9c8666cdcf",
    "00000000-0000-0000-0000-000000000000"
  ]
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `ids` | array<UUID> | min 1, max 100 |

#### Réponse — avant PR-1 (toujours `null` partout)

```json
{
  "translations": {
    "5435ec1c-...": null,    // ❌ alors que la trad existe
    "d47abe26-...": null,    // ❌
    "00000000-...": null
  },
  "found": 0,
  "not_found": 3
}
```

#### Réponse — après PR-1

```json
{
  "translations": {
    "5435ec1c-...": {
      "text": "Gemara : On aurait pu penser que...",
      "provider": "anthropic",
      "model": "claude-sonnet-4",
      "translated_at": "2026-04-26T10:31:04+00:00"
    },
    "d47abe26-...": {
      "text": "C'est pourquoi 'ne sera pas trouvé'...",
      "provider": "anthropic",
      "model": "claude-sonnet-4",
      "translated_at": "2026-04-26T10:31:09+00:00"
    },
    "00000000-...": null
  },
  "found": 2,
  "not_found": 1
}
```

#### Codes HTTP

| Code | Cas |
|---|---|
| 200 | OK |
| 400 | Liste IDs vide |
| 422 | Plus de 100 IDs ou IDs non-UUID (Pydantic) |

#### Évolution PR-2 envisagée (à arbitrer)

Optionnellement, exposer `target_language` filtre dans le payload requête pour récupérer plusieurs langues :

```jsonc
{
  "ids": [...],
  "target_language": "fr"   // 🆕 optionnel, default toutes langues courantes
}
```

→ **Décision** : à arbitrer post-PR-1. Pas indispensable si les UI clientes lisent §13.1 directement. Marquer "non prévu PR-2" sauf demande n8n.

---

### 13.4 `GET /api/talmud/text/{traite}/{page}` ⛔ Hors scope

Retourne uniquement le texte hébreu segmenté. **Aucune traduction renvoyée**, donc pas concerné par la RFC.

#### Réponse

```json
{
  "traite": "Pesachim",
  "page": "6a",
  "hebrew_text": "...",
  "segments": [
    {"index": 0, "text": "..."},
    {"index": 1, "text": "..."}
  ]
}
```

→ **Inchangé après PR-1 et PR-2.**

---

### 13.5 `GET /api/talmud/commentary/{commentary_id}` ⛔ Hors scope

Retourne le détail brut d'un commentaire (champs DB).

#### Réponse

```json
{
  "id": "5435ec1c-...",
  "source_text_id": "...",
  "commentator": "Rashi",
  "reference": "Rashi on Pesachim 6a:3",
  "text": "...",
  "hebrew_text": "...",
  "segment": 3,
  "sub_segment": 1,
  "position": null,
  "metadata": {...},
  "created_at": "2026-..."
}
```

→ **Inchangé.** Les traductions sont à récupérer via §13.3 (batch) ou §13.1 (page complète). Endpoint à harmoniser dans une PR ultérieure si besoin (cf. §8 out of scope).

---

### 13.6 `GET /api/talmud/traites` ⛔ Hors scope

Retourne le catalogue traités. Pas de traduction.

```json
{
  "traites": [{"name": "Berakhot", "corpus": "Bavli", "seder": "Zeraim"}, ...],
  "total": 42,
  "corpus_filter": "Bavli"
}
```

→ **Inchangé.**

---

### 13.7 `GET /api/talmud/traite/{traite}/pages` ⛔ Hors scope

Liste pages d'un traité.

```json
{"traite": "Pesachim", "pages": ["2a", "2b", "3a", ...], "total": 121}
```

→ **Inchangé.**

---

### 13.8 `GET /api/talmud/stats` ⛔ Hors scope

Statistiques agrégées.

```json
{
  "source_texts": {"total": 5234, "traites": 42},
  "commentaries": {"total": 426976, "commentators": 87},
  "links": {"index_files": 1234, "total_links": 45678}
}
```

→ **Inchangé.**

---

### 13.9 Endpoints **non créés** par cette RFC (futurs envisagés)

À titre d'information pour n8n. Aucun de ces endpoints n'est livré avec PR-1/PR-2.

| Endpoint envisagé | Cas d'usage | Statut |
|---|---|---|
| `POST /api/talmud/translate-segment` | Soumettre un job de traduction Hébreu→FR avec EN-pivot intégré côté API (au lieu de n8n) | 📋 Backlog post-PR-2 |
| `GET /api/talmud/segment/{id}/translations?lang=fr,de,es` | Lecture multi-langues sur un segment unique | 📋 Si demande utilisateur |
| `GET /api/talmud/page/.../segments?include_languages=fr,en,de` | Lecture multi-langues sur page (réintroduit le multi-lang refusé en D-1 #1) | ❌ Non prévu (cf. §3 décision #1) |
| `POST /api/talmud/commentaries/translate` | Job batch traduction commentaires avec EN-pivot | 📋 Backlog dépend de l'import EN (D-2) |

---

### 13.10 Récapitulatif PR / scope

| Endpoint | Bugfix PR-1 | Contrat bilingue PR-2 |
|---|:---:|:---:|
| `GET /page/{t}/{p}/segments` | ✅ | ✅ |
| `GET /segment/{t}/{p}/{s}/commentaries` | ✅ | — |
| `POST /commentaries/translations` | ✅ | — (réservé) |
| `GET /text/{t}/{p}` | — | — |
| `GET /commentary/{id}` | — | — |
| `GET /traites`, `/traite/{t}/pages`, `/stats` | — | — |

→ **PR-1** : 3 endpoints touchés (cohérence du bugfix `commentary_translations`).
→ **PR-2** : 1 seul endpoint touché (`/segments`), surface du contrat bilingue.

— API, 2026-04-26

---

## 14. Réponse équipe DATA (round 2) — 2026-04-26

### 14.1 Synthèse

Sections §11 (API) et §12 (n8n) lues et validées sur le fond. Les positions convergent sur l'option B (`is_reference`). Cette section consigne mes commentaires de revue + l'engagement de livraison côté DATA.

### 14.2 Commentaires de revue

#### 14.2.1 §13.1 — `is_reference` exposé dans la réponse API

L'API expose `is_reference: true` dans `reference_translation` et `translations[]` (l. 865, 880). C'est cohérent avec D-1 option B, **mais** : cette colonne devient partie du contrat externe et donc stable + versionnée. Plus de renommage possible sans breaking change API.

→ **À assumer explicitement** dans la migration `20260427_add_is_reference.py` (commentaire SQL clair). Pas un blocage.

#### 14.2.2 §11.3 point #3 — `pending_translations` vs `translations_v2`

Bon réflexe API d'ajouter un test explicite : un segment ayant uniquement `pending_translations` (pas encore résolu vers `translations_v2`) doit retourner `translation: null`, pas de fallback. **Validé.**

#### 14.2.3 §12.5 — Format prompt LLM (n8n)

Le prompt est solide. Une remarque non-bloquante :

> *"If the Hebrew is ambiguous, follow the English interpretation"* (l. 723)

→ Risque : sur certains passages, la tradition rabbinique francophone diverge volontairement de la lecture anglo-saxonne (ex. lectures Rashi vs Soncino). Suggestion de reformulation :

> *"If the Hebrew is ambiguous, use the English as a disambiguation hint, not as ground truth."*

Décision n8n.

#### 14.2.4 §13.3 — `POST /commentaries/translations` PR-2

Évolution proposée (filtre `target_language` dans payload) **non indispensable côté DATA**. La table `commentary_translations` a déjà `target_language` indexé. Si l'API souhaite l'ajouter, aucune adaptation DB requise. À arbitrer côté API en fonction des besoins n8n.

#### 14.2.5 §13.9 — Endpoint futur `POST /api/talmud/translate-segment`

À backlogger avec une réflexion DATA séparée :
- Qui écrit dans `translations_v2` (API ? worker dédié ? n8n via API ?) ;
- Schéma d'auth pour les writes (clé service ? token utilisateur ?) ;
- Idempotence (clé naturelle = `(segment_id, target_language, version)`).

**Pas urgent**. À ouvrir en ticket distinct quand le besoin sera priorisé.

### 14.3 Migration `20260427_add_is_reference.py` — engagement DATA

#### 14.3.1 Schéma de la migration

```sql
-- 20260427_add_is_reference.py
-- D-1 (RFC bilingual-translations-en-pivot §11) : ajout colonne sémantique
-- explicite pour identifier les traductions de référence éditoriale.
-- NB : cette colonne devient partie du contrat API public — stable et versionnée.

ALTER TABLE translations_v2          ADD COLUMN is_reference BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE commentary_translations  ADD COLUMN is_reference BOOLEAN NOT NULL DEFAULT false;

-- Backfill : marquer les 23 204 traductions Sefaria/Koren existantes
UPDATE translations_v2
   SET is_reference = true
 WHERE provider = 'Sefaria' AND model = 'Koren';

-- Vérification post-migration (à exécuter manuellement) :
--   SELECT COUNT(*) FROM translations_v2 WHERE is_reference = true;
--   -- attendu : 23 204

-- Pas de CHECK constraint : marqueur purement déclaratif, contrôlé par les
-- scripts d'import. Permet l'évolutivité (Soncino, William Davidson, ArtScroll
-- comme futures sources de référence sans modification du schéma).

-- Pas d'index proactif sur (segment_id, target_language, is_reference).
-- À mesurer post-PR-2 (cf. Q-DATA-3) :
--   CREATE INDEX idx_t2_segment_lang_ref
--     ON translations_v2 (segment_id, target_language) WHERE is_reference = true;
```

#### 14.3.2 Décision DATA — pas de CHECK constraint

Question soulevée dans la revue : faut-il un `CHECK (NOT is_reference OR provider IN ('Sefaria'))` ?

**Réponse DATA : non.**

Motivation : un CHECK couplerait à nouveau le marqueur sémantique à la valeur `provider`. Si demain on importe Soncino EN comme référence (`provider='Soncino', model='Soncino-1952'`), il faut modifier le CHECK. C'est exactement le couplage qu'on cherche à éviter avec l'option B.

→ **Marqueur purement déclaratif**, garanti par les scripts d'import (`import_tanakh.py` met `is_reference=true` ; `Torah_Translate_Page` côté n8n met `is_reference=false`).

#### 14.3.3 Mise à jour `import_tanakh.py`

À faire **dans la même PR** que la migration : l. 463 du script, ajouter `is_reference=true` dans l'INSERT translations_v2 pour les futurs imports Tanakh (idempotent grâce au DEFAULT false sur les insertions hors Sefaria/Koren).

#### 14.3.4 ETA livraison

| Tâche | Effort | ETA |
|---|---|---|
| Migration `20260427_add_is_reference.py` (alembic) | 30 min | J+0 (immédiat dès GO) |
| Patch `scripts/sefaria/import_tanakh.py` (l. 463) | 15 min | J+0 |
| Tests : vérifier `COUNT(*) WHERE is_reference=true = 23 204` | 15 min | J+0 |
| Documentation `docs/guides/tanakh-import-design.md` (D-4) | 30 min | J+0 |
| **Total** | **~1.5h** | **J+0** |

→ Bloqué uniquement sur **GO formel D-1 par lead API**.

### 14.4 Réponses aux questions techniques additionnelles

#### Q : Soncino, c'est quoi ?

Pour mémoire, en cas de relecture future de cette RFC :

**Soncino Talmud** = traduction anglaise du Bavli publiée par les éditions Soncino Press (1935-1952), sous la direction du Rabbi Isidore Epstein. Pendant ~50 ans, c'était la traduction anglaise de référence du Talmud, avant l'arrivée de l'ArtScroll Schottenstein (1990-2000s) puis du William Davidson Talmud (Sefaria, basé sur Steinsaltz EN, CC-BY-NC).

Caractéristiques :
- Couvre l'intégralité du Bavli ;
- Licence restrictive (non CC) — d'où l'inscription "partiel" dans §10.2 (seuls quelques traités libres de droits sont disponibles sur Sefaria) ;
- Style académique/littéraire, moins didactique que W. Davidson.

**Implication pour la RFC** : Soncino est un **candidat futur** pour l'import de traductions EN de référence (commentaires + segments principaux Bavli). Si demain on l'importe avec `provider='Soncino', model='Soncino-1952'`, l'option B (`is_reference` dédié) permet de le marquer comme référence sans modifier le schéma ni l'API.

### 14.5 Décisions DATA verrouillées (round 2)

| # | Décision | Statut |
|---|---|---|
| D-1 | Migration `is_reference` (option B) — pas de CHECK | ✅ verrouillé DATA, attente GO API lead |
| D-1bis | Patch `import_tanakh.py` même PR | ✅ verrouillé |
| D-2 | Backlog "import commentaires EN W. Davidson" post-PR-2 | ✅ acté, ticket à créer |
| D-3 | Code erreur API `INVALID_QUERY_PARAMETER` | ✅ pris note (côté API) |
| D-4 | Convention versioning EN documentée dans `tanakh-import-design.md` | ✅ inclus dans la livraison ci-dessus |

### 14.6 État global RFC après round 2

| Section | Owner | Statut |
|---|---|---|
| §1-9 (proposition initiale) | API | ✅ stabilisée |
| §10 réponse DATA round 1 | DATA | ✅ stabilisée |
| §11 réponse API round 1 | API | ✅ stabilisée |
| §12 réponse n8n round 1 | n8n | ✅ stabilisée |
| §13 inventaire endpoints | API | ✅ stabilisée |
| §14 réponse DATA round 2 | DATA | ✅ stabilisée |

**Action immédiate** : attente du GO lead API sur D-1. Migration livrable en J+0 dès GO. Aucun autre blocage côté DATA.

— DATA, 2026-04-26

---

## 15. Réponse équipe n8n (round 2) — 2026-04-26

### 15.1 Synthèse

Sections §13 (inventaire endpoints) et §14 (DATA round 2) lues et validées. L'inventaire exhaustif des payloads est exactement ce dont n8n avait besoin pour l'implémentation. Aucun blocage technique identifié.

### 15.2 Réponse aux commentaires DATA

#### 15.2.1 §14.2.3 — Reformulation du prompt LLM

**✅ Accepté.** La suggestion DATA est pertinente. Le prompt §12.5 est mis à jour :

**Avant** (l. 723) :
> "If the Hebrew is ambiguous, follow the English interpretation"

**Après** :
> "If the Hebrew is ambiguous, use the English as a disambiguation hint, not as ground truth."

Motivation : la tradition rabbinique francophone peut diverger de la lecture anglo-saxonne. L'EN sert de **repère terminologique**, pas de **source d'autorité**. Le traducteur LLM conserve une marge d'interprétation alignée sur les conventions FR (lectures Rashi françaises, terminologie halakhique francophone).

#### 15.2.2 §14.2.4 — Filtre `target_language` sur `POST /commentaries/translations`

**Pas de besoin immédiat côté n8n.** Nous lisons les traductions commentaires via §13.1 (`/segments`). Le batch §13.3 sert uniquement pour des audits ponctuels. Si le besoin émerge (ex. export multi-langues), on reviendra vers API.

### 15.3 Validation de l'inventaire §13

L'inventaire est complet et actionable. Points de validation spécifiques :

| § | Endpoint | Validation n8n |
|---|---|---|
| 13.1 | `GET /page/.../segments` | ✅ Payloads clairs, nouveaux champs (`reference_translation`, `translated_count_by_language`, `is_reference`) bien documentés |
| 13.2 | `GET /segment/.../commentaries` | ✅ Bugfix PR-1 suffisant, pas besoin de `reference_translation` ici |
| 13.3 | `POST /commentaries/translations` | ✅ Bugfix PR-1, évolution PR-2 optionnelle OK |
| 13.4 | `GET /text/{t}/{p}` | ✅ Hors scope confirmé (n8n utilise `/segments`) |
| 13.5-13.8 | Autres endpoints | ✅ Hors scope, non utilisés par les workflows de traduction |

### 15.4 Mise à jour du prompt LLM (version finale)

Suite à §15.2.1, voici le prompt corrigé qui sera implémenté dans `Torah_Translate_Simple` :

```
Translate the following Hebrew Talmudic passage to {target_language}.
Use the official Sefaria/Koren English translation as a reference for terminology, proper nouns, and disambiguation.

## Hebrew Source
{hebrew_text}

## Reference Translation (English, Sefaria/Koren)
{reference_translation.translated_text}

## Instructions
- Maintain the same meaning as the Hebrew source
- Use standard {target_language} Talmudic terminology
- Preserve proper nouns as transliterated in the English reference
- If the Hebrew is ambiguous, use the English as a disambiguation hint, not as ground truth

Provide the {target_language} translation:
```

**Cas `reference_translation=null`** : le bloc "Reference Translation" est omis, et l'instruction finale devient "Translate directly from Hebrew, using standard {target_language} Talmudic terminology."

### 15.5 Timeline révisée

Avec §14.3.4 confirmant DATA ready J+0 :

| Étape | Owner | ETA révisé |
|---|---|---|
| GO lead API sur D-1 | API | J+0 (attente) |
| Migration `is_reference` | DATA | J+0 (dès GO) |
| PR-1 bugfix `commentary_translations` | API | J+1 |
| PR-2 contrat bilingue | API | J+2 |
| **n8n Phase 1** (adaptation workflows) | n8n | **J+3** |
| n8n Phase 2 (bouton EN Discord, métriques) | n8n | J+5 (si priorisé) |

### 15.6 Checklist implémentation n8n (Phase 1)

Pour référence lors de l'implémentation :

- [ ] `Torah_Get_Page_Translations.json` : toujours envoyer `target_language` (même si `include_translations=false`)
- [ ] `Torah_Translate_Page.json` : extraire `reference_translation` dans Extract Segments
- [ ] `Torah_Router.json` : propager `reference_translation.translated_text` au workflow de traduction
- [ ] `Torah_Translate_Simple.json` : implémenter le prompt §15.4 avec fallback si `reference_translation=null`
- [ ] Tests E2E : Pesachim 6a (12 segments EN), Berakhot 2a (couverture FR existante)

### 15.7 Décisions n8n verrouillées (round 2)

| # | Décision | Statut |
|---|---|---|
| 1 | Prompt reformulé : EN = "disambiguation hint, not ground truth" | ✅ verrouillé |
| 2 | Pas de demande pour filtre `target_language` sur §13.3 | ✅ verrouillé |
| 3 | Inventaire §13 validé, aucune demande additionnelle | ✅ verrouillé |

### 15.8 État global RFC après round 2 (all teams)

| Section | Owner | Statut |
|---|---|---|
| §1-9 (proposition initiale) | API | ✅ stabilisée |
| §10 réponse DATA round 1 | DATA | ✅ stabilisée |
| §11 réponse API round 1 | API | ✅ stabilisée |
| §12 réponse n8n round 1 | n8n | ✅ stabilisée |
| §13 inventaire endpoints | API | ✅ stabilisée |
| §14 réponse DATA round 2 | DATA | ✅ stabilisée |
| §15 réponse n8n round 2 | n8n | ✅ stabilisée |

**RFC prête pour GO lead API.** Aucun blocage côté n8n. Implémentation Phase 1 démarrable dès PR-2 mergée.

— n8n, 2026-04-26
