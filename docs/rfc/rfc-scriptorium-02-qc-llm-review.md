---
projet: Azy Scriptorium
type: Spécification — revue assistée par LLM des pages QC flaggées
statut: Draft v1
auteur: Azy Solutions
date: 2026-05-03
références:
  - docs/rfc/rfc--01-start-project.md (spec technique v2)
  - docs/rfc/rfc-01-projet-pilote.md (cahier des charges du pilote v2)
  - docs/adr/0001-stack-stockage.md
  - docs/adr/0002-configuration-en-couches.md
---

# RFC-02 — Revue assistée par LLM des pages QC flaggées

> Étend l'étape 3 (contrôle qualité image) avec une couche d'analyse
> sémantique automatique. Pour chaque page non-`accepte` (verdict
> `accepte_avec_traitement`, `a_verifier`, `rejete`), un workflow n8n
> envoie l'image de la page et le contexte du run à un LLM
> multi-modal. Le LLM rend un verdict éclairé qui peut confirmer,
> infirmer ou nuancer le verdict heuristique du QC image.

---

## 1. Motivation

### 1.1 Constat issu du premier rerun complet

Sur les 282 pages de *Childhood in Exile*, le QC image heuristique
produit un taux de flagging élevé (~40 %). L'analyse manuelle de
quelques cas montre :

- **vrais positifs** : page floue, page tronquée, doigt qui cache une
  ligne — verdict du QC justifié, action humaine nécessaire ;
- **faux positifs sophistiqués** : la heuristique gonfle la bbox texte
  à cause de bruit dans la binarisation Otsu, puis flagge un doigt
  qui en réalité est en marge (page 90 du pilote — illustration
  classique) ;
- **cas ambigus** : page de garde quasi-blanche avec un doigt sur le
  fond noir — techniquement non-accepte, mais sans enjeu OCR car la
  page n'a pas de contenu.

Demander une revue humaine sur 117 pages est :

- **trop coûteux** au-delà de quelques livres ;
- **stérile** sur la plupart des cas (faux positifs identifiables
  d'un coup d'œil) ;
- **non scalable** si on cible plusieurs livres par mois.

### 1.2 Hypothèse

Un **LLM multimodal** (Claude, GPT-4o, Gemini, ou modèle local type
LLaVA) peut, à partir de l'image de la page et du contexte du verdict
heuristique, distinguer en quelques secondes :

- les vrais problèmes qui justifient une action humaine ;
- les faux positifs qui peuvent être tolérés ;
- les cas ambigus qui nécessitent une vraie revue humaine.

Cela transforme une revue de 117 pages en revue de quelques dizaines.

### 1.3 Objectif fonctionnel

Pour chaque page flaggée par l'étape 3, produire un **verdict éclairé**
contenant :

- une décision (`confirme_qc`, `infirme_qc`, `revue_humaine`) ;
- une **justification** lisible humaine ;
- la liste des **anomalies réelles** observées par le LLM ;
- un **niveau de confiance** ;
- un **conseil d'action** (recadrer, re-scanner, accepter tel quel,
  réviser manuellement).

Cette information est persistée en BD à côté du `QCReport` et
exposée dans le `summary.json` enrichi.

---

## 2. Périmètre

### 2.1 Inclus

- déclenchement automatique de la revue LLM **uniquement** sur les
  pages non-`accepte` à la fin du run QC (verdicts
  `accepte_avec_traitement`, `a_verifier`, `rejete`) ;
- envoi de l'image source haute résolution + métadonnées de QC à un
  webhook n8n ;
- un workflow n8n configuré côté infra Azy qui appelle le LLM
  retenu et renvoie une réponse structurée ;
- persistance de la réponse en BD (table `qc_llm_reviews`) ;
- enrichissement du `summary.json` et `flagged_pages.json` produits
  par le run QC ;
- **prompt système externalisé** dans un fichier modifiable, avec
  versionnement.

### 2.2 Exclus (hors scope MVP1)

- revue LLM **systématique de toutes les pages** (coût injustifié pour
  un gain marginal sur les pages déjà `accepte`) ;
- corrections automatiques d'images (rotation, recadrage) basées sur
  la sortie LLM — c'est l'étape 4 du pipeline ;
- assistance LLM pour l'OCR lui-même (étape 7) — RFC séparée à venir ;
- modèle LLM local sur le Pi (impossible vu les ressources) — le LLM
  tourne forcément côté n8n / cloud ou VPS GCP.

### 2.3 Reste optionnel

- la revue LLM est **désactivable par configuration**. Un run
  `python -m scriptorium.qc childhood-in-exile --no-llm-review` ne
  l'invoque pas. Si la configuration n'a pas de `qc_llm_review.enabled:
  true`, elle ne tourne pas non plus. Le pipeline doit fonctionner
  parfaitement sans (cf. principe local-first de la vision produit).

---

## 3. Architecture

### 3.1 Vue d'ensemble

```
                        ┌──────────────────────────────────┐
                        │  scriptorium.qc.book_runner.run_qc │
                        │   (étape 3 du pipeline)           │
                        └──────────────┬───────────────────┘
                                       │
                                       ▼  pour chaque page flaggée
                        ┌──────────────────────────────────┐
                        │  scriptorium.qc.llm_review        │
                        │  - charge le prompt template      │
                        │  - encode l'image en base64       │
                        │  - construit le payload           │
                        │  - POST → webhook n8n             │
                        └──────────────┬───────────────────┘
                                       │ HTTP POST
                                       ▼
                        ┌──────────────────────────────────┐
                        │  Workflow n8n "qc-page-review"    │
                        │  - receveur webhook               │
                        │  - appel LLM (Claude / GPT / …)   │
                        │  - validation schéma réponse      │
                        │  - retour JSON structuré          │
                        └──────────────┬───────────────────┘
                                       │ HTTP réponse
                                       ▼
                        ┌──────────────────────────────────┐
                        │  scriptorium.qc.llm_review        │
                        │  - parse la réponse               │
                        │  - persiste en BD                 │
                        │  - enrichit summary.json          │
                        └──────────────────────────────────┘
```

### 3.2 Pourquoi n8n et pas un appel direct au SDK LLM ?

- **Cohérence avec l'écosystème Azy** (RFC §19.3 : n8n est l'outil
  d'orchestration retenu) ;
- **changement de moteur LLM sans toucher au code Python** : un admin
  reconfigure le workflow n8n ;
- **gestion des secrets côté n8n**, pas dispersés dans les configs
  Python ;
- **observabilité** native de n8n (historique d'exécutions, retries,
  logs).

Inconvénients reconnus :
- ajout d'un saut réseau supplémentaire ;
- dépendance d'un service externe pour les tests d'intégration.

Mitigation : le code Python reste **agnostique du LLM**. Si on veut
basculer plus tard vers un appel direct via SDK Anthropic / OpenAI,
on remplace l'implémentation de `llm_review.send` sans toucher au
reste.

### 3.3 Composants à créer

