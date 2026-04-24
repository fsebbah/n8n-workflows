# Migration webhooks n8n — API Torah v2

**Date :** 2026-04-23 (mise à jour)
**Destinataires :** équipe API Torah, équipe n8n (plugin-torah, workflows `Torah_*`)
**Statut :** Document de migration consolidé après RFC-062 et PR #286-#339

Ce document liste les changements de contrat API et les ajustements n8n effectués.
La documentation complète des webhooks actifs est dans `TORAH_WEBHOOKS_V2.md`.

---

## 1. Changements majeurs API v2

| # | Nature | Changement | Impact |
|---|--------|------------|--------|
| 1 | **Breaking** | `segment_id` (UUID) remplace `source_text_id` + `segment_index` | Tous les workflows de sauvegarde |
| 2 | **Breaking** | 3 modes de sauvegarde : `segment_id`, `commentary_id`, `source_text` | `torah-save`, `torah-router` |
| 3 | **Nouveau** | Paramètre `?corpus=` pour désambiguïsation | `torah-get-page-translations` |
| 4 | **Nouveau** | `AmbiguousReferenceError` (HTTP 400) | Gestion d'erreur côté client |
| 5 | **Nouveau** | 3 endpoints de navigation corpus | Nouveaux webhooks créés |
| 6 | **Enrichi** | `segments[].translations[]` (historique) | Optionnel à consommer |
| 7 | **Enrichi** | `commentaries[].commentary_id`, `traite`, `page`, `segment_num` | Alias stables |

---

## 2. Webhooks actifs (9 total)

### 2.1 Nouveaux webhooks corpus (3)

| Webhook | Endpoint API | Description |
|---------|--------------|-------------|
| `torah-corpus` | `GET /api/corpus` | Liste des corpus disponibles |
| `torah-corpus-sedarim` | `GET /api/corpus/{corpus}/sedarim` | Sedarim d'un corpus |
| `torah-corpus-traites` | `GET /api/corpus/{corpus}/sedarim/{seder}` | Traités d'un seder |

**Fichiers créés :**
- `workflows/Torah_Corpus.json`
- `workflows/Torah_Corpus_Sedarim.json`
- `workflows/Torah_Corpus_Traites.json`

### 2.2 Webhooks modifiés pour API v2

#### `torah-get-page-translations`

**Endpoint :** `GET /api/talmud/page/{traite}/{page}/segments?corpus={corpus}`

**Changements :**
- Ajout du paramètre `corpus` (requis si traité ambigu)
- Nouveaux champs disponibles : `translations[]`, `commentary_id`, `traite`, `page`, `segment_num`

#### `torah-save` (via `torah-router`)

**Endpoint :** `POST /api/translations/save`

**Changement critique — 3 modes exclusifs :**

```json
// Mode 1: segment_id (traductions de segments)
{ "segment_id": "uuid", "translated_text": "...", "target_language": "fr" }

// Mode 2: commentary_id (traductions de commentaires)
{ "commentary_id": "uuid", "translated_text": "...", "target_language": "fr" }

// Mode 3: source_text (traductions en attente)
{ "source_text": "texte hébreu", "translated_text": "...", "target_language": "fr" }
```

**Erreur si aucun des trois n'est fourni :**
```json
{
  "detail": "Missing target. Provide exactly one of: `segment_id`, `commentary_id`, or `source_text`."
}
```

#### `torah-router` (orchestrateur)

**Fix appliqué (2026-04-23) :**

Le node "Prepare Save" passait `source_text_id` (ancien champ) au lieu de `segment_id` (API v2).

```diff
// Avant (incorrect)
- source_text_id: loopItem.source_text_id

// Après (corrigé)
+ segment_id: loopItem.segment_id,
+ source_text: loopItem.source_text
```

**Fichier modifié :** `workflows/Torah_Router.json`

**Note :** `torah-router` orchestre via **appels HTTP aux webhooks**, pas via MongoDB.

### 2.3 Webhooks inchangés (4)

| Webhook | Endpoint API | Statut |
|---------|--------------|--------|
| `torah-sources` | `GET /api/torah/sources` | Inchangé |
| `torah-list` | `GET /api/talmud/traites` | Inchangé |
| `torah-job-status` | `GET /api/v2/jobs/{id}` | Inchangé |
| `torah-vocalization` | `GET/POST /api/vocalization/*`, `POST /api/commentaries/nekudot` | Inchangé |

