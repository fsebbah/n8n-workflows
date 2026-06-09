# Consommation de `routing.json` — équipes MCP & n8n

> **Date** : 2026-06-08
> **Émetteur** : Équipe Frontend 2
> **Destinataires** : équipe **azy.mcp** + équipe **n8n**
> **Objet** : contrat de sortie du skill `classify-submission-complexity` et règles
> de consommation côté orchestration (MCP + n8n). Décision arrêtée :
> **interprétation 100 % script, pas de LLM** pour aiguiller la passe OCR.

---

## 1. Rappel — d'où vient `routing.json`

Le skill `classify-submission-complexity` (livré par l'équipe Skills) effectue un
**pré-tri purement algorithmique** des copies scannées : il calcule des métriques
d'image (OpenCV + Pillow + NumPy) et écrit un `routing.json` déterministe qui
indique **quel(s) LLM(s) vision** doit traiter la copie.

- **Aucun appel LLM** dans le skill lui-même (Pi 4 8 Go suffit, < 1 s pour 5
  pages multi-thread).
- **Sortie unique** : un fichier `routing.json` consommable par un orchestrateur.
- **Voir** : `skills/classify-submission-complexity/SKILL.md` (chez l'équipe Skills,
  hors repo front).

Ce document décrit **uniquement** ce qu'il faut faire de `routing.json`.

---

## 2. Contrat de sortie — `routing.json`

```json
{
  "route": "single_pass_gemini | single_pass_claude | double_pass_gemini_claude",
  "confidence": 0.95,
  "reasons": [
    "page 5 : ratures détectées (48 zone(s))",
    "page 5 : hauteurs de lignes très hétérogènes (line_height_cv=5.394)"
  ],
  "rescan_recommended": true,
  "page_assessments": [
    {
      "page_no": 1,
      "label": "printed_clear | handwriting_clear | handwriting_hard | degraded",
      "metrics": { "...": 0 },
      "factors": ["clear_handwriting"]
    }
  ]
}
```

### Sémantique des champs

| Champ | Type | Sémantique pour l'orchestrateur |
|---|---|---|
| `route` | enum fermée (3) | **CLÉ DE ROUTAGE PRINCIPALE.** À switcher. |
| `confidence` | `[0, 1]` | Indicateur. Garde-fou < 0.6 **déjà appliqué** côté skill (force `double_pass`). |
| `reasons` | `string[]` FR | Texte prêt à afficher au prof. Ne pas reformuler par LLM. |
| `rescan_recommended` | bool (optionnel) | Si `true` → **notifier le prof** (scan dégradé : flou extrême, page noire/blanche, doigt sur l'objectif). OCR optionnel mais qualité dégradée. |
| `page_assessments` | array | Détail par page, utile pour l'audit / le debug, pas pour le routage. |

### Valeurs possibles de `route`

| Route | Action orchestrateur | Raison |
|---|---|---|
| `single_pass_gemini` | 1 appel **Gemini Pro Vision** | imprimé clair, passe la moins chère |
| `single_pass_claude` | 1 appel **Claude Vision** | manuscrit clair, meilleur rendu |
| `double_pass_gemini_claude` | **Gemini + Claude en parallèle**, puis reconcile | manuscrit difficile, ratures, scan dégradé |

---

## 3. Décision arrêtée — pas de LLM pour interpréter `routing.json`

Le routage est consommé par **un switch déterministe** (script orchestrateur ou
nœud Switch n8n), **jamais** par un LLM qui prendrait `routing.json` en entrée.

### Justification

| Critère | Switch script | LLM |
|---|---|---|
| Latence | < 1 ms | 1-3 s |
| Coût | 0 | $$ par copie |
| Déterminisme | total | non (deux runs → routes différentes possibles) |
| Traçabilité | switch lisible en revue | prompt + sortie à auditer |
| Valeur ajoutée | aiguillage mécanique sur enum 3 valeurs | nulle (garde-fou confiance déjà appliqué côté skill) |

Le LLM intervient **après** le routage, dans la passe OCR choisie — pas pour
décider de la passe.

---

## 4. Côté équipe **azy.mcp**

### 4.1. Enregistrer le skill au catalogue

- Déposer le **dossier complet** `classify-submission-complexity/` dans
  `/storage6/pi6/azy.mcp/skills/` (voir layout §4.2).
- Enregistrer côté chat.api : `POST /api/admin/skills` avec
  `slug = classify-submission-complexity`, `mcp_path = ...`
- Nature : **`public.skills`** (skill cloud azy.mcp, pas user_skills ni
  anthropic_skills). Cf. `skills-architecture-overview.md` §3.

### 4.2. Layout sur l'host MCP — venv embarqué

Le skill embarque **son propre venv dédié** pour isoler ses dépendances
(OpenCV, NumPy, PyMuPDF, Pillow — combinaisons sensibles aux versions
système). À déposer côté MCP :

```
/storage6/pi6/azy.mcp/skills/classify-submission-complexity/
├── SKILL.md
├── requirements.txt
├── scripts/
│   ├── to_images.py
│   ├── compute_metrics.py
│   ├── classify_and_route.py
│   └── notify_n8n.py        ← ajout §4.4, wrapper PUSH webhook
├── tests/
│   └── test_classify.py
└── .venv/                    ← venv local au skill
    ├── bin/python
    └── lib/python3.x/site-packages/...
```

**Création du venv** (une fois, à l'installation du skill côté MCP) :

```bash
cd /storage6/pi6/azy.mcp/skills/classify-submission-complexity
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

L'exécuteur MCP **doit invoquer `.venv/bin/python`** (chemin absolu), pas le
`python` système, pour garantir la reproductibilité et éviter les collisions
de versions avec d'autres skills cohabitant sur l'host.

### 4.3. Contrat d'exécution attendu (appel synchrone par chat.api / front)

```http
POST /api/skills/classify-submission-complexity/runs
{
  "input_files": [
    { "file_id": "fid_xxx_page1.jpg" },
    { "file_id": "fid_xxx_page2.jpg" }
  ],
  "params": {
    "n8n_webhook_url": "https://n8n.azy.../webhook/correction-copies-routing",
    "copie_id": "cpy_zzz"
  }
}
```

Réponse (via `SkillExecutor` cloud) :

```json
{
  "run_id": "run_yyy",
  "status": "succeeded",
  "output_files": [
    { "file_id": "fid_zzz_routing.json", "name": "routing.json" }
  ],
  "output": { "...routing.json inline si <4KB..." },
  "n8n_notified": true
}
```

**Important** : `routing.json` doit être retournable **inline** (< 4 KB
typiquement) **OU** par `file_id`. Le notifieur §4.4 envoie le contenu inline
à n8n, donc le caller (front / chat.api) peut juste regarder `n8n_notified`
pour confirmer que la suite est lancée.

### 4.4. Chaîne d'exécution complète côté MCP

À chaque run, l'exécuteur MCP enchaîne 4 scripts dans le venv du skill :

```bash
VENV=/storage6/pi6/azy.mcp/skills/classify-submission-complexity/.venv
SKILL=/storage6/pi6/azy.mcp/skills/classify-submission-complexity

# 1) rastérise PDF / copie images dans le sandbox du run
$VENV/bin/python $SKILL/scripts/to_images.py \
  --inputs $RUN_INPUTS_DIR/*.{jpg,png,pdf} \
  --out-dir $RUN_SANDBOX/pages

# 2) calcule métriques (multi-thread auto sur os.cpu_count())
$VENV/bin/python $SKILL/scripts/compute_metrics.py \
  --images $RUN_SANDBOX/pages/*.png \
  --out $RUN_SANDBOX/metrics.json

# 3) classifie + écrit routing.json (déterministe, validé)
$VENV/bin/python $SKILL/scripts/classify_and_route.py \
  --metrics $RUN_SANDBOX/metrics.json \
  --write $RUN_SANDBOX/routing.json

# 4) PUSH webhook n8n (signal de fin + payload routing.json)
$VENV/bin/python $SKILL/scripts/notify_n8n.py \
  --routing $RUN_SANDBOX/routing.json \
  --webhook-url "$N8N_WEBHOOK_URL" \
  --copie-id "$COPIE_ID" \
  --run-id "$RUN_ID"
```

L'étape **4** est ce qui « signale » à n8n que la copie est classifiée et
qu'il faut enchaîner sur l'OCR. n8n est un **récepteur webhook**, pas un
appelant — il ne poll pas MCP, il reçoit la notification PUSH.

### 4.5. Multi-thread déjà géré côté skill

Le skill utilise `multiprocessing.Pool(processes=os.cpu_count())` (déjà livré).
L'exécuteur MCP **n'a pas à paralléliser lui-même** ; un seul run = une copie =
N pages traitées en parallèle en interne. Sur un Pi 4 (4 cœurs), ~5 pages
JPEG ≈ < 1 s.

### 4.6. Dépendances Python à installer dans `.venv`

```
Pillow>=10.0,<12.0
PyMuPDF>=1.23,<2.0          # si on accepte des PDF en entrée
opencv-python-headless>=4.10,<5.0
numpy>=1.24,<3.0
requests>=2.31              # pour notify_n8n.py (PUSH webhook)
```

Cf. `skills/classify-submission-complexity/requirements.txt` (à compléter
avec `requests` si pas déjà présent).

### 4.7. `notify_n8n.py` — script PUSH webhook (~30 lignes)

À déposer dans `scripts/notify_n8n.py` du skill :

```python
#!/usr/bin/env python3
"""Pousse routing.json vers le webhook n8n. Étape 4 de la chaîne MCP.

Le skill reste pur (déterministe, sans I/O réseau) ; ce wrapper est la seule
brique avec un effet de bord externe (POST HTTP). Exit code != 0 si n8n
répond en erreur, pour que l'exécuteur MCP puisse retry / alerter.
"""
import argparse
import json
import sys
import requests


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--routing", required=True, help="chemin routing.json")
    ap.add_argument("--webhook-url", required=True, help="URL webhook n8n")
    ap.add_argument("--copie-id", required=True)
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--timeout", type=float, default=10.0)
    args = ap.parse_args()

    with open(args.routing, encoding="utf-8") as f:
        routing = json.load(f)

    payload = {
        "copie_id": args.copie_id,
        "run_id": args.run_id,
        "source": "classify-submission-complexity",
        "routing": routing,            # contenu complet de routing.json
    }
    r = requests.post(args.webhook_url, json=payload, timeout=args.timeout)
    if not r.ok:
        print(f"ERREUR n8n {r.status_code}: {r.text[:200]}", file=sys.stderr)
        sys.exit(1)
    print(f"OK n8n notifié (HTTP {r.status_code}) route={routing['route']} "
          f"copie={args.copie_id}")


if __name__ == "__main__":
    main()
```

**À noter** : le payload encapsule `routing.json` sous la clé `routing` et
ajoute `copie_id` + `run_id` pour permettre à n8n de retrouver la copie dans
sa base. n8n lira `$json.routing.route`, `$json.routing.rescan_recommended`,
etc.

---

## 5. Côté équipe **n8n**

### 5.1. Workflow attendu — `correction-copies-routing` (récepteur webhook)

n8n n'appelle pas MCP : **c'est MCP qui pousse** vers ce webhook après avoir
produit `routing.json` (cf. §4.4–4.7).

```
[1] Webhook IN     POST /webhook/correction-copies-routing
                   Body envoyé par notify_n8n.py :
                   { copie_id, run_id, source, routing: {...routing.json...} }
        ↓
[2] IF             {{ $json.routing.rescan_recommended === true }}
        ├── true  → [3a] Discord/Webhook notif prof + STOP (skip OCR)
        └── false → [3b] Switch sur {{ $json.routing.route }}
                              ├── single_pass_gemini         → [4a] Workflow OCR Gemini
                              ├── single_pass_claude         → [4b] Workflow OCR Claude
                              └── double_pass_gemini_claude  → [4c] Parallèle Gemini+Claude + reconcile
                                                                          ↓
                                                                  [5] Sortie : transcription + reasons
```

Le payload reçu par le Webhook IN ressemble à :

```json
{
  "copie_id": "cpy_zzz",
  "run_id": "run_yyy",
  "source": "classify-submission-complexity",
  "routing": {
    "route": "double_pass_gemini_claude",
    "confidence": 0.95,
    "reasons": ["page 5 : ratures détectées (48 zone(s))", "..."],
    "rescan_recommended": false,
    "page_assessments": [ ... ]
  }
}
```

Tous les nœuds en aval accèdent au routage via `{{ $json.routing.* }}`.

### 5.2. Nœud Switch n8n

Mode : **Expression**, sur `{{ $json.routing.route }}` :

| Branche | Valeur attendue | Workflow appelé |
|---|---|---|
| 0 | `single_pass_gemini` | `correction-copies-ocr-gemini` |
| 1 | `single_pass_claude` | `correction-copies-ocr-claude` |
| 2 | `double_pass_gemini_claude` | `correction-copies-ocr-double` |
| _Fallback_ | (n'importe quoi d'autre) | **Erreur** : route invalide, log + alerte |

Le validateur côté skill (`normalize_and_validate`) garantit déjà que `route`
appartient à l'énumération — le fallback est une **ceinture de sécurité**, pas
un comportement attendu.

### 5.3. Gestion de `rescan_recommended`

Si `true`, **arrêter l'OCR** et notifier le prof avec **les `reasons`
telles quelles** (déjà rédigées en français correct, traçables) :

> Exemple : « page 5 : flou extrême, scan quasi illisible (laplacian_variance=28.0) »

Pas besoin de LLM pour reformuler.

### 5.4. URL du webhook à fournir à MCP

n8n doit publier l'URL stable du webhook (prod + staging) et la
communiquer à l'équipe MCP qui la passera en paramètre `n8n_webhook_url`
au run du skill. Format attendu :

```
https://n8n.azy.../webhook/correction-copies-routing       # prod
https://n8n.azy.../webhook-test/correction-copies-routing  # staging / dev
```

**Sécurité** : protéger le webhook par un header `Authorization: Bearer
<secret>` partagé avec MCP (à ajouter dans `notify_n8n.py` quand on aura le
secret). Voir §6.4.

### 5.5. Pas d'appel LLM pour interpréter `routing.json`

À **interdire explicitement** dans le workflow :

- ❌ pas de nœud « Anthropic » / « OpenAI » qui prend routing.json en entrée
- ❌ pas de prompt « décide quelle passe OCR utiliser »
- ✅ uniquement des nœuds Switch / IF / HTTP Request

C'est la condition pour que le pré-tri reste à coût zéro.

### 5.6. Reconcile pour `double_pass_gemini_claude`

Hors scope de ce document — c'est le workflow OCR double qui gère la
réconciliation Gemini ⇔ Claude. Le workflow `correction-copies-routing` se
contente de l'invoquer et passer la main.

---

## 6. Points de vigilance

### 6.1. Seuils `[PROVISOIRE]` non calibrés

Le skill V1 marque explicitement comme **[PROVISOIRE]** les seuils suivants
(cf. `SKILL.md` § Calibration) :

- `align_printed`, `contrast_printed` → distinction imprimé vs manuscrit
- `strike_hard` → détection de ratures (sensible aux carreaux du papier réglé)
- `density_hard`, `linehcv_multi` → manuscrit dense vs multi-styles

**Impact orchestration** : tant que la calibration V1.1 n'est pas faite
(protocole : 20-30 copies réelles annotées — cf.
[NOTE-INTENTION-CLASSIFY-SUBMISSION-CALIBRATION.md](./NOTE-INTENTION-CLASSIFY-SUBMISSION-CALIBRATION.md)),
la frontière `single_pass_gemini` (imprimé) vs `single_pass_claude` (manuscrit)
peut basculer du « mauvais » côté. Les routes `double_pass` restent **fiables**.

**Conséquence pratique** : un workflow qui a tendance à voir trop de
`double_pass_gemini_claude` consomme plus de tokens que prévu. À monitorer pour
guider la calibration.

### 6.2. Garde-fou de confiance déjà appliqué

`confidence < 0.6` → le skill force lui-même `double_pass_gemini_claude`.
**n8n ne doit pas dupliquer ce garde-fou** ni ajouter de seuil de confiance
supplémentaire. Faire confiance à la valeur de `route`.

### 6.3. Validation à l'arrivée

Le skill valide déjà `routing.json` avant de l'écrire
(`normalize_and_validate`). Côté n8n, **un seul check défensif suffit** :

```js
if (!["single_pass_gemini","single_pass_claude","double_pass_gemini_claude"]
      .includes($json.routing.route)) {
  throw new Error(`route invalide: ${$json.routing.route}`);
}
```

Pas de re-validation des `page_assessments`, des métriques, etc.

### 6.4. Sécurité du webhook MCP → n8n

Le webhook `correction-copies-routing` accepte des données déclenchant des
appels OCR payants. **Il doit être authentifié.** Conventions :

- Secret partagé : `N8N_INGEST_TOKEN` (env côté MCP, header
  `Authorization: Bearer <token>` ajouté par `notify_n8n.py`).
- Côté n8n : nœud « Set » + IF en tête de workflow qui rejette toute requête
  sans le bon header (HTTP 401).
- Rotation du secret : possible sans redéploiement du skill puisque le token
  est passé en param de run, pas en dur dans le code.

### 6.5. Idempotence du webhook

`notify_n8n.py` peut être re-exécuté (retry MCP) sur le même
`(copie_id, run_id)`. n8n doit **dédupliquer** sur `(copie_id, run_id)` pour
ne pas déclencher l'OCR deux fois. Implémentation : table d'idempotence simple
(KV) ou nœud « De-duplicate » avec clé `{{ $json.copie_id + ':' + $json.run_id }}`.

---

## 7. Demandes par équipe — récap

### Équipe MCP

1. **Déposer le skill** dans `/storage6/pi6/azy.mcp/skills/classify-submission-complexity/`
   (layout §4.2).
2. **Créer le `.venv`** local au skill avec
   `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.
3. **Ajouter `notify_n8n.py`** dans `scripts/` (code §4.7) — le seul script
   du skill qui fait un appel réseau (PUSH webhook n8n).
4. **Enchaîner les 4 étapes** côté exécuteur de run (§4.4), toutes via
   `.venv/bin/python` (pas le `python` système).
5. **Enregistrer le skill** au catalogue chat.api (`public.skills`).
6. **Garantir le retour** de `routing.json` inline ou via `file_id` + flag
   `n8n_notified: true` dans la réponse de run.
7. **Lire** `N8N_INGEST_TOKEN` depuis l'env, le passer à `notify_n8n.py` en
   header `Authorization: Bearer ...`.

### Équipe n8n

1. **Publier l'URL** du webhook prod + staging et la communiquer à MCP
   (§5.4).
2. **Créer le workflow** `correction-copies-routing` (squelette §5.1) —
   trigger **Webhook IN**, pas HTTP Request sortant.
3. Nœud **Switch sur `{{ $json.routing.route }}`** avec 3 branches +
   fallback erreur.
4. Nœud **IF `$json.routing.rescan_recommended`** en amont du Switch →
   notif prof + STOP.
5. **Authentifier** le webhook avec `N8N_INGEST_TOKEN` partagé MCP/n8n,
   rejeter 401 si absent.
6. **Dédupliquer** sur `(copie_id, run_id)` pour absorber les retry MCP.
7. **Interdire** tout nœud LLM qui consommerait `routing.json` en entrée.
8. **Logger** `routing.route` + `routing.confidence` pour piloter la
   calibration V1.1.

---

## Références

- `skills/classify-submission-complexity/SKILL.md` — spec du skill (chez équipe Skills).
- [NOTE-INTENTION-CLASSIFY-SUBMISSION-CALIBRATION.md](./NOTE-INTENTION-CLASSIFY-SUBMISSION-CALIBRATION.md) — protocole calibration V1.1.
- [skills-architecture-overview.md](./skills-architecture-overview.md) — 3 natures × 2 lieux d'exécution.
- [LIEN-API-MCP-SKILLS.md](./LIEN-API-MCP-SKILLS.md) — enregistrement skill côté chat.api.
- [INSTRUCTIONS-SKILLS-CORRECTION-COPIES.md](./INSTRUCTIONS-SKILLS-CORRECTION-COPIES.md) — pipeline correction complet (6 skills).
- `docs/guides/skills-orchestration-cadrage.md` — décision « front orchestre » (v2).
- `docs/rfc/RFC-099-WORKFLOW-CORRECTIONS-COPIES.md` — workflow produit.