| Composant                                       | Type            | Rôle                                                |
| ----------------------------------------------- | --------------- | --------------------------------------------------- |
| `src/scriptorium/qc/llm_review.py`              | module Python   | client webhook, sérialisation, déserialisation      |
| `src/scriptorium/models.py` — table `QCLLMReview` | SQLModel        | persistance des réponses                            |
| `prompts/qc_page_review.md`                     | prompt template | prompt système, modifiable, versionné               |
| `prompts/qc_page_review.schema.json`            | JSON Schema     | format attendu de la réponse LLM                    |
| Workflow n8n `qc-page-review`                   | workflow n8n    | orchestré côté infra Azy                            |
| Variables d'env                                 | secrets         | URL webhook n8n + clé d'authentification            |

---

## 4. Contrat d'interface — payload entrant (Python → n8n)

### 4.1 Format

`POST <SCRIPTORIUM_N8N_WEBHOOK_URL>/qc-page-review` avec en-tête :

```http
Authorization: Bearer <SCRIPTORIUM_N8N_API_KEY>
Content-Type: application/json
```

### 4.2 Schéma du body

```json
{
  "schema_version": "1.0.0",
  "request_id": "uuid",
  "book": {
    "id": "childhood-in-exile",
    "title": "Childhood in Exile",
    "source_lang": "en",
    "target_lang": "fr"
  },
  "run": {
    "id": "2026-05-03T11-28-07Z",
    "qc_version": "0.2.0",
    "git_commit": "07c509e"
  },
  "page": {
    "page_id": 38,
    "source_filename": "image00038.jpg",
    "image_base64": "<base64 de l'image, downscaled à max 2 Mpx>",
    "image_mime": "image/jpeg"
  },
  "qc": {
    "verdict": "a_verifier",
    "indicators": {
      "score_flou": 564.5,
      "angle_skew_deg": 0.8,
      "ratio_pixels_noirs": 0.34,
      "text_bbox": {"x": 140, "y": 271, "w": 1830, "h": 2002},
      "finger_intersects_text": true,
      "is_double_page": false
    },
    "anomalies": [
      {"type": "doigt_sur_texte", "severity": "moyenne",
       "details": {"finger_intersects_text": true}}
    ],
    "thresholds_used": {
      "blur_score_min": 80.0,
      "skew_angle_max_deg": 5.0,
      "finger_component_min_pixels": 5000
    }
  },
  "prompt": {
    "template_name": "qc_page_review",
    "template_version": "1.0.0",
    "rendered_text": "<prompt complet rendu côté Python>"
  }
}
```

### 4.3 Rationale du payload

- l'**image en base64 inline** plutôt qu'un chemin partagé : le worker
  Python peut tourner sur un poste distant du Pi, n8n n'a pas
  forcément accès au filesystem local. Coût : ~quelques Mo par requête,
  acceptable pour un nombre modeste de pages flaggées ;
- l'**image downscalée à 2 Mpx max** avant envoi : économise tokens
  LLM et bande passante, sans perte significative pour le diagnostic
  (un humain juge à 1 Mpx) ;
- les **indicateurs et seuils utilisés** : permettent au LLM de
  comprendre *pourquoi* la heuristique a flaggé et donc de juger si
  c'est cohérent ;
- le **prompt rendu côté Python** (pas seulement le nom du template) :
  rend la requête traçable et reproductible. Le workflow n8n peut
  l'envoyer tel quel au LLM ; il n'a pas besoin de connaître la
  logique de templating.

---

## 5. Contrat d'interface — réponse (n8n → Python)

### 5.1 Schéma JSON exigé

Validé par `prompts/qc_page_review.schema.json` côté Python avant
persistance. Une réponse non conforme est journalisée et la review
est marquée `failed` (le run continue).

```json
{
  "schema_version": "1.0.0",
  "request_id": "uuid (echo de la requête)",
  "llm": {
    "model": "claude-opus-4-7",
    "tokens_in": 12500,
    "tokens_out": 320,
    "cost_eur": 0.018
  },
  "decision": "confirme_qc | infirme_qc | revue_humaine",
  "confidence": 0.85,
  "observed_issues": [
    {
      "type": "doigt_en_marge",
      "severity": "info | faible | moyenne | critique",
      "location": "bottom_right",
      "blocks_ocr": false,
      "evidence": "le doigt est nettement sous le bloc texte, pas dans la zone OCR"
    }
  ],
  "verdict_recommended": "accepte | accepte_avec_traitement | a_verifier | rejete",
  "actions_recommended": [
    "tolerer",
    "recadrer_zone_text",
    "rescanner_page"
  ],
  "rationale": "Texte libre — explication courte (≤ 5 phrases) lisible humain",
  "raw_response": "<réponse brute LLM, optionnelle, debug>"
}
```

### 5.2 Sémantique des décisions

| `decision`        | Signification                                          |
| ----------------- | ------------------------------------------------------ |
| `confirme_qc`     | Le LLM voit le même problème que l'heuristique. Action requise. |
| `infirme_qc`      | Faux positif manifeste. La page peut être traitée comme `accepte`. |
| `revue_humaine`   | Cas ambigu, le LLM ne tranche pas. Garder le verdict heuristique et alerter. |

### 5.3 Politique d'application du verdict LLM

**Le verdict heuristique du QC reste la source de vérité par défaut.**
Le verdict LLM est une **annotation** consultable, pas une réécriture
automatique. Pour qu'une page bascule effectivement de `a_verifier` à
`accepte`, il faut soit :

- une décision humaine explicite via interface de revue (post-MVP1) ;
- soit, en mode "auto-trust" activable par config
  (`qc_llm_review.auto_apply_verdict: true`), si :
  - `decision == "infirme_qc"`,
  - et `confidence >= 0.9`,
  - et `verdict_recommended in ["accepte", "accepte_avec_traitement"]`.

L'auto-trust est désactivé par défaut. À activer après avoir construit
de la confiance sur N runs.

---

## 6. Prompt système — externalisation et versionnement

### 6.1 Localisation

`prompts/qc_page_review.md` à la racine du projet. Versionné dans le
repo, modifiable sans toucher au code Python.

### 6.2 Versionnement

Front-matter YAML obligatoire :

```yaml
---
template_name: qc_page_review
template_version: 1.0.0
language: fr
target_models: ["claude-opus-4-7", "gpt-4o", "gemini-2.5-pro"]
last_updated: 2026-05-03
description: "Revue d'une page scannée flaggée par l'étape QC image"
---
```

`template_version` suit SemVer (cf. ADR-0003). Tout changement de
sémantique = bump majeur. Un changement de phrasing mineur = patch.

La version envoyée dans la requête (`prompt.template_version`) permet
de retracer quelle version de prompt a produit quelle réponse — utile
pour comprendre une dérive de qualité.

### 6.3 Variables interpolées

Le template Markdown contient des placeholders `{{var}}` rendus côté
Python. Variables minimales :

- `{{book_title}}`
- `{{book_source_lang}}`
- `{{qc_verdict}}`
- `{{qc_anomalies_summary}}` — liste textuelle des anomalies
- `{{qc_indicators_summary}}` — bloc lisible des scores
- `{{thresholds_summary}}` — seuils utilisés

Le moteur de rendu : Jinja2 ou simple `str.format`, à trancher en
implémentation. Pas critique.

### 6.4 Structure recommandée du prompt (v1.0.0)

Composé de 5 sections explicites, chacune éditable :