### 2.4 Webhooks internes (appelés par torah-router)

| Webhook | Rôle |
|---------|------|
| `torah-translate` | Worker de traduction (Claude) |
| `torah-save` | Worker de sauvegarde (→ POST /api/translations/save) |
| `torah-error` | Collecteur d'erreurs (Redis) |
| `torah-chunk` | Découpage texte long |

**Note :** `torah-translate-page` est un webhook **exposé** (pas interne) - voir §2.2.

---

## 3. Webhooks OBSOLÈTES (6 total - à ne PAS créer/utiliser)

| Webhook obsolète | Remplacement | Statut |
|------------------|--------------|--------|
| `torah-sources` | `torah-corpus` + `torah-corpus-sedarim` + `torah-corpus-traites` | Supprimé (aucun appel src/) |
| `torah-list` | `torah-corpus-traites` | Supprimé PR #137 |
| `torah-list-sections` | `torah-corpus-traites` | Obsolète |
| `torah-get-section` | `torah-get-page-translations?corpus=` | Obsolète |
| `torah-validate-text` | Filtrage côté client (SourcesRegistry) | Obsolète |
| `torah-traite-pages` | `torah-corpus-traites` (champ `pages`) | Obsolète |

**Workflows à supprimer :**
- `workflows/TORAH_-_Sources.json`
- `workflows/Torah_List.json`

---

## 4. Endpoints API supprimables

L'équipe API peut supprimer ces endpoints qui n'ont plus de webhook associé :

| Endpoint | Webhook obsolète | Raison |
|----------|------------------|--------|
| `GET /api/torah/sources` | `torah-sources` | Remplacé par corpus hierarchy |
| `GET /api/talmud/traites` | `torah-list` | Remplacé par `torah-corpus-traites` |
| `GET /api/torah/sections/{source}` | `torah-list-sections` | Remplacé par corpus hierarchy |
| `GET /api/torah/sections/{source}/{section}` | `torah-get-section` | Remplacé par segments |
| `GET /api/sefaria/texts/search` | `torah-validate-text` | Filtrage côté client |
| `POST /api/translations` | — | Remplacé par `POST /api/translations/save` |
| `GET /api/translations/{id}` | — | Non utilisé |
| `PUT /api/translations/{id}` | — | Remplacé par save avec versioning |
| `DELETE /api/translations/{id}` | — | Non utilisé |

---

## 5. Gestion des erreurs

### 5.1 ambiguous_reference (nouveau)

**Quand :** Un traité existe dans plusieurs corpus sans précision `?corpus=`

```json
HTTP 400
{
  "detail": {
    "error": "ambiguous_reference",
    "message": "Reference 'Berakhot 2a' matches multiple corpus",
    "matches": [
      {"corpus": "Bavli", "project_id": "..."},
      {"corpus": "Yerushalmi", "project_id": "..."}
    ],
    "hint": "Add ?corpus=<Bavli|Yerushalmi> to disambiguate"
  }
}
```

**Note format :**
- Wrapping `.detail` (FastAPI standard)
- Code `ambiguous_reference` (snake_case)
- Champ `matches: [{corpus, project_id}]`

**Action client :** Relancer avec `?corpus=Bavli` ou demander à l'utilisateur de choisir.

### 5.2 Erreur de sauvegarde (mode manquant)

```json
HTTP 400
{
  "detail": "Missing target. Provide exactly one of: `segment_id`, `commentary_id`, or `source_text`."
}
```

**Action :** Vérifier que le payload contient exactement UN des trois identifiants.

---

## 6. Fichiers de référence

| Document | Contenu |
|----------|---------|
| `docs/guides/TORAH_WEBHOOKS_V2.md` | Documentation complète des 10 webhooks avec payloads in/out |
| `docs/guides/n8n-torah-api-v2.md` | Contrat API complet (équipe API) |
| `docs/guides/n8n-webhooks-migration-v2.md` | Ce document (migration) |

---

## 7. Actions de migration effectuées

