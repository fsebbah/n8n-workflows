# Traduction Torah en lot via l'API Message Batches de Claude

**Date** : 2026-07-22
**Contexte** : azy.daily#150 / #406 — équipe n8n
**Statut** : design validé, prêt pour plan d'implémentation

## Problème

La traduction d'un chapitre à commentaires nombreux (ex. 457 commentaires) passe
aujourd'hui par `Torah_Router` : une **exécution n8n unique** qui boucle
séquentiellement (`Loop Segments`, ~9,6 s/item → ~73 min pour 457) en PATCHant la
progression d'un job torah.api.

Trois modes d'échec observés :

1. **Watchdog « pas de progression depuis 60s »** (torah.api / plugin) : un item lent —
   Genesis 1, chunké en sous-appels séquentiels — dépasse 60 s sans émettre de
   progression → le job entier est marqué en erreur alors que n8n mouline encore. Échec
   réel constaté (`job_mrvxtkrk6wkj99`, `Genesis 1 - Segment 1`, durée 08:58).
2. **Fenêtre d'exposition de ~73 min** : un restart n8n en cours de boucle tue le lot
   sans reprise.
3. **Aucune notification de fin** : si le canal de poll tombe, personne n'apprend la fin.

## Objectif

Pour les **gros lots (> 50 traductions)**, déporter le travail vers l'**API Message
Batches de Claude** (asynchrone, −50 % de coût, jusqu'à 100 000 requêtes / batch,
résultats sous ~1 h à 24 h max). n8n ne fait plus que **soumettre + poller**, et
**notifie par DM Discord** en fin de lot — exactement le pattern du chantier « génération
de documents avec Claude », dont l'infra est réutilisée.

Hors objectif : la voie synchrone (N ≤ 50) reste inchangée.

## Décisions validées

| Décision | Choix | Raison |
|---|---|---|
| Seuil de bascule | **N > 50** → batch ; N ≤ 50 → sync actuel | énoncé PO ; le sync tient pour les petits lots |
| Modèle / `max_tokens` | **du payload, verbatim** (`body.model`) — n8n ne change rien | philosophie relais/BYOT du parc |
| Soumission | **un seul batch = tout le chapitre** (N requêtes) | un batch de N est l'usage même de l'API ; 457 batches d'un item = anti-pattern |
| Poller | **générique existant `Claude_-_Batch_Poller`, réutilisé** | un poller ne doit rien savoir du domaine ; réutilisable |
| Extension poller | **`Process Results` rendu multi-résultats** derrière `metadata.multi` | l'actuel ne garde qu'UN résultat par batch (`find(correlation_id)`) ; extension générique, rétro-compatible (docs inchangés) |
| Livraison résultats | **webhook `callback_url`** enregistré avec le batch (pattern docs) | mécanisme éprouvé ; torah expose un webhook, comme `TORAH---Document-Callback` |
| Handler torah | **`Torah_Batch_Callback`** (nouveau webhook) → save + DM | logique métier isolée du poller |
| Re-mappage | `custom_id = commentary_id` | résultats batch **dans le désordre** → clé obligatoire ; une ligne par commentaire |
| Chunking | **supprimé** dans la voie batch | garde-fou de la voie sync ; le modèle encaisse un commentaire entier (~14 000 char ≈ 5 000 tokens) en une requête |

## Modèle de soumission

**Tout le lot part en UNE soumission** — pas de compte-gouttes. Un unique
`POST /v1/messages/batches` porte les N requêtes (une par commentaire) ; Claude les traite
**en parallèle**, n8n ne poll qu'**un seul `batch_id`**. 457 commentaires ≈ 6,4 Mo (pire
cas), très en-dessous des limites 100 000 requêtes / 256 Mo. Multi-batch seulement au-delà.

## Détection de fin

**Anthropic ne notifie pas.** La fin se détecte par **polling** : le poller appelle
`GET /v1/messages/batches/{id}` et lit `processing_status` ; `ended` = fini. Redis
(`{REDIS_XADD_SERVICE_URL}/batches/pending`) n'est pas le signal de fin — c'est la **liste
des batches à surveiller**, écrite par le dispatcher à la soumission.

## Architecture

```
┌─ Dispatcher (N > 50) ─────────────────────────────────────────────┐
│ 1. construit N requêtes {custom_id: commentary_id,               │
│      params:{ model: body.model, max_tokens, messages }}          │  ← modèle du payload
│ 2. POST /v1/messages/batches            (Anthropic, clé BYOT)      │  ← un seul batch
│ 3. crée le job torah.api (total=N)                                │
│ 4. POST {REDIS_XADD_SERVICE_URL}/batches/pending {                │
│      batch_id, api_key,                                            │
│      callback_url: {N8N_WEBHOOK_URL}/torah-translation-callback,   │  ← webhook torah
│      metadata: { multi: true, redis_channel, job_id,              │  ← flag multi-résultats
│                  target_lang, commentary_map } }                  │
│ 5. répond 200 + job_id  (aucune boucle)                           │
└───────────────────────────────────────────────────────────────────┘
                              │ (Claude traite en parallèle, ~1 h)
                              ▼
┌─ Claude_-_Batch_Poller  (GÉNÉRIQUE, 1 node étendu) ───────────────────┐
│ cron 30–60 s → GET /batches/pending → GET /messages/batches/{id}     │
│ si processing_status == "ended" :                                    │
│   GET results_url (JSONL)                                            │
│   Process Results :                                                  │
│     si metadata.multi → renvoie results:[{custom_id, ok, text|error}]│  ← EXTENSION
│     sinon             → comportement actuel (un résultat)            │  ← rétro-compat
│   livraison au callback_url  (chemin publish/callback existant)      │
│   DELETE /batches/pending/{id}                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │ POST /torah-translation-callback
                              ▼
┌─ Torah_Batch_Callback  (NOUVEAU webhook, calqué TORAH---Document-Callback) ─┐
│ pour chaque résultat, PAR custom_id :                                 │
│   ok     → POST {TORAH_API_URL}/api/translations/save                 │
│            { segment_id, commentary_id, translated_text, … }          │
│   errored/expired → item marqué en échec (non silencieux)            │
│ PATCH job torah.api (X ok / Y erreurs) → completed                    │
│ DM Discord : « ✅ Traduction terminée (X ok / Y erreurs) »           │
└───────────────────────────────────────────────────────────────────────┘
```