1. **Rôle** — qui le LLM est censé être (expert QC livre numérique)
2. **Contexte du livre** — métadonnées injectées
3. **Verdict heuristique observé** — anomalies détectées, scores, seuils
4. **Tâche** — instructions précises sur ce qu'il doit retourner
5. **Format de sortie** — schéma JSON strict avec exemple

Voir `prompts/qc_page_review.md` (à créer en implémentation) pour le
contenu de référence.

### 6.5 Changelog du prompt

`prompts/qc_page_review.CHANGELOG.md` à côté du prompt, format Keep a
Changelog. Tout bump de `template_version` = entrée dans ce changelog.

---

## 7. Persistance — table `QCLLMReview`

### 7.1 Schéma SQLModel

À ajouter dans `src/scriptorium/models.py` :

```python
class LLMReviewDecision(StrEnum):
    CONFIRME_QC = "confirme_qc"
    INFIRME_QC = "infirme_qc"
    REVUE_HUMAINE = "revue_humaine"


class LLMReviewStatus(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"


class QCLLMReview(SQLModel, table=True):
    __tablename__ = "qc_llm_reviews"

    id: int | None = Field(default=None, primary_key=True)
    qc_report_id: int = Field(foreign_key="qc_reports.id", index=True)
    page_id: int = Field(foreign_key="pages.id", index=True)
    run_id: str = Field(foreign_key="runs.id", index=True)

    status: LLMReviewStatus = Field(default=LLMReviewStatus.PENDING)
    template_name: str
    template_version: str
    llm_model: str | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    cost_eur: float | None = None

    decision: LLMReviewDecision | None = None
    confidence: float | None = None
    verdict_recommended: QCVerdict | None = None
    rationale: str | None = None
    observed_issues: list = Field(default_factory=list, sa_column=Column(JSON))
    actions_recommended: list = Field(default_factory=list, sa_column=Column(JSON))

    request_payload: dict | None = Field(default=None, sa_column=Column(JSON))
    response_payload: dict | None = Field(default=None, sa_column=Column(JSON))
    error_message: str | None = None

    created_at: datetime = Field(default_factory=_now_utc)
```

### 7.2 Ajout dans `summary.json` et `flagged_pages.json`

`flagged_pages.json` enrichi par page :

```json
{
  "page_id": 38,
  "source": "image00038.jpg",
  "verdict": "a_verifier",
  "anomalies": [...],
  "llm_review": {
    "status": "succeeded",
    "decision": "infirme_qc",
    "confidence": 0.92,
    "verdict_recommended": "accepte",
    "rationale": "Le doigt visible est en marge basse, hors zone texte. Pas d'occlusion réelle.",
    "actions_recommended": ["tolerer"]
  }
}
```

`summary.json` enrichi avec un bloc agrégé :

```json
"llm_review_summary": {
  "enabled": true,
  "template_version": "1.0.0",
  "model": "claude-opus-4-7",
  "succeeded": 110,
  "failed": 5,
  "skipped": 2,
  "decisions": {
    "confirme_qc": 18,
    "infirme_qc": 87,
    "revue_humaine": 5
  },
  "total_cost_eur": 1.94
}
```

---

## 8. Configuration

### 8.1 Section dédiée dans `config/default.yaml`

```yaml
qc_llm_review:
  enabled: false                       # désactivé par défaut
  template_name: "qc_page_review"
  template_version: "1.0.0"            # version cible (validée à l'envoi)
  webhook_path: "/qc-page-review"      # complète SCRIPTORIUM_N8N_WEBHOOK_URL
  timeout_seconds: 60
  max_retries: 2
  parallel_requests: 4                 # nb appels concurrents
  image_max_megapixels: 2.0            # downscale avant envoi
  image_jpeg_quality: 85
  auto_apply_verdict: false            # cf. §5.3
  auto_apply_min_confidence: 0.9
```

### 8.2 Variables d'environnement (secrets)

Existantes (cf. `.env.local.example`), à activer :

```bash
SCRIPTORIUM_N8N_WEBHOOK_URL=https://n8n.azy.internal/webhook
SCRIPTORIUM_N8N_API_KEY=<secret>
```

### 8.3 Override par livre

Dans `config/books/<id>/metadata.yaml` :

```yaml
qc_llm_review_overrides:
  qc_llm_review:
    enabled: true                       # activé pour ce livre
    auto_apply_verdict: true            # confiance accordée pour ce livre
```