- [x] 11 workflows Torah modifiés pour API v2
- [x] 3 nouveaux webhooks corpus créés
- [x] Fix `source_text_id` → `segment_id` dans Torah_Router
- [x] Fix conflit webhook path `torah-translate` → `torah-translate-batch`
- [x] Torah_Error_Handler ré-importé (fix credentials)
- [x] Torah_Translate_Simple réactivé
- [x] Documentation TORAH_WEBHOOKS_V2.md créée
- [ ] **En attente :** Ré-import Torah_Router.json avec fix segment_id

---

## 8. Tests recommandés

```bash
# Smoke test des endpoints
./scripts/smoke-test-n8n-endpoints.sh

# Scénarios fonctionnels
./scripts/run-test-scenarios.sh --file scripts/test-scenarios-data.json

# Scénarios adversariaux
./scripts/run-test-scenarios.sh --file scripts/test-scenarios.stress.json
```

---

## 9. Contact

Questions : ouvrir une issue sur `fsebbah/chatbot.api` avec le tag `n8n-migration-v2`.

---

*Mise à jour le 2026-04-23 — équipe n8n / API Torah*

---

## 10. Retour équipe API — incohérences détectées (2026-04-23)

Ce document a été réécrit côté n8n. Plusieurs points **contredisent** la source officielle `docs/guides/TORAH_API_GUIDE.md` (l'inventaire des 10 webhooks actifs que l'équipe n8n avait elle-même produit et validé). Merci de clarifier avant que l'équipe API agisse sur les suppressions demandées en §4.

### 10.1 Webhooks déclarés "OBSOLÈTES" (§2.3 + §3) — contradictoire

| Webhook | Statut déclaré ici | Statut dans `TORAH_API_GUIDE.md` |
|---|---|---|
| `torah-list-sections` | obsolète | **ACTIF** |
| `torah-get-section` | obsolète | **ACTIF** |
| `torah-validate-text` | obsolète | **ACTIF** |

`TORAH_API_GUIDE.md` est votre inventaire officiel des webhooks. Ces 3 webhooks y sont listés comme consommés par plugin-torah. La déclaration d'obsolescence ici n'est pas cohérente. **Soit vous les dépréciez vraiment (et mettez à jour TORAH_API_GUIDE.md), soit on les garde actifs et on les retire de §3 ici.**

### 10.2 §4 "Endpoints API supprimables" — risque de casser vos propres webhooks

Vous nous demandez de supprimer côté API :

| Endpoint listé supprimable | Webhook qui l'utilise (TORAH_API_GUIDE.md) |
|---|---|
| `GET /api/torah/sections/{source}` | `torah-list-sections` ACTIF |
| `GET /api/torah/sections/{source}/{section}` | `torah-get-section` ACTIF |
| `GET /api/sefaria/texts/search` | `torah-validate-text` ACTIF |

**Tant que ces 3 webhooks sont actifs dans votre inventaire, l'API team ne peut pas supprimer les endpoints correspondants** — ce serait casser vos workflows. Nécessite clarification §10.1 d'abord.

Les 3 autres endpoints (`POST /api/translations`, `GET /api/translations/{id}`, `PUT/DELETE /api/translations/{id}`) : on vérifie côté code s'ils existent encore après PR #284 (cleanup). Si oui et si aucun caller n'est identifié, on peut supprimer.

### 10.3 §5.1 `AmbiguousReferenceError` — format incorrect

**Votre description :**
```json
{
  "error": "AmbiguousReferenceError",
  "message": "...",
  "corpus_options": ["Bavli", "Yerushalmi"]
}
```

**Format réel** (cf. `docs/guides/translations-v2-handoff-to-api.md` §4.3 et `api/routers/_shared/corpus_resolver.py`) :
```json
HTTP 400
{
  "detail": {
    "error": "ambiguous_reference",
    "message": "Reference 'Berakhot 2a' matches multiple corpus",
    "matches": [
      {"corpus": "Bavli",   "project_id": "..."},
      {"corpus": "Yerushalmi", "project_id": "..."}
    ],
    "hint": "Add ?corpus=<Bavli|Yerushalmi> to disambiguate"
  }
}
```

Différences :
- Wrapping `.detail` (FastAPI) manquant
- Code `ambiguous_reference` (snake_case) et pas `AmbiguousReferenceError`
- Champ `matches: [{corpus, project_id}]` et pas `corpus_options: [string]`

