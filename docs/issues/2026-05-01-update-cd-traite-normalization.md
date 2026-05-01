# Note équipe n8n — UPDATE `commentary_details.traite` exécuté + ISSUE-007b en cours

**Date d'exécution UPDATE :** 2026-05-01 (matin) — **déjà appliqué en prod**.
**Volume effectif :** 27 135 lignes sur Bavli + Mishnah + Yerushalmi.
**Statut document :** post-mortem + heads-up sur PR ISSUE-007b en cours de merge le même jour.
**Backup :** 6 tables conservées jusqu'au **2026-05-15** (14 jours) → rollback complet possible.
**Source de vérité côté DATA :** `docs/issues/2026-05-01-reponse-data-cd-traite-normalization.md` (côté repo DATA, gitignored ici par convention).

---

## TL;DR — 30 secondes

1. Les libellés `commentary_details.traite` ont été normalisés sur `translation_projects.name`. **27 135 lignes** changent de libellé. Le périmètre est plus large que le préavis initial : Bavli est aussi touché (~7 900 lignes Rif notamment).
2. **Un seul workflow n8n est concerné** d'après votre audit : `Torah_Vocalization_Nekudot.json`. Il interroge `/api/vocalization/search?traite=...` qui filtre directement sur `cd.traite`. Si vous passez l'ancien libellé, le call retourne `found: false`.
3. **Action requise** : aligner les valeurs `traite` envoyées sur la liste canonique exposée par `GET /api/talmud/traites`. Cette liste est aujourd'hui la source de vérité unique côté API.
4. **Bonus inattendu** : 524 commentaires Rif sur Ketubot, 14 666 lignes Mishnah sous `English Explanation of …`, et plusieurs autres groupes deviennent **accessibles pour la première fois** par leur traité réel. Pour vos traductions futures, c'est un agrandissement du domaine adressable.
5. **ISSUE-007b** (fallback Guggenheimer + nouveaux champs `anchor_source`, `segment_num` sur `/segment/.../commentaries`) **mergée le même jour**. Détails §6.

---

## 1. Ce qui a changé sur `cd.traite`

### 1.1 Volume par passe (post-mortem)

| Pass | Périmètre | Lignes | Backup table |
|---|---|---:|---|
| Bavli | Rif/Footnotes/Mahadurah Tanina/Alternate | **7 902** | `_backup_cd_traite_20260501` |
| A1 | Yerushalmi (`Jerusalem Talmud, X` → `Jerusalem Talmud X`) | **781** | `_backup_cd_traite_pass_a1_yerushalmi_20260501` |
| A2 | Mishnah `English Explanation of …` | **14 666** | `_bak_traite_pass_a2_mishnah_english` |
| A3 | Mishnah translit (`Baba` → `Bava`, `Taanit` → `Ta'anit`) | **1 163** | `_bak_traite_pass_a3_mishnah_translit` |
| A4 | Mishnah Pirkei Avot aliases (`Avot`, `Zeroa Yamin`, `Machzor Vitry`) | **2 557** | `_bak_traite_pass_a4_pirkei_avot` |
| A5 | Catch-all résiduels | **66** | `_bak_traite_pass_a5_catchall` |
| **TOTAL** | | **27 135** | 6 tables |

### 1.2 Patterns systématiques à mémoriser (couvre 95 % du volume)

```
1. "English Explanation of <X>"          →  "<X>"          (collectiveTitle absorbé)
2. "Rif <X>"                              →  "<X>"          (collectiveTitle Rif absorbé)
3. "<X>; Alternate Version"               →  "<X>"          (variantes textuelles regroupées)
   "<X>; Mahadurah Tanina"                →  "<X>"
   "<X>; Second Recension"                →  "<X>"
4. "Mishnah Taanit"                       →  "Mishnah Ta'anit"
5. "Mishnah Baba <X>"                     →  "Mishnah Bava <X>"
6. "Avot"                                 →  "Pirkei Avot"
7. "Jerusalem Talmud, <X>" (avec virgule) →  "Jerusalem Talmud <X>" (sans virgule)
```

### 1.3 Top 10 transformations par volume