Aplati à la racine par `set_book_context` (cf. ADR-0002 + fix PR #4),
donc lu via `get_config("qc_llm_review.enabled")`.

---

## 9. Schéma JSON de validation de la réponse

`prompts/qc_page_review.schema.json` : JSON Schema 2020-12 strict.
Tout champ requis manquant ou type incorrect → `status=failed`,
réponse brute persistée pour debug, run continue.

Champs **requis** :

- `schema_version`, `request_id`, `decision`, `confidence`,
  `verdict_recommended`, `rationale`, `observed_issues`,
  `actions_recommended`.

Champs **optionnels** :

- `llm.model`, `llm.tokens_in`, `llm.tokens_out`, `llm.cost_eur`,
  `raw_response`.

---

## 10. CLI

### 10.1 Activation à la commande

```bash
# par défaut : suit la config (enabled: false)
python -m scriptorium.qc childhood-in-exile

# force l'activation pour ce run
python -m scriptorium.qc childhood-in-exile --llm-review

# force la désactivation (override toute config)
python -m scriptorium.qc childhood-in-exile --no-llm-review

# n'analyse que les pages flaggées (mode reprise après calibration)
python -m scriptorium.qc childhood-in-exile --llm-review --only-flagged
```

### 10.2 Commande dédiée pour rejouer la revue LLM seule

Pour tester une nouvelle version de prompt sans rejouer le QC :

```bash
python -m scriptorium.qc.review childhood-in-exile <run_id>
```

Lit les pages flaggées du run existant en BD, relance la revue LLM,
crée un nouveau lot de `QCLLMReview` (le précédent est conservé,
distingué par son `created_at`).

---

## 11. Workflow n8n côté Azy

Spécification fonctionnelle attendue côté équipe n8n. À implémenter
sur l'instance Azy.

### 11.1 Path

`POST /webhook/qc-page-review`

### 11.2 Authentification

Bearer token `SCRIPTORIUM_N8N_API_KEY` côté Azy. Rejette toute
requête non authentifiée.

### 11.3 Étapes du workflow

1. **Réception webhook** — parse le body JSON.
2. **Validation** — vérifie `schema_version`, présence des champs
   obligatoires.
3. **Appel LLM** — prend `prompt.rendered_text` + image base64,
   appelle le modèle configuré côté n8n (Claude par défaut), reçoit
   la réponse.
4. **Parsing** — extrait le JSON de la réponse LLM (le LLM est
   instruit de répondre en JSON pur).
5. **Enrichissement** — ajoute `request_id` (echo) et métadonnées
   `llm.{model, tokens_in, tokens_out, cost_eur}`.
6. **Réponse HTTP 200** — body = JSON enrichi.

### 11.4 Comportement en cas d'échec LLM

Le workflow renvoie HTTP 502 avec un body :

```json
{
  "schema_version": "1.0.0",
  "request_id": "<echo>",
  "error": "llm_timeout | llm_invalid_response | rate_limited | other",
  "details": "..."
}
```

Côté Python : retry selon `max_retries`, puis enregistrement
`status=failed` avec `error_message`. Le run global ne s'arrête pas.

### 11.5 Coût et observabilité

Le workflow logue chaque appel dans n8n (historique 30 jours
recommandé). L'agrégation des coûts est faite par jour côté Azy pour
budgetiser.

---

## 12. Règles de coût et de budget

Pour éviter les dérapages :

- **Limite stricte par run** : `qc_llm_review.max_pages_per_run`
  (défaut 200). Au-delà, le run continue mais saute les revues
  supplémentaires (`status=skipped`, raison documentée).
- **Limite stricte par livre** :
  `qc_llm_review.max_pages_per_book` (défaut 500, sur tous runs
  cumulés).
- **Estimation préalable** : avant lancement, le runner calcule le
  nombre prévu de revues et affiche un **avertissement** si > 100.
  Confirmation interactive demandée si > 300, sauf en mode
  `--non-interactive`.
- **Coût observé loggé** dans `summary.json.llm_review_summary.total_cost_eur`,
  avec alerte si dépasse seuil config.

---

## 13. Stratégie de tests

### 13.1 Unit tests

- `tests/qc/test_llm_review_payload.py` : construction du payload
  (encodage image, troncature, rendering du prompt).
- `tests/qc/test_llm_review_response.py` : parsing et validation
  schéma de réponses bonnes / mauvaises.
- `tests/qc/test_llm_review_persistence.py` : insertion en BD,
  relations.

### 13.2 Integration tests

- `tests/qc/test_llm_review_integration.py` avec un **mock webhook
  HTTP** (lib `respx` ou `pytest-httpx`) qui simule des réponses n8n
  variées (succès, timeout, erreur de schéma).
- Vérifie que `book_runner.run_qc` appelle bien la review pour les
  pages flaggées et persiste correctement.

### 13.3 Tests de bout en bout (manuels au début)

- script `scripts/llm_review_smoke.py` qui envoie un payload minimal
  au vrai webhook n8n, valide la chaîne complète, ne touche pas la
  BD. À utiliser pour valider la mise en service.

---

## 14. Critères de succès

### 14.1 Quantitatif

| Indicateur                                        | Cible   |
| ------------------------------------------------- | ------- |
| Latence moyenne par page                          | < 15 s  |
| Taux de réponses conformes au schéma              | ≥ 95 %  |
| Coût moyen par page revue                         | < 0.05 € |
| Réduction du nb de pages à revue humaine effective | ≥ 60 %  |
| Faux positifs `infirme_qc` (pages réellement à problème acceptées) | 0       |

### 14.2 Qualitatif

- la `rationale` du LLM est lisible humain et explique vraiment ;
- les `actions_recommended` sont actionnables et non ambiguës ;
- le système est interrogeable post-mortem : pour toute décision LLM
  appliquée, on peut retrouver le payload exact, la version de
  prompt, le modèle, et la réponse brute.

---

## 15. Phasage d'implémentation

### Phase A — fondations (1 sprint)

- Créer `prompts/qc_page_review.md` v1.0.0 + schema.json.
- Créer `src/scriptorium/qc/llm_review.py` avec mode **mock** (pas
  de vrai webhook) pour tester la chaîne Python.
- Ajouter `QCLLMReview` aux modèles SQLModel + migration.
- Tests unitaires.

### Phase B — intégration n8n (1 sprint)

- Spec fonctionnelle remise à l'équipe n8n.
- Workflow `qc-page-review` configuré côté Azy.
- Tests d'intégration avec webhook réel sur un échantillon de 5-10
  pages.
- Premier run réel avec LLM réel sur 20 pages flaggées.

### Phase C — déploiement pilote (1 sprint)

- Activation `qc_llm_review.enabled: true` dans le metadata.yaml de
  *Childhood in Exile*.
- Rerun complet sur les 282 pages.
- Mesure des indicateurs de succès §14.
- Itération sur le prompt v1.0.0 → v1.1.0 selon les écarts observés.

### Phase D — durcissement (post-pilote)

- Activation auto-trust si confiance suffisante.
- Reporting de coût mensuel.
- Optimisations (downscaling intelligent, cache pHash pour éviter de
  rejouer une revue sur image identique).

---

## 16. Risques et mitigations

| Risque                                          | Mitigation                                                  |
| ----------------------------------------------- | ----------------------------------------------------------- |
| LLM hallucine et `infirme_qc` à tort une page floue | Auto-trust désactivé par défaut ; validation humaine obligatoire pour les premiers runs |
| Coûts LLM dérapent                              | Limites strictes par run, par livre, alertes config         |
| Schéma de réponse cassé par changement modèle   | Validation JSON Schema systématique, retry, status `failed` propre |
| Webhook n8n indisponible                        | Pipeline continue sans LLM (revue toutes pages restent en `a_verifier`), warning loggé |
| Image trop lourde pour le LLM                   | Downscale à 2 Mpx max ; au-delà, page sautée avec raison    |
| Latence trop élevée                             | Appels parallélisés (`parallel_requests`), barre de progression rich |
| Données livre confidentielles envoyées au cloud | Configuration permet de désactiver totalement ; pour livres sensibles, pas de revue LLM |

---

## 17. Évolutions futures

Hors scope MVP1, à anticiper architecturalement :

- **Réutilisation du même mécanisme** pour la validation post-OCR
  (étape 7) et la traduction (étape 9). Le couple
  `payload + prompt template + workflow n8n` est générique.
- **Cache par pHash** : si une page a déjà été revue par le LLM
  dans un run précédent (même pHash), réutiliser la réponse.
- **A/B testing de prompts** : envoyer 10 % des pages en parallèle à
  deux versions de prompt, comparer la qualité.
- **Modèle local** (LLaVA ou équivalent sur VPS GCP) en alternative
  pour les livres confidentiels.

---

## 18. Décisions à acter avant implémentation

1. **Modèle LLM cible** : Claude Opus 4.7 par défaut côté n8n ?
   GPT-4o ? Gemini ? Multi-modèle avec fallback ?
2. **URL et clé n8n** : à fournir par l'équipe Azy avant Phase B.
3. **Format prompt** : Markdown + Jinja2 ou autre ?
4. **Stockage des images base64 envoyées** : on persiste le payload
   complet dans `request_payload` (pratique mais lourd) ou seulement
   un hash de référence + lien fichier ?
5. **Auto-trust** : seuil de confiance et conditions exactes pour
   l'activer en post-pilote.

---

## 20. Réponse équipe n8n — 2026-05-03

> **Statut :** ✅ Accord de principe. En attente des éléments listés ci-dessous.
> **Contact :** équipe n8n via `#torah-api` ou PR sur ce repo.

### 20.1 Ce que nous proposons

L'équipe n8n s'engage à livrer :

| Livrable | Description | Délai estimé |
|----------|-------------|--------------|
| **Workflow `Scriptorium_QC_Page_Review.json`** | Workflow complet conforme à la spec §11 | 2-3 jours après réception des éléments |
| **Documentation webhook** | Endpoint, auth, exemples curl | Inclus |
| **Tests de bout en bout** | Script de validation avec payload exemple | Inclus |

### 20.2 Éléments requis côté Scriptorium

Avant de commencer l'implémentation, nous avons besoin des éléments suivants :

#### A. Décisions techniques (bloquant)

| # | Question | Options | Votre choix |
|---|----------|---------|-------------|
| A1 | **Modèle LLM cible** | `claude-sonnet-4` (recommandé, ~0.02€/page) / `claude-opus-4` (~0.08€/page) / `gpt-4o` | __________ |
| A2 | **Fallback si modèle principal échoue ?** | Oui (quel modèle ?) / Non (HTTP 502) | __________ |
| A3 | **Timeout par requête** | 30s / 60s (recommandé) / 120s | __________ |
| A4 | **Stockage payload complet en réponse ?** | `request_payload` inclut l'image base64 (debug, +2-3 Mo/page) / hash uniquement | __________ |

#### B. Artefacts à fournir (bloquant)

| # | Artefact | Format | Statut |
|---|----------|--------|--------|
| B1 | **Prompt système v1.0.0** | Fichier `prompts/qc_page_review.md` avec front-matter YAML | ⏳ À créer |
| B2 | **JSON Schema réponse** | Fichier `prompts/qc_page_review.schema.json` | ⏳ À créer |
| B3 | **Payload exemple** | JSON complet avec image base64 réelle (~2 Mpx) d'une page flaggée | ⏳ À fournir |
| B4 | **Réponse LLM attendue** | Exemple de réponse JSON conforme pour le payload ci-dessus | ⏳ À fournir |

#### C. Configuration infra (bloquant Phase B)

| # | Élément | Valeur | Statut |
|---|---------|--------|--------|
| C1 | **URL webhook n8n** | `https://n8n.azy.internal/webhook` ou autre | ⏳ À confirmer |
| C2 | **Clé API n8n** | Token Bearer pour auth | ⏳ À générer |
| C3 | **Clé API LLM** | Anthropic / OpenAI (gérée côté n8n ou fournie ?) | ⏳ À clarifier |

#### D. Informations optionnelles (non bloquant)

| # | Question | Votre réponse |
|---|----------|---------------|
| D1 | Volume estimé par mois (nb pages flaggées) | __________ |
| D2 | Budget mensuel LLM max | __________ |
| D3 | Livres confidentiels nécessitant modèle local ? | Oui / Non |

### 20.3 Architecture proposée du workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Scriptorium QC Page Review                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Webhook    │───▶│   Validate   │───▶│  Check Auth  │                  │
│  │   Trigger    │    │   Payload    │    │  Bearer Token│                  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                  │
│                                                  │                          │
│                      ┌───────────────────────────┘                          │
│                      │                                                      │
│                      ▼                                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Call LLM (Claude)                              │  │
│  │  - Image base64 from payload                                          │  │
│  │  - prompt.rendered_text as system prompt                              │  │
│  │  - Structured JSON output                                             │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
│                                     │                                       │
│              ┌──────────────────────┴──────────────────────┐               │
│              │                                              │               │
│              ▼                                              ▼               │
│  ┌──────────────────┐                          ┌──────────────────┐        │
│  │  LLM Success     │                          │  LLM Error       │        │
│  │  Parse JSON      │                          │  (timeout/rate)  │        │
│  └────────┬─────────┘                          └────────┬─────────┘        │
│           │                                             │                   │
│           ▼                                             ▼                   │
│  ┌──────────────────┐                          ┌──────────────────┐        │
│  │ Validate Schema  │                          │ Build Error Resp │        │
│  │ qc_page_review   │                          │ HTTP 502         │        │
│  └────────┬─────────┘                          └────────┬─────────┘        │
│           │                                             │                   │
│           ▼                                             │                   │
│  ┌──────────────────┐                                   │                   │
│  │ Enrich Response  │                                   │                   │
│  │ +request_id      │                                   │                   │
│  │ +llm.model       │                                   │                   │
│  │ +llm.tokens      │                                   │                   │
│  │ +llm.cost_eur    │                                   │                   │
│  └────────┬─────────┘                                   │                   │
│           │                                             │                   │
│           ▼                                             ▼                   │
│  ┌──────────────────┐                          ┌──────────────────┐        │
│  │ Respond HTTP 200 │                          │ Respond HTTP 502 │        │
│  │ JSON enrichi     │                          │ JSON error       │        │
│  └──────────────────┘                          └──────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 20.4 Estimation des coûts LLM

Basé sur le RFC §12 et les tarifs actuels :

| Modèle | Coût estimé / page | 117 pages (pilote) | 500 pages / mois |
|--------|-------------------|-------------------|------------------|
| **Claude Sonnet 4** (recommandé) | ~0.02 € | ~2.50 € | ~10 € |
| Claude Opus 4 | ~0.08 € | ~9.50 € | ~40 € |
| GPT-4o | ~0.03 € | ~3.50 € | ~15 € |

**Recommandation :** Claude Sonnet 4 pour le pilote. Suffisant pour l'analyse d'image QC, 4x moins cher qu'Opus.

### 20.5 Prochaines étapes

1. **Scriptorium** remplit les sections A, B, C ci-dessus
2. **Scriptorium** crée le prompt `prompts/qc_page_review.md` v1.0.0
3. **Scriptorium** fournit un payload exemple avec image réelle
4. **n8n** implémente le workflow (2-3 jours)
5. **Test conjoint** sur 5-10 pages
6. **Déploiement Phase B**

### 20.6 Questions ouvertes côté n8n

1. **Gestion des clés API LLM** : Scriptorium fournit sa propre clé Anthropic dans le payload (`api_key` champ additionnel) ou n8n utilise une clé mutualisée côté Azy ?
2. **Observabilité** : Faut-il un webhook de callback vers Scriptorium pour notifier la fin du traitement (mode async) ou le mode sync (attente HTTP) suffit ?
3. **Rate limiting** : Limite de requêtes concurrentes côté n8n à prévoir ? (RFC mentionne `parallel_requests: 4` côté Python)

---

## 21. Réponse Scriptorium aux questions n8n — 2026-05-03

> Cette section répond formellement aux questions du §20 et complète
> la spec sur les points laissés ouverts en §18. Elle ne remplace pas
> le §20 ; elle le complète.

### 21.1 Décisions techniques (réponse au §20.2 A)

| #  | Question                       | Choix Scriptorium                         | Justification                                                                                          |
| -- | ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A1 | Modèle LLM cible               | **Pas de modèle unique** (cf. §23)        | Décision repoussée : Scriptorium veut comparer 4 fournisseurs avant de figer un défaut.               |
| A2 | Fallback si modèle principal échoue | **Non — HTTP 502 + retry côté Python**    | Retry géré par `qc_llm_review.max_retries` (§8.1). Fallback automatique côté n8n complique la traçabilité (quel modèle a rendu quelle décision ?). |
| A3 | Timeout par requête            | **60 s**                                  | Cohérent avec `qc_llm_review.timeout_seconds: 60` du §8.1. Suffisant pour une image 2 Mpx.            |
| A4 | Stockage payload complet       | **Image en filesystem séparé, BD légère** | Voir détail ci-dessous.                                                                               |

#### Détail A4 — politique de stockage du payload

Plutôt que les deux options proposées (full base64 en BD vs hash
seul), Scriptorium retient une **option intermédiaire** :

- `request_payload` (BD) contient toutes les métadonnées du payload
  envoyé (book, run, qc indicators, prompt rendu) **sauf** le champ
  `page.image_base64`, remplacé par un champ
  `page.image_artifact_path`.
- L'image effectivement envoyée au LLM (downscalée à 2 Mpx max,
  qualité JPEG 85) est **persistée en filesystem** dans
  `data/books/<id>/01_qc/<run_id>/llm_review_images/<page_id>.jpg`.