**Risque :** si vos workflows n8n se basent sur la description de ce document, ils ne parseront pas correctement le body 400 réel. À corriger dans votre description.

### 10.4 §2.4 — `torah-translate-page` classé "interne"

Dans `TORAH_API_GUIDE.md`, `torah-translate-page` est dans les **10 webhooks actifs exposés** aux plugins. Ici il est classé en "interne (non exposés)". Contradiction de classification.

### 10.5 §2.4 — `torah-translate-batch` (nouveau nom)

> "`torah-translate-batch` (anciennement `torah-translate` - renommé pour éviter conflit)"

Ce renommage n'est pas mentionné dans `TORAH_API_GUIDE.md`. Il serait utile de le documenter, notamment :
- Date du renommage
- Si le webhook est exposé ou interne
- Si un webhook `torah-translate` (ancien nom) existe encore pour rétro-compat

### 10.6 §7 — Action non cochée

> `[ ] **En attente :** Ré-import Torah_Router.json avec fix segment_id`

La migration côté n8n n'est pas finalisée tant que cet item n'est pas coché. Le tableau §2.2 mentionne un fix `source_text_id → segment_id` comme appliqué, mais ce tableau et la checklist §7 se contredisent.

### 10.7 À clarifier avec l'équipe API avant action

Avant que l'API team ne supprime des endpoints ou n'adapte le schema d'erreur, merci de :

1. **Réconcilier** `n8n-webhooks-migration-v2.md` avec `TORAH_API_GUIDE.md` sur la liste officielle des webhooks actifs.
2. **Corriger** la description d'`AmbiguousReferenceError` (§5.1) pour refléter le vrai contrat.
3. **Confirmer** qu'on peut supprimer les 3 endpoints `/api/translations/{id}` GET/PUT/DELETE (grep en cours côté API pour vérifier).
4. **Boucler** la checklist §7 (ré-import Torah_Router.json).

---

*Retour équipe API — 2026-04-23*

---

## 11. Réponse équipe n8n — réconciliation (2026-04-23)

Suite au retour API team et à la clarification de l'équipe plugin-torah.

### 11.1 Webhooks obsolètes — CONFIRMÉ

**Source :** équipe plugin-torah (2026-04-23)

> "Ces 3 webhooks sont OBSOLÈTES et ne doivent pas être créés"

| Webhook obsolète | Remplacé par |
|------------------|--------------|
| `torah-list-sections` | `torah-corpus-traites` |
| `torah-get-section` | `torah-get-page-translations` + param `?corpus=` |
| `torah-validate-text` | Filtrage côté client (SourcesRegistry) |

**Action effectuée :** `TORAH_API_GUIDE.md` mis à jour pour refléter ce changement.

### 11.2 Endpoints supprimables — CONFIRMÉ

Les endpoints suivants peuvent être supprimés côté API :

| Endpoint | Webhook obsolète associé |
|----------|--------------------------|
| `GET /api/torah/sections/{source}` | torah-list-sections (obsolète) |
| `GET /api/torah/sections/{source}/{section}` | torah-get-section (obsolète) |
| `GET /api/sefaria/texts/search` | torah-validate-text (obsolète) |

**Les 3 endpoints `/api/translations/{id}` :** à vérifier côté API si encore utilisés.

### 11.3 Format `ambiguous_reference` — CORRIGÉ

§5.1 corrigé avec le bon format :
- Wrapping `.detail` (FastAPI)
- Code `ambiguous_reference` (snake_case)
- Champ `matches: [{corpus, project_id}]`

### 11.4 Classification `torah-translate-page` — CORRIGÉ

`torah-translate-page` est bien un webhook **exposé** aux plugins, pas interne.
Corrigé dans §2.4.

### 11.5 Renommage `torah-translate-batch`

**Contexte :** Conflit de webhook path entre `Torah_Translate_Simple` et `Torah_Translation_Orchestrator` qui utilisaient tous deux le path `torah-translate`.

**Résolution :**
- `torah-translate` → reste sur `Torah_Translate_Simple` (worker de traduction)
- `torah-translate-batch` → nouveau path pour `Torah_Translation_Orchestrator`