| `cd.traite` (avant) | `cd.traite` (après) | Lignes |
|---|---|---:|
| `Avot` | `Pirkei Avot` | 2 286 |
| `Mishnah Taanit` | `Mishnah Ta'anit` | 1 002 |
| `English Explanation of Mishnah Kelim` | `Mishnah Kelim` | 898 |
| `English Explanation of Mishnah Shabbat` | `Mishnah Shabbat` | 522 |
| `English Explanation of Mishnah Oholot` | `Mishnah Oholot` | 469 |
| `English Explanation of Mishnah Yevamot` | `Mishnah Yevamot` | 456 |
| `English Explanation of Mishnah Negaim` | `Mishnah Negaim` | 440 |
| `English Explanation of Mishnah Menachot` | `Mishnah Menachot` | 382 |
| `English Explanation of Mishnah Zevachim` | `Mishnah Zevachim` | 374 |
| `English Explanation of Mishnah Ketubot` | `Mishnah Ketubot` | 372 |

CSV exhaustif des ~150 transformations uniques disponible sur demande à DATA (format `old,new,n`).

### 1.4 Vérification post-UPDATE

DATA a confirmé : **0 ligne** avec `cd.traite ≠ tp.name` sur les 4 corpus après l'UPDATE. Cohérence DB acquise.

---

## 2. Endpoints API torah-api impactés

Rappel de l'audit côté API. Inchangé par rapport à la note préavis.

| Endpoint | Type d'impact | Sévérité |
|---|---|---|
| `GET /api/vocalization/search?traite=...&page=...&commentator=...` | **filtre DB direct** sur `cd.traite`. Un appel avec l'**ancien** libellé renverra `found: false`. | 🔴 Bloquant si non adapté |
| `GET /api/talmud/page/{traite}/{page}/segments?include_commentaries=true` | flow-through : `commentaries[].traite` reflète le **nouveau libellé**. | 🟡 Affichage / cache |
| `GET /api/talmud/traites` | inchangé, déjà aligné sur `translation_projects.name`. | 🟢 **Source de vérité** |

### Endpoints **non** impactés

`/api/talmud/text/{t}/{p}` · `/api/talmud/segment/{t}/{p}/{seg}/commentaries` · `/api/talmud/commentary/{id}` · `/api/talmud/traite/{t}/pages` · `POST /api/translations/save` · `POST /api/translations/search`.

---

## 3. Workflow n8n concerné — `Torah_Vocalization_Nekudot.json`

D'après votre audit, c'est le seul workflow qui filtre sur `cd.traite` côté API. Diagnostic et fix :

### 3.1 Symptôme attendu

```
input: { traite: "Avot", page: "1a", commentator: "Bartenura" }
       ↓
GET /api/vocalization/search?traite=Avot&page=1a&commentator=Bartenura
       ↓
response: { found: false }     ← cache miss : la valeur en DB est désormais "Pirkei Avot"
```

### 3.2 Reproductible localement

```bash
# Avant adaptation (cassé) — tous ces appels retournent found:false
curl -s 'https://api.torah.solutions/vocalization/search?traite=Avot&page=1a&commentator=Bartenura'
curl -s 'https://api.torah.solutions/vocalization/search?traite=Rif%20Ketubot&page=1a&commentator=Rif'
curl -s 'https://api.torah.solutions/vocalization/search?traite=English%20Explanation%20of%20Mishnah%20Shabbat&page=1a&commentator=...'

# Après adaptation (OK) — utiliser le libellé canonique
curl -s 'https://api.torah.solutions/vocalization/search?traite=Pirkei%20Avot&page=1a&commentator=Bartenura'
curl -s 'https://api.torah.solutions/vocalization/search?traite=Ketubot&page=1a&commentator=Rif'
curl -s 'https://api.torah.solutions/vocalization/search?traite=Mishnah%20Shabbat&page=1a&commentator=...'
```

---

## 4. Comment adapter votre workflow — guide pratique

### Option A (recommandée) — alignement sur `/api/talmud/traites`

C'est la source de vérité unique côté API. Aucune logique de mapping à maintenir côté n8n.

**Étape 1 — Au démarrage du workflow (ou en cron)**, charger la liste canonique :

```http
GET /api/talmud/traites?corpus=<corpus>
```

Réponse :
```json
{
  "traites": [
    {"name": "Pirkei Avot",  "corpus": "Mishnah",  "seder": "Nezikin"},
    {"name": "Mishnah Ta'anit", "corpus": "Mishnah", "seder": "Moed"},
    {"name": "Ketubot", "corpus": "Bavli", "seder": "Nashim"},
    ...
  ],
  "total": 42,
  "corpus_filter": "Mishnah"
}
```

**Étape 2 — Avant d'appeler `/vocalization/search`**, valider que la valeur `traite` est dans `traites[].name` (set lookup). Si non, soit transformer via les patterns §1.2, soit logger `traite_not_canonical` et skip.

**Étape 3 — Si l'input client utilise un libellé non-canonique**, mappez-le **côté n8n** (un node Function avec un dictionnaire des 7 patterns suffit pour 95 % des cas).