## Ce que ça règle

| Mode d'échec actuel | Réglé par |
|---|---|
| Watchdog 60s | n8n ne boucle plus ; Claude traite. Progression décorrélée d'une exécution unique. |
| Genesis 1 étouffe le lot | une requête parmi d'autres ; échec isolé à son `custom_id` |
| Fenêtre de 73 min | le batch vit chez Claude ; reprise = re-poll par `batch_id`. Restart n8n sans perte. |
| Aucune notif de fin | DM Discord terminal (callback torah) |
| Coût | **−50 %** (tarif batch) |

## Composants à créer / modifier

1. **Dispatcher** (`Torah_Router` ou nouveau `Torah_Batch_Dispatcher`) — branche N > 50 :
   construit les N requêtes (modèle = `body.model`), soumet **un** batch, crée le job,
   enregistre au registre pending avec `callback_url` + `metadata.multi/redis_channel/
   job_id/commentary_map`, répond. Voie sync (N ≤ 50) inchangée.
2. **`Claude_-_Batch_Poller`** (générique, extension minimale) — `Process Results` :
   `if (metadata.multi)` renvoyer **tous** les résultats par `custom_id` ; sinon
   comportement actuel. Aucune logique métier. Reste du poller inchangé.
3. **`Torah_Batch_Callback`** (nouveau webhook `/torah-translation-callback`, squelette de
   `TORAH---Document-Callback`) : parse par `custom_id` → `torah-save` par item → mise à
   jour du job → **DM Discord** de fin.
4. **Prompt batch** : réplique le prompt de `Torah_Translate_Worker` (`Claude Direct`),
   pivot fusionné en un prompt pour les paires concernées.

## Contrats de référence (vérifiés)

- **Batch API** : `POST /v1/messages/batches` `requests:[{custom_id, params:{model,
  max_tokens, messages}}]` ; `GET /v1/messages/batches/{id}` → `processing_status`
  (`in_progress`|`ended`) + `request_counts` ; résultats via `results_url` (JSONL),
  `{custom_id, result:{type: succeeded|errored|expired|canceled, message?}}` — **ordre
  non garanti, clé = custom_id**. Clé BYOT (`x-api-key`).
- **`Process Results` (actuel)** : `find(r => r.custom_id === batchInfo.correlation_id)`
  → **un seul** résultat. Sortie : `{success, batch_id, correlation_id, callback_url,
  redis_id, api_key, content:[{type,text}], files, provider, model, usage, metadata,
  _trace}`. `Publish to Redis` → stream `metadata.redis_channel || 'llm:results:stream'`.
- **Registre pending** : `GET/POST {REDIS_XADD_SERVICE_URL}/batches/pending`,
  `DELETE …/pending/{id}`, `POST …/batches/completed`.
- **Callback docs (à calquer)** : `TORAH---Document-Callback` — webhook
  `/torah-document-callback` → Validate → Update Job Status (`{TORAH_API_URL}/api/
  document-jobs/{…}`) → Send Discord Notification (`discord.com/api/v10/channels/{id}`).
- **Save Worker** : `POST {TORAH_API_URL}/api/translations/save {segment_id,
  commentary_id, translated_text, …}` — UPSERT keyé, une ligne par commentaire (idempotent).
- **Trad actuelle (prompt à répliquer, sans imposer le modèle)** : prompt talmudique de
  `Torah_Translate_Worker`, modes Direct et Pivot (source→anglais→cible).

## Notes / points à confirmer à l'implémentation

- **Troncature** : en batch on envoie le commentaire entier ; si le payload porte un
  `max_tokens` bas, un long commentaire tronque. n8n relaie sans arbitrer — à signaler au
  caller (chat.api/plugin) pour dimensionner `max_tokens`.
- **Câblage multi-résultats** : `Process Results` (mode multi) doit faire transiter le
  tableau `results[]` complet jusqu'au callback via le chemin publish existant (ajouter un
  champ `results` aux fields publiés). Détail de plomberie → tâche du plan.
- Forme exacte du `POST /batches/pending` (champs `callback_url`, `metadata`, `api_key`).
- `segment_id` requis par `torah-save` : propagé via `metadata.commentary_map`, ou
  re-résolu depuis `commentary_id`.
- DM Discord : API directe `discord.com/api/v10/channels/{id}` (comme les callbacks docs).
- Garde-fou anti-double-enqueue : flag Redis `torah:job:{id}:batch` posé par le dispatcher.
- Modes `errored` déjà réutilisés par le pivot fusionné (un prompt au lieu de deux batches).

## Hors périmètre

- Voie synchrone (N ≤ 50) — inchangée ; conserve le chunking #406.
- Reprise fine intra-batch — l'API batch est reprenable par `batch_id`.