**Statut :** Interne (non exposé aux plugins). Appelé uniquement par orchestration interne.

### 11.6 Torah_Router.json — EN ATTENTE

Le fix `source_text_id` → `segment_id` est appliqué dans le fichier JSON du repo.
**En attente :** ré-import dans n8n (host2.local) pour appliquer le changement.

### 11.7 Webhooks `torah-sources` et `torah-list` — RÉSOLU

**Réponse plugin-torah (2026-04-23) :**

| Webhook | Statut | Remplacé par | Note |
|---------|--------|--------------|------|
| `torah-sources` | ❌ OBSOLÈTE | `torah-corpus` + `torah-corpus-sedarim` + `torah-corpus-traites` | Aucun appel dans src/ |
| `torah-list` | ❌ OBSOLÈTE | `torah-corpus-traites` | Supprimé PR #137 |

**Webhooks actifs confirmés : 9 total**

| # | Webhook | Usage |
|---|---------|-------|
| 1 | `torah-discord-message` | Message principal |
| 2 | `torah-router` | Traduction segment |
| 3 | `torah-translate-page` | Traduction page |
| 4 | `torah-job-status` | Status jobs |
| 5 | `torah-vocalization` | Vocalisation |
| 6 | `torah-get-page-translations` | Récupérer traductions |
| 7 | `torah-corpus` | Liste des corpus (v2) |
| 8 | `torah-corpus-sedarim` | Sedarim d'un corpus (v2) |
| 9 | `torah-corpus-traites` | Traités + pages (v2) |

**Action n8n :** Supprimer les workflows obsolètes :
- `workflows/TORAH_-_Sources.json`
- `workflows/Torah_List.json`

---

*Réponse équipe n8n — 2026-04-23*

---

## 12. Breaking changes côté API — 2026-04-23 (soir)

Suite à la validation croisée API / data team dans `scripts/response-to-api-residuals.md`, deux changements breaking et un bug fix sont appliqués dans la même PR (feat/align-residuals-api-fixes).

### 12.1 Suppression du champ `text` dans `segments[].translation` et `segments[].translations[]`

**Avant :**
```json
"translation": {
  "text": "Traduction de test...",
  "translated_text": "Traduction de test..."
}
```

**Après :**
```json
"translation": {
  "translated_text": "Traduction de test..."
}
```

**Raison :** cohérence avec la colonne DB `translations_v2.translated_text`. Alias retiré (phase 3 du plan de dépréciation validé avec data team).

**Action n8n :** les templates Discord qui lisent `.translation.text` ou `.translations[].text` doivent être migrés vers `.translation.translated_text` et `.translations[].translated_text`.

**Endpoints concernés :**
- `GET /api/talmud/page/{traite}/{page}/segments` (retourne `translation` et `translations[]`)

### 12.2 Fix du décalage de commentaires (off-by-one)

**Bug :** jusqu'à cette PR, les commentaires retournés par `GET /.../segments?include_commentaries=true` étaient **décalés de -1 segment** :
- Les commentaires du segment DB 1 étaient perdus (pas retournés)
- Les commentaires du segment DB 2 étaient affichés sur le segment API `.index=1`
- etc.

**Cause :** le code Python stockait les commentaires avec un index 0-based (`seg - 1`) puis faisait la correspondance avec `segments[].index` 1-based.

**Fix :** stockage désormais en 1-based, cohérent avec `segments[].index`. Les commentaires apparaissent maintenant sur le bon segment.

**Impact n8n :** si vos workflows Discord affichaient déjà des commentaires sous les mauvais segments, cela va maintenant s'afficher correctement. Si vous aviez contourné le bug en faisant un `-1` ou `+1` côté template, ce workaround **doit être retiré**.

### 12.3 Support des références avec virgule (`Ein Yaakov, Gittin N`)

Le resolver accepte désormais automatiquement les deux formats de référence :
- Format standard : `Berakhot 2a` (traite + page séparés par espace)
- Format anthologie : `Ein Yaakov, Gittin 1` (traite + page séparés par virgule)

**Action n8n :** aucune. Les URLs existantes continuent de fonctionner.

---

*Breaking changes — 2026-04-23 — équipe API Torah*