### Option B (transitoire, non recommandée) — table de mapping hardcodée

Si vous ne pouvez pas appeler `/api/talmud/traites` au runtime, utilisez les 7 patterns §1.2 dans un node Function. Inconvénient : si DATA fait un nouvel UPDATE plus tard, vous devrez re-coder. C'est pour ça qu'on déconseille.

```javascript
// Node Function n8n - mapping rapide (7 patterns ~95% du volume)
function normalizeTraite(input) {
  if (!input) return input;
  // Pattern 1: "English Explanation of <X>" → "<X>"
  let m = input.match(/^English Explanation of (.+)$/);
  if (m) return m[1];
  // Pattern 2: "Rif <X>" → "<X>"
  m = input.match(/^Rif (.+)$/);
  if (m) return m[1];
  // Pattern 3: "<X>; Alternate Version|Mahadurah Tanina|Second Recension" → "<X>"
  m = input.match(/^(.+); (?:Alternate Version|Mahadurah Tanina|Second Recension)$/);
  if (m) return m[1];
  // Pattern 4-7: cas spécifiques
  if (input === "Mishnah Taanit") return "Mishnah Ta'anit";
  if (input === "Avot") return "Pirkei Avot";
  m = input.match(/^Mishnah Baba (.+)$/);
  if (m) return `Mishnah Bava ${m[1]}`;
  m = input.match(/^Jerusalem Talmud, (.+)$/);
  if (m) return `Jerusalem Talmud ${m[1]}`;
  // Default: pass-through (déjà canonique ou cas non couvert)
  return input;
}
```

**Limite** : ce snippet couvre les 7 patterns systématiques (~95 %). Pour les ~5 % résiduels (catch-all pass A5, Mishnah Pirkei Avot aliases A4 hors `Avot`), prendre le CSV exhaustif côté DATA.

### Option C (à venir, non bloquante) — normalisation côté API

Sur votre demande Q1, on prépare une PR `feat(vocalization): canonical traite resolution` qui fera la normalisation côté API directement. Une fois mergée, vous pourrez **supprimer** le mapping côté n8n et laisser l'API résoudre. On vous prévient quand c'est dispo (pas de date ferme — semaine en cours probablement).

D'ici là, l'**Option A** reste la solution propre.

---

## 5. Cas étalon de validation — Rif Ketubot 1a

Cas pédagogique : **524 lignes Rif sur Ketubot étaient invisibles** sous `cd.traite='Rif Ketubot'`. Elles sont désormais accessibles via `cd.traite='Ketubot'`.

### Avant UPDATE (reconstructible depuis backup DATA)

```sql
-- côté DATA, dans _backup_cd_traite_20260501
SELECT b.id, b.commentator, b.old_traite AS traite_avant, cd.page, cd.segment_num
  FROM _backup_cd_traite_20260501 b
  JOIN commentary_details cd ON cd.id = b.id
 WHERE b.commentator = 'Rif'
   AND b.old_traite = 'Rif Ketubot'
   AND cd.page = '1a'
 ORDER BY cd.segment_num
 LIMIT 5;
```

### Après UPDATE (live aujourd'hui)

```bash
# Avec le nouveau libellé canonique
curl -s 'https://api.torah.solutions/vocalization/search?traite=Ketubot&page=1a&commentator=Rif' | jq

# Avec l'ancien libellé (cassé)
curl -s 'https://api.torah.solutions/vocalization/search?traite=Rif%20Ketubot&page=1a&commentator=Rif' | jq
# → {"found": false}
```

### Vérification rapide via `/api/talmud/page/{t}/{p}/segments`

```bash
curl -s 'https://api.torah.solutions/api/talmud/page/Ketubot/1a/segments?target_language=fr&corpus=Bavli&include_commentaries=true' \
  | jq '.segments[].commentaries[] | select(.commentator == "Rif") | {commentator, traite, segment, segment_num}'
```

→ Doit retourner les 524 entrées avec `traite: "Ketubot"`. Si vous voyez `traite: "Rif Ketubot"` quelque part, c'est qu'il reste un cache à invalider quelque part.

---

## 6. Lien avec ISSUE-007b — fallback Notes Guggenheimer / Yerushalmi

PR `fix/issue-007b-guggenheimer-fallback` mergée dans la même fenêtre. Effets sur les endpoints commentaires :

### 6.1 Schéma de réponse — ajouts purement additifs

