# Stats de traduction par page — contrat API pour le plugin Torah

**Date :** 2026-05-19
**Émetteur :** équipe API torah-api
**Destinataire :** équipe plugin Torah
**Endpoint :** `GET /api/talmud/page/{traite}/{page}/stats`
**Statut :** implémenté, branche `feat/page-stats`.

## TL;DR

Endpoint léger qui renvoie, pour une page donnée, le nombre de commentaires
totaux et traduits **par commentateur**, trié alphabétiquement. Conçu pour
alimenter un bouton "stats" côté plugin sans avoir à charger le payload
complet de `/segments`.

**Cadrage produit (2026-05-19) :** pas de filtre de langue — un commentaire
est "traduit" dès qu'il a **au moins une traduction courante**, peu importe
la langue cible.

---

## 1. Contrat de l'endpoint

### Méthode et URL

```
GET /api/talmud/page/{traite}/{page}/stats
```

### Paramètres de chemin

| Param | Type | Description | Exemple |
|---|---|---|---|
| `traite` | string | Nom du traité, normalisé côté API (alias acceptés : `soukka`, `berachot`, etc.). | `Pesachim`, `Mishnah Arakhin`, `Jerusalem Talmud Berakhot` |
| `page` | string | Identifiant de page selon le format du corpus. | Bavli : `8a`, `7b` · Mishnah : `1`, `5` · Yerushalmi : `1:2` |

### Paramètres de requête

| Param | Type | Obligatoire | Description |
|---|---|---|---|
| `corpus` | string | Si ambigu | Nom de corpus ou alias (`Bavli`, `Mishnah`, `Yerushalmi`...). Requis si `(traite, page)` matche plusieurs corpus (sinon HTTP 400). |

### Pas de paramètre langue

Volontaire. Le bouton stats agrège tous les commentaires traduits dans
n'importe quelle langue. Si un commentaire a une traduction FR active **et**
une traduction EN reference (Sefaria/Koren), il compte une fois.

---

## 2. Payload de sortie

### Cas nominal — HTTP 200

```http
GET /api/talmud/page/Pesachim/7b/stats
```

```json
{
  "traite": "Pesachim",
  "page": "7b",
  "reference": "Pesachim 7b",
  "corpus": "Bavli",
  "source_text_id": "340bcf91-973f-4445-96d8-b029d1ec5120",
  "by_commentator": [
    { "commentator": "Ben Yehoyada",            "total":  2, "translated":  2 },
    { "commentator": "Chiddushei Ramban",       "total":  1, "translated":  1 },
    { "commentator": "Chidushei Agadot",        "total":  1, "translated":  1 },
    { "commentator": "Chidushei Chatam Sofer",  "total":  4, "translated":  4 },
    { "commentator": "Chidushei Halachot",      "total":  3, "translated":  3 },
    { "commentator": "Gilyon HaShas",           "total":  1, "translated":  1 },
    { "commentator": "Haggahot Ya'avetz",       "total":  1, "translated":  1 },
    { "commentator": "Meiri",                   "total": 16, "translated": 16 },
    { "commentator": "Rashash",                 "total":  3, "translated":  3 },
    { "commentator": "Rashi",                   "total": 18, "translated": 18 },
    { "commentator": "Rif",                     "total":  1, "translated":  1 },
    { "commentator": "Ritva",                   "total":  6, "translated":  6 },
    { "commentator": "Rosh",                    "total":  2, "translated":  2 },
    { "commentator": "Steinsaltz",              "total": 19, "translated": 19 },
    { "commentator": "Tosafot",                 "total": 17, "translated": 17 }
  ],
  "totals": { "commentaries": 95, "translated": 95 }
}
```

### Sémantique des champs