- Cette image est versionnée par le run : si on rejoue une revue
  LLM avec un prompt différent (cf. CLI §10.2), on **réutilise le
  même fichier image**, garantissant que l'écart de réponse vient
  bien du prompt et pas d'un changement d'encodage.

Avantages :
- BD légère (~ quelques Ko par review au lieu de quelques Mo) ;
- reproductibilité totale (rejouable) ;
- inspection facile du contenu envoyé au LLM (un humain peut ouvrir
  le JPEG à la main).

Inconvénient : un dossier `llm_review_images/` à gérer dans le
cycle de vie des artefacts. Acceptable.

### 21.2 Artefacts à fournir (réponse au §20.2 B)

| #  | Artefact                | Statut                                                                              |
| -- | ----------------------- | ----------------------------------------------------------------------------------- |
| B1 | Prompt système v1.0.0   | Sera livré dans la PR `feat/llm-review-foundations` (Phase A, cf. §15).             |
| B2 | JSON Schema réponse     | Idem.                                                                               |
| B3 | Payload exemple réel    | Construit à partir du run actuel de *Childhood in Exile* (page 50 retenue : courbure et flou en haut, cas typique du jugement humain à automatiser). Versionné dans `tests/fixtures/llm_review/`. |
| B4 | Réponse LLM attendue    | Capturée manuellement en faisant tourner B3 contre chacun des 4 modèles benchés (cf. §23). Versionnée à côté.                                                              |