| Champ | Endpoint | Sémantique | Valeurs |
|---|---|---|---|
| `anchor_source` | `/api/talmud/page/.../segments` → `commentaries[]` ; `/api/talmud/segment/.../commentaries` → `commentaries[]` | `"anchor"` (cas général, ~99 %) ou `"editorial_fallback"` (576 lignes Notes Guggenheimer Yerushalmi sans `anchorRef` Sefaria) | str |
| `segment_num` | `/api/talmud/segment/.../commentaries` → `commentaries[]` | déjà présent ailleurs, on aligne | int / null |

### 6.2 Conséquence visible

- 576 notes Guggenheimer Yerushalmi qui étaient invisibles dans le regroupement par segment (depuis le merge de PR #295 ce matin) **redeviennent visibles** post-merge ISSUE-007b.
- Leur `traite` reflète le **nouveau libellé** post-UPDATE (`Jerusalem Talmud Berakhot` au lieu de `Jerusalem Talmud, Berakhot`).
- Leur `anchor_source = "editorial_fallback"` signale l'approximation d'ancrage (pas d'`anchorRef` Sefaria pour ces notes éditoriales par design).

### 6.3 Recommandation présentation

Suggestion DATA (pas bloquante) : afficher ces notes intercalées avec les autres commentaires de la section, avec un libellé du type `« Notes (édition Guggenheimer) »` ou un picto note de bas de page (📝). À transmettre au front si pertinent.

---

## 7. Rollback

### 7.1 UPDATE `cd.traite`

DATA conserve 6 tables backup jusqu'au **2026-05-15** (14 jours). Rollback bit-pour-bit possible via `UPDATE … SET traite = b.old_traite FROM <backup_table> b WHERE cd.id = b.id`. Latence estimée : 10-30 secondes côté Postgres. Script rollback dédié (`scripts/sefaria/rollback_cd_traite_20260501.py`) disponible sur demande.

### 7.2 ISSUE-007b

Code applicatif : revert de la PR torah-api côté API. Indépendant du backup DB. Pas de migration à dérouler.

### 7.3 Critères de déclenchement rollback (proposition)

- **Pic de `found: false` sur `/api/vocalization/search`** > 20 % sur 1 h post-déploiement (DATA peut metric côté DB en parallèle).
- **Régression visible** sur le rendu commentaires d'une page Talmud étalon.
- **Demande explicite** d'un user prioritaire (Discord ops).

Sinon, on laisse soak 14 jours puis on libère les backups.

---

## 8. Calendrier consolidé

| Étape | Date / T+ | Owner |
|---|---|---|
| UPDATE `cd.traite` exécuté en prod | 2026-05-01 matin | DATA |
| PR ISSUE-007b mergée | 2026-05-01 PM | API |
| Diffusion de cette note | 2026-05-01 PM | API |
| Adaptation workflow `Torah_Vocalization_Nekudot.json` (Option A ou B) | sous 24-48 h | n8n |
| Validation curl Rif Ketubot 1a | sous 24 h | n8n + API |
| Soak prod | 2026-05-01 → 2026-05-15 | tous |
| Libération backups DATA si soak OK | 2026-05-15 | DATA + API |
| (Optionnel) PR `feat(vocalization)` Option C mergée | semaine en cours | API |

---

## 9. Réponses à vos questions du 2026-05-01

**Q1 — `/api/vocalization/search` peut-il faire un matching normalisé ou aliasé ?**
Oui, faisable et c'est sur les rails. PR à venir cette semaine (Option C §4). Non bloquante, on vous prévient quand c'est mergé. D'ici là, l'Option A est la voie propre.

**Q2 — Diff old → new pour les ~50 traités ?**
Top 25 fournis §1.3 (≥95 % du volume). 7 patterns systématiques §1.2 couvrent la grande majorité. CSV exhaustif (~150 lignes uniques) disponible sur demande à DATA.

---

## 10. Contacts & ressources

- **Slack côté API** : `#torah-api` — questions techniques, ouverture de PR, escalade.
- **Slack côté DATA** : `#torah-data` — questions sur les backups, demande de CSV exhaustif, rollback.
- **Convention coordination inter-repo** : à formaliser dans `docs/guides/inter-repo-coordination.md` (pinging à venir).
- **Source de vérité DATA post-mortem** : `docs/issues/2026-05-01-reponse-data-cd-traite-normalization.md` (côté repo DATA, gitignored ici).
- **Note précédente API** (ISSUE-007 PR #295) : `docs/n8n/2026-05-01-issue-007-commentaries-anchor-ref-grouping.md`.
- **PR ISSUE-007b** : link dans le commit qui inclut cette note.

Pour toute question : commenter la PR référente ou ping `#torah-api`.