| Champ | Type | Sémantique |
|---|---|---|
| `traite` | string | Traité normalisé (sortie de `normalize_traite`). |
| `page` | string | Page telle que reçue (non transformée). |
| `reference` | string | Référence canonique résolue en DB (`{traite} {page}` ou `{traite}, {page}`). |
| `corpus` | string | Corpus résolu (`Bavli`, `Mishnah`, ...). |
| `source_text_id` | UUID | ID du `source_texts` correspondant — utile si vous voulez chaîner d'autres appels par UUID. |
| `by_commentator[]` | array | Tri alphabétique sur `commentator`. Toujours présent (vide si page sans commentaire). |
| `by_commentator[].commentator` | string | Nom du commentateur (`Rashi`, `Tosafot`, `Meiri`, ...). |
| `by_commentator[].total` | int | Nombre de lignes `commentary_details` pour ce commentateur sur cette page. |
| `by_commentator[].translated` | int | Sous-ensemble de `total` ayant **au moins une traduction `is_current = true`** (toute langue confondue). |
| `totals.commentaries` | int | Somme des `total` (= nombre total de commentaires sur la page). |
| `totals.translated` | int | Somme des `translated`. |

### Cas — page sans commentaire

```json
{
  "traite": "Pesachim",
  "page": "2a",
  "reference": "Pesachim 2a",
  "corpus": "Bavli",
  "source_text_id": "...",
  "by_commentator": [],
  "totals": { "commentaries": 0, "translated": 0 }
}
```

Le bouton plugin peut afficher "Aucun commentaire" ou désactiver l'overlay.

### Cas — exemple contrasté `Pesachim 8a` (1 traduit sur 90)

```json
{
  "traite": "Pesachim",
  "page": "8a",
  "by_commentator": [
    { "commentator": "Ben Yehoyada",           "total":  2, "translated": 0 },
    { "commentator": "Chidushei Agadot",       "total":  1, "translated": 0 },
    { "commentator": "Chidushei Chatam Sofer", "total":  4, "translated": 0 },
    { "commentator": "Chidushei Halachot",     "total":  2, "translated": 0 },
    { "commentator": "Haggahot Ya'avetz",      "total":  2, "translated": 0 },
    { "commentator": "HaMaor",                 "total":  1, "translated": 1 },
    { "commentator": "Meiri",                  "total":  8, "translated": 0 },
    { "commentator": "Penei Yehoshua",         "total":  1, "translated": 0 },
    { "commentator": "Petach Einayim",         "total":  1, "translated": 0 },
    { "commentator": "Rashi",                  "total": 39, "translated": 0 },
    { "commentator": "Rif",                    "total":  3, "translated": 0 },
    { "commentator": "Ritva",                  "total":  1, "translated": 0 },
    { "commentator": "Rosh",                   "total":  3, "translated": 0 },
    { "commentator": "Steinsaltz",             "total": 18, "translated": 0 },
    { "commentator": "Tosafot",                "total":  4, "translated": 0 }
  ],
  "totals": { "commentaries": 90, "translated": 1 }
}
```

Le bouton stats peut alors mettre en évidence les 89 commentaires non
traduits, par commentateur (`Rashi` 39, `Steinsaltz` 18, `Meiri` 8...) pour
prioriser le travail de traduction.

---

## 3. Erreurs

### HTTP 400 — `AmbiguousReferenceError`

La référence `{traite} {page}` matche plusieurs corpus et `?corpus=` n'a pas
été fourni.

```http
GET /api/talmud/page/Pesachim/4a/stats
```

```json
{
  "detail": {
    "code": "AmbiguousReferenceError",
    "message": "Reference 'Pesachim 4a' matches multiple corpus",
    "matches": [
      { "corpus": "Bavli",   "project_id": "..." },
      { "corpus": "Mishnah", "project_id": "..." }
    ],
    "hint": "Add ?corpus=<Bavli|Mishnah> to disambiguate"
  }
}
```

À ce jour, `Pesachim` n'existe qu'en Bavli — mais la désambigüation est en
place pour les corpus partagés futurs.

### HTTP 404 — Référence inconnue