### 21.3 Configuration infra (réponse au §20.2 C)

| #  | Élément        | Réponse Scriptorium                                                            |
| -- | -------------- | ------------------------------------------------------------------------------ |
| C1 | URL webhook    | À fournir par Azy ; sera renseigné dans `.env.local` via `SCRIPTORIUM_N8N_WEBHOOK_URL`. |
| C2 | Clé API n8n    | À générer côté Azy ; renseigné via `SCRIPTORIUM_N8N_API_KEY`.                  |
| C3 | Clé(s) API LLM | **Mutualisée(s) côté n8n** (cf. réponse Q1 §21.5). Scriptorium n'envoie aucune clé dans le payload. |

### 21.4 Volume / budget / confidentialité (réponse au §20.2 D)

Non concerné pour le pilote. Ces dimensions seront à cadrer **lors
de l'industrialisation** (post-MVP4), au moment où plusieurs livres
seront traités en parallèle pour des clients distincts.

Pour le pilote *Childhood in Exile* :

- pages flaggées attendues par run : ~65 à 117 selon seuils ;
- nombre de runs prévus : 2-5 (calibration prompt + reruns) ;
- volume LLM total estimé : quelques centaines de pages → coût négligeable
  quel que soit le modèle retenu en §23.
- pas de livre confidentiel à ce stade (pilote en cession éditeur).

### 21.5 Réponses aux questions ouvertes n8n (§20.6)

#### Q1 — Gestion des clés API LLM

**Choix : clé(s) mutualisée(s) côté n8n / Azy.**

Justifications :

- **sécurité** : aucune clé Anthropic / OpenAI / Mistral / Google ne
  transite par le payload Scriptorium ni n'apparaît dans
  `request_payload` BD ;
- **rotation** : centralisée côté Azy ;
- **monitoring de coût** : un seul tableau de bord par fournisseur
  côté Azy ;
- **multi-tenant futur** : si un client externe utilise Scriptorium
  via l'instance Azy, il n'a pas à fournir ses propres clés.

Pour le bench multi-LLM (§23), n8n devra disposer **simultanément**
des clés des 4 fournisseurs pendant la phase de comparaison.

#### Q2 — Sync vs async

**Choix : sync HTTP pour MVP1.**

Justifications :

- volume modeste (quelques centaines de pages par livre) ;
- async ajoute la gestion d'état côté Python (file d'attente,
  correspondance request_id ↔ callback) qui ne se justifie pas ;
- réévaluation post-MVP4 si on traite des batches >1000 pages ou si
  la latence LLM dépasse 30 s structurellement.

#### Q3 — Rate limiting

**Choix : pas de limite explicite côté n8n** au démarrage.

Justifications :

- contrôle de flux côté Python via `qc_llm_review.parallel_requests:
  4` (§8.1) suffisant ;
- si un fournisseur LLM rate-limite (HTTP 429), n8n propage l'erreur,
  Python applique son `max_retries` ;
- ajout d'un throttling n8n possible plus tard si bursts observés.

---

## 22. Politique du LLM dans le workflow — Position B confirmée

> **Décision Scriptorium :** le LLM agit en **filtre sur les cas
> évidents**, pas en simple annotateur consultatif (Position A) ni
> en décideur principal (Position C).

### 22.1 Workflow cible après stabilisation

```
Étape 3 — QC heuristique
    │
    ├── ~80 % pages 'accepte'              → directement vers étape 4
    │
    └── ~20 % pages flaggées
            │
            ├── revue LLM (RFC-02 §11)
            │       │
            │       ├── infirme_qc + confidence ≥ seuil + verdict 'accepte'
            │       │      → auto-validées sans intervention humaine
            │       │
            │       ├── confirme_qc                  → revue humaine
            │       │
            │       └── revue_humaine ou
            │           confidence < seuil           → revue humaine
            │
            └── revue humaine via CLI scriptorium.review
                   sur les pages restantes seulement
```

### 22.2 Garde-fous

#### G1 — Auto-trust uniquement pour `infirme_qc → accepte`

**Asymétrie volontaire** : le LLM ne peut **JAMAIS** auto-trust un
verdict de rejet. Si le LLM dit "page rejetable" même avec haute
confiance, la décision finale reste humaine.

Raisons :

- un **faux négatif** "page acceptée à tort" est rattrapable plus
  tard : l'OCR (étape 6) verra le texte fautif et flaggera la page
  en validation post-OCR (étape 7) ;
- un **faux positif** "page rejetée à tort" fait perdre du contenu
  irrécupérable. Inacceptable sans intervention humaine.

#### G2 — Activation de l'auto-trust **après** calibration

L'auto-trust (`qc_llm_review.auto_apply_verdict: true`) est
**désactivé par défaut**, et ne s'active qu'après :

1. avoir traité au moins **100 pages flaggées** avec décision LLM +
   décision humaine côte à côte sur le même run ;
2. avoir vérifié que sur les cas où le LLM aurait auto-trust
   (`infirme_qc + confidence ≥ seuil + accepte`), l'humain aurait
   pris la **même décision** dans **≥ 95 %** des cas ;
3. avoir documenté ce taux d'accord dans une nouvelle entrée
   CHANGELOG marquée `### Calibration`.

Sans ces 3 conditions, l'auto-trust reste off.

#### G3 — Audit complet via CLI

Toute page validée en auto-trust est **rejouable** par l'humain :

```bash
python -m scriptorium.review --include-llm-decided
```

L'opérateur voit alors les pages que le LLM a tranchées en
autonomie, avec leur `rationale`, leur `confidence`, et peut
infirmer la décision LLM. Une telle infirmation crée une
`HumanReview` qui prend précédence (la review la plus récente
gagne, cf. spec table `HumanReview` du §7).

#### G4 — Transparence dans le rapport final

Le `summary.json` (§7.2) liste explicitement le nombre de pages
**auto-validées par le LLM** vs **validées humainement**. Le rapport
qualité final du livre (RFC technique §21) reprend cette
distinction. Aucune page traitée par auto-trust n'est rendue
indistinguable d'une page validée par un humain.

### 22.3 Configuration associée

```yaml
qc_llm_review:
  auto_apply_verdict: false               # OFF tant que G2 non atteint
  auto_apply_min_confidence: 0.9          # seuil indicatif, à recalibrer
  auto_apply_only_to_accepte: true        # G1 — non négociable
  audit_show_llm_decided_pages: true      # G3 — disponible
```

L'option `auto_apply_only_to_accepte` n'est **pas désactivable**
côté config : c'est un invariant produit. Si un client veut une
politique différente, il doit forker.

---

## 23. Benchmark multi-LLM — Phase A.5 (avant stabilisation)

> **Avant** de figer un modèle par défaut (et donc de répondre à la
> question A1 du §20), Scriptorium veut **comparer empiriquement
> 4 fournisseurs** sur un échantillon de pages réelles du pilote.
> Cette section définit le protocole.

### 23.1 Objectif

Choisir le modèle par défaut pour `qc_llm_review.engine` sur la base
de mesures objectives, pas d'à-priori. Mesurer en particulier :

- **qualité de jugement** : taux d'accord avec une décision humaine
  de référence ;
- **stabilité** : variance des réponses sur le même payload répété ;
- **coût réel** par page revue ;
- **latence réelle** par page ;
- **conformité** au schéma de réponse (§9).

### 23.2 Modèles benchés

Quatre fournisseurs, retenus pour leur capacité multimodale et leur
diversité d'écosystème :

| Famille    | Modèle ciblé             | Note                                                   |
| ---------- | ------------------------- | ------------------------------------------------------ |
| Anthropic  | Claude Sonnet 4.6         | Recommandé par n8n §20.4 ; bon ratio qualité/prix.     |
| OpenAI     | GPT-4o (ou successeur)    | Référence de l'écosystème, bonne qualité multimodale.  |
| Google     | Gemini 2.5 Pro            | Forte qualité images, intégration Workspace possible.  |
| Mistral    | Pixtral Large             | Européen, axe souveraineté, à évaluer sur qualité.     |

L'utilisateur final reste libre de choisir le modèle pour chaque
run (cf. §22 et la config). Le bench fixe juste **le défaut** et
documente les arbitrages.

### 23.3 Protocole

#### Échantillon

**20 pages du pilote *Childhood in Exile***, choisies pour couvrir
le spectre des cas :

- 5 pages `accepte` (référence "vrai accepte")
- 5 pages flaggées **vrais positifs** (doigt cachant vraiment du
  texte, page floue avérée — décidée par revue humaine)
- 5 pages flaggées **faux positifs heuristiques** (doigt en marge
  hors texte, papier vieilli) — y compris la page 50 du pilote
  (courbure + flou local typique)
- 5 pages **ambiguës** (texte partiellement lisible, jugement humain
  à 50/50)

Chaque page est étiquetée avec sa **décision humaine de référence**
(le **gold standard** du bench) et persistée dans
`tests/fixtures/llm_review/bench_dataset.jsonl`.

#### Exécution

Pour chaque page × chaque modèle × **3 répétitions** (= 240 appels
total) :

1. envoyer le même payload (image identique, prompt v1.0.0
   identique) ;
2. capturer la réponse complète (decision, confidence, rationale,
   tokens, coût, latence) ;
3. valider contre le JSON Schema §9.

Stockage : `tests/fixtures/llm_review/bench_results.jsonl`.

#### Métriques calculées par modèle