```json
{ "detail": "No source_text found for reference='Pesachim 999z'" }
```

---

## 4. Recommandation d'intégration

### Affichage du bouton stats

Pour chaque page chargée, vous pouvez :

```python
import requests

def fetch_page_stats(traite: str, page: str, corpus: str | None = None) -> dict:
    params = {"corpus": corpus} if corpus else {}
    response = requests.get(
        f"{API_URL}/api/talmud/page/{traite}/{page}/stats",
        params=params,
        timeout=5,
    )
    response.raise_for_status()
    return response.json()

stats = fetch_page_stats("Pesachim", "7b")
total = stats["totals"]["commentaries"]
translated = stats["totals"]["translated"]
button_label = f"📊 {translated}/{total} commentaires traduits"
```

### Drill-down par commentateur

Si l'utilisateur clique sur le bouton stats, affichez la liste détaillée :

```python
for entry in stats["by_commentator"]:
    fraction = entry["translated"] / entry["total"] if entry["total"] else 0
    print(f"{entry['commentator']:25s} {entry['translated']:4d}/{entry['total']:4d}  ({fraction:.0%})")
```

### Alternative — sans appel séparé

Si vous avez déjà chargé `/page/{traite}/{page}/segments` (pour afficher la
page), le payload inclut déjà `has_translation: bool` sur chaque commentaire.
Vous pouvez agréger côté client :

```python
from collections import defaultdict

def compute_stats_from_segments_payload(segments_data: list[dict]) -> dict:
    counts = defaultdict(lambda: {"total": 0, "translated": 0})
    for seg in segments_data:
        for comm in seg.get("commentaries", []):
            c = comm["commentator"]
            counts[c]["total"] += 1
            if comm.get("has_translation"):
                counts[c]["translated"] += 1
    return [
        {"commentator": c, **v}
        for c, v in sorted(counts.items())
    ]
```

À noter : `has_translation` côté `/segments` est **filtré par
`target_language`** (le paramètre obligatoire de l'endpoint). Donc
l'agrégation locale donnerait des stats par langue. L'endpoint `/stats`
est cross-langue par design, c'est la différence sémantique majeure.

---

## 5. Performance et caching

- **Coût DB** : une requête `_resolve_source_text_flexible` (~1 ms) + une
  requête agrégée avec `EXISTS` sur l'index `idx_ct_cd` (~5 ms sur les
  pages les plus chargées comme Pesachim 121b). Pas de chargement du
  texte hébreu / des traductions.
- **Pas de cache côté API** pour cette première livraison (volume attendu
  faible, cadrage 2026-05-19). Si vous montez en charge, prévenez l'API
  team — on ajoutera un cache Redis ou un ETag avec invalidation sur
  `commentary_translations.updated_at`.

---

## 6. Tests et validation

- **9 tests unitaires** (`tests/unit/api/test_page_stats.py`) :
  shape réponse, tri alphabétique, `EXISTS` cross-langue, absence de
  filtre langue, totals agrégation, page vide.
- **Sanity check end-to-end** :
  - Pesachim 7b : 15 commentateurs, 95 commentaires totaux, 95 traduits ✓
  - Pesachim 8a : 15 commentateurs, 90 commentaires totaux, 1 traduit (HaMaor) ✓

---

## 7. Évolutions possibles (non livrées)

- **Filtre par langue** : ajout d'un `?target_language=fr` qui restreindrait
  `translated` à la langue donnée. Demandez si nécessaire — coût ~10 min.
- **Cache Redis** : si volume > 10 RPS.
- **ETag / `If-None-Match`** : court-circuit 304 si la page n'a pas changé.
- **Stats inter-pages** : `/api/talmud/traite/{traite}/stats` pour
  agréger sur tout un traité. Demande potentielle future.
- **Inclusion `has_vocalization`** : si le bouton stats étend son scope à
  la vocalisation, on peut ajouter une colonne `vocalized` au payload.