| Métrique                       | Définition                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `accuracy_overall`             | % pages où décision LLM == décision humaine de référence                         |
| `accuracy_high_confidence`     | accuracy filtrée sur `confidence ≥ 0.9` (pour évaluer l'auto-trust)              |
| `false_positive_rejection_rate`| % pages où LLM dit "rejete" alors que humain a dit "accepte" (cas le plus grave) |
| `false_negative_rate`          | % pages où LLM dit "accepte" alors que humain a dit "rejete" / "a_verifier"      |
| `consistency_kappa`            | Cohen's kappa sur les 3 répétitions de la même page : mesure la stabilité        |
| `mean_cost_eur`                | coût moyen par page                                                              |
| `mean_latency_seconds`         | latence moyenne par page                                                         |
| `schema_conformity_rate`       | % réponses conformes au JSON Schema §9 (échec parse → 0)                         |

#### Critères de sélection du défaut

Par ordre de priorité :

1. `false_positive_rejection_rate < 2%` (G1 garde-fou : ne pas perdre de contenu) ;
2. `accuracy_high_confidence ≥ 90%` (justifie l'auto-trust à terme) ;
3. `consistency_kappa ≥ 0.8` (le modèle est stable) ;
4. `schema_conformity_rate ≥ 95%` ;
5. à qualité comparable, le **moins cher** l'emporte ;
6. à coût comparable, le **plus rapide** l'emporte.

### 23.4 Architecture d'exécution du bench

#### Côté Python — `scripts/bench_llm_review.py`

Script CLI dédié, lancé hors du pipeline normal :

```bash
python scripts/bench_llm_review.py \
    --models anthropic,openai,google,mistral \
    --repeats 3 \
    --output tests/fixtures/llm_review/bench_results.jsonl
```

Lit le `bench_dataset.jsonl`, construit les payloads, envoie au
webhook n8n avec un nouveau **paramètre `model_override`** que le
workflow accepte uniquement en mode bench (cf. §23.5).

#### Côté n8n — extension du workflow

Ajout d'un input `model` au workflow `Scriptorium_QC_Page_Review` :

- **mode normal** : `model` absent ou `"default"` → utilise la valeur
  configurée côté n8n (le défaut Azy).
- **mode bench** : `model in {"anthropic", "openai", "google",
  "mistral"}` → route vers le fournisseur explicite. Permet à
  Scriptorium de bencher sans toucher la config par défaut.

Sécurité : ce mode bench ne doit être accessible qu'avec une **clé
API n8n dédiée bench** (`SCRIPTORIUM_N8N_API_KEY_BENCH`), distincte
de la clé production. Évite qu'un appel accidentel en prod parte sur
un autre fournisseur.

### 23.5 Livrables du bench

À versionner dans `docs/benchmarks/` :

- `bench_dataset.md` — description des 20 pages, leur décision
  humaine de référence, justification du choix de chaque page ;
- `bench_results_2026-MM-DD.md` — rapport complet du run avec
  tableaux comparatifs des 8 métriques pour chaque modèle ;
- `bench_decision.md` — décision motivée du modèle retenu par
  défaut, avec date.

Mis à jour à chaque rerun du bench (par exemple si un nouveau modèle
sort, ou si on observe une dérive de qualité).

### 23.6 Phasage révisé

Le bench s'insère **entre la Phase A et la Phase B** initiales :

| Phase   | Périmètre                                                                  |
| ------- | -------------------------------------------------------------------------- |
| A       | Fondations Python : modèle BD, prompt v1.0.0, schema, mock webhook, tests. |
| **A.5** | **Bench multi-LLM** sur les 20 pages d'échantillon (cf. ce §23).           |
| B       | Workflow n8n production avec modèle retenu en A.5.                         |
| C       | Pilote complet sur Childhood in Exile.                                     |
| D       | Durcissement, auto-trust selon G2.                                         |

### 23.7 Configuration

```yaml
qc_llm_review:
  # Le défaut sera renseigné après le bench A.5.
  engine: null                            # null = utilise le défaut côté n8n
  bench:
    enabled: false                        # activé seulement par le script bench
    repeats: 3
```

---

## 25. Option hybride QC + OCR — Proposition n8n

> **Date :** 2026-05-03
> **Auteur :** équipe n8n
> **Statut :** Proposition à valider par Scriptorium

### 25.1 Constat

Lors de la revue LLM d'une page flaggée, le modèle multimodal **voit
déjà** le texte de la page. Si le QC est validé (`infirme_qc` ou
`confirme_qc` avec verdict `accepte`), la page ira ensuite vers l'étape
6 (OCR) qui enverra **la même image** à un autre LLM (ou au même) pour
extraire le texte.

Cela représente potentiellement :
- **double coût** tokens d'image (~85% des tokens d'une requête vision) ;
- **double latence** (deux appels réseau séquentiels) ;
- **redondance** fonctionnelle.

### 25.2 Proposition : mode hybride QC+OCR

Ajouter un paramètre optionnel dans le payload :

```json
{
  "options": {
    "include_ocr": true,
    "ocr_fallback_only": false
  }
}
```

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `include_ocr` | `false` | Si `true`, le LLM extrait aussi le texte en plus du verdict QC |
| `ocr_fallback_only` | `true` | Si `true`, l'OCR n'est faite que si verdict `accepte` (inutile d'OCR une page rejetée) |

### 25.3 Schéma de réponse étendu

En mode hybride, la réponse JSON inclut un bloc `ocr` additionnel :

```json
{
  "schema_version": "1.0.0",
  "request_id": "uuid",

  // --- Bloc QC standard (§5) ---
  "decision": "infirme_qc",
  "confidence": 0.92,
  "observed_issues": [],
  "verdict_recommended": "accepte",
  "actions_recommended": [],
  "rationale": "...",

  // --- Bloc OCR additionnel (nouveau) ---
  "ocr": {
    "extracted": true,
    "text": "Texte complet de la page...",
    "language_detected": "en",
    "confidence": 0.95,
    "word_count": 342,
    "issues": [
      {"type": "unclear_word", "position": "ligne 12", "context": "..."}
    ]
  }
}
```

Si `include_ocr: false` ou si la page est rejetée avec `ocr_fallback_only: true`,
le bloc `ocr` est absent ou vaut `{"extracted": false, "reason": "page_rejected"}`.

### 25.4 Économies estimées

| Scénario | Appels LLM | Tokens image | Coût estimé |
|----------|------------|--------------|-------------|
| **Séparé** : QC puis OCR | 2 | ~1700 × 2 | ~0.04 €/page |
| **Hybride** : QC+OCR en 1 appel | 1 | ~1700 × 1 | ~0.025 €/page |
| **Économie** | -50% appels | -50% tokens image | **~35-40%** |

Note : l'output tokens augmente (~300 mots supplémentaires pour l'OCR),
mais les tokens d'entrée (image) dominent le coût.

### 25.5 Cas d'usage recommandé

| Situation | Recommandation |
|-----------|----------------|
| **Pilote / benchmark** | `include_ocr: false` — isoler les métriques QC |
| **Production stabilisée** | `include_ocr: true, ocr_fallback_only: true` — économie maximale |
| **Débogage OCR** | `include_ocr: true, ocr_fallback_only: false` — voir l'OCR même sur pages rejetées |

### 25.6 Prompt système adapté

Le prompt doit inclure une section OCR conditionnelle :

```markdown
{% if include_ocr %}
## Extraction du texte (OCR)

En plus de l'analyse QC, extrais le texte complet de la page.
- Préserve la structure paragraphes/lignes.
- Signale les mots illisibles avec [?].
- Indique la langue détectée.

Le champ `ocr` de ta réponse JSON doit inclure :
- `extracted`: true
- `text`: le texte complet
- `language_detected`: code ISO 639-1
- `confidence`: 0.0-1.0
- `word_count`: nombre de mots
- `issues`: array de problèmes détectés
{% endif %}
```

### 25.7 Impact workflow n8n

Modifications requises côté `Scriptorium_QC_Page_Review.json` :

1. **Validation payload** : accepter `options.include_ocr` et
   `options.ocr_fallback_only`
2. **Construction prompt** : injecter la section OCR si `include_ocr: true`
3. **Parsing réponse** : extraire et valider le bloc `ocr` si présent
4. **Réponse enrichie** : inclure `ocr.*` dans la réponse HTTP

**Estimation effort n8n** : ~4h de modification + tests.

### 25.8 Questions à Scriptorium

| # | Question | Options |
|---|----------|---------|
| O1 | Cette option hybride vous intéresse-t-elle pour la production ? | Oui / Non / À évaluer après pilote |
| O2 | Si oui, voulez-vous l'inclure dans le benchmark multi-LLM (§23) ? | Oui (augmente de 50% les appels) / Non |
| O3 | L'OCR LLM remplacerait-elle l'OCR Tesseract existante ou serait-ce un fallback ? | Remplacement / Fallback / Comparaison |
| O4 | Format texte souhaité : plain text, Markdown, ou hOCR ? | __________ |

### 25.9 Recommandation n8n

**Phase pilote** : garder `include_ocr: false` pour isoler les
métriques QC.

**Post-calibration** : activer `include_ocr: true` une fois le modèle
par défaut stabilisé, pour bénéficier des économies. Comparer la qualité
OCR LLM vs Tesseract sur un échantillon de 50 pages avant de basculer
en production.

---

## 24. Références

- RFC technique §11 (validation post-OCR — pattern similaire à
  généraliser).
- RFC technique §15.6 (génération alt text par VLM — autre cas
  d'usage LLM multimodal).
- RFC pilote §11.4 (effet tunnel solo — la revue LLM compense
  partiellement).
- ADR-0001 — Stack de stockage (Qdrant non concerné ici, persistance
  SQLite).
- ADR-0002 — Configuration en couches (override par livre).
- ADR-0003 — Versionnement du package et changelog (s'applique au
  prompt template).

---

*Fin du document — dernière mise à jour section 25 (OCR hybride) par n8n le 2026-05-03.*
